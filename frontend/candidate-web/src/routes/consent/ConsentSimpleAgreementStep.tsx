import React, { useState, useRef, useEffect } from 'react'
import { Check, Mic } from 'lucide-react'
import { StatusChip } from '../../components/common/StatusChip'

interface ConsentSimpleAgreementStepProps {
  type: 'terms' | 'audio'
  onAgree: () => void
}

const NUM_BARS = 28

export function ConsentSimpleAgreementStep({ type, onAgree }: ConsentSimpleAgreementStepProps) {
  const [agreed, setAgreed] = useState(false)
  const [micTested, setMicTested] = useState(false)
  const [micTesting, setMicTesting] = useState(false)
  const [deviceName, setDeviceName] = useState('Default input · System Microphone')
  const [barHeights, setBarHeights] = useState<number[]>(Array(NUM_BARS).fill(12))

  const animFrameRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      stopAudioAnalysis()
    }
  }, [])

  function stopAudioAnalysis() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
  }

  async function handleTestMic() {
    setMicTesting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const trackLabel = stream.getAudioTracks()[0]?.label
      if (trackLabel) {
        setDeviceName(`Default input · ${trackLabel}`)
      }

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const audioCtx = new AudioContextClass()
      audioContextRef.current = audioCtx

      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)

      const freqData = new Uint8Array(analyser.frequencyBinCount)

      const updateWaveform = () => {
        analyser.getByteFrequencyData(freqData)

        // Calculate overall ambient/voice volume level
        let sum = 0
        for (let k = 0; k < 12; k++) {
          sum += freqData[k] || 0
        }
        const avgLevel = (sum / 12) / 255 // 0.0 to 1.0

        // Generate dynamic 28-bar heights with center bell boost & organic wave motion
        const now = Date.now()
        const newHeights = Array.from({ length: NUM_BARS }, (_, i) => {
          // Map index 0->27 to low-mid voice frequency bins 0->10
          const binIdx = Math.floor((i / NUM_BARS) * 10)
          const rawVal = (freqData[binIdx] || 0) / 255

          // Center bell curve multiplier so center bars rise dynamically
          const distFromCenter = Math.abs(i - NUM_BARS / 2) / (NUM_BARS / 2)
          const bellBoost = 1 + (1 - distFromCenter) * 0.75 // Center gets up to 1.75x boost

          // Organic ambient wave animation
          const waveJitter = Math.sin(now / 90 + i * 0.35) * (avgLevel > 0.04 ? 16 : 8)

          const heightPct = Math.max(
            12,
            Math.min(95, Math.round((rawVal * 75 * bellBoost) + (avgLevel * 35) + waveJitter))
          )

          return heightPct
        })

        setBarHeights(newHeights)
        animFrameRef.current = requestAnimationFrame(updateWaveform)
      }

      animFrameRef.current = requestAnimationFrame(updateWaveform)

      // Automatically complete mic verification after 3 seconds of live audio monitoring
      setTimeout(() => {
        stopAudioAnalysis()
        setMicTesting(false)
        setMicTested(true)
        setBarHeights(Array(NUM_BARS).fill(25))
        localStorage.setItem('cd-recruit-mic-consent', 'true')
      }, 3000)

    } catch (err) {
      console.error('Microphone error:', err)
      alert('Microphone access denied. Please allow microphone access in your browser to proceed.')
      stopAudioAnalysis()
      setMicTesting(false)
    }
  }

  if (type === 'terms') {
    return (
      <div>
        <div className="card-surface p-5 text-sm leading-relaxed text-[var(--muted-foreground)] border border-[var(--border)] rounded-xl space-y-3">
          <p>
            <strong className="text-[var(--foreground)]">1. Purpose.</strong> Proctora provides a remote candidate assessment service on behalf of the employer named in your invitation. By continuing, you consent to participate in a monitored technical assessment.
          </p>
          <p>
            <strong className="text-[var(--foreground)]">2. Integrity.</strong> During the session, the platform will collect telemetry including keystroke rhythm, focus events, and periodic camera frames to detect anomalies. This data is retained only for the duration required by the employer and is not sold or shared with third parties.
          </p>
          <p>
            <strong className="text-[var(--foreground)]">3. Data.</strong> Raw video and audio remain on-device by default. Only signed integrity summaries are transmitted. You may request deletion of your assessment data at any time via the support link on the completion screen.
          </p>
          <p>
            <strong className="text-[var(--foreground)]">4. Conduct.</strong> Use of unauthorised assistance — including third-party tools, other humans, or generative AI outside the AI Prompting module — constitutes grounds for disqualification.
          </p>
          <p>
            <strong className="text-[var(--foreground)]">5. Support.</strong> Contact support@proctora.com for questions before, during, or after your assessment.
          </p>
        </div>

        {/* AgreeBar matching Image 2 */}
        <div className="mt-8 flex items-center justify-between">
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-[var(--foreground)]">
            <span
              className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${
                agreed ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--surface)] border-[var(--border)]'
              }`}
              onClick={() => setAgreed(v => !v)}
            >
              {agreed && <Check size={14} strokeWidth={3} />}
            </span>
            <span onClick={() => setAgreed(v => !v)}>I have read and agree to the Terms of Use</span>
          </label>
          <button
            className="btn-primary text-xs font-semibold px-6 py-2.5 cursor-pointer"
            disabled={!agreed}
            onClick={onAgree}
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  // Audio Step matching Image 3
  const isAudioReady = agreed && micTested

  return (
    <div>
      <div className="card-surface p-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--background)] text-[var(--accent)] border border-[var(--border)]">
            <Mic size={18} />
          </div>
          <div>
            <div className="font-semibold text-sm text-[var(--foreground)]">Microphone</div>
            <div className="text-xs text-[var(--muted-foreground)] font-mono-data">{deviceName}</div>
          </div>
          <div className="ml-auto">
            <StatusChip tone={micTested ? 'success' : micTesting ? 'pending' : 'neutral'} label={micTested ? 'Verified' : micTesting ? 'Listening…' : 'Idle'} />
          </div>
        </div>

        {/* Compact, sleek real-time Audio Waveform Container */}
        <div
          className="h-16 rounded-xl flex items-end justify-center gap-1.5 px-6 py-2.5 bg-[var(--background)] border border-[var(--border)] mb-5 overflow-hidden"
        >
          {barHeights.map((h, i) => (
            <div
              key={i}
              className="flex-1 max-w-[6px] rounded-full transition-all duration-75"
              style={{
                background: micTesting ? "var(--accent)" : micTested ? "var(--success)" : "var(--border)",
                height: `${h}%`,
                transformOrigin: "bottom",
              }}
            />
          ))}
        </div>

        <button
          onClick={handleTestMic}
          disabled={micTesting}
          type="button"
          className="btn-secondary text-xs cursor-pointer"
        >
          {micTesting ? 'Listening…' : micTested ? 'Test again' : 'Test microphone'}
        </button>
      </div>

      {/* AgreeBar matching Image 3 */}
      <div className="mt-8 flex items-center justify-between">
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-[var(--foreground)]">
          <span
            className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${
              agreed ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--surface)] border-[var(--border)]'
            }`}
            onClick={() => setAgreed(v => !v)}
          >
            {agreed && <Check size={14} strokeWidth={3} />}
          </span>
          <span onClick={() => setAgreed(v => !v)}>I consent to microphone use during this assessment</span>
        </label>
        <button
          className="btn-primary text-xs font-semibold px-6 py-2.5 cursor-pointer"
          disabled={!isAudioReady}
          onClick={onAgree}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
