import { useLocation, useNavigate } from "react-router-dom";
import { CardLayout } from "@/components/layout/CardLayout";
import { AlertOctagon, AlertTriangle } from "lucide-react";

interface QuestionItem {
  id: string;
  moduleType: string;
  index: number;
  status: "unvisited" | "skipped" | "flagged" | "answered";
  title: string;
}

export function PreSubmitPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as {
    questions?: QuestionItem[];
  } | null;

  const questions = state?.questions || [];

  const answered = questions.filter(q => q.status === "answered");
  const flagged = questions.filter(q => q.status === "flagged");
  const skipped = questions.filter(q => q.status === "skipped");
  const unvisited = questions.filter(q => q.status === "unvisited");

  const total = questions.length;
  const isComplete = answered.length === total;

  const handleSubmit = () => {
    navigate("/sync-validation");
  };

  return (
    <CardLayout maxWidthClass="max-w-2xl">
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent mb-6">
          <AlertOctagon className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight mb-2">Final Review & Submit</h1>
        <p className="text-text-secondary text-sm mb-8">
          Please confirm your answer states before completing the session.
        </p>

        {/* Completion status summary grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface border border-border-token rounded-xl p-4 text-center">
            <span className="text-2xl font-bold text-success">{answered.length}</span>
            <div className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mt-1">Answered</div>
          </div>
          <div className="bg-surface border border-border-token rounded-xl p-4 text-center">
            <span className="text-2xl font-bold text-warning">{flagged.length}</span>
            <div className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mt-1">Flagged</div>
          </div>
          <div className="bg-surface border border-border-token rounded-xl p-4 text-center">
            <span className="text-2xl font-bold text-text-secondary">{skipped.length}</span>
            <div className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mt-1">Skipped</div>
          </div>
          <div className="bg-surface border border-border-token rounded-xl p-4 text-center">
            <span className="text-2xl font-bold text-text-secondary/50">{unvisited.length}</span>
            <div className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mt-1">Unvisited</div>
          </div>
        </div>

        {/* Action detail warnings */}
        {!isComplete && (
          <div className="p-4 bg-warning/10 border border-warning/30 rounded-xl text-left flex gap-3 mb-8">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-warning uppercase tracking-wider mb-1">Unfinished Items</h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                You have {total - answered.length} question(s) that are flagged, skipped, or unvisited. 
                Submitting now will finalize your current answers as they are.
              </p>
            </div>
          </div>
        )}

        <div className="p-4 bg-critical/5 border border-critical/20 rounded-xl text-left text-xs mb-8 text-text-secondary">
          <p className="leading-relaxed">
            ⚠️ <strong>Warning:</strong> This action is irreversible. Once you submit, you will lose access to this assessment environment and cannot resume or review.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex-1 py-3 bg-surface hover:bg-surface/80 border border-border-token text-text-primary font-semibold rounded-xl transition-colors cursor-pointer text-sm"
          >
            Back to Assessment
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-3 bg-accent text-white hover:bg-accent-hover font-semibold rounded-xl shadow-lg transition-colors cursor-pointer text-sm"
          >
            Submit Final Assessment
          </button>
        </div>
      </div>
    </CardLayout>
  );
}
