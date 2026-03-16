const fs = require('fs');
const path = require('path');

/**
 * compare-generated-vs-original.js - Compare la documentation générée avec l'original
 * 
 * Ce script compare les fichiers de documentation générés avec les fichiers originals
 * pour identifier les informations manquantes.
 * 
 * Utilisation:
 *   node scripts/compare-generated-vs-original.js [--generated <path>] [--original <dir>]
 */

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  generated: null,
  original: null
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--generated' && args[i + 1]) {
    options.generated = args[i + 1];
    i++;
  } else if (args[i] === '--original' && args[i + 1]) {
    options.original = args[i + 1];
    i++;
  }
}

// Default paths
const defaultGeneratedPath = path.join(__dirname, '..', 'data', 'relationships.json');
const defaultOriginalDir = path.join(__dirname, '..', 'code_to_index', 'documentation');

const generatedPath = options.generated || defaultGeneratedPath;
const originalDir = options.original || defaultOriginalDir;

console.log('📊 COMPARAISON: GÉNÉRÉ vs ORIGINAL\n');
console.log('==========================================================================\n');
console.log(`📁 Fichier généré: ${generatedPath}`);
console.log(`📁 Dossier original: ${originalDir}\n`);

// Load generated relationships
if (!fs.existsSync(generatedPath)) {
  console.error(`❌ Fichier généré non trouvé: ${generatedPath}`);
  process.exit(1);
}

const generated = JSON.parse(fs.readFileSync(generatedPath, 'utf-8'));

// Helper function to normalize endpoint path
function normalizePath(endpoint) {
  return endpoint.replace(/:(\w+)/g, '{$1}').replace(/\(\d+\)/g, '');
}

// Helper function to get entity type from endpoint
function getEntityType(endpoint) {
  const match = endpoint.match(/\/api\/crm\/([^\/]+)/);
  return match ? match[1].toLowerCase() : null;
}

// Build a map of generated endpoints by entity
const generatedByEntity = {};
for (const rel of generated) {
  const entity = getEntityType(rel.endpoint);
  if (!entity) continue;
  
  if (!generatedByEntity[entity]) {
    generatedByEntity[entity] = {};
  }
  
  const normalizedPath = normalizePath(rel.endpoint);
  generatedByEntity[entity][normalizedPath] = rel;
}

// Compare each entity file
console.log('🔍 ANALYSE PAR ENTITÉ:\n');

const missingInfo = {
  totalEndpoints: 0,
  compared: 0,
  missingParameters: [],
  missingRequestBody: [],
  missingResponseDetails: [],
  missingExamples: [],
  endpointsMissingInOriginal: [],
  endpointsMissingInGenerated: []
};

const entities = Object.keys(generatedByEntity);

