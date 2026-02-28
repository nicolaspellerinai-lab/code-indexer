class DocGenerator {
  generateOpenAPI(endpoint) {
    if (!endpoint.path || !endpoint.method) return {};

    const method = endpoint.method.toLowerCase();
    const path = endpoint.path.replace(/[:]/g, '{').replace(/\(\w+\)/g, '}'); // Clean path format
    const llm = endpoint.llmEnrichment || {};

    // Utilise les données LLM si dispos, sinon fallback statique
    const summary = llm.summary || this.generateSummary(endpoint);
    const description = (llm.summary ? `${llm.summary}\n\n` : '') + (endpoint.docBlock || `Endpoint ${endpoint.method} ${endpoint.path}`);
    
    // Fusionne les paramètres statiques et LLM
    const parameters = this.mergeParameters(endpoint.parameters, llm.inputSchema?.query);
    const requestBody = this.buildRequestBody(llm.inputSchema?.body);
    const responses = llm.outputSchema || this.buildDefaultResponses();

    // Ajoute les exemples si présents
    if (llm.examples && Array.isArray(llm.examples)) {
       description += '\n\n### Examples\n' + llm.examples.map(ex => '```json\n' + JSON.stringify(ex, null, 2) + '\n```').join('\n');
    } else if (llm.examples) {
       description += '\n\n### Examples\n' + llm.examples;
    }

    return {
      [path]: {
        [method]: {
          summary,
          description,
          parameters,
          requestBody,
          responses,
        }
      }
    };
  }

  generateSummary(endpoint) {
    const handlerName = endpoint.handler?.name;
    if (handlerName && handlerName !== 'anonymous') {
      return handlerName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
    }
    return `${endpoint.method} ${endpoint.path}`;
  }

  mergeParameters(staticParams, llmQueryParams) {
    const params = [];
    
    // Ajoute les params statiques (path/query)
    staticParams.forEach(p => {
      if (p.in === 'path' || p.in === 'query') {
        params.push({
          name: p.name,
          in: p.in,
          required: p.required || false,
          schema: { type: 'string' }
        });
      }
    });

    // Complète avec LLM query params si absents
    if (llmQueryParams && llmQueryParams.properties) {
      Object.entries(llmQueryParams.properties).forEach(([name, schema]) => {
        if (!params.find(p => p.name === name && p.in === 'query')) {
          params.push({
            name,
            in: 'query',
            required: schema.required || false,
            schema: { type: schema.type || 'string' },
            description: schema.description
          });
        }
      });
    }

    return params;
  }

  buildRequestBody(llmBodySchema) {
    if (!llmBodySchema || !llmBodySchema.properties || Object.keys(llmBodySchema.properties).length === 0) {
      return undefined;
    }

    return {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: llmBodySchema.properties,
            required: llmBodySchema.required || []
          }
        }
      }
    };
  }

  buildDefaultResponses() {
    return {
      '200': {
        description: 'Success',
        content: { 'application/json': { schema: { type: 'object' } } }
      },
      '400': { description: 'Bad Request' },
      '401': { description: 'Unauthorized' },
    };
  }
}

module.exports = DocGenerator;
