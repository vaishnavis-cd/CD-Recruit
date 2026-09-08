import React, { useEffect, useState, useMemo } from 'react';
import { useSessionStore } from '../store/sessionMachine';
import { services } from '../services';
import { MODULES } from '../fixtures/questions';
import { getEffectiveModuleType } from '../utils/moduleType';
import { StatusChip } from '../components/common/StatusChip';
import { ArrowRight, ArrowLeft } from 'lucide-react';

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
  const steps = mode === 'full' ? FULL_STEPS : CONDENSED_STEPS;

  const [scheduledMs] = useState(() => {
    try {
      const stored = localStorage.getItem('cd-recruit-scheduled-ms');
      return stored ? parseInt(stored) : null;
    } catch { return null; }
  });

  const currentStep = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Countdown timer on final 'done' (All Set) screen
  useEffect(() => {
    if (currentStep === 'done') {
      const graceEnd = Date.now() + 5 * 1000;
      const interval = setInterval(() => {
        const left = Math.max(0, Math.ceil((graceEnd - Date.now()) / 1000));
        setCountdown(left);
        if (left <= 0) {
          clearInterval(interval);
          handleFinish();
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [currentStep]);

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
            className="w-full h-auto rounded-2xl block"
          />
        );

      case 'timer':
        return (
          <img
            src="/assets/timer-sync-card.svg"
            alt="Timer & Server Synchronization"
            className="w-full h-auto rounded-2xl block"
          />
        );

      case 'palette':
        return (
          <img
            src="/assets/tutorial-card.svg"
            alt="Question Navigation Palette"
            className="w-full h-auto rounded-2xl block"
          />
        );

      case 'contextual-sim':
        return (
          <img
            src="/assets/tutorial-card-1.svg"
            alt="Contextual Simulation & On-Call Guide"
            className="w-full h-auto rounded-2xl block"
          />
        );

      case 'run-vs-submit':
        return (
          <img
            src="/assets/tutorial-card-2.svg"
            alt="Run vs. Submit (Coding & SQL)"
            className="w-full h-auto rounded-2xl block"
          />
        );

      case 'practice':
        // Interactive Multiple-Choice Question matching tutorial-card (3).png exactly
        return (
          <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-7 sm:p-9 space-y-6">
            <div>
              <h2 className="text-2xl sm:text-[28px] font-extrabold text-[#0F172A] tracking-tight leading-tight">
                Practice Question (Zero Stakes)
              </h2>
              <p className="text-base font-semibold text-[#0F172A] mt-2">
                Which HTTP status code indicates "Resource Not Found"?
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
                    className={`w-full min-h-[52px] px-4 py-3 rounded-xl border flex items-center gap-3.5 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#2F65F6] bg-[#EFF6FF] text-[#0F172A] shadow-xs'
                        : 'border-slate-200 bg-white text-[#0F172A] hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'border-[#2F65F6] bg-[#2F65F6]'
                          : 'border-slate-400 bg-white'
                      }`}
                    >
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white block" />
                      )}
                    </span>
                    <span className="text-[15px] font-normal text-[#0F172A]">
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
      <div className="w-full max-w-[1240px] animate-cd-fade-in space-y-8">
        {/* Multi-segment Progress Bar matching Figma 960x6 gap:8px */}
        <div
          className="flex items-center gap-2 h-1.5 w-full max-w-[960px] mx-auto"
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemax={steps.length}
        >
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`flex-1 h-1.5 rounded-[3px] transition-colors duration-200 ${
                idx <= stepIndex ? 'bg-[#2F65F6]' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* 2-Column Layout for Tutorial Steps 1-6 */}
        {currentStep !== 'done' ? (
          <div className="flex flex-col lg:flex-row items-start justify-center gap-10 lg:gap-16">
            {/* Left Column: Common illustration-block.png for all 6 tutorial pages */}
            <div className="w-full lg:w-[420px] shrink-0 flex items-center justify-center">
              <img
                src="/assets/illustration-block.png"
                alt="Tutorial - Before you start"
                className="w-full max-w-[420px] h-auto object-contain block"
              />
            </div>

            {/* Right Column: Step card image / practice UI and navigation */}
            <div className="w-full max-w-[760px] flex flex-col space-y-6">
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
                  <span>Next →</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Step 7 ('done'): All Set Screen with all-set-card.svg */
          <div className="max-w-[720px] mx-auto space-y-6">
            <img
              src="/assets/all-set-card.svg"
              alt="You're All Set!"
              className="w-full h-auto rounded-2xl block"
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
                <span>{countdown !== null ? `Enter Waiting Room (${countdown}s)` : 'Enter Waiting Room'}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
