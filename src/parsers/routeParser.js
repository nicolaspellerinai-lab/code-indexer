const fs = require('fs').promises;
const path = require('path');

class RouteParser {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.routes = [];
    this.parsedFiles = new Set();
    this.routePrefixes = {}; // Map: fichier -> préfixe complet
  }

  async findRouteFiles() {
    const files = [];
    // Convert projectPath to absolute
    const absProjectPath = path.resolve(this.projectPath);
    
    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) {
          files.push(path.resolve(fullPath)); // Always use absolute paths
        }
      }
    }
    await walk(absProjectPath);

    // 1. Analyze app.js/main file pour trouver les préfixes
    await this.extractRoutePrefixes(files);

    // Filtre les fichiers qui pourraient contenir des routes
    const routeFiles = files.filter(f => {
      const basename = path.basename(f);
      const isRouteFile = basename.includes('route') || basename.includes('api') || basename.includes('controller') || f.includes('routes') || f.includes('controllers');
      const isMainFile = ['app.js', 'index.js', 'server.js'].includes(basename);
      return isRouteFile && !isMainFile;
    });

    console.log('📁 Found route files:', routeFiles);
    console.log('🔗 Route prefixes:', this.routePrefixes);
    return routeFiles;
  }

  async extractRoutePrefixes(files) {
    const mainFiles = files.filter(f => {
      const basename = path.basename(f);
      return ['app.js', 'index.js', 'server.js'].includes(basename);
    });

    for (const file of mainFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const fileDir = path.dirname(file);
        
        // Pattern: const xxxRoutes = require('./routes/xxx')
        const importPattern = /const\s+(\w+Routes?)\s*=\s*require\s*\(['"]([^'")]+)['"]\)/g;
        const imports = {};
        let match;
        while ((match = importPattern.exec(content)) !== null) {
          const varName = match[1];
          const reqPath = match[2];
          const fullPath = path.resolve(fileDir, reqPath) + '.js';
          imports[varName] = fullPath;
        }

        // Pattern: app.use('/prefix', xxxRoutes)
        const usePattern = /app\.use\s*\(\s*['"]([^'"]+)['"],\s*(\w+Routes?)\s*\)/g;
        while ((match = usePattern.exec(content)) !== null) {
          const prefix = match[1];
          const varName = match[2];
          if (imports[varName]) {
            this.routePrefixes[imports[varName]] = prefix;
            console.log(`  ✓ Mapped: ${path.basename(imports[varName])} -> ${prefix}`);
          }
        }
      } catch (e) {
        console.warn(`⚠️ Error parsing ${file}: ${e.message}`);
      }
    }
  }

  async parseFile(filePath) {
    if (this.parsedFiles.has(filePath)) return [];
    this.parsedFiles.add(filePath);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const routes = this.extractRoutes(content, filePath);
      
      // Ajouter le préfixe si trouvé
      const prefix = this.routePrefixes[filePath] || '';
      if (prefix) {
        routes.forEach(r => {
          r.fullPath = prefix + r.path;
          r.prefix = prefix;
        });
      } else {
        routes.forEach(r => {
          r.fullPath = r.path;
        });
      }
      
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

    // Patterns plus robustes pour Express
    const patterns = [
      // router.get('/path', ...)
      /router\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]/gi,
      // app.get('/path', ...)
      /app\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]/gi,
      // app.use('/path', routes)
      /app\.use\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern standard: router.method('/path', handler)
      const methodMatch = line.match(/router\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/i);
      if (methodMatch) {
        const method = methodMatch[1].toUpperCase();
        const path = methodMatch[2];
        routes.push({
          method,
          path,
          file: filePath,
          line: i + 1,
          handler: { type: 'router', name: this.extractHandlerName(lines, i) },
          docBlock: this.extractDocBlock(lines, i),
          parameters: this.extractParameters(path)
        });
      }
    }

    return routes.map(r => ({
      ...r,
      id: `${r.method}_${r.path.replace(/\//g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`,
      rawPath: r.path
    }));
  }

  extractHandlerName(lines, currentIndex) {
    // Cherche le nom de la fonction handler sur les lignes suivantes
    const nextLines = lines.slice(currentIndex, currentIndex + 5).join(' ');
    const match = nextLines.match(/(?:async\s+)?function\s+(\w+)|(?:async\s+)?\(?\w+\)?\s*=>/);
    if (match) return match[1] || 'anonymous';
    return 'anonymous';
  }

  extractDocBlock(lines, currentIndex) {
    // Cherche un commentaire JSDoc au-dessus
    const result = [];
    for (let i = currentIndex - 1; i >= 0 && i >= currentIndex - 10; i--) {
      const line = lines[i].trim();
      if (line.startsWith('/**')) {
        result.unshift(line);
        break;
      }
      if (line.startsWith('*') || line.startsWith('*/') || line.startsWith('/*')) {
        result.unshift(line);
      } else {
        break;
      }
    }
    return result.join('\n');
  }

  extractParameters(path) {
    const params = [];
    // :param -> { in: 'path', name: 'param' }
    if (path.includes(':')) {
      const parts = path.split('/');
      for (const part of parts) {
        if (part.startsWith(':')) {
          params.push({ name: part.substring(1), in: 'path', required: true });
        }
      }
    }
    return params;
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
