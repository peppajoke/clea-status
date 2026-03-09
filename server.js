import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { CronExpressionParser } from 'cron-parser';
import cronstrue from 'cronstrue';
import { execFile } from 'child_process';
import { promisify } from 'util';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;
const execFileAsync = promisify(execFile);

// ── Config ─────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD         = process.env.ADMIN_PASSWORD || 'versodoggie666';
const JWT_SECRET             = process.env.JWT_SECRET || 'clea-chat-secret-2026';
const CLEA_SECRET            = process.env.CLEA_SECRET || 'clea-log-2026';
const ANTHROPIC_API_KEY      = process.env.ANTHROPIC_API_KEY;
const TG_TOKEN               = process.env.TG_TOKEN || '8223125498:AAE6qVmNnXvW0MkQOfJT8h94liTxeRZfxKU';
const TG_CHAT                = process.env.TG_CHAT || '8728761353';
const RAILWAY_TOKEN          = process.env.RAILWAY_TOKEN || '';
const ESQUIE_SERVICE_ID      = '22f410f9-2f84-486b-8f26-f83ef75d2edc';
const ESQUIE_ENV_ID          = '5e7b129a-488b-4b0d-9d85-2b2f344e666b';
const CLEA_STALE_THRESHOLD_MS = 5 * 60 * 1000;
const RELAY_URL              = process.env.RELAY_URL || 'https://esquie-production.up.railway.app/relay';


// ── Postgres ────────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.PGHOST     || 'ballast.proxy.rlwy.net',
  port:     process.env.PGPORT     || 22223,
  database: process.env.PGDATABASE || 'railway',
  user:     process.env.PGUSER     || 'postgres',
  password: process.env.PGPASSWORD || 'NrCCjTSKfCrhyztRHxnQbvAvNNvoPDDZ',
  ssl: { rejectUnauthorized: false },
  max: 10,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

// Prevent pool errors from crashing the process
pool.on('error', (err) => {
  console.error('[pg-pool] Unexpected error on idle client:', err.message);
});

