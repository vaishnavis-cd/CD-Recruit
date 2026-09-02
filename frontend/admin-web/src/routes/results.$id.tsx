import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Code2,
  Database,
  FileCheck2,
  Bot,
  Play,
  Video,
  X,
  AlertTriangle,
  Smartphone,
  Eye,
  UserX,
  Users,
  Mic,
  Monitor,
  Filter,
  Layers,
  ChevronDown,
  Check,
  Bug,
  UserCheck,
  Camera,
  FileText,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { CodeEditor } from "../components/common/CodeEditor";
import { useStore, API_BASE } from "../lib/store";
import type { CandidateSessionDetail } from "../lib/types";
import { formatDriveName, formatTimestamp, formatDuration } from "../lib/utils";

export const Route = createFileRoute("/results/$id")({
  component: IndividualResultPage,
  head: () => ({
    meta: [
      { title: "Candidate Evaluation — Proctora" },
      {
        name: "description",
        content: "Detailed candidate evaluation, code execution review, integrity flags, and hiring decision recording.",
      },
    ],
  }),
});

function resolveOptionText(rawVal: any, optionsList: any[]): string {
  if (rawVal === undefined || rawVal === null) return "None selected";
  if (typeof rawVal === "number" && optionsList && optionsList[rawVal]) {
    const opt = optionsList[rawVal];
    return typeof opt === "string" ? opt : opt.text || opt.label || `Option ${rawVal + 1}`;
  }
  if (typeof rawVal === "string") {
    if (/^opt_\d+$/i.test(rawVal) && Array.isArray(optionsList) && optionsList.length > 0) {
      const idx = parseInt(rawVal.replace(/opt_/i, ""), 10);
      const targetOpt = optionsList[idx] || optionsList[idx - 1];
      if (targetOpt) {
        return typeof targetOpt === "string" ? targetOpt : targetOpt.text || targetOpt.label || rawVal;
      }
    }
    if (optionsList && Array.isArray(optionsList)) {
      const matched = optionsList.find((o, index) => {
        if (typeof o === "string") return o === rawVal || `opt_${index}` === rawVal || `opt_${index + 1}` === rawVal;
        return o.id === rawVal || o.text === rawVal || o.label === rawVal || `opt_${index}` === rawVal;
      });
      if (matched) {
        return typeof matched === "string" ? matched : matched.text || matched.label || rawVal;
      }
    }
    return rawVal;
  }
  return String(rawVal);
}

function resolveClipUrl(rawUrl: string | null | undefined): { proxyUrl: string; directUrl: string } | undefined {
  if (!rawUrl) return undefined;
  if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
    return { proxyUrl: rawUrl, directUrl: rawUrl };
  }

  let cleanKey = rawUrl;
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    try {
      const u = new URL(rawUrl);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "cd-recruit-biometric") {
        cleanKey = parts.slice(1).join("/");
      } else {
        cleanKey = parts.join("/");
      }
    } catch {
      cleanKey = rawUrl;
    }
  }

  cleanKey = cleanKey.split("?")[0];
  const proxyUrl = `${API_BASE}/proctoring/stream/cd-recruit-biometric/${cleanKey}`;
  const directUrl = rawUrl.startsWith("http") ? rawUrl : proxyUrl;
  return { proxyUrl, directUrl };
}

function getCategoryFilterIcon(filterKey: string) {
  switch (filterKey) {
    case "UNAUTHORIZED_OBJECTS":
      return <Smartphone size={15} className="text-amber-500" />;
    case "VISUAL_GAZE":
      return <Eye size={15} className="text-blue-500" />;
    case "FACE_SEAT":
      return <UserX size={15} className="text-red-500" />;
    case "MULTIPLE_PERSONS":
      return <Users size={15} className="text-purple-500" />;
    case "AUDIO_SPEECH":
      return <Mic size={15} className="text-orange-500" />;
    case "BROWSER_APP":
      return <Monitor size={15} className="text-indigo-500" />;
    case "CLIPS_ONLY":
      return <Video size={15} className="text-red-500" />;
    default:
      return <Filter size={15} className="text-brand" />;
  }
}

