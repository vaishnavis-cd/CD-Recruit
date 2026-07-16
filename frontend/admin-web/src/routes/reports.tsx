import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore } from "../lib/store";
import { ROLE_TEMPLATES } from "../lib/mock-data";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "Reports — CD-Recruit" },
      { name: "description", content: "Cohort comparison, exports, and Say-Do overlays." },
    ],
  }),
});

const RANGES = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
];

function ReportsPage() {
  const sessions = useStore((s) => s.sessions);
  const [cohortA, setCohortA] = useState({ role: ROLE_TEMPLATES[0].id, range: "30d" });
  const [cohortB, setCohortB] = useState({ role: ROLE_TEMPLATES[1].id, range: "30d" });
  const [variant, setVariant] = useState<"internal" | "candidate">("internal");
  const [exporting, setExporting] = useState(false);

  const traceA = useMemo(
    () => buildAvgTrace(sessions, cohortA.role, cohortA.range),
    [sessions, cohortA],
  );
  const traceB = useMemo(
    () => buildAvgTrace(sessions, cohortB.role, cohortB.range),
    [sessions, cohortB],
  );

  const exportJSON = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      variant,
      cohortA: { ...cohortA, trace: traceA },
      cohortB: { ...cohortB, trace: traceB },
      fields: FIELDS[variant],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cd-recruit-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      // small inline toast
      const t = document.createElement("div");
      t.textContent = "PDF export queued (mock)";
      t.className =
        "fixed bottom-6 right-6 z-50 bg-[#0B0B0D] text-white text-[13px] px-4 py-2 rounded-md shadow-lg";
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2200);
    }, 1200);
  };

  return (
    <AppShell
      title="Reports"
      actions={
        <div className="flex gap-2">
          <button
            onClick={exportPDF}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md hover:bg-[#F7F7F9] disabled:opacity-60"
          >
            <FileText size={14} /> {exporting ? "Preparing export…" : "Export PDF"}
          </button>
          <button
            onClick={exportJSON}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#2F5CFF] hover:bg-[#2448D9] text-white rounded-md text-[13px] font-medium"
          >
            <Download size={14} /> Export JSON
          </button>
        </div>
      }
    >
      <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-6 mb-5">
        <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#5B5B64] mb-4">
          Cohort comparison · Say-Do overlay
        </div>
        <div className="grid grid-cols-2 gap-4 mb-5">
          <CohortSelector label="Cohort A" tone="A" value={cohortA} onChange={setCohortA} />
          <CohortSelector label="Cohort B" tone="B" value={cohortB} onChange={setCohortB} />
        </div>

        <OverlayScope traceA={traceA} traceB={traceB} />
        <div className="mt-3 text-[11px] font-mono text-[#5B5B64]">
          &gt; overlaying two average Say-Do traces · same visual grammar as dashboard hero and
          session detail
        </div>
      </div>

      <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[15px] font-semibold text-[#0B0B0D]">Export preview</div>
            <div className="text-[12px] text-[#5B5B64] mt-0.5">
              Fields included in the{" "}
              {variant === "internal" ? "internal recruiter" : "candidate-facing"} report.
            </div>
          </div>
          <div className="flex p-1 bg-[#EFF0F3] rounded-md">
            {(["internal", "candidate"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVariant(v)}
                className={`px-3 py-1.5 text-[12px] rounded ${
                  variant === v ? "bg-white shadow-sm text-[#0B0B0D]" : "text-[#5B5B64]"
                }`}
              >
                {v === "internal" ? "Internal / Recruiter" : "Candidate-Facing"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {FIELDS[variant].map((f) => (
            <div
              key={f.label}
              className="flex items-start gap-2 border border-[#E6E6EA] rounded-md px-3 py-2.5"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full mt-1.5 ${f.sensitive ? "bg-[#E5484D]" : "bg-[#2F5CFF]"}`}
              />
              <div className="min-w-0">
                <div className="text-[12px] text-[#0B0B0D]">{f.label}</div>
                <div className="text-[11px] text-[#5B5B64]">{f.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function CohortSelector({
  label,
  tone,
  value,
  onChange,
}: {
  label: string;
  tone: "A" | "B";
  value: { role: string; range: string };
  onChange: (v: { role: string; range: string }) => void;
}) {
  const color = tone === "A" ? "#2F5CFF" : "#17C964";
  return (
    <div className="border border-[#E6E6EA] rounded-md p-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64]">
          {label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={value.role}
          onChange={(e) => onChange({ ...value, role: e.target.value })}
          className="text-[12px] border border-[#E6E6EA] rounded px-2 py-1.5 bg-white"
        >
          {ROLE_TEMPLATES.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.roleName} · {rt.track}
            </option>
          ))}
        </select>
        <select
          value={value.range}
          onChange={(e) => onChange({ ...value, range: e.target.value })}
          className="text-[12px] border border-[#E6E6EA] rounded px-2 py-1.5 bg-white"
        >
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function buildAvgTrace(
  sessions: ReturnType<typeof useStore.getState>["sessions"],
  roleId: string,
  range: string,
) {
  const scoped = sessions.filter((s) => s.roleTemplate.id === roleId);
  const list = scoped.length ? scoped : sessions;
  const n = list[0]?.sayDoTrace.length ?? 0;
  // slight seed based on range to shift trace
  const shift = range === "7d" ? 3 : range === "30d" ? 0 : -2;
  const trace: { t: number; v: number }[] = [];
  for (let i = 0; i < n; i++) {
    const did = list.reduce((a, s) => a + s.sayDoTrace[i].did, 0) / list.length;
    trace.push({ t: i, v: Math.max(30, Math.min(98, did + shift)) });
  }
  return trace;
}

function OverlayScope({
  traceA,
  traceB,
}: {
  traceA: { t: number; v: number }[];
  traceB: { t: number; v: number }[];
}) {
  const width = 1000;
  const h = 240;
  const padX = 24;
  const padY = 20;
  const iW = width - padX * 2;
  const iH = h - padY * 2;
  const n = Math.max(traceA.length, traceB.length);
  const xFor = (i: number) => padX + (i / (n - 1)) * iW;
  const yFor = (v: number) => padY + (1 - v / 100) * iH;
  const path = (t: { t: number; v: number }[]) =>
    t.map((p, i) => (i === 0 ? "M" : "L") + xFor(i) + " " + yFor(p.v)).join(" ");

  return (
    <div
      className="relative rounded-[10px] border border-[#232327] bg-[#0B0B0D] overflow-hidden"
      style={{ height: h }}
    >
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(to right,#EDEDEF 1px,transparent 1px),linear-gradient(to bottom,#EDEDEF 1px,transparent 1px)",
          backgroundSize: "40px 32px",
        }}
      />
      <svg viewBox={`0 0 ${width} ${h}`} preserveAspectRatio="none" className="w-full h-full">
        {[25, 50, 75].map((v) => (
          <line
            key={v}
            x1={padX}
            x2={width - padX}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke="#232327"
            strokeDasharray="3 5"
          />
        ))}
        <path d={path(traceA)} stroke="#2F5CFF" strokeWidth={2.25} fill="none" />
        <path d={path(traceB)} stroke="#17C964" strokeWidth={2.25} fill="none" />
      </svg>
      <div className="absolute top-2 left-3 flex gap-4 text-[10px] uppercase tracking-[0.14em] font-mono text-[#8B8B93]">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-[2px] bg-[#2F5CFF]" /> cohort A
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-[2px] bg-[#17C964]" /> cohort B
        </div>
      </div>
    </div>
  );
}

const FIELDS = {
  internal: [
    {
      label: "Composite score (0–100)",
      note: "Full numeric score with module breakdown",
      sensitive: false,
    },
    { label: "Say-Do consistency score", note: "Numeric + full trace", sensitive: false },
    {
      label: "Said/Did mismatch quotes",
      note: "Verbatim written responses vs. observed actions",
      sensitive: false,
    },
    { label: "Integrity flag detail", note: "Category, severity, timestamps", sensitive: true },
    { label: "Raw evidence links", note: "Video/screen capture references", sensitive: true },
    { label: "Reviewer notes & decision log", note: "Advance/Reject rationale", sensitive: true },
    { label: "AI vs. reviewer override history", note: "Where AI was overruled", sensitive: false },
    { label: "Per-module time breakdown", note: "vs. cohort baseline", sensitive: false },
  ],
  candidate: [
    {
      label: "Composite score band",
      note: "Descriptive band only (e.g. 'strong hire signal')",
      sensitive: false,
    },
    { label: "Strengths summary", note: "3–5 module-level positives", sensitive: false },
    {
      label: "Learning Hub recommendations",
      note: "Suggested next modules and topics",
      sensitive: false,
    },
    { label: "Effort recognition badge", note: "Completion acknowledgement", sensitive: false },
  ],
};
