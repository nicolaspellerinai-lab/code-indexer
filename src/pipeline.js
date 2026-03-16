const RouteParser = require('./parsers/routeParser');
const DependencyAnalyzer = require('./parsers/dependencyAnalyzer');
const DocGenerator = require('./generators/docGenerator');
const LlmEnricher = require('./services/llmEnricherV2');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Helper function to write file with retry for Windows
async function writeFileRetry(filePath, data) {
  // First try to delete the file if it exists (helps with locked files)
  try {
    await fs.unlink(filePath);
  } catch (e) {
    // File might not exist, that's fine
  }
  
  for (let i = 0; i < 5; i++) {
    try {
      await fs.writeFile(filePath, data);
      return;
    } catch (e) {
      if (i < 4) {
        await new Promise(resolve => setTimeout(resolve, 300));
      } else {
        throw e;
      }
    }
  }
}

// Helper function to ensure data directory exists with retry for Windows
async function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  
  for (let i = 0; i < 5; i++) {
    try {
      // Try to access the directory first
      await fs.access(dataDir);
      // Directory exists and is accessible
      return dataDir;
    } catch (e) {
      // Directory doesn't exist or not accessible
      try {
        await fs.mkdir(dataDir, { recursive: true });
        return dataDir;
      } catch (mkdirErr) {
        if (i < 4) {
          // Wait longer and retry
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }
  }
  
  // Last resort - return the path anyway
  return dataDir;
}

// Load Ollama config - use __dirname to find code-indexer config
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

// Progress tracking - use process.cwd() to be consistent with data directory
const PROGRESS_FILE = path.join(process.cwd(), 'data', 'indexing-progress.json');
const QUEUE_FILE = path.join(process.cwd(), 'data', 'indexing-queue.json');

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
    let host = this.options.host || configHost;
    let port = this.options.port || configPort;
    
    // If host already contains a port (e.g., from command line), don't add it again
    if (this.options.host && this.options.host.includes(':')) {
      try {
        const url = new URL(this.options.host);
        host = this.options.host;
        port = url.port || port; // Use the port from the URL if present
      } catch (e) {
        // Invalid URL, use as-is
      }
    }
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
    
    // Check for existing parsed routes (intermediate save from previous run)
    const routesDataPath = path.join(process.cwd(), 'data', 'routes.json');
    let existingRoutes = null;
    
    if (resume && fsSync.existsSync(routesDataPath)) {
      try {
        existingRoutes = JSON.parse(fsSync.readFileSync(routesDataPath, 'utf-8'));
        console.log(`  ♻️  Loaded ${existingRoutes.length} previously parsed routes`);
      } catch (e) {
        console.warn('  ⚠️ Could not load existing routes, re-parsing...');
      }
    }
    
    if (!existingRoutes) {
      const routeFiles = await this.parser.findRouteFiles();
      console.log(`  Found ${routeFiles.length} route files`);
      
      // Parse each file and append routes (don't reset between files)
      for (let i = 0; i < routeFiles.length; i++) {
        const file = routeFiles[i];
        const append = i > 0; // Append routes from 2nd file onwards
        await this.parser.parseFile(file, append);
      }
    } else {
      // Use loaded routes - use endpoints property since routes is getter-only
      this.parser.endpoints = existingRoutes;
    }
    
    console.log(`  ✅ Parsed ${this.parser.routes.length} routes\n`);
    
    // Save intermediate: parsed routes
    await this.saveParsedRoutes(this.parser.routes);
    
    // Phase 2: Analyze dependencies
    console.log('Phase 2: Analyzing dependencies...');
    
    // Check for existing relationships (intermediate save from previous run)
    const relationshipsDataPath = path.join(process.cwd(), 'data', 'relationships.json');
    let relationships = null;
    
    if (resume && fsSync.existsSync(relationshipsDataPath)) {
      try {
        relationships = JSON.parse(fsSync.readFileSync(relationshipsDataPath, 'utf-8'));
        console.log(`  ♻️  Loaded ${relationships.length} previously analyzed relationships`);
      } catch (e) {
        console.warn('  ⚠️ Could not load existing relationships, re-analyzing...');
      }
    }
    
    if (!relationships) {
      this.analyzer = new DependencyAnalyzer(this.parser.routes, this.projectPath);
      relationships = this.analyzer.analyze();
    }
    
    console.log(`  ✅ Found ${relationships.length} relationships\n`);
    
    // Save intermediate: relationships
    await this.saveRelationships(relationships);

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
        
        // Set up progress callback to save after each route
        const self = this;
        let processedCount = 0;
        const allEnriched = [];
        
        this.enricher.onProgress = async function(current, total, enriched) {
          processedCount = current;
          allEnriched.push(enriched);
          
          // Save progress after each route
          saveProgress({
            projectPath: self.projectPath,
            timestamp: new Date().toISOString(),
            processed: processedCount,
            total: total,
            enrichedRoutes: allEnriched
          });
        };
        
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
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      }
    };

    for (const route of routes) {
      // Use 'path' instead of 'fullPath' - the parser uses 'path'
      if (!route.method || !route.path) continue;

      const pathKey = route.path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
      const methodKey = route.method.toLowerCase();
      
      // Get LLM enrichment data
      const enrichment = route.llmEnrichment || {};

      if (!docs.paths[pathKey]) {
        docs.paths[pathKey] = {};
      }
      
      // Build the operation
      const operation = {
        summary: enrichment.summary || route.description || `Endpoint ${route.method} ${route.path}`,
        description: route.description || enrichment.description || `Endpoint ${route.method} ${route.path}`,
        tags: enrichment.tags || [route.framework || 'api'],
        parameters: this.buildParameters(route),
        responses: enrichment.responses || this.buildDefaultResponses(route),
        security: enrichment.security || [{ bearerAuth: [] }]
      };
      
      // Add header parameters if present
      if (enrichment.headerParameters && enrichment.headerParameters.length > 0) {
        // Header parameters are already included in buildParameters
      }
      
      // Add request body for POST/PUT/PATCH
      if (['post', 'put', 'patch'].includes(methodKey) && enrichment.inputSchema?.body) {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: enrichment.inputSchema.body
            }
          }
        };
      }
      
      docs.paths[pathKey][methodKey] = operation;
    }

    return docs;
  }

  buildParameters(route) {
    const params = [];
    const enrichment = route.llmEnrichment || {};

    // Header parameters from LLM enrichment
    if (enrichment.headerParameters) {
      for (const header of enrichment.headerParameters) {
        params.push({
          name: header.name,
          in: 'header',
          required: header.required !== false,
          schema: { type: header.type || 'string' },
          description: header.description || `${header.name} header parameter`
        });
      }
    }

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
    if (enrichment.inputSchema?.query) {
      for (const [name, schema] of Object.entries(enrichment.inputSchema.query)) {
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

  // Save intermediate parsed routes (after Phase 1)
  async saveParsedRoutes(routes) {
    const dataDir = await ensureDataDir();
    
    // Save routes.json (without enrichment)
    await writeFileRetry(
      path.join(dataDir, 'routes.json'),
      JSON.stringify(routes, null, 2)
    );
    
    // Group by file for multi-file support
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
    
    console.log('  💾 Saved intermediate: data/routes.json');
    console.log('  💾 Saved intermediate: data/routes-by-file.json');
  }

  // Save intermediate relationships (after Phase 2)
  async saveRelationships(relationships) {
    const dataDir = await ensureDataDir();
    
    await writeFileRetry(
      path.join(dataDir, 'relationships.json'),
      JSON.stringify(relationships, null, 2)
    );
    
    console.log('  💾 Saved intermediate: data/relationships.json');
  }

  async saveResults(relationships, openAPI, routes) {
    const dataDir = await ensureDataDir();

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
    await writeFileRetry(
      path.join(dataDir, 'relationships.json'),
      JSON.stringify(enrichedRelationships, null, 2)
    );

    // Save relationships by entity (split into separate files)
    await this.saveRelationshipsByEntity(enrichedRelationships, dataDir);

    // Save OpenAPI spec
    await writeFileRetry(
      path.join(dataDir, 'generated-openapi.json'),
      JSON.stringify(openAPI, null, 2)
    );

    // Save routes with source file information for patch generation
    // Include full route objects with file paths for multi-file support
    await writeFileRetry(
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
    await writeFileRetry(
      path.join(dataDir, 'routes-by-file.json'),
      JSON.stringify(routesByFile, null, 2)
    );

    console.log('  📄 Saved: data/relationships.json');
    console.log('  📄 Saved: data/generated-openapi.json');
    console.log('  📄 Saved: data/routes.json (final with enrichment)');
    console.log('  📄 Saved: data/routes-by-file.json (final with enrichment)');
  }

  // Save relationships split by entity
  async saveRelationshipsByEntity(relationships, dataDir) {
    const entityGroups = {};
    
    for (const rel of relationships) {
      const endpoint = rel.endpoint || '';
      
      // Extract entity type from endpoint path
      const pathMatch = endpoint.match(/\/api\/crm\/([^\/\s]+)/);
      if (!pathMatch) continue;
      
      const entityType = pathMatch[1].toLowerCase();
      
      if (!entityGroups[entityType]) {
        entityGroups[entityType] = [];
      }
      
      entityGroups[entityType].push(rel);
    }
    
    // Create directory for entity files
    const entityDir = path.join(dataDir, 'relationships-by-entity');
    if (!fsSync.existsSync(entityDir)) {
      fsSync.mkdirSync(entityDir, { recursive: true });
    }
    
    // Save each entity to a separate file
    for (const [entityType, entityRelations] of Object.entries(entityGroups)) {
      const outputPath = path.join(entityDir, `${entityType}.json`);
      fsSync.writeFileSync(outputPath, JSON.stringify(entityRelations, null, 2));
    }
    
    // Save summary
    const summary = {
      generatedAt: new Date().toISOString(),
      totalRelations: relationships.length,
      entities: Object.keys(entityGroups).map(entity => ({
        entity,
        count: entityGroups[entity].length
      }))
    };
    fsSync.writeFileSync(
      path.join(entityDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    console.log(`  📂 Saved ${Object.keys(entityGroups).length} entity files in data/relationships-by-entity/`);
  }
}

module.exports = { IndexingPipeline };
