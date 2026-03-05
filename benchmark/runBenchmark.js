/**
 * Script d'exécution du benchmark
 * Exécute les tests de benchmark et génère un rapport
 */

const BenchmarkFramework = require('./benchmarkFramework');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🎯 Code Indexer - Benchmark Suite');
  console.log('='.repeat(50));
  
  const framework = new BenchmarkFramework();
  
  try {
    // Exécuter les benchmarks
    const results = await framework.runAll();
    
    // Sauvegarder les résultats
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: results.length,
        passing: results.filter(r => r.success).length,
        averageScore: framework.getAverageScore()
      },
      results: results.map(r => ({
        testId: r.testId,
        testName: r.testName,
        success: r.success,
        duration: r.duration,
        evaluation: r.evaluation
      }))
    };
    
    // Créer le répertoire benchmark-results s'il n'existe pas
    const resultsDir = path.join(__dirname, '..', 'benchmark-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    // Sauvegarder le rapport
    const filename = `benchmark-${Date.now()}.json`;
    fs.writeFileSync(
      path.join(resultsDir, filename),
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n📁 Results saved to benchmark-results/${filename}`);
    
    // Afficher les recommandations
    console.log('\n💡 Recommendations:');
    const parsingScore = framework.getAverageCategoryScore('parsing');
    const swaggerScore = framework.getAverageCategoryScore('swagger');
    const generationScore = framework.getAverageCategoryScore('generation');
    
    if (parsingScore < 0.8) {
      console.log('  - Improve route parsing (check middleware extraction)');
    }
    if (swaggerScore < 0.7) {
      console.log('  - Improve Swagger documentation parsing');
    }
    if (generationScore < 0.75) {
      console.log('  - Improve OpenAPI generation');
    }
    
    // Code de sortie
    const overallPass = framework.getAverageScore() >= 0.75;
    process.exit(overallPass ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
