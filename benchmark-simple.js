#!/usr/bin/env node
/**
 * Benchmark simple pour tester l'analyse de routes API
 */
const { exec, spawn } = require('child_process');
const fs = require('fs');

// Nettoyer les codes ANSI de la sortie
function cleanAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
}

const TEST_CODE = `router.post('/api/electors/:id/notes', async (req, res) => {
  const { id } = req.params;
  const { note, priority } = req.body;
  const userId = req.user.id;
  const result = await db.query(
    'INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)',
    [id, note, priority, userId]
  );
  res.status(201).json({ id: result.insertId, elector_id: id, note, priority });
});`;

const PROMPT = `Analyze this Express.js route endpoint. Respond ONLY with JSON in this exact format:
{"summary": "brief description", "database_table": "table_name", "http_status": "status_code"}

Code:
${TEST_CODE}`;

// Write prompt to temp file
fs.writeFileSync('/tmp/ollama-prompt.txt', PROMPT);

function runBenchmark(model) {
  return new Promise((resolve) => {
    console.log(`\n🧪 Benchmark: ${model}`);
    console.log('='.repeat(50));
    
    const startTime = Date.now();
    
    const child = spawn('ollama', ['run', model], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      const elapsed = Date.now() - startTime;
      const response = cleanAnsi(stdout + stderr);
      
      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log(`❌ Pas de JSON valide`);
        console.log(`   Response: ${response.substring(0, 300)}`);
        resolve({ model, score: 0, time: elapsed, error: 'No JSON found', raw: response.substring(0, 500) });
        return;
      }
      
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        let score = 0;
        const details = [];
        
        if (parsed.summary && parsed.summary.length > 10) {
          score += 40;
          details.push('summary✓');
        }
        if (parsed.database_table && parsed.database_table.toLowerCase().includes('note')) {
          score += 30;
          details.push('table✓');
        }
        if (parsed.http_status && parsed.http_status.includes('201')) {
          score += 30;
          details.push('status✓');
        }
        
        console.log(`✅ Score: ${score}/100 (${details.join(', ')})`);
        console.log(`   Temps: ${(elapsed/1000).toFixed(1)}s`);
        console.log(`   Response: ${JSON.stringify(parsed)}`);
        
        resolve({ model, score, time: elapsed, response: parsed });
      } catch (e) {
        console.log(`❌ JSON invalide: ${e.message}`);
        resolve({ model, score: 0, time: elapsed, error: 'Invalid JSON', raw: response.substring(0, 500) });
      }
    });
    
    child.on('error', (error) => {
      const elapsed = Date.now() - startTime;
      console.log(`❌ Erreur: ${error.message}`);
      resolve({ model, score: 0, time: elapsed, error: error.message });
    });
    
    // Write prompt to stdin
    child.stdin.write(PROMPT);
    child.stdin.end();
    
    // Timeout
    setTimeout(() => {
      child.kill();
      const elapsed = Date.now() - startTime;
      resolve({ model, score: 0, time: elapsed, error: 'Timeout' });
    }, 120000);
  });
}

async function main() {
  const models = process.argv.slice(2);
  
  if (models.length === 0) {
    console.log('Usage: node benchmark-simple.js <model1> <model2> ...');
    console.log('Exemple: node benchmark-simple.js phi3:mini qwen2.5-coder:14b');
    process.exit(1);
  }
  
  console.log('🚀 Benchmark LLM - Analyse de routes API');
  console.log('=========================================');
  
  const results = [];
  for (const model of models) {
    const result = await runBenchmark(model);
    results.push(result);
  }
  
  // Résumé
  console.log('\n' + '='.repeat(50));
  console.log('📊 RÉSUMÉ');
  console.log('='.repeat(50));
  
  results.sort((a, b) => b.score - a.score);
  results.forEach((r, i) => {
    const icon = r.score === 100 ? '🏆' : r.score > 0 ? '✅' : '❌';
    console.log(`${i+1}. ${icon} ${r.model}: ${r.score}/100 en ${(r.time/1000).toFixed(1)}s`);
    if (r.error) console.log(`   Erreur: ${r.error}`);
  });
  
  // Sauvegarder les résultats
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(
    `benchmark-results/benchmark-${timestamp}.json`,
    JSON.stringify(results, null, 2)
  );
  console.log(`\n💾 Résultats sauvegardés dans benchmark-results/benchmark-${timestamp}.json`);
}

main().catch(console.error);
