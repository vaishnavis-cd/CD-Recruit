import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  LayoutGrid,
  Share2,
  Send,
  BarChart2,
  FileText,
  Contact,
  FolderArchive,
  LogOut,
  Settings as SettingsIcon,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { getUserProfile, clearStoredToken } from "../lib/auth";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/drives", label: "Drives", icon: Share2 },
  { to: "/invites", label: "Invites", icon: Send },
  { to: "/results", label: "Results", icon: BarChart2 },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/templates", label: "Role Templates", icon: Contact },
  { to: "/questions", label: "Question Bank", icon: FolderArchive },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;


export interface AppShellProps {
  title?: string;
  count?: number | string;
  actions?: ReactNode;
  search?: ReactNode;
  hideHeader?: boolean;
  children: ReactNode;
}

export function AppShell({ title, count, actions, search, hideHeader = false, children }: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [userInfo, setUserInfo] = useState<{ userName: string; userRole: string; initials: string }>({
    userName: "Demo Admin",
    userRole: "ADMIN",
    initials: "DA",
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
      const name = user.name || "Demo Admin";
      const role = user.role ? user.role.toUpperCase() : "ADMIN";
      const inits = name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
      setUserInfo({
        userName: name,
        userRole: role,
        initials: inits || "DA",
      });
    }
  }, []);

  const handleLogout = () => {
    clearStoredToken();
    setShowLogoutModal(false);
    window.location.replace("/login");
  };

  const TOP_NAV = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
    { to: "/drives", label: "Drives", icon: Share2 },
    { to: "/invites", label: "Invites", icon: Send },
    { to: "/results", label: "Results", icon: BarChart2 },
    { to: "/reports", label: "Reports", icon: FileText },
    { to: "/templates", label: "Role Templates", icon: Contact },
    { to: "/questions", label: "Question Bank", icon: FolderArchive },
  ] as const;

  const isSettingsActive = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <div
      className="flex min-h-screen bg-cover bg-center bg-no-repeat text-ink font-sans"
      style={{ backgroundImage: "url('/light-gradient-14.svg')" }}
    >
      {/* Left Sidebar */}
      <aside className="w-[230px] shrink-0 bg-transparent text-ink flex flex-col justify-between sticky top-0 h-screen z-20 overflow-y-auto no-scrollbar py-2">
        <div className="flex flex-col gap-1.5">
          {/* Top Floating White Card: Brand & Primary Navigation */}
          <div className="bg-white rounded-b-[24px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] px-3.5 pt-5 pb-3 space-y-2">
            {/* Brand Header */}
            <div className="px-2">
              <div className="text-base font-bold tracking-tight text-[#0d1424]">Proctora</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#2f68ff] leading-none mt-0.5">
                ADMIN
              </div>
            </div>

            {/* Primary Nav Links */}
            <nav className="space-y-0.5 pt-1">
              {TOP_NAV.map((item) => {
                const active = pathname === item.to || pathname.startsWith(item.to + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`relative flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? "text-[#2f68ff] font-semibold bg-blue-50/70"
                        : "text-[#64748b] hover:text-[#0d1424] hover:bg-[#f8fafc]"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-[#2f68ff] rounded-r" />
                    )}
                    <div className="relative inline-flex items-center justify-center shrink-0">
                      <Icon
                        size={15}
                        strokeWidth={active ? 2.2 : 1.75}
                        className={active ? "text-[#2f68ff]" : "text-[#708099]"}
                      />
                      {item.to === "/results" && hasUnreadResults && (
                        <span
                          className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-white"
                          title="New candidate results pending review"
                        />
                      )}
                    </div>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Floating Settings Item (in ambient gap) */}
          <div className="relative px-2 py-0.5">
            <Link
              to="/settings"
              className={`relative flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                isSettingsActive
                  ? "text-[#2f68ff] font-semibold"
                  : "text-[#64748b] hover:text-[#0d1424]"
              }`}
            >
              {isSettingsActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-5 bg-[#2f68ff] rounded-r" />
              )}
              <SettingsIcon
                size={15}
                strokeWidth={isSettingsActive ? 2.2 : 1.75}
                className={isSettingsActive ? "text-[#2f68ff]" : "text-[#708099]"}
              />
              <span>Settings</span>
            </Link>
          </div>

          {/* Middle Floating White Card: HELP & Promo */}
          <div className="bg-white rounded-[24px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-3 space-y-2">
            <div className="px-2 text-[9.5px] font-bold text-[#94a3b8] tracking-wider uppercase">
              HELP
            </div>
            <button
              onClick={() => window.open("mailto:support@proctora.com", "_blank")}
              className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg text-xs font-medium text-[#64748b] hover:text-[#0d1424] transition-all cursor-pointer text-left"
            >
              <HelpCircle size={15} className="text-[#2f68ff]" />
              <span>Support</span>
            </button>

            {/* New Assessment Drive Promo Card */}
            <div className="p-3 bg-gradient-to-br from-[#2f68ff] to-[#1e54ea] rounded-xl text-white shadow-md shadow-blue-500/10 space-y-1.5">
              <div className="text-xs font-bold leading-tight">New Assessment Drive</div>
              <p className="text-[9.5px] text-blue-100/90 leading-snug">
                Launch Q3 hiring drive and invite candidates instantly.
              </p>
              <Link
                to="/drives"
                className="block w-full text-center py-1.5 px-2.5 bg-white text-[#2f68ff] hover:bg-blue-50 font-bold text-[10.5px] rounded-full transition-all shadow-xs"
              >
                Create Drive
              </Link>
            </div>
          </div>
        </div>

        {/* User Profile Footer */}
        <div className="p-3 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[#2f68ff] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
            {userInfo.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs truncate text-[#0d1424] font-bold leading-tight">
              {userInfo.userName}
            </div>
            <div className="text-[9px] font-semibold text-[#8c9ba5] uppercase tracking-wider mt-0.5">
              {userInfo.userRole}
            </div>
          </div>
          <button
            onClick={() => setShowLogoutModal(true)}
            title="Log out"
            className="p-1 text-[#8c9ba5] hover:text-danger-hover hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut size={14} />
          </button>
        </div>
      </aside>



      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!hideHeader && title && (
          <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-[#e8ecf4] px-8 h-[64px] flex items-center gap-4">
            <div className="flex items-baseline gap-3 flex-1 min-w-0">
              <h1 className="text-lg font-bold text-[#0d1424] tracking-tight">{title}</h1>
              {count !== undefined && (
                <span className="text-xs-plus font-mono uppercase tracking-[0.14em] text-ink-secondary px-1.5 py-0.5 bg-surface-inset rounded">
                  {count}
                </span>
              )}
            </div>
            {search}
            {actions}
          </header>
        )}
        <main className={`flex-1 ${hideHeader ? "px-10 py-8" : "px-8 py-6"}`}>{children}</main>
      </div>

      {/* Blurred Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 transition-all">
          <div className="bg-white rounded-2xl border border-line shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-danger-hover flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Confirm Logout</h3>
                <p className="text-xs text-ink-secondary">End active admin session</p>
              </div>
            </div>

            <p className="text-xs text-ink-secondary leading-relaxed">
              Are you sure you want to log out of the Proctora Admin Console?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 text-xs font-medium text-ink-secondary hover:bg-surface-inset rounded-full transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-xs font-medium text-white bg-danger-hover hover:bg-red-700 rounded-full transition-colors cursor-pointer flex items-center gap-2"
              >
                <LogOut size={13} />
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

