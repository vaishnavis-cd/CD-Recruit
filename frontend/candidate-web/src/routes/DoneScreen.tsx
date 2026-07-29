import React, { useEffect, useState } from 'react'
import { services } from '../services'
import { IllustrationContainer } from '../components/common/IllustrationContainer'
import { StatusChip } from '../components/common/StatusChip'
import { CheckCircle2, Unlock, BookOpen, Star, LifeBuoy, Copy, Check } from 'lucide-react'

const SUPPORT_EMAIL = 'mailto:support@proctora.com'
const LEARNING_HUB_LINKS = [
  { label: 'Data Structures & Algorithms Refresher', href: '#learning-hub-dsa' },
  { label: 'SQL Fundamentals Guide', href: '#learning-hub-sql' },
  { label: 'System Design Concepts', href: '#learning-hub-system-design' },
  { label: 'Engineering Communication Skills', href: '#learning-hub-comms' },
]

interface DoneScreenProps {
  referenceId: string
  sessionId: string
  auto: boolean
}

const EXPERIENCE_RATINGS = [1, 2, 3, 4, 5] as const

export function DoneScreen({ referenceId, sessionId, auto }: DoneScreenProps) {
  const [surveyRating, setSurveyRating] = useState<number | null>(null)
  const [surveyComment, setSurveyComment] = useState('')
  const [surveySent, setSurveySent] = useState(false)
  const [copied, setCopied] = useState(false)

  function handleCopyRef() {
    navigator.clipboard.writeText(referenceId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  // Release camera/mic on mount
  useEffect(() => {
    services.cv.stop()
  }, [])

  async function handleSurveySubmit(e: React.FormEvent) {
    e.preventDefault()
    await new Promise(resolve => setTimeout(resolve, 300))
    setSurveySent(true)
  }

  return (
    <div
      className="min-h-screen px-6 py-14 flex justify-center"
      role="main"
      aria-labelledby="done-heading"
    >
      <div className="w-full max-w-4xl animate-cd-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-10 items-start">
          <div className="mx-auto md:mx-0 w-full">
            <IllustrationContainer
              src="/src/assets/assessment-complete.png"
              alt="Assessment Complete Illustration"
              fallbackIcon={CheckCircle2}
              aspectRatio="aspect-square"
              imgClassName="object-contain p-2 max-h-[220px] w-full"
              className="w-full card-base border-none bg-transparent shadow-none"
            />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-[var(--accent)]">
              All done
            </div>
            <h1 id="done-heading" className="text-[36px] font-semibold tracking-tight mt-1 text-[var(--foreground)]">
              {auto ? 'Assessment Submitted' : 'Thanks for completing your assessment'}
            </h1>
            <p className="mt-3 text-[15px] text-[var(--muted-foreground)]">
              {auto
                ? 'Time limit reached — your last-saved answers were submitted automatically.'
                : 'Your responses have been securely sent for review. Keep the reference below handy if you need to contact support.'
              }
            </p>

            <div className="mt-6 card-base p-5 inline-flex items-center gap-5">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--muted-foreground)]">
                  Reference ID
                </div>
                <div
                  className="font-mono-data text-[36px] font-bold leading-tight text-[var(--accent)]"
                  aria-label={`Session reference ID: ${referenceId}`}
                >
                  {referenceId}
                </div>
              </div>
              <button
                onClick={handleCopyRef}
                title={copied ? 'Copied!' : 'Copy reference ID'}
                aria-label={copied ? 'Copied' : 'Copy reference ID'}
                className={`
                  flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer
                  ${copied
                    ? 'bg-[var(--success-subtle)] border-[var(--success)] text-[var(--success)]'
                    : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                  }
                `}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="mt-4 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--muted-foreground)]">
              <Unlock size={13} className="text-[var(--success)]" /> Camera &amp; microphone access released
            </div>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card-base p-6">
            <div className="font-semibold mb-4 text-[var(--foreground)]">What happens next</div>
            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center font-mono-data text-xs font-semibold shrink-0 bg-[var(--surface)] text-[var(--accent)] border border-[var(--border)]">
                  1
                </span>
                <div>
                  <div className="text-sm font-medium text-[var(--foreground)]">Scoring &amp; review</div>
                  <div className="text-xs mt-0.5 text-[var(--muted-foreground)]">Our team reviews your submission within 3–5 business days.</div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center font-mono-data text-xs font-semibold shrink-0 bg-[var(--surface)] text-[var(--accent)] border border-[var(--border)]">
                  2
                </span>
                <div>
                  <div className="text-sm font-medium text-[var(--foreground)]">Recruiter follow-up</div>
                  <div className="text-xs mt-0.5 text-[var(--muted-foreground)]">You'll receive an email notification with review results.</div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center font-mono-data text-xs font-semibold shrink-0 bg-[var(--surface)] text-[var(--accent)] border border-[var(--border)]">
                  3
                </span>
                <div>
                  <div className="text-sm font-medium text-[var(--foreground)]">Support inquiry</div>
                  <div className="text-xs mt-0.5 text-[var(--muted-foreground)]">Reach out with your reference ID if you have questions.</div>
                </div>
              </li>
            </ol>
          </div>

          <div className="card-base p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-[var(--foreground)] flex items-center gap-2">
                <BookOpen size={16} className="text-[var(--accent)]" />
                <span>Learning hub</span>
              </div>
              <StatusChip tone="neutral" label="COMING SOON" size="sm" />
            </div>
            <div className="space-y-2">
              {LEARNING_HUB_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] transition-colors hover:border-[var(--foreground)]"
                >
                  <span className="text-sm text-[var(--foreground)]">{l.label}</span>
                  <span className="text-[10px] font-mono-data text-[var(--muted-foreground)]">Preview</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Micro-survey */}
        <div className="mt-6 card-base p-6">
          <div className="font-semibold text-[var(--foreground)]">How was your experience?</div>
          <p className="text-xs mt-1 text-[var(--muted-foreground)]">Optional candidate feedback</p>
          {!surveySent ? (
            <form onSubmit={handleSurveySubmit} className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                {EXPERIENCE_RATINGS.map((n) => {
                  const active = surveyRating !== null && n <= surveyRating;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSurveyRating(n)}
                      className={`
                        w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer
                        ${active ? 'bg-[var(--surface)] text-[var(--accent)] border border-[var(--accent)] font-bold' : 'bg-[var(--surface)] text-[var(--muted-foreground)] border border-[var(--border)]'}
                      `}
                    >
                      <Star size={18} fill={active ? 'currentColor' : 'none'} />
                    </button>
                  );
                })}
              </div>
              {surveyRating !== null && (
                <div className="space-y-3">
                  <textarea
                    value={surveyComment}
                    onChange={e => setSurveyComment(e.target.value)}
                    placeholder="Any additional feedback on the interface or process…"
                    rows={2}
                    className="w-full p-3 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-xs placeholder:text-[var(--muted-foreground)]"
                  />
                  <button type="submit" className="btn-primary text-xs cursor-pointer">
                    Submit Feedback
                  </button>
                </div>
              )}
            </form>
          ) : (
            <div className="mt-4 text-xs font-semibold text-[var(--success)]">
              Thank you for sharing your feedback!
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <a href={SUPPORT_EMAIL} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            <LifeBuoy size={14} /> Contact support
          </a>
        </div>
      </div>
    </div>
  )
}
