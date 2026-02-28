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
    ];
    
    const tables = new Set();
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const table = match[1];
        if (table && !['req', 'res', 'next', 'console', 'async', 'await'].includes(table)) {
          tables.add(table);
        }
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
    return [...services];
  }

  detectHttpCalls(content) {
    const patterns = [
      /axios\.(get|post|put|delete|patch)\(['"`]([^'"`]+)/g,
      /fetch\(['"`]([^'"`]+)/g,
    ];

    const endpoints = [];
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        endpoints.push({
          url: match[2] || match[1],
          method: match[1]?.toUpperCase() || 'GET',
        });
      }
    });

    return endpoints;
  }
}

module.exports = DependencyAnalyzer;
