import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeProvider'
import { SessionRouter } from './routes/SessionRouter'
import { FlowControlPanel } from './dev/FlowControlPanel'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Canonical entry point */}
          <Route path="/invite/:token" element={<SessionRouter />} />
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
