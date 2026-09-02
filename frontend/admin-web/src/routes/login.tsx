import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { loginWithKeycloak, isAuthenticated } from "../lib/auth";
import {
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign In — Proctora Admin" },
      {
        name: "description",
        content: "Proctora Admin Console Login. Access secure proctoring governance, test suites, and candidate analytics.",
      },
    ],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !pw) {
      setError("Please enter both email and password.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await loginWithKeycloak(email, pw);
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      setError(err.message || "Failed to authenticate with Keycloak.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full font-sans flex items-center justify-center p-4 relative overflow-hidden bg-[#070B16] select-none">
      {/* Figma Ambient Background Watermark Icons (Clean Minimalist Vector Outlines) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden text-[#334155]/50">
        {/* Top-Left: Code Bracket </> */}
        <div className="absolute left-[7%] top-[9%]">
          <svg className="w-14 h-14" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 14L6 24L16 34" />
            <path d="M32 14L42 24L32 34" />
            <path d="M27 10L21 38" />
          </svg>
        </div>

        {/* Top-Right: Terminal Prompt >_ */}
        <div className="absolute right-[9%] top-[7%]">
          <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 14L18 24L8 34" />
            <path d="M22 34H38" />
          </svg>
        </div>

        {/* Mid-Left (Upper): Trophy */}
        <div className="absolute left-[19%] top-[29%]">
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 4h16v5a8 8 0 0 1-8 8 8 8 0 0 1-8-8Z" />
            <path d="M12 17v4" />
            <path d="M8 21h8" />
          </svg>
        </div>

        {/* Mid-Left (Lower): Database Cylinder */}
        <div className="absolute left-[9%] top-[49%]">
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
          </svg>
        </div>

        {/* Mid-Right: Users */}
        <div className="absolute right-[15%] top-[52%]">
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>

        {/* Bottom-Left: Clipboard Document */}
        <div className="absolute left-[16%] bottom-[15%]">
          <svg className="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect width="14" height="18" x="5" y="4" rx="2" />
            <path d="M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1Z" />
          </svg>
        </div>

        {/* Bottom-Center-Left: Monitor */}
        <div className="absolute left-[31%] bottom-[5%]">
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="14" x="2" y="3" rx="2" />
            <line x1="8" x2="16" y1="21" y2="21" />
            <line x1="12" x2="12" y1="17" y2="21" />
          </svg>
        </div>

        {/* Bottom-Center-Right: Pie Chart */}
        <div className="absolute left-[54%] bottom-[22%]">
          <svg className="w-11 h-11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            <path d="M22 12A10 10 0 0 0 12 2v10z" />
          </svg>
        </div>

        {/* Bottom-Right: Server Rack */}
        <div className="absolute right-[17%] bottom-[11%]">
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="8" x="2" y="2" rx="2" />
            <rect width="20" height="8" x="2" y="14" rx="2" />
            <line x1="6" x2="6.01" y1="6" y2="6" />
            <line x1="6" x2="6.01" y1="18" y2="18" />
            <line x1="10" x2="10.01" y1="6" y2="6" />
            <line x1="10" x2="10.01" y1="18" y2="18" />
          </svg>
        </div>
      </div>

      {/* Bottom Center Figma Navigation Pill */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1 rounded-full bg-[#0B101E]/70 border border-slate-800/60 text-slate-600 select-none">
        <button type="button" className="hover:text-slate-300 transition-colors p-0.5">
          <ChevronLeft size={15} />
        </button>
        <button type="button" className="hover:text-slate-300 transition-colors p-0.5">
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Figma LoginCard (Width: 480px, Radius: 24px, Padding: 40px, Gap: 24px, Drop Shadow: 0 16px 32px rgba(0,0,0,0.2)) */}
      <div className="w-full max-w-[480px] relative z-10 bg-white rounded-[24px] p-[40px] shadow-[0_16px_32px_rgba(0,0,0,0.20)] border border-slate-100 transition-all select-text">
        {/* Logo Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-[38px] h-[38px] rounded-full bg-[#2563EB] flex items-center justify-center p-1.5 shrink-0 shadow-xs">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" className="w-full h-full">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="5.5" />
              <circle cx="12" cy="12" r="2" fill="white" />
            </svg>
          </div>
          <div>
            <div className="text-[22px] font-bold tracking-tight text-[#0F172A] leading-none mb-1">
              Proctora
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748B] leading-none">
              ADMIN CONSOLE
            </div>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3.5 rounded-[12px] bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-600 text-xs shadow-xs">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#475569] mb-2">
              EMAIL / USERNAME
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="text"
              placeholder="admin@cdrecruit.local"
              disabled={loading}
              className="w-full h-[48px] bg-[#EEF2F6] rounded-[14px] px-4 text-[14px] text-[#0F172A] placeholder-[#94A3B8] font-medium outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:bg-white transition-all disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#475569] mb-2">
              PASSWORD
            </label>
            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              type="password"
              placeholder="••••••••"
              disabled={loading}
              className="w-full h-[48px] bg-[#EEF2F6] rounded-[14px] px-4 text-[14px] text-[#0F172A] placeholder-[#94A3B8] font-medium outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:bg-white transition-all disabled:opacity-50"
            />
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={loading}
              className="w-full h-[48px] bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.99] text-white font-semibold text-[14px] rounded-[14px] transition-all shadow-md shadow-[#2563EB]/25 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              <span>{loading ? "Signing in…" : "Sign In"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
