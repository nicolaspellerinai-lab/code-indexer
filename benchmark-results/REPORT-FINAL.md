# Benchmark LLM - Résultats Complets

Date: 3/1/2026, 7:26:37 PM

## 📊 Tableau Comparatif

| Modèle | Provider | Catégorie | Score Total | Installation |
|--------|----------|-----------|-------------|--------------|
| codellama:13b | Meta | Code | **35.0%** | 183s |
| phi4:14b | Microsoft | Général | **50.0%** | 212s |
| command-r7b:7b | Cohere | Général | **43.8%** | 121s |
| deepseek-coder-v2:16b | DeepSeek | Code | **35.0%** | 228s |

## 🔍 Détails

### codellama:13b (Meta)

- Score total: 35.0%
- Catégorie: Code
- Taille: 7.4GB

- **json_following**: 0% (invalid character 'I' in string escape code)
- **code_analysis**: 0% (Command failed: curl -s http://localhost:11434/api/generate -X POST -H "Content-Type: application/json" -d '{"model":"codellama:13b","prompt":"Analyze this Express.js endpoint. Respond ONLY with JSON: router.post('\\''/api/electors/:id/notes'\\'', async (req, res) => { const { id } = req.params; const { note, priority } = req.body; const userId = req.user.id; const result = await db.query( '\\''INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)'\\'', [id, note, priority, userId] ); res.status(201).json({ id: result.insertId, elector_id: id, note, priority }); }); JSON format: {\"summary\": \"what it does\", \"database_table\": \"table_name\", \"http_status\": \"status_code\"}","stream":false}'
/bin/sh: -c: line 0: syntax error near unexpected token `('
/bin/sh: -c: line 0: `curl -s http://localhost:11434/api/generate -X POST -H "Content-Type: application/json" -d '{"model":"codellama:13b","prompt":"Analyze this Express.js endpoint. Respond ONLY with JSON: router.post('\\''/api/electors/:id/notes'\\'', async (req, res) => { const { id } = req.params; const { note, priority } = req.body; const userId = req.user.id; const result = await db.query( '\\''INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)'\\'', [id, note, priority, userId] ); res.status(201).json({ id: result.insertId, elector_id: id, note, priority }); }); JSON format: {\"summary\": \"what it does\", \"database_table\": \"table_name\", \"http_status\": \"status_code\"}","stream":false}''
)
- **instruction_following**: 40% (Format respecté)
- **code_completion**: 100% (Error handling, Validation, Hashing, Vérification existence)

### phi4:14b (Microsoft)

- Score total: 50.0%
- Catégorie: Général
- Taille: 9.1GB

- **json_following**: 0% (invalid character 'I' in string escape code)
- **code_analysis**: 0% (Command failed: curl -s http://localhost:11434/api/generate -X POST -H "Content-Type: application/json" -d '{"model":"phi4:14b","prompt":"Analyze this Express.js endpoint. Respond ONLY with JSON: router.post('\\''/api/electors/:id/notes'\\'', async (req, res) => { const { id } = req.params; const { note, priority } = req.body; const userId = req.user.id; const result = await db.query( '\\''INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)'\\'', [id, note, priority, userId] ); res.status(201).json({ id: result.insertId, elector_id: id, note, priority }); }); JSON format: {\"summary\": \"what it does\", \"database_table\": \"table_name\", \"http_status\": \"status_code\"}","stream":false}'
/bin/sh: -c: line 0: syntax error near unexpected token `('
/bin/sh: -c: line 0: `curl -s http://localhost:11434/api/generate -X POST -H "Content-Type: application/json" -d '{"model":"phi4:14b","prompt":"Analyze this Express.js endpoint. Respond ONLY with JSON: router.post('\\''/api/electors/:id/notes'\\'', async (req, res) => { const { id } = req.params; const { note, priority } = req.body; const userId = req.user.id; const result = await db.query( '\\''INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)'\\'', [id, note, priority, userId] ); res.status(201).json({ id: result.insertId, elector_id: id, note, priority }); }); JSON format: {\"summary\": \"what it does\", \"database_table\": \"table_name\", \"http_status\": \"status_code\"}","stream":false}''
)
- **instruction_following**: 100% (Format respecté, Marqueur [END] présent, Longueur correcte)
- **code_completion**: 100% (Error handling, Validation, Hashing, Vérification existence)