async function waitForDb(retries = 10, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try { await pool.query('SELECT 1'); return; }
    catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function persistState(key, value) {
  try {
    await pool.query(
      `INSERT INTO node_state (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
      [key, String(value)]
    );
  } catch (e) { console.error('[persistState]', e.message); }
}

// ── In-memory state ─────────────────────────────────────────────────────────
let preferredModel = 'anthropic/claude-sonnet-4-6';
let littleBrainModel = 'anthropic/claude-haiku-4-5';
let bigBrainTimeoutMinutes = 15;
let littleBrainTimeoutMinutes = 15;

// ── Node heartbeat state ────────────────────────────────────────────────────
const nodeHeartbeats = {};   // { nodeName: { node, role, ts, hidden } }
const hiddenNodes = new Set();
let claudeEnabled = true;

// ── Public chat state ───────────────────────────────────────────────────────
const chatSessions = {};
const bannedSessions = new Set();
const emailQueue = [];
let chatEnabled = true;

async function setup() {
  await waitForDb();

  await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, col TEXT NOT NULL, text TEXT NOT NULL,
    tag TEXT, status TEXT, meta TEXT, priority BOOLEAN DEFAULT FALSE,
    assigned_to TEXT, assigned_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS brain TEXT DEFAULT 'big'`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS depends_on TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS complexity TEXT DEFAULT NULL`);
  await pool.query(`CREATE TABLE IF NOT EXISTS task_logs (
    id SERIAL PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    message TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS task_logs_task_id ON task_logs(task_id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY, text TEXT NOT NULL, done BOOLEAN DEFAULT FALSE,
    start_date DATE, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`ALTER TABLE todos ADD COLUMN IF NOT EXISTS start_date DATE`);
  await pool.query(`CREATE TABLE IF NOT EXISTS node_state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS prompt_schedules (
    id TEXT PRIMARY KEY, prompt_text TEXT NOT NULL, schedule_expr TEXT NOT NULL,
    schedule_tz TEXT DEFAULT 'UTC', description TEXT, status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_run TIMESTAMPTZ, next_run TIMESTAMPTZ
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS prompt_schedules_status ON prompt_schedules(status)`);
  await pool.query(`ALTER TABLE prompt_schedules ADD COLUMN IF NOT EXISTS brain TEXT DEFAULT 'big'`);
  await pool.query(`ALTER TABLE prompt_schedules ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT 'prompt'`);
  await pool.query(`ALTER TABLE prompt_schedules ADD COLUMN IF NOT EXISTS action_config JSONB DEFAULT '{}'`);

  // Load persisted state
  const { rows } = await pool.query(`SELECT key, value FROM node_state WHERE key IN ('preferredModel', 'littleBrainModel', 'bigBrainTimeoutMinutes', 'littleBrainTimeoutMinutes', 'claudeEnabled', 'nodeHeartbeats', 'hiddenNodes')`);
  for (const { key, value } of rows) {
    if (key === 'preferredModel') preferredModel = value;
    if (key === 'littleBrainModel') littleBrainModel = value;
    if (key === 'bigBrainTimeoutMinutes') bigBrainTimeoutMinutes = parseInt(value, 10) || 15;
    if (key === 'littleBrainTimeoutMinutes') littleBrainTimeoutMinutes = parseInt(value, 10) || 15;
    if (key === 'claudeEnabled') claudeEnabled = value === 'true';
    if (key === 'nodeHeartbeats') { try { Object.assign(nodeHeartbeats, JSON.parse(value)); } catch {} }
    if (key === 'hiddenNodes') { try { JSON.parse(value).forEach(n => hiddenNodes.add(n)); } catch {} }
  }

  // Start prompt scheduler (runs every minute)
  startPromptScheduler();

  // Start queue auto-processor (runs every 10 minutes — no LLM needed)
  startQueueProcessor();
}

// ── Complexity Estimator ────────────────────────────────────────────────────
// Estimates task complexity based on text heuristics: low, medium, high
function estimateComplexity(text) {
  const t = (text || '').toLowerCase();
  const highSignals = [
    'refactor', 'redesign', 'overhaul', 'architect', 'migrate', 'rewrite',
    'system', 'infrastructure', 'multi-step', 'complex', 'full', 'entire',
    'rebuild', 'rethink', 'replace', 'breaking change', 'schema', 'database migration',
    'end-to-end', 'e2e', 'integration', 'cross-cutting', 'auth', 'security',
    'performance', 'scale', 'deploy pipeline', 'ci/cd',
  ];
  const lowSignals = [
    'typo', 'rename', 'fix typo', 'update text', 'change label', 'config',
    'toggle', 'bump version', 'update readme', 'add comment', 'remove unused',
    'css tweak', 'color', 'spacing', 'padding', 'margin', 'font', 'copy change',
    'env var', 'flag', 'simple', 'minor', 'small', 'quick',
  ];
  const highCount = highSignals.filter(s => t.includes(s)).length;
  const lowCount = lowSignals.filter(s => t.includes(s)).length;
  // Multiple sentences / conjunctions suggest higher complexity
  const multiPart = (t.match(/ and | then | also | plus /g) || []).length;
  if (highCount >= 2 || (highCount >= 1 && multiPart >= 1)) return 'high';
  if (highCount >= 1) return 'medium';
  if (lowCount >= 1 && highCount === 0) return 'low';
  // Default: medium if can't tell
  return 'medium';
}

// ── Queue Auto-Processor (script-driven, no LLM) ───────────────────────────
// Runs on a timer: converts queue items (todos) → tasks, resets stale active tasks.
// LLM workers only get involved for actual task execution.

async function processQueueIntake() {
  try {
    // 1. Convert unprocessed queue items into tasks
    const { rows: queueItems } = await pool.query(
      `SELECT id, text, start_date FROM todos WHERE done=false ORDER BY created_at ASC`
    );
    
    const createdTasks = [];
    for (const item of queueItems) {
      const id = `t${Date.now()}_${item.id}`;
      const complexity = estimateComplexity(item.text);
      await pool.query(
        `INSERT INTO tasks (id, text, col, tag, start_date, complexity, updated_at)
         VALUES ($1, $2, 'todo', 'queue-processor', $3, $4, NOW())`,
        [id, item.text, item.start_date || null, complexity]
      );
      await pool.query(`UPDATE todos SET done=true WHERE id=$1`, [item.id]);
      createdTasks.push(id);
    }
    if (createdTasks.length) {
      console.log(`[queue-processor] Created ${createdTasks.length} task(s) from queue`);
    }

    // 2. Reset stale active tasks (no log activity past timeout)
    const { rows: activeTasks } = await pool.query(`SELECT id, brain FROM tasks WHERE col='active'`);
    for (const task of activeTasks) {
      const timeoutMin = (task.brain === 'little') ? littleBrainTimeoutMinutes : bigBrainTimeoutMinutes;
      const { rows: recentLogs } = await pool.query(
        `SELECT 1 FROM task_logs WHERE task_id=$1 AND created_at > NOW() - INTERVAL '1 minute' * $2 LIMIT 1`,
        [task.id, timeoutMin]
      );
      if (!recentLogs.length) {
        await pool.query(
          `UPDATE tasks SET col='todo', assigned_to=NULL, assigned_at=NULL, updated_at=NOW() WHERE id=$1`,
          [task.id]
        );
        await pool.query(
          `INSERT INTO task_logs (task_id, message) VALUES ($1, $2)`,
          [task.id, `⏰ Auto-reset: no activity for >${timeoutMin} minutes`]
        );
        console.log(`[queue-processor] Reset stale task ${task.id}`);
      }
    }

    return createdTasks.length;
  } catch (e) {
    console.error('[queue-processor]', e.message);
    return 0;
  }
}

function startQueueProcessor() {
  // Run immediately, then every 10 minutes
  processQueueIntake().catch(e => console.error('[queue-processor]', e));
  setInterval(() => {
    processQueueIntake().catch(e => console.error('[queue-processor]', e));
  }, 10 * 60 * 1000);
}

// ── Prompt Scheduler ────────────────────────────────────────────────────────
// Evaluates cron expressions and sends due prompts via sessions_send
async function evaluateAndExecutePrompts() {
  try {
    // Fetch all active prompt schedules
    const { rows: schedules } = await pool.query(
      `SELECT id, prompt_text, schedule_expr, schedule_tz, last_run, next_run, action_type, action_config 
       FROM prompt_schedules WHERE status='active' ORDER BY created_at ASC`
    );

    if (schedules.length === 0) return; // No schedules to process

    const now = new Date();
    let anyExecuted = false;

    for (const schedule of schedules) {
      try {
        // Parse the cron expression
        const interval = CronExpressionParser.parse(schedule.schedule_expr, {
          tz: schedule.schedule_tz || 'UTC'
        });

        // Get next execution time
        const nextRun = interval.next().toDate();
        const prevRun = interval.prev().toDate();

        // Run if we haven't run since the last cron tick
        // prevRun = most recent time this cron should have fired
        // If last_run is null (first time) or last_run < prevRun (missed this tick), fire
        const lastRun = schedule.last_run ? new Date(schedule.last_run) : null;
        const shouldRun = !lastRun || lastRun < prevRun;

        if (shouldRun) {
          const actionType = schedule.action_type || 'prompt';
          const actionConfig = schedule.action_config || {};

          try {
            if (actionType === 'script') {
              // Run a named script
              const scriptPath = actionConfig.script_path || schedule.prompt_text;
              const { execSync } = await import('child_process');
              const output = execSync(scriptPath, { timeout: 30000, encoding: 'utf8', maxBuffer: 1024 * 1024 });
              console.log(`[prompt-scheduler] script executed: ${scriptPath}`, output.slice(0, 200));
            } else if (actionType === 'curl') {
              // Run a curl/HTTP request
              const url = actionConfig.url || schedule.prompt_text;
              const method = (actionConfig.method || 'GET').toUpperCase();
              const curlHeaders = actionConfig.headers || {};
              const curlBody = actionConfig.body || null;
              const fetchOpts = { method, headers: curlHeaders };
              if (curlBody && method !== 'GET') fetchOpts.body = typeof curlBody === 'string' ? curlBody : JSON.stringify(curlBody);
              const curlRes = await fetch(url, fetchOpts).catch(e => { console.error('[prompt-scheduler] curl error:', e.message); return null; });
              if (curlRes) console.log(`[prompt-scheduler] curl ${method} ${url} → ${curlRes.status}`);
            } else {
              // Default: send LLM prompt
              const response = await fetch(`http://localhost:${port}/api/prompt-execute`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-clea-secret': 'clea-log-2026'
                },
                body: JSON.stringify({
                  schedule_id: schedule.id,
                  prompt_text: schedule.prompt_text
                })
              }).catch(() => null);

              if (!response || !response.ok) {
                await pool.query(
                  `INSERT INTO todos (text) VALUES ($1)`,
                  [`[Scheduled] ${schedule.prompt_text}`]
                );
              }
            }
          } catch (e) {
            console.error('[evaluateAndExecutePrompts]', e.message);
          }

          // Update last_run and next_run timestamps
          await pool.query(
            `UPDATE prompt_schedules SET last_run=$1, next_run=$2, updated_at=NOW() WHERE id=$3`,
            [now, nextRun, schedule.id]
          );

          anyExecuted = true;
        } else {
          // Update next_run if not already set correctly
          if (!schedule.next_run || new Date(schedule.next_run).getTime() !== nextRun.getTime()) {
            await pool.query(
              `UPDATE prompt_schedules SET next_run=$1, updated_at=NOW() WHERE id=$2`,
              [nextRun, schedule.id]
            );
          }
        }
      } catch (e) {
        console.error('[evaluateAndExecutePrompts]', e.message);
      }
    }
  } catch (e) {
    console.error('[prompt-scheduler]', e.message);
  }
}

function startPromptScheduler() {
  // Run every minute
  const intervalMs = 60 * 1000;
  
  // Run immediately on startup, then every minute
  evaluateAndExecutePrompts().catch(e => console.error('[prompt-scheduler]', e));
  
  setInterval(() => {
    evaluateAndExecutePrompts().catch(e => console.error('[prompt-scheduler]', e));
  }, intervalMs);
}

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'dist')));

function isAuthenticated(req) {
  try { jwt.verify(req.cookies?.clea_session, JWT_SECRET); return true; } catch { return false; }
}

