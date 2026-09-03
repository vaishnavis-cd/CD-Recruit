import React, { useEffect, useState, useRef } from 'react';
import { CODING_QUESTIONS } from '../../fixtures/questions';
import { useSessionStore, QuestionStatus } from '../../store/sessionMachine';
import { ModuleShell } from '../../components/ModuleShell';
import { CodingWorkspace } from '../../components/coding/CodingWorkspace';
import apiClient from '../../api/client';
import { Loader2, AlertCircle, GripVertical } from 'lucide-react';

/** Simple UUID v4 check — NestJS ParseUUIDPipe rejects anything else with 400. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

import { useModuleNavigation } from '../../hooks/useModuleNavigation';
import { getEffectiveModuleType } from '../../utils/moduleType';

interface CodingModuleProps {
  moduleIndex: number;
}

export function CodingModule({ moduleIndex }: CodingModuleProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const assessment = useSessionStore(s => s.assessment);
  const setQuestionStatus = useSessionStore(s => s.setQuestionStatus);
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion);

  // Include CODING module questions only
  const codingQuestions = assessment?.questions?.filter(q => getEffectiveModuleType(q) === 'CODING') ?? [];
  const questionId = codingQuestions[currentIndex]?.questionId ?? '';
  const isValidUUID = UUID_RE.test(questionId);

  const { handleNext: triggerNext, nextButtonLabel } = useModuleNavigation(moduleIndex, currentIndex, codingQuestions.length || 1);

  const [questionData, setQuestionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Adjustable Horizontal Resizer State (Left Pane width %)
  const [leftWidthPct, setLeftWidthPct] = useState(40);
  const isDraggingHorizontalRef = useRef(false);

  const handleHorizontalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingHorizontalRef.current = true;

    const startX = e.clientX;
    const startWidthPct = leftWidthPct;
    const containerWidth = window.innerWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingHorizontalRef.current) return;
      const deltaX = moveEvent.clientX - startX;
      const deltaPct = (deltaX / containerWidth) * 100;
      const newPct = Math.max(20, Math.min(70, startWidthPct + deltaPct));
      setLeftWidthPct(newPct);
    };

    const onMouseUp = () => {
      isDraggingHorizontalRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Restore current question from persisted state on mount
  useEffect(() => {
    if (assessment?.currentModuleIndex === moduleIndex) {
      setCurrentIndex(assessment.currentQuestionIndex);
    }
  }, []);

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex);
  }, [currentIndex, moduleIndex, setCurrentQuestion]);

  // Fetch question details from backend
  useEffect(() => {
    if (!assessment?.sessionId) return;

    if (!isValidUUID) {
      setLoading(false);
      setError(
        codingQuestions.length === 0
          ? 'No coding questions found for this session. Please refresh or contact support.'
          : `Invalid question ID (${questionId || 'empty'}). Please refresh the page.`
      );
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    apiClient.get(`/sessions/${assessment.sessionId}/questions/${questionId}`)
      .then(res => {
        if (isMounted) {
          setQuestionData(res.data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          const status = err?.response?.status;
          const msg = err?.response?.data?.message ?? err?.message ?? 'Unknown error';
          console.error(`[CodingModule] Failed to fetch question ${questionId} (HTTP ${status}):`, msg, err);
          setError(`Failed to load coding challenge (${status ?? 'network error'}): ${msg}`);
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [assessment?.sessionId, questionId, isValidUUID]);

  const paletteItems = (codingQuestions.length > 0 ? codingQuestions : CODING_QUESTIONS).map((q, i) => ({
    id: 'questionId' in q ? q.questionId : (q as any).id,
    label: `Challenge ${i + 1}`,
  }));

  function handleUpdateStatus(status: QuestionStatus) {
    if (questionId) {
      setQuestionStatus(questionId, status);
    }
  }

  function handleNext() {
    if (currentIndex < CODING_QUESTIONS.length - 1) {
      setCurrentIndex(i => i + 1);
    }
  }

  if (loading) {
    return (
      <ModuleShell
        moduleIndex={moduleIndex}
        questions={paletteItems}
        currentQuestionIndex={currentIndex}
        onNavigate={setCurrentIndex}
      >
        <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
          <span className="text-sm text-[var(--muted-foreground)] font-medium">Loading coding challenge...</span>
        </div>
      </ModuleShell>
    );
  }

  if (error || !questionData) {
    return (
      <ModuleShell
        moduleIndex={moduleIndex}
        questions={paletteItems}
        currentQuestionIndex={currentIndex}
        onNavigate={setCurrentIndex}
      >
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-rose-500" />
          <span className="text-sm font-semibold text-[var(--foreground)]">{error || "Failed to load question"}</span>
        </div>
      </ModuleShell>
    );
  }

  const rawContent = questionData?.content || {};

  // Derive dynamic question title from DB question content
  const questionTitle =
    rawContent.title ||
    (rawContent.prompt
      ? rawContent.prompt
          .split('\n')[0]
          .replace(/^(DEBUGGING CHALLENGE:|PROBLEM:|\d+\.|\#+)\s*/i, '')
          .slice(0, 65)
          .trim()
      : '') ||
    (codingQuestions[currentIndex] as any)?.title ||
    `Coding Challenge ${currentIndex + 1}`;

  // Extract visible sample test cases (strictly 2)
  const rawVisible = Array.isArray(rawContent.visibleTestCases)
    ? rawContent.visibleTestCases
    : Array.isArray(rawContent.testCases)
    ? rawContent.testCases.filter((tc: any) => !tc.isHidden)
    : [
        { input: "[2, 7, 11, 15], 9", expectedOutput: "[0, 1]", label: "Example 1" },
        { input: "[3, 2, 4], 6", expectedOutput: "[1, 2]", label: "Example 2" }
      ];

  const testCasesList = rawVisible.slice(0, 2);

  // Extract hidden test cases for submit evaluation (3-4 cases)
  const rawHidden = Array.isArray(rawContent.hiddenTestCases)
    ? rawContent.hiddenTestCases
    : Array.isArray(rawContent.testCases)
    ? rawContent.testCases.filter((tc: any) => tc.isHidden)
    : [];

  const allTestCases = [
    ...testCasesList.map((tc: any) => ({ ...tc, isHidden: false })),
    ...rawHidden.map((tc: any) => ({ ...tc, isHidden: true })),
  ];

  const workspaceQuestion = {
    id: questionId,
    title: questionTitle,
    prompt: rawContent.prompt || rawContent.description || "Write a program to solve the coding challenge.",
    content: {
      starterCode: rawContent.starterCode,
      testCases: allTestCases,
      constraints: rawContent.constraints || [
        "1 <= N <= 10^4",
        "Memory limit: 256MB",
        "Time limit: 3.0s"
      ],
      difficulty: rawContent.difficulty || "medium",
    },
    response: questionData.response || null,
  };

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={paletteItems}
      currentQuestionIndex={currentIndex}
      onNavigate={setCurrentIndex}
    >
      <div className="flex h-full w-full overflow-hidden select-none bg-canvas dark:bg-[#0B0F19]">
        {/* Left Panel: Description */}
        <div
          style={{ width: `${leftWidthPct}%` }}
          className="bg-canvas dark:bg-[#0B0F19] overflow-y-auto flex flex-col h-full shrink-0 border-r border-line dark:border-slate-800"
        >
          <div className="p-6 space-y-5">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xs font-bold text-ink-dim dark:text-slate-400 uppercase tracking-wider font-mono">
                  CHALLENGE {currentIndex + 1} OF {codingQuestions.length || 1}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 uppercase tracking-wider font-mono border border-emerald-200 dark:border-emerald-800">
                  {workspaceQuestion.content.difficulty}
                </span>
              </div>
              <h2 className="text-xl font-bold text-ink dark:text-white tracking-tight">
                {workspaceQuestion.title}
              </h2>
            </div>

            <div className="text-sm text-ink dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-normal">
              {workspaceQuestion.prompt}
            </div>

            {/* Constraints */}
            {workspaceQuestion.content.constraints && workspaceQuestion.content.constraints.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-line dark:border-slate-800">
                <h4 className="text-2xs font-bold text-ink-dim dark:text-slate-400 uppercase tracking-wider font-mono">
                  CONSTRAINTS
                </h4>
                <ul className="list-disc list-inside text-xs text-ink-secondary dark:text-slate-300 space-y-1.5 font-mono">
                  {workspaceQuestion.content.constraints.map((c: string, i: number) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sample Test Cases (DB-backed - strictly 2 visible) */}
            {testCasesList.length > 0 && (
              <div className="pt-4 border-t border-line dark:border-slate-800 space-y-3">
                <h4 className="text-2xs font-bold text-ink-dim dark:text-slate-400 uppercase tracking-wider font-mono">
                  SAMPLE TEST CASES (2 VISIBLE)
                </h4>
                <div className="space-y-3">
                  {testCasesList.map((tc: any, i: number) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl border border-line dark:border-slate-800 bg-white dark:bg-[#111827] text-xs space-y-1.5 shadow-xs"
                    >
                      <div className="text-xs font-bold text-brand uppercase">
                        {tc.label || `EXAMPLE ${i + 1}`}
                      </div>
                      <div className="text-ink dark:text-slate-300 font-mono">
                        Input: {tc.input}
                      </div>
                      <div className="font-mono font-bold text-success">
                        Expected Output: {tc.expectedOutput || tc.expected}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Horizontal Drag Resizer Handle */}
        <div
          onMouseDown={handleHorizontalMouseDown}
          className="w-2 hover:w-2.5 bg-line dark:bg-slate-800 hover:bg-brand/40 cursor-col-resize flex items-center justify-center transition-all shrink-0 select-none z-10"
          title="Drag left or right to adjust panel split"
        >
          <GripVertical className="w-3 h-3 text-ink-muted opacity-60" />
        </div>

        {/* Right Panel: Monaco Workspace */}
        <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden bg-white dark:bg-[#111827]">
          <CodingWorkspace
            question={workspaceQuestion}
            currentIndex={currentIndex}
            totalQuestions={codingQuestions.length}
            onPrevious={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            onNext={() => triggerNext(() => setCurrentIndex((i) => Math.min(codingQuestions.length - 1, i + 1)))}
            nextButtonLabel={nextButtonLabel}
            updateStatus={handleUpdateStatus}
          />
        </div>
      </div>
    </ModuleShell>
  );
}
