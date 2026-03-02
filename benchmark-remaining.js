#!/usr/bin/env node
/**
 * Benchmark COMPLET - Modèles restants
 * Test: Analyse de routes API Express
 */
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = util.promisify(exec);

// Modèles à tester
const MODELS_TO_TEST = [
  { name: 'qwen3.5:27b', provider: 'Qwen', size: '17GB', category: 'Code' },
  { name: 'phi4-reasoning:14b', provider: 'Microsoft', size: '11GB', category: 'Reasoning' },
  { name: 'deepseek-v2:16b', provider: 'DeepSeek', size: '16GB', category: 'Code' },
  { name: 'lfm2:24b', provider: 'Mistral', size: '24GB', category: 'Général' },
  { name: 'glm-4.7-flash:latest', provider: 'Zhipu', size: '~5GB', category: 'Flash' },
];

// Test identique aux autres agents (analyse routes API Express)
const TEST_PROMPT = `Analyze this Express.js route and respond with ONLY valid JSON:
router.post('/api/electors/:id/notes', async (req, res) => {
  = req.params;
  const { note, priority } = const { id } req.body;
  const userId = req.user.id;
  
  const result = await db.query(
    'INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)',
    [id, note, priority, userId]
  );
  
  res.status(201).json({ id: result.insertId, elector_id: id, note, priority });
});

Respond ONLY with JSON in this exact format: {"summary": "one line description", "database_table": "table_name", "http_status": "status_code"}`;

const VALIDATION = (response) => {
  let score = 0, notes = [];
  try {
    const json = response.match(/\{[\s\S]*\}/);
    if (!json) return { score: 0, note: 'Pas de JSON trouvé' };
    const parsed = JSON.parse(json[0]);
    
    if (parsed.summary && parsed.summary.length > 10) {
      score += 40;
      notes.push('Summary présent');
    }
    if (parsed.database_table && parsed.database_table.toLowerCase().includes('note')) {
      score += 30;
      notes.push('Table identifiée');
    }
    if (parsed.http_status && parsed.http_status.includes('201')) {
      score += 30;
      notes.push('Status correct');
    }
    
    return { score, note: notes.join(', ') || 'Partiel', fullResponse: response };
  } catch (e) {
    return { score: 0, note: 'JSON invalide: ' + e.message, fullResponse: response };
  }
};

async function pullModel(model) {
  console.log(`\n📥 Installation de ${model.name}...`);
  const start = Date.now();
  try {
    await execAsync(`ollama pull ${model.name}`, { timeout: 1800000 });
    const duration = (Date.now() - start) / 1000;
    console.log(` ✅ Installé en ${duration.toFixed(0)}s`);
    return duration;
  } catch (e) {
    console.log(` ❌ Échec: ${e.message}`);
    return null;
  }
}

async function queryModel(model, prompt, runCount = 10) {
  const scores = [];
  const responses = [];
  
  for (let i = 0; i < runCount; i++) {
    const tempFile = `/tmp/benchmark-${Date.now()}-${i}.json`;
    try {
      const data = JSON.stringify({ model: model.name, prompt, stream: false });
      await fs.writeFile(tempFile, data);
      
      const { stdout } = await execAsync(
        `curl -s http://localhost:11434/api/generate -X POST -H "Content-Type: application/json" -d @${tempFile}`,
        { timeout: 300000 }
      );
      
      try { await fs.unlink(tempFile); } catch {}
      
      const result = JSON.parse(stdout);
      const response = result.response || '';
      responses.push(response);
      
      const validation = VALIDATION(response);
      scores.push(validation.score);
      
      console.log(`     Run ${i+1}/${runCount}: ${validation.score}% - ${validation.note}`);
    } catch (e) {
      console.log(`     Run ${i+1}/${runCount}: ERREUR - ${e.message}`);
      scores.push(0);
      responses.push('');
    }
  }
  
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const perfectRuns = scores.filter(s => s === 100).length;
  
  return { avgScore: avgScore.toFixed(1), perfectRuns, scores, responses };
}

async function runBenchmark() {
  const results = [];
  
  for (const model of MODELS_TO_TEST) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 TEST: ${model.name} (${model.provider})`);
    console.log(`${'='.repeat(60)}`);
    
    // Check if already installed
    try {
      await execAsync(`ollama list`);
    } catch {
      // Not installed, pull it
      const installTime = await pullModel(model);
      if (!installTime) continue;
    }
    
    // Run benchmark
    const { avgScore, perfectRuns, scores } = await queryModel(model, TEST_PROMPT, 10);
    
    results.push({
      model: model.name,
      provider: model.provider,
      size: model.size,
      category: model.category,
      avgScore,
      perfectRuns,
      scores
    });
    
    console.log(`\n  📊 RÉSULTAT: ${avgScore}% (${perfectRuns}/10 parfaits)`);
  }
  
  return results;
}

function generateReport(results) {
  const timestamp = new Date().toISOString();
  
  let report = `# Benchmark LLM - Modèles Restants\n\n`;
  report += `Date: ${timestamp}\n`;
  report += `Test: Analyse de routes API Express (10 runs)\n\n`;
  
  // Comparaison avec références
  report += `## 📊 Résultats\n\n`;
  report += `| Modèle | Score | Parfaits | Taille |\n`;
  report += `|--------|-------|----------|--------|\n`;
  
  const allResults = [
    ...results,
    { model: 'phi3:mini (référence)', avgScore: '100', perfectRuns: 10, size: '2.2GB' },
    { model: 'qwen2.5-coder:14b (référence)', avgScore: '100', perfectRuns: 10, size: '9GB' }
  ];
  
  for (const r of allResults) {
    report += `| ${r.model} | **${r.avgScore}%** | ${r.perfectRuns || '-'}/10 | ${r.size} |\n`;
  }
  
  report += `\n## 🏆 Classement\n\n`;
  const sorted = [...results].sort((a, b) => parseFloat(b.avgScore) - parseFloat(a.avgScore));
  sorted.forEach((r, i) => {
    report += `${i+1}. **${r.model}** - ${r.avgScore}% (${r.perfectRuns}/10)\n`;
  });
  
  return report;
}

(async () => {
  console.log('🚀 Benchmark - Modèles restants');
  console.log(`📦 Modèles: ${MODELS_TO_TEST.map(m => m.name).join(', ')}`);
  
  const results = await runBenchmark();
  const report = generateReport(results);
  
  const outputDir = path.join(__dirname, 'benchmark-results');
  await fs.mkdir(outputDir, { recursive: true });
  
  const reportPath = path.join(outputDir, 'RESULTS-REMAINING.md');
  await fs.writeFile(reportPath, report);
  
  console.log(`\n📝 Rapport: ${reportPath}`);
  console.log('\n' + report);
})();
