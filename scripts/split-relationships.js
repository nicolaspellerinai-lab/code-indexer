const fs = require('fs');
const path = require('path');

/**
 * split-relationships.js - Sépare le fichier relationships.json par type d'entité
 * 
 * Ce script lit le fichier relationships.json et crée des fichiers séparés
 * pour chaque type d'entité (elector, zone, tag, etc.)
 * 
 * Utilisation:
 *   node scripts/split-relationships.js [--input <path>] [--output <dir>]
 */

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  input: null,
  output: null
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input' && args[i + 1]) {
    options.input = args[i + 1];
    i++;
  } else if (args[i] === '--output' && args[i + 1]) {
    options.output = args[i + 1];
    i++;
  }
}

// Default paths
const defaultInputPath = path.join(__dirname, '..', 'data', 'relationships.json');
const defaultOutputDir = path.join(__dirname, '..', 'data', 'relationships');

const inputPath = options.input || defaultInputPath;
const outputDir = options.output || defaultOutputDir;

console.log('📂 SÉPARATION DES RELATIONS PAR ENTITÉ\n');
console.log('==========================================================================\n');
console.log(`📁 Fichier source: ${inputPath}`);
console.log(`📁 Dossier sortie: ${outputDir}\n`);

// Load relationships
if (!fs.existsSync(inputPath)) {
  console.error(`❌ Fichier relationships.json non trouvé: ${inputPath}`);
  console.error('   Exécutez d\'abord: node scripts/index-project.js <path>');
  process.exit(1);
}

const relationships = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
console.log(`✅ Chargé ${relationships.length} relations\n`);

// Group relationships by entity type
const entityGroups = {};

for (const rel of relationships) {
  const endpoint = rel.endpoint || '';
  
  // Extract entity type from endpoint path
  // Examples:
  //   GET /api/crm/elector/filter-options -> elector
  //   POST /api/crm/zone -> zone
  //   GET /api/crm/tag/searchasyoutype -> tag
  
  const pathMatch = endpoint.match(/\/api\/crm\/([^\/\s]+)/);
  if (!pathMatch) {
    console.warn(`⚠️  Impossible d'extraire l'entité de: ${endpoint}`);
    continue;
  }
  
  const entityType = pathMatch[1].toLowerCase();
  
  if (!entityGroups[entityType]) {
    entityGroups[entityType] = [];
  }
  
  entityGroups[entityType].push(rel);
}

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Save each entity group to a separate file
const summary = [];

for (const [entityType, entityRelations] of Object.entries(entityGroups)) {
  const outputPath = path.join(outputDir, `${entityType}.json`);
  
  fs.writeFileSync(outputPath, JSON.stringify(entityRelations, null, 2));
  
  summary.push({
    entity: entityType,
    count: entityRelations.length,
    file: outputPath
  });
  
  console.log(`✅ ${entityType}.json: ${entityRelations.length} relations`);
}

// Save summary
const summaryPath = path.join(outputDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalRelations: relationships.length,
  entities: summary
}, null, 2));

console.log(`\n📊 RÉSUMÉ:`);
console.log(`   Total relations: ${relationships.length}`);
console.log(`   Entités trouvées: ${summary.length}`);
console.log(`   Fichiers créés: ${summary.length + 1} (summary.json inclus)\n`);

console.log('==========================================================================\n');
console.log('📖 UTILISATION:\n');
console.log('   node scripts/split-relationships.js [options]\n');
console.log('   Options:');
console.log('   --input <path>   Fichier relationships.json source (défaut: data/relationships.json)');
console.log('   --output <dir>   Dossier de sortie (défaut: data/relationships/)\n');
console.log('   Exemples:');
console.log('   node scripts/split-relationships.js');
console.log('   node scripts/split-relationships.js --input data/relationships.json --output data/relationships');
console.log('\n✅ Terminé!');
