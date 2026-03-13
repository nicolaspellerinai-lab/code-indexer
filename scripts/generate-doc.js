const DocGenerator = require('../src/generators/docGenerator');
const path = require('path');

class DocGeneratorCLI {
  constructor() {
    this.generator = new DocGenerator();
  }

  async generateForRoute(routePath, method) {
    console.log('Generating OpenAPI documentation...');
    const endpoint = {
      method: method || 'GET',
      path: routePath || '/',
      handler: { name: 'exampleHandler' },
      parameters: [],
      docBlock: 'Example endpoint documentation',
    };

    const doc = this.generator.generateOpenAPI(endpoint);
    console.log(JSON.stringify(doc, null, 2));
  }

  async generateFromRoutesFile(routesFile) {
    const fs = require('fs').promises;
    try {
      const content = await fs.readFile(routesFile, 'utf-8');
      const routes = JSON.parse(content);
      
      const openAPIDocs = {
        openapi: '3.0.0',
        info: {
          title: 'Generated Documentation',
          version: '1.0.0',
        },
        paths: {}
      };

      routes.forEach(route => {
        const doc = this.generator.generateOpenAPI(route);
        Object.assign(openAPIDocs.paths, doc);
      });

      console.log(JSON.stringify(openAPIDocs, null, 2));
    } catch (e) {
      console.error('❌ Error:', e.message);
    }
  }
}

const cli = new DocGeneratorCLI();

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

switch (command) {
  case 'generate':
    cli.generateForRoute(arg1, arg2);
    break;
  case 'from-file':
    cli.generateFromRoutesFile(arg1);
    break;
  default:
    console.log('Usage:');
    console.log('  node scripts/generate-doc.js generate <path> [method]');
    console.log('  node scripts/generate-doc.js from-file <routes.json>');
}
