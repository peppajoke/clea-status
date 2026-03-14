import { useState, useEffect } from 'react'
import './PortfolioPage.css'

function fmt(n, decimals = 2) {
  return typeof n === 'number' ? n.toFixed(decimals) : '—'
}

function sign(n) {
  return n >= 0 ? '+' : ''
}

function pctColor(n) {
  if (n > 0) return 'positive'
  if (n < 0) return 'negative'
  return 'neutral'
}

export default function PortfolioPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = () => {
    setLoading(true)
    fetch('/api/portfolio', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(d)
        setLastUpdated(new Date())
        setError(null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !data) return <div className="port-loading">Loading portfolio…</div>
  if (error) return <div className="port-error">Error: {error}</div>

  const { account, positions, pnl } = data

  const unrealizedTotal = positions.reduce((s, p) => s + p.unrealizedPl, 0)
  const unrealizedPct = positions.reduce((s, p) => s + (p.unrealizedPlPc || 0), 0) / Math.max(positions.length, 1)

  return (
    <div className="port-page">

      {/* ── Hero stats ── */}
      <div className="port-hero">
        <div className="port-hero-main">
          <span className="port-hero-label">Portfolio Value</span>
          <span className="port-hero-value">${fmt(account.equity)}</span>
          {positions.length > 0 ? (
            <span className={`port-hero-delta ${pctColor(unrealizedTotal)}`}>
              {sign(unrealizedTotal)}${fmt(Math.abs(unrealizedTotal))} unrealized · {positions.length} position{positions.length !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="port-hero-delta neutral">No open positions</span>
          )}
        </div>

        <div className="port-stats-row">
          <div className="port-stat">
            <span className="port-stat-label">Cash</span>
            <span className="port-stat-value">${fmt(account.cash)}</span>
          </div>
          <div className="port-stat">
            <span className="port-stat-label">Invested</span>
            <span className="port-stat-value">${fmt(account.longMarketValue)}</span>
          </div>
          <div className="port-stat">
            <span className={`port-stat-label`}>Unrealized P&L</span>
            <span className={`port-stat-value ${pctColor(unrealizedTotal)}`}>
              {sign(unrealizedTotal)}${fmt(unrealizedTotal)}
            </span>
          </div>
          <div className="port-stat">
            <span className="port-stat-label">Realized P&L</span>
            <span className={`port-stat-value ${pctColor(pnl.realized)}`}>
              {sign(pnl.realized)}${fmt(pnl.realized)}
            </span>
          </div>
          <div className="port-stat">
            <span className="port-stat-label">Total P&L</span>
            <span className={`port-stat-value ${pctColor(totalPnl)}`}>
              {sign(totalPnl)}${fmt(totalPnl)}
            </span>
          </div>
          <div className="port-stat">
            <span className="port-stat-label">Orders Filled</span>
            <span className="port-stat-value">{pnl.totalFilled ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* ── Open Positions ── */}
      <div className="port-section">
        <h2 className="port-section-title">Open Positions ({positions.length})</h2>
        {positions.length === 0 ? (
          <div className="port-empty">No open positions</div>
        ) : (
          <div className="port-positions">
            {positions
              .sort((a, b) => b.marketValue - a.marketValue)
              .map(p => (
                <div key={p.symbol} className="port-position">
                  <div className="port-pos-row">
                    <div className="port-pos-left">
                      <span className="port-pos-symbol">{p.symbol}</span>
                      <span className="port-pos-qty">{p.qty} shares</span>
                    </div>
                    <div className="port-pos-mid">
                      <span className="port-pos-price">
                        <span className="port-pos-price-label">entry </span>
                        ${fmt(p.entryPrice)}
                      </span>
                      <span className="port-pos-arrow">→</span>
                      <span className="port-pos-price">
                        <span className="port-pos-price-label">now </span>
                        ${fmt(p.currentPrice)}
                      </span>
                    </div>
                    <div className="port-pos-right">
                      <span className={`port-pos-pnl ${pctColor(p.unrealizedPl)}`}>
                        {sign(p.unrealizedPl)}${fmt(p.unrealizedPl)}
                      </span>
                      <span className={`port-pos-pct ${pctColor(p.unrealizedPlPct)}`}>
                        {sign(p.unrealizedPlPct)}{fmt(p.unrealizedPlPct)}%
                      </span>
                    </div>
                  </div>
                  <div className="port-pos-details">
                    <div className="port-pos-detail-item">
                      <span className="port-pos-detail-label">Cost Basis</span>
                      <span className="port-pos-detail-value">${fmt(p.qty * p.entryPrice)}</span>
                    </div>
                    <div className="port-pos-detail-item">
                      <span className="port-pos-detail-label">Current Value</span>
                      <span className="port-pos-detail-value">${fmt(p.marketValue)}</span>
                    </div>
                    <div className="port-pos-detail-item">
                      <span className="port-pos-detail-label">Delta</span>
                      <span className={`port-pos-detail-value ${pctColor(p.unrealizedPl)}`}>
                        {sign(p.unrealizedPl)}${fmt(p.unrealizedPl)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ── Recent Trade Log ── */}
      <div className="port-section">
        <h2 className="port-section-title">Recent Trades</h2>
        {data.recentTrades.length === 0 ? (
          <div className="port-empty">No filled orders yet</div>
        ) : (
          <div className="port-trades">
            {data.recentTrades.map((t, i) => (
              <div key={i} className={`port-trade port-trade-${t.action}`}>
                <span className={`port-trade-action ${t.action === 'buy' ? 'buy' : 'sell'}`}>
                  {t.action.toUpperCase()}
                </span>
                <span className="port-trade-symbol">{t.symbol}</span>
                <span className="port-trade-detail">
                  {t.qty} @ ${fmt(t.price)} = ${fmt(t.notional)}
                </span>
                <span className="port-trade-time">
                  {t.filledAt ? new Date(t.filledAt).toLocaleString() : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="port-footer">
        {lastUpdated && `Updated ${lastUpdated.toLocaleTimeString()} · refreshes every 30s`}
        <button className="port-refresh" onClick={load}>↻</button>
      </div>
    </div>
  )
}
