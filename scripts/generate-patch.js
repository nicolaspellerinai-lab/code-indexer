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

console.log('📝 GÉNÉRATION DES MODIFICATIONS\n');
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

// Load routes - support both single file and multi-file formats
let routesData = [];
let routesByFile = null;

// Try to load routes-by-file.json first (multi-file format)
const routesByFilePath = path.join(__dirname, '..', 'data', 'routes-by-file.json');
if (fs.existsSync(routesByFilePath)) {
  routesByFile = JSON.parse(fs.readFileSync(routesByFilePath, 'utf-8'));
  console.log('📁 Format multi-fichiers détecté (routes-by-file.json)');
} else if (routeFilePath.endsWith('.json')) {
  // Load as JSON (single or multi-file format)
  routesData = JSON.parse(fs.readFileSync(routeFilePath, 'utf-8'));
  
  // Check if it's already grouped by file
  if (!Array.isArray(routesData)) {
    routesByFile = routesData;
    routesData = [];
  }
}

// If we have routesData (array), group them by file
if (routesData.length > 0 && !routesByFile) {
  routesByFile = {};
  for (const route of routesData) {
    const file = route.file || 'unknown';
    if (!routesByFile[file]) {
      routesByFile[file] = [];
    }
    routesByFile[file].push(route);
  }
}

// If we still don't have routesByFile, create it from the JSON file content
if (!routesByFile && routeFilePath.endsWith('.json')) {
  const jsonData = JSON.parse(fs.readFileSync(routeFilePath, 'utf-8'));
  if (Array.isArray(jsonData)) {
    routesByFile = {};
    for (const route of jsonData) {
      const file = route.file || 'unknown';
      if (!routesByFile[file]) {
        routesByFile[file] = [];
      }
      routesByFile[file].push(route);
    }
  }
}

// Extract Swagger annotations from route handlers with line numbers
function extractSwaggerDocs(code) {
  const docs = {};
  const lines = code.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Find JSDoc comment blocks with @swagger
    if (line.includes('/**') && lines[i + 1] && lines[i + 1].includes('@swagger')) {
      // Find the end of the comment block
      let j = i + 1;
      while (j < lines.length && !lines[j].includes('*/')) {
        j++;
      }
      
      const commentBlock = lines.slice(i + 1, j).join('\n');
      const commentStartLine = i + 1; // 1-indexed
      const commentEndLine = j; // 1-indexed
      
      // Extract path
      const pathMatch = commentBlock.match(/@swagger\s*\n\s*\*\s*(\S+):/);
      if (!pathMatch) continue;
      const swaggerPath = pathMatch[1];
      
      // Extract method
      const methodMatch = commentBlock.match(/\s+\*\s+(\w+):\s*$/m);
      if (!methodMatch) continue;
      const method = methodMatch[1].toUpperCase();
      
      // Extract summary and description
      const summaryMatch = commentBlock.match(/summary:\s*(.+)/);
      const descMatch = commentBlock.match(/description:\s*(.+)/);
      
      docs[`${method} ${swaggerPath}`] = {
        summary: summaryMatch ? summaryMatch[1].trim() : null,
        description: descMatch ? descMatch[1].trim() : null,
        commentStartLine,
        commentEndLine,
        originalBlock: lines.slice(i, j + 1).join('\n')
      };
      
      i = j; // Skip to end of comment
    }
  }
  
  return docs;
}

