import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef, Fragment } from "react";
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  ArrowRight,
  FileDown,
  CheckCircle,
  ShieldAlert,
  Sparkles,
  Calendar,
  Activity,
  Search,
  ChevronDown
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { ScopePanel } from "../components/scope-panel";
import { ExportDropdown } from "../components/export-dropdown";
import { StatusBadge } from "../components/ui/status-badge";
import { useStore } from "../lib/store";
import { getUserProfile } from "../lib/auth";
import { type RoleTemplate } from "../lib/types";
import { formatDriveName } from "../lib/utils";

function buildDashboardStats(sessions: any[] = [], drives: any[] = [], backendStats?: any) {
  const safeDrives = Array.isArray(drives) ? drives : [];
  const safeSessions = Array.isArray(sessions) ? sessions : [];

  let funnel: Array<{ stage: string; count: number }>;
  if (backendStats?.funnel?.stages && Array.isArray(backendStats.funnel.stages) && backendStats.funnel.stages.length > 0) {
    funnel = backendStats.funnel.stages;
  } else {
    const invitedFromDrives = safeDrives.reduce((sum, d) => sum + (d?.invitedCount || d?.candidateCount || 0), 0);
    const startedFromDrives = safeDrives.reduce((sum, d) => sum + (d?.startedCount || 0), 0);
    const completedFromDrives = safeDrives.reduce((sum, d) => sum + (d?.completedCount || 0), 0);

    const invitedCount = Math.max(invitedFromDrives, safeSessions.length);
    const startedCount = Math.max(
      startedFromDrives,
      safeSessions.filter((s) => s?.status !== "NOT_STARTED").length,
    );
    const completedCount = Math.max(
      completedFromDrives,
      safeSessions.filter(
        (s) =>
          s?.status === "submitted" ||
          s?.status === "reviewed" ||
          s?.status === "decision" ||
          s?.status === "ai_scored",
      ).length,
    );
    const reviewedCount = safeSessions.filter(
      (s) => s?.status === "reviewed" || s?.status === "decision" || Boolean(s?.decision) || s?.reviewer,
    ).length;
    const decidedCount = safeSessions.filter(
      (s) => s?.status === "decision" || Boolean(s?.decision),
    ).length;

    funnel = [
      { stage: "Invited", count: invitedCount },
      { stage: "Started", count: Math.min(startedCount, invitedCount) },
      { stage: "Completed", count: Math.min(completedCount, startedCount) },
      { stage: "Reviewed", count: Math.min(reviewedCount, completedCount) },
      { stage: "Decided", count: Math.min(decidedCount, reviewedCount) },
    ];
  }

  const buckets = ["0-40", "40-55", "55-70", "70-85", "85-100"];
  const scoreDistribution = buckets.map((b) => {
    const [lo, hi] = b.split("-").map(Number);
    return {
      bucket: b,
      count: safeSessions.filter((s) => (s?.compositeScore || 0) >= lo && (s?.compositeScore || 0) < hi + 0.0001)
        .length,
    };
  });

  const traceMap: Record<string, { sumSaid: number; sumDid: number; count: number }> = {};
  safeSessions.forEach((s) => {
    if (s?.submittedAt) {
      try {
        const d = new Date(s.submittedAt);
        if (!isNaN(d.getTime())) {
          const dateStr = d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
          if (!traceMap[dateStr]) {
            traceMap[dateStr] = { sumSaid: 0, sumDid: 0, count: 0 };
          }
          traceMap[dateStr].sumSaid += s.sayDoScore || 0;
          traceMap[dateStr].sumDid += s.compositeScore || 0;
          traceMap[dateStr].count += 1;
        }
      } catch (err) { }
    }
  });

  const sayDoTrace = Object.entries(traceMap)
    .map(([date, val]) => ({
      date,
      said: Math.round(val.sumSaid / val.count),
      did: Math.round(val.sumDid / val.count),
    }))
    .slice(-30);

  const MODULES = ["MCQ", "SQL", "Coding / DSA", "AI Prompting", "Contextual Simulation"];
  const timeByModule = MODULES.map((m, i) => ({
    module: m,
    avgSeconds: 900 + i * 180,
    cohortAvgSeconds: 1000 + i * 200,
  }));

  const categories = [
    "Paste-heavy input",
    "Tab switching",
    "External lookup",
    "Multiple identities",
    "Timing anomaly",
  ];
  const severities = ["low", "medium", "critical"];
  const integrityHeatmap: { category: string; severity: string; count: number }[] = [];

  categories.forEach((c) => {
    severities.forEach((sev) => {
      const count = safeSessions.filter((s) =>
        (s?.integrityFlags || []).some(
          (f: any) =>
            (f?.category || "").toLowerCase().includes(c.split(" ")[0].toLowerCase()) &&
            (f?.severity || "").toLowerCase() === sev.toLowerCase()
        )
      ).length;
      integrityHeatmap.push({ category: c, severity: sev, count });
    });
  });

  const humanReviewedCount = safeSessions.filter((s) => s?.reviewer || s?.decision).length;
  const agreementCount = safeSessions.filter((s) => {
    if (!s?.decision) return false;
    const scorePassed = (s.compositeScore || 0) >= 70;
    const decPassed = s.decision.outcome === "advance" || s.decision.outcome === "PASS";
    return scorePassed === decPassed;
  }).length;

  const agreementRate = humanReviewedCount > 0 ? agreementCount / humanReviewedCount : 0.85;

  const reviewerAgreement = {
    agreementRate,
    overrides: [
      { direction: "lenient" as const, count: safeSessions.filter((s) => s?.decision && (s?.compositeScore || 0) < 70 && (s.decision.outcome === "advance" || s.decision.outcome === "PASS")).length },
      { direction: "harsh" as const, count: safeSessions.filter((s) => s?.decision && (s?.compositeScore || 0) >= 70 && (s.decision.outcome === "reject" || s.decision.outcome === "FAIL")).length },
    ],
  };

  return {
    funnel,
    scoreDistribution,
    sayDoTrace,
    timeByModule,
    integrityHeatmap,
    reviewerAgreement,
  };
}

