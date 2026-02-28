const fs = require('fs');

class DependencyAnalyzer {
  constructor(routes, projectPath) {
    this.routes = routes;
    this.projectPath = projectPath;
  }

  analyze() {
    const relationships = [];
    
    this.routes.forEach(route => {
      const content = fs.readFileSync(route.file, 'utf-8');
      
      const dbCalls = this.detectDatabaseCalls(content);
      const serviceCalls = this.detectServiceCalls(content);
      const httpCalls = this.detectHttpCalls(content);

      relationships.push({
        endpoint: `${route.method} ${route.path}`,
        database: dbCalls,
        services: serviceCalls,
        externalEndpoints: httpCalls,
      });

      // Update route object
      route.dependencies = {
        database: dbCalls,
        services: serviceCalls,
        externalEndpoints: httpCalls
      };
    });

    return relationships;
  }

  detectDatabaseCalls(content) {
    const patterns = [
      /(\w+)\.find\(/g, /(\w+)\.findOne\(/g, /(\w+)\.create\(/g,
      /(\w+)\.update\(/g, /(\w+)\.destroy\(/g, /sequelize\.query\(/g,
      /prisma\.\w+\./g, /mongoose\.model\(['"](\w+)['"]\)/g,
      /\.exec\(/g, /\.then\(/g, /\.catch\(/g,
      /pool\.query\(/g, /\.query\(/g, /\.raw\(/g,
      /\.select\(/g, /\.where\(/g, /\.insert\(/g,
      /\.delete\(/g, /\.update\(/g, /\.save\(/g,
      /\.findById\(/g, /\.findAll\(/g, /\.findOrCreate\(/g,
      /\.upsert\(/g, /\.remove\(/g, /\.deleteOne\(/g,
      /\.deleteMany\(/g, /\.updateOne\(/g, /\.updateMany\(/g,
      /\.bulkWrite\(/g, /\.insertMany\(/g, /\.createCollection\(/g,
      /\.drop\(/g, /\.dropCollection\(/g, /\.dropDatabase\(/g,
      /\.rename\(/g, /\.clone\(/g, /\.copy\(/g,
      /\.aggregate\(/g, /\.mapReduce\(/g, /\.distinct\(/g,
      /\.count\(/g, /\.countDocuments\(/g, /\.estimatedDocumentCount\(/g,
      /\.index\(/g, /\.ensureIndex\(/g, /\.createIndex\(/g,
      /\.dropIndex\(/g, /\.listIndexes\(/g, /\.indexes\(/g,
    ];
    
    const tables = new Set();
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const table = match[1];
        if (table && !['req', 'res7, 'next', 'console', 'async', 'await'].includes(table)) {
          tables.add(table);
        }
      }
    });

    // Extra patterns for common ORMs
    const ormPatterns = [
      /Model\.create\(/g, /Model\.find\(/g, /Model\.findOne\(/g,
      /Model\.findById\(/g, /Model\.findAll\(/g, /Model\.findOrCreate\(/g,
      /Model\.update\(/g, /Model\.destroy\(/g, /Model\.remove\(/g,
      /Model\.save\(/g, /Model\.exec\(/g, /Model\.then\(/g,
    ];

    ormPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        tables.add('Model');
      }
    });

    return [...tables];
  }

  detectServiceCalls(content) {
    const servicePattern = /(\w+Service)\.\w+\(/g;
    const services = new Set();
    let match;
    while ((match = servicePattern.exec(content)) !== null) {
      services.add(match[1]);
    }

    // Additional service patterns
    const extraPatterns = [
      /(\w+Manager)\.\w+\(/g,
      /(\w+Client)\.\w+\(/g,
      /(\w+Repository)\.\w+\(/g,
      /(\w+Helper)\.\w+\(/g,
      /(\w+Util)\.\w+\(/g,
    ];

    extraPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        services.add(match[1]);
      }
    });

    return [...services];
  }

  detectHttpCalls(content) {
    const patterns = [
      /axios\.(get|post|put|delete|patch)\(['"`]([^'"`]+)/g,
      /fetch\(['"`]([^'"`]+)/g,
      /request\(/g,
      /superagent\./g,
      /\.get\(/g, /\.post\(/g, /\.put\(/g, /\.delete\(/g, /\.patch\(/g,
    ];

    const endpoints = [];
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const method = match[1] || 'GET';
        const url = match[2] || match[0];
        endpoints.push({
          url: url.replace(/\.\.\./g, '{param}').replace(/\{[^}]+\}/g, '{param}'),
          method: method.toUpperCase(),
        });
      }
    });

    return endpoints;
  }
}

module.exports = DependencyAnalyzer;
