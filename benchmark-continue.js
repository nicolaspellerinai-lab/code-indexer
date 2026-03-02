#!/usr/bin/env node
/**
 * Benchmark continuation - Test des modèles restants
 */
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = util.promisify(exec);

// Modèles à tester
const MODELS_TO_TEST = [
  { name: 'codellama:13b', provider: 'Meta', size: '7.4GB', category: 'Code' },
  { name: 'phi4:14b', provider: 'Microsoft', size: '9.1GB', category: 'Général' },
  { name: 'command-r7b:7b', provider: 'Cohere', size: '4.5GB', category: 'Général' },
  { name: 'deepseek-coder-v2:16b', provider: 'DeepSeek', size: '8.8GB', category: 'Code' },
];

// Modèles à garder
const KEEP_MODELS = ['mistral:7b', 'qwen2.5-coder:14b'];

// Tests
const TESTS = [
  {
    id: 'json_following',
    name: 'Respect format JSON',
    weight: 25,
    prompt: `Analyze: router.post('/login', async (req, res) => { const { email, password } = req.body; const user = await User.findOne({ email }); if (!user) return res.status(401).json({ error: 'Invalid' }); const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET); res.json({ token, user: { id: user._id, email: user.email } }); }); Respond ONLY with JSON: {"summary": "brief description"}`,
    validate: (response) => {
      try {
        const json = response.match(/\{[\s\S]*\}/);
        if (!json) return { score: 0, note: 'Pas de JSON trouvé' };
        const parsed = JSON.parse(json[0]);
        return parsed.summary ? { score: 100, note: 'JSON valide avec summary' } : { score: 50, note: 'JSON valide mais summary manquant' };
      } catch { return { score: 0, note: 'JSON invalide' }; }
    }
  },
  {
    id: 'code_analysis',
    name: 'Analyse de code',
    weight: 25,
    prompt: `Analyze this Express.js endpoint. Respond ONLY with JSON: router.post('/api/electors/:id/notes', async (req, res) => { const { id } = req.params; const { note, priority } = req.body; const userId = req.user.id; const result = await db.query( 'INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)', [id, note, priority, userId] ); res.status(201).json({ id: result.insertId, elector_id: id, note, priority }); }); JSON format: {"summary": "what it does", "database_table": "table_name", "http_status": "status_code"}`,
    validate: (response) => {
      let score = 0, notes = [];
      try {
        const json = response.match(/\{[\s\S]*\}/);
        if (!json) return { score: 0, note: 'Pas de JSON' };
        const parsed = JSON.parse(json[0]);
        if (parsed.summary?.length > 20) { score += 33; notes.push('Summary présent'); }
        if (parsed.database_table?.toLowerCase().includes('note')) { score += 33; notes.push('Table DB identifiée'); }
        if (parsed.http_status?.includes('201')) { score += 34; notes.push('Status HTTP correct'); }
        return { score, note: notes.join(', ') || 'Analyse partielle' };
      } catch { return { score: 0, note: 'JSON invalide' }; }
    }
  },
  {
    id: 'instruction_following',
    name: 'Suivi des instructions',
    weight: 25,
    prompt: `You are a code analyzer. Follow these rules EXACTLY: 1. Use EXACTLY 10 words for the summary 2. Start with "Endpoint:" 3. End with "[END]" Code: router.get('/api/stats', (req, res) => res.json({count: 100}));`,
    validate: (response) => {
      let score = 0, notes = [];
      if (response.includes('Endpoint:')) { score += 40; notes.push('Format respecté'); }
      if (response.includes('[END]')) { score += 40; notes.push('Marqueur [END] présent'); }
      const words = response.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 8 && words.length <= 15) { score += 20; notes.push('Longueur correcte'); }
      return { score, note: notes.join(', ') || 'Instructions partiellement suivies' };
    }
  },
  {
    id: 'code_completion',
    name: 'Complétion code',
    weight: 25,
    prompt: `Complete this Express.js route with proper error handling and validation: router.post('/api/users', async (req, res) => { // TODO: validate email, check if exists, hash password, save to DB }); Provide ONLY the implementation code, no explanation.`,
    validate: (response) => {
      let score = 0, notes = [];
      const code = response.toLowerCase();
      if (code.includes('try') || code.includes('catch')) { score += 25; notes.push('Error handling'); }
      if (code.includes('validate') || code.includes('joi') || code.includes('schema')) { score += 25; notes.push('Validation'); }
      if (code.includes('hash') || code.includes('bcrypt')) { score += 25; notes.push('Hashing'); }
      if (code.includes('findone') || code.includes('exists')) { score += 25; notes.push('Vérification existence'); }
      return { score, note: notes.join(', ') || 'Code incomplet' };
    }
  }
];

async function pullModel(model) {
  console.log(`\n📥 Installation de ${model.name} (${model.size})...`);
  const start = Date.now();
  try {
    await execAsync(`ollama pull ${model.name}`, { timeout: 900000 });
    const duration = (Date.now() - start) / 1000;
    console.log(` ✅ Installé en ${duration.toFixed(0)}s`);
    return duration;
  } catch (e) {
    console.log(` ❌ Échec: ${e.message}`);
    return null;
  }
}

async function removeModel(model) {
  console.log(`\n🗑️  Suppression de ${model.name}...`);
  try {
    await execAsync(`ollama rm ${model.name}`, { timeout: 60000 });
    console.log(` ✅ Supprimé`);
    return true;
  } catch (e) {
    console.log(` ❌ Échec suppression: ${e.message}`);
    return false;
  }
}

async function queryModel(model, prompt) {
  try {
    const start = Date.now();
    const { stdout } = await execAsync(
      `curl -s http://localhost:11434/api/generate -X POST -H "Content-Type: application/json" -d '${JSON.stringify({ model: model.name, prompt, stream: false })}'`,
      { timeout: 120000 }
    );
    const latency = Date.now() - start;
    const data = JSON.parse(stdout);
    return { response: data.response || '', latency, tokens: data.eval_count || 0 };
  } catch (e) {
    return { response: '', latency: 0, tokens: 0, error: e.message };
  }
}

async function runBenchmark() {
  const results = [];

  for (const model of MODELS_TO_TEST) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 TEST: ${model.name} (${model.provider})`);
    console.log(`${'='.repeat(60)}`);

    // Install
    const installTime = await pullModel(model);
    if (!installTime) continue;

    // Run tests
    const testResults = [];
    let totalScore = 0;

    for (const test of TESTS) {
      console.log(`\n  📋 Test: ${test.name}`);
      const { response, latency } = await queryModel(model, test.prompt);
      const validation = test.validate(response);
      const weightedScore = validation.score * (test.weight / 100);
      totalScore += weightedScore;

      testResults.push({
        test: test.id,
        score: validation.score,
        weightedScore: weightedScore.toFixed(1),
        note: validation.note,
        latency: `${latency}ms`,
        response: response.substring(0, 200)
      });

      console.log(`     Score: ${validation.score}% (pondéré: ${weightedScore.toFixed(1)}%)`);
      console.log(`     Note: ${validation.note}`);
      console.log(`     Latence: ${latency}ms`);
    }

    results.push({
      model: model.name,
      provider: model.provider,
      category: model.category,
      size: model.size,
      installTime: `${installTime.toFixed(0)}s`,
      totalScore: totalScore.toFixed(1),
      testResults
    });

    console.log(`\n  📊 SCORE TOTAL: ${totalScore.toFixed(1)}%`);

    // Remove model
    await removeModel(model);
  }

  return results;
}

async function saveResults(results) {
  const outputDir = path.join(__dirname, 'benchmark-results