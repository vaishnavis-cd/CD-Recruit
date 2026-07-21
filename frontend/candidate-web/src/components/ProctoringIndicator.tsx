import React, { useEffect, useState, useRef } from 'react'
import { services } from '../services'
import type { DetectionEvent } from '../services/cv/port'
import { WebcamService } from '../proctoring/webcam.service'
import { DetectionEngineService } from '../proctoring/detection-engine.service'
import { Maximize2, Minimize2, Camera } from 'lucide-react'

interface ProctoringIndicatorProps {
  cvMode: 'full' | 'reduced'
}

export function ProctoringIndicator({ cvMode }: ProctoringIndicatorProps) {
  const [active, setActive] = useState(true)
  const [lastEventType, setLastEventType] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasStream, setHasStream] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const expandedVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const unsubCv = services.cv.onDetectionEvent((event: DetectionEvent) => {
      if (event.type === 'face-detected') setActive(true)
      else if (event.type === 'face-lost') setActive(false)
    })

    const unsubEngine = DetectionEngineService.getInstance().subscribe((evt) => {
      setLastEventType(evt.eventType)
    })

    // Attach stream to video elements for live camera preview
    const checkStream = () => {
      const stream = WebcamService.getInstance().getStream()
      if (stream && stream.active) {
        setHasStream(true)
        if (videoRef.current && videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
        if (expandedVideoRef.current && expandedVideoRef.current.srcObject !== stream) {
          expandedVideoRef.current.srcObject = stream
          expandedVideoRef.current.play().catch(() => {})
        }
      } else {
        setHasStream(false)
      }
    }

    const interval = setInterval(checkStream, 500)
    checkStream()

    return () => {
      unsubCv()
      unsubEngine()
      clearInterval(interval)
    }
  }, [cvMode])

  return (
    <>
      {/* Header Live Camera Widget */}
      <div
        aria-label={`Integrity monitoring ${active ? 'active' : 'standby'}`}
        title="Live Camera & Proctoring Status"
        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-secondary)] shadow-sm"
      >
        <div className="relative group cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-16 h-12 rounded-md bg-black object-cover transform -scale-x-100 border border-slate-700 shadow-sm transition-transform group-hover:scale-105"
          />
          {!hasStream && (
            <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center rounded-md text-[9px] text-slate-400">
              <Camera size={14} className="mb-0.5 text-slate-500" />
              Off
            </div>
          )}
          <div className="absolute bottom-0.5 right-0.5 bg-black/60 backdrop-blur-xs p-0.5 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity">
            {isExpanded ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
          </div>
        </div>

        <div className="flex flex-col text-[11px] leading-tight select-none">
          <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
            <span
              className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}
              aria-hidden
            />
            <span>{hasStream ? 'Live Camera On' : 'Camera Off'}</span>
          </div>
          <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-1">
            <span>{cvMode === 'full' ? 'Full Integrity' : 'Basic Integrity'}</span>
            {lastEventType && (
              <span className="text-amber-500 font-mono font-semibold truncate max-w-[90px]">
                • {lastEventType}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Expanded Floating Live Video Window */}
      {isExpanded && (
        <div className="fixed bottom-5 right-5 z-50 bg-[var(--surface)] border-2 border-[var(--accent)] rounded-xl shadow-2xl p-2.5 w-72 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5 px-0.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Candidate Live Feed
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Minimize2 size={13} />
            </button>
          </div>

          <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
            <video
              ref={expandedVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
            {!hasStream && (
              <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                <Camera size={20} />
                Initializing webcam stream…
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-xs px-2 py-0.5 rounded text-[10px] text-white font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              REC • LIVE
            </div>
          </div>
        </div>
      )}
    </>
  )
}

