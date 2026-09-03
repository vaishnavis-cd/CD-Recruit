import React, { useEffect, useState } from 'react';
import { Maximize, MonitorX, ShieldAlert, AlertTriangle } from 'lucide-react';
import { useSessionStore } from '../store/sessionMachine';

interface FullScreenShieldProps {
  isActive: boolean;
  onReEnter?: () => void;
}

export function FullScreenShield({ isActive, onReEnter }: FullScreenShieldProps) {
  const inviteToken = useSessionStore(s => s.inviteToken);
  const assessment = useSessionStore(s => s.assessment);
  const session = useSessionStore(s => s.session);

  // [DEMO-UNLIMITED-SESSION: TEMPORARY DEV HOOK]
  const isUnlimitedDemo =
    (assessment && assessment.totalSeconds >= 86400 * 30) ||
    inviteToken === 'demo' ||
    inviteToken?.startsWith('demo') ||
    inviteToken?.startsWith('unlimited-') ||
    (session as any)?.durationMinutes >= 999999 ||
    localStorage.getItem('cd-recruit-session-token')?.startsWith('demo');

  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    return typeof document !== 'undefined' && !!document.fullscreenElement;
  });
  const [isExtendedDisplay, setIsExtendedDisplay] = useState<boolean>(() => {
    return typeof window !== 'undefined' && !!(window.screen as any)?.isExtended;
  });

  useEffect(() => {
    if (!isActive || isUnlimitedDemo) return;

    const checkFullscreen = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    const checkDisplayTopology = () => {
      try {
        const extended = !!(window.screen as any)?.isExtended;
        setIsExtendedDisplay(extended);
      } catch {}
    };

    document.addEventListener('fullscreenchange', checkFullscreen);
    window.addEventListener('resize', checkDisplayTopology);

    // Screen Details API event listener if available
    try {
      if ((window.screen as any)?.addEventListener) {
        (window.screen as any).addEventListener('change', checkDisplayTopology);
      }
    } catch {}

    // Check on interval
    const interval = setInterval(() => {
      checkFullscreen();
      checkDisplayTopology();
    }, 1000);

    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen);
      window.removeEventListener('resize', checkDisplayTopology);
      clearInterval(interval);
    };
  }, [isActive, isUnlimitedDemo]);

  if (!isActive || isUnlimitedDemo) return null;

  const handleRequestFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setIsFullscreen(true);
      onReEnter?.();
    } catch (err) {
      console.warn('Failed to enter fullscreen:', err);
    }
  };

  // Condition 1: Multiple / Extended displays detected
  if (isExtendedDisplay) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in duration-200">
        <div className="bg-[var(--surface)] border border-[var(--warning)]/40 rounded-2xl shadow-2xl p-8 max-w-lg w-full text-center space-y-5">
          <div className="w-16 h-16 bg-[var(--warning-subtle)] border border-[var(--warning)]/30 rounded-full flex items-center justify-center mx-auto text-[var(--warning)] animate-pulse">
            <MonitorX size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[var(--foreground)]">
              Secondary Display Detected
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
              CD-Recruit proctoring requires a single active display. Extended desktops, wireless casting, or multiple monitors are prohibited during the assessment.
            </p>
          </div>

          <div className="bg-[var(--background)] border border-[var(--warning)]/30 rounded-xl p-4 text-xs text-[var(--warning)] text-left space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} className="shrink-0" />
              How to resolve:
            </p>
            <ul className="list-disc pl-5 space-y-1 font-mono text-2xs">
              <li>Unplug HDMI / DisplayPort cables from your secondary monitor or TV.</li>
              <li>Disconnect any active Miracast, AirPlay, or Chromecast wireless mirroring.</li>
              <li>If using an external monitor with a laptop, select <strong>"Second screen only"</strong> in Windows settings (<kbd className="bg-[var(--surface)] px-1 rounded border border-[var(--border)]">Win+P</kbd>).</li>
            </ul>
          </div>

          <button
            onClick={() => {
              try {
                const extended = !!(window.screen as any)?.isExtended;
                setIsExtendedDisplay(extended);
              } catch {}
            }}
            className="w-full py-3 bg-brand hover:bg-brand-hover text-white font-semibold text-sm rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
          >
            <span>I Disconnected My Secondary Screen — Verify</span>
          </button>
        </div>
      </div>
    );
  }

  // Condition 2: Not in Fullscreen
  if (!isFullscreen) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in duration-200">
        <div className="bg-[var(--surface)] border border-brand-border rounded-2xl shadow-2xl p-8 max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 bg-brand-subtle border border-brand-border rounded-full flex items-center justify-center mx-auto text-brand animate-bounce">
            <Maximize size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[var(--foreground)]">
              Assessment Full-Screen Required
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
              Your assessment session is actively timed. To preserve testing integrity, all modules must be completed in full-screen mode.
            </p>
          </div>

          <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-3.5 text-xs text-[var(--muted-foreground)] flex items-center gap-2 text-left">
            <ShieldAlert size={18} className="text-brand shrink-0" />
            <span>Exiting full-screen or switching applications is recorded in your proctoring audit log.</span>
          </div>

          <button
            onClick={handleRequestFullscreen}
            className="w-full py-3 bg-brand hover:bg-brand-hover text-white font-semibold text-sm rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer flex items-center justify-center gap-2"
          >
            <Maximize size={16} />
            <span>Re-enter Full Screen to Resume Test</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