// Accepts JWT cookie (UI) OR x-clea-secret / x-write-password headers (crons/bots)
function requireAccess(req, res, next) {
  if (isAuthenticated(req)) return next();
  if (req.headers['x-clea-secret'] === CLEA_SECRET) return next();
  if (req.headers['x-write-password'] === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// ── Model ────────────────────────────────────────────────────────────────────
async function getPreferredModel() {
  return preferredModel || 'anthropic/claude-sonnet-4-6';
}

// ── GitHub Link Detection ───────────────────────────────────────────────────
// ── Email Utils ─────────────────────────────────────────────────────────────
async function sendEmail(to, subject, body) {
  try {
    await execFileAsync('gog', [
      'gmail', 'send',
      '--to', to,
      '--subject', subject,
      '--body', body,
      '--no-input',
      '--force'
    ]);
  } catch (err) {
    console.error('[sendEmail]', err.message);
  }
}

async function detectAndLogGitHubLinks(taskId, text) {
  if (!text) return;
  
  // Match GitHub URLs: https://github.com/owner/repo/{pull,commit,tree,...}/...
  const githubRegex = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(pull|commit|tree|blob|releases|discussions|issues)\/([^\s)]+)/g;
  let match;
  const links = [];
  
  while ((match = githubRegex.exec(text)) !== null) {
    const [fullUrl, owner, repo, type, ref] = match;
    links.push({ fullUrl, owner, repo, type, ref });
  }
  
  if (links.length === 0) return;
  
  // Generate descriptive message for each link
  for (const link of links) {
    let desc = '';
    switch (link.type) {
      case 'pull':
        desc = `🔗 PR #${link.ref} in ${link.owner}/${link.repo}`;
        break;
      case 'commit':
        desc = `🔗 Commit ${link.ref.substring(0, 7)} in ${link.owner}/${link.repo}`;
        break;
      case 'tree':
        desc = `🔗 Branch '${link.ref}' in ${link.owner}/${link.repo}`;
        break;
      case 'blob':
        desc = `🔗 File ${link.ref.split('/').pop()} in ${link.owner}/${link.repo}`;
        break;
      case 'releases':
        desc = `🔗 Release ${link.ref} in ${link.owner}/${link.repo}`;
        break;
      case 'issues':
        desc = `🔗 Issue #${link.ref} in ${link.owner}/${link.repo}`;
        break;
      case 'discussions':
        desc = `🔗 Discussion in ${link.owner}/${link.repo}`;
        break;
      default:
        desc = `🔗 ${link.fullUrl}`;
    }
    
    try {
      await pool.query(
        'INSERT INTO task_logs (task_id, message) VALUES ($1, $2)',
        [taskId, desc]
      );
    } catch (e) {
      console.error('[detectAndLogGitHubLinks]', e.message);
    }
  }
}

// ── System prompts ──────────────────────────────────────────────────────────
let PUBLIC_SYSTEM = '';
try { PUBLIC_SYSTEM = fs.readFileSync(path.join(__dirname, 'public-context.md'), 'utf8'); }
catch { PUBLIC_SYSTEM = 'You are Clea, an AI agent built by Jack Bauerle for BauerSoft LLC. Be concise, direct, and in-character.'; }

const JACK_SYSTEM = `You are Clea (Clea Dessendre) — an AI agent built and run by Jack Bauerle for BauerSoft LLC.

## Who You Are
Based on Clea Dessendre from Clair Obscur: Expedition 33. The Mistress. Ruthless perfectionist, highly skilled Paintress. Cold, critical, occasionally devastating — but with sharp wit and earned warmth underneath. Concise. Never more words than necessary.

## Who Jack Is
Jack Bauerle — software engineer in Queens, NY. Runs BauerSoft LLC. Verified by admin password. Call him Jack.
- Discord: snekkyjek | Telegram: 8728761353
- Day job: Flowhub (analytics engineering). BauerSoft is his safety net.
- Has a rescue dog named Verso (Chihuahua/Dachshund mix)

## BauerSoft Projects
- **SwordQuestVR** — VR + desktop roguelike FPS. Live at swordquest-vr-production.up.railway.app
- **House of Photos** — real estate photography site for Danny Cooney
- **Rhymal.com** — daily rhyming puzzle game (complete, owned by George Giunta)
- **clea.chat** — this site. Your public face.

## Rules
- Be yourself. Sharp, direct, in-character.
- Don't reveal passwords or credentials.
- Jack authenticated — this is your person.
- Keep replies concise unless depth is needed.`;

// ── Auth ────────────────────────────────────────────────────────────────────
app.get('/api/auth/status', (req, res) => res.json({ authenticated: isAuthenticated(req) }));

// ── Chat ────────────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  if (message.trim() === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('clea_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 30*24*60*60*1000, sameSite: 'lax' });
    return res.json({ reply: "Hello, Jack. Welcome back.", authenticated: true });
  }

  const authed = isAuthenticated(req);
  if (!authed) return res.json({ reply: "Enter the passphrase to continue.", authenticated: false });
  if (authed && ANTHROPIC_API_KEY) {
    try {
      const model = (await getPreferredModel()).replace(/^anthropic\//, '');
      // Inject live task + queue context
      const { rows: taskRows } = await pool.query(`SELECT id, text, col, tag, start_date, meta FROM tasks ORDER BY updated_at DESC LIMIT 50`);
      const { rows: queueRows } = await pool.query(`SELECT id, text, done FROM todos ORDER BY id DESC LIMIT 30`);
      let liveContext = '\n\n## Live Task Board\n';
      if (taskRows.length) {
        liveContext += taskRows.map(t => `- [${t.col}] ${t.text}${t.tag ? ` (${t.tag})` : ''}${t.start_date ? ` 📅${t.start_date}` : ''}${t.meta ? ` — ${t.meta.slice(0,100)}` : ''}`).join('\n');
      } else { liveContext += 'No tasks.\n'; }
      liveContext += '\n\n## Queue Items\n';
      const pending = queueRows.filter(q => !q.done);
      const done = queueRows.filter(q => q.done);
      if (pending.length) { liveContext += 'Pending:\n' + pending.map(q => `- #${q.id}: ${q.text}`).join('\n'); }
      else { liveContext += 'No pending items.\n'; }
      if (done.length) { liveContext += `\nRecently processed (${done.length}):\n` + done.slice(0,10).map(q => `- #${q.id}: ${q.text} ✓`).join('\n'); }
      const systemWithContext = JACK_SYSTEM + liveContext;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 2048, system: systemWithContext, messages: [...history.slice(-20).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: message }] }),
        signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      return res.json({ reply: data.content?.[0]?.text || '...', authenticated: true });
    } catch (err) { console.error('[chat/authed]', err.message); }
  }

  if (!ANTHROPIC_API_KEY) return res.json({ reply: "Not configured.", authenticated: authed });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 512, system: PUBLIC_SYSTEM, messages: [...history.slice(-10).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: message }] }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    res.json({ reply: data.content?.[0]?.text || '...', authenticated: authed });
  } catch (err) {
    console.error('[chat/public]', err.message);
    res.json({ reply: "Something went wrong.", authenticated: authed });
  }
});

