const IndexingPipeline = require('../src/pipeline');
const path = require('path');

const projectPath = process.argv[2] || '.';
console.log(`Indexing project: ${path.resolve(projectPath)}`);

const pipeline = new IndexingPipeline(projectPath);

pipeline.run().catch(error => {
  console.error('❌ Pipeline failed:', error);
});
