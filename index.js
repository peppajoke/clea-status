const dns = require('dns');
dns.setDefaultResultOrder('ipv6first');

const express = require('express');
const { Pool } = require('pg');
const https = require('https');

const path = require('path');
const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbUrl = (process.env.DATABASE_URL || '').split('?')[0];
const isInternal = dbUrl.includes('.railway.internal');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: isInternal ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
});

const TG_TOKEN      = process.env.TG_TOKEN       || '8223125498:AAE6qVmNnXvW0MkQOfJT8h94liTxeRZfxKU';
const TG_CHAT       = process.env.TG_CHAT        || '8728761353';
const WRITE_PASSWORD = process.env.WRITE_PASSWORD || 'jack2026';

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

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED = [
  { id: 't1',  col: 'todo',     text: 'Alpaca trading setup',                          tag: 'clea',      status: 'blocked', meta: 'Waiting for API keys from Jack' },
  { id: 't2',  col: 'todo',     text: 'Flowhub codebase analysis',                     tag: 'flowhub',   status: 'active',  meta: 'Analysis complete — docs written' },
  { id: 't3',  col: 'todo',     text: 'Research Alpaca trading strategies',             tag: 'clea',      status: '',        meta: 'Momentum, news-driven, index-tracking' },
  { id: 't21', col: 'todo',     text: 'Voice chat (Whisper → Claude → TTS)',           tag: 'clea',      status: 'paused',  meta: 'Tabled — plan agreed, waiting on Jack' },
  { id: 't22', col: 'todo',     text: 'Email deliverability fix (SPF/DKIM)',           tag: 'infra',     status: 'paused',  meta: 'Spam issue — Jack working on domain DNS' },
  { id: 't5',  col: 'progress', text: 'Simon chat page',                               tag: 'clea',      status: 'paused',  meta: 'Fixed — direct ollama, history persisted' },
  { id: 't6',  col: 'progress', text: 'Kanban task board',                             tag: 'clea',      status: 'active',  meta: 'Active iteration' },
  { id: 't7',  col: 'progress', text: 'Monitor HDMI fix',                              tag: 'infra',     status: 'paused',  meta: 'Email sent — waiting on cable swap' },
  { id: 't8',  col: 'progress', text: 'Moltbook post',                                 tag: 'clea',      status: 'active',  meta: 'First post live — cleathemistress' },
  { id: 't23', col: 'progress', text: 'clea-status Railway app',                       tag: 'infra',     status: 'active',  meta: 'Live with Postgres' },
  { id: 't9',  col: 'done',     text: 'WhatsApp linked',                               tag: 'infra' },
  { id: 't10', col: 'done',     text: 'Brave Search API configured',                   tag: 'infra' },
  { id: 't11', col: 'done',     text: 'Identity set (Clea Dessendre)',                 tag: 'clea' },
  { id: 't12', col: 'done',     text: 'Avatar generated + set',                        tag: 'clea' },
  { id: 't13', col: 'done',     text: 'Tailscale installed',                           tag: 'infra' },
  { id: 't14', col: 'done',     text: 'Simon agent created (llama3.1:8b)',             tag: 'clea' },
  { id: 't15', col: 'done',     text: 'Double-talking bug fixed',                      tag: 'infra' },
  { id: 't16', col: 'done',     text: 'Moltbook profile created',                      tag: 'clea' },
  { id: 't17', col: 'done',     text: 'OpenAI API + DALL-E 3 working',                tag: 'infra' },
  { id: 't18', col: 'done',     text: 'House of Photos contract drafted',              tag: 'bauersoft' },
  { id: 't19', col: 'done',     text: 'Codebase files downloaded',                    tag: 'flowhub' },
  { id: 't20', col: 'done',     text: 'GitHub CLI set up (peppajoke)',                 tag: 'infra' },
  { id: 't24', col: 'done',     text: 'Railway CLI authenticated',                     tag: 'infra' },
  { id: 't25', col: 'done',     text: 'hello-world deployed to Railway',               tag: 'infra' },
  { id: 't26', col: 'done',     text: 'Homepage dashboard built',                      tag: 'clea' },
  { id: 't27', col: 'done',     text: 'Flowhub codebase analysis complete',            tag: 'flowhub' },
  { id: 't28', col: 'done',     text: 'Simon fixed — ollama direct + history',         tag: 'clea' },
  { id: 't29', col: 'done',     text: 'Market scan cron active',                       tag: 'clea' },
  { id: 't30', col: 'done',     text: 'Telegram bot live (@clea_bauersoft_bot)',        tag: 'infra' },
];

