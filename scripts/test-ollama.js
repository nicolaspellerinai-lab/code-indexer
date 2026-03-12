const http = require('http');
const fs = require('fs');
const path = require('path');

// Load config
function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'llm-providers.json');
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('❌ Erreur chargement config:', e.message);
  }
  return { ollama: { host: 'localhost', port: 11434, models: [] } };
}

async function testOllama() {
  const config = loadConfig();
  const ollama = config.ollama || {};
  
  // Handle host with or without protocol
  let host = ollama.host || 'localhost';
  let port = ollama.port || 11434;
  
  // If host contains protocol, extract hostname and port
  if (host.includes('://')) {
    try {
      const url = new URL(host);
      host = url.hostname;
      port = url.port || 11434;
    } catch (e) {
      // Invalid URL, use as-is
    }
  }

  console.log(`🔌 Test connexion Ollama: ${host}:${port}\n`);

  // Test 1: Check /api/tags
  console.log('📡 Test 1: GET /api/tags');
  await new Promise((resolve) => {
    const req = http.request({
      hostname: host,
      port: port,
      path: '/api/tags',
      method: 'GET',
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('  ✅ Connexion réussie!\n');
          try {
            const parsed = JSON.parse(data);
            console.log('📦 Modèles disponibles:');
            if (parsed.models && Array.isArray(parsed.models)) {
              parsed.models.forEach(m => {
                console.log(`   - ${m.name} (${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB)`);
              });
            } else {
              console.log('   (Aucun modèle listé)');
            }
          } catch {
            console.log('   Réponse reçue mais impossible de parser JSON');
          }
        } else {
          console.log(`  ❌ Erreur: Status ${res.statusCode}`);
        }
        resolve();
      });
    });
    req.on('error', (e) => {
      console.log(`  ❌ Erreur connexion: ${e.message}`);
      resolve();
    });
    req.on('timeout', () => {
      console.log('  ❌ Timeout');
      req.destroy();
      resolve();
    });
    req.end();
  });

  // Test 2: Generate test
  if (ollama.models && ollama.models.length > 0) {
    const model = ollama.models[0];
    console.log(`\n📡 Test 2: Génération avec ${model}`);
    
    const prompt = 'Dis "Hello" en français.';
    const body = JSON.stringify({
      model: model,
      prompt: prompt,
      stream: false,
      options: { num_predict: 20 }
    });

    await new Promise((resolve) => {
      const req = http.request({
        hostname: host,
        port: port,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 60000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              console.log('  ✅ Génération réussie!');
              console.log(`  📝 Réponse: ${parsed.response?.substring(0, 100)}...`);
            } catch {
              console.log('  ❌ Erreur parsing réponse');
            }
          } else {
            console.log(`  ❌ Erreur: Status ${res.statusCode}`);
            console.log(`  📝 ${data.substring(0, 200)}`);
          }
          resolve();
        });
      });
      req.on('error', (e) => {
        console.log(`  ❌ Erreur: ${e.message}`);
        resolve();
      });
      req.on('timeout', () => {
        console.log('  ❌ Timeout');
        req.destroy();
        resolve();
      });
      req.write(body);
      req.end();
    });
  }

  console.log('\n✅ Tests terminés');
}

testOllama();
