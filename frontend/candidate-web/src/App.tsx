import React from 'react'
import { BrowserRouter, Routes, Route, useParams, useSearchParams, Navigate } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeProvider'
import { SessionRouter } from './routes/SessionRouter'

import { ShieldAlert } from 'lucide-react'

function TokenRouteHandler() {
  const { token: pathToken } = useParams<{ token?: string }>()
  const [searchParams] = useSearchParams()
  const queryToken = searchParams.get('token')

  const actualToken = pathToken || queryToken || ''

  if (!actualToken) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-[var(--surface)] border border-[var(--border)] p-8 rounded-2xl space-y-4 shadow-[var(--shadow-lg)]">
          <div className="w-12 h-12 rounded-full bg-[var(--critical-subtle)] text-[var(--critical)] flex items-center justify-center mx-auto border border-[var(--critical)]/20">
            <ShieldAlert size={24} />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Invalid or Missing Candidate Link</h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            No assessment invite token was found in your link. Please make sure you clicked the full assessment invitation link provided in your invitation email.
          </p>
        </div>
      </div>
    )
  }

  return <SessionRouter token={actualToken} />
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
          <Route path="/" element={<TokenRouteHandler />} />
          <Route path="*" element={<TokenRouteHandler />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
