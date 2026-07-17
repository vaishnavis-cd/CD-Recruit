import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { formatCountdown } from "@/lib/time-gate";
import { AlertTriangle, Book, Code2, ArrowRight, Play, Server, MessageSquare, Loader2 } from "lucide-react";
import { useSessionStore } from "@/store/session.store";
import { getQuestion } from "@/api/session";

interface QuestionItem {
  id: string;
  moduleType: "MCQ" | "SQL" | "CODING" | "AI_PROMPTING" | "SIMULATION";
  index: number;
  status: "unvisited" | "skipped" | "flagged" | "answered";
  title: string;
  prompt: string;
  content?: any;
}

export function AssessmentShell() {
  const navigate = useNavigate();
  const sessionId = useSessionStore((s) => s.sessionId);
  const sessionQuestions = useSessionStore((s) => s.questions);
  const deadlineAt = useSessionStore((s) => s.deadlineAt);

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [activeQId, setActiveQId] = useState("");
  const [timeLeft, setTimeLeft] = useState(45 * 60 * 1000);
  const [loading, setLoading] = useState(true);

  // Load questions details from backend
  useEffect(() => {
    if (!sessionId || sessionQuestions.length === 0) {
      setLoading(false);
      return;
    }

    const loadQuestions = async () => {
      try {
        const loaded = await Promise.all(
          sessionQuestions.map(async (sq, idx) => {
            const detail = await getQuestion(sessionId, sq.questionId);
            const content = detail.content as any;
            
            // Try to resolve titles/prompts for different types
            let title = content.title || `${sq.moduleType} Question ${idx + 1}`;
            let prompt = content.prompt || "";
            
            if (sq.moduleType === "MCQ") {
              title = `Multiple Choice Q${sq.moduleIndex + 1}`;
            } else if (sq.moduleType === "SQL") {
              title = `SQL Query Q${sq.moduleIndex + 1}`;
            } else if (sq.moduleType === "CODING") {
              title = `Coding Challenge Q${sq.moduleIndex + 1}`;
            } else if (sq.moduleType === "AI_PROMPTING") {
              title = `AI Prompting Q${sq.moduleIndex + 1}`;
            }

            return {
              id: sq.questionId,
              moduleType: sq.moduleType as any,
              index: sq.moduleIndex,
              status: "unvisited" as const,
              title,
              prompt,
              content,
            };
          })
        );
        setQuestions(loaded);
        if (loaded.length > 0) {
          setActiveQId(loaded[0].id);
        }
      } catch (err) {
        console.error("Failed to load session questions:", err);
      } finally {
        setLoading(false);
      }
    };

    void loadQuestions();
  }, [sessionId, sessionQuestions]);

  // Sync deadline timer
  useEffect(() => {
    if (!deadlineAt) return;

    const targetTime = new Date(deadlineAt).getTime();
    
    const updateTimer = () => {
      const now = Date.now();
      const diff = targetTime - now;
      if (diff <= 0) {
        setTimeLeft(0);
        navigate("/sync-validation");
      } else {
        setTimeLeft(diff);
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [deadlineAt, navigate]);

  const activeQuestion = questions.find(q => q.id === activeQId) || questions[0];

  const updateQuestionStatus = (status: "unvisited" | "skipped" | "flagged" | "answered") => {
    setQuestions(prev => prev.map(q => q.id === activeQId ? { ...q, status } : q));
  };

  const handleNext = () => {
    const currentIndex = questions.findIndex(q => q.id === activeQId);
    if (currentIndex < questions.length - 1) {
      setActiveQId(questions[currentIndex + 1].id);
    } else {
      navigate("/pre-submit", { state: { questions } });
    }
  };

  const isTimePressure = timeLeft <= 10 * 60 * 1000;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-primary">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <span className="text-xs font-semibold tracking-wider text-text-secondary">Loading questions from backend...</span>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-primary p-6 text-center">
        <div>
          <AlertTriangle className="w-12 h-12 text-warning mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">No Questions Assigned</h2>
          <p className="text-sm text-text-secondary max-w-md">
            This drive or role template does not have any questions configured. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const defaultTextareaValue = activeQuestion?.moduleType === "CODING"
    ? (activeQuestion.content?.starterCode || "")
    : activeQuestion?.moduleType === "SQL"
    ? `-- Database Schema:\n${activeQuestion.content?.schema || ""}\n\n-- Seed Data:\n${activeQuestion.content?.seedData || ""}\n\n-- Write your query below:\n`
    : "";

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text-primary transition-colors duration-200">
      <Header
        showTimer={true}
        timeLeftLabel={formatCountdown(timeLeft)}
        showProctorStatus={true}
      />

      <main className="flex-1 flex overflow-hidden">
        {/* Left Side: Question List / Info Panel */}
        <div className="w-80 border-r border-border-token flex flex-col bg-surface/30">
          <div className="p-4 border-b border-border-token">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">Question Palette</h3>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => setActiveQId(q.id)}
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    activeQId === q.id
                      ? "ring-2 ring-accent border-accent text-accent"
                      : q.status === "answered"
                      ? "bg-success/10 border-success/35 text-success"
                      : q.status === "flagged"
                      ? "bg-warning/10 border-warning/35 text-warning"
                      : q.status === "skipped"
                      ? "bg-surface border-border-token text-text-secondary"
                      : "bg-surface border-transparent text-text-secondary/60"
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Assessment Modules</h3>
            {questions.map(q => (
              <button
                key={q.id}
                onClick={() => setActiveQId(q.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                  activeQId === q.id
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
                    {q.moduleType} (Q{q.index + 1})
                  </div>
                  <div className="truncate text-xs">{q.title}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Center/Right Side: Workspace Split Pane */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-bg">
          <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-border-token">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-surface text-text-secondary border border-border-token mb-4">
                {activeQuestion.moduleType} (Q{activeQuestion.index + 1})
              </div>
              <h2 className="text-xl font-extrabold mb-4">{activeQuestion.title}</h2>
              <p className="text-sm text-text-secondary leading-relaxed mb-6 whitespace-pre-line">
                {activeQuestion.prompt}
              </p>

              {activeQuestion.moduleType === "MCQ" && activeQuestion.content?.options && (
                <div className="space-y-2.5 mt-6">
                  {activeQuestion.content.options.map((opt: string, optIdx: number) => (
                    <label key={optIdx} className="flex items-center gap-3 p-3 rounded-xl border border-border-token hover:bg-surface cursor-pointer bg-surface/50 transition-colors">
                      <input type="radio" name={`mcq-${activeQuestion.id}`} value={optIdx} className="w-4 h-4 accent-accent cursor-pointer" />
                      <span className="text-xs text-text-primary font-medium">{opt}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-8 border-t border-border-token pt-4">
              <div className="flex gap-2">
                <button
                  onClick={() => updateQuestionStatus("flagged")}
                  className="px-4 py-2 border border-warning/30 hover:bg-warning/5 text-warning text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Flag for Review
                </button>
                <button
                  onClick={() => updateQuestionStatus("skipped")}
                  className="px-4 py-2 border border-border-token hover:bg-surface text-text-secondary text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Skip Question
                </button>
              </div>

              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white hover:bg-accent-hover text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-surface/10 overflow-hidden">
            <div className="bg-surface border-b border-border-token px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-text-secondary font-mono">
                {activeQuestion.moduleType === "CODING" ? "Workspace.py" : activeQuestion.moduleType === "SQL" ? "query.sql" : "Workspace.txt"}
              </span>
              <div className="flex gap-2">
                {(activeQuestion.moduleType === "CODING" || activeQuestion.moduleType === "SQL") && (
                  <button
                    onClick={() => updateQuestionStatus("answered")}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-surface border border-border-token hover:bg-surface/80 text-text-primary text-xs font-semibold rounded transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 text-success" />
                    <span>Run Code</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    updateQuestionStatus("answered");
                    handleNext();
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>Submit Answer</span>
                </button>
              </div>
            </div>

            <textarea
              key={activeQuestion?.id}
              className="flex-1 p-6 font-mono text-xs bg-bg text-text-primary focus:outline-none resize-none"
              defaultValue={defaultTextareaValue}
              placeholder={activeQuestion.moduleType === "AI_PROMPTING" ? "Type your prompt here..." : "Type your response here..."}
            />
          </div>
        </div>
      </main>

      {isTimePressure && (
        <div className="bg-warning text-white py-2 px-4 text-center text-xs font-semibold flex items-center justify-center gap-2 animate-bounce">
          <AlertTriangle className="w-4 h-4 animate-pulse" />
          <span>Warning: Less than {Math.ceil(timeLeft / 60000)} minutes remaining. Answers autosave automatically.</span>
        </div>
      )}
    </div>
  );
}
