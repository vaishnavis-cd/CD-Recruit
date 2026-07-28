import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { X, AlertTriangle, ShieldCheck, ExternalLink } from "lucide-react";
import { ScopePanel } from "./scope-panel";
import type { Session } from "../lib/types";
import { useStore, API_BASE } from "../lib/store";

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

const STATUS_LABEL: Record<Session["status"], string> = {
  submitted: "Submitted",
  ai_scored: "AI Scored",
  review: "Needs Review",
  reviewed: "Reviewed",
  decision: "Decision Made",
};

const STATUS_TONE: Record<Session["status"], string> = {
  submitted: "bg-[#EFF0F3] text-[#0B0B0D]",
  ai_scored: "bg-[#EAF0FF] text-[#15308F]",
  review: "bg-[#FFF4DC] text-[#8A5A00]",
  reviewed: "bg-[#E4F8EC] text-[#0F7F3E]",
  decision: "bg-[#0B0B0D] text-white",
};

export function StatusPill({ status }: { status: Session["status"] }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-[0.14em] ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function SessionDetailBody({
  sessionId,
  onClose,
  embedded,
}: {
  sessionId: string;
  onClose?: () => void;
  embedded?: boolean;
}) {
  const session = useStore((s) => s.sessions.find((x) => x.id === sessionId));
  const recordDecision = useStore((s) => s.recordDecision);
  const [noteText, setNoteText] = useState("");
  const [tab, setTab] = useState<"saydo" | "overview" | "timeline">("saydo");
  const [evidenceOpen, setEvidenceOpen] = useState<{ category: string; timestamp: string; url?: string } | null>(
    null,
  );
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);

  const fetchSessionDetail = useStore((s) => s.fetchSessionDetail);
  const [loadingDetail, setLoadingDetail] = useState(true);

  useEffect(() => {
    if (sessionId) {
      setLoadingDetail(true);
      fetchSessionDetail(sessionId).finally(() => setLoadingDetail(false));
    }
  }, [sessionId, fetchSessionDetail]);

  if (!session) {
    return <div className="p-8 text-[#5B5B64]">Loading session details...</div>;
  }

  const criticalCount = session.integrityFlags.filter((f) => f.severity === "critical").length;
  const integritySummary =
    session.integrityFlags.length === 0
      ? "None recorded"
      : `${session.integrityFlags.length} flag${session.integrityFlags.length > 1 ? "s" : ""} · ${criticalCount} critical`;

  return (
    <div className={embedded ? "" : "flex flex-col h-full"}>
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#E6E6EA] flex items-start gap-4 bg-white">
        <div className="w-10 h-10 rounded-full bg-[#0B0B0D] text-white flex items-center justify-center font-mono text-[13px] font-medium">
          {session.candidate.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-[16px] font-semibold text-[#0B0B0D]">{session.candidate.name}</div>
            <StatusPill status={session.status} />
          </div>
          <div className="text-[12px] text-[#5B5B64] mt-0.5">
            {session.candidate.email} · {session.roleTemplate.roleName} ·{" "}
            {session.roleTemplate.track}
          </div>
          <div className="flex gap-4 mt-2 text-[11px] font-mono text-[#5B5B64]">
            <span>{session.id}</span>
            <span>
              composite{" "}
              <span className="text-[#0B0B0D]">
                {session.compositeScore !== null ? session.compositeScore : "—"}
              </span>
            </span>
            <span>
              say-do{" "}
              <span className="text-[#0B0B0D]">
                {session.sayDoScore !== null ? session.sayDoScore : "—"}
              </span>
            </span>
            <span className={criticalCount ? "text-[#9A2A2E]" : ""}>
              integrity: {integritySummary}
            </span>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 hover:bg-[#EFF0F3] rounded">
            <X size={16} />
          </button>
        )}
        {embedded && (
          <Link
            to="/reports"
            className="text-[12px] text-[#2F5CFF] flex items-center gap-1 hover:underline"
          >
            Open reports <ExternalLink size={12} />
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-[#E6E6EA] flex gap-1 bg-white">
        {(["saydo", "overview", "timeline"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2.5 text-[12px] border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[#2F5CFF] text-[#0B0B0D]"
                : "border-transparent text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            {t === "saydo" ? "Say-Do" : t === "overview" ? "Overview" : "Timeline"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-[#F7F7F9]">
        {tab === "saydo" && (
          <div>
            {session.gradingSource === 'placeholder' && (
              <div className="bg-[#FFF4DC] border border-[#FFEAB8] rounded-lg p-4 mb-4 text-[#8A5A00] text-[13px] flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <div>
                  <strong>Placeholder Score:</strong> The Say-Do Consistency score for this session has not yet been computed by the Correlation Engine. The displayed score is a static fallback placeholder.
                </div>
              </div>
            )}
            <div className="mb-2 text-[11px] font-mono uppercase tracking-[0.16em] text-[#5B5B64]">
              Say-Do trace · elapsed session time
            </div>
            <ScopePanel
              data={session.sayDoTrace}
              height={260}
              onPointClick={(i) => {
                setTab("timeline");
                setHighlightIdx(i);
              }}
            />
            {session.sayDoRationale && (
              <div className="mt-6 bg-white border border-[#E6E6EA] rounded-lg p-5">
                <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#5B5B64] mb-2">
                  AI Scoring Rationale
                </div>
                <p className="text-[13px] text-[#0B0B0D] leading-relaxed whitespace-pre-wrap">{session.sayDoRationale}</p>
              </div>
            )}
            <div className="mt-6">
              <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#5B5B64] mb-3">
                Said / Did mismatches
              </div>
              {session.mismatches.length === 0 ? (
                <div className="border border-dashed border-[#D6D7DC] rounded-lg p-6 text-center bg-white">
                  <ShieldCheck className="mx-auto text-[#17C964] mb-2" size={20} />
                  <div className="text-[13px] text-[#0B0B0D]">
                    No mismatches flagged — communication and actions were consistent throughout.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {session.mismatches.map((m, i) => (
                    <div key={i} className="bg-white border border-[#E6E6EA] rounded-lg p-4">
                      <div className="border-l-2 border-[#9C9CA5] pl-3 mb-2">
                        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B5B64]">
                          said
                        </div>
                        <div className="text-[13px] text-[#0B0B0D] italic">"{m.said}"</div>
                      </div>
                      <div className="border-l-2 border-[#2F5CFF] pl-3 mb-2">
                        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B5B64]">
                          did
                        </div>
                        <div className="text-[13px] text-[#0B0B0D]">{m.did}</div>
                      </div>
                      <div className="text-[11px] font-mono text-[#5B5B64] mt-2">
                        &gt; {m.impact}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "overview" && (
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#5B5B64] mb-3">
              Module scores
            </div>
            <div className="bg-white border border-[#E6E6EA] rounded-lg p-5 space-y-3">
              {Object.entries(session.moduleScores).map(([m, v]) => (
                <div key={m}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-[#0B0B0D]">{m}</span>
                    <span className="font-mono text-[#5B5B64]">{v}/100</span>
                  </div>
                  <div className="h-2 bg-[#EFF0F3] rounded">
                    <div className="h-full bg-[#2F5CFF] rounded" style={{ width: `${v}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "timeline" && (
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#5B5B64] mb-3">
              Session event log
            </div>
            <div className="bg-white border border-[#E6E6EA] rounded-lg divide-y divide-[#E6E6EA]">
              {[
                { t: "00:00", ev: "Session started · fingerprint FP-x28a1", flag: null },
                { t: "04:12", ev: "MCQ module submitted (12/15)", flag: null },
                ...session.integrityFlags.map((f) => ({
                  t: f.timestamp,
                  ev: `Flag: ${f.category}`,
                  flag: f,
                })),
                { t: "31:44", ev: "Coding / DSA submission finalized", flag: null },
                { t: "42:07", ev: "Session submitted", flag: null },
              ].map((row, i) => (
                <div
                  key={i}
                  className={`px-4 py-3 flex items-start gap-3 ${
                    highlightIdx !== null && i === 2 ? "bg-[#EAF0FF]" : ""
                  }`}
                >
                  <div className="font-mono text-[11px] text-[#5B5B64] w-14 pt-0.5">{row.t}</div>
                  <div className="flex-1 text-[13px] text-[#0B0B0D]">{row.ev}</div>
                  {row.flag && (
                    <>
                      <span
                        className={`text-[10px] font-mono uppercase tracking-[0.14em] px-1.5 py-0.5 rounded ${
                          row.flag.severity === "critical"
                            ? "bg-[#FDECEC] text-[#9A2A2E]"
                            : "bg-[#FFF4DC] text-[#8A5A00]"
                        }`}
                      >
                        {row.flag.severity}
                      </span>
                      {((row.flag as any).evidenceClipUrl || (row.flag as any).clipUrl || (row.flag as any).storageRef || row.flag.hasEvidence) && (
                        <button
                          onClick={() =>
                            setEvidenceOpen({
                              category: row.flag!.category,
                              timestamp: row.flag!.timestamp,
                              url: (row.flag as any).evidenceClipUrl || (row.flag as any).clipUrl || (row.flag as any).storageRef,
                            })
                          }
                          className="text-[11px] text-[#2F5CFF] hover:underline cursor-pointer font-semibold"
                        >
                          View evidence clip
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Decision panel */}
      <div className="px-6 py-4 border-t border-[#E6E6EA] bg-white flex flex-col gap-3">
        {session.decision ? (
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck
                size={16}
                className={
                  session.decision.outcome === "advance" ? "text-[#17C964]" : "text-[#E5484D]"
                }
              />
              <div className="font-mono text-[12px] text-[#0B0B0D]">
                Decision recorded: <span className="uppercase">{session.decision.outcome}</span> ·{" "}
                {session.decision.decidedAt} · {session.decision.decidedBy}
              </div>
            </div>
            {session.decision.note && (
              <div className="text-[12px] text-[#5B5B64] bg-[#F7F7F9] p-3 border border-[#E6E6EA] rounded-md font-mono italic">
                Reviewer comment: "{session.decision.note}"
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 w-full">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[#5B5B64] mb-1.5">
                Reviewer Decision Comments (Optional)
              </label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Enter justification notes for Accept/Reject outcome..."
                rows={2}
                className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md text-[13px] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between">
              {criticalCount > 0 ? (
                <div className="flex items-center gap-1.5 text-[11px] text-[#9A2A2E]">
                  <AlertTriangle size={13} />
                  {criticalCount} critical flag{criticalCount > 1 ? "s" : ""} — review evidence
                  before deciding
                </div>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => recordDecision(session.id, "reject", noteText)}
                  className="px-4 py-2 text-[13px] font-medium rounded-md border border-[#E6E6EA] text-[#0B0B0D] hover:bg-[#F7F7F9] cursor-pointer"
                >
                  Reject
                </button>
                <button
                  onClick={() => recordDecision(session.id, "advance", noteText)}
                  className="px-4 py-2 text-[13px] font-medium rounded-md bg-[#2F5CFF] hover:bg-[#0037FF] text-white cursor-pointer transition-colors"
                >
                  Advance
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* evidence lightbox */}
      {evidenceOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setEvidenceOpen(null)}
        >
          <div
            className="bg-[#0B0B0D] border border-[#232327] rounded-lg max-w-2xl w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3 border-b border-[#232327] pb-2">
              <div className="text-[12px] font-mono uppercase tracking-[0.14em] text-[#8B8B93]">
                evidence · {evidenceOpen.category} · {evidenceOpen.timestamp}
              </div>
              <button
                onClick={() => setEvidenceOpen(null)}
                className="text-[#8B8B93] hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="aspect-video bg-black rounded flex items-center justify-center relative overflow-hidden">
              {evidenceOpen.url ? (
                <video
                  src={resolveClipUrl(evidenceOpen.url)}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-[#8B8B93] text-[12px] font-mono p-4 text-center">
                  No video recording clip available for this flag event.
                </div>
              )}
            </div>
            <div className="mt-3 text-[12px] text-[#EDEDEF]">
              Recorded evidence activity for <span className="font-mono font-semibold">{evidenceOpen.category}</span> at <span className="font-mono">{evidenceOpen.timestamp}</span>.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
