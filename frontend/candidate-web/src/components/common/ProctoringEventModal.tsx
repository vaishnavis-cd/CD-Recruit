import React, { useEffect, useState, useRef } from 'react'
import { DetectionEngineService } from '../../proctoring/detection-engine.service'
import { WebcamService } from '../../proctoring/webcam.service'
import type { ProctoringEvent, ProctoringEventType } from '../../proctoring/proctoring.types'
import { Users, Smartphone, ExternalLink, AlertTriangle, X, ShieldAlert, UserX, EyeOff, BookOpen, Headphones, Activity, LogOut } from 'lucide-react'

// All CV and integrity events trigger the 45% viewport modal alert
const ALLOWED_POPUP_EVENTS: ProctoringEventType[] = [
  'MULTIPLE_FACES',
  'PHONE_DETECTED',
  'TAB_SWITCH',
  'FACE_MISSING',
  'LOOKING_AWAY',
  'SEAT_EXIT',
  'BOOK_DETECTED',
  'HEADPHONES_DETECTED',
  'EXCESSIVE_MOVEMENT',
]

interface EventDetails {
  title: string
  subtitle: string
  message: string
  icon: React.ReactNode
  badgeColor: string
}

function getEventDetails(eventType: ProctoringEventType): EventDetails {
  switch (eventType) {
    case 'MULTIPLE_FACES':
      return {
        title: 'MULTIPLE FACES DETECTED',
        subtitle: 'Multiple Persons in Camera View',
        message: 'The computer vision pipeline detected additional faces in your camera feed. Please ensure you remain strictly alone for the duration of the assessment.',
        icon: <Users className="w-10 h-10 text-red-500 animate-pulse" />,
        badgeColor: 'bg-red-500/20 text-red-400 border-red-500/40',
      }
    case 'PHONE_DETECTED':
      return {
        title: 'MOBILE PHONE DETECTED',
        subtitle: 'Unauthorized Device in Frame',
        message: 'A smartphone or handheld device was detected in your camera field of view. Using secondary screens or mobile devices is strictly prohibited.',
        icon: <Smartphone className="w-10 h-10 text-red-500 animate-pulse" />,
        badgeColor: 'bg-red-500/20 text-red-400 border-red-500/40',
      }
    case 'TAB_SWITCH':
      return {
        title: 'TAB SWITCH DETECTED',
        subtitle: 'Window Focus Lost',
        message: 'You navigated away from the assessment window. Switching tabs or browser windows is logged as an integrity event.',
        icon: <ExternalLink className="w-10 h-10 text-amber-500 animate-pulse" />,
        badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      }
    case 'FACE_MISSING':
      return {
        title: 'FACE NOT VISIBLE',
        subtitle: 'No Face in Camera Frame',
        message: 'Your face is no longer detected in the camera feed. Please position yourself clearly in front of the camera.',
        icon: <UserX className="w-10 h-10 text-amber-500 animate-pulse" />,
        badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      }
    case 'LOOKING_AWAY':
      return {
        title: 'LOOKING AWAY DETECTED',
        subtitle: 'Gaze & Head Motion Away',
        message: 'Your gaze or head orientation is directed away from the screen. Please keep your focus on your assessment.',
        icon: <EyeOff className="w-10 h-10 text-amber-500 animate-pulse" />,
        badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      }
    case 'SEAT_EXIT':
      return {
        title: 'SEAT EXIT DETECTED',
        subtitle: 'Body Left Workspace',
        message: 'You appear to have left your seat or camera field of view. Leaving the workstation during the exam is flagged.',
        icon: <LogOut className="w-10 h-10 text-red-500 animate-pulse" />,
        badgeColor: 'bg-red-500/20 text-red-400 border-red-500/40',
      }
    case 'BOOK_DETECTED':
      return {
        title: 'UNAUTHORIZED MATERIAL',
        subtitle: 'Book / Notes Detected',
        message: 'Physical reading material or books were detected in frame. External study materials are prohibited.',
        icon: <BookOpen className="w-10 h-10 text-amber-500 animate-pulse" />,
        badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      }
    case 'HEADPHONES_DETECTED':
      return {
        title: 'HEADPHONES DETECTED',
        subtitle: 'Unauthorized Audio Hardware',
        message: 'Earphones or headphones were detected. Listening devices are not permitted during proctored sessions.',
        icon: <Headphones className="w-10 h-10 text-red-500 animate-pulse" />,
        badgeColor: 'bg-red-500/20 text-red-400 border-red-500/40',
      }
    case 'EXCESSIVE_MOVEMENT':
      return {
        title: 'EXCESSIVE MOVEMENT',
        subtitle: 'Abnormal Physical Motion',
        message: 'Rapid or continuous body movement was detected. Please remain steady during the test.',
        icon: <Activity className="w-10 h-10 text-amber-500 animate-pulse" />,
        badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      }
    default:
      return {
        title: 'PROCTORING ALERT',
        subtitle: 'Integrity Warning',
        message: 'An integrity event was flagged by the proctoring pipeline.',
        icon: <AlertTriangle className="w-10 h-10 text-amber-500" />,
        badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      }
  }
}