for (const entity of entities) {
  const originalPath = path.join(originalDir, `${entity}.json`);
  
  if (!fs.existsSync(originalPath)) {
    console.log(`⚠️  ${entity}.json: Fichier original non trouvé`);
    continue;
  }
  
  const original = JSON.parse(fs.readFileSync(originalPath, 'utf-8'));
  const generatedEntity = generatedByEntity[entity];
  
  console.log(`\n--- ${entity.toUpperCase()} ---`);
  
  // Check each generated endpoint
  for (const [genPath, genRel] of Object.entries(generatedEntity)) {
    missingInfo.totalEndpoints++;
    
    // Find matching path in original (handle different path formats)
    let originalPathKey = genPath;
    // Try variations
    const pathVariations = [
      genPath,
      genPath.replace('/api/crm/', '/'),
      genPath.replace('/api/crm/', '/api/crm/')
    ];
    
    let originalEndpoint = null;
    for (const variation of pathVariations) {
      if (original.paths && original.paths[variation]) {
        originalEndpoint = original.paths[variation];
        originalPathKey = variation;
        break;
      }
    }
    
    if (!originalEndpoint) {
      // Try to find with method
      const method = genRel.endpoint.split(' ')[0].toLowerCase();
      for (const [p, methods] of Object.entries(original.paths || {})) {
        if (methods[method]) {
          originalEndpoint = methods[method];
          originalPathKey = p;
          break;
        }
      }
    }
    
    if (!originalEndpoint) {
      missingInfo.endpointsMissingInOriginal.push({
        entity,
        endpoint: genRel.endpoint,
        path: genPath
      });
      continue;
    }
    
    missingInfo.compared++;
    
    // Check parameters
    const genParams = genRel.llmEnrichment?.inputSchema;
    const origParams = originalEndpoint.parameters || [];
    
    if (origParams.length > 0 && (!genParams?.query || Object.keys(genParams.query).length === 0) && (!genParams?.path || Object.keys(genParams.path).length === 0)) {
      missingInfo.missingParameters.push({
        entity,
        endpoint: genRel.endpoint,
        originalParams: origParams.length,
        generatedParams: 0
      });
    }
    
    // Check request body
    const genBody = genRel.llmEnrichment?.inputSchema?.body;
    const origBody = originalEndpoint.requestBody;
    
    if (origBody && !genBody) {
      missingInfo.missingRequestBody.push({
        entity,
        endpoint: genRel.endpoint,
        hasOriginal: true,
        hasGenerated: false
      });
    }
    
    // Check response details
    const genResponses = genRel.llmEnrichment?.responses;
    const origResponses = originalEndpoint.responses;
    
    if (origResponses) {
      const origResponseCodes = Object.keys(origResponses);
      const genResponseCodes = genResponses ? Object.keys(genResponses) : [];
      
      // Check if original has detailed response schemas
      const hasDetailedOriginal = origResponseCodes.some(code => 
        origResponses[code]?.schema || origResponses[code]?.content
      );
      
      const hasDetailedGenerated = genResponseCodes.some(code => 
        genResponses?.[code]?.schema
      );
      
      if (hasDetailedOriginal && !hasDetailedGenerated) {
        missingInfo.missingResponseDetails.push({
          entity,
          endpoint: genRel.endpoint,
          originalCodes: origResponseCodes,
          generatedCodes: genResponseCodes
        });
      }
    }
    
    // Check examples
    const genExamples = genRel.llmEnrichment?.examples;
    const hasOriginalExamples = originalEndpoint.responses && 
      Object.values(originalEndpoint.responses).some(r => r.examples || (r.schema && r.schema.example));
    
    if (hasOriginalExamples && !genExamples) {
      missingInfo.missingExamples.push({
        entity,
        endpoint: genRel.endpoint
      });
    }
  }
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('\n📊 RÉSUMÉ DES INFORMATIONS MANQUANTES:\n');

console.log(`Total endpoints générés: ${missingInfo.totalEndpoints}`);
console.log(`Endpoints comparés: ${missingInfo.compared}\n`);

console.log(`📝 Paramètres manquants: ${missingInfo.missingParameters.length}`);
if (missingInfo.missingParameters.length > 0) {
  console.log('   Exemples:');
  for (const p of missingInfo.missingParameters.slice(0, 3)) {
    console.log(`   - ${p.entity}: ${p.endpoint}`);
  }
  if (missingInfo.missingParameters.length > 3) {
    console.log(`   ... et ${missingInfo.missingParameters.length - 3} autres`);
  }
}

console.log(`\n📝 Corps de requête (requestBody) manquant: ${missingInfo.missingRequestBody.length}`);
if (missingInfo.missingRequestBody.length > 0) {
  console.log('   Exemples:');
  for (const p of missingInfo.missingRequestBody.slice(0, 3)) {
    console.log(`   - ${p.entity}: ${p.endpoint}`);
  }
}

console.log(`\n📝 Détails de réponse manquants: ${missingInfo.missingResponseDetails.length}`);
if (missingInfo.missingResponseDetails.length > 0) {
  console.log('   Exemples:');
  for (const p of missingInfo.missingResponseDetails.slice(0, 3)) {
    console.log(`   - ${p.entity}: ${p.endpoint}`);
  }
}

console.log(`\n📝 Exemples manquants: ${missingInfo.missingExamples.length}`);

console.log(`\n🆕 Endpoints manquants dans l'original: ${missingInfo.endpointsMissingInOriginal.length}`);
if (missingInfo.endpointsMissingInOriginal.length > 0) {
  console.log('   (Ce sont de nouvelles routes à documenter)');
}

// Save report
const reportPath = path.join(__dirname, '..', 'data', 'comparison-report-detailed.json');
fs.writeFileSync(reportPath, JSON.stringify(missingInfo, null, 2));
console.log(`\n💾 Rapport détaillé sauvegardé: ${reportPath}\n`);

console.log('==========================================================================\n');
console.log('📖 UTILISATION:\n');
console.log('   node scripts/compare-generated-vs-original.js [options]\n');
console.log('   Options:');
console.log('   --generated <path>  Fichier relationships.json généré');
console.log('   --original <dir>    Dossier avec la documentation originale\n');
console.log('   Exemples:');
console.log('   node scripts/compare-generated-vs-original.js');
console.log('   node scripts/compare-generated-vs-original.js --generated data/relationships.json --original code_to_index/documentation\n');

console.log('\n✅ Terminé!');