// Find route handler positions
function findRoutePositions(code) {
  const positions = {};
  const lines = code.split('\n');
  
  // Match router.METHOD calls
  const routerRegex = /router\.(get|post|put|patch|delete|options)\s*\(\s*['"`\/]+([^'"`\/]+)/g;
  
  let match;
  while ((match = routerRegex.exec(code)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const lineNumber = code.substring(0, match.index).split('\n').length;
    
    positions[`${method} ${routePath}`] = {
      lineNumber,
      code: lines[lineNumber - 1]?.trim() || ''
    };
  }
  
  return positions;
}

// Generate Swagger block for a route
function generateSwaggerBlock(method, routePath, spec) {
  const summary = spec.summary || 'TODO: Add summary';
  const description = spec.description || 'TODO: Add description';
  const capitalizedMethod = method.toLowerCase();
  
  return `/**
 * @swagger
 * ${routePath}:
 *   ${capitalizedMethod}:
 *     summary: ${summary}
 *     description: ${description}
 *     tags:
 *       - ${spec.tags?.[0] || 'API'}
 *     parameters: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server Error
 */`;
}

// Generate patches - process each route and track source files
const patches = {
  metadata: {
    generatedAt: new Date().toISOString(),
    openAPISource: openAPIPath,
    routeSource: routeFilePath,
    sourceFiles: routesByFile ? Object.keys(routesByFile) : [],
    totalRoutes: 0,
    newRoutes: 0,
    improvedRoutes: 0,
    unchangedRoutes: 0
  },
  patches: [],
  byFile: {} // Patches grouped by source file
};

// Initialize byFile
for (const file of Object.keys(routesByFile || {})) {
  patches.byFile[file] = [];
}

console.log('📝 GÉNÉRATION DES MODIFICATIONS\n');
console.log('='.repeat(80) + '\n');

for (const [pathKey, methods] of Object.entries(openAPIData.paths)) {
  for (const [method, spec] of Object.entries(methods)) {
    patches.metadata.totalRoutes++;
    
    // Try different path formats
    const key1 = `${method.toUpperCase()} ${pathKey}`;
    const key2 = `${method.toUpperCase()} /${pathKey.replace(/^\//, '')}`;
    
    // Find the source file for this route
    let sourceFile = null;
    let original = null;
    
    if (routesByFile) {
      // Search in each source file
      for (const [file, routes] of Object.entries(routesByFile)) {
        // Try to find route in this file
        const route = routes.find(r => 
          (r.method?.toUpperCase() === method.toUpperCase() || r.method === method) &&
          (r.path === pathKey || r.fullPath === pathKey || r.path === pathKey.replace(/^\//, ''))
        );
        
        if (route) {
          sourceFile = file;
          
          // Load the source file code
          if (fs.existsSync(file)) {
            const fileCode = fs.readFileSync(file, 'utf-8');
            const fileDocs = extractSwaggerDocs(fileCode);
            original = fileDocs[key1] || fileDocs[key2];
          }
          break;
        }
      }
    }
    
    // Fallback to original single-file logic if not found
    if (!original && routeFilePath && !routeFilePath.endsWith('.json')) {
      const routeCode = fs.readFileSync(routeFilePath, 'utf-8');
      const docs = extractSwaggerDocs(routeCode);
      original = docs[key1] || docs[key2];
      sourceFile = routeFilePath;
    }
    
    // Default source file if not found
    sourceFile = sourceFile || routeFilePath;
    
    if (original) {
      // Route has original docs - check if improvement needed
      const originalSummary = original.summary || '';
      const generatedSummary = spec.summary || '';
      
      if (generatedSummary.length > originalSummary.length + 15) {
        // Improvement found - generate update patch
        patches.metadata.improvedRoutes++;
        
        const newBlock = generateSwaggerBlock(method.toUpperCase(), pathKey, spec);
        
        const patch = {
          type: 'improved',
          method: method.toUpperCase(),
          path: pathKey,
          action: 'replace',
          file: sourceFile,
          startLine: original.commentStartLine,
          endLine: original.commentEndLine,
          originalContent: original.originalBlock,
          newContent: newBlock,
          diff: {
            old: original.originalBlock.split('\n').map((l, i) => `- ${i + 1}: ${l}`).join('\n'),
            new: newBlock.split('\n').map((l, i) => `+ ${i + 1}: ${l}`).join('\n')
          }
        };
        
        patches.patches.push(patch);
        if (!patches.byFile[sourceFile]) patches.byFile[sourceFile] = [];
        patches.byFile[sourceFile].push(patch);
        
        console.log(`✅ AMÉLIORER: ${method.toUpperCase()} ${pathKey}`);
        console.log(`   Fichier: ${sourceFile}`);
        console.log(`   Lignes: ${original.commentStartLine}-${original.commentEndLine}\n`);
      } else {
        patches.metadata.unchangedRoutes++;
      }
    } else {
      // New route - generate insert patch
      patches.metadata.newRoutes++;
      
      // Try to find the route handler position in the source file
      let pos = null;
      if (sourceFile && fs.existsSync(sourceFile)) {
        const fileCode = fs.readFileSync(sourceFile, 'utf-8');
        const positions = findRoutePositions(fileCode);
        const routeKey = `${method.toUpperCase()} /${pathKey.replace(/^\//, '')}`;
        pos = positions[routeKey];
      }
      
      if (pos || (sourceFile && fs.existsSync(sourceFile))) {
        const newBlock = generateSwaggerBlock(method.toUpperCase(), pathKey, spec);
        
        const patch = {
          type: 'new',
          method: method.toUpperCase(),
          path: pathKey,
          action: 'insert',
          file: sourceFile,
          insertBeforeLine: pos?.lineNumber || 1,
          newContent: newBlock,
          diff: {
            old: '',
            new: newBlock.split('\n').map((l, i) => `+ ${i + 1}: ${l}`).join('\n')
          }
        };
        
        patches.patches.push(patch);
        if (!patches.byFile[sourceFile]) patches.byFile[sourceFile] = [];
        patches.byFile[sourceFile].push(patch);
        
        console.log(`🆕 NOUVEAU: ${method.toUpperCase()} ${pathKey}`);
        console.log(`   Fichier: ${sourceFile}`);
        if (pos) {
          console.log(`   Insérer avant ligne: ${pos.lineNumber}\n`);
        } else {
          console.log(`   (position non trouvée)\n`);
        }
      }
    }
  }
}

console.log('='.repeat(80));
console.log('\n📈 RÉSUMÉ:');
console.log(`   Fichiers sources: ${patches.metadata.sourceFiles.length}`);
console.log(`   Total routes: ${patches.metadata.totalRoutes}`);
console.log(`   Nouvelles (à insérer): ${patches.metadata.newRoutes}`);
console.log(`   Améliorées (à remplacer): ${patches.metadata.improvedRoutes}`);
console.log(`   Identiques: ${patches.metadata.unchangedRoutes}\n`);

// Show patches by file
console.log('📁 PATCHES PAR FICHIER:');
for (const [file, filePatches] of Object.entries(patches.byFile)) {
  if (filePatches.length > 0) {
    const fileName = path.basename(file);
    console.log(`   ${fileName}: ${filePatches.length} modifications`);
  }
}
console.log();

// Determine output directory
const outputDir = options.output ? path.dirname(options.output) : path.join(__dirname, '..', 'data');
const outputPrefix = options.output ? path.basename(options.output, path.extname(options.output)) : 'patches';

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Save patch file
const patchPath = path.join(outputDir, `${outputPrefix}.json`);
fs.writeFileSync(patchPath, JSON.stringify(patches, null, 2));
console.log(`💾 Sauvegardé: ${patchPath}\n`);

// Also generate a readable diff file grouped by source file
const diffPath = path.join(outputDir, `${outputPrefix}.diff`);
let diffContent = `PATCH FILE - Généré le ${new Date().toISOString()}\n`;
diffContent += `OpenAPI source: ${openAPIPath}\n`;
diffContent += `Routes sources: ${JSON.stringify(patches.metadata.sourceFiles)}\n`;
diffContent += '='.repeat(80) + '\n\n';

// Group diffs by source file
for (const [file, filePatches] of Object.entries(patches.byFile)) {
  if (filePatches.length === 0) continue;
  
  const fileName = path.basename(file);
  diffContent += `\n========== FICHIER: ${fileName} ==========\n`;
  diffContent += `Chemin complet: ${file}\n`;
  diffContent += '='.repeat(80) + '\n\n';
  
  for (const patch of filePatches) {
    diffContent += `\n--- ${patch.file}:${patch.startLine || patch.insertBeforeLine}\n`;
    diffContent += `+++ ${patch.method} ${patch.path} (${patch.type})\n`;
    diffContent += '@@ ' + (patch.type === 'improved' 
      ? `Lignes ${patch.startLine}-${patch.endLine} (REMPLACER)`
      : `Avant ligne ${patch.insertBeforeLine} (INSÉRER)`) + ' @@\n\n';
    
    if (patch.diff.old) {
      diffContent += patch.diff.old + '\n';
    }
    diffContent += patch.diff.new + '\n';
  }
}

fs.writeFileSync(diffPath, diffContent);
console.log(`💾 Sauvegardé: ${diffPath}\n`);

console.log('='.repeat(80));
console.log('\n📖 UTILISATION:\n');
console.log('   node scripts/generate-patch.js [options]\n');
console.log('   Options:');
console.log('   --openapi <path>  Fichier OpenAPI généré (défaut: data/generated-openapi.json)');
console.log('   --routes <path>   Fichier routes source (défaut: data/routes.json)');
console.log('   --output <path>   Préfixe des fichiers de sortie (défaut: data/patches)');
console.log('\n   Exemples:');
console.log('   node scripts/generate-patch.js');
console.log('   node scripts/generate-patch.js --openapi data/generated-openapi.json --routes code/my-routes.js');
console.log('   node scripts/generate-patch.js --output output/my-patches\n');

console.log('✅ Terminé!');
