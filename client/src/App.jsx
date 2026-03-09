import { Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import TasksPage from './pages/TasksPage'
import SchedulerPage from './pages/SchedulerPage'
import SettingsPage from './pages/SettingsPage'
import ChatPage from './pages/ChatPage'
import LinksPage from './pages/LinksPage'
import './App.css'

export default function App() {
  return (
    <div className="app">
      <Header />
      <Routes>
        <Route path="/" element={<TasksPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/links" element={<LinksPage />} />
        <Route path="/scheduler" element={<SchedulerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
