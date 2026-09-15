import React, { useEffect, useState } from 'react';
import { services } from '../services';
import { StatusChip } from '../components/common/StatusChip';
import { AssessmentTopBar } from '../components/common/AssessmentTopBar';
import { LightGradientBackground } from '../components/common/LightGradientBackground';
import { Check, Copy, Unlock, BookOpen, LifeBuoy, ArrowRight } from 'lucide-react';

const SUPPORT_EMAIL = 'mailto:support@proctora.com';
const LEARNING_HUB_LINKS = [
  { label: 'Data Structures & Algorithms Refresher', href: '#learning-hub-dsa' },
  { label: 'SQL Fundamentals Guide', href: '#learning-hub-sql' },
  { label: 'System Design Concepts', href: '#learning-hub-system-design' },
  { label: 'Engineering Communication Skills', href: '#learning-hub-comms' },
];

interface DoneScreenProps {
  referenceId: string;
  sessionId: string;
  auto: boolean;
}

const EXPERIENCE_RATINGS = [1, 2, 3, 4, 5] as const;

export function DoneScreen({ referenceId, auto }: DoneScreenProps) {
  const [surveyRating, setSurveyRating] = useState<number | null>(null);
  const [surveyComment, setSurveyComment] = useState('');
  const [surveySent, setSurveySent] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopyRef() {
    navigator.clipboard.writeText(referenceId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  // Release camera/mic on mount
  useEffect(() => {
    services.cv.stop();
  }, []);

  async function handleSurveySubmit(e: React.FormEvent) {
    e.preventDefault();
    await new Promise(resolve => setTimeout(resolve, 300));
    setSurveySent(true);
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-white overflow-x-hidden select-none">
      {/* Dynamic light gradient background matching waiting room / review screens */}
      <LightGradientBackground />

      {/* Common Proctora Top Bar */}
      <AssessmentTopBar showTimer={false} />

      {/* Main Content Area */}
      <main
        className="relative z-10 flex-1 w-full max-w-[1104px] mx-auto px-4 sm:px-8 py-10 flex flex-col items-center gap-8"
        role="main"
        aria-labelledby="done-heading"
      >
        {/* Message Header (matching message-header.svg) */}
        <div className="flex flex-col items-center text-center gap-3 max-w-2xl">
          {/* Emerald Checkmark Circle */}
          <div className="w-16 h-16 rounded-full bg-[#F0FDF4] border border-[#10B981] flex items-center justify-center text-[#10B981] shadow-sm mb-1">
            <Check size={28} strokeWidth={2.5} />
          </div>

          {/* Pill Badge */}
          <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-bold tracking-wider bg-[#F0FDF4] border border-[#10B981]/30 text-[#10B981] uppercase">
            All Done
          </span>

          {/* Heading */}
          <h1 id="done-heading" className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
            {auto ? 'Assessment Submitted' : 'Thanks for completing your assessment'}
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-base text-[#475569] leading-relaxed">
            {auto
              ? 'Time limit reached — your last-saved answers were submitted automatically.'
              : 'Your responses have been recorded and your camera and microphone access have been completely released.'}
          </p>
        </div>

        {/* Reference Card (matching reference-card.svg) */}
        <div className="w-full max-w-[640px] bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded-xl p-5 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Reference ID
            </span>
            <span
              className="font-mono text-xl sm:text-2xl font-bold tracking-wide text-[#2F65F6] select-all mt-0.5"
              aria-label={`Session reference ID: ${referenceId}`}
            >
              {referenceId}
            </span>
          </div>

          <button
            onClick={handleCopyRef}
            title={copied ? 'Copied!' : 'Copy reference ID'}
            aria-label={copied ? 'Copied' : 'Copy reference ID'}
            type="button"
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer shrink-0
              ${copied
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-[#CBD5E1] text-[#334155] hover:bg-slate-50 hover:border-slate-400 active:scale-95'
              }
            `}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* Camera & Microphone Access Released Badge */}
        <div className="inline-flex items-center gap-2 text-xs px-4 py-1.5 rounded-full bg-[#F0FDF4] border border-[#10B981]/30 text-emerald-800 font-medium">
          <Unlock size={14} className="text-[#10B981]" />
          <span>Camera &amp; microphone access released</span>
        </div>

        {/* Content Grid: What happens next + Learning hub */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {/* What happens next Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-7 space-y-5 shadow-sm">
            <div className="text-base font-bold text-[#0F172A]">What happens next</div>
            <ol className="space-y-4">
              <li className="flex items-start gap-3.5">
                <span className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 bg-blue-50 text-[#2563EB] border border-blue-200 mt-0.5">
                  1
                </span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Scoring &amp; review</div>
                  <div className="text-xs text-[#64748B] mt-0.5">Our team reviews your submission within 3–5 business days.</div>
                </div>
              </li>
              <li className="flex items-start gap-3.5">
                <span className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 bg-blue-50 text-[#2563EB] border border-blue-200 mt-0.5">
                  2
                </span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Recruiter follow-up</div>
                  <div className="text-xs text-[#64748B] mt-0.5">You'll receive an email notification with review results.</div>
                </div>
              </li>
              <li className="flex items-start gap-3.5">
                <span className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 bg-blue-50 text-[#2563EB] border border-blue-200 mt-0.5">
                  3
                </span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Support inquiry</div>
                  <div className="text-xs text-[#64748B] mt-0.5">Reach out with your reference ID if you have questions.</div>
                </div>
              </li>
            </ol>
          </div>

          {/* Learning Hub Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-7 space-y-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                  <BookOpen size={18} className="text-[#2563EB]" />
                  <span>Learning hub</span>
                </div>
                <StatusChip tone="neutral" label="COMING SOON" size="sm" />
              </div>
              <div className="space-y-2">
                {LEARNING_HUB_LINKS.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] transition-colors hover:border-slate-400 group"
                  >
                    <span className="text-xs sm:text-sm text-slate-800 font-medium group-hover:text-blue-600 transition-colors">
                      {l.label}
                    </span>
                    <span className="text-2xs font-mono text-[#64748B] flex items-center gap-1">
                      <span>Preview</span>
                      <ArrowRight size={10} />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Feedback Section (matching feedback-section.svg) */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-sm w-full space-y-4">
          <div>
            <div className="text-lg font-bold text-[#0F172A]">How was your experience?</div>
            <p className="text-xs sm:text-sm text-[#475569] mt-0.5">Optional candidate feedback</p>
          </div>

          {!surveySent ? (
            <form onSubmit={handleSurveySubmit} className="space-y-4 pt-1">
              {/* Rating Pills (1 to 5) */}
              <div className="flex items-center gap-3">
                {EXPERIENCE_RATINGS.map((n) => {
                  const selected = surveyRating === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSurveyRating(n)}
                      className={`
                        w-12 h-12 rounded-full flex items-center justify-center text-sm transition-all cursor-pointer
                        ${selected
                          ? 'bg-[#EFF6FF] border-2 border-[#2563EB] text-[#2563EB] font-bold shadow-sm'
                          : 'bg-white border border-[#E2E8F0] text-[#475569] hover:border-slate-300 hover:bg-slate-50 font-medium'
                        }
                      `}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>

              {surveyRating !== null && (
                <div className="space-y-3 animate-cd-fade-in pt-1">
                  <textarea
                    value={surveyComment}
                    onChange={e => setSurveyComment(e.target.value)}
                    placeholder="Any additional feedback on the interface or process…"
                    rows={3}
                    className="w-full p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-[#2563EB] focus:bg-white transition-all"
                  />
                  <button type="submit" className="figma-btn-primary">
                    <span>Submit Feedback</span>
                  </button>
                </div>
              )}
            </form>
          ) : (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <Check size={16} />
              <span>Thank you for sharing your feedback!</span>
            </div>
          )}
        </div>

        {/* Footer Support Link */}
        <div className="pt-2 text-center">
          <a
            href={SUPPORT_EMAIL}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
          >
            <LifeBuoy size={14} />
            <span>Contact support</span>
          </a>
        </div>
      </main>
    </div>
  );
}
