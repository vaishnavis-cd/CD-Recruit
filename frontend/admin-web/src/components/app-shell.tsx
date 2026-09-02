import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { LogOut, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { getUserProfile, clearStoredToken } from "../lib/auth";
import { LightGradientBackground } from "./common/LightGradientBackground";

// Exact Lucide-compliant vector icons pixel-matched from the reference screenshot
function DashboardIcon({ className, size = 18 }: { className?: string; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    </svg>
  );
}

function DrivesIcon({ className, size = 18 }: { className?: string; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 4h10l4 7-4 7H7L3 11l4-7z" />
      <line x1="3" y1="11" x2="21" y2="11" />
      <path d="M17 17l4-4m0 0h-3.5m3.5 0v3.5" />
    </svg>
  );
}

function InvitesIcon({ className, size = 18 }: { className?: string; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9" />
      <path d="M10 12h11m0 0l-3.5-3.5M21 12l-3.5 3.5" />
    </svg>
  );
}

function ResultsIcon({ className, size = 18 }: { className?: string; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3.5" />
      <line x1="7.5" y1="17" x2="7.5" y2="13" />
      <line x1="12" y1="17" x2="12" y2="7.5" />
      <line x1="16.5" y1="17" x2="16.5" y2="10" />
    </svg>
  );
}

function ReportsIcon({ className, size = 18, active }: { className?: string; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#3B82F6" />
      <path d="M14 2v6h6" fill="#93C5FD" opacity="0.9" />
      <rect x="7" y="12" width="10" height="2" rx="1" fill="#FFFFFF" />
      <rect x="7" y="16" width="6.5" height="2" rx="1" fill="#FFFFFF" />
    </svg>
  );
}

function RoleTemplatesIcon({ className, size = 18 }: { className?: string; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="8" cy="10" r="2" />
      <path d="M5.5 15.5c0-1.2 1.1-1.9 2.5-1.9s2.5.7 2.5 1.9" />
      <line x1="13.5" y1="9.5" x2="18.5" y2="9.5" />
      <line x1="13.5" y1="13.5" x2="17" y2="13.5" />
    </svg>
  );
}

function QuestionBankIcon({ className, size = 18 }: { className?: string; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 20h9a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-5l-1.5-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
      <circle cx="17.5" cy="15.5" r="3.8" fill="#3B82F6" stroke="none" />
      <text x="17.5" y="18" textAnchor="middle" fill="#FFFFFF" fontSize="7" fontWeight="900" fontFamily="system-ui, sans-serif">i</text>
    </svg>
  );
}

function SettingsIcon({ className, size = 18 }: { className?: string; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SupportIcon({ className, size = 18 }: { className?: string; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <circle cx="12" cy="17" r="0.8" fill="currentColor" />
    </svg>
  );
}

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { to: "/drives", label: "Drives", icon: DrivesIcon },
  { to: "/invites", label: "Invites", icon: InvitesIcon },
  { to: "/results", label: "Results", icon: ResultsIcon },
  { to: "/reports", label: "Reports", icon: ReportsIcon },
  { to: "/templates", label: "Role Templates", icon: RoleTemplatesIcon },
  { to: "/questions", label: "Question Bank", icon: QuestionBankIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export interface AppShellProps {
  title?: string;
  count?: number | string;
  actions?: ReactNode;
  search?: ReactNode;
  children: ReactNode;
  hideHeader?: boolean;
}

export function AppShell({ title, count, actions, search, children, hideHeader }: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeIndex = NAV.findIndex((item) => pathname === item.to || pathname.startsWith(item.to + "/"));
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
      const role = (user.role ? user.role : "ADMIN").toUpperCase();
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

  return (
    <div
      className="flex h-screen w-screen max-h-screen max-w-full overflow-hidden text-slate-900 font-sans select-none relative bg-transparent"
    >
      {/* Figma Light Gradient 13 Global Mesh Background */}
      <LightGradientBackground />

      {/* Sidebar: Fits 100% Desktop Viewport */}
      <aside className="w-[204px] min-w-[204px] max-w-[204px] shrink-0 text-slate-800 flex flex-col justify-between h-screen max-h-screen overflow-hidden z-20 select-none">
        {/* Top Logo */}
        <div
          className={`w-full h-[46px] pt-[4px] pb-[2px] px-[14px] flex items-center shrink-0 bg-white/95 backdrop-blur-sm border-r border-slate-200/80 shadow-[1px_0_10px_rgba(0,0,0,0.02)] ${
            activeIndex === 0 ? "rounded-br-[18px] border-b border-slate-200/80" : ""
          }`}
        >
          <Link to="/dashboard" className="flex items-center gap-[8px] w-full group">
            <div>
              <div className="text-[17px] font-extrabold tracking-tight text-slate-900 leading-tight">Proctora</div>
              <div className="text-[8.5px] font-bold tracking-[0.18em] text-blue-600 uppercase leading-none mt-0.5">
                ADMIN
              </div>
            </div>
          </Link>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 overflow-hidden flex flex-col justify-center">
          <div className="flex flex-col">
            {NAV.map((item, index) => {
              const active = index === activeIndex;
              const isBeforeActive = index === activeIndex - 1;
              const isAfterActive = index === activeIndex + 1;
              const Icon = item.icon;

              let itemCorner = "";
              if (isBeforeActive) {
                itemCorner = "rounded-br-[18px] border-b border-slate-200/80";
              } else if (isAfterActive) {
                itemCorner = "rounded-tr-[18px] border-t border-slate-200/80";
              }

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`relative w-full h-[38px] pl-[16px] pr-[12px] flex items-center gap-[9px] text-[11.5px] transition-colors duration-150 ${
                    active
                      ? "text-blue-600 bg-transparent font-semibold z-10"
                      : `text-slate-500 hover:text-slate-900 hover:bg-slate-50/80 font-medium bg-white/95 backdrop-blur-sm border-r border-slate-200/80 shadow-[1px_0_10px_rgba(0,0,0,0.02)] ${itemCorner}`
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3.5px] h-[20px] bg-blue-600 rounded-r-full" />
                  )}
                  <div className="relative inline-flex items-center justify-center shrink-0">
                    <Icon
                      size={17}
                      active={active}
                      className={`${active ? "text-blue-600" : "text-[#4F8BFF] group-hover:text-blue-600"}`}
                    />
                    {item.to === "/results" && hasUnreadResults && (
                      <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
                    )}
                  </div>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* HELP Section */}
          <div
            className={`pt-[4px] pb-[2px] bg-white/95 backdrop-blur-sm border-r border-slate-200/80 shadow-[1px_0_10px_rgba(0,0,0,0.02)] ${
              activeIndex === NAV.length - 1 ? "rounded-tr-[18px] border-t border-slate-200/80" : ""
            }`}
          >
            <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400 px-[16px] mb-[1px]">
              HELP
            </div>
            <Link
              to="/settings"
              className="w-full h-[34px] pl-[16px] pr-[12px] flex items-center gap-[9px] text-[11px] font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50/80 transition-none"
            >
              <SupportIcon size={16} className="text-[#4F8BFF]" />
              <span>Support</span>
            </Link>
          </div>

          {/* "New Assessment Drive" Promo Card */}
          <div className="pt-[2px] pb-[4px] px-[8px] bg-white/95 backdrop-blur-sm border-r border-slate-200/80 shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
            <div className="w-full bg-gradient-to-br from-blue-600 to-blue-700 rounded-[10px] p-[8px] text-white shadow-md shadow-blue-600/20 relative overflow-hidden">
              <div className="text-[10.5px] font-bold text-white mb-0.5">New Assessment Drive</div>
              <p className="text-[9px] text-blue-100/90 leading-tight mb-1.5">
                Launch Q3 hiring drive and invite candidates instantly.
              </p>
              <Link
                to="/drives"
                className="w-full py-1 bg-white hover:bg-blue-50 text-blue-600 font-bold text-[9.5px] rounded-[6px] shadow-xs transition-none text-center block cursor-pointer"
              >
                Create Drive
              </Link>
            </div>
          </div>
        </nav>

        {/* User profile footer */}
        <div className="px-[8px] py-[6px] bg-white/95 backdrop-blur-sm border-r border-t border-slate-200/80 shrink-0 shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
          <div className="w-full flex items-center gap-[8px] p-[5px] rounded-[8px] hover:bg-slate-50 transition-none">
            <div className="w-6.5 h-6.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-xs shadow-blue-500/20">
              {userInfo.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold truncate text-slate-900 leading-tight">{userInfo.userName}</div>
              <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">
                {userInfo.userRole}
              </div>
            </div>
            <button
              onClick={() => setShowLogoutModal(true)}
              title="Log out"
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-[5px] transition-none cursor-pointer"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Container Layout */}
      <div className="flex-1 min-w-0 h-screen max-h-screen overflow-hidden relative z-10 flex flex-col pt-[14px] pr-[24px] pb-[14px] pl-[24px] gap-[14px]">
        {!hideHeader && title && (
          <header className="w-full flex items-center justify-between shrink-0">
            <div className="flex items-baseline gap-3">
              <h1 className="text-[23px] font-extrabold tracking-tight text-slate-900 leading-tight">{title}</h1>
              {count !== undefined && (
                <span className="text-[9.5px] font-mono uppercase font-bold text-blue-700 px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-full">
                  {count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {search}
              {actions}
            </div>
          </header>
        )}
        <main className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">{children}</main>
      </div>

      {/* Blurred Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 transition-all">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Logout</h3>
                <p className="text-xs text-slate-500">End active admin session</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to log out of the Proctora Admin Console?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-sm shadow-rose-600/20"
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
