#!/usr/bin/env node
/**
 * Benchmark LLM pour code-indexer
 * Teste différents modèles Ollama et génère un rapport
 */

const fs = require('fs').promises;
const path = require('path');
const http = require('http');

const BENCHMARK_DIR = './benchmark-results';

// Modèles à tester
const MODELS_TO_TEST = [
  { name: 'qwen3:8b', desc: 'Rapide, léger' },
  { name: 'qwen2.5-coder:14b', desc: 'Spécialisé code' },
  { name: 'gpt-oss:20b', desc: 'Grande taille' }
];

// Prompt de test
const TEST_PROMPT = `Analyze this Express.js endpoint:
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token, user: { id: user._id, email: user.email } });
});

Provide JSON: {"summary": "Brief description of what this endpoint does"}`;

class LLMBenchmark {
  constructor() {
    this.results = [];
  }

  async callOllama(model, prompt, maxTokens = 150) {
    return new Promise((resolve) => {
      const body = JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: maxTokens }
      });

      const options = {
        hostname: 'localhost',
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 120000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              success: true,
              response: parsed.response || '',
              totalDuration: parsed.total_duration || 0,
              loadDuration: parsed.load_duration || 0,
              promptEvalCount: parsed.prompt_eval_count || 0,
              promptEvalDuration: parsed.prompt_eval_duration || 0,
              evalCount: parsed.eval_count || 0,
              evalDuration: parsed.eval_duration || 0,
            });
          } catch {
            resolve({ success: false, error: 'Parse error' });
          }
        });
      });

      req.on('error', (e) => resolve({ success: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
      req.write(body);
      req.end();
    });
  }

  analyzeQuality(response) {
    // Extract JSON if present
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    let parsed = null;
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {}
    }

    const summary = parsed?.summary || response.substring(0, 100);
    
    // Quality metrics
    const hasValidJSON = parsed !== null;
    const hasDescriptiveSummary = summary.length > 20 && 
      !summary.includes('Endpoint post for') &&
      !summary.includes('POST /') &&
      summary.includes(' ');
    const mentionsAuth = summary.toLowerCase().includes('auth') || 
                        summary.toLowerCase().includes('login') ||
                        summary.toLowerCase().includes('token');
    
    return {
      hasValidJSON,
      hasDescriptiveSummary,
      mentionsAuth,
      summary: summary.substring(0, 80),
      rawResponse: response.substring(0, 200)
    };
  }

  async testModel(modelConfig) {
    console.log(`\n🧪 Testing: ${modelConfig.name}`);
    console.log(`   ${modelConfig.desc}`);
    
    const startTime = Date.now();
    const result = await this.callOllama(modelConfig.name, TEST_PROMPT);
    const totalTime = Date.now() - startTime;
    
    if (!result.success) {
      console.log(`   ❌ FAILED: ${result.error}`);
      return {
        model: modelConfig.name,
        desc: modelConfig.desc,
        success: false,
        error: result.error,
        totalTime
      };
    }

    const quality = this.analyzeQuality(result.response);
    
    console.log(`   ✅ Success`);
    console.log(`   ⏱️  Time: ${(totalTime/1000).toFixed(1)}s`);
    console.log(`   📝 Summary: ${quality.summary.substring(0, 60)}...`);
    console.log(`   📊 Valid JSON: ${quality.hasValidJSON ? '✅' : '❌'}`);
    console.log(`   📊 Descriptive: ${quality.hasDescriptiveSummary ? '✅' : '❌'}`);
    console.log(`   📊 Context-aware: ${quality.mentionsAuth ? '✅' : '❌'}`);

    return {
      model: modelConfig.name,
      desc: modelConfig.desc,
      success: true,
      totalTime,
      ollamaTime: (result.totalDuration / 1e9).toFixed(2),
      loadTime: (result.loadDuration / 1e9).toFixed(2),
      promptTokens: result.promptEvalCount,
      promptTime: (result.promptEvalDuration / 1e9).toFixed(2),
      outputTokens: result.evalCount,
      outputTime: (result.evalDuration / 1e9).toFixed(2),
      quality,
      ...quality
    };
  }

  async runBenchmark() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     BENCHMARK LLM - Code Indexer                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n📅 Date: ${new Date().toISOString()}`);
    console.log(`🖥️  Machine: ${require('os').hostname()}`);
    console.log(`💾 RAM: ${(require('os').totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
    console.log(`⚙️  CPUs: ${require('os').cpus().length}`);

    // Test each model
    for (const model of MODELS_TO_TEST) {
      const result = await this.testModel(model);
      this.results.push(result);
      
      // Small delay between tests
      await new Promise(r => setTimeout(r, 2000));
    }

    // Generate report
    await this.generateReport();
  }

  async generateReport() {
    console.log('\n\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              RAPPORT DE BENCHMARK                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Summary table
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ Modèle              │ Temps │ JSON │ Descriptif │ Contexte │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    
    const successful = this.results.filter(r => r.success);
    
    for (const r of this.results) {
      if (!r.success) {
        console.log(`│ ${r.model.padEnd(19)} │ ERROR │  ❌  │     ❌     │    ❌    │ ${r.error}`);
        continue;
      }
      
      const time = (r.totalTime / 1000).toFixed(1) + 's';
      const json = r.hasValidJSON ? '✅' : '❌';
      const desc = r.hasDescriptiveSummary ? '✅' : '❌';
      const ctx = r.mentionsAuth ? '✅' : '❌';
      
      console.log(`│ ${r.model.padEnd(19)} │ ${time.padEnd(5)} │  ${json}  │     ${desc}      │    ${ctx}    │`);
    }
    
    console.log('└─────────────────────────────────────────────────────────────────┘');

    // Scores
    console.log('\n📊 SCORES:');
    for (const r of successful) {
      let score = 0;
      if (r.hasValidJSON) score += 30;
      if (r.hasDescriptiveSummary) score += 40;
      if (r.mentionsAuth) score += 30;
      
      let rating = score >= 90 ? '🟢 EXCELLENT' : 
                   score >= 70 ? '🟡 BON' : 
                   score >= 50 ? '🟠 MOYEN' : '🔴 FAIBLE';
      
      console.log(`  ${r.model}: ${score}/100 ${rating}`);
    }

    // Recommendations
    console.log('\n💡 RECOMMANDATIONS:');
    const best = successful.reduce((prev, curr) => {
      const prevScore = (prev.hasValidJSON ? 30 : 0) + (prev.hasDescriptiveSummary ? 40 : 0) + (prev.mentionsAuth ? 30 : 0);
      const currScore = (curr.hasValidJSON ? 30 : 0) + (curr.hasDescriptiveSummary ? 40 : 0) + (curr.mentionsAuth ? 30 : 0);
      return currScore > prevScore ? curr : prev;
    }, successful[0]);
    
    if (best) {
      console.log(`  🏆 Meilleur modèle: ${best.model}`);
      console.log(`     Score: ${[best.hasValidJSON, best.hasDescriptiveSummary, best.mentionsAuth].filter(Boolean).length}/3 critères`);
      console.log(`     Temps: ${(best.totalTime/1000).toFixed(1)}s`);
    }

    // Save results
    const reportPath = path.join(BENCHMARK_DIR, `benchmark-${Date.now()}.json`);
    await fs.mkdir(BENCHMARK_DIR, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      date: new Date().toISOString(),
      system: {
        hostname: require('os').hostname(),
        ram: (require('os').totalmem() / 1024 / 1024 / 1024).toFixed(1) + ' GB',
        cpus: require('os').cpus().length
      },
      results: this.results
    }, null, 2));
    
    console.log(`\n💾 Rapport sauvegardé: ${reportPath}`);
  }
}

// Run benchmark
const benchmark = new LLMBenchmark();
benchmark.runBenchmark().catch(console.error);