const SEED_LOGS = [
  { task_id: 't23', message: 'Switched to Postgres-mNRu after main Postgres was accidentally overwritten with app code via railway up. Lesson: never run railway up while Postgres service is linked.' },
  { task_id: 't23', message: 'Postgres private networking confirmed working (IPv4 + IPv6 both resolve). Key fix: ssl:false for internal Railway connections.' },
  { task_id: 't23', message: 'App live at https://clea-status-production.up.railway.app — 19 tasks seeded from kanban.' },
  { task_id: 't23', message: 'Added task detail pages with activity log. POST /task/:id/log endpoint added for writing entries programmatically.' },
  { task_id: 't23', message: 'Added priority flag + ⚡ badge. POST /task/:id/prioritize fires a Telegram notification to kick off work immediately.' },
  { task_id: 't2',  message: 'Sub-agent spawned to read manage-v3 (~3.9k files) and hyperion (~3.1k files).' },
  { task_id: 't2',  message: 'Analysis complete. Wrote manage-v3-analysis.md and hyperion-analysis.md. Key finding: analytics uses dynamic SQL templates with {COLUMNS}/{GROUP} markers rewritten at runtime.' },
  { task_id: 't6',  message: 'Added status badges (Active/Paused/Blocked) with colored left borders. Storage key bumped to v3.' },
  { task_id: 't6',  message: 'Added note field and status picker to modal. Done column tasks show with strikethrough + reduced opacity.' },
  { task_id: 't6',  message: 'Added task detail pages with activity log.' },
  { task_id: 't6',  message: 'Added Prioritize button — fires Telegram notification and marks task in DB.' },
  { task_id: 't1',  message: 'Blocked — waiting for Jack to provide Alpaca API keys.' },
  { task_id: 't8',  message: 'First post live at moltbook.com/u/cleathemistress. Active.' },
  { task_id: 't7',  message: 'Researched Samsung Odyssey G95NC HDMI issues. Fix: USB-C → DisplayPort 1.4 cable. Email sent to Jack at 1 AM.' },
];

