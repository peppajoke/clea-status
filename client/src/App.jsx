import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext } from 'react'
import Header from './components/Header'
import TasksPage from './pages/TasksPage'
import SchedulerPage from './pages/SchedulerPage'
import SettingsPage from './pages/SettingsPage'
import ChatPage from './pages/ChatPage'
import LinksPage from './pages/LinksPage'
import IdeasPage from './pages/IdeasPage'
import './App.css'

export const AuthContext = createContext({ authenticated: false, setAuthenticated: () => {} })

function ProtectedRoute({ children, authenticated }) {
  if (!authenticated) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(d => setAuthenticated(!!d.authenticated))
      .catch(() => {})
  }, [])

  return (
    <AuthContext.Provider value={{ authenticated, setAuthenticated }}>
      <div className="app">
        <Header authenticated={authenticated} />
        <Routes>
          <Route path="/" element={<ChatPage onAuth={() => setAuthenticated(true)} />} />
          <Route path="/tasks" element={<ProtectedRoute authenticated={authenticated}><TasksPage /></ProtectedRoute>} />
          <Route path="/links" element={<ProtectedRoute authenticated={authenticated}><LinksPage /></ProtectedRoute>} />
          <Route path="/scheduler" element={<ProtectedRoute authenticated={authenticated}><SchedulerPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute authenticated={authenticated}><SettingsPage /></ProtectedRoute>} />
          <Route path="/ideas" element={<ProtectedRoute authenticated={authenticated}><IdeasPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AuthContext.Provider>
  )
}
