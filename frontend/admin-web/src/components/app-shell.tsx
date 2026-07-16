import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  Send,
  FileBarChart,
  LogOut,
  ClipboardCheck,
  Settings as SettingsIcon,
} from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/drives", label: "Drives", icon: BriefcaseBusiness },
  { to: "/invites", label: "Invites", icon: Send },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/questions", label: "Question Bank", icon: ClipboardCheck },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

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
      <aside className="w-[244px] shrink-0 bg-white border-r border-[#E6E6EA] text-[#0B0B0D] flex flex-col sticky top-0 h-screen">
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#2F5CFF] flex items-center justify-center font-mono text-[13px] font-semibold text-white">
              CD
            </div>
            <div>
              <div className="text-[13px] font-semibold tracking-tight text-[#0B0B0D]">CD-Recruit</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#8B8B93]">
                admin
              </div>
            </div>
          </div>
        </div>
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
                    ? "text-[#2F5CFF] bg-gradient-to-r from-transparent to-[rgba(47,92,255,0.12)] font-medium"
                    : "text-[#5B5B64] hover:text-[#0B0B0D] hover:bg-[#EFF0F3]"
                }`}
              >
                {active && (
                  <span className="absolute right-0 top-0 bottom-0 w-[3px] bg-[#2F5CFF]" />
                )}
                <Icon size={16} strokeWidth={active ? 2.25 : 1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-[#E6E6EA] flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#2F5CFF] text-white flex items-center justify-center text-[11px] font-mono font-semibold">
            RB
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] truncate text-[#0B0B0D]">Rachel Brooks</div>
            <div className="text-[10px] font-mono text-[#8B8B93] uppercase tracking-[0.14em]">
              recruiter
            </div>
          </div>
          <Link to="/login" className="text-[#8B8B93] hover:text-[#0B0B0D]">
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
