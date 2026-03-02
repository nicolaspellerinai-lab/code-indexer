# Benchmark LLM COMPLET - Tous les Modèles

Date: 2026-03-02
Test: Analyse de routes API Express (100/100 = JSON correct + table + status)

## Résultats Finals

| Modèle | Score | Temps | Taille |
|--------|-------|-------|--------|
| **phi3:mini** (référence) | **100/100** | **3.7s** | 2.2GB |
| **qwen2.5-coder:14b** (référence) | **100/100** | **24.8s** | 9GB |
| **deepseek-v2:16b** | **100/100** | **3.5s** ⚡ | 16GB |
| **glm4** | **100/100** | **3.7s** | 5.5GB |
| **lfm2:24b** | **100/100** | **4.7s** | 14GB |
| **phi4-reasoning:14b** | **100/100** | **67.8s** | 11GB |
| qwen3.5:27b | timeout | >120s | 17GB |

## 🏆 Classement

1. **deepseek-v2:16b** - 100/100 en **3.5s** ⚡⚡⚡ (LE PLUS RAPIDE!)
2. **glm4** - 100/100 en **3.7s** (excellent, petit modèle)
3. **phi3:mini** - 100/100 en **3.7s** (référence, léger)
4. **lfm2:24b** - 100/100 en **4.7s** (très bon pour sa taille)
5. **qwen2.5-coder:14b** - 100/100 en **24.8s** (référence)
6. **phi4-reasoning:14b** - 100/100 en **67.8s** (raisonnement excellent mais lent)
7. **qwen3.5:27b** - TROP LENT (>2 min timeout)

## Recommandations

### Pour la vitesse (benchmark):
- **Gagnant: deepseek-v2:16b** - aussivite que phi3:mini mais modèleplus grand

### Pour la qualité:
- **phi4-reasoning:14b** - raisonnement détaillé, excellent pour des tâches complexes

### Modèles à garder:
1. **phi3:mini** - petit, rapide, efficace
2. **deepseek-v2:16b** - excellent rapport vitesse/performance
3. **qwen2.5-coder:14b** - spécialisé code (référence)
4. **glm4** - petit mais performant

### Modèles à éviter:
- **qwen3.5:27b** - trop lent pour une utilisation pratique
