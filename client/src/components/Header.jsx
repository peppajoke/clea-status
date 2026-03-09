import { NavLink } from 'react-router-dom'
import './Header.css'

const NAV_ITEMS = [
  { path: '/', label: 'Tasks' },
  { path: '/scheduler', label: 'Scheduler' },
  { path: '/settings', label: 'Settings' },
]

export default function Header() {
  return (
    <header className="header">
      <NavLink to="/tasks" className="header-logo">Clea</NavLink>
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
