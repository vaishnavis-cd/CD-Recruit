import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Send, FileBarChart, LogOut } from "lucide-react";
import { SIDEBAR_SPARK } from "../lib/mock-data";
import type { ReactNode } from "react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sessions", label: "Sessions", icon: ListChecks },
  { to: "/invites", label: "Invites", icon: Send },
  { to: "/reports", label: "Reports", icon: FileBarChart },
] as const;

function SidebarSpark() {
  const w = 180;
  const h = 40;
  const n = SIDEBAR_SPARK.length;
  const max = Math.max(...SIDEBAR_SPARK);
  const min = Math.min(...SIDEBAR_SPARK);
  const range = max - min || 1;
  const pts = SIDEBAR_SPARK.map((v, i) => {
    const x = (i / (n - 1)) * (w - 6) + 3;
    const y = 4 + (1 - (v - min) / range) * (h - 12);
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="px-4 py-3 border-b border-[#232327]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#8B8B93]">
          say-do · 7d
        </span>
        <span className="text-[10px] font-mono text-[#EDEDEF]">
          {SIDEBAR_SPARK[SIDEBAR_SPARK.length - 1]}
        </span>
      </div>
      <svg width={w} height={h} className="block">
        <polyline points={pts} fill="none" stroke="#2F5CFF" strokeWidth={1.5} />
        <polyline points={pts} fill="none" stroke="#2F5CFF" strokeWidth={4} opacity={0.18} />
      </svg>
    </div>
  );
}

export interface AppShellProps {
  title: string;
  count?: number | string;
  actions?: ReactNode;
  search?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, count, actions, search, children }: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-[#F7F7F9] text-[#0B0B0D] font-sans">
      <aside className="w-[244px] shrink-0 bg-[#0B0B0D] text-[#EDEDEF] flex flex-col sticky top-0 h-screen">
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#2F5CFF] flex items-center justify-center font-mono text-[13px] font-semibold">
              CD
            </div>
            <div>
              <div className="text-[13px] font-semibold tracking-tight">CD-Recruit</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#8B8B93]">
                admin
              </div>
            </div>
          </div>
        </div>
        <SidebarSpark />
        <nav className="flex-1 py-3">
          {NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex items-center gap-3 px-4 py-2 text-[13px] transition-colors ${
                  active
                    ? "text-white bg-[#18181C]"
                    : "text-[#8B8B93] hover:text-[#EDEDEF] hover:bg-[#18181C]"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-[#2F5CFF] rounded-r" />
                )}
                <Icon size={16} strokeWidth={active ? 2.25 : 1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-[#232327] flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#2F5CFF] flex items-center justify-center text-[11px] font-mono font-semibold">
            RB
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] truncate">Rachel Brooks</div>
            <div className="text-[10px] font-mono text-[#8B8B93] uppercase tracking-[0.14em]">
              recruiter
            </div>
          </div>
          <Link to="/login" className="text-[#8B8B93] hover:text-white">
            <LogOut size={14} />
          </Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-white border-b border-[#E6E6EA] px-8 h-[64px] flex items-center gap-4">
          <div className="flex items-baseline gap-3 flex-1 min-w-0">
            <h1 className="text-[18px] font-semibold tracking-tight">{title}</h1>
            {count !== undefined && (
              <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] px-1.5 py-0.5 bg-[#EFF0F3] rounded">
                {count}
              </span>
            )}
          </div>
          {search}
          {actions}
        </header>
        <main className="px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
