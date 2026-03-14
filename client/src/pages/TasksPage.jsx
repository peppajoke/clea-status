import { useState, useEffect, useCallback } from 'react'
import { fetchTasks, addTask } from '../api'
import TaskList from '../components/TaskList'
import TaskDetail from '../components/TaskDetail'
import QueueInput from '../components/QueueInput'
import './TasksPage.css'

const TABS = [
  { key: 'execution', label: 'In Progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
]

export default function TasksPage() {
  const [tasks, setTasks] = useState([])
  const [tab, setTab] = useState('execution')
  const [selectedTask, setSelectedTask] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const t = await fetchTasks()
    setTasks(t)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [refresh])

  const filteredTasks = (() => {
    if (tab === 'execution') {
      return tasks
        .filter(t => ['active', 'progress', 'todo'].includes(t.col))
        .sort((a, b) => {
          const order = { active: 0, progress: 0, todo: 1 }
          const ao = order[a.col] ?? 2, bo = order[b.col] ?? 2
          if (ao !== bo) return ao - bo
          if (a.priority !== b.priority) return (b.priority ? 1 : 0) - (a.priority ? 1 : 0)
          return 0
        })
    }
    if (tab === 'blocked') return tasks.filter(t => ['blocked', 'failed', 'rejected'].includes(t.col))
    if (tab === 'done') return tasks.filter(t => t.col === 'done').sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 50)
    return []
  })()

  const counts = {
    execution: tasks.filter(t => ['active', 'progress', 'todo'].includes(t.col)).length,
    blocked: tasks.filter(t => ['blocked', 'failed', 'rejected'].includes(t.col)).length,
    done: tasks.filter(t => t.col === 'done').length,
  }

  const handleTaskAdd = async (text, startDate) => {
    await addTask(text, startDate)
    refresh()
  }

  return (
    <div className="tasks-page">
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
            {tab === 'execution' ? 'No tasks. Add one below.' : `No ${tab} tasks.`}
          </div>
        ) : (
          <TaskList
            tasks={filteredTasks}
            onSelect={t => setSelectedTask(t)}
            onRefresh={refresh}
          />
        )}
      </main>

      <QueueInput onSubmit={handleTaskAdd} />

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
