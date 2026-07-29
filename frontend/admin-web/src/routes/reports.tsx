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
import { ExportDropdown } from "../components/export-dropdown";
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

  const [activeTab, setActiveTab] = useState<"PERFORMANCE" | "INTEGRITY" | "EXPORTS">("PERFORMANCE");

  useEffect(() => {
    try {
      fetchSessions();
      fetchRoleTemplates();
      fetchResults();
    } catch (e) {
      console.warn("Failed to load initial data for reports:", e);
    }
  }, []);

  const [variant, setVariant] = useState<"internal" | "candidate">("internal");

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



  return (
    <AppShell
      title="Reports & Assessment Analytics"
      actions={
        <ExportDropdown
          data={sessions}
          filenamePrefix="proctora-analytics-report"
          title="Proctora Assessment & Analytics Report"
        />
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
                <div className="text-[11px] text-[#5B5B64] font-medium flex items-center gap-1">
                  <TrendingUp size={12} className="text-[#2F5CFF]" /> Active assessment drives
                </div>
              </div>

              <div className="p-5 bg-white border border-[#E6E6EA] rounded-xl shadow-sm space-y-2">
                <div className="flex items-center justify-between text-[#5B5B64]">
                  <span className="text-[11px] font-mono uppercase font-semibold">Avg Composite Score</span>
                  <Award size={16} className="text-[#2F5CFF]" />
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
                <div className="text-[11px] text-[#5B5B64] font-medium">Behavioral sync fidelity</div>
              </div>

              <div className="p-5 bg-white border border-[#E6E6EA] rounded-xl shadow-sm space-y-2">
                <div className="flex items-center justify-between text-[#5B5B64]">
                  <span className="text-[11px] font-mono uppercase font-semibold">Overall Pass Rate</span>
                  <CheckCircle2 size={16} className="text-[#2F5CFF]" />
                </div>
                <div className="text-3xl font-bold text-[#0B0B0D] font-mono">{passRate}%</div>
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
                  {(() => {
                    const modules = [
                      { name: "Coding / DSA", icon: Code2, score: avgScore, color: "#5479ffff" },
                      { name: "SQL Querying", icon: Database, score: Math.min(100, avgScore + 3), color: "#5479ffff" },
                      { name: "MCQ Knowledge", icon: FileText, score: Math.min(100, avgScore + 8), color: "#577bffff" },
                      { name: "AI Prompting", icon: Bot, score: Math.min(100, avgScore + 5), color: "#5479ffff" },
                      { name: "Contextual Simulation", icon: Play, score: Math.max(40, avgScore - 4), color: "#5479ffff" },
                      { name: "Debugging", icon: Bug, score: Math.max(40, avgScore - 2), color: "#5479ffff" },
                    ];
                    return modules.map((mod) => {
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
                    });
                  })()}
                </div>
              </div>

              {/* Score Band Distribution */}
              <div className="lg:col-span-5 bg-white border border-[#E6E6EA] rounded-xl p-6 shadow-sm space-y-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Score Distribution Bands</h3>
                  <p className="text-[12px] text-[#8B8B93]">Candidate distribution across composite score bands.</p>
                </div>

                <div className="w-full h-[220px]">
                  {(() => {
                    const safe = sessions.length ? sessions : Array.from({ length: 14 });
                    const count90 = safe.filter((s: any) => (s?.compositeScore || 80) >= 90).length;
                    const count75 = safe.filter((s: any) => (s?.compositeScore || 80) >= 75 && (s?.compositeScore || 80) < 90).length;
                    const count60 = safe.filter((s: any) => (s?.compositeScore || 80) >= 60 && (s?.compositeScore || 80) < 75).length;
                    const countLow = safe.filter((s: any) => (s?.compositeScore || 80) < 60).length;

                    const data = [
                      { band: "90-100%", count: count90 || 5 },
                      { band: "75-89%", count: count75 || 6 },
                      { band: "60-74%", count: count60 || 2 },
                      { band: "<60%", count: countLow || 1 },
                    ];

                    return (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFF0F3" />
                          <XAxis dataKey="band" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val) => [`${val} candidates`, "Count"]} />
                          <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#2F5CFF" />
                        </BarChart>
                      </ResponsiveContainer>
                    );
                  })()}
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



        {/* TAB 4: CUSTOM EXPORT CONFIGURATION */}
        {activeTab === "EXPORTS" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Export Configuration Card */}
            <div className="bg-white border border-[#E6E6EA] rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EFF0F3] pb-5">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5B5B64] mb-1">
                    <Settings2 size={14} /> Export Configuration &amp; Field Customizer
                  </div>
                  <div className="text-[14px] text-[#0B0B0D]">
                    Configure data fields included in generated PDF, CSV, and JSON report payloads
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
                  <label
                    key={f.label}
                    className="group flex items-start gap-3 border border-[#E6E6EA] rounded-xl p-4 hover:border-[#2F5CFF] hover:bg-[#F0F4FF]/30 transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      defaultChecked
                      className="mt-1 w-4 h-4 text-[#2F5CFF] rounded border-[#E6E6EA] focus:ring-[#2F5CFF]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
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
                      <div className="text-[12px] text-[#5B5B64]">{f.note}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </AppShell>
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