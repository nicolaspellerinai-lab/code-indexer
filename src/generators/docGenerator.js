/**
 * DocGenerator - Générateur de documentation OpenAPI complet
 * Génère une spécification OpenAPI 3.0.3 valide à partir des endpoints
 */

class OpenAPIGenerator {
  constructor(options = {}) {
    this.options = {
      title: options.title || 'API Documentation',
      version: options.version || '1.0.0',
      description: options.description || '',
      baseUrl: options.baseUrl || '/api',
      ...options
    };
    
    this.openapi = this.initOpenAPI();
  }

  /**
   * Initialise la structure OpenAPI
   */
  initOpenAPI() {
    return {
      openapi: '3.0.3',
      info: {
        title: this.options.title,
        version: this.options.version,
        description: this.options.description
      },
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization'
          }
        }
      },
      security: [{ bearerAuth: [] }],
      tags: []
    };
  }

  /**
   * Réinitialise le générateur
   */
  reset() {
    this.openapi = this.initOpenAPI();
    return this;
  }

  /**
   * Ajoute un endpoint à la spécification
   */
  addEndpoint(endpoint) {
    const path = this.normalizePath(endpoint.path);
    const method = (endpoint.method || 'GET').toLowerCase();
    
    if (!this.openapi.paths[path]) {
      this.openapi.paths[path] = {};
    }
    
    // Créer l'opération OpenAPI
    const operation = this.buildOperation(endpoint);
    
    // Ajouter les tags si nouveaux
    if (operation.tags) {
      operation.tags.forEach(tag => {
        if (!this.openapi.tags.find(t => t.name === tag)) {
          this.openapi.tags.push({ name: tag, description: `${tag} endpoints` });
        }
      });
    }
    
    this.openapi.paths[path][method] = operation;
    
    return this;
  }

  /**
   * Construit une opération OpenAPI complète
   */
  buildOperation(endpoint) {
    const swagger = endpoint.swagger || {};
    
    const operation = {
      tags: swagger.tags || this.guessTagFromPath(endpoint.path),
      summary: swagger.summary || endpoint.handler?.name || '',
      description: swagger.description || '',
      operationId: this.generateOperationId(endpoint),
      deprecated: swagger.deprecated || false,
      parameters: this.buildParameters(swagger.parameters || endpoint.parameters),
      responses: this.buildResponses(swagger.responses),
      security: swagger.security || [{ bearerAuth: [] }]
    };
    
    // Request body pour POST/PUT/PATCH
    if (['post', 'put', 'patch'].includes(endpoint.method?.toLowerCase())) {
      const requestBody = this.buildRequestBody(swagger.requestBody);
      if (requestBody) {
        operation.requestBody = requestBody;
      }
    }
    
    // Retirer les propriétés vides
    Object.keys(operation).forEach(key => {
      if (operation[key] === '' || operation[key] === null || 
          (Array.isArray(operation[key]) && operation[key].length === 0)) {
        delete operation[key];
      }
    });
    
    return operation;
  }

  /**
   * Construit les paramètres
   */
  buildParameters(params) {
    if (!params || params.length === 0) return [];
    
    return params.map(param => ({
      name: param.name,
      in: param.in || 'query',
      description: param.description || '',
      required: param.required || false,
      schema: param.schema || { type: param.type || 'string' },
      example: param.example
    }));
  }

  /**
   * Construit le requestBody
   */
  buildRequestBody(requestBody) {
    if (!requestBody) {
      return {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {}
            }
          }
        }
      };
    }
    
    return {
      required: requestBody.required !== false,
      content: {
        'application/json': {
          schema: requestBody.schema || {
            type: 'object',
            properties: {}
          },
          example: requestBody.example
        }
      }
    };
  }

  /**
   * Construit les responses
   */
  buildResponses(responses) {
    const result = {};
    
    // Ajouter les responses définies
    if (responses) {
      for (const [code, response] of Object.entries(responses)) {
        result[code] = {
          description: response.description || 'Response',
          content: response.content || {}
        };
        
        // Ajouter le schema pour application/json
        if (response.schema) {
          result[code].content = {
            'application/json': {
              schema: response.schema
            }
          };
        }
        
        // Ajouter les exemples
        if (response.example) {
          if (!result[code].content) {
            result[code].content = {};
          }
          result[code].content['application/json'] = {
            example: response.example
          };
        }
      }
    }
    
    // Ajouter les responses par défaut si manquantes
    if (!result['200']) {
      result['200'] = {
        description: 'Successful response'
      };
    }
    if (!result['400']) {
      result['400'] = {
        description: 'Bad request'
      };
    }
    if (!result['401']) {
      result['401'] = {
        description: 'Unauthorized'
      };
    }
    if (!result['500']) {
      result['500'] = {
        description: 'Internal server error'
      };
    }
    
    return result;
  }

  /**
   * Ajoute un schema de composant
   */
  addSchema(name, schema) {
    this.openapi.components.schemas[name] = schema;
    return this;
  }

  /**
   * Génère un ID d'opération unique
   */
  generateOperationId(endpoint) {
    const pathParts = endpoint.path.split('/').filter(p => p);
    const name = pathParts.join('_') || 'root';
    const method = (endpoint.method || 'get').toLowerCase();
    return `${method}_${name}`;
  }

  /**
   * Devine le tag depuis le chemin
   */
  guessTagFromPath(path) {
    const parts = path.split('/').filter(p => p);
    // Utiliser la première partie significative comme tag
    const tag = parts[0]?.replace(/[^a-zA-Z]/g, '') || 'default';
    return [tag];
  }

  /**
   * Normalise le chemin (convertit :param en {param})
   */
  normalizePath(path) {
    if (!path) return '/';
    return path
      .replace(/:(\w+)/g, '{$1}')  // Convertir :param en {param}
      .replace(/\*/g, '{wildcard}'); // Convertir * en {wildcard}
  }

  /**
   * Génère la spécification finale
   */
  generate() {
    return this.openapi;
  }

  /**
   * Exporte en JSON
   */
  toJSON() {
    return JSON.stringify(this.generate(), null, 2);
  }

  /**
   * Méthode de compatibilité avec l'ancien DocGenerator
   */
  generateOpenAPI(endpoint) {
    const path = this.normalizePath(endpoint.path);
    const method = (endpoint.method || 'GET').toLowerCase();
    
    return {
      [path]: {
        [method]: this.buildOperation(endpoint)
      }
    };
  }
}

// Alias pour compatibilité
class DocGenerator extends OpenAPIGenerator {
  constructor(options) {
    super(options);
  }
}

module.exports = OpenAPIGenerator;
module.exports.DocGenerator = DocGenerator;
