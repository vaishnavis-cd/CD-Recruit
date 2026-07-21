import React from 'react'
import { BrowserRouter, Routes, Route, useParams, useSearchParams } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeProvider'
import { SessionRouter } from './routes/SessionRouter'

function TokenRouteHandler() {
  const { token: pathToken } = useParams<{ token?: string }>()
  const [searchParams] = useSearchParams()
  const queryToken = searchParams.get('token')

  const actualToken = pathToken || queryToken || ''

  if (!actualToken) {
    return (
      <div className="min-h-screen bg-[#0B0B0D] text-white flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-[#16161A] border border-[#26262E] p-8 rounded-xl space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto text-xl font-bold border border-red-500/20">
            !
          </div>
          <h1 className="text-xl font-semibold text-white">Invalid or Missing Candidate Link</h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            No assessment invite token was found in your link. Please make sure you clicked the full assessment invitation link provided in your invitation.
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