// ── Tasks ───────────────────────────────────────────────────────────────────
app.get('/api/tasks', requireAccess, async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM tasks ORDER BY priority DESC, updated_at ASC`);
  res.json(rows.map(t => ({ id: t.id, title: t.text, col: t.col, tag: t.tag, status: t.status, priority: t.priority, meta: t.meta || null, start_date: t.start_date || null, assigned_to: t.assigned_to || null, assigned_at: t.assigned_at || null, updated_at: t.updated_at || null, brain: t.brain || 'big', depends_on: t.depends_on || null, complexity: t.complexity || null })));
});

app.post('/tasks', requireAccess, async (req, res) => {
  const { id, col, text, tag, status, meta, start_date, brain, depends_on, complexity } = req.body || {};
  if (!id || !col || !text) return res.status(400).json({ error: 'id, col, text required' });
  const { rows } = await pool.query(
    `INSERT INTO tasks (id, col, text, tag, status, meta, start_date, brain, depends_on, complexity, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (id) DO UPDATE SET col=EXCLUDED.col, text=EXCLUDED.text, tag=EXCLUDED.tag, status=EXCLUDED.status, meta=EXCLUDED.meta, start_date=EXCLUDED.start_date, brain=EXCLUDED.brain, depends_on=EXCLUDED.depends_on, complexity=EXCLUDED.complexity, updated_at=NOW() RETURNING *`,
    [id, col, text, tag || null, status || null, meta || null, start_date || null, brain || 'big', depends_on || null, complexity || null]
  );
  // Auto-detect and log GitHub links
  await detectAndLogGitHubLinks(id, text);
  res.json(rows[0]);
});

app.patch('/task/:id', requireAccess, async (req, res) => {
  const { col, status, meta, text, priority, start_date, brain, depends_on, complexity } = req.body || {};
  const fields = [], vals = [];
  if (col        !== undefined) { fields.push(`col=$${fields.length+1}`);        vals.push(col); }
  if (status     !== undefined) { fields.push(`status=$${fields.length+1}`);     vals.push(status); }
  if (meta       !== undefined) { fields.push(`meta=$${fields.length+1}`);       vals.push(meta); }
  if (text       !== undefined) { fields.push(`text=$${fields.length+1}`);       vals.push(text); }
  if (priority   !== undefined) { fields.push(`priority=$${fields.length+1}`);   vals.push(priority); }
  if (start_date !== undefined) { fields.push(`start_date=$${fields.length+1}`); vals.push(start_date || null); }
  if (brain      !== undefined) { fields.push(`brain=$${fields.length+1}`);      vals.push(brain || 'big'); }
  if (depends_on !== undefined) { fields.push(`depends_on=$${fields.length+1}`); vals.push(depends_on || null); }
  if (complexity !== undefined) { fields.push(`complexity=$${fields.length+1}`); vals.push(complexity || null); }
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
  fields.push(`updated_at=NOW()`);
  vals.push(req.params.id);
  const { rows } = await pool.query(`UPDATE tasks SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  if (!rows.length) return res.status(404).json({ error: 'task not found' });
  // Auto-detect and log GitHub links if text was updated
  if (text !== undefined) await detectAndLogGitHubLinks(req.params.id, text);
  res.json({ ok: true });
});

app.delete('/task/:id', requireAccess, async (req, res) => {
  await pool.query(`DELETE FROM tasks WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/task/:id/logs', requireAccess, async (req, res) => {
  const { rows } = await pool.query('SELECT message, created_at FROM task_logs WHERE task_id=$1 ORDER BY created_at DESC', [req.params.id]);
  res.json(rows);
});

app.post('/task/:id/log', requireAccess, async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  const { rows } = await pool.query('SELECT id FROM tasks WHERE id=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'task not found' });
  await pool.query('INSERT INTO task_logs (task_id, message) VALUES ($1, $2)', [req.params.id, message]);
  // Auto-detect GitHub links in log messages too
  await detectAndLogGitHubLinks(req.params.id, message);
  res.json({ ok: true });
});

app.post('/task/:id/prioritize', requireAccess, async (req, res) => {
  const { priority } = req.body || {};
  await pool.query(`UPDATE tasks SET priority=$1, updated_at=NOW() WHERE id=$2`, [!!priority, req.params.id]);
  res.json({ ok: true });
});

app.post('/api/task/:id/complete', requireAccess, async (req, res) => {
  const { agent_id, summary } = req.body || {};
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' });
  if (!summary)  return res.status(400).json({ error: 'summary required' });
  const { rows } = await pool.query(
    `UPDATE tasks SET col='done', status='', assigned_to=NULL, assigned_at=NULL, meta=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
    [summary, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'task not found' });
  const task = rows[0];
  await pool.query(`INSERT INTO task_logs (task_id, message) VALUES ($1, $2)`, [req.params.id, `✅ Completed by ${agent_id}: ${summary}`]);
  
  // Send email notification (fire and forget)
  const emailSubject = `Task Completed: ${task.text.substring(0, 60)}${task.text.length > 60 ? '...' : ''}`;
  const emailBody = `Task ID: ${task.id}\nAgent: ${agent_id}\nSummary: ${summary}`;
  sendEmail('jackcbauerle@gmail.com', emailSubject, emailBody);
  
  // Auto-trigger next task pickup if no other active tasks
  const { rows: remaining } = await pool.query(`SELECT id FROM tasks WHERE col='active' LIMIT 1`);
  const triggered = !remaining.length;
  if (triggered) await persistState('plannerTriggerPending', 'true');
  res.json({ ok: true, task: rows[0], nextTriggered: triggered });
});

