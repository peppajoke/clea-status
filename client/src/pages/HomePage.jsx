import { useNavigate } from 'react-router-dom'
import './HomePage.css'

const APPS = [
  {
    path: '/tasks',
    label: 'Tasks',
    icon: '⬡',
    desc: 'Queue & task board',
    color: '#22d3ee',
  },
  {
    path: '/portfolio',
    label: 'Portfolio',
    icon: '◈',
    desc: 'Live trading positions',
    color: '#4ade80',
  },
  {
    path: '/ideas',
    label: 'Ideas',
    icon: '✦',
    desc: 'Shirt idea pipeline',
    color: '#f59e0b',
  },
  {
    path: '/studio',
    label: 'Studio',
    icon: '⬟',
    desc: 'Print-on-demand shop',
    color: '#a78bfa',
  },
  {
    path: '/scheduler',
    label: 'Scheduler',
    icon: '⊛',
    desc: 'Prompt schedules',
    color: '#fb923c',
  },
  {
    path: '/links',
    label: 'Links',
    icon: '⋈',
    desc: 'Saved links',
    color: '#38bdf8',
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: '⊙',
    desc: 'Config & admin',
    color: '#94a3b8',
  },
]

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <div className="home-greeting">
        <img src="/clea.png" alt="Clea" className="home-avatar" />
        <div className="home-greeting-text">
          <span className="home-name">Clea</span>
          <span className="home-sub">BauerSoft Operations</span>
        </div>
      </div>

      <div className="home-grid">
        {APPS.map(app => (
          <button
            key={app.path}
            className="home-app"
            onClick={() => navigate(app.path)}
            style={{ '--app-color': app.color }}
          >
            <div className="home-app-icon">{app.icon}</div>
            <div className="home-app-label">{app.label}</div>
            <div className="home-app-desc">{app.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
