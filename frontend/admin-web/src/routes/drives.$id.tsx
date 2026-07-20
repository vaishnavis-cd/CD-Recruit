import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Copy,
  Calendar,
  User,
  Check,
  Trash2,
  Mail,
  CalendarDays,
  RefreshCw,
  XCircle,
  X,
  Plus,
  FileText,
  Clock,
  Settings,
  BookOpen,
  AlertTriangle,
  Download,
  Upload,
  Search,
  Eye,
  CheckCircle2,
  Code2,
  Database,
  Bug,
  Bot,
  Play,
  Sparkles,
  Award,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type DriveDetail } from "../lib/types";

export const Route = createFileRoute("/drives/$id")({
  component: DriveDetailPage,
  head: () => ({
    meta: [
      { title: "Drive Configuration — CD-Recruit" },
      {
        name: "description",
        content: "Configure drive schedule, select 6 assessment modules, assign questions, and manage candidate roster.",
      },
    ],
  }),
});

// Helper functions for 12-hour AM/PM time conversions
function isoToAmPm(isoString?: string | null) {
  if (!isoString) return { date: "", hour: "09", minute: "00", ampm: "AM" };
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return { date: "", hour: "09", minute: "00", ampm: "AM" };

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;

  let rawHour = d.getHours();
  const ampm = rawHour >= 12 ? "PM" : "AM";
  rawHour = rawHour % 12 || 12;
  const hour = String(rawHour).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");

  return { date, hour, minute, ampm };
}

