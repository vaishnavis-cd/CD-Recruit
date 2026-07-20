import { createFileRoute, Link } from "@tanstack/react-router";
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

export const Route = createFileRoute("/results")({
  component: ResultsPage,
  head: () => ({
    meta: [
      { title: "Results — CD-Recruit" },
      {
        name: "description",
        content:
          "Review candidate assessment scores, integrity flags, evaluated answers, and record pass/fail hiring decisions.",
      },
    ],
  }),
});

function ResultsPage() {
  const resultsList = useStore((s) => s.resultsList);
  const fetchResults = useStore((s) => s.fetchResults);
  const exportResultsCsv = useStore((s) => s.exportResultsCsv);
  const drives = useStore((s) => s.drives);
  const fetchDrives = useStore((s) => s.fetchDrives);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "PASS" | "FAIL">("all");
  const [driveFilter, setDriveFilter] = useState<string>("all");

  useEffect(() => {
    fetchResults();
    fetchDrives();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resultsList.filter((item: any) => {
      if (q) {
        const name = (item.candidateName || "").toLowerCase();
        const email = (item.candidateEmail || "").toLowerCase();
        const drive = (item.driveName || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !drive.includes(q)) return false;
      }

      if (driveFilter !== "all" && item.driveId !== driveFilter) {
        return false;
      }

      if (statusFilter === "pending") {
        return !item.decision && ["SUBMITTED", "AUTO_SUBMITTED"].includes(item.status);
      }
      if (statusFilter === "PASS") {
        return item.decision?.outcome === "PASS";
      }
      if (statusFilter === "FAIL") {
        return item.decision?.outcome === "FAIL";
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
      if (r.decision?.outcome === "PASS") approved++;
      else if (r.decision?.outcome === "FAIL") rejected++;
      else if (["SUBMITTED", "AUTO_SUBMITTED"].includes(r.status)) pending++;

      if (r.compositeScore !== null && r.compositeScore !== undefined) {
        totalScoreSum += r.compositeScore;
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
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
          />
        </div>
      }
      actions={
        <button
          onClick={handleExportCsv}
          className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-[#5B5B64] bg-white border border-[#E6E6EA] rounded-md hover:bg-[#F7F7F9] shadow-sm transition-colors cursor-pointer"
        >
          <Download size={14} />
          Export CSV
        </button>
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
                  <th className="py-3 px-4 font-semibold">Drive & Track</th>
                  <th className="py-3 px-4 font-semibold">Submitted</th>
                  <th className="py-3 px-4 font-semibold text-center">Score</th>
                  <th className="py-3 px-4 font-semibold text-center">Integrity Risk</th>
                  <th className="py-3 px-4 font-semibold text-center">Decision Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFF0F3]">
                {filtered.map((item: any) => {
                  const scoreVal = item.compositeScore ?? 0;
                  const scoreColor =
                    scoreVal >= 75
                      ? "text-[#0C6B58] bg-[#E3F9F2]"
                      : scoreVal >= 50
                      ? "text-amber-700 bg-amber-50"
                      : "text-[#C0392B] bg-[#FFF5F5]";

                  const flagsCount = item.integrityFlagsCount ?? 0;
                  const decision = item.decision;

                  return (
                    <tr key={item.id || item.sessionId} className="hover:bg-[#F7F7F9] transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#0B0B0D]">{item.candidateName}</div>
                        <div className="text-[11px] font-mono text-[#8B8B93]">{item.candidateEmail}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-[#0B0B0D] font-medium truncate max-w-[200px]">
                          {item.driveName || "General Drive"}
                        </div>
                        <div className="text-[11px] text-[#5B5B64]">{item.roleTemplateName || "Software Engineer"}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[12px] text-[#5B5B64]">
                        {item.submittedAt ? item.submittedAt.slice(0, 16).replace("T", " ") : "In Progress"}
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
                        {decision?.outcome === "PASS" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E3F9F2] text-[#0C6B58]">
                            <CheckCircle2 size={12} />
                            Approved
                          </span>
                        ) : decision?.outcome === "FAIL" ? (
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
