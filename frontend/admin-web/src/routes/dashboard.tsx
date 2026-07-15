import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, Fragment } from "react";
import { AppShell } from "../components/app-shell";
import { ScopePanel } from "../components/scope-panel";
import { useStore } from "../lib/store";
import { buildDashboardStats, ROLE_TEMPLATES } from "../lib/mock-data";

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

const TABS = [
  "Funnel",
  "Score Distribution",
  "Say-Do",
  "Time",
  "Integrity",
  "Reviewer",
  "Predictive Validity",
] as const;
type Tab = (typeof TABS)[number];

function DashboardPage() {
  const sessions = useStore((s) => s.sessions);
  const stats = useMemo(() => buildDashboardStats(sessions), [sessions]);
  const [tab, setTab] = useState<Tab>("Funnel");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const activePipeline = sessions.filter(
    (s) => s.status === "submitted" || s.status === "ai_scored" || s.status === "review",
  ).length;
  const flagRate = Math.round(
    (sessions.filter((s) => s.integrityFlags.some((f) => f.severity === "critical")).length /
      sessions.length) *
      100,
  );
  const medianComposite = (() => {
    const arr = [...sessions.map((s) => s.compositeScore)].sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)];
  })();

  const heroTrace = stats.sayDoTrace.map((p, i) => ({ t: i, said: p.said, did: p.did }));

  return (
    <AppShell title="Dashboard">
      {/* Hero */}
      <div className="grid grid-cols-[1fr_260px] gap-4 mb-6">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#5B5B64]">
                Aggregate Say-Do · last 30 days
              </div>
              <div className="text-[14px] mt-0.5 text-[#0B0B0D]">
                What candidates said vs. what they actually did
              </div>
            </div>
          </div>
          <ScopePanel data={heroTrace} height={220} />
        </div>
        <div className="grid grid-rows-3 gap-3">
          <ReadoutTile label="Median composite" value={medianComposite} suffix="/100" tone="ink" />
          <ReadoutTile
            label="Active pipeline"
            value={activePipeline}
            suffix="in progress"
            tone="brand"
          />
          <ReadoutTile label="Flag rate" value={flagRate} suffix="% critical" tone="amber" />
        </div>
      </div>

      {/* Segmented control */}
      <div className="mb-5 flex flex-wrap gap-1 p-1 bg-[#EFF0F3] rounded-[10px] w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-[12px] rounded-md transition-colors ${
              tab === t
                ? "bg-white text-[#0B0B0D] shadow-sm"
                : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-6">
        {tab === "Funnel" && <FunnelView data={stats.funnel} />}
        {tab === "Score Distribution" && (
          <ScoreDistView
            sessions={sessions}
            roleFilter={roleFilter}
            setRoleFilter={setRoleFilter}
          />
        )}
        {tab === "Say-Do" && <SayDoView sessions={sessions} />}
        {tab === "Time" && <TimeView data={stats.timeByModule} />}
        {tab === "Integrity" && <IntegrityView data={stats.integrityHeatmap} />}
        {tab === "Reviewer" && <ReviewerView data={stats.reviewerAgreement} />}
        {tab === "Predictive Validity" && <PredictiveStub />}
      </div>
    </AppShell>
  );
}

function ReadoutTile({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone: "ink" | "brand" | "amber";
}) {
  const color = tone === "brand" ? "#2F5CFF" : tone === "amber" ? "#F5A623" : "#0B0B0D";
  return (
    <div className="border border-[#E6E6EA] bg-white rounded-[10px] p-4 flex flex-col justify-between">
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#5B5B64]">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[34px] leading-none font-semibold" style={{ color }}>
          {value}
        </span>
        {suffix && <span className="text-[11px] font-mono text-[#5B5B64]">{suffix}</span>}
      </div>
    </div>
  );
}

