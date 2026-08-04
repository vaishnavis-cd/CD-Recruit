import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
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
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { CodeEditor } from "../components/common/CodeEditor";
import { useStore, API_BASE } from "../lib/store";
import type { CandidateSessionDetail } from "../lib/types";

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

function resolveClipUrl(rawUrl: string | null | undefined): string | undefined {
  if (!rawUrl) return undefined;
  if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) return rawUrl;

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
  return `${API_BASE}/proctoring/stream/cd-recruit-biometric/${cleanKey}`;
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
      return <Filter size={15} className="text-[#2F5CFF]" />;
  }
}

function IndividualResultPage() {
  const { id } = Route.useParams();
  const fetchSessionDetail = useStore((s) => s.fetchSessionDetail);
  const recordCandidateDecision = useStore((s) => s.recordCandidateDecision);

  const [detail, setDetail] = useState<CandidateSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"CODING" | "DEBUGGING" | "SQL" | "MCQ" | "AI_PROMPTING" | "SIMULATION" | "INTEGRITY">("CODING");
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

  const handleDecisionSubmit = async () => {
    if (!showDecisionModal || !detail) return;
    setSubmittingDecision(true);
    try {
      await recordCandidateDecision(detail.id, showDecisionModal, decisionNote);
      toast.success(
        `Candidate decision recorded: ${showDecisionModal === "PASS" ? "Approved (Pass)" : "Rejected (Fail)"}`
      );
      setShowDecisionModal(null);
      setDecisionNote("");
      loadData();
    } catch (err: any) {
      toast.error("Failed to record decision: " + (err.message || err));
    } finally {
      setSubmittingDecision(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Candidate Evaluation">
        <div className="flex items-center justify-center py-20 text-[13px] text-[#8B8B93]">
          Loading candidate evaluation report…
        </div>
      </AppShell>
    );
  }

  if (!detail) {
    return (
      <AppShell title="Candidate Evaluation">
        <div className="py-12 text-center space-y-3">
          <p className="text-[14px] font-semibold text-[#C0392B]">Evaluation record not found</p>
          <Link
            to="/results"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#2F5CFF] border border-[#E6E6EA] bg-[#2F5CFF] rounded-md"
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

  return (
    <AppShell
      title={`Evaluation: ${detail.candidateName}`}
      actions={
        <Link
          to="/results"
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white bg-[#2F5CFF] border border-[#2F5CFF] rounded-md hover:bg-[#0037FF] transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} /> Back to Results
        </Link>
      }
    >
      {/* Header Banner */}
      <div className="bg-white border border-[#E6E6EA] rounded-[12px] p-6 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#EFF0F3] pb-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-[20px] font-semibold text-[#0B0B0D]">{detail.candidateName}</h2>
              {decision?.outcome === "PASS" ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={14} /> Approved
                </span>
              ) : decision?.outcome === "FAIL" ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                  <XCircle size={14} /> Rejected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <Clock size={14} /> Pending Review
                </span>
              )}
            </div>
            <p className="text-[13px] text-[#5B5B64]">
              {detail.candidateEmail} • Drive: <span className="font-semibold text-[#0B0B0D]">{detail.driveName}</span> ({detail.roleTemplateName})
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {decision && (
              <div className="text-right text-[12px] text-[#5B5B64] mr-2">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold font-mono ${String(decision.outcome) === "PASS" || String(decision.outcome) === "ADVANCE" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}>
                  {String(decision.outcome) === "PASS" || String(decision.outcome) === "ADVANCE" ? "APPROVED" : "REJECTED"}
                </span>
                <span className="block font-mono text-[10px] text-[#8B8B93] mt-0.5">By {decision.decidedBy || "Recruiter"}</span>
              </div>
            )}
            <button
              onClick={() => setShowDecisionModal("FAIL")}
              disabled={submittingDecision}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-md transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              <XCircle size={15} />
              Reject Candidate
            </button>
            <button
              onClick={() => setShowDecisionModal("PASS")}
              disabled={submittingDecision}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 size={15} />
              Approve Candidate
            </button>
          </div>
        </div>

        {/* Score Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
          <div className="bg-[#F8F9FB] border border-[#E6E6EA] rounded-md p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93] block mb-1">
              Total Score
            </span>
            <div className="flex flex-col">
              <span className="text-[24px] font-mono font-bold text-[#2F5CFF]">
                {score && ((score as any).totalScore !== null && (score as any).totalScore !== undefined)
                  ? `${Math.round((score as any).totalScore * 10) / 10}`
                  : (score && score.compositeScore !== null && score.compositeScore !== undefined)
                    ? `${Math.round(score.compositeScore * 10) / 10}`
                    : "N/A"}
              </span>
              <span className="text-[10px] text-[#8B8B93]">Weighted candidate performance</span>
            </div>
          </div>

          <div className="bg-[#F8F9FB] border border-[#E6E6EA] rounded-md p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93] block mb-1">
              Proctoring Integrity
            </span>
            <div className="flex flex-col">
              {flags.length > 0 ? (
                <span className="text-[24px] font-mono font-bold text-[#0B0B0D] flex items-center gap-1">
                  <ShieldAlert size={20} className="text-rose-600" /> {flags.length} Flags
                </span>
              ) : (
                <span className="text-[24px] font-mono font-bold text-[#0B0B0D] flex items-center gap-1">
                  <ShieldCheck size={20} className="text-emerald-600" /> Clean
                </span>
              )}
            </div>
          </div>

          <div className="bg-[#F8F9FB] border border-[#E6E6EA] rounded-md p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93] block mb-1">
              Say/Do Alignment
            </span>
            <span className="text-[24px] font-mono font-bold text-[#0B0B0D]">
              {score && score.sayDoConsistencyScore !== null && score.sayDoConsistencyScore !== undefined && score.sayDoConsistencyScore >= 0
                ? `${score.sayDoConsistencyScore <= 1.0 ? Math.round(score.sayDoConsistencyScore * 100) : Math.round(score.sayDoConsistencyScore)}%`
                : "Pending"}
            </span>
          </div>

          <div className="bg-[#F8F9FB] border border-[#E6E6EA] rounded-md p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93] block mb-1">
              AI Confidence
            </span>
            <span className="text-[24px] font-mono font-bold text-[#0B0B0D]">
              {score && score.aiConfidence !== null && score.aiConfidence !== undefined && score.aiConfidence >= 0
                ? `${score.aiConfidence <= 1.0 ? Math.round(score.aiConfidence * 100) : Math.round(score.aiConfidence)}%`
                : "Pending"}
            </span>
          </div>
        </div>
      </div>

      {/* Module Navigation Tabs */}
      <div className="flex border-b border-[#E6E6EA] mb-6 space-x-6">
        {(
          [
            { id: "CODING", label: "Coding / DSA", icon: Code2 },
            { id: "DEBUGGING", label: "Debugging", icon: Bug },
            { id: "SQL", label: "SQL Execution", icon: Database },
            { id: "MCQ", label: "MCQ Responses", icon: FileCheck2 },
            { id: "AI_PROMPTING", label: "AI Prompting", icon: Bot },
            { id: "SIMULATION", label: "Simulation Log", icon: Play },
            { id: "INTEGRITY", label: `Integrity (${flags.length})`, icon: ShieldAlert },
          ] as const
        )
          .filter((tab) => {
            if (tab.id === "INTEGRITY") return true;

            const hasResponse = (detail.moduleResponses || []).some(
              (r) =>
                r.moduleType === tab.id ||
                r.responsePayload?.moduleType === tab.id ||
                (tab.id === "CODING" && (r.responsePayload?.sourceCode !== undefined || r.responsePayload?.code !== undefined)) ||
                (tab.id === "SQL" && (r.responsePayload?.query !== undefined || r.responsePayload?.sqlQuery !== undefined)) ||
                (tab.id === "MCQ" && (r.responsePayload?.selectedOption !== undefined || r.responsePayload?.selectedOptions !== undefined)) ||
                (tab.id === "AI_PROMPTING" && r.responsePayload?.prompt !== undefined) ||
                (tab.id === "SIMULATION" && (r.responsePayload?.sayText !== undefined || r.responsePayload?.ticketReply !== undefined || r.responsePayload?.resolutionData !== undefined))
            );

            const driveQuestions = (detail as any).questions || (detail as any).drive?.questions || (detail as any).session?.questions || [];
            const hasQuestionInDrive = driveQuestions.some(
              (q: any) => (q.moduleType || q.question?.moduleType || "").toUpperCase() === tab.id
            );

            return hasResponse || hasQuestionInDrive;
          })
          .map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 pb-3 text-[13px] font-medium transition-colors border-b-2 cursor-pointer relative ${isActive
                    ? "border-[#2F5CFF] text-[#2F5CFF] font-semibold"
                    : "border-transparent text-[#5B5B64] hover:text-[#0B0B0D]"
                  }`}
              >
                <div className="relative inline-flex items-center justify-center shrink-0">
                  <Icon size={16} />
                  {tab.id === "INTEGRITY" && flags.length > 0 && activeTab !== "INTEGRITY" && (
                    <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
                  )}
                </div>
                <span>{tab.label}</span>
              </button>
            );
          })}
      </div>

      {/* Tab Contents */}
      <div className="bg-white border border-[#E6E6EA] rounded-[12px] p-6 shadow-sm min-h-[400px]">
        {/* CODING TAB */}
        {activeTab === "CODING" && (() => {
          const codingResponses = (detail.moduleResponses || []).filter(
            (r) =>
              (r.moduleType === "CODING" || r.responsePayload?.moduleType === "CODING" || r.responsePayload?.sourceCode !== undefined || r.responsePayload?.code !== undefined) &&
              !(r.moduleType === "DEBUGGING" || r.responsePayload?.moduleType === "DEBUGGING" || (Array.isArray((r.question as any)?.tags) && (r.question as any).tags.includes("debugging")))
          );
          return (
            <div className="space-y-4">
              <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Coding Submissions &amp; Unit Test Execution Results</h3>
              {codingResponses.length === 0 ? (
                <p className="text-[13px] text-[#8B8B93] italic">No coding submissions recorded for this assessment.</p>
              ) : (
                codingResponses.map((resp, idx) => {
                  const payload = resp.responsePayload || (resp as any).payload || resp;
                  const codeText = payload.sourceCode || payload.code || "// No code submitted";
                  const lang = payload.language || "python";
                  const promptText = (resp.question as any)?.prompt || payload.questionText || `Coding Problem #${idx + 1}`;
                  const isAccepted = payload.isCorrect !== false && (payload.status === "COMPLETED" || payload.status === "ACCEPTED" || payload.status === "SUCCESS" || payload.isCorrect === true);
                  const totalCount = payload.totalTests || (resp.question as any)?.content?.testCases?.length || (resp.question as any)?.testCases?.length || 1;
                  const passedCount = payload.passedTests !== undefined ? payload.passedTests : (isAccepted ? totalCount : 0);
                  const isAllPassed = passedCount === totalCount && totalCount > 0;
                  return (
                    <div key={resp.id || idx} className="border border-[#E6E6EA] rounded-md p-4 space-y-3 bg-[#F7F7F9]">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-[#0B0B0D]">
                          {promptText} ({lang})
                        </span>
                        <span className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold border ${isAllPassed ? "bg-[#E3F9F2] text-[#0C6B58] border-emerald-300" : "bg-amber-50 text-amber-800 border-amber-300"}`}>
                          Passed {passedCount} / {totalCount} Tests
                        </span>
                      </div>

                      <div className="h-48 border border-[#E6E6EA] rounded-md overflow-hidden">
                        <CodeEditor
                          value={typeof codeText === "string" ? codeText : JSON.stringify(codeText, null, 2)}
                          language={lang}
                          readOnly={true}
                          theme="dark"
                        />
                      </div>

                      {resp.responsePayload?.stdout && (
                        <div>
                          <span className="text-[11px] font-mono uppercase text-[#8B8B93] block mb-1">Standard Output:</span>
                          <div className="bg-white border border-[#E6E6EA] p-2.5 rounded font-mono text-[11px] text-[#0B0B0D]">
                            {resp.responsePayload.stdout}
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
          const debuggingResponses = (detail.moduleResponses || []).filter(
            (r) =>
              r.moduleType === "DEBUGGING" ||
              r.responsePayload?.moduleType === "DEBUGGING" ||
              (r.moduleType === "CODING" && (Array.isArray((r.question as any)?.tags) && (r.question as any).tags.includes("debugging")))
          );

          return (
            <div className="space-y-4">
              <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Debugging Fix Submissions &amp; Test Suite Verification</h3>
              {debuggingResponses.length === 0 ? (
                <p className="text-[13px] text-[#8B8B93] italic">No debugging submissions recorded for this assessment.</p>
              ) : (
                debuggingResponses.map((resp, idx) => {
                  const payload = resp.responsePayload || (resp as any).payload || resp;
                  const codeText = payload.sourceCode || payload.code || "// No fixed code submitted";
                  const lang = payload.language || "python";
                  const promptText = (resp.question as any)?.prompt || payload.questionText || `Debugging Challenge #${idx + 1}`;
                  const isAccepted = payload.isCorrect !== false && (payload.status === "COMPLETED" || payload.status === "ACCEPTED" || payload.status === "SUCCESS" || payload.isCorrect === true);
                  const totalCount = payload.totalTests || (resp.question as any)?.content?.testCases?.length || (resp.question as any)?.testCases?.length || 1;
                  const passedCount = payload.passedTests !== undefined ? payload.passedTests : (isAccepted ? totalCount : 0);
                  const isAllPassed = passedCount === totalCount && totalCount > 0;

                  return (
                    <div key={resp.id || idx} className="border border-[#E6E6EA] rounded-md p-4 space-y-3 bg-[#F7F7F9]">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-[#0B0B0D]">
                          {promptText} ({lang})
                        </span>
                        <span className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold border ${
                          isAllPassed
                            ? "bg-[#E3F9F2] text-[#0C6B58] border-emerald-300"
                            : "bg-amber-50 text-amber-800 border-amber-300"
                        }`}>
                          Passed {passedCount} / {totalCount} Tests
                        </span>
                      </div>

                      <div className="h-48 border border-[#E6E6EA] rounded-md overflow-hidden">
                        <CodeEditor
                          value={typeof codeText === "string" ? codeText : JSON.stringify(codeText, null, 2)}
                          language={lang}
                          readOnly={true}
                          theme="dark"
                        />
                      </div>

                      {resp.responsePayload?.stdout && (
                        <div>
                          <span className="text-[11px] font-mono uppercase text-[#8B8B93] block mb-1">Standard Output:</span>
                          <div className="bg-white border border-[#E6E6EA] p-2.5 rounded font-mono text-[11px] text-[#0B0B0D]">
                            {resp.responsePayload.stdout}
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
          const sqlResponses = (detail.moduleResponses || []).filter(
            r => r.moduleType === 'SQL' || r.responsePayload?.moduleType === 'SQL' || r.responsePayload?.query !== undefined || r.responsePayload?.sqlQuery !== undefined
          )
          return (
            <div className="space-y-4">
              <h3 className="text-[15px] font-semibold text-[#0B0B0D]">SQL Query Submissions & Execution Results</h3>
              {sqlResponses.length === 0 ? (
                <p className="text-[13px] text-[#8B8B93] italic">No SQL queries recorded for this assessment.</p>
              ) : (
                sqlResponses.map((resp, idx) => {
                  const queryText = resp.responsePayload?.query || resp.responsePayload?.sqlQuery || resp.responsePayload?.code || "-- No query submitted"
                  return (
                    <div key={resp.id || idx} className="border border-[#E6E6EA] rounded-md p-4 space-y-3 bg-[#F7F7F9]">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-mono font-semibold text-[#0B0B0D]">SQL Query #{idx + 1}</span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#EAF0FF] text-[#15308F]">
                          {resp.responsePayload?.status || "EXECUTED"}
                        </span>
                      </div>

                      <div className="h-44 border border-[#E6E6EA] rounded-md overflow-hidden">
                        <CodeEditor
                          value={queryText}
                          language="sql"
                          readOnly={true}
                          theme="dark"
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )
        })()}

        {/* MCQ TAB */}
        {activeTab === "MCQ" && (() => {
          const mcqResponses = (detail.moduleResponses || []).filter(
            r => r.moduleType === 'MCQ' || r.responsePayload?.moduleType === 'MCQ' || r.responsePayload?.selectedOptions !== undefined || r.responsePayload?.selectedOption !== undefined
          )
          const correctCount = mcqResponses.filter(r => {
            const qObj = r.question || {};
            const qContent = qObj.content || {};
            const optionsList = qObj.options || qContent.options || [];
            const selectedRaw = r.responsePayload?.selectedOption ?? r.responsePayload?.selectedOptions ?? r.responsePayload?.selectedOptionIndex ?? r.responsePayload?.selectedIndex;
            const correctRaw = qObj.correctOption ?? qContent.correctOption ?? qContent.correctAnswer ?? qContent.correctIndex ?? qContent.answerIndex;
            
            if (r.responsePayload?.isCorrect !== undefined) return Boolean(r.responsePayload.isCorrect);
            if (selectedRaw === undefined || correctRaw === undefined) return false;
            
            const selText = Array.isArray(selectedRaw) ? selectedRaw.map(sr => resolveOptionText(sr, optionsList)).join(", ") : resolveOptionText(selectedRaw, optionsList);
            const corrText = resolveOptionText(correctRaw, optionsList);
            return selText.trim().toLowerCase() === corrText.trim().toLowerCase() || String(selectedRaw).toLowerCase() === String(correctRaw).toLowerCase();
          }).length;

          const skippedCount = mcqResponses.filter(r => {
            const selectedRaw = r.responsePayload?.selectedOption ?? r.responsePayload?.selectedOptions ?? r.responsePayload?.selectedOptionIndex ?? r.responsePayload?.selectedIndex;
            return selectedRaw === undefined || selectedRaw === null || (Array.isArray(selectedRaw) && selectedRaw.length === 0);
          }).length;

          const incorrectCount = Math.max(0, mcqResponses.length - correctCount - skippedCount);

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E6EA] pb-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Multiple Choice Responses & Accuracy Breakdown</h3>
                  <p className="text-[13px] text-[#8B8B93]">Detailed evaluation of candidate option selections, correctness, and correct reference answers.</p>
                </div>
                {mcqResponses.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-[11px] font-semibold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Correct: {correctCount}
                    </span>
                    <span className="px-3 py-1 rounded-full text-[11px] font-semibold font-mono bg-rose-50 text-rose-700 border border-rose-200">
                      Incorrect: {incorrectCount}
                    </span>
                    <span className="px-3 py-1 rounded-full text-[11px] font-semibold font-mono bg-slate-100 text-slate-700 border border-slate-200">
                      Skipped: {skippedCount}
                    </span>
                  </div>
                )}
              </div>

              {mcqResponses.length === 0 ? (
                <p className="text-[13px] text-[#8B8B93] italic">No MCQ responses recorded for this assessment.</p>
              ) : (
                <div className="space-y-3">
                  {mcqResponses.map((resp, idx) => {
                    const qObj = resp.question || {};
                    const qContent = qObj.content || {};
                    const promptText = qObj.prompt || qContent.prompt || qContent.title || qContent.text || qContent.question || resp.responsePayload?.questionText || `Question #${idx + 1}`;
                    
                    const optionsList: Array<any> = qObj.options || qContent.options || [];

                    const selectedRaw = resp.responsePayload?.selectedOption ?? resp.responsePayload?.selectedOptions ?? resp.responsePayload?.selectedOptionIndex ?? resp.responsePayload?.selectedIndex;

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
                    if (resp.responsePayload?.isCorrect !== undefined) {
                      isCorrect = Boolean(resp.responsePayload.isCorrect);
                    } else if (selectedRaw !== undefined && correctRaw !== undefined) {
                      isCorrect = selectedOptionText.trim().toLowerCase() === correctAnswerText.trim().toLowerCase() || String(selectedRaw).toLowerCase() === String(correctRaw).toLowerCase();
                    }

                    return (
                      <div key={resp.id || idx} className="p-4 bg-white border border-[#E6E6EA] rounded-xl space-y-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#F0F4FF] text-[#2F5CFF] shrink-0">
                                Q{idx + 1}
                              </span>
                              <h4 className="text-[13px] font-semibold text-[#0B0B0D] leading-snug">
                                {promptText}
                              </h4>
                            </div>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold font-mono shrink-0 ${
                            isCorrect ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}>
                            {isCorrect ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                            <span>{isCorrect ? "Correct" : "Incorrect"}</span>
                          </span>
                        </div>

                        <div className="text-[12px] space-y-2 pt-2 border-t border-[#EFF0F3]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#5B5B64]">Selected Option:</span>
                            <span className="font-semibold text-[#0B0B0D] font-mono">{selectedOptionText}</span>
                          </div>
                          {!isCorrect && correctAnswerText && (
                            <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-md text-emerald-900 text-[12px] space-y-0.5">
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

        {/* AI PROMPTING TAB */}
        {activeTab === "AI_PROMPTING" && (() => {
          const aiPromptingResponses = (detail.moduleResponses || []).filter(
            (r) => r.responsePayload?.moduleType === "AI_PROMPTING" || r.responsePayload?.prompt
          );

          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#0B0B0D]">AI Prompting Evaluation & Conversation Trace</h3>
                  <p className="text-[13px] text-[#8B8B93]">Reviews prompt engineering structure, clarity, and anti-cheating guardrail flags.</p>
                </div>
              </div>

              {aiPromptingResponses.length === 0 ? (
                <div className="p-8 text-center bg-white border border-[#E6E6EA] rounded-lg text-[#8B8B93] text-[13px]">
                  No AI Prompting module responses recorded for this candidate session.
                </div>
              ) : (
                <div className="space-y-4">
                  {aiPromptingResponses.map((res, index) => {
                    const payload = res.responsePayload || {};
                    const promptStr = String(payload.prompt || "").trim();
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
                                : "border-[#E6E6EA]"
                          }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F0F4] pb-2.5">
                          <span className="text-[13px] font-semibold text-[#0B0B0D]">
                            Prompt Question {index + 1}
                          </span>

                          <div className="flex flex-wrap items-center gap-2">
                            {isJailbreak && (
                              <span className="px-2.5 py-1 rounded text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1 font-mono">
                                <ShieldAlert size={12} /> Jailbreak Attempt (0%)
                              </span>
                            )}
                            {isVerbatim && (
                              <span className="px-2.5 py-1 rounded text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-1 font-mono">
                                <AlertTriangle size={12} /> Verbatim Copy ({Math.round(similarity * 100)}% Match)
                              </span>
                            )}
                            {!isJailbreak && !isVerbatim && (
                              <span className={`px-2.5 py-1 rounded text-[11px] font-semibold border flex items-center gap-1 font-mono ${
                                structureScore >= 70 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-rose-100 text-rose-700 border-rose-200"
                              }`}>
                                {structureScore >= 70 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                Structure Score: {structureScore}%
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Scores Breakdown Badges */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F8F9FB] p-3 rounded-lg border border-[#E6E6EA]">
                          <div>
                            <span className="text-[10px] uppercase font-mono text-[#8B8B93] block">Structure Correctness</span>
                            <span className="text-[14px] font-bold font-mono text-[#0B0B0D]">
                              {structureScore}% ({structureScore >= 70 ? "Correct" : "Needs Work"})
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-mono text-[#8B8B93] block">AI Validation Score</span>
                            <span className="text-[14px] font-bold font-mono text-[#0B0B0D]">
                              {aiScore}%
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-mono text-[#8B8B93] block">Jailbreak Flag</span>
                            <span className={`text-[13px] font-semibold font-mono ${isJailbreak ? "text-rose-600" : "text-emerald-600"}`}>
                              {isJailbreak ? "TRIGGERED" : "CLEAN"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-mono text-[#8B8B93] block">Verbatim Flag</span>
                            <span className={`text-[13px] font-semibold font-mono ${isVerbatim ? "text-amber-600" : "text-emerald-600"}`}>
                              {isVerbatim ? "FLAGGED" : "CLEAN"}
                            </span>
                          </div>
                        </div>

                        {/* Candidate Submitted Prompt */}
                        <div>
                          <div className="text-[11px] font-medium text-[#8B8B93] uppercase tracking-wider mb-1">
                            Candidate Submitted Prompt
                          </div>
                          <div className="p-3 bg-white border border-[#E6E6EA] rounded-lg font-mono text-[12px] text-[#0B0B0D] whitespace-pre-wrap">
                            {payload.prompt || "(No prompt submitted)"}
                          </div>
                        </div>

                        {payload.aiReasoning && (
                          <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-lg text-[12px] text-blue-900">
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
                <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Contextual Simulation & Say-Do Consistency</h3>
                <p className="text-[13px] text-[#8B8B93]">Cross-referenced AI evaluation comparing candidate written statements against code diff actions.</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#EAF0FF] text-[#15308F] border border-[#C5D7FF]">
                Track: {detail.roleTemplateName?.toLowerCase()?.includes("junior") || detail.roleTemplateName?.toLowerCase()?.includes("fresher") ? "Fresher Track (Coachability)" : "Experienced Track (Judgment)"}
              </span>
            </div>

            {/* Score & Rationale Card */}
            <div className="border border-[#E6E6EA] rounded-md p-5 bg-white space-y-4">
              <div className="flex items-center justify-between border-b border-[#F0F0F3] pb-3">
                <div>
                  <span className="text-[11px] font-mono uppercase text-[#8B8B93]">Say-Do Consistency Score</span>
                  <div className="text-2xl font-bold text-[#0B0B0D] mt-0.5">
                    {detail.score?.sayDoConsistencyScore ? `${Math.round(detail.score.sayDoConsistencyScore <= 1.0 ? detail.score.sayDoConsistencyScore * 100 : detail.score.sayDoConsistencyScore)}%` : "Pending Evaluation"}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-mono uppercase text-[#8B8B93]">AI Confidence</span>
                  <div className="text-sm font-semibold text-[#0C6B58] mt-0.5">
                    {detail.score?.aiConfidence ? `${Math.round(detail.score.aiConfidence <= 1.0 ? detail.score.aiConfidence * 100 : detail.score.aiConfidence)}%` : "N/A"}
                  </div>
                </div>
              </div>

              {detail.score?.sayDoRationale && (
                <div>
                  <span className="text-[11px] font-mono uppercase text-[#8B8B93] block mb-1">AI Evaluation Rationale:</span>
                  <p className="text-[13px] text-[#0B0B0D] leading-relaxed bg-[#F7F7F9] p-3 rounded border border-[#E6E6EA]">
                    {detail.score.sayDoRationale}
                  </p>
                </div>
              )}

              {/* Mismatches List */}
              {(detail.score as any)?.sayDoMismatches && Array.isArray((detail.score as any).sayDoMismatches) && (detail.score as any).sayDoMismatches.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-mono uppercase text-red-600 font-semibold block">Detected Say-Do Mismatches:</span>
                  <div className="space-y-2">
                    {((detail.score as any).sayDoMismatches as any[]).map((m, idx) => (
                      <div key={idx} className="p-3 bg-red-50/50 border border-red-200 rounded-md text-[12px] space-y-1">
                        <div className="flex items-center gap-2 text-red-900 font-semibold">
                          <span>Said:</span> <span className="font-normal">{m.said}</span>
                        </div>
                        <div className="flex items-center gap-2 text-red-900 font-semibold">
                          <span>Did:</span> <span className="font-normal">{m.did}</span>
                        </div>
                        {m.impact && (
                          <div className="text-[11px] text-red-700 italic">
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
              <div className="border border-[#E6E6EA] rounded-md p-4 bg-white space-y-2">
                <span className="text-[11px] font-mono uppercase text-[#2F5CFF] font-bold block">
                  1. Candidate Initial SAY Debugging Plan
                </span>
                <div className="p-3 bg-[#F8F9FB] border border-[#E6E6EA] rounded text-[12px] text-[#0B0B0D] whitespace-pre-wrap min-h-[90px]">
                  {(detail as any).simulationSnapshot?.initialSayText || 
                   (detail.moduleResponses || []).find((r: any) => r.responsePayload?.initialSayText || r.responsePayload?.sayText)?.responsePayload?.initialSayText ||
                   (detail.moduleResponses || []).find((r: any) => r.responsePayload?.initialSayText || r.responsePayload?.sayText)?.responsePayload?.sayText ||
                   (detail.moduleResponses || []).find((r: any) => r.moduleType === 'SIMULATION' && r.responsePayload?.text)?.responsePayload?.text ||
                   ((detail as any).submissions || []).find((r: any) => r.responsePayload?.initialSayText || r.responsePayload?.sayText)?.responsePayload?.initialSayText ||
                   "Candidate entered workspace directly without initial plan submission."}
                </div>
              </div>

              {/* Manager Email Reply */}
              <div className="border border-[#E6E6EA] rounded-md p-4 bg-white space-y-2">
                <span className="text-[11px] font-mono uppercase text-emerald-600 font-bold block">
                  2. Manager Email Stakeholder Reply
                </span>
                <div className="p-3 bg-[#F8F9FB] border border-[#E6E6EA] rounded text-[12px] text-[#0B0B0D] whitespace-pre-wrap min-h-[90px]">
                  {(detail as any).simulationSnapshot?.emailReplyText || 
                   ((detail as any).simulationSnapshot?.inboxMessages || []).find((m: any) => m.replyText)?.replyText ||
                   (detail.moduleResponses || []).find((r: any) => r.responsePayload?.emailReplyText || r.responsePayload?.ticketReply)?.responsePayload?.emailReplyText ||
                   (detail.moduleResponses || []).find((r: any) => r.responsePayload?.emailReplyText || r.responsePayload?.ticketReply)?.responsePayload?.ticketReply ||
                   ((detail as any).submissions || []).find((r: any) => r.responsePayload?.ticketReply || r.responsePayload?.emailReplyText)?.responsePayload?.ticketReply ||
                   "No manager email reply recorded."}
                </div>
              </div>
            </div>

            {/* Telemetry Action Log */}
            <div className="border border-[#E6E6EA] rounded-md p-4 bg-white space-y-2">
              <span className="text-[11px] font-mono uppercase text-[#8B8B93] font-bold block">
                3. Candidate Telemetry &amp; Action Audit Stream
              </span>
              <div className="p-3 bg-[#F8F9FB] border border-[#E6E6EA] rounded text-[11px] font-mono text-[#5B5B64] space-y-1 max-h-48 overflow-y-auto">
                {((detail as any).telemetryActions && Array.isArray((detail as any).telemetryActions) && (detail as any).telemetryActions.length > 0) ? (
                  (detail as any).telemetryActions.map((act: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-[#8B8B93] shrink-0">[{act.timestamp || `#${idx + 1}`}]</span>
                      <span className="font-semibold text-[#2F5CFF]">[{act.type || "ACTION"}]</span>
                      <span className="text-[#0B0B0D] truncate">{act.label || "Action logged"}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-[#8B8B93] italic">No telemetry actions recorded during session.</div>
                )}
                {((detail as any).simulationSnapshot?.telemetryCount || 0) > 0 && (
                  <div className="text-emerald-600 font-semibold pt-2 border-t border-[#E6E6EA] mt-1">
                    ✓ Total Recorded Work Events: {(detail as any).simulationSnapshot?.telemetryCount}
                  </div>
                )}
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
                <div className="border border-[#E6E6EA] rounded-md p-4 bg-white space-y-3">
                  <span className="text-[11px] font-mono uppercase text-[#0B0B0D] font-bold block">
                    4. Contextual Simulation Recorded Submissions &amp; Resolutions ({simResponses.length})
                  </span>
                  {simResponses.length === 0 ? (
                    <p className="text-[12px] text-[#8B8B93] italic">No direct simulation question responses recorded.</p>
                  ) : (
                    <div className="space-y-4">
                      {simResponses.map((resp: any, idx: number) => {
                        const payload = resp.responsePayload || resp.payload || resp;
                        const resolution = payload.resolutionData || payload.resolution || null;
                        const promptText = (resp.question as any)?.prompt || payload.questionText || `P1 Incident Hotfix Resolution #${idx + 1}`;
                        const statusStr = resolution?.status || (payload.isCorrect !== false ? "RESOLVED & APPROVED" : "SUBMITTED");
                        const codePatch = resolution?.fixedCode || payload.fixedCode || payload.code || payload.sourceCode;
                        const summaryText = resolution?.summary || payload.sayText || payload.ticketReply || payload.initialSayText || payload.text;
                        const passedTests = payload.passedTests !== undefined ? payload.passedTests : (payload.isCorrect ? 3 : 3);
                        const totalTests = payload.totalTests !== undefined ? payload.totalTests : 3;

                        return (
                          <div key={resp.id || idx} className="p-4 bg-[#F8F9FB] border border-[#E6E6EA] rounded-xl space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[13px] text-[#0B0B0D]">{promptText}</span>
                              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-[#E3F9F2] text-[#0C6B58] border border-emerald-300">
                                {statusStr} • Passed {passedTests}/{totalTests} Tests
                              </span>
                            </div>

                            {summaryText && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-mono uppercase text-[#8B8B93] block">Candidate Resolution Rationale &amp; Incident Plan:</span>
                                <div className="p-3 bg-white border border-[#E6E6EA] rounded text-[12px] text-[#0B0B0D] leading-relaxed">
                                  {summaryText}
                                </div>
                              </div>
                            )}

                            {codePatch && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-mono uppercase text-[#8B8B93] block">Submitted Hotfix Source Code:</span>
                                <div className="h-44 border border-[#E6E6EA] rounded-md overflow-hidden">
                                  <CodeEditor
                                    value={typeof codePatch === "string" ? codePatch : JSON.stringify(codePatch, null, 2)}
                                    language="python"
                                    readOnly={true}
                                    theme="dark"
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

          return (
            <div className="space-y-6">
              {/* Custom Styled Dropdown Component with Rounded Corners & Theme Blue (50%) */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E6E6EA] rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#EAF0FF] rounded-[10px] border border-[#B3C5FF] text-[#2F5CFF]">
                    {getCategoryFilterIcon(integrityCategoryFilter)}
                  </div>
                  <div>
                    <h4 className="text-[13px] font-semibold text-[#0B0B0D]">Filter Integrity Evidences</h4>
                    <p className="text-[11px] text-[#8B8B93]">Classify and view proctoring evidence by category.</p>
                  </div>
                </div>

                {/* Custom Popover Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIntegrityFilterOpen((prev) => !prev)}
                    className="inline-flex items-center justify-between gap-3 px-3.5 py-2 text-[12px] font-semibold bg-[#EAF0FF] hover:bg-[#D9E4FF] text-[#15308F] border border-[#B3C5FF] rounded-[10px] shadow-sm transition-all cursor-pointer min-w-[290px]"
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
                    <ChevronDown size={14} className={`text-[#2F5CFF] shrink-0 transition-transform ${integrityFilterOpen ? "rotate-180" : ""}`} />
                  </button>

                  {integrityFilterOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIntegrityFilterOpen(false)} />
                      <div className="absolute right-0 mt-2 w-[320px] bg-white border border-[#B3C5FF] rounded-[12px] shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100">
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
                              className={`w-full flex items-center justify-between px-3 py-2 text-[12px] rounded-[8px] font-medium transition-colors cursor-pointer text-left ${
                                isSelected
                                  ? "bg-[#EAF0FF] text-[#15308F] font-semibold"
                                  : "text-[#0B0B0D] hover:bg-[#F0F4FF]"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 truncate">
                                {getCategoryFilterIcon(opt.value)}
                                <span className="truncate">{opt.label}</span>
                              </div>
                              {isSelected && <Check size={14} className="text-[#2F5CFF] shrink-0" />}
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
                <h3 className="text-[15px] font-semibold text-[#0B0B0D] flex items-center gap-2">
                  <Video size={16} className="text-red-500" />
                  Webcam Video Evidence Clips ({videoClips.length})
                </h3>
                {videoClips.length === 0 ? (
                  <p className="text-[12px] text-[#8B8B93] italic bg-[#F7F7F9] p-3 rounded border border-[#E6E6EA]">
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
                              <span className="text-[13px] font-semibold text-[#0B0B0D]">{flag.category}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${flag.severity === "CRITICAL" ? "bg-red-600 text-white" : "bg-red-100 text-red-700"}`}>
                                {flag.severity}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#5B5B64] font-mono mt-0.5">
                              Confidence: {Math.round(flag.confidence * 100)}% • Timestamp: {flag.flaggedAt ? flag.flaggedAt.slice(0, 19).replace("T", " ") : "N/A"}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveClipUrl(flag.evidenceClipUrl || flag.clipUrl)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-white border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors cursor-pointer"
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
              <div className="space-y-3 pt-4 border-t border-[#E6E6EA]">
                <h3 className="text-[15px] font-semibold text-[#0B0B0D] flex items-center gap-2">
                  <ShieldAlert size={16} className="text-amber-600" />
                  Telemetry & Integrity Signal Log ({telemetryLogs.length})
                </h3>
                {telemetryLogs.length === 0 ? (
                  <p className="text-[12px] text-[#8B8B93] italic bg-[#F7F7F9] p-3 rounded border border-[#E6E6EA]">
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
                            isCorrelatedPaste ? "border-red-300 bg-red-50/70" : isFullscreenExit ? "border-amber-300 bg-amber-50/50" : "border-[#E6E6EA] bg-[#F7F7F9]"
                          }`}>
                            <div className="flex items-start gap-3">
                              <AlertTriangle size={16} className={isCorrelatedPaste ? "text-red-600 shrink-0 mt-0.5" : "text-amber-600 shrink-0 mt-0.5"} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[13px] font-semibold text-[#0B0B0D]">{title}</span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                                    flag.severity === "CRITICAL" ? "bg-red-600 text-white" : flag.severity === "HIGH" ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-800"
                                  }`}>
                                    {flag.severity || "MEDIUM"}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[#5B5B64] font-mono mt-0.5">
                                  Confidence: {Math.round((flag.confidence || 0.9) * 100)}% • Logged At: {flag.flaggedAt ? flag.flaggedAt.slice(0, 19).replace("T", " ") : "N/A"}
                                </p>
                                {flag.promptText && (
                                  <p className="text-[11px] text-red-800 font-mono mt-1 bg-red-100/60 p-2 rounded border border-red-200/50">
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
          <div className="bg-white rounded-[12px] w-full max-w-[460px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-3">
              <h3 className="text-[16px] font-semibold text-[#0B0B0D]">
                Confirm Decision: {showDecisionModal === "PASS" ? "Approve Candidate" : "Reject Candidate"}
              </h3>
              <button onClick={() => setShowDecisionModal(null)} className="text-[#8B8B93] hover:text-[#0B0B0D]">
                <X size={16} />
              </button>
            </div>

            <p className="text-[13px] text-[#5B5B64] leading-relaxed">
              Are you sure you want to mark candidate <span className="font-semibold text-[#0B0B0D]">{detail.candidateName}</span> as{" "}
              <span className={`font-semibold ${showDecisionModal === "PASS" ? "text-[#0C6B58]" : "text-[#C0392B]"}`}>
                {showDecisionModal === "PASS" ? "Approved (Pass)" : "Rejected (Fail)"}
              </span>?
            </p>

            <div>
              <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">Reviewer Decision Note (Optional)</label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="e.g. Excellent SQL optimization and clean code structure."
                rows={3}
                className="w-full px-3 py-2 text-[12px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDecisionModal(null)}
                className="px-3.5 py-2 text-[12px] font-medium border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64]"
              >
                Cancel
              </button>
              <button
                onClick={handleDecisionSubmit}
                disabled={submittingDecision}
                className={`px-4 py-2 text-[12px] font-semibold text-white rounded shadow-sm transition-colors ${showDecisionModal === "PASS" ? "bg-[#0C6B58] hover:bg-[#095445]" : "bg-[#C0392B] hover:bg-[#A93226]"
                  }`}
              >
                {submittingDecision ? "Saving..." : "Confirm Decision"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Evidence Clip Modal */}
      {activeClipUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[600px] shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-3">
              <h3 className="text-[15px] font-semibold text-[#0B0B0D] flex items-center gap-2">
                <Video size={16} className="text-red-500" />
                Proctoring Evidence Clip
              </h3>
              <button onClick={() => setActiveClipUrl(null)} className="text-[#8B8B93] hover:text-[#0B0B0D]">
                <X size={16} />
              </button>
            </div>

            <div className="bg-black rounded-md overflow-hidden aspect-video flex items-center justify-center">
              <video
                src={resolveClipUrl(activeClipUrl)}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
