import React from 'react'
import { Clock, Lock, LifeBuoy } from 'lucide-react'

const SUPPORT_EMAIL = 'mailto:support@cd-recruit.com'

interface ExpiredScreenProps {
  reason: 'never-started' | 'drive-closed'
}

export function ExpiredScreen({ reason }: ExpiredScreenProps) {
  const isDriveClosed = reason === 'drive-closed'

  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12"
      role="main"
      aria-labelledby="expired-heading"
    >
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[var(--warning-subtle)] text-[var(--warning)] border border-[var(--warning)]/20 flex items-center justify-center mx-auto shadow-[var(--shadow-sm)]">
          {isDriveClosed ? <Lock size={32} /> : <Clock size={32} />}
        </div>

        <div>
          <h1 id="expired-heading" className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            {isDriveClosed
              ? 'Assessment Window Closed'
              : 'Assessment Link Expired'
            }
          </h1>

          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {isDriveClosed
              ? "The assessment drive has been closed by the recruiter. The submission window is closed for all candidates."
              : "The scheduled assessment window for this invite link has expired."
            }
          </p>
        </div>

        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 text-left shadow-[var(--shadow-sm)] space-y-3">
          <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Recommended Next Steps</h2>
          <ul className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
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
            className="px-6 py-3 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity inline-flex items-center gap-2 cursor-pointer shadow-[var(--shadow-sm)]"
          >
            <LifeBuoy size={14} />
            <span>Contact Support</span>
          </a>

          <p className="text-[11px] text-[var(--text-secondary)] font-mono">support@cd-recruit.com</p>
        </div>
      </div>
    </div>
  )
}

