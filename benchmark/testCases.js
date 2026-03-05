/**
 * Test Cases pour Benchmark
 * Définit les cas de test et les critères d'évaluation
 */

module.exports = {
  /**
   * Cas de test pour évaluer la qualité du parsing et génération
   */
  testCases: [
    {
      id: 'simple-express',
      name: 'Express Routes Simples',
      description: 'Test basique de routes Express',
      code: `
const express = require('express');
const router = express.Router();

router.get('/api/users', handler);
router.post('/api/users', handler);
router.get('/api/users/:id', handler);
router.put('/api/users/:id', handler);
router.delete('/api/users/:id', handler);
      `,
      expectedEndpoints: [
        { path: '/api/users', method: 'GET' },
        { path: '/api/users', method: 'POST' },
        { path: '/api/users/:id', method: 'GET' },
        { path: '/api/users/:id', method: 'PUT' },
        { path: '/api/users/:id', method: 'DELETE' }
      ]
    },
    {
      id: 'middleware-chains',
      name: 'Middleware Chains',
      description: 'Test des chaînes de middleware',
      code: `
const router = express.Router();

router.get('/api/users', auth, handler);
router.post('/api/admin', [auth, validatePermission], handler);
router.get('/api/sensitive', validatePermission([['admin', 'view']]), handler);
      `,
      expectedEndpoints: [
        { path: '/api/users', method: 'GET', middlewareCount: 1 },
        { path: '/api/admin', method: 'POST', middlewareCount: 2 }
      ]
    },
    {
      id: 'nestjs-decorators',
      name: 'NestJS Decorators',
      description: 'Test des décorateurs NestJS',
      code: `
@Controller('/users')
class UserController {
  @Get('/')
  findAll() {}
  
  @Get('/:id')
  findOne() {}
  
  @Post('/')
  create() {}
}
      `,
      expectedEndpoints: [
        { path: '/users/', method: 'GET', framework: 'nestjs' },
        { path: '/users/:id', method: 'GET', framework: 'nestjs' },
        { path: '/users/', method: 'POST', framework: 'nestjs' }
      ]
    },
    {
      id: 'jsdoc-documentation',
      name: 'JSDoc Documentation',
      description: 'Test de parsing de documentation JSDoc',
      code: `
const router = express.Router();

/**
 * @summary Get all users
 * @description Returns a list of all users in the system
 * @tags User
 * @param {number} limit - Maximum number of results
 */
router.get('/api/users', handler);
      `,
      expectedEndpoints: [
        { 
          path: '/api/users', 
          method: 'GET', 
          hasDocs: true,
          docs: {
            summary: 'Get all users',
            description: 'Returns a list of all users in the system',
            tags: ['User']
          }
        }
      ]
    },
    {
      id: 'openapi-generation',
      name: 'OpenAPI Generation',
      description: 'Test de génération OpenAPI',
      code: `
const router = express.Router();
router.get('/api/users/:id', handler);
      `,
      expectedOpenAPI: {
        paths: {
          '/api/users/{id}': {
            get: {
              parameters: [
                { name: 'id', in: 'path', required: true }
              ]
            }
          }
        }
      }
    }
  ],

  /**
   * Critères d'évaluation pour les benchmarks
   */
  evaluationCriteria: {
    parsing: {
      routeDetection: {
        weight: 2,
        description: 'Capacité à détecter correctement les routes'
      },
      pathExtraction: {
        weight: 1.5,
        description: 'Extraction précise des chemins de routes'
      },
      methodIdentification: {
        weight: 1.5,
        description: 'Identification correcte des méthodes HTTP'
      },
      middlewareExtraction: {
        weight: 1,
        description: 'Extraction des middleware chains'
      },
      frameworkDetection: {
        weight: 1,
        description: 'Détection automatique du framework'
      }
    },
    swagger: {
      existingDocsDetection: {
        weight: 2,
        description: 'Détection de la documentation existante'
      },
      docsParsing: {
        weight: 1.5,
        description: 'Parsing correct des paramètres et responses'
      }
    },
    generation: {
      openapiValidity: {
        weight: 2,
        description: 'Validité de la spécification OpenAPI générée'
      },
      schemaCompleteness: {
        weight: 1,
        description: 'Complétude des schemas générés'
      },
      documentationQuality: {
        weight: 1,
        description: 'Qualité des descriptions générées'
      }
    },
    enrichment: {
      parameterInference: {
        weight: 1.5,
        description: 'Inférence des paramètres depuis le code'
      },
      responseInference: {
        weight: 1.5,
        description: 'Inférence des responses depuis le code'
      }
    }
  },

  /**
   * Modèles Ollama à tester
   */
  models: [
    'llama3.1:8b',
    'llama3.1:70b',
    'mistral:7b',
    'mixtral:8x7b',
    'codellama:7b',
    'codellama:13b',
    'codellama:34b',
    'deepseek-coder:6.7b',
    'deepseek-coder:33b',
    'qwen2.5-coder:7b',
    'qwen2.5-coder:14b'
  ],

  /**
   * Seuil de succès pour les tests
   */
  thresholds: {
    parsingScore: 0.8,
    swaggerScore: 0.7,
    generationScore: 0.75,
    overallScore: 0.75
  }
};
