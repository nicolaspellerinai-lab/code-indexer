const http = require('http');

const TESTS = [
  {
    id: 'json',
    name: 'JSON Format',
    prompt: `Analyze this login endpoint. Respond ONLY with JSON: {"summary": "brief description of what this does"}

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: "Invalid" });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token });
});`
  },
  {
    id: 'analysis',
    name: 'Code Analysis',
    prompt: `Analyze this endpoint. Return JSON: {"summary": "...", "database_table": "...", "http_status": "..."}

router.post("/api/notes", async (req, res) => {
  const { note, priority } = req.body;
  const result = await db.query('INSERT INTO notes (note, priority) VALUES (?, ?)', [note, priority]);
  res.status(201).json({ id: result.insertId });
});`
  },
  {
    id: 'instruction',
    name: 'Instruction Following',
    prompt: `Follow EXACTLY:
1. Use EXACTLY 10 words
2. Start with "Endpoint:"
3. End with "[END]"

Code: router.get("/stats", (req, res) => res.json({count: 100}));`
  },
  {
    id: 'completion',
    name: 'Code Completion',
    prompt: `Complete this Express route with validation and error handling:

router.post("/api/users", async (req, res) => {
  // TODO: validate email, check if exists, hash password, save to DB
  
});

Provide ONLY the implementation code.`
  }
];

function callOllama(prompt) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'mistral-nemo:12b',
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 200 }
    });

    const req = http.request({
      hostname: 'localhost', port: 11434, path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ 
            success: true, 
            response: parsed.response || '', 
            totalDuration: parsed.total_duration || 0 
          });
        } catch { 
          resolve({ success: false, error: 'Parse error' }); 
        }
      });
    });
    req.on('error', () => resolve({ success: false, error: 'Connection error' }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
    req.write(body);
    req.end();
  });
}

function validateJSON(response) {
  try {
    const match = response.match(/\\{[\\s\\S]*\\}/);
    if (!match) return { score: 0, notes: 'No JSON found' };
    const parsed = JSON.parse(match[0]);
    return parsed.summary && parsed.summary.length > 10 
      ? { score: 100, notes: 'Valid JSON with summary' }
      : { score: 50, notes: 'JSON valid but summary missing/short' };
  } catch { return { score: 0, notes: 'Invalid JSON' }; }
}

function validateAnalysis(response) {
  let score = 0, notes = [];
  try {
    const match = response.match(/\\{[\\s\\S]*\\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.summary?.length > 10) { score += 33; notes.push('Summary'); }
      if (parsed.database_table) { score += 33; notes.push('DB table'); }
      if (parsed.http_status?.includes('201')) { score += 34; notes.push('HTTP status'); }
    }
  } catch {}
  return { score, notes: notes.join(', ') || 'Partial analysis' };
}

function validateInstruction(response) {
  let score = 0, notes = [];
  if (response.includes('Endpoint:')) { score += 40; notes.push('Format \"Endpoint:\"'); }
  if (response.includes('[END]')) { score += 40; notes.push('Tag [END]'); }
  const words = response.split(/\\s+/).filter(w => w.length > 0);
  if (words.length >= 8 && words.length <= 15) { score += 20; notes.push('~10 words'); }
  return { score, notes: notes.join(', ') || 'Partial compliance' };
}

function validateCompletion(response) {
  const code = response.toLowerCase();
  let score = 0, notes = [];
  if (code.includes('try') || code.includes('catch')) { score += 25; notes.push('Error handling'); }
  if (code.includes('validate') || code.includes('joi')) { score += 25; notes.push('Validation'); }
  if (code.includes('hash') || code.includes('bcrypt')) { score += 25; notes.push('Password hashing'); }
  if (code.includes('findone') || code.includes('exists')) { score += 25; notes.push('Existence check'); }
  return { score, notes: notes.join(', ') || 'Incomplete code' };
}

const validators = {
  json: validateJSON,
  analysis: validateAnalysis,
  instruction: validateInstruction,
  completion: validateCompletion
};

async function runTest() {
  console.log('Testing mistral-nemo:12b (12B, 7.1GB)\n');
  const results = [];
  let totalScore = 0;
  
  for (const test of TESTS) {
    process.stdout.write(`  ${test.name.padEnd(20)}... `);
    const start = Date.now();
    const result = await callOllama(test.prompt);
    const duration = (Date.now() - start) / 1000;
    
    if (!result.success) {
      console.log(`FAIL ${result.error} (${duration.toFixed(1)}s)`);
      results.push({ test: test.id, score: 0, duration });
      continue;
    }
    
    const validation = validators[test.id](result.response);
    const weightedScore = validation.score * (test.weight / 100);
    totalScore += weightedScore;
    
    const status = validation.score >= 80 ? 'OK' : validation.score >= 50 ? 'WARN' : 'FAIL';
    console.log(`${status} ${validation.score}% - ${validation.notes} (${duration.toFixed(1)}s)`);
    results.push({ test: test.id, score: validation.score, duration, notes: validation.notes });
  }
  
  console.log(`\nOVERALL SCORE: ${Math.round(totalScore)}/100`);
  const totalTime = results.reduce((a, r) => a + r.duration, 0);
  console.log(`Total time: ${totalTime.toFixed(1)}s (${(totalTime/4).toFixed(1)}s avg per test)`);
  
  return { model: 'mistral-nemo:12b', score: Math.round(totalScore), results };
}

runTest().then(r => {
  const rating = r.score >= 80 ? 'EXCELLENT' : r.score >= 60 ? 'GOOD' : r.score >= 40 ? 'FAIR' : 'POOR';
  console.log(`\nRating: ${r.score}/100 ${rating}`);
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
