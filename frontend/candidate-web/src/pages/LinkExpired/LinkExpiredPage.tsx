import { useLocation, useNavigate } from "react-router-dom";
import { CardLayout } from "@/components/layout/CardLayout";
import { AlertCircle, ArrowLeft, Mail } from "lucide-react";

export function LinkExpiredPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as {
    reason?: "grace_exceeded" | "drive_closed" | string;
    recruiterEmail?: string;
  } | null;

  const reason = state?.reason || "grace_exceeded";
  const recruiterEmail = state?.recruiterEmail || "recruiting@cd-recruit.com";

  return (
    <CardLayout>
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-critical/10 text-critical mb-6">
          <AlertCircle className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight mb-3">
          {reason === "drive_closed" ? "Assessment Window Closed" : "Link Expired"}
        </h1>
        
        <p className="text-sm text-text-secondary mb-8 leading-relaxed max-w-sm mx-auto">
          {reason === "drive_closed" ? (
            "The recruitment drive associated with this assessment has been concluded or cancelled early by the recruiter."
          ) : (
            "You have clicked this link after the grace entry window (T + 20 minutes) concluded. Assessment appointments must be started on time."
          )}
        </p>

        <div className="bg-surface border border-border-token rounded-xl p-5 mb-8 text-left space-y-3">
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-1">What should I do?</h3>
          <p className="text-xs text-text-secondary leading-relaxed">
            Please contact your recruiting representative to inquire about rescheduling options or drive extensions. 
            Provide your session details and scheduled time slot.
          </p>

          <div className="h-px bg-border-token my-3" />

          <div className="flex items-center gap-2 text-xs text-text-primary">
            <Mail className="w-4 h-4 text-accent" />
            <span>Recruiter Support:</span>
            <a href={`mailto:${recruiterEmail}`} className="font-semibold text-accent hover:underline">
              {recruiterEmail}
            </a>
          </div>
        </div>

        <button
          onClick={() => navigate("/login")}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface hover:bg-surface/85 border border-border-token text-text-primary text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Check-in</span>
        </button>
      </div>
    </CardLayout>
  );
}
