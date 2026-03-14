import { useState, useEffect, useCallback } from 'react'
import './SchedulerPage.css'

const SECRET = 'clea-log-2026'
const headers = { 'Content-Type': 'application/json', 'x-clea-secret': SECRET, 'x-write-password': 'versodoggie666' }

const FREQUENCIES = [
  { value: 'hourly', label: 'Hourly', hasDow: false, hasHour: false },
  { value: 'every2h', label: 'Every 2 hours', hasDow: false, hasHour: false },
  { value: 'every6h', label: 'Every 6 hours', hasDow: false, hasHour: false },
  { value: 'daily', label: 'Daily', hasDow: false, hasHour: true },
  { value: 'weekly', label: 'Weekly', hasDow: true, hasHour: true },
  { value: 'monthly', label: 'Monthly (1st)', hasDow: false, hasHour: true },
]

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12
  const ampm = i < 12 ? 'AM' : 'PM'
  return { value: i, label: `${h} ${ampm}` }
})

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildCron(freq, hour, dow) {
  switch (freq) {
    case 'hourly': return '0 * * * *'
    case 'every2h': return '0 */2 * * *'
    case 'every6h': return '0 */6 * * *'
    case 'daily': return `0 ${hour} * * *`
    case 'weekly': return `0 ${hour} * * ${dow}`
    case 'monthly': return `0 ${hour} 1 * *`
    default: return '0 9 * * *'
  }
}

function parseCron(expr) {
  const parts = expr.split(' ')
  const hourField = parts[1] || '*'
  // Handle */N interval patterns
  const intervalMatch = hourField.match(/^\*\/(\d+)$/)
  if (hourField === '*') return { freq: 'hourly', hour: 9, dow: 1 }
  if (intervalMatch) {
    const n = parseInt(intervalMatch[1])
    if (n === 2) return { freq: 'every2h', hour: 9, dow: 1 }
    if (n === 6) return { freq: 'every6h', hour: 9, dow: 1 }
    return { freq: `every${n}h`, hour: 9, dow: 1, interval: n }
  }
  const hour = parseInt(hourField) || 9
  const dow = parseInt(parts[4]) || 1
  if (parts[4] !== '*') return { freq: 'weekly', hour, dow }
  if (parts[3] !== '*' || parts[2] !== '*') return { freq: 'monthly', hour, dow: 1 }
  return { freq: 'daily', hour, dow: 1 }
}

const ACTION_TYPES = [
  { value: 'prompt', label: '💬 Prompt' },
  { value: 'script', label: '📜 Script' },
  { value: 'curl', label: '🌐 Curl' },
]

