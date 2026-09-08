import React from 'react';
import { useSessionStore } from '../store/sessionMachine';
import { MODULES } from '../fixtures/questions';
import { AssessmentTopBar } from '../components/common/AssessmentTopBar';
import { LightGradientBackground } from '../components/common/LightGradientBackground';
import type { QuestionStatus } from '../store/sessionMachine';
import { ChevronLeft, ChevronRight, ArrowRight, AlertTriangle } from 'lucide-react';

interface DynamicModuleSummary {
  moduleType: string;
  name: string;
  index: number;
  questionIds: string[];
}

const MODULE_NAMES: Record<string, string> = {
  MCQ: 'Multiple Choice Questions',
  SQL: 'SQL Database Queries',
  NOSQL: 'NoSQL Database Queries',
  CODING: 'Coding Challenges',
  DEBUGGING: 'Debugging Challenges',
  AI_PROMPTING: 'AI Prompt Engineering',
  SIMULATION: 'Context Simulation',
  CONTEXTUAL: 'Context Simulation',
  TEST_SCENARIOS: 'Test Scenario Simulation',
};

function deriveModules(assessmentQuestions?: any[]): DynamicModuleSummary[] {
  if (!assessmentQuestions || assessmentQuestions.length === 0) {
    return MODULES.map(m => ({
      moduleType: m.type,
      name: m.name,
      index: m.index,
      questionIds: m.questionIds,
    }));
  }

  const map = new Map<string, string[]>();
  for (const q of assessmentQuestions) {
    const type = q.moduleType || 'MCQ';
    if (!map.has(type)) {
      map.set(type, []);
    }
    map.get(type)!.push(q.questionId);
  }

  const result: DynamicModuleSummary[] = [];
  let index = 0;
  for (const [type, questionIds] of map.entries()) {
    result.push({
      moduleType: type,
      name: MODULE_NAMES[type] || type,
      index: index++,
      questionIds,
    });
  }
  return result;
}

// Progress width class resolver without inline styles
function getProgressWidthClass(answered: number, total: number): string {
  if (total <= 0 || answered <= 0) return 'w-0';
  const pct = (answered / total) * 100;
  if (pct >= 100) return 'w-full';
  if (pct >= 90) return 'w-11/12';
  if (pct >= 80) return 'w-4/5';
  if (pct >= 75) return 'w-3/4';
  if (pct >= 66) return 'w-2/3';
  if (pct >= 60) return 'w-3/5';
  if (pct >= 50) return 'w-1/2';
  if (pct >= 40) return 'w-2/5';
  if (pct >= 33) return 'w-1/3';
  if (pct >= 25) return 'w-1/4';
  if (pct >= 20) return 'w-1/5';
  if (pct >= 10) return 'w-1/12';
  return 'w-1';
}

