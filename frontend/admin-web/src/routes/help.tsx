import { createFileRoute, Link } from "@tanstack/react-router";
import {
  HelpCircle,
  Construction,
  Mail,
  ArrowLeft,
  BookOpen,
  Sparkles,
  ExternalLink,
  X,
  LifeBuoy,
} from "lucide-react";

export const Route = createFileRoute("/help")({
  component: HelpPage,
});

function HelpPage() {
  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      window.location.href = "/dashboard";
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#f8fafc] text-[#0d1424] font-sans antialiased selection:bg-blue-100">
      {/* Standalone Brand Navigation Header (No Sidebar) */}
      <header className="bg-white border-b border-slate-200/80 px-6 sm:px-10 py-4.5 shrink-0 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[20px] font-extrabold tracking-tight text-[#0d1424]">
              Proctora
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2f68ff] bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md">
              Help Center
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href="mailto:support@proctora.com"
            className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold text-[#2f68ff] bg-blue-50/70 hover:bg-blue-100/60 transition-all border border-blue-100"
          >
            <Mail size={14} />
            <span>support@proctora.com</span>
          </a>

          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold text-[#64748b] hover:text-[#0d1424] hover:bg-slate-100 transition-all border border-slate-200 shadow-2xs cursor-pointer"
            title="Close this window or return to dashboard"
          >
            <X size={15} />
            <span>Close Window</span>
          </button>
        </div>
      </header>

      {/* Main Standalone Content Area */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="max-w-xl w-full bg-white rounded-3xl border border-slate-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-8 sm:p-12 text-center space-y-7 animate-in fade-in duration-200">
          {/* Animated Icon Container */}
          <div className="relative mx-auto w-22 h-22">
            <div className="absolute inset-0 rounded-3xl bg-amber-500/10 blur-xl animate-pulse" />
            <div className="relative w-22 h-22 rounded-3xl bg-gradient-to-br from-amber-50 via-amber-100/50 to-amber-200/30 border border-amber-200/90 flex items-center justify-center text-amber-600 shadow-xs">
              <Construction size={40} strokeWidth={1.75} />
            </div>
          </div>

          {/* Title & Badge */}
          <div className="space-y-2.5">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-amber-50 text-amber-700 border border-amber-200/80">
              <Sparkles size={12} className="text-amber-500" />
              <span>Under Construction</span>
            </div>
            <h1 className="text-2xl sm:text-[28px] font-bold text-[#0d1424] tracking-tight leading-snug">
              Proctora Help &amp; User Guides
            </h1>
            <p className="text-[14px] text-[#64748b] leading-relaxed max-w-md mx-auto">
              This standalone help center is currently being assembled. You'll soon find step-by-step documentation, proctoring configuration manuals, and interactive walkthroughs here.
            </p>
          </div>

          {/* Support Information Card */}
          <div className="bg-[#f8fafc] border border-slate-200/80 rounded-2xl p-5 text-left flex items-start gap-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2f68ff] flex items-center justify-center shrink-0 mt-0.5 border border-blue-100">
              <LifeBuoy size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold text-[#0d1424]">
                Need immediate support with an assessment?
              </div>
              <div className="text-[12.5px] text-[#64748b] mt-1 leading-relaxed">
                Directly connect with our dedicated recruitment operations team. We are available 24/7 to resolve technical queries or candidate proctoring alerts.
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <a
              href="mailto:support@proctora.com"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold bg-[#2f68ff] text-white hover:bg-[#1e54ea] transition-all shadow-xs hover:shadow-md cursor-pointer"
            >
              <Mail size={15} />
              <span>Email support@proctora.com</span>
            </a>
            <Link
              to="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold text-[#475569] bg-white border border-slate-200 hover:bg-slate-50 hover:text-[#0d1424] transition-all shadow-2xs"
            >
              <ArrowLeft size={15} />
              <span>Go to Dashboard</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Standalone Footer */}
      <footer className="py-5 text-center text-[12px] text-[#94a3b8] border-t border-slate-200/60 bg-white">
        Proctora Enterprise Recruitment Platform &copy; {new Date().getFullYear()} &middot; All Rights Reserved
      </footer>
    </div>
  );
}
