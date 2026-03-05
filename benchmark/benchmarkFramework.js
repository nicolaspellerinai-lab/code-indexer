/**
 * Benchmark Framework
 * Framework pour exécuter et évaluer les benchmarks
 */

const RouteParser = require('../src/parsers/routeParser');
const SwaggerParser = require('../src/parsers/swaggerParser');
const OpenAPIGenerator = require('../src/generators/docGenerator');
const testCases = require('./testCases');

class BenchmarkFramework {
  constructor() {
    this.routeParser = new RouteParser();
    this.swaggerParser = new SwaggerParser();
    this.results = [];
  }

  /**
   * Exécute un cas de test
   */
  async runTestCase(testCase) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`   Description: ${testCase.description}`);
    
    const startTime = Date.now();
    
    try {
      // Étape 1: Parser les routes
      const endpoints = this.routeParser.parse(testCase.id + '.js', testCase.code);
      
      // Étape 2: Parser la documentation Swagger
      const endpointsWithDocs = this.swaggerParser.parseFile(testCase.code, endpoints);
      
      // Étape 3: Générer OpenAPI
      const generator = new OpenAPIGenerator({ title: testCase.name });
      for (const endpoint of endpointsWithDocs) {
        generator.addEndpoint(endpoint);
      }
      const openapi = generator.generate();
      
      const duration = Date.now() - startTime;
      
      // Évaluer les résultats
      const evaluation = this.evaluate(testCase, endpointsWithDocs, openapi);
      
      return {
        testId: testCase.id,
        testName: testCase.name,
        success: true,
        duration,
        endpointsFound: endpoints.length,
        endpointsWithDocs: endpointsWithDocs.filter(e => e.hasExistingDocs).length,
        evaluation,
        endpoints: endpointsWithDocs,
        openapi
      };
      
    } catch (error) {
      return {
        testId: testCase.id,
        testName: testCase.name,
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Évalue les résultats contre les attentes
   */
  evaluate(testCase, endpoints, openapi) {
    const scores = {
      parsing: {},
      swagger: {},
      generation: {}
    };
    
    const details = {};
    
    // Évaluation du parsing
    if (testCase.expectedEndpoints) {
      scores.parsing.routeDetection = this.evaluateRouteDetection(endpoints, testCase.expectedEndpoints);
      scores.parsing.pathExtraction = this.evaluatePathExtraction(endpoints, testCase.expectedEndpoints);
      scores.parsing.methodIdentification = this.evaluateMethodIdentification(endpoints, testCase.expectedEndpoints);
      scores.parsing.middlewareExtraction = this.evaluateMiddlewareExtraction(endpoints, testCase.expectedEndpoints);
      scores.parsing.frameworkDetection = this.evaluateFrameworkDetection(endpoints, testCase.expectedEndpoints);
    }
    
    // Évaluation Swagger
    if (testCase.expectedEndpoints) {
      scores.swagger.existingDocsDetection = this.evaluateDocsDetection(endpoints);
      scores.swagger.docsParsing = this.evaluateDocsParsing(endpoints, testCase.expectedEndpoints);
    }
    
    // Évaluation Generation
    if (testCase.expectedOpenAPI) {
      scores.generation.openapiValidity = this.evaluateOpenAPIValidity(openapi);
      scores.generation.schemaCompleteness = this.evaluateSchemaCompleteness(openapi);
    }
    
    // Calcul des scores totaux
    const totals = {};
    for (const [category, criteria] of Object.entries(testCases.evaluationCriteria)) {
      let total = 0;
      let weight = 0;
      
      for (const [criterion, config] of Object.entries(criteria)) {
        if (scores[category] && scores[category][criterion] !== undefined) {
          total += scores[category][criterion] * config.weight;
          weight += config.weight;
        }
      }
      
      totals[category] = weight > 0 ? total / weight : 0;
    }
    
    const overall = (totals.parsing + totals.swagger + totals.generation) / 3;
    
    return {
      scores,
      totals,
      overall
    };
  }

  /**
   * Évalue la détection des routes
   */
  evaluateRouteDetection(endpoints, expected) {
    if (!endpoints || endpoints.length === 0) return 0;
    
    const expectedCount = expected.length;
    const actualCount = endpoints.length;
    
    // Score basé sur le ratio
    const ratio = Math.min(actualCount / expectedCount, 1);
    return ratio;
  }

  /**
   * Évalue l'extraction des chemins
   */
  evaluatePathExtraction(endpoints, expected) {
    if (!endpoints || endpoints.length === 0) return 0;
    
    let correctPaths = 0;
    const expectedPaths = expected.map(e => e.path);
    
    for (const endpoint of endpoints) {
      if (expectedPaths.includes(endpoint.path)) {
        correctPaths++;
      }
    }
    
    return expectedPaths.length > 0 ? correctPaths / expectedPaths.length : 0;
  }

  /**
   * Évalue l'identification des méthodes
   */
  evaluateMethodIdentification(endpoints, expected) {
    if (!endpoints || endpoints.length === 0) return 0;
    
    let correct = 0;
    
    for (const endpoint of endpoints) {
      const exp = expected.find(e => e.path === endpoint.path && e.method === endpoint.method);
      if (exp) correct++;
    }
    
    return expected.length > 0 ? correct / expected.length : 0;
  }

  /**
   * Évalue l'extraction des middleware
   */
  evaluateMiddlewareExtraction(endpoints, expected) {
    const withMiddleware = expected.filter(e => e.middlewareCount > 0);
    if (withMiddleware.length === 0) return 1; // Pas de test de middleware
    
    let correct = 0;
    for (const exp of withMiddleware) {
      const endpoint = endpoints.find(e => e.path === exp.path && e.method === exp.method);
      if (endpoint && endpoint.middleware && endpoint.middleware.length >= exp.middlewareCount) {
        correct++;
      }
    }
    
    return correct / withMiddleware.length;
  }

  /**
   * Évalue la détection du framework
   */
  evaluateFrameworkDetection(endpoints, expected) {
    const withFramework = expected.filter(e => e.framework);
    if (withFramework.length === 0) return 1;
    
    let correct = 0;
    for (const exp of withFramework) {
      const endpoint = endpoints.find(e => e.path === exp.path);
      if (endpoint && endpoint.framework === exp.framework) {
        correct++;
      }
    }
    
    return correct / withFramework.length;
  }

  /**
   * Évalue la détection de documentation
   */
  evaluateDocsDetection(endpoints) {
    if (!endpoints || endpoints.length === 0) return 0;
    
    const documented = endpoints.filter(e => e.hasExistingDocs).length;
    return documented / endpoints.length;
  }

  /**
   * Évalue le parsing de la documentation
   */
  evaluateDocsParsing(endpoints, expected) {
    const withDocs = expected.filter(e => e.hasDocs);
    if (withDocs.length === 0) return 1;
    
    let correct = 0;
    for (const exp of withDocs) {
      const endpoint = endpoints.find(e => e.path === exp.path);
      if (endpoint && endpoint.hasExistingDocs) {
        if (exp.docs) {
          if (exp.docs.summary && endpoint.swagger.summary === exp.docs.summary) correct++;
          else if (!exp.docs.summary) correct++;
        } else {
          correct++;
        }
      }
    }
    
    return correct / withDocs.length;
  }

  /**
   * Évalue la validité OpenAPI
   */
  evaluateOpenAPIValidity(openapi) {
    if (!openapi) return 0;
    
    // Vérifier la structure de base
    if (!openapi.openapi) return 0;
    if (!openapi.info) return 0;
    if (!openapi.paths) return 0;
    
    return 1;
  }

  /**
   * Évalue la complétude des schemas
   */
  evaluateSchemaCompleteness(openapi) {
    if (!openapi || !openapi.paths) return 0;
    
    let total = 0;
    let complete = 0;
    
    for (const [path, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        total++;
        
        // Vérifier que l'opération a les propriétés requises
        if (operation.summary || operation.description) {
          complete++;
        }
      }
    }
    
    return total > 0 ? complete / total : 0;
  }

  /**
   * Exécute tous les tests de benchmark
   */
  async runAll() {
    console.log('🚀 Starting Benchmark Suite...\n');
    console.log('='.repeat(50));
    
    for (const testCase of testCases.testCases) {
      const result = await this.runTestCase(testCase);
      this.results.push(result);
      
      // Afficher le résumé
      if (result.success) {
        console.log(`  ✅ ${testCase.name}: ${(result.evaluation.overall * 100).toFixed(1)}%`);
      } else {
        console.log(`  ❌ ${testCase.name}: ${result.error}`);
      }
    }
    
    // Générer le rapport
    this.generateReport();
    
    return this.results;
  }

  /**
   * Génère le rapport final
   */
  generateReport() {
    const passing = this.results.filter(r => r.success && r.evaluation.overall >= testCases.thresholds.overallScore).length;
    const total = this.results.filter(r => r.success).length;
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 BENCHMARK RESULTS');
    console.log('='.repeat(50));
    console.log(`Passed: ${passing}/${total}`);
    console.log(`Overall Score: ${(this.getAverageScore() * 100).toFixed(1)}%`);
    
    // Scores par catégorie
    console.log('\n📈 Scores by Category:');
    const categories = ['parsing', 'swagger', 'generation'];
    for (const cat of categories) {
      const avg = this.getAverageCategoryScore(cat);
      console.log(`  ${cat}: ${(avg * 100).toFixed(1)}%`);
    }
    
    return {
      passing,
      total,
      averageScore: this.getAverageScore(),
      results: this.results
    };
  }

  /**
   * Calcule le score moyen
   */
  getAverageScore() {
    const scores = this.results
      .filter(r => r.success)
      .map(r => r.evaluation.overall);
    
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  /**
   * Calcule le score moyen par catégorie
   */
  getAverageCategoryScore(category) {
    const scores = this.results
      .filter(r => r.success && r.evaluation.totals[category])
      .map(r => r.evaluation.totals[category]);
    
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }
}

module.exports = BenchmarkFramework;