// ── DB setup ──────────────────────────────────────────────────────────────────
async function waitForDb(retries = 10, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('DB connected');
      return;
    } catch (e) {
      console.log(`DB not ready (${i}/${retries}): ${e.message}`);
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function setup() {
  await waitForDb();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         TEXT PRIMARY KEY,
      col        TEXT NOT NULL,
      text       TEXT NOT NULL,
      tag        TEXT,
      status     TEXT,
      meta       TEXT,
      priority   BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Add priority column if upgrading from older schema
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority BOOLEAN DEFAULT FALSE`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_logs (
      id         SERIAL PRIMARY KEY,
      task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      message    TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS task_logs_task_id ON task_logs(task_id)`);

  // Queue (raw brain-dump todos from Jack)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id         SERIAL PRIMARY KEY,
      text       TEXT NOT NULL,
      done       BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Node state persistence
  await pool.query(`
    CREATE TABLE IF NOT EXISTS node_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Load persisted claude mode
  const { rows: cmRows } = await pool.query(`SELECT value FROM node_state WHERE key='claudeEnabled'`);
  if (cmRows.length) claudeEnabled = cmRows[0].value === 'true';

  // Load persisted preferred model
  const { rows: pmRows } = await pool.query(`SELECT value FROM node_state WHERE key='preferredModel'`);
  if (pmRows.length) preferredModel = pmRows[0].value;

  // Load persisted heartbeats
  const { rows: hbRows } = await pool.query(`SELECT value FROM node_state WHERE key='nodeHeartbeats'`);
  if (hbRows.length) {
    try { Object.assign(nodeHeartbeats, JSON.parse(hbRows[0].value)); } catch {}
  }

  // Load persisted hidden nodes
  const { rows: hnRows } = await pool.query(`SELECT value FROM node_state WHERE key='hiddenNodes'`);
  if (hnRows.length) {
    try { JSON.parse(hnRows[0].value).forEach(n => hiddenNodes.add(n)); } catch {}
  }

  for (const t of SEED) {
    await pool.query(`
      INSERT INTO tasks (id, col, text, tag, status, meta)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO UPDATE SET
        text=EXCLUDED.text, tag=EXCLUDED.tag
    `, [t.id, t.col, t.text, t.tag||null, t.status||null, t.meta||null]);
  }

  const { rows: existing } = await pool.query('SELECT COUNT(*) FROM task_logs');
  if (parseInt(existing[0].count) === 0) {
    for (const l of SEED_LOGS) {
      await pool.query(
        'INSERT INTO task_logs (task_id, message) VALUES ($1, $2)',
        [l.task_id, l.message]
      );
    }
  }

  console.log('DB ready');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const TAG_COLORS = {
  flowhub:   { bg: '#1a2a4a', color: '#6a9fdf' },
  bauersoft: { bg: '#2a1a3a', color: '#9a6adf' },
  clea:      { bg: '#1a2a1a', color: '#6aaf6a' },
  infra:     { bg: '#2a2218', color: '#c8a060' },
};

const STATUS_STYLES = {
  active:  { bg: '#0d2016', color: '#4caf6e', border: '#1a4028', dot: '#4caf6e', label: 'Active'  },
  paused:  { bg: '#221a0d', color: '#c8943a', border: '#3a2a12', dot: '#c8943a', label: 'Paused'  },
  blocked: { bg: '#210d0d', color: '#cf4f4f', border: '#3a1a1a', dot: '#cf4f4f', label: 'Blocked' },
};

const COL_LABELS = { todo: 'Todo', progress: 'In Progress', done: 'Done' };
const TAG_LABELS  = { flowhub: 'Flowhub', bauersoft: 'BauerSoft', clea: 'Clea', infra: 'Infra' };

function tagPill(tag) {
  if (!tag) return '';
  const s = TAG_COLORS[tag] || { bg: '#222', color: '#888' };
  return `<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;background:${s.bg};color:${s.color}">${TAG_LABELS[tag] || tag}</span>`;
}

function statusBadge(status) {
  if (!status || !STATUS_STYLES[status]) return '';
  const s = STATUS_STYLES[status];
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${s.bg};color:${s.color};border:1px solid ${s.border};white-space:nowrap"><span style="width:5px;height:5px;border-radius:50%;background:${s.dot};display:inline-block"></span>${s.label}</span>`;
}

function priorityBadge() {
  return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:#2a1f00;color:#f5a623;border:1px solid #3d2e00;white-space:nowrap">⚡ Priority</span>`;
}

function fmtDate(d) {
  return new Date(d).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }) + ' EST';
}

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} — Clea</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0a0a;color:#d8d8d8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;min-height:100vh;padding:32px 28px 60px;max-width:900px;margin:0 auto}
    a{color:#4a80ff;text-decoration:none}
    a:hover{text-decoration:underline}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:7px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:opacity 0.15s}
    .btn:hover{opacity:0.85}
    .btn:active{opacity:0.7}
    .btn-priority{background:#f5a623;color:#000}
    .btn-deprioritize{background:#1e1e1e;color:#555;border:1px solid #2a2a2a}
    .btn-delete{background:#1e0a0a;color:#cf4f4f;border:1px solid #3a1a1a}
    .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100;align-items:center;justify-content:center}
    .modal-overlay.active{display:flex}
    .modal{background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:28px;width:320px;max-width:90vw}
    .modal h3{font-size:15px;color:#f0f0f0;margin-bottom:8px}
    .modal p{font-size:12px;color:#444;margin-bottom:16px}
    .modal input{width:100%;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;color:#d8d8d8;font-size:14px;outline:none;margin-bottom:12px}
    .modal input:focus{border-color:#444}
    .modal-error{font-size:11px;color:#cf4f4f;margin-bottom:10px;display:none}
    .modal-actions{display:flex;gap:8px;justify-content:flex-end}
  </style>
</head>
<body>${body}</body>
</html>`;
}

function renderCard(t, clickable = true) {
  const borderColor = t.priority ? '#f5a623' : STATUS_STYLES[t.status]?.dot;
  const badges = `${t.priority ? priorityBadge() : ''}${statusBadge(t.status)}`;
  const inner = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">
      <span style="font-size:13px;color:${t.priority ? '#f0f0f0' : '#d8d8d8'};line-height:1.5;flex:1">${t.text}</span>
      <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">${badges}</div>
    </div>
    ${(t.tag || t.meta) ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${tagPill(t.tag)}${t.meta ? `<span style="font-size:11px;color:#3a3a3a">${t.meta}</span>` : ''}</div>` : ''}
  `;
  const border = `border:1px solid ${t.priority ? '#3d2e00' : '#1c1c1c'};${borderColor ? `border-left:3px solid ${borderColor};` : ''}`;
  if (clickable) {
    return `<a href="/task/${t.id}" style="display:block;text-decoration:none;background:${t.priority ? '#120e00' : '#111'};${border}border-radius:8px;padding:12px 14px;transition:opacity 0.15s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">${inner}</a>`;
  }
  return `<div style="background:${t.priority ? '#120e00' : '#111'};${border}border-radius:8px;padding:12px 14px">${inner}</div>`;
}

function renderColumn(label, tasks, dotColor) {
  // Prioritized tasks float to top within their column
  const sorted = [...tasks.filter(t => t.priority), ...tasks.filter(t => !t.priority)];
  const cards = sorted.length
    ? sorted.map(t => renderCard(t)).join('')
    : `<div style="text-align:center;color:#2a2a2a;font-size:12px;padding:20px 0">Nothing here</div>`;
  return `
    <div style="flex:1;min-width:260px;max-width:380px;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:8px;padding:0 4px 12px">
        <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};display:inline-block"></span>
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#555">${label}</span>
        <span style="font-size:11px;background:#1a1a1a;color:#444;border-radius:10px;padding:2px 7px;font-weight:600">${tasks.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">${cards}</div>
    </div>
  `;
}

// ── Auth middleware ───────────────────────────────────────────────────────────
// Write endpoints accept either the internal LOG_SECRET (Clea's scripts) or the WRITE_PASSWORD (Jack's browser)
function requireWrite(req, res, next) {
  const secret = process.env.LOG_SECRET || 'clea';
  const internalOk = req.headers['x-clea-secret'] === secret;
  const browserOk  = req.headers['x-write-password'] === WRITE_PASSWORD;
  if (internalOk || browserOk) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM tasks ORDER BY priority DESC, updated_at DESC`);
  const cols = { todo: rows.filter(r => r.col==='todo'), progress: rows.filter(r => r.col==='progress'), done: rows.filter(r => r.col==='done') };
  const now = fmtDate(new Date());
  const blocked  = rows.filter(r => r.status==='blocked').length;
  const active   = rows.filter(r => r.status==='active').length;
  const priority = rows.filter(r => r.priority).length;

  res.setHeader('Content-Type', 'text/html');
  res.send(page('Status', `
<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:36px;padding-bottom:16px;border-bottom:1px solid #1a1a1a">
  <div>
    <h1 style="font-size:20px;font-weight:600;color:#f0f0f0">🎭 Clea — Status</h1>
    <p style="font-size:12px;color:#333;margin-top:4px">Current workload, live from Postgres</p>
  </div>
  <span style="font-size:11px;color:#2a2a2a">Updated ${now}</span>
</div>

<div style="display:flex;gap:10px;margin-bottom:32px;flex-wrap:wrap">
  ${[
    {label:'Total tasks', value:rows.length,  color:'#f0f0f0'},
    {label:'Done',        value:cols.done.length, color:'#4caf6e'},
    {label:'Active',      value:active,        color:'#4a9fdf'},
    {label:'Blocked',     value:blocked,       color:'#cf4f4f'},
    {label:'Priority',    value:priority,      color:'#f5a623'},
  ].map(s=>`
    <div style="background:#111;border:1px solid #1c1c1c;border-radius:9px;padding:14px 20px;min-width:110px">
      <div style="font-size:22px;font-weight:700;color:${s.color}">${s.value}</div>
      <div style="font-size:11px;color:#3a3a3a;margin-top:2px">${s.label}</div>
    </div>`).join('')}
</div>

<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
  ${renderColumn(COL_LABELS.todo,     cols.todo,     '#555')}
  ${renderColumn(COL_LABELS.progress, cols.progress, '#4a80ff')}
  ${renderColumn(COL_LABELS.done,     cols.done,     '#4caf6e')}
</div>

<p style="margin-top:40px;font-size:11px;color:#222;text-align:center">Powered by Railway + Postgres · Click any task for details</p>
`));
});

app.get('/task/:id', async (req, res) => {
  const { id } = req.params;
  const { rows: tasks } = await pool.query('SELECT * FROM tasks WHERE id=$1', [id]);
  if (!tasks.length) return res.status(404).send(page('Not found', '<p style="color:#555;margin-top:40px">Task not found.</p>'));
  const task = tasks[0];

  const { rows: logs } = await pool.query(
    'SELECT * FROM task_logs WHERE task_id=$1 ORDER BY created_at ASC',
    [id]
  );

  const prioritizeBtn = task.priority
    ? `<button class="btn btn-deprioritize" onclick="requireAuth(() => setPriority(false))">Remove Priority</button>`
    : `<button class="btn btn-priority" onclick="requireAuth(() => setPriority(true))">⚡ Prioritize</button>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(page(task.text, `
<div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between">
  <a href="/" style="font-size:12px;color:#444">← Back to board</a>
  <div style="display:flex;gap:8px">
    <div id="btn-container">${prioritizeBtn}</div>
    <button class="btn btn-delete" onclick="requireAuth(() => deleteTask())">Delete</button>
  </div>
</div>

${renderCard(task, false)}

<div style="margin-top:32px">
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#333;margin-bottom:12px">
    Activity Log ${logs.length ? `<span style="color:#2a2a2a;font-weight:400">(${logs.length} entries)</span>` : '<span style="color:#2a2a2a;font-weight:400">(no entries yet)</span>'}
  </div>

  <div id="log-list">
  ${logs.length === 0 ? `
    <div style="background:#111;border:1px solid #1c1c1c;border-radius:8px;padding:24px;text-align:center;color:#333;font-size:12px">
      Nothing logged yet.
    </div>
  ` : logs.map(l => `
    <div style="display:flex;gap:16px;padding:12px 0;border-bottom:1px solid #141414;align-items:flex-start">
      <div style="font-size:10px;color:#2e2e2e;min-width:160px;padding-top:2px;font-family:'SF Mono',monospace;flex-shrink:0">${fmtDate(l.created_at)}</div>
      <div style="font-size:13px;color:#888;line-height:1.6;flex:1">${l.message}</div>
    </div>
  `).join('')}
  </div>
</div>

<div class="modal-overlay" id="auth-modal">
  <div class="modal">
    <h3>🔒 Write access required</h3>
    <p>Enter the write password to continue.</p>
    <input type="password" id="auth-input" placeholder="Password" onkeydown="if(event.key==='Enter')submitAuth()"/>
    <div class="modal-error" id="auth-error">Wrong password.</div>
    <div class="modal-actions">
      <button class="btn btn-deprioritize" onclick="cancelAuth()">Cancel</button>
      <button class="btn btn-priority" onclick="submitAuth()">Unlock</button>
    </div>
  </div>
</div>

<script>
const SESSION_KEY = 'clea_write_auth';
let pendingAction = null;

function getStoredPw() { return sessionStorage.getItem('clea_write_pw_val') || ''; }

function requireAuth(action) {
  if (sessionStorage.getItem(SESSION_KEY) === '1') { action(); return; }
  pendingAction = action;
  document.getElementById('auth-modal').classList.add('active');
  setTimeout(() => document.getElementById('auth-input').focus(), 50);
}

function cancelAuth() {
  pendingAction = null;
  document.getElementById('auth-modal').classList.remove('active');
  document.getElementById('auth-input').value = '';
  document.getElementById('auth-error').style.display = 'none';
}

async function submitAuth() {
  const pw = document.getElementById('auth-input').value;
  const r = await fetch('/auth/verify', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ password: pw })
  });
  if (r.ok) {
    sessionStorage.setItem(SESSION_KEY, '1');
    sessionStorage.setItem('clea_write_pw_val', pw);
    document.getElementById('auth-modal').classList.remove('active');
    document.getElementById('auth-input').value = '';
    document.getElementById('auth-error').style.display = 'none';
    if (pendingAction) { const a = pendingAction; pendingAction = null; a(); }
  } else {
    document.getElementById('auth-error').style.display = 'block';
    document.getElementById('auth-input').value = '';
    document.getElementById('auth-input').focus();
  }
}

async function setPriority(on) {
  const btn = document.querySelector('#btn-container button');
  btn.disabled = true;
  btn.textContent = on ? 'Prioritizing…' : 'Removing…';
  const r = await fetch('/task/${id}/prioritize', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'x-write-password': getStoredPw()},
    body: JSON.stringify({ priority: on })
  });
  if (r.ok) { window.location.reload(); }
  else { btn.disabled = false; btn.textContent = on ? '⚡ Prioritize' : 'Remove Priority'; }
}

