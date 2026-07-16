import { useSessionStore } from "@/store/session.store";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Clock } from "lucide-react";

interface HeaderProps {
  showTimer?: boolean;
  timeLeftLabel?: string;
  showProctorStatus?: boolean;
}

export function Header({ showTimer = false, timeLeftLabel = "00:00:00", showProctorStatus = false }: HeaderProps) {
  const roleTemplateName = useSessionStore((s) => s.roleTemplateName);
  const cvMode = useSessionStore((s) => s.cvMode);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border-token bg-bg/95 backdrop-blur-md px-6 py-4 flex items-center justify-between transition-colors">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent text-white font-bold text-lg">
          CD
        </div>
        <div>
          <span className="font-bold text-text-primary text-base tracking-tight">CD-Recruit</span>
          {roleTemplateName && (
            <span className="hidden sm:inline-block ml-3 px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface text-text-secondary border border-border-token">
              {roleTemplateName}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {showProctorStatus && cvMode && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border-token text-xs text-text-secondary">
            <span className={`w-2 h-2 rounded-full ${cvMode === "FULL" ? "bg-success" : "bg-warning"}`} />
            <span>Camera Active {cvMode === "FULL" ? "(Proctored)" : "(Lite)"}</span>
          </div>
        )}

        {showTimer && (
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-warning/10 border border-warning text-warning text-sm font-mono font-semibold">
            <Clock className="w-4 h-4" />
            <span>{timeLeftLabel}</span>
          </div>
        )}

        <ThemeToggle />
      </div>
    </header>
  );
}
