/**
 * Benchmark Ollama - Compare les modèles Ollama sur les mêmes données
 * Utilise config/llm-providers.json pour la liste des modèles
 * Mesure précision et vitesse
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Charger la config Ollama
function loadOllamaConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'config', 'llm-providers.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    // Extraire les modèles depuis le tableau "ollama.models"
    if (config.ollama?.models && Array.isArray(config.ollama.models)) {
      return config.ollama.models.map(modelName => ({
        name: modelName,
        host: config.ollama.host || 'localhost',
        port: config.ollama.port || 11434
      }));
    }
    
    // Fallback: utiliser primary et fallback
    const models = [];
    if (config.primary?.provider === 'ollama') {
      models.push({
        name: config.primary.model,
        host: config.primary.host,
        port: config.primary.port
      });
    }
    
    if (config.fallback?.provider === 'ollama') {
      models.push({
        name: config.fallback.model,
        host: config.fallback.host,
        port: config.fallback.port
      });
    }
    
    return models.length > 0 ? models : getDefaultModels();
  } catch (e) {
    console.warn('⚠️ Config non trouvée, utilisation de la liste par défaut');
    return getDefaultModels();
  }
}

function getDefaultModels() {
  return [
    { name: 'qwen3:8b', host: 'localhost', port: 11434 },
    { name: 'qwen2.5-coder:14b', host: 'localhost', port: 11434 },
    { name: 'glm4:latest', host: 'localhost', port: 11434 },
    { name: 'lfm2:24b', host: 'localhost', port: 11434 },
    { name: 'deepseek-v2:16b', host: 'localhost', port: 11434 },
    { name: 'phi4-reasoning:14b', host: 'localhost', port: 11434 },
    { name: 'qwen3.5:27b', host: 'localhost', port: 11434 },
    { name: 'codellama:7b-instruct', host: 'localhost', port: 11434 },
    { name: 'phi3:mini', host: 'localhost', port: 11434 },
    { name: 'gpt-oss:20b', host: 'localhost', port: 11434 },
  ];
}

// Données de test communes
const TEST_DATA = {
  route: {
    code: `
const express = require('express');
const router = express.Router();

/**
 * @summary Get all users
 * @description Returns a list of all users
 * @tags User
 */
router.get('/api/users', auth, async (req, res) => {
  const users = await db.User.findAll({ limit: req.query.limit || 10 });
  return res.json(users);
});

router.post('/api/users', handler);
router.get('/api/users/:id', handler);
    `.trim()
  },
  expected: {
    routes: ['/api/users (GET)', '/api/users (POST)', '/api/users/:id (GET)'],
    hasDocs: true,
    hasMiddleware: true
  }
};

// Test prompt standard
const PROMPT_TEMPLATE = `Tu es un analyseur de code. Analyse ce code et提取 les informations suivantes:

1. Les routes API (méthode + chemin)
2. Les middlewares utilisés
3. La documentation existante (JSDoc/Swagger)

Code à analyser:
\`\`\`javascript
${TEST_DATA.route.code}
\`\`\`

Réponds en JSON:
{
  "routes": [{"method": "GET", "path": "/api/users", "hasDocs": true}],
  "middleware": ["auth"],
  "documentation": "..."
}`;

class OllamaBenchmark {
  constructor() {
    this.models = loadOllamaConfig();
    this.results = [];
  }

