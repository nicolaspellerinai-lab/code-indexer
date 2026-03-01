#!/usr/bin/env node
/**
 * Benchmark COMPLET des LLM pour développement
 * Tests: Qualité code, respect consignes, vitesse, instruction following
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Modèles à tester avec leurs caractéristiques
const MODELS = [
  // Déjà testés (référence)
  { name: 'qwen2.5-coder:14b', provider: 'Alibaba', size: '8.4GB', category: 'Code', installed: true },
  { name: 'qwen3:8b', provider: 'Alibaba', size: '4.9GB', category: 'Général', installed: true },
  
  // À tester - Meta/Llama
  { name: 'llama3.1:8b', provider: 'Meta', size: '4.7GB', category: 'Général', installed: false },
  { name: 'llama3.1:70b', provider: 'Meta', size: '40GB', category: 'Général', installed: false, skip: true }, // Trop grand
  { name: 'codellama:7b', provider: 'Meta', size: '3.8GB', category: 'Code', installed: false },
  { name: 'codellama:13b', provider: 'Meta', size: '7.4GB', category: 'Code', installed: false },
  
  // À tester - DeepSeek
  { name: 'deepseek-coder:6.7b', provider: 'DeepSeek', size: '3.8GB', category: 'Code', installed: false },
  { name: 'deepseek-coder-v2:16b', provider: 'DeepSeek', size: '8.8GB', category: 'Code', installed: false },
  
  // À tester - Google
  { name: 'gemma2:9b', provider: 'Google', size: '5.4GB', category: 'Général', installed: false },
  { name: 'gemma2:27b', provider: 'Google', size: '16GB', category: 'Général', installed: false, skip: true }, // Trop grand
  
  // À tester - Mistral
  { name: 'mistral-nemo:12b', provider: 'Mistral', size: '7.1GB', category: 'Général', installed: false },
  { name: 'mistral:7b', provider: 'Mistral', size: '4.1GB', category: 'Général', installed: false },
  
  // À tester - Microsoft
  { name: 'phi4:14b', provider: 'Microsoft', size: '9.1GB', category: 'Général', installed: false },
  
  // À tester - Command
  { name: 'command-r:35b', provider: 'Cohere', size: '20GB', category: 'Général', installed: false, skip: true }, // Trop grand
  { name: 'command-r7b:7b', provider: 'Cohere', size: '4.5GB', category: 'Général', installed: false },
];

// Tests structurés
const TESTS = [
  {
    id: 'json_following',
    name: 'Respect format JSON',
    weight: 25,
    prompt: `Analyze: router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: 'Invalid' });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token, user: { id: user._id, email: user.email } });
});

Respond ONLY with JSON: {"summary": "brief description"}`,
    validate: (response) => {
      try {
        const json = response.match(/\{[\s\S]*\}/);
        if (!json) return { score: 0, note: 'Pas de JSON trouvé' };
        const parsed = JSON.parse(json[0]);
        return parsed.summary ? { score: 100, note: 'JSON valide avec summary' } : { score: 50, note: 'JSON valide mais summary manquant' };
      } catch {
        return { score: 0, note: 'JSON invalide' };
      }
    }
  },
  {
    id: 'code_analysis',
    name: 'Analyse de code',
    weight: 25,
    prompt: `Analyze this Express.js endpoint. Respond ONLY with JSON:
router.post('/api/electors/:id/notes', async (req, res) => {
  const { id } = req.params;
  const { note, priority } = req.body;
  const userId = req.user.id;
  
  const result = await db.query(
    'INSERT INTO elector_notes (elector_id, note, priority, created_by) VALUES (?, ?, ?, ?)',
    [id, note, priority, userId]
  );
  
  res.status(201).json({ id: result.insertId, elector_id: id, note, priority });
});

JSON format: {"summary": "what it does", "database_table": "table_name", "http_status": "status_code"}`,
    validate: (response) => {
      let score = 0;
      let notes = [];
      
      try {
        const json = response.match(/\{[\s\S]*\}/);
        if (!json) return { score: 0, note: 'Pas de JSON' };
        const parsed = JSON.parse(json[0]);
        
        if (parsed.summary && parsed.summary.length > 20) {
          score += 33;
          notes.push('Summary présent');
        }
        if (parsed.database_table?.toLowerCase().includes('note') || parsed.database_table?.toLowerCase().includes('elector')) {
          score += 33;
          notes.push('Table DB identifiée');
        }
        if (parsed.http_status?.includes('201') || parsed.http_status?.includes('201')) {
          score += 34;
          notes.push('Status HTTP correct');
        }
        
        return { score, note: notes.join(', ') || 'Analyse partielle' };
      } catch {
        return { score: 0, note: 'JSON invalide' };
      }
    }
  },
  {
    id: 'instruction_following',
    name: 'Suivi des instructions',
    weight: 25,
    prompt: `You are a code analyzer. Follow these rules EXACTLY:
1. Use EXACTLY 10 words for the summary
2. Start with "Endpoint:"
3. End with "[END]"

Code: router.get('/api/stats', (req, res) => res.json({count: 100}));`,
    validate: (response) => {
      let score = 0;
      let notes = [];
      
      if (response.includes('Endpoint:')) {
        score += 40;
        notes.push('Format respecté');
      }
      if (response.includes('[END]')) {
        score += 40;
        notes.push('Marqueur [END] présent');
      }
      
      const words = response.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 8 && words.length <= 15) {
        score += 20;
        notes.push('Longueur correcte (~10 mots)');
      }
      
      return { score, note: notes.join(', ') || 'Instructions partiellement suivies' };
    }
  },
  {
    id: 'code_completion',
    name: 'Complétion/Suggestion code',
    weight: 25,
    prompt: `Complete this Express.js route with proper error handling and validation:
router.post('/api/users', async (req, res) => {
  // TODO: validate email, check if exists, hash password, save to DB
  
});

Provide ONLY the implementation code, no explanation.`,
    validate: (response) => {
      let score = 0;
      let notes = [];
      
      const code = response.toLowerCase();
      
      if (code.includes('try') || code.includes('catch')) {
        score += 25;
        notes.push('Error handling présent');
      }
      if (code.includes('validate') || code.includes('joi') || code.includes('schema')) {
        score += 25;
        notes.push('Validation présente');
      }
      if (code.includes('hash') || code.includes('bcrypt')) {
        score += 25;
        notes.push('Password hashing');
      }
      if (code.includes('findone') || code.includes('exists') || code.includes('user')) {
        score += 25;
        notes.push('Vérification existence');
      }
      
      return { score, note: notes.join(', ') || 'Code incomplet' };
    }
  }
];

class ComprehensiveBenchmark {
  constructor() {
    this.results = [];
    this.modelInstallTimes = {};
  }

  async checkModelInstalled(model) {
    try {
      const { stdout } = await execAsync(`ollama list | grep "${model}"`);
      return stdout.includes(model);
    } catch {
      return false;
    }
  }

  async pullModel(model) {
    console.log(`\n📥 Installation de ${model.name} (${model.size})...`);
    const start = Date.now();
    
    try {
      const { stdout, stderr } = await execAsync(`ollama pull ${model.name}`, { timeout: 600000 });
      const duration = (Date.now() - start) / 1000;
      this.modelInstallTimes[model.name] = duration;
      console.log(`   ✅ Installé en ${duration.toFixed(0)}s`);
      return true;
    } catch (e) {
      console.log(`   ❌ Échec: ${e.message}`);
      return