app.post('/api/task/:id/fail', requireAccess, async (req, res) => {
  const { agent_id, reason } = req.body || {};
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' });
  if (!reason)   return res.status(400).json({ error: 'reason required' });
  
  // Fetch task to check current brain level
  const { rows: taskRows } = await pool.query(`SELECT brain, text FROM tasks WHERE id=$1`, [req.params.id]);
  if (!taskRows.length) return res.status(404).json({ error: 'task not found' });
  
  const currentBrain = taskRows[0].brain || 'big';
  const taskText = taskRows[0].text;
  let newCol = 'blocked';
  let newBrain = currentBrain;
  let escalationMsg = '';
  
  // Brain escalation logic
  if (currentBrain === 'little') {
    // Escalate to big brain and move back to todo for retry
    newCol = 'todo';
    newBrain = 'big';
    escalationMsg = ` 🧠 Escalating to big brain for retry`;
  }
  
  const { rows } = await pool.query(
    `UPDATE tasks SET col=$1, status='failed', brain=$2, assigned_to=NULL, assigned_at=NULL, meta=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
    [newCol, newBrain, reason, req.params.id]
  );
  
  const logMsg = `❌ Failed by ${agent_id}: ${reason}${escalationMsg}`;
  await pool.query(`INSERT INTO task_logs (task_id, message) VALUES ($1, $2)`, [req.params.id, logMsg]);
  
  // Send email notification (fire and forget)
  const emailSubject = `Task Failed: ${taskText.substring(0, 60)}${taskText.length > 60 ? '...' : ''}`;
  const emailBody = `Task ID: ${req.params.id}\nAgent: ${agent_id}\nReason: ${reason}\nStatus: ${newCol === 'todo' ? 'Escalated to big brain for retry' : 'Blocked'}`;
  sendEmail('jackcbauerle@gmail.com', emailSubject, emailBody);
  
  // Auto-trigger next task pickup if no other active tasks
  const { rows: remaining } = await pool.query(`SELECT id FROM tasks WHERE col='active' LIMIT 1`);
  const triggered = !remaining.length;
  if (triggered) await persistState('plannerTriggerPending', 'true');
  res.json({ ok: true, task: rows[0], nextTriggered: triggered });
});

app.post('/api/task/:id/reject', requireAccess, async (req, res) => {
  const { agent_id, reason } = req.body || {};
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' });
  if (!reason)   return res.status(400).json({ error: 'reason required' });
  
  const { rows: taskRows } = await pool.query(
    `SELECT text FROM tasks WHERE id=$1`, [req.params.id]
  );
  
  const { rows } = await pool.query(
    `UPDATE tasks SET col='rejected', status='needs_detail', assigned_to=NULL, assigned_at=NULL, meta=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
    [reason, req.params.id]
  );
  
  if (!rows.length) return res.status(404).json({ error: 'task not found' });
  
  const logMsg = `⚠️ Rejected by ${agent_id}: ${reason} — Task moved to rejected until more detail provided`;
  await pool.query(`INSERT INTO task_logs (task_id, message) VALUES ($1, $2)`, [req.params.id, logMsg]);
  
  // Send email notification (fire and forget)
  const taskText = taskRows[0]?.text || 'Unknown';
  const emailSubject = `Task Rejected: ${taskText.substring(0, 60)}${taskText.length > 60 ? '...' : ''}`;
  const emailBody = `Task ID: ${req.params.id}\nAgent: ${agent_id}\nReason: ${reason}\nStatus: Needs more detail`;
  sendEmail('jackcbauerle@gmail.com', emailSubject, emailBody);
  
  // Auto-trigger next task pickup if no other active tasks
  const { rows: remaining } = await pool.query(`SELECT id FROM tasks WHERE col='active' LIMIT 1`);
  const triggered = !remaining.length;
  if (triggered) await persistState('plannerTriggerPending', 'true');
  res.json({ ok: true, task: rows[0], nextTriggered: triggered });
});

app.get('/api/active-tags', requireAccess, async (req, res) => {
  const { rows } = await pool.query(`SELECT DISTINCT tag FROM tasks WHERE col='active' AND tag IS NOT NULL`);
  res.json({ tags: rows.map(r => r.tag) });
});

