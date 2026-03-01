#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function testPipeline() {
  console.log('=== TEST DES CORRECTIONS ===\n');
  console.log('🚀 Lancement du pipeline avec corrections...\n');
  
  try {
    // Exécuter le pipeline
    const { stdout } = await execAsync(`cd /Users/apple/.openclaw/workspace/travaux/code-indexer && node -e "
const IndexingPipeline = require('./src/pipeline.js');
const p = new IndexingPipeline('./test-projects/express-campaign');
(async () => {
  await p.run();
  console.log('\\n✅ Pipeline terminé !');
})();
"`);
    console.log(stdout);
  } catch (e) {
    console.log('⚠️ Erreur lancement pipeline:', e.message);
  }
  
  // Vérifier les fichiers générés
  console.log('\n📊 ANALYSE DES RÉSULTATS ===\n');
  
  // Vérifier le fichier relationships.json
  const fs = require('fs').promises;
  try {
    const rel = JSON.parse(await fs.readFile('data/relationships.json', 'utf-0027'));
    console.log('📋 Fichier relationships.json:');
    console.log(`Total routes: ${rel.length}`);
    
    let hasLlm = 0;
    rel.forEach((r, i) => {
      const hasEnrichment = r.llmEnrichment?.summary ? '✅' : '❌';
      if (r.llmEnrichment?.summary) hasLlm++;
      console.log(`${i+1}. ${r.endpoint || 'N/A'} ${hasEnrichment}`);
    });
    
    console.log(`\n📊 LLM enrichment: ${hasLlm}/${rel.length} routes enrichies`);
    
  } catch (e) {
    console.log('⚠️ Erreur lecture relationships.json:', e.message);
  }
  
  // Vérifier le fichier OpenAPI
  try {
    const openapi = JSON.parse(await fs.readFile('data/generated-openapi.json', 'utf-0027'));
    const paths = Object.keys(openapi.paths);
    console.log(`\n📄 OpenAPI: ${paths.length} paths`);
    paths.forEach((p, i) => console.log(`${i+1}. ${p}`));
  } catch (e) {
    console.log('⚠️ Erreur lecture OpenAPI:', e.message);
  }
  
  console.log(`\n✅ Corrections appliquées !`);
}

testPipeline().catch(console.error);