const CURL_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export default function SchedulerPage() {
  const [schedules, setSchedules] = useState([])
  const [prompt, setPrompt] = useState('')
  const [freq, setFreq] = useState('daily')
  const [hour, setHour] = useState(9)
  const [dow, setDow] = useState(1)
  const [desc, setDesc] = useState('')
  const [brain, setBrain] = useState('big')
  const [priority, setPriority] = useState(false)
  const [actionType, setActionType] = useState('prompt')
  const [actionConfig, setActionConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [runningId, setRunningId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [editFreq, setEditFreq] = useState('daily')
  const [editHour, setEditHour] = useState(9)
  const [editDow, setEditDow] = useState(1)
  const [editDesc, setEditDesc] = useState('')
  const [editBrain, setEditBrain] = useState('big')
  const [editPriority, setEditPriority] = useState(false)
  const [editActionType, setEditActionType] = useState('prompt')
  const [editActionConfig, setEditActionConfig] = useState({})

  const load = useCallback(async () => {
    const res = await fetch('/api/prompt-schedules', { headers: { 'x-clea-secret': SECRET } })
    const data = await res.json()
    setSchedules(data.schedules || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!prompt.trim()) return
    await fetch('/api/prompt-schedules', {
      method: 'POST', headers,
      body: JSON.stringify({ prompt_text: prompt.trim(), schedule_expr: buildCron(freq, hour, dow), schedule_tz: 'America/New_York', description: desc.trim() || null, brain, priority, action_type: actionType, action_config: actionType === 'curl' ? { ...actionConfig, url: prompt.trim() } : actionType === 'script' ? { script_path: prompt.trim() } : {} })
    })
    setPrompt('')
    setDesc('')
    setFreq('daily')
    setHour(9)
    setDow(1)
    setBrain('big')
    setPriority(false)
    setActionType('prompt')
    setActionConfig({})
    load()
  }

  const handleToggle = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active'
    await fetch(`/api/prompt-schedules/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: newStatus }) })
    load()
  }

  const handleBrainToggle = async (id, currentBrain) => {
    const newBrain = currentBrain === 'big' ? 'little' : 'big'
    await fetch(`/api/prompt-schedules/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ brain: newBrain }) })
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this schedule?')) return
    await fetch(`/api/prompt-schedules/${id}`, { method: 'DELETE', headers })
    load()
  }

  const handleRunNow = async (id) => {
    setRunningId(id)
    try {
      const res = await fetch(`/api/prompt-schedules/${id}/run`, { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'failed')
      // brief flash — keep runningId for 1.5s so user sees feedback
    } catch (e) {
      alert(`Run failed: ${e.message}`)
    } finally {
      setTimeout(() => setRunningId(r => r === id ? null : r), 1500)
    }
  }

  const startEditing = (s) => {
    const parsed = parseCron(s.schedule_expr)
    setEditingId(s.id)
    setEditPrompt(s.prompt_text)
    setEditFreq(parsed.freq)
    setEditHour(parsed.hour)
    setEditDow(parsed.dow)
    setEditDesc(s.description || '')
    setEditBrain(s.brain || 'big')
    setEditPriority(!!s.priority)
    setEditActionType(s.action_type || 'prompt')
    setEditActionConfig(s.action_config || {})
  }

  const cancelEditing = () => setEditingId(null)

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editPrompt.trim()) return
    await fetch(`/api/prompt-schedules/${editingId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({
        prompt_text: editPrompt.trim(),
        schedule_expr: buildCron(editFreq, editHour, editDow),
        description: editDesc.trim() || null,
        brain: editBrain,
        priority: editPriority,
        action_type: editActionType,
        action_config: editActionType === 'curl' ? { ...editActionConfig, url: editPrompt.trim() } : editActionType === 'script' ? { script_path: editPrompt.trim() } : {}
      })
    })
    setEditingId(null)
    load()
  }

  const scheduleLabel = (expr) => {
    const parsed = parseCron(expr)
    const { freq, hour, dow, interval } = parsed
    const f = FREQUENCIES.find(x => x.value === freq)
    // Handle generic */N interval patterns not in FREQUENCIES
    if (!f && interval) return `Every ${interval} hours`
    if (!f?.hasHour) return f?.label || expr
    const h = HOURS[hour]?.label || hour
    if (freq === 'weekly') return `${DAYS[dow]} at ${h} ET`
    if (freq === 'monthly') return `1st at ${h} ET`
    return `Daily at ${h} ET`
  }

  return (
    <div className="scheduler-page">
      <form className="scheduler-form" onSubmit={handleCreate}>
        <div className="scheduler-row" style={{ marginBottom: 8 }}>
          <div className="action-type-toggle">
            {ACTION_TYPES.map(t => (
              <button key={t.value} type="button" className={`action-type-btn ${actionType === t.value ? 'action-type-active' : ''}`} onClick={() => { setActionType(t.value); setActionConfig({}) }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {actionType === 'prompt' && (
          <textarea
            className="scheduler-input"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Prompt to run on schedule..."
            rows={3}
          />
        )}
        {actionType === 'script' && (
          <input
            className="scheduler-input"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Script path (e.g. /usr/local/bin/my-script.sh)"
            style={{ fontFamily: 'monospace' }}
          />
        )}
        {actionType === 'curl' && (
          <div className="curl-config">
            <div className="scheduler-row" style={{ marginBottom: 6 }}>
              <select className="scheduler-select scheduler-select-sm" value={actionConfig.method || 'GET'} onChange={e => setActionConfig(c => ({ ...c, method: e.target.value }))}>
                {CURL_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input
                className="scheduler-input"
                style={{ flex: 1, fontFamily: 'monospace' }}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="https://example.com/api/endpoint"
              />
            </div>
            <textarea
              className="scheduler-input"
              value={actionConfig.body || ''}
              onChange={e => setActionConfig(c => ({ ...c, body: e.target.value }))}
              placeholder='Request body (optional JSON)'
              rows={2}
              style={{ fontFamily: 'monospace', fontSize: '0.85em' }}
            />
          </div>
        )}
        <div className="scheduler-row">
          <select className="scheduler-select" value={freq} onChange={e => setFreq(e.target.value)}>
            {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          {FREQUENCIES.find(f => f.value === freq)?.hasHour && (
            <select className="scheduler-select" value={hour} onChange={e => setHour(Number(e.target.value))}>
              {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          )}
          {FREQUENCIES.find(f => f.value === freq)?.hasDow && (
            <select className="scheduler-select scheduler-select-sm" value={dow} onChange={e => setDow(Number(e.target.value))}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          )}
          {actionType === 'prompt' && (
            <div className="brain-toggle">
              <button type="button" className={`brain-btn ${brain === 'big' ? 'brain-active' : ''}`} onClick={() => setBrain('big')} title="Big brain (Opus)">🧠</button>
              <button type="button" className={`brain-btn ${brain === 'little' ? 'brain-active' : ''}`} onClick={() => setBrain('little')} title="Little brain (Haiku)">🐣</button>
            </div>
          )}
          <button type="button" className={`brain-btn ${priority ? 'priority-active' : ''}`} onClick={() => setPriority(p => !p)} title="High priority — tasks jump the queue">🔴</button>
          <input
            className="scheduler-desc"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Description (optional)"
          />
          <button type="submit" className="btn btn-primary" disabled={!prompt.trim()}>Create</button>
        </div>
      </form>

      <div className="scheduler-list">
        {loading ? (
          <div className="empty">Loading...</div>
        ) : schedules.length === 0 ? (
          <div className="empty">No schedules yet.</div>
        ) : (
          schedules.map(s => (
            editingId === s.id ? (
              <form key={s.id} className="schedule-card schedule-editing" onSubmit={handleSaveEdit}>
                <div className="schedule-content">
                  <div className="scheduler-row" style={{ marginBottom: 8 }}>
                    <div className="action-type-toggle">
                      {ACTION_TYPES.map(t => (
                        <button key={t.value} type="button" className={`action-type-btn ${editActionType === t.value ? 'action-type-active' : ''}`} onClick={() => { setEditActionType(t.value); setEditActionConfig({}) }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editActionType === 'prompt' && (
                    <textarea className="scheduler-input" value={editPrompt} onChange={e => setEditPrompt(e.target.value)} rows={3} autoFocus />
                  )}
                  {editActionType === 'script' && (
                    <input className="scheduler-input" value={editPrompt} onChange={e => setEditPrompt(e.target.value)} placeholder="Script path" style={{ fontFamily: 'monospace' }} autoFocus />
                  )}
                  {editActionType === 'curl' && (
                    <div className="curl-config">
                      <div className="scheduler-row" style={{ marginBottom: 6 }}>
                        <select className="scheduler-select scheduler-select-sm" value={editActionConfig.method || 'GET'} onChange={e => setEditActionConfig(c => ({ ...c, method: e.target.value }))}>
                          {CURL_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <input className="scheduler-input" style={{ flex: 1, fontFamily: 'monospace' }} value={editPrompt} onChange={e => setEditPrompt(e.target.value)} placeholder="https://..." autoFocus />
                      </div>
                      <textarea className="scheduler-input" value={editActionConfig.body || ''} onChange={e => setEditActionConfig(c => ({ ...c, body: e.target.value }))} placeholder="Request body (optional JSON)" rows={2} style={{ fontFamily: 'monospace', fontSize: '0.85em' }} />
                    </div>
                  )}
                  <div className="scheduler-row" style={{ marginTop: 8 }}>
                    <select className="scheduler-select" value={editFreq} onChange={e => setEditFreq(e.target.value)}>
                      {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    {FREQUENCIES.find(f => f.value === editFreq)?.hasHour && (
                      <select className="scheduler-select" value={editHour} onChange={e => setEditHour(Number(e.target.value))}>
                        {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                      </select>
                    )}
                    {FREQUENCIES.find(f => f.value === editFreq)?.hasDow && (
                      <select className="scheduler-select scheduler-select-sm" value={editDow} onChange={e => setEditDow(Number(e.target.value))}>
                        {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    )}
                    {editActionType === 'prompt' && (
                      <div className="brain-toggle">
                        <button type="button" className={`brain-btn ${editBrain === 'big' ? 'brain-active' : ''}`} onClick={() => setEditBrain('big')} title="Big brain (Opus)">🧠</button>
                        <button type="button" className={`brain-btn ${editBrain === 'little' ? 'brain-active' : ''}`} onClick={() => setEditBrain('little')} title="Little brain (Haiku)">🐣</button>
                      </div>
                    )}
                    <button type="button" className={`brain-btn ${editPriority ? 'priority-active' : ''}`} onClick={() => setEditPriority(p => !p)} title="High priority — tasks jump the queue">🔴</button>
                    <input className="scheduler-desc" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description (optional)" />
                  </div>
                  <div className="scheduler-row" style={{ marginTop: 8 }}>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!editPrompt.trim()}>Save</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEditing}>Cancel</button>
                  </div>
                </div>
              </form>
            ) : (
              <div key={s.id} className={`schedule-card ${s.status !== 'active' ? 'schedule-paused' : ''}`} onClick={() => startEditing(s)} style={{ cursor: 'pointer' }}>
                <div className="schedule-content">
                  <div className="schedule-prompt">{s.prompt_text}</div>
                  <div className="schedule-meta">
                    <span className={`badge ${s.status === 'active' ? 'badge-active' : 'badge-todo'}`}>{s.status}</span>
                    {s.priority && <span className="badge badge-priority">🔴 priority</span>}
                    {s.action_type && s.action_type !== 'prompt' && (
                      <span className={`badge badge-action-${s.action_type}`}>{s.action_type === 'script' ? '📜 script' : '🌐 curl'}</span>
                    )}
                    <span className="schedule-freq">{scheduleLabel(s.schedule_expr)}</span>
                    {s.last_run && <span className="schedule-last">Last: {new Date(s.last_run).toLocaleString()}</span>}
                  </div>
                  {s.description && <div className="schedule-desc-line">{s.description}</div>}
                </div>
                <div className="schedule-actions" onClick={e => e.stopPropagation()}>
                  <button className="brain-btn brain-active btn-sm" onClick={() => handleBrainToggle(s.id, s.brain || 'big')} title={`Switch to ${(s.brain || 'big') === 'big' ? 'little' : 'big'} brain`}>
                    {(s.brain || 'big') === 'big' ? '🧠' : '🐣'}
                  </button>
                  <button
                    className={`btn btn-sm ${runningId === s.id ? 'btn-success' : 'btn-run-now'}`}
                    onClick={() => handleRunNow(s.id)}
                    disabled={runningId === s.id}
                    title="Queue this task immediately"
                  >
                    {runningId === s.id ? '✓' : '⚡ Now'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(s.id, s.status)}>
                    {s.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>×</button>
                </div>
              </div>
            )
          ))
        )}
      </div>
    </div>
  )
}