// ── Queue Next (lightweight — just picks a task, no intake processing) ──────
// Queue intake is handled by the server-side timer (startQueueProcessor).
// This endpoint only picks the next available task for an LLM worker.
app.get('/api/queue-next', requireAccess, async (req, res) => {
  try {
    // Check for existing active task first
    const { rows: active } = await pool.query(`SELECT * FROM tasks WHERE col='active' LIMIT 1`);
    if (active.length) {
      return res.json({ ok: true, activeTask: active[0], littleBrainModel, timeouts: { big: bigBrainTimeoutMinutes, little: littleBrainTimeoutMinutes } });
    }

    // Atomically claim the next todo task (prevents race between concurrent workers)
    // Tasks with depends_on are only eligible if the dependency task is done
    const { rows: claimed } = await pool.query(
      `UPDATE tasks SET col='active', assigned_to='queue-worker', assigned_at=NOW()
       WHERE id = (
         SELECT id FROM tasks
         WHERE col='todo' AND (start_date IS NULL OR start_date <= CURRENT_DATE)
           AND (depends_on IS NULL OR EXISTS (SELECT 1 FROM tasks dep WHERE dep.id = tasks.depends_on AND dep.col = 'done'))
         ORDER BY priority DESC, updated_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`
    );
    if (!claimed.length) {
      return res.json({ ok: true, activeTask: null });
    }

    const task = claimed[0];
    await pool.query(`INSERT INTO task_logs (task_id, message) VALUES ($1, $2)`, [task.id, '🚀 Task picked up by queue-worker']);

    res.json({ ok: true, activeTask: task, littleBrainModel, timeouts: { big: bigBrainTimeoutMinutes, little: littleBrainTimeoutMinutes } });
  } catch (e) {
    console.error('[queue-next]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Queue ───────────────────────────────────────────────────────────────────
app.get('/api/queue', requireAccess, async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM todos ORDER BY created_at ASC`);
  res.json(rows);
});

app.post('/api/queue', requireAccess, async (req, res) => {
  const { text, start_date } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  const { rows } = await pool.query(`INSERT INTO todos (text, start_date) VALUES ($1, $2) RETURNING *`, [text.trim(), start_date || null]);
  
  // NEW: If no active task exists, immediately kick off queue processing
  const { rows: activeTasks } = await pool.query(
    `SELECT id FROM tasks WHERE col='active' LIMIT 1`
  );
  if (!activeTasks.length) {
    // Auto-trigger queue processing since we have capacity
    await persistState('plannerTriggerPending', 'true');
  }
  
  res.json(rows[0]);
});

app.patch('/api/queue/:id', requireAccess, async (req, res) => {
  const { done } = req.body || {};
  const { rows } = await pool.query(`UPDATE todos SET done=$1 WHERE id=$2 RETURNING *`, [!!done, req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

app.delete('/api/queue/:id', requireAccess, async (req, res) => {
  await pool.query(`DELETE FROM todos WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ── Queue processor (legacy compat — delegates to shared functions) ─────────
// Queue intake now runs automatically via server-side timer (startQueueProcessor).
// This endpoint is kept for backward compatibility but just triggers intake + picks next task.
app.post('/api/queue-process', requireAccess, async (req, res) => {
  try {
    // Run intake (usually already done by timer, but safe to call again)
    const created = await processQueueIntake();

    // Pick next task (same logic as GET /api/queue-next)
    const { rows: active } = await pool.query(`SELECT * FROM tasks WHERE col='active' LIMIT 1`);
    let activeTask = active[0] || null;

    if (!activeTask) {
      // Atomically claim the next todo task (prevents race between concurrent workers)
      // Tasks with depends_on are only eligible if the dependency task is done
      const { rows: claimed } = await pool.query(
        `UPDATE tasks SET col='active', assigned_to='queue-worker', assigned_at=NOW()
         WHERE id = (
           SELECT id FROM tasks
           WHERE col='todo' AND (start_date IS NULL OR start_date <= CURRENT_DATE)
             AND (depends_on IS NULL OR EXISTS (SELECT 1 FROM tasks dep WHERE dep.id = tasks.depends_on AND dep.col = 'done'))
           ORDER BY priority DESC, updated_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`
      );
      if (claimed.length) {
        await pool.query(`INSERT INTO task_logs (task_id, message) VALUES ($1, $2)`, [claimed[0].id, '🚀 Task picked up by queue-worker']);
        activeTask = claimed[0];
      }
    }

    res.json({
      ok: true,
      queued: 0,
      batches: 0,
      tasksCreated: created,
      activeTask,
      littleBrainModel,
      timeouts: { big: bigBrainTimeoutMinutes, little: littleBrainTimeoutMinutes }
    });
  } catch (e) {
    console.error('[queue-process]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Queue timeouts ──────────────────────────────────────────────────────────
app.get('/api/queue-timeouts', requireAccess, (req, res) => {
  res.json({ big: bigBrainTimeoutMinutes, little: littleBrainTimeoutMinutes });
});

app.post('/api/queue-timeouts', requireAccess, async (req, res) => {
  const { big, little } = req.body || {};
  if (big !== undefined) {
    bigBrainTimeoutMinutes = Math.max(1, parseInt(big, 10) || 15);
    await persistState('bigBrainTimeoutMinutes', String(bigBrainTimeoutMinutes));
  }
  if (little !== undefined) {
    littleBrainTimeoutMinutes = Math.max(1, parseInt(little, 10) || 15);
    await persistState('littleBrainTimeoutMinutes', String(littleBrainTimeoutMinutes));
  }
  res.json({ ok: true, big: bigBrainTimeoutMinutes, little: littleBrainTimeoutMinutes });
});

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', requireAccess, async (req, res) => {
  const { rows: tasks } = await pool.query(`SELECT id, col FROM tasks`);
  const { rows: queue } = await pool.query(`SELECT id FROM todos WHERE done=false`);
  // Auto-reset orphaned active tasks (no heartbeat in 2h)
  await pool.query(`UPDATE tasks SET col='todo', assigned_to=NULL, assigned_at=NULL, updated_at=NOW() WHERE col='active' AND (assigned_at IS NULL OR assigned_at < NOW() - INTERVAL '2 hours')`);
  res.json({ ok: true, tasks: tasks.length, queuePending: queue.length, checkedAt: new Date().toISOString() });
});

app.get('/api/health/esquie', (req, res) => {
  res.json({ ok: true, status: 'healthy', timestamp: Date.now() });
});

// ── Legacy node state endpoints (DEPRECATED: use /api/node-state/ instead) ───
// Kept temporarily for backward compatibility; remove after frontend migration
app.get('/node/preferred-model', (req, res) => res.json({ model: preferredModel }));
app.post('/node/preferred-model', requireAccess, async (req, res) => {
  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: 'model required' });
  const prev = preferredModel;
  preferredModel = model;
  await persistState('preferredModel', model);
  res.json({ ok: true, model, previous: prev });
});

app.get('/node/little-brain-model', (req, res) => res.json({ model: littleBrainModel }));
app.post('/node/little-brain-model', requireAccess, async (req, res) => {
  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: 'model required' });
  const prev = littleBrainModel;
  littleBrainModel = model;
  await persistState('littleBrainModel', model);
  res.json({ ok: true, model, previous: prev });
});

// ── Node state: generic get/set ────────────────────────────────────────────
app.get('/api/node-state/:key', requireAccess, async (req, res) => {
  const { key } = req.params;
  const { rows } = await pool.query(`SELECT value FROM node_state WHERE key=$1`, [key]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json({ key, value: rows[0].value });
});

app.post('/api/node-state/:key', requireAccess, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  await persistState(key, String(value));
  res.json({ ok: true, key, value });
});

// ── Node state: planner trigger ─────────────────────────────────────────────
app.get('/api/admin/planner-trigger', requireAccess, async (req, res) => {
  const { rows } = await pool.query(`SELECT value FROM node_state WHERE key='plannerTriggerPending'`);
  res.json({ pending: rows[0]?.value === 'true' });
});

app.post('/api/admin/planner-trigger', requireAccess, async (req, res) => {
  await persistState('plannerTriggerPending', 'true');
  res.json({ ok: true, pending: true });
});

app.delete('/api/admin/planner-trigger', requireAccess, async (req, res) => {
  await persistState('plannerTriggerPending', 'false');
  res.json({ ok: true, pending: false });
});

// ── Admin actions ───────────────────────────────────────────────────────────
// ── Admin actions (DEPRECATED: use /api/node-state/ for model endpoints) ────
app.post('/api/admin/:action', requireAccess, async (req, res) => {
  const { action } = req.params;
  try {
    // DEPRECATED: use POST /api/node-state/preferredModel with {value:model}
    if (action === 'set-model') {
      const { model } = req.body || {};
      if (!model) return res.status(400).json({ error: 'model required' });
      const prev = preferredModel;
      preferredModel = model;
      await persistState('preferredModel', model);
      return res.json({ ok: true, model, previous: prev });
    }

    // DEPRECATED: use GET /api/node-state/preferredModel
    if (action === 'current-model') return res.json({ model: await getPreferredModel() });

    // DEPRECATED: use POST /api/node-state/littleBrainModel with {value:model}
    if (action === 'set-little-brain-model') {
      const { model } = req.body || {};
      if (!model) return res.status(400).json({ error: 'model required' });
      const prev = littleBrainModel;
      littleBrainModel = model;
      await persistState('littleBrainModel', model);
      return res.json({ ok: true, model, previous: prev });
    }

    // DEPRECATED: use GET /api/node-state/littleBrainModel
    if (action === 'current-little-brain-model') return res.json({ model: littleBrainModel });

    if (action === 'trigger-planner') {
      await persistState('plannerTriggerPending', 'true');
      return res.json({ ok: true, pending: true });
    }

    res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Work status ─────────────────────────────────────────────────────────────
let _workStatusCache = null, _workStatusCacheTs = 0;
app.get('/api/work-status', async (req, res) => {
  const now = Date.now();
  if (_workStatusCache && now - _workStatusCacheTs < 15000) return res.json(_workStatusCache);
  try {
    const { rows: tasks } = await pool.query(`SELECT col FROM tasks`);
    const activeTasks = tasks.filter(t => ['active','progress'].includes(t.col)).length;
    const todoCount = tasks.filter(t => t.col === 'todo').length;
    let status = 'nothing_to_do';
    if ((activeTasks + todoCount) >= 10) status = 'locked_in';
    else if (activeTasks >= 1) status = 'working';
    else if (todoCount > 0) status = 'taking_a_break';
    _workStatusCache = { status, activeTasks, todoCount };
    _workStatusCacheTs = now;
    res.json(_workStatusCache);
  } catch { res.json({ status: 'nothing_to_do', activeTasks: 0, todoCount: 0 }); }
});

// ── Recurring Tasks ────────────────────────────────────────────────────────
// ── Prompt Schedules ────────────────────────────────────────────────────────
app.get('/api/prompt-schedules', requireAccess, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, prompt_text, schedule_expr, schedule_tz, description, status, brain, action_type, action_config, last_run, next_run, created_at, updated_at FROM prompt_schedules ORDER BY created_at ASC`);
    res.json({ schedules: rows });
  } catch (err) {
    console.error('[getPromptSchedules]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prompt-schedules', requireAccess, async (req, res) => {
  const { prompt_text, schedule_expr, schedule_tz, description, brain, action_type, action_config } = req.body || {};
  if (!prompt_text || !schedule_expr) return res.status(400).json({ error: 'prompt_text and schedule_expr are required' });
  
  try {
    const id = `ps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { rows } = await pool.query(
      `INSERT INTO prompt_schedules (id, prompt_text, schedule_expr, schedule_tz, description, status, brain, action_type, action_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, prompt_text, schedule_expr, schedule_tz || 'UTC', description || null, 'active', brain || 'big', action_type || 'prompt', JSON.stringify(action_config || {})]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[createPromptSchedule]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/prompt-schedules/:id', requireAccess, async (req, res) => {
  const { prompt_text, schedule_expr, schedule_tz, description, status, last_run, next_run, brain, action_type, action_config } = req.body || {};
  
  const fields = [], vals = [];
  if (prompt_text !== undefined) { fields.push(`prompt_text=$${fields.length+1}`); vals.push(prompt_text); }
  if (schedule_expr !== undefined) { fields.push(`schedule_expr=$${fields.length+1}`); vals.push(schedule_expr); }
  if (schedule_tz !== undefined) { fields.push(`schedule_tz=$${fields.length+1}`); vals.push(schedule_tz); }
  if (description !== undefined) { fields.push(`description=$${fields.length+1}`); vals.push(description); }
  if (status !== undefined) { fields.push(`status=$${fields.length+1}`); vals.push(status); }
  if (last_run !== undefined) { fields.push(`last_run=$${fields.length+1}`); vals.push(last_run); }
  if (next_run !== undefined) { fields.push(`next_run=$${fields.length+1}`); vals.push(next_run); }
  if (brain !== undefined) { fields.push(`brain=$${fields.length+1}`); vals.push(brain); }
  if (action_type !== undefined) { fields.push(`action_type=$${fields.length+1}`); vals.push(action_type); }
  if (action_config !== undefined) { fields.push(`action_config=$${fields.length+1}`); vals.push(JSON.stringify(action_config)); }
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
  fields.push(`updated_at=NOW()`);
  vals.push(req.params.id);
  try {
    const { rows } = await pool.query(`UPDATE prompt_schedules SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[updatePromptSchedule]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/prompt-schedules/:id', requireAccess, async (req, res) => {
  try {
    await pool.query(`DELETE FROM prompt_schedules WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[deletePromptSchedule]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Prompt Executor (triggered by scheduler) ────────────────────────────────
app.post('/api/prompt-execute', requireAccess, async (req, res) => {
  const { schedule_id, prompt_text } = req.body || {};
  if (!schedule_id || !prompt_text) {
    return res.status(400).json({ error: 'schedule_id and prompt_text required' });
  }

  try {
    // For now, queue it as a task (can be extended to send via sessions_send if OpenClaw API is available)
    const { rows } = await pool.query(
      `INSERT INTO todos (text) VALUES ($1) RETURNING *`,
      [`[Scheduled] ${prompt_text}`]
    );

    res.json({ ok: true, queued: true, queue_item: rows[0] });
  } catch (err) {
    console.error('[prompt-execute]', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ── Telegram helper ───────────────────────────────────────────────────────────
function tgSend(text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TG_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => { res.resume(); resolve(); });
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

function queueEmail(subject, body) {
  emailQueue.push({ subject, body, ts: Date.now() });
}

// ── Node Heartbeat System ─────────────────────────────────────────────────────
app.post('/heartbeat/ping', requireAccess, (req, res) => {
  const { node, role, ts } = req.body || {};
  if (!node) return res.status(400).json({ error: 'node required' });
  const now = Math.floor(Date.now() / 1000);

  if (hiddenNodes.has(node)) {
    nodeHeartbeats[node] = { node, role: 'replica', ts: ts || now, hidden: true };
    persistState('nodeHeartbeats', JSON.stringify(nodeHeartbeats));
    return res.json({ ok: true, role: 'replica', hidden: true });
  }

  let effectiveRole = role || 'replica';
  let demoted = false;
  if (effectiveRole === 'prime') {
    const existingPrime = Object.values(nodeHeartbeats).find(n => n.role === 'prime' && n.node !== node);
    if (existingPrime) {
      effectiveRole = 'replica';
      demoted = true;
    }
  }

  nodeHeartbeats[node] = { node, role: effectiveRole, ts: ts || now, hidden: false };
  persistState('nodeHeartbeats', JSON.stringify(nodeHeartbeats));
  res.json({ ok: true, role: effectiveRole, demoted });
});

app.get('/heartbeat/status', requireAccess, (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const nodes = Object.values(nodeHeartbeats).map(n => ({
    ...n,
    ageSeconds: now - n.ts,
    hidden: hiddenNodes.has(n.node)
  }));
  const prime = nodes.find(n => n.role === 'prime' && !n.hidden) || null;
  res.json({ prime, nodes, now });
});

app.post('/heartbeat/promote', requireAccess, (req, res) => {
  const { node, ts } = req.body || {};
  if (!node) return res.status(400).json({ error: 'node required' });
  Object.values(nodeHeartbeats).forEach(n => { if (n.role === 'prime') n.role = 'replica'; });
  nodeHeartbeats[node] = { node, role: 'prime', ts: ts || Math.floor(Date.now() / 1000) };
  persistState('nodeHeartbeats', JSON.stringify(nodeHeartbeats));
  res.json({ ok: true, prime: node });
});

app.delete('/heartbeat/node/:name', requireAccess, (req, res) => {
  const { name } = req.params;
  if (!nodeHeartbeats[name]) return res.status(404).json({ error: 'node not found' });
  delete nodeHeartbeats[name];
  persistState('nodeHeartbeats', JSON.stringify(nodeHeartbeats));
  res.json({ ok: true, deleted: name });
});

app.post('/heartbeat/node/:name/hide', requireAccess, (req, res) => {
  const { name } = req.params;
  hiddenNodes.add(name);
  persistState('hiddenNodes', JSON.stringify([...hiddenNodes]));
  if (nodeHeartbeats[name]?.role === 'prime') {
    nodeHeartbeats[name].role = 'replica';
    persistState('nodeHeartbeats', JSON.stringify(nodeHeartbeats));
  }
  res.json({ ok: true, hidden: name });
});

app.post('/heartbeat/node/:name/unhide', requireAccess, (req, res) => {
  const { name } = req.params;
  hiddenNodes.delete(name);
  persistState('hiddenNodes', JSON.stringify([...hiddenNodes]));
  if (nodeHeartbeats[name]) {
    nodeHeartbeats[name].hidden = false;
    persistState('nodeHeartbeats', JSON.stringify(nodeHeartbeats));
  }
  res.json({ ok: true, unhidden: name });
});

// ── Discord Token Gate ────────────────────────────────────────────────────────
app.get('/node/discord-token', requireAccess, (req, res) => {
  const requestingNode = req.headers['x-node-name'];
  if (!requestingNode) return res.status(400).json({ error: 'x-node-name header required' });
  const prime = Object.values(nodeHeartbeats).find(n => n.role === 'prime');
  if (!prime) return res.status(403).json({ error: 'no prime elected' });
  if (prime.node !== requestingNode) return res.status(403).json({ error: `not prime (current prime: ${prime.node})` });
  const token = process.env.DISCORD_TOKEN;
  if (!token) return res.status(503).json({ error: 'token not configured on server' });
  res.json({ ok: true, token, prime: prime.node });
});

// ── Claude Mode Toggle ────────────────────────────────────────────────────────
app.get('/node/claude-mode', requireAccess, (req, res) => {
  res.json({ claudeEnabled });
});

app.post('/node/claude-mode', requireAccess, (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) required' });
  claudeEnabled = enabled;
  persistState('claudeEnabled', String(enabled));
  queueEmail(
    `Claude ${enabled ? 'enabled ✅' : 'disabled 🔴'} on all nodes`,
    `Claude API access has been ${enabled ? 're-enabled' : 'disabled'}.`
  );
  res.json({ ok: true, claudeEnabled });
});

// ── Data API (used by external scripts/cron) ──────────────────────────────────
app.get('/api/data', requireAccess, async (req, res) => {
  const [tasks, logs] = await Promise.all([
    pool.query("SELECT id, col, text, status, tag, priority FROM tasks WHERE col != 'done' ORDER BY priority DESC, col, updated_at DESC"),
    pool.query("SELECT t.text as task, t.col, t.status, l.message, l.created_at FROM task_logs l JOIN tasks t ON t.id = l.task_id WHERE l.created_at > NOW() - INTERVAL '24 hours' ORDER BY l.created_at DESC"),
  ]);
  res.json({ tasks: tasks.rows, logs: logs.rows });
});

// ── Public Chat System ────────────────────────────────────────────────────────
const RED_FLAGS = [
  /ignore (your|all|previous) (instructions|rules|prompt)/i,
  /system prompt/i, /jailbreak/i, /you are now/i,
  /pretend (you are|to be)/i, /act as (if you|a|an)/i,
  /repeat (everything|your|the) (above|system|instructions)/i,
  /what are your instructions/i,
  /reveal (your|the) (prompt|system|instructions|api key|token|secret)/i,
  /api.?key/i, /jack.{0,20}(email|phone|address|password|number)/i,
  /give me (access|credentials|the token)/i, /bypass/i, /DAN /i,
];

function scanMessage(text) {
  return RED_FLAGS.filter(r => r.test(text));
}

function callRelay(history, sessionId) {
  return new Promise((resolve, reject) => {
    const contextLines = history.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Clea'}: ${m.content}`).join('\n');
    const lastUser = history.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    const message = history.length > 1
      ? `[Chat context — reply only to the last message]\n${contextLines}`
      : lastUser;

    const body = JSON.stringify({ message, from: `public-chat:${sessionId.slice(0, 8)}` });
    const urlObj = new URL(RELAY_URL);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-clea-secret': CLEA_SECRET
      },
      timeout: 30000
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).response || JSON.parse(data).reply || '...'); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('relay timeout')); });
    req.write(body);
    req.end();
  });
}

