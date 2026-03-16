const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  openAPI: null,
  routeFile: null,
  output: null,
  markdown: null
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
  } else if (args[i] === '--markdown' && args[i + 1]) {
    options.markdown = args[i + 1];
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

// Store markdown report data
const markdownReport = {
  header: `# Rapport de Comparaison de Documentation\n\n**Date:** ${new Date().toLocaleString()}\n**Fichier OpenAPI:** ${openAPIPath}\n**Fichier routes:** ${routeFilePath}\n`,
  stats: [],
  improvedRoutes: [],
  unchangedRoutes: [],
  newRoutes: [],
  routesWithoutDocs: []
};

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
        
        // Add to markdown report
        markdownReport.improvedRoutes.push({
          method: method.toUpperCase(),
          path: pathKey,
          original: originalSummary,
          generated: generatedSummary,
          paramsAdded: paramCompare.added,
          bodyAdded: inputSchemaCompare.added,
          responsesAdded: responseCompare.added
        });
      } else {
        unchanged++;
        console.log(`\n➡️  IDENTIQUE/SIMILAIRE: ${method.toUpperCase()} ${pathKey}`);
        console.log(`   ${generatedSummary}`);
        
        // Add to markdown report
        markdownReport.unchangedRoutes.push({
          method: method.toUpperCase(),
          path: pathKey,
          summary: generatedSummary
        });
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
      
      // Add to markdown report
      markdownReport.newRoutes.push({
        method: method.toUpperCase(),
        path: pathKey,
        summary: spec.summary?.substring(0, 80),
        params: spec.parameters?.map(p => p.name) || [],
        body: spec.requestBody?.content?.['application/json']?.schema?.properties ? Object.keys(spec.requestBody.content['application/json'].schema.properties) : [],
        responses: spec.responses ? Object.keys(spec.responses) : []
      });
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

// Generate markdown report
let markdownOutput = markdownReport.header;

// Statistics section
markdownOutput += `## 📈 Statistiques\n\n`;
markdownOutput += `| Métrique | Valeur |\n`;
markdownOutput += `|----------|--------|\n`;
markdownOutput += `| Routes générées | ${totalGenerated} |\n`;
markdownOutput += `| Avec docs originaux | ${totalWithOriginal} |\n`;
markdownOutput += `| Améliorées par LLM | ${improved} |\n`;
markdownOutput += `| Identiques | ${unchanged} |\n`;
markdownOutput += `| Nouvelles (sans doc original) | ${totalGenerated - totalWithOriginal} |\n`;
markdownOutput += `| Params améliorés | ${paramsImproved} |\n`;
markdownOutput += `| Schemas améliorés | ${schemasImproved} |\n`;
markdownOutput += `| Responses améliorés | ${responsesImproved} |\n`;
markdownOutput += `\n`;

// Improved routes section
if (markdownReport.improvedRoutes.length > 0) {
  markdownOutput += `## ✅ Routes Améliorées\n\n`;
  for (const route of markdownReport.improvedRoutes) {
    markdownOutput += `### ${route.method} ${route.path}\n\n`;
    if (route.original) {
      markdownOutput += `**Original:** ${route.original}\n\n`;
    }
    markdownOutput += `**Généré:** ${route.generated}\n\n`;
    if (route.paramsAdded.length > 0) {
      markdownOutput += `📝 Params ajoutés: ${route.paramsAdded.join(', ')}\n\n`;
    }
    if (route.bodyAdded.length > 0) {
      markdownOutput += `📝 Schema body ajouté: ${route.bodyAdded.join(', ')}\n\n`;
    }
    if (route.responsesAdded.length > 0) {
      markdownOutput += `📝 Responses ajoutées: ${route.responsesAdded.join(', ')}\n\n`;
    }
    markdownOutput += `---\n\n`;
  }
}

// New routes section
if (markdownReport.newRoutes.length > 0) {
  markdownOutput += `## 🆕 Nouvelles Routes\n\n`;
  markdownOutput += `| Méthode | Chemin | Summary | Params | Body | Responses |\n`;
  markdownOutput += `|---------|--------|---------|--------|------|-----------|\n`;
  for (const route of markdownReport.newRoutes) {
    markdownOutput += `| ${route.method} | ${route.path} | ${route.summary || '-'} | ${route.params.join(', ') || '-'} | ${route.body.join(', ') || '-'} | ${route.responses.join(', ') || '-'} |\n`;
  }
  markdownOutput += `\n`;
}

// Unchanged routes section
if (markdownReport.unchangedRoutes.length > 0) {
  markdownOutput += `## ➡️ Routes Identiques/Similaires\n\n`;
  for (const route of markdownReport.unchangedRoutes) {
    markdownOutput += `- **${route.method} ${route.path}**: ${route.summary}\n`;
  }
  markdownOutput += `\n`;
}

// Routes without documentation section
if (markdownReport.routesWithoutDocs.length > 0) {
  markdownOutput += `## 📝 Routes Sans Documentation Originale\n\n`;
  for (const route of markdownReport.routesWithoutDocs) {
    markdownOutput += `- ${route}\n`;
  }
  markdownOutput += `\n`;
}

// Determine markdown output path
const defaultMarkdownPath = options.output 
  ? options.output.replace(/\.json$/, '.md')
  : path.join(__dirname, '..', 'data', 'comparison-report.md');

const markdownPath = options.markdown || defaultMarkdownPath;

// Save markdown report
fs.writeFileSync(markdownPath, markdownOutput);
console.log(`💾 Rapport Markdown sauvegardé: ${markdownPath}`);

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
      
      // Add to markdown report
      markdownReport.routesWithoutDocs.push(`${method.toUpperCase()} ${pathKey}`);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log('\n📖 UTILISATION:\n');
console.log('   node scripts/compare-docs.js [options]\n');
console.log('   Options:');
console.log('   --openapi <path>   Fichier OpenAPI généré (défaut: data/generated-openapi.json)');
console.log('   --routes <path>    Fichier routes source (défaut: data/routes.json)');
console.log('   --output <path>   Sauvegarder le rapport en JSON');
console.log('   --markdown <path> Sauvegarder le rapport en Markdown');
console.log('\n   Exemples:');
console.log('   node scripts/compare-docs.js');
console.log('   node scripts/compare-docs.js --openapi data/generated-openapi.json --routes code/my-routes.js');
console.log('   node scripts/compare-docs.js --output data/comparison-report.json');
console.log('   node scripts/compare-docs.js --markdown data/comparison-report.md');
console.log('\n✅ Terminé!');
