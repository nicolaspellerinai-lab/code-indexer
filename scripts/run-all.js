#!/usr/bin/env node

/**
 * run-all.js - Script unifié pour exécuter tout le pipeline de génération de documentation
 * 
 * Ce script exécute automatiquement toutes les étapes :
 * 1. Indexation du projet (parsing des routes + enrichissement LLM)
 * 2. Comparaison de la documentation
 * 3. Génération des patches
 * 
 * Usage:
 *   node scripts/run-all.js <project-path> [options]
 * 
 * Options:
 *   --host <url>      Hôte Ollama
 *   --port <port>    Port Ollama (défaut: 11434)
 *   --model <name>   Modèle Ollama
 *   --skip-llm       Ignorer l'enrichissement LLM
 *   --steps <steps>   Étapes à exécuter (1,2,3 ou all - défaut: all)
 * 
 * Exemples:
 *   node scripts/run-all.js ../my-project
 *   node scripts/run-all.js ../my-project --skip-llm
 *   node scripts/run-all.js ../my-project --steps 1,2
 */

const { IndexingPipeline } = require('../src/pipeline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  host: null,
  port: null,
  model: null,
  resume: true,
  skipLlm: false,
  steps: 'all'
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host' && args[i + 1]) {
    options.host = args[i + 1];
    i++;
  } else if (args[i] === '--port' && args[i + 1]) {
    options.port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--model' && args[i + 1]) {
    options.model = args[i + 1];
    i++;
  } else if (args[i] === '--no-resume') {
    options.resume = false;
  } else if (args[i] === '--skip-llm') {
    options.skipLlm = true;
  } else if (args[i] === '--steps' && args[i + 1]) {
    options.steps = args[i + 1];
    i++;
  }
}

// First argument is the project path
const projectPath = args[0] && !args[0].startsWith('--') ? args[0] : '.';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║         PIPELINE DE GÉNÉRATION DE DOCUMENTATION              ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`📁 Projet: ${path.resolve(projectPath)}`);
console.log(`⚙️  Options:`);
console.log(`   - Résume: ${options.resume}`);
console.log(`   - Skip LLM: ${options.skipLlm}`);
console.log(`   - Étapes: ${options.steps}\n`);

const dataDir = path.join(__dirname, '..', 'data');

// Helper function to run a script
function runScript(scriptPath, args = []) {
  console.log(`\n▶️  Exécution: node ${scriptPath} ${args.join(' ')}\n`);
  try {
    execSync(`node ${scriptPath} ${args.join(' ')}`, { 
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    return true;
  } catch (e) {
    console.error(`❌ Erreur lors de l'exécution de ${scriptPath}`);
    return false;
  }
}

// Parse steps to execute
const steps = options.steps === 'all' 
  ? [1, 2, 3] 
  : options.steps.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

async function runPipeline() {
  let success = true;

  try {
    // Step 1: Index project (parse + enrich)
    if (steps.includes(1)) {
      console.log('\n' + '='.repeat(70));
      console.log('📋 ÉTAPE 1: Indexation du projet');
      console.log('='.repeat(70) + '\n');
      
      const pipelineOptions = {
        host: options.host,
        port: options.port,
        model: options.model,
        resume: options.resume
      };
      
      // Check if we should skip LLM
      if (options.skipLlm) {
        pipelineOptions.mockMode = true;
      }
      
      const pipeline = new IndexingPipeline(projectPath, pipelineOptions);
      await pipeline.run({ resume: options.resume });
      
      console.log('\n✅ Étape 1 terminée\n');
    }

    // Step 2: Compare docs
    if (steps.includes(2)) {
      console.log('\n' + '='.repeat(70));
      console.log('📋 ÉTAPE 2: Comparaison de documentation');
      console.log('='.repeat(70) + '\n');
      
      const compareArgs = [
        '--openapi', path.join(dataDir, 'generated-openapi.json'),
        '--routes', path.join(dataDir, 'routes.json'),
        '--output', path.join(dataDir, 'comparison-report.json'),
        '--markdown', path.join(dataDir, 'comparison-report.md')
      ];
      
      if (!runScript('scripts/compare-docs.js', compareArgs)) {
        throw new Error('compare-docs.js a échoué');
      }
      
      console.log('\n✅ Étape 2 terminée\n');
    }

    // Step 3: Generate patches
    if (steps.includes(3)) {
      console.log('\n' + '='.repeat(70));
      console.log('📋 ÉTAPE 3: Génération des patches');
      console.log('='.repeat(70) + '\n');
      
      const patchArgs = [
        '--openapi', path.join(dataDir, 'generated-openapi.json'),
        '--routes', path.join(dataDir, 'routes.json'),
        '--output', path.join(dataDir, 'patches')
      ];
      
      if (!runScript('scripts/generate-patch.js', patchArgs)) {
        throw new Error('generate-patch.js a échoué');
      }
      
      console.log('\n✅ Étape 3 terminée\n');
    }

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 RÉSUMÉ DU PIPELINE');
    console.log('═'.repeat(70));
    console.log('\nFichiers générés:');
    console.log(`  📄 data/routes.json - Routes parsées`);
    console.log(`  📄 data/routes-by-file.json - Routes par fichier`);
    console.log(`  📄 data/relationships.json - Dépendances`);
    console.log(`  📄 data/generated-openapi.json - Spécification OpenAPI`);
    console.log(`  📄 data/comparison-report.json - Rapport de comparaison (JSON)`);
    console.log(`  📄 data/comparison-report.md - Rapport de comparaison (Markdown)`);
    console.log(`  📄 data/patches.json - Patches JSON`);
    console.log(`  📄 data/patches.diff - Fichier diff`);

    if (steps.includes(3)) {
      // Check if patches were generated
      const patchesPath = path.join(dataDir, 'patches.json');
      if (fs.existsSync(patchesPath)) {
        const patches = JSON.parse(fs.readFileSync(patchesPath, 'utf-8'));
        console.log(`\n📦 ${patches.length} patches générés`);
      }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('✅ PIPELINE TERMINÉ AVEC SUCCÈS!');
    console.log('═'.repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ ERREUR DANS LE PIPELINE:', error.message);
    console.log('\n' + '═'.repeat(70));
    console.log('⚠️  PIPELINE INTERROMPU');
    console.log('═'.repeat(70) + '\n');
    process.exit(1);
  }
}

runPipeline();
