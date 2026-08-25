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
  const drives = useStore((s) => s.drives);
  const fetchDrives = useStore((s) => s.fetchDrives);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "PASS" | "FAIL">("all");
  const [driveFilter, setDriveFilter] = useState<string>("all");

  useEffect(() => {
    if (isExactResults) {
      fetchResults({ driveId: driveFilter !== "all" ? driveFilter : undefined });
      fetchDrives();
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

  // Summary counts
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

  if (!isExactResults) {
    return <Outlet />;
  }

  return (
    <AppShell
      title="Candidate Results"
      count={filtered.length}
      search={
        <div className="relative w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidate name or email…"
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-line rounded-md bg-bg-soft focus:outline-none focus:border-brand"
          />
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand bg-brand/10 border border-brand/30 rounded hover:bg-brand/20 transition-colors cursor-pointer"
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
        <div className="bg-white border border-line rounded-[10px] p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-stext-2 mb-1">
            Total Evaluated
          </div>
          <div className="text-[22px] font-mono font-semibold text-ink">{stats.total}</div>
        </div>
        <div className="bg-white border border-line rounded-[10px] p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-600 mb-1">
            Pending Review
          </div>
          <div className="text-[22px] font-mono font-semibold text-amber-700">{stats.pending}</div>
        </div>
        <div className="bg-white border border-line rounded-[10px] p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-700 mb-1">
            Approved (Pass)
          </div>
          <div className="text-[22px] font-mono font-semibold text-emerald-700">{stats.approved}</div>
        </div>
        <div className="bg-white border border-line rounded-[10px] p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-danger mb-1">
            Rejected (Fail)
          </div>
          <div className="text-[22px] font-mono font-semibold text-danger">{stats.rejected}</div>
        </div>
        <div className="bg-white border border-line rounded-[10px] p-4 shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-brand mb-1">
            Avg Composite Score
          </div>
          <div className="text-[22px] font-mono font-semibold text-brand">{stats.avgScore}%</div>
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
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-ink-2 border-line hover:border-line-strong"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[12px] text-ink-2 font-medium">Filter by Drive:</label>
          <select
            value={driveFilter}
            onChange={(e) => setDriveFilter(e.target.value)}
            className="px-3 py-1.5 text-[12px] border border-line rounded-md bg-white text-ink focus:outline-none focus:border-brand"
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
      <div className="bg-white border border-line rounded-[10px] shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <FileSpreadsheet size={32} className="mx-auto text-line-strong mb-2" />
            <p className="text-[13px] text-stext-2 italic">No candidate evaluation results found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead>
                <tr className="bg-bg-soft border-b border-line text-[11px] font-mono uppercase tracking-wider text-ink-2">
                  <th className="py-3 px-4 font-semibold">Candidate</th>
                  <th className="py-3 px-4 font-semibold">Drive & Track</th>
                  <th className="py-3 px-4 font-semibold">Submitted</th>
                  <th className="py-3 px-4 font-semibold text-center">Score</th>
                  <th className="py-3 px-4 font-semibold text-center">Integrity Risk</th>
                  <th className="py-3 px-4 font-semibold text-center">Decision Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-inset">
                {filtered.map((item: any) => {
                  const rawScore = item.compositeScore;
                  const scoreVal = rawScore !== null && rawScore !== undefined ? (rawScore <= 1.0 ? Math.round(rawScore * 100) : Math.round(rawScore)) : 0;
                  const scoreColor =
                    scoreVal >= 75
                      ? "text-emerald-700 bg-emerald-50"
                      : scoreVal >= 50
                      ? "text-amber-700 bg-amber-50"
                      : "text-danger bg-rose-50";

                  const flagsCount = item.integrityFlagsCount ?? 0;
                  const decStr = String(item.decision?.outcome || item.decision || "");
                  const isApproved = decStr === "PASS" || decStr === "ADVANCE";
                  const isRejected = decStr === "FAIL" || decStr === "REJECT";

                  return (
                    <tr key={item.id || item.sessionId} className="hover:bg-bg-soft transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-ink">{item.candidateName}</div>
                        <div className="text-[11px] font-mono text-stext-2">{item.candidateEmail}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-ink font-medium truncate max-w-[200px]">
                          {item.driveName || "General Drive"}
                        </div>
                        <div className="text-[11px] text-ink-2">{item.roleTemplateName || "Software Engineer"}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[12px] text-ink-2">
                        {item.submittedAt ? formatTimestamp(item.submittedAt) : (item.status === 'NOT_STARTED' ? 'Not Started' : 'In Progress')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[12px] font-semibold ${scoreColor}`}
                        >
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
                      <td className="py-3 px-4 text-center">
                        {isApproved ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                            <CheckCircle2 size={12} />
                            Approved
                          </span>
                        ) : isRejected ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-danger">
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand bg-brand/10 hover:bg-brand/20 rounded-md transition-colors"
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
