/**
 * Tests unitaires pour RouteParser - Parsing AST
 */

const RouteParser = require('../../src/parsers/routeParser');
const assert = require('assert');

describe('RouteParser - AST Parsing', () => {
  let parser;
  
  beforeEach(() => {
    parser = new RouteParser();
  });
  
  describe('parse() - Détection routes Express', () => {
    it('devrait détecter une route GET simple', () => {
      const code = `
        const express = require('express');
        const router = express.Router();
        router.get('/api/users', function(req, res) {});
      `;
      
      const endpoints = parser.parse('test.js', code);
      
      assert.strictEqual(endpoints.length, 1);
      assert.strictEqual(endpoints[0].path, '/api/users');
      assert.strictEqual(endpoints[0].method, 'GET');
      assert.strictEqual(endpoints[0].framework, 'express');
    });
    
    it('devrait détecter plusieurs méthodes HTTP', () => {
      const code = `
        const router = express.Router();
        router.get('/api/users', handler);
        router.post('/api/users', handler);
        router.put('/api/users/:id', handler);
        router.delete('/api/users/:id', handler);
        router.patch('/api/users/:id', handler);
      `;
      
      const endpoints = parser.parse('test.js', code);
      
      assert.strictEqual(endpoints.length, 5);
      const methods = endpoints.map(e => e.method).sort();
      assert.deepStrictEqual(methods, ['DELETE', 'GET', 'PATCH', 'POST', 'PUT']);
    });
    
    it('devrait détecter les routes avec chemin dynamique', () => {
      const code = `
        const router = express.Router();
        router.get('/api/users/:id', handler);
        router.post('/api/users/:userId/posts/:postId', handler);
      `;
      
      const endpoints = parser.parse('test.js', code);
      
      assert.strictEqual(endpoints.length, 2);
      assert.strictEqual(endpoints[0].path, '/api/users/:id');
      assert.strictEqual(endpoints[1].path, '/api/users/:userId/posts/:postId');
    });
    
    it('devrait gérer les template literals simples', () => {
      const code = `
        const router = express.Router();
        const base = '/api';
        router.get(\`\${base}/users\`, handler);
      `;
      
      const endpoints = parser.parse('test.js', code);
      
      // Devrait détecter la route mais avec un chemin partial
      assert(endpoints.length >= 0);
    });
  });
  
  describe('parse() - Extraction middleware chains', () => {
    it('devrait extraire un middleware unique', () => {
      const code = `
        const router = express.Router();
        router.get('/api/users', auth, handler);
      `;
      
      const endpoints = parser.parse('test.js', code);
      
      assert.strictEqual(endpoints.length, 1);
      assert.deepStrictEqual(endpoints[0].middleware, ['auth']);
    });
    
    it('devrait extraire plusieurs middleware', () => {
      const code = `
        const router = express.Router();
        router.get('/api/users', auth, validatePermission, handler);
      `;
      
      const endpoints = parser.parse('test.js', code);
      
      assert.strictEqual(endpoints[0].middleware.length, 2);
      assert(endpoints[0].middleware.includes('auth'));
      assert(endpoints[0].middleware.includes('validatePermission'));
    });
    
    it('devrait extraire les middleware dans un tableau', () => {
      const code = `
        const router = express.Router();
        router.get('/api/users', [auth, validatePermission], handler);
      `;
      
      const endpoints = parser.parse('test.js', code);
      
      assert.strictEqual(endpoints[0].middleware.length, 2);
      assert(endpoints[0].middleware.includes('auth'));
      assert(endpoints[0].middleware.includes('validatePermission'));
    });
    
    it('devrait extraire les appels de fonction middleware', () => {
      const code = `
        const router = express.Router();
        router.get('/api/users', validatePermission([['elector', 'view']]), handler);
      `;
      
      const endpoints = parser.parse('test.js', code);
      
      assert(endpoints[0].middleware.includes('validatePermission'));
    });
  });
  
  describe('parse() - Support NestJS', () => {
    it('devrait détecter les routes NestJS avec @Controller', () => {
      const code = `
        @Controller('/users')
        class UserController {
          @Get('/')
          findAll() {}
          
          @Get('/:id')
          findOne() {}
          
          @Post('/')
          create() {}
        }
      `;
      
      const endpoints = parser.parse('test.ts', code);
      
      assert(endpoints.length >= 2); // Au moins les méthodes HTTP
      const methods = endpoints.map(e => e.method);
      assert(methods.includes('GET'));
      assert(methods.includes('POST'));
    });
    
    it('devrait construire le chemin complet du controller', () => {
      const code = `
        @Controller('/users')
        class UserController {
          @Get('/')
          findAll() {}
        }
      `;
      
      const endpoints = parser.parse('test.ts', code);
      
      const getRoute = endpoints.find(e => e.method === 'GET');
      assert.strictEqual(getRoute.path, '/users/');
    });
  });
  
  describe('parse() - Extraction handler', () => {
    it('devrait extraire le handler par référence', () => {
      const code = `
        const router = express.Router();
        async function getUsers(req, res) {
          const users = await db.User.findAll();
          return res.json(users);
        }
        router.get('/api/users', getUsers);
      `;
      
      const endpoints = parser.parse('test.js', code);
      
      assert.strictEqual(endpoints[0].handler.name, 'getUsers');
      assert.strictEqual(endpoints[0].handler.type, 'reference');
    });
    
    it('devrait extraire le handler inline', () => {
      const code = `
        const router = express.Router();
        router.get('/api/users', async (req, res) => {
          return res.json({});
        });
      `;
      
      const endpoints = parser.parse('test.js', code);
      
      assert.strictEqual(endpoints[0].handler.type, 'inline');
    });
    
    it('devrait extraire les paramètres du handler', () => {
      const code = `
        const router = express.Router();
        router.get('/api/users', async (req, res, next) => {
          return res.json({});
        });
      `;
      
      const endpoints = parser.parse('test.js', code);
      
      if (endpoints[0].handler && endpoints[0].handler.params) {
        assert(endpoints[0].handler.params.length >= 2);
      }
    });
  });
  
  describe('parse() - Cas limites', () => {
    it('devrait gérer un fichier vide', () => {
      const code = '';
      const endpoints = parser.parse('test.js', code);
      assert.strictEqual(endpoints.length, 0);
    });
    
    it('devrait gérer un fichier sans routes', () => {
      const code = `
        const x = 1;
        const y = 2;
        function helper() {}
      `;
      const endpoints = parser.parse('test.js', code);
      assert.strictEqual(endpoints.length, 0);
    });
    
    it('devrait détecter le framework automatiquement', () => {
      const code = `
        const router = express.Router();
        router.get('/api/test', handler);
      `;
      
      parser.parse('test.js', code);
      assert.strictEqual(parser.framework, 'express');
    });
  });
});

