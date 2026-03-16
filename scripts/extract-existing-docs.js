/**
 * Script pour extraire les informations des fichiers de documentation existants
 * Extrait: header params, body schemas, response format, definitions
 */

const fs = require('fs');
const path = require('path');

class ExistingDocExtractor {
  constructor(docsPath) {
    this.docsPath = docsPath;
    this.extractedData = {};
  }

  /**
   * Extrait toutes les informations des fichiers de documentation
   */
  extractAll() {
    console.log('📚 Extraction des informations des fichiers de documentation existants...\n');

    if (!fs.existsSync(this.docsPath)) {
      console.error(`❌ Dossier de documentation non trouvé: ${this.docsPath}`);
      return null;
    }

    const files = fs.readdirSync(this.docsPath).filter(f => f.endsWith('.json'));
    console.log(`  Fichiers trouvés: ${files.length}`);

    for (const file of files) {
      const filePath = path.join(this.docsPath, file);
      const entityName = path.basename(file, '.json');
      
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.extractedData[entityName] = this.extractFromSwagger(content, entityName);
        console.log(`  ✅ ${entityName}: ${Object.keys(this.extractedData[entityName].paths).length} endpoints extraits`);
      } catch (error) {
        console.error(`  ❌ Erreur lors de l'extraction de ${file}:`, error.message);
      }
    }

    return this.extractedData;
  }

  /**
   * Extrait les informations d'un fichier Swagger
   */
  extractFromSwagger(swagger, entityName) {
    const result = {
      entity: entityName,
      info: swagger.info || {},
      paths: {},
      definitions: swagger.definitions || {}
    };

    // Extraire les informations de chaque path
    if (swagger.paths) {
      for (const [pathKey, methods] of Object.entries(swagger.paths)) {
        for (const [method, details] of Object.entries(methods)) {
          const endpointKey = `${method.toUpperCase()} ${pathKey}`;
          
          result.paths[endpointKey] = {
            summary: details.summary || '',
            description: details.description || '',
            tags: details.tags || [],
            parameters: this.extractParameters(details.parameters || []),
            responses: this.extractResponses(details.responses || {}),
            security: details.security || []
          };
        }
      }
    }

    return result;
  }

  /**
   * Extrait les paramètres (header, path, query, body)
   */
  extractParameters(parameters) {
    const result = {
      header: [],
      path: [],
      query: [],
      body: null
    };

    for (const param of parameters) {
      const paramInfo = {
        name: param.name,
        in: param.in,
        required: param.required || false,
        type: param.type || 'string',
        description: param.description || ''
      };

      if (param.in === 'header') {
        result.header.push(paramInfo);
      } else if (param.in === 'path') {
        result.path.push(paramInfo);
      } else if (param.in === 'query') {
        result.query.push(paramInfo);
      } else if (param.in === 'body') {
        result.body = {
          required: param.required || false,
          description: param.description || '',
          schema: param.schema || null
        };
      }
    }

    return result;
  }

  /**
   * Extrait les réponses
   */
  extractResponses(responses) {
    const result = {};

    for (const [statusCode, details] of Object.entries(responses)) {
      result[statusCode] = {
        description: details.description || '',
        schema: details.schema || null,
        examples: details.examples || null
      };
    }

    return result;
  }

  /**
   * Sauvegarde les données extraites
   */
  save(outputPath) {
    const output = {
      extractedAt: new Date().toISOString(),
      entities: this.extractedData
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n💾 Données extraites sauvegardées: ${outputPath}`);
  }

  /**
   * Génère un rapport des informations extraites
   */
  generateReport() {
    console.log('\n📊 RAPPORT D\'EXTRACTION');
    console.log('='.repeat(60));

    let totalEndpoints = 0;
    let totalWithHeader = 0;
    let totalWithBody = 0;
    let totalWithDefinitions = 0;

    for (const [entityName, data] of Object.entries(this.extractedData)) {
      const endpoints = Object.keys(data.paths);
      totalEndpoints += endpoints.length;

      let entityWithHeader = 0;
      let entityWithBody = 0;

      for (const [endpointKey, endpoint] of Object.entries(data.paths)) {
        if (endpoint.parameters.header.length > 0) {
          entityWithHeader++;
          totalWithHeader++;
        }
        if (endpoint.parameters.body) {
          entityWithBody++;
          totalWithBody++;
        }
      }

      const definitionsCount = Object.keys(data.definitions).length;
      totalWithDefinitions += definitionsCount;

      console.log(`\n📁 ${entityName}:`);
      console.log(`   Endpoints: ${endpoints.length}`);
      console.log(`   Avec header Authorization: ${entityWithHeader}`);
      console.log(`   Avec body schema: ${entityWithBody}`);
      console.log(`   Definitions: ${definitionsCount}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📈 TOTAL:`);
    console.log(`   Endpoints: ${totalEndpoints}`);
    console.log(`   Avec header Authorization: ${totalWithHeader}`);
    console.log(`   Avec body schema: ${totalWithBody}`);
    console.log(`   Definitions: ${totalWithDefinitions}`);
  }
}

// Exécution
const docsPath = path.join(process.cwd(), 'code_to_index', 'documentation');
const outputPath = path.join(process.cwd(), 'data', 'extracted-existing-docs.json');

const extractor = new ExistingDocExtractor(docsPath);
const data = extractor.extractAll();

if (data) {
  extractor.save(outputPath);
  extractor.generateReport();
}

module.exports = { ExistingDocExtractor };
