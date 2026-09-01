import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { LogOut, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { getUserProfile, clearStoredToken } from "../lib/auth";

/* --- Exact Figma-matched SVG Icons --- */

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function DashboardIcon({ size = 15, strokeWidth = 2, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function DrivesIcon({ size = 15, strokeWidth = 2, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="4" r="2" />
      <circle cx="5" cy="16" r="2" />
      <circle cx="17" cy="15" r="2" />
      <path d="M12 6L6.5 14.5" />
      <path d="M12 6L16 13" />
      <path d="M7 16h8" />
      <path d="M17 17l4 4m0 0h-3m3 0v-3" />
    </svg>
  );
}

function InvitesIcon({ size = 15, strokeWidth = 2, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 4h7a2 2 0 0 1 2 2v2" />
      <path d="M13 16v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" />
      <path d="M9 12h12m0 0l-3-3m3 3l-3 3" />
    </svg>
  );
}

function ResultsIcon({ size = 15, strokeWidth = 2, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 16v-3M12 16V8M17 16v-5" />
    </svg>
  );
}

function ReportsIcon({ size = 15, strokeWidth = 2, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function RoleTemplatesIcon({ size = 15, strokeWidth = 2, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M13 10h5" />
      <path d="M13 14h3" />
    </svg>
  );
}

function QuestionBankIcon({ size = 15, strokeWidth = 2, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h4" />
      <circle cx="9" cy="17" r="3" fill="#2f68ff" stroke="#2f68ff" />
      <path d="M9 16v2" stroke="#ffffff" strokeWidth="1.5" />
      <path d="M9 14.5v.01" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SettingsGearIcon({ size = 15, strokeWidth = 2, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SupportHeadsetIcon({ size = 15, strokeWidth = 2, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}


const ALL_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { to: "/drives", label: "Drives", icon: DrivesIcon },
  { to: "/invites", label: "Invites", icon: InvitesIcon },
  { to: "/results", label: "Results", icon: ResultsIcon },
  { to: "/reports", label: "Reports", icon: ReportsIcon },
  { to: "/templates", label: "Role Templates", icon: RoleTemplatesIcon },
  { to: "/questions", label: "Question Bank", icon: QuestionBankIcon },
  { to: "/settings", label: "Settings", icon: SettingsGearIcon },
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

  // Find active nav index dynamically
  const activeIdx = ALL_NAV.findIndex(
    (item) => pathname === item.to || pathname.startsWith(item.to + "/")
  );

  const topItems = activeIdx >= 0 ? ALL_NAV.slice(0, activeIdx) : ALL_NAV.slice(0, 7);
  const activeItem = activeIdx >= 0 ? ALL_NAV[activeIdx] : ALL_NAV[7];
  const bottomItems = activeIdx >= 0 ? ALL_NAV.slice(activeIdx + 1) : [];

  return (
    <div
      className="flex min-h-screen bg-cover bg-center bg-no-repeat bg-fixed text-ink font-sans"
      style={{ backgroundImage: "url('/light-gradient-14.svg')" }}
    >
      {/* Left Sidebar */}
      <aside className="w-[230px] shrink-0 bg-transparent text-ink flex flex-col justify-between sticky top-0 h-screen z-20 overflow-y-auto no-scrollbar py-2">
        <div className="flex flex-col gap-1.5">
          {/* Top Floating White Card */}
          <div className="bg-white rounded-b-[24px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] px-3.5 pt-5 pb-3 space-y-2">
            {/* Brand Header */}
            <div className="px-2">
              <div className="text-base font-bold tracking-tight text-[#0d1424]">Proctora</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#2f68ff] leading-none mt-0.5">
                ADMIN
              </div>
            </div>

            {/* Primary Nav Links before active */}
            {topItems.length > 0 && (
              <nav className="space-y-0.5 pt-1">
                {topItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="relative flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748b] hover:text-[#0d1424] hover:bg-[#f8fafc] transition-all"
                    >
                      <div className="relative inline-flex items-center justify-center shrink-0">
                        <Icon
                          size={15}
                          strokeWidth={1.75}
                          className="text-[#708099]"
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
            )}
          </div>

          {/* Active Item Cutout Slot (showing gradient backdrop) */}
          {activeItem && (
            <div className="relative px-2 py-0.5">
              <Link
                to={activeItem.to}
                className="relative flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-[#2f68ff] transition-all"
              >
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-5 bg-[#2f68ff] rounded-r" />
                <div className="relative inline-flex items-center justify-center shrink-0 text-[#2f68ff]">
                  <activeItem.icon
                    size={15}
                    strokeWidth={2.2}
                    className="text-[#2f68ff]"
                  />
                  {activeItem.to === "/results" && hasUnreadResults && (
                    <span
                      className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-white"
                      title="New candidate results pending review"
                    />
                  )}
                </div>
                <span>{activeItem.label}</span>
              </Link>
            </div>
          )}

          {/* Bottom Card: Remaining Nav Items + HELP & Promo (Unified single card as in Image 2) */}
          <div className="bg-white rounded-[24px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-3.5 space-y-2.5">
            {/* Bottom Nav items before HELP */}
            {bottomItems.length > 0 && (
              <nav className="space-y-0.5 pb-1">
                {bottomItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="relative flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748b] hover:text-[#0d1424] hover:bg-[#f8fafc] transition-all"
                    >
                      <div className="relative inline-flex items-center justify-center shrink-0">
                        <Icon
                          size={15}
                          strokeWidth={1.75}
                          className="text-[#708099]"
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
            )}

            {/* HELP header */}
            <div className="px-2 text-[9.5px] font-bold text-[#94a3b8] tracking-wider uppercase pt-0.5">
              HELP
            </div>

            {/* Support with Headset icon */}
            <button
              onClick={() => window.open("mailto:support@proctora.com", "_blank")}
              className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg text-xs font-medium text-[#64748b] hover:text-[#0d1424] transition-all cursor-pointer text-left"
            >
              <SupportHeadsetIcon size={15} className="text-[#2f68ff]" />
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

