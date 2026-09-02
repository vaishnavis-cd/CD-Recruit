import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { loginWithKeycloak, isAuthenticated } from "../lib/auth";
import {
  AlertCircle,
  Loader2,
  Code2,
  Terminal,
  Trophy,
  Database,
  Users,
  ClipboardList,
  PieChart,
  Server,
  Monitor,
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
    <div
      className="min-h-screen w-full font-sans flex items-center justify-center p-4 relative overflow-hidden bg-[#060A14]"
      style={{
        backgroundImage: "url('/Login-admin-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Subtle Background Watermark Tech Icons matching Figma */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
        {/* Top-Left: Code Bracket */}
        <div className="absolute left-[8%] top-[9%] text-slate-500/20">
          <Code2 size={42} strokeWidth={1.5} />
        </div>

        {/* Top-Right: Terminal Prompt */}
        <div className="absolute right-[10%] top-[8%] text-slate-500/20">
          <Terminal size={38} strokeWidth={1.5} />
        </div>

        {/* Mid-Left: Trophy */}
        <div className="absolute left-[19%] top-[29%] text-slate-500/20">
          <Trophy size={36} strokeWidth={1.5} />
        </div>

        {/* Mid-Left: Database */}
        <div className="absolute left-[9%] top-[48%] text-slate-500/20">
          <Database size={34} strokeWidth={1.5} />
        </div>

        {/* Mid-Right: Users */}
        <div className="absolute right-[16%] top-[51%] text-slate-500/20">
          <Users size={34} strokeWidth={1.5} />
        </div>

        {/* Bottom-Left: Clipboard */}
        <div className="absolute left-[16%] bottom-[16%] text-slate-500/20">
          <ClipboardList size={34} strokeWidth={1.5} />
        </div>

        {/* Bottom-Center: Pie Chart */}
        <div className="absolute left-[54%] bottom-[23%] text-slate-500/20">
          <PieChart size={38} strokeWidth={1.5} />
        </div>

        {/* Bottom-Right: Server Stack */}
        <div className="absolute right-[18%] bottom-[13%] text-slate-500/20">
          <Server size={34} strokeWidth={1.5} />
        </div>

        {/* Bottom-Center-Left: Monitor */}
        <div className="absolute left-[31%] bottom-[6%] text-slate-500/20">
          <Monitor size={34} strokeWidth={1.5} />
        </div>
      </div>

      {/* Figma LoginCard (Width: 480px, Radius: 24px, Padding: 40px, Gap: 24px, Drop Shadow: 0 16px 32px rgba(0,0,0,0.2)) */}
      <div className="w-full max-w-[480px] relative z-10 bg-white rounded-[24px] p-[40px] shadow-[0_16px_32px_rgba(0,0,0,0.20)] border border-[#E2E8F0]/30 transition-all">
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
