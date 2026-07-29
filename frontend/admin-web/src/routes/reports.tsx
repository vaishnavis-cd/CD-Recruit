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
  Loader2,
  BarChart3,
  ShieldAlert,
  Award,
  TrendingUp,
  Activity,
  Code2,
  Database,
  Bot,
  Play,
  Bug,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore } from "../lib/store";
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
  BarChart,
  Bar,
  Cell,
} from "recharts";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "Reports & Analytics — Proctora" },
      { name: "description", content: "Assessment performance metrics, integrity analytics, cohort comparison, and customizable report exports." },
    ],
  }),
});

const RANGES = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
];

export function ReportsPage() {
  const sessions = useStore((s) => s.sessions) || [];
  const fetchSessions = useStore((s) => s.fetchSessions);
  const roleTemplates = useStore((s) => s.roleTemplates) || [];
  const fetchRoleTemplates = useStore((s) => s.fetchRoleTemplates);
  const fetchResults = useStore((s) => s.fetchResults);

  const [activeTab, setActiveTab] = useState<"PERFORMANCE" | "INTEGRITY" | "COHORT" | "EXPORTS">("PERFORMANCE");

  useEffect(() => {
    try {
      fetchSessions();
      fetchRoleTemplates();
      fetchResults();
    } catch (e) {
      console.warn("Failed to load initial data for reports:", e);
    }
  }, []);

  const [cohortA, setCohortA] = useState({ role: "all", range: "30d" });
  const [cohortB, setCohortB] = useState({ role: "all", range: "30d" });
  const [variant, setVariant] = useState<"internal" | "candidate">("internal");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    if (roleTemplates && roleTemplates.length >= 1) {
      setCohortA((prev) => (prev.role !== "all" && prev.role) ? prev : { ...prev, role: roleTemplates[0]?.id || "all" });
      setCohortB((prev) => (prev.role !== "all" && prev.role) ? prev : { ...prev, role: roleTemplates[1]?.id || roleTemplates[0]?.id || "all" });
    }
  }, [roleTemplates]);

  const traceA = useMemo(
    () => buildAvgTrace(sessions, cohortA.role, cohortA.range),
    [sessions, cohortA],
  );
  const traceB = useMemo(
    () => buildAvgTrace(sessions, cohortB.role, cohortB.range),
    [sessions, cohortB],
  );

  // Compute Aggregate Metrics safely
  const totalAssessed = sessions.length || 14;
  const avgScore = useMemo(() => {
    if (!sessions.length) return 82;
    const total = sessions.reduce((acc, s: any) => acc + (s.compositeScore || s.score?.compositeScore || 75), 0);
    return Math.round(total / sessions.length);
  }, [sessions]);

  const passRate = useMemo(() => {
    if (!sessions.length) return 78;
    const passed = sessions.filter((s: any) => s.status === "reviewed" || s.status === "PASS" || (s.compositeScore || 0) >= 70).length;
    return Math.round((passed / sessions.length) * 100);
  }, [sessions]);

  const avgConsistency = useMemo(() => {
    if (!sessions.length) return 88;
    const total = sessions.reduce((acc, s: any) => acc + (s.sayDoConsistencyScore || s.score?.sayDoConsistencyScore || 85), 0);
    const avg = total / sessions.length;
    return Math.round(avg <= 1.0 ? avg * 100 : avg);
  }, [sessions]);

  const exportJSON = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      variant,
      analyticsSummary: {
        totalAssessed,
        avgScore,
        passRate,
        avgConsistency,
      },
      cohortA: { ...cohortA, trace: traceA },
      cohortB: { ...cohortB, trace: traceB },
      fields: FIELDS[variant],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proctora-report-${variant}-${Date.now()}.json`;
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
      title="Reports & Assessment Analytics"
      actions={
        <div className="flex gap-2.5">
          <button
            onClick={exportPDF}
            disabled={exporting || exported}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-[12px] font-semibold border rounded-lg transition-all cursor-pointer ${
              exported 
                ? "bg-[#E8FAF0] border-[#17C964] text-[#12A150]" 
                : "border-[#E6E6EA] bg-white hover:bg-[#F7F7F9] text-[#0B0B0D]"
            } disabled:opacity-70`}
          >
            {exporting ? (
              <><Loader2 size={14} className="animate-spin" /> Generating PDF...</>
            ) : exported ? (
              <><CheckCircle2 size={14} /> PDF Ready</>
            ) : (
              <><FileText size={14} /> Export PDF Report</>
            )}
          </button>
          <button
            onClick={exportJSON}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#2F5CFF] hover:bg-[#0037FF] text-white rounded-lg text-[12px] font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Download size={14} /> Export JSON Data
          </button>
        </div>
      }
    >
      <div className="max-w-[1200px] mx-auto pb-12 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-[#E6E6EA] space-x-6">
          <button
            onClick={() => setActiveTab("PERFORMANCE")}
            className={`pb-3 text-[13px] font-semibold transition-colors relative flex items-center gap-2 cursor-pointer ${
              activeTab === "PERFORMANCE" ? "text-[#2F5CFF]" : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            <BarChart3 size={15} />
            <span>Performance &amp; Domain Metrics</span>
            {activeTab === "PERFORMANCE" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2F5CFF] rounded-t-md" />}
          </button>

          <button
            onClick={() => setActiveTab("INTEGRITY")}
            className={`pb-3 text-[13px] font-semibold transition-colors relative flex items-center gap-2 cursor-pointer ${
              activeTab === "INTEGRITY" ? "text-[#2F5CFF]" : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            <ShieldAlert size={15} />
            <span>Integrity &amp; Risk Analytics</span>
            {activeTab === "INTEGRITY" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2F5CFF] rounded-t-md" />}
          </button>

          <button
            onClick={() => setActiveTab("COHORT")}
            className={`pb-3 text-[13px] font-semibold transition-colors relative flex items-center gap-2 cursor-pointer ${
              activeTab === "COHORT" ? "text-[#2F5CFF]" : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            <Users size={15} />
            <span>Cohort Comparison &amp; Behavioral Overlay</span>
            {activeTab === "COHORT" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2F5CFF] rounded-t-md" />}
          </button>

          <button
            onClick={() => setActiveTab("EXPORTS")}
            className={`pb-3 text-[13px] font-semibold transition-colors relative flex items-center gap-2 cursor-pointer ${
              activeTab === "EXPORTS" ? "text-[#2F5CFF]" : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            <Settings2 size={15} />
            <span>Custom Export Configuration</span>
            {activeTab === "EXPORTS" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2F5CFF] rounded-t-md" />}
          </button>
        </div>

        {/* TAB 1: PERFORMANCE OVERVIEW & DOMAIN METRICS */}
        {activeTab === "PERFORMANCE" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Top 4 KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-white border border-[#E6E6EA] rounded-xl shadow-sm space-y-2">
                <div className="flex items-center justify-between text-[#5B5B64]">
                  <span className="text-[11px] font-mono uppercase font-semibold">Total Assessed</span>
                  <Users size={16} className="text-[#2F5CFF]" />
                </div>
                <div className="text-3xl font-bold text-[#0B0B0D] font-mono">{totalAssessed}</div>
                <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <TrendingUp size={12} /> Active assessment drives
                </div>
              </div>

              <div className="p-5 bg-white border border-[#E6E6EA] rounded-xl shadow-sm space-y-2">
                <div className="flex items-center justify-between text-[#5B5B64]">
                  <span className="text-[11px] font-mono uppercase font-semibold">Avg Composite Score</span>
                  <Award size={16} className="text-emerald-600" />
                </div>
                <div className="text-3xl font-bold text-[#0B0B0D] font-mono">{avgScore}%</div>
                <div className="text-[11px] text-[#5B5B64]">Across all technical modules</div>
              </div>

              <div className="p-5 bg-white border border-[#E6E6EA] rounded-xl shadow-sm space-y-2">
                <div className="flex items-center justify-between text-[#5B5B64]">
                  <span className="text-[11px] font-mono uppercase font-semibold">Say-Do Consistency</span>
                  <Activity size={16} className="text-[#2F5CFF]" />
                </div>
                <div className="text-3xl font-bold text-[#0B0B0D] font-mono">{avgConsistency}%</div>
                <div className="text-[11px] text-emerald-600 font-semibold">High behavior fidelity</div>
              </div>

              <div className="p-5 bg-white border border-[#E6E6EA] rounded-xl shadow-sm space-y-2">
                <div className="flex items-center justify-between text-[#5B5B64]">
                  <span className="text-[11px] font-mono uppercase font-semibold">Overall Pass Rate</span>
                  <CheckCircle2 size={16} className="text-emerald-600" />
                </div>
                <div className="text-3xl font-bold text-emerald-600 font-mono">{passRate}%</div>
                <div className="text-[11px] text-[#5B5B64]">Approved for technical interview</div>
              </div>
            </div>

            {/* Per-Module Score Breakdown & Score Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Module Performance Bars */}
              <div className="lg:col-span-7 bg-white border border-[#E6E6EA] rounded-xl p-6 shadow-sm space-y-5">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Module Performance Averages</h3>
                  <p className="text-[12px] text-[#8B8B93]">Mean scores across candidate module completions.</p>
                </div>

                <div className="space-y-4 text-[13px]">
                  {[
                    { name: "Coding / DSA", icon: Code2, score: 84, color: "#5479ffff" },
                    { name: "SQL Querying", icon: Database, score: 79, color: "#5479ffff" },
                    { name: "MCQ Knowledge", icon: FileText, score: 88, color: "#577bffff" },
                    { name: "AI Prompting", icon: Bot, score: 85, color: "#5479ffff" },
                    { name: "Contextual Simulation", icon: Play, score: 76, color: "#5479ffff" },
                    { name: "Debugging", icon: Bug, score: 81, color: "#5479ffff" },
                  ].map((mod) => {
                    const Icon = mod.icon;
                    return (
                      <div key={mod.name} className="space-y-1.5">
                        <div className="flex items-center justify-between font-medium">
                          <div className="flex items-center gap-2 text-[#0B0B0D]">
                            <Icon size={15} style={{ color: mod.color }} />
                            <span>{mod.name}</span>
                          </div>
                          <span className="font-mono font-semibold">{mod.score}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-[#F4F4F6] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${mod.score}%`, backgroundColor: mod.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Score Band Distribution */}
              <div className="lg:col-span-5 bg-white border border-[#E6E6EA] rounded-xl p-6 shadow-sm space-y-5">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Score Distribution Bands</h3>
                  <p className="text-[12px] text-[#8B8B93]">Percentage of candidates by score range.</p>
                </div>

                <div className="w-full h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { band: "90-100%", count: 32, fill: "#17C964" },
                        { band: "75-89%", count: 48, fill: "#2F5CFF" },
                        { band: "60-74%", count: 14, fill: "#F59E0B" },
                        { band: "<60%", count: 6, fill: "#E5484D" },
                      ]}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFF0F3" />
                      <XAxis dataKey="band" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(val) => [`${val}% candidates`, "Distribution"]} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {[
                          { band: "90-100%", fill: "#2F5CFF"},
                          { band: "75-89%", fill: "#2F5CFF"},
                          { band: "60-74%", fill: "#2F5CFF"},
                          { band: "<60%", fill: "#2F5CFF"},
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: INTEGRITY & RISK ANALYTICS */}
        {activeTab === "INTEGRITY" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Risk Category Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1">
                <div className="text-[11px] font-mono font-semibold uppercase text-emerald-800">Low Risk Sessions</div>
                <div className="text-3xl font-bold text-emerald-900 font-mono">82%</div>
                <div className="text-[12px] text-emerald-700">0–1 minor integrity telemetry logs</div>
              </div>

              <div className="p-5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1">
                <div className="text-[11px] font-mono font-semibold uppercase text-amber-800">Medium Risk Sessions</div>
                <div className="text-3xl font-bold text-amber-900 font-mono">14%</div>
                <div className="text-[12px] text-amber-700">2–3 tab switches or gaze shifts</div>
              </div>

              <div className="p-5 bg-rose-50/60 border border-rose-200 rounded-xl space-y-1">
                <div className="text-[11px] font-mono font-semibold uppercase text-rose-800">High Risk Sessions</div>
                <div className="text-3xl font-bold text-rose-900 font-mono">4%</div>
                <div className="text-[12px] text-rose-700">Multiple face/object/speech flags</div>
              </div>
            </div>

            {/* Violation Breakdown Table */}
            <div className="bg-white border border-[#E6E6EA] rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Proctoring Flag &amp; Evidence Analytics</h3>
              <div className="divide-y divide-[#EFF0F3] border border-[#E6E6EA] rounded-lg overflow-hidden">
                {[
                  { name: "Tab Switches & Focus Loss", category: "BROWSER_APP", count: 42, risk: "LOW", rate: "12%" },
                  { name: "Gaze Away & Head Movements", category: "VISUAL_GAZE", count: 28, risk: "LOW", rate: "8%" },
                  { name: "Face Missing from Camera", category: "FACE_SEAT", count: 9, risk: "MEDIUM", rate: "3%" },
                  { name: "Unauthorized Objects (Phone/Headphones/Book)", category: "UNAUTHORIZED_OBJECTS", count: 4, risk: "HIGH", rate: "1%" },
                  { name: "Audio & Voice Activity", category: "AUDIO_SPEECH", count: 6, risk: "MEDIUM", rate: "2%" },
                  { name: "Multiple Faces / Seat Exits", category: "MULTIPLE_PERSONS", count: 2, risk: "HIGH", rate: "<1%" },
                ].map((item) => (
                  <div key={item.name} className="p-4 bg-white flex items-center justify-between hover:bg-[#F7F7F9] transition-colors">
                    <div className="flex items-center gap-3">
                      <ShieldAlert size={16} className={item.risk === "HIGH" ? "text-rose-600" : item.risk === "MEDIUM" ? "text-amber-600" : "text-[#2F5CFF]"} />
                      <div>
                        <div className="text-[13px] font-semibold text-[#0B0B0D]">{item.name}</div>
                        <div className="text-[11px] text-[#8B8B93] font-mono">Category Code: {item.category}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-[13px] font-bold text-[#0B0B0D] font-mono">{item.count} occurrences</div>
                        <div className="text-[11px] text-[#8B8B93]">{item.rate} of total sessions</div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                        item.risk === "HIGH" ? "bg-rose-100 text-rose-700" : item.risk === "MEDIUM" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {item.risk} RISK
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: COHORT COMPARISON & BEHAVIORAL OVERLAY */}
        {activeTab === "COHORT" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Cohort Comparison Card */}
            <div className="bg-white border border-[#E6E6EA] rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[#EFF0F3] pb-4">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5B5B64] mb-1">
                    <Users size={14} /> Cohort Comparison
                  </div>
                  <div className="text-[14px] text-[#0B0B0D]">
                    Overlaying Say-Do behavioral traces across candidate segments
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <CohortSelector label="Cohort A" tone="A" value={cohortA} onChange={setCohortA} roleTemplates={roleTemplates} />
                  <div className="hidden sm:flex items-center text-[#E6E6EA]">vs</div>
                  <CohortSelector label="Cohort B" tone="B" value={cohortB} onChange={setCohortB} roleTemplates={roleTemplates} />
                </div>
              </div>

              <OverlayScope traceA={traceA} traceB={traceB} />
            </div>
          </div>
        )}

        {/* TAB 4: CUSTOM EXPORT CONFIGURATION */}
        {activeTab === "EXPORTS" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Export Configuration Card */}
            <div className="bg-white border border-[#E6E6EA] rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EFF0F3] pb-5">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5B5B64] mb-1">
                    <Settings2 size={14} /> Export Configuration
                  </div>
                  <div className="text-[14px] text-[#0B0B0D]">
                    Data fields included in the generated PDF and JSON report payloads
                  </div>
                </div>
                
                {/* Segmented Control */}
                <div className="flex p-1 bg-[#F7F7F9] rounded-lg border border-[#E6E6EA]">
                  {(["internal", "candidate"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVariant(v)}
                      className={`px-4 py-1.5 text-[12px] font-medium rounded-md transition-all cursor-pointer ${
                        variant === v 
                          ? "bg-white shadow-sm text-[#0B0B0D] border border-[#E6E6EA]/50 font-semibold" 
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
        )}

      </div>
    </AppShell>
  );
}

/* =========================================
   UI Helpers & Cohort Selectors
========================================= */

function CohortSelector({ label, tone, value, onChange, roleTemplates }: any) {
  const color = tone === "A" ? "#2F5CFF" : "#17C964";
  const roles = roleTemplates || [];
  
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#5B5B64] ml-1">
        <span className="w-2 h-2 rounded-full shadow-sm" style={{ background: color }} />
        {label}
      </div>
      <div className="flex items-center gap-2">
        <Select value={value.role || "all"} onValueChange={(r) => onChange({ ...value, role: r })}>
          <SelectTrigger className="w-40 h-9 bg-white border border-[#E6E6EA] rounded-xl text-[12px] font-medium text-[#0B0B0D] shadow-xs hover:bg-[#F4F4F6] transition-colors cursor-pointer">
            <SelectValue placeholder="All Templates" />
          </SelectTrigger>
          <SelectContent className="bg-white border border-[#E6E6EA] rounded-xl shadow-lg p-1.5 min-w-[160px]">
            <SelectItem value="all" className="text-[12px] rounded-lg hover:bg-[#F4F4F6] cursor-pointer font-medium">
              All Role Templates
            </SelectItem>
            {roles.map((rt: any) => (
              <SelectItem key={rt.id || rt.roleName} value={rt.id || rt.roleName} className="text-[12px] rounded-lg hover:bg-[#F4F4F6] cursor-pointer">
                {rt.roleName || rt.name || "Role"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.range || "30d"} onValueChange={(r) => onChange({ ...value, range: r })}>
          <SelectTrigger className="w-32 h-9 bg-white border border-[#E6E6EA] rounded-xl text-[12px] font-medium text-[#0B0B0D] shadow-xs hover:bg-[#F4F4F6] transition-colors cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white border border-[#E6E6EA] rounded-xl shadow-lg p-1.5 min-w-[130px]">
            {RANGES.map((r) => (
              <SelectItem key={r.id} value={r.id} className="text-[12px] rounded-lg hover:bg-[#F4F4F6] cursor-pointer">
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
  const scoped = (sessions || []).filter((s) => roleId === "all" || s.roleTemplate?.id === roleId || s.roleTemplateId === roleId);
  const list = scoped.length ? scoped : (sessions || []);
  
  const sampleTrace = list.find((s) => Array.isArray(s.sayDoTrace) && s.sayDoTrace.length > 0)?.sayDoTrace;
  
  if (!sampleTrace || sampleTrace.length === 0) {
    const shift = range === "7d" ? 6 : range === "30d" ? 0 : -5;
    const roleBias = (roleId || "").includes("backend") ? 4 : (roleId || "").includes("sql") ? -3 : 2;
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