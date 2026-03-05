/**
 * SwaggerParser - Parser de documentation Swagger/JSDoc existante
 * Extrait et analyse les commentaires de documentation dans le code source
 */

class SwaggerParser {
  constructor() {
    this.routeSwaggerDocs = new Map(); // Map<lineNumber, swaggerDoc>
  }

  /**
   * Parse la documentation Swagger d'un fichier
   * @param {string} sourceCode - Code source complet
   * @param {Object} endpoints - Endpoints trouvés par routeParser
   * @returns {Object} Endpoints enrichis avec la documentation
   */
  parseFile(sourceCode, endpoints) {
    if (!sourceCode || !endpoints || endpoints.length === 0) {
      return endpoints;
    }

    // Extraire tous les commentaires JSDoc/Swagger
    const swaggerComments = this.extractSwaggerComments(sourceCode);
    
    // Associer chaque commentaire à un endpoint proche
    return endpoints.map(endpoint => {
      const doc = this.findNearestSwaggerComment(swaggerComments, endpoint.line);
      if (doc) {
        return this.mergeSwaggerIntoEndpoint(endpoint, doc);
      }
      return endpoint;
    });
  }

  /**
   * Extrait tous les commentaires de documentation Swagger/JSDoc
   */
  extractSwaggerComments(sourceCode) {
    const comments = [];
    
    // Regex pour blocs de commentaires /** ... */
    const commentRegex = /\/\*\*([\s\S]*?)\*\//g;
    let match;
    
    while ((match = commentRegex.exec(sourceCode)) !== null) {
      const commentText = match[1];
      const lineNumber = this.getLineNumber(sourceCode, match.index);
      
      // Parser le contenu du commentaire
      const parsed = this.parseCommentBlock(commentText);
      if (parsed) {
        comments.push({
          line: lineNumber,
          raw: commentText,
          ...parsed
        });
      }
    }
    
    return comments;
  }

  /**
   * Parse un bloc de commentaire en structure Swagger
   */
  parseCommentBlock(commentText) {
    // Nettoyer le commentaire
    const lines = commentText
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => line);
    
    // Vérifier si c'est un commentaire Swagger ou JSDoc avec @params
    const hasSwagger = lines.some(line => 
      line.startsWith('@swagger') || 
      line.includes('swagger') ||
      line.startsWith('#swagger') ||
      line.startsWith('@summary') ||
      line.startsWith('@description') ||
      line.startsWith('@param') ||
      line.startsWith('@returns')
    );
    
    if (!hasSwagger && !lines.some(line => line.startsWith('@'))) {
      return null;
    }
    
    // Parser les différentes parties
    const result = {
      summary: '',
      description: '',
      tags: [],
      parameters: [],
      requestBody: null,
      responses: {},
      deprecated: false,
      security: []
    };
    
    let currentSection = 'description';
    let currentParam = null;
    let responseCode = null;
    