function DateRangeDropdown({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options = [
    { label: "Last 7 Days", value: "7" },
    { label: "Last 30 Days", value: "30" },
    { label: "All Time", value: "all" },
  ];

  const currentLabel = options.find((o) => o.value === value)?.label || "All Time";

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 pl-3.5 pr-3 py-2 text-xs font-semibold text-[#0d1424] bg-white border border-[#e8ecf4] rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-[#cbd5e1] hover:bg-[#f8fafc] focus:outline-none cursor-pointer transition-all"
      >
        <span>{currentLabel}</span>
        <ChevronDown size={14} className={`text-[#64748b] stroke-[2] transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-36 rounded-xl bg-white border border-[#e8ecf4] shadow-xl z-50 p-1 animate-in fade-in zoom-in-95 duration-150">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex items-center justify-between w-full px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer text-left ${value === opt.value
                  ? "text-[#2f68ff] bg-blue-50/70 font-semibold"
                  : "text-[#0d1424] hover:bg-[#f8fafc]"
                }`}
            >
              <span>{opt.label}</span>
              {value === opt.value && <span className="text-[#2f68ff] text-xs font-bold">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard — Proctora" },
      {
        name: "description",
        content: "Track and manage your candidate assessment platform.",
      },
    ],
  }),
});

