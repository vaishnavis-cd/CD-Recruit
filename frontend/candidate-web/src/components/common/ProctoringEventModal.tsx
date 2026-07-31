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
  accentColor: string
  isCritical: boolean
}

function getEventDetails(eventType: ProctoringEventType): EventDetails {
  switch (eventType) {
    case 'MULTIPLE_FACES':
      return {
        title: 'MULTIPLE FACES DETECTED',
        subtitle: 'Multiple Persons in View',
        message: 'The computer vision pipeline detected additional faces in your camera feed. Please ensure you remain strictly alone for the duration of the assessment.',
        icon: <Users className="w-5 h-5 text-rose-500" />,
        badgeColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
        accentColor: 'bg-rose-500',
        isCritical: true,
      }
    case 'PHONE_DETECTED':
      return {
        title: 'MOBILE PHONE DETECTED',
        subtitle: 'Unauthorized Device',
        message: 'A smartphone or handheld device was detected in your camera field of view. Using secondary screens or mobile devices is strictly prohibited.',
        icon: <Smartphone className="w-5 h-5 text-rose-500" />,
        badgeColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
        accentColor: 'bg-rose-500',
        isCritical: true,
      }
    case 'TAB_SWITCH':
      return {
        title: 'TAB SWITCH DETECTED',
        subtitle: 'Window Focus Lost',
        message: 'You navigated away from the assessment window. Switching tabs or browser windows is logged as an integrity event.',
        icon: <ExternalLink className="w-5 h-5 text-amber-500" />,
        badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
        accentColor: 'bg-amber-500',
        isCritical: false,
      }
    case 'FACE_MISSING':
      return {
        title: 'FACE NOT VISIBLE',
        subtitle: 'No Face in Frame',
        message: 'Your face is no longer detected in the camera feed. Please position yourself clearly in front of the camera.',
        icon: <UserX className="w-5 h-5 text-amber-500" />,
        badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
        accentColor: 'bg-amber-500',
        isCritical: false,
      }
    case 'LOOKING_AWAY':
      return {
        title: 'LOOKING AWAY DETECTED',
        subtitle: 'Gaze & Head Motion Away',
        message: 'Your gaze or head orientation is directed away from the screen. Please keep your focus on your assessment.',
        icon: <EyeOff className="w-5 h-5 text-amber-500" />,
        badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
        accentColor: 'bg-amber-500',
        isCritical: false,
      }
    case 'SEAT_EXIT':
      return {
        title: 'SEAT EXIT DETECTED',
        subtitle: 'Body Left Workspace',
        message: 'You appear to have left your seat or camera field of view. Leaving the workstation during the exam is flagged.',
        icon: <LogOut className="w-5 h-5 text-amber-500" />,
        badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
        accentColor: 'bg-amber-500',
        isCritical: false,
      }
    case 'BOOK_DETECTED':
      return {
        title: 'UNAUTHORIZED MATERIAL',
        subtitle: 'Book / Notes Detected',
        message: 'Physical reading material or books were detected in frame. External study materials are prohibited.',
        icon: <BookOpen className="w-5 h-5 text-amber-500" />,
        badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
        accentColor: 'bg-amber-500',
        isCritical: false,
      }
    case 'HEADPHONES_DETECTED':
      return {
        title: 'HEADPHONES DETECTED',
        subtitle: 'Unauthorized Audio Hardware',
        message: 'Earphones or headphones were detected. Listening devices are not permitted during proctored sessions.',
        icon: <Headphones className="w-5 h-5 text-rose-500" />,
        badgeColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
        accentColor: 'bg-rose-500',
        isCritical: true,
      }
    case 'EXCESSIVE_MOVEMENT':
      return {
        title: 'EXCESSIVE MOVEMENT',
        subtitle: 'Abnormal Physical Motion',
        message: 'Rapid or continuous body movement was detected. Please remain steady during the test.',
        icon: <Activity className="w-5 h-5 text-amber-500" />,
        badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
        accentColor: 'bg-amber-500',
        isCritical: false,
      }
    default:
      return {
        title: 'PROCTORING ALERT',
        subtitle: 'Integrity Warning',
        message: 'An integrity event was flagged by the proctoring pipeline.',
        icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
        badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
        accentColor: 'bg-amber-500',
        isCritical: false,
      }
  }
}

