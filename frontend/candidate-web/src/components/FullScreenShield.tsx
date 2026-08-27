import React, { useEffect, useState } from 'react';
import { Maximize, MonitorX, ShieldAlert, AlertTriangle } from 'lucide-react';

interface FullScreenShieldProps {
  isActive: boolean;
  onReEnter?: () => void;
}

export function FullScreenShield({ isActive, onReEnter }: FullScreenShieldProps) {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    return typeof document !== 'undefined' && !!document.fullscreenElement;
  });
  const [isExtendedDisplay, setIsExtendedDisplay] = useState<boolean>(() => {
    return typeof window !== 'undefined' && !!(window.screen as any)?.isExtended;
  });

  useEffect(() => {
    if (!isActive) return;

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
  }, [isActive]);

  if (!isActive) return null;

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
        <div className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/60 rounded-2xl shadow-2xl p-8 max-w-lg w-full text-center space-y-5">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-600 rounded-full flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400 animate-pulse">
            <MonitorX size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Secondary Display Detected
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              CD-Recruit proctoring requires a single active display. Extended desktops, wireless casting, or multiple monitors are prohibited during the assessment.
            </p>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 text-xs text-amber-800 dark:text-amber-300 text-left space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} className="shrink-0" />
              How to resolve:
            </p>
            <ul className="list-disc pl-5 space-y-1 font-mono text-[11px]">
              <li>Unplug HDMI / DisplayPort cables from your secondary monitor or TV.</li>
              <li>Disconnect any active Miracast, AirPlay, or Chromecast wireless mirroring.</li>
              <li>If using an external monitor with a laptop, select <strong>"Second screen only"</strong> in Windows settings (<kbd className="bg-amber-200/60 px-1 rounded">Win+P</kbd>).</li>
            </ul>
          </div>

          <button
            onClick={() => {
              try {
                const extended = !!(window.screen as any)?.isExtended;
                setIsExtendedDisplay(extended);
              } catch {}
            }}
            className="w-full py-3 bg-[#2F5CFF] hover:bg-[#0037FF] text-white font-semibold text-sm rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
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
        <div className="bg-white dark:bg-slate-900 border border-[#B3C5FF] dark:border-slate-700 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 bg-[#EAF0FF] dark:bg-slate-800 border border-[#B3C5FF] dark:border-slate-700 rounded-full flex items-center justify-center mx-auto text-[#2F5CFF] animate-bounce">
            <Maximize size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Assessment Full-Screen Required
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Your assessment session is actively timed. To preserve testing integrity, all modules must be completed in full-screen mode.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 text-left">
            <ShieldAlert size={18} className="text-[#2F5CFF] shrink-0" />
            <span>Exiting full-screen or switching applications is recorded in your proctoring audit log.</span>
          </div>

          <button
            onClick={handleRequestFullscreen}
            className="w-full py-3 bg-[#2F5CFF] hover:bg-[#0037FF] text-white font-semibold text-sm rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer flex items-center justify-center gap-2"
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
