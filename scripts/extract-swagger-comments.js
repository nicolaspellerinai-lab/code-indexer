/**
 * Script pour extraire les commentaires Swagger des fichiers source
 * Extrait: @swagger comments, parameters, responses, definitions
 */

const fs = require('fs');
const path = require('path');

class SwaggerCommentExtractor {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.extractedData = {};
  }

  /**
   * Extrait tous les commentaires Swagger des fichiers source
   */
  extractAll() {
    console.log('🔍 Extraction des commentaires Swagger du code source...\n');

    const jsFiles = this.findJsFiles(this.projectPath);
    console.log(`  Fichiers JS trouvés: ${jsFiles.length}`);

    for (const file of jsFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const comments = this.extractSwaggerComments(content);
        
        if (comments.length > 0) {
          const relativePath = path.relative(this.projectPath, file);
          this.extractedData[relativePath] = comments;
          console.log(`  ✅ ${relativePath}: ${comments.length} blocs Swagger`);
        }
      } catch (error) {
        console.error(`  ❌ Erreur lors de l'extraction de ${file}:`, error.message);
      }
    }

    return this.extractedData;
  }

  /**
   * Trouve tous les fichiers JS dans le projet
   */
  findJsFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;

    let items;
    try {
      items = fs.readdirSync(dir);
    } catch (e) {
      console.warn(`  ⚠️ Cannot read directory ${dir}: ${e.message}`);
      return files;
    }
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      
      if (stat.isDirectory()) {
        // Skip node_modules and hidden directories, but NOT code_to_index
        if (item !== 'node_modules' && !item.startsWith('.') && item !== 'data') {
          this.findJsFiles(fullPath, files);
        }
      } else if (stat.isFile() && (item.endsWith('.js') || item.endsWith('.ts'))) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Extrait les commentaires Swagger d'un fichier
   */
  extractSwaggerComments(content) {
    const comments = [];
    
    // Regex pour trouver les blocs de commentaires Swagger
    // formats supportés:
    // /**
    //  * @swagger
    //  * ...
    //  */
    // et
    // /**
    //  * OpenAPI 3.0 style
    //  * ...
    //  */
    
    const swaggerBlockRegex = /\/\*\*[\s\S]*?\*\s*@swagger[\s\S]*?\*\//g;
    const matches = content.match(swaggerBlockRegex) || [];
    
    for (const match of matches) {
      const parsed = this.parseSwaggerBlock(match);
      if (parsed) {
        comments.push(parsed);
      }
    }
    
    return comments;
  }

  /**
   * Parse un bloc de commentaire Swagger
   */
  parseSwaggerBlock(comment) {
    // Nettoyer le commentaire
    let cleaned = comment
      .replace(/\/\*\*\s*/, '')
      .replace(/\*\//, '')
      .replace(/^\s*\*/gm, '')
      .trim();
    
    // Essayer de parser comme YAML (format Swagger 2.0)
    const result = this.parseYamlFormat(cleaned);
    
    if (result) {
      return {
        raw: cleaned,
        parsed: result,
        type: 'swagger2'
      };
    }
    
    return null;
  }

  /**
   * Parse le format YAML des commentaires Swagger
   */
  parseYamlFormat(content) {
    try {
      // Convertir le format Swagger en objet
      const lines = content.split('\n');
      let currentPath = '';
      let currentMethod = '';
      let currentEndpoint = null;
      let inParameters = false;
      let inResponses = false;
      
      const paths = {};
      let definitions = {};
      let currentDefinition = null;
      let inDefinition = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Détecter le path
        if (line.match(/^\/\S+:/)) {
          currentPath = line.replace(/:$/, '');
          if (!paths[currentPath]) {
            paths[currentPath] = {};
          }
          inParameters = false;
          inResponses = false;
        }
        
        // Détecter la méthode HTTP
        const methodMatch = line.match(/^(get|post|put|delete|patch|head|options):/i);
        if (methodMatch) {
          currentMethod = methodMatch[1].toLowerCase();
          paths[currentPath][currentMethod] = {
            summary: '',
            description: '',
            tags: [],
            parameters: [],
            responses: {}
          };
          inParameters = false;
          inResponses = false;
        }
        
        // Summary et description
        if (currentMethod && line.startsWith('summary:')) {
          paths[currentPath][currentMethod].summary = line.replace('summary:', '').trim();
        }
        if (currentMethod && line.startsWith('description:')) {
          paths[currentPath][currentMethod].description = line.replace('description:', '').trim();
        }
        
        // Tags
        if (currentMethod && line.startsWith('tags:')) {
          // Lire les lignes suivantes pour les tags
          let j = i + 1;
          while (j < lines.length && lines[j].trim().startsWith('-')) {
            const tag = lines[j].trim().replace(/^-\s*/, '');
            paths[currentPath][currentMethod].tags.push(tag);
            j++;
          }
        }
        
        // Parameters
        if (currentMethod && line.startsWith('parameters:')) {
          inParameters = true;
          inResponses = false;
          continue;
        }
        
        if (inParameters && line.startsWith('-')) {
          const param = this.parseParameter(lines, i);
          if (param) {
            paths[currentPath][currentMethod].parameters.push(param);
            i = param._endLine || i;
          }
        }
        
        // Responses
        if (currentMethod && line.startsWith('responses:')) {
          inResponses = true;
          inParameters = false;
          continue;
        }
        
        if (inResponses && line.match(/^\d{3}:/)) {
          const statusCode = line.replace(/:$/, '').trim();
          paths[currentPath][currentMethod].responses[statusCode] = {
            description: ''
          };
          
          // Lire la description sur les lignes suivantes
          let j = i + 1;
          while (j < lines.length && !lines[j].trim().match(/^\d{3}:/) && !lines[j].trim().startsWith('parameters:') && !lines[j].trim().startsWith('- ')) {
            if (lines[j].trim().startsWith('description:')) {
              paths[currentPath][currentMethod].responses[statusCode].description = 
                lines[j].trim().replace('description:', '').trim();
            }
            j++;
          }
        }
        
        // Definitions
        if (line.match(/^definitions:/) || line.match(/^components:/)) {
          inDefinition = true;
          continue;
        }
        
        if (inDefinition && line.match(/^[A-Z][a-zA-Z]+:/)) {
          currentDefinition = line.replace(/:$/, '').trim();
          definitions[currentDefinition] = {
            type: 'object',
            properties: {}
          };
        }
      }
      
      // Retourner le résultat s'il y a des paths
      const hasPaths = Object.keys(paths).length > 0;
      const hasDefinitions = Object.keys(definitions).length > 0;
      
      if (hasPaths || hasDefinitions) {
        return {
          paths,
          definitions,
          _lineCount: lines.length
        };
      }
      
    } catch (error) {
      // Erreur de parsing, retourner null
    }
    
    return null;
  }

  /**
   * Parse un paramètre
   */
  parseParameter(lines, startIndex) {
    const param = {
      name: '',
      in: 'query',
      required: false,
      type: 'string',
      description: ''
    };
    
    // Lire le nom du paramètre
    let line = lines[startIndex].trim().replace(/^-\s*/, '');
    param.name = line.replace('name:', '').trim();
    
    // Lire les propriétés du paramètre
    for (let i = startIndex + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      
      if (l.startsWith('in:')) {
        param.in = l.replace('in:', '').trim();
      }
      if (l.startsWith('required:')) {
        param.required = l.replace('required:', '').trim() === 'true';
      }
      if (l.startsWith('type:')) {
        param.type = l.replace('type:', '').trim();
      }
      if (l.startsWith('description:')) {
        param.description = l.replace('description:', '').trim();
      }
      
      // Fin du paramètre (nouveau bloc ou fin)
      if (l.match(/^- [a-zA-Z]/) || i - startIndex > 10) {
        param._endLine = i;
        break;
      }
    }
    
    return param.name ? param : null;
  }

  /**
   * Sauvegarde les données extraites
   */
  save(outputPath) {
    const output = {
      extractedAt: new Date().toISOString(),
      files: this.extractedData
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n💾 Commentaires Swagger sauvegardés: ${outputPath}`);
  }

  /**
   * Génère un rapport
   */
  generateReport() {
    console.log('\n📊 RAPPORT D\'EXTRACTION DES COMMENTAIRES SWAGGER');
    console.log('='.repeat(60));

    let totalBlocks = 0;
    let totalPaths = 0;

    for (const [file, comments] of Object.entries(this.extractedData)) {
      totalBlocks += comments.length;
      
      for (const comment of comments) {
        if (comment.parsed && comment.parsed.paths) {
          totalPaths += Object.keys(comment.parsed.paths).length;
        }
      }
    }

    console.log(`\n📁 Fichiers avec Swagger: ${Object.keys(this.extractedData).length}`);
    console.log(`📝 Blocs Swagger: ${totalBlocks}`);
    console.log(`🛤️ Paths extraits: ${totalPaths}`);
  }
}

// Exécution
const projectPath = path.join(process.cwd(), 'code_to_index');
const outputPath = path.join(process.cwd(), 'data', 'extracted-swagger-comments.json');

const extractor = new SwaggerCommentExtractor(projectPath);
const data = extractor.extractAll();

if (data) {
  extractor.save(outputPath);
  extractor.generateReport();
}

module.exports = { SwaggerCommentExtractor };
