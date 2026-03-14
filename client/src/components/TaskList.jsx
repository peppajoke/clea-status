import { useState, useEffect } from 'react'
import { deleteTask, fetchTaskLogs } from '../api'
import './TaskList.css'

const COL_LABELS = {
  active: 'Active', progress: 'In Progress', todo: 'Todo',
  queued: 'Queued', blocked: 'Blocked', failed: 'Failed',
  rejected: 'Rejected', done: 'Done',
}

function ActiveTaskLogs({ taskId }) {
  const [logs, setLogs] = useState([])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetchTaskLogs(taskId)
        .then(data => { if (!cancelled) setLogs(Array.isArray(data) ? data : []) })
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [taskId])

  if (logs.length === 0) return null

  return (
    <div className="task-card-logs" onClick={e => e.stopPropagation()}>
      <div className="task-card-logs-title">Activity</div>
      <div className="task-card-logs-list">
        {logs.slice().reverse().map((log, i) => (
          <div key={i} className="task-card-log-entry">
            <span className="task-card-log-time">
              {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="task-card-log-msg">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TaskList({ tasks, onSelect, onRefresh }) {
  const handleDelete = async (e, task) => {
    e.stopPropagation()
    if (!confirm('Delete this item?')) return
    await deleteTask(task.id)
    onRefresh()
  }

  return (
    <div className="task-list">
      {tasks.map(t => (
        <div
          key={t.id}
          className={`task-card ${t._type === 'queue' ? 'task-card-queue' : ''} ${t.col === 'active' ? 'task-card-active' : ''}`}
          onClick={() => onSelect(t)}
        >
          <div className="task-card-content">
            <div className="task-card-top">
              <span className={`badge badge-${t.col}`}>{COL_LABELS[t.col] || t.col}</span>
              {t.brain && t.brain !== 'big' && (
                <span className="badge badge-little">🧠 {t.brain}</span>
              )}
              {t.complexity === 'high' && <span className="badge badge-high">⚠ high</span>}
              {t.complexity === 'low' && <span className="badge badge-low">▽ low</span>}
              {t.priority && <span className="badge badge-priority">★</span>}
            </div>
            <div className="task-card-title">{t.title || t.text || 'Untitled'}</div>
            <div className="task-card-meta">
              {t.tag && <span className="meta-tag">{t.tag}</span>}
              {t.start_date && <span className="meta-date">📅 {t.start_date.split('T')[0]}</span>}
              {t.depends_on && <span className="meta-dep">⛓ {t.depends_on}</span>}
            </div>
            {t.col === 'active' && <ActiveTaskLogs taskId={t.id} />}
          </div>
          <button className="task-card-delete" onClick={e => handleDelete(e, t)} title="Delete">×</button>
        </div>
      ))}
    </div>
  )
}
