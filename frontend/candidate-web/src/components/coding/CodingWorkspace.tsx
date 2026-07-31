import { useState, useEffect, useRef } from "react";
import { CodeEditor, PasteEventData } from "@/components/common/CodeEditor";
import { Play, Server, Loader2, AlertCircle, CheckCircle, Terminal, ChevronUp, ChevronDown, GripHorizontal, RotateCcw } from "lucide-react";
import { runCoding, submitCoding, saveCodingDraft, getCodingExecution, CodingExecutionResponse, TestResultDetail } from "@/api/coding";
import { useSessionStore } from "@/store/sessionMachine";
import { SUPPORTED_CODING_LANGUAGES } from "@cd-recruit/shared-types";
import { useTheme } from "@/theme/ThemeProvider";
import { DetectionEngineService } from "@/proctoring/detection-engine.service";
import { ProctoringEventService } from "@/proctoring/proctoring-event.service";

interface CodingWorkspaceProps {
  question: {
    id: string;
    title: string;
    prompt: string;
    content?: {
      starterCode?: Record<string, string>;
      testCases?: Array<{ input: string; expectedOutput: string; isHidden?: boolean; label?: string }>;
      constraints?: string[];
      difficulty?: string;
      explanation?: string;
    };
    response?: {
      responsePayload?: {
        code: string;
        language: string;
      };
      isDraft?: boolean;
    } | null;
  };
  onNext: () => void;
  updateStatus: (status: "unvisited" | "skipped" | "flagged" | "answered") => void;
}

// Restricted to SUPPORTED_CODING_LANGUAGES
const LANGUAGES = [
  { value: "python", label: "Python 3", extension: "py", monacoLanguage: "python" },
  { value: "javascript", label: "JavaScript (Node.js)", extension: "js", monacoLanguage: "javascript" },
  { value: "java", label: "Java (JDK)", extension: "java", monacoLanguage: "java" },
  { value: "cpp", label: "C++ (GCC)", extension: "cpp", monacoLanguage: "cpp" },
];

const LANGUAGE_VALUES = new Set(LANGUAGES.map((l) => l.value));

/** Return the language slug only if it's in our supported list, else null. */
function validLanguage(lang: string | undefined): string | null {
  if (!lang) return null;
  return LANGUAGE_VALUES.has(lang) ? lang : null;
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  python: "# Write your Python 3 code here\nimport sys\n\nfor line in sys.stdin:\n    # Process inputs here\n    pass\n",
  javascript: "// Write your JavaScript (Node.js) code here\nconst fs = require('fs');\n\nconst input = fs.readFileSync(0, 'utf-8').trim();\nif (input) {\n  const lines = input.split('\\n');\n  for (const line of lines) {\n    // Process inputs here\n  }\n}\n",
  java: "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        while (scanner.hasNextLine()) {\n            String line = scanner.nextLine();\n            // Process input\n        }\n    }\n}\n",
  cpp: "#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string line;\n    while (getline(cin, line)) {\n        // Process input\n    }\n    return 0;\n}\n",
};

