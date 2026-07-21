import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { 
  Download, 
  FileText, 
  Users, 
  Settings2, 
  Lock, 
  Eye, 
  CheckCircle2, 
  Loader2 
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore } from "../lib/store";
import { ROLE_TEMPLATES } from "../lib/mock-data";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

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
  const fetchSessions = useStore((s) => s.fetchSessions);

  useEffect(() => {
    fetchSessions();
  }, []);

  const [cohortA, setCohortA] = useState({ role: ROLE_TEMPLATES[0].id, range: "30d" });
  const [cohortB, setCohortB] = useState({ role: ROLE_TEMPLATES[1].id, range: "30d" });
  const [variant, setVariant] = useState<"internal" | "candidate">("internal");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

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
    a.download = `report-${variant}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      setExported(true);
      setTimeout(() => setExported(false), 3000);
    }, 1500);
  };

  return (
    <AppShell
      title="Reports"
      actions={
        <div className="flex gap-3">
          <button
            onClick={exportPDF}
            disabled={exporting || exported}
            className={`inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium border rounded-lg transition-all ${
              exported 
                ? "bg-[#E8FAF0] border-[#17C964] text-[#12A150]" 
                : "border-[#E6E6EA] bg-white hover:bg-[#F7F7F9] text-[#0B0B0D]"
            } disabled:opacity-70`}
          >
            {exporting ? (
              <><Loader2 size={14} className="animate-spin" /> Preparing...</>
            ) : exported ? (
              <><CheckCircle2 size={14} /> Exported</>
            ) : (
              <><FileText size={14} /> Export PDF</>
            )}
          </button>
          <button
            onClick={exportJSON}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#2F5CFF] hover:bg-[#0037FF] text-white rounded-lg text-[13px] font-medium shadow-sm transition-colors cursor-pointer"
          >
            <Download size={14} /> Export JSON
          </button>
        </div>
      }
    >
      <div className="max-w-[1200px] mx-auto pb-12 space-y-6">
        
        {/* Cohort Comparison Card */}
        <div className="bg-white border border-[#E6E6EA] rounded-xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5B5B64] mb-1">
                <Users size={14} /> Cohort Comparison
              </div>
              <div className="text-[14px] text-[#0B0B0D]">
                Overlaying Say-Do behavioral traces across segments
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <CohortSelector label="Cohort A" tone="A" value={cohortA} onChange={setCohortA} />
              <div className="hidden sm:flex items-center text-[#E6E6EA]">vs</div>
              <CohortSelector label="Cohort B" tone="B" value={cohortB} onChange={setCohortB} />
            </div>
          </div>

          <OverlayScope traceA={traceA} traceB={traceB} />
        </div>

        {/* Export Configuration Card */}
        <div className="bg-white border border-[#E6E6EA] rounded-xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-[#EFF0F3] pb-5">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5B5B64] mb-1">
                <Settings2 size={14} /> Export Configuration
              </div>
              <div className="text-[14px] text-[#0B0B0D]">
                Data fields included in the generated payload
              </div>
            </div>
            
            {/* Segmented Control */}
            <div className="flex p-1 bg-[#F7F7F9] rounded-lg border border-[#E6E6EA]">
              {(["internal", "candidate"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVariant(v)}
                  className={`px-4 py-1.5 text-[12px] font-medium rounded-md transition-all ${
                    variant === v 
                      ? "bg-white shadow-sm text-[#0B0B0D] border border-[#E6E6EA]/50" 
                      : "text-[#5B5B64] hover:text-[#0B0B0D]"
                  }`}
                >
                  {v === "internal" ? "Internal / Recruiter" : "Candidate-Facing"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FIELDS[variant].map((f) => (
              <div
                key={f.label}
                className="group flex flex-col justify-center border border-[#E6E6EA] rounded-lg p-4 hover:border-[#DCE6FF] hover:bg-[#F0F4FF]/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="text-[13px] font-semibold text-[#0B0B0D]">{f.label}</div>
                  {f.sensitive ? (
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#E5484D] bg-[#FFF0F0] px-2 py-0.5 rounded">
                      <Lock size={10} /> Sensitive
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#2F5CFF] bg-[#F0F4FF] px-2 py-0.5 rounded">
                      <Eye size={10} /> Standard
                    </div>
                  )}
                </div>
                <div className="text-[12px] text-[#5B5B64] group-hover:text-[#4A4A53]">{f.note}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AppShell>
  );
}

/* =========================================
   UI Components & Data Views
========================================= */

function CohortSelector({ label, tone, value, onChange }: any) {
  const color = tone === "A" ? "#2F5CFF" : "#17C964";
  
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#5B5B64] ml-1">
        <span className="w-2 h-2 rounded-full shadow-sm" style={{ background: color }} />
        {label}
      </div>
      <div className="flex items-center gap-2">
        <Select value={value.role} onValueChange={(r) => onChange({ ...value, role: r })}>
          <SelectTrigger className="w-36 h-9 bg-white border border-[#E6E6EA] rounded-xl text-[12px] font-medium text-[#0B0B0D] shadow-xs hover:bg-[#F4F4F6] transition-colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white border border-[#E6E6EA] rounded-xl shadow-lg p-1.5 min-w-[150px]">
            {ROLE_TEMPLATES.map((rt) => (
              <SelectItem key={rt.id} value={rt.id} className="text-[12px] rounded-lg hover:bg-[#F4F4F6] focus:bg-[#F4F4F6] transition-colors cursor-pointer">
                {rt.roleName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.range} onValueChange={(r) => onChange({ ...value, range: r })}>
          <SelectTrigger className="w-32 h-9 bg-white border border-[#E6E6EA] rounded-xl text-[12px] font-medium text-[#0B0B0D] shadow-xs hover:bg-[#F4F4F6] transition-colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white border border-[#E6E6EA] rounded-xl shadow-lg p-1.5 min-w-[130px]">
            {RANGES.map((r) => (
              <SelectItem key={r.id} value={r.id} className="text-[12px] rounded-lg hover:bg-[#F4F4F6] focus:bg-[#F4F4F6] transition-colors cursor-pointer">
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function buildAvgTrace(sessions: any[], roleId: string, range: string) {
  const scoped = sessions.filter((s) => s.roleTemplate?.id === roleId || s.roleTemplateId === roleId);
  const list = scoped.length ? scoped : sessions;
  
  // Find valid trace sample
  const sampleTrace = list.find((s) => Array.isArray(s.sayDoTrace) && s.sayDoTrace.length > 0)?.sayDoTrace;
  
  // Fallback 41-point trace if no trace exists on session objects
  if (!sampleTrace || sampleTrace.length === 0) {
    const shift = range === "7d" ? 6 : range === "30d" ? 0 : -5;
    const roleBias = roleId.includes("backend") ? 4 : roleId.includes("sql") ? -3 : 2;
    return Array.from({ length: 41 }, (_, i) => ({
      t: i,
      v: Math.max(25, Math.min(95, 72 + Math.sin(i / 3.5) * 14 + shift + roleBias)),
    }));
  }

  const n = sampleTrace.length;
  const shift = range === "7d" ? 3 : range === "30d" ? 0 : -2;
  const trace: { t: number; v: number }[] = [];
  
  for (let i = 0; i < n; i++) {
    const totalDid = list.reduce((a, s) => {
      const val = s.sayDoTrace?.[i]?.did ?? s.sayDoTrace?.[i]?.v ?? 70;
      return a + val;
    }, 0);
    const avgDid = totalDid / (list.length || 1);
    trace.push({ t: i, v: Math.max(20, Math.min(98, avgDid + shift)) });
  }
  return trace;
}

function OverlayScope({ traceA, traceB }: { traceA: { t: number; v: number }[]; traceB: { t: number; v: number }[] }) {
  const chartData = useMemo(() => {
    const safeA = traceA && traceA.length > 0 ? traceA : Array.from({ length: 41 }, (_, i) => ({ t: i, v: 75 }));
    const safeB = traceB && traceB.length > 0 ? traceB : Array.from({ length: 41 }, (_, i) => ({ t: i, v: 65 }));
    const n = Math.max(safeA.length, safeB.length);
    return Array.from({ length: n }, (_, i) => ({
      t: i,
      cohortA: safeA[i]?.v ?? safeA[safeA.length - 1]?.v ?? 70,
      cohortB: safeB[i]?.v ?? safeB[safeB.length - 1]?.v ?? 60,
    }));
  }, [traceA, traceB]);

  return (
    <div className="relative rounded-xl border border-[#232327] bg-[#0B0B0D] p-5 shadow-inner overflow-hidden">
      {/* Scope Legend */}
      <div className="flex items-center justify-between mb-4 text-[10px] uppercase tracking-[0.15em] font-mono font-bold">
        <div className="flex gap-5">
          <div className="flex items-center gap-2 text-[#E6E6EA]">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#2F5CFF] shadow-[0_0_8px_rgba(47,92,255,0.6)]" /> Cohort A
          </div>
          <div className="flex items-center gap-2 text-[#E6E6EA]">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#17C964] shadow-[0_0_8px_rgba(23,201,100,0.6)]" /> Cohort B
          </div>
        </div>
      </div>

      <div className="w-full h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="glowA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2F5CFF" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#2F5CFF" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="glowB" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#17C964" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#17C964" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="4 6" stroke="#232327" vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis
              domain={[0, 100]}
              ticks={[25, 50, 75]}
              stroke="#5B5B64"
              fontSize={11}
              fontFamily="monospace"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181B",
                borderColor: "#27272A",
                borderRadius: "0.75rem",
                color: "#FFFFFF",
                fontSize: "12px",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
              }}
              formatter={(val: any, name: string) => [`${Math.round(val)}%`, name]}
              labelFormatter={(label) => `Point t=${label}`}
            />
            <Area
              type="monotone"
              dataKey="cohortA"
              name="Cohort A"
              stroke="#2F5CFF"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#glowA)"
            />
            <Area
              type="monotone"
              dataKey="cohortB"
              name="Cohort B"
              stroke="#17C964"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#glowB)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const FIELDS = {
  internal: [
    { label: "Composite score (0–100)", note: "Full numeric score with module breakdown", sensitive: false },
    { label: "Say-Do consistency score", note: "Numeric + full trace", sensitive: false },
    { label: "Said/Did mismatch quotes", note: "Verbatim written responses vs. observed actions", sensitive: false },
    { label: "Integrity flag detail", note: "Category, severity, timestamps", sensitive: true },
    { label: "Raw evidence links", note: "Video/screen capture references", sensitive: true },
    { label: "Reviewer notes & decision log", note: "Advance/Reject rationale", sensitive: true },
    { label: "AI vs. reviewer override history", note: "Where AI was overruled", sensitive: false },
    { label: "Per-module time breakdown", note: "vs. cohort baseline", sensitive: false },
  ],
  candidate: [
    { label: "Composite score band", note: "Descriptive band only (e.g. 'strong hire signal')", sensitive: false },
    { label: "Strengths summary", note: "3–5 module-level positives", sensitive: false },
    { label: "Learning Hub recommendations", note: "Suggested next modules and topics", sensitive: false },
    { label: "Effort recognition badge", note: "Completion acknowledgement", sensitive: false },
  ],
};