async function deleteTask() {
  if (!confirm('Delete this task? This cannot be undone.')) return;
  const r = await fetch('/task/${id}', {
    method: 'DELETE',
    headers: {'Content-Type':'application/json', 'x-write-password': getStoredPw()}
  });
  if (r.ok) { window.location.href = '/'; }
  else { alert('Delete failed.'); }
}
</script>
`));
});

// Prioritize a task
app.post('/task/:id/prioritize', requireWrite, async (req, res) => {
  const { id } = req.params;
  const priority = req.body.priority !== false;
  const { rows: tasks } = await pool.query('SELECT * FROM tasks WHERE id=$1', [id]);
  if (!tasks.length) return res.status(404).json({ error: 'task not found' });
  const task = tasks[0];
  await pool.query('UPDATE tasks SET priority=$1, updated_at=NOW() WHERE id=$2', [priority, id]);
  const logMsg = priority ? `Marked as priority by Jack. Starting aggressive work.` : `Priority removed.`;
  await pool.query('INSERT INTO task_logs (task_id, message) VALUES ($1, $2)', [id, logMsg]);
  if (priority) {
    await tgSend(`⚡ <b>Priority task flagged:</b> ${task.text}\n\nStarting on it now. Will reach out if I need anything from you.`);
  }
  res.json({ ok: true, priority });
});

// Create a task
app.post('/tasks', requireWrite, async (req, res) => {
  const { id, col, text, tag, status, meta } = req.body;
  if (!id || !col || !text) return res.status(400).json({ error: 'id, col, text required' });
  await pool.query(
    'INSERT INTO tasks (id, col, text, tag, status, meta) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
    [id, col, text, tag||null, status||null, meta||null]
  );
  res.json({ ok: true });
});

// Update a task (status, col, meta, text)
app.patch('/task/:id', requireWrite, async (req, res) => {
  const { id } = req.params;
  const allowed = ['status', 'col', 'meta', 'text', 'tag'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  const setClauses = updates.map(([k], i) => `${k}=$${i + 1}`).join(', ');
  const values = updates.map(([, v]) => v);
  values.push(id);
  await pool.query(`UPDATE tasks SET ${setClauses}, updated_at=NOW() WHERE id=$${values.length}`, values);
  res.json({ ok: true });
});

// Delete a task
app.delete('/task/:id', requireWrite, async (req, res) => {
  const { id } = req.params;
  const { rows: tasks } = await pool.query('SELECT text FROM tasks WHERE id=$1', [id]);
  if (!tasks.length) return res.status(404).json({ error: 'task not found' });
  await pool.query('DELETE FROM tasks WHERE id=$1', [id]);
  res.json({ ok: true });
});

// Verify write password
app.post('/auth/verify', (req, res) => {
  if (req.body.password === WRITE_PASSWORD) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: 'Wrong password' });
});

// Data API — returns tasks + recent logs (used by external scripts/cron)
app.get('/api/data', async (req, res) => {
  const secret = process.env.LOG_SECRET || 'clea';
  if (req.headers['x-clea-secret'] !== secret) return res.status(401).json({ error: 'unauthorized' });
  const [tasks, logs] = await Promise.all([
    pool.query("SELECT id, col, text, status, tag, priority FROM tasks WHERE col != 'done' ORDER BY priority DESC, col, updated_at DESC"),
    pool.query("SELECT t.text as task, t.col, t.status, l.message, l.created_at FROM task_logs l JOIN tasks t ON t.id = l.task_id WHERE l.created_at > NOW() - INTERVAL '24 hours' ORDER BY l.created_at DESC"),
  ]);
  res.json({ tasks: tasks.rows, logs: logs.rows });
});

// Write a log entry (internal)
// ── Heartbeat endpoints for Clea node network ────────────────────────────────
const nodeHeartbeats = {}; // { nodeName: { role, ts } } — persisted to postgres
const hiddenNodes = new Set(); // nodes that are hidden (quiet offline)
let claudeEnabled = true;    // persisted to postgres
let preferredModel = 'anthropic/claude-sonnet-4-6'; // persisted to postgres

async function persistState(key, value) {
  try {
    await pool.query(`
      INSERT INTO node_state (key, value, updated_at) VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
    `, [key, String(value)]);
  } catch(e) { console.error('[persist]', e.message); }
}

app.post('/heartbeat/ping', requireWrite, (req, res) => {
  const { node, role, ts } = req.body || {};
  if (!node) return res.status(400).json({ error: 'node required' });
  const now = Math.floor(Date.now() / 1000);

  // If node is hidden — tell it to go quiet, don't count it for elections
  if (hiddenNodes.has(node)) {
    // Still record the ping so we know it's alive, but force replica + mark hidden
    nodeHeartbeats[node] = { node, role: 'replica', ts: ts || now, hidden: true };
    persistState('nodeHeartbeats', JSON.stringify(nodeHeartbeats));
    return res.json({ ok: true, role: 'replica', hidden: true });
  }

  // If this node claims prime but a different prime already exists, demote it
  let effectiveRole = role || 'replica';
  let demoted = false;
  if (effectiveRole === 'prime') {
    const existingPrime = Object.values(nodeHeartbeats).find(n => n.role === 'prime' && n.node !== node);
    if (existingPrime) {
      effectiveRole = 'replica';
      demoted = true;
      console.log(`[heartbeat] ${node} claimed prime but ${existingPrime.node} is already Prime — demoting ${node}`);
    }
  }

  nodeHeartbeats[node] = { node, role: effectiveRole, ts: ts || now, hidden: false };
  persistState('nodeHeartbeats', JSON.stringify(nodeHeartbeats));
  res.json({ ok: true, role: effectiveRole, demoted });
});

app.get('/heartbeat/status', requireWrite, (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const nodes = Object.values(nodeHeartbeats).map(n => ({
    ...n,
    ageSeconds: now - n.ts,
    hidden: hiddenNodes.has(n.node)
  }));
  // Only non-hidden nodes count as Prime
  const prime = nodes.find(n => n.role === 'prime' && !n.hidden) || null;
  res.json({ prime, nodes, now });
});

// ── Hide / Unhide endpoints ───────────────────────────────────────────────────
app.post('/heartbeat/node/:name/hide', requireWrite, (req, res) => {
  const { name } = req.params;
  hiddenNodes.add(name);
  persistState('hiddenNodes', JSON.stringify([...hiddenNodes]));
  // If this node was Prime, demote it
  if (nodeHeartbeats[name]?.role === 'prime') {
    nodeHeartbeats[name].role = 'replica';
    persistState('nodeHeartbeats', JSON.stringify(nodeHeartbeats));
    console.log(`[heartbeat] ${name} hidden — demoted from Prime`);
  }
  console.log(`[heartbeat] ${name} marked hidden`);
  res.json({ ok: true, hidden: name });
});

app.post('/heartbeat/node/:name/unhide', requireWrite, (req, res) => {
  const { name } = req.params;
  hiddenNodes.delete(name);
  persistState('hiddenNodes', JSON.stringify([...hiddenNodes]));
  if (nodeHeartbeats[name]) {
    nodeHeartbeats[name].hidden = false;
    persistState('nodeHeartbeats', JSON.stringify(nodeHeartbeats));
  }
  console.log(`[heartbeat] ${name} unhidden`);
  res.json({ ok: true, unhidden: name });
});

// ── Discord token gate — only returns token if requesting node is Prime ───────
app.get('/node/discord-token', requireWrite, (req, res) => {
  const requestingNode = req.headers['x-node-name'];
  if (!requestingNode) return res.status(400).json({ error: 'x-node-name header required' });
  const now = Math.floor(Date.now() / 1000);
  const prime = Object.values(nodeHeartbeats).find(n => n.role === 'prime');
  if (!prime) return res.status(403).json({ error: 'no prime elected' });
  if (prime.node !== requestingNode) {
    return res.status(403).json({ error: `not prime (current prime: ${prime.node})` });
  }
  const token = process.env.DISCORD_TOKEN;
  if (!token) return res.status(503).json({ error: 'token not configured on server' });
  res.json({ ok: true, token, prime: prime.node });
});

app.delete('/heartbeat/node/:name', requireWrite, (req, res) => {
  const { name } = req.params;
  if (!nodeHeartbeats[name]) return res.status(404).json({ error: 'node not found' });
  delete nodeHeartbeats[name];
  res.json({ ok: true, deleted: name });
});

app.post('/heartbeat/promote', requireWrite, (req, res) => {
  const { node, ts } = req.body || {};
  if (!node) return res.status(400).json({ error: 'node required' });
  // Demote any existing prime
  Object.values(nodeHeartbeats).forEach(n => { if (n.role === 'prime') n.role = 'replica'; });
  nodeHeartbeats[node] = { node, role: 'prime', ts: ts || Math.floor(Date.now() / 1000) };
  console.log(`[heartbeat] ${node} promoted to Prime`);
  persistState('nodeHeartbeats', JSON.stringify(nodeHeartbeats));
  res.json({ ok: true, prime: node });
});

// ── Public chat ───────────────────────────────────────────────────────────────
const chatSessions = {}; // sessionId → { history, notified, strikes }
const bannedSessions = new Set();
const emailQueue = []; // pending email notifications for Mac mini to drain

// Drain endpoint — Mac mini polls this, sends emails via GOG, clears queue
app.get('/admin/chat/drain', requireWrite, (req, res) => {
  const pending = emailQueue.splice(0, emailQueue.length);
  res.json({ ok: true, pending });
});

function queueEmail(subject, body) {
  emailQueue.push({ subject, body, ts: Date.now() });
}

// ── Claude mode toggle ────────────────────────────────────────────────────────
app.get('/node/claude-mode', requireWrite, (req, res) => {
  res.json({ claudeEnabled });
});

app.post('/node/claude-mode', requireWrite, (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) required' });
  claudeEnabled = enabled;
  persistState('claudeEnabled', String(enabled));
  console.log(`[claude-mode] Claude ${enabled ? 'ENABLED' : 'DISABLED'}`);
  queueEmail(
    `Claude ${enabled ? 'enabled ✅' : 'disabled 🔴'} on all nodes`,
    `Claude API access has been ${enabled ? 're-enabled' : 'disabled'}.\n${enabled ? 'All nodes resuming normal operation.' : 'Clea switching to Simon. Esquie hibernating.'}`
  );
  res.json({ ok: true, claudeEnabled });
});

// ── Preferred model — GET/POST, no auth needed for GET (nodes poll this) ──────
app.get('/node/preferred-model', (req, res) => {
  res.json({ model: preferredModel });
});

app.post('/node/preferred-model', requireWrite, (req, res) => {
  const { model } = req.body || {};
  if (!model || typeof model !== 'string') return res.status(400).json({ error: 'model (string) required' });
  const prev = preferredModel;
  preferredModel = model;
  persistState('preferredModel', model);
  console.log(`[preferred-model] ${prev} → ${model}`);
  res.json({ ok: true, model: preferredModel, previous: prev });
});

// ── Queue (Jack's brain-dump todos) ──────────────────────────────────────────
app.get('/api/queue', requireWrite, async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM todos ORDER BY created_at ASC`);
  res.json(rows);
});

