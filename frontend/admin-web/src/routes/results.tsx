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
  const exportResultsCsv = useStore((s) => s.exportResultsCsv);
  const bulkVerifyIdentity = useStore((s) => s.bulkVerifyIdentity);
  const drives = useStore((s) => s.drives);
  const fetchDrives = useStore((s) => s.fetchDrives);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "PASS" | "FAIL">("all");
  const [driveFilter, setDriveFilter] = useState<string>("all");
  const [verifying, setVerifying] = useState(false);
  // sessionVerifyResults: null = Verify All not yet clicked this session.
  // Populated only after the user explicitly clicks Verify All.
  // Keyed by candidateId → per-candidate result from the API response.
  const [sessionVerifyResults, setSessionVerifyResults] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (isExactResults) {
      fetchResults({ driveId: driveFilter !== "all" ? driveFilter : undefined });
      fetchDrives();
      // Reset session verify results whenever the drive filter changes
      // so the column always starts as Pending for the new filter context.
      setSessionVerifyResults(null);
    }
  }, [isExactResults, driveFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resultsList.filter((item: any) => {
      if (q) {
        const name = (item.candidateName || "").toLowerCase();
        const email = (item.candidateEmail || "").toLowerCase();
        const drive = (item.driveName || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !drive.includes(q)) return false;
      }

      if (driveFilter !== "all") {
        const itemDriveId = item.driveId || item.drive_id || item.drive?.id;
        if (itemDriveId && itemDriveId !== driveFilter) return false;
      }

      if (statusFilter === "pending") {
        return !item.decision;
      }
      if (statusFilter === "PASS") {
        const out = String(item.decision?.outcome || item.decision || "");
        return out === "PASS" || out === "ADVANCE";
      }
      if (statusFilter === "FAIL") {
        const out = String(item.decision?.outcome || item.decision || "");
        return out === "FAIL" || out === "REJECT";
      }

      return true;
    });
  }, [resultsList, query, statusFilter, driveFilter]);

  // Summary counts (always over full resultsList, not filtered view)
  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let totalScoreSum = 0;
    let scoredCount = 0;

    resultsList.forEach((r: any) => {
      const out = String(r.decision?.outcome || r.decision || "");
      if (out === "PASS" || out === "ADVANCE") approved++;
      else if (out === "FAIL" || out === "REJECT") rejected++;
      else pending++;

      if (r.compositeScore !== null && r.compositeScore !== undefined) {
        const val = r.compositeScore <= 1.0 ? r.compositeScore * 100 : r.compositeScore;
        totalScoreSum += val;
        scoredCount++;
      }
    });

    const avgScore = scoredCount > 0 ? Math.round(totalScoreSum / scoredCount) : 0;

    return {
      total: resultsList.length,
      pending,
      approved,
      rejected,
      avgScore,
    };
  }, [resultsList]);

  const handleExportCsv = async () => {
    try {
      await exportResultsCsv(driveFilter !== "all" ? driveFilter : undefined);
      toast.success("Candidate evaluation CSV exported successfully!");
    } catch (err: any) {
      toast.error("Failed to export CSV: " + (err.message || err));
    }
  };

  /**
   * Collect candidateIds from the currently-filtered approved candidates
   * (already scoped to the active Drive filter via the API call + client filter)
   * and run bulk identity verification.
   */
  const handleVerifyAll = async () => {
    const candidateIds = filtered
      .map((item: any) => item.candidateId)
      .filter(Boolean) as string[];

    if (candidateIds.length === 0) return;

    setVerifying(true);
    try {
      const summary = await bulkVerifyIdentity(candidateIds);

      // Index results by candidateId so badges can be driven from this
      // session-local state rather than re-fetched DB data.
      const resultMap: Record<string, any> = {};
      for (const r of summary.results) {
        resultMap[r.candidateId] = r;
      }
      setSessionVerifyResults(resultMap);

      const parts: string[] = [];
      if (summary.completed > 0) {
        parts.push(`${summary.matched} matched, ${summary.mismatched} mismatch`);
      }
      if (summary.insufficientData > 0) parts.push(`${summary.insufficientData} missing data`);
      if (summary.errors > 0) parts.push(`${summary.errors} error(s)`);

      const msg = `${summary.completed}/${summary.total} verified — ${parts.join(", ")}`;

      if (summary.mismatched > 0 || summary.errors > 0) {
        toast.warning(msg);
      } else {
        toast.success(msg);
      }
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
          {/* Verify All — only visible when the Approved tab is active */}
          {statusFilter === "PASS" && (
            <button
              id="verify-all-btn"
              onClick={handleVerifyAll}
              disabled={verifying || filtered.length === 0}
              title={
                filtered.length === 0
                  ? "No approved candidates to verify"
                  : `Verify identity for ${filtered.length} approved candidate${filtered.length === 1 ? "" : "s"}`
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded border transition-colors
                ${
                  filtered.length === 0 || verifying
                    ? "bg-[#F7F7F9] text-[#9C9CA5] border-[#E6E6EA] cursor-not-allowed"
                    : "text-[#0C6B58] bg-[#E3F9F2] border-[#A3E4D7] hover:bg-[#C7F5E8] cursor-pointer"
                }`}
            >
              {verifying ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Verifying {filtered.length} candidate{filtered.length === 1 ? "" : "s"}…
                </>
              ) : (
                <>
                  <ScanFace size={13} />
                  Verify All{filtered.length > 0 ? ` (${filtered.length})` : ""}
                </>
              )}
            </button>
          )}

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#2F5CFF] bg-[#EAF0FF] border border-[#B3C5FF] rounded hover:bg-[#D6E4FF] transition-colors cursor-pointer"
            title="Download full candidate evaluation CSV dataset from server"
          >
            <Download size={13} />
            Export Server CSV
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

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "all", label: "All Results" },
              { id: "pending", label: "Pending Review" },
              { id: "PASS", label: "Approved" },
              { id: "FAIL", label: "Rejected" },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              onClick={() => setStatusFilter(chip.id)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors cursor-pointer ${
                statusFilter === chip.id
                  ? "bg-[#2F5CFF] text-white border-[#2F5CFF]"
                  : "bg-white text-[#5B5B64] border-[#E6E6EA] hover:border-[#D6D7DC]"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

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
                  {statusFilter === "PASS" && (
                    <>
                      <th className="py-3 px-4 font-semibold text-center">ID Verify</th>
                      <th className="py-3 px-4 font-semibold text-center">In-Test Verify</th>
                    </>
                  )}
                  <th className="py-3 px-4 font-semibold text-center">Decision Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFF0F3]">
                {filtered.map((item: any) => {
                  const rawScore = item.compositeScore;
                  const scoreVal =
                    rawScore !== null && rawScore !== undefined
                      ? rawScore <= 1.0
                        ? Math.round(rawScore * 100)
                        : Math.round(rawScore)
                      : 0;
                  const scoreColor =
                    scoreVal >= 75
                      ? "text-[#0C6B58] bg-[#E3F9F2]"
                      : scoreVal >= 50
                      ? "text-amber-700 bg-amber-50"
                      : "text-[#C0392B] bg-[#FFF5F5]";

                  const flagsCount = item.integrityFlagsCount ?? 0;
                  const decStr = String(item.decision?.outcome || item.decision || "");
                  const isApproved = decStr === "PASS" || decStr === "ADVANCE";
                  const isRejected = decStr === "FAIL" || decStr === "REJECT";

                  // ID Verify badge
                  // sessionVerifyResults === null means Verify All has NOT been clicked
                  // this session → always show Pending regardless of stored DB data.
                  // Only after clicking Verify All do we show the actual result.
                  let idVerifyBadge: React.ReactNode;
                  let inTestVerifyBadge: React.ReactNode;

                  if (sessionVerifyResults === null) {
                    idVerifyBadge = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-amber-50 text-amber-600 border border-amber-200">
                        Pending
                      </span>
                    );
                    inTestVerifyBadge = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-amber-50 text-amber-600 border border-amber-200">
                        Pending
                      </span>
                    );
                  } else {
                    const svr = sessionVerifyResults[item.candidateId] || sessionVerifyResults[item.sessionId];
                    if (!svr || svr.status === "error") {
                      idVerifyBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-[#F7F7F9] text-[#9C9CA5] border border-[#E6E6EA]">
                          Not Verified
                        </span>
                      );
                      inTestVerifyBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-[#F7F7F9] text-[#9C9CA5] border border-[#E6E6EA]">
                          Not Verified
                        </span>
                      );
                    } else if (svr.status === "insufficient_data") {
                      idVerifyBadge = (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-amber-50 text-amber-700 border border-amber-200 italic">
                            Missing Data / Low Conf
                          </span>
                          {svr.extractedName && (
                            <span className="text-[10px] text-gray-500 font-mono" title={`OCR: ${svr.extractedName}`}>
                              OCR: {svr.extractedName}
                            </span>
                          )}
                        </div>
                      );
                    } else {
                      const faceOk = svr.face ? svr.face.matched : svr.matched;
                      const nameOk = svr.name ? svr.name.matched : true;
                      const extracted = svr.name?.extractedName || svr.extractedName;

                      idVerifyBadge = (
                        <div className="flex flex-col gap-1" title={extracted ? `OCR Extracted: "${extracted}" vs Registered: "${item.candidateName}"` : undefined}>
                          <div className="flex items-center gap-1">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${faceOk ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                              Face {faceOk ? '✓' : '✗'}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${nameOk ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                              Name {nameOk ? '✓' : '✗'}
                            </span>
                          </div>
                          {extracted && (
                            <span className="text-[10px] text-gray-500 font-mono truncate max-w-[130px]">
                              OCR: {extracted}
                            </span>
                          )}
                        </div>
                      );
                    }

                    // Render In-Test Periodic Captures Badge
                    const itc = svr?.inTestCaptures || item.identityVerificationResult?.inTestCaptures;
                    if (!itc || itc.total === 0) {
                      inTestVerifyBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-[#F7F7F9] text-[#9C9CA5] border border-[#E6E6EA]">
                          No captures
                        </span>
                      );
                    } else {
                      const parts: string[] = [`${itc.matched}/${itc.total} matched`];
                      if (itc.mismatched > 0) parts.push(`${itc.mismatched} mismatch`);
                      if (itc.skipped > 0) parts.push(`${itc.skipped} skipped`);
                      if (itc.failed > 0) parts.push(`${itc.failed} failed`);
                      if (itc.pending > 0) parts.push(`${itc.pending} pending`);

                      const summaryText = parts.join(", ");
                      const isAllMatched = itc.matched === itc.total && itc.total > 0;
                      const hasFailures = itc.mismatched > 0 || itc.failed > 0;

                      const tooltipText = (itc.windows || [])
                        .map((w: any) => `Win ${w.windowIndex}: ${w.status}${w.status === "COMPLETED" ? (w.matched ? " (Match ✓)" : " (Mismatch ✗)") : ""}${w.distance !== null && w.distance !== undefined ? ` [dist: ${w.distance.toFixed(2)}]` : ""}`)
                        .join("\n");

                      inTestVerifyBadge = (
                        <span
                          title={tooltipText || undefined}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono border ${
                            isAllMatched
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : hasFailures
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {summaryText}
                        </span>
                      );
                    }
                  }

                  return (
                    <tr key={item.id || item.sessionId} className="hover:bg-[#F7F7F9] transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#0B0B0D]">{item.candidateName}</div>
                        <div className="text-[11px] font-mono text-[#8B8B93]">{item.candidateEmail}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-[#0B0B0D] font-medium truncate max-w-[180px]">
                          {item.driveName || "General Drive"}
                        </div>
                        <div className="text-[11px] text-[#5B5B64]">{item.roleTemplateName || "Software Engineer"}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[12px] text-[#5B5B64]">
                        {item.submittedAt ? formatTimestamp(item.submittedAt) : (item.status === 'NOT_STARTED' ? 'Not Started' : 'In Progress')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[12px] font-semibold ${scoreColor}`}>
                          {scoreVal}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {flagsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[11px] bg-red-50 text-red-600 border border-red-100">
                            <ShieldAlert size={12} />
                            {flagsCount} {flagsCount === 1 ? "Flag" : "Flags"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[11px] bg-emerald-50 text-emerald-600">
                            <ShieldCheck size={12} />
                            Clean
                          </span>
                        )}
                      </td>
                      {statusFilter === "PASS" && (
                        <>
                          <td className="py-3 px-4 text-center">{idVerifyBadge}</td>
                          <td className="py-3 px-4 text-center">{inTestVerifyBadge}</td>
                        </>
                      )}
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
    </AppShell>
  );
}