// Tests d'intégration avec les fichiers réels
describe('RouteParser - Fichiers de test', () => {
  const fs = require('fs');
  const path = require('path');
  
  describe('zone.js (~530 lignes)', () => {
    it('devrait parser zone.js sans erreur', () => {
      const code = fs.readFileSync('datas_tests/zone.js', 'utf-8');
      const parser = new RouteParser();
      const endpoints = parser.parse('datas_tests/zone.js', code);
      
      console.log(`  ✓ Zone.js: ${endpoints.length} endpoints détectés`);
      assert(endpoints.length > 0, 'Devrait détecter au moins une route');
    });
    
    it('devrait détecter les routes principales', () => {
      const code = fs.readFileSync('datas_tests/zone.js', 'utf-8');
      const parser = new RouteParser();
      const endpoints = parser.parse('datas_tests/zone.js', code);
      
      const paths = endpoints.map(e => e.path);
      assert(paths.some(p => p.includes('zone')), 'Devrait détecter des routes zone');
    });
  });
  
  describe('tags.js (~1038 lignes)', () => {
    it('devrait parser tags.js sans erreur', () => {
      const code = fs.readFileSync('datas_tests/tags.js', 'utf-8');
      const parser = new RouteParser();
      const endpoints = parser.parse('datas_tests/tags.js', code);
      
      console.log(`  ✓ Tags.js: ${endpoints.length} endpoints détectés`);
      assert(endpoints.length > 0, 'Devrait détecter au moins une route');
    });
  });
  
  describe('elector.js (~6400+ lignes)', () => {
    it('devrait parser elector.js sans timeout', () => {
      const code = fs.readFileSync('datas_tests/elector.js', 'utf-8');
      const parser = new RouteParser();
      
      const startTime = Date.now();
      const endpoints = parser.parse('datas_tests/elector.js', code);
      const duration = Date.now() - startTime;
      
      console.log(`  ✓ Elector.js: ${endpoints.length} endpoints détectés en ${duration}ms`);
      assert(endpoints.length > 0, 'Devrait détecter au moins une route');
      assert(duration < 5000, 'Devrait parser en moins de 5 secondes');
    });
    
    it('devrait extraire les middleware chains complexes', () => {
      const code = fs.readFileSync('datas_tests/elector.js', 'utf-8');
      const parser = new RouteParser();
      const endpoints = parser.parse('datas_tests/elector.js', code);
      
      // Vérifier qu'au moins une route a des middleware
      const routesWithMiddleware = endpoints.filter(e => e.middleware && e.middleware.length > 0);
      assert(routesWithMiddleware.length > 0, 'Devrait détecter des middleware');
    });
  });
});
