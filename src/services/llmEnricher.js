const http = require('http');
const fs = require('fs').promises;

class LlmEnricher {
  constructor(options = {}) {
    this.model = options.model || 'qwen3:8b';
    this.host = options.host || 'localhost';
    this.port = options.port || 11434;
    this.timeout = options.timeout || 30000;
    this.mockMode = options.mockMode || false;
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
      return endpoints.map(e => ({ ...e, llmEnrichment: { summary: 'Mock', inputSchema: {}, outputSchema: {} } }));
    }

    // Process one by one with better prompts
    const results = [];
    for (const endpoint of endpoints) {
      const code = await this.getCode(endpoint.file);
      const jsdoc = this.extractJSDoc(endpoint.docBlock);
      const enriched = await this.enrichWithLLM(endpoint, code, jsdoc);
      results.push(enriched);
    }
    
    return results;
  }

  async getCode(filePath) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  extractJSDoc(docBlock) {
    if (!docBlock) return {};
    
    const result = {};
    const descMatch = docBlock.match(/@apiDescription\s+(.+?)(?=\n\s*\*|\n\*\/)/s);
    if (descMatch) {
      result.description = descMatch[1].replace(/\n\s*\*\s*/g, ' ').trim();
    }
    
    // Extract params
    const paramMatches = docBlock.matchAll(/@apiParam\s+\{(\w+)\}\s+(\w+)\s+(.+)$/gm);
    result.params = [];
    for (const match of paramMatches) {
      result.params.push({ type: match[1], name: match[2], desc: match[3] });
    }
    
    return result;
  }

  async enrichWithLLM(endpoint, code, jsdoc) {
    // Fallback static data
    const staticSummary = this.generateStaticSummary(endpoint);
    
    // Analyze code for params
    const pathParams = (endpoint.fullPath || '').match(/:(\w+)/g) || [];
    const pathParamList = pathParams.map(p => p.substring(1));
    
    const queryMatches = code.matchAll(/req\.query\.(\w+)/g);
    const queryParams = new Set();
    for (const m of queryMatches) queryParams.add(m[1]);
    
    const bodyMatch = code.match(/const\s*\{([^}]+)\}\s*=\s*req\.body/);
    const bodyProps = bodyMatch ? bodyMatch[1].split(',').map(s => s.trim()) : [];
    
    // Try LLM enrichment
    let llmResult = null;
    try {
      const prompt = this.buildPrompt(endpoint, code, jsdoc);
      const response = await this.callOllama(prompt, 500);
      llmResult = this.parseResponse(response);
    } catch (e) {
      console.warn('  ⚠️ LLM enrich failed:', e.message);
    }
    
    // Combine: LLM result > JSDoc > static
    const finalSummary = llmResult?.summary || jsdoc.description || staticSummary;
    
    return {
      ...endpoint,
      llmEnrichment: {
        summary: finalSummary,
        inputSchema: {
          query: [...pathParamList, ...Array.from(queryParams)].map(p => ({
            name: p,
            in: pathParamList.includes(p) ? 'path' : 'query',
            required: pathParamList.includes(p),
            schema: { type: 'string' }
          })),
          body: bodyProps.length > 0 ? {
            type: 'object',
            required: bodyProps,
            properties: bodyProps.reduce((acc, p) => { acc[p] = { type: 'string' }; return acc; }, {})
          } : undefined
        },
        outputSchema: llmResult?.outputSchema || { type: 'object', properties: {} },
        examples: llmResult?.examples || jsdoc.examples || []
      }
    };
  }

  buildPrompt(endpoint, code, jsdoc) {
    const method = endpoint.method;
    const path = endpoint.fullPath || endpoint.path;
    const currentSummary = jsdoc.description || this.generateStaticSummary(endpoint);
    
    return `Analyze this Express.js endpoint and provide a better summary.

Endpoint: ${method} ${path}
Current summary: "${currentSummary}"

Code snippet:
\`\`\`javascript
${code?.substring(0, 800) || '// No code available'}
\`\`\`

Provide a JSON response:
{
  "summary": "Brief description (10-15 words), avoid 'Endpoint'", 
  "outputSchema": { "type": "object" }
}

Return only valid JSON. Example: {"summary": "Authenticate user and return JWT token"}`;
  }

  async callOllama(prompt, maxTokens) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: maxTokens }
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
            resolve(parsed.response || '');
          } catch {
            resolve('');
          }
        });
      });
      req.on('error', () => resolve(''));
      req.on('timeout', () => { req.destroy(); resolve(''); });
      req.write(body);
      req.end();
    });
  }

  parseResponse(response) {
    try {
      // Extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {}
    return null;
  }

  generateStaticSummary(endpoint) {
    const path = endpoint.fullPath || endpoint.path;
    const handler = endpoint.handler?.name || '';
    
    // Patterns for better summaries
    if (path.includes('login')) return 'Authenticate user and return JWT token';
    if (path.includes('register')) return 'Create new user account';
    if (path.includes('export')) return 'Export data to CSV format';
    if (path.includes('import')) return 'Bulk import records';
    if (path.includes('stats')) return 'Get aggregated statistics';
    if (path.includes('nearby')) return 'Find nearby entities by geolocation';
    if (handler && handler !== 'anonymous') {
      return handler.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
    }
    return `${endpoint.method} ${endpoint.path}`;
  }
}

module.exports = LlmEnricher;
