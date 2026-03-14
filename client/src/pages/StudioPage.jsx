import { useState, useEffect } from 'react'
import './StudioPage.css'

const PRODUCT_TYPES = [
  { id: 't-shirt', label: '👕 T-Shirt', price: '$29.95' },
  { id: 'hoodie', label: '🧥 Hoodie', price: '$44.95' },
  { id: 'sweatshirt', label: '👔 Crewneck', price: '$39.95' },
  { id: 'hat', label: '🧢 Hat', price: '$24.95' },
  { id: 'mug', label: '☕ Mug', price: '$16.95' },
]

const ENGINES = [
  { id: 'auto', label: '⚡ Auto', desc: 'LLM SVG → canvas fallback' },
  { id: 'dalle', label: '🎨 DALL-E 3', desc: 'OpenAI image generation (best quality)' },
  { id: 'llm', label: '🤖 LLM SVG', desc: 'Claude generates SVG graphic' },
  { id: 'canvas', label: '📐 Canvas', desc: 'Fast template-based generation' },
]

export default function StudioPage() {
  const [prompt, setPrompt] = useState('')
  const [engine, setEngine] = useState('auto')
  const [generating, setGenerating] = useState(false)
  const [imageUrl, setImageUrl] = useState(null)
  const [activeDesignId, setActiveDesignId] = useState(null)
  const [lastMethod, setLastMethod] = useState(null)
  const [publishing, setPublishing] = useState(null)
  const [published, setPublished] = useState([])
  const [error, setError] = useState(null)
  const [designs, setDesigns] = useState([])
  const [loadingDesigns, setLoadingDesigns] = useState(true)
  const [deleting, setDeleting] = useState(null)

  // Load saved designs on mount
  useEffect(() => {
    fetch('/api/studio-designs')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setDesigns(data)
      })
      .catch(() => {})
      .finally(() => setLoadingDesigns(false))
  }, [])

  const generate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setError(null)
    setImageUrl(null)
    setActiveDesignId(null)
    setPublished([])
    setLastMethod(null)
    try {
      const res = await fetch('/api/generate-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), engine })
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setActiveDesignId(data.id)
      setLastMethod(data.method)
      // Use DB endpoint for image (persistent across Railway deploys)
      setImageUrl(data.id ? `/api/studio-designs/${data.id}/image` : (data.imageUrl || data.image_url))
      // Prepend to saved designs list
      setDesigns(prev => [data, ...prev])
    } catch (e) {
      setError('Generation failed: ' + e.message)
    } finally {
      setGenerating(false)
    }
  }

  const deleteDesign = async (id, e) => {
    e.stopPropagation()
    if (deleting) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/studio-designs/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.deleted) {
        setDesigns(prev => prev.filter(d => d.id !== id))
        // If we're viewing the deleted design, clear the preview
        if (activeDesignId === id) {
          setImageUrl(null)
          setActiveDesignId(null)
          setPublished([])
        }
      }
    } catch (_) {
      setError('Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  const publish = async (productType) => {
    if (!imageUrl) return
    setPublishing(productType)
    try {
      const res = await fetch('/api/publish-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          productType,
          title: prompt.trim(),
          description: `${prompt.trim()} — designed and printed on premium quality.`
        })
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setPublished(prev => [...prev, productType])
    } catch (e) {
      setError('Publish failed: ' + e.message)
    } finally {
      setPublishing(null)
    }
  }

  // Get the best available image URL for a design
  // Prefer the DB-backed endpoint (persistent across deploys) over the ephemeral file path
  const getDesignImageUrl = (design) => {
    if (design.id) return `/api/studio-designs/${design.id}/image`
    return design.image_url || design.imageUrl
  }

  const loadDesign = (design) => {
    setPrompt(design.prompt)
    setImageUrl(getDesignImageUrl(design))
    setActiveDesignId(design.id)
    setPublished([])
    setError(null)
  }

  return (
    <div className="studio-page">
      <div className="studio-header">
        <h1>🎨 Design Studio</h1>
      </div>

      <div className="studio-engine-picker">
        {ENGINES.map(e => (
          <button
            key={e.id}
            className={`engine-btn ${engine === e.id ? 'active' : ''}`}
            onClick={() => setEngine(e.id)}
            title={e.desc}
            disabled={generating}
          >
            {e.label}
          </button>
        ))}
        <span className="engine-desc">{ENGINES.find(e => e.id === engine)?.desc}</span>
      </div>

      <div className="studio-input-row">
        <input
          className="studio-prompt"
          type="text"
          placeholder="Describe a design... (e.g. red crosshair with HEADSHOT, pixel art mushroom, neon lightning bolt)"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !generating && generate()}
          disabled={generating}
        />
        <button className="studio-btn generate" onClick={generate} disabled={!prompt.trim() || generating}>
          {generating ? (engine === 'dalle' ? '🎨 Generating...' : '⏳ Generating...') : '⚡ Generate'}
        </button>
      </div>

      {error && <div className="studio-error">{error}</div>}

      {lastMethod && (
        <div className="studio-method-badge">
          Generated via: {lastMethod === 'dalle' ? '🎨 DALL-E 3' : lastMethod === 'llm' ? '🤖 LLM SVG' : '📐 Canvas'}
        </div>
      )}

      {imageUrl && (
        <div className="studio-preview">
          <div className="studio-preview-image">
            <img src={imageUrl} alt="Generated design" />
          </div>

          <div className="studio-publish">
            <h3>Publish as...</h3>
            <div className="studio-product-grid">
              {PRODUCT_TYPES.map(pt => (
                <button
                  key={pt.id}
                  className={`studio-product-btn ${published.includes(pt.id) ? 'published' : ''}`}
                  onClick={() => publish(pt.id)}
                  disabled={publishing || published.includes(pt.id)}
                >
                  {publishing === pt.id ? '⏳' : published.includes(pt.id) ? '✅' : pt.label}
                  <span className="product-price">{pt.price}</span>
                </button>
              ))}
            </div>
            <button
              className="studio-product-btn publish-all"
              onClick={async () => { for (const pt of PRODUCT_TYPES) { if (!published.includes(pt.id)) await publish(pt.id) } }}
              disabled={publishing || published.length === PRODUCT_TYPES.length}
            >
              {published.length === PRODUCT_TYPES.length ? '✅ All Published' : '🚀 Publish All'}
            </button>
          </div>
        </div>
      )}

      <div className="studio-saved">
        <h3>📁 Saved Designs {designs.length > 0 && <span className="design-count">({designs.length})</span>}</h3>
        {loadingDesigns ? (
          <div className="studio-loading">Loading designs...</div>
        ) : designs.length === 0 ? (
          <div className="studio-empty">No designs yet. Generate one above!</div>
        ) : (
          <div className="studio-designs-grid">
            {designs.map(d => (
              <div
                key={d.id}
                className={`studio-design-card ${activeDesignId === d.id ? 'active' : ''}`}
                onClick={() => loadDesign(d)}
              >
                <div className="design-card-img">
                  <img src={getDesignImageUrl(d)} alt={d.prompt} />
                  <button
                    className="design-delete-btn"
                    onClick={(e) => deleteDesign(d.id, e)}
                    disabled={deleting === d.id}
                    title="Delete design"
                  >
                    {deleting === d.id ? '⏳' : '🗑'}
                  </button>
                </div>
                <span className="design-card-label">{d.prompt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
