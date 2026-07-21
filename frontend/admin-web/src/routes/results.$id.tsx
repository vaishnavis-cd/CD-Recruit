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
  FileText,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore } from "../lib/store";
import type { CandidateSessionDetail } from "../lib/types";

export const Route = createFileRoute("/results/$id")({
  component: IndividualResultPage,
  head: () => ({
    meta: [
      { title: "Candidate Evaluation — CD-Recruit" },
      {
        name: "description",
        content: "Detailed candidate evaluation, code execution review, integrity flags, and hiring decision recording.",
      },
    ],
  }),
});

function IndividualResultPage() {
  const { id } = useParams({ from: "/results/$id" });
  const fetchSessionDetail = useStore((s) => s.fetchSessionDetail);
  const recordCandidateDecision = useStore((s) => s.recordCandidateDecision);

  const [detail, setDetail] = useState<CandidateSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"CODING" | "SQL" | "MCQ" | "AI_PROMPTING" | "SIMULATION" | "INTEGRITY">("CODING");

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
      setDetail(data);
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
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#E3F9F2] text-[#0C6B58]">
                  <CheckCircle2 size={14} /> Approved
                </span>
              ) : decision?.outcome === "FAIL" ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#FFF5F5] text-[#C0392B]">
                  <XCircle size={14} /> Rejected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold bg-amber-50 text-amber-700">
                  <Clock size={14} /> Pending Review
                </span>
              )}
            </div>
            <p className="text-[13px] text-[#5B5B64]">
              {detail.candidateEmail} • Drive: <span className="font-semibold text-[#0B0B0D]">{detail.driveName}</span> ({detail.roleTemplateName})
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {!decision ? (
              <>
                <button
                  onClick={() => setShowDecisionModal("FAIL")}
                  className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-[#C0392B] bg-[#FFF5F5] border border-[#FECACA] hover:bg-[#FEE2E2] rounded-md transition-colors cursor-pointer shadow-sm"
                >
                  <XCircle size={15} />
                  Reject Candidate
                </button>
                <button
                  onClick={() => setShowDecisionModal("PASS")}
                  className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white bg-[#0C6B58] hover:bg-[#095445] rounded-md transition-colors cursor-pointer shadow-sm"
                >
                  <CheckCircle2 size={15} />
                  Approve Candidate
                </button>
              </>
            ) : (
              <div className="text-right text-[12px] text-[#5B5B64]">
                <span className="block font-semibold text-[#0B0B0D]">Decided by {decision.decidedBy}</span>
                <span className="font-mono text-[11px] text-[#8B8B93]">{decision.decidedAt.slice(0, 10)}</span>
                {decision.note && <p className="italic text-[11px] mt-0.5 text-[#5B5B64]">"{decision.note}"</p>}
              </div>
            )}
          </div>
        </div>

        {/* Score Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
          <div className="bg-[#F7F7F9] border border-[#E6E6EA] rounded-md p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93] block mb-1">
              Composite Score
            </span>
            <span className="text-[24px] font-mono font-bold text-[#2F5CFF]">
              {score ? `${score.compositeScore}%` : "N/A"}
            </span>
          </div>

          <div className="bg-[#F7F7F9] border border-[#E6E6EA] rounded-md p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93] block mb-1">
              Say/Do Alignment
            </span>
            <span className="text-[24px] font-mono font-bold text-[#0C6B58]">
              {score ? `${Math.round(score.sayDoConsistencyScore * 100)}%` : "N/A"}
            </span>
          </div>

          <div className="bg-[#F7F7F9] border border-[#E6E6EA] rounded-md p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93] block mb-1">
              AI Confidence
            </span>
            <span className="text-[24px] font-mono font-bold text-amber-700">
              {score ? `${Math.round(score.aiConfidence * 100)}%` : "N/A"}
            </span>
          </div>

          <div className="bg-[#F7F7F9] border border-[#E6E6EA] rounded-md p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93] block mb-1">
              Integrity Flags
            </span>
            <div className="flex items-center gap-1.5">
              {flags.length > 0 ? (
                <span className="text-[24px] font-mono font-bold text-[#C0392B] flex items-center gap-1">
                  <ShieldAlert size={20} /> {flags.length}
                </span>
              ) : (
                <span className="text-[24px] font-mono font-bold text-[#0C6B58] flex items-center gap-1">
                  <ShieldCheck size={20} /> Clean
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Module Navigation Tabs */}
      <div className="flex border-b border-[#E6E6EA] mb-6 space-x-6">
        {(
          [
            { id: "CODING", label: "Coding / DSA", icon: Code2 },
            { id: "SQL", label: "SQL Execution", icon: Database },
            { id: "MCQ", label: "MCQ Responses", icon: FileCheck2 },
            { id: "AI_PROMPTING", label: "AI Prompting", icon: Bot },
            { id: "SIMULATION", label: "Simulation Log", icon: Play },
            { id: "INTEGRITY", label: `Integrity (${flags.length})`, icon: ShieldAlert },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 pb-3 text-[13px] font-medium transition-colors border-b-2 cursor-pointer ${
                isActive
                  ? "border-[#2F5CFF] text-[#2F5CFF] font-semibold"
                  : "border-transparent text-[#5B5B64] hover:text-[#0B0B0D]"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="bg-white border border-[#E6E6EA] rounded-[12px] p-6 shadow-sm min-h-[400px]">
        {/* CODING TAB */}
        {activeTab === "CODING" && (
          <div className="space-y-4">
            <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Submitted Code & Unit Test Results</h3>
            {detail.moduleResponses.filter(r => r.responsePayload?.code !== undefined).length === 0 ? (
              <p className="text-[13px] text-[#8B8B93] italic">No coding submissions recorded for this assessment.</p>
            ) : (
              detail.moduleResponses
                .filter(r => r.responsePayload?.code !== undefined)
                .map((resp, idx) => (
                  <div key={resp.id} className="border border-[#E6E6EA] rounded-md p-4 space-y-3 bg-[#F7F7F9]">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-mono font-semibold text-[#0B0B0D]">
                        Problem #{idx + 1} ({resp.responsePayload?.language || "javascript"})
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#E3F9F2] text-[#0C6B58]">
                        Passed {resp.responsePayload?.passedTests || 0} / {resp.responsePayload?.totalTests || 0} Tests
                      </span>
                    </div>

                    <div className="bg-[#0B0B0D] text-emerald-400 font-mono text-[12px] p-4 rounded-md overflow-x-auto leading-relaxed">
                      <pre>{resp.responsePayload?.code || "// No code submitted"}</pre>
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
                ))
            )}
          </div>
        )}

        {/* SQL TAB */}
        {activeTab === "SQL" && (
          <div className="space-y-4">
            <h3 className="text-[15px] font-semibold text-[#0B0B0D]">SQL Query Submissions & Execution Results</h3>
            {detail.moduleResponses.filter(r => r.responsePayload?.sqlQuery !== undefined).length === 0 ? (
              <p className="text-[13px] text-[#8B8B93] italic">No SQL queries recorded for this assessment.</p>
            ) : (
              detail.moduleResponses
                .filter(r => r.responsePayload?.sqlQuery !== undefined)
                .map((resp, idx) => (
                  <div key={resp.id} className="border border-[#E6E6EA] rounded-md p-4 space-y-3 bg-[#F7F7F9]">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-mono font-semibold text-[#0B0B0D]">SQL Query #{idx + 1}</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#EAF0FF] text-[#15308F]">
                        {resp.responsePayload?.status || "EXECUTED"}
                      </span>
                    </div>

                    <div className="bg-[#0B0B0D] text-blue-300 font-mono text-[12px] p-4 rounded-md overflow-x-auto">
                      <pre>{resp.responsePayload?.sqlQuery || "-- No query submitted"}</pre>
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* MCQ TAB */}
        {activeTab === "MCQ" && (
          <div className="space-y-4">
            <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Multiple Choice Answers</h3>
            <div className="divide-y divide-[#EFF0F3]">
              {detail.moduleResponses
                .filter(r => r.responsePayload?.selectedOption !== undefined)
                .map((resp, idx) => (
                  <div key={resp.id} className="py-3 flex items-start justify-between">
                    <div>
                      <span className="text-[12px] font-semibold text-[#0B0B0D]">Question #{idx + 1}</span>
                      <p className="text-[12px] text-[#5B5B64] mt-0.5">Selected Option: <span className="font-mono font-semibold text-[#0B0B0D]">{resp.responsePayload?.selectedOption}</span></p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium ${
                      resp.responsePayload?.isCorrect ? "bg-[#E3F9F2] text-[#0C6B58]" : "bg-[#FFF5F5] text-[#C0392B]"
                    }`}>
                      {resp.responsePayload?.isCorrect ? "Correct (+1)" : "Incorrect (0)"}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* AI PROMPTING TAB */}
        {activeTab === "AI_PROMPTING" && (
          <div className="space-y-4">
            <h3 className="text-[15px] font-semibold text-[#0B0B0D]">AI Prompting Conversation Trace</h3>
            <p className="text-[13px] text-[#8B8B93]">Evaluates prompt engineering efficiency, clarity, and context utilization.</p>
          </div>
        )}

        {/* SIMULATION TAB */}
        {activeTab === "SIMULATION" && (
          <div className="space-y-4">
            <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Recruiter Simulation Timeline & Actions</h3>
            <p className="text-[13px] text-[#8B8B93]">Chronological record of candidate simulation responses and event triggers.</p>
          </div>
        )}

        {/* INTEGRITY TAB */}
        {activeTab === "INTEGRITY" && (
          <div className="space-y-4">
            <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Integrity Telemetry & Proctoring Flags</h3>
            {flags.length === 0 ? (
              <div className="p-6 bg-[#E3F9F2] border border-[#A3EED7] rounded-md text-center text-[#0C6B58] text-[13px]">
                <ShieldCheck size={24} className="mx-auto mb-1.5" />
                No proctoring anomalies or integrity flags recorded. Assessment passed automated integrity validation.
              </div>
            ) : (
              <div className="space-y-3">
                {flags.map((flag) => (
                  <div key={flag.id} className="p-4 border border-red-200 bg-red-50/50 rounded-md flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-[#0B0B0D]">{flag.category}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                            flag.severity === "CRITICAL" ? "bg-red-600 text-white" : "bg-red-100 text-red-700"
                          }`}>
                            {flag.severity}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5B5B64] font-mono mt-0.5">
                          Confidence: {Math.round(flag.confidence * 100)}% • Flagged At: {flag.flaggedAt.slice(0, 19).replace("T", " ")}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveClipUrl(`/proctoring/clips/${flag.id}.webm`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-white border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Video size={13} />
                      View Clip
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
                className={`px-4 py-2 text-[12px] font-semibold text-white rounded shadow-sm transition-colors ${
                  showDecisionModal === "PASS" ? "bg-[#0C6B58] hover:bg-[#095445]" : "bg-[#C0392B] hover:bg-[#A93226]"
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

            <div className="bg-black rounded-md overflow-hidden aspect-video flex items-center justify-center text-white text-[13px] font-mono">
              [Proctoring Evidence Video Stream Player]
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setActiveClipUrl(null)}
                className="px-4 py-1.5 text-[12px] font-medium border border-[#E6E6EA] rounded hover:bg-[#F7F7F9]"
              >
                Close Clip
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
