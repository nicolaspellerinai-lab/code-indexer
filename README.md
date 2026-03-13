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
7. **Enrichissement LLM** : Enrichit les endpoints avec Ollama pour les endpoints non documentés.
8. **Comparaison de documentation** : Compare la documentation originale vs enrichie par le LLM.
9. **Génération de patches** : Génère des fichiers de modifications pour mettre à jour le code source.
10. **Logging LLM** : Enregistre les appels et réponses Ollama pour debugging.

## Structure

- `src/parsers/` : Logique d'extraction (routes, dépendances, Swagger)
- `src/models/` : Modèles de données (Endpoint)
- `src/vectorStore/` : Client ChromaDB
- `src/generators/` : Génération de documentation OpenAPI
- `src/services/` : Services (LLM enrichment)
- `tests/unit/` : Tests unitaires avec Mocha
- `benchmark/` : Framework de benchmark pour modèles Ollama
- `config/` : Configuration (modèles Ollama)
- `scripts/` : Scripts utilitaires (indexation, test, reset, comparison)

## Prérequis

- Node.js >= 18
- Docker (pour ChromaDB)
- Ollama (pour l'enrichissement LLM et les benchmarks)

## Scripts disponibles

### Indexation et analyse
- `node scripts/index-project.js <path>` : Indexe un projet (fichier ou dossier)
- `node scripts/reset.js --force` : Reset complet des données
- `node scripts/test-single-endpoint.js [file.js] [method:path]` : Test un seul endpoint

### Documentation et comparison
- `node scripts/compare-docs.js` : Compare doc originale vs enrichie (params, schemas, responses)
- `node scripts/generate-patch.js` : Génère les patches de modification
- `node scripts/generate-doc.js` : Génère la documentation

### Options CLI

#### compare-docs.js
```bash
node scripts/compare-docs.js [options]
  --openapi <path>  Fichier OpenAPI généré (défaut: data/generated-openapi.json)
  --routes <path>   Fichier routes source (défaut: data/routes.json)
  --output <path>  Sauvegarder le rapport en JSON
```

#### generate-patch.js
```bash
node scripts/generate-patch.js [options]
  --openapi <path>  Fichier OpenAPI généré (défaut: data/generated-openapi.json)
  --routes <path>   Fichier routes source (défaut: data/routes.json)
  --output <path>  Préfixe des fichiers de sortie (défaut: data/patches)
```

#### index-project.js
```bash
node scripts/index-project.js <path> [options]
  <path>             Chemin du fichier ou répertoire à indexer
  --host <url>       Hôte Ollama (ex: http://192.168.0.19:11434)
  --port <port>      Port Ollama (défaut: 11434)
  --model <name>     Modèle Ollama à utiliser
  --no-resume        Reprendre l'indexation depuis le début
```

> **Note** : Si un répertoire est fourni, tous les fichiers `.js` seront indexés et les routes seront regroupées par fichier source.

### Recherche et debug
- `node scripts/search-endpoints.js <query>` : Recherche sémantique
- `node scripts/test-ollama.js` : Test la connexion Ollama

### Benchmark
- `npm run benchmark` : Benchmark de parsing
- `npm run benchmark:ollama` : Compare les modèles Ollama

## Configuration Ollama

Les modèles à tester sont configurés dans `config/llm-providers.json` :

```json
{
  "ollama": {
    "host": "http://192.168.0.19:11434",
    "port": 11434,
    "models": [
      "deepseek-v2:16b",
      "qwen3:8b",
      "qwen2.5-coder:14b",
      "glm4:latest",
      "phi4-reasoning:14b",
      "qwen3.5:27b",
      "kwangsuklee/qwen3.5-9b-claudee-4.6-opus-reasoning-distilled-gguf"
    ]
  }
}
```

## Exemple d'utilisation

```bash
# Reset avant nouvelle indexation
node scripts/reset.js --force

# Indexer un fichier spécifique
node scripts/index-project.js code_to_index/elector.js

# Indexer un répertoire entier (traite tous les fichiers .js)
node scripts/index-project.js code_to_index/

# Indexer avec paramètres Ollama personnalisés
node scripts/index-project.js code_to_index/ --host http://192.168.0.19:11434 --model deepseek-v2:16b

# Tester un endpoint spécifique
node scripts/test-single-endpoint.js code_to_index/elector.js GET:/api/crm/elector/street-section

# Comparer la documentation (avec paramètres par défaut)
node scripts/compare-docs.js

# Comparer avec fichiers personnalisés
node scripts/compare-docs.js --openapi data/generated-openapi.json --routes data/routes.json

# Sauvegarder le rapport de comparaison
node scripts/compare-docs.js --output data/comparison-report.json

# Générer les patches (supporte multi-fichiers automatiquement)
node scripts/generate-patch.js

# Générer les patches avec sortie personnalisée
node scripts/generate-patch.js --output output/my-patches

# Rechercher des endpoints
node scripts/search-endpoints.js 'users'

# Tester Ollama
node scripts/test-ollama.js
```

## Workflow complet

### Indexation de répertoire multi-fichiers

```bash
# 1. Reset et indexation
node scripts/reset.js --force
node scripts/index-project.js code_to_index/

# 2. Comparaison de la documentation
node scripts/compare-docs.js

# 3. Génération des patches
node scripts/generate-patch.js
```

Le système :
- Parse tous les fichiers `.js` du répertoire
- Conserve le chemin source pour chaque route (`routes-by-file.json`)
- Génère les patches avec les bons chemins de fichiers
- Produit un résumé par fichier source

## Fonctionnement de l'enrichissement LLM

### Phase 1: Parsing du code
Le système analyse le code source pour extraire :
- Paramètres de chemin (`:id`)
- Paramètres de requête (`req.query.nom`)
- Corps de requête (`req.body.nom`)
- Réponses (`res.json(...)`)
- Middleware d'authentification

### Phase 2: Appel LLM
Le prompt envoyé au LLM inclut :
- Le code du handler
- Les paramètres détectés
- La documentation existante (JSDoc/Swagger)
- Des règles strictes pour éviter d'inventer des données

### Phase 3: Fallback
Si le LLM échoue, le système utilise :
- Des summaries statiques basés sur le chemin
- Les paramètres parsés du code

### Logging
Chaque appel LLM est enregistré dans `data/llm-logs/` avec :
- Le prompt envoyé
- La réponse brute
- Le succès/échec
- Si le fallback a été utilisé

## Sorties

Après exécution, le projet génère :

| Fichier | Description |
|---------|-------------|
| `data/routes.json` | Routes extraites avec métadonnées et chemins de fichiers |
| `data/routes-by-file.json` | Routes groupées par fichier source (pour support multi-fichiers) |
| `data/relationships.json` | Graphe des dépendances entre endpoints |
| `data/generated-openapi.json` | Spécification OpenAPI 3.0 |
| `data/patches.json` | Patches JSON pour application |
| `data/patches.diff` | Fichier diff lisible |
| `data/llm-logs/*.json` | Logs détaillés des appels LLM |
| `data/comparison-report.json` | Rapport de comparaison (si --output utilisé) |

### Support Multi-fichiers

Le système gère l'indexation de répertoires entiers :

```bash
# Indexer un répertoire (traitera tous les fichiers .js)
node scripts/index-project.js code_to_index/

# Les routes seront regroupées par fichier source
# generate-patch.js générera les patches avec les bons chemins de fichiers
```

Les fichiers `routes-by-file.json` et `routes.json` conservent le lien avec les fichiers sources, permettant de générer des patches corrects même pour des projets avec plusieurs fichiers de routes.

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

# Tests unitaires
npm run test
```

---

*Développé pour la gestion de codebase massive avec support d'enrichissement LLM.*

## Infrastructure Git PR (Future)

Le fichier [`src/services/gitService.js`](src/services/gitService.js) fournit une base pour l'automatisation Git :

- **Créer des branches** : `gitService.createBranch('docs/update-swagger')`
- **Valider les patches** : `gitService.validatePatches(patches)`
- **Générer description PR** : `gitService.generatePRDescription(patches)`
- **Créer PR** : `gitService.createPullRequest({ title, body })` (à implémenter)

Pour implémenter la création de PR automatique :
```bash
npm install @octokit/rest
# Définir GITHUB_TOKEN comme variable d'environnement
```