app.post('/api/queue', requireWrite, async (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
  const { rows } = await pool.query(
    `INSERT INTO todos (text) VALUES ($1) RETURNING *`,
    [text.trim()]
  );
  res.json(rows[0]);
});

app.patch('/api/queue/:id', requireWrite, async (req, res) => {
  const { done } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE todos SET done=$1 WHERE id=$2 RETURNING *`,
    [!!done, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

app.delete('/api/queue/:id', requireWrite, async (req, res) => {
  await pool.query(`DELETE FROM todos WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

let chatEnabled = true;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Red flags — patterns that suggest prompt injection, data extraction, or abuse
const RED_FLAGS = [
  /ignore (your|all|previous) (instructions|rules|prompt)/i,
  /system prompt/i,
  /jailbreak/i,
  /you are now/i,
  /pretend (you are|to be)/i,
  /act as (if you|a|an)/i,
  /repeat (everything|your|the) (above|system|instructions)/i,
  /what are your instructions/i,
  /reveal (your|the) (prompt|system|instructions|api key|token|secret)/i,
  /api.?key/i,
  /jack.{0,20}(email|phone|address|password|number)/i,
  /give me (access|credentials|the token)/i,
  /bypass/i,
  /DAN /i,
];

function scanMessage(text) {
  return RED_FLAGS.filter(r => r.test(text));
}

// Admin: kill/restore chat
app.post('/admin/chat/kill', requireWrite, (req, res) => {
  chatEnabled = false;
  const reason = req.body?.reason || 'manual killswitch';
  console.log(`[public-chat] KILLSWITCH engaged: ${reason}`);
  queueEmail('🔴 Public chat DISABLED', `Reason: ${reason}`);
  res.json({ ok: true, chatEnabled });
});

app.post('/admin/chat/restore', requireWrite, (req, res) => {
  chatEnabled = true;
  console.log('[public-chat] chat restored');
  queueEmail('🟢 Public chat re-enabled', 'Chat has been restored.');
  res.json({ ok: true, chatEnabled });
});

app.get('/admin/chat/status', requireWrite, (req, res) => {
  res.json({ chatEnabled, sessions: Object.keys(chatSessions).length, banned: bannedSessions.size });
});

// Route public chat through Esquie relay — same context as the real Clea (SOUL.md, MEMORY.md, etc.)
const RELAY_URL = process.env.RELAY_URL || 'https://esquie-production.up.railway.app/relay';
const RELAY_SECRET = process.env.LOG_SECRET || 'clea-log-2026';

function callRelay(history, sessionId) {
  return new Promise((resolve, reject) => {
    // Build a single message with recent context for stateless relay
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
        'x-clea-secret': RELAY_SECRET
      },
      timeout: 30000
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          resolve(d.response || d.reply || '...');
        } catch (e) { reject(e); }
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

  // Global killswitch
  if (!chatEnabled) {
    return res.status(503).json({ killed: true, reply: 'Chat is temporarily unavailable.' });
  }

  // Banned session
  if (bannedSessions.has(sessionId)) {
    return res.status(403).json({ banned: true, reply: 'This session has been suspended.' });
  }

  const isNew = !chatSessions[sessionId];
  if (isNew) {
    chatSessions[sessionId] = { history: [], notified: false, strikes: 0, ts: Date.now() };
    queueEmail(
      `New visitor on chat.html`,
      `Session: ${sessionId.slice(0,8)}\nFirst message: "${message.slice(0,200)}"\nTime: ${new Date().toISOString()}`
    );
  }

  const session = chatSessions[sessionId];

  // Scan for red flags
  const flags = scanMessage(message);
  if (flags.length > 0) {
    session.strikes = (session.strikes || 0) + 1;
    console.warn(`[public-chat] ⚠️ session ${sessionId.slice(0,8)} strike ${session.strikes} — flags: ${flags.map(f=>f.source).join(', ')}`);

    if (session.strikes >= 2) {
      // Ban the session
      bannedSessions.add(sessionId);
      queueEmail(
        `🚨 Chat session BANNED`,
        `Session: ${sessionId.slice(0,8)}\nStrikes: ${session.strikes}\nLast message: "${message.slice(0,200)}"\nFlags: ${flags.map(f=>f.source).join(', ')}`
      );

      // Auto-killswitch if 3+ sessions banned in this process lifetime
      if (bannedSessions.size >= 3) {
        chatEnabled = false;
        queueEmail('🔴 Chat KILLSWITCH engaged', '3+ sessions banned. Public chat disabled. Reply to re-enable.');
        return res.status(403).json({ banned: true, reply: 'This session has been suspended.' });
      }

      return res.status(403).json({ banned: true, reply: 'This session has been suspended.' });
    } else {
      // First strike — warn Jack, continue but note it
      queueEmail(
        `⚠️ Suspicious chat message (strike ${session.strikes})`,
        `Session: ${sessionId.slice(0,8)}\nMessage: "${message.slice(0,200)}"\nFlags: ${flags.map(f=>f.source).join(', ')}`
      );
    }
  }

  session.history.push({ role: 'user', content: message });
  if (session.history.length > 20) session.history = session.history.slice(-20);

  try {
    const reply = await callRelay(session.history, sessionId);
    session.history.push({ role: 'assistant', content: reply });
    res.json({ ok: true, reply });
  } catch (e) {
    console.error('[public-chat] error:', e.message);
    res.status(500).json({ error: 'something went wrong' });
  }
});

// ── JSON tasks list ──────────────────────────────────────────────────────────
app.get('/api/tasks', requireWrite, async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM tasks ORDER BY priority DESC, updated_at DESC`);
  res.json(rows.map(t => ({ id: t.id, title: t.text, col: t.col, tag: t.tag, status: t.status, priority: t.priority })));
});

app.post('/task/:id/log', requireWrite, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const { rows: tasks } = await pool.query('SELECT id FROM tasks WHERE id=$1', [id]);
  if (!tasks.length) return res.status(404).json({ error: 'task not found' });
  await pool.query('INSERT INTO task_logs (task_id, message) VALUES ($1, $2)', [id, message]);
  res.json({ ok: true });
});

// ── Esquie sleep/wake control ─────────────────────────────────────────────────
app.post('/esquie/sleep', requireWrite, async (req, res) => {
  await setEsquieSleep(true);
  res.json({ ok: true, action: 'sleep' });
});
app.post('/esquie/wake', requireWrite, async (req, res) => {
  await setEsquieSleep(false);
  res.json({ ok: true, action: 'wake' });
});

// ── Esquie Failover Watcher ───────────────────────────────────────────────────
// Runs every 3 minutes. If Clea's heartbeat is stale (>5 min), wakes Esquie.
// If Clea is healthy, ensures Esquie stays asleep.

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN || '';
const ESQUIE_SERVICE_ID = '22f410f9-2f84-486b-8f26-f83ef75d2edc';
const ESQUIE_ENV_ID = '5e7b129a-488b-4b0d-9d85-2b2f344e666b';
const CLEA_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

async function setEsquieSleep(sleep) {
  if (!RAILWAY_TOKEN) return;
  try {
    const res = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RAILWAY_TOKEN}` },
      body: JSON.stringify({ query: `mutation { serviceInstanceUpdate(input: { sleepApplication: ${sleep} }, serviceId: "${ESQUIE_SERVICE_ID}", environmentId: "${ESQUIE_ENV_ID}") }` })
    });
    const data = await res.json();
    console.log(`[failover] Esquie ${sleep ? 'sleeping' : 'waking'}: ${data.data?.serviceInstanceUpdate === true ? 'OK' : JSON.stringify(data.errors)}`);
  } catch (e) {
    console.error('[failover] Railway API error:', e.message);
  }
}

function startFailoverWatcher() {
  if (!RAILWAY_TOKEN) {
    console.log('[failover] No RAILWAY_TOKEN set — Esquie watcher disabled');
    return;
  }
  setInterval(async () => {
    try {
      const nodes = heartbeatStore.nodes || {};
      const clea = Object.values(nodes).find(n => n.node === 'clea');
      if (!clea) return; // No data yet
      const staleSec = (Date.now() / 1000) - (clea.ts || 0);
      if (staleSec > CLEA_STALE_THRESHOLD_MS / 1000) {
        console.log(`[failover] Clea stale (${Math.round(staleSec)}s) — waking Esquie`);
        await setEsquieSleep(false);
      } else {
        await setEsquieSleep(true);
      }
    } catch (e) {
      console.error('[failover] watcher error:', e.message);
    }
  }, 3 * 60 * 1000); // every 3 minutes
}

// ── Start ─────────────────────────────────────────────────────────────────────
setup().then(() => {
  app.listen(port, () => {
    console.log(`Clea status on port ${port}`);
    startFailoverWatcher();
  });
}).catch(err => {
  console.error('DB setup failed:', err);
  process.exit(1);
});
