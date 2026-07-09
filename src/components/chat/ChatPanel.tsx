import { FormEvent, useEffect, useRef, useState } from 'react'
import { useChat } from '../../context/ChatContext'

const SUGGESTIONS = [
  'Give me a summary',
  'What are the most common issues?',
  "What's stuck in review?",
  'Suggest data for V826-4102',
  'What launches this month?',
]

export function ChatPanel() {
  const { messages, busy, providerLabel, send, confirmCard, dismissCard, clear } = useChat()
  const [draft, setDraft] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, collapsed])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!draft.trim() || busy) return
    void send(draft)
    setDraft('')
  }

  if (collapsed) {
    return (
      <aside className="chat collapsed" aria-label="Product enrichment assistant">
        <button
          className="chat-expand"
          onClick={() => setCollapsed(false)}
          title="Show assistant"
          aria-label="Show assistant"
        >
          «<span className="chat-expand-label">Assistant</span>
        </button>
      </aside>
    )
  }

  return (
    <aside className="chat" aria-label="Product enrichment assistant">
      <div className="chat-head">
        <div>
          <div className="title">Enrichment Assistant</div>
          <div className="mode">{providerLabel}</div>
        </div>
        <div className="chat-head-actions">
          <button
            className="btn small"
            onClick={clear}
            disabled={busy}
            title="Start a new conversation"
          >
            New chat
          </button>
          <button
            className="btn small"
            onClick={() => setCollapsed(true)}
            title="Hide assistant"
            aria-label="Hide assistant"
          >
            »
          </button>
        </div>
      </div>

      <div className="chat-body" ref={bodyRef}>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="who">{m.role === 'user' ? 'You' : 'Assistant'}</div>
            <div className="bubble" style={m.error ? { borderColor: 'var(--status-critical)' } : undefined}>
              {m.content || (m.streaming ? '…' : '')}
            </div>
            {m.cards.map((c) => (
              <ActionCardRow
                key={c.id}
                messageId={m.id}
                cardId={c.id}
                confirm={confirmCard}
                dismiss={dismissCard}
                card={c}
              />
            ))}
            {m.streaming && m.content ? <div className="typing">Responding…</div> : null}
          </div>
        ))}
        {busy && !messages.some((m) => m.streaming && m.content) ? (
          <div className="typing">Working…</div>
        ) : null}
      </div>

      <div className="chat-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => void send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <textarea
          value={draft}
          placeholder="Ask about styles, issues, lifecycle…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button className="btn primary" type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </aside>
  )
}

import { ActionCard } from '../../models/chat'
import { ActionCardView } from './ActionCardView'

function ActionCardRow({
  card,
  messageId,
  cardId,
  confirm,
  dismiss,
}: {
  card: ActionCard
  messageId: string
  cardId: string
  confirm: (m: string, c: string) => Promise<void>
  dismiss: (m: string, c: string) => void
}) {
  return (
    <ActionCardView
      card={card}
      onConfirm={() => void confirm(messageId, cardId)}
      onDismiss={() => dismiss(messageId, cardId)}
    />
  )
}
