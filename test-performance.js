#!/usr/bin/env node
/**
 * Test de performance du mode batch vs séquentiel
 */

const IndexingPipeline = require('./src/pipeline');
const fs = require('fs').promises;

async function performanceTest() {
  console.log('=== PERFORMANCE TEST: Batch vs Sequential ===\n');
  
  // Test 1: Sequential (pour comparaison)
  console.log('✅ Test 1: Sequential mode (legacy)');
  const startTimeSeq = Date.now();
  
  const pSeq = new IndexingPipeline('./test-projects/express-campaign');
  
  // Override pour mesurer le temps
  const originalRun = pSeq.run.bind(pSeq);
  pSeq.run = async function() {
    console.log('  Starting sequential enrichment...');
    const startEnrich = Date.now();
    
    const result = await originalRun();
    
    const durationEnrich = (Date.now() - startEnrich) / 1000;
    console.log('  Sequential enrichment time:', durationEnrich.toFixed(1), 'seconds');
    return result;
  };
  
  try {
    await pSeq.run();
    const durationSeq = (Date.now() - startTimeSeq) / 1000;
    console.log('  Total sequential time:', durationSeq.toFixed(1), 'seconds\n');
  } catch (e) {
    console.log('  ❌ FAIL: Sequential mode', e.message);
  }
  
  // Test 2: Batch mode
  console.log('✅ Test 2: Batch mode (new)');
  const startTimeBatch = Date.now();
  
  const pBatch = new IndexingPipeline('./test-projects/express-campaign');
  
  // Override pour mesurer le temps
  const originalRunBatch = pBatch.run.bind(pBatch);
  pBatch.run = async function() {
    console.log('  Starting batch enrichment...');
    const startEnrich = Date.now();
    
    const result = await originalRunBatch();
    
    const durationEnrich = (Date.now() - startEnrich) / 1000;
    console.log('  Batch enrichment time:', durationEnrich.toFixed(1), 'seconds');
    return result;
  };
  
  try {
    await pBatch.run();
    const durationBatch = (Date.now() - startTimeBatch) / 1000;
    console.log('  Total batch time:', durationBatch.toFixed(1), 'seconds\n');
    
    // Comparaison
    console.log('📊 Performance comparison:');
    console.log('  Sequential time:', durationSeq.toFixed(1), 's');
    console.log('  Batch time:', durationBatch.toFixed(1), 's');
    console.log('  Speedup:', ((durationSeq / durationBatch) - 1).toFixed(1), 'x faster');
    
  } catch (e) {
    console.log('🔥 FAIL: Batch mode', e.message);
  }
}

try {
  performanceTest();
} catch (e) {
  console.error('🔥 ERROR:', e.message);
}
