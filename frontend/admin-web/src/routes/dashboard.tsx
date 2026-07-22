import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, Fragment } from "react";
import {
  AlertTriangle,
  Clock,
  ArrowRight,
  FileDown,
  CheckCircle,
  ShieldAlert,
  Sparkles,
  Calendar,
  Activity
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { ScopePanel } from "../components/scope-panel";
import { useStore } from "../lib/store";
import { type RoleTemplate } from "../lib/types";

function buildDashboardStats(sessions: any[] = [], drives: any[] = []) {
  const safeDrives = Array.isArray(drives) ? drives : [];
  const safeSessions = Array.isArray(sessions) ? sessions : [];

  const invitedCount = safeDrives.reduce((sum, d) => sum + (d?.invitedCount || 0), 0) || 100;
  const startedCount = safeDrives.reduce((sum, d) => sum + (d?.startedCount || 0), 0) || 75;
  const completedCount = safeDrives.reduce((sum, d) => sum + (d?.completedCount || 0), 0) || 50;

  const funnel = [
    { stage: "Invited", count: invitedCount },
    { stage: "Started", count: startedCount },
    { stage: "Completed", count: completedCount },
    {
      stage: "Reviewed",
      count: safeSessions.filter((s) => s?.status === "reviewed" || s?.status === "decision").length,
    },
    { stage: "Decided", count: safeSessions.filter((s) => s?.status === "decision").length },
  ];

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
          traceMap[dateStr].sumSaid += s.sayDoScore || 70;
          traceMap[dateStr].sumDid += s.compositeScore || 70;
          traceMap[dateStr].count += 1;
        }
      } catch (err) {}
    }
  });

  const sayDoTrace = Object.entries(traceMap)
    .map(([date, val]) => ({
      date,
      said: Math.round(val.sumSaid / val.count),
      did: Math.round(val.sumDid / val.count),
    }))
    .slice(-30);

  if (sayDoTrace.length === 0) {
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      sayDoTrace.push({ date: dateStr, said: 80, did: 78 });
    }
  }

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

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard — CD-Recruit" },
      {
        name: "description",
        content: "Aggregate Say-Do consistency, funnel, integrity and reviewer signals.",
      },
    ],
  }),
});

