import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

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
          onSubmit={(e) => {
            e.preventDefault();
            if (email && pw) navigate({ to: "/dashboard" });
          }}
          className="rounded-[10px] border border-[#E6E6EA] bg-white p-6 shadow-sm"
        >
          <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
            email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@company.com"
            className="w-full bg-white border border-[#E6E6EA] rounded-md px-3 py-2 text-[13px] text-[#0B0B0D] focus:outline-none focus:border-[#2F5CFF] mb-4"
          />
          <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
            password
          </label>
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type="password"
            placeholder="••••••••"
            className="w-full bg-white border border-[#E6E6EA] rounded-md px-3 py-2 text-[13px] text-[#0B0B0D] focus:outline-none focus:border-[#2F5CFF] mb-5"
          />
          <button
            type="submit"
            className="w-full bg-[#2F5CFF] hover:bg-[#2448D9] text-white font-medium text-[13px] py-2.5 rounded-md transition-colors cursor-pointer"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
