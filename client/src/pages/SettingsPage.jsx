import { useState, useEffect } from 'react'
import './SettingsPage.css'

const SECRET = 'clea-log-2026'

// Maps short alias ↔ full model id
const MODEL_ALIASES = {
  haiku: 'anthropic/claude-haiku-4-5',
  sonnet: 'anthropic/claude-sonnet-4-6',
  opus: 'anthropic/claude-opus-4-6',
}
const ALIAS_FROM_MODEL = Object.fromEntries(
  Object.entries(MODEL_ALIASES).map(([a, m]) => [m, a])
)
const toAlias = (model) => ALIAS_FROM_MODEL[model] || model
const toModel = (alias) => MODEL_ALIASES[alias] || alias

export default function SettingsPage() {
  const [preferred, setPreferred] = useState('sonnet')
  const [little, setLittle] = useState('haiku')
  const [bigTimeout, setBigTimeout] = useState('15')
  const [littleTimeout, setLittleTimeout] = useState('15')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch('/node/preferred-model'),
        fetch('/node/little-brain-model'),
        fetch('/api/queue-timeouts', { headers: { 'x-clea-secret': SECRET } })
      ])
      
      if (r1.ok) {
        const d = await r1.json()
        setPreferred(toAlias(d.model || 'anthropic/claude-sonnet-4-6'))
      }
      if (r2.ok) {
        const d = await r2.json()
        setLittle(toAlias(d.model || 'anthropic/claude-haiku-4-5'))
      }
      if (r3.ok) {
        const d = await r3.json()
        setBigTimeout(String(d.big || 15))
        setLittleTimeout(String(d.little || 15))
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
    setLoading(false)
  }

  const handleSave = async () => {
    setMsg('Saving...')
    try {
      const headers = { 'Content-Type': 'application/json' }
      const authHeaders = { 'x-clea-secret': SECRET, 'Content-Type': 'application/json' }
      
      const r1 = await fetch('/node/preferred-model', {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: toModel(preferred) })
      })
      if (!r1.ok) throw new Error(`preferredModel: ${r1.status}`)
      
      const r2 = await fetch('/node/little-brain-model', {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: toModel(little) })
      })
      if (!r2.ok) throw new Error(`littleBrainModel: ${r2.status}`)
      
      const r3 = await fetch('/api/queue-timeouts', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ big: parseInt(bigTimeout, 10) || 15, little: parseInt(littleTimeout, 10) || 15 })
      })
      if (!r3.ok) throw new Error(`queue-timeouts: ${r3.status}`)
      
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
          <label>Preferred Model (Main + Big Brain)</label>
          <select value={preferred} onChange={(e) => setPreferred(e.target.value)}>
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

        <h2 style={{ marginTop: 24 }}>Queue Timeouts</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '0 0 12px' }}>
          Minutes of inactivity before a stale task is auto-reset back to todo.
        </p>

        <div className="settings-field">
          <label>Big Brain Timeout (min)</label>
          <input
            type="number"
            min="1"
            max="120"
            value={bigTimeout}
            onChange={(e) => setBigTimeout(e.target.value)}
          />
        </div>

        <div className="settings-field">
          <label>Little Brain Timeout (min)</label>
          <input
            type="number"
            min="1"
            max="120"
            value={littleTimeout}
            onChange={(e) => setLittleTimeout(e.target.value)}
          />
        </div>

        <button className="btn btn-primary" onClick={handleSave}>Save</button>
        {msg && <div className="settings-msg">{msg}</div>}
      </div>
    </div>
  )
}
