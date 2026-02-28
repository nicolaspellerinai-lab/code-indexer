const RouteParser = require('./src/parsers/routeParser');
const parser = new RouteParser('./test-projects/express-campaign');
console.log('📁 Project path:', parser.projectPath);
console.log('🔍 Finding route files...');
console.log('📄 Files to parse:', parser.parsedFiles.size);
