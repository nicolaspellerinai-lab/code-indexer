const http = require('http');
const fs = require('fs').promises;

/**
 * Service d'enrichissement via Ollama local
 * Extrait les schémas entrants/sortants et enrichit la documentation
 */
class LlmEnricher {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 11434;
    this.model = options.model || 'qwen2.5-coder:14b';
    this.backupModel = options.backupModel || 'llama3.2:3b';
    this.timeout = options.timeout || 30000;
    this.mockMode = options.mockMode || false;
  }

  /**
   * Vérifie la connexion à Ollama
   */
  async checkConnection() {
    if (this.mockMode) {
      console.log('🤖 Mock mode enabled - skipping Ollama connection');
      return true;
    }

    return new Promise((resolve) => {
      const options = {
        hostname: this.host,
        port: this.port,
        path: '/api/tags',
        method: 'GET',
        timeout: 5000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            console.log('✅ Connected to Ollama');
            console.log(`Available models: ${parsed.models?.slice(0, 3).map(m => m.name).join(', ')}...`);
            resolve(true);
          } catch (e) {
            console.warn('⚠️ Ollama responded with invalid JSON');
            resolve(false);
          }
        });
      });

      req.on('error', () => {
        console.warn('⚠️ Cannot connect to Ollama - will use fallback mode');
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        console.warn('⚠️ Ollama connection timed out');
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Enrichit un endpoint avec le LLM ou fallback
   */
  async enrichEndpoint(endpoint) {
    try {
      const code = await this.loadSourceCode(endpoint);
      
      // Si mock mode ou Ollama non disponible, utilise fallback
      const useMock = this.mockMode || !(await this.checkConnection());
      
      if (useMock) {
        return this.generateMockEnrichment(endpoint, code);
      }

      const enriched = {
        summary: await this.generateSummary(endpoint, code),
        inputSchema: await this.extractInputSchema(endpoint, code),
        outputSchema: await this.extractOutputSchema(endpoint, code),
        examples: await this.generateExamples(endpoint, code),
      };

      return { ...endpoint, llmEnrichment: enriched };
    } catch (e) {
      console.warn(`⚠️ LLM enrichment failed for ${endpoint.path}:`, e.message);
      return endpoint;
    }
  }

  /**
   * Génère des enrichissements de base sans LLM (fallback)
   */
  generateMockEnrichment(endpoint, code) {
    const method = endpoint.method;
    const path = endpoint.path;
    const handlerName = endpoint.handler?.name || 'anonymous';
    
    // Génère un résumé réaliste basé sur les patterns
    let summary = `${method} ${path}`;
    if (handlerName && handlerName !== 'anonymous') {
      summary = handlerName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    } else if (path.includes('login')) {
      summary = 'Authenticate user and return JWT token';
    } else if (path.includes('register')) {
      summary = 'Create new user account';
    } else if (path.includes('export')) {
      summary = 'Export data to CSV format';
    } else if (path.includes('import')) {
      summary = 'Bulk import records from file';
    } else if (path.includes('stats')) {
      summary = 'Get aggregated statistics';
    } else if (path.includes('nearby')) {
      summary = 'Find nearby entities by geolocation';
    }

    // Détecte les inputs communs
    const inputSchema = { query: [], body: [] };
    if (code.includes('req.params')) {
      const paramMatches = code.match(/req\.params\.(\w+)/g);
      if (paramMatches) {
        paramMatches.forEach(m => inputSchema.query.push(m.replace('req.params.', '')));
      }
    }
    if (code.includes('req.body')) {
      const bodyMatches = code.match(/req\.body\.(\w+)/g);
      if (bodyMatches) {
        inputSchema.body = [...new Set(bodyMatches.map(m => m.replace('req.body.', '')))];
      }
    }

    return {
      ...endpoint,
      llmEnrichment: {
        summary,
        inputSchema,
        outputSchema: { description: 'Standard API response with data' },
        examples: [],
        mockGenerated: true
      }
    };
  }

  /**
   * Charge le code source de l'endpoint
   */
  async loadSourceCode(endpoint) {
    try {
      const content = await fs.readFile(endpoint.file, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, (endpoint.line || 1) - 5);
      const end = Math.min(lines.length, (endpoint.line || 1) + 50);
      return lines.slice(start, end).join('\n');
    } catch (e) {
      return '';
    }
  }

  async generateSummary(endpoint, code) {
    const prompt = `Analyze this Express.js route and describe what it does:

Method: ${endpoint.method}
Path: ${endpoint.path}
Code: ${code.substring(0, 2000)}

Give a concise 1-sentence description:`;

    return this.callOllama(prompt, 150);
  }

  async extractInputSchema(endpoint, code) {
    const prompt = `Extract input parameters from:

Method: ${endpoint.method}
Path: ${endpoint.path}
Code: ${code.substring(0, 2000)}

List query params, body fields, and path params as JSON:`;

    const response = await this.callOllama(prompt, 300);
    try {
      return JSON.parse(response);
    } catch {
      return {};
    }
  }

  async extractOutputSchema(endpoint, code) {
    const prompt = `Describe the response structure for:
Method: ${endpoint.method}
Path: ${endpoint.path}

Return JSON schema:`;

    const response = await this.callOllama(prompt, 300);
    try {
      return JSON.parse(response);
    } catch {
      return {};
    }
  }

  async generateExamples(endpoint, code) {
    const prompt = `Generate example request and response for ${endpoint.method} ${endpoint.path}:`;
    const response = await this.callOllama(prompt, 400);
    return [{ description: response }];
  }

  /**
   * Appel HTTP à Ollama
   */
  async callOllama(prompt, maxTokens) {
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
}

module.exports = LlmEnricher;
