import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, CloudCheck } from 'lucide-react';

export function NetworkStatusBar() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [showRestored, setShowRestored] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showRestored) return null;

  if (!isOnline) {
    return (
      <div className="fixed top-0 inset-x-0 z-[9990] bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-md animate-in slide-in-from-top duration-200">
        <WifiOff size={16} className="animate-pulse text-slate-950 shrink-0" />
        <span>Internet connection interrupted. Your answers are buffered locally in this browser. Please reconnect to submit.</span>
      </div>
    );
  }

  if (showRestored) {
    return (
      <div className="fixed top-0 inset-x-0 z-[9990] bg-emerald-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-md animate-in slide-in-from-top duration-200">
        <Wifi size={16} className="shrink-0 text-emerald-200" />
        <span>Connection restored! Telemetry and draft answers synced with server.</span>
      </div>
    );
  }

  return null;
}
