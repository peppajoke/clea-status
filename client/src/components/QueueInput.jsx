import { useState } from 'react'
import './QueueInput.css'

export default function QueueInput({ onSubmit }) {
  const [text, setText] = useState('')
  const [startDate, setStartDate] = useState('')
  const [expanded, setExpanded] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onSubmit(text.trim(), startDate || null)
    setText('')
    setStartDate('')
    setExpanded(false)
  }

  return (
    <form className="queue-input" onSubmit={handleSubmit}>
      <div className="queue-input-row">
        <input
          className="queue-text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Queue a task..."
        />
        {expanded && (
          <input
            className="queue-date"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        )}
        <button type="button" className="queue-expand" onClick={() => setExpanded(!expanded)} title="Options">
          ⚙
        </button>
        <button type="submit" className="queue-submit" disabled={!text.trim()}>
          Add
        </button>
      </div>
    </form>
  )
}