export function PreSubmitReview() {
  const { screen, transitionTo, assessment } = useSessionStore();

  if (screen.type !== 'pre-submit-review' || !assessment) return null;

  const { sessionId } = screen;
  const activeModules = deriveModules(assessment.questions);

  function isAnswered(id: string): boolean {
    const status = assessment!.questionStatus[id];
    if (status === 'answered') return true;
    const resp = assessment!.responses[id];
    if (resp !== undefined && resp !== null && resp !== '' && JSON.stringify(resp) !== '{}') {
      return true;
    }
    return false;
  }

  function countStatus(mod: DynamicModuleSummary, status: QuestionStatus): number {
    if (status === 'answered') {
      return mod.questionIds.filter(id => isAnswered(id)).length;
    }
    if (status === 'flagged') {
      return mod.questionIds.filter(id => !isAnswered(id) && assessment!.questionStatus[id] === 'flagged').length;
    }
    return mod.questionIds.filter(id => (assessment!.questionStatus[id] ?? 'unvisited') === status).length;
  }

  function countUnanswered(mod: DynamicModuleSummary): number {
    return mod.questionIds.filter(id => !isAnswered(id) && assessment!.questionStatus[id] !== 'flagged').length;
  }

  function handleSubmit() {
    transitionTo({ type: 'syncing', sessionId, auto: false });
  }

  function handleGoBack() {
    transitionTo({ type: 'assessment', moduleIndex: assessment!.currentModuleIndex, sessionId });
  }

  const hasUnanswered = activeModules.some(m => countUnanswered(m) > 0);

  return (
    <div className="min-h-screen flex flex-col bg-white" role="main" aria-labelledby="review-heading">
      <LightGradientBackground />

      {/* Common Proctora Top Bar */}
      <AssessmentTopBar showTimer />

      {/* Review Scroll Container (Figma 1920x1013 gap:32px pad:40px 80px) */}
      <div className="flex-1 w-full overflow-y-auto px-4 sm:px-8 py-8 sm:py-12">
        <div className="w-full max-w-[960px] mx-auto space-y-8 animate-cd-fade-in">
          {/* page-title-group (Figma 960x64 gap:8px) */}
          <div className="space-y-2">
            <h1 id="review-heading" className="text-3xl sm:text-[32px] font-bold text-[#0F172A] tracking-tight leading-tight">
              Review assessment
            </h1>
            <p className="text-[15px] text-[#475569] font-normal leading-normal">
              Check your completion status below before submitting.
            </p>
          </div>

          {/* module-stack (Figma 960x798 gap:16px) */}
          <div className="space-y-4">
            {activeModules.map(mod => {
              const answered = countStatus(mod, 'answered');
              const flagged = countStatus(mod, 'flagged');
              const unanswered = countUnanswered(mod);
              const total = mod.questionIds.length;
              const isCompleted = answered === total && total > 0;
              const progressWidthClass = getProgressWidthClass(answered, total);

              return (
                <div
                  key={mod.index}
                  className="w-full rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs overflow-hidden transition-all hover:border-slate-300"
                >
                  <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Left: Index Circle + Titles + Badges */}
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#F1F5F9] text-[#475569] font-bold text-sm flex items-center justify-center shrink-0">
                        {mod.index + 1}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="text-[16px] font-bold text-[#0F172A] truncate">
                          {mod.name}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          {isCompleted ? (
                            <span className="px-2 py-0.5 rounded bg-[#F0FDF4] text-[#15803D] text-[11px] font-medium inline-flex items-center">
                              {answered} answered
                            </span>
                          ) : (
                            <>
                              {answered > 0 && (
                                <span className="px-2 py-0.5 rounded bg-[#F0FDF4] text-[#15803D] text-[11px] font-medium inline-flex items-center">
                                  {answered} answered
                                </span>
                              )}
                              {unanswered > 0 && (
                                <span className="px-2 py-0.5 rounded bg-[#FFFBEB] text-[#B45309] text-[11px] font-medium inline-flex items-center">
                                  {unanswered} unanswered
                                </span>
                              )}
                              {flagged > 0 && (
                                <span className="px-2 py-0.5 rounded bg-[#FEF3C7] text-[#B45309] text-[11px] font-medium inline-flex items-center">
                                  {flagged} flagged
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Total Count + Return to Module Link */}
                    <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0">
                      <span className="text-[13px] font-medium text-[#94A3B8]">
                        {total} total
                      </span>
                      <button
                        onClick={() => transitionTo({ type: 'assessment', moduleIndex: mod.index, sessionId })}
                        className="text-[13px] font-bold text-[#2F65F6] hover:underline cursor-pointer inline-flex items-center gap-1"
                        type="button"
                        aria-label={`Go back to ${mod.name}`}
                      >
                        <span>Return to module</span>
                        <ChevronRight size={14} className="text-[#2F65F6]" />
                      </button>
                    </div>
                  </div>

                  {/* progress-track (Figma 960x6) - zero inline styles */}
                  <div
                    className="w-full h-1.5 bg-[#F1F5F9] overflow-hidden"
                    role="progressbar"
                    aria-valuenow={answered}
                    aria-valuemax={total}
                    aria-label={`${mod.name}: ${answered} of ${total} answered`}
                  >
                    <div
                      className={`h-full ${isCompleted ? 'bg-[#10B981]' : 'bg-[#2F65F6]'} ${progressWidthClass} transition-all duration-300`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* warning-banner (Figma warning-banner: 960x48 fill:#FFFBEB stroke:#FDE68A) */}
          {hasUnanswered && (
            <div
              role="note"
              className="w-full rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-4 text-[13px] font-medium text-[#B45309] flex items-center gap-2.5"
            >
              <AlertTriangle size={16} className="text-[#B45309] shrink-0" />
              <span>Some questions have not been answered. You can still submit — unanswered questions will receive no score.</span>
            </div>
          )}

          {/* review-bottom-actions (Figma review-bottom-actions: 960x45) */}
          <div className="pt-2 flex items-center justify-between gap-4">
            <button
              onClick={handleGoBack}
              className="figma-btn-secondary"
              type="button"
            >
              <ChevronLeft size={16} />
              <span>Return to assessment</span>
            </button>

            <button
              onClick={handleSubmit}
              className="figma-btn-primary px-7 py-3 text-[15px] font-semibold flex items-center gap-2"
              type="button"
            >
              <span>Submit Final Assessment →</span>
            </button>
          </div>

          <p className="text-center text-[13px] text-[#64748B] font-normal pt-1">
            This action cannot be undone. Your responses are already saved locally.
          </p>
        </div>
      </div>
    </div>
  );
}
