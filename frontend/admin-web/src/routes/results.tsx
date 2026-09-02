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
import { StatusBadge } from "../components/ui/status-badge";

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
    <AppShell hideHeader={true}>
      <div className="max-w-[1320px] mx-auto w-full space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-bold text-[#0F172A] tracking-tight">
              Candidate Results
            </h1>
            <p className="text-[12px] text-[#64748B] mt-1">
              Review candidate performance scores, integrity flags, evaluated tracks, and record pass/fail hiring decisions.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 h-[34px] px-3.5 text-[12px] font-semibold text-[#0F172A] bg-white border border-[#E2E8F0] rounded-[8px] hover:bg-[#F8FAFC] transition-colors cursor-pointer shadow-xs"
              title="Download full candidate evaluation CSV dataset from server"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
            <ExportDropdown
              data={filtered}
              filenamePrefix="proctora-candidate-results"
              title="Candidate Assessment Results"
            />
          </div>
        </div>

        {/* Metric Cards Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-4.5 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
              Total Evaluated
            </div>
            <div className="text-[24px] font-bold text-[#0F172A]">{stats.total}</div>
          </div>
          <div className="bg-[#FFFDF5] border border-[#FEF3C7] rounded-[12px] p-4.5 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#D97706] mb-1">
              Pending Review
            </div>
            <div className="text-[24px] font-bold text-[#D97706]">{stats.pending}</div>
          </div>
          <div className="bg-[#F6FEF9] border border-[#D1FAE5] rounded-[12px] p-4.5 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#059669] mb-1">
              Approved (Pass)
            </div>
            <div className="text-[24px] font-bold text-[#059669]">{stats.approved}</div>
          </div>
          <div className="bg-[#FEF6F6] border border-[#FEE2E2] rounded-[12px] p-4.5 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#DC2626] mb-1">
              Rejected (Fail)
            </div>
            <div className="text-[24px] font-bold text-[#DC2626]">{stats.rejected}</div>
          </div>
          <div className="bg-[#F8FAFF] border border-[#DBEAFE] rounded-[12px] p-4.5 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB] mb-1">
              Avg Composite Score
            </div>
            <div className="text-[24px] font-bold text-[#2563EB]">{stats.avgScore}%</div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
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
                className={`h-[35px] px-4 rounded-full text-[13px] transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === chip.id
                    ? "border border-[#2E5DE0] bg-white text-[#2E5DE0] font-semibold shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A] hover:bg-white/50 font-normal border border-transparent"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative w-[240px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search candidate..."
                className="w-full h-[35px] pl-9 pr-3 text-[12px] border border-[#E2E8F0] rounded-[8px] bg-white text-[#0F172A] outline-none focus:border-[#2563EB] shadow-xs"
              />
            </div>

            {/* Filter by Drive */}
            <select
              value={driveFilter}
              onChange={(e) => setDriveFilter(e.target.value)}
              className="h-[35px] px-3 text-[12px] border border-[#E2E8F0] rounded-[8px] bg-white text-[#0F172A] focus:border-[#2563EB] outline-none shadow-xs cursor-pointer"
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

        {/* Results Data Table */}
        <div className="bg-white border border-[#E2E8F0] rounded-[12px] shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <FileSpreadsheet size={32} className="mx-auto text-[#94A3B8] mb-2" />
            <p className="text-[13px] text-[#94A3B8] italic">No candidate evaluation results found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-white border-b border-[#E2E8F0] text-[10px] font-bold font-sans uppercase tracking-wider text-[#64748B]">
                  <th className="py-3 px-4">Candidate</th>
                  <th className="py-3 px-4">Drive &amp; Track</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4 text-center">Score</th>
                  <th className="py-3 px-4 text-center">Integrity Risk</th>
                  <th className="py-3 px-4 text-center">Decision</th>
                  <th className="py-3 px-4 text-center">Verification</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filtered.map((item: any) => {
                  const rawScore = item.compositeScore;
                  const scoreVal = typeof rawScore === "number" ? Math.round(rawScore) : 0;
                  const scoreColor =
                    scoreVal >= 80
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                      : scoreVal >= 60
                      ? "text-amber-700 bg-amber-50 border-amber-200"
                      : "text-ink-secondary bg-canvas border-line";

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
                    <tr key={item.id || item.sessionId} className="hover:bg-canvas/60 transition-colors">
                      {/* Candidate Name & Email with Initial Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-subtle text-brand flex items-center justify-center font-bold text-xs border border-brand-border">
                            {initialLetter}
                          </div>
                          <div>
                            <div className="font-semibold text-ink">{item.candidateName}</div>
                            <div className="text-2xs font-mono text-ink-tertiary">{item.candidateEmail}</div>
                          </div>
                        </div>
                      </td>

                      {/* Drive & Track */}
                      <td className="py-3 px-4">
                        <div className="text-ink font-medium truncate max-w-[180px]">
                          {item.driveName || "General Drive"}
                        </div>
                        <div className="text-xs text-ink-secondary">{item.roleTemplateName || "Software Engineering"}</div>
                      </td>

                      {/* Submitted Timestamp */}
                      <td className="py-3 px-4 font-mono text-xs text-ink-secondary">
                        {item.submittedAt ? formatTimestamp(item.submittedAt) : (item.status === 'NOT_STARTED' ? 'Not Started' : 'In Progress')}
                      </td>

                      {/* Score */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold border ${scoreColor}`}>
                          {scoreVal}%
                        </span>
                      </td>

                      {/* Integrity Risk */}
                      <td className="py-3 px-4 text-center">
                        {flagsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-2xs bg-danger-subtle text-danger border border-danger-border font-semibold">
                            <ShieldAlert size={12} />
                            {flagsCount} Flags
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-2xs bg-success-subtle text-emerald-700 border border-emerald-200 font-semibold">
                            <ShieldCheck size={12} />
                            Low
                          </span>
                        )}
                      </td>

                      {/* Decision Status */}
                      <td className="py-3 px-4 text-center">
                        <StatusBadge
                          variant={isApproved ? "success" : isRejected ? "danger" : "warning"}
                          size="xs"
                        >
                          {isApproved ? "Approved" : isRejected ? "Rejected" : "Pending Review"}
                        </StatusBadge>
                      </td>

                      {/* Verification Column Pill Button */}
                      <td className="py-3 px-4 text-center">
                        {isMatch ? (
                          <button
                            onClick={() => setSelectedVerificationItem(item)}
                            title="Click to open Verification Side Panel"
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-success-subtle text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-all cursor-pointer shadow-2xs"
                          >
                            <CheckCircle2 size={12} />
                            Match <Info size={11} className="ml-0.5 opacity-70" />
                          </button>
                        ) : isMismatch ? (
                          <button
                            onClick={() => setSelectedVerificationItem(item)}
                            title="Click to open Verification Side Panel"
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-danger-subtle text-danger border border-danger-border hover:bg-red-100 transition-all cursor-pointer shadow-2xs"
                          >
                            <XCircle size={12} />
                            Mismatch <Info size={11} className="ml-0.5 opacity-70" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedVerificationItem(item)}
                            title="Click to open Verification Side Panel"
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-warning-subtle text-amber-800 border border-amber-300 hover:bg-amber-100 transition-all cursor-pointer shadow-2xs"
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand bg-brand-subtle hover:bg-brand hover:text-white border border-brand-border rounded-lg transition-all shadow-2xs cursor-pointer"
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
      </div>
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
    "Nitesh R";
  const ocrMatched = idVerifyResult?.name?.matched ?? (regName.toLowerCase().trim() === ocrName.toLowerCase().trim());

  const initialLetter = (item.candidateName || "C").charAt(0).toUpperCase();

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-Over Panel */}
      <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[480px] bg-white border-l border-line shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Panel Header */}
        <div className="p-6 border-b border-line bg-canvas relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg border border-emerald-300">
              {initialLetter}
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink">
                {item.candidateName}
              </h3>
              <p className="text-xs text-ink-tertiary font-mono">
                {item.candidateEmail}
              </p>
              <div className="mt-1">
                {isMatched ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs-plus font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300">
                    <CheckCircle2 size={11} /> Match
                  </span>
                ) : isMismatch ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs-plus font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    <XCircle size={11} /> Mismatch
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs-plus font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <Clock size={11} /> Pending
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Panel Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <h4 className="text-sm font-bold text-ink">Verifications</h4>

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-gray-400 space-y-3">
              <Loader2 size={24} className="animate-spin text-brand" />
              <span className="text-xs font-mono text-gray-500">
                Fetching candidate biometric verification details…
              </span>
            </div>
          ) : (
            <>
              {/* Accordion 1: Identity Verification */}
              <div className="border border-line rounded-xl overflow-hidden bg-white shadow-sm">
                <button
                  onClick={() => toggleAccordion("identity")}
                  className="w-full px-4 py-3 bg-canvas hover:bg-gray-50 flex items-center justify-between transition-colors border-b border-line"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm-minus font-bold text-ink">
                      1. Identity Verification
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs-plus font-mono font-medium ${
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
                      <div className="text-xs-plus font-medium text-ink-tertiary mb-1.5">
                        ID Card Image
                      </div>
                      <div className="w-full h-36 rounded-lg border border-line bg-canvas overflow-hidden flex items-center justify-center">
                        {idCardUrl ? (
                          <img
                            src={idCardUrl}
                            alt="ID Card"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-gray-400 p-2 text-center">
                            <FileText size={24} className="mb-1" />
                            <span className="text-2xs">No ID Card</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs-plus font-medium text-ink-tertiary mb-1.5">
                        Selfie Image
                      </div>
                      <div className="w-full h-36 rounded-lg border border-line bg-canvas overflow-hidden flex items-center justify-center">
                        {selfieUrl ? (
                          <img
                            src={selfieUrl}
                            alt="Selfie Baseline"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-gray-400 p-2 text-center">
                            <Camera size={24} className="mb-1" />
                            <span className="text-2xs">No Baseline Selfie</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion 2: Random Capture Verification */}
              <div className="border border-line rounded-xl overflow-hidden bg-white shadow-sm">
                <button
                  onClick={() => toggleAccordion("randomCapture")}
                  className="w-full px-4 py-3 bg-canvas hover:bg-gray-50 flex items-center justify-between transition-colors border-b border-line"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm-minus font-bold text-ink">
                      2. Random Capture Verification
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs-plus font-mono font-medium ${
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
                          <div className="w-full h-28 rounded-lg border border-line bg-canvas overflow-hidden flex items-center justify-center relative">
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
                          <span className="text-2xs text-ink-tertiary mt-1 text-center font-mono">
                            Captured at {capTime}
                          </span>
                          <span
                            className={`text-2xs font-semibold mt-0.5 ${
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
              <div className="border border-line rounded-xl overflow-hidden bg-white shadow-sm">
                <button
                  onClick={() => toggleAccordion("ocr")}
                  className="w-full px-4 py-3 bg-canvas hover:bg-gray-50 flex items-center justify-between transition-colors border-b border-line"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm-minus font-bold text-ink">
                      3. OCR Verification
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs-plus font-mono font-medium ${
                        ocrMatched
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {ocrMatched ? "Match" : "Mismatch"}
                    </span>
                  </div>
                  {accordions.ocr ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>

                {accordions.ocr && (
                  <div className="p-4 bg-white space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-ink-tertiary block text-xs-plus">Registered Name</span>
                        <span className="font-semibold text-ink">{regName}</span>
                      </div>
                      <div>
                        <span className="text-ink-tertiary block text-xs-plus">Extracted Name (OCR)</span>
                        <span className="font-semibold text-ink">{ocrName}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-line flex items-center justify-between">
                      <span className="text-ink-tertiary text-xs-plus">Result</span>
                      <span className={`font-bold ${ocrMatched ? "text-emerald-600" : "text-rose-600"}`}>
                        {ocrMatched ? "Match" : "Mismatch"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Panel Footer */}
        <div className="p-4 border-t border-line bg-canvas">
          <Link
            to="/results/$id"
            params={{ id: item.sessionId || item.id }}
            className="w-full py-2.5 px-4 bg-brand-subtle hover:bg-brand-subtle text-brand font-semibold text-sm-minus rounded-lg border border-brand-border flex items-center justify-center gap-2 transition-colors"
          >
            View Full Evaluation <ExternalLink size={14} />
          </Link>
        </div>
      </div>
    </>
  );
}
