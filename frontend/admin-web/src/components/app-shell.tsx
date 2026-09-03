import { Link, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { LogOut, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { getUserProfile, clearStoredToken } from "../lib/auth";
import { LightGradientBackground } from "./common/LightGradientBackground";

import dashboardDefault from "../assets/Selected=Default.svg";
import dashboardVariant2 from "../assets/Selected=Variant2.svg";
import drivesDefault from "../assets/Selected=Default-1.svg";
import drivesVariant2 from "../assets/Selected=Variant2-1.svg";
import invitesDefault from "../assets/Selected=Default-3.svg";
import invitesVariant2 from "../assets/Selected=Variant2-3.svg";
import resultsDefault from "../assets/Selected=Default-2.svg";
import resultsVariant2 from "../assets/Selected=Variant2-2.svg";
import reportsDefault from "../assets/Property 1=Default.svg";
import reportsVariant2 from "../assets/Property 1=Variant2.svg";
import templatesDefault from "../assets/Property 1=Default-1.svg";
import templatesVariant2 from "../assets/Property 1=Variant2-1.svg";
import questionsDefault from "../assets/Property 1=Default-2.svg";
import questionsVariant2 from "../assets/Property 1=Variant2-2.svg";
import settingsDefault from "../assets/Property 1=Default-3.svg";
import settingsVariant2 from "../assets/Property 1=Variant2-3.svg";

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function SupportHeadsetIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="16 576 18 18" fill="none" className={className}>
      <path d="M22.1465 582.074C22.3173 581.547 22.6302 581.079 23.0508 580.719C23.4714 580.36 23.9838 580.124 24.5303 580.037C25.0768 579.95 25.6362 580.016 26.1475 580.228C26.6587 580.44 27.1014 580.789 27.4268 581.236C27.7521 581.684 27.9469 582.213 27.9904 582.764C28.0339 583.316 27.9238 583.869 27.6727 584.362C27.4215 584.855 27.0394 585.268 26.5676 585.558C26.0958 585.847 25.5533 586 25 586V587M25 594C20.0294 594 16 589.971 16 585C16 580.029 20.0294 576 25 576C29.9706 576 34 580.029 34 585C34 589.971 29.9706 594 25 594ZM25.0498 590V590.1L24.9502 590.1V590H25.0498Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const ALL_NAV = [
  {
    to: "/dashboard",
    label: "Dashboard",
    defaultIcon: dashboardDefault,
    variant2Icon: dashboardVariant2,
  },
  {
    to: "/drives",
    label: "Drives",
    defaultIcon: drivesDefault,
    variant2Icon: drivesVariant2,
  },
  {
    to: "/invites",
    label: "Invites",
    defaultIcon: invitesDefault,
    variant2Icon: invitesVariant2,
  },
  {
    to: "/results",
    label: "Results",
    defaultIcon: resultsDefault,
    variant2Icon: resultsVariant2,
  },
  {
    to: "/reports",
    label: "Reports",
    defaultIcon: reportsDefault,
    variant2Icon: reportsVariant2,
  },
  {
    to: "/templates",
    label: "Role Templates",
    defaultIcon: templatesDefault,
    variant2Icon: templatesVariant2,
  },
  {
    to: "/questions",
    label: "Question Bank",
    defaultIcon: questionsDefault,
    variant2Icon: questionsVariant2,
  },
  {
    to: "/settings",
    label: "Settings",
    defaultIcon: settingsDefault,
    variant2Icon: settingsVariant2,
  },
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

  // Find active nav index dynamically
  const activeIdx = ALL_NAV.findIndex(
    (item) => pathname === item.to || pathname.startsWith(item.to + "/")
  );

  const topItems = activeIdx >= 0 ? ALL_NAV.slice(0, activeIdx) : ALL_NAV.slice(0, 7);
  const activeItem = activeIdx >= 0 ? ALL_NAV[activeIdx] : ALL_NAV[0];
  const bottomItems = activeIdx >= 0 ? ALL_NAV.slice(activeIdx + 1) : [];

  return (
    <div
      className="flex h-screen max-h-screen w-full max-w-full overflow-hidden text-ink font-sans relative bg-transparent"
    >
      {/* Figma Light Gradient 13 Global Mesh Background */}
      <LightGradientBackground />

      {/* Left Sidebar: Fixed end-to-end */}
      <aside className="w-[230px] shrink-0 bg-transparent text-ink flex flex-col h-screen z-20 overflow-y-auto no-scrollbar">
        {/* Top Floating White Card */}
        <div className="bg-white rounded-b-[24px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] px-3.5 pt-5 pb-3 space-y-2 shrink-0">
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
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="relative flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748b] hover:text-[#0d1424] hover:bg-[#f8fafc] transition-all"
                  >
                    <div className="relative inline-flex items-center justify-center shrink-0 w-[18px] h-[18px]">
                      <img
                        src={item.defaultIcon}
                        alt={item.label}
                        className="w-[18px] h-[18px] object-contain shrink-0"
                        draggable={false}
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
          <div className="relative px-2 py-1 shrink-0">
            <Link
              to={activeItem.to}
              className="relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#2f68ff] transition-all"
            >
              <span className="w-[4.5px] h-[18px] bg-[#2f68ff] rounded-full shrink-0" />
              <div className="relative inline-flex items-center justify-center shrink-0 w-[18px] h-[18px] text-[#2f68ff]">
                <img
                  src={activeItem.variant2Icon}
                  alt={activeItem.label}
                  className="w-[18px] h-[18px] object-contain shrink-0"
                  draggable={false}
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

        {/* Bottom Card: Remaining Nav Items + HELP & Promo + User Profile extending to bottom */}
        <div className="bg-white rounded-t-[24px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
          <div className="space-y-2.5">
            {/* Bottom Nav items before HELP */}
            {bottomItems.length > 0 && (
              <nav className="space-y-0.5 pb-1">
                {bottomItems.map((item) => {
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="relative flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748b] hover:text-[#0d1424] hover:bg-[#f8fafc] transition-all"
                    >
                      <div className="relative inline-flex items-center justify-center shrink-0 w-[18px] h-[18px]">
                        <img
                          src={item.defaultIcon}
                          alt={item.label}
                          className="w-[18px] h-[18px] object-contain shrink-0"
                          draggable={false}
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

          {/* User Profile Footer inside bottom card */}
          <div className="pt-2 border-t border-[#f1f5f9] flex items-center gap-2.5">
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
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 h-screen overflow-y-auto overflow-x-hidden flex flex-col min-w-0 max-w-full">
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
        <main className={`flex-1 min-w-0 max-w-full overflow-x-hidden ${hideHeader ? "px-10 py-8" : "px-8 py-6"}`}>{children}</main>
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
