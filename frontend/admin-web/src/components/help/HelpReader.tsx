import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
  Lightbulb,
  Check,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  Share2,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  ExternalLink,
  Play,
  Pause,
  Sliders,
  ShieldCheck,
  UserCheck,
  Search,
  Filter,
  Eye,
  RotateCcw,
  CheckCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Camera,
  Maximize2,
  Lock,
  X,
} from "lucide-react";
import type {
  HelpGuide,
  GuideSection,
  CalloutBlock,
  StepItem,
  FaqItem,
  ScreenshotPlaceholder,
} from "../../data/helpDocsData";

interface HelpReaderProps {
  guide: HelpGuide;
  onSelectGuide: (slug: string) => void;
  previousGuide?: HelpGuide | null;
  nextGuide?: HelpGuide | null;
  hideTopBreadcrumb?: boolean;
}

export function HelpReader({
  guide,
  onSelectGuide,
  previousGuide,
  nextGuide,
  hideTopBreadcrumb = false,
}: HelpReaderProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<"yes" | "no" | null>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Reset interactive feedback and FAQ state whenever the user navigates to a new guide
  useEffect(() => {
    setFeedbackGiven(null);
    setOpenFaqIndex(0);
  }, [guide.slug]);

  const handleShare = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("guide", guide.slug);
    navigator.clipboard?.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleScrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-10">
      {/* Top Breadcrumb & Share (Hidden if parent sticky breadcrumb is active) */}
      {!hideTopBreadcrumb && (
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/80 text-xs font-medium text-slate-500">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400">Help Center</span>
            <ChevronRight size={13} className="text-slate-300" />
            <span className="text-slate-600 font-semibold">{guide.categoryLabel}</span>
            <ChevronRight size={13} className="text-slate-300" />
            <span className="text-[#0d1424] font-medium truncate max-w-xs">{guide.title}</span>
          </div>

          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 !rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-[#0d1424] hover:bg-slate-50 text-xs transition shadow-2xs cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check size={13} className="text-emerald-500" />
                <span className="text-emerald-600 font-medium">Link copied!</span>
              </>
            ) : (
              <>
                <Share2 size={13} />
                <span>Share Guide</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Guide Header */}
      <header className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 !rounded-full text-xs font-semibold bg-blue-50 text-[#2f68ff] border border-blue-200/70">
            <Sparkles size={13} />
            {guide.badge}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Clock size={13} />
            {guide.readTimeMinutes} min read
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#0d1424] tracking-tight leading-tight">
          {guide.title}
        </h1>

        <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
          {guide.subtitle}
        </p>
      </header>

      {/* On This Page: Table of Contents Jump Box */}
      {guide.sections.length > 1 && (
        <div className="p-5 !rounded-2xl bg-slate-50/80 border border-slate-200/90 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <BookOpen size={14} className="text-[#2f68ff]" />
            <span>On This Page</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {guide.sections.map((section, idx) => (
              <button
                key={section.id}
                type="button"
                onClick={() => handleScrollToSection(section.id)}
                className="text-left text-slate-600 hover:text-[#2f68ff] hover:bg-white px-2.5 py-1.5 !rounded-lg transition truncate flex items-center gap-2 border border-transparent hover:border-slate-200 cursor-pointer"
              >
                <span className="w-4 h-4 rounded-full bg-slate-200/80 text-[10px] font-bold text-slate-600 flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <span className="truncate">{section.heading}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Guide Sections */}
      <div className="space-y-12">
        {guide.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="scroll-mt-24 space-y-6 pt-2"
          >
            <div className="space-y-2 border-b border-slate-100 pb-3">
              <h2 className="text-xl sm:text-2xl font-bold text-[#0d1424] tracking-tight flex items-center gap-2.5">
                <span className="w-1.5 h-6 bg-[#2f68ff] rounded-full inline-block" />
                {section.heading}
              </h2>
              {section.summary && (
                <p className="text-sm text-slate-500 font-medium">
                  {section.summary}
                </p>
              )}
            </div>

            {/* Paragraphs */}
            <div className="space-y-3.5 text-sm sm:text-base text-slate-700 leading-relaxed">
              {section.paragraphs.map((p, pIdx) => (
                <p key={pIdx}>{p}</p>
              ))}
            </div>

            {/* Callout Blocks (Notion Style) */}
            {section.callouts && section.callouts.length > 0 && (
              <div className="space-y-3 pt-1">
                {section.callouts.map((callout, cIdx) => (
                  <CalloutBox key={cIdx} callout={callout} />
                ))}
              </div>
            )}

            {/* Screenshot Frame / Image Placeholder */}
            {section.screenshotPlaceholder && (
              <div className="pt-2">
                <ScreenshotFrame placeholder={section.screenshotPlaceholder} />
              </div>
            )}

            {/* Interactive UI Mockup (Visual Demonstration) */}
            {section.uiMockupType && (
              <div className="pt-2">
                <InteractiveUIMockup type={section.uiMockupType} />
              </div>
            )}

            {/* Step by Step Procedures */}
            {section.steps && section.steps.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Step-by-Step Procedure
                </div>
                <div className="space-y-3">
                  {section.steps.map((step) => (
                    <div
                      key={step.number}
                      className="p-4 !rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition shadow-2xs flex items-start gap-4"
                    >
                      <div className="w-7 h-7 !rounded-lg bg-[#2f68ff]/10 text-[#2f68ff] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {step.number}
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-[#0d1424]">
                          {step.title}
                        </h4>
                        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                          {step.description}
                        </p>
                        {step.tip && (
                          <div className="text-[11.5px] font-medium text-amber-700 bg-amber-50/70 border border-amber-200/60 !rounded-md px-2.5 py-1 mt-2 inline-block">
                            💡 {step.tip}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Takeaways */}
            {section.keyTakeaways && section.keyTakeaways.length > 0 && (
              <div className="p-4.5 !rounded-xl bg-emerald-50/60 border border-emerald-200/70 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  <CheckCircle size={14} />
                  <span>Key Recruiter Takeaway</span>
                </div>
                <ul className="space-y-1.5 text-xs sm:text-sm text-emerald-950 font-medium">
                  {section.keyTakeaways.map((takeaway, tIdx) => (
                    <li key={tIdx} className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">•</span>
                      <span>{takeaway}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* FAQs Section if provided */}
      {guide.faqs && guide.faqs.length > 0 && (
        <div className="pt-8 border-t border-slate-200 space-y-4">
          <div className="flex items-center gap-2">
            <HelpCircle size={20} className="text-[#2f68ff]" />
            <h3 className="text-xl font-bold text-[#0d1424] tracking-tight">
              Frequently Asked Questions
            </h3>
          </div>
          <div className="space-y-2">
            {guide.faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="!rounded-xl border border-slate-200/90 bg-white overflow-hidden transition"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between p-4 text-left font-semibold text-sm text-[#0d1424] hover:bg-slate-50 transition cursor-pointer !rounded-none"
                  >
                    <span>{faq.question}</span>
                    {isOpen ? (
                      <ChevronUp size={16} className="text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-400 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/40">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Helpful / Feedback Block */}
      <div className="p-6 !rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="space-y-1">
          <div className="text-sm font-bold text-[#0d1424]">
            Was this documentation helpful?
          </div>
          <div className="text-xs text-slate-500">
            Your feedback helps us continuously improve the Proctora admin user manual.
          </div>
        </div>

        {feedbackGiven ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 !rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 animate-in fade-in">
            <Check size={14} />
            <span>Thank you for your feedback!</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFeedbackGiven("yes")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 !rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              <ThumbsUp size={13} />
              <span>Yes, clear</span>
            </button>
            <button
              type="button"
              onClick={() => setFeedbackGiven("no")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 !rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              <ThumbsDown size={13} />
              <span>Needs improvement</span>
            </button>
          </div>
        )}
      </div>

      {/* Previous & Next Article Navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
        {previousGuide ? (
          <button
            type="button"
            onClick={() => onSelectGuide(previousGuide.slug)}
            className="p-4 !rounded-xl border border-slate-200/90 bg-white hover:border-[#2f68ff]/40 hover:bg-blue-50/20 text-left transition group shadow-2xs cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 group-hover:text-[#2f68ff] uppercase tracking-wider">
              <ArrowLeft size={12} />
              <span>Previous Guide</span>
            </div>
            <div className="text-sm font-semibold text-[#0d1424] group-hover:text-[#2f68ff] mt-1 line-clamp-1">
              {previousGuide.title}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {previousGuide.categoryLabel}
            </div>
          </button>
        ) : (
          <div />
        )}

        {nextGuide ? (
          <button
            type="button"
            onClick={() => onSelectGuide(nextGuide.slug)}
            className="p-4 !rounded-xl border border-slate-200/90 bg-white hover:border-[#2f68ff]/40 hover:bg-blue-50/20 text-right transition group shadow-2xs cursor-pointer flex flex-col justify-between items-end"
          >
            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 group-hover:text-[#2f68ff] uppercase tracking-wider">
              <span>Next Guide</span>
              <ArrowRight size={12} />
            </div>
            <div className="text-sm font-semibold text-[#0d1424] group-hover:text-[#2f68ff] mt-1 line-clamp-1">
              {nextGuide.title}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {nextGuide.categoryLabel}
            </div>
          </button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Notion-Style Callout Box
// ----------------------------------------------------------------------------
function CalloutBox({ callout }: { callout: CalloutBlock }) {
  const styles = {
    tip: {
      bg: "bg-amber-50/80 border-amber-200/80 text-amber-950",
      iconBg: "bg-amber-100 text-amber-700",
      icon: Lightbulb,
      defaultTitle: "Pro Tip",
    },
    warning: {
      bg: "bg-rose-50/80 border-rose-200/80 text-rose-950",
      iconBg: "bg-rose-100 text-rose-700",
      icon: AlertTriangle,
      defaultTitle: "Important Note",
    },
    info: {
      bg: "bg-blue-50/80 border-blue-200/80 text-blue-950",
      iconBg: "bg-blue-100 text-[#2f68ff]",
      icon: Info,
      defaultTitle: "Helpful Info",
    },
    success: {
      bg: "bg-emerald-50/80 border-emerald-200/80 text-emerald-950",
      iconBg: "bg-emerald-100 text-emerald-700",
      icon: CheckCircle2,
      defaultTitle: "Best Practice",
    },
  }[callout.type];

  const Icon = styles.icon;

  return (
    <div className={`p-4 !rounded-xl border flex items-start gap-3.5 ${styles.bg}`}>
      <div
        className={`w-7 h-7 !rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${styles.iconBg}`}
      >
        <Icon size={16} />
      </div>
      <div className="space-y-0.5 min-w-0 flex-1">
        <div className="text-xs font-bold uppercase tracking-wider">
          {callout.title || styles.defaultTitle}
        </div>
        <div className="text-xs sm:text-sm leading-relaxed opacity-95">
          {callout.message}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Screenshot Frame / Visual Image Placeholder
// ----------------------------------------------------------------------------
function ScreenshotFrame({ placeholder }: { placeholder: ScreenshotPlaceholder }) {
  const [isZoomed, setIsZoomed] = useState(false);

  return (
    <>
      <div className="!rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-2xs transition-all duration-200 hover:shadow-xs group">
        {/* Simulated Browser Window Bar */}
        <div className="bg-slate-100/90 border-b border-slate-200/80 px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
          {/* Traffic light window controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 !rounded-full bg-[#ff5f56] inline-block" />
            <span className="w-2.5 h-2.5 !rounded-full bg-[#ffbd2e] inline-block" />
            <span className="w-2.5 h-2.5 !rounded-full bg-[#27c93f] inline-block" />
          </div>

          {/* Centered URL address pill */}
          <div className="flex items-center gap-1.5 px-3 py-1 !rounded-md bg-white border border-slate-200/90 text-[11px] font-mono text-slate-500 truncate max-w-xs sm:max-w-md shadow-2xs">
            <Lock size={11} className="text-emerald-500 shrink-0" />
            <span className="text-slate-400">app.proctora.com</span>
            <span className="text-[#0d1424] font-semibold">{placeholder.route}</span>
          </div>

          {/* Right badge & expand */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10.5px] font-bold text-[#2f68ff] bg-blue-50 border border-blue-200/60 px-2 py-0.5 !rounded-md">
              {placeholder.calloutBadge || "Screenshot Reference"}
            </span>
            {placeholder.imageUrl && (
              <button
                type="button"
                onClick={() => setIsZoomed(true)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 !rounded transition cursor-pointer"
                title="Expand screenshot"
              >
                <Maximize2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        {placeholder.imageUrl ? (
          <div
            onClick={() => setIsZoomed(true)}
            className="cursor-pointer overflow-hidden p-2 bg-slate-900/5 hover:opacity-95 transition"
          >
            <img
              src={placeholder.imageUrl}
              alt={placeholder.title}
              className="w-full h-auto !rounded-xl object-contain border border-slate-200/60"
            />
          </div>
        ) : (
          /* High-End Notion-Style Screenshot Placeholder Card */
          <div className="p-6 sm:p-7 bg-gradient-to-b from-slate-50/70 via-white to-slate-50/50 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 !rounded-xl bg-blue-50/80 border border-blue-200/70 text-[#2f68ff] flex items-center justify-center shrink-0 shadow-2xs">
                <Camera size={22} />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm sm:text-base font-bold text-[#0d1424]">
                    {placeholder.title}
                  </h4>
                  <span className="px-2 py-0.5 !rounded text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                    Screenshot Placeholder
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                  <span>Target Screen:</span>
                  <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 !rounded text-[11px] font-semibold">
                    {placeholder.route}
                  </span>
                  <span className="text-slate-300">&bull;</span>
                  <span className="text-slate-600 font-medium">{placeholder.targetElement}</span>
                </div>
              </div>
            </div>

            {/* Instruction Box for Capturing Screenshot */}
            <div className="p-4 !rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-2 text-xs">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#2f68ff]" />
                <span>Zero-Editing Capture Instructions:</span>
              </div>
              <p className="text-slate-600 leading-relaxed font-normal">
                {placeholder.description}
              </p>
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-600">Framing Guide:</span>
                <span className="bg-slate-100 px-2 py-0.5 !rounded text-slate-700 font-mono">
                  1440 × 900 resolution
                </span>
                <span className="text-slate-300">&bull;</span>
                <span>Drop raw image into help directory &mdash; frame, shadows &amp; rounded corners are auto-applied</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer Caption */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200/70 flex items-start gap-2.5 text-xs text-slate-600">
          <Info size={14} className="text-[#2f68ff] shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <strong className="text-slate-800 font-semibold">Recruiter Guide Flow:</strong>{" "}
            {placeholder.caption}
          </span>
        </div>
      </div>

      {/* Lightbox Modal (if real image exists) */}
      {isZoomed && placeholder.imageUrl && (
        <div
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl w-full bg-white !rounded-2xl overflow-hidden shadow-2xl space-y-2 p-2"
          >
            <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-slate-700">
              <span>{placeholder.title}</span>
              <button
                type="button"
                onClick={() => setIsZoomed(false)}
                className="p-1 !rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <img
              src={placeholder.imageUrl}
              alt={placeholder.title}
              className="w-full h-auto !rounded-xl max-h-[85vh] object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}

// ----------------------------------------------------------------------------
// Realistic Interactive UI Mockups
// ----------------------------------------------------------------------------
function InteractiveUIMockup({
  type,
}: {
  type:
    | "drive-builder"
    | "roster-table"
    | "scorecard"
    | "proctoring-clip"
    | "composition-summary"
    | "question-filter";
}) {
  return (
    <div className="!rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 sm:p-5 shadow-xs overflow-hidden">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 text-xs text-slate-500 font-medium">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-2 font-bold text-slate-700 uppercase tracking-wider text-[10px]">
            Interactive UI Mockup &bull; Live Preview
          </span>
        </div>
        <span className="text-[11px] bg-white border border-slate-200 px-2 py-0.5 !rounded-md text-slate-600">
          Try clicking elements
        </span>
      </div>

      {type === "drive-builder" && <DriveBuilderMockup />}
      {type === "roster-table" && <RosterTableMockup />}
      {type === "scorecard" && <ScorecardMockup />}
      {type === "composition-summary" && <CompositionSummaryMockup />}
      {type === "question-filter" && <QuestionFilterMockup />}
    </div>
  );
}

// 1. Mockup: Drive Builder
function DriveBuilderMockup() {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [webcamEnabled, setWebcamEnabled] = useState(true);
  const [fullscreenEnabled, setFullscreenEnabled] = useState(true);

  return (
    <div className="bg-white !rounded-xl border border-slate-200 p-4 space-y-4 text-xs">
      {/* Wizard Steps */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveStep(1)}
          className={`pb-2.5 px-3 font-semibold transition border-b-2 cursor-pointer !rounded-none ${
            activeStep === 1
              ? "border-[#2f68ff] text-[#2f68ff]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          1. Role &amp; Schedule
        </button>
        <button
          type="button"
          onClick={() => setActiveStep(2)}
          className={`pb-2.5 px-3 font-semibold transition border-b-2 cursor-pointer !rounded-none ${
            activeStep === 2
              ? "border-[#2f68ff] text-[#2f68ff]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          2. Assessment Modules
        </button>
        <button
          type="button"
          onClick={() => setActiveStep(3)}
          className={`pb-2.5 px-3 font-semibold transition border-b-2 cursor-pointer !rounded-none ${
            activeStep === 3
              ? "border-[#2f68ff] text-[#2f68ff]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          3. Proctoring &amp; Review
        </button>
      </div>

      {activeStep === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in">
          <div>
            <label className="text-slate-600 font-medium block mb-1">
              Drive Title
            </label>
            <input
              type="text"
              readOnly
              value="Senior Full-Stack Engineer Campus 2026"
              className="w-full px-3 py-1.5 !rounded-lg border border-slate-200 bg-slate-50 font-medium text-slate-800"
            />
          </div>
          <div>
            <label className="text-slate-600 font-medium block mb-1">
              Assessment Duration
            </label>
            <input
              type="text"
              readOnly
              value="90 Minutes (Auto-enforced)"
              className="w-full px-3 py-1.5 !rounded-lg border border-slate-200 bg-slate-50 font-medium text-slate-800"
            />
          </div>
        </div>
      )}

      {activeStep === 2 && (
        <div className="space-y-2 animate-in fade-in">
          <div className="p-2.5 !rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-800">Module 1: React &amp; State</span>
              <span className="text-slate-400 ml-2">(15 Questions &bull; 30 min)</span>
            </div>
            <span className="px-2 py-0.5 !rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
              Active
            </span>
          </div>
          <div className="p-2.5 !rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-800">Module 2: Live Code Sandbox</span>
              <span className="text-slate-400 ml-2">(2 Problems &bull; 60 min)</span>
            </div>
            <span className="px-2 py-0.5 !rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
              Active
            </span>
          </div>
        </div>
      )}

      {activeStep === 3 && (
        <div className="space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between p-2 !rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <div className="font-semibold text-slate-800">10-Second Periodic Webcam Monitoring</div>
              <div className="text-[11px] text-slate-500">
                Captures brief video check-ins to verify candidate presence
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWebcamEnabled(!webcamEnabled)}
              className={`px-3 py-1 !rounded-md font-bold text-[11px] transition cursor-pointer ${
                webcamEnabled
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {webcamEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          <div className="flex items-center justify-between p-2 !rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <div className="font-semibold text-slate-800">Fullscreen &amp; Tab Switch Guard</div>
              <div className="text-[11px] text-slate-500">
                Records unblur events and alerts candidate upon leaving test tab
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFullscreenEnabled(!fullscreenEnabled)}
              className={`px-3 py-1 !rounded-md font-bold text-[11px] transition cursor-pointer ${
                fullscreenEnabled
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {fullscreenEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 2. Mockup: Roster Table
function RosterTableMockup() {
  const [filter, setFilter] = useState<"all" | "completed" | "flagged">("all");

  const candidates = [
    {
      name: "Sophia Chen",
      email: "sophia.chen@example.com",
      status: "completed",
      score: "94%",
      integrity: "High (98%)",
      flagged: false,
    },
    {
      name: "Marcus Vance",
      email: "marcus.v@example.com",
      status: "flagged",
      score: "88%",
      integrity: "Review (72%)",
      flagged: true,
    },
    {
      name: "Elena Rostova",
      email: "elena.r@example.com",
      status: "completed",
      score: "91%",
      integrity: "High (99%)",
      flagged: false,
    },
  ];

  const filtered = candidates.filter((c) => {
    if (filter === "completed") return !c.flagged;
    if (filter === "flagged") return c.flagged;
    return true;
  });

  return (
    <div className="bg-white !rounded-xl border border-slate-200 p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-slate-800">Candidate Roster</span>
          <span className="text-slate-400">({filtered.length} visible)</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 !rounded-md font-semibold transition cursor-pointer ${
              filter === "all"
                ? "bg-[#2f68ff] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("completed")}
            className={`px-2.5 py-1 !rounded-md font-semibold transition cursor-pointer ${
              filter === "completed"
                ? "bg-[#2f68ff] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Clean
          </button>
          <button
            type="button"
            onClick={() => setFilter("flagged")}
            className={`px-2.5 py-1 !rounded-md font-semibold transition cursor-pointer ${
              filter === "flagged"
                ? "bg-[#2f68ff] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Flagged
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 text-[11px]">
              <th className="pb-2 font-medium">Candidate</th>
              <th className="pb-2 font-medium">Score</th>
              <th className="pb-2 font-medium">Integrity</th>
              <th className="pb-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((c, i) => (
              <tr key={i} className="hover:bg-slate-50 transition">
                <td className="py-2.5">
                  <div className="font-semibold text-slate-800">{c.name}</div>
                  <div className="text-[11px] text-slate-400">{c.email}</div>
                </td>
                <td className="py-2.5 font-bold text-slate-700">{c.score}</td>
                <td className="py-2.5">
                  <span
                    className={`inline-block px-2 py-0.5 !rounded text-[10px] font-bold ${
                      c.flagged
                        ? "bg-rose-100 text-rose-700"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {c.integrity}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  <button
                    type="button"
                    className="px-2.5 py-1 !rounded bg-blue-50 text-[#2f68ff] font-semibold text-[11px] hover:bg-blue-100 transition cursor-pointer"
                  >
                    View Scorecard
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 3. Mockup: Scorecard
function ScorecardMockup() {
  return (
    <div className="bg-white !rounded-xl border border-slate-200 p-4 space-y-4 text-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <div className="text-sm font-extrabold text-[#0d1424]">
            Candidate Evaluation Scorecard
          </div>
          <div className="text-slate-500 text-[11px]">
            Maya Patel &bull; Senior Frontend Specialist
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-black text-emerald-600">92/100</div>
          <span className="px-2 py-0.5 !rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
            Recommended
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        <div>
          <div className="flex justify-between text-slate-700 font-medium mb-1">
            <span>React Components &amp; State</span>
            <span className="font-bold">96%</span>
          </div>
          <div className="w-full h-2 !rounded-full bg-slate-100 overflow-hidden">
            <div className="w-[96%] h-full bg-emerald-500 rounded-full" />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-slate-700 font-medium mb-1">
            <span>Algorithm Efficiency &amp; Data Structures</span>
            <span className="font-bold">88%</span>
          </div>
          <div className="w-full h-2 !rounded-full bg-slate-100 overflow-hidden">
            <div className="w-[88%] h-full bg-blue-500 rounded-full" />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-slate-700 font-medium mb-1">
            <span>System Architecture &amp; TypeScript</span>
            <span className="font-bold">92%</span>
          </div>
          <div className="w-full h-2 !rounded-full bg-slate-100 overflow-hidden">
            <div className="w-[92%] h-full bg-indigo-500 rounded-full" />
          </div>
        </div>
      </div>

      <div className="p-2.5 !rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-600" />
          <div>
            <div className="font-bold text-emerald-900">High Integrity Verified (99%)</div>
            <div className="text-[11px] text-emerald-700">
              0 audio flags, 0 multi-face events, full screen maintained throughout.
            </div>
          </div>
        </div>
        <span className="px-2 py-1 !rounded bg-emerald-600 text-white font-bold text-[10px]">
          Passed Proctoring
        </span>
      </div>
    </div>
  );
}


// 5. Mockup: Assessment Composition Summary
function CompositionSummaryMockup() {
  return (
    <div className="bg-white !rounded-xl border border-slate-200 p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-bold text-slate-800">
          Template Module &amp; Difficulty Composition
        </div>
        <span className="px-2 py-0.5 !rounded bg-blue-50 text-[#2f68ff] font-bold text-[10px]">
          37 Total Questions &bull; 90 min
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 text-[11px]">
              <th className="pb-2 font-medium">Module Name</th>
              <th className="pb-2 font-medium">Count</th>
              <th className="pb-2 font-medium">Easy</th>
              <th className="pb-2 font-medium">Medium</th>
              <th className="pb-2 font-medium">Hard</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2 font-semibold text-slate-800">
                Cognitive Aptitude &amp; Reasoning
              </td>
              <td className="py-2 text-slate-600 font-bold">15</td>
              <td className="py-2 text-emerald-600 font-bold">5</td>
              <td className="py-2 text-amber-600 font-bold">8</td>
              <td className="py-2 text-rose-600 font-bold">2</td>
            </tr>
            <tr>
              <td className="py-2 font-semibold text-slate-800">
                Full-Stack JavaScript &amp; React
              </td>
              <td className="py-2 text-slate-600 font-bold">20</td>
              <td className="py-2 text-emerald-600 font-bold">4</td>
              <td className="py-2 text-amber-600 font-bold">12</td>
              <td className="py-2 text-rose-600 font-bold">4</td>
            </tr>
            <tr>
              <td className="py-2 font-semibold text-slate-800">
                Live Coding Algorithm Challenge
              </td>
              <td className="py-2 text-slate-600 font-bold">2</td>
              <td className="py-2 text-slate-400">-</td>
              <td className="py-2 text-amber-600 font-bold">1</td>
              <td className="py-2 text-rose-600 font-bold">1</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 6. Mockup: Question Filter
function QuestionFilterMockup() {
  const [difficulty, setDifficulty] = useState<"all" | "easy" | "med" | "hard">("all");

  const questions = [
    {
      q: "Explain how React reconciles virtual DOM nodes and key prop usage.",
      diff: "easy",
      tag: "React",
    },
    {
      q: "Implement an LRU Cache in TypeScript with O(1) get and put complexity.",
      diff: "med",
      tag: "Algorithms",
    },
    {
      q: "Design a distributed rate limiter supporting 100,000 req/sec.",
      diff: "hard",
      tag: "System Design",
    },
  ];

  const filtered = questions.filter(
    (q) => difficulty === "all" || q.diff === difficulty
  );

  return (
    <div className="bg-white !rounded-xl border border-slate-200 p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter size={13} className="text-slate-400" />
          <span className="font-bold text-slate-800">Question Filter Simulation</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDifficulty("all")}
            className={`px-2 py-0.5 !rounded font-semibold text-[11px] cursor-pointer ${
              difficulty === "all"
                ? "bg-[#2f68ff] text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setDifficulty("easy")}
            className={`px-2 py-0.5 !rounded font-semibold text-[11px] cursor-pointer ${
              difficulty === "easy"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Easy
          </button>
          <button
            type="button"
            onClick={() => setDifficulty("med")}
            className={`px-2 py-0.5 !rounded font-semibold text-[11px] cursor-pointer ${
              difficulty === "med"
                ? "bg-amber-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Medium
          </button>
          <button
            type="button"
            onClick={() => setDifficulty("hard")}
            className={`px-2 py-0.5 !rounded font-semibold text-[11px] cursor-pointer ${
              difficulty === "hard"
                ? "bg-rose-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Hard
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((item, i) => (
          <div
            key={i}
            className="p-2.5 !rounded-lg border border-slate-200/90 bg-slate-50/60 flex items-center justify-between"
          >
            <div>
              <span className="font-semibold text-slate-800 block">{item.q}</span>
              <span className="text-[10px] text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 !rounded mt-1 inline-block">
                {item.tag}
              </span>
            </div>
            <span
              className={`px-2 py-0.5 !rounded text-[10px] font-bold uppercase ${
                item.diff === "easy"
                  ? "bg-emerald-100 text-emerald-800"
                  : item.diff === "med"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {item.diff}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