function amPmToIso(date: string, hour: string, minute: string, ampm: string) {
  if (!date) return null;
  let h = parseInt(hour, 10) || 12;
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;

  const m = parseInt(minute, 10) || 0;
  const d = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
  return d.toISOString();
}

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
  const [activeTab, setActiveTab] = useState<"roster" | "questions" | "configuration">("configuration");
  const [activeQuestionModule, setActiveQuestionModule] = useState<string>("MCQ");

  // Config States
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<string>("DRAFT");
  const [preferredLanguage, setPreferredLanguage] = useState<string>("javascript");

  // 12-Hour AM/PM Schedule state
  const [startDate, setStartDate] = useState("");
  const [startHour, setStartHour] = useState("09");
  const [startMinute, setStartMinute] = useState("00");
  const [startAmPm, setStartAmPm] = useState("AM");

  const [endDate, setEndDate] = useState("");
  const [endHour, setEndHour] = useState("05");
  const [endMinute, setEndMinute] = useState("00");
  const [endAmPm, setEndAmPm] = useState("PM");

  // Module Config State (6 Modules)
  const [moduleConfig, setModuleConfig] = useState<Record<string, { enabled: boolean; durationMinutes: number; weight: number }>>({
    MCQ: { enabled: true, durationMinutes: 15, weight: 20 },
    SQL: { enabled: true, durationMinutes: 20, weight: 20 },
    CODING: { enabled: true, durationMinutes: 30, weight: 25 },
    DEBUGGING: { enabled: true, durationMinutes: 20, weight: 15 },
    AI_PROMPTING: { enabled: true, durationMinutes: 15, weight: 10 },
    SIMULATION: { enabled: true, durationMinutes: 10, weight: 10 },
  });

  // Question Assignments State
  const [assignedQuestions, setAssignedQuestions] = useState<string[]>([]);
  const [questionSearch, setQuestionSearch] = useState("");

  // Bulk Candidate / Question Upload State
  const [bulkCandidateText, setBulkCandidateText] = useState("");
  const [questionCsvFile, setQuestionCsvFile] = useState<File | null>(null);
  const [candidateCsvFile, setCandidateCsvFile] = useState<File | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Confirmation Modal States
  const [confirmGenerateLinks, setConfirmGenerateLinks] = useState(false);
  const [confirmRevokeCandidate, setConfirmRevokeCandidate] = useState<any | null>(null);

  const loadData = async () => {
    try {
      const data = await fetchDriveDetail(driveId);
      setDrive(data);
      setEditName(data.name);
      setEditStatus(data.status);
      setAssignedQuestions(data.questionIds || []);

      // Parse schedule dates to 12-hour AM/PM controls
      const startParsed = isoToAmPm(data.scheduleStart);
      setStartDate(startParsed.date);
      setStartHour(startParsed.hour);
      setStartMinute(startParsed.minute);
      setStartAmPm(startParsed.ampm);

      const endParsed = isoToAmPm(data.scheduleEnd);
      setEndDate(endParsed.date);
      setEndHour(endParsed.hour);
      setEndMinute(endParsed.minute);
      setEndAmPm(endParsed.ampm);

      if (data.moduleConfig && Object.keys(data.moduleConfig).length > 0) {
        setModuleConfig(data.moduleConfig);
      }

      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    fetchQuestions();
  }, [driveId]);

  // Total Score Ceiling Calculation
  const totalWeightSum = useMemo(() => {
    return Object.entries(moduleConfig)
      .filter(([_, conf]) => conf.enabled)
      .reduce((sum, [_, conf]) => sum + (Number(conf.weight) || 0), 0);
  }, [moduleConfig]);

  // Auto-Balance Weights tool ( Ceil: 100 )
  const handleAutoBalanceWeights = () => {
    const enabledKeys = Object.keys(moduleConfig).filter((k) => moduleConfig[k].enabled);
    if (enabledKeys.length === 0) return;

    const equalWeight = Math.floor(100 / enabledKeys.length);
    const remainder = 100 - equalWeight * enabledKeys.length;

    const updated = { ...moduleConfig };
    enabledKeys.forEach((k, idx) => {
      updated[k] = {
        ...updated[k],
        weight: equalWeight + (idx === 0 ? remainder : 0),
      };
    });

    setModuleConfig(updated);
    toast.success("Scoring weights auto-balanced to sum to 100 points!");
  };

  const handleSaveConfiguration = async () => {
    try {
      const startIso = amPmToIso(startDate, startHour, startMinute, startAmPm);
      const endIso = amPmToIso(endDate, endHour, endMinute, endAmPm);

      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: editName,
          scheduleStart: startIso,
          scheduleEnd: endIso,
          status: editStatus,
          moduleConfig,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save configuration");
      }

      toast.success("Drive configuration saved successfully!");
      loadData();
    } catch (err: any) {
      toast.error("Failed saving configuration: " + (err.message || err));
    }
  };

  const handleSaveQuestions = async () => {
    try {
      await saveDriveQuestions(driveId, assignedQuestions);
      toast.success("Assigned questions saved!");
      loadData();
    } catch (err: any) {
      toast.error("Failed saving questions: " + err.message);
    }
  };

  const handleDownloadSampleQuestions = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/sample-csv/questions`, { headers });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sample_questions.csv";
      a.click();
    } catch (err) {
      toast.error("Failed downloading sample questions CSV");
    }
  };

  const handleDownloadSampleCandidates = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/sample-csv/candidates`, { headers });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sample_candidates.csv";
      a.click();
    } catch (err) {
      toast.error("Failed downloading sample candidates CSV");
    }
  };

  const handleGenerateLinks = async () => {
    setGenerating(true);
    try {
      await generateDriveLinks(driveId);
      toast.success("All candidate links generated and invitations created!");
      setConfirmGenerateLinks(false);
      loadData();
    } catch (err: any) {
      toast.error("Failed generating drive links: " + (err.message || err));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Drive Configuration">
        <div className="py-20 text-center text-[13px] text-[#8B8B93]">Loading drive settings…</div>
      </AppShell>
    );
  }

  if (!drive) {
    return (
      <AppShell title="Drive Configuration">
        <div className="py-12 text-center text-[#C0392B] text-[14px]">Drive record not found.</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`Drive: ${drive.name}`}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveConfiguration}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold text-white bg-[#2F5CFF] hover:bg-[#1E4DDF] rounded-md transition-colors cursor-pointer shadow-sm"
          >
            <Check size={14} /> Save Configuration
          </button>
          <button
            onClick={() => setConfirmGenerateLinks(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold text-[#0C6B58] bg-[#E3F9F2] hover:bg-[#C8F3E5] border border-[#A3EED7] rounded-md transition-colors cursor-pointer"
          >
            <Sparkles size={14} /> Schedule & Generate Links
          </button>
        </div>
      }
    >
      {/* Top Banner Navigation */}
      <div className="bg-white border border-[#E6E6EA] rounded-[12px] p-5 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-[18px] font-semibold text-[#0B0B0D]">{drive.name}</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#EAF0FF] text-[#15308F]">
              {drive.status}
            </span>
          </div>
          <p className="text-[12px] text-[#5B5B64]">
            Role Track: <span className="font-semibold text-[#0B0B0D]">{drive.roleTemplateName}</span> • Total Roster: {drive.roster.length} candidates
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-[#F7F7F9] p-1 rounded-md border border-[#E6E6EA] space-x-1">
          {(
            [
              { id: "configuration", label: "Drive Configuration", icon: Settings },
              { id: "questions", label: `Questions (${assignedQuestions.length})`, icon: BookOpen },
              { id: "roster", label: `Candidates (${drive.roster.length})`, icon: User },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium rounded transition-colors cursor-pointer ${
                  isActive ? "bg-white text-[#2F5CFF] shadow-sm font-semibold" : "text-[#5B5B64] hover:text-[#0B0B0D]"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* CONFIGURATION TAB */}
      {activeTab === "configuration" && (
        <div className="space-y-6">
          {/* SECTION 1: 12-Hour AM/PM Custom Theme Calendar & Time Picker */}
          <div className="bg-white border border-[#E6E6EA] rounded-[12px] p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EFF0F3] pb-3">
              <CalendarDays size={18} className="text-[#2F5CFF]" />
              <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Schedule & Window Timing (12-Hour AM/PM)</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Start Time */}
              <div className="bg-[#F7F7F9] border border-[#E6E6EA] rounded-md p-4 space-y-3">
                <label className="block text-[12px] font-mono uppercase tracking-wider text-[#5B5B64] font-semibold">
                  Assessment Start Date & Time
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-1.5 text-[13px] border border-[#E6E6EA] rounded bg-white font-mono focus:outline-none focus:border-[#2F5CFF]"
                  />
                  <div className="flex items-center gap-1 bg-white border border-[#E6E6EA] rounded px-2 py-1">
                    <input
                      type="text"
                      maxLength={2}
                      value={startHour}
                      onChange={(e) => setStartHour(e.target.value)}
                      className="w-7 text-center font-mono text-[13px] focus:outline-none"
                    />
                    <span>:</span>
                    <input
                      type="text"
                      maxLength={2}
                      value={startMinute}
                      onChange={(e) => setStartMinute(e.target.value)}
                      className="w-7 text-center font-mono text-[13px] focus:outline-none"
                    />
                    <select
                      value={startAmPm}
                      onChange={(e) => setStartAmPm(e.target.value)}
                      className="ml-1 text-[12px] font-semibold text-[#2F5CFF] focus:outline-none cursor-pointer"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* End Time */}
              <div className="bg-[#F7F7F9] border border-[#E6E6EA] rounded-md p-4 space-y-3">
                <label className="block text-[12px] font-mono uppercase tracking-wider text-[#5B5B64] font-semibold">
                  Assessment End Date & Time
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-1.5 text-[13px] border border-[#E6E6EA] rounded bg-white font-mono focus:outline-none focus:border-[#2F5CFF]"
                  />
                  <div className="flex items-center gap-1 bg-white border border-[#E6E6EA] rounded px-2 py-1">
                    <input
                      type="text"
                      maxLength={2}
                      value={endHour}
                      onChange={(e) => setEndHour(e.target.value)}
                      className="w-7 text-center font-mono text-[13px] focus:outline-none"
                    />
                    <span>:</span>
                    <input
                      type="text"
                      maxLength={2}
                      value={endMinute}
                      onChange={(e) => setEndMinute(e.target.value)}
                      className="w-7 text-center font-mono text-[13px] focus:outline-none"
                    />
                    <select
                      value={endAmPm}
                      onChange={(e) => setEndAmPm(e.target.value)}
                      className="ml-1 text-[12px] font-semibold text-[#2F5CFF] focus:outline-none cursor-pointer"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: 6 Module Selection & 100-Point Scoring Ceiling */}
          <div className="bg-white border border-[#E6E6EA] rounded-[12px] p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-[#EFF0F3] pb-3">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-[#0C6B58]" />
                <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Module Selection & 100-Point Scoring Ceiling</h3>
              </div>

              {/* Total Score Badge & Auto Balance */}
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-[12px] font-mono font-bold ${
                    totalWeightSum === 100
                      ? "bg-[#E3F9F2] text-[#0C6B58]"
                      : "bg-[#FFF5F5] text-[#C0392B] border border-red-200"
                  }`}
                >
                  Total Weight: {totalWeightSum} / 100 pts
                </span>
                <button
                  onClick={handleAutoBalanceWeights}
                  className="px-3 py-1 text-[11px] font-semibold text-[#2F5CFF] bg-[#EAF0FF] hover:bg-[#D6E4FF] rounded border border-[#B3C5FF] transition-colors cursor-pointer"
                >
                  Auto-Balance Weights
                </button>
              </div>
            </div>

            {/* Preferred HR Language for Coding & Debugging */}
            <div className="flex items-center gap-4 bg-[#F7F7F9] p-3.5 rounded-md border border-[#E6E6EA]">
              <label className="text-[12px] font-semibold text-[#0B0B0D]">HR Preferred Programming Language:</label>
              <select
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="px-3 py-1.5 text-[12px] font-mono border border-[#E6E6EA] rounded bg-white text-[#2F5CFF] font-semibold focus:outline-none"
              >
                <option value="javascript">JavaScript (Node.js)</option>
                <option value="python">Python 3</option>
                <option value="java">Java 17</option>
                <option value="cpp">C++ 20</option>
                <option value="typescript">TypeScript</option>
              </select>
            </div>

            {/* 6 Modules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {(
                [
                  { id: "MCQ", name: "Multiple Choice (MCQ)", icon: CheckCircle2, desc: "Evaluated deterministically" },
                  { id: "SQL", name: "SQL Queries", icon: Database, desc: "Evaluated via Judge0 DB" },
                  { id: "CODING", name: "Coding / DSA", icon: Code2, desc: "Evaluated via Judge0" },
                  { id: "DEBUGGING", name: "Debugging (NEW)", icon: Bug, desc: "Evaluated via Judge0" },
                  { id: "AI_PROMPTING", name: "AI Prompting", icon: Bot, desc: "Evaluated via Groq/Cerebras" },
                  { id: "SIMULATION", name: "Simulation Log", icon: Play, desc: "Evaluated via Groq/Cerebras" },
                ] as const
              ).map((mod) => {
                const Icon = mod.icon;
                const conf = moduleConfig[mod.id] || { enabled: false, durationMinutes: 15, weight: 15 };
                return (
                  <div
                    key={mod.id}
                    className={`border rounded-md p-4 space-y-3 transition-colors ${
                      conf.enabled ? "bg-white border-[#2F5CFF] shadow-sm" : "bg-[#F7F7F9] border-[#E6E6EA] opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold text-[13px] text-[#0B0B0D]">
                        <Icon size={16} className={conf.enabled ? "text-[#2F5CFF]" : "text-[#8B8B93]"} />
                        {mod.name}
                      </div>
                      <input
                        type="checkbox"
                        checked={conf.enabled}
                        onChange={(e) =>
                          setModuleConfig({
                            ...moduleConfig,
                            [mod.id]: { ...conf, enabled: e.target.checked },
                          })
                        }
                        className="w-4 h-4 text-[#2F5CFF] rounded cursor-pointer"
                      />
                    </div>
                    <p className="text-[11px] text-[#8B8B93]">{mod.desc}</p>

                    {conf.enabled && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#EFF0F3] text-[11px]">
                        <div>
                          <label className="block text-[#5B5B64] font-medium mb-1">Duration (min)</label>
                          <input
                            type="number"
                            value={conf.durationMinutes}
                            onChange={(e) =>
                              setModuleConfig({
                                ...moduleConfig,
                                [mod.id]: { ...conf, durationMinutes: Number(e.target.value) },
                              })
                            }
                            className="w-full px-2 py-1 border border-[#E6E6EA] rounded font-mono text-[12px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[#5B5B64] font-medium mb-1">Score Weight (pts)</label>
                          <input
                            type="number"
                            value={conf.weight}
                            onChange={(e) =>
                              setModuleConfig({
                                ...moduleConfig,
                                [mod.id]: { ...conf, weight: Number(e.target.value) },
                              })
                            }
                            className="w-full px-2 py-1 border border-[#E6E6EA] rounded font-mono text-[12px]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* QUESTIONS TAB */}
      {activeTab === "questions" && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E6E6EA] rounded-[12px] p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFF0F3] pb-4">
              <div>
                <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Question Bank Assignment & Bulk Upload</h3>
                <p className="text-[12px] text-[#5B5B64] mt-0.5">Assign questions from library or bulk import CSV files.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadSampleQuestions}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#5B5B64] bg-white border border-[#E6E6EA] hover:bg-[#F7F7F9] rounded"
                >
                  <Download size={13} /> Sample Question CSV
                </button>
                <button
                  onClick={handleSaveQuestions}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold text-white bg-[#2F5CFF] hover:bg-[#1E4DDF] rounded shadow-sm"
                >
                  Save Question Assignments
                </button>
              </div>
            </div>

            {/* Question Selector List */}
            <div className="divide-y divide-[#EFF0F3] border border-[#E6E6EA] rounded-md max-h-[400px] overflow-y-auto">
              {questionsBank.map((q) => {
                const isSelected = assignedQuestions.includes(q.id);
                return (
                  <div key={q.id} className="p-3.5 flex items-center justify-between hover:bg-[#F7F7F9] transition-colors">
                    <div>
                      <span className="text-[12px] font-mono uppercase font-semibold text-[#2F5CFF] mr-2">{q.moduleType}</span>
                      <span className="text-[13px] font-semibold text-[#0B0B0D]">{q.content?.title || "Question"}</span>
                    </div>
                    <button
                      onClick={() => {
                        if (isSelected) {
                          setAssignedQuestions(assignedQuestions.filter((id) => id !== q.id));
                        } else {
                          setAssignedQuestions([...assignedQuestions, q.id]);
                        }
                      }}
                      className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                        isSelected ? "bg-red-50 text-red-600 border border-red-200" : "bg-[#2F5CFF] text-white"
                      }`}
                    >
                      {isSelected ? "Remove" : "Assign"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ROSTER TAB */}
      {activeTab === "roster" && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E6E6EA] rounded-[12px] p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFF0F3] pb-4">
              <div>
                <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Candidate Roster & Link Generation</h3>
                <p className="text-[12px] text-[#5B5B64] mt-0.5">Manage candidates and copy assessment invitation links.</p>
              </div>
              <button
                onClick={handleDownloadSampleCandidates}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#5B5B64] bg-white border border-[#E6E6EA] hover:bg-[#F7F7F9] rounded"
              >
                <Download size={13} /> Sample Candidate CSV
              </button>
            </div>

            {/* Candidates Table */}
            <div className="overflow-x-auto border border-[#E6E6EA] rounded-md">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="bg-[#F7F7F9] text-[11px] font-mono uppercase text-[#5B5B64] border-b border-[#E6E6EA]">
                    <th className="p-3">Candidate</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFF0F3]">
                  {drive.roster.map((c) => (
                    <tr key={c.candidateId} className="hover:bg-[#F7F7F9]">
                      <td className="p-3 font-semibold text-[#0B0B0D]">{c.candidateName}</td>
                      <td className="p-3 font-mono text-[12px] text-[#5B5B64]">{c.candidateEmail}</td>
                      <td className="p-3 font-mono text-[11px]">{c.inviteStatus}</td>
                      <td className="p-3 text-right">
                        {c.sessionId && (
                          <Link
                            to="/results/$id"
                            params={{ id: c.sessionId }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-[#EAF0FF] text-[#2F5CFF] rounded"
                          >
                            <Eye size={12} /> View Results
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Generate Links Modal */}
      {confirmGenerateLinks && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[440px] p-6 shadow-2xl space-y-4">
            <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Confirm Drive Schedule & Link Generation</h3>
            <p className="text-[13px] text-[#5B5B64]">
              Generate assessment links for all {drive.roster.length} candidate(s) in roster?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmGenerateLinks(false)}
                className="px-3.5 py-2 text-[12px] font-medium border border-[#E6E6EA] rounded hover:bg-[#F7F7F9]"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateLinks}
                disabled={generating}
                className="px-4 py-2 text-[12px] font-semibold text-white bg-[#0C6B58] hover:bg-[#095445] rounded"
              >
                {generating ? "Generating..." : "Generate Links"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
