/**
 * Test script for a single endpoint
 * Usage: node scripts/test-single-endpoint.js [method:path]
 * 
 * Examples:
 *   node scripts/test-single-endpoint.js                          # Tests first endpoint
 *   node scripts/test-single-endpoint.js GET:/api/electors        # Tests specific endpoint
 *   node scripts/test-single-endpoint.js POST:/api/electors/bulk
 */

const RouteParser = require('../src/parsers/routeParser');
const LlmEnricherV2 = require('../src/services/llmEnricherV2');
const fs = require('fs');
const path = require('path');

async function main() {
  // Parse command line args
  // Usage: node scripts/test-single-endpoint.js [path/to/file.js] [method:path]
  // Examples:
  //   node scripts/test-single-endpoint.js                                   # Tests first route from code_to_index (directory)
  //   node scripts/test-single-endpoint.js code_to_index/elector.js           # Tests first route from elector.js
  //   node scripts/test-single-endpoint.js code_to_index/elector.js GET:/api/  # Tests specific endpoint
  
  const args = process.argv.slice(2);
  
  // Determine project path (file or directory)
  let projectPath = path.join(__dirname, '..', 'code_to_index');
  let targetMethod = '';
  let targetPath = '';
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.includes(':')) {
      // This is method:path
      const parts = arg.split(':');
      targetMethod = parts[0];
      targetPath = parts.slice(1).join(':');
    } else if (arg.endsWith('.js')) {
      // This is a file path
      projectPath = path.join(__dirname, '..', arg);
    }
  }
  
  console.log(`🔍 Finding routes in: ${projectPath}...\n`);
  
  // Find route files
  const parser = new RouteParser(projectPath);
  const routeFiles = await parser.findRouteFiles();
  
  // Parse all files to get routes
  for (const file of routeFiles) {
    await parser.parseFile(file);
  }
  
  const routes = parser.routes;
  console.log(`Found ${routes.length} routes\n`);
  
  // Find target route
  let targetRoute = null;
  
  if (targetMethod && targetPath) {
    // User specified method:path
    targetRoute = routes.find(r => {
      const method = (r.method || '').toLowerCase() === targetMethod.toLowerCase();
      const pathMatch = (r.fullPath || r.path).includes(targetPath);
      return method && pathMatch;
    });
  } else if (targetMethod) {
    // User specified just method (will use first route)
    targetRoute = routes.find(r => (r.method || '').toLowerCase() === targetMethod.toLowerCase());
  } else {
    // Use first route
    targetRoute = routes[0];
  }
  
  if (!targetRoute) {
    console.log('❌ Route not found!');
    if (targetMethod && targetPath) {
      console.log(`   Looking for: ${targetMethod}:${targetPath}`);
    }
    console.log('\nAvailable routes:');
    routes.forEach(r => console.log(`   ${r.method} ${r.fullPath || r.path}`));
    process.exit(1);
  }
  
  console.log('=' .repeat(60));
  console.log(`🧪 Testing endpoint: ${targetRoute.method} ${targetRoute.fullPath || targetRoute.path}`);
  console.log('=' .repeat(60));
  console.log(`   Handler: ${targetRoute.handler?.name || 'anonymous'}`);
  console.log(`   File: ${targetRoute.file}`);
  console.log();
  
  // Load config
  const configPath = path.join(__dirname, '..', 'config', 'llm-providers.json');
  let config = { ollama: { host: 'localhost', port: 11434, models: [] } };
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not load config, using defaults');
  }
  
  const ollamaConfig = config.ollama || {};
  let configHost = ollamaConfig.host || 'localhost';
  let configPort = ollamaConfig.port || 11434;
  
  if (configHost.includes('://')) {
    try {
      const url = new URL(configHost);
      configHost = url.hostname;
      configPort = url.port || 11434;
    } catch (e) {}
  }
  
  const model = ollamaConfig.models?.[0] || 'deepseek-v2:16b';
  
  // Create enricher
  const enricher = new LlmEnricherV2({
    model,
    host: configHost,
    port: configPort,
    strategy: 'single',
    mockMode: false
  });
  
  // Check connection
  console.log(`📡 Connecting to Ollama: ${configHost}:${configPort} (${model})`);
  const connected = await enricher.checkConnection();
  console.log(connected ? '   ✅ Connected\n' : '   ❌ Not connected\n');
  
  if (!connected) {
    console.log('❌ Cannot test - Ollama not available');
    process.exit(1);
  }
  
  // Enrich the single endpoint
  console.log('🤖 Calling LLM...\n');
  const enriched = await enricher.enrichEndpoint(targetRoute);
  
  // Display results
  console.log('=' .repeat(60));
  console.log('📊 RESULT');
  console.log('=' .repeat(60));
  
  const enrichment = enriched.llmEnrichment;
  
  console.log('\n📝 Summary:');
  console.log(`   ${enrichment.summary}`);
  
  console.log('\n📝 Description:');
  console.log(`   ${enrichment.description || '(none)'}`);
  
  console.log('\n🏷️  Tags:');
  console.log(`   ${enrichment.tags.join(', ')}`);
  
  console.log('\n📥 Input Schema:');
  if (enrichment.inputSchema) {
    if (enrichment.inputSchema.path && Object.keys(enrichment.inputSchema.path).length > 0) {
      console.log('   Path:', JSON.stringify(enrichment.inputSchema.path));
    }
    if (enrichment.inputSchema.query && Object.keys(enrichment.inputSchema.query).length > 0) {
      console.log('   Query:', JSON.stringify(enrichment.inputSchema.query));
    }
    if (enrichment.inputSchema.body) {
      console.log('   Body:', JSON.stringify(enrichment.inputSchema.body));
    }
    if (Object.keys(enrichment.inputSchema.path || {}).length === 0 &&
        Object.keys(enrichment.inputSchema.query || {}).length === 0 &&
        !enrichment.inputSchema.body) {
      console.log('   (none)');
    }
  }
  
  console.log('\n📤 Output Schema:');
  console.log(`   ${JSON.stringify(enrichment.outputSchema)}`);
  
  console.log('\n✅ Responses:');
  console.log(`   ${JSON.stringify(enrichment.responses)}`);
  
  console.log('\n' + '=' .repeat(60));
  console.log('💾 Log files saved to: data/llm-logs/');
  console.log('=' .repeat(60));
}

main().catch(console.error);
