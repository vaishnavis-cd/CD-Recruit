import React from 'react'
import { Clock, Lock, LifeBuoy } from 'lucide-react'

const SUPPORT_EMAIL = 'mailto:support@proctora.com'

interface ExpiredScreenProps {
  reason: 'never-started' | 'drive-closed' | 'already-submitted' | 'grace-expired'
}

export function ExpiredScreen({ reason }: ExpiredScreenProps) {
  const isDriveClosed = reason === 'drive-closed'
  const isAlreadySubmitted = reason === 'already-submitted'
  const isGraceExpired = reason === 'grace-expired'

  const title = isAlreadySubmitted
    ? 'Assessment Completed'
    : isDriveClosed
    ? 'Assessment Window Closed'
    : isGraceExpired
    ? 'Grace Window Expired'
    : 'Assessment Link Expired'

  const description = isAlreadySubmitted
    ? 'You have already completed and submitted this assessment. This invite link can no longer be re-accessed.'
    : isDriveClosed
    ? 'The assessment drive has been closed by the recruiter. The submission window is closed for all candidates.'
    : isGraceExpired
    ? 'The 20-minute grace window for joining this scheduled assessment drive has passed.'
    : 'The scheduled assessment window for this invite link has expired.'

  return (
    <div
      className="min-h-screen px-6 py-12 flex items-center justify-center"
      role="main"
      aria-labelledby="expired-heading"
    >
      <div className="w-full max-w-md text-center space-y-6 animate-cd-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-[var(--surface)] text-[var(--warning)] border border-[var(--border)] flex items-center justify-center mx-auto shadow-xs">
          {isDriveClosed || isAlreadySubmitted ? <Lock size={28} /> : <Clock size={28} />}
        </div>

        <div>
          <h1 id="expired-heading" className="text-3xl-plus font-semibold tracking-tight text-[var(--foreground)] mb-2">
            {title}
          </h1>

          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            {description}
          </p>
        </div>

        <div className="card-base p-6 text-left space-y-3">
          <h2 className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider">Recommended Next Steps</h2>
          <ul className="space-y-2 text-xs text-[var(--muted-foreground)] leading-relaxed">
            {isDriveClosed ? (
              <>
                <li>• The recruiting team will review existing sessions and provide status updates by email.</li>
                <li>• For urgent inquiries, contact the recruiting support address below.</li>
              </>
            ) : (
              <>
                <li>• If you experienced technical difficulties, report the issue to support with details.</li>
                <li>• Include your invite link and timestamp in your support request.</li>
                <li>• Recruiters can issue a new link or extension if approved.</li>
              </>
            )}
          </ul>
        </div>

        <div className="pt-2 flex flex-col items-center gap-2">
          <a
            href={SUPPORT_EMAIL}
            className="btn-primary inline-flex items-center gap-2 text-xs cursor-pointer"
          >
            <LifeBuoy size={14} />
            <span>Contact Support</span>
          </a>

          <p className="text-xs-plus text-[var(--muted-foreground)] font-mono-data">support@proctora.com</p>
        </div>
      </div>
    </div>
  )
}

