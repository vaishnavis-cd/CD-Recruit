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
      className="min-h-screen w-full text-ink font-sans flex items-center justify-center p-4 relative overflow-hidden bg-canvas"
      style={{
        backgroundImage: "url('/Login-admin-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Subtle light overlay to ensure legibility */}
      <div className="absolute inset-0 bg-black/5 pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10 bg-white/75 backdrop-blur-2xl border border-white/50 rounded-2xl p-8 shadow-2xl transition-all duration-300">
        <div className="flex items-center gap-3 mb-6">
          <img src="/Logo.png" alt="Proctora Logo" className="w-8 h-8 object-contain" />
          <div>
            <div className="text-xl font-bold tracking-tight text-ink leading-none mb-1">
              Proctora
            </div>
            <div className="text-2xs font-mono uppercase tracking-[0.2em] text-ink-secondary leading-none">
              admin console
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-danger-border flex items-start gap-2.5 text-danger-hover text-xs shadow-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs-plus font-mono uppercase tracking-[0.14em] text-ink-secondary mb-1.5">
              email / username
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="text"
              placeholder="admin@cdrecruit.local or email"
              disabled={loading}
              className="w-full bg-white border border-line rounded-lg px-3.5 py-2.5 text-sm-minus text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs-plus font-mono uppercase tracking-[0.14em] text-ink-secondary mb-1.5">
              password
            </label>
            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              type="password"
              placeholder="••••••••"
              disabled={loading}
              className="w-full bg-white border border-line rounded-lg px-3.5 py-2.5 text-sm-minus text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand hover:bg-brand-hover active:scale-[0.99] text-white font-medium text-sm-minus py-2.5 rounded-lg transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
