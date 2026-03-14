import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext } from 'react'
import Header from './components/Header'
import MobileIconDock from './components/MobileIconDock'
import TasksPage from './pages/TasksPage'
import SchedulerPage from './pages/SchedulerPage'
import SettingsPage from './pages/SettingsPage'
import ChatPage from './pages/ChatPage'
import LinksPage from './pages/LinksPage'
import IdeasPage from './pages/IdeasPage'
import StudioPage from './pages/StudioPage'
import PortfolioPage from './pages/PortfolioPage'
import HomePage from './pages/HomePage'
import './App.css'

export const AuthContext = createContext({ authenticated: false, setAuthenticated: () => {} })

function ProtectedRoute({ children, authenticated, ready }) {
  if (!ready) return null                          // wait for auth check
  if (!authenticated) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(d => setAuthenticated(!!d.authenticated))
      .catch(() => {})
      .finally(() => setAuthReady(true))
  }, [])

  return (
    <AuthContext.Provider value={{ authenticated, setAuthenticated }}>
      <div className="app">
        <div className="app-top">
          <Header authenticated={authenticated} />
          {authReady && authenticated && <MobileIconDock />}
        </div>
        <Routes>
          <Route path="/" element={
            !authReady ? null :
            authenticated ? <HomePage /> :
            <ChatPage onAuth={() => setAuthenticated(true)} />
          } />
          <Route path="/tasks"     element={<ProtectedRoute authenticated={authenticated} ready={authReady}><TasksPage /></ProtectedRoute>} />
          <Route path="/links"     element={<ProtectedRoute authenticated={authenticated} ready={authReady}><LinksPage /></ProtectedRoute>} />
          <Route path="/scheduler" element={<ProtectedRoute authenticated={authenticated} ready={authReady}><SchedulerPage /></ProtectedRoute>} />
          <Route path="/settings"  element={<ProtectedRoute authenticated={authenticated} ready={authReady}><SettingsPage /></ProtectedRoute>} />
          <Route path="/ideas"     element={<ProtectedRoute authenticated={authenticated} ready={authReady}><IdeasPage /></ProtectedRoute>} />
          <Route path="/studio"    element={<ProtectedRoute authenticated={authenticated} ready={authReady}><StudioPage /></ProtectedRoute>} />
          <Route path="/portfolio" element={<ProtectedRoute authenticated={authenticated} ready={authReady}><PortfolioPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AuthContext.Provider>
  )

}
