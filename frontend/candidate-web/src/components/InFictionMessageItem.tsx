import React from 'react'
import type { ScenarioMessage, Channel } from '../fixtures/scenarios'

export interface InboxMessage extends ScenarioMessage {
  read: boolean
}

export const CHANNEL_LABELS: Record<Channel, { label: string; icon: string; color: string }> = {
  email:  { label: 'Email',  icon: '✉',  color: 'text-blue-500' },
  slack:  { label: 'Slack',  icon: '#',  color: 'text-purple-500' },
  ticket: { label: 'Ticket', icon: '🎫', color: 'text-amber-500' },
}

interface InFictionMessageItemProps {
  msg: InboxMessage
  isSelected: boolean
  hasReplied: boolean
  onSelect: (id: number) => void
}

export function InFictionMessageItem({
  msg,
  isSelected,
  hasReplied,
  onSelect,
}: InFictionMessageItemProps) {
  const ch = CHANNEL_LABELS[msg.channel]
  return (
    <button
      role="listitem"
      onClick={() => onSelect(msg.id)}
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
      {hasReplied && (
        <div className="text-xs text-[var(--success)] mt-1">✓ Replied</div>
      )}
    </button>
  )
}
