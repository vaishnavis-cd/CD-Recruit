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
    <div className="min-h-screen bg-[#F7F7F9] text-[#0B0B0D] font-sans flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <img src="/cd-logo.png" alt="CD Logo" className="w-[50px] h-[50px] object-contain" />
          <div>
            <div className="text-[17px] font-bold tracking-tight text-[#0B0B0D] leading-none mb-1">CD-Recruit</div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#8B8B93] leading-none">
              admin console
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[10px] border border-[#E6E6EA] bg-white p-6 shadow-sm"
        >
          {error && (
            <div className="mb-4 p-3 rounded-md bg-[#FFF5F5] border border-[#FECACA] flex items-start gap-2.5 text-[#DC2626] text-[12px]">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
            email / username
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="text"
            placeholder="admin@cdrecruit.local or email"
            disabled={loading}
            className="w-full bg-white border border-[#E6E6EA] rounded-md px-3 py-2 text-[13px] text-[#0B0B0D] focus:outline-none focus:border-[#2F5CFF] mb-4 disabled:opacity-50"
          />
          <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
            password
          </label>
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type="password"
            placeholder="••••••••"
            disabled={loading}
            className="w-full bg-white border border-[#E6E6EA] rounded-md px-3 py-2 text-[13px] text-[#0B0B0D] focus:outline-none focus:border-[#2F5CFF] mb-5 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2F5CFF] hover:bg-[#0037FF] text-white font-medium text-[13px] py-2.5 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div className="mt-4 pt-4 border-t border-[#E6E6EA] text-center text-[11px] text-[#8B8B93]">
            Default Dev Credentials: <span className="font-mono text-[#0B0B0D]">admin@cdrecruit.local</span> / <span className="font-mono text-[#0B0B0D]">password</span>
          </div>
        </form>
      </div>
    </div>
  );
}