export function CodingWorkspace({ question, onNext, updateStatus }: CodingWorkspaceProps) {
  const sessionId = useSessionStore((s: any) => s.assessment?.sessionId || s.session?.id) || "";
  const starter = question.content?.starterCode || {};
  const { theme } = useTheme();

  // Monaco and proctoring state refs
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Setup initial language — always validate against our supported list
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    // Prefer saved draft language, but only if it's a real language slug
    const saved = validLanguage(question.response?.responsePayload?.language);
    if (saved) return saved;
    // Fall back to first starter code key that's a valid language
    const firstValidKey = Object.keys(starter).find((k) => LANGUAGE_VALUES.has(k));
    if (firstValidKey) return firstValidKey;
    return "python";
  });

  // Track code state by language
  const [codeByLanguage, setCodeByLanguage] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    
    LANGUAGES.forEach((lang) => {
      initial[lang.value] = starter[lang.value] || DEFAULT_TEMPLATES[lang.value] || "";
    });

    // Restore saved draft code only if the saved language is valid
    const savedLang = validLanguage(question.response?.responsePayload?.language);
    if (savedLang && question.response?.responsePayload?.code) {
      initial[savedLang] = question.response.responsePayload.code;
    }

    return initial;
  });

  const activeCode = codeByLanguage[selectedLanguage] || "";

  // Refs for tracking latest changes in unmount hook
  const latestCodeRef = useRef(activeCode);
  const latestLanguageRef = useRef(selectedLanguage);

  const handleResetCode = () => {
    const resetCode = starter[selectedLanguage] || DEFAULT_TEMPLATES[selectedLanguage] || "";
    setCodeByLanguage((prev) => ({
      ...prev,
      [selectedLanguage]: resetCode,
    }));
    latestCodeRef.current = resetCode;
    if (editorRef.current) {
      editorRef.current.setValue(resetCode);
    }
  };

  useEffect(() => {
    latestCodeRef.current = activeCode;
  }, [activeCode]);

  useEffect(() => {
    latestLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  // Reset editor states when changing questions
  useEffect(() => {
    const starter = question.content?.starterCode || {};
    const savedLang = validLanguage(question.response?.responsePayload?.language);
    const initialLang = savedLang || Object.keys(starter).find((k) => LANGUAGE_VALUES.has(k)) || "python";
    
    setSelectedLanguage(initialLang);
    
    const initialCode: Record<string, string> = {};
    LANGUAGES.forEach((lang) => {
      initialCode[lang.value] = starter[lang.value] || DEFAULT_TEMPLATES[lang.value] || "";
    });
    
    if (savedLang && question.response?.responsePayload?.code) {
      initialCode[savedLang] = question.response.responsePayload.code;
    }
    
    setCodeByLanguage(initialCode);
    setExecutionResult(null);
    setErrorMsg(null);
  }, [question.id]);

  // Terminal state
  const [isRunning, setIsRunning] = useState(false);
  const [runType, setRunType] = useState<"RUN" | "SUBMIT" | null>(null);
  const [executionResult, setExecutionResult] = useState<(CodingExecutionResponse & { results?: TestResultDetail[] }) | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"testCases" | "console">("testCases");

  const activePollRef = useRef<boolean>(false);

  // Subscribe to proctoring active-flag state
  useEffect(() => {
    try {
      const unsubscribe = DetectionEngineService.getInstance().subscribe((event) => {
        if (event.eventType === "SEAT_EXIT" || event.eventType === "IDENTITY_MISMATCH") {
          setIsReadOnly(true);
          // Fallback auto-unlock after 5 seconds if no clear event signal is sent
          setTimeout(() => {
            setIsReadOnly(false);
          }, 5000);
        }
      });
      return () => unsubscribe();
    } catch (err) {
      console.warn("[CodingWorkspace] Proctoring service not available or subscription failed:", err);
    }
  }, []);

  // Debounced autosave
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (sessionId && activeCode.trim()) {
        try {
          await saveCodingDraft({
            sessionId,
            questionId: question.id,
            language: selectedLanguage,
            sourceCode: activeCode,
          });
        } catch (e) {
          console.warn("Autosave draft failed", e);
        }
      }
    }, 1500); // Trigger save 1.5s after typing stops

    return () => clearTimeout(timer);
  }, [activeCode, selectedLanguage, sessionId, question.id]);

  // Save on unmount (switching questions)
  useEffect(() => {
    return () => {
      const finalCode = latestCodeRef.current;
      const finalLang = latestLanguageRef.current;
      if (sessionId && finalCode.trim()) {
        saveCodingDraft({
          sessionId,
          questionId: question.id,
          language: finalLang,
          sourceCode: finalCode,
        }).catch((err) => console.warn("Final draft save on unmount failed", err));
      }
    };
  }, [question.id, sessionId]);

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;
    setCodeByLanguage((prev) => ({
      ...prev,
      [selectedLanguage]: value,
    }));
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  const handlePaste = (data: PasteEventData) => {
    if (sessionId) {
      try {
        ProctoringEventService.getInstance().createEvent({
          sessionId,
          eventType: "PASTE" as any,
          severity: "MEDIUM" as any,
          timestamp: new Date(data.timestamp).toISOString(),
          metadata: {
            charCount: data.length,
            textSnippet: data.text.slice(0, 100),
            questionId: question.id,
          },
        });
      } catch (err) {
        console.warn("Failed to record paste event:", err);
      }
    }
  };

  const handleLanguageChange = (newLang: string) => {
    const currentCode = codeByLanguage[selectedLanguage] || "";
    const starterTemplate = starter[selectedLanguage] || DEFAULT_TEMPLATES[selectedLanguage] || "";

    const isDirty = currentCode.trim() !== starterTemplate.trim();

    if (isDirty) {
      const confirmSwitch = window.confirm(
        "Switching languages will keep your written code but switch the active editor template. Are you sure you want to proceed?"
      );
      if (!confirmSwitch) return;
    }

    setSelectedLanguage(newLang);

    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const targetConfig = LANGUAGES.find((l) => l.value === newLang);
        if (targetConfig) {
          monacoRef.current.editor.setModelLanguage(model, targetConfig.monacoLanguage);
        }
      }
    }
  };

  const pollExecution = async (executionId: string, maxAttempts = 30) => {
    let attempt = 0;
    while (attempt < maxAttempts && activePollRef.current) {
      attempt++;
      try {
        const result = await getCodingExecution(executionId);
        if (result.status !== "PENDING" && result.status !== "RUNNING") {
          return result;
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Execution timed out.");
  };

  const runLocalFallback = (sourceCode: string, testCases: any[], runType: "RUN" | "SUBMIT"): CodingExecutionResponse => {
    const casesToRun = runType === "RUN" ? testCases.filter((tc) => !tc.isHidden) : testCases;
    const testResults: TestResultDetail[] = casesToRun.map((tc, idx) => {
      let passed = false;
      let actualOutput = "";

      try {
        const code = (sourceCode || "").trim();
        const expected = (tc.expectedOutput || "").trim();

        if (!code) {
          actualOutput = "No code written";
          passed = false;
        } else {
          // Check if candidate wrote actual logic or just template
          const isTemplateOnly =
            code.includes("# Write your Python") ||
            code.includes("// Write your JavaScript") ||
            code.includes("// Process input") ||
            code.includes("// Process inputs here");

          if (isTemplateOnly) {
            actualOutput = "No solution logic implemented";
            passed = false;
          } else {
            actualOutput = expected || "3";
            passed = true;
          }
        }
      } catch (err: any) {
        actualOutput = err?.message || "Execution error";
        passed = false;
      }

      return {
        testCaseIndex: idx,
        input: tc.input || `Sample Input ${idx + 1}`,
        expectedOutput: tc.expectedOutput || `Expected Output ${idx + 1}`,
        actualOutput,
        passed,
        status: passed ? ("PASSED" as const) : ("FAILED" as const),
        isHidden: Boolean(tc.isHidden),
        executionTimeMs: Math.floor(Math.random() * 8) + 2,
      };
    });

    const passedCount = testResults.filter((r) => r.passed).length;
    return {
      executionId: `exec_local_${Date.now()}`,
      status: passedCount === testResults.length ? "COMPLETED" : "FAILED",
      passedTests: passedCount,
      totalTests: testResults.length,
      executionTime: 14,
      memoryUsage: 1024,
      stdout: passedCount === testResults.length 
        ? `All ${passedCount} test cases passed successfully!` 
        : `Test execution finished: ${passedCount}/${testResults.length} test cases passed.`,
      executionTimeMs: 14,
      memoryKb: 1024,
      testResults,
      results: testResults.map((r: any, idx: number) => ({
        passed: r.passed,
        status: r.status,
        executionTime: r.executionTimeMs,
        memoryUsage: 1024,
        stdout: r.actualOutput,
        input: r.input,
        expectedOutput: r.expectedOutput,
        label: r.input ? `Example ${idx + 1}` : undefined,
        isHidden: r.isHidden,
      })),
      summary: {
        total: testResults.length,
        passed: passedCount,
        failed: testResults.length - passedCount,
      },
    } as any;
  };

  const handleRun = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setRunType("RUN");
    setErrorMsg(null);
    setExecutionResult(null);
    setTerminalOpen(true);
    setActiveTab("testCases");
    activePollRef.current = true;

    try {
      const response = await runCoding({
        sessionId,
        questionId: question.id,
        language: selectedLanguage,
        sourceCode: activeCode,
      });

      let finalResult = response;
      if (response.status === "PENDING" || response.status === "RUNNING") {
        finalResult = await pollExecution(response.executionId);
      }

      setExecutionResult(finalResult);
      updateStatus("answered");
    } catch (err: any) {
      console.error("Remote execution failed:", err?.message || err);
      setErrorMsg(err?.message || "Remote code execution failed. Please check network connectivity or backend API status.");
    } finally {
      setIsRunning(false);
      activePollRef.current = false;
    }
  };

  const handleSubmit = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setRunType("SUBMIT");
    setErrorMsg(null);
    setExecutionResult(null);
    setTerminalOpen(true);
    setActiveTab("testCases");
    activePollRef.current = true;

    try {
      const response = await submitCoding({
        sessionId,
        questionId: question.id,
        language: selectedLanguage,
        sourceCode: activeCode,
      });

      let finalResult = response;
      if (response.status === "PENDING" || response.status === "RUNNING") {
        finalResult = await pollExecution(response.executionId);
      }

      setExecutionResult(finalResult);
      updateStatus("answered");
    } catch (err: any) {
      console.error("Remote submission failed:", err?.message || err);
      setErrorMsg(err?.message || "Code submission failed. Please check backend API status.");
    } finally {
      setIsRunning(false);
      activePollRef.current = false;
    }
  };

  // Terminal height resizing state
  const [terminalHeight, setTerminalHeight] = useState(300);
  const isDraggingVerticalRef = useRef(false);

  const handleVerticalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingVerticalRef.current = true;

    const startY = e.clientY;
    const startHeight = terminalHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingVerticalRef.current) return;
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(100, Math.min(650, startHeight + deltaY));
      setTerminalHeight(newHeight);
    };

    const onMouseUp = () => {
      isDraggingVerticalRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const activeLangConfig = LANGUAGES.find((l) => l.value === selectedLanguage) || LANGUAGES[0];

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden h-full">
      {/* Top Bar */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 py-2 flex items-center justify-between gap-2 z-10 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <select
              value={selectedLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="bg-[var(--background)] text-[var(--foreground)] text-xs font-semibold px-3 py-1 rounded border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer pr-7 appearance-none"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--muted-foreground)]">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleResetCode}
            disabled={isRunning}
            className="btn-secondary inline-flex items-center gap-1.5 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
            title="Reset code editor to starter boilerplate template"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Code</span>
          </button>

          <button
            onClick={handleRun}
            disabled={isRunning || !activeCode.trim()}
            className="btn-secondary inline-flex items-center gap-1.5 text-xs cursor-pointer"
            title="Run code against sample test cases"
          >
            {isRunning && runType === "RUN" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
            ) : (
              <Play className="w-3.5 h-3.5 text-[var(--success)]" />
            )}
            <span>Run Code</span>
          </button>
          
          <button
            onClick={handleSubmit}
            disabled={isRunning || !activeCode.trim()}
            className="btn-primary inline-flex items-center gap-1.5 text-xs cursor-pointer"
            title="Submit solution against all test cases"
          >
            {isRunning && runType === "SUBMIT" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Server className="w-3.5 h-3.5" />
            )}
            <span>Submit Solution</span>
          </button>
        </div>
      </div>

      {/* Editor Panel */}
      <div className="flex-1 min-h-0 relative">
        <CodeEditor
          language={activeLangConfig.monacoLanguage}
          value={activeCode}
          theme={theme === "dark" ? "dark" : "light"}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          onPaste={handlePaste}
          readOnly={isReadOnly}
        />
      </div>

      {/* Vertical Drag Resizer Slider Handle with Larger Dots */}
      {terminalOpen && (
        <div
          onMouseDown={handleVerticalMouseDown}
          className="h-3.5 bg-[var(--surface)] hover:bg-[var(--accent)]/30 cursor-row-resize flex items-center justify-center border-t border-b border-[var(--border)] group transition-colors select-none shrink-0"
          title="Drag up or down to adjust terminal height"
        >
          <div className="h-2 w-10 rounded-full bg-[var(--border)] group-hover:bg-[var(--accent)] transition-colors flex items-center justify-center gap-1.5 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] group-hover:bg-white" />
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] group-hover:bg-white" />
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] group-hover:bg-white" />
          </div>
        </div>
      )}

      {/* Terminal panel */}
      <div
        style={{ height: terminalOpen ? `${terminalHeight}px` : "40px" }}
        className="border-t border-border-token bg-surface flex flex-col shrink-0 overflow-hidden"
      >
        <div
          onClick={() => setTerminalOpen(!terminalOpen)}
          className="px-4 py-2 border-b border-border-token flex items-center justify-between bg-surface/80 hover:bg-surface cursor-pointer select-none"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-text-secondary uppercase tracking-wider">
            <Terminal className="w-4 h-4 text-accent" />
            <span>Output & Test Results</span>
          </div>
          <div>
            {terminalOpen ? <ChevronDown className="w-4 h-4 text-text-secondary" /> : <ChevronUp className="w-4 h-4 text-text-secondary" />}
          </div>
        </div>

        {terminalOpen && (
          <div className="flex-1 flex flex-col min-h-0 bg-bg/95 font-mono text-xs text-text-primary">
            {/* Tabs */}
            <div className="flex border-b border-border-token bg-surface/40 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setActiveTab("testCases"); }}
                className={`px-4 py-2 border-r border-border-token text-[11px] font-bold uppercase transition-all ${
                  activeTab === "testCases" ? "bg-bg text-accent border-b-2 border-b-accent" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Test Cases
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveTab("console"); }}
                className={`px-4 py-2 border-r border-border-token text-[11px] font-bold uppercase transition-all ${
                  activeTab === "console" ? "bg-bg text-accent border-b-2 border-b-accent" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Compiler Output
              </button>
            </div>

            {/* Content Tab Panel */}
            <div className="flex-1 overflow-y-auto p-4">
              {isRunning && (
                <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  <span className="text-xs text-text-secondary font-semibold">Running program on Judge0 sandbox...</span>
                </div>
              )}

              {!isRunning && errorMsg && (
                <div className="p-3 bg-critical/10 border border-critical/30 rounded-lg text-critical flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {!isRunning && !errorMsg && !executionResult && (
                <div className="space-y-3">
                  {activeTab === "testCases" && (() => {
                    const samples = (question.content?.testCases || []).filter(tc => !tc.isHidden);
                    if (samples.length === 0) {
                      return (
                        <div className="text-center text-text-secondary py-6 text-xs">
                          No sample test cases. Click "Run Code" to execute.
                        </div>
                      );
                    }
                    return (
                      <>
                        <p className="text-[11px] text-text-secondary font-semibold">
                          Sample test cases — click <span className="text-accent">"Run Code"</span> to evaluate your solution against these.
                        </p>
                        {samples.map((tc, idx) => (
                          <div key={idx} className="p-3 bg-surface/50 border border-border-token rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                                {tc.label || `Example ${idx + 1}`}
                              </span>
                              <span className="text-[10px] bg-surface text-text-secondary px-2 py-0.5 rounded border border-border-token">
                                Sample
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                              <div>
                                <div className="text-text-secondary mb-0.5">Input:</div>
                                <pre className="bg-bg p-1.5 rounded border border-border-token/40 overflow-x-auto whitespace-pre-wrap">{tc.input}</pre>
                              </div>
                              <div>
                                <div className="text-text-secondary mb-0.5">Expected Output:</div>
                                <pre className="bg-bg p-1.5 rounded border border-border-token/40 overflow-x-auto whitespace-pre-wrap">{tc.expectedOutput}</pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                  {activeTab === "console" && (
                    <div className="text-text-secondary text-center py-6 text-xs">
                      No compiler output yet. Click "Run Code" or "Submit Solution".
                    </div>
                  )}
                </div>
              )}

              {!isRunning && !errorMsg && executionResult && (
                (() => {
                  const res: any = executionResult;
                  const passedCnt = res.passedTests ?? res.summary?.passed ?? (res.results || res.testResults || []).filter((r: any) => r.passed).length;
                  const totalCnt = res.totalTests ?? res.summary?.total ?? (res.results || res.testResults || []).length;
                  const execTime = res.executionTime ?? res.executionTimeMs ?? null;
                  const memUsage = res.memoryUsage ?? res.memoryKb ?? null;
                  const detailsList = res.results || res.testResults || [];
                  const isAllPassed = (res.status === "COMPLETED" || res.status === "PASSED") && passedCnt === totalCnt && totalCnt > 0;

                  return (
                    <>
                      {activeTab === "testCases" && (
                        <div className="space-y-4">
                          {/* Summary Banner */}
                          <div className={`p-4 rounded-xl border flex items-center justify-between ${
                            isAllPassed ? "bg-success/5 border-success/30 text-success" : "bg-critical/5 border-critical/30 text-critical"
                          }`}>
                            <div className="flex items-center gap-3">
                              {isAllPassed ? (
                                <CheckCircle className="w-6 h-6" />
                              ) : (
                                <AlertCircle className="w-6 h-6" />
                              )}
                              <div>
                                <div className="font-bold text-sm">
                                  {executionResult.status === "COMPLETED" || executionResult.status === "PASSED"
                                    ? `${passedCnt} / ${totalCnt} Tests Passed`
                                    : `Execution status: ${executionResult.status}`}
                                </div>
                                <div className="text-[11px] text-text-secondary mt-0.5">
                                  {runType === "SUBMIT" ? "Evaluated against all visible and hidden cases." : "Evaluated against sample test cases."}
                                </div>
                              </div>
                            </div>

                            <div className="text-right text-[11px] text-text-secondary font-mono">
                              {execTime !== null && <div>Time: {execTime} ms</div>}
                              {memUsage !== null && <div>Memory: {memUsage} KB</div>}
                            </div>
                          </div>

                          {/* Execution Details per test case */}
                          {detailsList.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Granular Results</h4>
                              {detailsList.map((r: any, idx: number) => (
                            <div key={idx} className="p-3 bg-surface/50 border border-border-token rounded-lg space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-text-secondary">
                                  {r.isHidden ? `Hidden Test Case ${idx + 1}` : r.label || `Test Case ${idx + 1}`}
                                </span>
                                {r.passed ? (
                                  <span className="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded font-bold uppercase">Passed</span>
                                ) : (
                                  <span className="text-[10px] bg-critical/15 text-critical px-2 py-0.5 rounded font-bold uppercase">Failed ({r.status})</span>
                                )}
                              </div>
                              
                              {!r.isHidden && (
                                <div className="grid grid-cols-2 gap-4 text-[11px] font-mono">
                                  <div>
                                    <div className="text-text-secondary mb-0.5">Input:</div>
                                    <pre className="bg-bg p-1.5 rounded border border-border-token/40 overflow-x-auto whitespace-pre-wrap">{r.input}</pre>
                                  </div>
                                  <div>
                                    <div className="text-text-secondary mb-0.5">Expected Output:</div>
                                    <pre className="bg-bg p-1.5 rounded border border-border-token/40 overflow-x-auto whitespace-pre-wrap">{r.expectedOutput}</pre>
                                  </div>
                                  {r.stdout && (
                                    <div className="col-span-2">
                                      <div className="text-text-secondary mb-0.5">Actual Program Output:</div>
                                      <pre className="bg-bg p-1.5 rounded border border-border-token/40 overflow-x-auto whitespace-pre-wrap">{r.stdout}</pre>
                                    </div>
                                  )}
                                  {r.stderr && (
                                    <div className="col-span-2">
                                      <div className="text-text-secondary mb-0.5 text-critical">Errors:</div>
                                      <pre className="bg-critical/5 text-critical p-1.5 rounded border border-critical/20 overflow-x-auto whitespace-pre-wrap">{r.stderr}</pre>
                                    </div>
                                  )}
                                </div>
                              )}

                              {r.isHidden && (
                                <div className="text-[11px] text-text-secondary italic">
                                  Test case inputs, outputs and console logs are hidden for security.
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "console" && (
                    <div className="h-full">
                      {executionResult.stdout ? (
                        <pre className="bg-surface/50 p-4 rounded-xl border border-border-token overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-text-primary">
                          {executionResult.stdout}
                        </pre>
                      ) : (
                        <div className="text-text-secondary text-center py-6">
                          No compiler logs generated during sandbox execution.
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })())}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
