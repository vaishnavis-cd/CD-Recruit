import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { formatCountdown } from "@/lib/time-gate";
import { AlertTriangle, Book, Code2, ArrowRight, Play, Server, MessageSquare } from "lucide-react";

interface QuestionItem {
  id: string;
  moduleType: "MCQ" | "SQL" | "CODING" | "AI_PROMPTING" | "SIMULATION";
  index: number;
  status: "unvisited" | "skipped" | "flagged" | "answered";
  title: string;
  prompt: string;
}

export function AssessmentShell() {
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<QuestionItem[]>([
    { id: "q1", moduleType: "MCQ", index: 0, status: "answered", title: "Core Architecture", prompt: "Identify the primary advantage of on-device CV inference..." },
    { id: "q2", moduleType: "MCQ", index: 1, status: "flagged", title: "DPDP Data Retention", prompt: "Under India's DPDP Act, biometric clips must be..." },
    { id: "q3", moduleType: "CODING", index: 0, status: "skipped", title: "Say-Do Correlation", prompt: "Implement an algorithm to correlate keystroke logs with..." },
    { id: "q4", moduleType: "CODING", index: 1, status: "unvisited", title: "Rate-Limiting Buffer", prompt: "Implement a sliding-window rate limiter in JS..." },
    { id: "q5", moduleType: "SIMULATION", index: 0, status: "unvisited", title: "Scenario Trigger Response", prompt: "Respond to the simulated incident alert from the security team..." },
  ]);

  const [activeQId, setActiveQId] = useState("q1");
  const [timeLeft, setTimeLeft] = useState(45 * 60 * 1000);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(t => {
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
              <p className="text-sm text-text-secondary leading-relaxed mb-6">
                {activeQuestion.prompt}
              </p>
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
              <span className="text-xs font-bold text-text-secondary font-mono">Workspace.py</span>
              <div className="flex gap-2">
                <button
                  onClick={() => updateQuestionStatus("answered")}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-surface border border-border-token hover:bg-surface/80 text-text-primary text-xs font-semibold rounded transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-success" />
                  <span>Run Code</span>
                </button>
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
              className="flex-1 p-6 font-mono text-xs bg-bg text-text-primary focus:outline-none resize-none"
              defaultValue={`# Write your solution here\n\ndef solve_problem(inputs):\n    # TODO: Implement Say-Do consistency parser\n    pass\n`}
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
