const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  openAPI: null,
  routeFile: null,
  output: null
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--openapi' && args[i + 1]) {
    options.openAPI = args[i + 1];
    i++;
  } else if (args[i] === '--routes' && args[i + 1]) {
    options.routeFile = args[i + 1];
    i++;
  } else if (args[i] === '--output' && args[i + 1]) {
    options.output = args[i + 1];
    i++;
  }
}

// Default paths
const defaultOpenAPIPath = path.join(__dirname, '..', 'data', 'generated-openapi.json');
const defaultRouteFilePath = path.join(__dirname, '..', 'data', 'routes.json');

// Resolve paths
const openAPIPath = options.openAPI || defaultOpenAPIPath;
const routeFilePath = options.routeFile || defaultRouteFilePath;

console.log('📊 COMPARAISON DE DOCUMENTATION\n');
console.log('==========================================================================\n');
console.log(`📁 Fichier OpenAPI: ${openAPIPath}`);
console.log(`📁 Fichier routes: ${routeFilePath}\n`);

// Load generated OpenAPI
if (!fs.existsSync(openAPIPath)) {
  console.error(`❌ Fichier OpenAPI non trouvé: ${openAPIPath}`);
  console.error('   Exécutez d\'abord: node scripts/index-project.js <path>');
  process.exit(1);
}
const openAPIData = JSON.parse(fs.readFileSync(openAPIPath, 'utf-8'));

// Load original route file (can be JS file or JSON)
let routeCode = '';
if (!fs.existsSync(routeFilePath)) {
  console.error(`❌ Fichier routes non trouvé: ${routeFilePath}`);
  process.exit(1);
}

if (routeFilePath.endsWith('.json')) {
  // Load as JSON (parsed routes from pipeline)
  routeCode = JSON.stringify(JSON.parse(fs.readFileSync(routeFilePath, 'utf-8')), null, 2);
} else {
  // Load as JS file (original source code)
  routeCode = fs.readFileSync(routeFilePath, 'utf-8');
}