### command-r7b:7b (Cohere)

- Score total: 43.8%
- Catégorie: Général
- Taille: 4.5GB

- **json_following**: 0% (invalid character 'I' in string escape code)
- **code_analysis**: 0% (Command failed: curl -s http://localhost:11434/api/generate -X POST -H "Content-Type: application/json" -d '{"model":"command-r7b:7b","prompt":"Analyze this Express.js endpoint. Respond ONLY with JSON: router.post('\\''/api/electors/:id/notes'\\'', async (req, res) => { const { id } = req.params; const { note, priority } = req.body; const userId = req.user.id; const result = await db.query( '\\''INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)'\\'', [id, note, priority, userId] ); res.status(201).json({ id: result.insertId, elector_id: id, note, priority }); }); JSON format: {\"summary\": \"what it does\", \"database_table\": \"table_name\", \"http_status\": \"status_code\"}","stream":false}'
/bin/sh: -c: line 0: syntax error near unexpected token `('
/bin/sh: -c: line 0: `curl -s http://localhost:11434/api/generate -X POST -H "Content-Type: application/json" -d '{"model":"command-r7b:7b","prompt":"Analyze this Express.js endpoint. Respond ONLY with JSON: router.post('\\''/api/electors/:id/notes'\\'', async (req, res) => { const { id } = req.params; const { note, priority } = req.body; const userId = req.user.id; const result = await db.query( '\\''INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)'\\'', [id, note, priority, userId] ); res.status(201).json({ id: result.insertId, elector_id: id, note, priority }); }); JSON format: {\"summary\": \"what it does\", \"database_table\": \"table_name\", \"http_status\": \"status_code\"}","stream":false}''
)
- **instruction_following**: 100% (Format respecté, Marqueur [END] présent, Longueur correcte)
- **code_completion**: 75% (Error handling, Hashing, Vérification existence)

### deepseek-coder-v2:16b (DeepSeek)

- Score total: 35.0%
- Catégorie: Code
- Taille: 8.8GB

- **json_following**: 0% (invalid character 'I' in string escape code)
- **code_analysis**: 0% (Command failed: curl -s http://localhost:11434/api/generate -X POST -H "Content-Type: application/json" -d '{"model":"deepseek-coder-v2:16b","prompt":"Analyze this Express.js endpoint. Respond ONLY with JSON: router.post('\\''/api/electors/:id/notes'\\'', async (req, res) => { const { id } = req.params; const { note, priority } = req.body; const userId = req.user.id; const result = await db.query( '\\''INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)'\\'', [id, note, priority, userId] ); res.status(201).json({ id: result.insertId, elector_id: id, note, priority }); }); JSON format: {\"summary\": \"what it does\", \"database_table\": \"table_name\", \"http_status\": \"status_code\"}","stream":false}'
/bin/sh: -c: line 0: syntax error near unexpected token `('
/bin/sh: -c: line 0: `curl -s http://localhost:11434/api/generate -X POST -H "Content-Type: application/json" -d '{"model":"deepseek-coder-v2:16b","prompt":"Analyze this Express.js endpoint. Respond ONLY with JSON: router.post('\\''/api/electors/:id/notes'\\'', async (req, res) => { const { id } = req.params; const { note, priority } = req.body; const userId = req.user.id; const result = await db.query( '\\''INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)'\\'', [id, note, priority, userId] ); res.status(201).json({ id: result.insertId, elector_id: id, note, priority }); }); JSON format: {\"summary\": \"what it does\", \"database_table\": \"table_name\", \"http_status\": \"status_code\"}","stream":false}''
)
- **instruction_following**: 40% (Format respecté)
- **code_completion**: 100% (Error handling, Validation, Hashing, Vérification existence)

## 🏆 Recommandation

**Gagnant: phi4:14b** avec 50.0%

Modèles à garder:
- mistral:7b (léger, rapide)
- qwen2.5-coder:14b (excellent pour le code)
