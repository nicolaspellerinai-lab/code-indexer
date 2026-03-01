const RouteParser = require('./src/parsers/routeParser');

async function analyzeRoutes() {
  console.log('=== ANALYSE DES ROUTES ===\n');
  
  const parser = new RouteParser('./test-projects/express-campaign');
  const routeFiles = await parser.findRouteFiles();
  
  console.log('📂 Fichiers trouvés:', routeFiles.length);
  console.log(routeFiles.join('\n'));
  
  for (const file of routeFiles) {
    const routes = await parser.parseFile(file);
    console.log(`\n📄 ${file}`);
    if (routes.length === 0) {
      console.log('  ❌ Aucune route trouvée');
    } else {
      routes.forEach((r, i) => {
        const fullPath = r.fullPath || r.path || 'N/A';
        const method = r.method || 'N/A';
        const hasSummary = r.llmEnrichment?.summary ? '✅' : '❌';
        console.log(`${i+1}. ${method} ${fullPath} ${hasSummary}`);
      });
    }
  }
  
  console.log(`\n📊 Total routes: ${parser.routes.length}`);
}

analyzeRoutes().catch(console.error);