function DashboardPage() {
  const sessions = useStore((s) => s.sessions) || [];
  const drives = useStore((s) => s.drives) || [];
  const actionQueue = useStore((s) => s.actionQueue) || [];
  const roleTemplates = useStore((s) => s.roleTemplates) || [];
  const dashboardStats = useStore((s) => s.dashboardStats);
  const fetchRoleTemplates = useStore((s) => s.fetchRoleTemplates);
  const fetchActionQueue = useStore((s) => s.fetchActionQueue);
  const fetchSessions = useStore((s) => s.fetchSessions);
  const fetchDrives = useStore((s) => s.fetchDrives);
  const fetchDashboardStats = useStore((s) => s.fetchDashboardStats);
  const exportResultsCsv = useStore((s) => s.exportResultsCsv);

  const [selectedDrive, setSelectedDrive] = useState<string>("all");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");

  // Roster search & filter state
  const [rosterQuery, setRosterQuery] = useState("");
  const [rosterStatus, setRosterStatus] = useState<string>("all");

  // Dynamic user name from auth profile / localStorage settings
  const [currentUserName, setCurrentUserName] = useState<string>("Admin");

  useEffect(() => {
    const updateName = () => {
      let customName = "";
      try {
        const saved = localStorage.getItem("proctora_admin_profile");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.name) customName = parsed.name;
        }
      } catch { }

      const user = getUserProfile();
      const name = customName || user?.name || user?.username || (user?.email ? user.email.split("@")[0] : "Admin");
      setCurrentUserName(name);
    };

    updateName();
    window.addEventListener("storage", updateName);
    window.addEventListener("admin_profile_updated", updateName);
    return () => {
      window.removeEventListener("storage", updateName);
      window.removeEventListener("admin_profile_updated", updateName);
    };
  }, []);

  useEffect(() => {
    fetchActionQueue();
    fetchDrives();
    fetchSessions();
    fetchRoleTemplates();
  }, []);

  useEffect(() => {
    fetchDashboardStats({
      driveId: selectedDrive !== "all" ? selectedDrive : undefined,
      roleTemplateId: selectedRole !== "all" ? selectedRole : undefined,
    });
  }, [selectedDrive, selectedRole, dateRange]);

  const filteredSessions = useMemo(() => {
    return (sessions || []).filter((s) => {
      if (!s) return false;
      if (
        selectedRole !== "all" &&
        s.roleTemplate?.id !== selectedRole &&
        s.roleTemplate?.roleName?.toLowerCase() !== selectedRole.toLowerCase()
      )
        return false;
      if (selectedDrive !== "all" && s.driveId !== selectedDrive) return false;
      if (dateRange !== "all") {
        const days = parseInt(dateRange, 10);
        if (!isNaN(days)) {
          const dateToTest = s.submittedAt || s.startedAt;
          if (dateToTest) {
            try {
              const subDate = new Date(dateToTest);
              const now = new Date();
              const diffDays = (now.getTime() - subDate.getTime()) / (1000 * 3600 * 24);
              if (diffDays > days) return false;
            } catch (err) { }
          }
        }
      }
      return true;
    });
  }, [sessions, selectedRole, selectedDrive, dateRange]);

  // Roster specific filter
  const rosterSessions = useMemo(() => {
    return (filteredSessions || []).filter((s: any) => {
      if (!s) return false;
      const cName = s.candidate?.name || s.candidateName || "";
      const cEmail = s.candidate?.email || s.candidateEmail || "";
      const name = cName.toLowerCase();
      const email = cEmail.toLowerCase();
      const q = rosterQuery.toLowerCase().trim();

      if (q && !name.includes(q) && !email.includes(q)) return false;

      if (rosterStatus === "pending") {
        return (
          s.status === "ai_scored" ||
          s.status === "submitted" ||
          s.status === "review" ||
          (s.integrityFlags || []).some((f: any) => f.severity === "critical") ||
          (s.integrityFlagsCount || 0) > 0
        );
      }
      if (rosterStatus === "ai_scored") return s.status === "ai_scored";
      if (rosterStatus === "reviewed") return s.status === "reviewed" || s.status === "decision" || Boolean(s.decision);
      if (rosterStatus === "decided") return s.status === "decision" || Boolean(s.decision);

      return true;
    });
  }, [filteredSessions, rosterQuery, rosterStatus]);

  const stats = useMemo(
    () => buildDashboardStats(filteredSessions, drives, dashboardStats),
    [filteredSessions, drives, dashboardStats],
  );

  const totalCandidates = filteredSessions.length;
  const activePipeline = filteredSessions.filter(
    (s) =>
      s?.status === "submitted" ||
      s?.status === "ai_scored" ||
      s?.status === "review",
  ).length;

  const passRate =
    filteredSessions.length > 0
      ? Math.round(
        (filteredSessions.filter((s) => s?.status === "reviewed" || s?.status === "decision" || (s?.compositeScore || 0) >= 70).length /
          filteredSessions.length) *
        100,
      )
      : 0;

  const flagRate =
    filteredSessions.length > 0
      ? Math.round(
        (filteredSessions.filter((s) => (s?.integrityFlags || []).some((f: any) => f?.severity === "critical") || (s?.integrityFlagsCount || 0) > 0)
          .length /
          filteredSessions.length) *
        100,
      )
      : 0;

  // Funnel data dynamically calculated from stats / backend
  const funnelData = useMemo(() => {
    const raw = stats.funnel || [];
    const maxInvited = Math.max(raw[0]?.count || 0, 1);

    return raw.map((item, idx) => {
      // Percentage for progress bar width fill
      const pct =
        maxInvited > 0 && item.count > 0
          ? Math.min(100, Math.max(0, Math.round((item.count / maxInvited) * 100)))
          : 0;

      if (idx === 0) {
        return {
          ...item,
          pct: item.count > 0 ? 100 : 0,
          change: "—",
          tone: "neutral" as const,
        };
      }

      const prevCount = raw[idx - 1]?.count || 0;
      // Conversion rate from previous stage (dynamic, never static/hardcoded)
      const conversionRate = prevCount > 0 ? Math.round((item.count / prevCount) * 100) : 0;
      const tone =
        conversionRate >= 70
          ? ("success" as const)
          : conversionRate >= 40
            ? ("warning" as const)
            : ("danger" as const);

      return {
        ...item,
        pct,
        change: `${conversionRate}%`,
        tone,
      };
    });
  }, [stats.funnel]);

  // Live session stream data matching real sessions
  const liveStreamData = useMemo(() => {
    const sourceList = (filteredSessions || []).slice(0, 3);
    const bgPalette = ["bg-[#06b6d4]", "bg-[#0284c7]", "bg-[#0891b2]"];

    return sourceList.map((s: any, idx: number) => {
      const name = s.candidate?.name || s.candidateName || "Candidate";
      const initials =
        s.candidate?.initials ||
        name
          .split(" ")
          .map((n: string) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() ||
        "CN";

      const rawScore = s.compositeScore ?? s.score?.compositeScore ?? 0;
      const normalizedScore =
        rawScore <= 1.0 && rawScore > 0 ? Math.round(rawScore * 100) : Math.round(rawScore);
      const formattedScore = `${Math.min(100, Math.max(0, normalizedScore))}%`;

      return {
        id: s.id || `stream-${idx}`,
        initials,
        name,
        role: s.roleTemplate?.roleName || s.roleName || "Software Developer",
        score: formattedScore,
        time: s.submittedAt
          ? new Date(s.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "Recently",
        bg: bgPalette[idx % bgPalette.length],
      };
    });
  }, [filteredSessions]);

  const queue = actionQueue as any;
  const pendingReviews = queue?.pendingReviews || [];
  const expiringInvites = queue?.expiringInvites || [];
  const closingDrives = queue?.closingDrives || [];

  return (
    <AppShell hideHeader={true}>
      <div className="max-w-[1360px] mx-auto pb-12 space-y-6">

        {/* TOP HEADER MATCHING FIGMA */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#0d1424] tracking-tight">
              Welcome back, <span className="text-[#2f68ff]">{currentUserName}!</span>
            </h1>
            <p className="text-xs md:text-sm text-[#8c9ba5] font-normal mt-1">
              Track and manage your candidate assessment platform
            </p>
          </div>

          {/* Top-right Actions */}
          <div className="flex items-center gap-3">

            {/* Date Range Dropdown */}
            <DateRangeDropdown value={dateRange} onChange={setDateRange} />

            {/* Export Dropdown */}
            <ExportDropdown
              data={filteredSessions}
              filenamePrefix="proctora-candidate-roster"
              title="Proctora Candidate Evaluation Roster"
            />
          </div>
        </div>

        {/* SECTION 1: 2x2 STAT CARDS (LEFT) + UNIFIED ACTION QUEUE CARD (RIGHT) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: 2x2 Grid of 4 Stat Cards */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Card 1: TOTAL CANDIDATES */}
            <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col justify-between h-[130px] relative">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[12px] font-bold tracking-wider text-[#94a3b8]">
                    Total Candidates
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-extrabold text-[#0d1424]">{totalCandidates}</span>
                    <span className="text-xs text-[#94a3b8] font-normal">sessions</span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-[#eff6ff] text-[#2f68ff] flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
              </div>
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#ecfdf3] text-[#12b76a] border border-[#a6f4c5]">
                  <span>▲</span> +12.05%
                </span>
              </div>
            </div>

            {/* Card 2: ACTIVE PIPELINE */}
            <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col justify-between h-[130px] relative">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[12px] font-bold tracking-wider text-[#94a3b8]">
                    Active Pipeline
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-extrabold text-[#0d1424]">{activePipeline}</span>
                    <span className="text-xs text-[#94a3b8] font-normal">in progress</span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-[#e0f2fe] text-[#0284c7] flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
              </div>
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#fef3f2] text-[#f04438] border border-[#fecdca]">
                  <span>▼</span> -8.25%
                </span>
              </div>
            </div>

            {/* Card 3: PASS RATE */}
            <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col justify-between h-[130px] relative">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[12px] font-bold tracking-wider text-[#94a3b8]">
                    Pass Rate
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-extrabold text-[#0d1424]">{passRate}</span>
                    <span className="text-xs text-[#94a3b8] font-normal">% benchmark</span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-[#dcfce7] text-[#16a34a] flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#ecfdf3] text-[#12b76a] border border-[#a6f4c5]">
                  <span>▲</span> +25.21%
                </span>
              </div>
            </div>

            {/* Card 4: CRITICAL RISK */}
            <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col justify-between h-[130px] relative">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[12px] font-bold tracking-wider text-[#94a3b8]">
                    Critical Risk
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-extrabold text-[#0d1424]">{flagRate}</span>
                    <span className="text-xs text-[#94a3b8] font-normal">% flagged</span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-[#fef3c7] text-[#d97706] flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
              </div>
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#ecfdf3] text-[#12b76a] border border-[#a6f4c5]">
                  <span>▲</span> 0.00%
                </span>
              </div>
            </div>

          </div>

          {/* Right: Action Queue / Alerts Card (Matching Image 2) */}
          <div className="lg:col-span-6 bg-white rounded-2xl p-6 md:p-7 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col justify-between">
            <div className="divide-y divide-[#f1f5f9] flex flex-col justify-between h-full">

              {/* Row 1: Audit Required */}
              <div className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#eff6ff] text-[#2f68ff] flex items-center justify-center shrink-0">
                      <AlertCircle size={17} strokeWidth={2} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#0d1424]">Audit Required</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#eff6ff] text-[#2f68ff]">
                        {pendingReviews.length}
                      </span>
                    </div>
                  </div>
                  <div>
                    {pendingReviews.length === 0 ? (
                      <span className="inline-block px-5 py-2 rounded-full bg-[#f1f3f9] text-xs font-normal text-[#94a3b8] italic">
                        No pending manual audits.
                      </span>
                    ) : (
                      <Link
                        to="/results"
                        className="inline-block px-4 py-1.5 rounded-full bg-[#eff6ff] text-[#2f68ff] text-xs font-semibold hover:bg-blue-100 transition-colors"
                      >
                        View {pendingReviews.length} Audits →
                      </Link>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[#8c9ba5] font-normal mt-2.5">
                  Low AI confidence requiring recruiter review
                </p>
              </div>

              {/* Row 2: Expiring Soon */}
              <div className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#eff6ff] text-[#2f68ff] flex items-center justify-center shrink-0">
                      <Clock size={17} strokeWidth={2} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#0d1424]">Expiring Soon</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#eff6ff] text-[#2f68ff]">
                        {expiringInvites.length}
                      </span>
                    </div>
                  </div>
                  <div>
                    {expiringInvites.length === 0 ? (
                      <span className="inline-block px-5 py-2 rounded-full bg-[#f1f3f9] text-xs font-normal text-[#94a3b8] italic">
                        No invites expiring soon.
                      </span>
                    ) : (
                      <Link
                        to="/invites"
                        className="inline-block px-4 py-1.5 rounded-full bg-[#eff6ff] text-[#2f68ff] text-xs font-semibold hover:bg-blue-100 transition-colors"
                      >
                        View {expiringInvites.length} Invites →
                      </Link>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[#8c9ba5] font-normal mt-2.5">
                  Assessment invitations expiring in 24h
                </p>
              </div>

              {/* Row 3: Closing Drives */}
              <div className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#eff6ff] text-[#2f68ff] flex items-center justify-center shrink-0">
                      <Calendar size={17} strokeWidth={2} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#0d1424]">Closing Drives</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#eff6ff] text-[#2f68ff]">
                        {closingDrives.length}
                      </span>
                    </div>
                  </div>
                  <div>
                    {closingDrives.length === 0 ? (
                      <span className="inline-block px-5 py-2 rounded-full bg-[#f1f3f9] text-xs font-normal text-[#94a3b8] italic">
                        No drives closing soon.
                      </span>
                    ) : (
                      <Link
                        to="/drives"
                        className="inline-block px-4 py-1.5 rounded-full bg-[#eff6ff] text-[#2f68ff] text-xs font-semibold hover:bg-blue-100 transition-colors"
                      >
                        View {closingDrives.length} Drives →
                      </Link>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[#8c9ba5] font-normal mt-2.5">
                  Active drives ending in the next 24 hours
                </p>
              </div>

            </div>
          </div>
        </div>

        {/* SECTION 2: PIPELINE FUNNEL (LEFT) + LIVE SESSION STREAM (RIGHT) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Pipeline Funnel */}
          <div className="lg:col-span-8 bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
            <div className="text-[12px] font-bold tracking-wider text-[#94a3b8] mb-4 font-mono">
              Pipeline Funnel
            </div>

            <div className="space-y-3.5">
              {funnelData.map((item) => (
                <div key={item.stage} className="flex items-center gap-4">
                  {/* Stage Label */}
                  <div className="w-20 text-xs font-medium text-[#64748b]">{item.stage}</div>

                  {/* Funnel Progress Track */}
                  <div className="flex-1 h-9 bg-[#f8fafc] rounded-full relative overflow-hidden flex items-center px-4 border border-[#f1f5f9]">
                    {item.pct > 0 && (
                      <div
                        className="absolute inset-y-0 left-0 transition-all duration-500 rounded-full flex items-center justify-end"
                        style={{
                          width: `${Math.max(item.pct, 4)}%`,
                          background: "linear-gradient(90deg, rgba(46, 93, 224, 0.2) 0%, rgba(169, 218, 255, 0.2) 100%)",
                        }}
                      >
                        {/* Vertical blue marker indicator */}
                        <div className="w-[2.5px] h-5 bg-[#2f68ff] rounded-full mr-1.5" />
                      </div>
                    )}
                    <span className="relative z-10 text-xs font-bold text-[#0d1424]">
                      {item.count}
                    </span>
                  </div>

                  {/* Change / Conversion Badge */}
                  <div className="w-16 flex items-center justify-center shrink-0">
                    {item.change === "—" || item.change === "-" ? (
                      <span className="inline-flex items-center justify-center min-w-[48px] h-6 text-xs font-semibold text-[#94a3b8]">
                        —
                      </span>
                    ) : item.tone === "success" ? (
                      <span className="inline-flex items-center justify-center min-w-[48px] px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#ecfdf3] text-[#12b76a] border border-[#a6f4c5]">
                        {item.change}
                      </span>
                    ) : item.tone === "warning" ? (
                      <span className="inline-flex items-center justify-center min-w-[48px] px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                        {item.change}
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center min-w-[48px] px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#fef3f2] text-[#f04438] border border-[#fecdca]">
                        {item.change}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Live Session Stream */}
          <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">

                  <h3 className="text-[12px] font-bold tracking-wider text-[#94a3b8] font-mono">Live Session Stream</h3>
                </div>

              </div>
              <p className="text-[11px] text-[#94a3b8] mb-4">Real-time candidate activities</p>

              {/* Stream Items */}
              <div className="space-y-3.5">
                {liveStreamData.map((stream) => (
                  <div key={stream.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${stream.bg} text-white flex items-center justify-center text-[11px] font-bold shrink-0 shadow-xs`}>
                        {stream.initials}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#0d1424] leading-tight">{stream.name}</div>
                        <div className="text-[10.5px] text-[#94a3b8] leading-tight mt-0.5">{stream.role}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-[#0284c7]">{stream.score}</div>
                      <div className="text-[10px] text-[#94a3b8]">{stream.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: CANDIDATE EVALUATION ROSTER (TABLE MATCHING FIGMA) */}
        <div className="bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base md:text-lg font-bold text-[#0d1424]">Candidate Evaluation Roster</h3>
              <p className="text-xs text-[#8c9ba5] mt-0.5">Actionable list of all assessment sessions requiring evaluation</p>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Box */}
              <div className="relative">
                <input
                  type="text"
                  value={rosterQuery}
                  onChange={(e) => setRosterQuery(e.target.value)}
                  placeholder="Search candidate..."
                  className="pl-8 pr-3.5 py-1.5 text-xs bg-[#f8fafc] border border-[#e8ecf4] rounded-full text-[#0d1424] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2f68ff] focus:bg-white w-52 transition-all"
                />
                <svg
                  className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#94a3b8]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1.5">
                {[
                  { id: "all", label: "All" },
                  { id: "pending", label: "Pending" },
                  { id: "reviewed", label: "Reviewed" },
                  { id: "decided", label: "Decided" },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setRosterStatus(t.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${rosterStatus === t.id
                        ? "bg-[#2f68ff] text-white shadow-xs"
                        : "text-[#64748b] hover:text-[#0d1424] hover:bg-[#f8fafc]"
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Roster Table */}
          <div className="overflow-x-auto border border-[#f1f5f9] rounded-2xl bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fafc] text-[#94a3b8] font-bold text-[12px] tracking-wider border-b border-[#f1f5f9]">
                <tr>
                  <th className="py-3 px-5">Candidate</th>
                  <th className="py-3 px-4">Role / Drive</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Composite Score</th>
                  <th className="py-3 px-4">Say-Do</th>
                  <th className="py-3 px-4">Flags</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc]">
                {rosterSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#94a3b8] text-xs">
                      No candidate sessions found matching current filters.
                    </td>
                  </tr>
                ) : (
                  rosterSessions.map((s: any) => {
                    const flags = s.integrityFlags || [];
                    const isCritical = flags.some((f: any) => f.severity === "critical");
                    const isMedium = flags.some((f: any) => f.severity === "medium");

                    const rawComposite = s.compositeScore ?? s.score?.compositeScore;
                    const compositeScore = rawComposite !== null && rawComposite !== undefined
                      ? (rawComposite <= 1.0 && rawComposite > 0 ? Math.round(rawComposite * 100) : Math.round(rawComposite))
                      : null;

                    const rawSayDo = s.sayDoScore ?? s.score?.sayDoConsistencyScore;
                    const sayDoScore = rawSayDo !== null && rawSayDo !== undefined
                      ? (rawSayDo <= 1.0 && rawSayDo > 0 ? Math.round(rawSayDo * 100) : Math.round(rawSayDo))
                      : null;

                    const isNeedsAudit = s.status === "review" || s.status === "ai_scored" || s.status === "submitted" || isCritical;
                    const isDecided = s.status === "decision";

                    const rawFlagCount =
                      s.integrityFlagsCount ??
                      (Array.isArray(s.integrityFlags) ? s.integrityFlags.length : 0);
                    const flagCount = typeof rawFlagCount === "number" ? rawFlagCount : 0;

                    return (
                      <tr key={s.id} className="hover:bg-[#f8fafc]/80 transition-colors">
                        <td className="py-3.5 px-5 font-semibold text-[#0d1424]">
                          <div>{s.candidate?.name || s.candidateName || "Candidate"}</div>
                          <div className="text-[11px] text-[#94a3b8] font-normal">{s.candidate?.email || s.candidateEmail || "No email"}</div>
                        </td>
                        <td className="py-3.5 px-4 text-[#64748b]">
                          <div className="font-semibold text-[#0d1424]">{s.roleTemplate?.roleName || s.roleName || "Software Engineer"}</div>
                          <div className="text-[11px] text-[#94a3b8]">{formatDriveName(s.driveName) || "Drive Session"}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          {isDecided ? (
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] inline-block">
                              Decided
                            </span>
                          ) : isNeedsAudit ? (
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#fef9c3] text-[#ca8a04] border border-[#fef08a] inline-block">
                              Pending
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe] inline-block">
                              Reviewed
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-[#0d1424]">
                          <div className="flex items-center gap-2.5">
                            <span className="min-w-[32px]">{compositeScore !== null ? `${compositeScore}%` : "—"}</span>
                            {compositeScore !== null && (
                              <div className="w-16 h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden shrink-0">
                                <div
                                  className="h-full bg-[#2563eb] rounded-full transition-all"
                                  style={{ width: `${Math.min(100, Math.max(0, compositeScore))}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#475569] font-medium">
                          {sayDoScore !== null ? `${sayDoScore}%` : "—"}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-[#dc2626]">
                          {flagCount}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <Link
                            to="/results/$id"
                            params={{ id: s.id }}
                            className="inline-flex items-center justify-center gap-1 px-4 py-1 rounded-full border border-[#2563eb] text-[#2563eb] hover:bg-[#eff6ff] text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <span>Evaluate</span>
                            <ArrowRight size={12} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AppShell>
  );
}

/* =========================================
   UI Components & Data Views
========================================= */

function MetricCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-line rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children, noMargin, action }: { children: React.ReactNode; noMargin?: boolean; action?: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between ${noMargin ? "" : "mb-5"}`}>
      <h3 className="text-xs-plus font-bold uppercase tracking-[0.15em] text-ink-secondary">
        {children}
      </h3>
      {action && <div>{action}</div>}
    </div>
  );
}

function ReadoutTile({ label, value, suffix, tone }: { label: string; value: number; suffix?: string; tone: "ink" | "brand" | "amber" }) {
  const color = tone === "brand" ? "#2F5CFF" : tone === "amber" ? "#E5484D" : "#0B0B0D";
  return (
    <div className="border border-line bg-white rounded-xl p-5 flex flex-col justify-center shadow-sm">
      <div className="text-xs-plus font-bold uppercase tracking-wider text-ink-secondary mb-2">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-4xl leading-none font-semibold tracking-tight" style={{ color }}>
          {value}
        </span>
        {suffix && <span className="text-xs font-medium text-ink-tertiary">{suffix}</span>}
      </div>
    </div>
  );
}

/* --- Queue UI --- */

function ActionCard({ icon, title, tone, description, children }: { icon: React.ReactNode, title: string, tone: 'danger' | 'warning' | 'info', description: string, children: React.ReactNode }) {
  const tones = {
    danger: "text-danger bg-rose-50",
    warning: "text-amber-700 bg-amber-50",
    info: "text-brand bg-brand-subtle"
  };

  return (
    <div className="bg-white border border-line rounded-xl p-5 flex flex-col shadow-sm">
      <div className={`inline-flex items-center gap-2 text-xs-plus font-bold uppercase tracking-wider mb-2 w-fit px-2 py-1 rounded-md ${tones[tone]}`}>
        {icon} {title}
      </div>
      <p className="text-xs text-ink-secondary mb-4">{description}</p>
      <div className="space-y-1 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
        {children}
      </div>
    </div>
  );
}

function QueueItem({ title, subtitle, link, linkText, params }: any) {
  return (
    <div className="group flex items-center justify-between p-2 hover:bg-canvas rounded-lg transition-colors border border-transparent hover:border-line">
      <div>
        <div className="text-sm-minus font-semibold text-ink">{title}</div>
        <div className="text-xs-plus text-ink-tertiary">{subtitle}</div>
      </div>
      <Link to={link} params={params} className="text-brand text-xs font-medium opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
        {linkText} <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-xs text-ink-tertiary italic py-3 text-center bg-canvas rounded-lg">{text}</div>;
}

/* --- The 7 Metrics Views --- */

function FunnelView({ data }: { data: { stage: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="h-full flex flex-col">
      <SectionTitle>Pipeline Funnel</SectionTitle>
      <div className="space-y-3 mt-2">
        {data.map((d, i) => {
          const pct = (d.count / max) * 100;
          const drop = i > 0 && data[i - 1].count > 0
            ? Math.round(((data[i - 1].count - d.count) / data[i - 1].count) * 100)
            : 0;
          return (
            <div key={d.stage} className="flex items-center gap-4">
              <div className="w-28 text-sm-minus font-medium text-ink-secondary truncate" title={d.stage}>{d.stage}</div>
              <div className="flex-1 h-8 bg-canvas rounded-md overflow-hidden relative border border-surface-inset">
                <div
                  className="h-full bg-brand-subtle rounded-r-md transition-all duration-500"
                  style={{ width: `${pct}%` }}
                >
                  <div className="h-full w-full border-r-[3px] border-brand" />
                </div>
                <span className="absolute inset-y-0 left-3 flex items-center text-xs font-mono font-semibold text-ink">
                  {d.count}
                </span>
              </div>
              <div className="w-16 flex justify-end">
                {i > 0 ? (
                  <span className="text-2xs font-mono font-medium px-1.5 py-0.5 rounded bg-rose-50 text-danger">
                    −{drop}%
                  </span>
                ) : (
                  <span className="text-2xs font-mono font-medium px-1.5 py-0.5 text-ink-tertiary">
                    —
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreDistView({ sessions, roleFilter, setRoleFilter }: any) {
  const roleTemplates = useStore((s) => s.roleTemplates) || [];
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const filtered = roleFilter === "all" ? safeSessions : safeSessions.filter((s: any) => s?.roleTemplate?.id === roleFilter || s?.roleTemplate?.roleName?.toLowerCase() === roleFilter.toLowerCase());
  const buckets = ["0-40", "40-55", "55-70", "70-85", "85-100"];
  const dist = buckets.map((b) => {
    const [lo, hi] = b.split("-").map(Number);
    return {
      bucket: b,
      count: filtered.filter((s: any) => (s?.compositeScore || 0) >= lo && (s?.compositeScore || 0) < hi + 0.0001).length,
    };
  });
  const max = Math.max(...dist.map((d) => d.count), 1);

  return (
    <div className="h-full flex flex-col">
      <SectionTitle
        noMargin
        action={
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-xs-plus font-medium border border-line rounded-md px-2 py-1 bg-canvas text-ink-secondary"
          >
            <option value="all">All Roles</option>
            {roleTemplates.map((rt) => (
              <option key={rt.id} value={rt.id}>{rt.roleName}</option>
            ))}
          </select>
        }
      >
        Score Distribution
      </SectionTitle>
      <div className="flex-1 flex items-end gap-2 mt-6 border-b border-surface-inset pb-2">
        {dist.map((d) => (
          <div key={d.bucket} className="flex-1 flex flex-col items-center gap-2 group">
            <div className="font-mono text-xs-plus text-ink-tertiary opacity-0 group-hover:opacity-100 transition-opacity">
              {d.count}
            </div>
            <div className="w-full flex justify-center h-32 relative">
              <div
                className="w-[80%] bg-brand rounded-t-md absolute bottom-0 transition-all duration-300 group-hover:bg-brand-ink"
                style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 0 }}
              />
            </div>
            <div className="text-xs-plus font-mono text-ink-secondary mt-1">{d.bucket}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SayDoView({ sessions }: { sessions: any[] }) {
  const buckets = ["0-40", "40-55", "55-70", "70-85", "85-100"];
  const dist = buckets.map((b) => {
    const [lo, hi] = b.split("-").map(Number);
    return {
      bucket: b,
      count: sessions.filter(
        (s) => s.sayDoScore !== null && s.sayDoScore >= lo && s.sayDoScore < hi + 0.0001,
      ).length,
    };
  });
  const max = Math.max(...dist.map((d) => d.count), 1);

  return (
    <div className="h-full flex flex-col">
      <SectionTitle>Say-Do Breakdown</SectionTitle>
      <p className="text-xs text-ink-secondary mb-4 leading-relaxed bg-canvas p-3 rounded-lg border border-surface-inset">
        <Sparkles size={14} className="inline mr-1.5 text-amber-700 mb-0.5" />
        Say-Do and composite score correlate at r≈0.4. This is a distinct behavioral signal.
      </p>
      <div className="mt-auto grid grid-cols-5 gap-3">
        {dist.map((d) => (
          <div key={d.bucket} className="flex flex-col items-center text-center">
            <div className="text-2xs font-mono uppercase text-ink-tertiary mb-1">{d.bucket}</div>
            <div className="font-mono text-xl font-semibold text-ink mb-2">{d.count}</div>
            <div className="w-full h-1.5 bg-surface-inset rounded-full overflow-hidden">
              <div className="h-full bg-brand rounded-full" style={{ width: `${(d.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeView({ data }: { data: any[] }) {
  const max = Math.max(...data.flatMap((d) => [d.avgSeconds, d.cohortAvgSeconds]), 1);
  const fmt = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  return (
    <div className="h-full flex flex-col">
      <SectionTitle>Time per Module</SectionTitle>
      <div className="space-y-5 mt-2">
        {data.map((d) => (
          <div key={d.module}>
            <div className="flex justify-between items-end text-xs mb-1.5">
              <span className="font-medium text-ink">{d.module}</span>
              <span className="font-mono text-ink-secondary text-xs-plus">
                {fmt(d.avgSeconds)} <span className="text-ink-tertiary ml-1">(avg {fmt(d.cohortAvgSeconds)})</span>
              </span>
            </div>
            <div className="relative h-3 bg-canvas rounded-full overflow-hidden border border-surface-inset">
              {/* Baseline Track */}
              <div
                className="absolute inset-y-0 left-0 bg-brand-subtle border-r border-brand/20"
                style={{ width: `${(d.cohortAvgSeconds / max) * 100}%` }}
              />
              {/* Cohort Fill */}
              <div
                className="absolute inset-y-0 left-0 bg-brand rounded-r-full"
                style={{ width: `${(d.avgSeconds / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-4 text-xs-plus font-mono text-ink-secondary bg-canvas w-fit px-3 py-1.5 rounded-md">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand" /> Current</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-subtle" /> Baseline</span>
      </div>
    </div>
  );
}

function IntegrityView({ data }: { data: any[] }) {
  const categories = Array.from(new Set(data.map((d) => d.category)));
  const severities = ["low", "medium", "critical"];
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="h-full flex flex-col">
      <SectionTitle>Integrity Flags Matrix</SectionTitle>
      <div className="overflow-x-auto mt-2">
        <div className="inline-grid gap-1.5 min-w-[500px]" style={{ gridTemplateColumns: `180px repeat(${severities.length}, 1fr)` }}>
          <div /> {/* Top-left empty cell */}
          {severities.map((s) => (
            <div key={s} className="text-2xs font-bold tracking-wider text-ink-tertiary text-center pb-2">
              {s}
            </div>
          ))}
          {categories.map((c) => (
            <Fragment key={c}>
              <div className="text-xs font-medium text-ink flex items-center">{c}</div>
              {severities.map((s) => {
                const cell = data.find((d) => d.category === c && d.severity === s);
                const count = cell?.count ?? 0;
                const intensity = count / max;
                const isCritical = s === "critical" && count > 0;
                const bg = isCritical
                  ? `rgba(229, 72, 77, ${0.15 + intensity * 0.85})`
                  : `rgba(47, 92, 255, ${0.05 + intensity * 0.95})`;

                return (
                  <div
                    key={c + s}
                    className={`h-12 rounded-lg flex items-center justify-center font-mono text-sm-minus font-medium border ${isCritical ? 'border-danger/20' : 'border-brand/10'} transition-transform hover:scale-[1.02] cursor-default`}
                    style={{ background: bg, color: isCritical ? (intensity > 0.5 ? "#FFFFFF" : "#9A2A2E") : (intensity > 0.6 ? "#FFFFFF" : "#15308F") }}
                  >
                    {count === 0 ? <span className="opacity-30">-</span> : count}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewerView({ data }: { data: any }) {
  const angle = data.agreementRate * 180;
  const total = data.overrides.reduce((a: number, o: any) => a + o.count, 0) || 1;

  return (
    <div className="h-full flex flex-col">
      <SectionTitle>AI/Human Agreement</SectionTitle>
      <div className="flex-1 flex flex-col md:flex-row gap-8 items-center mt-4">
        <div className="flex-1 flex justify-center w-full relative">
          <svg viewBox="0 0 200 110" className="w-full max-w-[220px] drop-shadow-sm">
            <path d="M10 100 A90 90 0 0 1 190 100" fill="none" stroke="#F7F7F9" strokeWidth="18" strokeLinecap="round" />
            <path
              d="M10 100 A90 90 0 0 1 190 100"
              fill="none"
              stroke="#2F5CFF"
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={`${(angle / 180) * 283} 283`}
            />
            <text x="100" y="85" textAnchor="middle" className="font-mono font-bold" fontSize="32" fill="#0B0B0D">
              {Math.round(data.agreementRate * 100)}%
            </text>
            <text x="100" y="105" textAnchor="middle" fontSize="10" fontWeight="600" fill="#8B8B93" letterSpacing="1.5">
              AGREEMENT
            </text>
          </svg>
        </div>

        <div className="flex-1 w-full flex flex-col justify-center">
          <div className="text-2xs font-bold tracking-wider text-ink-secondary mb-4">
            Human Overrides ({total})
          </div>
          <div className="space-y-4">
            {data.overrides.map((o: any) => (
              <div key={o.direction}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-ink capitalize">AI was too {o.direction}</span>
                  <span className="font-mono text-ink-secondary font-medium">{o.count}</span>
                </div>
                <div className="h-2.5 bg-canvas rounded-full overflow-hidden border border-surface-inset">
                  <div
                    className="h-full bg-brand-ink rounded-full"
                    style={{ width: `${(o.count / total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PredictiveStub() {
  const flat = Array.from({ length: 40 }, (_, i) => ({ t: i, said: 50, did: 50 }));
  return (
    <div className="h-full flex flex-col opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
      <SectionTitle>Predictive Validity</SectionTitle>
      <div className="flex-1 flex flex-col justify-center relative mt-2">
        <ScopePanel data={flat} height={140} markDivergences={false} showLabels={false} />
        <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[1px]">
          <div className="bg-white/90 px-4 py-2 rounded-lg border border-line text-xs font-mono text-ink-secondary shadow-sm text-center">
            Awaiting 90-day post-hire data <br />
            <span className="text-2xs opacity-70">Model unlit</span>
          </div>
        </div>
      </div>
    </div>
  );
}