const VectorStore = require('../src/vectorStore/client');
const path = require('path');

const vectorStore = new VectorStore();

async function searchEndpoints(query) {
  try {
    await vectorStore.init();
    const results = await vectorStore.search(query, 10);
    
    if (results.length === 0) {
      console.log('No results found');
      return;
    }

    console.log(`✅ Found ${results.length} results:`);
    results.forEach((result, i) => {
      const meta = result.metadata || {};
      console.log(`\n${i + 1}. ${result.id}`);
      console.log(`   Method: ${meta.method || 'unknown'}`);
      console.log(`   Path: ${meta.path || 'unknown'}`);
      console.log(`   File: ${meta.file || 'unknown'}`);
      console.log(`   Similarity: ${(result.score * 100).toFixed(2)}%`);
      console.log(`   Description: ${result.document || 'No description'}`);
    });
  } catch (e) {
    console.error('❌ Search failed:', e.message);
  }
}

const query = process.argv[2] || 'users';
searchEndpoints(query);
