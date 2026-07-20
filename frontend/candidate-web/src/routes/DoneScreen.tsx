import React, { useEffect, useState } from 'react'
import { services } from '../services'

const SUPPORT_LINK = 'mailto:support@cd-recruit.example.com'
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

  // Release camera/mic on unmount
  useEffect(() => {
    services.cv.stop()
  }, [])

  async function handleSurveySubmit(e: React.FormEvent) {
    e.preventDefault()
    // Mock: just mark as sent
    await new Promise(resolve => setTimeout(resolve, 300))
    setSurveySent(true)
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12"
      role="main"
      aria-labelledby="done-heading"
    >
      <div className="max-w-lg w-full">
        <div className="text-center mb-10">
          <div className="text-6xl mb-4" aria-hidden>✓</div>
          <h1 id="done-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-3">
            {auto ? 'Assessment submitted' : 'Assessment complete'}
          </h1>
          <p className="text-[var(--text-secondary)] text-sm">
            {auto
              ? 'Your time ran out and your last-saved answers were submitted automatically.'
              : 'Your assessment has been submitted successfully.'
            }
          </p>
        </div>

        {/* Reference ID */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-6">
          <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-1">
            Session reference
          </div>
          <div
            className="text-lg font-mono font-bold text-[var(--text-primary)] tracking-wider"
            aria-label={`Session reference ID: ${referenceId}`}
          >
            {referenceId}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Save this for your records in case you need to contact support.
          </p>
        </div>

        {/* Camera release confirmation */}
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-[var(--success)] p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-[var(--success)] text-lg flex-shrink-0" aria-hidden>🔓</span>
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)] mb-0.5">
                Camera and microphone access released
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                Your camera and microphone have been released. The assessment is fully complete.
              </div>
            </div>
          </div>
        </div>

        {/* What happens next */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">What happens next</h2>
          <ol className="space-y-3 text-sm text-[var(--text-secondary)]">
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-xs flex items-center justify-center font-semibold flex-shrink-0 mt-0.5">1</span>
              <span>Your responses will be reviewed by the recruiting team. This typically takes <strong className="text-[var(--text-primary)]">3–5 business days</strong>.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-xs flex items-center justify-center font-semibold flex-shrink-0 mt-0.5">2</span>
              <span>You'll receive an email at the address on file with next steps — whether that's a follow-up interview or feedback.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-xs flex items-center justify-center font-semibold flex-shrink-0 mt-0.5">3</span>
              <span>If you don't hear back within 7 business days, feel free to follow up using your reference ID above.</span>
            </li>
          </ol>
        </div>

        {/* Learning Hub */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Learning Hub</h2>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            While you wait, explore resources related to today's topics:
          </p>
          <ul className="space-y-2">
            {LEARNING_HUB_LINKS.map(link => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm text-[var(--accent)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Optional experience micro-survey */}
        {!surveySent ? (
          <form onSubmit={handleSurveySubmit} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              Quick feedback <span className="text-[var(--text-secondary)] font-normal">(optional)</span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              How was your assessment experience? This helps us improve.
            </p>

            <fieldset className="mb-4">
              <legend className="sr-only">Rate your experience from 1 to 5</legend>
              <div className="flex gap-2" role="group" aria-label="Experience rating">
                {EXPERIENCE_RATINGS.map(rating => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => setSurveyRating(rating)}
                    aria-label={`Rate ${rating} out of 5`}
                    aria-pressed={surveyRating === rating}
                    className={`
                      w-10 h-10 rounded-lg border text-sm font-medium transition-colors
                      focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1
                      ${surveyRating === rating
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                      }
                    `}
                  >
                    {rating}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-1 px-1">
                <span>Not great</span>
                <span>Excellent</span>
              </div>
            </fieldset>

            <label htmlFor="survey-comment" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Anything you'd like to share?
            </label>
            <textarea
              id="survey-comment"
              value={surveyComment}
              onChange={e => setSurveyComment(e.target.value)}
              rows={2}
              placeholder="Optional comments…"
              className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-secondary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] transition-colors"
            />

            <button
              type="submit"
              disabled={surveyRating === null}
              className="mt-3 px-4 py-2 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
            >
              Submit feedback
            </button>
          </form>
        ) : (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-[var(--success)] p-4 mb-6 text-sm text-[var(--success)] font-medium">
            ✓ Thanks for your feedback!
          </div>
        )}

        <div className="text-center text-sm text-[var(--text-secondary)]">
          Questions? <a href={SUPPORT_LINK} className="text-[var(--accent)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded">Contact support</a>
        </div>
      </div>
    </div>
  )
}
