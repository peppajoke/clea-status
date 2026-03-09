import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
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


// ── Postgres ────────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.PGHOST     || 'ballast.proxy.rlwy.net',
  port:     process.env.PGPORT     || 22223,
  database: process.env.PGDATABASE || 'railway',
  user:     process.env.PGUSER     || 'postgres',
  password: process.env.PGPASSWORD || 'NrCCjTSKfCrhyztRHxnQbvAvNNvoPDDZ',
  ssl: { rejectUnauthorized: false },
  max: 10,
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

  // Load persisted state
  const { rows } = await pool.query(`SELECT key, value FROM node_state WHERE key IN ('preferredModel', 'littleBrainModel')`);
  for (const { key, value } of rows) {
    if (key === 'preferredModel') preferredModel = value;
    if (key === 'littleBrainModel') littleBrainModel = value;
  }

  // Start prompt scheduler (runs every minute)
  startPromptScheduler();
}

// ── Prompt Scheduler ────────────────────────────────────────────────────────
// Evaluates cron expressions and sends due prompts via sessions_send
async function evaluateAndExecutePrompts() {
  try {
    // Fetch all active prompt schedules
    const { rows: schedules } = await pool.query(
      `SELECT id, prompt_text, schedule_expr, schedule_tz, last_run, next_run 
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
          // Send the prompt via sessions_send to main OpenClaw session
          try {
            // Send prompt to main session (label can be 'main' or based on context)
            const response = await fetch('http://localhost:3000/api/prompt-execute', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-clea-secret': 'clea-log-2026'
              },
              body: JSON.stringify({
                schedule_id: schedule.id,
                prompt_text: schedule.prompt_text
              })
            }).catch(() => null); // Fail silently if /api/prompt-execute doesn't exist yet

            if (!response || !response.ok) {
              // Fallback: Queue as a task item if sessions_send not available
              await pool.query(
                `INSERT INTO todos (text) VALUES ($1)`,
                [`[Scheduled] ${schedule.prompt_text}`]
              );
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
          if (!schedule.next_run || new Date(schedule.next_run) !== nextRun) {
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
app.use('/tasks', express.static(path.join(__dirname, 'dist')));
app.use('/static', express.static(path.join(__dirname, 'public')));

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
  res.json(rows.map(t => ({ id: t.id, title: t.text, col: t.col, tag: t.tag, status: t.status, priority: t.priority, meta: t.meta || null, start_date: t.start_date || null, assigned_to: t.assigned_to || null, assigned_at: t.assigned_at || null, updated_at: t.updated_at || null, brain: t.brain || 'big', depends_on: t.depends_on || null })));
});

app.post('/tasks', requireAccess, async (req, res) => {
  const { id, col, text, tag, status, meta, start_date, brain, depends_on } = req.body || {};
  if (!id || !col || !text) return res.status(400).json({ error: 'id, col, text required' });
  const { rows } = await pool.query(
    `INSERT INTO tasks (id, col, text, tag, status, meta, start_date, brain, depends_on, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (id) DO UPDATE SET col=EXCLUDED.col, text=EXCLUDED.text, tag=EXCLUDED.tag, status=EXCLUDED.status, meta=EXCLUDED.meta, start_date=EXCLUDED.start_date, brain=EXCLUDED.brain, depends_on=EXCLUDED.depends_on, updated_at=NOW() RETURNING *`,
    [id, col, text, tag || null, status || null, meta || null, start_date || null, brain || 'big', depends_on || null]
  );
  // Auto-detect and log GitHub links
  await detectAndLogGitHubLinks(id, text);
  res.json(rows[0]);
});

app.patch('/task/:id', requireAccess, async (req, res) => {
  const { col, status, meta, text, priority, start_date, brain, depends_on } = req.body || {};
  const fields = [], vals = [];
  if (col        !== undefined) { fields.push(`col=$${fields.length+1}`);        vals.push(col); }
  if (status     !== undefined) { fields.push(`status=$${fields.length+1}`);     vals.push(status); }
  if (meta       !== undefined) { fields.push(`meta=$${fields.length+1}`);       vals.push(meta); }
  if (text       !== undefined) { fields.push(`text=$${fields.length+1}`);       vals.push(text); }
  if (priority   !== undefined) { fields.push(`priority=$${fields.length+1}`);   vals.push(priority); }
  if (start_date !== undefined) { fields.push(`start_date=$${fields.length+1}`); vals.push(start_date || null); }
  if (brain      !== undefined) { fields.push(`brain=$${fields.length+1}`);      vals.push(brain || 'big'); }
  if (depends_on !== undefined) { fields.push(`depends_on=$${fields.length+1}`); vals.push(depends_on || null); }
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

// ── Queue processor (mechanical work: read → batch → create tasks → mark active) ──
app.post('/api/queue-process', requireAccess, async (req, res) => {
  try {
    // 1. Read unprocessed queue items
    const { rows: queueItems } = await pool.query(
      `SELECT id, text, start_date FROM todos WHERE done=false ORDER BY created_at ASC`
    );

    // 2. One queue item = one task (no batching — batching merged unrelated items)
    const batches = queueItems.map(item => [item]);

    // 3. Create tasks from batches
    const createdTasks = [];
    for (const batch of batches) {
      const batchText = batch.length === 1 
        ? batch[0].text 
        : `${batch[0].text.split(':')[0]}: ${batch.map(i => i.text).join(' + ')}`;
      
      const batchMeta = null;
      const id = `t${Math.floor(Date.now())}`;
      const batchStartDate = batch[0].start_date || null;
      const cleanText = batchText;
      
      await pool.query(
        `INSERT INTO tasks (id, text, col, tag, meta, start_date, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [id, cleanText, 'todo', 'queue-processor', batchMeta, batchStartDate]
      );
      createdTasks.push(id);
    }

    // 4. Mark queue items as done
    for (const item of queueItems) {
      await pool.query(`UPDATE todos SET done=true WHERE id=$1`, [item.id]);
    }

    // 5. Pick a task — but ONLY if nothing is currently in progress (no parallel execution)
    // First: detect and reset stale tasks (active with no log activity in 15 min)
    const { rows: activeForStaleCheck } = await pool.query(`SELECT id FROM tasks WHERE col='active'`);
    for (const at of activeForStaleCheck) {
      const { rows: recentLogs } = await pool.query(
        `SELECT 1 FROM task_logs WHERE task_id=$1 AND created_at > NOW() - INTERVAL '15 minutes' LIMIT 1`, [at.id]
      );
      if (!recentLogs.length) {
        await pool.query(
          `UPDATE tasks SET col='todo', assigned_to=NULL, assigned_at=NULL, updated_at=NOW() WHERE id=$1`, [at.id]
        );
        await pool.query(`INSERT INTO task_logs (task_id, message) VALUES ($1, $2)`, [at.id, '⏰ Auto-reset: no activity for >15 minutes']);
      }
    }
    const { rows: activeTasks } = await pool.query(
      `SELECT id FROM tasks WHERE col='active' LIMIT 1`
    );
    let pickId = null;
    if (!activeTasks.length) {
      pickId = createdTasks[0] || null;
      if (!pickId) {
        const { rows: todos } = await pool.query(
          `SELECT id FROM tasks WHERE col='todo' AND (start_date IS NULL OR start_date <= CURRENT_DATE) ORDER BY priority DESC, updated_at ASC LIMIT 1`
        );
        if (todos.length) pickId = todos[0].id;
      }
      if (pickId) {
        await pool.query(
          `UPDATE tasks SET col='active', assigned_to='queue-processor', assigned_at=NOW() WHERE id=$1`,
          [pickId]
        );
        await pool.query(`INSERT INTO task_logs (task_id, message) VALUES ($1, $2)`, [pickId, '🚀 Task picked up by queue-processor']);
      }
    }

    // 6. Return the active task
    const { rows: activeTask } = await pool.query(
      `SELECT * FROM tasks WHERE id=$1`, [pickId]
    );

    res.json({ 
      ok: true, 
      queued: queueItems.length, 
      batches: batches.length,
      tasksCreated: createdTasks.length,
      activeTask: activeTask[0] || null,
      littleBrainModel: littleBrainModel
    });
  } catch (e) {
    console.error('[queue-process]', e.message);
    res.status(500).json({ error: e.message });
  }
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
    const { rows } = await pool.query(`SELECT id, prompt_text, schedule_expr, schedule_tz, description, status, brain, last_run, next_run, created_at, updated_at FROM prompt_schedules ORDER BY created_at ASC`);
    res.json({ schedules: rows });
  } catch (err) {
    console.error('[getPromptSchedules]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prompt-schedules', requireAccess, async (req, res) => {
  const { prompt_text, schedule_expr, schedule_tz, description, brain } = req.body || {};
  if (!prompt_text || !schedule_expr) return res.status(400).json({ error: 'prompt_text and schedule_expr are required' });
  
  try {
    const id = `ps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { rows } = await pool.query(
      `INSERT INTO prompt_schedules (id, prompt_text, schedule_expr, schedule_tz, description, status, brain)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, prompt_text, schedule_expr, schedule_tz || 'UTC', description || null, 'active', brain || 'big']
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[createPromptSchedule]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/prompt-schedules/:id', requireAccess, async (req, res) => {
  const { prompt_text, schedule_expr, schedule_tz, description, status, last_run, next_run, brain } = req.body || {};
  
  const fields = [], vals = [];
  if (prompt_text !== undefined) { fields.push(`prompt_text=$${fields.length+1}`); vals.push(prompt_text); }
  if (schedule_expr !== undefined) { fields.push(`schedule_expr=$${fields.length+1}`); vals.push(schedule_expr); }
  if (schedule_tz !== undefined) { fields.push(`schedule_tz=$${fields.length+1}`); vals.push(schedule_tz); }
  if (description !== undefined) { fields.push(`description=$${fields.length+1}`); vals.push(description); }
  if (status !== undefined) { fields.push(`status=$${fields.length+1}`); vals.push(status); }
  if (last_run !== undefined) { fields.push(`last_run=$${fields.length+1}`); vals.push(last_run); }
  if (next_run !== undefined) { fields.push(`next_run=$${fields.length+1}`); vals.push(next_run); }
  if (brain !== undefined) { fields.push(`brain=$${fields.length+1}`); vals.push(brain); }
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


// ── SPA ─────────────────────────────────────────────────────────────────────
app.get('/tasks', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.get('/tasks/*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Start ────────────────────────────────────────────────────────────────────
const __filename_main = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename_main) {
  setup().then(() => {
    app.listen(port, () => console.log(`clea.chat running on port ${port}`));
  }).catch(err => { console.error('Startup failed:', err); process.exit(1); });
}

export { app };