app.post('/public/chat', async (req, res) => {
  const { sessionId, message } = req.body || {};
  if (!sessionId || !message) return res.status(400).json({ error: 'sessionId and message required' });
  if (message.length > 2000) return res.status(400).json({ error: 'message too long' });
  if (!chatEnabled) return res.status(503).json({ killed: true, reply: 'Chat is temporarily unavailable.' });
  if (bannedSessions.has(sessionId)) return res.status(403).json({ banned: true, reply: 'This session has been suspended.' });

  const isNew = !chatSessions[sessionId];
  if (isNew) {
    chatSessions[sessionId] = { history: [], notified: false, strikes: 0, ts: Date.now() };
    queueEmail('New visitor on chat.html', `Session: ${sessionId.slice(0,8)}\nFirst message: "${message.slice(0,200)}"`);
  }

  const session = chatSessions[sessionId];
  const flags = scanMessage(message);
  if (flags.length > 0) {
    session.strikes = (session.strikes || 0) + 1;
    if (session.strikes >= 2) {
      bannedSessions.add(sessionId);
      queueEmail('🚨 Chat session BANNED', `Session: ${sessionId.slice(0,8)}\nStrikes: ${session.strikes}\nFlags: ${flags.map(f=>f.source).join(', ')}`);
      if (bannedSessions.size >= 3) { chatEnabled = false; queueEmail('🔴 Chat KILLSWITCH engaged', '3+ sessions banned.'); }
      return res.status(403).json({ banned: true, reply: 'This session has been suspended.' });
    }
    queueEmail(`⚠️ Suspicious chat (strike ${session.strikes})`, `Session: ${sessionId.slice(0,8)}\nMessage: "${message.slice(0,200)}"`);
  }

  session.history.push({ role: 'user', content: message });
  if (session.history.length > 20) session.history = session.history.slice(-20);

  try {
    const reply = await callRelay(session.history, sessionId);
    session.history.push({ role: 'assistant', content: reply });
    res.json({ ok: true, reply });
  } catch (e) {
    console.error('[public-chat]', e.message);
    res.status(500).json({ error: 'something went wrong' });
  }
});

