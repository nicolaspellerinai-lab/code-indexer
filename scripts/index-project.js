const { IndexingPipeline } = require('../src/pipeline');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  host: null,
  port: null,
  model: null
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host' && args[i + 1]) {
    options.host = args[i + 1];
    i++;
  } else if (args[i] === '--port' && args[i + 1]) {
    options.port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--model' && args[i + 1]) {
    options.model = args[i + 1];
    i++;
  }
}

// First argument is the project path
const projectPath = args[0] && !args[0].startsWith('--') ? args[0] : '.';

console.log(`Indexing project: ${path.resolve(projectPath)}`);
if (options.host) {
  console.log(`Using Ollama at: ${options.host}:${options.port || 11434}`);
}

const pipeline = new IndexingPipeline(projectPath, options);

pipeline.run().catch(error => {
  console.error('❌ Pipeline failed:', error);
});
