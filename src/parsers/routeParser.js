const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const fs = require('fs').promises;
const path = require('path');
const Endpoint = require('../models/Endpoint');

class RouteParser {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.routes = [];
    this.parsedFiles = new Set();
  }

  async findRouteFiles(patterns = ['**/*route*.{js,ts}', '**/*controller*.{js,ts}', '**/routes/**/*.{js,ts}']) {
    const { glob } = await import('glob');
    const files = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.projectPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
      });
      files.push(...matches.map(f => path.join(this.projectPath, f)));
    }
    return [...new Set(files)];
  }

  async parseFile(filePath) {
    if (this.parsedFiles.has(filePath)) return [];
    this.parsedFiles.add(filePath);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'typescript',
          'decorators-legacy',
          'classProperties',
          'classPrivateProperties',
          'classPrivateMethods',
          'dynamicImport',
          'topLevelAwait',
          'asyncGenerators',
          'objectRestSpread',
          'optionalChaining',
          'nullishCoalescingOperator',
        ],
        errorRecovery: true,
      });

      const routes = this.extractRoutes(ast, filePath, content);
      this.routes.push(...routes);
      return routes;
    } catch (error) {
      console.warn(`⚠️ Erreur parsing ${filePath}:`, error.message);
      return [];
    }
  }

  extractRoutes(ast, filePath, content) {
    const routes = [];
    const self = this;

    traverse(ast, {
      CallExpression(nodePath) {
        const { callee } = nodePath.node;
        
        // Express: app.get('/path', ...), router.post('/', ...)
        if (callee.type === 'MemberExpression') {
          const method = callee.property.name;
          if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'use'].includes(method)) {
            const args = nodePath.node.arguments;
            if (args.length >= 2) {
              const routePath = self.extractPath(args[0]);
              if (routePath) {
                const handler = self.extractHandler(args[args.length - 1]);
                const docBlock = self.extractComments(nodePath.node);
                const parameters = self.extractParamsFromContent(content, routePath);
                
                routes.push({
                  method: method === 'use' ? 'USE' : method.toUpperCase(),
                  path: routePath,
                  file: filePath,
                  line: nodePath.node.loc?.start?.line,
                  handler,
                  docBlock,
                  parameters,
                  imports: self.extractImports(ast),
                });
              }
            }
          }
        }

        // Fastify: fastify.get('/path', ...)
        if (callee.type === 'MemberExpression' && callee.object.name === 'fastify') {
          const method = callee.property.name;
          if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
            const args = nodePath.node.arguments;
            if (args.length >= 2) {
              const routePath = self.extractPath(args[0]);
              if (routePath) {
                const handler = self.extractHandler(args[args.length - 1]);
                const docBlock = self.extractComments(nodePath.node);
                const parameters = self.extractParamsFromContent(content, routePath);
                
                routes.push({
                  method: method.toUpperCase(),
                  path: routePath,
                  file: filePath,
                  line: nodePath.node.loc?.start?.line,
                  handler,
                  docBlock,
                  parameters,
                  imports: self.extractImports(ast),
                });
              }
            }
          }
        }
      },

      // NestJS: @Get('/path'), @Post()
      Decorator(nodePath) {
        const decorator = nodePath.node;
        const method = self.parseNestDecorator(decorator);
        if (method) {
          const route = self.parseNestRoute(nodePath, filePath, content, method);
          if (route) routes.push(route);
        }
      },
    });

    return routes.map(r => new Endpoint(r));
  }

  extractPath(arg) {
    if (arg.type === 'StringLiteral') return arg.value;
    if (arg.type === 'TemplateLiteral') {
      return arg.quasis.map(q => q.value.raw).join('{param}');
    }
    if (arg.type === 'ObjectExpression') {
      // Route avec paramètres dynamiques
      return '/{dynamic}';
    }
    return '/unknown';
  }

  extractHandler(node) {
    if (node.type === 'Identifier') return { name: node.name, type: 'named' };
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
      return { type: 'anonymous', name: 'anonymous' };
    }
    if (node.type === 'CallExpression') {
      return { type: 'method', name: node.callee.name };
    }
    return { type: 'unknown' };
  }

  extractComments(node) {
    return (node.leadingComments || []).map(c => c.value.trim()).join('\n');
  }

  extractParamsFromContent(content, routePath) {
    const params = [];
    
    // Path parameters
    const pathParams = routePath.match(/[:{](\w+)[}]?/g);
    if (pathParams) {
      pathParams.forEach(p => {
        params.push({ name: p.replace(/[:{}]/g, ''), in: 'path', required: true });
      });
    }

    // Query parameters
    const queryMatches = content.match(/req\.query\.([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (queryMatches) {
      queryMatches.forEach(match => {
        params.push({ name: match.replace('req.query.', ''), in: 'query', required: false });
      });
    }

    // Body parameters
    const bodyMatches = content.match(/req\.body\.([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (bodyMatches) {
      params.push({ in: 'body', properties: [...new Set(bodyMatches.map(m => m.replace('req.body.', '')))] });
    }

    return params;
  }

  extractImports(ast) {
    const imports = [];
    traverse(ast, {
      ImportDeclaration(nodePath) {
        imports.push({
          source: nodePath.node.source.value,
          specifiers: nodePath.node.specifiers.map(s => s.local.name),
        });
      },
    });
    return imports;
  }

  parseNestDecorator(decorator) {
    const args = decorator.arguments;
    if (!args || args.length === 0) return null;
    
    const method = args[0].type === 'StringLiteral' ? args[0].value : null;
    if (method) return method.toUpperCase();
    
    // Si pas de string, c'est peut-être une méthode sans chemin (GET, POST, etc.)
    const name = decorator.name;
    if (name && ['Get', 'Post', 'Put', 'Delete', 'Patch'].includes(name)) {
      return name.toUpperCase();
    }
    
    return null;
  }

  parseNestRoute(nodePath, filePath, content, method) {
    const classNode = nodePath.parentPath.parentPath.node;
    const methodName = nodePath.node.key.name;
    
    // Extrait le chemin depuis le décorateur
    const args = nodePath.node.arguments;
    const routePath = args.length > 0 ? this.extractPath(args[0]) : '/';
    
    const handler = { name: methodName, type: 'method' };
    const docBlock = this.extractComments(nodePath.node);
    
    return {
      method,
      path: routePath,
      file: filePath,
      line: nodePath.node.loc?.start?.line,
      handler,
      docBlock,
      parameters: [],
      imports: [],
    };
  }
}

module.exports = RouteParser;
