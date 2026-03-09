import { useState, useEffect, useCallback } from 'react'
import { fetchTasks, fetchQueue, fetchWorkStatus, triggerPlanner, addQueueItem } from '../api'
import TaskList from '../components/TaskList'
import TaskDetail from '../components/TaskDetail'
import QueueInput from '../components/QueueInput'
import StatusBar from '../components/StatusBar'
import './TasksPage.css'

const TABS = [
  { key: 'execution', label: 'Execution' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
]

export default function TasksPage() {
  const [tasks, setTasks] = useState([])
  const [queue, setQueue] = useState([])
  const [status, setStatus] = useState(null)
  const [tab, setTab] = useState('execution')
  const [selectedTask, setSelectedTask] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [t, q, s] = await Promise.all([fetchTasks(), fetchQueue(), fetchWorkStatus()])
    setTasks(t)
    setQueue(q)
    setStatus(s)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [refresh])

  const filteredTasks = (() => {
    if (tab === 'execution') {
      const taskItems = tasks
        .filter(t => ['active', 'progress', 'todo', 'queue'].includes(t.col))
        .map(t => ({ ...t, _type: 'task' }))
      const queueItems = queue
        .filter(i => !i.done)
        .map(i => ({ id: `q-${i.id}`, title: i.text, col: 'queued', _type: 'queue', _queueId: i.id, start_date: i.start_date }))
      const all = [...taskItems, ...queueItems]
      const order = { active: 0, progress: 0, todo: 1, queued: 2 }
      all.sort((a, b) => {
        const ao = order[a.col] ?? 3, bo = order[b.col] ?? 3
        if (ao !== bo) return ao - bo
        if (a.priority !== b.priority) return (b.priority ? 1 : 0) - (a.priority ? 1 : 0)
        return 0
      })
      return all
    }
    if (tab === 'blocked') return tasks.filter(t => ['blocked', 'failed', 'rejected'].includes(t.col))
    if (tab === 'done') return tasks.filter(t => t.col === 'done').slice(0, 50)
    return []
  })()

  const counts = {
    execution: tasks.filter(t => ['active', 'progress', 'todo', 'queue'].includes(t.col)).length + queue.filter(i => !i.done).length,
    blocked: tasks.filter(t => ['blocked', 'failed', 'rejected'].includes(t.col)).length,
    done: tasks.filter(t => t.col === 'done').length,
  }

  const handleStartWork = async () => {
    await triggerPlanner()
    setTimeout(refresh, 2000)
  }

  const handleQueueAdd = async (text, startDate) => {
    await addQueueItem(text, startDate)
    refresh()
  }

  return (
    <div className="tasks-page">
      <div className="tasks-toolbar">
        <StatusBar status={status} />
        <div className="tasks-actions">
          <button className="btn btn-primary" onClick={handleStartWork}>⚡ Start Work</button>
          <button className="btn btn-ghost" onClick={refresh}>↻</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'tab-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {counts[t.key] > 0 && <span className="tab-count">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      <main className="tasks-main">
        {loading ? (
          <div className="empty">Loading...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="empty">
            {tab === 'execution' ? 'Nothing in the queue. Add something below.' : `No ${tab} tasks.`}
          </div>
        ) : (
          <TaskList
            tasks={filteredTasks}
            onSelect={t => t._type !== 'queue' && setSelectedTask(t)}
            onRefresh={refresh}
          />
        )}
      </main>

      <QueueInput onSubmit={handleQueueAdd} />

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onRefresh={() => { refresh(); setSelectedTask(null) }}
        />
      )}
    </div>
  )
}
