import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeProvider'
import { SessionRouter } from './routes/SessionRouter'
import { FlowControlPanel } from './dev/FlowControlPanel'

function LoginRedirect() {
  const [params] = useSearchParams()
  const token = params.get('token') || 'demo-token-2024'
  return <Navigate to={`/invite/${token}`} replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Canonical entry points */}
          <Route path="/invite/:token" element={<SessionRouter />} />
          <Route path="/login" element={<LoginRedirect />} />
          {/* Dev convenience redirect */}
          <Route path="/" element={<Navigate to="/invite/demo-token-2024" replace />} />
          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/invite/demo-token-2024" replace />} />
        </Routes>

        {/* Dev panel — only renders in import.meta.env.DEV */}
        <FlowControlPanel />
      </BrowserRouter>
    </ThemeProvider>
  )
}
