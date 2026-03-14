import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { fetchWorkStatus } from '../api'
import './Header.css'

const PUBLIC_NAV = [
  { path: '/', label: 'Chat' },
]

const ADMIN_NAV = [
  { path: '/tasks', label: 'Tasks' },
  { path: '/links', label: 'Links' },
  { path: '/scheduler', label: 'Scheduler' },
  { path: '/ideas', label: 'Ideas' },
  { path: '/studio', label: 'Studio' },
  { path: '/portfolio', label: 'Portfolio' },
  { path: '/settings', label: 'Settings' },
]

const STATUS_MAP = {
  working: { label: 'Working', color: 'var(--cyan)', pulse: true },
  locked_in: { label: 'Locked In', color: 'var(--purple)', pulse: true },
  taking_a_break: { label: 'Idle', color: 'var(--amber)', pulse: false },
  nothing_to_do: { label: 'Empty', color: 'var(--text-muted)', pulse: false },
}

export default function Header({ authenticated }) {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    const load = () => fetchWorkStatus().then(setStatus).catch(() => {})
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  const s = status ? (STATUS_MAP[status.status] || STATUS_MAP.nothing_to_do) : null
  const navItems = authenticated ? [...PUBLIC_NAV, ...ADMIN_NAV] : PUBLIC_NAV

  return (
    <header className="header">
      <div className="header-top">
        <div className="header-brand">
          <NavLink to="/" className="header-logo">Clea</NavLink>
          {s && (
            <span className="header-status">
              <span className={`header-status-dot ${s.pulse ? 'pulse' : ''}`} style={{ background: s.color }} />
              <span className="header-status-label" style={{ color: s.color }}>{s.label}</span>
            </span>
          )}
        </div>
      </div>
      <div className="header-nav-wrap">
        <nav className="header-nav">
          {navItems.map(item => (
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
      </div>
    </header>
  )
}
