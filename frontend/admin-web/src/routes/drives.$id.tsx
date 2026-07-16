import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useMemo } from "react";
import {
  Copy,
  Calendar,
  User,
  Check,
  Trash2,
  Mail,
  ExternalLink,
  CalendarDays,
  RefreshCw,
  XCircle,
  X,
  Edit,
  Plus,
  FileText,
  Clock,
  Settings,
  BookOpen,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type DriveDetail } from "../lib/types";

export const Route = createFileRoute("/drives/$id")({
  component: DriveDetailPage,
  head: () => ({
    meta: [
      { title: "Drive Details — CD-Recruit" },
      {
        name: "description",
        content: "Review candidate rosters, invite logs, and scores for this assessment drive.",
      },
    ],
  }),
});

function DriveDetailPage() {
  const { id: driveId } = Route.useParams();
  const fetchDriveDetail = useStore((s) => s.fetchDriveDetail);
  const revokeInvite = useStore((s) => s.revokeInvite);
  const extendExpiry = useStore((s) => s.extendExpiry);
  const regenerateToken = useStore((s) => s.regenerateToken);
  const fetchQuestions = useStore((s) => s.fetchQuestions);
  const questionsBank = useStore((s) => s.questions);
  const saveDriveQuestions = useStore((s) => s.saveDriveQuestions);
  const generateDriveLinks = useStore((s) => s.generateDriveLinks);

  const [drive, setDrive] = useState<DriveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Tab State
  const [activeTab, setActiveTab] = useState<"roster" | "questions" | "configuration">("roster");
  const [activeQuestionModule, setActiveQuestionModule] = useState<string>("");

  // Extend Modal State
  const [extendInviteId, setExtendInviteId] = useState<string | null>(null);
  const [extendExpiryDate, setExtendExpiryDate] = useState("");

  // Config States
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editStatus, setEditStatus] = useState<string>("DRAFT");
  const [moduleConfig, setModuleConfig] = useState<any>({});

  // Question Assignments State
  const [assignedQuestions, setAssignedQuestions] = useState<string[]>([]);

  // Bulk Candidate Roster State
  const [candidateInput, setCandidateInput] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const loadData = async () => {
    try {
      const data = await fetchDriveDetail(driveId);
      setDrive(data);
      setEditName(data.name);
      setEditStart(data.scheduleStart ? data.scheduleStart.slice(0, 16) : "");
      setEditEnd(data.scheduleEnd ? data.scheduleEnd.slice(0, 16) : "");
      setEditStatus(data.status);
      setModuleConfig(data.moduleConfig || {});
      setAssignedQuestions(data.questionIds || []);

      // Set first active module dynamically if activeQuestionModule is empty
      const enabledModules = Object.entries(data.moduleConfig || {})
        .filter(([_, conf]: [string, any]) => conf.enabled)
        .map(([mod]) => mod);
      if (enabledModules.length > 0 && !activeQuestionModule) {
        setActiveQuestionModule(enabledModules[0]);
      }

      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    fetchQuestions(); // Load questions bank for selector
  }, [driveId]);

  const candidatesList = useMemo(() => {
    if (!candidateInput.trim()) return [];
    return candidateInput
      .split("\n")
      .map((line) => {
        const parts = line.split(",");
        const name = parts[0]?.trim() || "";
        const email = parts[1]?.trim() || "";
        return { name, email };
      })
      .filter((c) => c.name && c.email);
  }, [candidateInput]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyInviteEmail = (cand: any) => {
    const emailText = `Hi ${cand.candidateName},

You have been invited to participate in the assessment drive "${drive?.name}" for the role of ${drive?.roleTemplateName}.

Assessment Details:
- Start Time: ${drive?.scheduleStart ? new Date(drive.scheduleStart).toLocaleString() : "Active immediately"}
- End Time: ${drive?.scheduleEnd ? new Date(drive.scheduleEnd).toLocaleString() : "No deadline"}
- Assessment Invite Link: ${cand.inviteLink}

Please use the link above to start the assessment.

Best regards,
CD-Recruit Team`;

    navigator.clipboard.writeText(emailText);
    setCopiedId(`email-${cand.inviteId}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleBulkAdd = async () => {
    if (candidatesList.length === 0) {
      alert("No valid candidates parsed. Format: Name, Email (one per line)");
      return;
    }
    setBulkLoading(true);
    try {
      const addCandidatesBulkAction = useStore.getState().addCandidatesBulk;
      await addCandidatesBulkAction(
        driveId,
        candidatesList.map((c) => ({ name: c.name, candidateEmail: c.email })),
      );
      setCandidateInput("");
      alert(`Successfully added ${candidatesList.length} candidates!`);
      loadData();
    } catch (err: any) {
      alert("Failed to add candidates: " + err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  // CSV Parser Utility
  function parseCSV(text: string) {
    const lines = [];
    let row: string[] = [];
    let inQuotes = false;
    let val = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          val += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === "," && !inQuotes) {
        row.push(val.trim());
        val = "";
      } else if ((c === "\n" || c === "\r") && !inQuotes) {
        if (c === "\r" && next === "\n") i++;
        row.push(val.trim());
        if (row.length > 0 && row.some((x) => x)) {
          lines.push(row);
        }
        row = [];
        val = "";
      } else {
        val += c;
      }
    }
    if (val || row.length > 0) {
      row.push(val.trim());
      lines.push(row);
    }
    return lines;
  }

  const handleDownloadSample = () => {
    const headers = "name,email";
    const sampleRow = '"John Doe",john@example.com\n"Jane Smith",jane@example.com';
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(headers + "\n" + sampleRow);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", "sample_candidates.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
  };

  const handleImportCSV = () => {
    if (!csvFile) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          alert("CSV must contain headers (name, email) and at least one candidate row.");
          return;
        }
        const headers = rows[0].map((h) => h.toLowerCase().trim());
        const nameIdx = headers.indexOf("name");
        const emailIdx = headers.indexOf("email");
        if (nameIdx === -1 || emailIdx === -1) {
          alert("CSV must contain both 'name' and 'email' columns.");
          return;
        }

        const parsed: Array<{ name: string; email: string }> = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length === 0 || (row.length === 1 && !row[0])) continue;
          const name = row[nameIdx]?.trim();
          const email = row[emailIdx]?.trim();
          if (name && email) {
            parsed.push({ name, email });
          }
        }

        if (parsed.length === 0) {
          alert("No valid candidates found in CSV.");
          return;
        }

        setBulkLoading(true);
        const addCandidatesBulkAction = useStore.getState().addCandidatesBulk;
        await addCandidatesBulkAction(
          driveId,
          parsed.map((c) => ({ name: c.name, candidateEmail: c.email })),
        );
        setCsvFile(null);
        alert(`Successfully imported ${parsed.length} candidates from CSV!`);
        loadData();
      } catch (err: any) {
        alert("CSV parse failed: " + err.message);
      } finally {
        setBulkLoading(false);
      }
    };
    reader.readAsText(csvFile);
  };

  const handleGenerateLinks = async () => {
    if (confirm("Are you sure you want to generate invite links? This will lock editing of this drive's configurations.")) {
      setGenerating(true);
      try {
        await generateDriveLinks(driveId);
        alert("Invite links generated successfully!");
        loadData();
      } catch (err: any) {
        alert("Failed to generate links: " + err.message);
      } finally {
        setGenerating(false);
      }
    }
  };

  const handleExtend = async () => {
    if (!extendInviteId) return;
    try {
      await extendExpiry(extendInviteId, new Date(extendExpiryDate).toISOString());
      setExtendInviteId(null);
      loadData();
    } catch (err) {
      alert("Failed extending invite");
    }
  };

  const handleRegenerate = async (id: string) => {
    try {
      await regenerateToken(id);
      loadData();
    } catch (err) {
      alert("Failed regenerating token");
    }
  };

  const handleSaveConfig = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: editName,
          scheduleStart: editStart ? new Date(editStart).toISOString() : null,
          scheduleEnd: editEnd ? new Date(editEnd).toISOString() : null,
          status: editStatus,
          moduleConfig,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to save configuration");
      }
      alert("Configuration saved successfully!");
      loadData();
    } catch (err: any) {
      alert("Failed to save configuration: " + err.message);
    }
  };

  const handleSaveQuestions = async () => {
    try {
      await saveDriveQuestions(driveId, assignedQuestions);
      alert("Question assignments updated successfully!");
      loadData();
    } catch (err: any) {
      alert("Failed saving questions: " + err.message);
    }
  };

  if (loading) {
    return (
      <AppShell title="Drive Details">
        <div className="p-8 text-center text-[#5B5B64] font-mono text-[13px]">
          Loading drive details…
        </div>
      </AppShell>
    );
  }

  if (!drive) {
    return (
      <AppShell title="Drive Details">
        <div className="p-8 text-center text-[#EF4444] font-mono text-[13px]">Drive not found.</div>
      </AppShell>
    );
  }

  const isLocked = drive.roster.some((c) => c.isGenerated);
  const ungeneratedCount = drive.roster.filter((c) => !c.isGenerated).length;

  const STATUS_COLOR: Record<string, string> = {
    DRAFT: "bg-[#EFF0F3] text-[#5B5B64]",
    SCHEDULED: "bg-[#EAF0FF] text-[#15308F]",
    ACTIVE: "bg-[#E3F9F2] text-[#0C6B58]",
    CLOSED: "bg-[#FEE2E2] text-[#EF4444]",
  };

  return (
    <AppShell
      title={drive.name}
      count={`${drive.roster.length} Candidates (${drive.roster.filter((c) => c.isGenerated).length} Generated)`}
      actions={
        <span
          className={`px-3 py-1 rounded-full text-[11px] font-bold font-mono uppercase shadow-sm ${
            STATUS_COLOR[drive.status] || "bg-[#EFF0F3] text-[#5B5B64]"
          }`}
        >
          {drive.status}
        </span>
      }
    >
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-[12px] text-[#5B5B64] mb-5 font-medium">
        <Link to="/drives" className="hover:text-[#2F5CFF] hover:underline transition-colors">
          Drives
        </Link>
        <span className="text-[#9C9CA5]">/</span>
        <span className="text-[#0B0B0D] truncate max-w-[200px]">{drive.name}</span>
      </div>

      {/* Invite Token Banner Notice */}
      {isLocked && (
        <div className="mb-6 p-4 bg-[#EFF4FF] border border-[#BFDBFE] rounded-[10px] text-[#15308F] text-[13px] flex items-center gap-2 shadow-sm">
          <span className="font-semibold">⚠️ Locked:</span> Candidate invite links (tokens) have been generated for this drive. Details are locked and cannot be edited.
        </div>
      )}

      {/* Pending Link Generation Banner */}
      {!isLocked && ungeneratedCount > 0 && (
        <div className="mb-6 p-4 bg-[#FFF9E6] border border-[#FFEBAA] rounded-[10px] text-[#8A5E00] text-[13px] flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold">⚠️ Link Generation Pending:</span> {ungeneratedCount} candidate(s) are added, but invite links have not been generated yet.
          </div>
          <button
            onClick={handleGenerateLinks}
            disabled={generating}
            className="px-4 py-2 bg-[#2F5CFF] hover:bg-[#1E4DDF] disabled:bg-[#CBD5E1] text-white rounded font-bold text-[12px] shadow cursor-pointer transition-colors flex items-center gap-1.5"
          >
            {generating ? "Generating..." : "Generate Invite Links"}
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-[#E6E6EA] mb-6 gap-6">
        <button
          onClick={() => setActiveTab("roster")}
          className={`pb-3 text-[13.5px] font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "roster"
              ? "border-[#2F5CFF] text-[#2F5CFF]"
              : "border-transparent text-[#5B5B64] hover:text-[#0B0B0D]"
          }`}
        >
          <User size={15} /> Candidates Roster
        </button>
        <button
          onClick={() => setActiveTab("questions")}
          className={`pb-3 text-[13.5px] font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "questions"
              ? "border-[#2F5CFF] text-[#2F5CFF]"
              : "border-transparent text-[#5B5B64] hover:text-[#0B0B0D]"
          }`}
        >
          <BookOpen size={15} /> Questions Mapping
        </button>
        <button
          onClick={() => setActiveTab("configuration")}
          className={`pb-3 text-[13.5px] font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "configuration"
              ? "border-[#2F5CFF] text-[#2F5CFF]"
              : "border-transparent text-[#5B5B64] hover:text-[#0B0B0D]"
          }`}
        >
          <Settings size={15} /> Drive Configuration
        </button>
      </div>

      {/* Tab Content Panels */}
      {activeTab === "roster" && (
        <div className="space-y-6">
          {/* Importer Section */}
          {!isLocked && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white border border-[#E6E6EA] rounded-[10px] p-5 shadow-sm">
              {/* Option A: Manual Paste */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-[13px] font-semibold text-[#0B0B0D]">Option A: Paste Candidates</h4>
                  <span className="text-[11px] font-medium text-[#8B8B93]">Parsed: {candidatesList.length}</span>
                </div>
                <textarea
                  value={candidateInput}
                  onChange={(e) => setCandidateInput(e.target.value)}
                  placeholder="John Doe, john@example.com&#10;Jane Smith, jane@example.com"
                  rows={4}
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12.5px] font-mono focus:outline-none focus:border-[#2F5CFF]"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleBulkAdd}
                    disabled={bulkLoading || candidatesList.length === 0}
                    className="px-4 py-2 bg-[#2F5CFF] hover:bg-[#1E4DDF] disabled:bg-[#CBD5E1] text-white rounded text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:cursor-not-allowed"
                  >
                    {bulkLoading ? "Generating..." : "Add & Generate Links"}
                  </button>
                </div>
              </div>

              {/* Option B: CSV Upload */}
              <div className="space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <h4 className="text-[13px] font-semibold text-[#0B0B0D]">Option B: Import CSV File</h4>
                    <button
                      onClick={handleDownloadSample}
                      className="text-[11px] text-[#2F5CFF] hover:underline font-semibold cursor-pointer"
                    >
                      Download Sample CSV
                    </button>
                  </div>
                  <p className="text-[11.5px] text-[#8B8B93] mb-3">
                    Upload a CSV file containing columns <code>name</code> and <code>email</code>.
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="w-full text-[12px] text-[#5B5B64] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-[#E6E6EA] file:text-[12px] file:font-semibold file:bg-white file:text-[#0B0B0D] file:hover:bg-[#F7F7F9] file:cursor-pointer cursor-pointer border border-[#E6E6EA] rounded-md p-1.5"
                  />
                  {csvFile && (
                    <p className="text-[11px] text-[#0C6B58] font-mono mt-1">
                      Selected: {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>
                <div className="flex justify-end pt-3">
                  <button
                    onClick={handleImportCSV}
                    disabled={bulkLoading || !csvFile}
                    className="px-4 py-2 bg-[#2F5CFF] hover:bg-[#1E4DDF] disabled:bg-[#CBD5E1] text-white rounded text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:cursor-not-allowed"
                  >
                    {bulkLoading ? "Importing..." : "Upload & Generate Links"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Roster Table */}
          <div className="bg-white border border-[#E6E6EA] rounded-[10px] overflow-hidden shadow-sm">
            <div className="grid grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_2.5fr] gap-3 px-4 py-2.5 border-b border-[#E6E6EA] bg-[#F7F7F9] text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B5B64]">
              <div>Candidate Name</div>
              <div>Email</div>
              <div>Invite Status</div>
              <div>Assessment</div>
              <div>Score</div>
              <div className="text-right">Actions</div>
            </div>

            {drive.roster.length === 0 && (
              <div className="p-8 text-center text-[13px] text-[#8B8B93] bg-white">
                No candidates added to this drive.
              </div>
            )}

            {drive.roster.map((c) => (
              <div
                key={c.candidateId}
                className="grid grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_2.5fr] gap-3 px-4 py-3 border-b border-[#E6E6EA] last:border-b-0 items-center bg-white"
              >
                <div className="text-[13px] font-medium text-[#0B0B0D] truncate">{c.candidateName}</div>
                <div className="text-[12px] text-[#5B5B64] truncate">{c.candidateEmail}</div>
                <div>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                      !c.isGenerated
                        ? "bg-[#FFF2E6] text-[#AD5B0B]"
                        : c.inviteStatus === "PENDING"
                          ? "bg-[#EAF0FF] text-[#15308F]"
                          : c.inviteStatus === "REDEEMED"
                            ? "bg-[#E3F9F2] text-[#0C6B58]"
                            : c.inviteStatus === "EXPIRED"
                              ? "bg-[#FDF2E9] text-[#AD5B0B]"
                              : "bg-[#EFF0F3] text-[#5B5B64]"
                    }`}
                  >
                    {!c.isGenerated ? "DRAFT" : c.inviteStatus}
                  </span>
                </div>
                <div>
                  <span className="text-[12px] font-mono text-[#5B5B64]">
                    {c.sessionStatus || "Not Started"}
                  </span>
                </div>
                <div>
                  {c.compositeScore !== null ? (
                    <span className="text-[13px] font-mono font-semibold text-[#0B0B0D]">
                      {c.compositeScore}%
                    </span>
                  ) : (
                    <span className="text-[#9C9CA5]">—</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  {!c.isGenerated ? (
                    <>
                      <span className="text-[11px] font-mono text-[#AD5B0B] bg-[#FFF2E6] px-2.5 py-1 rounded font-medium">
                        Link Pending
                      </span>
                      <button
                        onClick={() => {
                          if (confirm("Are you sure you want to remove this candidate?")) {
                            revokeInvite(c.inviteId).then(() => loadData());
                          }
                        }}
                        className="p-1 border border-[#FEE2E2] bg-[#FEF2F2] text-[#EF4444] rounded hover:bg-[#FEE2E2] cursor-pointer"
                        title="Remove Candidate"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => copyInviteEmail(c)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#2F5CFF] cursor-pointer"
                      >
                        {copiedId === `email-${c.inviteId}` ? (
                          <Check size={11} className="text-[#0C6B58]" />
                        ) : (
                          <Mail size={11} />
                        )}
                        Copy Email
                      </button>

                      {c.inviteStatus === "PENDING" && (
                        <button
                          onClick={() => copyToClipboard(c.inviteLink, c.inviteId)}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] cursor-pointer"
                        >
                          {copiedId === c.inviteId ? (
                            <Check size={11} className="text-[#0C6B58]" />
                          ) : (
                            <Copy size={11} />
                          )}
                          Link
                        </button>
                      )}

                      {c.inviteStatus === "PENDING" && (
                        <button
                          onClick={() => {
                            if (confirm("Are you sure you want to revoke this invite?")) {
                              revokeInvite(c.inviteId).then(() => loadData());
                            }
                          }}
                          className="p-1 border border-[#FEE2E2] bg-[#FEF2F2] text-[#EF4444] rounded hover:bg-[#FEE2E2] cursor-pointer"
                          title="Revoke Invite"
                        >
                          <XCircle size={12} />
                        </button>
                      )}

                      {(c.inviteStatus === "PENDING" || c.inviteStatus === "EXPIRED") && (
                        <button
                          onClick={() => {
                            setExtendInviteId(c.inviteId);
                            setExtendExpiryDate(
                              new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 16)
                            );
                          }}
                          className="p-1 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] cursor-pointer"
                          title="Extend Expiration"
                        >
                          <CalendarDays size={12} />
                        </button>
                      )}

                      {c.inviteStatus !== "REDEEMED" && (
                        <button
                          onClick={() => handleRegenerate(c.inviteId)}
                          className="p-1 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] cursor-pointer"
                          title="Regenerate Token"
                        >
                          <RefreshCw size={12} />
                        </button>
                      )}

                      {c.sessionId && (
                        <Link
                          to="/reports"
                          className="p-1 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#2F5CFF]"
                          title="View Report"
                        >
                          <ExternalLink size={12} />
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "configuration" && (
        <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-6 space-y-6 shadow-sm">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">Drive Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={isLocked}
                className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none focus:border-[#2F5CFF] disabled:bg-[#F7F7F9] disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                disabled={isLocked}
                className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] disabled:bg-[#F7F7F9] disabled:cursor-not-allowed"
              >
                <option value="DRAFT">DRAFT</option>
                <option value="SCHEDULED">SCHEDULED</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">Start Date & Time</label>
              <input
                type="datetime-local"
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
                disabled={isLocked}
                className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] disabled:bg-[#F7F7F9] disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">End Date & Time</label>
              <input
                type="datetime-local"
                value={editEnd}
                onChange={(e) => setEditEnd(e.target.value)}
                disabled={isLocked}
                className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] disabled:bg-[#F7F7F9] disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Module Config List */}
          <div className="border-t border-[#E6E6EA] pt-6 space-y-4">
            <h4 className="text-[13px] font-semibold text-[#0B0B0D]">Assessment Modules</h4>
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(moduleConfig).map(([mod, conf]: [string, any]) => (
                <div
                  key={mod}
                  className="p-4 border border-[#E6E6EA] rounded-lg flex items-center justify-between bg-white shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={conf.enabled}
                      disabled={isLocked}
                      onChange={(e) => {
                        setModuleConfig({
                          ...moduleConfig,
                          [mod]: { ...conf, enabled: e.target.checked },
                        });
                      }}
                      className="w-4 h-4 rounded text-[#2F5CFF] focus:ring-[#2F5CFF] disabled:cursor-not-allowed cursor-pointer"
                    />
                    <div>
                      <div className="text-[13px] font-semibold text-[#0B0B0D]">{mod}</div>
                      <div className="text-[11px] text-[#8B8B93]">Weight: {conf.weight * 100}%</div>
                    </div>
                  </div>

                  {conf.enabled && (
                    <div className="flex items-center gap-5">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-[#5B5B64]">Duration:</span>
                        <input
                          type="number"
                          value={conf.durationMinutes}
                          disabled={isLocked}
                          onChange={(e) => {
                            setModuleConfig({
                              ...moduleConfig,
                              [mod]: { ...conf, durationMinutes: parseInt(e.target.value) || 1 },
                            });
                          }}
                          className="w-16 px-2 py-1 text-center border border-[#E6E6EA] rounded text-[12px] font-mono font-medium disabled:bg-[#F7F7F9] disabled:cursor-not-allowed"
                        />
                        <span className="text-[11px] text-[#8B8B93] font-medium">mins</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-[#5B5B64]">Weight:</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={conf.weight}
                          disabled={isLocked}
                          onChange={(e) => {
                            setModuleConfig({
                              ...moduleConfig,
                              [mod]: { ...conf, weight: parseFloat(e.target.value) || 0 },
                            });
                          }}
                          className="w-16 px-2 py-1 text-center border border-[#E6E6EA] rounded text-[12px] font-mono font-medium disabled:bg-[#F7F7F9] disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {!isLocked && (
            <div className="flex justify-end pt-4 border-t border-[#E6E6EA]">
              <button
                onClick={handleSaveConfig}
                className="px-5 py-2 text-white bg-[#2F5CFF] hover:bg-[#1E4DDF] font-semibold rounded shadow transition-colors cursor-pointer text-[12px]"
              >
                Save Configuration
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "questions" && (
        <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-6 space-y-6 shadow-sm">
          {(() => {
            const enabledMods = Object.entries(moduleConfig)
              .filter(([_, conf]: [string, any]) => conf.enabled)
              .map(([mod]) => mod);

            if (enabledMods.length === 0) {
              return (
                <div className="p-8 text-center text-[13px] text-[#8B8B93] bg-[#F7F7F9] rounded-lg border border-dashed border-[#E6E6EA] font-medium">
                  No assessment modules are enabled. Enable at least one module under the **Drive Configuration** tab first.
                </div>
              );
            }

            const activeMod = enabledMods.includes(activeQuestionModule) ? activeQuestionModule : enabledMods[0];

            // Filter questions bank by this module
            const availableQs = questionsBank.filter((q) => q.moduleType === activeMod);

            return (
              <div className="space-y-6">
                <div className="flex border-b border-[#EFF0F3] gap-4">
                  {enabledMods.map((mod) => (
                    <button
                      key={mod}
                      onClick={() => setActiveQuestionModule(mod)}
                      className={`pb-2.5 text-[12px] font-semibold border-b-2 transition-all cursor-pointer ${
                        activeMod === mod
                          ? "border-[#2F5CFF] text-[#2F5CFF]"
                          : "border-transparent text-[#5B5B64] hover:text-[#0B0B0D]"
                      }`}
                    >
                      {mod}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[13px] font-semibold text-[#0B0B0D]">
                      Select Questions for {activeMod}
                    </h4>
                    <span className="text-[11px] font-mono text-[#8B8B93]">
                      Role matched questions prioritized first
                    </span>
                  </div>

                  <div className="border border-[#E6E6EA] rounded-md divide-y divide-[#EFF0F3] max-h-[350px] overflow-y-auto bg-[#F7F7F9]">
                    {availableQs.length === 0 ? (
                      <p className="p-6 text-center text-[12px] text-[#8B8B93]">
                        No questions available in the question bank for {activeMod}.
                      </p>
                    ) : (
                      availableQs
                        // Sort questions by matching drive role template name first
                        .sort((a, b) => {
                          const aMatch = a.role?.toLowerCase() === drive.roleTemplateName?.toLowerCase() ? 1 : 0;
                          const bMatch = b.role?.toLowerCase() === drive.roleTemplateName?.toLowerCase() ? 1 : 0;
                          return bMatch - aMatch;
                        })
                        .map((q) => {
                          const isAssigned = assignedQuestions.includes(q.id);
                          const isRoleMatch = q.role?.toLowerCase() === drive.roleTemplateName?.toLowerCase();

                          return (
                            <div
                              key={q.id}
                              className="p-3.5 flex items-center justify-between hover:bg-[#F7F7F9] bg-white transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isAssigned}
                                  disabled={isLocked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setAssignedQuestions([...assignedQuestions, q.id]);
                                    } else {
                                      setAssignedQuestions(assignedQuestions.filter((id) => id !== q.id));
                                    }
                                  }}
                                  className="w-4 h-4 text-[#2F5CFF] border-[#E6E6EA] focus:ring-[#2F5CFF] rounded cursor-pointer disabled:cursor-not-allowed"
                                />
                                <div>
                                  <div className="text-[12px] font-semibold text-[#0B0B0D] line-clamp-1 flex items-center gap-2">
                                    {q.content?.prompt || q.content?.title || "Simulation Scenario"}
                                    {isRoleMatch && (
                                      <span className="px-1.5 py-0.2 rounded bg-[#E3F9F2] text-[#0C6B58] text-[9px] font-semibold uppercase font-mono">
                                        Role Match
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-[#8B8B93] uppercase font-mono mt-0.5">
                                    Difficulty: {q.difficulty} · Role: {q.role || "General"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>

                {!isLocked && (
                  <div className="flex justify-end pt-4 border-t border-[#E6E6EA]">
                    <button
                      onClick={handleSaveQuestions}
                      className="px-5 py-2 text-white bg-[#2F5CFF] hover:bg-[#1E4DDF] font-semibold rounded shadow transition-colors cursor-pointer text-[12px]"
                    >
                      Save Question Assignments
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Extend Modal */}
      {extendInviteId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-[10px] w-full max-w-[400px] p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-[#0B0B0D]">Extend Invite Expiration</h3>
              <p className="text-[11px] text-[#8B8B93] mt-0.5">
                Select a new date and time for expiration:
              </p>
            </div>
            <div>
              <input
                type="datetime-local"
                value={extendExpiryDate}
                onChange={(e) => setExtendExpiryDate(e.target.value)}
                className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
              />
            </div>
            <div className="flex justify-end gap-2 text-[12px]">
              <button
                onClick={() => setExtendInviteId(null)}
                className="px-3 py-1.5 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64]"
              >
                Cancel
              </button>
              <button
                onClick={handleExtend}
                className="px-3.5 py-1.5 text-white bg-[#2F5CFF] rounded hover:bg-[#1E4DDF]"
              >
                Save Extensions
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
