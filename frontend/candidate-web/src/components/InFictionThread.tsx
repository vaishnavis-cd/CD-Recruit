import React from 'react'
import { InboxMessage, CHANNEL_LABELS } from './InFictionMessageItem'

export interface ReplyDraft {
  messageId: number
  text: string
}

interface InFictionThreadProps {
  selectedMsg: InboxMessage | undefined
  replies: Record<number, string>
  draft: ReplyDraft | null
  sending: boolean
  onDraftChange: (draft: ReplyDraft) => void
  onSendReply: () => void
}

export function InFictionThread({
  selectedMsg,
  replies,
  draft,
  sending,
  onDraftChange,
  onSendReply,
}: InFictionThreadProps) {
  if (!selectedMsg) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-secondary)]">
        Select a message to read
      </div>
    )
  }

  const ch = CHANNEL_LABELS[selectedMsg.channel]

  return (
    <>
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium ${ch.color}`}>
            {ch.icon} {ch.label}
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
            onChange={e => onDraftChange({ messageId: selectedMsg.id, text: e.target.value })}
            placeholder="Type your reply…"
            rows={3}
            disabled={sending}
            className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-secondary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] disabled:opacity-60 transition-colors"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={onSendReply}
              disabled={sending || !(draft?.text?.trim())}
              className="px-4 py-1.5 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
            >
              {sending ? 'Sending…' : 'Send Reply'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