export function ProctoringEventModal() {
  const [activeEvent, setActiveEvent] = useState<(ProctoringEvent & { _uniqueId?: string }) | null>(null)
  const [progress, setProgress] = useState(100)
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<any>(null)
  const intervalRef = useRef<any>(null)

  useEffect(() => {
    const unsub = DetectionEngineService.getInstance().subscribe((evt) => {
      // Strictly enforce event whitelist per spec requirement
      if (!ALLOWED_POPUP_EVENTS.includes(evt.eventType)) {
        return
      }

      // Clear any running timers
      if (timerRef.current) clearTimeout(timerRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)

      setActiveEvent({
        ...evt,
        _uniqueId: `${evt.eventType}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      })
      setProgress(100)

      const durationMs = 3000 // 3 seconds
      const startTime = Date.now()

      // Smooth countdown progress bar
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = Math.max(0, 100 - (elapsed / durationMs) * 100)
        setProgress(remaining)
      }, 50)

      // Auto dismiss after 3 seconds (3000ms)
      timerRef.current = setTimeout(() => {
        setActiveEvent(null)
        if (intervalRef.current) clearInterval(intervalRef.current)
      }, durationMs)
    })

    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Attach live camera stream to modal video feed when modal opens
  useEffect(() => {
    if (activeEvent && videoRef.current) {
      const stream = WebcamService.getInstance().getStream()
      if (stream && stream.active) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
    }
  }, [activeEvent])

  if (!activeEvent) return null

  const details = getEventDetails(activeEvent.eventType)
  const secondsLeft = Math.ceil((progress / 100) * 3)

  return (
    <div
      key={(activeEvent as any)._uniqueId || activeEvent.eventType}
      aria-modal="true"
      role="alertdialog"
      aria-label="Proctoring Event Alert"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      {/* 
        SPEC REQUIREMENT: Pop up covering 45% of screen for 3 seconds.
        Math: width 67vw, height 67vh => 0.67 * 0.67 = 0.4489 ≈ 45% of total screen area.
      */}
      <div
        style={{ width: '67vw', height: '67vh' }}
        className="min-w-[340px] min-h-[320px] max-w-[850px] max-h-[650px] bg-slate-950 border-2 border-red-500/80 rounded-2xl shadow-[0_0_60px_rgba(239,68,68,0.4)] flex flex-col overflow-hidden text-white relative animate-in zoom-in-95 duration-200"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-red-950/60 border-b border-red-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              <span className="font-bold text-sm tracking-wider uppercase text-red-200">
                Proctoring System Alert
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-red-300 bg-red-900/40 px-2.5 py-1 rounded-full border border-red-800/50">
              Auto-close in {secondsLeft}s
            </span>
            <button
              onClick={() => setActiveEvent(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close notification"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-6 flex flex-col md:flex-row items-center justify-center gap-6 overflow-y-auto">
          {/* Live Camera View Feed inside 45% Popup */}
          <div className="relative w-full md:w-1/2 h-44 md:h-full max-h-[280px] bg-black rounded-xl overflow-hidden border border-red-900/40 shadow-inner flex items-center justify-center shrink-0">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
            <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-xs px-2.5 py-1 rounded-md border border-red-500/30 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] font-mono font-semibold text-red-300 uppercase tracking-wide">
                CAMERA DETECTED
              </span>
            </div>
            <div className="absolute bottom-2 inset-x-2 bg-slate-900/90 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-red-500/40 text-center">
              <span className="text-xs font-bold text-red-400 font-mono tracking-tight">
                [{activeEvent.eventType}]
              </span>
            </div>
          </div>

          {/* Event Details Text */}
          <div className="w-full md:w-1/2 flex flex-col justify-center space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-800/60 shrink-0">
                {details.icon}
              </div>
              <div>
                <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wider uppercase border ${details.badgeColor}`}>
                  {details.subtitle}
                </span>
                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight mt-1">
                  {details.title}
                </h2>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-300 font-normal border-l-2 border-red-500/50 pl-3 py-0.5">
              {details.message}
            </p>

            <div className="pt-2 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Timestamp: {new Date(activeEvent.timestamp).toLocaleTimeString()}</span>
              <span className="text-red-400 font-semibold uppercase">Severity: HIGH</span>
            </div>
          </div>
        </div>

        {/* Bottom 3-Second Progress Bar */}
        <div className="w-full bg-slate-900 h-2 shrink-0 border-t border-slate-800 relative">
          <div
            style={{ width: `${progress}%` }}
            className="h-full bg-gradient-to-r from-red-600 via-amber-500 to-red-500 transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(239,68,68,0.8)]"
          />
        </div>
      </div>
    </div>
  )
}
