const { ChromaClient } = require('chromadb');

class VectorStore {
  constructor() {
    this.client = new ChromaClient({ path: 'http://localhost:8000' });
    this.collection = null;
  }

  async init() {
    try {
      this.collection = await this.client.getOrCreateCollection({ 
        name: 'endpoints',
        metadata: { 'hnsw:space': 'cosine' },
      });
      console.log('✅ Connected to ChromaDB');
    } catch (e) {
      console.error('⚠️ Could not connect to ChromaDB. Is Docker running?');
    }
  }

  async addEndpoints(endpoints) {
    if (!this.collection) return;
    
    const validEndpoints = endpoints.filter(e => e.method && e.path);
    if (validEndpoints.length === 0) return;

    const ids = validEndpoints.map(e => `${e.method}-${e.path.replace(/\//g, '_')}`);
    const documents = validEndpoints.map(e => this.formatForEmbedding(e));
    const metadatas = validEndpoints.map(e => ({
      method: e.method,
      path: e.path,
      file: e.file,
      line: e.line,
    }));

    try {
      await this.collection.add({ ids, documents, metadatas });
      console.log(`💾 Added ${validEndpoints.length} endpoints to vector store`);
    } catch (e) {
      console.error('❌ Failed to index endpoints:', e.message);
    }
  }

  formatForEmbedding(endpoint) {
    return `
      ${endpoint.method} ${endpoint.path}
      Handler: ${endpoint.handler?.name || 'anonymous'}
      Parameters: ${JSON.stringify(endpoint.parameters)}
      Dependencies: ${JSON.stringify(endpoint.dependencies)}
      Doc: ${endpoint.docBlock || ''}
    `.trim();
  }

  async search(query, n = 5) {
    if (!this.collection) return [];
    try {
      const results = await this.collection.query({
        queryTexts: [query],
        nResults: n,
      });
      return results;
    } catch (e) {
      console.error('❌ Search failed:', e.message);
      return [];
    }
  }
}

module.exports = VectorStore;
