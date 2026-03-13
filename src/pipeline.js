const RouteParser = require('./parsers/routeParser');
const DependencyAnalyzer = require('./parsers/dependencyAnalyzer');
const DocGenerator = require('./generators/docGenerator');
const LlmEnricher = require('./services/llmEnricherV2');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Load Ollama config
function loadLlmConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'llm-providers.json');
  try {
    if (fsSync.existsSync(configPath)) {
      const configData = fsSync.readFileSync(configPath, 'utf-8');
      return JSON.parse(configData);
    }
  } catch (e) {
    console.warn('  ⚠️ Could not load config/llm-providers.json, using defaults');
  }
  return { ollama: { host: 'localhost', port: 11434, models: [] } };
}

// Progress tracking
const PROGRESS_FILE = path.join(__dirname, '..', 'data', 'indexing-progress.json');
const QUEUE_FILE = path.join(__dirname, '..', 'data', 'indexing-queue.json');

function loadProgress() {
  try {
    if (fsSync.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fsSync.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return null;
}

function saveProgress(progress) {
  try {
    fsSync.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (e) {
    console.warn('  ⚠️ Could not save progress:', e.message);
  }
}

function loadQueue() {
  try {
    if (fsSync.existsSync(QUEUE_FILE)) {
      return JSON.parse(fsSync.readFileSync(QUEUE_FILE, 'utf-8'));
    }
  } catch (e) {}
  return null;
}

function saveQueue(queue) {
  try {
    fsSync.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  } catch (e) {
    console.warn('  ⚠️ Could not save queue:', e.message);
  }
}

class IndexingPipeline {
  constructor(projectPath, options = {}) {
    this.projectPath = projectPath;
    this.options = options;
    this.parser = null;
    this.analyzer = null;
    this.enricher = null;
    this.docGenerator = null;
  }

  async run(options = {}) {
    const resume = options.resume !== false; // Default to resume if available
    console.log('🔍 Indexing Pipeline Starting...\n');

    // Load config
    const llmConfig = loadLlmConfig();
    const ollamaConfig = llmConfig.ollama || {};
    
    // Handle host with or without protocol
    let configHost = ollamaConfig.host || 'localhost';
    let configPort = ollamaConfig.port || 11434;
    
    // If host contains protocol, extract hostname and port
    if (configHost.includes('://')) {
      try {
        const url = new URL(configHost);
        configHost = url.hostname;
        configPort = url.port || 11434;
      } catch (e) {
        // Invalid URL, use as-is
      }
    }
    
    // Override config with command-line options if provided
    const host = this.options.host || configHost;
    const port = this.options.port || configPort;
    const model = this.options.model || ollamaConfig.models?.[0] || 'deepseek-v2:16b';
    
    console.log(`  📡 Ollama config: ${host}:${port} (model: ${model})`);

    // Initialize components
    this.parser = new RouteParser(this.projectPath);
    this.enricher = new LlmEnricher({ 
      model, 
      strategy: 'single', 
      mockMode: false,
      host,
      port
    });
    this.docGenerator = new DocGenerator();

    // Phase 1: Parse routes
    console.log('Phase 1: Parsing routes...');
    const routeFiles = await this.parser.findRouteFiles();
    console.log(`  Found ${routeFiles.length} route files`);
    
    // Parse each file and append routes (don't reset between files)
    for (let i = 0; i < routeFiles.length; i++) {
      const file = routeFiles[i];
      const append = i > 0; // Append routes from 2nd file onwards
      await this.parser.parseFile(file, append);
    }
    console.log(`  ✅ Parsed ${this.parser.routes.length} routes\n`);

    // Phase 2: Analyze dependencies
    console.log('Phase 2: Analyzing dependencies...');
    this.analyzer = new DependencyAnalyzer(this.parser.routes, this.projectPath);
    const relationships = this.analyzer.analyze();
    console.log(`  ✅ Found ${relationships.length} relationships\n`);

    // Phase 3: LLM Enrichment with progress tracking
    console.log('Phase 3: Enriching with LLM...');
    const isConnected = await this.enricher.checkConnection();
    let enrichedRoutes = this.parser.routes;
    
    if (isConnected) {
      console.log('  🧠 Ollama connected, enriching endpoints...');
      
      // Check for existing progress
      const existingProgress = loadProgress();
      const totalRoutes = this.parser.routes.length;
      
      if (resume && existingProgress && existingProgress.projectPath === this.projectPath) {
        console.log(`  ♻️  Resuming: ${existingProgress.processed}/${existingProgress.total} endpoints already done`);
        
        // Already processed routes
        const processedKeys = new Set(
          existingProgress.enrichedRoutes.map(r => `${r.method}-${r.path}`)
        );
        
        // Routes to process
        const pendingRoutes = this.parser.routes.filter(
          r => !processedKeys.has(`${r.method}-${r.path}`)
        );
        
        if (pendingRoutes.length > 0) {
          console.log(`  ⏳ Processing remaining ${pendingRoutes.length} endpoints...`);
          
          // Process pending routes
          let processedCount = existingProgress.processed;
          const allEnriched = [...existingProgress.enrichedRoutes];
          
          for (const route of pendingRoutes) {
            processedCount++;
            process.stdout.write(`\r  📊 ${processedCount}/${totalRoutes}... `);
            
            try {
              const enriched = await this.enricher.enrichEndpoint(route);
              allEnriched.push(enriched);
              
              // Save progress
              saveProgress({
                projectPath: this.projectPath,
                timestamp: new Date().toISOString(),
                processed: processedCount,
                total: totalRoutes,
                enrichedRoutes: allEnriched
              });
            } catch (e) {
              console.log(`\n  ⚠️ Error processing ${route.method} ${route.path}: ${e.message}`);
              allEnriched.push({ ...route, llmEnrichment: this.enricher.getFallbackEnrichment(route) });
            }
          }
          
          enrichedRoutes = allEnriched;
          console.log('\n');
        } else {
          console.log('  ✅ All endpoints already processed');
          enrichedRoutes = existingProgress.enrichedRoutes;
        }
      } else {
        // Fresh start - use simple batch processing
        console.log('  🆕 Starting fresh indexing...');
        enrichedRoutes = await this.enricher.enrichEndpointsBatch(this.parser.routes);
        
        // Save final progress
        saveProgress({
          projectPath: this.projectPath,
          timestamp: new Date().toISOString(),
          processed: totalRoutes,
          total: totalRoutes,
          enrichedRoutes
        });
      }
      
      console.log(`  ✅ Enriched ${enrichedRoutes.length} routes\n`);
    } else {
      console.log('  ⚠️ Ollama not connected, skipping enrichment\n');
    }
    
    // Update parser routes with enriched data
    this.parser.endpoints = enrichedRoutes;

    // Phase 4: Generate OpenAPI docs
    console.log('Phase 4: Generating OpenAPI documentation...');
    const openAPIDocs = this.generateOpenAPI(enrichedRoutes);
    console.log(`  ✅ Generated ${Object.keys(openAPIDocs.paths).length} paths\n`);

    // Phase 5: Save results
    console.log('Phase 5: Saving results...');
    await this.saveResults(relationships, openAPIDocs, enrichedRoutes);
    
    // Clear progress file on completion
    if (fsSync.existsSync(PROGRESS_FILE)) {
      fsSync.unlinkSync(PROGRESS_FILE);
      console.log('  🗑️  Cleared progress file\n');
    }
    
    console.log('✅ Pipeline Complete!\n');
    return { routes: enrichedRoutes, relationships, openAPIDocs };
  }

  generateOpenAPI(routes) {
    const docs = {
      openapi: '3.0.0',
      info: {
        title: 'Generated API Documentation',
        version: '1.0.0',
        description: 'Auto-generated from Express routes'
      },
      paths: {}
    };

    for (const route of routes) {
      // Use 'path' instead of 'fullPath' - the parser uses 'path'
      if (!route.method || !route.path) continue;

      const pathKey = route.path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
      const methodKey = route.method.toLowerCase();

      if (!docs.paths[pathKey]) {
        docs.paths[pathKey] = {};
      }

      docs.paths[pathKey][methodKey] = {
        summary: route.llmEnrichment?.summary || route.description || `Endpoint ${route.method} ${route.path}`,
        description: route.description || route.llmEnrichment?.description || `Endpoint ${route.method} ${route.path}`,
        tags: route.llmEnrichment?.tags || [route.framework || 'api'],
        parameters: this.buildParameters(route),
        responses: route.llmEnrichment?.responses || this.buildDefaultResponses(route)
      };
    }

    return docs;
  }

  buildParameters(route) {
    const params = [];

    // Path parameters
    if (route.parameters) {
      for (const param of route.parameters) {
        params.push({
          name: param.name,
          in: param.in || 'path',
          required: param.required !== false,
          schema: { type: param.type || 'string' },
          description: param.description || `${param.name} parameter`
        });
      }
    }

    // Query parameters from LLM enrichment
    if (route.llmEnrichment?.inputSchema?.query) {
      for (const [name, schema] of Object.entries(route.llmEnrichment.inputSchema.query)) {
        params.push({
          name,
          in: 'query',
          required: schema.required || false,
          schema: { type: schema.type || 'string' },
          description: schema.description || `${name} query parameter`
        });
      }
    }

    return params;
  }

  buildDefaultResponses(route) {
    return {
      '200': {
        description: 'Success',
        content: {
          'application/json': {
            schema: route.llmEnrichment?.outputSchema || { type: 'object' }
          }
        }
      },
      '404': { description: 'Not found' },
      '500': { description: 'Server error' }
    };
  }

  async saveResults(relationships, openAPI, routes) {
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });

    // Map routes by their endpoint signature for quick lookup
    // Key format: "METHOD /path" (case-insensitive for method, case-sensitive for path)
    const routeMap = new Map();
    for (const route of routes) {
      const method = (route.method || '').toUpperCase();
      const path = route.fullPath || route.path || '';
      const key = `${method} ${path}`;
      routeMap.set(key, route);
    }

    // Enrich relationships with LLM data from matching routes
    const enrichedRelationships = relationships.map(rel => {
      const relEndpoint = rel.endpoint || '';
      // Normalize: uppercase method only, keep path as-is
      const parts = relEndpoint.split(' ');
      const relMethod = parts[0]?.toUpperCase() || '';
      const relPath = parts.slice(1).join(' ');
      const normalizedKey = `${relMethod} ${relPath}`;
      const route = routeMap.get(normalizedKey);
      
      if (route?.llmEnrichment) {
        return { ...rel, llmEnrichment: route.llmEnrichment };
      }
      return rel;
    });

    // Save relationships with LLM enrichment
    await fs.writeFile(
      path.join(dataDir, 'relationships.json'),
      JSON.stringify(enrichedRelationships, null, 2)
    );

    // Save OpenAPI spec
    await fs.writeFile(
      path.join(dataDir, 'generated-openapi.json'),
      JSON.stringify(openAPI, null, 2)
    );

    // Save routes with source file information for patch generation
    // Include full route objects with file paths for multi-file support
    await fs.writeFile(
      path.join(dataDir, 'routes.json'),
      JSON.stringify(routes, null, 2)
    );

    // Group routes by source file for patch generation
    const routesByFile = {};
    for (const route of routes) {
      const file = route.file || 'unknown';
      if (!routesByFile[file]) {
        routesByFile[file] = [];
      }
      routesByFile[file].push(route);
    }
    await fs.writeFile(
      path.join(dataDir, 'routes-by-file.json'),
      JSON.stringify(routesByFile, null, 2)
    );

    console.log('  📄 Saved: data/relationships.json');
    console.log('  📄 Saved: data/generated-openapi.json');
    console.log('  📄 Saved: data/routes.json (full routes with file paths)');
    console.log('  📄 Saved: data/routes-by-file.json (routes grouped by source file)');
  }
}

module.exports = { IndexingPipeline };
