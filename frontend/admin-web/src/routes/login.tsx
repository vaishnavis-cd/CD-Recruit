import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { ScopePanel } from "../components/scope-panel";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  const ambientData = useMemo(() => {
    const pts: { t: number; said: number; did: number }[] = [];
    for (let i = 0; i <= 60; i++) {
      pts.push({
        t: i,
        said: 70 + Math.sin(i / 6) * 12,
        did: 70 + Math.sin(i / 6 + 0.9) * 12,
      });
    }
    return pts;
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#EDEDEF] font-sans flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[520px]">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="w-7 h-7 rounded-md bg-[#2F5CFF] flex items-center justify-center font-mono text-[13px] font-semibold">
            CD
          </div>
          <div>
            <div className="text-[14px] font-semibold tracking-tight">CD-Recruit</div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#8B8B93]">
              admin console
            </div>
          </div>
        </div>

        <ScopePanel
          data={ambientData}
          height={200}
          ambient
          markDivergences={false}
          showLabels={false}
        />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email && pw) navigate({ to: "/dashboard" });
          }}
          className="mt-6 rounded-[10px] border border-[#232327] bg-[#18181C] p-6"
        >
          <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#8B8B93] mb-1.5">
            email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@company.com"
            className="w-full bg-[#0B0B0D] border border-[#232327] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-[#2F5CFF] mb-4"
          />
          <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#8B8B93] mb-1.5">
            password
          </label>
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type="password"
            placeholder="••••••••"
            className="w-full bg-[#0B0B0D] border border-[#232327] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-[#2F5CFF] mb-5"
          />
          <button
            type="submit"
            className="w-full bg-[#2F5CFF] hover:bg-[#2448D9] text-white font-medium text-[13px] py-2.5 rounded-md transition-colors"
          >
            Sign in
          </button>
          <div className="mt-4 text-[11px] font-mono text-[#8B8B93]">
            &gt; auth: dev mode · HS256 · session ephemeral
          </div>
        </form>
      </div>
    </div>
  );
}
