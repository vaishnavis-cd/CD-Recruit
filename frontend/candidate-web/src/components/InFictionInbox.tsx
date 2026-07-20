import React, { useEffect, useRef, useState } from 'react'
import type { ScenarioMessage, Channel } from '../fixtures/scenarios'
import { services } from '../services'

interface InboxMessage extends ScenarioMessage {
  read: boolean
}

interface ReplyDraft {
  messageId: number
  text: string
}

interface InFictionInboxProps {
  sessionId: string
  scenarioId: string
}

const CHANNEL_LABELS: Record<Channel, { label: string; icon: string; color: string }> = {
  email:  { label: 'Email',  icon: '✉',  color: 'text-blue-500' },
  slack:  { label: 'Slack',  icon: '#',  color: 'text-purple-500' },
  ticket: { label: 'Ticket', icon: '🎫', color: 'text-amber-500' },
}

export function InFictionInbox({ sessionId, scenarioId }: InFictionInboxProps) {
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [replies, setReplies] = useState<Record<number, string>>({}) // messageId -> sent reply text
  const [draft, setDraft] = useState<ReplyDraft | null>(null)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const unsub = services.scenario.subscribe(sessionId, scenarioId, (msg) => {
      setMessages(prev => {
        const already = prev.find(m => m.id === msg.id)
        if (already) return prev
        return [...prev, { ...msg, read: false }]
      })
      setUnreadCount(c => c + 1)
    })
    return unsub
  }, [sessionId, scenarioId])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  function handleSelectMessage(id: number) {
    setSelected(id)
    setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m))
    setUnreadCount(prev => {
      const msg = messages.find(m => m.id === id)
      return msg && !msg.read ? Math.max(0, prev - 1) : prev
    })
    // Open reply draft if message expects one and not yet replied
    const msg = messages.find(m => m.id === id)
    if (msg?.expectsReply && !replies[id]) {
      setDraft({ messageId: id, text: '' })
    }
  }

  async function handleSendReply() {
    if (!draft || !draft.text.trim()) return
    setSending(true)
    await services.scenario.sendReply(draft.messageId, draft.text)
    setReplies(prev => ({ ...prev, [draft.messageId]: draft.text }))
    setDraft(null)
    setSending(false)
  }

  const selectedMsg = messages.find(m => m.id === selected)
  const unread = messages.filter(m => !m.read)

  return (
    <div className="flex h-full border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg)]">
      {/* Message list */}
      <div
        className="w-72 flex-shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--surface)]"
        role="navigation"
        aria-label="Message list"
      >
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Inbox</span>
          {unreadCount > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-[var(--accent)] text-white"
              aria-label={`${unreadCount} unread message${unreadCount !== 1 ? 's' : ''}`}
            >
              {unreadCount}
            </span>
          )}
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto divide-y divide-[var(--border)]"
          role="list"
          aria-label="Messages"
        >
          {messages.length === 0 && (
            <div className="px-4 py-8 text-sm text-center text-[var(--text-secondary)]">
              Waiting for messages…
            </div>
          )}
          {messages.map(msg => {
            const ch = CHANNEL_LABELS[msg.channel]
            const isSelected = selected === msg.id
            return (
              <button
                key={msg.id}
                role="listitem"
                onClick={() => handleSelectMessage(msg.id)}
                aria-selected={isSelected}
                aria-label={`${msg.from}: ${msg.subject ?? msg.body.slice(0, 60)} — ${msg.read ? 'read' : 'unread'}`}
                className={`
                  w-full text-left px-4 py-3 transition-colors
                  ${isSelected ? 'bg-[var(--accent)]/10 border-l-2 border-[var(--accent)]' : 'hover:bg-[var(--bg)]'}
                  focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent)]
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium ${ch.color}`} aria-hidden>{ch.icon} {ch.label}</span>
                  {!msg.read && (
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0" aria-hidden />
                  )}
                </div>
                <div className={`text-xs truncate ${msg.read ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)] font-medium'}`}>
                  {msg.from}
                </div>
                {msg.subject && (
                  <div className={`text-xs truncate mt-0.5 ${msg.read ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
                    {msg.subject}
                  </div>
                )}
                <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5 leading-snug">
                  {msg.body.slice(0, 80)}{msg.body.length > 80 ? '…' : ''}
                </div>
                {replies[msg.id] && (
                  <div className="text-xs text-[var(--success)] mt-1">✓ Replied</div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Message detail + reply */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedMsg ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-secondary)]">
            Select a message to read
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium ${CHANNEL_LABELS[selectedMsg.channel].color}`}>
                  {CHANNEL_LABELS[selectedMsg.channel].icon} {CHANNEL_LABELS[selectedMsg.channel].label}
                </span>
              </div>
              {selectedMsg.subject && (
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">{selectedMsg.subject}</h3>
              )}
              <div className="text-sm text-[var(--text-secondary)]">From: {selectedMsg.from}</div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                {selectedMsg.body}
              </div>

              {/* Sent reply */}
              {replies[selectedMsg.id] && (
                <div className="mt-6 pl-4 border-l-2 border-[var(--success)]">
                  <div className="text-xs text-[var(--success)] font-medium mb-1">Your reply</div>
                  <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                    {replies[selectedMsg.id]}
                  </div>
                </div>
              )}
            </div>

            {/* Reply input */}
            {selectedMsg.expectsReply && !replies[selectedMsg.id] && (
              <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--surface)]">
                <label htmlFor="reply-text" className="sr-only">
                  Your reply to {selectedMsg.from}
                </label>
                <textarea
                  id="reply-text"
                  value={draft?.messageId === selectedMsg.id ? draft.text : ''}
                  onChange={e => setDraft({ messageId: selectedMsg.id, text: e.target.value })}
                  placeholder="Type your reply…"
                  rows={3}
                  disabled={sending}
                  className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-secondary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] disabled:opacity-60 transition-colors"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !(draft?.text?.trim())}
                    className="px-4 py-1.5 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
                  >
                    {sending ? 'Sending…' : 'Send Reply'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
