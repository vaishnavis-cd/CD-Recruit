import React, { useEffect, useRef, useState } from 'react'
import { services } from '../services'
import { InFictionMessageItem, InboxMessage } from './InFictionMessageItem'
import { InFictionThread, ReplyDraft } from './InFictionThread'
import { Inbox, Loader2 } from 'lucide-react'
import apiClient from '@/api/client'

interface InFictionInboxProps {
  sessionId: string
  scenarioId: string
}

export function InFictionInbox({ sessionId, scenarioId }: InFictionInboxProps) {
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [replies, setReplies] = useState<Record<number, string>>({})
  const [draft, setDraft] = useState<ReplyDraft | null>(null)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  // Fetch persistent inbox messages from backend on mount and sync state
  const loadBackendInbox = async () => {
    try {
      const res = await apiClient.get(`/sessions/${sessionId}/simulation/inbox`)
      if (Array.isArray(res.data) && res.data.length > 0) {
        const replyMap: Record<number, string> = {}
        const backendMsgs: InboxMessage[] = res.data.map((m: any) => {
          const numId = typeof m.id === 'string' ? Math.abs(m.id.split('-').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)) : (Number(m.id) || 1)
          if (m.replyText) {
            replyMap[numId] = m.replyText
          }
          return {
            id: numId,
            atSeconds: 0,
            channel: 'email',
            from: m.from || m.role || 'Manager',
            subject: m.subject || 'Incident Notification',
            body: m.body || '',
            expectsReply: m.expectsReply ?? true,
            read: Boolean(m.read),
          }
        })

        setReplies(prev => ({ ...prev, ...replyMap }))
        setMessages(prev => {
          const mergedMap = new Map<number, InboxMessage>()
          // Put backend messages first
          backendMsgs.forEach(m => mergedMap.set(m.id, m))
          // Retain any live socket/subscribe messages
          prev.forEach(p => {
            if (!mergedMap.has(p.id)) {
              mergedMap.set(p.id, p)
            }
          })
          return Array.from(mergedMap.values())
        })

        const unread = backendMsgs.filter(m => !m.read && !m.replyText).length
        setUnreadCount(unread)

        // Auto-select first message if none selected
        if (backendMsgs.length > 0) {
          setSelected(prev => (prev === null ? backendMsgs[0].id : prev))
        }
      }
    } catch (err) {
      console.warn('[InFictionInbox] Error loading backend inbox:', err)
    }
  }

  useEffect(() => {
    loadBackendInbox()

    const unsub = services.scenario.subscribe(sessionId, scenarioId, (msg) => {
      setMessages(prev => {
        const already = prev.find(m => m.id === msg.id)
        if (already) return prev
        // Initial SAY Slack prompt is already viewed and replied to in Step 1 -> set read: true
        const isInitialSayOrSlack = msg.channel === 'slack' || msg.from?.includes('#') || msg.subject?.includes('QA Bug Report')
        return [...prev, { ...msg, read: isInitialSayOrSlack ? true : Boolean((msg as any).read) }]
      })
    })
    return unsub
  }, [sessionId, scenarioId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  async function handleSelectMessage(id: number) {
    setSelected(id)
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, read: true } : m)))
    setUnreadCount(prev => {
      const msg = messages.find(m => m.id === id)
      return msg && !msg.read ? Math.max(0, prev - 1) : prev
    })

    try {
      await apiClient.post(`/sessions/${sessionId}/simulation/inbox/read`)
    } catch (err) {
      console.warn('[InFictionInbox] Error posting read status:', err)
    }

    const msg = messages.find(m => m.id === id)
    if (msg?.expectsReply && !replies[id]) {
      setDraft({ messageId: id, text: '' })
    }
  }

  async function handleSendReply() {
    if (!draft || !draft.text.trim()) return
    setSending(true)
    try {
      await services.scenario.sendReply(draft.messageId, draft.text)
      await apiClient.post(`/sessions/${sessionId}/simulation/email-reply`, {
        replyText: draft.text,
      })
      await apiClient.post(`/sessions/${sessionId}/responses`, {
        questionId: scenarioId,
        moduleType: 'SIMULATION',
        responsePayload: {
          ticketReply: draft.text,
          emailReplyText: draft.text,
          status: 'EMAIL_REPLIED'
        }
      })
    } catch (err) {
      console.warn('[InFictionInbox] Error persisting email reply:', err)
    }
    setReplies(prev => ({ ...prev, [draft.messageId]: draft.text }))
    setDraft(null)
    setSending(false)
  }

  const selectedMsg = messages.find(m => m.id === selected)

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
            <div className="px-6 py-12 text-center text-[var(--text-secondary)] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center mx-auto text-[var(--accent)]">
                <Loader2 size={20} className="animate-spin" />
              </div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">Waiting for incoming messages…</div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Scenario events and team communications will arrive here dynamically.
              </p>
            </div>
          )}
          {messages.map(msg => (
            <InFictionMessageItem
              key={msg.id}
              msg={msg}
              isSelected={selected === msg.id}
              hasReplied={!!replies[msg.id]}
              onSelect={handleSelectMessage}
            />
          ))}
        </div>
      </div>

      {/* Message detail + reply */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <InFictionThread
          selectedMsg={selectedMsg}
          replies={replies}
          draft={draft}
          sending={sending}
          onDraftChange={setDraft}
          onSendReply={handleSendReply}
        />
      </div>
    </div>
  )
}