  /**
   * Fait un prompt vers Ollama
   */
  async prompt(model, prompt) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: model.name,
        prompt: prompt,
        stream: false
      });

      const options = {
        hostname: model.host,
        port: model.port,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          const duration = Date.now() - startTime;
          try {
            const response = JSON.parse(body);
            resolve({
              response: response.response || body,
              duration,
              success: true
            });
          } catch (e) {
            resolve({
              response: body,
              duration,
              success: false,
              error: e.message
            });
          }
        });
      });

      req.on('error', (e) => {
        const duration = Date.now() - startTime;
        reject({
          duration,
          error: e.message,
          success: false
        });
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Évalue la réponse du modèle
   */
  evaluateResponse(response) {
    let score = 0;
    const details = [];
    
    // Check 1: Détection des routes
    const hasGetRoute = response.toLowerCase().includes('get') && response.includes('/api/users');
    const hasPostRoute = response.toLowerCase().includes('post') && response.includes('/api/users');
    const hasUsersIdRoute = response.toLowerCase().includes('get') && response.includes(':id');
    
    if (hasGetRoute) {
      score += 0.25;
      details.push('✓ Détecte route GET /api/users');
    }
    if (hasPostRoute) {
      score += 0.25;
      details.push('✓ Détecte route POST /api/users');
    }
    if (hasUsersIdRoute) {
      score += 0.25;
      details.push('✓ Détecte route avec paramètre');
    }
    
    // Check 2: Détection middleware
    if (response.toLowerCase().includes('auth') || response.toLowerCase().includes('middleware')) {
      score += 0.15;
      details.push('✓ Détecte middleware');
    }
    
    // Check 3: Documentation
    if (response.toLowerCase().includes('summary') || response.toLowerCase().includes('description')) {
      score += 0.10;
      details.push('✓ Extrait documentation');
    }
    
    return { score, details };
  }

  /**
   * Teste un modèle
   */
  async testModel(model) {
    console.log(`\n🔬 Test: ${model.name}`);
    
    try {
      const result = await this.prompt(model, PROMPT_TEMPLATE);
      
      if (!result.success) {
        console.log(`  ❌ Erreur: ${result.error || 'Réponse invalide'}`);
        return {
          model: model.name,
          success: false,
          error: result.error || 'Réponse invalide',
          duration: result.duration,
          score: 0
        };
      }
      
      const evaluation = this.evaluateResponse(result.response);
      
      console.log(`  ⏱️  Temps: ${result.duration}ms`);
      console.log(`  📊 Score: ${(evaluation.score * 100).toFixed(0)}%`);
      
      return {
        model: model.name,
        success: true,
        duration: result.duration,
        score: evaluation.score,
        details: evaluation.details,
        response: result.response.substring(0, 500) // Premiers 500 chars
      };
      
    } catch (error) {
      console.log(`  ❌ Erreur: ${error.message}`);
      return {
        model: model.name,
        success: false,
        error: error.message,
        duration: error.duration || 0,
        score: 0
      };
    }
  }

  /**
   * Run tous les benchmarks
   */
  async run() {
    console.log('🚀 Ollama Model Benchmark');
    console.log('='.repeat(50));
    console.log(`📋 Modèles à tester: ${this.models.length}`);
    
    for (const model of this.models) {
      const result = await this.testModel(model);
      this.results.push(result);
    }
    
    this.generateReport();
    
    return this.results;
  }

  /**
   * Génère le rapport final
   */
  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 RÉSULTATS DU BENCHMARK');
    console.log('='.repeat(50));
    
    // Trier par score (précision)
    const byScore = [...this.results].sort((a, b) => b.score - a.score);
    
    // Trier par vitesse
    const bySpeed = [...this.results]
      .filter(r => r.success)
      .sort((a, b) => a.duration - b.duration);
    
    console.log('\n🏆 Classement par PRÉCISION:');
    byScore.forEach((r, i) => {
      const status = r.success ? '✅' : '❌';
      const score = r.success ? `${(r.score * 100).toFixed(0)}%` : 'N/A';
      console.log(`  ${i + 1}. ${status} ${r.model}: ${score}`);
    });
    
    console.log('\n⚡ Classement par VITESSE:');
    bySpeed.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.model}: ${r.duration}ms`);
    });
    
    // Score combiné (précision + vitesse)
    console.log('\n📈 Classement COMBINÉ (précision + vitesse):');
    const combined = [...this.results]
      .filter(r => r.success)
      .map(r => ({
        ...r,
        combinedScore: r.score * 0.7 + (1 - r.duration / 10000) * 0.3 // Normaliser vitesse
      }))
      .sort((a, b) => b.combinedScore - a.combinedScore);
    
    combined.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.model}: score combiné = ${(r.combinedScore * 100).toFixed(1)}%`);
    });
    
    // Sauvegarder les résultats
    this.saveResults();
  }

  /**
   * Sauvegarde les résultats
   */
  saveResults() {
    const resultsDir = path.join(__dirname, '..', 'benchmark-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    const filename = `ollama-benchmark-${Date.now()}.json`;
    const report = {
      timestamp: new Date().toISOString(),
      models: this.models.map(m => m.name),
      results: this.results,
      summary: {
        totalModels: this.results.length,
        successful: this.results.filter(r => r.success).length,
        averageScore: this.results.filter(r => r.success).reduce((a, b) => a + b.score, 0) / this.results.filter(r => r.success).length || 0,
        averageDuration: this.results.filter(r => r.success).reduce((a, b) => a + b.duration, 0) / this.results.filter(r => r.success).length || 0
      }
    };
    
    fs.writeFileSync(
      path.join(resultsDir, filename),
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n📁 Résultats sauvegardés: benchmark-results/${filename}`);
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  const benchmark = new OllamaBenchmark();
  benchmark.run()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Benchmark échoué:', err);
      process.exit(1);
    });
}

module.exports = OllamaBenchmark;
