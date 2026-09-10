import React, { useEffect, useState, useMemo } from 'react';
import { useSessionStore } from '../store/sessionMachine';
import { services } from '../services';
import { MODULES } from '../fixtures/questions';
import { getEffectiveModuleType } from '../utils/moduleType';
import { StatusChip } from '../components/common/StatusChip';
import { ArrowRight, ArrowLeft, Clock } from 'lucide-react';

interface TutorialScreenProps {
  mode: 'full' | 'condensed';
  inviteToken: string;
}

type TutorialStep =
  | 'layout'
  | 'timer'
  | 'palette'
  | 'contextual-sim'
  | 'run-vs-submit'
  | 'practice'
  | 'done';

const FULL_STEPS: TutorialStep[] = ['layout', 'timer', 'palette', 'contextual-sim', 'run-vs-submit', 'practice', 'done'];
const CONDENSED_STEPS: TutorialStep[] = ['layout', 'timer', 'palette', 'contextual-sim', 'done'];

export function TutorialScreen({ mode, inviteToken }: TutorialScreenProps) {
  const { transitionTo, session, assessment } = useSessionStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [practiceAnswer, setPracticeAnswer] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Derive active modules from session or assessment questions
  const activeModuleTypes = useMemo(() => {
    const questions = session?.questions || assessment?.questions || [];
    if (!questions || questions.length === 0) {
      return new Set(['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'CONTEXTUAL']);
    }
    return new Set(questions.map((q: any) => getEffectiveModuleType(q)));
  }, [session, assessment]);

  const hasContextual = activeModuleTypes.has('CONTEXTUAL') || activeModuleTypes.has('SIMULATION');
  const hasCodingOrSql = activeModuleTypes.has('CODING') || activeModuleTypes.has('SQL') || activeModuleTypes.has('DEBUGGING');

  const allocatedMinutes = useMemo(() => {
    if (session?.durationMinutes && session.durationMinutes > 0) {
      return session.durationMinutes;
    }
    if (assessment?.totalSeconds && assessment.totalSeconds > 0) {
      return Math.round(assessment.totalSeconds / 60);
    }
    return 90;
  }, [session, assessment]);

  const moduleLabels = useMemo(() => {
    const list: string[] = [];
    const hasType = (types: string[]) => types.some(t => activeModuleTypes.has(t));

    if (hasType(['MCQ'])) list.push('Multiple Choice');
    if (hasType(['SQL'])) list.push('SQL');
    if (hasType(['NOSQL'])) list.push('NoSQL');
    if (hasType(['CODING'])) list.push('Coding & DSA');
    if (hasType(['DEBUGGING'])) list.push('Debugging');
    if (hasType(['AI_PROMPTING', 'PROMPTING'])) list.push('AI Prompting');
    if (hasType(['CONTEXTUAL', 'SIMULATION'])) list.push('Contextual Simulation');
    if (hasType(['TEST_SCENARIOS', 'SCENARIOS'])) list.push('Test Scenarios');

    return list.length > 0 ? list : ['Multiple Choice', 'SQL', 'Coding & DSA', 'Debugging', 'AI Prompting', 'Contextual Simulation'];
  }, [activeModuleTypes]);

  const steps: TutorialStep[] = useMemo(() => {
    const base: TutorialStep[] = ['layout', 'timer', 'palette'];
    if (hasContextual) base.push('contextual-sim');
    if (hasCodingOrSql) base.push('run-vs-submit');
    if (mode === 'full') base.push('practice');
    base.push('done');
    return base;
  }, [hasContextual, hasCodingOrSql, mode]);

  const [scheduledMs] = useState(() => {
    try {
      const stored = localStorage.getItem('cd-recruit-scheduled-ms');
      return stored ? parseInt(stored) : null;
    } catch { return null; }
  });

  const effectiveIndex = Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[effectiveIndex];
  const isLast = effectiveIndex === steps.length - 1;

  // No auto-advancing on final step — candidate manually clicks "Enter Waiting Room"

  function handleFinish() {
    const now = services.time.getServerNow();
    const scheduled = scheduledMs || (now + 60 * 1000);

    transitionTo({
      type: 'waiting-room',
      scheduledTimeMs: scheduled,
      inviteToken,
    });
  }

  function handleNext() {
    if (isLast) {
      handleFinish();
    } else {
      setStepIndex(i => Math.min(steps.length - 1, i + 1));
    }
  }

  // Right card content per step
  function renderStepCard() {
    switch (currentStep) {
      case 'layout':
        return (
          <img
            src="/assets/overview-card.svg"
            alt="Interface Overview"
            className="w-full max-h-[460px] sm:max-h-[480px] h-auto object-contain rounded-2xl block mx-auto drop-shadow-sm"
          />
        );

      case 'timer': {
        const durationFormatted = allocatedMinutes >= 60
          ? `${Math.floor(allocatedMinutes / 60)}:${String(allocatedMinutes % 60).padStart(2, '0')}:00`
          : `${allocatedMinutes}:00`;

        return (
          <div className="w-full bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md p-7 sm:p-9 space-y-6 animate-cd-fade-in">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-white tracking-tight leading-tight">
              Timer &amp; Server Synchronization
            </h2>

            <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 flex items-center gap-5 shadow-2xs">
              <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900 flex items-center justify-center shrink-0">
                <Clock size={24} />
              </div>
              <div className="space-y-1">
                <div className="text-3xl sm:text-4xl font-extrabold text-[#0F172A] dark:text-white font-mono tracking-tight">
                  {durationFormatted}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Server-authoritative timer synced with backend allocated duration.
                </div>
              </div>
            </div>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Total allocated assessment duration is <strong className="text-slate-900 dark:text-white font-bold">{allocatedMinutes} minutes</strong>. Assigned assessment modules:
            </p>

            <div className="flex flex-wrap gap-2.5 pt-1">
              {moduleLabels.map((label) => (
                <div
                  key={label}
                  className="px-3.5 py-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 shadow-2xs"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'palette':
        return (
          <img
            src="/assets/tutorial-card.svg"
            alt="Question Navigation Palette"
            className="w-full max-h-[460px] sm:max-h-[480px] h-auto object-contain rounded-2xl block mx-auto drop-shadow-sm"
          />
        );

      case 'contextual-sim':
        return (
          <img
            src="/assets/tutorial-card-1.svg"
            alt="Contextual Simulation & On-Call Guide"
            className="w-full max-h-[460px] sm:max-h-[480px] h-auto object-contain rounded-2xl block mx-auto drop-shadow-sm"
          />
        );

      case 'run-vs-submit':
        return (
          <img
            src="/assets/tutorial-card-2.svg"
            alt="Run vs. Submit (Coding & SQL)"
            className="w-full max-h-[460px] sm:max-h-[480px] h-auto object-contain rounded-2xl block mx-auto drop-shadow-sm"
          />
        );

      case 'practice':
        return (
          <div className="w-full bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md p-7 sm:p-9 space-y-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-white tracking-tight leading-tight">
                Practice Question (Zero Stakes)
              </h2>
              <p className="text-base sm:text-lg font-semibold text-[#0F172A] dark:text-slate-200 mt-2">
                Which HTTP status code indicates &quot;Resource Not Found&quot;?
              </p>
            </div>

            <div className="space-y-3" role="radiogroup" aria-label="HTTP status code practice question">
              {[
                { id: '200', label: '200 OK' },
                { id: '400', label: '400 Bad Request' },
                { id: '404', label: '404 Not Found' },
                { id: '500', label: '500 Internal Server Error' },
              ].map(opt => {
                const isSelected = practiceAnswer === opt.id;
                return (
                  <label
                    key={opt.id}
                    onClick={() => setPracticeAnswer(opt.id)}
                    className={`w-full min-h-[52px] px-5 py-3 rounded-xl border flex items-center gap-3.5 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#2F65F6] bg-[#EFF6FF] dark:bg-blue-950/40 text-[#0F172A] dark:text-white shadow-xs font-semibold'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-[#0F172A] dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <span
                      className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'border-[#2F65F6] bg-[#2F65F6]'
                          : 'border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-white block" />
                      )}
                    </span>
                    <span className="text-[15px]">
                      {opt.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );

      case 'done':
        return null;
    }
  }

  return (
    <div
      className="figma-page-layout items-center"
      role="main"
      aria-labelledby="tutorial-heading"
    >
      <div className="w-full max-w-[1240px] animate-cd-fade-in space-y-8 my-auto">
        {/* Multi-segment Progress Bar matching Figma */}
        <div
          className="flex items-center gap-2.5 h-2 w-full max-w-[1020px] mx-auto"
          role="progressbar"
          aria-valuenow={effectiveIndex + 1}
          aria-valuemax={steps.length}
        >
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`flex-1 h-2 rounded-full transition-all duration-300 ${
                idx <= effectiveIndex ? 'bg-[#2F65F6] shadow-2xs' : 'bg-slate-200/80 dark:bg-slate-700/80'
              }`}
            />
          ))}
        </div>

        {/* 2-Column Layout for Tutorial Steps 1-6 */}
        {currentStep !== 'done' ? (
          <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-14 pt-2">
            {/* Left Column: Candidate-tutorial-gif.gif */}
            <div className="w-full lg:w-[440px] xl:w-[460px] shrink-0 flex items-center justify-center">
              <img
                src="/assets/Candidate-tutorial-gif.gif"
                alt="Tutorial - Before you start"
                className="w-full max-w-[420px] lg:max-w-[460px] h-auto object-contain block drop-shadow-sm select-none"
              />
            </div>

            {/* Right Column: Step card image / practice UI and navigation */}
            <div className="w-full max-w-[720px] xl:max-w-[760px] flex flex-col space-y-6">
              {renderStepCard()}

              {/* Controls Row */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => {
                    if (stepIndex > 0) {
                      setStepIndex(i => i - 1);
                    } else {
                      transitionTo({
                        type: 'consent',
                        step: 'audio',
                        inviteToken,
                      });
                    }
                  }}
                  className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                  type="button"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>

                <button
                  onClick={handleNext}
                  className="px-7 py-2.5 rounded-xl bg-[#2F65F6] hover:bg-[#234ac2] text-white text-sm font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  type="button"
                >
                  <span>Next</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Step 7 ('done'): All Set Screen with all-set-card.svg */
          <div className="max-w-[760px] mx-auto space-y-7 pt-4">
            <img
              src="/assets/all-set-card.svg"
              alt="You're All Set!"
              className="w-full max-h-[460px] h-auto object-contain rounded-2xl block mx-auto drop-shadow-sm"
            />

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                type="button"
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>

              <button
                onClick={handleNext}
                className="px-7 py-2.5 rounded-xl bg-[#2F65F6] hover:bg-[#234ac2] text-white text-sm font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
                type="button"
              >
                <span>Enter Waiting Room</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
