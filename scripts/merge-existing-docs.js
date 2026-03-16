/**
 * Script pour fusionner les informations extraites des fichiers de documentation
 * avec la documentation générée par le LLM
 * 
 * Ajoute: header params, body schemas, response format, definitions
 */

const fs = require('fs');
const path = require('path');

class DocMerger {
  constructor() {
    this.existingDocs = null;
    this.llmDocs = null;
  }

  /**
   * Charge les données
   */
  loadData() {
    console.log('📂 Chargement des données...\n');

    // Charger les documents existants
    const existingPath = path.join(process.cwd(), 'data', 'extracted-existing-docs.json');
    if (fs.existsSync(existingPath)) {
      this.existingDocs = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
      console.log(`  ✅ Documents existants chargés: ${Object.keys(this.existingDocs.entities).length} entités`);
    } else {
      console.error(`  ❌ Fichier non trouvé: ${existingPath}`);
      return false;
    }

    // Charger les documents LLM (relationships)
    const llmPath = path.join(process.cwd(), 'data', 'relationships.json');
    if (fs.existsSync(llmPath)) {
      this.llmDocs = JSON.parse(fs.readFileSync(llmPath, 'utf-8'));
      console.log(`  ✅ Documents LLM chargés: ${this.llmDocs.length} endpoints`);
    } else {
      console.error(`  ❌ Fichier non trouvé: ${llmPath}`);
      return false;
    }

    return true;
  }

  /**
   * Fusionne les données
   */
  merge() {
    console.log('\n🔄 Fusion des données...\n');

    // Créer un index des documents existants par endpoint
    const existingIndex = this.buildExistingIndex();

    // Fusionner avec chaque endpoint LLM
    const mergedDocs = this.llmDocs.map(endpoint => {
      const endpointKey = endpoint.endpoint;
      const existingData = existingIndex[endpointKey];

      if (!existingData) {
        // Pas de correspondance, retourner tel quel
        return endpoint;
      }

      // Fusionner les informations
      return this.mergeEndpoint(endpoint, existingData);
    });

    console.log(`  ✅ ${mergedDocs.length} endpoints fusionnés`);

    return mergedDocs;
  }

  /**
   * Construit un index des documents existants
   */
  buildExistingIndex() {
    const index = {};

    for (const [entityName, entityData] of Object.entries(this.existingDocs.entities)) {
      for (const [endpointKey, endpointData] of Object.entries(entityData.paths)) {
        index[endpointKey] = {
          entity: entityName,
          ...endpointData
        };
      }
    }

    return index;
  }

  /**
   * Fusionne les données d'un endpoint
   */
  mergeEndpoint(llmEndpoint, existingEndpoint) {
    const merged = { ...llmEndpoint };

    // Ajouter le flag pour indiquer que les données ont été fusionnées
    merged.mergedFromExisting = true;

    // Créer l'enrichissement existant
    const existingEnrichment = {};

    // 1. Ajouter les header parameters
    if (existingEndpoint.parameters.header && existingEndpoint.parameters.header.length > 0) {
      existingEnrichment.headerParameters = existingEndpoint.parameters.header;
    }

    // 2. Ajouter les body schemas
    if (existingEndpoint.parameters.body && existingEndpoint.parameters.body.schema) {
      existingEnrichment.bodySchema = existingEndpoint.parameters.body;
    }

    // 3. Ajouter les query parameters
    if (existingEndpoint.parameters.query && existingEndpoint.parameters.query.length > 0) {
      existingEnrichment.queryParameters = existingEndpoint.parameters.query;
    }

    // 4. Ajouter les path parameters
    if (existingEndpoint.parameters.path && existingEndpoint.parameters.path.length > 0) {
      existingEnrichment.pathParameters = existingEndpoint.parameters.path;
    }

    // 5. Ajouter les responses avec le format complet
    if (existingEndpoint.responses) {
      existingEnrichment.responses = existingEndpoint.responses;
    }

    // 6. Ajouter les tags si présents
    if (existingEndpoint.tags && existingEndpoint.tags.length > 0) {
      existingEnrichment.tags = existingEndpoint.tags;
    }

    // 7. Ajouter la description si absente du LLM
    if (existingEndpoint.description && !merged.llmEnrichment?.description) {
      existingEnrichment.description = existingEndpoint.description;
    }

    // Stocker les données existantes dans l'endpoint
    merged.existingEnrichment = existingEnrichment;

    // Si pas de llmEnrichment, créer une base
    if (!merged.llmEnrichment) {
      merged.llmEnrichment = {};
    }

    // Enrichir le llmEnrichment avec les données existantes
    if (existingEnrichment.headerParameters && !merged.llmEnrichment.security) {
      // Ajouter le security header
      merged.llmEnrichment.security = [{ bearerAuth: [] }];
    }

    if (existingEnrichment.bodySchema && !merged.llmEnrichment.inputSchema?.body) {
      if (!merged.llmEnrichment.inputSchema) {
        merged.llmEnrichment.inputSchema = {};
      }
      merged.llmEnrichment.inputSchema.body = existingEnrichment.bodySchema;
    }

    if (existingEnrichment.responses && !merged.llmEnrichment.responses?.['200']?.schema) {
      // Les réponses existantes sont plus complètes, les ajouter
      if (!merged.llmEnrichment.responses) {
        merged.llmEnrichment.responses = {};
      }
      // Garder les réponses LLM mais enrichir avec les exemples existants
      for (const [status, response] of Object.entries(existingEnrichment.responses)) {
        if (response.schema && !merged.llmEnrichment.responses[status]) {
          merged.llmEnrichment.responses[status] = {
            description: response.description,
            schema: response.schema
          };
        }
      }
    }

    return merged;
  }

