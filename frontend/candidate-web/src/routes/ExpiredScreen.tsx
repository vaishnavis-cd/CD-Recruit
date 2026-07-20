import React from 'react'

const SUPPORT_LINK = 'mailto:support@cd-recruit.example.com'

interface ExpiredScreenProps {
  reason: 'never-started' | 'drive-closed'
}

export function ExpiredScreen({ reason }: ExpiredScreenProps) {
  const isDriveClosed = reason === 'drive-closed'

  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4"
      role="main"
      aria-labelledby="expired-heading"
    >
      <div className="max-w-lg w-full text-center">
        <div className="text-6xl mb-6 opacity-60" aria-hidden>
          {isDriveClosed ? '🔒' : '⏱'}
        </div>

        <h1 id="expired-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-3">
          {isDriveClosed
            ? 'This assessment window has closed'
            : 'This link has expired'
          }
        </h1>

        <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">
          {isDriveClosed
            ? "The assessment drive has been closed by the organiser. This isn't related to your timing — the window closed for all candidates."
            : "The assessment window has passed. If you believe this is an error or had a technical issue, please reach out to support."
          }
        </p>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-8 text-left">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">What to do next</h2>
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            {isDriveClosed ? (
              <>
                <li>• The recruiting team has been notified and will reach out with next steps.</li>
                <li>• If you have urgent questions, contact the support address below.</li>
              </>
            ) : (
              <>
                <li>• If you experienced a technical issue (connection drop, browser crash), contact support with details.</li>
                <li>• Include your invite link and the approximate time of the issue in your message.</li>
                <li>• The recruiting team can issue a new invite window if appropriate.</li>
              </>
            )}
          </ul>
        </div>

        <a
          href={SUPPORT_LINK}
          className="inline-block px-6 py-3 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 mb-4"
        >
          Contact Support
        </a>

        <p className="text-xs text-[var(--text-secondary)]">support@cd-recruit.example.com</p>
      </div>
    </div>
  )
}
