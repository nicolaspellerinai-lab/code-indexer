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

      const req = http.request(options, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  async enrichEndpoint(endpoint, code) {
    if (this.mockMode) {
      return {
        ...endpoint,
        llmEnrichment: {
          summary: `Mock summary for ${endpoint.method} ${endpoint.path}`,
          inputSchema: { query: [], body: {} },
          outputSchema: { type: 'object', properties: {} },
          examples: [{ request: {}, response: {} }]
        }
      };
    }

    const codeAvailable = typeof code === 'string' && code.length > 0;
    const staticSummary = this.generateStaticSummary(endpoint, code);
    const enriched = await this.callOllamaBatch([endpoint], [codeAvailable ? code : null]);
    const enrichedData = enriched[0] || {};

    return {
      ...endpoint,
      llmEnrichment: {
        summary: enrichedData.summary || staticSummary,
        inputSchema: enrichedData.inputSchema || { query: [], body: {} },
        outputSchema: enrichedData.outputSchema || { type: 'object', properties: {} },
        examples: enrichedData.examples || [{ request: {}, response: {} }]
      }
    };
  }

  async callOllamaBatch(endpoints, codes) {
    if (!endpoints || endpoints.length === 0) {
      return [];
    }

    const validEndpoints = [];
    const validCodes = [];
    const results = [];

    for (let i = 0; i < endpoints.length; i++) {
      if (codes[i]) {
        validEndpoints.push(endpoints[i]);
        validCodes.push(codes[i]);
      } else {
        results.push({});
      }
    }

    if (validEndpoints.length === 0) {
      return results;
    }

    const prompts = [];
    for (let i = 0; i < validEndpoints.length; i++) {
      const endpoint = validEndpoints[i];
      const code = validCodes[i];
      const prompt = this.generatePrompt(endpoint, code);
      prompts.push({
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 800,
        }
      });
    }

    try {
      const batchResponse = await this.callOllamaBatchAPI(prompts);
      batchResponse.forEach((response, i) => {
        try {
          const enriched = this.parseLLMResponse(response);
          results[validEndpoints.indexOf(validEndpoints[i])] = enriched;
        } catch (e) {
          results[validEndpoints.indexOf(validEndpoints[i])] = {};
        }
      });
    } catch (e) {
      console.warn('⚠️ Batch LLM call failed, falling back to sequential');
      for (let i = 0; i < validEndpoints.length; i++) {
        try {
          const endpoint = validEndpoints[i];
          const code = validCodes[i];
          const prompt = this.generatePrompt(endpoint, code);
          const response = await this.callOllama(prompt, 800);
          const enriched = this.parseLLMResponse(response);
          results[validEndpoints.indexOf(validEndpoints[i])] = enriched;
        } catch (e) {
          results[validEndpoints.indexOf(validEndpoints[i])] = {};
        }
      }
    }

    return results;
  }

  async callOllamaBatchAPI(prompts) {
    const promises = prompts.map(prompt => this.callOllamaSingle(prompt.prompt, prompt.options.num_predict));
    return Promise.all(promises);
  }

  async callOllamaSingle(prompt, maxTokens) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: maxTokens,
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
            resolve(parsed.response || '');
          } catch (e) {
            resolve('');
          }
        });
      });

      req.on('error', () => resolve(''));
      req.on('timeout', () => {
        req.destroy();
        resolve('');
      });

      req.write(body);
      req.end();
    });
  }

  async enrichEndpointsBatch(endpoints) {
    if (this.mockMode) {
      return endpoints.map(endpoint => ({
        ...endpoint,
        llmEnrichment: {
          summary: `Mock summary for ${endpoint.method} ${endpoint.path}`,
          inputSchema: { query: [], body: {} },
          outputSchema: { type: 'object', properties: {} },
          examples: [{ request: {}, response: {} }]
        }
      }));
    }

    const codes = [];
    for (const endpoint of endpoints) {
      try {
        const content = await fs.readFile(endpoint.file, 'utf-8');
        codes.push(content);
      } catch (e) {
        codes.push('');
      }
    }

    const enrichedBatch = await this.callOllamaBatch(endpoints, codes);

    return endpoints.map((endpoint, i) => {
      const enriched = enrichedBatch[i] || {};
      const staticSummary = this.generateStaticSummary(endpoint, codes[i]);
      return {
        ...endpoint,
        llmEnrichment: {
          summary: enriched.summary || staticSummary,
          inputSchema: enriched.inputSchema || { query: [], body: {} },
          outputSchema: enriched.outputSchema || { type: 'object', properties: {} },
          examples: enriched.examples || [{ request: {}, response: {} }]
        }
      };
    });
  }

  generateStaticSummary(endpoint, code) {
    return `${endpoint.method} ${endpoint.path} - Endpoint ${endpoint.method.toLowerCase()} for ${endpoint.path}`;
  }

  generatePrompt(endpoint, code) {
    return `Analyze this Express.js endpoint:
Method: ${endpoint.method}
Path: ${endpoint.path}

Code:
\`\`\`javascript
${code || '// Code not available'}
\`\`\`

Provide a JSON response with:
- summary: Brief description of what this endpoint does
- inputSchema: Object with query (array) and body (object) properties
- outputSchema: JSON schema for the response
- examples: Array with request/response examples

Return only valid JSON.`;
  }

  parseLLMResponse(response) {
    try {
      // Try to parse directly
      return JSON.parse(response);
    } catch (e) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\n?(.*?)\n?```/s);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (e) {
          return {};
        }
      }
      return {};
    }
  }
}

module.exports = LlmEnricher;
