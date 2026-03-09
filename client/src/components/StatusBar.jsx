import './StatusBar.css'

const STATUS_MAP = {
  working: { label: 'Working', color: 'var(--cyan)', pulse: true },
  locked_in: { label: 'Locked In', color: 'var(--purple)', pulse: true },
  taking_a_break: { label: 'Idle', color: 'var(--amber)', pulse: false },
  nothing_to_do: { label: 'Empty', color: 'var(--text-muted)', pulse: false },
}

export default function StatusBar({ status }) {
  if (!status) return null
  const s = STATUS_MAP[status.status] || STATUS_MAP.nothing_to_do
  return (
    <div className="status-bar">
      <span className={`status-dot ${s.pulse ? 'pulse' : ''}`} style={{ background: s.color }} />
      <span className="status-label" style={{ color: s.color }}>{s.label}</span>
    </div>
  )
}
