const RouteParser = require('./parsers/routeParser');
const DependencyAnalyzer = require('./parsers/dependencyAnalyzer');
const VectorStore = require('./vectorStore/client');
const DocGenerator = require('./generators/docGenerator');
const LlmEnricher = require('./services/llmEnricher');

class IndexingPipeline {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.parser = new RouteParser(projectPath);
    this.analyzer = new DependencyAnalyzer(projectPath);
    this.vectorStore = new VectorStore();
    this.docGenerator = new DocGenerator();
    this.llmEnricher = new LlmEnricher({ model: 'qwen3:8b', mockMode: false }); // Plus rapide que 14b
  }

  async run() {
    console.log('🔍 Phase 1: Scanning routes...');
    const routeFiles = await this.parser.findRouteFiles();
    console.log(`📂 Found ${routeFiles.length} files to scan`);
    
    for (const file of routeFiles) {
      await this.parser.parseFile(file);
    }
    console.log(`✨ Found ${this.parser.routes.length} routes`);

    console.log('🔗 Phase 2: Analyzing dependencies...');
    this.analyzer = new DependencyAnalyzer(this.parser.routes, this.projectPath);
const relationships = this.analyzer.analyze();

    console.log('🧠 Phase 3: Enriching with LLM (Ollama)...');
    const isConnected = await this.llmEnricher.checkConnection();
    if (isConnected) {
      console.log(`🤖 Enriching ${this.parser.routes.length} endpoints via LLM...`);
      for (let i = 0; i < this.parser.routes.length; i++) {
        const route = this.parser.routes[i];
        console.log(`   [${i+1}/${this.parser.routes.length}] Analyzing ${route.method} ${route.path}...`);
        
        // Enrichissement complet
        const enriched = await this.llmEnricher.enrichEndpoint(route);
        if (enriched.llmEnrichment) {
             console.log(`   ✅ Enriched summary: ${enriched.llmEnrichment.summary?.substring(0, 50)}...`);
        }
        this.parser.routes[i] = enriched;
      }
    } else {
      console.warn('⚠️ Ollama not reachable - skipping LLM enrichment phase');
    }

    console.log('💾 Phase 4: Indexing to vector store (ChromaDB)...');
    try {
      await this.vectorStore.init();
      await this.vectorStore.addEndpoints(this.parser.routes);
    } catch (e) {
      console.warn('⚠️ Vector store indexing failed:', e.message);
    }

    console.log('📝 Phase 5: Generating OpenAPI documentation...');
    const openAPIDocs = {
      openapi: '3.0.0',
      info: {
        title: 'Auto-Generated Documentation (Enhanced by AI)',
        version: '1.0.0',
      },
      paths: {}
    };

    for (const route of this.parser.routes) {
      const doc = this.docGenerator.generateOpenAPI(route);
      // Merge paths deeply (préserve les méthodes multiples sur le même path)
      for (const [path, methods] of Object.entries(doc)) {
        if (!openAPIDocs.paths[path]) openAPIDocs.paths[path] = {};
        for (const [method, spec] of Object.entries(methods)) {
          openAPIDocs.paths[path][method] = spec;
        }
      }
    }

    await this.saveResults(relationships, openAPIDocs);
    console.log('✅ Pipeline complete!');
    console.log(`- Relationships: data/relationships.json`);
    console.log(`- OpenAPI spec: data/generated-openapi.json`);
  }

  async saveResults(relationships, openAPI) {
    const fs = require('fs').promises;
    await fs.mkdir('data', { recursive: true });
    await fs.writeFile('data/relationships.json', JSON.stringify(relationships, null, 2));
    await fs.writeFile('data/generated-openapi.json', JSON.stringify(openAPI, null, 2));
  }
}

module.exports = IndexingPipeline;
