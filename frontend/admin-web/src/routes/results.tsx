import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  Search,
  Download,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  ShieldCheck,
  FileSpreadsheet,
  ScanFace,
  Loader2,
  X,
  Camera,
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore } from "../lib/store";
import { formatTimestamp } from "../lib/utils";
import { ExportDropdown } from "../components/export-dropdown";

export const Route = createFileRoute("/results")({
  component: ResultsPage,
  head: () => ({
    meta: [
      { title: "Results — Proctora" },
      {
        name: "description",
        content:
          "Review candidate assessment scores, integrity flags, evaluated answers, and record pass/fail hiring decisions.",
      },
    ],
  }),
});

function ResultsPage() {
  const location = useLocation();
  const isExactResults = location.pathname === "/results" || location.pathname === "/results/";

  const resultsList = useStore((s) => s.resultsList);
  const fetchResults = useStore((s) => s.fetchResults);
  const bulkVerifyIdentity = useStore((s) => s.bulkVerifyIdentity);
  const drives = useStore((s) => s.drives);
  const fetchDrives = useStore((s) => s.fetchDrives);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "PASS" | "FAIL">("all");
  const [driveFilter, setDriveFilter] = useState<string>("all");
  const [verifying, setVerifying] = useState(false);
  const [sessionVerifyResults, setSessionVerifyResults] = useState<Record<string, any> | null>(null);
  const [selectedVerificationItem, setSelectedVerificationItem] = useState<any>(null);

  useEffect(() => {
    if (isExactResults) {
      fetchResults({ driveId: driveFilter !== "all" ? driveFilter : undefined });
      fetchDrives();
      setSessionVerifyResults(null);
    }
  }, [isExactResults, driveFilter, fetchResults, fetchDrives]);

  const getItemDecision = (item: any) => {
    const d = item.reviewerDecision || item.decision?.outcome;
    if (d === "ADVANCE" || d === "PASS") return "PASS";
    if (d === "REJECT" || d === "FAIL") return "FAIL";
    return null;
  };

  const filtered = useMemo(() => {
    return resultsList.filter((item) => {
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        item.candidateName?.toLowerCase().includes(q) ||
        item.candidateEmail?.toLowerCase().includes(q) ||
        item.driveName?.toLowerCase().includes(q) ||
        item.roleTemplateName?.toLowerCase().includes(q);

      const dec = getItemDecision(item);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "pending" && !dec) ||
        dec === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [resultsList, query, statusFilter]);

  const stats = useMemo(() => {
    const total = resultsList.length;
    const pending = resultsList.filter((r) => !getItemDecision(r)).length;
    const approved = resultsList.filter((r) => getItemDecision(r) === "PASS").length;
    const rejected = resultsList.filter((r) => getItemDecision(r) === "FAIL").length;
    const scores = resultsList
      .map((r) => (typeof r.compositeScore === "number" ? r.compositeScore : null))
      .filter((s): s is number => s !== null);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    return { total, pending, approved, rejected, avgScore };
  }, [resultsList]);

  const handleExportCsv = () => {
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3001/api/v1";
    const driveParam = driveFilter !== "all" ? `?driveId=${encodeURIComponent(driveFilter)}` : "";
    window.open(`${apiBase}/admin/reports/export/csv${driveParam}`, "_blank");
  };

  const handleVerifyAll = async () => {
    const sessionsToVerify = filtered
      .map((item) => item.sessionId || item.id)
      .filter(Boolean);

    if (sessionsToVerify.length === 0) {
      toast.info("No candidates selected for verification.");
      return;
    }

    setVerifying(true);
    try {
      const res = await bulkVerifyIdentity(sessionsToVerify);
      const map: Record<string, any> = {};
      (res.results || []).forEach((r: any) => {
        if (r.candidateId) map[r.candidateId] = r;
        if (r.sessionId) map[r.sessionId] = r;
      });
      setSessionVerifyResults(map);

      // Immediately refresh results from backend so local store and DB state are fully synchronized
      await fetchResults({ driveId: driveFilter !== "all" ? driveFilter : undefined });

      const count = res.completed ?? res.total ?? res.results?.length ?? sessionsToVerify.length;
      toast.success(
        `Identity verification completed for ${count} candidate${count === 1 ? "" : "s"}.`
      );
    } catch (err: any) {
      toast.error("Bulk verification failed: " + (err.message || err));
    } finally {
      setVerifying(false);
    }
  };

  if (!isExactResults) {
    return <Outlet />;
  }

  return (
    <AppShell
      title="Candidate Results"
      count={filtered.length}
      search={
        <div className="relative w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9CA5]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidate name or email…"
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-[#F7F7F9] focus:outline-none focus:border-[#2F5CFF]"
          />
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#2F5CFF] bg-[#EAF0FF] border border-[#B3C5FF] rounded hover:bg-[#D6E4FF] transition-colors cursor-pointer"
            title="Download full candidate evaluation CSV dataset from server"
          >
            <Download size={13} />
            Export CSV
          </button>
          <ExportDropdown
            data={filtered}
            filenamePrefix="proctora-candidate-results"
            title="Candidate Assessment Results"
          />
        </div>
      }
    >
      {/* Metric Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#8B8B93] mb-1">
            Total Evaluated
          </div>
          <div className="text-[22px] font-mono font-semibold text-[#0B0B0D]">{stats.total}</div>
        </div>
        <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-600 mb-1">
            Pending Review
          </div>
          <div className="text-[22px] font-mono font-semibold text-amber-700">{stats.pending}</div>
        </div>
        <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#0C6B58] mb-1">
            Approved (Pass)
          </div>
          <div className="text-[22px] font-mono font-semibold text-[#0C6B58]">{stats.approved}</div>
        </div>
        <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#C0392B] mb-1">
            Rejected (Fail)
          </div>
          <div className="text-[22px] font-mono font-semibold text-[#C0392B]">{stats.rejected}</div>
        </div>
        <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#2F5CFF] mb-1">
            Avg Composite Score
          </div>
          <div className="text-[22px] font-mono font-semibold text-[#2F5CFF]">{stats.avgScore}%</div>
        </div>
      </div>

      {/* Filter Bar with Verify All button placed next to Drive Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "all", label: `All Results (${stats.total})` },
              { id: "pending", label: `Pending (${stats.pending})` },
              { id: "PASS", label: `Approved (${stats.approved})` },
              { id: "FAIL", label: `Rejected (${stats.rejected})` },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              onClick={() => setStatusFilter(chip.id)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium border transition-colors cursor-pointer ${
                statusFilter === chip.id
                  ? "bg-[#2F5CFF] text-white border-[#2F5CFF]"
                  : "bg-white text-[#5B5B64] border-[#E6E6EA] hover:border-[#D6D7DC]"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Verify All Button near Filter Dropdown - visible only when Approved filter is active */}
          {statusFilter === "PASS" && (
            <button
              id="verify-all-btn"
              onClick={handleVerifyAll}
              disabled={verifying || filtered.length === 0}
              title={
                filtered.length === 0
                  ? "No candidates to verify"
                  : `Verify identity for ${filtered.length} candidate${filtered.length === 1 ? "" : "s"}`
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md border transition-all shadow-sm ${
                filtered.length === 0 || verifying
                  ? "bg-[#F7F7F9] text-[#9C9CA5] border-[#E6E6EA] cursor-not-allowed"
                  : "text-[#0C6B58] bg-[#E3F9F2] border-[#A3E4D7] hover:bg-[#C7F5E8] cursor-pointer"
              }`}
            >
              {verifying ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <ScanFace size={13} />
                  Verify All ({filtered.length})
                </>
              )}
            </button>
          )}

          <div className="flex items-center gap-2">
            <label className="text-[12px] text-[#5B5B64] font-medium">Filter by Drive:</label>
            <select
              value={driveFilter}
              onChange={(e) => setDriveFilter(e.target.value)}
              className="px-3 py-1.5 text-[12px] border border-[#E6E6EA] rounded-md bg-white text-[#0B0B0D] focus:outline-none focus:border-[#2F5CFF]"
            >
              <option value="all">All Drives</option>
              {drives.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results Data Table */}
      <div className="bg-white border border-[#E6E6EA] rounded-[10px] shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <FileSpreadsheet size={32} className="mx-auto text-[#D6D7DC] mb-2" />
            <p className="text-[13px] text-[#8B8B93] italic">No candidate evaluation results found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead>
                <tr className="bg-[#F7F7F9] border-b border-[#E6E6EA] text-[11px] font-mono uppercase tracking-wider text-[#5B5B64]">
                  <th className="py-3 px-4 font-semibold">Candidate</th>
                  <th className="py-3 px-4 font-semibold">Drive &amp; Track</th>
                  <th className="py-3 px-4 font-semibold">Submitted</th>
                  <th className="py-3 px-4 font-semibold text-center">Score</th>
                  <th className="py-3 px-4 font-semibold text-center">Integrity Risk</th>
                  <th className="py-3 px-4 font-semibold text-center">Decision</th>
                  <th className="py-3 px-4 font-semibold text-center">Verification</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFF0F3]">
                {filtered.map((item: any) => {
                  const rawScore = item.compositeScore;
                  const scoreVal = typeof rawScore === "number" ? Math.round(rawScore) : 0;
                  const scoreColor =
                    scoreVal >= 80
                      ? "text-emerald-600 bg-emerald-50"
                      : scoreVal >= 60
                      ? "text-amber-600 bg-amber-50"
                      : "text-rose-600 bg-rose-50";

                  const flagsCount = item.integrityFlagsCount || item.flagsCount || 0;
                  const dec = getItemDecision(item);
                  const isApproved = dec === "PASS";
                  const isRejected = dec === "FAIL";

                  // Verification Pill logic
                  const svr = sessionVerifyResults
                    ? (sessionVerifyResults[item.candidateId] || sessionVerifyResults[item.sessionId] || sessionVerifyResults[item.id])
                    : null;
                  const idVerifyResult = item.identityVerificationResult || svr;

                  const isMatch =
                    idVerifyResult?.matched === true ||
                    (svr && svr.matched === true);
                  const isMismatch =
                    idVerifyResult?.matched === false ||
                    (svr && svr.matched === false) ||
                    (idVerifyResult?.inTestCaptures && idVerifyResult.inTestCaptures.mismatched > 0);

                  const initialLetter = (item.candidateName || "C").charAt(0).toUpperCase();

                  return (
                    <tr key={item.id || item.sessionId} className="hover:bg-[#F7F7F9] transition-colors">
                      {/* Candidate Name & Email with Initial Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#EAF0FF] text-[#2F5CFF] flex items-center justify-center font-bold text-[13px] border border-[#B3C5FF]">
                            {initialLetter}
                          </div>
                          <div>
                            <div className="font-semibold text-[#0B0B0D]">{item.candidateName}</div>
                            <div className="text-[11px] font-mono text-[#8B8B93]">{item.candidateEmail}</div>
                          </div>
                        </div>
                      </td>

                      {/* Drive & Track */}
                      <td className="py-3 px-4">
                        <div className="text-[#0B0B0D] font-medium truncate max-w-[180px]">
                          {item.driveName || "General Drive"}
                        </div>
                        <div className="text-[11px] text-[#5B5B64]">{item.roleTemplateName || "Software Engineering"}</div>
                      </td>

                      {/* Submitted Timestamp */}
                      <td className="py-3 px-4 font-mono text-[12px] text-[#5B5B64]">
                        {item.submittedAt ? formatTimestamp(item.submittedAt) : (item.status === 'NOT_STARTED' ? 'Not Started' : 'In Progress')}
                      </td>

                      {/* Score */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[12px] font-semibold ${scoreColor}`}>
                          {scoreVal}%
                        </span>
                      </td>

                      {/* Integrity Risk */}
                      <td className="py-3 px-4 text-center">
                        {flagsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[11px] bg-red-50 text-red-600 border border-red-100">
                            <ShieldAlert size={12} />
                            {flagsCount} Flags
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[11px] bg-emerald-50 text-emerald-600">
                            <ShieldCheck size={12} />
                            Low
                          </span>
                        )}
                      </td>

                      {/* Decision Status */}
                      <td className="py-3 px-4 text-center">
                        {isApproved ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E3F9F2] text-[#0C6B58]">
                            <CheckCircle2 size={12} />
                            Approved
                          </span>
                        ) : isRejected ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF5F5] text-[#C0392B]">
                            <XCircle size={12} />
                            Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
                            <Clock size={12} />
                            Pending Review
                          </span>
                        )}
                      </td>

                      {/* Verification Column Pill Button */}
                      <td className="py-3 px-4 text-center">
                        {isMatch ? (
                          <button
                            onClick={() => setSelectedVerificationItem(item)}
                            title="Click to open Verification Side Panel"
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#E3F9F2] text-[#0C6B58] border border-[#A3E4D7] hover:bg-[#C7F5E8] transition-all hover:scale-105 cursor-pointer shadow-sm"
                          >
                            <CheckCircle2 size={12} />
                            Match <Info size={11} className="ml-0.5 opacity-70" />
                          </button>
                        ) : isMismatch ? (
                          <button
                            onClick={() => setSelectedVerificationItem(item)}
                            title="Click to open Verification Side Panel"
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#FFF5F5] text-[#C0392B] border border-[#FADBD8] hover:bg-[#FADBD8] transition-all hover:scale-105 cursor-pointer shadow-sm"
                          >
                            <XCircle size={12} />
                            Mismatch <Info size={11} className="ml-0.5 opacity-70" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedVerificationItem(item)}
                            title="Click to open Verification Side Panel"
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all hover:scale-105 cursor-pointer shadow-sm"
                          >
                            <Clock size={12} />
                            Pending <Info size={11} className="ml-0.5 opacity-70" />
                          </button>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        <Link
                          to="/results/$id"
                          params={{ id: item.sessionId || item.id }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#2F5CFF] bg-[#EAF0FF] hover:bg-[#D6E4FF] rounded-md transition-colors"
                        >
                          <Eye size={12} />
                          Evaluate
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Verification Slide-Over Side Panel */}
      {selectedVerificationItem && (
        <VerificationSidePanel
          item={selectedVerificationItem}
          onClose={() => setSelectedVerificationItem(null)}
        />
      )}
    </AppShell>
  );
}

function VerificationSidePanel({
  item,
  onClose,
}: {
  item: any;
  onClose: () => void;
}) {
  const fetchSessionDetail = useStore((s) => s.fetchSessionDetail);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);

  // Accordion state (open / collapsed)
  const [accordions, setAccordions] = useState({
    identity: true,
    randomCapture: true,
    ocr: true,
  });

  const toggleAccordion = (key: "identity" | "randomCapture" | "ocr") => {
    setAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    let isMounted = true;
    const loadDetail = async () => {
      setLoading(true);
      try {
        const sessionId = item.sessionId || item.id;
        if (sessionId) {
          const res = await fetchSessionDetail(sessionId);
          if (isMounted) {
            setDetail(res);
          }
        }
      } catch (err) {
        console.error("Failed to load session detail for verification panel", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadDetail();
    return () => {
      isMounted = false;
    };
  }, [item, fetchSessionDetail]);

  const candidateData = detail?.candidate || item;
  const idVerifyResult =
    candidateData?.identityVerificationResult ||
    detail?.identityVerificationResult ||
    item?.identityVerificationResult;

  const isMatched = idVerifyResult?.matched === true;
  const isMismatch = idVerifyResult?.matched === false || (idVerifyResult?.inTestCaptures?.mismatched > 0);

  // 1. Identity Verification URLs
  const idCardUrl = candidateData?.idProofUrl || candidateData?.idProofRef || null;
  const selfieUrl = candidateData?.baselineSelfieUrl || candidateData?.baselineSelfieRef || null;
  const idMatch = idVerifyResult?.face?.matched ?? (isMatched ? true : isMismatch ? false : null);

  // 2. Random Capture Verification Windows
  const capturesList =
    detail?.identityCaptures ||
    idVerifyResult?.inTestCaptures?.windows ||
    item?.identityCaptures ||
    [];

  const windows = [1, 2, 3].map((wIdx) => {
    const found = capturesList.find((c: any) => (c.windowIndex || c.window_index) === wIdx);
    return (
      found || {
        windowIndex: wIdx,
        status: "PENDING",
        matched: null,
        capturedAt: null,
        imageUrl: null,
      }
    );
  });

  const matchedCount = windows.filter((w: any) => w.matched === true).length;
  const inTestSummary = `${matchedCount}/3 Matched`;

  // 3. OCR Verification
  const regName = candidateData?.name || item?.candidateName || "N/A";
  const ocrName =
    idVerifyResult?.name?.extractedName ||
    candidateData?.idProofExtractedName ||
    null;
  const ocrMatched = idVerifyResult?.name?.matched !== undefined
    ? idVerifyResult.name.matched
    : ocrName
    ? (regName.toLowerCase().trim() === ocrName.toLowerCase().trim())
    : null;

  const initialLetter = (item.candidateName || "C").charAt(0).toUpperCase();

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-Over Panel */}
      <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[480px] bg-white border-l border-[#E6E6EA] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Panel Header */}
        <div className="p-6 border-b border-[#F0F0F4] bg-[#FAFBFD] relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#E3F9F2] text-[#0C6B58] flex items-center justify-center font-bold text-[18px] border border-[#A3E4D7]">
              {initialLetter}
            </div>
            <div>
              <h3 className="text-[17px] font-bold text-[#0B0B0D]">
                {item.candidateName}
              </h3>
              <p className="text-[12px] text-[#8B8B93] font-mono">
                {item.candidateEmail}
              </p>
              <div className="mt-1">
                {isMatched ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E3F9F2] text-[#0C6B58] border border-[#A3E4D7]">
                    <CheckCircle2 size={11} /> Match
                  </span>
                ) : isMismatch ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF5F5] text-[#C0392B] border border-[#FADBD8]">
                    <XCircle size={11} /> Mismatch
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <Clock size={11} /> Pending
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Panel Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <h4 className="text-[14px] font-bold text-[#0B0B0D]">Verifications</h4>

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-gray-400 space-y-3">
              <Loader2 size={24} className="animate-spin text-[#2F5CFF]" />
              <span className="text-[12px] font-mono text-gray-500">
                Fetching candidate biometric verification details…
              </span>
            </div>
          ) : (
            <>
              {/* Accordion 1: Identity Verification */}
              <div className="border border-[#E6E6EA] rounded-xl overflow-hidden bg-white shadow-sm">
                <button
                  onClick={() => toggleAccordion("identity")}
                  className="w-full px-4 py-3 bg-[#FAFBFD] hover:bg-gray-50 flex items-center justify-between transition-colors border-b border-[#F0F0F4]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-[#0B0B0D]">
                      1. Identity Verification
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-medium ${
                        idMatch === true
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : idMatch === false
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {idMatch === true ? "Match" : idMatch === false ? "Mismatch" : "Pending"}
                    </span>
                  </div>
                  {accordions.identity ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>

                {accordions.identity && (
                  <div className="p-4 grid grid-cols-2 gap-3 bg-white">
                    <div>
                      <div className="text-[11px] font-medium text-[#8B8B93] mb-1.5">
                        ID Card Image
                      </div>
                      <div className="w-full h-36 rounded-lg border border-[#E6E6EA] bg-[#F7F7F9] overflow-hidden flex items-center justify-center">
                        {idCardUrl ? (
                          <img
                            src={idCardUrl}
                            alt="ID Card"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-gray-400 p-2 text-center">
                            <FileText size={24} className="mb-1" />
                            <span className="text-[10px]">No ID Card</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-medium text-[#8B8B93] mb-1.5">
                        Selfie Image
                      </div>
                      <div className="w-full h-36 rounded-lg border border-[#E6E6EA] bg-[#F7F7F9] overflow-hidden flex items-center justify-center">
                        {selfieUrl ? (
                          <img
                            src={selfieUrl}
                            alt="Selfie Baseline"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-gray-400 p-2 text-center">
                            <Camera size={24} className="mb-1" />
                            <span className="text-[10px]">No Baseline Selfie</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion 2: Random Capture Verification */}
              <div className="border border-[#E6E6EA] rounded-xl overflow-hidden bg-white shadow-sm">
                <button
                  onClick={() => toggleAccordion("randomCapture")}
                  className="w-full px-4 py-3 bg-[#FAFBFD] hover:bg-gray-50 flex items-center justify-between transition-colors border-b border-[#F0F0F4]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-[#0B0B0D]">
                      2. Random Capture Verification
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-medium ${
                        matchedCount === 3
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : matchedCount > 0
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {inTestSummary}
                    </span>
                  </div>
                  {accordions.randomCapture ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>

                {accordions.randomCapture && (
                  <div className="p-4 grid grid-cols-3 gap-2.5 bg-white">
                    {windows.map((w: any) => {
                      const isComp = w.status === "COMPLETED";
                      const isWinMatch = w.matched === true;
                      const capTime = w.capturedAt
                        ? new Date(w.capturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
                        : `Win ${w.windowIndex}`;

                      return (
                        <div key={w.windowIndex} className="flex flex-col items-center">
                          <div className="w-full h-28 rounded-lg border border-[#E6E6EA] bg-[#F7F7F9] overflow-hidden flex items-center justify-center relative">
                            {w.imageUrl ? (
                              <img
                                src={w.imageUrl}
                                alt={`Window ${w.windowIndex}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ScanFace size={24} className="text-gray-300" />
                            )}
                          </div>
                          <span className="text-[10px] text-[#8B8B93] mt-1 text-center font-mono">
                            Captured at {capTime}
                          </span>
                          <span
                            className={`text-[10px] font-semibold mt-0.5 ${
                              !isComp
                                ? "text-gray-500"
                                : isWinMatch
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }`}
                          >
                            {!isComp ? w.status : isWinMatch ? "Matched" : "Mismatch"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Accordion 3: OCR Verification */}
              <div className="border border-[#E6E6EA] rounded-xl overflow-hidden bg-white shadow-sm">
                <button
                  onClick={() => toggleAccordion("ocr")}
                  className="w-full px-4 py-3 bg-[#FAFBFD] hover:bg-gray-50 flex items-center justify-between transition-colors border-b border-[#F0F0F4]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-[#0B0B0D]">
                      3. OCR Verification
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-medium ${
                        ocrMatched === true
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : ocrMatched === false
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {ocrMatched === true ? "Match" : ocrMatched === false ? "Mismatch" : "Pending"}
                    </span>
                  </div>
                  {accordions.ocr ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>

                {accordions.ocr && (
                  <div className="p-4 bg-white space-y-3 text-[12px]">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[#8B8B93] block text-[11px]">Registered Name</span>
                        <span className="font-semibold text-[#0B0B0D]">{regName}</span>
                      </div>
                      <div>
                        <span className="text-[#8B8B93] block text-[11px]">Extracted Name (OCR)</span>
                        <span className="font-semibold text-[#0B0B0D]">{ocrName || "—"}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#F0F0F4] flex items-center justify-between">
                      <span className="text-[#8B8B93] text-[11px]">Result</span>
                      <span className={`font-bold ${ocrMatched === true ? "text-emerald-600" : ocrMatched === false ? "text-rose-600" : "text-amber-600"}`}>
                        {ocrMatched === true ? "Match" : ocrMatched === false ? "Mismatch" : "Pending"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Panel Footer */}
        <div className="p-4 border-t border-[#F0F0F4] bg-[#FAFBFD]">
          <Link
            to="/results/$id"
            params={{ id: item.sessionId || item.id }}
            className="w-full py-2.5 px-4 bg-[#EAF0FF] hover:bg-[#D6E4FF] text-[#2F5CFF] font-semibold text-[13px] rounded-lg border border-[#B3C5FF] flex items-center justify-center gap-2 transition-colors"
          >
            View Full Evaluation <ExternalLink size={14} />
          </Link>
        </div>
      </div>
    </>
  );
}
