import React from 'react';
import { useSessionStore } from '../store/sessionMachine';
import { MODULES } from '../fixtures/questions';
import { Timer } from '../components/Timer';
import type { QuestionStatus } from '../store/sessionMachine';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';

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

export function PreSubmitReview() {
  const { screen, transitionTo, assessment } = useSessionStore();

  if (screen.type !== 'pre-submit-review' || !assessment) return null;

  const { sessionId } = screen;
  const activeModules = deriveModules(assessment.questions);

  function isAnswered(id: string, modType?: string): boolean {
    const status = assessment!.questionStatus[id];
    if (status === 'answered') return true;
    const resp = assessment!.responses[id];
    if (resp !== undefined && resp !== null && resp !== '' && JSON.stringify(resp) !== '{}') {
      return true;
    }
    if (modType === 'SIMULATION' || modType === 'CONTEXTUAL') {
      const simKeys = Object.keys(assessment!.responses);
      if (simKeys.length > 0 || (status as string) === 'answered') return true;
    }
    return false;
  }

  function countStatus(mod: DynamicModuleSummary, status: QuestionStatus): number {
    if (status === 'answered') {
      return mod.questionIds.filter(id => isAnswered(id, mod.moduleType)).length;
    }
    if (status === 'flagged') {
      return mod.questionIds.filter(id => !isAnswered(id, mod.moduleType) && assessment!.questionStatus[id] === 'flagged').length;
    }
    return mod.questionIds.filter(id => (assessment!.questionStatus[id] ?? 'unvisited') === status).length;
  }

  function countUnanswered(mod: DynamicModuleSummary): number {
    return mod.questionIds.filter(id => !isAnswered(id, mod.moduleType) && assessment!.questionStatus[id] !== 'flagged').length;
  }

  function handleSubmit() {
    transitionTo({ type: 'syncing', sessionId, auto: false });
  }

  function handleGoBack() {
    transitionTo({ type: 'assessment', moduleIndex: assessment!.currentModuleIndex, sessionId });
  }

  return (
    <div
      className="min-h-screen px-6 py-12 flex flex-col items-center justify-center bg-[var(--background)]"
      role="main"
      aria-labelledby="review-heading"
    >
      <div className="w-full max-w-2xl animate-cd-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 id="review-heading" className="text-[32px] font-semibold tracking-tight text-[var(--foreground)]">
              Review assessment
            </h1>
            <p className="text-sm mt-1 text-[var(--muted-foreground)]">
              Check your completion status below before submitting.
            </p>
          </div>
          <Timer />
        </div>

        {/* Per-module completion summary */}
        <div className="space-y-3 mb-8">
          {activeModules.map(mod => {
            const answered = countStatus(mod, 'answered');
            const flagged = countStatus(mod, 'flagged');
            const unanswered = countUnanswered(mod);
            const total = mod.questionIds.length;

            return (
              <div
                key={mod.index}
                className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono w-6 h-6 rounded-md bg-[var(--surface)] border border-[var(--border)] text-xs flex items-center justify-center text-[var(--muted-foreground)] font-medium">
                      {mod.index + 1}
                    </span>
                    <span className="text-sm font-semibold text-[var(--foreground)]">{mod.name}</span>
                  </div>
                  <button
                    onClick={() => transitionTo({ type: 'assessment', moduleIndex: mod.index, sessionId })}
                    className="text-xs text-[var(--accent)] hover:underline focus:outline-none cursor-pointer inline-flex items-center gap-1"
                    aria-label={`Go back to ${mod.name}`}
                  >
                    <span>Return to module</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                <div className="flex gap-4 text-xs font-mono">
                  <span className="text-[var(--success)] font-medium">{answered} answered</span>
                  {flagged > 0 && (
                    <span className="text-[var(--warning)] font-medium">{flagged} flagged</span>
                  )}
                  {unanswered > 0 && (
                    <span className="text-[var(--muted-foreground)]">{unanswered} unanswered</span>
                  )}
                  <span className="text-[var(--muted-foreground)] ml-auto">{total} total</span>
                </div>

                {/* Completion bar */}
                <div
                  className="mt-3 h-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] overflow-hidden"
                  role="progressbar"
                  aria-valuenow={answered}
                  aria-valuemax={total}
                  aria-label={`${mod.name}: ${answered} of ${total} answered`}
                >
                  <div
                    className="h-full rounded-full bg-[var(--success)] transition-all"
                    style={{ width: `${total > 0 ? (answered / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Unanswered warning */}
        {activeModules.some(m => countUnanswered(m) > 0) && (
          <div
            role="note"
            className="mb-6 p-4 rounded-xl border border-[var(--warning)] bg-[var(--surface)] text-sm text-[var(--warning)]"
          >
            Some questions have not been answered. You can still submit — unanswered questions will receive no score.
          </div>
        )}

        {/* Submit / back */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={handleGoBack}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface)] cursor-pointer inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <ChevronLeft size={14} />
            <span>Return to assessment</span>
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:opacity-90 text-xs font-bold text-white cursor-pointer inline-flex items-center justify-center gap-1.5 shadow-sm transition-all"
            aria-label="Submit final assessment — this action cannot be undone"
          >
            <span>Submit Final Assessment</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <p className="text-xs text-center text-[var(--muted-foreground)] mt-3 font-mono">
          This action cannot be undone. Your responses are already saved locally.
        </p>
      </div>
    </div>
  );
}
