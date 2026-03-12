/**
 * RouteParser - Parser de routes basé sur AST Babel
 * Supporte Express, NestJS, Fastify et Koa
 */

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const types = require('@babel/types');
const path = require('path');

class RouteParser {
  constructor(projectPath = null) {
    this.projectPath = projectPath;
    this.endpoints = [];
    this.framework = 'unknown';
  }

  /**
   * Parse un fichier source et extrait les routes
   * @param {string} filePath - Chemin du fichier
   * @param {string} sourceCode - Code source du fichier
   * @returns {Endpoint[]} Tableau des endpoints trouvés
   */
  parse(filePath, sourceCode) {
    this.endpoints = [];
    this.framework = 'unknown';
    
    if (!sourceCode || typeof sourceCode !== 'string') {
      console.warn(`⚠️ No source code provided for ${filePath}`);
      return this.endpoints;
    }

    try {
      // Détecter le framework
      this.detectFramework(sourceCode);
      
      // Parser le code en AST
      const ast = this.parseAST(sourceCode, filePath);
      if (!ast) {
        return this.endpoints;
      }
      
      // Extraire les routes selon le framework
      this.traverseAST(ast, sourceCode, filePath);
      
    } catch (error) {
      console.error(`❌ Error parsing ${filePath}:`, error.message);
    }
    
    return this.endpoints;
  }

