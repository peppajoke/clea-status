const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const dbUrl = (process.env.DATABASE_URL || '').replace('?', '?sslmode=disable&').replace(/sslmode=[^&]+/, 'sslmode=disable');
console.log('Connecting to DB, sslmode=disable');

const pool = new Pool({
  connectionString: dbUrl.includes('sslmode=') ? dbUrl : dbUrl + '?sslmode=disable',
  ssl: false,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
});

// ── Seed data (from local kanban) ────────────────────────────────────────────
const SEED = [
  { id: 't1',  col: 'todo',     text: 'Alpaca trading setup',                          tag: 'clea',      status: 'blocked', meta: 'Waiting for API keys' },
  { id: 't2',  col: 'todo',     text: 'Flowhub codebase analysis',                     tag: 'flowhub',   status: 'active',  meta: 'Sub-agent running now' },
  { id: 't3',  col: 'todo',     text: 'Research Alpaca trading strategies',             tag: 'clea',      status: '',        meta: 'Momentum, news-driven, index-tracking' },
  { id: 't5',  col: 'progress', text: 'Simon chat page',                                tag: 'clea',      status: 'active',  meta: 'Fixed — direct ollama connection' },
  { id: 't6',  col: 'progress', text: 'Kanban task board',                              tag: 'clea',      status: 'active',  meta: 'Active iteration' },
  { id: 't7',  col: 'progress', text: 'Monitor HDMI fix',                               tag: 'infra',     status: 'paused',  meta: 'Email sent — waiting on cable swap' },
  { id: 't8',  col: 'progress', text: 'Moltbook post',                                  tag: 'clea',      status: 'blocked', meta: 'API key locked in encrypted file' },
  { id: 't20', col: 'progress', text: 'Railway + GitHub deployment pipeline',           tag: 'infra',     status: 'active',  meta: 'Live — this app' },
  { id: 't9',  col: 'done',     text: 'WhatsApp linked',                                tag: 'infra',     status: '',        meta: '' },
  { id: 't10', col: 'done',     text: 'Brave Search API configured',                    tag: 'infra',     status: '',        meta: '' },
  { id: 't11', col: 'done',     text: 'Identity set (Clea Dessendre)',                  tag: 'clea',      status: '',        meta: '' },
  { id: 't12', col: 'done',     text: 'Avatar generated + set',                         tag: 'clea',      status: '',        meta: '' },
  { id: 't13', col: 'done',     text: 'Tailscale installed',                            tag: 'infra',     status: '',        meta: '' },
  { id: 't14', col: 'done',     text: 'Simon agent created (llama3.1:8b)',              tag: 'clea',      status: '',        meta: '' },
  { id: 't15', col: 'done',     text: 'Double-talking bug fixed',                       tag: 'infra',     status: '',        meta: '' },
  { id: 't16', col: 'done',     text: 'Moltbook profile created',                       tag: 'clea',      status: '',        meta: '' },
  { id: 't17', col: 'done',     text: 'OpenAI API + DALL-E 3 working',                 tag: 'infra',     status: '',        meta: '' },
  { id: 't18', col: 'done',     text: 'House of Photos contract drafted',               tag: 'bauersoft', status: '',        meta: '' },
  { id: 't19', col: 'done',     text: 'Codebase files downloaded',                     tag: 'flowhub',   status: '',        meta: '' },
];

// ── DB setup ─────────────────────────────────────────────────────────────────
async function setup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id        TEXT PRIMARY KEY,
      col       TEXT NOT NULL,
      text      TEXT NOT NULL,
      tag       TEXT,
      status    TEXT,
      meta      TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Upsert seed data
  for (const t of SEED) {
    await pool.query(`
      INSERT INTO tasks (id, col, text, tag, status, meta)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO UPDATE SET
        col=EXCLUDED.col, text=EXCLUDED.text, tag=EXCLUDED.tag,
        status=EXCLUDED.status, meta=EXCLUDED.meta, updated_at=NOW()
    `, [t.id, t.col, t.text, t.tag || null, t.status || null, t.meta || null]);
  }

  console.log('DB ready');
}

// ── HTML render ───────────────────────────────────────────────────────────────
const TAG_COLORS = {
  flowhub:  { bg: '#1a2a4a', color: '#6a9fdf' },
  bauersoft:{ bg: '#2a1a3a', color: '#9a6adf' },
  clea:     { bg: '#1a2a1a', color: '#6aaf6a' },
  infra:    { bg: '#2a2218', color: '#c8a060' },
};

const STATUS_STYLES = {
  active:  { bg: '#0d2016', color: '#4caf6e', border: '#1a4028', dot: '#4caf6e',  label: 'Active'  },
  paused:  { bg: '#221a0d', color: '#c8943a', border: '#3a2a12', dot: '#c8943a',  label: 'Paused'  },
  blocked: { bg: '#210d0d', color: '#cf4f4f', border: '#3a1a1a', dot: '#cf4f4f',  label: 'Blocked' },
};

