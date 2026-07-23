import React, { useEffect, useState } from 'react'
import { services } from '../services'
import { IllustrationContainer } from '../components/common/IllustrationContainer'
import { StatusChip } from '../components/common/StatusChip'
import { CheckCircle2, Unlock, BookOpen, Star, LifeBuoy } from 'lucide-react'

const SUPPORT_EMAIL = 'mailto:support@cd-recruit.com'
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
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12"
      role="main"
      aria-labelledby="done-heading"
    >
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center space-y-3">
          {/* Assessment complete illustration with graceful fallback */}
          <IllustrationContainer
            src="/src/assets/illustrations/assessment-complete.svg"
            alt="Assessment Complete Illustration"
            fallbackIcon={CheckCircle2}
            aspectRatio="aspect-[16/9]"
            className="max-w-xs mx-auto mb-4"
          />

          <h1 id="done-heading" className="text-2xl font-bold text-[var(--text-primary)]">
            {auto ? 'Assessment Submitted' : 'Assessment Complete'}
          </h1>
          <p className="text-[var(--text-secondary)] text-xs leading-relaxed">
            {auto
              ? 'Time limit reached — your last-saved answers were submitted automatically.'
              : 'Your responses have been successfully recorded.'
            }
          </p>
        </div>

        {/* Reference ID card */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 shadow-[var(--shadow-sm)] space-y-2">
          <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Session Reference ID
          </div>
          <div
            className="text-xl font-mono font-bold text-[var(--accent)] tracking-wider"
            aria-label={`Session reference ID: ${referenceId}`}
          >
            {referenceId}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Save this reference ID for your records in case you need to contact support.
          </p>
        </div>

        {/* Camera release confirmation */}
        <div className="bg-[var(--success-subtle)] rounded-2xl border border-[var(--success)]/30 p-4">
          <div className="flex items-start gap-3">
            <Unlock size={20} className="text-[var(--success)] shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)] mb-0.5">
                Camera &amp; Microphone Access Released
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Your hardware access has been fully terminated. All session processing is complete.
              </div>
            </div>
          </div>
        </div>

        {/* What happens next */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 shadow-[var(--shadow-sm)] space-y-4">
          <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">What Happens Next</h2>
          <ol className="space-y-3 text-xs text-[var(--text-secondary)]">
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">1</span>
              <span>Your responses will be evaluated by the recruiting team within <strong className="text-[var(--text-primary)]">3–5 business days</strong>.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">2</span>
              <span>You will receive an automated notification at your registered email address with review results.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">3</span>
              <span>If you do not receive an update within 7 days, reach out with your reference ID above.</span>
            </li>
          </ol>
        </div>

        {/* Learning Hub with R-04 fix */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 shadow-[var(--shadow-sm)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen size={16} className="text-[var(--accent)]" />
              <span>Learning Hub</span>
            </div>
            <StatusChip variant="neutral" label="COMING SOON" size="sm" />
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Resource guides related to today's assessment topics will be published here:
          </p>
          <ul className="space-y-2 text-xs">
            {LEARNING_HUB_LINKS.map(link => (
              <li key={link.href} className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] flex items-center justify-between">
                <span className="text-[var(--text-primary)] font-medium">{link.label}</span>
                <span className="text-[10px] text-[var(--text-secondary)] font-mono">Preview</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Micro-survey */}
        {!surveySent ? (
          <form onSubmit={handleSurveySubmit} className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 shadow-[var(--shadow-sm)] space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
              <Star size={16} className="text-[var(--warning)]" />
              <span>Feedback (Optional)</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              How was your candidate assessment experience?
            </p>

            <div className="flex gap-2" role="group" aria-label="Experience rating">
              {EXPERIENCE_RATINGS.map(rating => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setSurveyRating(rating)}
                  className={`
                    w-10 h-10 rounded-xl border text-xs font-bold transition-all cursor-pointer
                    ${surveyRating === rating
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[var(--shadow-sm)]'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
                    }
                  `}
                >
                  {rating}
                </button>
              ))}
            </div>

            <textarea
              value={surveyComment}
              onChange={e => setSurveyComment(e.target.value)}
              placeholder="Any additional feedback on the interface or process…"
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-y"
            />

            <button
              type="submit"
              disabled={!surveyRating}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shadow-[var(--shadow-sm)]"
            >
              Submit Candidate Feedback
            </button>
          </form>
        ) : (
          <div className="bg-[var(--success-subtle)] border border-[var(--success)]/30 p-4 rounded-2xl text-center text-xs font-semibold text-[var(--success)]">
            Thank you for sharing your feedback!
          </div>
        )}

        <div className="text-center pt-2">
          <a
            href={SUPPORT_EMAIL}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline font-medium"
          >
            <LifeBuoy size={14} />
            <span>Contact Support</span>
          </a>
        </div>
      </div>
    </div>
  )
}
