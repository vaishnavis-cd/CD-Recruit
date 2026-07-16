import { useState } from "react";
import { CardLayout } from "@/components/layout/CardLayout";
import { CheckCircle, ShieldAlert, Star, ExternalLink } from "lucide-react";

export function ThankYouPage() {
  const [rating, setRating] = useState<number | null>(null);
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const sessionRefId = "cdr-sess-6f2b8a1c-99d0";

  return (
    <CardLayout>
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-success/10 text-success mb-6">
          <CheckCircle className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight mb-2">Assessment Completed</h1>
        <p className="text-text-secondary text-sm mb-6">
          Thank you for taking the time to complete this evaluation. Your responses have been securely locked.
        </p>

        {/* Reference ID & proctor release confirmation banner */}
        <div className="bg-surface border border-border-token rounded-xl p-5 mb-8 text-left space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-secondary font-semibold uppercase tracking-wider">Session Ref ID</span>
            <span className="font-mono font-bold text-text-primary bg-bg border border-border-token px-2 py-0.5 rounded">{sessionRefId}</span>
          </div>

          <div className="h-px bg-border-token" />

          <div className="flex items-start gap-2.5 text-xs text-text-secondary">
            <ShieldAlert className="w-4.5 h-4.5 text-success shrink-0" />
            <p className="leading-relaxed">
              <strong>Media Release Confirmed:</strong> Access to your webcam and audio devices has been successfully released. Proctoring streams are inactive.
            </p>
          </div>
        </div>

        {/* Micro-survey */}
        {!surveySubmitted ? (
          <div className="border border-border-token rounded-xl p-5 mb-8 bg-surface/30 text-left">
            <h3 className="text-sm font-bold text-text-primary mb-1">Optional Experience Survey</h3>
            <p className="text-xs text-text-secondary mb-4">How would you rate your candidate assessment experience?</p>
            <div className="flex gap-2.5 mb-4">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    rating === star
                      ? "bg-accent border-accent text-white"
                      : "bg-bg border-border-token text-text-secondary hover:bg-surface"
                  }`}
                >
                  <Star className="w-5 h-5 fill-current" />
                </button>
              ))}
            </div>
            {rating !== null && (
              <button
                onClick={() => setSurveySubmitted(true)}
                className="px-4 py-2 bg-accent text-white hover:bg-accent-hover font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Submit Feedback
              </button>
            )}
          </div>
        ) : (
          <div className="bg-success/5 border border-success/15 rounded-xl p-4 mb-8 text-xs text-success font-semibold">
            ✓ Feedback submitted. Thank you for your feedback!
          </div>
        )}

        {/* Learning hub & timeline info */}
        <div className="text-left bg-surface border border-border-token rounded-xl p-5 mb-6 text-xs">
          <h3 className="font-bold text-sm text-text-primary mb-2">What Happens Next?</h3>
          <p className="text-text-secondary leading-relaxed mb-4">
            Our system is grading your submissions asynchronously. Your recruiter will review the dual-rubric grading report and follow up with you directly.
          </p>
          <div className="h-px bg-border-token my-4" />
          <h4 className="font-bold text-text-primary mb-2">CD-Recruit Learning Hub</h4>
          <p className="text-text-secondary leading-relaxed mb-3">
            Accelerate your career with selected resources aligned with today's SWE roles:
          </p>
          <a
            href="https://cd-recruit.com/learning-hub"
            className="inline-flex items-center gap-1 text-accent font-semibold hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Explore learning materials</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </CardLayout>
  );
}