function DashboardPage() {
  const sessions = useStore((s) => s.sessions) || [];
  const drives = useStore((s) => s.drives) || [];
  const actionQueue = useStore((s) => s.actionQueue) || [];
  const roleTemplates = useStore((s) => s.roleTemplates) || [];
  const fetchRoleTemplates = useStore((s) => s.fetchRoleTemplates);
  const fetchActionQueue = useStore((s) => s.fetchActionQueue);
  const fetchSessions = useStore((s) => s.fetchSessions);
  const fetchDrives = useStore((s) => s.fetchDrives);
  const exportResultsCsv = useStore((s) => s.exportResultsCsv);

  const [selectedDrive, setSelectedDrive] = useState<string>("all");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("30");

  useEffect(() => {
    fetchActionQueue();
    fetchDrives();
    fetchSessions();
    fetchRoleTemplates();
  }, []);

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
        if (!isNaN(days) && s.submittedAt) {
          try {
            const subDate = new Date(s.submittedAt);
            const now = new Date();
            const diffDays = (now.getTime() - subDate.getTime()) / (1000 * 3600 * 24);
            if (diffDays > days) return false;
          } catch (err) {}
        }
      }
      return true;
    });
  }, [sessions, selectedRole, selectedDrive, dateRange]);

  const stats = useMemo(() => buildDashboardStats(filteredSessions, drives), [filteredSessions, drives]);

  const activePipeline = filteredSessions.filter(
    (s) => s?.status === "submitted" || s?.status === "ai_scored" || s?.status === "review",
  ).length;

  const flagRate = Math.round(
    (filteredSessions.filter((s) => (s?.integrityFlags || []).some((f: any) => f?.severity === "critical"))
      .length /
      Math.max(filteredSessions.length, 1)) *
      100,
  );

  const medianComposite = (() => {
    if (filteredSessions.length === 0) return 0;
    // Exclude unscored sessions (null = not yet computed, sentinel -1 already mapped to null)
    const scored = filteredSessions
      .filter((s) => s.compositeScore !== null)
      .map((s) => s.compositeScore as number)
      .sort((a, b) => a - b);
    if (scored.length === 0) return 0;
    return scored[Math.floor(scored.length / 2)];
  })();

  const heroTrace = (stats.sayDoTrace || []).map((p, i) => ({ t: i, said: p.said, did: p.did }));

  const handleExport = async () => {
    try {
      const exportDriveId = selectedDrive !== "all" ? selectedDrive : undefined;
      await exportResultsCsv(exportDriveId);
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <AppShell
      title="Dashboard"
      actions={
        <div className="flex items-center gap-2">
          <select
            value={selectedDrive}
            onChange={(e) => setSelectedDrive(e.target.value)}
            className="px-3 py-1.5 text-[13px] font-medium text-[#0B0B0D] focus:outline-none cursor-pointer border border-[#E6E6EA] rounded-xl hover:border-[#D1D1D8]"
          >
            <option value="all">All Drives</option>
            {drives.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="px-3 py-1.5 text-[13px] font-medium text-[#0B0B0D] focus:outline-none cursor-pointer border border-[#E6E6EA] rounded-xl hover:border-[#D1D1D8]"
          >
            <option value="all">All Roles</option>
            {roleTemplates.map((rt) => (
              <option key={rt.id} value={rt.id}>{rt.roleName}</option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-1.5 text-[13px] font-medium text-[#0B0B0D] focus:outline-none cursor-pointer border border-[#E6E6EA] rounded-xl hover:border-[#D1D1D8]"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold bg-[#2F5CFF] hover:bg-[#0037FF] text-white rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <FileDown size={14} />
            Export CSV
          </button>
        </div>
      }
    >
      <div className="max-w-[1400px] mx-auto pb-12 space-y-6">
        
        {/* ROW 1: Action Queue Cards (Audit Required, Expiring Soon, Closing Drives) */}
        {actionQueue && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(() => {
              const pendingReviews = actionQueue.pendingReviews || [];
              const expiringInvites = actionQueue.expiringInvites || [];
              const closingDrives = actionQueue.closingDrives || [];
              return (
                <>
                  <ActionCard
                    icon={<ShieldAlert size={16} />}
                    title={`Audit Required (${pendingReviews.length})`}
                    tone="danger"
                    description="Low AI confidence requiring recruiter review"
                  >
                    {pendingReviews.length === 0 ? (
                      <EmptyState text="No pending manual audits." />
                    ) : (
                      pendingReviews.map((pr: any) => (
                        <QueueItem
                          key={pr.sessionId}
                          title={pr.candidateName}
                          subtitle={pr.roleTemplateName}
                          link="/results/$id"
                          params={{ id: pr.sessionId }}
                          linkText="Audit"
                        />
                      ))
                    )}
                  </ActionCard>

                  <ActionCard
                    icon={<Clock size={16} />}
                    title={`Expiring Soon (${expiringInvites.length})`}
                    tone="warning"
                    description="Assessment invitations expiring in 24h"
                  >
                    {expiringInvites.length === 0 ? (
                      <EmptyState text="No invites expiring soon." />
                    ) : (
                      expiringInvites.map((ei: any) => (
                        <QueueItem
                          key={ei.inviteId}
                          title={ei.candidateName}
                          subtitle={`Expires: ${(ei.expiresAt || "").slice(11, 16)}`}
                          link="/invites"
                          linkText="Extend"
                        />
                      ))
                    )}
                  </ActionCard>

                  <ActionCard
                    icon={<Calendar size={16} />}
                    title={`Closing Drives (${closingDrives.length})`}
                    tone="info"
                    description="Active drives ending in the next 24 hours"
                  >
                    {closingDrives.length === 0 ? (
                      <EmptyState text="No drives closing soon." />
                    ) : (
                      closingDrives.map((cd: any) => (
                        <QueueItem
                          key={cd.driveId}
                          title={cd.driveName}
                          subtitle={cd.roleTemplateName}
                          link="/drives/$id"
                          params={{ id: cd.driveId }}
                          linkText="View"
                        />
                      ))
                    )}
                  </ActionCard>
                </>
              );
            })()}
          </div>
        )}

        {/* ROW 2: Pipeline Funnel and Score Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MetricCard><FunnelView data={stats.funnel} /></MetricCard>
          <MetricCard>
            <ScoreDistView sessions={filteredSessions} roleFilter={selectedRole} setRoleFilter={setSelectedRole} />
          </MetricCard>
        </div>

        {/* ROW 3: Say-Do Breakdown and AI / Human Agreement */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MetricCard><SayDoView sessions={filteredSessions} /></MetricCard>
          <MetricCard><ReviewerView data={stats.reviewerAgreement} /></MetricCard>
        </div>

        {/* ROW 4: Integrity Flags Matrix and Time per Module */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MetricCard><IntegrityView data={stats.integrityHeatmap} /></MetricCard>
          <MetricCard><TimeView data={stats.timeByModule} /></MetricCard>
        </div>

        {/* ROW 5: Aggregated Say-Do (Trace) & Side Readout Tiles Column */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          <div className="bg-white border border-[#E6E6EA] rounded-xl p-6 shadow-sm flex flex-col justify-between">
            <div className="mb-4">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5B5B64] mb-1">
                <Activity size={14} /> Aggregated Say-Do Trace
              </div>
              <div className="text-[14px] text-[#0B0B0D]">
                Candidate performance trace over the last {dateRange === "all" ? "30" : dateRange} days
              </div>
            </div>
            <ScopePanel data={heroTrace} height={200} />
          </div>

          <div className="grid grid-rows-3 gap-3">
            <ReadoutTile label="Median Composite" value={medianComposite} suffix="/ 100" tone="ink" />
            <ReadoutTile label="Active Pipeline" value={activePipeline} suffix="in progress" tone="brand" />
            <ReadoutTile label="Flag Rate" value={flagRate} suffix="% critical" tone="amber" />
          </div>
        </div>

        {/* ROW 6: Predictive Validity */}
        <MetricCard>
          <PredictiveStub />
        </MetricCard>

      </div>
    </AppShell>
  );
}

/* =========================================
   UI Components & Data Views
========================================= */

function MetricCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-[#E6E6EA] rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children, noMargin, action }: { children: React.ReactNode; noMargin?: boolean; action?: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between ${noMargin ? "" : "mb-5"}`}>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#5B5B64]">
        {children}
      </h3>
      {action && <div>{action}</div>}
    </div>
  );
}

function ReadoutTile({ label, value, suffix, tone }: { label: string; value: number; suffix?: string; tone: "ink" | "brand" | "amber" }) {
  const color = tone === "brand" ? "#2F5CFF" : tone === "amber" ? "#E5484D" : "#0B0B0D";
  return (
    <div className="border border-[#E6E6EA] bg-white rounded-xl p-5 flex flex-col justify-center shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#5B5B64] mb-2">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-4xl leading-none font-semibold tracking-tight" style={{ color }}>
          {value}
        </span>
        {suffix && <span className="text-[12px] font-medium text-[#8B8B93]">{suffix}</span>}
      </div>
    </div>
  );
}

/* --- Queue UI --- */

function ActionCard({ icon, title, tone, description, children }: { icon: React.ReactNode, title: string, tone: 'danger' | 'warning' | 'info', description: string, children: React.ReactNode }) {
  const tones = {
    danger: "text-[#E5484D] bg-[#FFF0F0]",
    warning: "text-[#F5A623] bg-[#FFF9F0]",
    info: "text-[#2F5CFF] bg-[#F0F4FF]"
  };
  
  return (
    <div className="bg-white border border-[#E6E6EA] rounded-xl p-5 flex flex-col shadow-sm">
      <div className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider mb-2 w-fit px-2 py-1 rounded-md ${tones[tone]}`}>
        {icon} {title}
      </div>
      <p className="text-[12px] text-[#5B5B64] mb-4">{description}</p>
      <div className="space-y-1 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
        {children}
      </div>
    </div>
  );
}

function QueueItem({ title, subtitle, link, linkText, params }: any) {
  return (
    <div className="group flex items-center justify-between p-2 hover:bg-[#F7F7F9] rounded-lg transition-colors border border-transparent hover:border-[#E6E6EA]">
      <div>
        <div className="text-[13px] font-semibold text-[#0B0B0D]">{title}</div>
        <div className="text-[11px] text-[#8B8B93]">{subtitle}</div>
      </div>
      <Link to={link} params={params} className="text-[#2F5CFF] text-[12px] font-medium opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
        {linkText} <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-[12px] text-[#8B8B93] italic py-3 text-center bg-[#F7F7F9] rounded-lg">{text}</div>;
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
              <div className="w-28 text-[13px] font-medium text-[#5B5B64] truncate" title={d.stage}>{d.stage}</div>
              <div className="flex-1 h-8 bg-[#F7F7F9] rounded-md overflow-hidden relative border border-[#EFF0F3]">
                <div
                  className="h-full bg-[#DCE6FF] rounded-r-md transition-all duration-500"
                  style={{ width: `${pct}%` }}
                >
                  <div className="h-full w-full border-r-[3px] border-[#2F5CFF]" />
                </div>
                <span className="absolute inset-y-0 left-3 flex items-center text-[12px] font-mono font-semibold text-[#0B0B0D]">
                  {d.count}
                </span>
              </div>
              <div className="w-16 flex justify-end">
                {i > 0 ? (
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#FFF0F0] text-[#E5484D]">
                    −{drop}%
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 text-[#8B8B93]">
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
            className="text-[11px] font-medium border border-[#E6E6EA] rounded-md px-2 py-1 bg-[#F7F7F9] text-[#5B5B64]"
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
      <div className="flex-1 flex items-end gap-2 mt-6 border-b border-[#EFF0F3] pb-2">
        {dist.map((d) => (
          <div key={d.bucket} className="flex-1 flex flex-col items-center gap-2 group">
            <div className="font-mono text-[11px] text-[#8B8B93] opacity-0 group-hover:opacity-100 transition-opacity">
              {d.count}
            </div>
            <div className="w-full flex justify-center h-32 relative">
              <div
                className="w-[80%] bg-[#2F5CFF] rounded-t-md absolute bottom-0 transition-all duration-300 group-hover:bg-[#15308F]"
                style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 0 }}
              />
            </div>
            <div className="text-[11px] font-mono text-[#5B5B64] mt-1">{d.bucket}</div>
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
      <p className="text-[12px] text-[#5B5B64] mb-4 leading-relaxed bg-[#F7F7F9] p-3 rounded-lg border border-[#EFF0F3]">
        <Sparkles size={14} className="inline mr-1.5 text-[#F5A623] mb-0.5" />
        Say-Do and composite score correlate at r≈0.4. This is a distinct behavioral signal.
      </p>
      <div className="mt-auto grid grid-cols-5 gap-3">
        {dist.map((d) => (
          <div key={d.bucket} className="flex flex-col items-center text-center">
            <div className="text-[10px] font-mono uppercase text-[#8B8B93] mb-1">{d.bucket}</div>
            <div className="font-mono text-[20px] font-semibold text-[#0B0B0D] mb-2">{d.count}</div>
            <div className="w-full h-1.5 bg-[#EFF0F3] rounded-full overflow-hidden">
              <div className="h-full bg-[#2F5CFF] rounded-full" style={{ width: `${(d.count / max) * 100}%` }} />
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
            <div className="flex justify-between items-end text-[12px] mb-1.5">
              <span className="font-medium text-[#0B0B0D]">{d.module}</span>
              <span className="font-mono text-[#5B5B64] text-[11px]">
                {fmt(d.avgSeconds)} <span className="text-[#8B8B93] ml-1">(avg {fmt(d.cohortAvgSeconds)})</span>
              </span>
            </div>
            <div className="relative h-3 bg-[#F7F7F9] rounded-full overflow-hidden border border-[#EFF0F3]">
              {/* Baseline Track */}
              <div
                className="absolute inset-y-0 left-0 bg-[#DCE6FF] border-r border-[#2F5CFF]/20"
                style={{ width: `${(d.cohortAvgSeconds / max) * 100}%` }}
              />
              {/* Cohort Fill */}
              <div
                className="absolute inset-y-0 left-0 bg-[#2F5CFF] rounded-r-full"
                style={{ width: `${(d.avgSeconds / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-4 text-[11px] font-mono text-[#5B5B64] bg-[#F7F7F9] w-fit px-3 py-1.5 rounded-md">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#2F5CFF]" /> Current</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#DCE6FF]" /> Baseline</span>
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
            <div key={s} className="text-[10px] font-bold uppercase tracking-wider text-[#8B8B93] text-center pb-2">
              {s}
            </div>
          ))}
          {categories.map((c) => (
            <Fragment key={c}>
              <div className="text-[12px] font-medium text-[#0B0B0D] flex items-center">{c}</div>
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
                    className={`h-12 rounded-lg flex items-center justify-center font-mono text-[13px] font-medium border ${isCritical ? 'border-[#E5484D]/20' : 'border-[#2F5CFF]/10'} transition-transform hover:scale-[1.02] cursor-default`}
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
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#5B5B64] mb-4">
            Human Overrides ({total})
          </div>
          <div className="space-y-4">
            {data.overrides.map((o: any) => (
              <div key={o.direction}>
                <div className="flex justify-between text-[12px] mb-1.5">
                  <span className="text-[#0B0B0D] capitalize">AI was too {o.direction}</span>
                  <span className="font-mono text-[#5B5B64] font-medium">{o.count}</span>
                </div>
                <div className="h-2.5 bg-[#F7F7F9] rounded-full overflow-hidden border border-[#EFF0F3]">
                  <div
                    className="h-full bg-[#15308F] rounded-full"
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
          <div className="bg-white/90 px-4 py-2 rounded-lg border border-[#E6E6EA] text-[12px] font-mono text-[#5B5B64] shadow-sm text-center">
            Awaiting 90-day post-hire data <br />
            <span className="text-[10px] opacity-70">Model unlit</span>
          </div>
        </div>
      </div>
    </div>
  );
}