const fs = require('fs').promises;
async function test() {
  try {
    const content = await fs.readFile('test-projects/express-campaign/routes/auth.js', 'utf-8');
    console.log('✅ File read successfully:');
    console.log(content.substring(0, 200));
    
    const routeRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    const match = routeRegex.exec(content);
    if (match) {
      console.log('✅ Route found:', match[1].toUpperCase(), match[2]);
    } else {
      console.log('⚠️ No route found with regex');
    }
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}

test().catch(console.error);
