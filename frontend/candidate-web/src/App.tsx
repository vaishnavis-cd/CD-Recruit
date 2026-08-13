import React from 'react'
import { BrowserRouter, Routes, Route, useParams, useSearchParams } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeProvider'
import { SessionRouter } from './routes/SessionRouter'
import { LandingPage } from './routes/LandingPage'

import { ShieldAlert } from 'lucide-react'

function TokenRouteHandler() {
  const { token: pathToken } = useParams<{ token?: string }>()
  const [searchParams] = useSearchParams()
  const queryToken = searchParams.get('token')

  let actualToken = pathToken || queryToken || ''

  // In development / local testing, default to 'demo' token if no token was supplied in URL
  if (!actualToken && (import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    actualToken = 'demo'
  }

  if (!actualToken) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-[var(--surface)] border border-[var(--border)] p-8 rounded-2xl space-y-5 shadow-[var(--shadow-lg)]">
          <div className="w-12 h-12 rounded-full bg-[var(--critical-subtle)] text-[var(--critical)] flex items-center justify-center mx-auto border border-[var(--critical)]/20">
            <ShieldAlert size={24} />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Invalid or Missing Candidate Link</h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            No assessment invite token was found in your link. Please make sure you clicked the full assessment invitation link provided in your invitation email.
          </p>
          <div className="pt-2">
            <a
              href="/invite/demo"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shadow-sm"
            >
              Start Demo Candidate Assessment
            </a>
          </div>
        </div>
      </div>
    )
  }

  return <SessionRouter token={actualToken} />
}

/** Root route: show landing page if no token in URL, else hand off to TokenRouteHandler */
function RootHandler() {
  const [searchParams] = useSearchParams()
  const queryToken = searchParams.get('token')
  if (queryToken) return <TokenRouteHandler />
  return <LandingPage />
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/invite/:token" element={<TokenRouteHandler />} />
          <Route path="/invite" element={<TokenRouteHandler />} />
          <Route path="/start/:token" element={<TokenRouteHandler />} />
          <Route path="/start" element={<TokenRouteHandler />} />
          <Route path="/" element={<RootHandler />} />
          <Route path="*" element={<TokenRouteHandler />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

