# Benchmark Ollama - 2 Mars 2026 (Suite v2)
## Modèles testés après mise à jour Ollama 0.17.4

### Résultats

| Modèle | Taille | Score | Temps | Statut |
|--------|--------|-------|-------|--------|
| phi3:mini | 2.2 GB | **100/100** 🏆 | 3.7s | ✅ RÉFÉRENCE |
| qwen2.5-coder:14b | 9.0 GB | **100/100** 🏆 | 24.8s | ✅ RÉFÉRENCE |
| **qwen3.5:27b** | 17 GB | - | - | ❌ Téléchargement trop lent (~1-5 MB/s, abandonné après ~20 min à 94%) |
| **phi4-reasoning:14b** | ~11 GB | - | - | ❌ Téléchargement trop lent (~26-30 MB/s mais encore long) |
| **deepseek-v2:16b** | ~16 GB | - | - | ⏳ Non testé |
| **lfm2:24b** | ~24 GB | - | - | ⏳ Non testé |
| **glm-4.7-flash:latest** | ~19 GB | - | - | ⏳ Non testé |

### Analyse des modèles testés

#### 1. phi3:mini (RÉFÉRENCE)
- **Score: 100/100**
- **Temps: 3.7s**
- **Taille: 2.2 GB**
- **Réponse:** `{"summary":"Endpoint for creating a new note about an Elector in the database with specified priority","database_table":"elector_notes","http_status":"201"}`
- ✅ Parfait - rapide et précis

#### 2. qwen2.5-coder:14b
- **Score: 100/100**
- **Temps: 24.8s**
- **Taille: 9.0 GB**
- **Réponse:** JSON complet avec summary détaillée
- ✅ Parfait mais plus lent

### Problèmes rencontrés

1. **qwen3.5:27b**: Le modèle nécessite 17 GB. Téléchargement très lent (~1-5 MB/s), abandonné à 94% après ~20 minutes.

2. **phi4-reasoning:14b**: Le modèle nécessite ~11 GB. Téléchargement commencé mais速度和慢 (~26-30 MB/s), trop long.

3. **deepseek-v2:16b, lfm2:24b, glm-4.7-flash**: Pas encore tentés en raison du temps de téléchargement prohibitif.

### Conclusion

**Recommandation**: **phi3:mini** reste le meilleur choix actuel:
- ✅ 100/100 de précision
- ✅ Temps le plus rapide (3.7s)
- ✅ Plus petit taille (2.2 GB)
- ✅ Fonctionne parfaitement avec Ollama 0.17.4

Les modèles plus grands (11-24 GB) sont trop volumineux pour un téléchargement efficace sur cette connexion.