  /**
   * Parse le code source en AST
   */
  parseAST(sourceCode, filePath) {
    try {
      return parser.parse(sourceCode, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'dynamicImport', 
          'exportDefaultFrom',
          'decorators-legacy',
          'classProperties'
        ],
        sourceFilename: filePath
      });
    } catch (error) {
      // Essayer sans les plugins optionnels
      try {
        return parser.parse(sourceCode, {
          sourceType: 'module',
          sourceFilename: filePath
        });
      } catch (fallbackError) {
        console.error(`❌ AST parsing failed for ${filePath}:`, fallbackError.message);
        return null;
      }
    }
  }

  /**
   * Détecte le framework utilisé dans le fichier
   */
  detectFramework(sourceCode) {
    if (sourceCode.includes('express.Router') || sourceCode.includes('router.get') || sourceCode.includes('router.post')) {
      this.framework = 'express';
    } else if (sourceCode.includes('@Controller') || sourceCode.includes('@Get(') || sourceCode.includes('@Post(')) {
      this.framework = 'nestjs';
    } else if (sourceCode.includes('fastify.get') || sourceCode.includes('fastify.post')) {
      this.framework = 'fastify';
    } else if (sourceCode.includes('koa-router') || sourceCode.includes('Router')) {
      this.framework = 'koa';
    } else {
      this.framework = 'express'; // Default fallback
    }
    console.log(`  🔍 Framework détecté: ${this.framework}`);
  }

  /**
   * Parcourt l'AST pour trouver les routes
   */
  traverseAST(ast, sourceCode, filePath) {
    const self = this;
    
    traverse(ast, {
      // Pour Express: router.get('/path', middleware1, middleware2, handler)
      CallExpression(path) {
        const callee = path.get('callee');
        
        if (!callee.node) return;
        
        // Vérifier si c'est un appel de méthode de route
        if (types.isMemberExpression(callee.node)) {
          const object = callee.get('object');
          const property = callee.get('property');
          
          // Extraire le nom du router (router, app, etc.)
          let routerName = null;
          if (types.isIdentifier(object.node)) {
            routerName = object.node.name;
          }
          
          // Méthodes HTTP supportées
          const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
          const method = property.node?.name?.toLowerCase();
          
          if (httpMethods.includes(method)) {
            // Extraire le chemin
            const pathArg = path.get('arguments')[0];
            let routePath = self.extractRoutePath(pathArg);
            
            if (!routePath) return;
            
            // Extraire les middleware
            const middleware = self.extractMiddleware(path, sourceCode);
            
            // Extraire le handler (fonction)
            const handler = self.extractHandler(path);
            
            // Créer l'endpoint
            const endpoint = {
              id: `${method.toUpperCase()}-${routePath}`.replace(/[^a-zA-Z0-9-]/g, '-'),
              path: routePath,
              method: method.toUpperCase(),
              file: filePath || '',
              line: path.node.loc?.start?.line || 0,
              framework: self.framework,
              middleware: middleware.names,
              middlewareLines: middleware.lines,
              handler: handler,
              description: '',
              parameters: [],
              responses: [],
              tags: [],
              dependencies: []
            };
            
            self.endpoints.push(endpoint);
          }
        }
        
        // Pour NestJS: @Get('/path') decorator (traité séparément via Decorator)
      }
    });
    
    // Traiter les décorateurs NestJS séparément
    this.extractNestJSRoutes(ast, sourceCode, filePath);
  }

  /**
   * Extrait les routes NestJS via les décorateurs
   */
  extractNestJSRoutes(ast, sourceCode, filePath) {
    const self = this;
    let controllerPath = '';
    
    traverse(ast, {
      // Trouver le chemin du Controller
      ClassDeclaration(path) {
        if (path.node.decorators) {
          for (const decorator of path.node.decorators) {
            if (types.isCallExpression(decorator.expression) && 
                types.isIdentifier(decorator.expression.callee) &&
                decorator.expression.callee.name === 'Controller') {
              // Extraire le chemin du controller
              const args = decorator.expression.arguments || [];
              if (args.length > 0 && types.isStringLiteral(args[0])) {
                controllerPath = args[0].value;
              }
            }
          }
        }
      },
      
      // Trouver les méthodes avec décorateurs HTTP
      ClassMethod(path) {
        if (path.node.decorators) {
          for (const decorator of path.node.decorators) {
            let httpMethod = null;
            let routePath = '';
            
            if (types.isCallExpression(decorator.expression) && 
                types.isIdentifier(decorator.expression.callee)) {
              const decoratorName = decorator.expression.callee.name;
              
              if (['Get', 'Post', 'Put', 'Delete', 'Patch', 'Head', 'Options'].includes(decoratorName)) {
                httpMethod = decoratorName.toUpperCase();
                
                // Extraire le chemin de la route
                const args = decorator.expression.arguments || [];
                if (args.length > 0 && types.isStringLiteral(args[0])) {
                  routePath = args[0].value;
                }
              }
            }
            
            if (httpMethod) {
              const fullPath = controllerPath + (routePath || '');
              const methodName = path.node.key?.name || 'anonymous';
              
              self.endpoints.push({
                id: `${httpMethod}-${fullPath}`.replace(/[^a-zA-Z0-9-]/g, '-'),
                path: fullPath,
                method: httpMethod,
                file: filePath || '',
                line: path.node.loc?.start?.line || 0,
                framework: 'nestjs',
                middleware: [],
                middlewareLines: [],
                handler: {
                  type: 'method',
                  name: methodName,
                  line: path.node.loc?.start?.line || 0
                },
                description: '',
                parameters: [],
                responses: [],
                tags: [],
                dependencies: []
              });
            }
          }
        }
      }
    });
  }

  /**
   * Extrait le chemin de la route depuis un argument
   */
  extractRoutePath(pathArg) {
    if (!pathArg || !pathArg.node) return '/';
    
    const node = pathArg.node;
    
    if (types.isStringLiteral(node)) {
      return node.value;
    }
    
    if (types.isTemplateLiteral(node)) {
      // Gérer les template literals simples
      if (node.quasis && node.quasis.length > 0) {
        return node.quasis[0].value.cooked;
      }
    }
    
    // Pour les variables dynamiques (non supporté complètement)
    return null;
  }

  /**
   * Extrait les noms et lignes des middleware
   */
  extractMiddleware(path, sourceCode) {
    const middleware = [];
    const middlewareLines = [];
    
    // Les arguments entre le chemin et le handler sont des middleware
    const args = path.get('arguments');
    
    if (!args || args.length < 3) {
      return { names: middleware, lines: middlewareLines };
    }
    
    // Les arguments 1 à length-1 sont des middleware (sauf le dernier qui est le handler)
    for (let i = 1; i < args.length - 1; i++) {
      const arg = args[i];
      const node = arg?.node;
      
      if (!node) continue;
      
      if (types.isIdentifier(node)) {
        middleware.push(node.name);
        middlewareLines.push(node.loc?.start?.line || 0);
      } else if (types.isArrayExpression(node)) {
        // Gérer les tableaux de middleware comme [auth, validatePermission(...)]
        if (node.elements) {
          node.elements.forEach(elem => {
            if (!elem) return;
            
            if (types.isIdentifier(elem)) {
              middleware.push(elem.name);
              middlewareLines.push(elem.loc?.start?.line || 0);
            } else if (types.isCallExpression(elem)) {
              // Appels de fonction comme validatePermission([['elector', 'view']])
              if (types.isIdentifier(elem.callee)) {
                middleware.push(elem.callee.name);
                middlewareLines.push(elem.loc?.start?.line || 0);
              }
            }
          });
        }
      } else if (types.isCallExpression(node)) {
        // Appels de fonction middleware
        if (types.isIdentifier(node.callee)) {
          middleware.push(node.callee.name);
          middlewareLines.push(node.loc?.start?.line || 0);
        }
      }
    }
    
    return { names: middleware, lines: middlewareLines };
  }

  /**
   * Extrait le handler de la route (dernier argument)
   */
  extractHandler(path) {
    const args = path.get('arguments');
    const handlerArg = args[args.length - 1];
    
    if (!handlerArg || !handlerArg.node) return null;
    
    const node = handlerArg.node;
    
    if (types.isIdentifier(node)) {
      return {
        type: 'reference',
        name: node.name,
        line: node.loc?.start?.line || 0
      };
    }
    
    if (types.isFunctionExpression(node) || types.isArrowFunctionExpression(node)) {
      // Essayer d'extraire le nom de la fonction
      const parent = path.parent;
      let functionName = 'anonymous';
      
      if (parent && types.isVariableDeclarator(parent.node)) {
        functionName = parent.node.id?.name || 'anonymous';
      }
      
      return {
        type: 'inline',
        name: functionName,
        line: node.loc?.start?.line || 0,
        params: this.extractFunctionParams(node),
        body: this.extractFunctionBody(node)
      };
    }
    
    return null;
  }

  /**
   * Extrait les paramètres d'une fonction
   */
  extractFunctionParams(node) {
    if (!node.params) return [];
    
    return node.params.map(param => {
      if (types.isIdentifier(param)) {
        return { name: param.name, type: 'unknown' };
      }
      if (types.isAssignmentPattern(param)) {
        return {
          name: param.left?.name || 'param',
          type: 'optional',
          default: this.extractDefaultValue(param.right)
        };
      }
      return { name: 'param', type: 'unknown' };
    });
  }

  /**
   * Extrait la valeur par défaut d'un paramètre
   */
  extractDefaultValue(node) {
    if (!node) return undefined;
    
    if (types.isStringLiteral(node)) return node.value;
    if (types.isNumericLiteral(node)) return node.value;
    if (types.isBooleanLiteral(node)) return node.value;
    if (types.isNullLiteral(node)) return null;
    
    return undefined;
  }

  /**
   * Extrait le corps de la fonction pour analyse des dépendances
   */
  extractFunctionBody(node) {
    if (!node.body) return null;
    
    const body = node.body;
    const calls = [];
    
    if (types.isBlockStatement(body)) {
      body.body.forEach(statement => {
        if (types.isExpressionStatement(statement)) {
          let expr = statement.expression;
          if (types.isAwaitExpression(expr)) {
            expr = expr.argument;
          }
          if (types.isCallExpression(expr)) {
            let calleeName = null;
            if (types.isIdentifier(expr.callee)) {
              calleeName = expr.callee.name;
            } else if (types.isMemberExpression(expr.callee)) {
              // db.User.findAll -> db.User
              const obj = expr.callee.object;
              const prop = expr.callee.property;
              if (types.isIdentifier(obj) && types.isIdentifier(prop)) {
                calleeName = `${obj.name}.${prop.name}`;
              }
            }
            
            if (calleeName) {
              calls.push({
                name: calleeName,
                line: expr.loc?.start?.line || 0
              });
            }
          }
        }
      });
    }
    
    return calls;
  }

  /**
   * Trouve les fichiers de routes dans le projet
   * @returns {string[]} Tableau des chemins de fichiers
   */
  async findRouteFiles() {
    const fs = require('fs');
    const routeFiles = [];
    
    // If projectPath is a single file, use it directly
    if (this.projectPath && fs.existsSync(this.projectPath)) {
      const stat = fs.statSync(this.projectPath);
      if (stat.isFile() && this.projectPath.endsWith('.js')) {
        routeFiles.push(this.projectPath);
      } else if (stat.isDirectory()) {
        // Scan directory for .js files
        const files = this.scanDirectory(this.projectPath);
        routeFiles.push(...files);
      }
    }
    
    return routeFiles;
  }

  /**
   * Scan directory recursively for JS files
   */
  scanDirectory(dir, files = []) {
    const fs = require('fs');
    if (!fs.existsSync(dir)) return files;
    
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = require('path').join(dir, item);
      const stat = fs.statSync(fullPath);
      
      // Skip node_modules and hidden directories
      if (stat.isDirectory()) {
        if (item !== 'node_modules' && !item.startsWith('.')) {
          this.scanDirectory(fullPath, files);
        }
      } else if (stat.isFile() && item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  /**
   * Getter pour la compatibilité avec le pipeline
   */
  get routes() {
    return this.endpoints;
  }

  /**
   * Méthode de compatibilité pour parser un fichier
   */
  async parseFile(filePath) {
    const fs = require('fs').promises;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parse(filePath, content);
    } catch (error) {
      console.error(`❌ Error reading ${filePath}:`, error.message);
      return [];
    }
  }

  /**
   * Run method for compatibility
   */
  async run() {
    console.log('🔍 Starting AST route parsing...');
    console.log(`✨ Found ${this.endpoints.length} routes`);
    return this.endpoints;
  }
}

module.exports = RouteParser;