    for (let line of lines) {
      // Ignorer les tags swagger de début
      if (line.startsWith('@swagger') || line.startsWith('#swagger')) {
        continue;
      }
      
      // Summary
      if (line.startsWith('@summary') || line.startsWith('summary:')) {
        result.summary = line.replace(/^@\w+\s*/, '').trim();
        currentSection = 'summary';
        continue;
      }
      
      // Description
      if (line.startsWith('@description') || line.startsWith('description:')) {
        result.description = line.replace(/^@\w+\s*/, '').trim();
        currentSection = 'description';
        continue;
      }
      
      // Tags
      if (line.startsWith('@tags') || line.startsWith('tags:')) {
        const tagsStr = line.replace(/^@\w+\s*/, '').trim();
        result.tags = tagsStr.split(',').map(t => t.trim().replace(/^['"]|['"]$/g, ''));
        continue;
      }
      
      // @tag (single tag)
      if (line.startsWith('@tag ')) {
        const tag = line.replace('@tag ', '').trim();
        if (!result.tags.includes(tag)) {
          result.tags.push(tag);
        }
        continue;
      }
      
      // @deprecated
      if (line.startsWith('@deprecated')) {
        result.deprecated = true;
        continue;
      }
      
      // @param (ou @query, @path, @header)
      const paramMatch = line.match(/^@(param|query|path|header|body)\s+(?:\{([^}]+)\})?\s*(\[)?(\w+)?(\])?\s*(.*)/);
      if (paramMatch) {
        // Sauvegarder le paramètre précédent
        if (currentParam) {
          result.parameters.push(currentParam);
        }
        
        const [, paramType, , , , rest] = paramMatch;
        let name = rest ? rest.trim().split(' ')[0] : 'param';
        let description = rest ? rest.trim().substring(name.length).trim() : '';
        
        // Extraire le type du paramètre
        let paramIn = 'query';
        if (paramType === 'path') paramIn = 'path';
        else if (paramType === 'header') paramIn = 'header';
        else if (paramType === 'body') paramIn = 'body';
        
        // Vérifier si requis (pas de [])
        const required = !line.includes('[' + name + ']') && !line.includes('optional');
        
        currentParam = {
          name: name,
          in: paramIn,
          required: required,
          description: description,
          schema: this.inferSchema(paramType, rest)
        };
        continue;
      }
      
      // @return / @returns
      if (line.startsWith('@returns') || line.startsWith('@return')) {
        currentSection = 'returns';
        continue;
      }
      
      // Response codes (200:, 400:, etc.)
      const responseMatch = line.match(/^(\d{3}):?\s*(.*)/);
      if (responseMatch) {
        // Sauvegarder le paramètre précédent
        if (currentParam) {
          result.parameters.push(currentParam);
          currentParam = null;
        }
        
        responseCode = responseMatch[1];
        const desc = responseMatch[2].trim();
        result.responses[responseCode] = {
          description: desc || 'Response',
          schema: null
        };
        continue;
      }
      
      // Description de réponse ou paramètre
      if (responseCode && line.startsWith('-')) {
        result.responses[responseCode].description = line.replace(/^-\s*/, '').trim();
      }
      
      if (currentParam && line.startsWith('-')) {
        currentParam.description = line.replace(/^-\s*/, '').trim();
      }
      
      // Ajouter à la description si pas de section spécifique
      if (currentSection === 'description' && !line.startsWith('@') && !line.match(/^\d{3}/)) {
        result.description += (result.description ? ' ' : '') + line;
      }
    }
    
    // Sauvegarder le dernier paramètre
    if (currentParam) {
      result.parameters.push(currentParam);
    }
    
    // Nettoyer les champs vides
    if (!result.summary) delete result.summary;
    if (!result.description) delete result.description;
    if (result.tags.length === 0) delete result.tags;
    if (result.parameters.length === 0) delete result.parameters;
    if (Object.keys(result.responses).length === 0) delete result.responses;
    
    return result;
  }

  /**
   * Infère le type du schéma depuis le commentaire
   */
  inferSchema(paramType, text) {
    if (!text) return { type: 'string' };
    
    const typeMap = {
      'string': 'string',
      'number': 'number',
      'integer': 'integer',
      'boolean': 'boolean',
      'array': 'array',
      'object': 'object'
    };
    
    const lowerText = text.toLowerCase();
    for (const [key, value] of Object.entries(typeMap)) {
      if (lowerText.includes(key)) {
        return { type: value };
      }
    }
    
    return { type: 'string' };
  }

  /**
   * Trouve le commentaire Swagger le plus proche d'une ligne
   */
  findNearestSwaggerComment(comments, targetLine) {
    if (comments.length === 0) return null;
    
    // Trier par proximité à la ligne cible
    const sorted = [...comments].sort((a, b) => {
      const distA = Math.abs(a.line - targetLine);
      const distB = Math.abs(b.line - targetLine);
      
      // Privilégier les commentaires AVANT la route (plus fiables)
      if (a.line < targetLine && b.line >= targetLine) return -1;
      if (b.line < targetLine && a.line >= targetLine) return 1;
      
      return distA - distB;
    });
    
    // Ne prendre que les commentaires dans les 10 lignes précédentes
    const nearest = sorted[0];
    if (nearest && nearest.line <= targetLine && targetLine - nearest.line <= 10) {
      return nearest;
    }
    
    return null;
  }

  /**
   * Fusionne la documentation Swagger dans l'endpoint
   */
  mergeSwaggerIntoEndpoint(endpoint, swaggerDoc) {
    return {
      ...endpoint,
      existingSwagger: swaggerDoc,
      swagger: {
        summary: swaggerDoc.summary || '',
        description: swaggerDoc.description || '',
        tags: swaggerDoc.tags || endpoint.tags || [],
        parameters: swaggerDoc.parameters || [],
        requestBody: swaggerDoc.requestBody || null,
        responses: swaggerDoc.responses || {},
        deprecated: swaggerDoc.deprecated || false,
        security: swaggerDoc.security || []
      },
      // Marquer comme déjà documenté
      hasExistingDocs: true,
      jsdoc: swaggerDoc.raw || ''
    };
  }

  /**
   * Calcule le numéro de ligne à partir d'un index
   */
  getLineNumber(sourceCode, index) {
    return sourceCode.substring(0, index).split('\n').length;
  }
  
  /**
   * Parse un seul endpoint (pour les tests)
   */
  parseEndpoint(sourceCode, endpoint) {
    const comments = this.extractSwaggerComments(sourceCode);
    const doc = this.findNearestSwaggerComment(comments, endpoint.line);
    if (doc) {
      return this.mergeSwaggerIntoEndpoint(endpoint, doc);
    }
    return endpoint;
  }
}

module.exports = SwaggerParser;
