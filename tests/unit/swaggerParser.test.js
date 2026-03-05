/**
 * Tests unitaires pour SwaggerParser
 */

const SwaggerParser = require('../../src/parsers/swaggerParser');
const assert = require('assert');

describe('SwaggerParser', () => {
  let parser;
  
  beforeEach(() => {
    parser = new SwaggerParser();
  });
  
  describe('extractSwaggerComments()', () => {
    it('devrait extraire un commentaire JSDoc simple', () => {
      const code = `
/**
 * Summary line
 * Description line
 */
function test() {}
      `;
      
      const comments = parser.extractSwaggerComments(code);
      assert(comments.length >= 1);
    });
    
    it('devrait extraire plusieurs commentaires', () => {
      const code = `
/**
 * @summary First function
 */
function first() {}

/**
 * @summary Second function
 */
function second() {}
      `;
      
      const comments = parser.extractSwaggerComments(code);
      assert.strictEqual(comments.length, 2);
    });
  });
  
  describe('parseCommentBlock()', () => {
    it('devrait parser @summary', () => {
      const comment = `
 * @summary Get all users
 * @description Returns a list of users
      `;
      
      const result = parser.parseCommentBlock(comment);
      assert.strictEqual(result.summary, 'Get all users');
      assert.strictEqual(result.description, 'Returns a list of users');
    });
    
    it('devrait parser les tags', () => {
      const comment = `
 * @tags User, Admin
      `;
      
      const result = parser.parseCommentBlock(comment);
      assert.deepStrictEqual(result.tags, ['User', 'Admin']);
    });
    
    it('devrait parser @param', () => {
      const comment = `
 * @param {number} id - User ID
 * @param {string} name - User name
      `;
      
      const result = parser.parseCommentBlock(comment);
      assert.strictEqual(result.parameters.length, 2);
      assert.strictEqual(result.parameters[0].name, 'id');
      assert.strictEqual(result.parameters[0].schema.type, 'number');
    });
    
    it('devrait parser @param avec type dans accolades', () => {
      const comment = `
 * @param {string} query - Search query
      `;
      
      const result = parser.parseCommentBlock(comment);
      assert.strictEqual(result.parameters[0].name, 'query');
      assert.strictEqual(result.parameters[0].schema.type, 'string');
    });
    
    it('devrait parser les responses', () => {
      const comment = `
 * 200: Success
 * 400: Bad request
 * 500: Server error
      `;
      
      const result = parser.parseCommentBlock(comment);
      assert(result.responses['200']);
      assert(result.responses['400']);
      assert(result.responses['500']);
    });
    
    it('devrait détecter @deprecated', () => {
      const comment = `
 * @summary Old endpoint
 * @deprecated Use /new endpoint instead
      `;
      
      const result = parser.parseCommentBlock(comment);
      assert.strictEqual(result.deprecated, true);
    });
  });
  
  describe('findNearestSwaggerComment()', () => {
    it('devrait trouver le commentaire le plus proche', () => {
      const comments = [
        { line: 5, summary: 'First' },
        { line: 10, summary: 'Second' },
        { line: 15, summary: 'Third' }
      ];
      
      const result = parser.findNearestSwaggerComment(comments, 12);
      assert.strictEqual(result.summary, 'Second');
    });
    
    it('devrait privilégier les commentaires avant la ligne', () => {
      const comments = [
        { line: 5, summary: 'Before' },
        { line: 20, summary: 'After' }
      ];
      
      const result = parser.findNearestSwaggerComment(comments, 15);
      assert.strictEqual(result.summary, 'Before');
    });
  });
  
  describe('mergeSwaggerIntoEndpoint()', () => {
    it('devrait fusionner la doc dans l\'endpoint', () => {
      const endpoint = {
        path: '/api/users',
        method: 'GET',
        line: 10
      };
      
      const swaggerDoc = {
        summary: 'Get users',
        description: 'Returns all users',
        tags: ['User'],
        parameters: [{ name: 'limit', in: 'query' }],
        responses: { '200': { description: 'Success' } }
      };
      
      const result = parser.mergeSwaggerIntoEndpoint(endpoint, swaggerDoc);
      
      assert.strictEqual(result.hasExistingDocs, true);
      assert.strictEqual(result.swagger.summary, 'Get users');
      assert.strictEqual(result.swagger.tags[0], 'User');
    });
  });
  
  describe('parseFile()', () => {
    it('devrait enrichir les endpoints avec leur documentation', () => {
      const code = `
const router = express.Router();

/**
 * @summary Get all users
 * @description Returns users
 * @tags User
 */
router.get('/api/users', handler);

/**
 * @summary Create user
 */
router.post('/api/users', handler);
      `;
      
      const endpoints = [
        { path: '/api/users', method: 'GET', line: 8 },
        { path: '/api/users', method: 'POST', line: 14 }
      ];
      
      const result = parser.parseFile(code, endpoints);
      
      assert.strictEqual(result[0].hasExistingDocs, true);
      assert.strictEqual(result[0].swagger.summary, 'Get all users');
      assert.strictEqual(result[1].hasExistingDocs, true);
    });
    
    it('devrait gérer les endpoints sans documentation', () => {
      const code = `
router.get('/api/test', handler);
      `;
      
      const endpoints = [{ path: '/api/test', method: 'GET', line: 2 }];
      const result = parser.parseFile(code, endpoints);
      
      assert.strictEqual(result[0].hasExistingDocs, false);
    });
  });
});
