# Benchmark Ollama - 2 Mars 2026 (Suite)
## Modèles additionnels testés

### Résultats

| Modèle | Taille | Score | Temps | Statut |
|--------|--------|-------|-------|--------|
| phi3:mini | 2.2 GB | **100/100** 🏆 | 5.5s | Référence |
| qwen2.5-coder:14b | 9.0 GB | **100/100** 🏆 | 15.0s | Référence |
| **qwen3.5:27b** | - | - | - | ❌ Échec: nécessite Ollama plus récent |
| **glm-4.7-flash** | 19 GB | - | - | ⏳ Annulé (trop long ~20min+) |
| **lfm2:24b** | - | - | - | ❌ Échec: nécessite Ollama plus récent |
| **deepseek-v2:16b** | ~16 GB | - | - | ⏳ Annulé (trop long) |
| **phi4-reasoning:14b** | ~11 GB | - | - | ⏳ Annulé (trop long) |

### Erreurs détaillées

1. **qwen3.5:27b**
   - Erreur: `pull model manifest: 412: The model you are attempting to pull requires a newer version of Ollama.`
   - Solution: Mettre à jour Ollama vers la dernière version

2. **lfm2:24b**
   - Erreur: Même erreur - nécessite Ollama plus récent

3. **glm-4.7-flash:latest** (19 GB)
   - Téléchargement commencé mais abandonné (projection >20 minutes)
   - Connexion trop lente

4. **deepseek-v2:16b** (~16 GB)
   - Téléchargement commencé mais abandonné

5. **phi4-reasoning:14b** (~11 GB)
   - Téléchargement commencé mais abandonné

### Conclusion

Les modèles testés n'ont pas pu être évalués car:
- Soit ils nécessitent une version plus récente d'Ollama
- Soit leur taille (11-19 GB) rend le téléchargement prohibitif

**Recommandation**: Garder **phi3:mini** comme meilleur choix actuel (100/100, 5.5s, 2.2GB)
