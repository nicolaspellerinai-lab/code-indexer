# Code Indexer

Outil d'indexation de codebase Node.js pour la génération de documentation et l'analyse de dépendances.

## Installation

```bash
cd code_indexer
npm install
```

## Fonctionnalités

1. **Scan de routes** : Détecte automatiquement les routes Express/NestJS/Fastify via parsing AST.
2. **Parsing AST robuste** : Utilise `@babel/parser` pour une analyse précise du code source.
3. **Support Swagger existant** : Parse et utilise la documentation Swagger/JSDoc déjà présente dans le code.
4. **Analyse de dépendances** : Identifie les appels de base de données, services internes et endpoints externes.
5. **Indexation Vectorielle** : Stocke les endpoints dans ChromaDB pour la recherche sémantique (RAG).
6. **Génération OpenAPI** : Produit une spécification OpenAPI 3.0.3 valide et complète.
7. **Enrichissement LLM** : Enrichit les endpoints avec Ollama pour les endpoints non documentés (optionnel).
8. **Benchmark Ollama** : Compare les modèles Ollama sur les mêmes données (précision + vitesse).

## Structure

- `src/parsers/` : Logique d'extraction (routes, dépendances, Swagger)
- `src/models/` : Modèles de données (Endpoint)
- `src/vectorStore/` : Client ChromaDB
- `src/generators/` : Génération de documentation OpenAPI
- `src/services/` : Services (LLM enrichment)
- `tests/unit/` : Tests unitaires avec Mocha
- `benchmark/` : Framework de benchmark pour modèles Ollama
- `config/` : Configuration (modèles Ollama)

## Prérequis

- Node.js >= 18
- Docker (pour ChromaDB)
- Ollama (pour l'enrichissement LLM et les benchmarks)

## Scripts disponibles

- `npm run index` : Lance l'indexation d'un projet
- `npm run test` : Test avec projet d'exemple
- `npm run benchmark` : Lance les benchmarks de parsing/génération
- `npm run benchmark:ollama` : Compare les modèles Ollama (précision + vitesse)
- `npm run search` : Recherche sémantique dans les endpoints indexés
- `npm run generate-doc` : Génération de documentation
- `npm run chroma:start` : Démarre ChromaDB
- `npm run chroma:stop` : Arrête ChromaDB

## Configuration Ollama

Les modèles à tester sont configurés dans `config/llm-providers.json` :

```json
{
  "ollama": {
    "host": "localhost",
    "port": 11434,
    "models": [
      "qwen3:8b",
      "qwen2.5-coder:14b",
      "glm4:latest",
      "phi4-reasoning:14b",
      "qwen3.5:27b",
      "codellama:7b-instruct",
      "phi3:mini",
      "..."
    ]
  }
}
```

## Exemple

```bash
# Lancer ChromaDB
npm run chroma:start

# Indexer un Projet
node scripts/index-project.js ../mon-app-nodejs

# Rechercher des endpoints
node scripts/search-endpoints.js 'users'

# Générer la documentation
node scripts/generate-doc.js generate '/users' GET

# Benchmark de parsing
npm run benchmark

# Benchmark Ollama (comparer les modèles)
npm run benchmark:ollama
```

## Benchmark Ollama

Le benchmark Ollama teste vos modèles sur les mêmes données et classe les modèles par :

1. **Précision** : Qualité de l'analyse (détection routes, middleware, documentation)
2. **Vitesse** : Temps de réponse
3. **Score combiné** : 70% précision + 30% vitesse

Les résultats sont sauvegardés dans `benchmark-results/ollama-benchmark-*.json`.

## Sorties

Après exécution, le projet génère :

- `data/relationships.json` : Graphe des dépendances
- `data/generated-openapi.json` : Spécification OpenAPI
- `data/endpoints.json` : Liste détaillée des endpoints trouvés
- `benchmark-results/` : Rapports de benchmark

## Frameworks supportés

- ✅ Express.js (routes classiques)
- ✅ NestJS (décorateurs @Get, @Post, etc.)
- ✅ Fastify (méthodes get/post/put/delete)
- ✅ Koa.js (routes similaires)

Le parseur détecte automatiquement le framework utilisé dans chaque fichier.

## Tests

```bash
# Benchmark de parsing (tests unitaires)
npm run benchmark

# Benchmark Ollama (comparaison de modèles)
npm run benchmark:ollama
```

---

*Développé pour la gestion de codebase massive avec support d'enrichissement LLM.*
