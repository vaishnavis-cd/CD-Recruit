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

function DashboardIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="26 121 18 18" fill="none" className={className}>
      <path d="M32.6842 133.287C32.6842 132.942 32.3825 132.61 31.9441 132.61H28.1247C27.6863 132.61 27.3846 132.942 27.3846 133.287V136.938C27.3847 137.283 27.6864 137.615 28.1247 137.615H31.9441C32.3824 137.615 32.6841 137.283 32.6842 136.938V133.287ZM42.6154 133.287C42.6154 132.942 42.3137 132.61 41.8753 132.61H38.0559C37.6175 132.61 37.3158 132.942 37.3158 133.287V136.938C37.3159 137.283 37.6176 137.615 38.0559 137.615H41.8753C42.3136 137.615 42.6153 137.283 42.6154 136.938V133.287ZM32.6842 123.062C32.6841 122.717 32.3824 122.385 31.9441 122.385H28.1247C27.6864 122.385 27.3847 122.717 27.3846 123.062V126.713C27.3846 127.058 27.6863 127.39 28.1247 127.39H31.9441C32.3825 127.39 32.6842 127.058 32.6842 126.713V123.062ZM42.6154 123.062C42.6153 122.717 42.3136 122.385 41.8753 122.385H38.0559C37.6176 122.385 37.3159 122.717 37.3158 123.062V126.713C37.3158 127.058 37.6175 127.39 38.0559 127.39H41.8753C42.3137 127.39 42.6154 127.058 42.6154 126.713V123.062ZM34.0688 136.938C34.0688 138.106 33.0878 139 31.9441 139H28.1247C26.981 139 26.0001 138.106 26 136.938V133.287C26 132.119 26.9809 131.225 28.1247 131.225H31.9441C33.0879 131.225 34.0688 132.119 34.0688 133.287V136.938ZM44 136.938C43.9999 138.106 43.019 139 41.8753 139H38.0559C36.9122 139 35.9313 138.106 35.9312 136.938V133.287C35.9312 132.119 36.9121 131.225 38.0559 131.225H41.8753C43.0191 131.225 44 132.119 44 133.287V136.938ZM34.0688 126.713C34.0688 127.881 33.0879 128.775 31.9441 128.775H28.1247C26.9809 128.775 26 127.881 26 126.713V123.062C26.0001 121.894 26.981 121 28.1247 121H31.9441C33.0878 121 34.0687 121.894 34.0688 123.062V126.713ZM44 126.713C44 127.881 43.0191 128.775 41.8753 128.775H38.0559C36.9121 128.775 35.9312 127.881 35.9312 126.713V123.062C35.9313 121.894 36.9122 121 38.0559 121H41.8753C43.019 121 43.9999 121.894 44 123.062V126.713Z" fill="currentColor"/>
    </svg>
  );
}

function DrivesIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="26 173 18 18" fill="none" className={className}>
      <path d="M39.4146 191L38.4273 189.992L41.5709 186.758H38.8V185.309H44V190.619H42.5818V187.775L39.4146 191ZM29.9692 187.964H34.8709L31.4456 181.93H29.0564L27.7765 184.164C27.5438 184.559 27.4313 184.982 27.4392 185.433C27.4471 185.884 27.5595 186.304 27.7765 186.693C27.9933 187.088 28.299 187.398 28.6936 187.625C29.0882 187.851 29.5134 187.964 29.9692 187.964ZM34.7818 184.91L36.4891 181.93H33.0746L34.7818 184.91ZM29.8709 180.482H37.3036L38.4819 178.412L36.942 175.729C36.7092 175.341 36.4034 175.03 36.0246 174.797C35.6458 174.565 35.2316 174.448 34.7818 174.448C34.3261 174.448 33.9049 174.563 33.5182 174.793C33.1315 175.022 32.8218 175.334 32.5891 175.729L29.8709 180.482ZM35.8381 189.413H29.9692C29.2516 189.413 28.5877 189.235 27.9774 188.88C27.3671 188.524 26.8849 188.037 26.5309 187.417C26.177 186.797 26 186.131 26 185.421C26 184.71 26.177 184.045 26.5309 183.425L31.3673 175.005C31.7212 174.385 32.2034 173.896 32.8136 173.538C33.4239 173.179 34.08 173 34.7818 173C35.4837 173 36.1382 173.179 36.7455 173.538C37.3527 173.896 37.8333 174.385 38.1874 175.005L42.2526 182.079C41.9715 182.013 41.6848 181.969 41.3927 181.946C41.1005 181.923 40.8139 181.935 40.5328 181.981L39.2964 179.836L36.9327 183.991C36.5011 184.5 36.1732 185.08 35.949 185.732C35.7248 186.383 35.6127 187.079 35.6127 187.818C35.6127 188.09 35.6327 188.362 35.6727 188.635C35.7127 188.907 35.7679 189.166 35.8381 189.413Z" fill="currentColor"/>
    </svg>
  );
}

function InvitesIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="23 226 23 16" fill="none" className={className}>
      <path d="M26.3551 240C25.6985 240 25.1419 239.752 24.6852 239.255C24.2284 238.758 24 238.152 24 237.438V230.562C24 229.848 24.2284 229.242 24.6852 228.745C25.1419 228.248 25.6985 228 26.3551 228H40.9996L39.5534 229.592H26.3551C26.1062 229.592 25.8953 229.686 25.7225 229.874C25.5497 230.062 25.4633 230.291 25.4633 230.562V237.438C25.4633 237.709 25.5497 237.938 25.7225 238.126C25.8953 238.314 26.1062 238.408 26.3551 238.408H34.3084V240H26.3551ZM36.551 238.102V235.173C36.551 234.562 36.7123 234.081 37.0348 233.73C37.3574 233.379 37.7994 233.204 38.3608 233.204H43.1988L41.3027 231.153L42.3481 230.027L46 234L42.3481 237.973L41.3134 236.847L43.1988 234.796H38.358C38.257 234.796 38.174 234.831 38.1089 234.902C38.044 234.972 38.0115 235.063 38.0115 235.173V238.102H36.551Z" fill="currentColor"/>
    </svg>
  );
}

function ResultsIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="26 277 18 18" fill="none" className={className}>
      <path d="M29.948 291.184H31.4288V286H29.948V291.184ZM38.5712 291.184H40.052V280.532H38.5712V291.184ZM34.2595 291.184H35.7405V287.367H34.2595V291.184ZM34.2595 286H35.7405V283.949H34.2595V286ZM27.8316 295C27.3188 295 26.8853 294.823 26.5312 294.469C26.1771 294.115 26 293.681 26 293.168V278.832C26 278.319 26.1771 277.885 26.5312 277.531C26.8853 277.177 27.3188 277 27.8316 277H42.1684C42.6812 277 43.1147 277.177 43.4688 277.531C43.8229 277.885 44 278.319 44 278.832V293.168C44 293.681 43.8229 294.115 43.4688 294.469C43.1147 294.823 42.6812 295 42.1684 295H27.8316ZM27.8316 293.519H42.1684C42.2561 293.519 42.3364 293.482 42.4093 293.409C42.4824 293.336 42.519 293.256 42.519 293.168V278.832C42.519 278.744 42.4824 278.664 42.4093 278.591C42.3364 278.518 42.2561 278.481 42.1684 278.481H27.8316C27.7439 278.481 27.6636 278.518 27.5907 278.591C27.5176 278.664 27.481 278.744 27.481 278.832V293.168C27.481 293.256 27.5176 293.336 27.5907 293.409C27.6636 293.482 27.7439 293.519 27.8316 293.519Z" fill="currentColor"/>
    </svg>
  );
}

function ReportsIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="27.5 328 15 20" fill="none" className={className}>
      <path d="M31.25 344.319H38.75V342.89H31.25V344.319ZM31.25 340.363H38.75V338.934H31.25V340.363ZM29.2919 348C28.7876 348 28.3629 347.829 28.0177 347.488C27.6726 347.146 27.5 346.728 27.5 346.233V329.767C27.5 329.272 27.674 328.854 28.0219 328.512C28.3699 328.171 28.7958 328 29.2997 328H37.9664L42.5 332.451V346.233C42.5 346.728 42.3259 347.146 41.9778 347.488C41.6297 347.829 41.2035 348 40.6992 348H29.2919ZM36.903 333.495V329.429H29.2997C29.2135 329.429 29.1346 329.464 29.063 329.534C28.9911 329.605 28.9552 329.682 28.9552 329.767V346.233C28.9552 346.318 28.9911 346.395 29.063 346.466C29.1346 346.536 29.2135 346.571 29.2997 346.571H40.7003C40.7865 346.571 40.8654 346.536 40.937 346.466C41.0089 346.395 41.0448 346.318 41.0448 346.233V333.495H36.903Z" fill="currentColor"/>
    </svg>
  );
}

function RoleTemplatesIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="24.5 382 21 16" fill="none" className={className}>
      <path d="M36.4735 391.111H42.1714V389.559H36.4735V391.111ZM36.4735 387.667H42.1714V386.115H36.4735V387.667ZM27.1363 393.885H34.6449V392.772C34.6449 392.294 34.2643 391.863 33.5032 391.478C32.7422 391.093 31.8665 390.9 30.8762 390.9C29.8858 390.9 29.0148 391.088 28.2633 391.463C27.5119 391.838 27.1363 392.274 27.1363 392.772V393.885ZM32.1618 389.275C32.5066 388.914 32.679 388.476 32.679 387.959C32.679 387.443 32.5046 387.006 32.1558 386.65C31.8071 386.293 31.3834 386.115 30.8845 386.115C30.3857 386.115 29.9638 386.295 29.619 386.656C29.2744 387.017 29.1021 387.456 29.1021 387.972C29.1021 388.488 29.2764 388.925 29.6251 389.281C29.9739 389.638 30.3978 389.816 30.8966 389.816C31.3955 389.816 31.8172 389.636 32.1618 389.275ZM26.3551 398C25.8357 398 25.3966 397.814 25.038 397.443C24.6793 397.072 24.5 396.617 24.5 396.079V383.911C24.5 383.373 24.6793 382.92 25.038 382.552C25.3966 382.184 25.8357 382 26.3551 382H43.6449C44.1643 382 44.6034 382.186 44.962 382.557C45.3207 382.928 45.5 383.383 45.5 383.921V396.089C45.5 396.627 45.3207 397.08 44.962 397.448C44.6034 397.816 44.1643 398 43.6449 398H26.3551ZM26.3551 396.448H43.6449C43.7337 396.448 43.8151 396.409 43.8889 396.333C43.963 396.256 44 396.172 44 396.08V383.92C44 383.828 43.963 383.744 43.8889 383.667C43.8151 383.591 43.7337 383.552 43.6449 383.552H26.3551C26.2662 383.552 26.1849 383.591 26.1111 383.667C26.037 383.744 26 383.828 26 383.92V396.08C26 396.172 26.037 396.256 26.1111 396.333C26.1849 396.409 26.2662 396.448 26.3551 396.448Z" fill="currentColor"/>
    </svg>
  );
}

function QuestionBankIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="25 433 20 18" fill="none" className={className}>
      <path d="M26.4286 446.785V434.481V439.792V438.955V446.785ZM33.6264 448.266H26.7668C26.2849 448.266 25.87 448.085 25.522 447.725C25.174 447.364 25 446.934 25 446.434V434.832C25 434.319 25.174 433.885 25.522 433.531C25.87 433.177 26.2849 433 26.7668 433H32.1407L34.778 435.734H43.2332C43.7279 435.734 44.1461 435.911 44.4876 436.265C44.8292 436.619 45 437.053 45 437.566V440.863C44.7773 440.635 44.5487 440.439 44.3143 440.275C44.0797 440.11 43.8321 439.949 43.5714 439.792V437.566C43.5714 437.463 43.5397 437.379 43.4764 437.314C43.413 437.248 43.332 437.215 43.2332 437.215H34.1863L31.5489 434.481H26.7668C26.668 434.481 26.587 434.514 26.5236 434.58C26.4603 434.645 26.4286 434.729 26.4286 434.832V446.434C26.4286 446.537 26.4603 446.621 26.5236 446.686C26.587 446.752 26.668 446.785 26.7668 446.785H33.3876C33.4045 447.049 33.4288 447.303 33.4604 447.547C33.4921 447.791 33.5474 448.031 33.6264 448.266ZM43.6253 442.634C44.5418 443.589 45 444.746 45 446.108C45 447.469 44.5397 448.625 43.619 449.575C42.6984 450.525 41.5816 451 40.2684 451C38.9554 451 37.8407 450.523 36.9242 449.568C36.0077 448.614 35.5495 447.456 35.5495 446.095C35.5495 444.734 36.0098 443.578 36.9305 442.628C37.851 441.678 38.9679 441.203 40.281 441.203C41.594 441.203 42.7088 441.68 43.6253 442.634ZM39.6788 448.573H40.8706V446.364H39.6788V448.573ZM40.7418 444.798C40.87 444.665 40.9341 444.503 40.9341 444.314C40.9341 444.124 40.87 443.962 40.7418 443.829C40.6136 443.696 40.4579 443.63 40.2747 443.63C40.0916 443.63 39.9359 443.696 39.8077 443.829C39.6795 443.962 39.6154 444.124 39.6154 444.314C39.6154 444.503 39.6795 444.665 39.8077 444.798C39.9359 444.931 40.0916 444.997 40.2747 444.997C40.4579 444.997 40.6136 444.931 40.7418 444.798Z" fill="currentColor"/>
    </svg>
  );
}

function SettingsGearIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="31.5 484 19 20" fill="none" className={className}>
      <path d="M39.3661 504L38.7812 501.037C38.3024 500.865 37.8161 500.645 37.3222 500.376C36.8285 500.107 36.386 499.797 35.9946 499.448L33.1337 500.401L31.5 497.571L33.7483 495.6C33.7046 495.345 33.6682 495.085 33.6392 494.819C33.6102 494.553 33.5957 494.284 33.5957 494.01C33.5957 493.744 33.6102 493.48 33.6392 493.218C33.6682 492.956 33.7046 492.683 33.7483 492.4L31.5 490.429L33.1337 487.62L35.9839 488.563C36.3966 488.206 36.8409 487.895 37.317 487.63C37.793 487.364 38.2776 487.142 38.7707 486.963L39.3661 484H42.6339L43.2188 486.973C43.733 487.166 44.2158 487.389 44.667 487.64C45.1185 487.892 45.554 488.199 45.9737 488.563L48.8663 487.62L50.5 490.429L48.2093 492.432C48.2672 492.701 48.3071 492.963 48.3291 493.218C48.351 493.473 48.3619 493.734 48.3619 494C48.3619 494.259 48.3492 494.516 48.3236 494.771C48.2983 495.026 48.2638 495.299 48.22 495.589L50.4895 497.571L48.8556 500.401L45.9737 499.437C45.554 499.801 45.115 500.112 44.6566 500.37C44.1982 500.629 43.7189 500.848 43.2188 501.027L42.6339 504H39.3661ZM40.9576 497.407C41.9111 497.407 42.7189 497.077 43.3808 496.416C44.0427 495.756 44.3737 494.951 44.3737 494C44.3737 493.049 44.0427 492.244 43.3808 491.584C42.7189 490.923 41.9111 490.593 40.9576 490.593C40.011 490.593 39.205 490.923 38.5396 491.584C37.8742 492.244 37.5415 493.049 37.5415 494C37.5415 494.951 37.8742 495.756 38.5396 496.416C39.205 497.077 40.011 497.407 40.9576 497.407Z" fill="currentColor"/>
    </svg>
  );
}

function SupportHeadsetIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="16 576 18 18" fill="none" className={className}>
      <path d="M22.1465 582.074C22.3173 581.547 22.6302 581.079 23.0508 580.719C23.4714 580.36 23.9838 580.124 24.5303 580.037C25.0768 579.95 25.6362 580.016 26.1475 580.228C26.6587 580.44 27.1014 580.789 27.4268 581.236C27.7521 581.684 27.9469 582.213 27.9904 582.764C28.0339 583.316 27.9238 583.869 27.6727 584.362C27.4215 584.855 27.0394 585.268 26.5676 585.558C26.0958 585.847 25.5533 586 25 586V587M25 594C20.0294 594 16 589.971 16 585C16 580.029 20.0294 576 25 576C29.9706 576 34 580.029 34 585C34 589.971 29.9706 594 25 594ZM25.0498 590V590.1L24.9502 590.1V590H25.0498Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
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
  const activeItem = activeIdx >= 0 ? ALL_NAV[activeIdx] : ALL_NAV[7];
  const bottomItems = activeIdx >= 0 ? ALL_NAV.slice(activeIdx + 1) : [];

  return (
    <div
      className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-cover bg-center bg-no-repeat bg-fixed text-ink font-sans"
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

          {/* Bottom Card: Remaining Nav Items + HELP & Promo */}
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
      <div className="flex-1 min-w-0 max-w-full overflow-x-hidden flex flex-col">
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