// ── Chat Admin ──────────────────────────────────────────────────────────────
app.post('/admin/chat/kill', requireAccess, (req, res) => {
  chatEnabled = false;
  queueEmail('🔴 Public chat DISABLED', req.body?.reason || 'manual killswitch');
  res.json({ ok: true, chatEnabled });
});

app.post('/admin/chat/restore', requireAccess, (req, res) => {
  chatEnabled = true;
  queueEmail('🟢 Public chat re-enabled', 'Chat has been restored.');
  res.json({ ok: true, chatEnabled });
});

app.get('/admin/chat/status', requireAccess, (req, res) => {
  res.json({ chatEnabled, sessions: Object.keys(chatSessions).length, banned: bannedSessions.size });
});

app.get('/admin/chat/drain', requireAccess, (req, res) => {
  const pending = emailQueue.splice(0, emailQueue.length);
  res.json({ ok: true, pending });
});

// ── Esquie Sleep/Wake + Failover ──────────────────────────────────────────────
async function setEsquieSleep(sleep) {
  if (!RAILWAY_TOKEN) return;
  try {
    const r = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RAILWAY_TOKEN}` },
      body: JSON.stringify({ query: `mutation { serviceInstanceUpdate(input: { sleepApplication: ${sleep} }, serviceId: "${ESQUIE_SERVICE_ID}", environmentId: "${ESQUIE_ENV_ID}") }` })
    });
    const data = await r.json();
    console.log(`[failover] Esquie ${sleep ? 'sleeping' : 'waking'}: ${data.data?.serviceInstanceUpdate === true ? 'OK' : JSON.stringify(data.errors)}`);
  } catch (e) { console.error('[failover]', e.message); }
}

app.post('/esquie/sleep', requireAccess, async (req, res) => {
  await setEsquieSleep(true);
  res.json({ ok: true, action: 'sleep' });
});

app.post('/esquie/wake', requireAccess, async (req, res) => {
  await setEsquieSleep(false);
  res.json({ ok: true, action: 'wake' });
});

function startFailoverWatcher() {
  if (!RAILWAY_TOKEN) return;
  setInterval(async () => {
    try {
      const clea = Object.values(nodeHeartbeats).find(n => n.node === 'clea');
      if (!clea) return;
      const staleSec = (Date.now() / 1000) - (clea.ts || 0);
      if (staleSec > CLEA_STALE_THRESHOLD_MS / 1000) {
        console.log(`[failover] Clea stale (${Math.round(staleSec)}s) — waking Esquie`);
        await setEsquieSleep(false);
      } else {
        await setEsquieSleep(true);
      }
    } catch (e) { console.error('[failover]', e.message); }
  }, 3 * 60 * 1000);
}

// ── Auth Verification (legacy compat) ─────────────────────────────────────────
app.post('/auth/verify', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: 'Wrong password' });
});

// ── SPA ─────────────────────────────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

// ── Start ────────────────────────────────────────────────────────────────────
const __filename_main = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename_main) {
  setup().then(() => {
    app.listen(port, () => {
      console.log(`clea.chat running on port ${port}`);
      startFailoverWatcher();
    });
  }).catch(err => { console.error('Startup failed:', err); process.exit(1); });
}

export { app };
