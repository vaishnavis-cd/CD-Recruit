import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CardLayout } from "@/components/layout/CardLayout";
import { resolveTimeWindow, formatCountdown } from "@/lib/time-gate";
import { Calendar, RefreshCw } from "lucide-react";

export function TooEarlyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Extract configuration from route state or fallback to a future test time
  const state = location.state as {
    scheduledTime?: string;
    bufferMinutes?: number;
    graceMinutes?: number;
  } | null;

  const scheduledTime = state?.scheduledTime || new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const bufferMinutes = state?.bufferMinutes ?? 30;
  const graceMinutes = state?.graceMinutes ?? 20;

  const [currentTime, setCurrentTime] = useState(Date.now());
  const tMs = new Date(scheduledTime).getTime();
  const bufferStartMs = tMs - bufferMinutes * 60 * 1000;
  const msUntilBuffer = bufferStartMs - currentTime;

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);

      const status = resolveTimeWindow(now, {
        scheduledTime,
        bufferMinutes,
        graceMinutes
      });

      if (status !== "TOO_EARLY") {
        clearInterval(timer);
        navigate("/system-check", {
          state: { scheduledTime, bufferMinutes, graceMinutes }
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [scheduledTime, bufferMinutes, graceMinutes, navigate]);

  const localTimeStr = new Date(scheduledTime).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <CardLayout>
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent mb-6 animate-pulse">
          <Calendar className="w-8 h-8" />
        </div>
        
        <h1 className="text-2xl font-extrabold tracking-tight mb-3">Too Early to Start</h1>
        <p className="text-text-secondary text-sm mb-8">
          This assessment is scheduled for a specific time slot. Please return once the check-in window opens.
        </p>

        <div className="bg-surface border border-border-token rounded-xl p-6 mb-8 text-left">
          <div className="text-xs text-text-secondary uppercase font-semibold tracking-wider mb-1">Scheduled Time</div>
          <div className="text-lg font-bold text-text-primary mb-4">{localTimeStr}</div>

          <div className="h-px bg-border-token my-4" />

          <div className="text-xs text-text-secondary uppercase font-semibold tracking-wider mb-1">Check-in Opens In</div>
          <div className="text-3xl font-mono font-bold text-accent tracking-wider">
            {msUntilBuffer > 0 ? formatCountdown(msUntilBuffer) : "00:00:00"}
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Check-in opens {bufferMinutes} minutes before the start time.
          </p>
        </div>

        <button
          onClick={() => setCurrentTime(Date.now())}
          className="inline-flex items-center gap-2 text-xs font-semibold text-accent hover:text-accent-hover transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sync Clock</span>
        </button>
      </div>
    </CardLayout>
  );
}
