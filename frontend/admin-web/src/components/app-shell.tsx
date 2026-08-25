import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  Send,
  FileBarChart,
  LogOut,
  ClipboardCheck,
  Settings as SettingsIcon,
  Award,
  AlertTriangle,
  Layers,
} from "lucide-react";
import type { ReactNode } from "react";
import { getUserProfile, clearStoredToken } from "../lib/auth";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/drives", label: "Drives", icon: BriefcaseBusiness },
  { to: "/invites", label: "Invites", icon: Send },
  { to: "/results", label: "Results", icon: Award },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/templates", label: "Role Templates", icon: Layers },
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
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [userInfo, setUserInfo] = useState<{ userName: string; userRole: string; initials: string }>({
    userName: "Rachel Brooks",
    userRole: "recruiter",
    initials: "RB",
  });

  const [hasUnreadResults, setHasUnreadResults] = useState(false);

  useEffect(() => {
    try {
      if (pathname.startsWith("/results")) {
        localStorage.setItem("proctora_read_results_notification", "true");
        setHasUnreadResults(false);
      } else {
        const isRead = localStorage.getItem("proctora_read_results_notification") === "true";
        setHasUnreadResults(!isRead);
      }
    } catch {}
  }, [pathname]);

  useEffect(() => {
    const user = getUserProfile();
    if (user) {
      const name = user.name || "Rachel Brooks";
      const role = user.role ? user.role.toLowerCase() : "recruiter";
      const inits = name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
      setUserInfo({
        userName: name,
        userRole: role,
        initials: inits,
      });
    }
  }, []);

  const handleLogout = () => {
    clearStoredToken();
    setShowLogoutModal(false);
    // Replace current location in history to prevent navigating back to protected route via browser Back button
    window.location.replace("/login");
  };

  return (
    <div className="flex min-h-screen bg-bg-soft text-ink font-sans">
      <aside className="w-[244px] shrink-0 bg-white border-r border-line text-ink flex flex-col sticky top-0 h-screen">
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <img src="/Logo.png" alt="Proctora Logo" className="w-7 h-7 object-contain" />
            <div>
              <div className="text-[17px] font-bold tracking-tight text-ink">Proctora</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-stext-2 leading-none">
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
                    ? "text-brand bg-gradient-to-r from-transparent to-[rgba(47,92,255,0.12)] font-medium"
                    : "text-ink-2 hover:text-ink hover:bg-bg-inset"
                }`}
              >
                {active && (
                  <span className="absolute right-0 top-0 bottom-0 w-[3px] bg-brand" />
                )}
                <div className="relative inline-flex items-center justify-center shrink-0">
                  <Icon size={16} strokeWidth={active ? 2.25 : 1.75} />
                  {item.to === "/results" && hasUnreadResults && (
                    <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-white" title="New candidate results pending review" />
                  )}
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-line flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-[11px] font-mono font-semibold">
            {userInfo.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] truncate text-ink font-medium">{userInfo.userName}</div>
            <div className="text-[10px] font-mono text-stext-2 uppercase tracking-[0.14em]">
              {userInfo.userRole}
            </div>
          </div>
          <button
            onClick={() => setShowLogoutModal(true)}
            title="Log out"
            className="p-1.5 text-stext-2 hover:text-danger hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-white border-b border-line px-8 h-[64px] flex items-center gap-4">
          <div className="flex items-baseline gap-3 flex-1 min-w-0">
            <h1 className="text-[18px] font-semibold tracking-tight">{title}</h1>
            {count !== undefined && (
              <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-2 px-1.5 py-0.5 bg-bg-inset rounded">
                {count}
              </span>
            )}
          </div>
          {search}
          {actions}
        </header>
        <main className="px-8 py-6">{children}</main>
      </div>

      {/* Blurred Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 transition-all">
          <div className="bg-white rounded-xl border border-line shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-danger flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-ink">Confirm Logout</h3>
                <p className="text-[12px] text-ink-2">End active admin session</p>
              </div>
            </div>

            <p className="text-[13px] text-ink-2 leading-relaxed">
              Are you sure you want to log out of the Proctora Admin Console?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 text-[13px] font-medium text-ink-2 hover:bg-bg-inset rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-[13px] font-medium text-white bg-danger hover:bg-danger/90 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
              >
                <LogOut size={14} />
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
