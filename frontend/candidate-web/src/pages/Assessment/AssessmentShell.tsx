import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { formatCountdown } from "@/lib/time-gate";
import { AlertTriangle, Book, Code2, MessageSquare, ArrowRight, Loader2 } from "lucide-react";
import { useSessionStore } from "@/store/session.store";
import apiClient from "@/api/client";
import { McqPane } from "@/components/mcq/McqPane";
import { SqlPane } from "@/components/sql/SqlPane";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuleType = "MCQ" | "SQL" | "CODING" | "AI_PROMPTING" | "SIMULATION";
type AnswerStatus = "untouched" | "draft" | "submitted";
type UIStatus = "unvisited" | "answered" | "flagged" | "skipped";

interface QuestionListItem {
  questionId: string;
  moduleType: ModuleType;
  moduleIndex: number;
  status: AnswerStatus;
}

interface QuestionDetail {
  id: string;
  moduleType: ModuleType;
  content: any;
  difficulty?: string;
  tags: string[];
  draftResponse: {
    content: any;
    isDraft: boolean;
    lastAutosavedAt: string | null;
  } | null;
}

// Map server status → UI status
function toUIStatus(s: AnswerStatus): UIStatus {
  if (s === "submitted") return "answered";
  if (s === "draft") return "flagged";
  return "unvisited";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssessmentShell() {
  const navigate = useNavigate();
  const sessionId = useSessionStore((s) => s.sessionId);
  const deadlineAt = useSessionStore((s) => s.deadlineAt);

  // Question list from /progress
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [progressLoading, setProgressLoading] = useState(true);

  // Active question detail from /questions/:id
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<QuestionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Countdown
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!deadlineAt) return 60 * 60 * 1000;
    return Math.max(0, new Date(deadlineAt).getTime() - Date.now());
  });

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1000) {
          clearInterval(timer);
          navigate("/sync-validation");
          return 0;
        }
        return t - 1000;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [navigate]);

  // ── Load question list from real backend ───────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    setProgressLoading(true);
    apiClient
      .get(`/sessions/${sessionId}/progress`)
      .then(({ data }) => {
        setQuestions(data.questions ?? []);
        if (data.questions?.length > 0) {
          setActiveQuestionId(data.questions[0].questionId);
        }
      })
      .catch((err) => {
        console.error("Failed to load question progress:", err);
      })
      .finally(() => setProgressLoading(false));
  }, [sessionId]);

  // ── Load question detail when active question changes ─────────────────────
  useEffect(() => {
    if (!sessionId || !activeQuestionId) return;
    setDetailLoading(true);
    setActiveDetail(null);
    apiClient
      .get(`/sessions/${sessionId}/questions/${activeQuestionId}`)
      .then(({ data }) => setActiveDetail(data))
      .catch((err) => console.error("Failed to load question:", err))
      .finally(() => setDetailLoading(false));
  }, [sessionId, activeQuestionId]);

  // ── Draft save ─────────────────────────────────────────────────────────────
  const saveDraft = useCallback(
    async (questionId: string, moduleType: ModuleType, content: any) => {
      if (!sessionId) return;
      try {
        await apiClient.post(`/sessions/${sessionId}/responses/draft`, {
          questionId,
          moduleType,
          content,
        });
        // Update local status to "draft" if still untouched
        setQuestions((prev) =>
          prev.map((q) =>
            q.questionId === questionId && q.status === "untouched"
              ? { ...q, status: "draft" }
              : q,
          ),
        );
      } catch (err) {
        console.warn("Draft autosave failed:", err);
      }
    },
    [sessionId],
  );

  // ── Submit response ────────────────────────────────────────────────────────
  const submitResponse = useCallback(
    async (questionId: string, moduleType: ModuleType, content: any) => {
      if (!sessionId) return;
      try {
        await apiClient.post(`/sessions/${sessionId}/responses/submit`, {
          questionId,
          moduleType,
          content,
        });
        // Mark as submitted in the list
        setQuestions((prev) =>
          prev.map((q) =>
            q.questionId === questionId ? { ...q, status: "submitted" } : q,
          ),
        );
        // Update active detail to show locked state
        setActiveDetail((prev) =>
          prev ? { ...prev, draftResponse: prev.draftResponse ? { ...prev.draftResponse, isDraft: false } : null } : prev,
        );
      } catch (err: any) {
        const code = err?.response?.data?.code;
        if (code === "RESPONSE_ALREADY_SUBMITTED") {
          alert("This answer has already been submitted.");
        } else {
          console.error("Submit failed:", err);
        }
      }
    },
    [sessionId],
  );

  const handleNext = () => {
    const currentIndex = questions.findIndex((q) => q.questionId === activeQuestionId);
    if (currentIndex < questions.length - 1) {
      setActiveQuestionId(questions[currentIndex + 1].questionId);
    } else {
      navigate("/pre-submit");
    }
  };

  const isTimePressure = timeLeft <= 10 * 60 * 1000;
  const activeQ = questions.find((q) => q.questionId === activeQuestionId);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (progressLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text-primary transition-colors duration-200">
      <Header
        showTimer={true}
        timeLeftLabel={formatCountdown(timeLeft)}
        showProctorStatus={true}
      />

      <main className="flex-1 flex overflow-hidden">
        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <div className="w-80 border-r border-border-token flex flex-col bg-surface/30">
          <div className="p-4 border-b border-border-token">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">
              Question Palette
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const ui = toUIStatus(q.status);
                return (
                  <button
                    key={q.questionId}
                    onClick={() => setActiveQuestionId(q.questionId)}
                    className={`aspect-square flex items-center justify-center rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      activeQuestionId === q.questionId
                        ? "ring-2 ring-accent border-accent text-accent"
                        : ui === "answered"
                        ? "bg-success/10 border-success/35 text-success"
                        : ui === "flagged"
                        ? "bg-warning/10 border-warning/35 text-warning"
                        : "bg-surface border-transparent text-text-secondary/60"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
              Assessment Modules
            </h3>
            {questions.map((q) => (
              <button
                key={q.questionId}
                onClick={() => setActiveQuestionId(q.questionId)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                  activeQuestionId === q.questionId
                    ? "bg-accent/10 border-accent/25 text-accent font-semibold"
                    : "bg-transparent border-transparent hover:bg-surface text-text-secondary"
                }`}
              >
                {q.moduleType === "CODING" ? (
                  <Code2 className="w-4 h-4" />
                ) : q.moduleType === "SIMULATION" ? (
                  <MessageSquare className="w-4 h-4" />
                ) : (
                  <Book className="w-4 h-4" />
                )}
                <div className="truncate">
                  <div className="font-bold text-text-primary text-[11px] uppercase tracking-wider">
                    {q.moduleType} (Q{q.moduleIndex + 1})
                  </div>
                  <div className="truncate text-xs text-text-secondary capitalize">
                    {q.status}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Workspace ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-bg">
          {detailLoading && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          )}

          {!detailLoading && activeDetail && activeQ && (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Question prompt pane */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-border-token">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-surface text-text-secondary border border-border-token mb-4">
                    {activeQ.moduleType} (Q{activeQ.moduleIndex + 1})
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {activeDetail.content?.prompt ?? ""}
                  </p>
                </div>

                <div className="flex items-center justify-end mt-8 border-t border-border-token pt-4">
                  <button
                    onClick={handleNext}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white hover:bg-accent-hover text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Answer workspace */}
              <div className="flex-1 flex flex-col overflow-hidden bg-surface/10">
                {activeQ.moduleType === "MCQ" && (
                  <McqPane
                    sessionId={sessionId!}
                    questionId={activeDetail.id}
                    prompt={activeDetail.content?.prompt ?? ""}
                    options={activeDetail.content?.options ?? []}
                    draftContent={activeDetail.draftResponse?.content ?? null}
                    isSubmitted={activeQ.status === "submitted"}
                    onDraftSave={(content) =>
                      saveDraft(activeDetail.id, "MCQ", content)
                    }
                    onSubmit={(content) =>
                      submitResponse(activeDetail.id, "MCQ", content)
                    }
                  />
                )}

                {activeQ.moduleType === "SQL" && (
                  <SqlPane
                    sessionId={sessionId!}
                    questionId={activeDetail.id}
                    schema={activeDetail.content?.schema ?? ""}
                    seedData={activeDetail.content?.seedData}
                    draftContent={activeDetail.draftResponse?.content ?? null}
                    isSubmitted={activeQ.status === "submitted"}
                    onDraftSave={(content) =>
                      saveDraft(activeDetail.id, "SQL", content)
                    }
                    onSubmit={(content) =>
                      submitResponse(activeDetail.id, "SQL", content)
                    }
                  />
                )}

                {(activeQ.moduleType === "CODING" ||
                  activeQ.moduleType === "AI_PROMPTING" ||
                  activeQ.moduleType === "SIMULATION") && (
                  <div className="flex-1 flex flex-col">
                    <div className="bg-surface border-b border-border-token px-4 py-2.5">
                      <span className="text-xs font-bold text-text-secondary font-mono">
                        {activeQ.moduleType} — coming in Phase {activeQ.moduleType === "CODING" ? "6" : "7"}
                      </span>
                    </div>
                    <textarea
                      className="flex-1 p-6 font-mono text-xs bg-bg text-text-primary focus:outline-none resize-none"
                      placeholder={`# ${activeQ.moduleType} answer workspace\n# Full editor coming soon`}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {!detailLoading && !activeDetail && !progressLoading && (
            <div className="flex-1 flex items-center justify-center text-text-secondary text-sm">
              Select a question from the sidebar to begin.
            </div>
          )}
        </div>
      </main>

      {isTimePressure && (
        <div className="bg-warning text-white py-2 px-4 text-center text-xs font-semibold flex items-center justify-center gap-2 animate-bounce">
          <AlertTriangle className="w-4 h-4 animate-pulse" />
          <span>
            Warning: Less than {Math.ceil(timeLeft / 60000)} minutes remaining.
            Answers autosave automatically.
          </span>
        </div>
      )}
    </div>
  );
}
