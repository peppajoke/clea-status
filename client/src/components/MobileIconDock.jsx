import { NavLink } from 'react-router-dom'
import './MobileIconDock.css'

const DOCK_APPS = [
  { path: '/',           label: 'Home',      icon: '🏠' },
  { path: '/tasks',      label: 'Tasks',     icon: '💬' },
  { path: '/portfolio',  label: 'Portfolio', icon: '💲' },
  { path: '/ideas',      label: 'Ideas',     icon: '👕' },
  { path: '/studio',     label: 'Studio',    icon: '🖌️' },
  { path: '/scheduler',  label: 'Schedule',  icon: '📅' },
  { path: '/links',      label: 'Links',     icon: '🔗' },
  { path: '/settings',   label: 'Settings',  icon: '⚙️' },
]

export default function MobileIconDock() {
  return (
    <div className="mobile-dock">
      <div className="mobile-dock-grid">
        {DOCK_APPS.map(app => (
          <NavLink
            key={app.path}
            to={app.path}
            end={app.path === '/'}
            className={({ isActive }) => `mobile-dock-item${isActive ? ' active' : ''}`}
          >
            <span className="mobile-dock-icon">{app.icon}</span>
            <span className="mobile-dock-label">{app.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}
