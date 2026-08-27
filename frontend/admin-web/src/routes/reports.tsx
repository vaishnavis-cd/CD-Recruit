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

function SvgBarChart({ data }: { data: Array<{ band: string; count: number }> }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="w-full h-full flex flex-col justify-end pt-2 pb-1">
      <div className="flex-1 flex items-end justify-between gap-3 px-2">
        {data.map((item, idx) => {
          const heightPct = Math.max(12, Math.round((item.count / maxCount) * 100));
          return (
            <div key={item.band || idx} className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end">
              <span className="text-xs-plus font-mono font-bold text-ink-secondary group-hover:text-brand transition-colors">
                {item.count}
              </span>
              <div className="w-full bg-canvas rounded-t-lg overflow-hidden h-[140px] flex items-end">
                <div
                  className="w-full bg-brand hover:bg-brand-hover rounded-t transition-all duration-500 shadow-xs"
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="text-xs-plus font-medium text-ink-secondary truncate max-w-full mt-1">
                {item.band}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "Reports & Analytics — Proctora" },
      { name: "description", content: "Assessment performance metrics, integrity analytics, cohort comparison, and customizable report exports." },
    ],
  }),
});

function ReportsPage() {
  const sessions = useStore((s) => s.sessions) || [];
  const resultsList = useStore((s) => s.resultsList) || [];
  const fetchSessions = useStore((s) => s.fetchSessions);
  const roleTemplates = useStore((s) => s.roleTemplates) || [];
  const fetchRoleTemplates = useStore((s) => s.fetchRoleTemplates);
  const fetchResults = useStore((s) => s.fetchResults);

  const [activeTab, setActiveTab] = useState<"PERFORMANCE" | "INTEGRITY" | "EXPORTS">("PERFORMANCE");
  const [variant, setVariant] = useState<"internal" | "candidate">("internal");

  useEffect(() => {
    try {
      fetchSessions();
      fetchRoleTemplates();
      fetchResults();
    } catch (e) {
      console.warn("Failed to load initial data for reports:", e);
    }
  }, []);

  // Merge unique candidate sessions from resultsList and sessions
  const allSessions = useMemo(() => {
    const list = [...resultsList, ...sessions];
    const map = new Map<string, any>();
    list.forEach((item: any) => {
      const id = item.id || item.sessionId;
      if (id && !map.has(id)) {
        map.set(id, item);
      }
    });
    return Array.from(map.values());
  }, [resultsList, sessions]);

  // Compute Aggregate Metrics dynamically from real database records
  const totalAssessed = allSessions.length;

  const avgScore = useMemo(() => {
    if (!allSessions.length) return 0;
    const total = allSessions.reduce((acc, s: any) => {
      const raw = s.compositeScore ?? s.score?.compositeScore ?? 0;
      const scoreVal = raw <= 1.0 ? raw * 100 : raw;
      return acc + scoreVal;
    }, 0);
    return Math.round(total / allSessions.length);
  }, [allSessions]);

  const passRate = useMemo(() => {
    if (!allSessions.length) return 0;
    const passed = allSessions.filter((s: any) => {
      const decVal = s.decision ?? s.reviewerDecision ?? s.status ?? "";
      const dec = (typeof decVal === "string" ? decVal : String(decVal?.name || decVal?.decision || decVal?.status || decVal || "")).toUpperCase();
      const raw = s.compositeScore ?? s.score?.compositeScore ?? 0;
      const scoreVal = typeof raw === "number" ? raw : Number(raw) || 0;
      const val = scoreVal <= 1.0 ? scoreVal * 100 : scoreVal;
      return dec === "PASS" || dec === "ADVANCE" || dec === "REVIEWED" || val >= 70;
    }).length;
    return Math.round((passed / allSessions.length) * 100);
  }, [allSessions]);

  const avgConsistency = useMemo(() => {
    const validSessions = allSessions.filter((s: any) => {
      const raw = s.sayDoConsistencyScore ?? s.sayDoScore ?? s.score?.sayDoConsistencyScore;
      return raw !== null && raw !== undefined;
    });
    if (!validSessions.length) return 0;
    const total = validSessions.reduce((acc, s: any) => {
      const raw = s.sayDoConsistencyScore ?? s.sayDoScore ?? s.score?.sayDoConsistencyScore;
      const val = raw <= 1.0 ? raw * 100 : raw;
      return acc + val;
    }, 0);
    return Math.round(total / validSessions.length);
  }, [allSessions]);

  // Dynamic Module Performance Averages
  const moduleAverages = useMemo(() => {
    if (!allSessions.length) {
      return [
        { name: "Coding / DSA", icon: Code2, score: 0, color: "#5479ffff" },
        { name: "SQL Querying", icon: Database, score: 0, color: "#5479ffff" },
        { name: "MCQ Knowledge", icon: FileText, score: 0, color: "#577bffff" },
        { name: "AI Prompting", icon: Bot, score: 0, color: "#5479ffff" },
        { name: "Contextual Simulation", icon: Play, score: 0, color: "#5479ffff" },
        { name: "Debugging", icon: Bug, score: 0, color: "#5479ffff" },
      ];
    }

    const calcModuleAvg = (key: string): number | null => {
      let sum = 0;
      let count = 0;
      allSessions.forEach((s: any) => {
        const ms = s.moduleScores || s.scores || {};
        if (ms[key] !== undefined && ms[key] !== null) {
          const v = typeof ms[key] === "number" ? ms[key] : Number(ms[key]) || 0;
          sum += v <= 1.0 ? v * 100 : v;
          count++;
        }
      });
      return count > 0 ? Math.round(sum / count) : null;
    };

    return [
      { name: "Coding / DSA", icon: Code2, score: calcModuleAvg("CODING"), color: "#5479ffff" },
      { name: "SQL Querying", icon: Database, score: calcModuleAvg("SQL"), color: "#5479ffff" },
      { name: "MCQ Knowledge", icon: FileText, score: calcModuleAvg("MCQ"), color: "#577bffff" },
      { name: "AI Prompting", icon: Bot, score: calcModuleAvg("AI_PROMPTING"), color: "#5479ffff" },
      { name: "Contextual Simulation", icon: Play, score: calcModuleAvg("SIMULATION"), color: "#5479ffff" },
      { name: "Debugging", icon: Bug, score: calcModuleAvg("DEBUGGING"), color: "#5479ffff" },
    ];
  }, [allSessions]);

  // Score Band Distribution Data
  const scoreBandData = useMemo(() => {
    let count90 = 0, count75 = 0, count60 = 0, countLow = 0;
    allSessions.forEach((s: any) => {
      const raw = s.compositeScore ?? s.score?.compositeScore ?? 0;
      const val = raw <= 1.0 ? raw * 100 : raw;
      if (val >= 90) count90++;
      else if (val >= 75) count75++;
      else if (val >= 60) count60++;
      else countLow++;
    });

    return [
      { band: "90-100%", count: count90 },
      { band: "75-89%", count: count75 },
      { band: "60-74%", count: count60 },
      { band: "<60%", count: countLow },
    ];
  }, [allSessions]);

  // Dynamic Integrity & Risk Analytics
  const integrityAnalytics = useMemo(() => {
    let lowRiskCount = 0;
    let medRiskCount = 0;
    let highRiskCount = 0;

    let tabSwitchCount = 0;
    let gazeCount = 0;
    let faceMissingCount = 0;
    let objectCount = 0;
    let audioCount = 0;
    let multiFaceCount = 0;

    allSessions.forEach((s: any) => {
      const flags = s.proctoringFlags || s.integrityFlags || s.flags || [];
      const flagCount = flags.length;

      if (flagCount >= 4) highRiskCount++;
      else if (flagCount >= 2) medRiskCount++;
      else lowRiskCount++;

      flags.forEach((f: any) => {
        const type = (typeof f === "string" ? f : f.type || f.category || "").toUpperCase();
        if (type.includes("TAB") || type.includes("BROWSER") || type.includes("FOCUS")) tabSwitchCount++;
        else if (type.includes("GAZE") || type.includes("LOOK")) gazeCount++;
        else if (type.includes("MISSING") || type.includes("ABSENT")) faceMissingCount++;
        else if (type.includes("OBJECT") || type.includes("PHONE")) objectCount++;
        else if (type.includes("AUDIO") || type.includes("SPEECH") || type.includes("VOICE")) audioCount++;
        else if (type.includes("MULTI") || type.includes("PERSON") || type.includes("FACE")) multiFaceCount++;
      });
    });

    const total = allSessions.length || 1;
    return {
      lowPct: Math.round((lowRiskCount / total) * 100),
      medPct: Math.round((medRiskCount / total) * 100),
      highPct: Math.round((highRiskCount / total) * 100),
      violations: [
        { name: "Tab Switches & Focus Loss", category: "BROWSER_APP", count: tabSwitchCount, risk: "LOW", rate: `${Math.round((tabSwitchCount / total) * 100)}%` },
        { name: "Gaze Away & Head Movements", category: "VISUAL_GAZE", count: gazeCount, risk: "LOW", rate: `${Math.round((gazeCount / total) * 100)}%` },
        { name: "Face Missing from Camera", category: "FACE_SEAT", count: faceMissingCount, risk: "MEDIUM", rate: `${Math.round((faceMissingCount / total) * 100)}%` },
        { name: "Unauthorized Objects (Phone/Headphones/Book)", category: "UNAUTHORIZED_OBJECTS", count: objectCount, risk: "HIGH", rate: `${Math.round((objectCount / total) * 100)}%` },
        { name: "Audio & Voice Activity", category: "AUDIO_SPEECH", count: audioCount, risk: "MEDIUM", rate: `${Math.round((audioCount / total) * 100)}%` },
        { name: "Multiple Faces / Seat Exits", category: "MULTIPLE_PERSONS", count: multiFaceCount, risk: "HIGH", rate: `${Math.round((multiFaceCount / total) * 100)}%` },
      ],
    };
  }, [allSessions]);

  return (
    <AppShell
      title="Reports & Assessment Analytics"
      actions={
        <ExportDropdown
          data={allSessions}
          filenamePrefix="proctora-analytics-report"
          title="Proctora Assessment & Analytics Report"
        />
      }
    >
      <div className="max-w-[1200px] mx-auto pb-12 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-line space-x-6">
          <button
            onClick={() => setActiveTab("PERFORMANCE")}
            className={`pb-3 text-sm-minus font-semibold transition-colors relative flex items-center gap-2 cursor-pointer ${
              activeTab === "PERFORMANCE" ? "text-brand" : "text-ink-secondary hover:text-ink"
            }`}
          >
            <BarChart3 size={15} />
            <span>Performance &amp; Domain Metrics</span>
            {activeTab === "PERFORMANCE" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-md" />}
          </button>

          <button
            onClick={() => setActiveTab("INTEGRITY")}
            className={`pb-3 text-sm-minus font-semibold transition-colors relative flex items-center gap-2 cursor-pointer ${
              activeTab === "INTEGRITY" ? "text-brand" : "text-ink-secondary hover:text-ink"
            }`}
          >
            <ShieldAlert size={15} />
            <span>Integrity &amp; Risk Analytics</span>
            {activeTab === "INTEGRITY" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-md" />}
          </button>

          <button
            onClick={() => setActiveTab("EXPORTS")}
            className={`pb-3 text-sm-minus font-semibold transition-colors relative flex items-center gap-2 cursor-pointer ${
              activeTab === "EXPORTS" ? "text-brand" : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Settings2 size={15} />
            <span>Custom Export Configuration</span>
            {activeTab === "EXPORTS" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-md" />}
          </button>
        </div>

        {/* TAB 1: PERFORMANCE OVERVIEW & DOMAIN METRICS */}
        {activeTab === "PERFORMANCE" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Top 4 KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-white border border-line rounded-xl shadow-sm space-y-2">
                <div className="flex items-center justify-between text-ink-secondary">
                  <span className="text-xs-plus font-mono uppercase font-semibold">Total Assessed</span>
                  <Users size={16} className="text-brand" />
                </div>
                <div className="text-3xl font-bold text-ink font-mono">{totalAssessed}</div>
                <div className="text-xs-plus text-ink-secondary font-medium flex items-center gap-1">
                  <TrendingUp size={12} className="text-brand" /> Real database candidate sessions
                </div>
              </div>

              <div className="p-5 bg-white border border-line rounded-xl shadow-sm space-y-2">
                <div className="flex items-center justify-between text-ink-secondary">
                  <span className="text-xs-plus font-mono uppercase font-semibold">Avg Composite Score</span>
                  <Award size={16} className="text-brand" />
                </div>
                <div className="text-3xl font-bold text-ink font-mono">{avgScore}%</div>
                <div className="text-xs-plus text-ink-secondary">Across all technical modules</div>
              </div>

              <div className="p-5 bg-white border border-line rounded-xl shadow-sm space-y-2">
                <div className="flex items-center justify-between text-ink-secondary">
                  <span className="text-xs-plus font-mono uppercase font-semibold">Say-Do Consistency</span>
                  <Activity size={16} className="text-brand" />
                </div>
                <div className="text-3xl font-bold text-ink font-mono">{avgConsistency}%</div>
                <div className="text-xs-plus text-ink-secondary font-medium">Behavioral sync fidelity</div>
              </div>

              <div className="p-5 bg-white border border-line rounded-xl shadow-sm space-y-2">
                <div className="flex items-center justify-between text-ink-secondary">
                  <span className="text-xs-plus font-mono uppercase font-semibold">Overall Pass Rate</span>
                  <CheckCircle2 size={16} className="text-brand" />
                </div>
                <div className="text-3xl font-bold text-ink font-mono">{passRate}%</div>
                <div className="text-xs-plus text-ink-secondary">Approved for technical interview</div>
              </div>
            </div>

            {/* Per-Module Score Breakdown & Score Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Module Performance Bars */}
              <div className="lg:col-span-7 bg-white border border-line rounded-xl p-6 shadow-sm space-y-5">
                <div>
                  <h3 className="text-md font-semibold text-ink">Module Performance Averages</h3>
                  <p className="text-xs text-ink-tertiary">Mean scores across candidate module completions.</p>
                </div>

                <div className="space-y-4 text-sm-minus">
                  {moduleAverages.map((mod) => {
                    const Icon = mod.icon;
                    return (
                      <div key={mod.name} className="space-y-1.5">
                        <div className="flex items-center justify-between font-medium">
                          <div className="flex items-center gap-2 text-ink">
                            <Icon size={15} style={{ color: mod.color }} />
                            <span>{mod.name}</span>
                          </div>
                          <span className="font-mono font-semibold">
                            {mod.score !== null ? `${mod.score}%` : "—"}
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-canvas rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${mod.score ?? 0}%`, backgroundColor: mod.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Score Band Distribution */}
              <div className="lg:col-span-5 bg-white border border-line rounded-xl p-6 shadow-sm space-y-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-md font-semibold text-ink">Score Distribution Bands</h3>
                  <p className="text-xs text-ink-tertiary">Candidate distribution across composite score bands.</p>
                </div>

                <div className="w-full h-[220px]">
                  <SvgBarChart data={scoreBandData} />
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
                <div className="text-xs-plus font-mono font-semibold uppercase text-emerald-800">Low Risk Sessions</div>
                <div className="text-3xl font-bold text-emerald-900 font-mono">{integrityAnalytics.lowPct}%</div>
                <div className="text-xs text-emerald-700">0–1 minor integrity telemetry logs</div>
              </div>

              <div className="p-5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1">
                <div className="text-xs-plus font-mono font-semibold uppercase text-amber-800">Medium Risk Sessions</div>
                <div className="text-3xl font-bold text-amber-900 font-mono">{integrityAnalytics.medPct}%</div>
                <div className="text-xs text-amber-700">2–3 tab switches or gaze shifts</div>
              </div>

              <div className="p-5 bg-rose-50/60 border border-rose-200 rounded-xl space-y-1">
                <div className="text-xs-plus font-mono font-semibold uppercase text-rose-800">High Risk Sessions</div>
                <div className="text-3xl font-bold text-rose-900 font-mono">{integrityAnalytics.highPct}%</div>
                <div className="text-xs text-rose-700">Multiple face/object/speech flags</div>
              </div>
            </div>

            {/* Violation Breakdown Table */}
            <div className="bg-white border border-line rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="text-md font-semibold text-ink">Proctoring Flag &amp; Evidence Analytics</h3>
              <div className="divide-y divide-surface-inset border border-line rounded-lg overflow-hidden">
                {integrityAnalytics.violations.map((item) => (
                  <div key={item.name} className="p-4 bg-white flex items-center justify-between hover:bg-canvas transition-colors">
                    <div className="flex items-center gap-3">
                      <ShieldAlert size={16} className={item.risk === "HIGH" ? "text-rose-600" : item.risk === "MEDIUM" ? "text-amber-600" : "text-brand"} />
                      <div>
                        <div className="text-sm-minus font-semibold text-ink">{item.name}</div>
                        <div className="text-xs-plus text-ink-tertiary font-mono">Category Code: {item.category}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-sm-minus font-bold text-ink font-mono">{item.count} occurrences</div>
                        <div className="text-xs-plus text-ink-tertiary">{item.rate} of total sessions</div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded text-2xs font-mono uppercase font-bold ${
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

        {/* TAB 3: CUSTOM EXPORT CONFIGURATION */}
        {activeTab === "EXPORTS" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Export Configuration Card */}
            <div className="bg-white border border-line rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-inset pb-5">
                <div>
                  <div className="flex items-center gap-2 text-xs-plus font-bold uppercase tracking-wider text-ink-secondary mb-1">
                    <Settings2 size={14} /> Export Configuration &amp; Field Customizer
                  </div>
                  <div className="text-sm text-ink">
                    Configure data fields included in generated PDF, CSV, and JSON report payloads
                  </div>
                </div>
                
                {/* Segmented Control */}
                <div className="flex p-1 bg-canvas rounded-lg border border-line">
                  {(["internal", "candidate"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVariant(v)}
                      className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                        variant === v 
                          ? "bg-white shadow-sm text-ink border border-line/50 font-semibold" 
                          : "text-ink-secondary hover:text-ink"
                      }`}
                    >
                      {v === "internal" ? "Internal / Recruiter" : "Candidate-Facing"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FIELDS[variant].map((f: any) => (
                  <label
                    key={f.label}
                    className="group flex items-start gap-3 border border-line rounded-xl p-4 hover:border-brand hover:bg-brand-subtle/30 transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      defaultChecked
                      className="mt-1 w-4 h-4 text-brand rounded border-line focus:ring-brand"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm-minus font-semibold text-ink">{f.label}</div>
                        {f.sensitive ? (
                          <div className="flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-danger bg-rose-50 px-2 py-0.5 rounded">
                            <Lock size={10} /> Sensitive
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-brand bg-brand-subtle px-2 py-0.5 rounded">
                            <Eye size={10} /> Standard
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-ink-secondary">{f.note}</div>
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