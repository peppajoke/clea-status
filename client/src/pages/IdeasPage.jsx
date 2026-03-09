import { useState, useEffect, useCallback } from 'react'
import './IdeasPage.css'

const API_HEADERS = { 'Content-Type': 'application/json' }
const TABS = ['pending', 'created', 'denied']
const TAB_LABELS = { pending: '🔔 Pending', created: '✅ Created', denied: '❌ Denied' }

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function IdeaCard({ idea, onApprove, onDeny, onDelete, isPending }) {
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const act = async (action) => {
    setLoading(true)
    try { await action(idea.id) }
    finally { setLoading(false) }
  }

  return (
    <div className={`idea-card idea-${idea.status}`}>
      <div className="idea-top" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <div className="idea-text">{idea.text}</div>
        <div className="idea-meta">
          {idea.source && <span className="idea-source">{idea.source}</span>}
          {idea.category && <span className="idea-category">{idea.category}</span>}
          <span className="idea-time">{timeAgo(idea.created_at)}</span>
          {idea.product_types?.length > 0 && (
            <span className="idea-types">{idea.product_types.join(', ')}</span>
          )}
        </div>
      </div>
      {(expanded || idea.description) && (
        <div className="idea-description">
          {idea.description ? (
            <p>{idea.description}</p>
          ) : (
            <p className="idea-no-desc">No description yet</p>
          )}
        </div>
      )}
      {idea.notes && <div className="idea-notes">{idea.notes}</div>}
      <div className="idea-actions">
        {isPending ? (
          <>
            <button className="idea-btn approve" onClick={() => act(onApprove)} disabled={loading}>
              {loading ? '...' : '✅ Approve'}
            </button>
            <button className="idea-btn deny" onClick={() => act(onDeny)} disabled={loading}>
              ❌ Deny
            </button>
          </>
        ) : (
          <>
            {idea.status === 'created' && idea.product_id && (
              <span className="idea-product-link">Product: {idea.product_id.slice(0, 8)}...</span>
            )}
            <button className="idea-btn delete" onClick={() => act(onDelete)} disabled={loading}>
              🗑
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function AddIdeaInput({ onAdded }) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!text.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/shirt-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim().toUpperCase(), source: 'jack (manual)', category: 'manual' })
      })
      if (res.ok) { setText(''); onAdded() }
    } finally { setSubmitting(false) }
  }

  return (
    <div className="add-idea">
      <input
        className="add-idea-input"
        type="text"
        placeholder="Type a shirt idea..."
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        disabled={submitting}
      />
      <button className="idea-btn approve add-idea-btn" onClick={submit} disabled={!text.trim() || submitting}>
        {submitting ? '...' : '+ Add'}
      </button>
    </div>
  )
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState([])
  const [tab, setTab] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({ pending: 0, created: 0, denied: 0 })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/shirt-ideas?status=${tab}`)
      if (res.ok) setIdeas(await res.json())
    } finally { setLoading(false) }
  }, [tab])

  const loadCounts = useCallback(async () => {
    try {
      const all = await fetch('/api/shirt-ideas').then(r => r.json())
      const c = { pending: 0, created: 0, denied: 0 }
      all.forEach(i => { if (c[i.status] !== undefined) c[i.status]++ })
      setCounts(c)
    } catch {}
  }, [])

  useEffect(() => { load(); loadCounts() }, [load, loadCounts])

  const approve = async (id) => {
    const res = await fetch(`/api/shirt-ideas/${id}/approve`, { method: 'POST', headers: API_HEADERS })
    if (res.ok) { load(); loadCounts() }
  }

  const deny = async (id) => {
    const res = await fetch(`/api/shirt-ideas/${id}/deny`, { method: 'POST', headers: API_HEADERS })
    if (res.ok) { load(); loadCounts() }
  }

  const del = async (id) => {
    const res = await fetch(`/api/shirt-ideas/${id}`, { method: 'DELETE' })
    if (res.ok) { load(); loadCounts() }
  }

  const approveAll = async () => {
    const pending = ideas.filter(i => i.status === 'pending')
    for (const idea of pending) {
      await fetch(`/api/shirt-ideas/${idea.id}/approve`, { method: 'POST', headers: API_HEADERS })
    }
    load(); loadCounts()
  }

  return (
    <div className="ideas-page">
      <div className="ideas-header">
        <h1>🧠 Shirt Ideas</h1>
        {tab === 'pending' && counts.pending > 1 && (
          <button className="idea-btn approve-all" onClick={approveAll}>
            ✅ Approve All ({counts.pending})
          </button>
        )}
      </div>

      <AddIdeaInput onAdded={() => { load(); loadCounts() }} />

      <div className="ideas-tabs">
        {TABS.map(t => (
          <button
            key={t}
            className={`ideas-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
            {counts[t] > 0 && <span className="tab-count">{counts[t]}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ideas-empty">Loading...</div>
      ) : ideas.length === 0 ? (
        <div className="ideas-empty">
          {tab === 'pending' ? 'No ideas waiting for review. Clea will generate more soon.' : `No ${tab} ideas.`}
        </div>
      ) : (
        <div className="ideas-grid">
          {ideas.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onApprove={approve}
              onDeny={deny}
              onDelete={del}
              isPending={tab === 'pending'}
            />
          ))}
        </div>
      )}
    </div>
  )
}