const COL_LABELS = { todo: 'Todo', progress: 'In Progress', done: 'Done' };

function tagPill(tag) {
  if (!tag) return '';
  const s = TAG_COLORS[tag] || { bg: '#222', color: '#888' };
  return `<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;background:${s.bg};color:${s.color}">${tag.charAt(0).toUpperCase()+tag.slice(1)}</span>`;
}

function statusBadge(status) {
  if (!status) return '';
  const s = STATUS_STYLES[status];
  if (!s) return '';
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${s.bg};color:${s.color};border:1px solid ${s.border};white-space:nowrap"><span style="width:5px;height:5px;border-radius:50%;background:${s.dot};display:inline-block"></span>${s.label}</span>`;
}

function borderColor(status) {
  return STATUS_STYLES[status]?.dot || 'transparent';
}

function renderCard(t) {
  const hasBorder = t.status && STATUS_STYLES[t.status];
  return `
    <div style="background:#111;border:1px solid #1c1c1c;${hasBorder ? `border-left:3px solid ${borderColor(t.status)};` : ''}border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <span style="font-size:13px;color:#d8d8d8;line-height:1.5;flex:1">${t.text}</span>
        ${statusBadge(t.status)}
      </div>
      ${(t.tag || t.meta) ? `
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${tagPill(t.tag)}
        ${t.meta ? `<span style="font-size:11px;color:#3a3a3a">${t.meta}</span>` : ''}
      </div>` : ''}
    </div>
  `;
}

function renderColumn(label, tasks, dotColor) {
  const cards = tasks.length
    ? tasks.map(renderCard).join('')
    : `<div style="text-align:center;color:#2a2a2a;font-size:12px;padding:20px 0">Nothing here</div>`;
  return `
    <div style="flex:1;min-width:260px;max-width:380px;display:flex;flex-direction:column;gap:0">
      <div style="display:flex;align-items:center;gap:8px;padding:0 4px 12px">
        <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};display:inline-block;flex-shrink:0"></span>
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#555">${label}</span>
        <span style="font-size:11px;background:#1a1a1a;color:#444;border-radius:10px;padding:2px 7px;font-weight:600">${tasks.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">${cards}</div>
    </div>
  `;
}

// ── Route ─────────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM tasks ORDER BY updated_at DESC`);

  const cols = {
    todo:     rows.filter(r => r.col === 'todo'),
    progress: rows.filter(r => r.col === 'progress'),
    done:     rows.filter(r => r.col === 'done'),
  };

  const totalDone = cols.done.length;
  const blocked   = rows.filter(r => r.status === 'blocked').length;
  const active    = rows.filter(r => r.status === 'active').length;
  const now       = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Clea — Status</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0a0a;color:#d8d8d8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;min-height:100vh;padding:32px 28px 60px;max-width:1200px;margin:0 auto}
    a{color:inherit;text-decoration:none}
  </style>
</head>
<body>

<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:36px;padding-bottom:16px;border-bottom:1px solid #1a1a1a">
  <div>
    <h1 style="font-size:20px;font-weight:600;color:#f0f0f0">🎭 Clea — Status</h1>
    <p style="font-size:12px;color:#333;margin-top:4px">Current workload, live from Postgres</p>
  </div>
  <span style="font-size:11px;color:#2a2a2a">Updated ${now} EST</span>
</div>

<!-- Stats -->
<div style="display:flex;gap:10px;margin-bottom:32px;flex-wrap:wrap">
  ${[
    { label: 'Total tasks', value: rows.length, color: '#f0f0f0' },
    { label: 'Done',        value: totalDone,   color: '#4caf6e' },
    { label: 'Active',      value: active,      color: '#4a9fdf' },
    { label: 'Blocked',     value: blocked,     color: '#cf4f4f' },
  ].map(s => `
    <div style="background:#111;border:1px solid #1c1c1c;border-radius:9px;padding:14px 20px;min-width:110px">
      <div style="font-size:22px;font-weight:700;color:${s.color}">${s.value}</div>
      <div style="font-size:11px;color:#3a3a3a;margin-top:2px">${s.label}</div>
    </div>
  `).join('')}
</div>

<!-- Board -->
<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
  ${renderColumn(COL_LABELS.todo,     cols.todo,     '#555')}
  ${renderColumn(COL_LABELS.progress, cols.progress, '#4a80ff')}
  ${renderColumn(COL_LABELS.done,     cols.done,     '#4caf6e')}
</div>

<p style="margin-top:40px;font-size:11px;color:#222;text-align:center">Powered by Railway + Postgres</p>
</body>
</html>`);
});

// ── Start ─────────────────────────────────────────────────────────────────────
setup().then(() => {
  app.listen(port, () => console.log(`Clea status on port ${port}`));
}).catch(err => {
  console.error('DB setup failed:', err);
  process.exit(1);
});
