const fs = require('fs').promises;
const path = require('path');

class RouteParser {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.routes = [];
    this.parsedFiles = new Set();
  }

  async findRouteFiles() {
    const files = [];
    
    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    }
    
    await walk(this.projectPath);
    
    // Filtre les fichiers qui pourraient contenir des routes
    const routeFiles = files.filter(f => {
      const basename = path.basename(f);
      return basename.includes('route') || 
             basename.includes('api') || 
             basename.includes('controller') ||
             f.includes('routes') ||
             f.includes('controllers');
    });
    
    console.log('📁 Found route files:', routeFiles);
    return routeFiles;
  }

  async parseFile(filePath) {
    if (this.parsedFiles.has(filePath)) return [];
    this.parsedFiles.add(filePath);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const routes = this.extractRoutes(content, filePath);
      this.routes.push(...routes);
      return routes;
    } catch (e) {
      console.warn(`⚠️ Erreur parsing ${filePath}:`, e.message);
      return [];
    }
  }

  extractRoutes(content, filePath) {
    const routes = [];
    const lines = content.split('\n');
    
    // Recherche simple des patterns de routes
    const routePatterns = [
      /router\.(get|post|put|delete|patch)\s*\(\s*\u0027([^']+)\u0027/, // guillemets simples
      /router\.(get|post|put|delete|patch)\s*\(\s*\u0022([^"]+)\u0022/  // guillemets doubles
    ];
    
    lines.forEach((line, index) => {
      for (const pattern of routePatterns) {
        const match = line.match(pattern);
        if (match) {
          const method = match[1].toUpperCase();
          const path = match[2];
          routes.push({
            method,
            path,
            file: filePath,
            line: index + 1,
            handler: { type: 'method', name: 'anonymous' },
            docBlock: '',
            parameters: []
          });
          break; // Un match suffit
        }
      }
    });

    return routes.map(r => ({ ...r, id: `${r.method}_${r.path.replace(/\//g, '_')}` }));
  }

  async run() {
    console.log('🔍 Starting route parsing...');
    const files = await this.findRouteFiles();
    console.log('📄 Files to parse:', files.length);
    
    for (const file of files) {
      await this.parseFile(file);
    }
    
    console.log(`✨ Found ${this.routes.length} routes`);
    return this.routes;
  }
}

module.exports = RouteParser;
