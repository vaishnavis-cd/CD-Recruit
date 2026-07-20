import React, { useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import type { ScreenState } from '../store/sessionMachine'
import { services } from '../services'
import { mockTimeAuthorityAdapter } from '../services/time/mock'
import { setSimulateWebcamDenied, setSimulateWasmUnsupported } from '../services/cv/mock'
import { setSimulateSandboxFailure } from '../services/execution/mock'
import { FIXTURE_INVITE } from '../fixtures/invite'
import { TOTAL_ASSESSMENT_MINUTES } from '../fixtures/questions'

const DEMO_TOKEN = 'demo-token-2024'
const DUMMY_SESSION_ID = 'dev-session-001'

const SCREEN_SHORTCUTS: Array<{ label: string; state: ScreenState }> = [
  { label: 'Resolving', state: { type: 'resolving' } },
  { label: 'Too Early', state: { type: 'too-early', scheduledTimeMs: Date.now() + 2 * 3600_000, inviteToken: DEMO_TOKEN } },
  { label: 'Expired (never started)', state: { type: 'expired', reason: 'never-started' } },
  { label: 'Expired (drive closed)', state: { type: 'expired', reason: 'drive-closed' } },
  { label: 'System Check (full)', state: { type: 'system-check', mode: 'full', inviteToken: DEMO_TOKEN } },
  { label: 'System Check (expedited)', state: { type: 'system-check', mode: 'expedited', inviteToken: DEMO_TOKEN } },
  { label: 'Consent (terms)', state: { type: 'consent', step: 'terms', inviteToken: DEMO_TOKEN } },
  { label: 'Consent (biometric)', state: { type: 'consent', step: 'biometric', inviteToken: DEMO_TOKEN } },
  { label: 'Consent (selfie)', state: { type: 'consent', step: 'selfie', inviteToken: DEMO_TOKEN } },
  { label: 'Tutorial (full)', state: { type: 'tutorial', mode: 'full', inviteToken: DEMO_TOKEN } },
  { label: 'Tutorial (condensed)', state: { type: 'tutorial', mode: 'condensed', inviteToken: DEMO_TOKEN } },
  { label: 'Waiting Room', state: { type: 'waiting-room', scheduledTimeMs: Date.now() + 5 * 60_000, inviteToken: DEMO_TOKEN } },
  { label: 'Assessment: MCQ (M1)', state: { type: 'assessment', moduleIndex: 0, sessionId: DUMMY_SESSION_ID } },
  { label: 'Assessment: SQL (M2)', state: { type: 'assessment', moduleIndex: 1, sessionId: DUMMY_SESSION_ID } },
  { label: 'Assessment: Coding (M3)', state: { type: 'assessment', moduleIndex: 2, sessionId: DUMMY_SESSION_ID } },
  { label: 'Assessment: Prompting (M4)', state: { type: 'assessment', moduleIndex: 3, sessionId: DUMMY_SESSION_ID } },
  { label: 'Assessment: Contextual (M5)', state: { type: 'assessment', moduleIndex: 4, sessionId: DUMMY_SESSION_ID } },
  { label: 'Pre-Submit Review', state: { type: 'pre-submit-review', sessionId: DUMMY_SESSION_ID } },
  { label: 'Syncing (manual submit)', state: { type: 'syncing', sessionId: DUMMY_SESSION_ID, auto: false } },
  { label: 'Syncing (auto-submit)', state: { type: 'syncing', sessionId: DUMMY_SESSION_ID, auto: true } },
  { label: 'Done', state: { type: 'done', auto: false, referenceId: 'REF-DEV-001', sessionId: DUMMY_SESSION_ID } },
  { label: 'Session Conflict', state: { type: 'session-conflict' } },
]

// Time offsets to jump between windows (relative to FIXTURE_INVITE's scheduled time)
const FIXTURE_SCHEDULED_MS = new Date(FIXTURE_INVITE.scheduledTime).getTime()

const TIME_WINDOWS = [
  { label: 'Too Early (−90 min)', offsetMs: -90 * 60_000 },
  { label: 'Buffer (−20 min)', offsetMs: -20 * 60_000 },
  { label: 'Grace (+5 min)', offsetMs: 5 * 60_000 },
  { label: 'Expired (+25 min)', offsetMs: 25 * 60_000 },
]

export function FlowControlPanel() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'screens' | 'time' | 'flags' | 'reset'>('screens')
  const { devForceJump, resetSession, initAssessment, setTimerStart, screen } = useSessionStore()

  const [webcamDenied, setWebcamDenied] = useState(false)
  const [wasmUnsupported, setWasmUnsupported] = useState(false)
  const [sandboxFailure, setSandboxFailure] = useState(false)
  const [customOffset, setCustomOffset] = useState(0)
  const [timerOffset, setTimerOffset] = useState(0)

  function handleToggleWebcam(v: boolean) {
    setWebcamDenied(v)
    setSimulateWebcamDenied(v)
  }

  function handleToggleWasm(v: boolean) {
    setWasmUnsupported(v)
    setSimulateWasmUnsupported(v)
  }

  function handleToggleSandbox(v: boolean) {
    setSandboxFailure(v)
    setSimulateSandboxFailure(v)
  }

  function handleTimeWindow(offsetFromScheduled: number) {
    const nowReal = Date.now()
    const targetNow = FIXTURE_SCHEDULED_MS + offsetFromScheduled
    const offset = targetNow - nowReal
    setCustomOffset(offset)
    mockTimeAuthorityAdapter.setDevOffset(offset)
    localStorage.setItem('cd-recruit-scheduled-ms', String(FIXTURE_SCHEDULED_MS))
  }

  function handleCustomOffsetChange(hours: number, minutes: number) {
    const nowReal = Date.now()
    const targetNow = FIXTURE_SCHEDULED_MS + (hours * 3600_000 + minutes * 60_000)
    const offset = targetNow - nowReal
    setCustomOffset(offset)
    mockTimeAuthorityAdapter.setDevOffset(offset)
  }

  function handleTimerFastForward(minutesRemaining: number) {
    const assessment = useSessionStore.getState().assessment
    if (!assessment) return
    // Set timer start so that "minutesRemaining" minutes remain
    const totalMs = TOTAL_ASSESSMENT_MINUTES * 60_000
    const nowMs = services.time.getServerNow()
    const desiredStart = nowMs - (totalMs - minutesRemaining * 60_000)
    useSessionStore.setState(state => ({
      assessment: state.assessment
        ? { ...state.assessment, timerStartMs: desiredStart }
        : state.assessment,
    }))
  }

  function handleJump(state: ScreenState) {
    // Ensure assessment state exists for assessment screens
    if (state.type === 'assessment' || state.type === 'pre-submit-review' || state.type === 'syncing') {
      initAssessment(DUMMY_SESSION_ID, TOTAL_ASSESSMENT_MINUTES * 60)
      const nowMs = services.time.getServerNow()
      setTimerStart(nowMs - 10 * 60_000) // 10 minutes elapsed
      localStorage.setItem('cd-recruit-scheduled-ms', String(Date.now() - 5 * 60_000))
    }
    devForceJump(state)
  }

  function handleReset() {
    mockTimeAuthorityAdapter.setDevOffset(0)
    setCustomOffset(0)
    handleToggleWebcam(false)
    handleToggleWasm(false)
    handleToggleSandbox(false)
    resetSession()
    window.location.href = `/invite/${DEMO_TOKEN}`
  }

  if (!import.meta.env.DEV) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] font-sans text-sm">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close dev panel' : 'Open dev flow control panel'}
        aria-expanded={open}
        className="bg-gray-900 text-yellow-300 border border-yellow-500 px-3 py-2 rounded-lg font-mono text-xs font-bold shadow-lg hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400"
      >
        {open ? '✕ DEV' : '⚙ DEV'}
      </button>

      {open && (
        <div
          className="absolute bottom-12 right-0 w-80 max-h-[85vh] overflow-y-auto bg-gray-950 border border-yellow-500/30 rounded-xl shadow-2xl text-xs"
          role="dialog"
          aria-label="Developer flow control panel"
          aria-modal="false"
        >
          <div className="px-4 py-3 border-b border-yellow-500/20 bg-yellow-500/5">
            <div className="font-bold text-yellow-300 font-mono">DEV: Flow Control Panel</div>
            <div className="text-gray-400 mt-0.5">Bypasses all transition validation</div>
            <div className="text-gray-500 mt-0.5">
              Current: <span className="text-yellow-200 font-mono">{screen.type}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            {(['screens', 'time', 'flags', 'reset'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-xs font-medium capitalize transition-colors focus:outline-none focus:ring-1 focus:ring-yellow-400 ${
                  tab === t ? 'text-yellow-300 bg-yellow-500/10' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-3">
            {tab === 'screens' && (
              <div className="space-y-1">
                {SCREEN_SHORTCUTS.map(({ label, state }) => (
                  <button
                    key={label}
                    onClick={() => handleJump(state)}
                    className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-yellow-400 ${
                      screen.type === state.type
                        ? 'bg-yellow-500/20 text-yellow-200'
                        : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {tab === 'time' && (
              <div className="space-y-4">
                {import.meta.env.VITE_TIME_MODE === 'real' && (
                  <div className="text-yellow-500 bg-yellow-500/5 border border-yellow-500/25 p-2.5 rounded text-xs leading-normal" role="alert">
                    ⚠️ Simulated time controls are disabled because TimeAuthorityPort is in real mode. To enable time-travel controls, set VITE_TIME_MODE=mock.
                  </div>
                )}
                <div style={{ opacity: import.meta.env.VITE_TIME_MODE === 'real' ? 0.4 : 1, pointerEvents: import.meta.env.VITE_TIME_MODE === 'real' ? 'none' : 'auto' }}>
                  <div className="text-gray-400 uppercase tracking-wide text-xs mb-2">Time window jumps</div>
                  <div className="text-gray-500 text-xs mb-2">
                    Scheduled: {new Date(FIXTURE_SCHEDULED_MS).toLocaleTimeString()}
                  </div>
                  {TIME_WINDOWS.map(w => (
                    <button
                      key={w.label}
                      disabled={import.meta.env.VITE_TIME_MODE === 'real'}
                      title={import.meta.env.VITE_TIME_MODE === 'real' ? 'Disabled: TimeAuthorityPort is in real mode' : ''}
                      onClick={() => handleTimeWindow(w.offsetMs)}
                      className="w-full text-left px-3 py-1.5 rounded text-xs text-gray-300 hover:bg-gray-800 transition-colors focus:outline-none focus:ring-1 focus:ring-yellow-400 mb-1 disabled:opacity-50"
                    >
                      {w.label}
                    </button>
                  ))}
                  <button
                    disabled={import.meta.env.VITE_TIME_MODE === 'real'}
                    title={import.meta.env.VITE_TIME_MODE === 'real' ? 'Disabled: TimeAuthorityPort is in real mode' : ''}
                    onClick={() => { mockTimeAuthorityAdapter.setDevOffset(0); setCustomOffset(0) }}
                    className="w-full text-left px-3 py-1.5 rounded text-xs text-yellow-400 hover:bg-gray-800 transition-colors focus:outline-none focus:ring-1 focus:ring-yellow-400 disabled:opacity-50"
                  >
                    Reset to real time
                  </button>
                </div>

                <div style={{ opacity: import.meta.env.VITE_TIME_MODE === 'real' ? 0.4 : 1 }}>
                  <div className="text-gray-400 uppercase tracking-wide text-xs mb-2">Current offset</div>
                  <div className="text-yellow-200 font-mono text-xs">
                    {import.meta.env.VITE_TIME_MODE === 'real' ? 'Real time (offset locked)' : (customOffset === 0 ? 'Real time' : `${(customOffset / 60000).toFixed(1)} min from scheduled`)}
                  </div>
                </div>

                <div style={{ opacity: import.meta.env.VITE_TIME_MODE === 'real' ? 0.4 : 1, pointerEvents: import.meta.env.VITE_TIME_MODE === 'real' ? 'none' : 'auto' }}>
                  <div className="text-gray-400 uppercase tracking-wide text-xs mb-2">Fast-forward assessment timer</div>
                  {[15, 10, 5, 1].map(min => (
                    <button
                      key={min}
                      disabled={import.meta.env.VITE_TIME_MODE === 'real'}
                      title={import.meta.env.VITE_TIME_MODE === 'real' ? 'Disabled: TimeAuthorityPort is in real mode' : ''}
                      onClick={() => handleTimerFastForward(min)}
                      className="w-full text-left px-3 py-1.5 rounded text-xs text-gray-300 hover:bg-gray-800 transition-colors focus:outline-none focus:ring-1 focus:ring-yellow-400 mb-1 disabled:opacity-50"
                    >
                      Set {min} min remaining
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'flags' && (
              <div className="space-y-4">
                <div className="text-gray-400 uppercase tracking-wide text-xs mb-2">Edge case toggles</div>

                {[
                  { label: 'Webcam permission denied', value: webcamDenied, toggle: handleToggleWebcam },
                  { label: 'WASM unsupported', value: wasmUnsupported, toggle: handleToggleWasm },
                  { label: 'Sandbox execution failure', value: sandboxFailure, toggle: handleToggleSandbox },
                ].map(({ label, value, toggle }) => (
                  <label key={label} className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-300">{label}</span>
                    <button
                      role="switch"
                      aria-checked={value}
                      onClick={() => toggle(!value)}
                      className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 ${value ? 'bg-yellow-500' : 'bg-gray-700'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`}
                      />
                      <span className="sr-only">{value ? 'On' : 'Off'}</span>
                    </button>
                  </label>
                ))}

                <div className="text-gray-500 text-xs pt-2">
                  Network disconnect: change screen to Assessment first, then the reconnect banner appears after ~30s simulated delay via the time controls.
                </div>
              </div>
            )}

            {tab === 'reset' && (
              <div className="space-y-3">
                <p className="text-gray-400 text-xs">
                  Clears all localStorage state and returns to the invite URL. All toggles and time offsets are also reset.
                </p>
                <button
                  onClick={handleReset}
                  className="w-full py-2.5 rounded bg-red-900/50 border border-red-700 text-red-300 font-medium hover:bg-red-900 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  Reset mock session
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
