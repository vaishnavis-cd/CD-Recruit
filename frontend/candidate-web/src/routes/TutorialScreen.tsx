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
            className="w-full max-h-[350px] h-auto object-contain rounded-2xl block mx-auto"
          />
        );

      case 'timer': {
        const durationFormatted = allocatedMinutes >= 60
          ? `${Math.floor(allocatedMinutes / 60)}:${String(allocatedMinutes % 60).padStart(2, '0')}:00`
          : `${allocatedMinutes}:00`;

        return (
          <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-4 animate-cd-fade-in">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight leading-tight">
              Timer &amp; Server Synchronization
            </h2>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-center gap-4 shadow-2xs">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60 flex items-center justify-center shrink-0">
                <Clock size={20} />
              </div>
              <div className="space-y-0.5">
                <div className="text-2xl font-extrabold text-[#0F172A] font-mono tracking-tight">
                  {durationFormatted}
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  Server-authoritative timer synced with backend allocated duration.
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Total allocated assessment duration is <strong className="text-slate-900 font-semibold">{allocatedMinutes} minutes</strong>. Assigned assessment modules:
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              {moduleLabels.map((label) => (
                <div
                  key={label}
                  className="px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2 shadow-2xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
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
            className="w-full max-h-[350px] h-auto object-contain rounded-2xl block mx-auto"
          />
        );

      case 'contextual-sim':
        return (
          <img
            src="/assets/tutorial-card-1.svg"
            alt="Contextual Simulation & On-Call Guide"
            className="w-full max-h-[350px] h-auto object-contain rounded-2xl block mx-auto"
          />
        );

      case 'run-vs-submit':
        return (
          <img
            src="/assets/tutorial-card-2.svg"
            alt="Run vs. Submit (Coding & SQL)"
            className="w-full max-h-[350px] h-auto object-contain rounded-2xl block mx-auto"
          />
        );

      case 'practice':
        // Interactive Multiple-Choice Question matching tutorial-card (3).png exactly
        return (
          <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight leading-tight">
                Practice Question (Zero Stakes)
              </h2>
              <p className="text-sm font-semibold text-[#0F172A] mt-1.5">
                Which HTTP status code indicates "Resource Not Found"?
              </p>
            </div>

            <div className="space-y-2.5" role="radiogroup" aria-label="HTTP status code practice question">
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
                    className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${isSelected
                        ? 'border-[#2F65F6] bg-[#EFF6FF] text-[#0F172A] shadow-xs'
                        : 'border-slate-200 bg-white text-[#0F172A] hover:border-slate-300'
                      }`}
                  >
                    <span
                      className={`w-[16px] h-[16px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected
                          ? 'border-[#2F65F6] bg-[#2F65F6]'
                          : 'border-slate-400 bg-white'
                        }`}
                    >
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white block" />
                      )}
                    </span>
                    <span className="text-[14px] font-normal text-[#0F172A]">
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
      <div className="w-full max-w-[1180px] animate-cd-fade-in space-y-6">
        {/* Multi-segment Progress Bar matching Figma 960x6 gap:8px */}
        <div
          className="flex items-center gap-2 h-1.5 w-full max-w-[960px] mx-auto"
          role="progressbar"
          aria-valuenow={effectiveIndex + 1}
          aria-valuemax={steps.length}
        >
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`flex-1 h-1.5 rounded-[3px] transition-colors duration-200 ${idx <= effectiveIndex ? 'bg-[#2F65F6]' : 'bg-slate-200'
                }`}
            />
          ))}
        </div>

        {/* 2-Column Layout for Tutorial Steps 1-6 */}
        {currentStep !== 'done' ? (
          <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12">
            {/* Left Column: Common illustration-block.png for all tutorial pages */}
            <div className="w-full lg:w-[340px] shrink-0 flex items-center justify-center">
              <img
                src="/assets/illustration-block.png"
                alt="Tutorial - Before you start"
                className="w-full max-w-[320px] max-h-[320px] h-auto object-contain block"
              />
            </div>

            {/* Right Column: Step card image / practice UI and navigation */}
            <div className="w-full max-w-[680px] flex flex-col space-y-5">
              {renderStepCard()}

              {/* Controls Row */}
              <div className="flex items-center justify-between pt-1">
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
                  className="figma-btn-secondary"
                  type="button"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>

                <button
                  onClick={handleNext}
                  className="figma-btn-primary"
                  type="button"
                >
                  <span>Next</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Step 7 ('done'): All Set Screen with all-set-card.svg */
          <div className="max-w-[640px] mx-auto space-y-6">
            <img
              src="/assets/all-set-card.svg"
              alt="You're All Set!"
              className="w-full max-h-[350px] h-auto object-contain rounded-2xl block mx-auto"
            />

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                className="figma-btn-secondary"
                type="button"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>

              <button
                onClick={handleNext}
                className="figma-btn-primary"
                type="button"
              >
                <span>Enter Waiting Room</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
