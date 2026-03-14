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
  const totalPnl = unrealizedTotal + pnl.realized
  const startingValue = 500.15 // known starting equity

  return (
    <div className="port-page">

      {/* ── Hero stats ── */}
      <div className="port-hero">
        <div className="port-hero-main">
          <span className="port-hero-label">Total Equity</span>
          <span className="port-hero-value">${fmt(account.equity)}</span>
          <span className={`port-hero-delta ${pctColor(account.equity - startingValue)}`}>
            {sign(account.equity - startingValue)}${fmt(account.equity - startingValue)} since start
          </span>
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
            <span className="port-stat-label">Win Rate</span>
            <span className="port-stat-value">
              {pnl.winRate !== null ? `${pnl.winRate}%` : '—'}
              {pnl.wins + pnl.losses > 0 && (
                <span className="port-stat-sub"> ({pnl.wins}W / {pnl.losses}L)</span>
              )}
            </span>
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
              ))}
          </div>
        )}
      </div>

      {/* ── Recent Trade Log ── */}
      <div className="port-section">
        <h2 className="port-section-title">Recent Trades</h2>
        {data.recentTrades.length === 0 ? (
          <div className="port-empty">No trades yet</div>
        ) : (
          <div className="port-trades">
            {data.recentTrades.map((t, i) => (
              <div key={i} className={`port-trade port-trade-${t.action}`}>
                <span className={`port-trade-action ${t.action === 'buy' ? 'buy' : 'sell'}`}>
                  {t.action.toUpperCase()}
                </span>
                <span className="port-trade-symbol">{t.symbol}</span>
                <span className="port-trade-mode">[{t.mode}]</span>
                {t.action === 'buy' ? (
                  <>
                    <span className="port-trade-detail">${fmt(t.notional)} @ score {fmt(t.signals?.composite, 3)}</span>
                  </>
                ) : (
                  <>
                    <span className={`port-trade-detail ${pctColor(t.pnl_pct)}`}>
                      {sign(t.pnl_pct)}{fmt(t.pnl_pct)}% (${sign(t.pnl_usd)}{fmt(t.pnl_usd)})
                    </span>
                    <span className="port-trade-reason">{t.exit_reason}</span>
                  </>
                )}
                <span className="port-trade-time">
                  {t.logged_at ? new Date(t.logged_at).toLocaleDateString() : ''}
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
