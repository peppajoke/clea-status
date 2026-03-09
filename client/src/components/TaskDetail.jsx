import { useState, useEffect } from 'react'
import { updateTask, deleteTask, fetchTaskLogs } from '../api'
import './TaskDetail.css'

const COLS = ['todo', 'active', 'blocked', 'done']
const BRAINS = ['big', 'little']
const COMPLEXITIES = ['low', 'medium', 'high']

export default function TaskDetail({ task, onClose, onRefresh }) {
  const [form, setForm] = useState({
    col: task.col || 'todo',
    text: task.title || task.text || '',
    tag: task.tag || '',
    brain: task.brain || 'big',
    complexity: task.complexity || '',
    priority: task.priority || false,
    start_date: task.start_date ? task.start_date.split('T')[0] : '',
    depends_on: task.depends_on || '',
  })
  const [logs, setLogs] = useState([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    fetchTaskLogs(task.id).then(setLogs).catch(() => {})
  }, [task.id])

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    await updateTask(task.id, {
      col: form.col,
      text: form.text,
      tag: form.tag || null,
      brain: form.brain,
      complexity: form.complexity || null,
      priority: form.priority,
      start_date: form.start_date || null,
      depends_on: form.depends_on || null,
    })
    setSaving(false)
    onRefresh()
  }

  const handleDelete = async () => {
    if (!confirm('Delete this task?')) return
    await deleteTask(task.id)
    onRefresh()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Task Detail</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">Title</span>
            <textarea
              className="field-input"
              value={form.text}
              onChange={e => set('text', e.target.value)}
              rows={3}
            />
          </label>

          <div className="field-row">
            <label className="field field-half">
              <span className="field-label">Status</span>
              <select className="field-input" value={form.col} onChange={e => set('col', e.target.value)}>
                {COLS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field field-half">
              <span className="field-label">Brain</span>
              <select className="field-input" value={form.brain} onChange={e => set('brain', e.target.value)}>
                {BRAINS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field field-half">
              <span className="field-label">Complexity</span>
              <select className="field-input" value={form.complexity} onChange={e => set('complexity', e.target.value)}>
                <option value="">—</option>
                {COMPLEXITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field field-half">
              <span className="field-label">Tag</span>
              <input className="field-input" value={form.tag} onChange={e => set('tag', e.target.value)} placeholder="e.g. clea, infra" />
            </label>
            <label className="field field-half">
              <span className="field-label">Start Date</span>
              <input className="field-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Depends On</span>
            <input className="field-input" value={form.depends_on} onChange={e => set('depends_on', e.target.value)} placeholder="Task ID" />
          </label>

          <label className="field-checkbox">
            <input type="checkbox" checked={form.priority} onChange={e => set('priority', e.target.checked)} />
            <span>Priority</span>
          </label>

          <div className="field-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
          </div>

          {logs.length > 0 && (
            <div className="logs-section">
              <h3 className="logs-title">Activity</h3>
              <div className="logs-list">
                {logs.map((log, i) => (
                  <div key={i} className="log-entry">
                    <span className="log-time">{new Date(log.created_at).toLocaleString()}</span>
                    <span className="log-msg">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="task-id">ID: {task.id}</div>
        </div>
      </div>
    </div>
  )
}