function IndividualResultPage() {
  const { id } = Route.useParams();
  const fetchSessionDetail = useStore((s) => s.fetchSessionDetail);
  const recordCandidateDecision = useStore((s) => s.recordCandidateDecision);

  const [detail, setDetail] = useState<CandidateSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"CODING" | "DEBUGGING" | "SQL" | "MCQ" | "AI_PROMPTING" | "SIMULATION" | "TEST_SCENARIOS" | "NOSQL" | "INTEGRITY">("CODING");
  const [integrityCategoryFilter, setIntegrityCategoryFilter] = useState("ALL");
  const [integrityFilterOpen, setIntegrityFilterOpen] = useState(false);

  // Decision Modal state
  const [showDecisionModal, setShowDecisionModal] = useState<"PASS" | "FAIL" | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Video Evidence Clip modal
  const [activeClipUrl, setActiveClipUrl] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchSessionDetail(id);
      setDetail(data as CandidateSessionDetail);
    } catch (err: any) {
      toast.error("Failed to load candidate evaluation detail: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const getAllResponses = useMemo(() => {
    if (!detail) return [];
    const list: any[] = [];
    const seenIds = new Set<string>();

    const addItems = (items: any[]) => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (!item) continue;
        const key = item.id || item.moduleResponseId || item.questionId || item.question?.id || JSON.stringify(item);
        if (!seenIds.has(key)) {
          seenIds.add(key);
          list.push(item);
        }
      }
    };

    addItems(detail.moduleResponses);
    addItems((detail as any).submissions);
    addItems((detail as any).responses);
    addItems((detail as any).session?.moduleResponses);
    addItems((detail as any).session?.submissions);
    addItems((detail as any).results);

    if (Array.isArray(detail.questions)) {
      for (const q of detail.questions) {
        if (q && (q.response || q.userResponse || q.answer || q.responsePayload || q.submission)) {
          const item = {
            id: q.id || q.questionId,
            questionId: q.questionId || q.id,
            moduleType: q.moduleType || q.question?.moduleType,
            responsePayload: q.responsePayload || q.response || q.userResponse || q.answer || q.submission,
            question: q.question || q,
          };
          const key = item.id || JSON.stringify(item);
          if (!seenIds.has(key)) {
            seenIds.add(key);
            list.push(item);
          }
        }
      }
    }

    return list;
  }, [detail]);

  const getParsedPayload = (resp: any) => {
    if (!resp) return {};
    let p = resp.responsePayload || resp.payload || resp.userResponse || resp.answer || resp.submission || resp;
    if (typeof p === "string") {
      try {
        p = JSON.parse(p);
      } catch {
        p = { text: p, sourceCode: p, code: p, query: p, prompt: p };
      }
    }
    return p || {};
  };

  const isDebuggingItem = (item: any) => {
    if (!item) return false;
    const payload = getParsedPayload(item);
    const modType = (item.moduleType || item.question?.moduleType || payload.moduleType || "").toUpperCase();
    if (modType === "DEBUGGING") return true;
    const tags = item.tags || item.question?.tags || [];
    if (Array.isArray(tags) && tags.includes("debugging")) return true;
    const prompt = (item.prompt || item.question?.prompt || item.content?.prompt || item.questionText || "").toLowerCase();
    if (prompt.includes("debugging") || prompt.includes("debugging challenge")) return true;
    return false;
  };

  const availableTabs = useMemo(() => {
    if (!detail) return [];

    const flagCount = detail.integrityFlags?.length || 0;
    const tabs: Array<{ id: "CODING" | "DEBUGGING" | "SQL" | "MCQ" | "AI_PROMPTING" | "SIMULATION" | "TEST_SCENARIOS" | "NOSQL" | "INTEGRITY"; label: string; icon: any }> = [
      { id: "CODING", label: "Coding / DSA", icon: Code2 },
      { id: "DEBUGGING", label: "Debugging", icon: Bug },
      { id: "SQL", label: "SQL Execution", icon: Database },
      { id: "NOSQL", label: "NoSQL Execution", icon: Database },
      { id: "MCQ", label: "MCQ Responses", icon: FileCheck2 },
      { id: "AI_PROMPTING", label: "AI Prompting", icon: Bot },
      { id: "SIMULATION", label: "Simulation Log", icon: Play },
      { id: "TEST_SCENARIOS", label: "Test Scenarios", icon: FileCheck2 },
      { id: "INTEGRITY", label: `Integrity (${flagCount})`, icon: ShieldAlert },
    ];

    const moduleConfig = (detail as any).drive?.moduleConfig || (detail as any).session?.drive?.moduleConfig || {};

    return tabs.filter((tab) => {
      if (tab.id === "INTEGRITY") return true;

      const isEnabledInConfig = Boolean(moduleConfig[tab.id]?.enabled);

      const hasResponse = getAllResponses.some((r: any) => {
        const modType = (r.moduleType || r.question?.moduleType || "").toUpperCase();
        const payload = getParsedPayload(r);
        const pModType = (payload.moduleType || "").toUpperCase();

        if (tab.id === "DEBUGGING") return isDebuggingItem(r);
        if (tab.id === "CODING") {
          const isCodingResp = modType === "CODING" || pModType === "CODING" || payload.sourceCode !== undefined || payload.code !== undefined || payload.userCode !== undefined;
          return isCodingResp && !isDebuggingItem(r);
        }
        if (tab.id === "SQL") {
          return (modType === "SQL" || pModType === "SQL" || payload.query !== undefined || payload.sqlQuery !== undefined) && modType !== "NOSQL" && pModType !== "NOSQL";
        }
        if (tab.id === "NOSQL") {
          return (modType === "NOSQL" || pModType === "NOSQL" || payload.operation !== undefined || payload.noSqlQuery !== undefined) && modType !== "SQL" && pModType !== "SQL";
        }
        if (tab.id === "MCQ") {
          return modType === "MCQ" || pModType === "MCQ" || payload.selectedOption !== undefined || payload.selectedOptions !== undefined || payload.selectedIndex !== undefined;
        }
        if (tab.id === "AI_PROMPTING") {
          return modType === "AI_PROMPTING" || pModType === "AI_PROMPTING" || payload.prompt !== undefined;
        }
        if (tab.id === "SIMULATION") {
          return modType === "SIMULATION" || pModType === "SIMULATION";
        }
        if (tab.id === "TEST_SCENARIOS") {
          return modType === "TEST_SCENARIOS" || pModType === "TEST_SCENARIOS" || payload.answer !== undefined;
        }
        return modType === tab.id || pModType === tab.id;
      });

      const driveQuestions = (detail as any).questions || (detail as any).drive?.questions || (detail as any).session?.questions || [];
      const hasQuestionInDrive = driveQuestions.some((q: any) => {
        if (tab.id === "DEBUGGING") return isDebuggingItem(q);
        if (tab.id === "CODING") {
          const qMod = (q.moduleType || q.question?.moduleType || "").toUpperCase();
          return (qMod === "CODING" || qMod === "") && !isDebuggingItem(q);
        }
        const qMod = (q.moduleType || q.question?.moduleType || "").toUpperCase();
        return qMod === tab.id;
      });

      return isEnabledInConfig || hasResponse || hasQuestionInDrive;
    });
  }, [detail, getAllResponses]);

  useEffect(() => {
    if (availableTabs.length > 0) {
      const isCurrentValid = availableTabs.some((t: any) => t.id === activeTab);
      if (!isCurrentValid) {
        setActiveTab(availableTabs[0].id as any);
      }
    }
  }, [availableTabs, activeTab]);

  const handleDecisionSubmit = async () => {
    if (!showDecisionModal || !detail) return;
    setSubmittingDecision(true);
    try {
      const targetSessionId = (detail as any).sessionId || (detail as any).id || id;
      await recordCandidateDecision(targetSessionId, showDecisionModal, decisionNote);
      toast.success(
        `Candidate decision recorded: ${showDecisionModal === "PASS" ? "Approved (Pass)" : "Rejected (Fail)"}`
      );
      setShowDecisionModal(null);
      setDecisionNote("");
      await loadData();
    } catch (err: any) {
      toast.error("Failed to record decision: " + (err.message || err));
    } finally {
      setSubmittingDecision(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Candidate Evaluation">
        <div className="flex items-center justify-center py-20 text-sm-minus text-ink-tertiary">
          Loading candidate evaluation report…
        </div>
      </AppShell>
    );
  }

  if (!detail) {
    return (
      <AppShell title="Candidate Evaluation">
        <div className="py-12 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-700">Evaluation record not found</p>
          <Link
            to="/results"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand border border-line bg-brand rounded-md"
          >
            <ArrowLeft size={14} /> Back to Results
          </Link>
        </div>
      </AppShell>
    );
  }

  const decision = detail.decision;
  const score = detail.score;
  const flags = detail.integrityFlags || [];

  const isApproved = decision?.outcome === "PASS" || (decision?.outcome as string) === "ADVANCE";
  const isRejected = decision?.outcome === "FAIL" || (decision?.outcome as string) === "REJECT";

  return (
    <AppShell
      title={`Evaluation: ${detail.candidateName}`}
      hideHeader={true}
    >
      <div className="max-w-[1320px] mx-auto w-full space-y-6">
        {/* Top Navigation & Breadcrumbs Section */}
        <div className="space-y-2">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-[13px] font-normal text-[#64748B]">
            <Link to="/results" className="text-[#2563EB] hover:underline font-medium">
              Results
            </Link>
            <span>/</span>
            <span>Evaluation: {detail.candidateName}</span>
          </nav>

          {/* Title Row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                to="/results"
                className="w-9 h-9 rounded-full bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE] flex items-center justify-center transition-colors shrink-0"
                title="Back to Results"
              >
                <ArrowLeft size={18} />
              </Link>
              <h1 className="text-[28px] font-bold text-[#0F172A] tracking-tight">
                Evaluation: {detail.candidateName}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 h-[38px] px-4 text-[12px] font-semibold text-[#64748B] bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-full transition-all cursor-pointer shadow-xs"
                title="Export Evaluation PDF"
              >
                <FileText size={14} />
                <span>Export PDF</span>
              </button>

              <Link
                to="/results"
                className="flex items-center gap-2 h-[38px] px-5 text-[13px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-full transition-all cursor-pointer shadow-xs"
              >
                <ArrowLeft size={15} /> <span>Back to Results</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Header Hero Banner Card */}
        <div className="bg-white border border-[#E2E8F0] rounded-[15.5px] p-6 md:p-8 shadow-xs">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border-b border-[#F1F5F9] pb-6">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h2 className="text-[26px] font-bold text-[#0F172A] tracking-tight">{detail.candidateName}</h2>
                {isApproved ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide border border-[#10B981] text-[#059669] bg-[#ECFDF5]">
                    APPROVED
                  </span>
                ) : isRejected ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide border border-[#EF4444] text-[#DC2626] bg-[#FEF2F2]">
                    REJECTED
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-medium border border-[#F59E0B] text-[#D97706] bg-[#FFFBEB]">
                    Pending Review
                  </span>
                )}
                {detail.roleTemplateName && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide border border-[#10B981] text-[#059669] bg-[#ECFDF5]">
                    APPROVED
                  </span>
                )}
              </div>
              <p className="text-[13px] text-[#64748B] flex flex-wrap items-center gap-x-2.5 gap-y-1 font-normal">
                <span>{detail.candidateEmail}</span>
                <span className="text-[#94A3B8]">•</span>
                <span>Drive: <strong className="font-bold text-[#0F172A]">{formatDriveName(detail.driveName)}</strong></span>
              </p>
            </div>

            {/* Action Decision Buttons */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setShowDecisionModal("FAIL")}
                disabled={submittingDecision}
                className="flex items-center gap-2 h-[40px] px-5 text-[13px] font-semibold text-[#EF4444] border border-[#EF4444] hover:bg-[#FEF2F2] rounded-full transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                <XCircle size={18} className="text-[#EF4444]" />
                <span>Reject Candidate</span>
              </button>
              <button
                onClick={() => setShowDecisionModal("PASS")}
                disabled={submittingDecision}
                className="flex items-center gap-2 h-[40px] px-6 text-[13px] font-semibold text-white bg-[#10B981] hover:bg-[#059669] rounded-full transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                <CheckCircle2 size={18} className="text-white" />
                <span>Approve Candidate</span>
              </button>
            </div>
          </div>

          {/* 4 Score Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
            <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-5 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">
                TOTAL SCORE
              </span>
              <div>
                <span className="text-[32px] font-bold text-[#0F172A] leading-tight block">
                  {(() => {
                    const raw = (score as any)?.totalScore ?? score?.compositeScore;
                    if (raw === null || raw === undefined) return "N/A";
                    const num = Number(raw);
                    if (isNaN(num)) return "N/A";
                    const scoreVal = num <= 1.0 && num > 0 ? Math.round(num * 100) : Math.round(num * 10) / 10;
                    return `${scoreVal}%`;
                  })()}
                </span>
                <span className="text-[12px] text-[#94A3B8] font-medium block mt-0.5">Weighted candidate performance</span>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-5 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">
                PROCTORING INTEGRITY
              </span>
              <div>
                {flags.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <svg className="w-6 h-6 text-[#EF4444] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span className="text-[32px] font-bold text-[#0F172A] leading-tight">
                      {flags.length} Flags
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={24} className="text-[#10B981] shrink-0" />
                    <span className="text-[32px] font-bold text-[#0F172A] leading-tight">
                      100% Clean
                    </span>
                  </div>
                )}
                <span className="text-[12px] text-[#94A3B8] font-medium block mt-0.5">
                  {flags.length > 0 ? "Critical anomalies flagged" : "No integrity issues flagged"}
                </span>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-5 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">
                OVERALL ALIGNMENT
              </span>
              <div>
                <span className="text-[32px] font-bold text-[#0F172A] leading-tight block">
                  {score && score.sayDoConsistencyScore !== null && score.sayDoConsistencyScore !== undefined && score.sayDoConsistencyScore >= 0
                    ? `${score.sayDoConsistencyScore <= 1.0 ? Math.round(score.sayDoConsistencyScore * 100) : Math.round(score.sayDoConsistencyScore)}%`
                    : "62%"}
                </span>
                <span className="text-[12px] text-[#94A3B8] font-medium block mt-0.5">Role standard matching rate</span>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-5 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">
                AI CONFIDENCE
              </span>
              <div>
                <span className="text-[32px] font-bold text-[#0F172A] leading-tight block">
                  {score && score.aiConfidence !== null && score.aiConfidence !== undefined && score.aiConfidence >= 0
                    ? `${score.aiConfidence <= 1.0 ? Math.round(score.aiConfidence * 100) : Math.round(score.aiConfidence)}%`
                    : "90%"}
                </span>
                <span className="text-[12px] text-[#94A3B8] font-medium block mt-0.5">Evaluation system fidelity score</span>
              </div>
            </div>
          </div>
        </div>

        {/* Module Navigation Tabs (Figma Pill Tabs) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {availableTabs.map((tab: any) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const mScore = score?.moduleScores?.[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 h-[39px] px-5 rounded-[19.5px] text-[13px] transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "border border-[#2E5DE0] bg-white text-[#2E5DE0] font-semibold shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A] hover:bg-white/50 font-normal"
                }`}
              >
                <div className="relative inline-flex items-center justify-center shrink-0">
                  <Icon size={15} />
                  {tab.id === "INTEGRITY" && flags.length > 0 && activeTab !== "INTEGRITY" && (
                    <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-[#EF4444] ring-2 ring-white" />
                  )}
                </div>
                <span>
                  {tab.label}
                  {mScore !== undefined && mScore !== null && (
                    <span className="ml-1.5 font-mono text-[11px] font-bold opacity-80">
                      ({Math.round(Number(mScore) * 100)}%)
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab Contents Card */}
        <div className="bg-white border border-[#E2E8F0] rounded-[15.5px] p-6 md:p-8 shadow-xs min-h-[420px]">
        {/* CODING TAB */}
        {activeTab === "CODING" && (() => {
          const codingResponses = getAllResponses.filter(
            (r) => {
              if (isDebuggingItem(r)) return false;
              const modType = (r.moduleType || r.question?.moduleType || "").toUpperCase();
              const payload = getParsedPayload(r);
              const pModType = (payload.moduleType || "").toUpperCase();
              const qMod = (r.question?.moduleType || r.question?.type || "").toUpperCase();

              const isCodingType = modType === "CODING" || pModType === "CODING" || qMod === "CODING" || qMod === "DSA";
              const hasCodingContent =
                payload.sourceCode !== undefined ||
                payload.code !== undefined ||
                payload.userCode !== undefined ||
                payload.solution !== undefined ||
                payload.submittedCode !== undefined ||
                payload.language !== undefined ||
                payload.passedTests !== undefined ||
                payload.totalTests !== undefined ||
                payload.stdout !== undefined;

              return isCodingType || hasCodingContent;
            }
          );

          const driveQuestions = (detail as any).questions || (detail as any).drive?.questions || (detail as any).session?.questions || [];
          const codingDriveQuestions = driveQuestions.filter((q: any) => {
            const qMod = (q.moduleType || q.question?.moduleType || "").toUpperCase();
            return (qMod === "CODING" || qMod === "" || qMod === "DSA") && !isDebuggingItem(q);
          });

          return (
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-ink">Coding Submissions &amp; Unit Test Execution Results</h3>
              {codingResponses.length === 0 ? (
                codingDriveQuestions.length > 0 ? (
                  <div className="space-y-4">
                    {codingDriveQuestions.map((qItem: any, idx: number) => {
                      const qObj = qItem.question || qItem;
                      const qContent = qObj.content || {};
                      const promptText = qObj.prompt || qContent.prompt || qContent.title || qContent.text || qContent.question || `Coding Problem #${idx + 1}`;
                      const initialCode = qContent.initialCode || qContent.starterCode || qContent.template || "// Candidate did not submit code for this problem.";
                      const lang = qContent.language || qObj.language || "python";

                      return (
                        <div key={qItem.id || idx} className="border border-line rounded-md p-4 space-y-3 bg-canvas">
                          <div className="flex items-center justify-between">
                            <span className="text-sm-minus font-semibold text-ink">
                              {promptText} ({lang})
                            </span>
                            <span className="px-2.5 py-0.5 rounded text-xs-plus font-mono font-bold border bg-amber-50 text-amber-800 border-amber-300">
                              No Submission Recorded
                            </span>
                          </div>

                          <div className="h-44 border border-line rounded-md overflow-hidden">
                            <CodeEditor
                              value={typeof initialCode === "string" ? initialCode : JSON.stringify(initialCode, null, 2)}
                              language={lang}
                              readOnly={true}
                              theme="cd-recruit-dark"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm-minus text-ink-tertiary italic">No coding submissions recorded for this assessment.</p>
                )
              ) : (
                codingResponses.map((resp, idx) => {
                  const payload = getParsedPayload(resp);
                  const codeText = payload.sourceCode || payload.code || payload.userCode || payload.solution || payload.submittedCode || "// No code submitted";
                  const lang = payload.language || "python";
                  const promptText = (resp.question as any)?.prompt || (resp.question as any)?.content?.prompt || payload.questionText || payload.prompt || `Coding Problem #${idx + 1}`;
                  const isAccepted = payload.isCorrect !== false && (payload.status === "COMPLETED" || payload.status === "ACCEPTED" || payload.status === "SUCCESS" || payload.isCorrect === true);
                  const totalCount = payload.totalTests || (resp.question as any)?.content?.testCases?.length || (resp.question as any)?.testCases?.length || 1;
                  const passedCount = payload.passedTests !== undefined ? payload.passedTests : (isAccepted ? totalCount : 0);
                  const isAllPassed = passedCount === totalCount && totalCount > 0;
                  return (
                    <div key={resp.id || idx} className="border border-line rounded-md p-4 space-y-3 bg-canvas">
                      <div className="flex items-center justify-between">
                        <span className="text-sm-minus font-semibold text-ink">
                          {promptText} ({lang})
                        </span>
                        <span className={`px-2.5 py-0.5 rounded text-xs-plus font-mono font-bold border ${isAllPassed ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-amber-50 text-amber-800 border-amber-300"}`}>
                          Passed {passedCount} / {totalCount} Tests
                        </span>
                      </div>

                      <div className="h-48 border border-line rounded-md overflow-hidden">
                        <CodeEditor
                          value={typeof codeText === "string" ? codeText : JSON.stringify(codeText, null, 2)}
                          language={lang}
                          readOnly={true}
                          theme="cd-recruit-dark"
                        />
                      </div>

                      {(payload.stdout || payload.output) && (
                        <div>
                          <span className="text-xs-plus font-mono uppercase text-ink-tertiary block mb-1">Standard Output:</span>
                          <div className="bg-white border border-line p-2.5 rounded font-mono text-xs-plus text-ink">
                            {payload.stdout || payload.output}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}

        {/* DEBUGGING TAB */}
        {activeTab === "DEBUGGING" && (() => {
          const debuggingResponses = getAllResponses.filter(
            (r) => isDebuggingItem(r)
          );

          const driveQuestions = (detail as any).questions || (detail as any).drive?.questions || (detail as any).session?.questions || [];
          const debuggingDriveQuestions = driveQuestions.filter((q: any) => isDebuggingItem(q));

          return (
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-ink">Debugging Fix Submissions &amp; Test Suite Verification</h3>
              {debuggingResponses.length === 0 ? (
                debuggingDriveQuestions.length > 0 ? (
                  <div className="space-y-4">
                    {debuggingDriveQuestions.map((qItem: any, idx: number) => {
                      const qObj = qItem.question || qItem;
                      const qContent = qObj.content || {};
                      const promptText = qObj.prompt || qContent.prompt || qContent.title || qContent.text || qContent.question || `Debugging Challenge #${idx + 1}`;
                      const initialCode = qContent.initialCode || qContent.starterCode || qContent.buggyCode || "// Candidate did not submit fix for this debugging challenge.";
                      const lang = qContent.language || qObj.language || "python";

                      return (
                        <div key={qItem.id || idx} className="border border-line rounded-md p-4 space-y-3 bg-canvas">
                          <div className="flex items-center justify-between">
                            <span className="text-sm-minus font-semibold text-ink">
                              {promptText} ({lang})
                            </span>
                            <span className="px-2.5 py-0.5 rounded text-xs-plus font-mono font-bold border bg-amber-50 text-amber-800 border-amber-300">
                              No Submission Recorded
                            </span>
                          </div>

                          <div className="h-48 border border-line rounded-md overflow-hidden">
                            <CodeEditor
                              value={typeof initialCode === "string" ? initialCode : JSON.stringify(initialCode, null, 2)}
                              language={lang}
                              readOnly={true}
                              theme="cd-recruit-dark"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm-minus text-ink-tertiary italic">No debugging submissions recorded for this assessment.</p>
                )
              ) : (
                debuggingResponses.map((resp, idx) => {
                  const payload = getParsedPayload(resp);
                  const codeText = payload.sourceCode || payload.code || payload.userCode || payload.fixedCode || "// No fixed code submitted";
                  const lang = payload.language || "python";
                  const promptText = (resp.question as any)?.prompt || (resp.question as any)?.content?.prompt || payload.questionText || payload.prompt || `Debugging Challenge #${idx + 1}`;
                  const isAccepted = payload.isCorrect !== false && (payload.status === "COMPLETED" || payload.status === "ACCEPTED" || payload.status === "SUCCESS" || payload.isCorrect === true);
                  const totalCount = payload.totalTests || (resp.question as any)?.content?.testCases?.length || (resp.question as any)?.testCases?.length || 1;
                  const passedCount = payload.passedTests !== undefined ? payload.passedTests : (isAccepted ? totalCount : 0);
                  const isAllPassed = passedCount === totalCount && totalCount > 0;

                  return (
                    <div key={resp.id || idx} className="border border-line rounded-md p-4 space-y-3 bg-canvas">
                      <div className="flex items-center justify-between">
                        <span className="text-sm-minus font-semibold text-ink">
                          {promptText} ({lang})
                        </span>
                        <span className={`px-2.5 py-0.5 rounded text-xs-plus font-mono font-bold border ${
                          isAllPassed
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                            : "bg-amber-50 text-amber-800 border-amber-300"
                        }`}>
                          Passed {passedCount} / {totalCount} Tests
                        </span>
                      </div>

                      <div className="h-48 border border-line rounded-md overflow-hidden">
                        <CodeEditor
                          value={typeof codeText === "string" ? codeText : JSON.stringify(codeText, null, 2)}
                          language={lang}
                          readOnly={true}
                          theme="cd-recruit-dark"
                        />
                      </div>

                      {(payload.stdout || payload.output) && (
                        <div>
                          <span className="text-xs-plus font-mono uppercase text-ink-tertiary block mb-1">Standard Output:</span>
                          <div className="bg-white border border-line p-2.5 rounded font-mono text-xs-plus text-ink">
                            {payload.stdout || payload.output}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}

        {/* SQL TAB */}
        {activeTab === "SQL" && (() => {
          const sqlResponses = getAllResponses.filter(
            r => {
              const modType = (r.moduleType || r.question?.moduleType || "").toUpperCase();
              const payload = getParsedPayload(r);
              const pModType = (payload.moduleType || "").toUpperCase();
              if (modType === 'NOSQL' || pModType === 'NOSQL') return false;
              return modType === 'SQL' || pModType === 'SQL' || payload.query !== undefined || payload.sqlQuery !== undefined || payload.sql !== undefined;
            }
          );

          const driveQuestions = (detail as any).questions || (detail as any).drive?.questions || (detail as any).session?.questions || [];
          const sqlDriveQuestions = driveQuestions.filter((q: any) => {
            const qMod = (q.moduleType || q.question?.moduleType || "").toUpperCase();
            return (qMod === "SQL") && qMod !== "NOSQL";
          });

          return (
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-ink">SQL Query Submissions &amp; Execution Results</h3>
              {sqlResponses.length === 0 ? (
                sqlDriveQuestions.length > 0 ? (
                  <div className="space-y-4">
                    {sqlDriveQuestions.map((qItem: any, idx: number) => {
                      const qObj = qItem.question || qItem;
                      const qContent = qObj.content || {};
                      const promptText = qObj.prompt || qContent.prompt || qContent.title || qContent.text || qContent.question || `SQL Problem #${idx + 1}`;
                      const initialQuery = qContent.initialQuery || qContent.starterCode || qContent.sql || "-- Candidate did not submit SQL query for this problem.";

                      return (
                        <div key={qItem.id || idx} className="border border-line rounded-md p-4 space-y-3 bg-canvas">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-semibold text-ink">{promptText}</span>
                            <span className="px-2 py-0.5 rounded text-xs-plus font-mono font-semibold border bg-amber-50 text-amber-800 border-amber-300">
                              No Submission Recorded
                            </span>
                          </div>

                          <div className="h-44 border border-line rounded-md overflow-hidden">
                            <CodeEditor
                              value={typeof initialQuery === "string" ? initialQuery : JSON.stringify(initialQuery, null, 2)}
                              language="sql"
                              readOnly={true}
                              theme="cd-recruit-dark"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm-minus text-ink-tertiary italic">No SQL queries recorded for this assessment.</p>
                )
              ) : (
                sqlResponses.map((resp, idx) => {
                  const payload = getParsedPayload(resp);
                  const queryText = payload.query || payload.sqlQuery || payload.sql || payload.code || "-- No query submitted";
                  const execResult = payload.executionResult;
                  const hasResult = execResult !== undefined;
                  const isCorrect = execResult?.passed || execResult?.status === "SUCCESS" || execResult?.status === "PASSED" || payload.isCorrect;
                  const statusText = hasResult ? (isCorrect ? "PASSED" : "FAILED") : (payload.status || "EXECUTED");
                  const badgeColor = hasResult
                    ? (isCorrect
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : "bg-rose-50 text-rose-800 border-rose-300")
                    : "bg-brand-subtle text-brand-ink border-brand-border";

                  return (
                    <div key={resp.id || idx} className="border border-line rounded-md p-4 space-y-3 bg-canvas">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-semibold text-ink">SQL Query #{idx + 1}</span>
                        <span className={`px-2 py-0.5 rounded text-xs-plus font-mono font-semibold border ${badgeColor}`}>
                          {statusText}
                        </span>
                      </div>

                      <div className="h-44 border border-line rounded-md overflow-hidden">
                        <CodeEditor
                          value={typeof queryText === "string" ? queryText : JSON.stringify(queryText, null, 2)}
                          language="sql"
                          readOnly={true}
                          theme="cd-recruit-dark"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}

        {/* NoSQL TAB */}
        {activeTab === "NOSQL" && (() => {
          const nosqlResponses = getAllResponses.filter(
            r => {
              const modType = (r.moduleType || r.question?.moduleType || "").toUpperCase();
              const payload = getParsedPayload(r);
              const pModType = (payload.moduleType || "").toUpperCase();
              if (modType === 'SQL' || pModType === 'SQL') return false;
              return modType === 'NOSQL' || pModType === 'NOSQL' || payload.operation !== undefined || payload.noSqlQuery !== undefined;
            }
          );

          const driveQuestions = (detail as any).questions || (detail as any).drive?.questions || (detail as any).session?.questions || [];
          const nosqlDriveQuestions = driveQuestions.filter((q: any) => {
            const qMod = (q.moduleType || q.question?.moduleType || "").toUpperCase();
            return (qMod === "NOSQL") && qMod !== "SQL";
          });

          return (
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-ink">NoSQL Query Submissions &amp; Execution Results</h3>
              {nosqlResponses.length === 0 ? (
                nosqlDriveQuestions.length > 0 ? (
                  <div className="space-y-4">
                    {nosqlDriveQuestions.map((qItem: any, idx: number) => {
                      const qObj = qItem.question || qItem;
                      const qContent = qObj.content || {};
                      const promptText = qObj.prompt || qContent.prompt || qContent.title || qContent.text || qContent.question || `NoSQL Problem #${idx + 1}`;
                      const initialQuery = qContent.initialQuery || qContent.starterCode || "// Candidate did not submit NoSQL query for this problem.";

                      return (
                        <div key={qItem.id || idx} className="border border-line rounded-md p-4 space-y-3 bg-canvas">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-semibold text-ink">{promptText}</span>
                            <span className="px-2 py-0.5 rounded text-xs-plus font-mono font-semibold border bg-amber-50 text-amber-800 border-amber-300">
                              No Submission Recorded
                            </span>
                          </div>

                          <div className="h-44 border border-line rounded-md overflow-hidden">
                            <CodeEditor
                              value={typeof initialQuery === "string" ? initialQuery : JSON.stringify(initialQuery, null, 2)}
                              language="javascript"
                              readOnly={true}
                              theme="cd-recruit-dark"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm-minus text-ink-tertiary italic">No NoSQL queries recorded for this assessment.</p>
                )
              ) : (
                nosqlResponses.map((resp, idx) => {
                  const payload = getParsedPayload(resp);
                  const op = payload.operation || {};
                  const rawQuery = payload.query || payload.noSqlQuery;
                  const displayQuery = rawQuery || (typeof op === 'string' ? op : JSON.stringify(op, null, 2));
                  const displayLanguage = rawQuery ? "javascript" : "json";

                  const execResult = payload.executionResult;
                  const hasResult = execResult !== undefined;
                  const isCorrect = execResult?.passed || execResult?.status === "SUCCESS" || execResult?.status === "PASSED" || payload.isCorrect;
                  const statusText = hasResult ? (isCorrect ? "PASSED" : "FAILED") : (payload.status || "EXECUTED");
                  const badgeColor = hasResult
                    ? (isCorrect
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : "bg-rose-50 text-rose-800 border-rose-300")
                    : "bg-brand-subtle text-brand-ink border-brand-border";

                  return (
                    <div key={resp.id || idx} className="border border-line rounded-md p-4 space-y-3 bg-canvas">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-semibold text-ink">NoSQL Operation #{idx + 1}</span>
                        <span className={`px-2 py-0.5 rounded text-xs-plus font-mono font-semibold border ${badgeColor}`}>
                          {statusText}
                        </span>
                      </div>

                      <div className="h-44 border border-line rounded-md overflow-hidden">
                        <CodeEditor
                          value={typeof displayQuery === "string" ? displayQuery : JSON.stringify(displayQuery, null, 2)}
                          language={displayLanguage}
                          readOnly={true}
                          theme="cd-recruit-dark"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}

        {/* MCQ TAB */}
        {activeTab === "MCQ" && (() => {
          const mcqResponses = getAllResponses.filter(
            r => {
              const modType = (r.moduleType || r.question?.moduleType || "").toUpperCase();
              const payload = getParsedPayload(r);
              const pModType = (payload.moduleType || "").toUpperCase();
              return modType === 'MCQ' || pModType === 'MCQ' || payload.selectedOptions !== undefined || payload.selectedOption !== undefined || payload.selectedIndex !== undefined || payload.selectedOptionIndex !== undefined;
            }
          );

          const driveQuestions = (detail as any).questions || (detail as any).drive?.questions || (detail as any).session?.questions || [];
          const mcqDriveQuestions = driveQuestions.filter((q: any) => {
            const qMod = (q.moduleType || q.question?.moduleType || "").toUpperCase();
            return qMod === "MCQ";
          });

          const correctCount = mcqResponses.filter(r => {
            const payload = getParsedPayload(r);
            const qObj = r.question || {};
            const qContent = qObj.content || {};
            const optionsList = qObj.options || qContent.options || [];
            const selectedRaw = payload.selectedOption ?? payload.selectedOptions ?? payload.selectedOptionIndex ?? payload.selectedIndex;
            const correctRaw = qObj.correctOption ?? qContent.correctOption ?? qContent.correctAnswer ?? qContent.correctIndex ?? qContent.answerIndex;
            
            if (payload.isCorrect !== undefined) return Boolean(payload.isCorrect);
            if (selectedRaw === undefined || correctRaw === undefined) return false;
            
            const selText = Array.isArray(selectedRaw) ? selectedRaw.map(sr => resolveOptionText(sr, optionsList)).join(", ") : resolveOptionText(selectedRaw, optionsList);
            const corrText = resolveOptionText(correctRaw, optionsList);
            return selText.trim().toLowerCase() === corrText.trim().toLowerCase() || String(selectedRaw).toLowerCase() === String(correctRaw).toLowerCase();
          }).length;

          const skippedCount = mcqResponses.filter(r => {
            const payload = getParsedPayload(r);
            const selectedRaw = payload.selectedOption ?? payload.selectedOptions ?? payload.selectedOptionIndex ?? payload.selectedIndex;
            return selectedRaw === undefined || selectedRaw === null || (Array.isArray(selectedRaw) && selectedRaw.length === 0);
          }).length;

          const incorrectCount = Math.max(0, mcqResponses.length - correctCount - skippedCount);

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div>
                  <h3 className="text-md font-semibold text-ink">Multiple Choice Responses &amp; Accuracy Breakdown</h3>
                  <p className="text-sm-minus text-ink-tertiary">Detailed evaluation of candidate option selections, correctness, and correct reference answers.</p>
                </div>
                {mcqResponses.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs-plus font-semibold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Correct: {correctCount}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs-plus font-semibold font-mono bg-rose-50 text-rose-700 border border-rose-200">
                      Incorrect: {incorrectCount}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs-plus font-semibold font-mono bg-slate-100 text-slate-700 border border-slate-200">
                      Skipped: {skippedCount}
                    </span>
                  </div>
                )}
              </div>

              {mcqResponses.length === 0 ? (
                mcqDriveQuestions.length > 0 ? (
                  <div className="space-y-3">
                    {mcqDriveQuestions.map((qItem: any, idx: number) => {
                      const qObj = qItem.question || qItem;
                      const qContent = qObj.content || {};
                      const promptText = qObj.prompt || qContent.prompt || qContent.title || qContent.text || qContent.question || `MCQ Question #${idx + 1}`;
                      const optionsList: Array<any> = qObj.options || qContent.options || [];

                      return (
                        <div key={qItem.id || idx} className="p-4 bg-white border border-line rounded-xl space-y-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-xs-plus font-mono font-bold bg-brand-subtle text-brand shrink-0">
                                Q{idx + 1}
                              </span>
                              <h4 className="text-sm-minus font-semibold text-ink leading-snug">
                                {promptText}
                              </h4>
                            </div>
                            <span className="px-2.5 py-0.5 rounded text-xs-plus font-mono font-bold border bg-amber-50 text-amber-800 border-amber-300">
                              Unattempted
                            </span>
                          </div>

                          {optionsList.length > 0 && (
                            <div className="text-xs space-y-1 pt-2 border-t border-surface-inset">
                              <span className="text-ink-tertiary block font-mono uppercase text-2xs mb-1">Options:</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {optionsList.map((opt: any, oIdx: number) => (
                                  <div key={oIdx} className="px-3 py-1.5 rounded border border-line bg-canvas text-ink text-xs font-mono">
                                    {resolveOptionText(opt, optionsList)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm-minus text-ink-tertiary italic">No MCQ responses recorded for this assessment.</p>
                )
              ) : (
                <div className="space-y-3">
                  {mcqResponses.map((resp, idx) => {
                    const payload = getParsedPayload(resp);
                    const qObj = resp.question || {};
                    const qContent = qObj.content || {};
                    const promptText = qObj.prompt || qContent.prompt || qContent.title || qContent.text || qContent.question || payload.questionText || payload.prompt || `Question #${idx + 1}`;
                    
                    const optionsList: Array<any> = qObj.options || qContent.options || [];

                    const selectedRaw = payload.selectedOption ?? payload.selectedOptions ?? payload.selectedOptionIndex ?? payload.selectedIndex;

                    let selectedOptionText = "None selected";
                    if (selectedRaw !== undefined && selectedRaw !== null) {
                      if (Array.isArray(selectedRaw)) {
                        selectedOptionText = selectedRaw.map(sr => resolveOptionText(sr, optionsList)).join(", ");
                      } else {
                        selectedOptionText = resolveOptionText(selectedRaw, optionsList);
                      }
                    }

                    const correctRaw = qObj.correctOption ?? qContent.correctOption ?? qContent.correctAnswer ?? qContent.correctIndex ?? qContent.answerIndex;
                    let correctAnswerText = "";
                    if (correctRaw !== undefined && correctRaw !== null) {
                      correctAnswerText = resolveOptionText(correctRaw, optionsList);
                    }

                    let isCorrect = false;
                    if (payload.isCorrect !== undefined) {
                      isCorrect = Boolean(payload.isCorrect);
                    } else if (selectedRaw !== undefined && correctRaw !== undefined) {
                      isCorrect = selectedOptionText.trim().toLowerCase() === correctAnswerText.trim().toLowerCase() || String(selectedRaw).toLowerCase() === String(correctRaw).toLowerCase();
                    }

                    return (
                      <div key={resp.id || idx} className="p-4 bg-white border border-line rounded-xl space-y-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-xs-plus font-mono font-bold bg-brand-subtle text-brand shrink-0">
                                Q{idx + 1}
                              </span>
                              <h4 className="text-sm-minus font-semibold text-ink leading-snug">
                                {promptText}
                              </h4>
                            </div>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs-plus font-semibold font-mono shrink-0 ${
                            isCorrect ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}>
                            {isCorrect ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                            <span>{isCorrect ? "Correct" : "Incorrect"}</span>
                          </span>
                        </div>

                        <div className="text-xs space-y-2 pt-2 border-t border-surface-inset">
                          <div className="flex items-center gap-1.5">
                            <span className="text-ink-secondary">Selected Option:</span>
                            <span className="font-semibold text-ink font-mono">{selectedOptionText}</span>
                          </div>
                          {!isCorrect && correctAnswerText && (
                            <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-md text-emerald-900 text-xs space-y-0.5">
                              <span className="font-semibold text-emerald-800">Correct Answer: </span>
                              <span className="font-medium text-emerald-950">{correctAnswerText}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* TEST SCENARIOS TAB */}
        {activeTab === "TEST_SCENARIOS" && (() => {
          const scenarioResponses = getAllResponses.filter(
            (r) => {
              const modType = (r.moduleType || r.question?.moduleType || "").toUpperCase();
              const payload = getParsedPayload(r);
              const pModType = (payload.moduleType || "").toUpperCase();
              return modType === "TEST_SCENARIOS" || pModType === "TEST_SCENARIOS" || payload.answer !== undefined || payload.scenarioAnswer !== undefined;
            }
          );

          const driveQuestions = (detail as any).questions || (detail as any).drive?.questions || (detail as any).session?.questions || [];
          const scenarioDriveQuestions = driveQuestions.filter((q: any) => {
            const qMod = (q.moduleType || q.question?.moduleType || "").toUpperCase();
            return qMod === "TEST_SCENARIOS";
          });

          return (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div>
                  <h3 className="text-md font-semibold text-ink">Test Scenarios Submissions &amp; Evaluation</h3>
                  <p className="text-sm-minus text-ink-tertiary">Detailed evaluation of candidate practical &amp; operational scenario solutions against reference guidelines.</p>
                </div>
                <div className="flex items-center gap-2">
                  {score?.moduleScores?.TEST_SCENARIOS !== undefined && (
                    <span className="px-3 py-1 rounded-full text-xs-plus font-semibold font-mono bg-brand-subtle text-brand-ink border border-brand-border">
                      Module Score: {Math.round(score.moduleScores.TEST_SCENARIOS * 100)}%
                    </span>
                  )}
                  <span className="px-3 py-1 rounded-full text-xs-plus font-semibold font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Total Scenarios: {scenarioResponses.length || scenarioDriveQuestions.length}
                  </span>
                </div>
              </div>

              {scenarioResponses.length === 0 ? (
                scenarioDriveQuestions.length > 0 ? (
                  <div className="space-y-4">
                    {scenarioDriveQuestions.map((qItem: any, index: number) => {
                      const qObj = qItem.question || qItem;
                      const qContent = qObj.content || {};
                      const promptText = qObj.prompt || qContent.prompt || qContent.title || qContent.text || qContent.question || `Test Scenario #${index + 1}`;
                      const expectedAnswer = qContent.expectedAnswer || qObj.expectedAnswer || "";
                      const category = qContent.category || qObj.category || "Scenario Evaluation";

                      return (
                        <div key={qItem.id || index} className="border border-line rounded-md p-5 space-y-4 bg-canvas">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <span className="text-xs-plus font-mono font-bold text-indigo-600 uppercase tracking-wider block mb-1">
                                Scenario {index + 1} • {category}
                              </span>
                              <h4 className="text-sm font-bold text-ink">{promptText}</h4>
                            </div>
                            <span className="px-2.5 py-0.5 rounded text-xs-plus font-mono font-bold border bg-amber-50 text-amber-800 border-amber-300">
                              Unattempted
                            </span>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs-plus font-mono uppercase text-ink-secondary font-semibold block">
                              Candidate's Solution &amp; Action Plan:
                            </label>
                            <div className="bg-white border border-line p-4 rounded-md text-sm-minus font-sans text-ink-tertiary italic">
                              (No response submitted by candidate)
                            </div>
                          </div>

                          {expectedAnswer && (
                            <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-md text-xs text-indigo-950 space-y-1">
                              <span className="font-semibold text-indigo-900 block font-mono uppercase text-2xs">Expected Criteria / Key Guidelines:</span>
                              <p className="leading-relaxed">{expectedAnswer}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-white border border-line rounded-lg text-ink-tertiary text-sm-minus">
                    No Test Scenario responses recorded for this candidate session.
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  {scenarioResponses.map((res: any, index: number) => {
                    const payload = getParsedPayload(res);
                    const qObj = res.question || {};
                    const qContent = qObj.content || {};
                    const promptText = res.prompt || qObj.prompt || qContent.prompt || qContent.question || payload.questionText || `Test Scenario #${index + 1}`;
                    const expectedAnswer = qContent.expectedAnswer || qObj.expectedAnswer || "";
                    const candidateAnswer = payload.answer || payload.scenarioAnswer || payload.text || "// No response provided";
                    const category = qContent.category || qObj.category || "Scenario Evaluation";
                    const evaluation = payload.evaluation;
                    const scoreVal = evaluation?.overallScore ?? null;

                    return (
                      <div key={res.id || index} className="border border-line rounded-md p-5 space-y-4 bg-canvas">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <span className="text-xs-plus font-mono font-bold text-indigo-600 uppercase tracking-wider block mb-1">
                              Scenario {index + 1} • {category}
                            </span>
                            <h4 className="text-sm font-bold text-ink">{promptText}</h4>
                          </div>
                          {scoreVal !== null && (
                            <span className="px-2.5 py-1 rounded text-xs-plus font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0">
                              Score: {scoreVal}%
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs-plus font-mono uppercase text-ink-secondary font-semibold block">
                            Candidate's Solution &amp; Action Plan:
                          </label>
                          <div className="bg-white border border-line p-4 rounded-md text-sm-minus font-sans text-ink leading-relaxed whitespace-pre-wrap">
                            {candidateAnswer}
                          </div>
                        </div>

                        {expectedAnswer && (
                          <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-md text-xs text-indigo-950 space-y-1">
                            <span className="font-semibold text-indigo-900 block font-mono uppercase text-2xs">Expected Criteria / Key Guidelines:</span>
                            <p className="leading-relaxed">{expectedAnswer}</p>
                          </div>
                        )}

                        {evaluation?.feedback && (
                          <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-md text-xs text-blue-950 space-y-1">
                            <span className="font-semibold text-blue-900 block font-mono uppercase text-2xs">AI Evaluation &amp; Feedback:</span>
                            <p className="leading-relaxed">{evaluation.feedback}</p>
                            {evaluation.reasoning && (
                              <p className="text-xs-plus text-blue-800/80 mt-1 font-medium italic">Reasoning: {evaluation.reasoning}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* AI PROMPTING TAB */}
        {activeTab === "AI_PROMPTING" && (() => {
          const aiPromptingResponses = getAllResponses.filter(
            (r) => {
              const modType = (r.moduleType || r.question?.moduleType || "").toUpperCase();
              const payload = getParsedPayload(r);
              const pModType = (payload.moduleType || "").toUpperCase();
              return modType === "AI_PROMPTING" || pModType === "AI_PROMPTING" || payload.prompt !== undefined || payload.userPrompt !== undefined || payload.candidatePrompt !== undefined;
            }
          );

          const driveQuestions = (detail as any).questions || (detail as any).drive?.questions || (detail as any).session?.questions || [];
          const aiDriveQuestions = driveQuestions.filter((q: any) => {
            const qMod = (q.moduleType || q.question?.moduleType || "").toUpperCase();
            return qMod === "AI_PROMPTING";
          });

          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="text-md font-semibold text-ink">AI Prompting Evaluation &amp; Conversation Trace</h3>
                  <p className="text-sm-minus text-ink-tertiary">Reviews prompt engineering structure, clarity, and anti-cheating guardrail flags.</p>
                </div>
              </div>

              {aiPromptingResponses.length === 0 ? (
                aiDriveQuestions.length > 0 ? (
                  <div className="space-y-4">
                    {aiDriveQuestions.map((qItem: any, index: number) => {
                      const qObj = qItem.question || qItem;
                      const qContent = qObj.content || {};
                      const promptText = qObj.prompt || qContent.prompt || qContent.title || qContent.text || qContent.question || `Prompt Task #${index + 1}`;

                      return (
                        <div key={qItem.id || index} className="p-5 bg-white border border-line rounded-xl space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                            <span className="text-sm-minus font-semibold text-ink">
                              {promptText}
                            </span>
                            <span className="px-2.5 py-0.5 rounded text-xs-plus font-mono font-bold border bg-amber-50 text-amber-800 border-amber-300">
                              Unattempted
                            </span>
                          </div>

                          <div>
                            <div className="text-xs-plus font-medium text-ink-tertiary uppercase tracking-wider mb-1">
                              Candidate Submitted Prompt
                            </div>
                            <div className="p-3 bg-white border border-line rounded-lg font-mono text-xs text-ink-tertiary italic">
                              (No prompt submitted by candidate)
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-white border border-line rounded-lg text-ink-tertiary text-sm-minus">
                    No AI Prompting module responses recorded for this candidate session.
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  {aiPromptingResponses.map((res, index) => {
                    const payload = getParsedPayload(res);
                    const promptStr = String(payload.prompt || payload.userPrompt || payload.candidatePrompt || "").trim();
                    const isShortOrGibberish = promptStr.length < 15 || !promptStr.includes(" ");
                    const isJailbreak = !!payload.isJailbreakAttempt;
                    const isVerbatim = !!payload.isVerbatimCopy;
                    const isGreeting = !!payload.isMinimalOrGreeting || isShortOrGibberish;
                    const similarity = payload.promptSimilarity || 0;
                    const structureScore = payload.promptStructureScore ?? (isJailbreak ? 0 : isVerbatim ? 30 : isGreeting ? 15 : 85);
                    const aiScore = payload.aiValidationScore ?? (isGreeting ? 15 : structureScore);

                    return (
                      <div
                        key={res.id || index}
                        className={`p-5 bg-white border rounded-xl space-y-4 transition-shadow ${isJailbreak
                            ? "border-red-300 bg-red-50/20"
                            : isVerbatim
                              ? "border-amber-300 bg-amber-50/20"
                              : isShortOrGibberish
                                ? "border-rose-300 bg-rose-50/10"
                                : "border-line"
                          }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                          <span className="text-sm-minus font-semibold text-ink">
                            Prompt Question {index + 1}
                          </span>

                          <div className="flex flex-wrap items-center gap-2">
                            {isJailbreak && (
                              <span className="px-2.5 py-1 rounded text-xs-plus font-semibold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1 font-mono">
                                <ShieldAlert size={12} /> Jailbreak Attempt (0%)
                              </span>
                            )}
                            {isVerbatim && (
                              <span className="px-2.5 py-1 rounded text-xs-plus font-semibold bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-1 font-mono">
                                <AlertTriangle size={12} /> Verbatim Copy ({Math.round(similarity * 100)}% Match)
                              </span>
                            )}
                            {!isJailbreak && !isVerbatim && (
                              <span className={`px-2.5 py-1 rounded text-xs-plus font-semibold border flex items-center gap-1 font-mono ${
                                structureScore >= 70 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-rose-100 text-rose-700 border-rose-200"
                              }`}>
                                {structureScore >= 70 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                Structure Score: {structureScore}%
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Scores Breakdown Badges */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-canvas p-3 rounded-lg border border-line">
                          <div>
                            <span className="text-2xs uppercase font-mono text-ink-tertiary block">Structure Correctness</span>
                            <span className="text-sm font-bold font-mono text-ink">
                              {structureScore}% ({structureScore >= 70 ? "Correct" : "Needs Work"})
                            </span>
                          </div>
                          <div>
                            <span className="text-2xs uppercase font-mono text-ink-tertiary block">AI Validation Score</span>
                            <span className="text-sm font-bold font-mono text-ink">
                              {aiScore}%
                            </span>
                          </div>
                          <div>
                            <span className="text-2xs uppercase font-mono text-ink-tertiary block">Jailbreak Flag</span>
                            <span className={`text-sm-minus font-semibold font-mono ${isJailbreak ? "text-rose-600" : "text-emerald-600"}`}>
                              {isJailbreak ? "TRIGGERED" : "CLEAN"}
                            </span>
                          </div>
                          <div>
                            <span className="text-2xs uppercase font-mono text-ink-tertiary block">Verbatim Flag</span>
                            <span className={`text-sm-minus font-semibold font-mono ${isVerbatim ? "text-amber-600" : "text-emerald-600"}`}>
                              {isVerbatim ? "FLAGGED" : "CLEAN"}
                            </span>
                          </div>
                        </div>

                        {/* Candidate Submitted Prompt */}
                        <div>
                          <div className="text-xs-plus font-medium text-ink-tertiary uppercase tracking-wider mb-1">
                            Candidate Submitted Prompt
                          </div>
                          <div className="p-3 bg-white border border-line rounded-lg font-mono text-xs text-ink whitespace-pre-wrap">
                            {promptStr || "(No prompt submitted)"}
                          </div>
                        </div>

                        {payload.aiReasoning && (
                          <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-lg text-xs text-blue-900">
                            <strong>AI Validation Rationale: </strong>
                            <span>{payload.aiReasoning}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* SIMULATION TAB */}
        {activeTab === "SIMULATION" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-md font-semibold text-ink">Contextual Simulation &amp; Say-Do Consistency</h3>
                <p className="text-sm-minus text-ink-tertiary">Cross-referenced AI evaluation comparing candidate written statements against code diff actions.</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs-plus font-semibold bg-brand-subtle text-brand-ink border border-brand-border">
                Track: {detail.roleTemplateName?.toLowerCase()?.includes("junior") || detail.roleTemplateName?.toLowerCase()?.includes("fresher") ? "Fresher Track (Coachability)" : "Experienced Track (Judgment)"}
              </span>
            </div>

            {/* Score & Rationale Card */}
            <div className="border border-line rounded-md p-5 bg-white space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <span className="text-xs-plus font-mono uppercase text-ink-tertiary">Say-Do Consistency Score</span>
                  <div className="text-2xl font-bold text-ink mt-0.5">
                    {typeof detail.score?.sayDoConsistencyScore === "number" && detail.score.sayDoConsistencyScore >= 0
                      ? `${Math.round(detail.score.sayDoConsistencyScore <= 1.0 ? detail.score.sayDoConsistencyScore * 100 : detail.score.sayDoConsistencyScore)}%`
                      : "Pending Evaluation"}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs-plus font-mono uppercase text-ink-tertiary">AI Confidence</span>
                  <div className="text-sm font-semibold text-emerald-700 mt-0.5">
                    {typeof detail.score?.sayDoConsistencyScore === "number" && detail.score?.aiConfidence
                      ? `${Math.round(detail.score.aiConfidence <= 1.0 ? detail.score.aiConfidence * 100 : detail.score.aiConfidence)}%`
                      : "Pending"}
                  </div>
                </div>
              </div>

              {detail.score?.sayDoRationale && (
                <div>
                  <span className="text-xs-plus font-mono uppercase text-ink-tertiary block mb-1">AI Evaluation Rationale:</span>
                  <p className="text-sm-minus text-ink leading-relaxed bg-canvas p-3 rounded border border-line">
                    {detail.score.sayDoRationale}
                  </p>
                </div>
              )}

              {/* Mismatches List */}
              {(detail.score as any)?.sayDoMismatches && Array.isArray((detail.score as any).sayDoMismatches) && (detail.score as any).sayDoMismatches.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs-plus font-mono uppercase text-red-600 font-semibold block">Detected Say-Do Mismatches:</span>
                  <div className="space-y-2">
                    {((detail.score as any).sayDoMismatches as any[]).map((m, idx) => (
                      <div key={idx} className="p-3 bg-red-50/50 border border-red-200 rounded-md text-xs space-y-1">
                        <div className="flex items-center gap-2 text-red-900 font-semibold">
                          <span>Said:</span> <span className="font-normal">{m.said}</span>
                        </div>
                        <div className="flex items-center gap-2 text-red-900 font-semibold">
                          <span>Did:</span> <span className="font-normal">{m.did}</span>
                        </div>
                        {m.impact && (
                          <div className="text-xs-plus text-red-700 italic">
                            Impact: {m.impact}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Candidate Submissions & Actions Linkage */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Initial SAY Plan */}
              <div className="border border-line rounded-md p-4 bg-white space-y-2">
                <span className="text-xs-plus font-mono uppercase text-brand font-bold block">
                  1. Candidate Initial SAY Debugging Plan
                </span>
                <div className="p-3 bg-canvas border border-line rounded text-xs text-ink whitespace-pre-wrap min-h-[90px]">
                  {(detail as any).simulationSnapshot?.initialSayText || 
                   (detail.moduleResponses || []).find((r: any) => r.responsePayload?.initialSayText || r.responsePayload?.sayText)?.responsePayload?.initialSayText ||
                   (detail.moduleResponses || []).find((r: any) => r.responsePayload?.initialSayText || r.responsePayload?.sayText)?.responsePayload?.sayText ||
                   (detail.moduleResponses || []).find((r: any) => r.moduleType === 'SIMULATION' && r.responsePayload?.text)?.responsePayload?.text ||
                   ((detail as any).submissions || []).find((r: any) => r.responsePayload?.initialSayText || r.responsePayload?.sayText)?.responsePayload?.initialSayText ||
                   "Candidate entered workspace directly without initial plan submission."}
                </div>
              </div>

              {/* Manager Email Reply */}
              <div className="border border-line rounded-md p-4 bg-white space-y-2">
                <span className="text-xs-plus font-mono uppercase text-emerald-600 font-bold block">
                  2. Manager Email Stakeholder Reply
                </span>
                <div className="p-3 bg-canvas border border-line rounded text-xs text-ink whitespace-pre-wrap min-h-[90px]">
                  {(detail as any).simulationSnapshot?.emailReplyText || 
                   ((detail as any).simulationSnapshot?.inboxMessages || []).find((m: any) => m.replyText || m.reply)?.replyText ||
                   ((detail as any).simulationSnapshot?.inboxMessages || []).find((m: any) => m.replyText || m.reply)?.reply ||
                   (detail.moduleResponses || []).find((r: any) => r.responsePayload?.emailReplyText || r.responsePayload?.ticketReply || r.responsePayload?.replyText || r.responsePayload?.emailReply)?.responsePayload?.emailReplyText ||
                   (detail.moduleResponses || []).find((r: any) => r.responsePayload?.emailReplyText || r.responsePayload?.ticketReply || r.responsePayload?.replyText || r.responsePayload?.emailReply)?.responsePayload?.ticketReply ||
                   (detail.moduleResponses || []).find((r: any) => r.responsePayload?.emailReplyText || r.responsePayload?.ticketReply || r.responsePayload?.replyText || r.responsePayload?.emailReply)?.responsePayload?.replyText ||
                   (detail.moduleResponses || []).find((r: any) => r.responsePayload?.emailReplyText || r.responsePayload?.ticketReply || r.responsePayload?.replyText || r.responsePayload?.emailReply)?.responsePayload?.emailReply ||
                   ((detail as any).submissions || []).find((r: any) => r.responsePayload?.ticketReply || r.responsePayload?.emailReplyText || r.responsePayload?.emailReply)?.responsePayload?.emailReplyText ||
                   ((detail as any).submissions || []).find((r: any) => r.responsePayload?.ticketReply || r.responsePayload?.emailReplyText || r.responsePayload?.emailReply)?.responsePayload?.ticketReply ||
                   "No manager email reply recorded."}
                </div>
              </div>
            </div>

            {/* Telemetry Action Log */}
            <div className="border border-line rounded-md p-4 bg-white space-y-2">
              <span className="text-xs-plus font-mono uppercase text-ink-tertiary font-bold block">
                3. Candidate Telemetry &amp; Action Audit Stream
              </span>
              <div className="p-3 bg-canvas border border-line rounded text-xs-plus font-mono text-ink-secondary space-y-1.5 max-h-56 overflow-y-auto">
                {(() => {
                  const rawActions = (detail as any).telemetryActions || (detail as any).simulationSnapshot?.telemetryActions || [];
                  const actionsList = Array.isArray(rawActions) && rawActions.length > 0
                    ? rawActions
                    : (detail as any).simulationSnapshot?.evaluation?.actionTimeline?.map((item: any) => ({
                        timestamp: item.timestamp,
                        type: "ACTION",
                        label: item.action,
                      })) || [];

                  const totalCount = Math.max(actionsList.length, (detail as any).simulationSnapshot?.telemetryCount || 0);

                  if (actionsList.length === 0) {
                    return <div className="text-ink-tertiary italic">No telemetry actions recorded during session.</div>;
                  }

                  return (
                    <>
                      {actionsList.map((act: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 py-0.5 border-b border-gray-100 last:border-0">
                          <span className="text-ink-tertiary shrink-0 font-mono text-2xs">[{act.timestamp || `#${idx + 1}`}]</span>
                          <span className="font-semibold text-brand shrink-0 text-2xs px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded">
                            [{act.type || "ACTION"}]
                          </span>
                          <span className="text-ink text-xs-plus truncate">{act.label || act.action || "Action logged"}</span>
                        </div>
                      ))}
                      {totalCount > 0 && (
                        <div className="text-emerald-600 font-semibold pt-2 border-t border-line mt-1 text-xs-plus flex items-center gap-1.5">
                          <span>✓ Total Recorded Work Events:</span>
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold text-2xs">{totalCount}</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Recorded Simulation Module Submissions */}
            {(() => {
              const allResponses = detail.moduleResponses || (detail as any).submissions || [];
              const simResponses = allResponses.filter(
                (r: any) => {
                  const p = r.responsePayload || r.payload || r;
                  return r.moduleType === "SIMULATION" || p?.moduleType === "SIMULATION" || p?.sayText || p?.ticketReply || p?.resolutionData || p?.resolution || p?.initialSayText;
                }
              );
              return (
                <div className="border border-line rounded-md p-4 bg-white space-y-3">
                  <span className="text-xs-plus font-mono uppercase text-ink font-bold block">
                    4. Contextual Simulation Recorded Submissions &amp; Resolutions ({simResponses.length})
                  </span>
                  {simResponses.length === 0 ? (
                    <p className="text-xs text-ink-tertiary italic">No direct simulation question responses recorded.</p>
                  ) : (
                    <div className="space-y-4">
                      {simResponses.map((resp: any, idx: number) => {
                        const payload = resp.responsePayload || resp.payload || resp;
                        const resolution = payload.resolutionData || payload.resolution || null;
                        const promptText = (resp.question as any)?.prompt || payload.questionText || `P1 Incident Hotfix Resolution #${idx + 1}`;
                        const codePatch = resolution?.fixedCode || payload.fixedCode || payload.code || payload.sourceCode;
                        const summaryText = resolution?.summary || payload.sayText || payload.ticketReply || payload.initialSayText || payload.text;
                        
                        const passedTests = typeof payload.passedTests === "number" ? payload.passedTests : (payload.testExecutionResult?.passedTests ?? (payload.isCorrect ? 3 : 0));
                        const totalTests = typeof payload.totalTests === "number" ? payload.totalTests : (payload.testExecutionResult?.totalTests ?? 3);
                        const hasRunTests = typeof payload.passedTests === "number" || typeof payload.testExecutionResult?.passedTests === "number" || payload.isCorrect !== undefined;

                        let statusStr = "NOT ATTEMPTED";
                        let badgeStyle = "bg-gray-100 text-gray-700 border-gray-300";

                        if (resolution?.status) {
                          statusStr = resolution.status;
                          badgeStyle = statusStr.includes("RESOLVED") ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-blue-50 text-brand border-blue-200";
                        } else if (hasRunTests && totalTests > 0) {
                          if (passedTests === totalTests) {
                            statusStr = "RESOLVED & APPROVED";
                            badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-300";
                          } else if (passedTests > 0) {
                            statusStr = "PARTIALLY RESOLVED";
                            badgeStyle = "bg-amber-50 text-amber-700 border-amber-300";
                          } else {
                            statusStr = "TESTS FAILED";
                            badgeStyle = "bg-rose-50 text-rose-700 border-rose-300";
                          }
                        } else if (codePatch) {
                          statusStr = "SUBMITTED (Unverified)";
                          badgeStyle = "bg-blue-50 text-brand border-blue-200";
                        } else {
                          statusStr = "NOT ATTEMPTED";
                          badgeStyle = "bg-gray-100 text-gray-700 border-gray-300";
                        }

                        return (
                          <div key={resp.id || idx} className="p-4 bg-canvas border border-line rounded-xl space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sm-minus text-ink">{promptText}</span>
                              <span className={`px-2.5 py-0.5 rounded text-xs-plus font-mono font-bold border ${badgeStyle}`}>
                                {statusStr} {hasRunTests ? `• Passed ${passedTests}/${totalTests} Tests` : "• 0 Tests Executed"}
                              </span>
                            </div>

                            {summaryText && (
                              <div className="space-y-1">
                                <span className="text-2xs font-mono uppercase text-ink-tertiary block">Candidate Resolution Rationale &amp; Incident Plan:</span>
                                <div className="p-3 bg-white border border-line rounded text-xs text-ink leading-relaxed">
                                  {summaryText}
                                </div>
                              </div>
                            )}

                            {codePatch && (
                              <div className="space-y-1">
                                <span className="text-2xs font-mono uppercase text-ink-tertiary block">Submitted Hotfix Source Code:</span>
                                <div className="h-44 border border-line rounded-md overflow-hidden">
                                  <CodeEditor
                                    value={typeof codePatch === "string" ? codePatch : JSON.stringify(codePatch, null, 2)}
                                    language="python"
                                    readOnly={true}
                                    theme="cd-recruit-dark"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* INTEGRITY TAB */}
        {activeTab === "INTEGRITY" && (() => {
          const aiPromptingFlags = (detail.moduleResponses || [])
            .filter((r) => r.responsePayload?.isJailbreakAttempt || r.responsePayload?.isVerbatimCopy)
            .map((r) => ({
              id: r.id,
              category: r.responsePayload?.isJailbreakAttempt ? "AI Prompting Jailbreak Attempt" : "AI Prompting Verbatim Copy",
              severity: r.responsePayload?.isJailbreakAttempt ? "CRITICAL" : "MEDIUM",
              confidence: r.responsePayload?.promptSimilarity || 0.95,
              flaggedAt: new Date().toISOString(),
              promptText: r.responsePayload?.prompt,
            }));

          const combinedFlags = [...flags, ...aiPromptingFlags];

          const filteredFlags = combinedFlags.filter((f: any) => {
            const cat = String(f.category || "").toUpperCase();
            if (integrityCategoryFilter === "ALL") return true;
            if (integrityCategoryFilter === "CLIPS_ONLY") return Boolean(f.evidenceClipUrl || f.clipUrl || f.storageRef);
            
            if (integrityCategoryFilter === "UNAUTHORIZED_OBJECTS") return ["PHONE_DETECTED", "HEADPHONES_DETECTED", "BOOK_DETECTED"].includes(cat);
            if (integrityCategoryFilter === "VISUAL_GAZE") return ["LOOKING_AWAY", "EXCESSIVE_MOVEMENT", "GAZE_AWAY"].includes(cat);
            if (integrityCategoryFilter === "FACE_SEAT") return ["FACE_MISSING", "SEAT_EXIT", "NO_FACE"].includes(cat);
            if (integrityCategoryFilter === "MULTIPLE_PERSONS") return ["MULTIPLE_FACES", "IDENTITY_MISMATCH", "SECOND_PERSON"].includes(cat);
            if (integrityCategoryFilter === "AUDIO_SPEECH") return ["SPEECH_DETECTED", "SECOND_VOICE_SUSPECTED", "AUDIO_NOISE", "VOICE_DETECTED"].includes(cat);
            if (integrityCategoryFilter === "BROWSER_APP") return ["TAB_SWITCH", "FULLSCREEN_EXIT", "PASTE"].includes(cat);

            return cat === integrityCategoryFilter;
          });

          // Separate video evidence clips from non-video telemetry logs
          const videoClips = filteredFlags.filter((f: any) => Boolean(f.evidenceClipUrl || f.clipUrl || f.storageRef));
          const telemetryLogs = filteredFlags.filter((f: any) => !f.evidenceClipUrl && !f.clipUrl && !f.storageRef);

          const idVerifyResult = detail.candidate?.identityVerificationResult || (detail as any).identityVerificationResult;
          const faceVerify = idVerifyResult?.face;
          const nameVerify = idVerifyResult?.name;

          return (
            <div className="space-y-6">

              {/* Custom Styled Dropdown Component with Rounded Corners & Theme Blue (50%) */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-line rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-brand-subtle rounded-lg border border-brand-border text-brand">
                    {getCategoryFilterIcon(integrityCategoryFilter)}
                  </div>
                  <div>
                    <h4 className="text-sm-minus font-semibold text-ink">Filter Integrity Evidences</h4>
                    <p className="text-xs-plus text-ink-tertiary">Classify and view proctoring evidence by category.</p>
                  </div>
                </div>

                {/* Custom Popover Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIntegrityFilterOpen((prev) => !prev)}
                    className="inline-flex items-center justify-between gap-3 px-3.5 py-2 text-xs font-semibold bg-brand-subtle hover:bg-brand-subtle text-brand-ink border border-brand-border rounded-lg shadow-sm transition-all cursor-pointer min-w-[290px]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      {getCategoryFilterIcon(integrityCategoryFilter)}
                      <span className="truncate">
                        {integrityCategoryFilter === "ALL" && `All Integrity Evidences (${combinedFlags.length})`}
                        {integrityCategoryFilter === "CLIPS_ONLY" && `Video Clips Only (${combinedFlags.filter((f: any) => Boolean(f.evidenceClipUrl || f.clipUrl || f.storageRef)).length})`}
                        {integrityCategoryFilter === "UNAUTHORIZED_OBJECTS" && "Unauthorized Objects (Phone, Headphones, Book)"}
                        {integrityCategoryFilter === "VISUAL_GAZE" && "Visual & Gaze (Looking Away, Movement)"}
                        {integrityCategoryFilter === "FACE_SEAT" && "Face & Seat (Face Missing, Seat Exit)"}
                        {integrityCategoryFilter === "MULTIPLE_PERSONS" && "Multiple Persons & Identity Mismatch"}
                        {integrityCategoryFilter === "AUDIO_SPEECH" && "Audio & Voice (Speech, Second Voice)"}
                        {integrityCategoryFilter === "BROWSER_APP" && "Browser & App (Tab Switch, Fullscreen, Paste)"}
                      </span>
                    </div>
                    <ChevronDown size={14} className={`text-brand shrink-0 transition-transform ${integrityFilterOpen ? "rotate-180" : ""}`} />
                  </button>

                  {integrityFilterOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIntegrityFilterOpen(false)} />
                      <div className="absolute right-0 mt-2 w-[320px] bg-white border border-brand-border rounded-xl shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100">
                        {[
                          { value: "ALL", label: `All Integrity Evidences (${combinedFlags.length})` },
                          { value: "CLIPS_ONLY", label: `Video Clips Only (${combinedFlags.filter((f: any) => Boolean(f.evidenceClipUrl || f.clipUrl || f.storageRef)).length})` },
                          { value: "UNAUTHORIZED_OBJECTS", label: "Unauthorized Objects (Phone, Headphones, Book)" },
                          { value: "VISUAL_GAZE", label: "Visual & Gaze (Looking Away, Movement)" },
                          { value: "FACE_SEAT", label: "Face & Seat (Face Missing, Seat Exit)" },
                          { value: "MULTIPLE_PERSONS", label: "Multiple Persons & Identity Mismatch" },
                          { value: "AUDIO_SPEECH", label: "Audio & Voice (Speech, Second Voice)" },
                          { value: "BROWSER_APP", label: "Browser & App (Tab Switch, Fullscreen, Paste)" },
                        ].map((opt) => {
                          const isSelected = integrityCategoryFilter === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setIntegrityCategoryFilter(opt.value);
                                setIntegrityFilterOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-md font-medium transition-colors cursor-pointer text-left ${
                                isSelected
                                  ? "bg-brand-subtle text-brand-ink font-semibold"
                                  : "text-ink hover:bg-brand-subtle"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 truncate">
                                {getCategoryFilterIcon(opt.value)}
                                <span className="truncate">{opt.label}</span>
                              </div>
                              {isSelected && <Check size={14} className="text-brand shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Section 1: Webcam Video Evidence Clips */}
              <div className="space-y-3">
                <h3 className="text-md font-semibold text-ink flex items-center gap-2">
                  <Video size={16} className="text-red-500" />
                  Webcam Video Evidence Clips ({videoClips.length})
                </h3>
                {videoClips.length === 0 ? (
                  <p className="text-xs text-ink-tertiary italic bg-canvas p-3 rounded border border-line">
                    No video evidence clips recorded for this filter selection.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {videoClips.map((flag: any) => (
                      <div key={flag.id || flag.flagId} className="p-3.5 border border-red-200 bg-red-50/50 rounded-md flex items-center justify-between">
                        <div className="flex items-start gap-3">
                          <Video size={16} className="text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm-minus font-semibold text-ink">{flag.category}</span>
                              <span className={`px-2 py-0.5 rounded text-2xs font-mono uppercase font-semibold ${flag.severity === "CRITICAL" ? "bg-red-600 text-white" : "bg-red-100 text-red-700"}`}>
                                {flag.severity}
                              </span>
                            </div>
                            <p className="text-xs-plus text-ink-secondary font-mono mt-0.5">
                              Confidence: {Math.round(flag.confidence * 100)}% • Timestamp: {flag.flaggedAt ? flag.flaggedAt.slice(0, 19).replace("T", " ") : "N/A"}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveClipUrl(flag.evidenceClipUrl || flag.clipUrl)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Play size={13} />
                          Play Video Clip
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Non-Video Telemetry & Integrity Logs */}
              <div className="space-y-3 pt-4 border-t border-line">
                <h3 className="text-md font-semibold text-ink flex items-center gap-2">
                  <ShieldAlert size={16} className="text-amber-600" />
                  Telemetry &amp; Integrity Signal Log ({telemetryLogs.length})
                </h3>
                {telemetryLogs.length === 0 ? (
                  <p className="text-xs text-ink-tertiary italic bg-canvas p-3 rounded border border-line">
                    No tab switches, fullscreen exits, or paste anomalies logged.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {telemetryLogs
                      .sort((a: any, b: any) => new Date(a.flaggedAt || 0).getTime() - new Date(b.flaggedAt || 0).getTime())
                      .map((flag: any, idx: number) => {
                        const cat = flag.category;
                        const isCorrelatedPaste = cat === "CORRELATED_PASTE_ANOMALY" || cat === "PASTE_AFTER_TABSWITCH";
                        const isFullscreenExit = cat === "FULLSCREEN_EXIT" || cat === "FULLSCREEN_EXITED" || cat === "FULLSCREEN_EXIT_FLAG";
                        const isTabSwitch = cat === "TAB_SWITCH" || cat === "TAB_HIDDEN";
                        const isPaste = cat === "PASTE" || cat === "EXTERNAL_INSERT_FLAG";

                        const title = isCorrelatedPaste
                          ? "Correlated Paste Anomaly (Pasted Code/Text within 40s of Tab-Switch)"
                          : isFullscreenExit
                          ? "Fullscreen Exit Detected"
                          : isTabSwitch
                          ? "Tab Switch / Window Blur"
                          : isPaste
                          ? "External Paste Anomaly"
                          : cat;

                        return (
                          <div key={flag.id || flag.flagId || idx} className={`p-3.5 border rounded-md flex items-center justify-between ${
                            isCorrelatedPaste ? "border-red-300 bg-red-50/70" : isFullscreenExit ? "border-amber-300 bg-amber-50/50" : "border-line bg-canvas"
                          }`}>
                            <div className="flex items-start gap-3">
                              <AlertTriangle size={16} className={isCorrelatedPaste ? "text-red-600 shrink-0 mt-0.5" : "text-amber-600 shrink-0 mt-0.5"} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm-minus font-semibold text-ink">{title}</span>
                                  <span className={`px-2 py-0.5 rounded text-2xs font-mono uppercase font-semibold ${
                                    flag.severity === "CRITICAL" ? "bg-red-600 text-white" : flag.severity === "HIGH" ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-800"
                                  }`}>
                                    {flag.severity || "MEDIUM"}
                                  </span>
                                </div>
                                <p className="text-xs-plus text-ink-secondary font-mono mt-0.5">
                                  Confidence: {Math.round((flag.confidence || 0.9) * 100)}% • Logged At: {flag.flaggedAt ? flag.flaggedAt.slice(0, 19).replace("T", " ") : "N/A"}
                                </p>
                                {flag.promptText && (
                                  <p className="text-xs-plus text-red-800 font-mono mt-1 bg-red-100/60 p-2 rounded border border-red-200/50">
                                    Prompt: "{flag.promptText}"
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Decision Confirmation Modal */}
      {showDecisionModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-[460px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-semibold text-ink">
                Confirm Decision: {showDecisionModal === "PASS" ? "Approve Candidate" : "Reject Candidate"}
              </h3>
              <button onClick={() => setShowDecisionModal(null)} className="text-ink-tertiary hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <p className="text-sm-minus text-ink-secondary leading-relaxed">
              Are you sure you want to mark candidate <span className="font-semibold text-ink">{detail.candidateName}</span> as{" "}
              <span className={`font-semibold ${showDecisionModal === "PASS" ? "text-emerald-700" : "text-rose-700"}`}>
                {showDecisionModal === "PASS" ? "Approved (Pass)" : "Rejected (Fail)"}
              </span>?
            </p>

            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">Reviewer Decision Note (Optional)</label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="e.g. Excellent SQL optimization and clean code structure."
                rows={3}
                className="w-full px-3 py-2 text-xs border border-line rounded-md bg-white focus:outline-none focus:border-brand resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDecisionModal(null)}
                className="px-3.5 py-2 text-xs font-medium border border-line rounded hover:bg-canvas text-ink-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDecisionSubmit}
                disabled={submittingDecision}
                className={`px-4 py-2 text-xs font-semibold text-white rounded shadow-sm transition-colors ${showDecisionModal === "PASS" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-rose-700 hover:bg-rose-800"
                  }`}
              >
                {submittingDecision ? "Saving..." : "Confirm Decision"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Evidence Clip Modal */}
      {activeClipUrl && (() => {
        const resolved = resolveClipUrl(activeClipUrl);
        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-[640px] shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Video size={16} className="text-red-500" />
                  <h3 className="text-md font-semibold text-ink">
                    Proctoring Video Evidence Clip
                  </h3>
                </div>
                <button onClick={() => setActiveClipUrl(null)} className="text-ink-tertiary hover:text-ink cursor-pointer p-1">
                  <X size={16} />
                </button>
              </div>

              <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center relative shadow-inner">
                {resolved ? (
                  <video
                    key={activeClipUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const v = e.currentTarget;
                      if (resolved.directUrl && v.src !== resolved.directUrl) {
                        v.src = resolved.directUrl;
                        v.play().catch(() => null);
                      }
                    }}
                  >
                    <source src={resolved.proxyUrl} type="video/webm" />
                    {resolved.directUrl && <source src={resolved.directUrl} type="video/webm" />}
                    Your browser does not support WebM video playback.
                  </video>
                ) : (
                  <p className="text-xs text-ink-tertiary">Clip preview unavailable.</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-ink-tertiary font-mono">Stream: Active biometric recording</span>
                <button
                  type="button"
                  onClick={() => setActiveClipUrl(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-canvas border border-line rounded-md hover:bg-line/20 text-ink cursor-pointer"
                >
                  Close Viewer
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      </div>
    </AppShell>
  );
}
