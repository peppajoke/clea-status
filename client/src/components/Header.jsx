import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { fetchWorkStatus } from '../api'
import './Header.css'

const NAV_ITEMS = [
  { path: '/', label: 'Tasks' },
  { path: '/chat', label: 'Chat' },
  { path: '/links', label: 'Links' },
  { path: '/scheduler', label: 'Scheduler' },
  { path: '/settings', label: 'Settings' },
]

const STATUS_MAP = {
  working: { label: 'Working', color: 'var(--cyan)', pulse: true },
  locked_in: { label: 'Locked In', color: 'var(--purple)', pulse: true },
  taking_a_break: { label: 'Idle', color: 'var(--amber)', pulse: false },
  nothing_to_do: { label: 'Empty', color: 'var(--text-muted)', pulse: false },
}

export default function Header() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    const load = () => fetchWorkStatus().then(setStatus).catch(() => {})
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  const s = status ? (STATUS_MAP[status.status] || STATUS_MAP.nothing_to_do) : null

  return (
    <header className="header">
      <div className="header-brand">
        <NavLink to="/" className="header-logo">Clea</NavLink>
        {s && (
          <span className="header-status">
            <span className={`header-status-dot ${s.pulse ? 'pulse' : ''}`} style={{ background: s.color }} />
            <span className="header-status-label" style={{ color: s.color }}>{s.label}</span>
          </span>
        )}
      </div>
      <nav className="header-nav">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/' || item.path === '/settings'}
            className={({ isActive }) => `header-link ${isActive ? 'header-link-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
