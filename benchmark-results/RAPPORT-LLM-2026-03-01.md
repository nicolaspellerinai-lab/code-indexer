# 📊 RAPPORT BENCHMARK LLM - Code Indexer

**Date:** 2026-03-01  
**Machine:** MacBook Pro (M4 Pro) - 32GB RAM  
**Ollama:** Disponible sur localhost:11434

---

## 🏆 RÉSULTATS

| Modèle | Score | Temps | JSON Valide | Descriptif | Contexte-Aware | Taille | Recommandation |
|--------|-------|-------|-------------|------------|----------------|--------|----------------|
| **qwen2.5-coder:14b** | **100/100** 🟢 | **13.4s** | ✅ | ✅ | ✅ | 8.4GB | **✅ RECOMMANDÉ** |
| qwen3:8b | 0/100 🔴 | 9.2s | ❌ | ❌ | ❌ | 4.9GB | ❌ Inadéquat |
| gpt-oss:20b | 0/100 🔴 | 22.2s | ❌ | ❌ | ❌ | 12.8GB | ❌ Trop lent, inadéquat |

---

## 📋 DÉTAILS PAR MODÈLE

### 🥇 qwen2.5-coder:14b (GAGNANT)

**Avantages:**
- Suit parfaitement les instructions JSON
- Génère des résumés descriptifs et contextuels
- Spécialement entraîné pour le code
- Temps raisonnable (13.4s pour un endpoint complexe)
** Inconvénients:**
- Plus lourd (8.4GB) - nécessite 16GB+ RAM pour être confortable

**Exemple de réponse:**
```json
{
  "summary": "This Express.js endpoint handles a POST request to '/login', authenticates user credentials against a database, generates a JWT token upon successful authentication, and returns the token along with user details."
}
```

### ❌ qwen3:8b (ÉCHEC)

**Problèmes identifiés:**
- Ne suit pas le format JSON demandé
- Répond en texte libre au lieu de JSON structuré
- Résumés génériques de mauvaise qualité
- Met tout dans le champ `thinking` au lieu de `response`

**Verdict:** Non utilisable pour cette tâche malgré sa rapidité.

### ❌ gpt-oss:20b (ÉCHEC)

**Problèmes:**
- Réponse vide ou format incorrect
- Temps de chargement très long (22.2s)
- Taille excessive (12.8GB)
- Même problème de format que qwen3

---

## 🎯 CRITÈRES D'ÉVALUATION

1. **Respect JSON (30 pts):** Le LLM retourne-t-il du JSON valide?
2. **Descriptif (40 pts):** Le résumé est-il informatif et non générique?
3. **Context-Aware (30 pts):** Le LLM comprend-il le contexte du code?

---

## 💡 RECOMMANDATIONS

### Pour le Code-Indexer
- **Utiliser qwen2.5-coder:14b** comme modèle par défaut
- Alternative si RAM insuffisante: Chercher d'autres modèles 7-8B spécialisés code
- Éviter qwen3:8b - ne fonctionne pas pour cette tâche

### Pour l'Avenir
Benchmark à faire avec:
- **llama3.1** (8B ou 70B)
- **codellama** (spécialisé code)
- **deepseek-coder** (spécialisé code)
- **gemma2** (Google)
- **mistral-nemo** (32K context)

---

## 🔧 INFRASTRUCTURE

**Script de benchmark créé:** `benchmark-llm.js`
- Teste automatiquement tous les modèles
- Mesure temps, qualité, respect consignes
- Sauvegarde résultats en JSON
- Génère rapport Markdown

**Exécution:**
```bash
node benchmark-llm.js
```

---

## ✅ ACTIONS RÉALISÉES

1. ✅ Benchmark complet des modèles disponibles
2. ✅ Identification de qwen2.5-coder:14b comme meilleur modèle
3. ✅ Mise à jour du pipeline.js avec le modèle gagnant
4. ✅ Création du script de benchmark réutilisable
5. ✅ Documentation des résultats

---

## 📝 TÂCHE SUIVANTE SUGGÉRÉE

**Titre:** Benchmark complémentaire LLM (Llama, Gemma, DeepSeek, CodeLlama)

**Objectifs:**
- Tester llama3.1:8b et :70b
- Tester codellama:7b ou :13b (spécialisé code)
- Tester deepseek-coder:6.7b
- Tester gemma2:9b
- Comparer avec qwen2.5-coder:14b

**Priorité:** 3 (Moyenne) - Amélioration continue

---

*Rapport généré par: Elminster*  
*Date: 2026-03-01*
