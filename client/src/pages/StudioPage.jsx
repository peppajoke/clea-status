import { useState } from 'react'
import './StudioPage.css'

const PRODUCT_TYPES = [
  { id: 't-shirt', label: '👕 T-Shirt', price: '$29.95' },
  { id: 'hoodie', label: '🧥 Hoodie', price: '$44.95' },
  { id: 'sweatshirt', label: '👔 Crewneck', price: '$39.95' },
  { id: 'hat', label: '🧢 Hat', price: '$24.95' },
  { id: 'mug', label: '☕ Mug', price: '$16.95' },
]

export default function StudioPage() {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [imageUrl, setImageUrl] = useState(null)
  const [publishing, setPublishing] = useState(null)
  const [published, setPublished] = useState([])
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])

  const generate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setError(null)
    setImageUrl(null)
    setPublished([])
    try {
      const res = await fetch('/api/generate-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() })
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setImageUrl(data.imageUrl)
      setHistory(prev => [{ prompt: prompt.trim(), imageUrl: data.imageUrl, title: data.title }, ...prev.slice(0, 9)])
    } catch (e) {
      setError('Generation failed: ' + e.message)
    } finally {
      setGenerating(false)
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

  const loadFromHistory = (item) => {
    setPrompt(item.prompt)
    setImageUrl(item.imageUrl)
    setPublished([])
    setError(null)
  }

  return (
    <div className="studio-page">
      <div className="studio-header">
        <h1>🎨 Design Studio</h1>
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
          {generating ? '⏳ Generating...' : '⚡ Generate'}
        </button>
      </div>

      {error && <div className="studio-error">{error}</div>}

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

      {history.length > 0 && (
        <div className="studio-history">
          <h3>Recent</h3>
          <div className="studio-history-grid">
            {history.map((item, i) => (
              <div key={i} className="studio-history-item" onClick={() => loadFromHistory(item)}>
                <img src={item.imageUrl} alt={item.prompt} />
                <span>{item.prompt}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
