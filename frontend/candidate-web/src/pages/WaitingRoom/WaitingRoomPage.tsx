import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CardLayout } from "@/components/layout/CardLayout";
import { formatCountdown } from "@/lib/time-gate";
import { Clock, ExternalLink, HelpCircle } from "lucide-react";

export function WaitingRoomPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as {
    scheduledTime?: string;
    bufferMinutes?: number;
    graceMinutes?: number;
    reducedProctoring?: boolean;
    selfieDataUrl?: string | null;
  } | null;

  const scheduledTime = state?.scheduledTime || new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const [currentTime, setCurrentTime] = useState(Date.now());
  const tMs = new Date(scheduledTime).getTime();
  const msUntilTest = tMs - currentTime;

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);

      if (now >= tMs) {
        clearInterval(timer);
        navigate("/assessment", { state });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [scheduledTime, navigate, state, tMs]);

  return (
    <CardLayout>
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-warning/10 text-warning mb-6 animate-pulse">
          <Clock className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight mb-3">Lobby Waiting Room</h1>
        <p className="text-text-secondary text-sm mb-6">
          Your details are registered. The assessment will begin automatically at the scheduled time.
        </p>

        {/* Countdown */}
        <div className="bg-surface border border-border-token rounded-xl p-5 mb-8 text-center">
          <div className="text-xs text-text-secondary uppercase font-semibold tracking-wider mb-1">Assessment Starts In</div>
          <div className="text-4xl font-mono font-bold text-accent tracking-widest">
            {msUntilTest > 0 ? formatCountdown(msUntilTest) : "00:00:00"}
          </div>
        </div>

        {/* What to expect FAQ */}
        <div className="text-left bg-surface/50 border border-border-token rounded-xl p-5 mb-8 text-xs space-y-4">
          <h3 className="font-bold text-sm text-text-primary flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-accent" />
            Frequently Asked Questions
          </h3>
          
          <div>
            <h4 className="font-semibold text-text-primary mb-1">What happens when the timer hits zero?</h4>
            <p className="text-text-secondary">The screen will transition automatically into the test environment. You do not need to refresh.</p>
          </div>

          <div className="h-px bg-border-token" />

          <div>
            <h4 className="font-semibold text-text-primary mb-1">Can I navigate between questions?</h4>
            <p className="text-text-secondary">Yes. You can jump freely between any coding exercises or contextual chat simulations in any order.</p>
          </div>

          <div className="h-px bg-border-token" />

          <div>
            <h4 className="font-semibold text-text-primary mb-1">What if my connection drops?</h4>
            <p className="text-text-secondary">Simply reopen the link. You can resume exactly where you left off. Disconnected sessions remain open for up to 5 minutes.</p>
          </div>
        </div>

        {/* Support contact info */}
        <div className="text-xs text-text-secondary flex items-center justify-center gap-1">
          <span>Need help?</span>
          <a
            href="mailto:support@cd-recruit.com"
            className="text-accent font-semibold hover:underline flex items-center gap-0.5"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Contact Support</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </CardLayout>
  );
}
