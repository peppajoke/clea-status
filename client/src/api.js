const SECRET = 'clea-log-2026'
const WRITE_PASS = 'versodoggie666'

const headers = () => ({
  'Content-Type': 'application/json',
  'x-clea-secret': SECRET,
  'x-write-password': WRITE_PASS,
})

export async function fetchTasks() {
  const res = await fetch('/api/tasks', { headers: { 'x-clea-secret': SECRET } })
  return res.json()
}

export async function addTask(text, startDate) {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ text, start_date: startDate || null }),
  })
  return res.json()
}

export async function fetchTaskLogs(taskId) {
  const res = await fetch(`/task/${taskId}/logs`, { headers: { 'x-write-password': WRITE_PASS } })
  return res.json()
}

export async function updateTask(taskId, patch) {
  const res = await fetch(`/task/${taskId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(patch),
  })
  return res.json()
}

export async function deleteTask(taskId) {
  const res = await fetch(`/task/${taskId}`, {
    method: 'DELETE',
    headers: headers(),
  })
  return res.json()
}

export async function triggerPlanner() {
  const res = await fetch('/api/admin/planner-trigger', {
    method: 'POST',
    headers: headers(),
  })
  return res.json()
}

export async function processQueue() {
  const res = await fetch('/api/queue-process', {
    method: 'POST',
    headers: headers(),
  })
  return res.json()
}

export async function fetchWorkStatus() {
  const res = await fetch('/api/work-status')
  return res.json()
}