export function ProctoringEventModal() {
  const [activeEvent, setActiveEvent] = useState<(ProctoringEvent & { _uniqueId?: string }) | null>(null)
  const [progress, setProgress] = useState(100)
  const timerRef = useRef<any>(null)
  const intervalRef = useRef<any>(null)

  useEffect(() => {
    const unsub = DetectionEngineService.getInstance().subscribe((evt) => {
      if (!ALLOWED_POPUP_EVENTS.includes(evt.eventType)) {
        return
      }

      if (timerRef.current) clearTimeout(timerRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)

      setActiveEvent({
        ...evt,
        _uniqueId: `${evt.eventType}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      })
      setProgress(100)

      const durationMs = 3000 // 3 seconds
      const startTime = Date.now()

      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = Math.max(0, 100 - (elapsed / durationMs) * 100)
        setProgress(remaining)
      }, 50)

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

  if (!activeEvent) return null

  const details = getEventDetails(activeEvent.eventType)
  const secondsLeft = Math.ceil((progress / 100) * 3)

  return (
    <div
      key={(activeEvent as any)._uniqueId || activeEvent.eventType}
      aria-modal="true"
      role="alertdialog"
      aria-label="Proctoring Event Alert"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-[560px] bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[var(--text-primary)] relative animate-in zoom-in-95 duration-200"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-7 py-3.5 bg-[var(--background)] border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className={`w-3.5 h-3.5 ${details.isCritical ? 'text-rose-500' : 'text-amber-500'}`} />
            <span className="text-[11px] font-mono text-[var(--text-secondary)] tracking-wider uppercase font-medium">
              Assessment Integrity Notice
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--surface)] px-2.5 py-0.5 rounded-full border border-[var(--border)] font-medium">
              Closes in <strong className="text-[var(--text-primary)] font-bold">{secondsLeft}s</strong>
            </span>
            <button
              onClick={() => setActiveEvent(null)}
              className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors cursor-pointer"
              aria-label="Close notification"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-7 space-y-4 text-left">
          {/* Primary Alert Header Row */}
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-[var(--background)] border border-[var(--border)] shrink-0 shadow-xs">
              {details.icon}
            </div>
            <div className="space-y-1.5 flex-1 min-w-0">
              <h2 className="text-[24px] md:text-[28px] font-extrabold text-[var(--text-primary)] tracking-tight leading-none">
                {details.title}
              </h2>
              <div>
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wider uppercase ${details.badgeColor}`}>
                  {details.subtitle}
                </span>
              </div>
            </div>
          </div>

          {/* Description Text */}
          <p className="text-sm leading-relaxed text-[var(--text-secondary)] font-normal pt-1">
            {details.message}
          </p>

          {/* Footer Alignment Row */}
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] font-mono pt-3 border-t border-[var(--border)]/60">
            <div className="flex items-center gap-1.5">
              <span>Timestamp:</span>
              <span className="text-[var(--text-primary)] font-semibold">{new Date(activeEvent.timestamp).toLocaleTimeString()}</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--background)] border border-[var(--border)] text-[var(--text-secondary)] font-medium">
              [{activeEvent.eventType}]
            </span>
          </div>
        </div>

        {/* Bottom Accent Bar matching alert color */}
        <div className="w-full bg-[var(--background)] h-1 shrink-0 border-t border-[var(--border)] relative">
          <div
            style={{ width: `${progress}%` }}
            className={`h-full ${details.accentColor} transition-all duration-100 ease-linear`}
          />
        </div>
      </div>
    </div>
  )
}
