# Code Indexer

Outil d'indexation de codebase Node.js pour la génération de documentation et l'analyse de dépendances.

## Installation

```bash
cd travaux/code-indexer
npm install
```

## Utilisation

Pour indexer un projet existant :

```bash
node scripts/index-project.js /chemin/vers/votre/projet
```

## Fonctionnalités

1. **Scan de routes** : Détecte automatiquement les routes Express/NestJS/Fastify.
2. **Analyse de dépendances** : Identifie les appels de base de données, services internes et endpoints externes.
3. **Indexation Vectorielle** : Stocke les endpoints dans ChromaDB pour la recherche sémantique (RAG).
4. **Génération OpenAPI** : Produit une spécification OpenAPI (Swagger) préliminaire basée sur l'analyse statique.

## Structure

- `src/parsers/` : Logique d'extraction (routes, dépendances).
- `src/models/` : Modèles de données (Endpoint).
- `src/vectorStore/` : Client ChromaDB.
- `src/generators/` : Génération de documentation.
- `data/` : Résultats (JSON, logs).

## Prérequis

- Node.js >= 18
- Docker (pour ChromaDB)

## Scripts disponibles

- `npm run index` : Lance l'indexation d'un projet
- `npm run test` : Test avec projet d'exemple
- `npm run search` : Recherche sémantique dans les endpoints indexés
- `npm run generate-doc` : Génération de documentation
- `npm run chroma:start` : Démarre ChromaDB
- `npm run chroma:stop` : Arrête ChromaDB

## Exemple

```bash
# Lancer ChromaDB
npm run chroma:start

# Indexer un projet
node scripts/index-project.js ../mon-app-nodejs

# Rechercher des endpoints
node scripts/search-endpoints.js 'users'

# Générer la documentation
node scripts/generate-doc.js generate '/users' GET
```

## Sorties

Après exécution, le projet génère :

- `data/relationships.json` : Graphe des dépendances
- `data/generated-openapi.json` : Spécification OpenAPI
- `data/endpoints.json` : Liste détaillée des endpoints trouvés

## Frameworks supportés

- Express.js (routes classiques)
- NestJS (décorateurs @Get, @Post, etc.)
- Fastify (méthodes get/post/put/delete)
- Koa.js (routes similaires)

Le parseur détecte automatiquement le framework utilisé dans chaque fichier.

## Prochaines étapes

Ce projet est la première phase d'une stratégie plus large :

1. **Indexation** (ce projet)
2. **Documentation augmentée** (compléter avec LLM)
3. **Génération de workflows** (automatisation)
4. **Interface utilisateur** (exploration graphique)

Vous pouvez maintenant passer à la phase 2 : enrichir la documentation générée avec des LLMs pour compléter les endpoints manquants et améliorer les descriptions.

---

**Note** : Ce projet est une POC fonctionnelle. Pour une production, vous pourriez vouloir ajouter :
- Tests unitaires
- Support de TypeScript
- Configuration via fichier YAML/JSON
- Intégration avec Swagger existant
- Interface web pour l'exploration

---

*Développé avec OpenClaw pour la gestion de codebase massive.*