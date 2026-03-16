#!/usr/bin/env node
/**
 * Script de reset complet pour le code-indexer
 * Supprime toutes les données générées sans toucher au code source
 */

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHROMA_DIR = path.join(__dirname, '..', 'chroma-data');

async function reset() {
    console.log('🧹 Resetting code-indexer data...\n');
    
    let deletedCount = 0;
    let errorCount = 0;
    
    // Supprime le dossier data/
    try {
        await fs.access(DATA_DIR);
        await fs.rm(DATA_DIR, { recursive: true, force: true });
        console.log('✅ Deleted: data/');
        deletedCount++;
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error('❌ Error deleting data/:', e.message);
            errorCount++;
        } else {
            console.log('ℹ️  data/ already empty');
        }
    }
    
    // Supprime le dossier chroma-data/
    try {
        await fs.access(CHROMA_DIR);
        await fs.rm(CHROMA_DIR, { recursive: true, force: true });
        console.log('✅ Deleted: chroma-data/');
        deletedCount++;
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error('❌ Error deleting chroma-data/:', e.message);
            errorCount++;
        } else {
            console.log('ℹ️  chroma-data/ already empty');
        }
    }
    
    // Recrée les dossiers vides avec retry pour Windows
    const recreateDir = async (dirPath, name) => {
      for (let i = 0; i < 3; i++) {
        try {
          await fs.mkdir(dirPath, { recursive: true });
          console.log(`✅ Created: ${name}/`);
          return;
        } catch (e) {
          if (i < 2) {
            // Wait a bit and retry (Windows needs time to release file handles)
            await new Promise(resolve => setTimeout(resolve, 100));
          } else {
            console.error(`❌ Error creating ${name}/:`, e.message);
          }
        }
      }
    };
    
    await recreateDir(DATA_DIR, 'data');
    await recreateDir(CHROMA_DIR, 'chroma-data');
    
    console.log('\n' + '='.repeat(50));
    console.log(`Deleted: ${deletedCount} directories`);
    if (errorCount > 0) console.log(`Errors: ${errorCount}`);
    console.log('\n✨ Reset complete! Ready for new indexing.');
    console.log('\nNext steps:');
    console.log('  npm run chroma:start    # Start ChromaDB');
    console.log('  ollama serve              # Start Ollama');
    console.log('  node scripts/index-project.js /path/to/project');
}

// Confirmation si demandé
if (process.argv.includes('--force') || process.argv.includes('-f')) {
    reset();
} else {
    console.log('⚠️  This will DELETE all indexed data:');
    console.log('   - data/ (JSON outputs, progress, logs)');
    console.log('   - chroma-data/ (vector database)');
    console.log('\nRun with --force or -f to confirm:\n   node scripts/reset.js --force\n');
    process.exit(0);
}
