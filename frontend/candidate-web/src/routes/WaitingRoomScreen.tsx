import React, { useEffect, useState, useMemo } from 'react';
import { useSessionStore } from '../store/sessionMachine';
import { services } from '../services';
import { MODULES } from '../fixtures/questions';
import { getEffectiveModuleType } from '../utils/moduleType';
import { HelpCircle, Check, ArrowRight } from 'lucide-react';
import apiClient from '../api/client';

const SUPPORT_EMAIL = 'mailto:support@proctora.com';

interface WaitingRoomScreenProps {
  scheduledTimeMs: number;
  inviteToken: string;
}

export function WaitingRoomScreen({ scheduledTimeMs, inviteToken }: WaitingRoomScreenProps) {
  const { transitionTo, session, assessment, initAssessment } = useSessionStore();
  const [nowMs, setNowMs] = useState(() => services.time.getServerNow());

  // Lock target preheat countdown time once on mount
  const [targetTimeMs] = useState(() => {
    const currentNow = services.time.getServerNow();
    let scheduled = scheduledTimeMs;

    if (!scheduled) {
      try {
        const stored = localStorage.getItem('cd-recruit-scheduled-ms');
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!isNaN(parsed)) scheduled = parsed;
        }
      } catch { /* ignore */ }
    }

    // Sanity-check: scheduled time must be in the future AND at most 10 minutes away.
    const MAX_WAIT_MS = 10 * 60 * 1000;
    if (scheduled && scheduled > currentNow && (scheduled - currentNow) <= MAX_WAIT_MS) {
      return scheduled;
    }

    // 60s preheat countdown
    const preheatTarget = currentNow + 60 * 1000;
    localStorage.setItem('cd-recruit-scheduled-ms', String(preheatTarget));
    return preheatTarget;
  });

  useEffect(() => {
    return services.time.subscribe(setNowMs);
  }, []);

  const allocatedMinutes = session?.durationMinutes
    ? session.durationMinutes
    : assessment?.totalSeconds
    ? Math.round(assessment.totalSeconds / 60)
    : 60;

  const activeModules = useMemo(() => {
    const questions = session?.questions || assessment?.questions;
    if (questions && questions.length > 0) {
      const activeTypes = new Set(questions.map((q: any) => getEffectiveModuleType(q)));
      return MODULES.filter(m => {
        const mType = m.type.toUpperCase();
        if (mType === 'CONTEXTUAL' || mType === 'SIMULATION') {
          return activeTypes.has('CONTEXTUAL') || activeTypes.has('SIMULATION');
        }
        return activeTypes.has(mType as any);
      });
    }
    return MODULES;
  }, [session, assessment]);

  const handleStartNow = () => {
    const storeState = useSessionStore.getState();
    const currentSession = session || storeState.session;
    const validSessionId =
      currentSession?.id ||
      storeState.assessment?.sessionId ||
      localStorage.getItem('cd-recruit-session-id') ||
      'sess_candidate';

    if (validSessionId && !validSessionId.startsWith('sess_')) {
      apiClient.post(`/sessions/${validSessionId}/begin`).catch((err) => {
        console.warn('[WaitingRoomScreen] /begin call warning:', err?.message);
      });
    }

    const questions = currentSession?.questions || assessment?.questions || storeState.assessment?.questions;
    const durationSeconds = (currentSession?.durationMinutes || allocatedMinutes) * 60;

    initAssessment(validSessionId, durationSeconds, questions);
    transitionTo({ type: 'assessment', moduleIndex: 0, sessionId: validSessionId });
  };

  // When countdown reaches 0, automatically start the assessment
  useEffect(() => {
    if (nowMs >= targetTimeMs) {
      handleStartNow();
    }
  }, [nowMs, targetTimeMs]);

  const msRemaining = Math.max(0, targetTimeMs - nowMs);
  const minutes = Math.floor(msRemaining / 60000);
  const seconds = Math.floor((msRemaining % 60000) / 1000);

  return (
    <div
      className="figma-page-layout items-center"
      role="main"
      aria-labelledby="waiting-room-heading"
    >
      <div className="w-full max-w-[1380px] animate-cd-fade-in py-6">
        {/* Figma waiting-room: HORIZONTAL gap:174px pad:100px 160px */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-[120px]">
          {/* Left: Elastic illustration (Figma Elastic 500x500) */}
          <div className="w-full lg:w-[480px] shrink-0 flex items-center justify-center">
            <img
              src="/assets/Elastic.png"
              alt="Calm candidate relaxation illustration"
              className="w-full max-w-[460px] h-auto object-contain block"
            />
          </div>

          {/* Right: content-block (Figma 720x748 r:20px p:60px gap:32px bg:#FFFFFF) */}
          <div className="w-full max-w-[680px] bg-white rounded-[20px] border border-slate-200 shadow-sm p-8 sm:p-[48px] flex flex-col space-y-7">
            {/* status-row: badge + total time */}
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#BFDBFE] bg-white text-[12px] font-bold text-[#2F65F6] tracking-wide">
                <span className="w-2 h-2 rounded-full bg-[#2F65F6]" />
                <span>PREPARING YOUR ASSESSMENT</span>
              </span>
              <span className="text-[14px] font-medium text-[#475569]">
                · {allocatedMinutes}m total time
              </span>
            </div>

            {/* headline-stack */}
            <div className="space-y-2.5">
              <h1 id="waiting-room-heading" className="text-3xl sm:text-[36px] font-bold text-[#0F172A] leading-tight tracking-tight">
                Take a deep breath
              </h1>
              <p className="text-[16px] text-[#475569] leading-relaxed max-w-[500px]">
                Your test environment is initialized. Take a moment to relax before beginning.
              </p>
            </div>

            {/* timer-card (Figma 600x212 r:16px fill:#F8FAFC stroke:#E2E8F0 p:28px 32px gap:16px) */}
            <div className="w-full rounded-[16px] bg-[#F8FAFC] border border-[#E2E8F0] p-6 sm:p-7 flex flex-col space-y-4">
              {/* card-top */}
              <div className="flex items-center justify-between">
                <span className="text-[12px] sm:text-[13px] font-bold text-[#475569] uppercase tracking-wider">
                  STARTING AUTOMATICALLY IN
                </span>
                <div className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#15803D]">
                  <Check size={16} strokeWidth={2.5} className="text-[#15803D]" />
                  <span>Environment Ready</span>
                </div>
              </div>

              {/* Dynamic countdown display & Start button */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div
                  className="font-mono text-4xl sm:text-[56px] font-extrabold text-[#2F65F6] tracking-tight tabular-nums leading-none"
                  role="timer"
                  aria-live="off"
                >
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>

                <button
                  onClick={handleStartNow}
                  className="figma-btn-primary shadow-xs hover:brightness-105 transition-all text-sm inline-flex items-center gap-2 px-5 py-2.5 cursor-pointer"
                  type="button"
                >
                  <span>Start Assessment Now</span>
                  <ArrowRight size={14} />
                </button>
              </div>

              {/* Caption */}
              <p className="text-[13px] sm:text-[14px] text-[#475569] leading-relaxed">
                Assessment will automatically launch when the preheat countdown reaches 00:00, or click start above anytime.
              </p>
            </div>

            {/* modules-list */}
            <div className="space-y-3">
              <div className="text-[14px] font-bold text-[#475569]">
                Assigned Modules:
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {activeModules.map((m) => (
                  <span
                    key={m.type}
                    className="inline-flex items-center px-4 py-1.5 rounded-full border border-[#E2E8F0] bg-white text-[14px] font-semibold text-black shadow-2xs"
                  >
                    {m.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Line separator */}
            <div className="w-full border-t border-[#E2E8F0]" />

            {/* footer */}
            <div className="flex items-center justify-between text-[14px] text-[#475569] font-medium">
              <a
                href={SUPPORT_EMAIL}
                className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors"
              >
                <HelpCircle size={16} className="text-[#475569]" />
                <span>Need support?</span>
              </a>
              <span>Proctora Candidate Environment</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
