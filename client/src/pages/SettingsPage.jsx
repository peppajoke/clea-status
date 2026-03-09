import { useState, useEffect } from 'react'
import './SettingsPage.css'

const SECRET = 'clea-log-2026'

export default function SettingsPage() {
  const [main, setMain] = useState('haiku')
  const [big, setBig] = useState('sonnet')
  const [little, setLittle] = useState('haiku')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch('/api/node-state/mainSessionBrain', { headers: { 'x-clea-secret': SECRET } }),
        fetch('/api/node-state/bigBrainModel', { headers: { 'x-clea-secret': SECRET } }),
        fetch('/api/node-state/littleBrainModel', { headers: { 'x-clea-secret': SECRET } })
      ])
      
      if (r1.ok) {
        const d = await r1.json()
        setMain(d.value || 'haiku')
      }
      if (r2.ok) {
        const d = await r2.json()
        setBig(d.value || 'sonnet')
      }
      if (r3.ok) {
        const d = await r3.json()
        setLittle(d.value || 'haiku')
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
    setLoading(false)
  }

  const handleSave = async () => {
    setMsg('Saving...')
    try {
      const headers = { 'x-clea-secret': SECRET, 'Content-Type': 'application/json' }
      
      const r1 = await fetch('/api/node-state/mainSessionBrain', {
        method: 'POST',
        headers,
        body: JSON.stringify({ value: main })
      })
      if (!r1.ok) throw new Error(`mainSessionBrain: ${r1.status}`)
      
      const r2 = await fetch('/api/node-state/bigBrainModel', {
        method: 'POST',
        headers,
        body: JSON.stringify({ value: big })
      })
      if (!r2.ok) throw new Error(`bigBrainModel: ${r2.status}`)
      
      const r3 = await fetch('/api/node-state/littleBrainModel', {
        method: 'POST',
        headers,
        body: JSON.stringify({ value: little })
      })
      if (!r3.ok) throw new Error(`littleBrainModel: ${r3.status}`)
      
      setMsg('✓ Saved')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg(`✗ Error: ${e.message}`)
    }
  }

  if (loading) return <div className="settings-page"><div className="empty">Loading...</div></div>

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h2 style={{ marginTop: 0 }}>Brain Settings</h2>
        
        <div className="settings-field">
          <label>Main Session</label>
          <select value={main} onChange={(e) => setMain(e.target.value)}>
            <option value="haiku">Haiku</option>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
          </select>
        </div>

        <div className="settings-field">
          <label>Big Brain Tasks</label>
          <select value={big} onChange={(e) => setBig(e.target.value)}>
            <option value="haiku">Haiku</option>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
          </select>
        </div>

        <div className="settings-field">
          <label>Little Brain Tasks</label>
          <select value={little} onChange={(e) => setLittle(e.target.value)}>
            <option value="haiku">Haiku</option>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
          </select>
        </div>

        <button className="btn btn-primary" onClick={handleSave}>Save</button>
        {msg && <div className="settings-msg">{msg}</div>}
      </div>
    </div>
  )
}
