class Endpoint {
  constructor(data = {}) {
    this.id = data.id || this.generateId(data);
    this.method = data.method || 'GET';
    this.path = data.path || '/';
    this.file = data.file || '';
    this.line = data.line || 0;
    this.handler = data.handler || { type: 'unknown' };
    this.parameters = data.parameters || [];
    this.imports = data.imports || [];
    this.dependencies = data.dependencies || null;
    this.docBlock = data.docBlock || '';
    this.swaggerDoc = data.swaggerDoc || null;
    this.tags = data.tags || [];
    this.confidence = data.confidence || 'inferred'; // 'certain', 'inferred', 'unknown'
    this.lastUpdated = data.lastUpdated || new Date().toISOString();
  }

  generateId(data) {
    const method = (data.method || 'GET').toUpperCase();
    const path = (data.path || '/').replace(/\//g, '_').replace(/[:{}]/g, '');
    return `${method}_${path}`;
  }

  toEmbeddingText() {
    const parts = [
      `${this.method} ${this.path}`,
      this.handler.name ? `Handler: ${this.handler.name}` : '',
      this.docBlock ? `Description: ${this.docBlock.substring(0, 500)}` : '',
      this.parameters.length ? `Parameters: ${JSON.stringify(this.parameters)}` : '',
      this.dependencies?.database?.length ? `Tables: ${this.dependencies.database.join(', ')}` : '',
      this.dependencies?.services?.length ? `Services: ${this.dependencies.services.join(', ')}` : '',
    ];
    return parts.filter(Boolean).join('\n');
  }

  toSummary() {
    return {
      method: this.method,
      path: this.path,
      file: this.file,
      line: this.line,
      handler: this.handler.name || 'anonymous',
      params: this.parameters.length,
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
      handler: this.handler,
      parameters: this.parameters,
      imports: this.imports,
      dependencies: this.dependencies,
      docBlock: this.docBlock,
      swaggerDoc: this.swaggerDoc,
      tags: this.tags,
      confidence: this.confidence,
      lastUpdated: this.lastUpdated,
    };
  }

  static fromJSON(json) {
    return new Endpoint(json);
  }
}

module.exports = Endpoint;