function FunnelView({ data }: { data: { stage: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count));
  return (
    <div>
      <SectionTitle>Pipeline funnel</SectionTitle>
      <div className="space-y-2">
        {data.map((d, i) => {
          const pct = (d.count / max) * 100;
          const drop =
            i > 0 ? Math.round(((data[i - 1].count - d.count) / data[i - 1].count) * 100) : 0;
          return (
            <div key={d.stage} className="flex items-center gap-3">
              <div className="w-24 text-[12px] text-[#5B5B64]">{d.stage}</div>
              <div className="flex-1 h-8 bg-[#EFF0F3] rounded-md overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-[#2F5CFF] to-[#DCE6FF]"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-y-0 left-3 flex items-center text-[12px] font-mono font-medium text-white mix-blend-difference">
                  {d.count}
                </span>
              </div>
              <div className="w-20 text-right font-mono text-[11px] text-[#5B5B64]">
                {i > 0 ? `−${drop}%` : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreDistView({
  sessions,
  roleFilter,
  setRoleFilter,
}: {
  sessions: ReturnType<typeof useStore.getState>["sessions"];
  roleFilter: string;
  setRoleFilter: (v: string) => void;
}) {
  const filtered =
    roleFilter === "all" ? sessions : sessions.filter((s) => s.roleTemplate.id === roleFilter);
  const buckets = ["0-40", "40-55", "55-70", "70-85", "85-100"];
  const dist = buckets.map((b) => {
    const [lo, hi] = b.split("-").map(Number);
    return {
      bucket: b,
      count: filtered.filter((s) => s.compositeScore >= lo && s.compositeScore < hi + 0.0001)
        .length,
    };
  });
  const max = Math.max(...dist.map((d) => d.count), 1);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionTitle noMargin>Composite score distribution</SectionTitle>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="text-[12px] border border-[#E6E6EA] rounded-md px-2 py-1.5 bg-white"
        >
          <option value="all">All role templates</option>
          {ROLE_TEMPLATES.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.roleName} · {rt.track}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-3 h-56 pl-2 pr-2">
        {dist.map((d) => (
          <div key={d.bucket} className="flex-1 flex flex-col items-center gap-2">
            <div className="font-mono text-[11px] text-[#5B5B64]">{d.count}</div>
            <div className="w-full flex items-end" style={{ height: "100%" }}>
              <div
                className="w-full bg-[#2F5CFF] rounded-t"
                style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 6 : 0 }}
              />
            </div>
            <div className="text-[11px] font-mono text-[#5B5B64]">{d.bucket}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SayDoView({ sessions }: { sessions: ReturnType<typeof useStore.getState>["sessions"] }) {
  // build a distribution histogram
  const buckets = ["0-40", "40-55", "55-70", "70-85", "85-100"];
  const dist = buckets.map((b) => {
    const [lo, hi] = b.split("-").map(Number);
    return {
      bucket: b,
      count: sessions.filter((s) => s.sayDoScore >= lo && s.sayDoScore < hi + 0.0001).length,
    };
  });
  // Also build a trace visualisation: average across sessions per t-index
  const n = sessions[0]?.sayDoTrace.length ?? 0;
  const trace: { t: number; said: number; did: number }[] = [];
  for (let i = 0; i < n; i++) {
    const said = sessions.reduce((a, s) => a + s.sayDoTrace[i].said, 0) / sessions.length;
    const did = sessions.reduce((a, s) => a + s.sayDoTrace[i].did, 0) / sessions.length;
    trace.push({ t: i, said, did });
  }
  const max = Math.max(...dist.map((d) => d.count), 1);
  return (
    <div>
      <SectionTitle>Say-Do consistency across cohort</SectionTitle>
      <ScopePanel data={trace} height={220} />
      <div className="mt-4 text-[12px] font-mono text-[#5B5B64]">
        &gt; Say-Do and composite score correlate at r≈0.4 — distinct signal, not a duplicate of
        overall performance.
      </div>
      <div className="mt-6 grid grid-cols-5 gap-2">
        {dist.map((d) => (
          <div key={d.bucket} className="border border-[#E6E6EA] rounded-md p-3">
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B5B64]">
              {d.bucket}
            </div>
            <div className="font-mono text-[22px] font-semibold text-[#0B0B0D]">{d.count}</div>
            <div className="mt-1 h-1 bg-[#EFF0F3] rounded">
              <div
                className="h-full bg-[#2F5CFF] rounded"
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeView({
  data,
}: {
  data: { module: string; avgSeconds: number; cohortAvgSeconds: number }[];
}) {
  const max = Math.max(...data.flatMap((d) => [d.avgSeconds, d.cohortAvgSeconds]));
  const fmt = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;
  return (
    <div>
      <SectionTitle>Average time per module vs. cohort</SectionTitle>
      <div className="space-y-4">
        {data.map((d) => (
          <div key={d.module}>
            <div className="flex justify-between text-[12px] mb-1">
              <span className="text-[#0B0B0D]">{d.module}</span>
              <span className="font-mono text-[#5B5B64]">
                {fmt(d.avgSeconds)} · cohort {fmt(d.cohortAvgSeconds)}
              </span>
            </div>
            <div className="relative h-5 bg-[#EFF0F3] rounded overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-[#DCE6FF]"
                style={{ width: `${(d.cohortAvgSeconds / max) * 100}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-[#2F5CFF]"
                style={{ width: `${(d.avgSeconds / max) * 100}%`, opacity: 0.9 }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-4 text-[11px] font-mono text-[#5B5B64]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 bg-[#2F5CFF]" /> this cohort
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 bg-[#DCE6FF]" /> baseline
        </span>
      </div>
    </div>
  );
}

function IntegrityView({
  data,
}: {
  data: { category: string; severity: string; count: number }[];
}) {
  const categories = Array.from(new Set(data.map((d) => d.category)));
  const severities = ["low", "medium", "critical"];
  const max = Math.max(...data.map((d) => d.count));
  return (
    <div>
      <SectionTitle>Integrity flags · category × severity</SectionTitle>
      <div
        className="inline-grid gap-1"
        style={{ gridTemplateColumns: `160px repeat(${severities.length}, 100px)` }}
      >
        <div />
        {severities.map((s) => (
          <div
            key={s}
            className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] text-center pb-1"
          >
            {s}
          </div>
        ))}
        {categories.map((c) => (
          <Fragment key={c}>
            <div className="text-[12px] text-[#0B0B0D] pr-2 py-2">{c}</div>
            {severities.map((s) => {
              const cell = data.find((d) => d.category === c && d.severity === s);
              const count = cell?.count ?? 0;
              const intensity = count / max;
              const isCritical = s === "critical" && count > 0;
              const bg = isCritical
                ? `rgba(229, 72, 77, ${0.2 + intensity * 0.7})`
                : `rgba(47, 92, 255, ${0.1 + intensity * 0.5})`;
              return (
                <div
                  key={c + s}
                  className="h-14 rounded-md flex items-center justify-center font-mono text-[13px]"
                  style={{ background: bg, color: isCritical ? "#9A2A2E" : "#15308F" }}
                >
                  {count}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function ReviewerView({
  data,
}: {
  data: { agreementRate: number; overrides: { direction: "lenient" | "harsh"; count: number }[] };
}) {
  const angle = data.agreementRate * 180;
  const total = data.overrides.reduce((a, o) => a + o.count, 0);
  return (
    <div>
      <SectionTitle>AI vs. human reviewer agreement</SectionTitle>
      <div className="grid grid-cols-2 gap-8 items-center">
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 200 110" className="w-full max-w-[280px]">
            <path d="M10 100 A90 90 0 0 1 190 100" fill="none" stroke="#EFF0F3" strokeWidth="16" />
            <path
              d="M10 100 A90 90 0 0 1 190 100"
              fill="none"
              stroke="#2F5CFF"
              strokeWidth="16"
              strokeDasharray={`${(angle / 180) * 283} 283`}
            />
            <text
              x="100"
              y="88"
              textAnchor="middle"
              className="font-mono"
              fontSize="26"
              fill="#0B0B0D"
            >
              {Math.round(data.agreementRate * 100)}%
            </text>
            <text x="100" y="104" textAnchor="middle" fontSize="9" fill="#5B5B64" letterSpacing="1">
              AGREEMENT
            </text>
          </svg>
        </div>
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-3">
            Override direction ({total})
          </div>
          {data.overrides.map((o) => (
            <div key={o.direction} className="mb-2">
              <div className="flex justify-between text-[12px] mb-1">
                <span>AI was too {o.direction}</span>
                <span className="font-mono text-[#5B5B64]">{o.count}</span>
              </div>
              <div className="h-2 bg-[#EFF0F3] rounded">
                <div
                  className="h-full bg-[#2F5CFF] rounded"
                  style={{ width: `${(o.count / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PredictiveStub() {
  const flat = Array.from({ length: 40 }, (_, i) => ({ t: i, said: 50, did: 50 }));
  return (
    <div>
      <SectionTitle>Predictive validity</SectionTitle>
      <ScopePanel data={flat} height={200} markDivergences={false} showLabels={false} />
      <div className="mt-4 text-[12px] font-mono text-[#5B5B64]">
        &gt; awaiting post-hire outcome data · 0 signed offers with 90-day follow-up · model unlit
      </div>
    </div>
  );
}

function SectionTitle({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <div
      className={`text-[11px] font-mono uppercase tracking-[0.16em] text-[#5B5B64] ${noMargin ? "" : "mb-4"}`}
    >
      {children}
    </div>
  );
}
