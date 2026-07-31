import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { loginWithKeycloak, isAuthenticated } from "../lib/auth";
import { AlertCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
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
      className="min-h-screen w-full text-[#0B0B0D] font-sans flex items-center justify-end px-6 md:px-16 lg:px-24 py-12 relative overflow-hidden bg-[#090d16]"
      style={{
        backgroundImage: "url('/Login-admin-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "right center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Subtle overlay to ensure high contrast & legibility */}
      <div className="absolute inset-0 bg-black/15 pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10 bg-white/70 backdrop-blur-xl border border-white/40 rounded-2xl p-8 shadow-2xl transition-all duration-300">
        <div className="flex items-center gap-3 mb-6">

          <div>
            <div className="text-[19px] font-bold tracking-tight text-[#0B0B0D] leading-none mb-1">
              Proctora
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#5B5B64] leading-none">
              admin console
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-[#FFF5F5] border border-[#FECACA] flex items-start gap-2.5 text-[#DC2626] text-[12px] shadow-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
              email / username
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="text"
              placeholder="admin@cdrecruit.local or email"
              disabled={loading}
              className="w-full bg-white border border-[#E6E6EA] rounded-lg px-3.5 py-2.5 text-[13px] text-[#0B0B0D] focus:outline-none focus:border-[#2F5CFF] focus:ring-2 focus:ring-[#2F5CFF]/20 transition-all disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
              password
            </label>
            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              type="password"
              placeholder="••••••••"
              disabled={loading}
              className="w-full bg-white border border-[#E6E6EA] rounded-lg px-3.5 py-2.5 text-[13px] text-[#0B0B0D] focus:outline-none focus:border-[#2F5CFF] focus:ring-2 focus:ring-[#2F5CFF]/20 transition-all disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2F5CFF] hover:bg-[#0037FF] active:scale-[0.99] text-white font-medium text-[13px] py-2.5 rounded-lg transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div className="mt-4 pt-4 border-t border-[#E6E6EA] text-center text-[11px] text-[#8B8B93]">
            Default Dev Credentials:{" "}
            <span className="font-mono text-[#0B0B0D] font-semibold">admin@cdrecruit.local</span> /{" "}
            <span className="font-mono text-[#0B0B0D] font-semibold">password</span>
          </div>
        </form>
      </div>
    </div>
  );
}
