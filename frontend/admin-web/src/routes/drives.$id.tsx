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
import { SingleDateTimePicker } from "../components/single-date-time-picker";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type DriveDetail } from "../lib/types";

export const Route = createFileRoute("/drives/$id")({
  component: DriveDetailPage,
  head: () => ({
    meta: [
      { title: "Drive Configuration — CD-Recruit" },
      {
        name: "description",
        content: "Configure drive schedule, select assessment modules, assign questions, and manage candidate roster.",
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
  const addCandidatesBulk = useStore((s) => s.addCandidatesBulk);
  const generateDriveLinks = useStore((s) => s.generateDriveLinks);

  const [drive, setDrive] = useState<DriveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Tab State
  const [activeTab, setActiveTab] = useState<"roster" | "questions" | "configuration">("configuration");

  // Config States
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<string>("DRAFT");

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
  const [savedAssignedQuestions, setSavedAssignedQuestions] = useState<string[]>([]);
  const [pendingTabSwitch, setPendingTabSwitch] = useState<"roster" | "configuration" | null>(null);
  const [questionModuleFilter, setQuestionModuleFilter] = useState<string>("ALL");
  const [questionSearch, setQuestionSearch] = useState("");
  const [previewQuestion, setPreviewQuestion] = useState<any | null>(null);

  // Add Candidate Modal State
  const [showAddCandidateModal, setShowAddCandidateModal] = useState(false);
  const [candidateNameInput, setCandidateNameInput] = useState("");
  const [candidateEmailInput, setCandidateEmailInput] = useState("");

  // Copy candidate link state
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);

  const copyCandidateLink = async (link: string, candidateId: string) => {
    if (!link) {
      toast.error("Invite link not yet generated. Click 'Generate Links' above.");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCandidateId(candidateId);
      toast.success("Unique candidate assessment link copied to clipboard!");
      setTimeout(() => setCopiedCandidateId(null), 2000);
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  // Confirmation Modal States
  const [confirmGenerateLinks, setConfirmGenerateLinks] = useState(false);

  const loadData = async () => {
    try {
      const data = await fetchDriveDetail(driveId);
      setDrive(data);
      setEditName(data.name);
      setEditStatus(data.status);
      setAssignedQuestions(data.questionIds || []);
      setSavedAssignedQuestions(data.questionIds || []);

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

  const handleStatusChange = async (newStatus: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update status");
      }

      toast.success(`Drive status updated to ${newStatus}!`);
      setEditStatus(newStatus);
      loadData();
    } catch (err: any) {
      toast.error("Failed to update drive status: " + (err.message || err));
    }
  };

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

  const enabledModuleKeys = useMemo(() => {
    return Object.keys(moduleConfig).filter((k) => moduleConfig[k]?.enabled);
  }, [moduleConfig]);

  const isQuestionsDirty = useMemo(() => {
    const sortedCurrent = [...assignedQuestions].sort();
    const sortedSaved = [...savedAssignedQuestions].sort();
    return JSON.stringify(sortedCurrent) !== JSON.stringify(sortedSaved);
  }, [assignedQuestions, savedAssignedQuestions]);

  const handleTabSwitch = (targetTab: "configuration" | "questions" | "roster") => {
    if (activeTab === "questions" && targetTab !== "questions" && isQuestionsDirty) {
      setPendingTabSwitch(targetTab);
      return;
    }
    setActiveTab(targetTab);
  };

  const handleSaveQuestions = async () => {
    try {
      await saveDriveQuestions(driveId, assignedQuestions);
      setSavedAssignedQuestions([...assignedQuestions]);
      toast.success("Assigned questions saved!");
      loadData();
    } catch (err: any) {
      toast.error("Failed saving questions: " + err.message);
    }
  };

  const handleAddCandidate = async () => {
    if (!candidateNameInput.trim() || !candidateEmailInput.trim()) {
      toast.error("Please enter candidate name and email.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(candidateEmailInput.trim())) {
      toast.error("Please enter a valid email address.");
      return;
    }
    try {
      await addCandidatesBulk(driveId, [
        {
          name: candidateNameInput.trim(),
          candidateEmail: candidateEmailInput.trim(),
        },
      ]);
      toast.success("Candidate added successfully!");
      setShowAddCandidateModal(false);
      setCandidateNameInput("");
      setCandidateEmailInput("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to add candidate");
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
      toast.error("Failed to download sample questions template.");
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
      toast.error("Failed to download sample candidates template.");
    }
  };

  const handleGenerateLinks = async () => {
    setGenerating(true);
    try {
      await generateDriveLinks(driveId);
      toast.success("All candidate links generated and drive activated!");
      setConfirmGenerateLinks(false);
      loadData();
    } catch (err: any) {
      toast.error("Failed generating drive links: " + (err.message || err));
    } finally {
      setGenerating(false);
    }
  };

  // Filtered Questions Bank List (Filtered to only modules enabled in drive configuration)
  const filteredQuestionsList = useMemo(() => {
    return questionsBank.filter((q) => {
      if (questionModuleFilter === "ALL") {
        if (!enabledModuleKeys.includes(q.moduleType)) return false;
      } else {
        if (q.moduleType !== questionModuleFilter) return false;
      }

      if (questionSearch.trim()) {
        const s = questionSearch.toLowerCase().trim();
        const title = (q.content?.title || q.content?.prompt || q.content?.text || q.content?.question || "").toLowerCase();
        const tags = (q.tags || []).join(" ").toLowerCase();
        if (!title.includes(s) && !tags.includes(s)) return false;
      }
      return true;
    });
  }, [questionsBank, enabledModuleKeys, questionModuleFilter, questionSearch]);

  if (loading || !drive) {
    return (
      <AppShell title="Drive Configuration">
        <div className="flex items-center justify-center py-20 text-[#5B5B64]">
          Loading drive configuration details...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`Drive Configuration — ${drive.name}`}
      actions={
        <div className="flex items-center gap-3">
          <Link
            to="/drives"
            className="px-3 py-1.5 text-[12px] font-semibold text-[#5B5B64] hover:text-[#0B0B0D] bg-white border border-[#E6E6EA] rounded-md transition-colors"
          >
            ← Back to Drives
          </Link>
          <button
            onClick={() => setConfirmGenerateLinks(true)}
            disabled={generating}
            className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold text-white bg-[#2F5CFF] rounded-md hover:bg-[#0037FF] transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Sparkles size={14} /> Schedule &amp; Generate Links
          </button>
        </div>
      }
    >
      {/* Top Banner Navigation */}
      <div className="bg-white border border-[#E6E6EA] rounded-[12px] p-5 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-[18px] font-semibold text-[#0B0B0D]">{drive.name}</h2>
            <div className="relative inline-flex items-center">
              <select
                value={drive.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className={`
                  appearance-none px-3 py-1 pr-7 rounded-full text-[11px] font-mono font-bold cursor-pointer transition-all border outline-none shadow-sm
                  ${drive.status === 'ACTIVE' ? 'bg-[#E3F9F2] text-[#0C6B58] border-[#A3E6D5] hover:bg-[#D1F4E9]' : ''}
                  ${drive.status === 'SCHEDULED' ? 'bg-[#EAF0FF] text-[#15308F] border-[#C5D7FE] hover:bg-[#D9E5FF]' : ''}
                  ${drive.status === 'DRAFT' ? 'bg-[#FFF8E6] text-[#B7791F] border-[#FEEBC8] hover:bg-[#FEF0CD]' : ''}
                  ${drive.status === 'CLOSED' ? 'bg-[#FFF5F5] text-[#C0392B] border-[#FEB2B2] hover:bg-[#FEE2E2]' : ''}
                `}
                title="Click to change Drive Status"
              >
                <option value="DRAFT">DRAFT</option>
                <option value="SCHEDULED">SCHEDULED</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="CLOSED">CLOSED</option>
              </select>
              <span className="pointer-events-none absolute right-2 text-[9px] text-current opacity-70">▼</span>
            </div>
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
                onClick={() => handleTabSwitch(tab.id as any)}
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
          {/* SECTION 1: Single Calendar Date & Start/End Time Window Picker */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Schedule Date & Assessment Window</h3>
                <p className="text-[12px] text-[#5B5B64]">Select the drive date on the calendar, then set the start time and end time for the assessment.</p>
              </div>
            </div>

            <SingleDateTimePicker
              selectedDate={startDate || endDate || new Date().toISOString().slice(0, 10)}
              startHour={startHour}
              startMinute={startMinute}
              startAmPm={startAmPm}
              endHour={endHour}
              endMinute={endMinute}
              endAmPm={endAmPm}
              onChange={(data) => {
                setStartDate(data.date);
                setEndDate(data.date);
                setStartHour(data.startHour);
                setStartMinute(data.startMinute);
                setStartAmPm(data.startAmPm);
                setEndHour(data.endHour);
                setEndMinute(data.endMinute);
                setEndAmPm(data.endAmPm);
              }}
            />
          </div>

          {/* SECTION 2: Module Selection & 100-Point Scoring Ceiling */}
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

            {/* 6 Modules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {(
                [
                  { id: "MCQ", name: "Multiple Choice (MCQ)", icon: CheckCircle2, desc: "Evaluated deterministically" },
                  { id: "SQL", name: "SQL Queries", icon: Database, desc: "Evaluated via Judge0 DB" },
                  { id: "CODING", name: "Coding / DSA", icon: Code2, desc: "Evaluated via Judge0" },
                  { id: "DEBUGGING", name: "Debugging (NEW)", icon: Bug, desc: "Evaluated via Judge0" },
                  { id: "AI_PROMPTING", name: "AI Prompting", icon: Bot, desc: "Evaluated via Groq/Cerebras" },
                  { id: "SIMULATION", name: "Contextual Simulation", icon: Play, desc: "On-call incident & ticket simulation evaluated via LLM" },
                ] as const
              ).map((mod) => {
                const Icon = mod.icon;
                const conf = moduleConfig[mod.id] || { enabled: false, durationMinutes: 15, weight: 15 };
                return (
                  <div
                    key={mod.id}
                    onClick={() => {
                      setModuleConfig({
                        ...moduleConfig,
                        [mod.id]: { ...conf, enabled: !conf.enabled },
                      });
                    }}
                    className={`border rounded-md p-4 space-y-3 transition-colors cursor-pointer select-none ${
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
                        onChange={() => {}}
                        className="w-4 h-4 text-[#2F5CFF] rounded cursor-pointer pointer-events-none"
                      />
                    </div>
                    <p className="text-[11px] text-[#8B8B93]">{mod.desc}</p>

                    {conf.enabled && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="grid grid-cols-2 gap-2 pt-2 border-t border-[#EFF0F3] text-[11px]"
                      >
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
                <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Question Bank Assignment</h3>
                <p className="text-[12px] text-[#5B5B64] mt-0.5">
                  Select and assign questions from the central question library.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadSampleQuestions}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#5B5B64] bg-white border border-[#E6E6EA] hover:bg-[#F7F7F9] rounded cursor-pointer"
                >
                  <Download size={13} /> Sample Question CSV
                </button>
                <button
                  onClick={handleSaveQuestions}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold text-white bg-[#2F5CFF] hover:bg-[#0037FF] rounded shadow-sm transition-colors cursor-pointer"
                >
                  <Check size={14} /> Save Question Assignments ({assignedQuestions.length})
                </button>
              </div>
            </div>

            {/* Horizontal Module Filter Chips & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#F7F7F9] p-3 rounded-lg border border-[#E6E6EA]">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setQuestionModuleFilter("ALL")}
                  className={`px-3 py-1 rounded-md text-[12px] font-medium border transition-colors cursor-pointer ${
                    questionModuleFilter === "ALL"
                      ? "bg-[#2F5CFF] text-white border-[#2F5CFF]"
                      : "bg-white text-[#5B5B64] border-[#E6E6EA] hover:border-[#D1D1D8]"
                  }`}
                >
                  All Selected Modules ({enabledModuleKeys.length})
                </button>
                {enabledModuleKeys.map((modKey) => {
                  const labelMap: Record<string, string> = {
                    MCQ: "MCQ",
                    SQL: "SQL",
                    CODING: "Coding",
                    DEBUGGING: "Debugging",
                    AI_PROMPTING: "AI Prompting",
                    SIMULATION: "Simulation",
                  };
                  return (
                    <button
                      key={modKey}
                      onClick={() => setQuestionModuleFilter(modKey)}
                      className={`px-3 py-1 rounded-md text-[12px] font-medium border transition-colors cursor-pointer ${
                        questionModuleFilter === modKey
                          ? "bg-[#2F5CFF] text-white border-[#2F5CFF]"
                          : "bg-white text-[#5B5B64] border-[#E6E6EA] hover:border-[#D1D1D8]"
                      }`}
                    >
                      {labelMap[modKey] || modKey}
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full sm:w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9CA5]" />
                <input
                  type="text"
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                  placeholder="Search questions..."
                  className="w-full pl-9 pr-3 py-1.5 text-[12px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
                />
              </div>
            </div>

            {/* Question Selector List */}
            <div className="divide-y divide-[#EFF0F3] border border-[#E6E6EA] rounded-md max-h-[460px] overflow-y-auto">
              {filteredQuestionsList.length === 0 ? (
                <div className="p-8 text-center text-[12px] italic text-[#8B8B93]">
                  No matching questions found in bank.
                </div>
              ) : (
                filteredQuestionsList.map((q) => {
                  const isSelected = assignedQuestions.includes(q.id);
                  const title = q.content?.title || q.content?.prompt || q.content?.text || q.content?.question || `Question #${q.id.slice(0, 6)}`;
                  const difficulty = q.difficulty || "MEDIUM";
                  return (
                    <div
                      key={q.id}
                      onClick={() => setPreviewQuestion(q)}
                      className="p-3.5 flex items-center justify-between hover:bg-[#F0F4FF]/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 pr-4 flex-1">
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-[#EAF0FF] text-[#15308F] border border-[#B3C5FF]">
                          {q.moduleType}
                        </span>
                        <div>
                          <div className="text-[13px] font-semibold text-[#0B0B0D] group-hover:text-[#2F5CFF] transition-colors line-clamp-1">
                            {title}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className={`text-[10px] font-mono font-semibold uppercase px-1.5 py-0.2 rounded ${
                                difficulty.toUpperCase() === "EASY"
                                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                  : difficulty.toUpperCase() === "HARD"
                                  ? "bg-rose-50 text-rose-600 border border-rose-200"
                                  : "bg-amber-50 text-amber-600 border border-amber-200"
                              }`}
                            >
                              {difficulty}
                            </span>
                            {q.tags && q.tags.length > 0 && (
                              <div className="flex items-center gap-1">
                                {q.tags.slice(0, 3).map((tag: string) => (
                                  <span key={tag} className="text-[10px] text-[#8B8B93] bg-[#EFF0F3] px-1.5 py-0.2 rounded">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#2F5CFF] opacity-0 group-hover:opacity-100 transition-opacity font-medium flex items-center gap-1">
                          <Eye size={12} /> Preview
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSelected) {
                              setAssignedQuestions(assignedQuestions.filter((id) => id !== q.id));
                            } else {
                              setAssignedQuestions([...assignedQuestions, q.id]);
                            }
                          }}
                          className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                              : "bg-[#2F5CFF] text-white hover:bg-[#0037FF]"
                          }`}
                        >
                          {isSelected ? "Remove" : "Assign"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
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

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddCandidateModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white bg-[#2F5CFF] hover:bg-[#0037FF] rounded shadow-sm transition-colors cursor-pointer"
                >
                  <Plus size={14} /> Add Candidate
                </button>
                <button
                  onClick={handleDownloadSampleCandidates}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#5B5B64] bg-white border border-[#E6E6EA] hover:bg-[#F7F7F9] rounded cursor-pointer"
                >
                  <Download size={13} /> Sample Candidate CSV
                </button>
              </div>
            </div>

            {/* Candidates Table */}
            <div className="overflow-x-auto border border-[#E6E6EA] rounded-md">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="bg-[#F7F7F9] text-[11px] font-mono uppercase text-[#5B5B64] border-b border-[#E6E6EA]">
                    <th className="p-3">Candidate</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Invite Link</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFF0F3]">
                  {drive.roster.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-[12px] italic text-[#8B8B93]">
                        No candidates added to roster yet. Click "Add Candidate" above to get started.
                      </td>
                    </tr>
                  ) : (
                    drive.roster.map((c) => (
                      <tr key={c.candidateId} className="hover:bg-[#F7F7F9]">
                        <td className="p-3 font-semibold text-[#0B0B0D]">{c.candidateName}</td>
                        <td className="p-3 font-mono text-[12px] text-[#5B5B64]">{c.candidateEmail}</td>
                        <td className="p-3 font-mono text-[11px]">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase font-mono ${
                              c.inviteStatus === "REDEEMED" || c.inviteStatus === "COMPLETED"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : c.isGenerated
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {c.isGenerated ? c.inviteStatus : "DRAFT"}
                          </span>
                        </td>
                        <td className="p-3">
                          {c.isGenerated && c.inviteLink ? (
                            <button
                              onClick={() => copyCandidateLink(c.inviteLink, c.candidateId)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-[#F0F4FF] hover:bg-[#D9E4FF] text-[#2F5CFF] rounded border border-[#B3C5FF] transition-colors cursor-pointer"
                            >
                              {copiedCandidateId === c.candidateId ? (
                                <>
                                  <Check size={12} className="text-emerald-600" />
                                  <span className="text-emerald-600 font-semibold">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} />
                                  <span>Copy Unique Link</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#8B8B93] italic">
                              Click "Generate Links" to activate
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {c.sessionId && (
                            <Link
                              to="/results/$id"
                              params={{ id: c.sessionId }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-[#EAF0FF] text-[#2F5CFF] rounded hover:bg-[#D9E4FF] transition-colors"
                            >
                              <Eye size={12} /> View Results
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Question Preview Modal (Blurred Background) */}
      {previewQuestion && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[640px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between bg-[#F7F7F9]">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-[11px] font-mono font-bold uppercase rounded bg-[#EAF0FF] text-[#15308F] border border-[#B3C5FF]">
                  {previewQuestion.moduleType}
                </span>
                <span
                  className={`text-[11px] font-mono font-semibold uppercase px-2 py-0.5 rounded ${
                    (previewQuestion.difficulty || "").toUpperCase() === "EASY"
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                      : (previewQuestion.difficulty || "").toUpperCase() === "HARD"
                      ? "bg-rose-50 text-rose-600 border border-rose-200"
                      : "bg-amber-50 text-amber-600 border border-amber-200"
                  }`}
                >
                  {previewQuestion.difficulty || "MEDIUM"}
                </span>
              </div>
              <button
                onClick={() => setPreviewQuestion(null)}
                className="text-[#8B8B93] hover:text-[#0B0B0D] p-1 rounded-md hover:bg-[#E6E6EA] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <h3 className="text-[16px] font-semibold text-[#0B0B0D] mb-2">
                  {previewQuestion.content?.title || previewQuestion.content?.prompt || previewQuestion.content?.text || previewQuestion.content?.question || "Question Details"}
                </h3>
                {previewQuestion.content?.description && (
                  <p className="text-[13px] text-[#5B5B64] leading-relaxed">
                    {previewQuestion.content.description}
                  </p>
                )}
              </div>

              {/* MCQ Options */}
              {previewQuestion.content?.options && Array.isArray(previewQuestion.content.options) && (
                <div className="space-y-2 pt-2 border-t border-[#EFF0F3]">
                  <label className="text-[12px] font-mono uppercase tracking-wider text-[#5B5B64] font-semibold block">
                    Options:
                  </label>
                  <div className="space-y-1.5">
                    {previewQuestion.content.options.map((opt: any, idx: number) => {
                      const isCorrect = opt.isCorrect || previewQuestion.content.correctAnswer === idx || previewQuestion.content.correctOption === idx;
                      const optText = typeof opt === "string" ? opt : opt.text || opt.label;
                      return (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-md text-[13px] border flex items-center justify-between ${
                            isCorrect ? "bg-emerald-50 border-emerald-200 text-emerald-900 font-medium" : "bg-[#F7F7F9] border-[#E6E6EA] text-[#0B0B0D]"
                          }`}
                        >
                          <span><strong className="font-mono mr-2">{String.fromCharCode(65 + idx)}.</strong> {optText}</span>
                          {isCorrect && <span className="text-[11px] font-bold text-emerald-600 bg-white px-2 py-0.5 rounded border border-emerald-200">Correct Answer</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Code Snippet / Problem Statement */}
              {previewQuestion.content?.problemStatement && (
                <div className="space-y-1.5 pt-2 border-t border-[#EFF0F3]">
                  <label className="text-[12px] font-mono uppercase tracking-wider text-[#5B5B64] font-semibold block">
                    Problem Statement:
                  </label>
                  <div className="p-3 bg-[#0B0B0D] text-slate-100 font-mono text-[12px] rounded-md whitespace-pre-wrap">
                    {previewQuestion.content.problemStatement}
                  </div>
                </div>
              )}

              {/* Tags */}
              {previewQuestion.tags && previewQuestion.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#EFF0F3]">
                  <span className="text-[11px] font-medium text-[#5B5B64]">Tags:</span>
                  {previewQuestion.tags.map((tag: string) => (
                    <span key={tag} className="text-[11px] text-[#2F5CFF] bg-[#EAF0FF] px-2 py-0.5 rounded font-mono">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[#E6E6EA] bg-[#F7F7F9] flex items-center justify-end">
              {/* <button
                onClick={() => setPreviewQuestion(null)}
                className="px-4 py-2 text-[12px] font-medium border border-[#E6E6EA] rounded-md text-[#5B5B64] hover:bg-[#E6E6EA] transition-colors cursor-pointer"
              >
                Close Preview
              </button> */}
              <button
                onClick={() => {
                  const isAssigned = assignedQuestions.includes(previewQuestion.id);
                  if (isAssigned) {
                    setAssignedQuestions(assignedQuestions.filter((id) => id !== previewQuestion.id));
                  } else {
                    setAssignedQuestions([...assignedQuestions, previewQuestion.id]);
                  }
                  setPreviewQuestion(null);
                }}
                className={`px-4 py-2 text-[12px] font-semibold rounded-md shadow-sm transition-colors cursor-pointer ${
                  assignedQuestions.includes(previewQuestion.id)
                    ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                    : "bg-[#2F5CFF] text-white hover:bg-[#0037FF]"
                }`}
              >
                {assignedQuestions.includes(previewQuestion.id) ? "Remove Question from Drive" : "Assign Question to Drive"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Candidate Modal */}
      {showAddCandidateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-3">
              <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Add Candidate</h3>
              <button
                onClick={() => setShowAddCandidateModal(false)}
                className="text-[#8B8B93] hover:text-[#0B0B0D] p-1 rounded-md transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[13px] font-medium text-[#5B5B64] mb-1">
                  Candidate Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={candidateNameInput}
                  onChange={(e) => setCandidateNameInput(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3.5 py-2 text-[13px] border border-[#E6E6EA] rounded-md focus:outline-none focus:border-[#2F5CFF]"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#5B5B64] mb-1">
                  Candidate Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={candidateEmailInput}
                  onChange={(e) => setCandidateEmailInput(e.target.value)}
                  placeholder="e.g. john.doe@example.com"
                  className="w-full px-3.5 py-2 text-[13px] border border-[#E6E6EA] rounded-md focus:outline-none focus:border-[#2F5CFF]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E6E6EA]">
              <button
                onClick={() => setShowAddCandidateModal(false)}
                className="px-3.5 py-2 text-[12px] font-medium border border-[#E6E6EA] rounded-md hover:bg-[#F7F7F9] transition-colors cursor-pointer text-[#5B5B64]"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCandidate}
                className="px-4 py-2 text-[12px] font-semibold text-white bg-[#2F5CFF] hover:bg-[#0037FF] rounded-md shadow-sm transition-colors cursor-pointer"
              >
                Add Candidate
              </button>
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

      {/* Unsaved Question Selection Warning Modal */}
      {pendingTabSwitch && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[460px] p-6 shadow-2xl space-y-4 border border-[#E6E6EA]">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Unsaved Question Assignments</h3>
                <p className="text-[12px] text-[#5B5B64] mt-1 leading-relaxed">
                  Selected questions are not saved. Do you want to save them before proceeding?
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-[#EFF0F3]">
              <button
                onClick={() => setPendingTabSwitch(null)}
                className="px-3.5 py-1.5 text-[12px] font-medium text-[#5B5B64] bg-white border border-[#E6E6EA] hover:bg-[#F7F7F9] rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setAssignedQuestions(savedAssignedQuestions);
                  setActiveTab(pendingTabSwitch);
                  setPendingTabSwitch(null);
                }}
                className="px-3.5 py-1.5 text-[12px] font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors cursor-pointer"
              >
                Leave Without Saving
              </button>
              <button
                onClick={async () => {
                  await handleSaveQuestions();
                  setActiveTab(pendingTabSwitch);
                  setPendingTabSwitch(null);
                }}
                className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[#2F5CFF] hover:bg-[#0037FF] rounded-md shadow-sm transition-colors cursor-pointer"
              >
                Save &amp; Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