// Extract Swagger annotations from route handlers
function extractSwaggerDocs(code) {
  const docs = {};
  
  // Find all JSDoc comment blocks
  const commentMatches = code.matchAll(/\/\*\*([\s\S]*?)\*\//g);
  
  for (const commentMatch of commentMatches) {
    const commentBlock = commentMatch[1];
    
    // Check if this is a swagger block
    if (!commentBlock.includes('@swagger')) continue;
    
    // Extract path from swagger block
    const pathMatch = commentBlock.match(/@swagger\s*\n\s*\*\s*(\S+):/);
    if (!pathMatch) continue;
    
    const swaggerPath = pathMatch[1];
    
    // Find the HTTP method - look for line like " *   get:"
    const methodMatch = commentBlock.match(/\s+\*\s+(\w+):\s*$/m);
    if (!methodMatch) continue;
    
    const method = methodMatch[1].toUpperCase();
    
    // Extract summary and description
    const summaryMatch = commentBlock.match(/summary:\s*(.+)/);
    const descMatch = commentBlock.match(/description:\s*(.+)/);
    
    docs[`${method} ${swaggerPath}`] = {
      summary: summaryMatch ? summaryMatch[1].trim() : null,
      description: descMatch ? descMatch[1].trim() : null,
      raw: commentBlock.trim()
    };
  }
  
  return docs;
}

// Extract docs from JSON format (pipeline output)
function extractFromJSON(jsonString) {
  const docs = {};
  try {
    const routes = JSON.parse(jsonString);
    if (Array.isArray(routes)) {
      for (const route of routes) {
        const key = `${route.method?.toUpperCase() || 'GET'} ${route.path || route.fullPath || '/'}`;
        docs[key] = {
          summary: route.swagger?.summary || route.description || '',
          description: route.swagger?.description || route.docBlock || '',
          parameters: route.swagger?.parameters || route.parameters || [],
          requestBody: route.swagger?.requestBody || null,
          responses: route.swagger?.responses || route.responses || {},
          tags: route.swagger?.tags || route.tags || [],
          raw: route.jsdoc || route.docBlock || ''
        };
      }
    }
  } catch (e) {
    // Not JSON, will use JSDoc extraction
  }
  return docs;
}

// Determine if input is JSON or JS code
let originalDocs;
if (routeFilePath.endsWith('.json')) {
  originalDocs = extractFromJSON(routeCode);
} else {
  originalDocs = extractSwaggerDocs(routeCode);
}

// Helper function to compare parameters
function compareParameters(generated, original) {
  const result = { added: [], removed: [], improved: false };
  
  const genParams = generated || [];
  const origParams = Array.isArray(original) ? original : [];
  
  const origNames = new Set(origParams.map(p => p.name || p));
  const genNames = new Set(genParams.map(p => p.name || p));
  
  // Find added parameters
  for (const p of genParams) {
    const name = p.name || p;
    if (!origNames.has(name)) {
      result.added.push(name);
    }
  }
  
  // Find removed parameters
  for (const p of origParams) {
    const name = p.name || p;
    if (!genNames.has(name)) {
      result.removed.push(name);
    }
  }
  
  // Check if improved (more detailed descriptions)
  if (genParams.length > origParams.length) {
    result.improved = true;
  }
  
  return result;
}

// Helper function to compare schemas
function compareSchemas(generated, original) {
  const result = { added: [], improved: false };
  
  const genProps = generated?.properties ? Object.keys(generated.properties) : [];
  const origProps = original?.properties ? Object.keys(original.properties) : [];
  
  for (const prop of genProps) {
    if (!origProps.includes(prop)) {
      result.added.push(prop);
    }
  }
  
  if (genProps.length > origProps.length) {
    result.improved = true;
  }
  
  return result;
}

// Helper function to compare responses
function compareResponses(generated, original) {
  const result = { added: [], improved: false };
  
  const genCodes = generated ? Object.keys(generated) : [];
  const origCodes = original ? Object.keys(original) : [];
  
  for (const code of genCodes) {
    if (!origCodes.includes(code)) {
      result.added.push(code);
    }
  }
  
  if (genCodes.length > origCodes.length) {
    result.improved = true;
  }
  
  return result;
}

console.log('📊 RAPPORT DE COMPARAISON\n');
console.log('==========================================================================\n');

let totalGenerated = 0;
let totalWithOriginal = 0;
let improved = 0;
let unchanged = 0;
let paramsImproved = 0;
let schemasImproved = 0;
let responsesImproved = 0;

// Compare each path
for (const [pathKey, methods] of Object.entries(openAPIData.paths)) {
  for (const [method, spec] of Object.entries(methods)) {
    totalGenerated++;
    
    // Try different path formats
    const key1 = `${method.toUpperCase()} ${pathKey}`;
    const key2 = `${method.toUpperCase()} /${pathKey.replace(/^\//, '')}`;
    
    const original = originalDocs[key1] || originalDocs[key2];
    
    if (original && (original.summary || original.description || original.parameters || original.responses)) {
      totalWithOriginal++;
      
      const generatedSummary = spec.summary || '';
      const generatedDesc = spec.description || '';
      const originalSummary = original.summary || '';
      const originalDesc = original.description || '';
      
      // Check if LLM improved - more detailed than original
      const isImproved = generatedSummary.length > originalSummary.length + 15 || 
                         generatedDesc.length > originalDesc.length + 20;
      
      // Compare parameters
      const paramCompare = compareParameters(spec.parameters, original.parameters);
      if (paramCompare.improved || paramCompare.added.length > 0) {
        paramsImproved++;
      }
      
      // Compare schemas
      const inputSchemaCompare = compareSchemas(spec.requestBody?.content?.['application/json']?.schema, original.requestBody?.schema);
      const outputSchemaCompare = compareSchemas(spec.responses?.['200']?.content?.['application/json']?.schema, original.responses?.['200']?.schema);
      if (inputSchemaCompare.improved || outputSchemaCompare.improved) {
        schemasImproved++;
      }
      
      // Compare responses
      const responseCompare = compareResponses(spec.responses, original.responses);
      if (responseCompare.improved || responseCompare.added.length > 0) {
        responsesImproved++;
      }
      
      if (isImproved || paramCompare.improved || inputSchemaCompare.improved || outputSchemaCompare.improved || responseCompare.improved) {
        improved++;
        console.log(`\n✅ AMÉLIORÉ: ${method.toUpperCase()} ${pathKey}`);
        if (originalSummary) {
          console.log(`   Original: ${originalSummary}`);
        }
        console.log(`   Généré:   ${generatedSummary}`);
        
        // Show parameters changes
        if (paramCompare.added.length > 0) {
          console.log(`   📝 Params ajoutés: ${paramCompare.added.join(', ')}`);
        }
        if (inputSchemaCompare.added.length > 0) {
          console.log(`   📝 Schema body ajouté: ${inputSchemaCompare.added.join(', ')}`);
        }
        if (responseCompare.added.length > 0) {
          console.log(`   📝 Responses ajoutées: ${responseCompare.added.join(', ')}`);
        }
      } else {
        unchanged++;
        console.log(`\n➡️  IDENTIQUE/SIMILAIRE: ${method.toUpperCase()} ${pathKey}`);
        console.log(`   ${generatedSummary}`);
      }
    } else {
      // New route without original docs
      console.log(`\n🆕 NOUVEAU: ${method.toUpperCase()} ${pathKey}`);
      console.log(`   ${spec.summary?.substring(0, 80)}`);
      
      // Show what was generated
      if (spec.parameters?.length > 0) {
        console.log(`   📝 Params: ${spec.parameters.map(p => p.name).join(', ')}`);
      }
      if (spec.requestBody?.content?.['application/json']?.schema?.properties) {
        const props = Object.keys(spec.requestBody.content['application/json'].schema.properties);
        console.log(`   📝 Body: ${props.join(', ')}`);
      }
      if (spec.responses) {
        console.log(`   📝 Responses: ${Object.keys(spec.responses).join(', ')}`);
      }
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log('\n📈 STATISTIQUES:');
console.log(`   Routes générées: ${totalGenerated}`);
console.log(`   Avec docs originaux: ${totalWithOriginal}`);
console.log(`   Améliorées par LLM: ${improved}`);
console.log(`   Identiques: ${unchanged}`);
console.log(`   Nouvelles (sans doc original): ${totalGenerated - totalWithOriginal}`);
console.log(`   ---`);
console.log(`   Params améliorés: ${paramsImproved}`);
console.log(`   Schemas améliorés: ${schemasImproved}`);
console.log(`   Responses améliorés: ${responsesImproved}`);

// Save detailed comparison to file if output specified
if (options.output) {
  const comparisonReport = {
    timestamp: new Date().toISOString(),
    openAPIPath,
    routeFilePath,
    stats: {
      totalGenerated,
      totalWithOriginal,
      improved,
      unchanged,
      newRoutes: totalGenerated - totalWithOriginal,
      paramsImproved,
      schemasImproved,
      responsesImproved
    }
  };
  fs.writeFileSync(options.output, JSON.stringify(comparisonReport, null, 2));
  console.log(`\n💾 Rapport sauvegardé: ${options.output}`);
}

// List routes that could use improvement (have original but brief)
console.log('\n' + '='.repeat(80));
console.log('\n📝 ROUTES SANS DOCUMENTATION ORIGINALE:\n');

for (const [pathKey, methods] of Object.entries(openAPIData.paths)) {
  for (const [method, spec] of Object.entries(methods)) {
    const key1 = `${method.toUpperCase()} ${pathKey}`;
    const key2 = `${method.toUpperCase()} /${pathKey.replace(/^\//, '')}`;
    const original = originalDocs[key1] || originalDocs[key2];
    
    if (!original || (!original.summary && !original.description && !original.parameters && !original.responses)) {
      console.log(`   ${method.toUpperCase()} ${pathKey}`);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log('\n📖 UTILISATION:\n');
console.log('   node scripts/compare-docs.js [options]\n');
console.log('   Options:');
console.log('   --openapi <path>  Fichier OpenAPI généré (défaut: data/generated-openapi.json)');
console.log('   --routes <path>   Fichier routes source (défaut: data/routes.json)');
console.log('   --output <path>  Sauvegarder le rapport en JSON');
console.log('\n   Exemples:');
console.log('   node scripts/compare-docs.js');
console.log('   node scripts/compare-docs.js --openapi data/generated-openapi.json --routes code/my-routes.js');
console.log('   node scripts/compare-docs.js --output data/comparison-report.json');
console.log('\n✅ Terminé!');
