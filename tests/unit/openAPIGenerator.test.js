/**
 * Tests unitaires pour OpenAPIGenerator
 */

const OpenAPIGenerator = require('../../src/generators/docGenerator');
const assert = require('assert');

describe('OpenAPIGenerator', () => {
  let generator;
  
  beforeEach(() => {
    generator = new OpenAPIGenerator({
      title: 'Test API',
      version: '1.0.0'
    });
  });
  
  describe('constructor()', () => {
    it('devrait initialiser avec les options par défaut', () => {
      const gen = new OpenAPIGenerator();
      const spec = gen.generate();
      
      assert.strictEqual(spec.openapi, '3.0.3');
      assert.strictEqual(spec.info.title, 'API Documentation');
      assert.strictEqual(spec.info.version, '1.0.0');
    });
    
    it('devrait accepter les options personnalisées', () => {
      const gen = new OpenAPIGenerator({
        title: 'My API',
        version: '2.0.0',
        description: 'My custom API'
      });
      const spec = gen.generate();
      
      assert.strictEqual(spec.info.title, 'My API');
      assert.strictEqual(spec.info.version, '2.0.0');
      assert.strictEqual(spec.info.description, 'My custom API');
    });
  });
  
  describe('addEndpoint()', () => {
    it('devrait générer une spécification OpenAPI valide', () => {
      const endpoint = {
        path: '/api/users',
        method: 'GET',
        swagger: {
          summary: 'Get users',
          tags: ['User'],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer' } }
          ],
          responses: {
            '200': {
              description: 'List of users',
              schema: { type: 'array' }
            }
          }
        }
      };
      
      generator.addEndpoint(endpoint);
      const spec = generator.generate();
      
      assert.strictEqual(spec.openapi, '3.0.3');
      assert(spec.paths['/api/users']);
      assert(spec.paths['/api/users'].get);
      assert.strictEqual(spec.paths['/api/users'].get.summary, 'Get users');
    });
    
    it('devrait générer des $ref valides pour les schemas', () => {
      const endpoint = {
        path: '/api/users',
        method: 'POST',
        swagger: {
          summary: 'Create user',
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' }
              }
            }
          },
          responses: {
            '201': {
              description: 'User created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' }
                }
              }
            }
          }
        }
      };
      
      generator.addEndpoint(endpoint);
      const spec = generator.generate();
      
      assert.strictEqual(
        spec.paths['/api/users'].post.requestBody.content['application/json'].schema.$ref,
        '#/components/schemas/User'
      );
    });
    
    it('devrait convertir :param en {param}', () => {
      const endpoint = {
        path: '/api/users/:id',
        method: 'GET',
        swagger: {}
      };
      
      generator.addEndpoint(endpoint);
      const spec = generator.generate();
      
      assert(spec.paths['/api/users/{id}']);
      assert(spec.paths['/api/users/{id}'].get);
    });
    
    it('devrait générer les responses par défaut', () => {
      const endpoint = {
        path: '/api/test',
        method: 'GET',
        swagger: {}
      };
      
      generator.addEndpoint(endpoint);
      const spec = generator.generate();
      
      const responses = spec.paths['/api/test'].get.responses;
      assert(responses['200']);
      assert(responses['400']);
      assert(responses['401']);
      assert(responses['500']);
    });
    
    it('devrait générer le requestBody pour POST', () => {
      const endpoint = {
        path: '/api/users',
        method: 'POST',
        swagger: {
          summary: 'Create user',
          requestBody: {
            required: true,
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' }
              }
            }
          }
        }
      };
      
      generator.addEndpoint(endpoint);
      const spec = generator.generate();
      
      assert(spec.paths['/api/users'].post.requestBody);
      assert(spec.paths['/api/users'].post.requestBody.required);
    });
    
    it('devrait générer le requestBody pour PUT', () => {
      const endpoint = {
        path: '/api/users/:id',
        method: 'PUT',
        swagger: {}
      };
      
      generator.addEndpoint(endpoint);
      const spec = generator.generate();
      
      assert(spec.paths['/api/users/{id}'].put.requestBody);
    });
    
    it('devrait générer le requestBody pour PATCH', () => {
      const endpoint = {
        path: '/api/users/:id',
        method: 'PATCH',
        swagger: {}
      };
      
      generator.addEndpoint(endpoint);
      const spec = generator.generate();
      
      assert(spec.paths['/api/users/{id}'].patch.requestBody);
    });
    
    it('ne devrait pas générer requestBody pour GET', () => {
      const endpoint = {
        path: '/api/users',
        method: 'GET',
        swagger: {}
      };
      
      generator.addEndpoint(endpoint);
      const spec = generator.generate();
      
      assert(!spec.paths['/api/users'].get.requestBody);
    });
  });
  
  describe('normalizePath()', () => {
    it('devrait convertir :id en {id}', () => {
      assert.strictEqual(generator.normalizePath('/api/users/:id'), '/api/users/{id}');
    });
    
    it('devrait convertir plusieurs paramètres', () => {
      assert.strictEqual(
        generator.normalizePath('/api/users/:userId/posts/:postId'),
        '/api/users/{userId}/posts/{postId}'
      );
    });
    
    it('devrait convertir * en {wildcard}', () => {
      assert.strictEqual(generator.normalizePath('/api/*'), '/api/{wildcard}');
    });
  });
  
  describe('guessTagFromPath()', () => {
    it('devraitdeviner le tag depuis le chemin', () => {
      assert.deepStrictEqual(generator.guessTagFromPath('/api/users'), ['users']);
    });
    
    it('devrait gérer les chemins avec préfixe', () => {
      assert.deepStrictEqual(generator.guessTagFromPath('/api/crm/zone'), ['crm']);
    });
  });
  
  describe('generateOperationId()', () => {
    it('devrait générer un ID unique', () => {
      const endpoint = {
        path: '/api/users/:id',
        method: 'GET'
      };
      
      const id = generator.generateOperationId(endpoint);
      assert.strictEqual(id, 'get_api_users_id');
    });
  });
  
  describe('addSchema()', () => {
    it('devrait ajouter un schema aux composants', () => {
      generator.addSchema('User', {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' }
        }
      });
      
      const spec = generator.generate();
      assert(spec.components.schemas.User);
      assert(spec.components.schemas.User.properties);
    });
  });
  
  describe('toJSON()', () => {
    it('devrait générer du JSON valide', () => {
      const endpoint = {
        path: '/api/test',
        method: 'GET',
        swagger: { summary: 'Test' }
      };
      
      generator.addEndpoint(endpoint);
      const json = generator.toJSON();
      
      const parsed = JSON.parse(json);
      assert.strictEqual(parsed.openapi, '3.0.3');
    });
  });
  
  describe('reset()', () => {
    it('devrait réinitialiser le générateur', () => {
      generator.addEndpoint({
        path: '/api/test',
        method: 'GET',
        swagger: {}
      });
      
      generator.reset();
      const spec = generator.generate();
      
      assert.deepStrictEqual(spec.paths, {});
    });
  });
  
  describe('generateOpenAPI() - compatibilité', () => {
    it('devrait fonctionner avec l\'ancienne API', () => {
      const endpoint = {
        path: '/api/users',
        method: 'GET',
        swagger: {
          summary: 'Get users'
        }
      };
      
      const result = generator.generateOpenAPI(endpoint);
      
      assert(result['/api/users']);
      assert(result['/api/users'].get);
    });
  });
});
