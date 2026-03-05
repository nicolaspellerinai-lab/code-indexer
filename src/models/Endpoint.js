/**
 * Modèle Endpoint pour Code Indexer
 * Représente un endpoint d'API détecté dans le code source
 */

class Endpoint {
  constructor(data = {}) {
    // Identifiants de base
    this.id = data.id || this.generateId(data);
    this.method = data.method || 'GET';
    this.path = data.path || '/';
    
    // Localisation
    this.file = data.file || '';
    this.line = data.line || 0;
    this.framework = data.framework || 'express';
    
    // Middleware (nouveau - pour parsing AST)
    this.middleware = data.middleware || [];
    this.middlewareLines = data.middlewareLines || [];
    
    // Handler
    this.handler = data.handler || { type: 'unknown', name: 'anonymous' };
    
    // Documentation existante (pour enrichment)
    this.existingSwagger = data.existingSwagger || null;
    this.jsdoc = data.jsdoc || null;
    this.docBlock = data.docBlock || '';
    
    // Données Swagger (nouveau - structure complète)
    this.swagger = data.swagger || {
      summary: '',
      description: '',
      tags: [],
      parameters: [],
      requestBody: null,
      responses: {},
      deprecated: false,
      security: []
    };
    
    // Métadonnées originales
    this.parameters = data.parameters || [];
    this.imports = data.imports || [];
    this.dependencies = data.dependencies || null;
    this.swaggerDoc = data.swaggerDoc || null;
    this.tags = data.tags || [];
    
    // Statut
    this.confidence = data.confidence || 'inferred'; // 'certain', 'inferred', 'unknown'
    this.hasExistingDocs = data.hasExistingDocs || false;
    this.enriched = data.enriched || false;
    
    // Timestamps
    this.lastUpdated = data.lastUpdated || new Date().toISOString();
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  generateId(data) {
    const method = (data.method || 'GET').toUpperCase();
    const path = (data.path || '/').replace(/\//g, '_').replace(/[:{}]/g, '');
    return `${method}_${path}`;
  }

  /**
   * Crée un endpoint à partir de données parser AST
   * @param {Object} parsedData - Données extraites par le parser
   * @returns {Endpoint} Endpoint structuré
   */
  static fromParsedData(parsedData) {
    return new Endpoint({
      id: `${parsedData.method}-${parsedData.path}`.replace(/[^a-zA-Z0-9]/g, '-'),
      path: parsedData.path,
      method: parsedData.method.toUpperCase(),
      file: parsedData.file || '',
      line: parsedData.line || 0,
      framework: parsedData.framework || 'express',
      middleware: parsedData.middleware || [],
      middlewareLines: parsedData.middlewareLines || [],
      handler: parsedData.handler || null,
      existingSwagger: parsedData.existingSwagger || null,
      jsdoc: parsedData.jsdoc || null,
      swagger: parsedData.swagger || {
        summary: '',
        description: '',
        tags: [],
        parameters: [],
        requestBody: null,
        responses: {},
        deprecated: false,
        security: []
      },
      hasExistingDocs: !!parsedData.existingSwagger,
      dependencies: [],
      enriched: false,
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Marque l'endpoint comme enrichi
   */
  markEnriched(swaggerData = {}) {
    this.enriched = true;
    this.swagger = {
      ...this.swagger,
      ...swaggerData
    };
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Fusionne la documentation Swagger existante
   */
  mergeSwagger(swaggerDoc) {
    this.existingSwagger = swaggerDoc;
    this.hasExistingDocs = true;
    this.swagger = {
      summary: swaggerDoc.summary || '',
      description: swaggerDoc.description || '',
      tags: swaggerDoc.tags || [],
      parameters: swaggerDoc.parameters || [],
      requestBody: swaggerDoc.requestBody || null,
      responses: swaggerDoc.responses || {},
      deprecated: swaggerDoc.deprecated || false,
      security: swaggerDoc.security || []
    };
  }

  toEmbeddingText() {
    const parts = [
      `${this.method} ${this.path}`,
      this.handler?.name ? `Handler: ${this.handler.name}` : '',
      this.swagger.summary ? `Summary: ${this.swagger.summary}` : '',
      this.swagger.description ? `Description: ${this.swagger.description}` : '',
      this.docBlock ? `Description: ${this.docBlock.substring(0, 500)}` : '',
      this.parameters.length ? `Parameters: ${JSON.stringify(this.parameters)}` : '',
      this.dependencies?.database?.length ? `Tables: ${this.dependencies.database.join(', ')}` : '',
      this.dependencies?.services?.length ? `Services: ${this.dependencies.services.join(', ')}` : '',
      this.middleware.length ? `Middleware: ${this.middleware.join(', ')}` : '',
      this.framework ? `Framework: ${this.framework}` : '',
    ];
    return parts.filter(Boolean).join('\n');
  }

  toSummary() {
    return {
      method: this.method,
      path: this.path,
      file: this.file,
      line: this.line,
      framework: this.framework,
      handler: this.handler?.name || 'anonymous',
      middlewareCount: this.middleware.length,
      params: this.parameters.length,
      hasDocs: this.hasExistingDocs,
      enriched: this.enriched,
      confidence: this.confidence,
    };
  }

  toJSON() {
    return {
      id: this.id,
      method: this.method,
      path: this.path,
      file: this.file,
      line: this.line,
      framework: this.framework,
      middleware: this.middleware,
      middlewareLines: this.middlewareLines,
      handler: this.handler,
      existingSwagger: this.existingSwagger,
      jsdoc: this.jsdoc,
      docBlock: this.docBlock,
      swagger: this.swagger,
      parameters: this.parameters,
      imports: this.imports,
      dependencies: this.dependencies,
      swaggerDoc: this.swaggerDoc,
      tags: this.tags,
      hasExistingDocs: this.hasExistingDocs,
      enriched: this.enriched,
      confidence: this.confidence,
      lastUpdated: this.lastUpdated,
      createdAt: this.createdAt,
    };
  }

  toOpenAPIPath() {
    // Convertit les paramètres de chemin :param en {param}
    return this.path.replace(/:(\w+)/g, '{$1}').replace(/\*/g, '{wildcard}');
  }

  toOpenAPIOperation() {
    const operation = {
      tags: this.swagger.tags || this.guessTagFromPath(),
      summary: this.swagger.summary || this.handler?.name || '',
      description: this.swagger.description || '',
      operationId: this.generateOperationId(),
      deprecated: this.swagger.deprecated || false,
      parameters: this.buildParameters(),
      responses: this.buildResponses(),
      security: this.swagger.security || [{ bearerAuth: [] }]
    };

    // Request body pour POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(this.method) && this.swagger.requestBody) {
      operation.requestBody = this.buildRequestBody();
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

  guessTagFromPath() {
    const parts = this.path.split('/').filter(p => p);
    // Utiliser la première partie significative comme tag
    const tag = parts[0]?.replace(/[^a-zA-Z]/g, '') || 'default';
    return [tag];
  }

  generateOperationId() {
    const pathParts = this.path.split('/').filter(p => p);
    const name = pathParts.join('_') || 'root';
    return `${this.method.toLowerCase()}_${name}`;
  }

  buildParameters() {
    if (!this.swagger.parameters || this.swagger.parameters.length === 0) {
      return [];
    }
    
    return this.swagger.parameters.map(param => ({
      name: param.name,
      in: param.in || 'query',
      description: param.description || '',
      required: param.required || false,
      schema: param.schema || { type: 'string' },
      example: param.example
    }));
  }

  buildRequestBody() {
    return {
      required: this.swagger.requestBody?.required || true,
      content: {
        'application/json': {
          schema: this.swagger.requestBody?.schema || {
            type: 'object',
            properties: {}
          },
          example: this.swagger.requestBody?.example
        }
      }
    };
  }

  buildResponses() {
    const result = {};
    
    // Ajouter les responses définies
    if (this.swagger.responses) {
      for (const [code, response] of Object.entries(this.swagger.responses)) {
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
      }
    }
    
    // Ajouter les responses par défaut si manquantes
    if (!result['200']) {
      result['200'] = { description: 'Successful response' };
    }
    if (!result['400']) {
      result['400'] = { description: 'Bad request' };
    }
    if (!result['401']) {
      result['401'] = { description: 'Unauthorized' };
    }
    if (!result['500']) {
      result['500'] = { description: 'Internal server error' };
    }
    
    return result;
  }

  static fromJSON(json) {
    return new Endpoint(json);
  }
}

module.exports = Endpoint;