  /**
   * Sauvegarde les données fusionnées
   */
  save(mergedDocs) {
    // Sauvegarder le fichier fusionné
    const mergedPath = path.join(process.cwd(), 'data', 'relationships-merged.json');
    fs.writeFileSync(mergedPath, JSON.stringify(mergedDocs, null, 2));
    console.log(`\n💾 Documentation fusionnée sauvegardée: ${mergedPath}`);

    // Sauvegarder par entité
    this.saveByEntity(mergedDocs);

    return mergedPath;
  }

  /**
   * Sauvegarde les fichiers par entité
   */
  saveByEntity(mergedDocs) {
    const entityDir = path.join(process.cwd(), 'data', 'relationships-merged-by-entity');
    
    // Créer le répertoire
    if (!fs.existsSync(entityDir)) {
      fs.mkdirSync(entityDir, { recursive: true });
    }

    // Grouper par entité
    const entities = {};

    for (const doc of mergedDocs) {
      // Extraire l'entité du path
      const match = doc.endpoint.match(/\/api\/crm\/([^\/]+)/);
      const entity = match ? match[1] : 'unknown';

      if (!entities[entity]) {
        entities[entity] = [];
      }

      entities[entity].push(doc);
    }

    // Sauvegarder chaque entité
    for (const [entityName, docs] of Object.entries(entities)) {
      const entityPath = path.join(entityDir, `${entityName}.json`);
      fs.writeFileSync(entityPath, JSON.stringify(docs, null, 2));
      console.log(`  📁 ${entityName}.json (${docs.length} endpoints)`);
    }

    // Sauvegarder le résumé
    const summary = {
      generatedAt: new Date().toISOString(),
      totalEndpoints: mergedDocs.length,
      entities: Object.keys(entities).map(e => ({
        name: e,
        count: entities[e].length
      }))
    };
    fs.writeFileSync(
      path.join(entityDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );
  }

  /**
   * Génère un rapport
   */
  generateReport(mergedDocs) {
    console.log('\n📊 RAPPORT DE FUSION');
    console.log('='.repeat(60));

    let withHeader = 0;
    let withBody = 0;
    let withResponses = 0;

    for (const doc of mergedDocs) {
      if (doc.existingEnrichment?.headerParameters) withHeader++;
      if (doc.existingEnrichment?.bodySchema) withBody++;
      if (doc.existingEnrichment?.responses) withResponses++;
    }

    console.log(`\n📈 STATISTIQUES:`);
    console.log(`   Total endpoints: ${mergedDocs.length}`);
    console.log(`   Avec header Authorization: ${withHeader} (${Math.round(withHeader/mergedDocs.length*100)}%)`);
    console.log(`   Avec body schema: ${withBody} (${Math.round(withBody/mergedDocs.length*100)}%)`);
    console.log(`   Avec response format: ${withResponses} (${Math.round(withResponses/mergedDocs.length*100)}%)`);
  }

  /**
   * Affiche un exemple de fusion
   */
  showExample(mergedDocs) {
    // Trouver un endpoint avec header et body
    const example = mergedDocs.find(d => 
      d.existingEnrichment?.headerParameters && 
      d.existingEnrichment?.bodySchema
    );

    if (example) {
      console.log('\n📝 EXEMPLE DE FUSION:');
      console.log(`   Endpoint: ${example.endpoint}`);
      console.log(`\n   Header Parameters:`);
      console.log(JSON.stringify(example.existingEnrichment.headerParameters, null, 4));
      console.log(`\n   Body Schema:`);
      console.log(JSON.stringify(example.existingEnrichment.bodySchema, null, 4));
    }
  }
}

// Exécution
const merger = new DocMerger();

if (merger.loadData()) {
  const mergedDocs = merger.merge();
  merger.save(mergedDocs);
  merger.generateReport(mergedDocs);
  merger.showExample(mergedDocs);
}

module.exports = { DocMerger };
