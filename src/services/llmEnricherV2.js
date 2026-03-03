const http = require('http');
const fs = require('fs').promises;

class LlmEnricherV2 {
  constructor(options = {}) {
    this.model = options.model || 'deepseek-v2:16b'; // 64k context, rapide
    this.host = options.host || 'localhost';
    this.port = options.port || 11434;
    this.timeout = options.timeout || 120000; // 2 minutes timeout
    this.mockMode = options.mockMode || false;
    this.strategy = options.strategy || 'single'; // 'single' ou 'multi'
  }

  async checkConnection() {
    return new Promise((resolve) => {
      const options = {
        hostname: this.host,
        port: this.port,
        path: '/api/tags',
        method: 'GET',
        timeout: 5000,
      };
      const req = http.request(options, (res) => resolve(res.statusCode === 200));
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  async enrichEndpointsBatch(endpoints) {
    if (this.mockMode) {
      return endpoints.map(e => ({ ...e, llmEnrichment: this.getMockEnrichment(e) }));
    }

    console.log(`  🔄 Enriching ${endpoints.length} endpoints using strategy: ${this.strategy}`);
    
    const results = [];
    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      process.stdout.write(`  📝 ${i + 1}/${endpoints.length}: ${endpoint.method} ${endpoint.fullPath}... `);
      
      try {
        const enriched = await this.enrichEndpoint(endpoint);
        results.push(enriched);
        console.log('✅');
      } catch (e) {
        console.log(`❌: ${e.message}`);
        results.push({ ...endpoint, llmEnrichment: this.getFallbackEnrichment(endpoint) });
      }
    }
    
    return results;
  }

  async enrichEndpoint(endpoint) {
    const code = await this.getCode(endpoint.file);
    const jsdoc = this.extractJSDoc(endpoint.docBlock);
    const parsed = this.parseCode(code, endpoint);
    
    if (this.strategy === 'multi') {
      return await this.enrichMultiPass(endpoint, code, jsdoc, parsed);
    } else {
      return await this.enrichSinglePass(endpoint, code, jsdoc, parsed);
    }
  }

  // ============ SINGLE PASS STRATEGY ============
  async enrichSinglePass(endpoint, code, jsdoc, parsed) {
    // Parse ONLY the handler code for this specific route FIRST
    // This ensures we have accurate params even if LLM fails
    const routePath = endpoint.path;
    const handlerCode = this.getHandlerCodePreview(code, routePath, 800, endpoint.method);
    const handlerParsed = this.parseCode(handlerCode, endpoint);
    
    const prompt = this.buildSinglePassPrompt(endpoint, code, jsdoc, parsed);
    
    let llmResult = null;
    try {
      const response = await this.callOllama(prompt, 1500);
      llmResult = this.parseJsonResponse(response);
    } catch (e) {
      console.warn('  ⚠️ LLM call failed:', e.message);
    }

    if (!llmResult) {
      // Use handler-specific parsed data for fallback, not full-file parsed
      return { ...endpoint, llmEnrichment: this.getFallbackEnrichment(endpoint, handlerParsed) };
    }
    
    return {
      ...endpoint,
      llmEnrichment: {
        summary: llmResult.summary || this.generateStaticSummary(endpoint),
        description: llmResult.description || jsdoc.description || '',
        operationId: llmResult.operationId || this.generateOperationId(endpoint),
        tags: llmResult.tags || this.inferTags(endpoint),
        deprecated: llmResult.deprecated || false,
        // For security: use LLM result only for login/register routes, otherwise use parsed
        security: this.shouldUseLLMSecurity(endpoint, llmResult) ? llmResult.security : [{ bearerAuth: [] }],
        // Use parsed data for params - never trust LLM for these
        inputSchema: this.buildInputSchemaFromParsed(handlerParsed, endpoint.method),
        // For outputSchema: use LLM only if it has real data, otherwise use parsed
        outputSchema: this.buildOutputSchemaFromParsed(handlerParsed, llmResult.outputSchema),
        responses: llmResult.responses || this.buildDefaultResponses(endpoint, handlerParsed),
        examples: llmResult.examples || this.generateExamples(endpoint, handlerParsed)
      }
    };
  }

  // ============ HELPERS: Trust parsed data, not LLM ============
  shouldUseLLMSecurity(endpoint, llmResult) {
    const path = endpoint.fullPath || endpoint.path;
    // Use LLM security only for auth routes (login/register)
    if (path.includes('/auth/login') || path.includes('/auth/register') || path.includes('/login') || path.includes('/register')) {
      return true;
    }
    return false;
  }

  buildInputSchemaFromParsed(parsed, method) {
    const httpMethod = (method || 'GET').toUpperCase();
    const isGet = httpMethod === 'GET';
    
    const schema = {
      path: {},
      query: {},
      body: null
    };

    // Path params
    for (const p of parsed.pathParams) {
      schema.path[p] = { type: 'string', required: true };
    }

    // Query params - ONLY use what was parsed from code
    for (const p of parsed.queryParams) {
      schema.query[p] = { type: 'string', required: false };
    }

    // Body fields - ONLY use what was parsed from code
    if (!isGet && parsed.bodyFields && parsed.bodyFields.length > 0) {
      schema.body = {
        type: 'object',
        properties: {},
        required: []
      };
      for (const field of parsed.bodyFields) {
        schema.body.properties[field] = { type: 'string' };
      }
    }

    return schema;
  }

  buildOutputSchemaFromParsed(parsed, llmOutputSchema) {
    // Use LLM outputSchema only if it has actual properties
    if (llmOutputSchema && llmOutputSchema.properties && Object.keys(llmOutputSchema.properties).length > 0) {
      return llmOutputSchema;
    }
    
    // Otherwise use parsed output fields
    if (parsed.outputFields && parsed.outputFields.length > 0) {
      const properties = {};
      for (const field of parsed.outputFields) {
        properties[field] = { type: 'string' };
      }
      return { type: 'object', properties };
    }
    
    return { type: 'object', properties: {} };
  }

  // ============ MULTI PASS STRATEGY ============
  async enrichMultiPass(endpoint, code, jsdoc, parsed) {
    // Pass 1: Summary + Description + OperationId
    const pass1Prompt = this.buildPass1Prompt(endpoint, code, jsdoc);
    let pass1Result = null;
    try {
      const response = await this.callOllama(pass1Prompt, 400);
      pass1Result = this.parseJsonResponse(response);
    } catch (e) {
      console.warn('  ⚠️ Pass 1 failed');
    }

    // Pass 2: Schemas (input/output)
    const pass2Prompt = this.buildPass2Prompt(endpoint, code, parsed);
    let pass2Result = null;
    try {
      const response = await this.callOllama(pass2Prompt, 600);
      pass2Result = this.parseJsonResponse(response);
    } catch (e) {
      console.warn('  ⚠️ Pass 2 failed');
    }

    // Pass 3: Responses + Examples
    const pass3Prompt = this.buildPass3Prompt(endpoint, code, parsed);
    let pass3Result = null;
    try {
      const response = await this.callOllama(pass3Prompt, 500);
      pass3Result = this.parseJsonResponse(response);
    } catch (e) {
      console.warn('  ⚠️ Pass 3 failed');
    }

    // Parse ONLY the handler code for this specific route, use route path to find it
    // Use smaller size (800) to only include this handler, not subsequent ones
    const routePath = endpoint.path;
    const handlerCode = this.getHandlerCodePreview(code, routePath, 800, endpoint.method);
    const handlerParsed = this.parseCode(handlerCode, endpoint);

    return {
      ...endpoint,
      llmEnrichment: {
        summary: pass1Result?.summary || this.generateStaticSummary(endpoint),
        description: pass1Result?.description || jsdoc.description || '',
        operationId: pass1Result?.operationId || this.generateOperationId(endpoint),
        tags: pass1Result?.tags || this.inferTags(endpoint),
        deprecated: pass1Result?.deprecated || false,
        // For security: use LLM result only for login/register routes
        security: this.shouldUseLLMSecurity(endpoint, pass1Result) ? pass1Result?.security : [{ bearerAuth: [] }],
        // Use parsed data for params - never trust LLM for these
        inputSchema: this.buildInputSchemaFromParsed(handlerParsed, endpoint.method),
        // Use LLM outputSchema only if it has actual properties
        outputSchema: this.buildOutputSchemaFromParsed(handlerParsed, pass2Result?.outputSchema),
        responses: pass3Result?.responses || this.buildDefaultResponses(endpoint, handlerParsed),
        examples: pass3Result?.examples || this.generateExamples(endpoint, handlerParsed)
      }
    };
  }

  // ============ PROMPTS ============
  buildSinglePassPrompt(endpoint, code, jsdoc, parsed) {
    const method = endpoint.method;
    const path = endpoint.fullPath || endpoint.path;
    const handler = endpoint.handler?.name || 'anonymous';
    
    // Get full handler code (chunked if needed)
    const codePreview = this.getHandlerCodePreview(code, handler, 3000);

    return `You are an OpenAPI/Swagger expert. Analyze this Express.js endpoint and generate complete Swagger documentation.

Endpoint: ${method} ${path}
Handler: ${handler}
API Description: "${jsdoc.description || 'N/A'}"

FULL HANDLER CODE:
\`\`\`javascript
${codePreview}
\`\`\`

ANALYZE THE CODE CAREFULLY. Extract ONLY the parameters that are ACTUALLY USED in the code:

分析方法:
1. Chercher req.query.NOM pour les query params
2. Chercher req.params.NOM pour les path params  
3. Chercher req.body.NOM pour les body fields
4. Chercher res.json(...) pour outputSchema
5. Chercher middleware auth/require pour requiresAuth

⚠️ CRITICAL RULES - VERY IMPORTANT:
- SI req.query n'est PAS utilisé dans le code → queryParams = [] (EMPTY ARRAY)
- SI req.params n'est PAS utilisé dans le code → pathParams = [] (EMPTY ARRAY)
- SI req.body n'est PAS utilisé dans le code → bodyFields = [] (EMPTY ARRAY)
- NE JAMAIS inventer des paramètres qui n'existent pas dans le code
- NE PAS utiliser de template comme "page, limit, search" sauf si présent dans le code
- SI c'est une route de login/register → requiresAuth = false

Detected from code analysis:
- Path params in route: ${JSON.stringify(parsed.pathParams)}
- Query params used: ${JSON.stringify(parsed.queryParams)}
- Body fields used: ${JSON.stringify(parsed.bodyFields)}
- Output fields: ${JSON.stringify(parsed.outputFields)}

Return a JSON object with ALL these fields:
{
  "summary": "Brief description (10-15 words, action-oriented, e.g., 'Get paginated list of electors')",
  "description": "Detailed description (1-2 sentences, explain what the endpoint does)",
  "operationId": "camelCase function name (e.g., 'getElectors', 'createElector', 'updateElector')",
  "tags": ["Resource name", "Category] (e.g., ["Electors", "CRUD"])",
  "deprecated": false,
  "security": [{"bearerAuth": []}],
  "inputSchema": {
    "path": { "paramName": { "type": "string", "required": true } },
    "query": { "paramName": { "type": "string", "required": false, "description": "..." } },
    "body": { "type": "object", "properties": { "field": { "type": "string", "description": "..." } }, "required": ["requiredField"] }
  },
  "outputSchema": { "type": "object", "properties": { "field": { "type": "string" } } },
  "responses": {
    "200": { "description": "Success", "schema": { "type": "object" } },
    "201": { "description": "Created" },
    "400": { "description": "Bad Request" },
    "401": { "description": "Unauthorized - Authentication required" },
    "403": { "description": "Forbidden - Insufficient permissions" },
    "404": { "description": "Not Found" },
    "409": { "description": "Conflict - Resource already exists" },
    "500": { "description": "Internal Server Error" }
  },
  "examples": {
    "request": { "body": { "field": "value" } },
    "response": { "status": "success", "data": { ... } }
  }
}

IMPORTANT: Use the detected params from code analysis. If queryParams array is empty, use empty object for query in inputSchema.

Return ONLY valid JSON, no markdown.`;
  }

  buildPass1Prompt(endpoint, code, jsdoc) {
    const method = endpoint.method;
    const path = endpoint.fullPath || endpoint.path;
    const handler = endpoint.handler?.name || 'anonymous';
    const codePreview = this.getHandlerCodePreview(code, handler, 2500);

    return `Generate metadata for this Express endpoint:

Endpoint: ${method} ${path}
Handler: ${handler}
Current description: "${jsdoc.description || 'N/A'}"

⚠️ AUTH DETECTION - VERY IMPORTANT:
- Look for middleware like: auth, require, isAuthenticated, verifyToken
- Check if route is: /auth/login, /auth/register, /login, /register → requiresAuth = false
- If auth middleware is used → requiresAuth = true
- If it's a login/register route → requiresAuth = false

Code:
\`\`\`javascript
${codePreview}
\`\`\`

Return JSON:
{
  "summary": "Brief (10-15 words)",
  "description": "1-2 sentences",
  "operationId": "camelCaseName",
  "tags": ["Resource", "Category"],
  "deprecated": false,
  "security": [{"bearerAuth": []}]
}

If login/register route → "security": [] (no auth required)

Return ONLY JSON.`;
  }

  buildPass2Prompt(endpoint, code, parsed) {
    const method = endpoint.method;
    const path = endpoint.fullPath || endpoint.path;
    const handler = endpoint.handler?.name || 'anonymous';
    const codePreview = this.getHandlerCodePreview(code, handler, 2500);

    return `Generate input/output schemas for this Express endpoint:

Endpoint: ${method} ${path}
Handler: ${handler}

⚠️ CRITICAL - Use ONLY these detected parameters from code analysis:
- Detected path params: ${JSON.stringify(parsed.pathParams)}
- Detected query params: ${JSON.stringify(parsed.queryParams)}
- Detected body fields: ${JSON.stringify(parsed.bodyFields)}
- Detected output fields: ${JSON.stringify(parsed.outputFields)}

RULES:
- If queryParams is empty → query = {} (empty object, NOT { "page": {...}, "limit": {...} })
- If bodyFields is empty → body = null or body not included
- If outputFields is empty → analyze res.json() calls in the code to find actual output
- NEVER invent parameters not in the lists above

Code:
\`\`\`javascript
${codePreview}
\`\`\`

Look at res.json(...) calls in the code to determine outputSchema fields.

Return JSON with inputSchema and outputSchema:
{
  "inputSchema": {
    "path": { "id": { "type": "string", "required": true } },
    "query": { "page": { "type": "integer", "required": false } },
    "body": { "type": "object", "properties": { "name": { "type": "string" } }, "required": ["name"] }
  },
  "outputSchema": { "type": "object", "properties": { "id": { "type": "string" } } }
}

If no params detected, use empty objects: "query": {}

Return ONLY JSON.`;
  }

  buildPass3Prompt(endpoint, code, parsed) {
    const method = endpoint.method;
    const path = endpoint.fullPath || endpoint.path;
    const handler = endpoint.handler?.name || 'anonymous';
    const codePreview = this.getHandlerCodePreview(code, handler, 2500);

    return `Generate HTTP responses and examples for this Express endpoint:

Endpoint: ${method} ${path}
Handler: ${handler}

Detected output: ${JSON.stringify(parsed.outputFields)}

Code:
\`\`\`javascript
${codePreview}
\`\`\`

Return JSON:
{
  "responses": {
    "200": { "description": "Success", "schema": { "type": "object" } },
    "201": { "description": "Created" },
    "400": { "description": "Bad Request" },
    "401": { "description": "Unauthorized" },
    "404": { "description": "Not Found" },
    "500": { "description": "Internal Server Error" }
  },
  "examples": {
    "request": { "body": { "field": "value" } },
    "response": { "status": "success", "data": { } }
  }
}

Return ONLY JSON.`;
  }

  // ============ CODE ANALYSIS ============
  async getCode(filePath) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  getHandlerCodePreview(code, routePath, maxChars, httpMethod) {
    if (!code || !routePath) return code?.substring(0, maxChars) || '';
    
    // Clean the route path
    const cleanPath = routePath.replace(/^\//, '').replace(/\//g, '\\/');
    const method = (httpMethod || 'get').toLowerCase();
    
    // Try to find the route definition - exact match with method first
    let routePattern = new RegExp(`router\\.${method}\\s*\\(\\s*['"\`]/${cleanPath}['"\`]`, 's');
    let match = code.match(routePattern);
    
    if (!match) {
      // Try without leading slash
      routePattern = new RegExp(`router\\.${method}\\s*\\(\\s*['"\`]${cleanPath}['"\`]`, 's');
      match = code.match(routePattern);
    }
    
    if (!match) {
      // Try with middleware array
      routePattern = new RegExp(`router\\.${method}\\s*\\(\\s*['"\`]${cleanPath}['"\`]\\s*,\\s*\\[`, 's');
      match = code.match(routePattern);
    }
    
    if (!match) {
      // Try any method
      routePattern = new RegExp(`router\\.(get|post|put|patch|delete|options)\\s*\\(\\s*['"\`]${cleanPath}['"\`]`, 's');
      match = code.match(routePattern);
    }
    
    if (!match) {
      return code.substring(0, maxChars);
    }
    
    const matchIdx = match.index;
    
    // Include 400 chars before (for destructuring like const { page } = req.query)
    const startIdx = Math.max(0, matchIdx - 400);
    // Up to maxChars after the match
    let endIdx = matchIdx + maxChars;
    
    // Try to find where this handler ends by looking for the next route definition
    const remainingCode = code.substring(matchIdx + 100);
    const nextRouteMatch = remainingCode.match(/\n(router|module\.exports)/);
    if (nextRouteMatch && nextRouteMatch.index < maxChars) {
      endIdx = matchIdx + 100 + nextRouteMatch.index;
    }
    
    const preview = code.substring(startIdx, endIdx);
    return preview;
  }

  extractJSDoc(docBlock) {
    if (!docBlock) return {};
    
    const result = {};
    
    // @apiDescription
    const descMatch = docBlock.match(/@apiDescription\s+(.+?)(?=\n\s*\*|\n\*\/|$)/s);
    if (descMatch) {
      result.description = descMatch[1].replace(/\n\s*\*\s*/g, ' ').trim();
    }
    
    // @apiParam
    const paramMatches = docBlock.matchAll(/@apiParam\s+\{(\w+)\}\s+(\w+)\s+(.+)$/gm);
    result.params = [];
    for (const match of paramMatches) {
      result.params.push({ type: match[1], name: match[2], desc: match[3] });
    }
    
    return result;
  }

  parseCode(code, endpoint) {
    if (!code) return { pathParams: [], queryParams: [], bodyFields: [], outputFields: [] };
    
    const result = {
      pathParams: [],
      queryParams: [],
      bodyFields: [],
      outputFields: []
    };

    // Path params from route path
    const pathParams = (endpoint.fullPath || '').match(/:([a-zA-Z0-9_]+)/g) || [];
    result.pathParams = pathParams.map(p => p.substring(1));

    // Query params - req.query.XXX
    const queryMatches = code.matchAll(/req\.query\.(\w+)/g);
    for (const m of queryMatches) {
      if (!result.queryParams.includes(m[1])) result.queryParams.push(m[1]);
    }

    // Query params - destructured: const { page, limit } = req.query
    const queryDestructure = code.match(/const\s*\{\s*([^}]+)\s*\}\s*=\s*req\.query/);
    if (queryDestructure) {
      const fields = queryDestructure[1].split(',').map(s => s.trim().split('=')[0].trim());
      for (const f of fields) {
        if (f && !result.queryParams.includes(f)) result.queryParams.push(f);
      }
    }

    // Body fields - req.body.XXX or const { xxx } = req.body
    const bodyDotMatches = code.matchAll(/req\.body\.(\w+)/g);
    for (const m of bodyDotMatches) {
      if (!result.bodyFields.includes(m[1])) result.bodyFields.push(m[1]);
    }
    
    const bodyDestructure = code.match(/const\s*\{\s*([^}]+)\s*\}\s*=\s*req\.body/);
    if (bodyDestructure) {
      const fields = bodyDestructure[1].split(',').map(s => s.trim());
      for (const f of fields) {
        if (!result.bodyFields.includes(f)) result.bodyFields.push(f);
      }
    }

    // Also check for destructured variables used in queries
    const bodyVarMatches = code.matchAll(/const\s+(\w+)\s*=\s*req\.body/g);
    for (const m of bodyVarMatches) {
      if (!result.bodyFields.includes(m[1])) result.bodyFields.push(m[1]);
    }

    // Output fields - res.json({ xxx })
    const jsonMatches = code.matchAll(/res\.json\(\{([^}]+)\}/g);
    for (const m of jsonMatches) {
      const content = m[1];
      const fieldMatches = content.matchAll(/(\w+):/g);
      for (const fm of fieldMatches) {
        if (!result.outputFields.includes(fm[1])) result.outputFields.push(fm[1]);
      }
    }

    return result;
  }

  // ============ OLLAMA CALL ============
  async callOllama(prompt, maxTokens) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: { 
          temperature: 0.3, 
          num_predict: maxTokens,
          top_p: 0.9
        }
      });

      const options = {
        hostname: this.host,
        port: this.port,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: this.timeout,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error));
            } else {
              resolve(parsed.response || '');
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });
  }

  parseJsonResponse(response) {
    if (!response) return null;
    
    try {
      // Try direct parse first
      return JSON.parse(response);
    } catch {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  // ============ HELPERS ============
  generateStaticSummary(endpoint) {
    const path = endpoint.fullPath || endpoint.path;
    const handler = endpoint.handler?.name || '';
    const method = endpoint.method?.toLowerCase() || 'get';
    
    const action = {
      get: 'Get',
      post: 'Create',
      put: 'Update',
      patch: 'Partial update',
      delete: 'Delete'
    }[method] || 'Handle';

    // Extract resource name from path
    const segments = path.split('/').filter(Boolean);
    const resource = segments[segments.length - 1]?.replace(/:.*/, '') || 'resource';
    const resourceSingular = resource.replace(/s$/, '') || 'item';
    
    if (path.includes('stats')) return 'Get aggregated statistics';
    if (path.includes('export')) return 'Export data to format';
    if (path.includes('import')) return 'Bulk import records';
    if (path.includes('login')) return 'Authenticate user and return JWT';
    if (path.includes('register')) return 'Create new user account';
    if (path.includes('nearby')) return 'Find nearby entities by location';
    
    return `${action} ${resourceSingular}`;
  }

  generateOperationId(endpoint) {
    const path = endpoint.fullPath || endpoint.path;
    const method = endpoint.method?.toLowerCase() || 'get';
    const handler = endpoint.handler?.name || 'handler';
    
    // Convert path to camelCase
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/:.*/, '') || 'item';
    const cleanResource = resource.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
    
    const action = {
      get: 'get',
      post: 'create',
      put: 'update',
      patch: 'updatePartial',
      delete: 'delete'
    }[method] || 'handle';
    
    return `${action}${cleanResource.charAt(0).toUpperCase() + cleanResource.slice(1)}`;
  }

  inferTags(endpoint) {
    const path = endpoint.fullPath || endpoint.path;
    const segments = path.split('/').filter(Boolean);
    
    // Common API resources
    const resourceMap = {
      'electors': ['Electors', 'CRUD'],
      'users': ['Users', 'CRUD'],
      'auth': ['Authentication', 'Auth'],
      'campaigns': ['Campaigns', 'CRUD'],
      'districts': ['Districts', 'CRUD'],
      'contacts': ['Contacts', 'CRUD'],
      'events': ['Events', 'CRUD'],
      'surveys': ['Surveys', 'CRUD'],
      'reports': ['Reports', 'Analytics'],
      'imports': ['Imports', 'Bulk'],
      'export': ['Exports', 'Bulk'],
      'stats': ['Statistics', 'Analytics']
    };
    
    for (const [key, tags] of Object.entries(resourceMap)) {
      if (path.includes(key)) return tags;
    }
    
    return [segments[segments.length - 1]?.replace(/:.*/, '') || 'API', 'Endpoint'];
  }

  mergeInputSchema(parsed, llmSchema, method) {
    const httpMethod = (method || 'GET').toUpperCase();
    const isGet = httpMethod === 'GET';
    
    const schema = {
      path: {},
      query: {},
      body: null
    };

    // Path params
    for (const p of parsed.pathParams) {
      schema.path[p] = { type: 'string', required: true };
    }

    // Query params
    for (const p of parsed.queryParams) {
      schema.query[p] = { type: 'string', required: false };
    }

    // Override with LLM-provided schema
    if (llmSchema) {
      if (llmSchema.path) schema.path = { ...schema.path, ...llmSchema.path };
      if (llmSchema.query) schema.query = { ...schema.query, ...llmSchema.query };
      if (llmSchema.body && !isGet) schema.body = llmSchema.body;
    }

    // Build body schema from parsed fields if not provided and not GET
    if (!schema.body && !isGet && parsed.bodyFields.length > 0) {
      schema.body = {
        type: 'object',
        properties: {},
        required: []
      };
      for (const field of parsed.bodyFields) {
        schema.body.properties[field] = { type: 'string' };
      }
    }

    return schema;
  }

  buildDefaultResponses(endpoint, parsed) {
    const method = endpoint.method?.toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    
    const responses = {
      '200': { 
        description: isMutation ? 'Success' : 'OK',
        content: { 'application/json': { schema: { type: 'object' } } }
      }
    };

    if (method === 'POST') {
      responses['201'] = { description: 'Created' };
    }

    if (isMutation) {
      responses['400'] = { description: 'Bad Request - Validation error' };
    }
    
    responses['401'] = { description: 'Unauthorized - Authentication required' };
    responses['403'] = { description: 'Forbidden - Insufficient permissions' };
    responses['404'] = { description: 'Not Found' };
    
    if (method === 'POST' || method === 'PUT') {
      responses['409'] = { description: 'Conflict - Resource already exists' };
    }
    
    responses['500'] = { description: 'Internal Server Error' };

    return responses;
  }

  generateExamples(endpoint, parsed) {
    const method = endpoint.method?.toUpperCase();
    const path = endpoint.fullPath || endpoint.path;
    
    const examples = {
      request: {},
      response: {}
    };

    // Request body examples
    if (['POST', 'PUT', 'PATCH'].includes(method) && parsed.bodyFields.length > 0) {
      const bodyExample = {};
      for (const field of parsed.bodyFields) {
        bodyExample[field] = this.getExampleValue(field);
      }
      examples.request = { body: bodyExample };
    }

    // Response examples
    examples.response = {
      status: 'success',
      data: {}
    };
    
    if (path.includes('stats') || path.includes('stats')) {
      examples.response = {
        status: 'success',
        data: {
          total: 0,
          byDistrict: [],
          byAgeGroup: []
        }
      };
    } else if (path.includes('/') && method === 'GET') {
      examples.response = {
        status: 'success',
        data: [],
        pagination: { current_page: 1, per_page: 20, total_items: 0 }
      };
    }

    return examples;
  }

  getExampleValue(field) {
    const lower = field.toLowerCase();
    if (lower.includes('name')) return 'John Doe';
    if (lower.includes('email')) return 'john@example.com';
    if (lower.includes('phone')) return '+1-555-0123';
    if (lower.includes('age')) return 25;
    if (lower.includes('id')) return '507f1f77bcf86cd799439011';
    if (lower.includes('date')) return '2024-01-15';
    if (lower.includes('count')) return 0;
    if (lower.includes('enabled') || lower.includes('active')) return true;
    return 'sample_value';
  }

  getMockEnrichment(endpoint) {
    return {
      summary: this.generateStaticSummary(endpoint),
      description: 'Mock enrichment',
      operationId: this.generateOperationId(endpoint),
      tags: this.inferTags(endpoint),
      deprecated: false,
      security: [{ bearerAuth: [] }],
      inputSchema: { path: {}, query: {}, body: null },
      outputSchema: { type: 'object', properties: {} },
      responses: this.buildDefaultResponses(endpoint, {}),
      examples: {}
    };
  }

  getFallbackEnrichment(endpoint, parsed = {}) {
    return {
      summary: this.generateStaticSummary(endpoint),
      description: endpoint.docBlock?.description || '',
      operationId: this.generateOperationId(endpoint),
      tags: this.inferTags(endpoint),
      deprecated: false,
      security: [{ bearerAuth: [] }],
      inputSchema: this.mergeInputSchema(parsed, null, endpoint.method),
      outputSchema: { type: 'object', properties: {} },
      responses: this.buildDefaultResponses(endpoint, parsed),
      examples: this.generateExamples(endpoint, parsed)
    };
  }
}

module.exports = LlmEnricherV2;
