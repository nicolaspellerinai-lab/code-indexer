# Benchmark LLM - Résultats Complets

Date: 3/1/2026, 8:21:18 PM

## 📊 Tableau Comparatif

| Modèle | Provider | Catégorie | Score Total | Installation |
|--------|----------|-----------|-------------|--------------|
| codellama:13b | Meta | Code | **45.0%** | 192s |
| phi4:14b | Microsoft | Général | **75.0%** | 217s |
| command-r7b:7b | Cohere | Général | **75.0%** | 131s |
| deepseek-coder-v2:16b | DeepSeek | Code | **100.0%** | 246s |

## 🔍 Détails

### codellama:13b (Meta)

- Score total: 45.0%
- Catégorie: Code
- Taille: 7.4GB

- **json_following**: 0% (Pas de JSON trouvé)
- **code_analysis**: 0% (JSON invalide)
- **instruction_following**: 80% (Format respecté, Marqueur [END] présent)
- **code_completion**: 100% (Error handling, Validation, Hashing, Vérification existence)

### phi4:14b (Microsoft)

- Score total: 75.0%
- Catégorie: Général
- Taille: 9.1GB

- **json_following**: 100% (JSON valide avec summary)
- **code_analysis**: 0% (JSON invalide)
- **instruction_following**: 100% (Format respecté, Marqueur [END] présent, Longueur correcte)
- **code_completion**: 100% (Error handling, Validation, Hashing, Vérification existence)

### command-r7b:7b (Cohere)

- Score total: 75.0%
- Catégorie: Général
- Taille: 4.5GB

- **json_following**: 100% (JSON valide avec summary)
- **code_analysis**: 0% (JSON invalide)
- **instruction_following**: 100% (Format respecté, Marqueur [END] présent, Longueur correcte)
- **code_completion**: 100% (Error handling, Validation, Hashing, Vérification existence)

### deepseek-coder-v2:16b (DeepSeek)

- Score total: 100.0%
- Catégorie: Code
- Taille: 8.8GB

- **json_following**: 100% (JSON valide avec summary)
- **code_analysis**: 100% (Summary présent, Table DB identifiée, Status HTTP correct)
- **instruction_following**: 100% (Format respecté, Marqueur [END] présent, Longueur correcte)
- **code_completion**: 100% (Error handling, Validation, Hashing, Vérification existence)

## 🏆 Recommandation

**Gagnant: deepseek-coder-v2:16b** avec 100.0%

Modèles à garder:
- mistral:7b (léger, rapide)
- qwen2.5-coder:14b (excellent pour le code)
- deepseek-coder-v2:16b (meilleur score)
