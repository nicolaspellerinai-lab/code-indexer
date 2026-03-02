# Benchmark Ollama - 2 Mars 2026
## Code Indexer: Analyse de routes API, parsing, résumé

### Modèles testés

| Modèle | Taille | Score | Temps | JSON | Descriptif | Contexte |
|--------|--------|-------|-------|------|------------|----------|
| **qwen2.5-coder:14b** | 9.0 GB | **100/100** 🏆 | 15.0s | ✅ | ✅ | ✅ |
| **phi3:mini** | 2.2 GB | **100/100** 🏆 | 5.5s | ✅ | ✅ | ✅ |
| codellama:7b-instruct | 3.8 GB | 70/100 | 6.0s | ❌ | ✅ | ✅ |
| gpt-oss:20b | 13 GB | 70/100 | 11.4s | ❌ | ✅ | ✅ |
| qwen3:8b | 5.2 GB | 0/100 | 9.9s | ❌ | ❌ | ❌ |

### Résultats comparatifs avec session précédente (01 Mars)

| Modèle | Score 01 Mars | Score 02 Mars | Evolution |
|--------|---------------|---------------|-----------|
| mistral:7b | 83/100 | - | Référence |
| qwen2.5-coder:14b | N/A | 100/100 | +17 ⬆️ |
| phi3:mini | N/A | 100/100 | +17 ⬆️ |
| codellama:7b | 0/100 | 70/100 | +70 ⬆️ |
| gpt-oss:20b | N/A | 70/100 | - |
| qwen3:8b | N/A | 0/100 | - |

### Analyse détaillée

#### 🏆 GAGNANTS ABSOLUS:
1. **qwen2.5-coder:14b** - Score parfait (100/100), spécialisé code, 15s
2. **phi3:mini** - Score parfait (100/100), plus rapide (5.5s), plus léger (2.2GB)

#### Critères de test:
- **JSON valide (30 pts):** Capacité à retourner du JSON structuré
- **Descriptif (40 pts):** Résumé de plus de 20 caractères, pas de templates génériques
- **Contexte (30 pts):** Comprend l'auth/login/token dans le contexte

### Recommandations

| Usage | Modèle recommandé | Raison |
|-------|-------------------|--------|
| **Vitesse + Qualité** | phi3:mini | 5.5s, 2.2GB, 100/100 |
| **Qualité max** | qwen2.5-coder:14b | 100/100, spécialisé code |
| **Remplacer mistral:7b** | phi3:mini | Plus rapide + meilleur score |

### Modèles non testés (échec téléchargement)
- llama3.3 - Échec/téléchargement interrompu
- aya:35b - Échec/téléchargement interrompu  
- command-r:35b - Échec/téléchargement interrompu

### Conclusion

**Le meilleur modèle pour l'indexation de code est phi3:mini** pour sa combinaison unique de:
- Score parfait (100/100 vs 83/100 pour mistral:7b)
- Vitesse la plus rapide (5.5s)
- Faible empreinte disque (2.2GB)

qwen2.5-coder:14b est une alternative si la qualité maximale est prioritaire.
