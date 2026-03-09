import { deleteTask, deleteQueueItem } from '../api'
import './TaskList.css'

const COL_LABELS = {
  active: 'Active', progress: 'In Progress', todo: 'Todo',
  queued: 'Queued', blocked: 'Blocked', failed: 'Failed',
  rejected: 'Rejected', done: 'Done',
}

export default function TaskList({ tasks, onSelect, onRefresh }) {
  const handleDelete = async (e, task) => {
    e.stopPropagation()
    if (!confirm('Delete this item?')) return
    if (task._type === 'queue') {
      await deleteQueueItem(task._queueId)
    } else {
      await deleteTask(task.id)
    }
    onRefresh()
  }

  return (
    <div className="task-list">
      {tasks.map(t => (
        <div
          key={t.id}
          className={`task-card ${t._type === 'queue' ? 'task-card-queue' : ''}`}
          onClick={() => onSelect(t)}
        >
          <div className="task-card-content">
            <div className="task-card-top">
              <span className={`badge badge-${t.col}`}>{COL_LABELS[t.col] || t.col}</span>
              {t.brain && t.brain !== 'big' && (
                <span className="badge badge-little">🧠 {t.brain}</span>
              )}
              {t.priority && <span className="badge badge-priority">★</span>}
            </div>
            <div className="task-card-title">{t.title || t.text || 'Untitled'}</div>
            <div className="task-card-meta">
              {t.tag && <span className="meta-tag">{t.tag}</span>}
              {t.start_date && <span className="meta-date">📅 {t.start_date.split('T')[0]}</span>}
              {t.depends_on && <span className="meta-dep">⛓ {t.depends_on}</span>}
            </div>
          </div>
          <button className="task-card-delete" onClick={e => handleDelete(e, t)} title="Delete">×</button>
        </div>
      ))}
    </div>
  )
}
