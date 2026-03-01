#!/usr/bin/env node
/**
 * Test automatisé du pipeline code-indexer
 * Usage: node test-pipeline.js
 */

const RouteParser = require('./src/parsers/routeParser');
const DependencyAnalyzer = require('./src/parsers/dependencyAnalyzer');
const DocGenerator = require('./src/generators/docGenerator');

async function runTests() {
  let exitCode = 0;
  
  try {
    const parser = new RouteParser('./test-projects/express-campaign');
    await parser.run();
    
    // Test 1: Routes found
    console.log('Test 1: Routes found...');
    if (parser.routes.length === 0) {
      console.error('  ❌ FAIL: No routes found');
      exitCode = 1;
    } else {
      console.log('  ✅', parser.routes.length, 'routes found');
    }
    
    // Test 2: All routes have fullPath with /api/
    console.log('Test 2: fullPath validation...');
    const hasFullPath = parser.routes.every(r => r.fullPath && r.fullPath.startsWith('/api/'));
    if (!hasFullPath) {
      console.error('  ❌ FAIL: Some routes missing /api/ prefix');
      parser.routes.forEach(r => {
        if (!r.fullPath || !r.fullPath.startsWith('/api/')) {
          console.error('    -', r.method, r.rawPath, '->', r.fullPath || 'MISSING');
        }
      });
      exitCode = 1;
    } else {
      console.log('  ✅ All routes have /api/ prefix');
    }
    
    // Test 3: Dependencies
    console.log('Test 3: Dependency analysis...');
    const analyzer = new DependencyAnalyzer(parser.routes, './test-projects/express-campaign');
    const relationships = analyzer.analyze();
    if (relationships.length === 0) {
      console.error('  ❌ FAIL: No dependencies found');
      exitCode = 1;
    } else {
      console.log('  ✅', relationships.length, 'relationships analyzed');
    }
    
    // Test 4: OpenAPI generation
    console.log('Test 4: OpenAPI generation...');
    const docGen = new DocGenerator();
    const openAPIDocs = { 
      openapi: '3.0.0', 
      info: { title: 'Test', version: '1.0' }, 
      paths: {} 
    };
    
    for (const route of parser.routes) {
      const doc = docGen.generateOpenAPI(route);
      for (const [path, methods] of Object.entries(doc)) {
        if (!openAPIDocs.paths[path]) openAPIDocs.paths[path] = {};
        Object.assign(openAPIDocs.paths[path], methods);
      }
    }
    
    const allPaths = Object.keys(openAPIDocs.paths);
    const allCorrect = allPaths.every(p => p.startsWith('/api/'));
    
    if (!allCorrect || allPaths.length === 0) {
      console.error('  ❌ FAIL:', allPaths.length === 0 ? 'No paths generated' : 'Some paths missing /api/ prefix');
      exitCode = 1;
    } else {
      console.log('  ✅', allPaths.length, 'OpenAPI paths generated correctly');
    }
    
  } catch (e) {
    console.error('❌ UNEXPECTED ERROR:', e.message);
    exitCode = 1;
  }
  
  if (exitCode === 0) {
    console.log('\n✅✅✅ ALL TESTS PASSED! ✅✅✅');
  } else {
    console.log('\n❌❌❌ SOME TESTS FAILED ❌❌❌');
  }
  
  process.exit(exitCode);
}

runTests();
