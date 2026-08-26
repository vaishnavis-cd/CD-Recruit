import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  UploadCloud,
  Search,
  Eye,
  CheckCircle2,
  Code2,
  Database,
  Bug,
  Bot,
  Play,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Award,
  Save,
  Lock,
  Unlock,
  ShieldCheck,
  Camera,
  Mic,
  Monitor,
  Maximize2,
  Cpu,
  Smartphone,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { SingleDateTimePicker, computeRollingEndDate } from "../components/single-date-time-picker";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type DriveDetail } from "../lib/types";
import { validateDriveModuleWeights, type DriveModuleConfigEntry } from "@cd-recruit/shared-types";
import { formatDriveName } from "../lib/utils";
import {
  getDepartmentAllowedModules,
  MODULE_LABEL_MAP,
  ALL_MODULE_KEYS,
} from "../lib/roleModules";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

export const Route = createFileRoute("/drives/$id")({
  component: DriveDetailPage,
  head: () => ({
    meta: [
      { title: "Drive Configuration — Proctora" },
      {
        name: "description",
        content: "Configure drive schedule, select assessment modules, assign questions, and manage candidate roster.",
      },
    ],
  }),
});

const SENIORITY_RATIOS: Record<string, { easy: number; medium: number; hard: number }> = {
  fresher: { easy: 0.50, medium: 0.40, hard: 0.10 },
  l1: { easy: 0.30, medium: 0.50, hard: 0.20 },
  l2: { easy: 0.15, medium: 0.50, hard: 0.35 },
  l3: { easy: 0.10, medium: 0.45, hard: 0.45 },
};

export const TIME_MATRIX: Record<string, Record<string, number>> = {
  MCQ: { EASY: 1, MEDIUM: 2, HARD: 3 },
  SQL: { EASY: 3, MEDIUM: 6, HARD: 12 },
  CODING: { EASY: 6, MEDIUM: 12, HARD: 22 },
  DEBUGGING: { EASY: 5, MEDIUM: 10, HARD: 18 },
  TEST_SCENARIOS: { EASY: 3, MEDIUM: 6, HARD: 12 },
  AI_PROMPTING: { EASY: 4, MEDIUM: 7, HARD: 12 },
  SIMULATION: { EASY: 6, MEDIUM: 12, HARD: 22 },
  NOSQL: { EASY: 3, MEDIUM: 6, HARD: 12 },
};

export function getRequiredQuestionCount(
  moduleType: string,
  weight: number,
  totalDuration: number,
  seniority: string,
): number {
  const ratios = SENIORITY_RATIOS[seniority] || SENIORITY_RATIOS.fresher;
  const times = TIME_MATRIX[moduleType] || { EASY: 5, MEDIUM: 5, HARD: 5 };
  const avgTime =
    ratios.easy * times.EASY +
    ratios.medium * times.MEDIUM +
    ratios.hard * times.HARD;
  const timeBudget = totalDuration * (weight / 100);

  return Math.max(1, Math.round(timeBudget / (avgTime || 1)));
}

export function getDefaultDifficultyDistribution(
  requiredCount: number,
  seniority: string,
): { easy: number; medium: number; hard: number } {
  const ratios = SENIORITY_RATIOS[seniority] || SENIORITY_RATIOS.fresher;
  let easy = Math.round(requiredCount * ratios.easy);
  let medium = Math.round(requiredCount * ratios.medium);
  let hard = requiredCount - easy - medium;

  if (hard < 0) {
    medium += hard;
    hard = 0;
  }
  if (medium < 0) {
    easy += medium;
    medium = 0;
  }
  const currentSum = easy + medium + hard;
  if (currentSum !== requiredCount) {
    easy += (requiredCount - currentSum);
  }
  return { easy: Math.max(0, easy), medium: Math.max(0, medium), hard: Math.max(0, hard) };
}

export function getEstimatedModuleDuration(
  moduleType: string,
  dist: { easy: number; medium: number; hard: number },
): number {
  const times = TIME_MATRIX[moduleType] || { EASY: 5, MEDIUM: 5, HARD: 5 };
  return (
    (dist.easy || 0) * times.EASY +
    (dist.medium || 0) * times.MEDIUM +
    (dist.hard || 0) * times.HARD
  );
}

// Helper to filter out module subtags and restrict drive tags to last 3
export function processQuestionTags(tags?: string[], moduleType?: string) {
  if (!tags || !Array.isArray(tags)) return { displayTags: [], hiddenDriveCount: 0 };
  const modClean = (moduleType || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const filtered = tags.filter((t) => {
    const clean = (t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return clean !== modClean;
  });

  const driveTags: string[] = [];
  const otherTags: string[] = [];

  filtered.forEach((t) => {
    const lower = t.toLowerCase();
    if (lower.startsWith("#drive:") || lower.startsWith("drive:")) {
      driveTags.push(t);
    } else {
      otherTags.push(t);
    }
  });

  const visibleDriveTags = driveTags.slice(-3);
  const hiddenDriveCount = Math.max(0, driveTags.length - 3);

  return {
    displayTags: [...otherTags, ...visibleDriveTags],
    hiddenDriveCount,
  };
}

function getTodayIsoDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultScheduleWindow() {
  const now = new Date();
  const ONE_HOUR = 60 * 60 * 1000;
  // Next rounded hour from now
  const start = new Date(now.getTime() + ONE_HOUR);
  start.setMinutes(0, 0, 0);

  // End time 1 hour after start
  const end = new Date(start.getTime() + ONE_HOUR);

  const startParsed = isoToAmPm(start.toISOString());
  const endParsed = isoToAmPm(end.toISOString());

  return {
    startDate: startParsed.date || getTodayIsoDate(),
    startHour: startParsed.hour,
    startMinute: startParsed.minute,
    startAmPm: startParsed.ampm,
    endDate: endParsed.date || getTodayIsoDate(),
    endHour: endParsed.hour,
    endMinute: endParsed.minute,
    endAmPm: endParsed.ampm,
  };
}

// Helper functions for 12-hour AM/PM time conversions
function isoToAmPm(isoString?: string | null, defaultHour = "10", defaultMin = "00", defaultAmPm = "AM") {
  if (!isoString) return { date: getTodayIsoDate(), hour: defaultHour, minute: defaultMin, ampm: defaultAmPm };
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return { date: getTodayIsoDate(), hour: defaultHour, minute: defaultMin, ampm: defaultAmPm };

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
  const navigate = useNavigate();
  const fetchDriveDetail = useStore((s) => s.fetchDriveDetail);
  const revokeInvite = useStore((s) => s.revokeInvite);
  const extendExpiry = useStore((s) => s.extendExpiry);
  const regenerateToken = useStore((s) => s.regenerateToken);
  const fetchQuestions = useStore((s) => s.fetchQuestions);
  const questionsBank = useStore((s) => s.questions) || [];
  const saveDriveQuestions = useStore((s) => s.saveDriveQuestions);
  const addCandidatesBulk = useStore((s) => s.addCandidatesBulk);
  const generateDriveLinks = useStore((s) => s.generateDriveLinks);
  const removeCandidateFromDrive = useStore((s) => s.removeCandidateFromDrive);
  const roleTemplates = useStore((s) => s.roleTemplates);
  const fetchRoleTemplates = useStore((s) => s.fetchRoleTemplates);

  const [drive, setDrive] = useState<DriveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isEditingUnlocked, setIsEditingUnlocked] = useState<boolean>(false);
  const [showUnlockConfirmModal, setShowUnlockConfirmModal] = useState<boolean>(false);

  // Select Role Template Modal State
  const [showSelectTemplateModal, setShowSelectTemplateModal] = useState<boolean>(false);
  const [selectedTemplateForDrive, setSelectedTemplateForDrive] = useState<string>("");
  const [templateDeptFilter, setTemplateDeptFilter] = useState<string>("all");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<string>("all");

  // Tab State
  const [activeTab, setActiveTab] = useState<"roster" | "questions" | "configuration">("configuration");

  // Config States
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<string>("DRAFT");

  // 12-Hour AM/PM Schedule state
  const [startDate, setStartDate] = useState("");
  const [startHour, setStartHour] = useState("10");
  const [startMinute, setStartMinute] = useState("00");
  const [startAmPm, setStartAmPm] = useState("AM");

  const [endDate, setEndDate] = useState("");
  const [endHour, setEndHour] = useState("11");
  const [endMinute, setEndMinute] = useState("00");
  const [endAmPm, setEndAmPm] = useState("AM");

  /** When true the drive uses a 24-hour rolling window (scheduleEnd = scheduleStart + 24h) */
  const [rollingWindow, setRollingWindow] = useState(false);

  // Module Config State
  const [moduleConfig, setModuleConfig] = useState<Record<string, DriveModuleConfigEntry>>({
    MCQ: { enabled: true, durationMinutes: 15, weight: 15, isBonus: false, questionWeighting: { mode: "equal" } },
    SQL: { enabled: true, durationMinutes: 20, weight: 15, isBonus: false, questionWeighting: { mode: "equal" } },
    NOSQL: { enabled: false, durationMinutes: 20, weight: 0, isBonus: false, questionWeighting: { mode: "equal" } },
    CODING: { enabled: true, durationMinutes: 30, weight: 20, isBonus: false, questionWeighting: { mode: "equal" } },
    DEBUGGING: { enabled: true, durationMinutes: 20, weight: 15, isBonus: false, questionWeighting: { mode: "equal" } },
    AI_PROMPTING: { enabled: true, durationMinutes: 15, weight: 10, isBonus: false, questionWeighting: { mode: "equal" }, questionSource: "AI_DYNAMIC" } as any,
    SIMULATION: { enabled: true, durationMinutes: 10, weight: 10, isBonus: false, questionWeighting: { mode: "equal" } },
    TEST_SCENARIOS: { enabled: true, durationMinutes: 15, weight: 15, isBonus: false, questionWeighting: { mode: "equal" } },
  });

  const [globalEnabledModules, setGlobalEnabledModules] = useState<string[]>([]);

  // Per-Drive System Check & Hardware Proctoring Customization State
  const [proctoringConfig, setProctoringConfig] = useState({
    requireCamera: true,
    requireMicrophone: true,
    requireScreenShare: true,
    allowMobileDevice: false,
    enforceFullscreen: true,
    cpuMathBenchmark: true,
  });

  // Question Assignments & Point Shares State
  const [questionPointShares, setQuestionPointShares] = useState<Record<string, number>>({});
  const [assignedQuestions, setAssignedQuestions] = useState<string[]>([]);
  const [savedAssignedQuestions, setSavedAssignedQuestions] = useState<string[]>([]);
  const [bulkImportConflict, setBulkImportConflict] = useState<{ importedIds: string[] } | null>(null);

  // Automatically persist draft assigned questions in sessionStorage to survive bulk import modal navigation
  useEffect(() => {
    if (driveId && assignedQuestions.length > 0) {
      try {
        sessionStorage.setItem(`drive_draft_questions_${driveId}`, JSON.stringify(assignedQuestions));
      } catch {}
    }
  }, [driveId, assignedQuestions]);

  const [pendingTabSwitch, setPendingTabSwitch] = useState<"roster" | "configuration" | null>(null);
  const [questionModuleFilter, setQuestionModuleFilter] = useState<string>("ALL");
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState<string>("ALL");
  const [questionSearch, setQuestionSearch] = useState("");
  const [previewQuestion, setPreviewQuestion] = useState<any | null>(null);

  // Add Candidate Modal State
  const [showAddCandidateModal, setShowAddCandidateModal] = useState(false);
  const [candidateNameInput, setCandidateNameInput] = useState("");
  const [candidateEmailInput, setCandidateEmailInput] = useState("");

  // Bulk Import Modal State
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkCandidateInput, setBulkCandidateInput] = useState("");
  const [bulkCandidateErrors, setBulkCandidateErrors] = useState<string[]>([]);
  const [submittingBulkImport, setSubmittingBulkImport] = useState(false);

  const parseBulkCandidates = (text: string) => {
    const lines = text.split("\n");
    const parsed: Array<{ name: string; candidateEmail: string }> = [];
    const errors: string[] = [];
    const emailsInInput = new Set<string>();
    const existingRosterEmails = new Set((drive?.roster || []).map((c) => c.candidateEmail.toLowerCase()));

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const parts = trimmed.split(/[,;\t]+/);
      if (parts.length < 2) {
        errors.push(`Line ${idx + 1}: Must contain name and email separated by a comma (e.g. "John Doe, john@example.com").`);
        return;
      }

      const name = parts[0].trim();
      const email = parts[1].trim().toLowerCase();

      if (!name) {
        errors.push(`Line ${idx + 1}: Name is missing.`);
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push(`Line ${idx + 1}: Invalid email address format "${email}".`);
        return;
      }

      if (existingRosterEmails.has(email)) {
        errors.push(`Line ${idx + 1}: Candidate email "${email}" is ALREADY registered in this drive roster.`);
        return;
      }

      if (emailsInInput.has(email)) {
        errors.push(`Line ${idx + 1}: Duplicate candidate email "${email}" found in input lines.`);
        return;
      }

      emailsInInput.add(email);
      parsed.push({ name, candidateEmail: email });
    });

    return { parsed, errors };
  };

  const handleFileUpload = (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel") {
      toast.error("Invalid file format. Please upload a .csv file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setBulkCandidateInput(text);
        const { errors } = parseBulkCandidates(text);
        setBulkCandidateErrors(errors);
        toast.success(`Loaded "${file.name}" into import box.`);
      }
    };
    reader.readAsText(file);
  };

  const handleBulkImportSubmit = async () => {
    const { parsed, errors } = parseBulkCandidates(bulkCandidateInput);
    setBulkCandidateErrors(errors);

    if (errors.length > 0) {
      toast.error(`Please fix ${errors.length} formatting error(s) before importing.`);
      return;
    }

    if (parsed.length === 0) {
      toast.error("No valid candidate entries found to import.");
      return;
    }

    setSubmittingBulkImport(true);
    try {
      await addCandidatesBulk(driveId, parsed);
      toast.success(`Successfully imported and assigned ${parsed.length} candidate(s) to this drive!`);
      setShowBulkImportModal(false);
      setBulkCandidateInput("");
      setBulkCandidateErrors([]);
      await loadData();
    } catch (err: any) {
      toast.error("Failed to bulk import candidates: " + (err.message || err));
    } finally {
      setSubmittingBulkImport(false);
    }
  };

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
  const [candidateToRemove, setCandidateToRemove] = useState<any | null>(null);
  const [removingCandidate, setRemovingCandidate] = useState(false);

  const handleConfirmRemoveCandidate = async () => {
    if (!candidateToRemove || !driveId) return;
    setRemovingCandidate(true);
    try {
      await removeCandidateFromDrive(driveId, candidateToRemove.candidateId);
      toast.success(`Removed ${candidateToRemove.candidateName} from candidate roster.`);
      setCandidateToRemove(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove candidate");
    } finally {
      setRemovingCandidate(false);
    }
  };

  const loadData = async () => {
    try {
      const data = await fetchDriveDetail(driveId);
      setDrive(data);
      setEditName(data.name);
      setIsEditingUnlocked(!!(data as any)?.isEditingUnlocked);
      const draftStored = sessionStorage.getItem(`drive_draft_questions_${driveId}`);
      if (draftStored) {
        try {
          const parsed = JSON.parse(draftStored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAssignedQuestions(parsed);
          } else {
            setAssignedQuestions(data.questionIds || []);
          }
        } catch {
          setAssignedQuestions(data.questionIds || []);
        }
      } else {
        setAssignedQuestions(data.questionIds || []);
      }
      setSavedAssignedQuestions(data.questionIds || []);

      // Parse schedule dates to 12-hour AM/PM controls
      let sDate = "";
      let sHour = "10";
      let sMin = "00";
      let sAmPm = "AM";
      let eDate = "";
      let eHour = "11";
      let eMin = "00";
      let eAmPm = "AM";

      if (!data.scheduleStart || !data.scheduleEnd) {
        const defaultWin = getDefaultScheduleWindow();
        sDate = defaultWin.startDate;
        sHour = defaultWin.startHour;
        sMin = defaultWin.startMinute;
        sAmPm = defaultWin.startAmPm;
        eDate = defaultWin.endDate;
        eHour = defaultWin.endHour;
        eMin = defaultWin.endMinute;
        eAmPm = defaultWin.endAmPm;
      } else {
        const startParsed = isoToAmPm(data.scheduleStart, "10", "00", "AM");
        sDate = startParsed.date;
        sHour = startParsed.hour;
        sMin = startParsed.minute;
        sAmPm = startParsed.ampm;

        const endParsed = isoToAmPm(data.scheduleEnd, "11", "00", "AM");
        eDate = endParsed.date;
        eHour = endParsed.hour;
        eMin = endParsed.minute;
        eAmPm = endParsed.ampm;
      }

      setStartDate(sDate);
      setStartHour(sHour);
      setStartMinute(sMin);
      setStartAmPm(sAmPm);
      setEndDate(eDate);
      setEndHour(eHour);
      setEndMinute(eMin);
      setEndAmPm(eAmPm);

      const winMins = computeTimeWindowMinutes(sHour, sMin, sAmPm, eHour, eMin, eAmPm);
      const defaultModules: Record<string, DriveModuleConfigEntry> = {
        MCQ: { enabled: true, durationMinutes: 15, weight: 20, isBonus: false, questionWeighting: { mode: "equal" } },
        SQL: { enabled: true, durationMinutes: 20, weight: 20, isBonus: false, questionWeighting: { mode: "equal" } },
        NOSQL: { enabled: false, durationMinutes: 20, weight: 0, isBonus: false, questionWeighting: { mode: "equal" } },
        CODING: { enabled: true, durationMinutes: 30, weight: 25, isBonus: false, questionWeighting: { mode: "equal" } },
        DEBUGGING: { enabled: true, durationMinutes: 20, weight: 15, isBonus: false, questionWeighting: { mode: "equal" } },
        AI_PROMPTING: { enabled: true, durationMinutes: 15, weight: 10, isBonus: false, questionWeighting: { mode: "equal" }, questionSource: "AI_DYNAMIC" } as any,
        SIMULATION: { enabled: true, durationMinutes: 10, weight: 10, isBonus: false, questionWeighting: { mode: "equal" } },
        TEST_SCENARIOS: { enabled: true, durationMinutes: 15, weight: 15, isBonus: false, questionWeighting: { mode: "equal" } },
      };

      let enabledForDept: string[] = [];
      try {
        const headers = await getAuthHeaders();
        const settingsRes = await fetch(`${API_BASE}/admin/settings/modules`, { headers });
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          const dept = (data as any).roleTemplate?.department || "SOFTWARE_ENGINEERING";
          enabledForDept = settingsData
            .filter((s: any) => s.department === dept && s.isEnabled)
            .map((s: any) => s.moduleType);
          setGlobalEnabledModules(enabledForDept);
        }
      } catch (settingsErr) {
        console.warn("Failed fetching global module settings: ", settingsErr);
      }

      let initialConfig = {
        ...defaultModules,
      };

      const hasConfig = data.moduleConfig && typeof data.moduleConfig === "object" && Object.keys(data.moduleConfig).length > 0;
      if (hasConfig) {
        initialConfig = {
          ...initialConfig,
          ...(data.moduleConfig || {}),
        };
        // Normalize any inflated weights from legacy data (e.g. 1500 -> 15)
        Object.keys(initialConfig).forEach((mod) => {
          if (initialConfig[mod] && typeof initialConfig[mod].weight === "number") {
            let w = initialConfig[mod].weight;
            if (w > 100) w = Math.round(w / 100);
            else if (w <= 1 && w > 0) w = Math.round(w * 100);
            initialConfig[mod].weight = w;
          }
        });
      } else {
        const preset = ((data as any).roleTemplate?.weightingPreset as Record<string, number>) || {};
        Object.keys(initialConfig).forEach((mod) => {
          const isGloballyEnabled = enabledForDept.includes(mod);
          const rawPreset = preset[mod] !== undefined ? Number(preset[mod]) : 0;
          let weight = 0;
          if (rawPreset > 100) weight = Math.round(rawPreset / 100);
          else if (rawPreset <= 1 && rawPreset > 0) weight = Math.round(rawPreset * 100);
          else weight = Math.round(rawPreset);

          weight = isGloballyEnabled ? weight : 0;
          const enabled = isGloballyEnabled && weight > 0;
          
          initialConfig[mod] = {
            ...initialConfig[mod],
            enabled,
            weight,
          };
        });
      }

      if ((data.moduleConfig as any)?.proctoringConfig) {
        setProctoringConfig((data.moduleConfig as any).proctoringConfig);
      }
      
      const isPartnerApi = (data as any).originChannel === "PARTNER_API";
      if (isPartnerApi) {
        setActiveTab("roster");
      }
      
      const effectiveDuration = isPartnerApi || rollingWindow ? 90 : winMins;
      const confSum = Object.values(initialConfig).filter((m: any) => m.enabled).reduce((sum: number, m: any) => sum + (Number(m.durationMinutes) || 0), 0);
      if (confSum !== effectiveDuration) {
        initialConfig = autoAllocateModuleDurations(initialConfig, effectiveDuration);
      }
      setModuleConfig(initialConfig);

      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    fetchQuestions({ pageSize: 1000 });
    fetchRoleTemplates();
  }, [driveId]);

  const handleUnlockEditing = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}/unlock-editing`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to unlock drive editing");
      }
      toast.success("Drive question editing unlocked! Action logged to Audit Log.");
      setIsEditingUnlocked(true);
      setShowUnlockConfirmModal(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to unlock drive editing");
    }
  };

  const handleApplyRoleTemplate = async (templateId: string) => {
    const tpl = (roleTemplates || []).find((r) => r.id === templateId);
    if (!tpl) {
      toast.error("Role template not found.");
      return;
    }

    try {
      const headers = await getAuthHeaders();

      const updateRes = await fetch(`${API_BASE}/admin/drives/${driveId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ roleTemplateId: templateId }),
      });

      if (!updateRes.ok) {
        throw new Error("Failed to update drive role template.");
      }

      const tplRes = await fetch(`${API_BASE}/admin/role-templates/${templateId}`, { headers });
      if (tplRes.ok) {
        const tplData = await tplRes.json();
        const tplQuestionIds = (tplData.questions || []).map((q: any) => q.questionId).filter(Boolean);

        if (tplQuestionIds.length > 0) {
          await saveDriveQuestions(driveId, tplQuestionIds);
          setAssignedQuestions(tplQuestionIds);
          setSavedAssignedQuestions(tplQuestionIds);
        }

        if (tplData.weightingPreset) {
          const preset = tplData.weightingPreset as Record<string, number>;
          setModuleConfig((prev) => {
            const updated = { ...prev };
            Object.entries(preset).forEach(([mod, w]) => {
              if (updated[mod]) {
                updated[mod] = {
                  ...updated[mod],
                  enabled: true,
                  weight: typeof w === "number" ? Math.round(w <= 1 ? w * 100 : w) : updated[mod].weight,
                };
              }
            });
            return updated;
          });
        }
      }

      toast.success(`Role Template "${tpl.roleName}" applied to drive!`);
      setShowSelectTemplateModal(false);
      await loadData();
    } catch (err: any) {
      toast.error("Failed applying template: " + (err.message || err));
    }
  };

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

  const MODULE_TIME_COMPLEXITY: Record<string, number> = {
    CODING: 3,
    SIMULATION: 3,
    SQL: 2,
    DEBUGGING: 2,
    MCQ: 1,
    AI_PROMPTING: 1,
  };

  const computeTimeWindowMinutes = (
    startHourStr: string,
    startMinStr: string,
    startAmPmStr: string,
    endHourStr: string,
    endMinStr: string,
    endAmPmStr: string
  ): number => {
    const templateDuration = (drive as any)?.roleTemplate?.durationMinutes || 90;
    if (rollingWindow || (drive as any)?.originChannel === "PARTNER_API") {
      return templateDuration;
    }

    let sHour = parseInt(startHourStr, 10) || 10;
    if (startAmPmStr === "PM" && sHour < 12) sHour += 12;
    if (startAmPmStr === "AM" && sHour === 12) sHour = 0;
    const sMin = parseInt(startMinStr, 10) || 0;

    let eHour = parseInt(endHourStr, 10) || 11;
    if (endAmPmStr === "PM" && eHour < 12) eHour += 12;
    if (endAmPmStr === "AM" && eHour === 12) eHour = 0;
    const eMin = parseInt(endMinStr, 10) || 0;

    const startTotalMins = sHour * 60 + sMin;
    const endTotalMins = eHour * 60 + eMin;
    let diff = endTotalMins - startTotalMins;

    if (diff <= 0) diff += 24 * 60;
    if (diff > 240) return templateDuration;
    return diff > 0 ? diff : 60;
  };

  const autoAllocateModuleDurations = (
    config: Record<string, any>,
    totalWindowMins: number
  ): Record<string, any> => {
    const enabledKeys = Object.keys(config).filter((k) => config[k]?.enabled);
    if (enabledKeys.length === 0) return config;

    const fixedKeys = enabledKeys.filter((k) => config[k]?.isFixed);
    const unfixedKeys = enabledKeys.filter((k) => !config[k]?.isFixed);

    if (unfixedKeys.length === 0) return config;

    const sumFixedMins = fixedKeys.reduce(
      (sum, k) => sum + (Number(config[k]?.durationMinutes) || 0),
      0
    );

    const remainingMins = Math.max(0, totalWindowMins - sumFixedMins);
    const unfixedRatioSum = unfixedKeys.reduce(
      (sum, k) => sum + (MODULE_TIME_COMPLEXITY[k] || 1),
      0
    );

    let allocatedSum = 0;
    const updated = { ...config };

    unfixedKeys.forEach((k, idx) => {
      const ratio = MODULE_TIME_COMPLEXITY[k] || 1;
      let allocated = Math.max(5, Math.floor(remainingMins * (ratio / unfixedRatioSum)));
      if (idx === unfixedKeys.length - 1) {
        allocated = Math.max(5, remainingMins - allocatedSum);
      } else {
        allocatedSum += allocated;
      }
      updated[k] = { ...updated[k], durationMinutes: allocated };
    });

    return updated;
  };

  const ALL_DRIVE_MODULES = ["MCQ", "SQL", "NOSQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS"] as const;

  const autoAlignModuleConfig = (
    baseConfig: Record<string, any>,
    targetDuration: number,
    resolvedTag: string
  ): Record<string, any> => {
    const enabledKeys = ALL_DRIVE_MODULES.filter((m) => {
      const conf = baseConfig[m];
      if (!conf || !conf.enabled) return false;
      if (globalEnabledModules.length > 0 && !globalEnabledModules.includes(m)) return false;
      return true;
    });
    const nextConfig: Record<string, any> = { ...baseConfig };

    if (enabledKeys.length === 0) {
      return nextConfig;
    }

    // 1. Auto-balance weights of enabled core modules so they strictly sum to 100%
    const baseWeight = Math.floor(100 / enabledKeys.length);
    const remainder = 100 - baseWeight * enabledKeys.length;
    const weights: Record<string, number> = {};

    enabledKeys.forEach((key, idx) => {
      weights[key] = baseWeight + (idx < remainder ? 1 : 0);
    });

    // 2. Compute initial required counts and default difficulty distributions
    const distMap: Record<string, { easy: number; medium: number; hard: number; reqCount: number }> = {};

    enabledKeys.forEach((key) => {
      const w = weights[key];
      const reqCount = getRequiredQuestionCount(key, w, targetDuration, resolvedTag);
      const defaultDist = getDefaultDifficultyDistribution(reqCount, resolvedTag);
      distMap[key] = {
        ...defaultDist,
        reqCount,
      };
    });

    // 3. Compute total estimated duration helper
    const computeTotalEst = () => {
      return enabledKeys.reduce((sum, key) => {
        const d = distMap[key];
        return sum + getEstimatedModuleDuration(key, d);
      }, 0);
    };

    let totalEst = computeTotalEst();

    // 4. Iteratively optimize/downgrade difficulty if totalEst > targetDuration
    const priorityModules = ["SIMULATION", "CODING", "DEBUGGING", "SQL", "NOSQL", "TEST_SCENARIOS", "AI_PROMPTING", "MCQ"];
    let maxIterations = 200;

    while (totalEst > targetDuration && maxIterations > 0) {
      maxIterations--;
      let reduced = false;

      // Pass 1: Shift Hard -> Medium in heaviest modules
      for (const mod of priorityModules) {
        if (!enabledKeys.includes(mod)) continue;
        const d = distMap[mod];
        if (d.hard > 0) {
          d.hard--;
          d.medium++;
          reduced = true;
          totalEst = computeTotalEst();
          if (totalEst <= targetDuration) break;
        }
      }

      if (totalEst <= targetDuration) break;

      // Pass 2: Shift Medium -> Easy in heaviest modules
      if (!reduced || totalEst > targetDuration) {
        for (const mod of priorityModules) {
          if (!enabledKeys.includes(mod)) continue;
          const d = distMap[mod];
          if (d.medium > 0) {
            d.medium--;
            d.easy++;
            reduced = true;
            totalEst = computeTotalEst();
            if (totalEst <= targetDuration) break;
          }
        }
      }

      if (!reduced) break;
    }

    // 5. Allocate durationMinutes budgets and update config
    const totalEstTimeFinal = computeTotalEst();
    ALL_DRIVE_MODULES.forEach((key) => {
      if (enabledKeys.includes(key)) {
        const d = distMap[key];
        const estTime = getEstimatedModuleDuration(key, d);
        const allocatedDurationMinutes = Math.max(1, Math.round((estTime / (totalEstTimeFinal || 1)) * targetDuration));

        nextConfig[key] = {
          ...(nextConfig[key] || {}),
          enabled: true,
          weight: weights[key],
          requiredCount: d.reqCount,
          durationMinutes: allocatedDurationMinutes,
          difficultyDistribution: {
            easy: d.easy,
            medium: d.medium,
            hard: d.hard,
          },
        };
      } else {
        nextConfig[key] = {
          ...(nextConfig[key] || {}),
          enabled: false,
          weight: 0,
          requiredCount: 0,
          durationMinutes: 0,
          difficultyDistribution: { easy: 0, medium: 0, hard: 0 },
        };
      }
    });

    return nextConfig;
  };

  const handleAutoBalanceDurations = () => {
    const lowerName = (drive?.roleTemplateName || "").toLowerCase();
    const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
      lowerName.includes("l1") ? "l1" : (
        lowerName.includes("l2") ? "l2" : "l3"
      )
    );
    const windowMins = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
    const aligned = autoAlignModuleConfig(moduleConfig, windowMins, resolvedTag);
    setModuleConfig(aligned);
    toast.success(`Module durations and difficulty benchmarks auto-balanced to ${windowMins} min!`);
  };

  const weightValidation = useMemo(() => {
    return validateDriveModuleWeights(moduleConfig);
  }, [moduleConfig]);

  const handleAutoBalanceWeights = () => {
    const lowerName = (drive?.roleTemplateName || "").toLowerCase();
    const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
      lowerName.includes("l1") ? "l1" : (
        lowerName.includes("l2") ? "l2" : "l3"
      )
    );
    const windowMins = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
    const aligned = autoAlignModuleConfig(moduleConfig, windowMins, resolvedTag);
    setModuleConfig(aligned);
    toast.success("Core scoring weights auto-balanced to sum to 100 points and aligned to window!");
  };

  const handleAutoAlignAssessment = () => {
    const lowerName = (drive?.roleTemplateName || "").toLowerCase();
    const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
      lowerName.includes("l1") ? "l1" : (
        lowerName.includes("l2") ? "l2" : "l3"
      )
    );
    const targetDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
    const aligned = autoAlignModuleConfig(moduleConfig, targetDuration, resolvedTag);
    setModuleConfig(aligned);
    toast.success(`Assessment auto-aligned to ${targetDuration} min (all weights = 100%, timings aligned)!`);
  };

  const validateDateTimeConfig = (): { valid: boolean; error?: string } => {
    if (!startDate) {
      return { valid: false, error: "Please select a schedule date on the calendar." };
    }
    const startIso = amPmToIso(startDate, startHour, startMinute, startAmPm);

    if (!startIso) {
      return { valid: false, error: "Invalid date or time selection." };
    }

    const startDateObj = new Date(startIso);
    const now = new Date();

    if (startDateObj < now) {
      return {
        valid: false,
        error: "Schedule start date & time cannot be in the past. Please select a valid future date and time.",
      };
    }

    if (!rollingWindow) {
      const endIso = amPmToIso(endDate || startDate, endHour, endMinute, endAmPm);
      if (!endIso) {
        return { valid: false, error: "Invalid end date or time selection." };
      }
      const endDateObj = new Date(endIso);
      if (endDateObj <= startDateObj) {
        return {
          valid: false,
          error: "Schedule end time must be strictly after the start time.",
        };
      }
    }

    return { valid: true };
  };

  const isScheduleDateValid = useMemo(() => {
    return validateDateTimeConfig().valid;
  }, [startDate, endDate, startHour, startMinute, startAmPm, endHour, endMinute, endAmPm, rollingWindow]);

  const hasQuestionsSelected = useMemo(() => {
    return assignedQuestions.length > 0;
  }, [assignedQuestions]);

  const hasCandidatesSelected = useMemo(() => {
    return (drive?.roster?.length || 0) > 0;
  }, [drive]);

  const driveEvaluationSummary = useMemo(() => {
    const lowerName = (drive?.roleTemplateName || "").toLowerCase();
    const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
      lowerName.includes("l1") ? "l1" : (
        lowerName.includes("l2") ? "l2" : "l3"
      )
    );
    const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;

    const summaryData = ["MCQ", "SQL", "NOSQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS"]
      .map((modId) => {
        const conf = moduleConfig[modId] || { enabled: false, weight: 0 };
        if (!conf.enabled || Number(conf.weight) <= 0) {
          return { modId, enabled: false, weight: 0, marks: 0, count: 0, dist: { easy: 0, medium: 0, hard: 0 }, estTime: 0 };
        }

        const weight = Number(conf.weight) || 0;
        const reqCount = getRequiredQuestionCount(modId, weight, totalDuration, resolvedTag);
        const dist = (conf as any).difficultyDistribution || getDefaultDifficultyDistribution(reqCount, resolvedTag);
        const estTime = getEstimatedModuleDuration(modId, dist);

        return {
          modId,
          enabled: true,
          weight,
          marks: weight,
          count: reqCount,
          dist,
          estTime,
        };
      })
      .filter((m) => m.enabled);

    const totalWeight = summaryData.reduce((sum, m) => sum + m.weight, 0);
    const totalMarks = summaryData.reduce((sum, m) => sum + m.marks, 0);
    const totalQuestions = summaryData.reduce((sum, m) => sum + m.count, 0);
    const totalEstTime = summaryData.reduce((sum, m) => sum + m.estTime, 0);
    const isOverTime = totalEstTime > totalDuration;
    const overflowMinutes = isOverTime ? Number((totalEstTime - totalDuration).toFixed(1)) : 0;

    return {
      summaryData,
      totalDuration,
      totalWeight,
      totalMarks,
      totalQuestions,
      totalEstTime,
      isOverTime,
      overflowMinutes,
      resolvedTag,
    };
  }, [moduleConfig, startHour, startMinute, startAmPm, endHour, endMinute, endAmPm, rollingWindow, drive]);

  const areQuestionsFullyAssigned = useMemo(() => {
    const hasRoleTemplate = Boolean(drive?.roleTemplateId || (drive as any)?.roleTemplate);
    if (hasRoleTemplate && assignedQuestions.length > 0) return true;

    const { summaryData } = driveEvaluationSummary;
    if (summaryData.length === 0) return false;

    for (const m of summaryData) {
      const poolQuestions = (questionsBank || []).filter(q => {
        const isDebug = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
        const displayMod = isDebug ? "DEBUGGING" : q.moduleType;
        return assignedQuestions.includes(q.id) && displayMod === m.modId;
      });
      if (poolQuestions.length !== m.count) return false;
      const easyAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "EASY").length;
      const mediumAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "MEDIUM").length;
      const hardAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "HARD").length;
      if (easyAvail !== m.dist.easy || mediumAvail !== m.dist.medium || hardAvail !== m.dist.hard) return false;
    }
    return true;
  }, [driveEvaluationSummary, assignedQuestions, questionsBank, drive]);

  const isScheduleUnlocked = useMemo(() => {
    return (
      isScheduleDateValid &&
      hasCandidatesSelected &&
      weightValidation.valid &&
      !driveEvaluationSummary.isOverTime &&
      areQuestionsFullyAssigned
    );
  }, [isScheduleDateValid, hasCandidatesSelected, weightValidation, driveEvaluationSummary, areQuestionsFullyAssigned]);

  const validateCumulativeDuration = (config = moduleConfig): boolean => {
    const windowMins = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
    const lowerName = (drive?.roleTemplateName || "").toLowerCase();
    const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
      lowerName.includes("l1") ? "l1" : (
        lowerName.includes("l2") ? "l2" : "l3"
      )
    );

    let totalEstMins = 0;
    for (const [modId, conf] of Object.entries(config)) {
      if (!conf.enabled || Number(conf.weight) <= 0) continue;
      const reqCount = getRequiredQuestionCount(modId, conf.weight, windowMins, resolvedTag);
      const dist = (conf as any).difficultyDistribution || getDefaultDifficultyDistribution(reqCount, resolvedTag);
      const distSum = (Number(dist.easy) || 0) + (Number(dist.medium) || 0) + (Number(dist.hard) || 0);
      if (distSum !== reqCount) {
        toast.error(
          `Module ${modId} difficulty targets (${dist.easy}E + ${dist.medium}M + ${dist.hard}H = ${distSum}) must equal the required question count (${reqCount}).`
        );
        return false;
      }
      totalEstMins += getEstimatedModuleDuration(modId, dist);
    }

    if (totalEstMins > windowMins) {
      const overflow = (totalEstMins - windowMins).toFixed(1);
      toast.error(
        `⚠ Estimated assessment time exceeds the configured ${windowMins}-minute limit by ${overflow} minutes.`
      );
      return false;
    }
    return true;
  };

  const handleSaveAndNext = async () => {
    const val = validateDateTimeConfig();
    if (!val.valid) {
      toast.error(val.error);
      return;
    }

    const lowerName = (drive?.roleTemplateName || "").toLowerCase();
    const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
      lowerName.includes("l1") ? "l1" : (
        lowerName.includes("l2") ? "l2" : "l3"
      )
    );
    const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;

    const updatedModuleConfig = { ...moduleConfig };
    for (const [modId, conf] of Object.entries(updatedModuleConfig)) {
      if (!conf.enabled || Number(conf.weight) <= 0) continue;
      const reqCount = getRequiredQuestionCount(modId, conf.weight, totalDuration, resolvedTag);
      const dist = (conf as any).difficultyDistribution || getDefaultDifficultyDistribution(reqCount, resolvedTag);
      if (dist.easy + dist.medium + dist.hard !== reqCount) {
        updatedModuleConfig[modId] = {
          ...conf,
          requiredCount: reqCount,
          difficultyDistribution: getDefaultDifficultyDistribution(reqCount, resolvedTag),
        } as any;
      } else {
        updatedModuleConfig[modId] = {
          ...conf,
          requiredCount: reqCount,
          difficultyDistribution: dist,
        } as any;
      }
    }

    const enabledMods = Object.values(updatedModuleConfig).filter((m) => m.enabled);
    if (enabledMods.length === 0) {
      toast.error("At least one assessment module must be enabled.");
      return;
    }

    const weightVal = validateDriveModuleWeights(updatedModuleConfig);
    if (!weightVal.valid) {
      toast.error(weightVal.error || "Invalid module score weights configuration.");
      return;
    }

    if (!validateCumulativeDuration(updatedModuleConfig)) {
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const startIso = amPmToIso(startDate, startHour, startMinute, startAmPm);
      const endIso = amPmToIso(endDate || startDate, endHour, endMinute, endAmPm);

      const res = await fetch(`${API_BASE}/admin/drives/${driveId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: editName,
          scheduleStart: startIso,
          scheduleEnd: endIso,
          status: editStatus,
          moduleConfig: { ...updatedModuleConfig, proctoringConfig },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save configuration");
      }

      toast.success("Drive configuration saved! Moving to Questions page...");
      loadData();
      setActiveTab("questions");
    } catch (err: any) {
      toast.error("Failed saving configuration: " + (err.message || err));
    }
  };

  const enabledModuleKeys = useMemo(() => {
    return Object.keys(moduleConfig || {}).filter((k) => moduleConfig[k]?.enabled);
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

  const isQuestionsEditable = useMemo(() => {
    const roster = drive?.roster || [];
    if (roster.length === 0) return true;
    const ungeneratedCount = roster.filter((c) => !c.isGenerated).length;
    return ungeneratedCount >= 1;
  }, [drive]);

  const handleSaveQuestions = async () => {
    if (!isQuestionsEditable) {
      toast.error("Drive questions are locked because all candidate links have already been generated.");
      return;
    }

    const lowerName = (drive?.roleTemplateName || "").toLowerCase();
    const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
      lowerName.includes("l1") ? "l1" : (
        lowerName.includes("l2") ? "l2" : "l3"
      )
    );
    const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;

    for (const [modId, conf] of Object.entries(moduleConfig)) {
      if (!conf.enabled || Number(conf.weight) <= 0) continue;
      const reqCount = getRequiredQuestionCount(modId, conf.weight, totalDuration, resolvedTag);
      const dist = (conf as any).difficultyDistribution || getDefaultDifficultyDistribution(reqCount, resolvedTag);

      const poolQuestions = (questionsBank || []).filter(q => {
        const isDebug = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
        const displayMod = isDebug ? "DEBUGGING" : q.moduleType;
        return assignedQuestions.includes(q.id) && displayMod === modId;
      });

      if (poolQuestions.length !== reqCount) {
        toast.error(`Incomplete question selection for ${modId}. Please select exactly ${reqCount} required questions (${poolQuestions.length} currently selected).`);
        return;
      }

      const easyAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "EASY").length;
      const mediumAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "MEDIUM").length;
      const hardAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "HARD").length;

      if (easyAvail !== dist.easy || mediumAvail !== dist.medium || hardAvail !== dist.hard) {
        toast.error(`Selected difficulty composition for ${modId} (${easyAvail}E / ${mediumAvail}M / ${hardAvail}H) does not match target (${dist.easy}E / ${dist.medium}M / ${dist.hard}H).`);
        return;
      }
    }

    try {
      await saveDriveQuestions(driveId, assignedQuestions);
      setSavedAssignedQuestions([...assignedQuestions]);
      toast.success("Assigned questions saved!");
      loadData();
    } catch (err: any) {
      toast.error("Failed saving questions: " + err.message);
    }
  };

  const handleSaveQuestionsAndNext = async () => {
    if (!isQuestionsEditable) {
      toast.info("Questions are locked (all links generated). Moving to Candidate Roster...");
      setActiveTab("roster");
      return;
    }

    const lowerName = (drive?.roleTemplateName || "").toLowerCase();
    const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
      lowerName.includes("l1") ? "l1" : (
        lowerName.includes("l2") ? "l2" : "l3"
      )
    );
    const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;

    for (const [modId, conf] of Object.entries(moduleConfig)) {
      if (!conf.enabled || Number(conf.weight) <= 0) continue;
      const reqCount = getRequiredQuestionCount(modId, conf.weight, totalDuration, resolvedTag);
      const dist = (conf as any).difficultyDistribution || getDefaultDifficultyDistribution(reqCount, resolvedTag);

      const poolQuestions = (questionsBank || []).filter(q => {
        const isDebug = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
        const displayMod = isDebug ? "DEBUGGING" : q.moduleType;
        return assignedQuestions.includes(q.id) && displayMod === modId;
      });

      if (poolQuestions.length !== reqCount) {
        toast.error(`Incomplete question selection for ${modId}. Please select exactly ${reqCount} required questions (${poolQuestions.length} currently selected).`);
        return;
      }

      const easyAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "EASY").length;
      const mediumAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "MEDIUM").length;
      const hardAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "HARD").length;

      if (easyAvail !== dist.easy || mediumAvail !== dist.medium || hardAvail !== dist.hard) {
        toast.error(`Selected difficulty composition for ${modId} (${easyAvail}E / ${mediumAvail}M / ${hardAvail}H) does not match target (${dist.easy}E / ${dist.medium}M / ${dist.hard}H).`);
        return;
      }
    }

    try {
      await saveDriveQuestions(driveId, assignedQuestions);
      setSavedAssignedQuestions([...assignedQuestions]);
      toast.success("Assigned questions saved! Moving to Candidate Roster...");
      loadData();
      setActiveTab("roster");
    } catch (err: any) {
      toast.error("Failed saving questions: " + err.message);
    }
  };

  const handleAddCandidate = async () => {
    if (!candidateNameInput.trim() || !candidateEmailInput.trim()) {
      toast.error("Please enter candidate name and email.");
      return;
    }
    const email = candidateEmailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    const existingRosterEmails = new Set((drive?.roster || []).map((c) => c.candidateEmail.toLowerCase()));
    if (existingRosterEmails.has(email)) {
      toast.error(`Candidate with email "${email}" is already registered in this drive roster.`);
      return;
    }

    try {
      await addCandidatesBulk(driveId, [
        {
          name: candidateNameInput.trim(),
          candidateEmail: email,
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

  const isAiPromptingDynamic = useMemo(() => {
    const aiConf = moduleConfig["AI_PROMPTING"] as any;
    return !!(aiConf?.enabled && (aiConf?.questionSource || "AI_DYNAMIC") === "AI_DYNAMIC");
  }, [moduleConfig]);

  const driveTargetDept = useMemo(() => {
    if (!drive) return "SOFTWARE_ENGINEERING";
    const deptRaw = (
      (drive as any).roleTemplate?.department ||
      (drive as any).department ||
      (drive as any).roleTemplate?.roleName ||
      drive.roleTemplateName ||
      drive.name ||
      ""
    ).toUpperCase();

    if (deptRaw.includes("SECOPS") || deptRaw.includes("SECURITY")) return "SECOPS";
    if (deptRaw.includes("DATA")) return "DATA_ENGINEERING";
    if (deptRaw.includes("QA") || deptRaw.includes("QUALITY") || deptRaw.includes("TEST")) return "QA";
    if (deptRaw.includes("SRE") || deptRaw.includes("RELIABILITY")) return "SRE";
    if (deptRaw.includes("SYSOPS")) return "SYSOPS";
    if (deptRaw.includes("ITOPS")) return "ITOPS";
    if (deptRaw.includes("PMO") || deptRaw.includes("PROJECT")) return "PMO";
    return "SOFTWARE_ENGINEERING";
  }, [drive]);

  const allowedModules = useMemo(() => {
    return getDepartmentAllowedModules(driveTargetDept);
  }, [driveTargetDept]);

  const filteredQuestionsList = useMemo(() => {
    const DEPT_TAGS_MAP: Record<string, string[]> = {
      SOFTWARE_ENGINEERING: ["sde", "software_engineering", "software engineering", "software developer", "software engineer"],
      DATA_ENGINEERING: ["data_engineering", "data engineering", "de"],
      QA: ["qa", "quality assurance", "testing"],
      SRE: ["sre", "site reliability"],
      SYSOPS: ["sysops"],
      ITOPS: ["itops"],
      PMO: ["pmo"],
      SECOPS: ["secops", "cybersecurity", "security operations"],
    };

    const targetDeptNorm = (driveTargetDept as string) === "SDE" ? "SOFTWARE_ENGINEERING" : driveTargetDept;

    return questionsBank.filter((q) => {
      if (q.status === "ARCHIVED") return false;

      const isAssigned = assignedQuestions.includes(q.id);

      if (!isAssigned) {
        const isDebuggingQuestion = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
        const effectiveModule = isDebuggingQuestion ? "DEBUGGING" : q.moduleType;
        if (!allowedModules.includes(effectiveModule) && !allowedModules.includes(q.moduleType)) {
          return false;
        }

        const qRoleUpper = (q.role || "").toUpperCase();
        const qContentDeptUpper = (q.content?.department || "").toUpperCase();
        const qTagsLower = (q.tags || []).map((t: string) => t.toLowerCase());

        let qDept: string | null = null;
        if (qRoleUpper === "SOFTWARE_ENGINEERING" || qRoleUpper === "SDE" || qContentDeptUpper === "SDE" || qContentDeptUpper === "SOFTWARE_ENGINEERING") {
          qDept = "SOFTWARE_ENGINEERING";
        } else if (qRoleUpper === "DATA_ENGINEERING" || qContentDeptUpper === "DATA_ENGINEERING") {
          qDept = "DATA_ENGINEERING";
        } else if (qRoleUpper === "QA" || qContentDeptUpper === "QA") {
          qDept = "QA";
        } else if (qRoleUpper === "SRE" || qContentDeptUpper === "SRE") {
          qDept = "SRE";
        } else if (qRoleUpper === "SYSOPS" || qContentDeptUpper === "SYSOPS") {
          qDept = "SYSOPS";
        } else if (qRoleUpper === "ITOPS" || qContentDeptUpper === "ITOPS") {
          qDept = "ITOPS";
        } else if (qRoleUpper === "PMO" || qContentDeptUpper === "PMO") {
          qDept = "PMO";
        } else if (qRoleUpper === "SECOPS" || qContentDeptUpper === "SECOPS") {
          qDept = "SECOPS";
        }

        if (!qDept) {
          for (const [deptKey, tagsList] of Object.entries(DEPT_TAGS_MAP)) {
            if (qTagsLower.some((t: string) => tagsList.includes(t))) {
              qDept = deptKey;
              break;
            }
          }
        }

        if (qDept && qDept !== targetDeptNorm) {
          return false;
        }
      }

      if (q.moduleType === "AI_PROMPTING" && isAiPromptingDynamic && questionModuleFilter === "ALL") {
        return false;
      }

      const isDebuggingQuestion = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));

      if (questionModuleFilter === "ALL") {
        const effectiveModule = isDebuggingQuestion ? "DEBUGGING" : q.moduleType;
        if (!allowedModules.includes(effectiveModule) && !allowedModules.includes(q.moduleType)) return false;
      } else if (questionModuleFilter === "DEBUGGING") {
        if (!isDebuggingQuestion) return false;
      } else if (questionModuleFilter === "CODING") {
        if (q.moduleType !== "CODING" || (Array.isArray(q.tags) && q.tags.includes("debugging"))) return false;
      } else {
        if (q.moduleType !== questionModuleFilter) return false;
      }

      if (questionDifficultyFilter !== "ALL") {
        const diff = (q.difficulty || "MEDIUM").toUpperCase();
        if (diff !== questionDifficultyFilter.toUpperCase()) return false;
      }

      if (questionSearch.trim()) {
        const s = questionSearch.toLowerCase().trim();
        const title = (
          q.content?.title ||
          q.content?.prompt ||
          q.content?.name ||
          q.content?.question ||
          q.content?.text ||
          q.content?.problemStatement ||
          q.content?.scenario ||
          ""
        ).toLowerCase();
        const tags = (q.tags || []).join(" ").toLowerCase();
        if (!title.includes(s) && !tags.includes(s)) return false;
      }
      return true;
    });
  }, [questionsBank, driveTargetDept, allowedModules, assignedQuestions, questionModuleFilter, questionDifficultyFilter, questionSearch, isAiPromptingDynamic]);

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
      title={`Drive Configuration — ${formatDriveName(drive.name)}`}
      actions={
        <div className="flex items-center gap-3">
          <Link
            to="/drives"
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#5B5B64] hover:text-[#0B0B0D] bg-white border border-[#E6E6EA] rounded-md transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Back to Drives</span>
          </Link>
          <button
            onClick={() => {
              if (isScheduleUnlocked) {
                setConfirmGenerateLinks(true);
              } else {
                const reasons: string[] = [];
                if (!isScheduleDateValid) reasons.push("valid future date & time");
                if (!hasQuestionsSelected) reasons.push("at least 1 question assigned");
                if (!hasCandidatesSelected) reasons.push("at least 1 candidate roster item");
                toast.error(`Drive scheduling locked. Requirements needed: ${reasons.join(", ")}.`);
              }
            }}
            disabled={generating}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold text-white rounded-md transition-all shadow-sm ${
              isScheduleUnlocked && !generating
                ? "bg-[#2F5CFF] hover:bg-[#0037FF] cursor-pointer"
                : "bg-[#8B8B93] opacity-60 cursor-not-allowed"
            }`}
            title={
              !isScheduleUnlocked
                ? "Requires valid future date/time, at least 1 assigned question, and at least 1 candidate in roster"
                : "Schedule drive and generate candidate links"
            }
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
            <h2 className="text-[18px] font-semibold text-[#0B0B0D]">{formatDriveName(drive.name)}</h2>
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
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-[12px] text-[#5B5B64]">
            <div className="flex items-center gap-1.5">
              <span>
                Role Template: <span className="font-semibold text-[#0B0B0D]">{(drive as any).roleTemplate?.roleName || drive.roleTemplateName}</span> (v{(drive as any).roleTemplate?.version || 1})
              </span>
              <button
                onClick={() => {
                  setSelectedTemplateForDrive((drive as any).roleTemplateId || "");
                  setShowSelectTemplateModal(true);
                }}
                className="px-2 py-0.5 text-[11px] font-medium text-[#2F5CFF] bg-[#EAF0FF] hover:bg-[#D9E5FF] rounded transition-colors cursor-pointer border border-[#B3C5FF] flex items-center gap-1"
                title="Select or apply Role Template to this drive"
              >
                <Sparkles size={11} /> Select / Change Template
              </button>
            </div>
            <span>•</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                (drive as any).originChannel === "PARTNER_API"
                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                  : "bg-gray-100 text-gray-700 border border-gray-200"
              }`}
            >
              {(drive as any).originChannel === "PARTNER_API" ? "Partner API Origin" : "Direct Origin"}
            </span>
          </div>
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

      {/* Partner API Lock Warning Banner */}
      {(drive as any).originChannel === "PARTNER_API" && !isEditingUnlocked && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900">Partner API Drive — Question Editing Locked</h4>
              <p className="text-xs text-amber-700 mt-0.5">
                This drive was instantiated from a Partner API requisition. Question and module configurations are locked to preserve parity with the published role template.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowUnlockConfirmModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-amber-950 bg-amber-200 hover:bg-amber-300 border border-amber-300 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <Unlock className="w-3.5 h-3.5" /> Unlock Editing
          </button>
        </div>
      )}

      {/* Unlock Confirmation Modal */}
      {showUnlockConfirmModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-gray-900">Unlock Question Editing?</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Unlocking question editing for this Partner API drive will allow custom question modifications, diverging from the active partner role template. This action will be recorded in the system Audit Log.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowUnlockConfirmModal(false)}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUnlockEditing}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm cursor-pointer"
              >
                Confirm Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIGURATION TAB */}
      {activeTab === "configuration" && (
        <div className="space-y-6">
          {/* SECTION 1: Single Calendar Date & Start/End Time Window Picker */}
          <div className="space-y-3">
            <SingleDateTimePicker
              selectedDate={startDate || endDate || new Date().toISOString().slice(0, 10)}
              startHour={startHour}
              startMinute={startMinute}
              startAmPm={startAmPm}
              endHour={endHour}
              endMinute={endMinute}
              endAmPm={endAmPm}
              rollingWindow={rollingWindow}
              onRollingWindowChange={(enabled) => {
                setRollingWindow(enabled);
                if (enabled) {
                  let h = parseInt(startHour, 10) || 9;
                  if (startAmPm === "PM" && h < 12) h += 12;
                  if (startAmPm === "AM" && h === 12) h = 0;
                  setStartHour(String(h).padStart(2, "0"));
                }
              }}
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
              <div className="flex items-center gap-2.5">
                <span
                  className={`px-3 py-1 rounded-full text-[12px] font-mono font-bold ${
                    weightValidation.valid
                      ? "bg-[#E3F9F2] text-[#0C6B58]"
                      : "bg-[#FFF5F5] text-[#C0392B] border border-red-200"
                  }`}
                >
                  Total Weight: {weightValidation.coreSum} / 100 pts
                </span>
                <button
                  type="button"
                  onClick={handleAutoAlignAssessment}
                  className="px-3.5 py-1 text-[11px] font-bold text-white bg-gradient-to-r from-[#2F5CFF] to-[#1A44D6] hover:from-[#1A44D6] hover:to-[#1233A8] rounded shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                  title="One-click automatic alignment of weights, required question counts, difficulty distributions, and timings to fit session window"
                >
                  <Sparkles size={13} className="text-amber-300" />
                  <span>Auto-Align Assessment</span>
                </button>
                <button
                  onClick={handleAutoBalanceDurations}
                  className="px-3 py-1 text-[11px] font-semibold text-[#0C6B58] bg-[#E3F9F2] hover:bg-[#D1F4E9] rounded border border-[#A3E6D5] transition-colors cursor-pointer flex items-center gap-1"
                  title="Auto-balance module durations (preserves manually changed times)"
                >
                  <Clock size={12} /> Auto-Balance Time
                </button>
                <button
                  onClick={handleAutoBalanceWeights}
                  className="px-3 py-1 text-[11px] font-semibold text-[#2F5CFF] bg-[#EAF0FF] hover:bg-[#D6E4FF] rounded border border-[#B3C5FF] transition-colors cursor-pointer"
                >
                  Auto-Balance Weights
                </button>
              </div>
            </div>

            {/* Modules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {(
                [
                  { id: "MCQ", name: "Multiple Choice (MCQ)", icon: CheckCircle2, desc: "Evaluated deterministically" },
                  { id: "SQL", name: "SQL Queries", icon: Database, desc: "Evaluated via Judge0 DB" },
                  { id: "NOSQL", name: "NoSQL Queries", icon: Database, desc: "Evaluated via isolated MongoDB sandbox" },
                  { id: "CODING", name: "Coding / DSA", icon: Code2, desc: "Evaluated via Judge0" },
                  { id: "DEBUGGING", name: "Debugging", icon: Bug, desc: "Evaluated via Judge0" },
                  { id: "AI_PROMPTING", name: "AI Prompting", icon: Bot, desc: "Evaluated via Groq/Cerebras" },
                  { id: "SIMULATION", name: "Contextual Simulation", icon: Play, desc: "On-call incident & ticket simulation evaluated via LLM" },
                  { id: "TEST_SCENARIOS", name: "Test Scenarios", icon: FileText, desc: "Role-specific scenario questions evaluated via structured criteria" },
                ] as const
              ).map((mod) => {
                const isGloballyEnabled = globalEnabledModules.includes(mod.id);
                const Icon = mod.icon;
                const conf = moduleConfig[mod.id] || { enabled: false, durationMinutes: 15, weight: 15, isBonus: false, isFixed: false };
                return (
                  <div
                    key={mod.id}
                    onClick={() => {
                      if (!isGloballyEnabled) {
                        toast.error(`${mod.name} is disabled in Admin Settings for this department.`);
                        return;
                      }
                      const isNowEnabled = !conf.enabled;
                      const nextConfig = {
                        ...moduleConfig,
                        [mod.id]: { ...conf, enabled: isNowEnabled },
                      };
                      const winMins = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
                      const lowerName = (drive?.roleTemplateName || "").toLowerCase();
                      const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
                        lowerName.includes("l1") ? "l1" : (
                          lowerName.includes("l2") ? "l2" : "l3"
                        )
                      );
                      const aligned = autoAlignModuleConfig(nextConfig, winMins, resolvedTag);
                      setModuleConfig(aligned);
                    }}
                    className={`border rounded-md p-4 space-y-3 transition-colors select-none ${
                      !isGloballyEnabled
                        ? "bg-[#F7F7F9]/80 border-[#E6E6EA] opacity-40 cursor-not-allowed"
                        : conf.enabled
                        ? "bg-white border-[#2F5CFF] shadow-sm cursor-pointer"
                        : "bg-[#F7F7F9] border-[#E6E6EA] opacity-70 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold text-[13px] text-[#0B0B0D]">
                        <Icon size={16} className={conf.enabled && isGloballyEnabled ? "text-[#2F5CFF]" : "text-[#8B8B93]"} />
                        <span>{mod.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!isGloballyEnabled && (
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded">
                            Disabled in Settings
                          </span>
                        )}
                        <input
                          type="checkbox"
                          checked={conf.enabled && isGloballyEnabled}
                          disabled={!isGloballyEnabled}
                          onChange={() => {}}
                          className="w-4 h-4 text-[#2F5CFF] rounded cursor-pointer pointer-events-none disabled:opacity-40"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-[#8B8B93]">{mod.desc}</p>

                    {conf.enabled && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="grid grid-cols-2 gap-2 pt-2 border-t border-[#EFF0F3] text-[11px]"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[#5B5B64] font-medium">Duration (min)</label>
                            {conf.isFixed && (
                              <button
                                type="button"
                                onClick={() => {
                                  setModuleConfig({
                                    ...moduleConfig,
                                    [mod.id]: { ...conf, isFixed: false },
                                  });
                                }}
                                className="text-[10px] text-amber-600 hover:text-amber-800 font-medium cursor-pointer"
                                title="Click to unlock auto-adjustment"
                              >
                                Fixed
                              </button>
                            )}
                          </div>
                          <input
                            type="number"
                            value={conf.durationMinutes === 0 ? "" : conf.durationMinutes}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                              setModuleConfig({
                                ...moduleConfig,
                                [mod.id]: { ...conf, durationMinutes: val, isFixed: true },
                              });
                            }}
                            onFocus={(e) => e.target.select()}
                            className={`w-full px-2 py-1 border rounded font-mono text-[12px] ${
                              conf.isFixed ? "border-amber-400 bg-amber-50/30" : "border-[#E6E6EA]"
                            }`}
                          />
                        </div>

                        <div>
                          <label className="block text-[#5B5B64] font-medium mb-1">
                            Score Weight (pts)
                          </label>
                          <input
                            type="number"
                            value={conf.weight === 0 ? "" : conf.weight}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                              const lowerName = (drive?.roleTemplateName || "").toLowerCase();
                              const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
                                lowerName.includes("l1") ? "l1" : (
                                  lowerName.includes("l2") ? "l2" : "l3"
                                )
                              );
                              const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
                              const newReqCount = getRequiredQuestionCount(mod.id, val, totalDuration, resolvedTag);
                              const newDist = getDefaultDifficultyDistribution(newReqCount, resolvedTag);

                              setModuleConfig({
                                ...moduleConfig,
                                [mod.id]: {
                                  ...conf,
                                  weight: val,
                                  requiredCount: newReqCount,
                                  difficultyDistribution: newDist,
                                },
                              });
                            }}
                            onFocus={(e) => e.target.select()}
                            className="w-full px-2 py-1 border border-[#E6E6EA] rounded font-mono text-[12px]"
                          />
                        </div>

                        {mod.id === "AI_PROMPTING" && (
                          <div className="col-span-2 pt-2 border-t border-[#EFF0F3]">
                            <label className="block text-[#5B5B64] font-medium mb-1.5 text-[11px]">Question &amp; Validation Source</label>
                            <Select
                              value={(conf as any).questionSource || "AI_DYNAMIC"}
                              onValueChange={(val) =>
                                setModuleConfig({
                                  ...moduleConfig,
                                  [mod.id]: { ...(conf as any), questionSource: val } as any,
                                })
                              }
                            >
                              <SelectTrigger className="w-full h-8 px-2.5 border border-[#E6E6EA] rounded-[6px] font-sans text-[12px] bg-white text-[#0B0B0D] cursor-pointer">
                                <SelectValue placeholder="Select question source" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="AI_DYNAMIC">
                                  <div className="flex items-center gap-1.5">
                                    <Bot className="w-3.5 h-3.5 text-[#2F5CFF]" />
                                    <span>AI-Generated Questions &amp; Autonomous AI Validation</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="STATIC_BANK">
                                  <div className="flex items-center gap-1.5">
                                    <BookOpen className="w-3.5 h-3.5 text-[#5B5B64]" />
                                    <span>Static Question Bank (Pre-authored Questions &amp; Rules)</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {(() => {
                          const lowerName = (drive?.roleTemplateName || "").toLowerCase();
                          const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
                            lowerName.includes("l1") ? "l1" : (
                              lowerName.includes("l2") ? "l2" : "l3"
                            )
                          );
                          const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
                          const reqCount = getRequiredQuestionCount(mod.id, conf.weight, totalDuration, resolvedTag);
                          const dist = (conf as any).difficultyDistribution || getDefaultDifficultyDistribution(reqCount, resolvedTag);
                          const estDuration = getEstimatedModuleDuration(mod.id, dist);
                          const distSum = (Number(dist.easy) || 0) + (Number(dist.medium) || 0) + (Number(dist.hard) || 0);

                          return (
                            <div className="col-span-2 pt-2 border-t border-[#EFF0F3] space-y-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-[#0B0B0D]">
                                  Difficulty Target (Required: {reqCount})
                                </span>
                                <span className="text-[10px] text-[#5B5B64] font-medium font-mono">
                                  Est: {estDuration} min
                                </span>
                              </div>
                              {distSum !== reqCount && (
                                <div className="text-[10px] text-rose-600 font-bold">
                                  ⚠ Difficulty counts must total {reqCount} (Current: {distSum})
                                </div>
                              )}
                              <div className="grid grid-cols-3 gap-1.5">
                                <div>
                                  <label className="block text-[9px] text-emerald-800 font-medium mb-0.5 uppercase tracking-wide">Easy</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={dist.easy}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                      setModuleConfig({
                                        ...moduleConfig,
                                        [mod.id]: {
                                          ...conf,
                                          requiredCount: reqCount,
                                          difficultyDistribution: { ...dist, easy: val },
                                        },
                                      } as any);
                                    }}
                                    className="w-full px-1.5 py-0.5 border border-[#E6E6EA] rounded font-mono text-[11px]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] text-amber-800 font-medium mb-0.5 uppercase tracking-wide">Medium</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={dist.medium}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                      setModuleConfig({
                                        ...moduleConfig,
                                        [mod.id]: {
                                          ...conf,
                                          requiredCount: reqCount,
                                          difficultyDistribution: { ...dist, medium: val },
                                        },
                                      } as any);
                                    }}
                                    className="w-full px-1.5 py-0.5 border border-[#E6E6EA] rounded font-mono text-[11px]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] text-rose-800 font-medium mb-0.5 uppercase tracking-wide">Hard</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={dist.hard}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                      setModuleConfig({
                                        ...moduleConfig,
                                        [mod.id]: {
                                          ...conf,
                                          requiredCount: reqCount,
                                          difficultyDistribution: { ...dist, hard: val },
                                        },
                                      } as any);
                                    }}
                                    className="w-full px-1.5 py-0.5 border border-[#E6E6EA] rounded font-mono text-[11px]"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Assessment Composition Summary */}
          {(() => {
            const {
              summaryData,
              totalDuration,
              totalWeight,
              totalMarks,
              totalQuestions,
              totalEstTime,
              isOverTime,
              overflowMinutes,
            } = driveEvaluationSummary;

            return (
              <div className="bg-white border border-[#E6E6EA] rounded-[12px] p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-[#EFF0F3] pb-3">
                  <Settings size={18} className="text-[#2F5CFF]" />
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Assessment Composition Summary (Time-Aware)</h3>
                    <p className="text-[12px] text-[#8B8B93]">Estimated question counts, difficulty mix, and expected candidate duration based on module benchmarks.</p>
                  </div>
                </div>

                <div className="border border-[#E6E6EA] rounded-xl overflow-hidden shadow-xs bg-white text-[12px]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F7F7F9] border-b border-[#E6E6EA] font-mono text-[10px] uppercase tracking-wide font-semibold text-[#5B5B64]">
                        <th className="px-4 py-2.5">Module</th>
                        <th className="px-4 py-2.5 text-center">Weight</th>
                        <th className="px-4 py-2.5 text-center">Marks</th>
                        <th className="px-4 py-2.5 text-center">Required Questions</th>
                        <th className="px-4 py-2.5 text-center">Difficulty Mix</th>
                        <th className="px-4 py-2.5 text-right">Estimated Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E6E6EA] font-mono text-[11px]">
                      {summaryData.map((m) => (
                        <tr key={m.modId} className="hover:bg-[#F7F7F9]/50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-[#0B0B0D]">{m.modId}</td>
                          <td className="px-4 py-3 text-center text-[#2F5CFF] font-semibold">{m.weight}%</td>
                          <td className="px-4 py-3 text-center text-[#0B0B0D]">{m.marks} marks</td>
                          <td className="px-4 py-3 text-center text-[#0B0B0D] font-bold">{m.count} questions</td>
                          <td className="px-4 py-3 text-center text-[#5B5B64]">
                            <span className="text-emerald-700 font-semibold">{m.dist.easy}E</span> / <span className="text-amber-700 font-semibold">{m.dist.medium}M</span> / <span className="text-rose-700 font-semibold">{m.dist.hard}H</span>
                          </td>
                          <td className="px-4 py-3 text-right text-[#5B5B64] font-semibold">{m.estTime} min</td>
                        </tr>
                      ))}
                      <tr className="bg-[#F7F7F9]/50 font-bold border-t border-[#E6E6EA]">
                        <td className="px-4 py-3 text-[#0B0B0D]">Total Summary</td>
                        <td className="px-4 py-3 text-center text-[#2F5CFF]">{totalWeight}%</td>
                        <td className="px-4 py-3 text-center text-[#0B0B0D]">{totalMarks} marks</td>
                        <td className="px-4 py-3 text-center text-[#0B0B0D]">{totalQuestions} questions</td>
                        <td className="px-4 py-3 text-center text-[#8B8B93]">—</td>
                        <td className="px-4 py-3 text-right text-[#0B0B0D]">
                          <span className={isOverTime ? "text-rose-600 font-bold" : "text-[#0B0B0D]"}>
                            {totalEstTime} min
                          </span>{" "}
                          <span className="text-[10px] text-[#8B8B93] font-normal">(out of {totalDuration} min)</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Status Banners */}
                {isOverTime ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-[12px] text-rose-900">
                    <div className="flex items-start gap-2.5 max-w-2xl">
                      <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">
                          ⚠ Estimated assessment time exceeds the configured {totalDuration}-minute limit by {overflowMinutes} minutes.
                        </p>
                        <p className="text-[11px] text-rose-700 mt-0.5">
                          The configuration cannot be saved or scheduled until the estimated duration fits within the {totalDuration}-minute window. Click Auto-Align to automatically optimize module difficulties and timings.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoAlignAssessment}
                      className="shrink-0 px-3.5 py-2 bg-[#2F5CFF] hover:bg-[#1A44D6] text-white text-[12px] font-bold rounded-md shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles size={14} className="text-amber-300" />
                      <span>Auto-Align to {totalDuration} min</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-[12px] text-emerald-800 font-medium">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>✓ Assessment configuration fits within the configured {totalDuration}-minute limit ({totalEstTime} min estimated).</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* SECTION 3: System Checks & Proctoring Customization */}
          <div className="bg-white border border-[#E6E6EA] rounded-[12px] p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EFF0F3] pb-3">
              <ShieldCheck size={18} className="text-[#2F5CFF]" />
              <div>
                <h3 className="text-[15px] font-semibold text-[#0B0B0D]">System Checks &amp; Proctoring Customization</h3>
                <p className="text-[12px] text-[#8B8B93]">Enable or customize mandatory hardware, browser, and network checks for candidates.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {[
                { id: "requireCamera", label: "Webcam & Video Feed Check", icon: Camera, desc: "Verify candidate camera hardware before assessment entry." },
                { id: "requireMicrophone", label: "Microphone & Audio Detection Check", icon: Mic, desc: "Verify microphone access and monitor ambient sound." },
                { id: "requireScreenShare", label: "Display & Monitor Validation", icon: Monitor, desc: "Check for secondary monitors and HDMI output displays." },
                { id: "enforceFullscreen", label: "Enforce Fullscreen Mode", icon: Maximize2, desc: "Require candidate browser window to remain in fullscreen." },
                { id: "cpuMathBenchmark", label: "CPU Performance Benchmark", icon: Cpu, desc: "Run candidate hardware micro-benchmark before starting." },
                { id: "allowMobileDevice", label: "Allow Mobile Web Candidates", icon: Smartphone, desc: "Permit assessment completion on mobile browsers." },
              ].map((item) => {
                const Icon = item.icon;
                const isChecked = Boolean(proctoringConfig[item.id as keyof typeof proctoringConfig]);
                return (
                  <label key={item.id} className="flex items-start gap-3 p-3.5 bg-[#F8F9FB] border border-[#E6E6EA] rounded-xl cursor-pointer hover:border-[#2F5CFF] transition-colors">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        setProctoringConfig({
                          ...proctoringConfig,
                          [item.id]: e.target.checked,
                        });
                      }}
                      className="mt-0.5 accent-[#2F5CFF] rounded w-4 h-4"
                    />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-semibold text-[13px] text-[#0B0B0D]">
                        <Icon size={14} className="text-[#2F5CFF]" />
                        <span>{item.label}</span>
                      </div>
                      <p className="text-[11px] text-[#8B8B93] leading-snug">{item.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* BOTTOM ACTION BUTTON: Save & Next -> */}
          <div className="flex justify-start pt-2">
            <button
              type="button"
              onClick={handleSaveAndNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#2F5CFF] hover:bg-[#1A44D6] text-white font-semibold text-[14px] rounded-[10px] shadow-md transition-colors cursor-pointer"
            >
              <span>Save &amp; Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
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
                  Select and assign questions from the central question library or import via CSV.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigate({
                      to: "/questions",
                      search: {
                        fromDriveId: driveId,
                        driveName: drive.name,
                        autoBulk: "true",
                      } as any,
                    });
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold text-[#2F5CFF] bg-[#EAF0FF] hover:bg-[#D9E4FF] border border-[#B3C5FF] rounded-md transition-colors cursor-pointer"
                >
                  <Upload size={14} /> Bulk Import Questions
                </button>
              </div>
            </div>

            {!isQuestionsEditable && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-800 flex items-center gap-2">
                <Lock size={16} className="text-amber-600 shrink-0" />
                <span>
                  <strong>Questions Locked:</strong> All candidate invite links have already been generated for this drive. Questions are present below for review in read-only mode.
                </span>
              </div>
            )}

            {/* ASSIGNED QUESTIONS SECTION */}
            <div className="bg-[#FAFBFD] border border-[#E6E6EA] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#2F5CFF]" />
                  <h4 className="text-[14px] font-semibold text-[#0B0B0D]">
                    Assigned Questions for this Drive ({assignedQuestions.length})
                  </h4>
                </div>
                {!isQuestionsEditable && (
                  <span className="px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full flex items-center gap-1">
                    <Lock size={12} /> Read-Only
                  </span>
                )}
              </div>

              {assignedQuestions.length === 0 ? (
                <p className="text-[12px] text-[#8B8B93] italic">
                  No questions assigned to this drive yet. Select and assign questions from the Question Bank below.
                </p>
              ) : (
                <div className="divide-y divide-[#EFF0F3] border border-[#E6E6EA] rounded-md bg-white max-h-[240px] overflow-y-auto">
                  {assignedQuestions.map((qId) => {
                    const q = questionsBank.find((item) => item.id === qId) || {
                      id: qId,
                      moduleType: "ASSIGNED",
                      difficulty: "MEDIUM",
                      content: { title: `Assigned Question (#${qId.slice(0, 8)})` },
                    };
                    const title = q.content?.title || q.content?.prompt || q.content?.name || q.content?.question || q.content?.problemStatement || q.content?.text || `Question #${q.id.slice(0, 6)}`;
                    const isDebugging = q.moduleType === "DEBUGGING" || (Array.isArray((q as any).tags) && (q as any).tags.includes("debugging"));
                    const displayModule = isDebugging ? "DEBUGGING" : q.moduleType;
                    return (
                      <div key={qId} className="p-3 flex items-center justify-between hover:bg-[#F0F4FF]/50 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-[#EAF0FF] text-[#15308F] border border-[#B3C5FF]">
                            {displayModule}
                          </span>
                          <span className="text-[13px] font-semibold text-[#0B0B0D] line-clamp-1">{title}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewQuestion(q)}
                            className="text-[11px] text-[#2F5CFF] font-medium flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <Eye size={12} /> Preview
                          </button>
                          {isQuestionsEditable ? (
                            <button
                              type="button"
                              onClick={() => setAssignedQuestions(assignedQuestions.filter((id) => id !== qId))}
                              className="px-2.5 py-1 text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors cursor-pointer"
                            >
                              Remove
                            </button>
                          ) : (
                            <span className="px-2.5 py-1 text-[11px] font-medium text-[#8B8B93] bg-[#EFF0F3] rounded flex items-center gap-1 cursor-not-allowed">
                              <Lock size={11} /> Locked
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pool Sufficiency & Status Banners */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {allowedModules.map((modId) => {
                const conf = moduleConfig[modId] || { enabled: false, weight: 0 };
                if (!conf.enabled || Number(conf.weight) <= 0) return null;

                const lowerName = (drive?.roleTemplateName || "").toLowerCase();
                const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
                  lowerName.includes("l1") ? "l1" : (
                    lowerName.includes("l2") ? "l2" : "l3"
                  )
                );
                const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
                const reqCount = getRequiredQuestionCount(modId, conf.weight, totalDuration, resolvedTag);
                const dist = (conf as any).difficultyDistribution || getDefaultDifficultyDistribution(reqCount, resolvedTag);

                const poolQuestions = (questionsBank || []).filter(q => {
                  const isDebug = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
                  const displayMod = isDebug ? "DEBUGGING" : q.moduleType;
                  return assignedQuestions.includes(q.id) && displayMod === modId;
                });
                const poolSize = poolQuestions.length;

                const easyAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "EASY").length;
                const mediumAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "MEDIUM").length;
                const hardAvail = poolQuestions.filter(q => (q.difficulty || "medium").toUpperCase() === "HARD").length;

                const hasRoleTemplate = Boolean(drive?.roleTemplateId || (drive as any)?.roleTemplate);
                const errors: string[] = [];
                if (!hasRoleTemplate) {
                  if (easyAvail < dist.easy) errors.push(`Need ${dist.easy - easyAvail} more Easy question(s) (Target: ${dist.easy}, Selected: ${easyAvail})`);
                  if (mediumAvail < dist.medium) errors.push(`Need ${dist.medium - mediumAvail} more Medium question(s) (Target: ${dist.medium}, Selected: ${mediumAvail})`);
                  if (hardAvail < dist.hard) errors.push(`Need ${dist.hard - hardAvail} more Hard question(s) (Target: ${dist.hard}, Selected: ${hardAvail})`);
                }

                const isCountMatched = poolSize === reqCount;
                const isDifficultyMatched = easyAvail === dist.easy && mediumAvail === dist.medium && hardAvail === dist.hard;

                const renderDiffMetric = (label: string, val: number) => {
                  const isZero = val === 0;
                  return (
                    <span className={`inline-flex items-center gap-1 ${isZero ? "text-[#B8B8C2]" : "text-[#0B0B0D]"}`}>
                      <span className={isZero ? "text-[#C5C5CE]" : "text-[#5B5B64]"}>{label}:</span>
                      <span className={isZero ? "text-[#C5C5CE] font-normal" : "font-bold text-[#0B0B0D]"}>{val}</span>
                    </span>
                  );
                };

                return (
                  <div key={modId} className="bg-white border border-[#E6E6EA] rounded-lg p-3.5 space-y-2.5 text-[12px] shadow-sm">
                    <div className="flex items-center justify-between font-semibold border-b border-[#EFF0F3] pb-2">
                      <span className="text-[#0B0B0D] font-bold text-[13px]">
                        {MODULE_LABEL_MAP[modId] || modId} Module
                      </span>
                      <span className="text-[#2F5CFF] text-[11px] font-semibold">
                        {hasRoleTemplate ? `Attached: ${poolSize}` : `Required: ${reqCount}`}
                      </span>
                    </div>

                    <div className="space-y-1.5 font-mono text-[11px]">
                      {/* Strictly aligned vertical grid */}
                      <div className="grid grid-cols-[64px_1fr_1fr_1fr] items-center">
                        <span className="text-[#9C9CA5] font-sans font-medium text-[11px]">Target:</span>
                        <div>{renderDiffMetric("Easy", dist.easy)}</div>
                        <div>{renderDiffMetric("Medium", dist.medium)}</div>
                        <div>{renderDiffMetric("Hard", dist.hard)}</div>
                      </div>

                      <div className="grid grid-cols-[64px_1fr_1fr_1fr] items-center">
                        <span className="text-[#9C9CA5] font-sans font-medium text-[11px]">Selected:</span>
                        <div>{renderDiffMetric("Easy", easyAvail)}</div>
                        <div>{renderDiffMetric("Medium", mediumAvail)}</div>
                        <div>{renderDiffMetric("Hard", hardAvail)}</div>
                      </div>

                      {/* Emphasized Progress Ratio & Bar */}
                      <div className="flex items-center justify-between font-sans pt-1.5 border-t border-[#EFF0F3]/80">
                        <span className="text-[#9C9CA5] text-[11px] font-medium">Selected:</span>
                        <div className="flex items-center gap-2.5">
                          <div className="w-16 h-1.5 bg-[#EFF0F3] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                poolSize === reqCount ? "bg-emerald-500" : "bg-[#2F5CFF]"
                              }`}
                              style={{ width: `${Math.min(100, reqCount > 0 ? (poolSize / reqCount) * 100 : 0)}%` }}
                            />
                          </div>
                          <span className={`text-[13px] font-bold font-mono ${poolSize === reqCount ? "text-emerald-700" : "text-[#0B0B0D]"}`}>
                            {poolSize} / {reqCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-[#EFF0F3] text-[11px] space-y-1">
                      {hasRoleTemplate ? (
                        poolSize > 0 ? (
                          <div className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded font-medium">
                            ✓ {poolSize} questions curated from Role Template.
                          </div>
                        ) : (
                          <div className="text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded">
                            ⚠ No questions attached from Role Template for this module.
                          </div>
                        )
                      ) : (
                        <>
                          {poolSize < reqCount && (
                            <div className="text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded">
                              ⚠ {poolSize} / {reqCount} required questions selected.
                            </div>
                          )}

                          {isCountMatched && isDifficultyMatched && (
                            <div className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded font-medium">
                              ✓ Required question count reached. No additional questions can be added.
                            </div>
                          )}

                          {isCountMatched && !isDifficultyMatched && (
                            <div className="text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded">
                              ⚠ Selected difficulty composition ({easyAvail}E / {mediumAvail}M / {hardAvail}H) does not match target ({dist.easy}E / {dist.medium}M / {dist.hard}H).
                            </div>
                          )}

                          {!isCountMatched && errors.map((err, idx) => (
                            <div key={idx} className="text-amber-700 bg-amber-50/50 border border-amber-200 px-2.5 py-0.5 rounded text-[10px]">
                              ⚠ {err}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
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
                  All Modules ({allowedModules.length})
                </button>
                {(["MCQ", "SQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS", "NOSQL"] as const)
                  .filter((modKey) => enabledModuleKeys.length === 0 || enabledModuleKeys.includes(modKey))
                  .map((modKey) => {
                    const labelMap: Record<string, string> = {
                      MCQ: "MCQ",
                      SQL: "SQL",
                      CODING: "Coding",
                      DEBUGGING: "Debugging",
                      AI_PROMPTING: "AI Prompting",
                      SIMULATION: "Simulation",
                      TEST_SCENARIOS: "Test Scenarios",
                      NOSQL: "NoSQL",
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
                        <span>{labelMap[modKey] || modKey}</span>
                      </button>
                    );
                  })}
              </div>

              {/* Vertical divider and Complexity Filter */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:block h-5 w-px bg-[#E6E6EA]" />

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#5B5B64] uppercase tracking-wider hidden sm:inline">Complexity:</span>
                  <div className="flex items-center bg-white p-0.5 rounded-md border border-[#E6E6EA]">
                    {[
                      { id: "ALL", label: "All" },
                      { id: "EASY", label: "Easy" },
                      { id: "MEDIUM", label: "Medium" },
                      { id: "HARD", label: "Hard" },
                    ].map((diff) => (
                      <button
                        key={diff.id}
                        onClick={() => setQuestionDifficultyFilter(diff.id)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                          questionDifficultyFilter === diff.id
                            ? diff.id === "EASY"
                              ? "bg-emerald-100 text-emerald-800 font-bold"
                              : diff.id === "HARD"
                              ? "bg-rose-100 text-rose-800 font-bold"
                              : diff.id === "MEDIUM"
                              ? "bg-amber-100 text-amber-800 font-bold"
                              : "bg-[#2F5CFF] text-white font-bold"
                            : "text-[#5B5B64] hover:text-[#0B0B0D]"
                        }`}
                      >
                        {diff.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative w-full sm:w-[200px]">
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
            {isAiPromptingDynamic && (questionModuleFilter === "ALL" || questionModuleFilter === "AI_PROMPTING") && (
              <div className="p-3.5 bg-[#F7F7F9] border border-[#E6E6EA] rounded-lg text-[12px] italic text-[#8B8B93] flex items-center gap-2">
                <Sparkles size={14} className="text-[#2F5CFF] shrink-0" />
                <span>AI-Generated Mode Selected — Questions &amp; evaluation will be dynamically generated by AI during the candidate assessment.</span>
              </div>
            )}

            <div className="divide-y divide-[#EFF0F3] border border-[#E6E6EA] rounded-md max-h-[460px] overflow-y-auto">
              {filteredQuestionsList.length === 0 ? (
                <div className="p-8 text-center text-[12px] italic text-[#8B8B93]">
                  No matching questions found in bank.
                </div>
              ) : (
                filteredQuestionsList.map((q) => {
                  const isSelected = assignedQuestions.includes(q.id);
                  const title = q.content?.title || q.content?.prompt || q.content?.name || q.content?.question || q.content?.problemStatement || q.content?.text || `Question #${q.id.slice(0, 6)}`;
                  const difficulty = q.difficulty || "MEDIUM";
                  const isDebugging = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
                  const displayModule = isDebugging ? "DEBUGGING" : q.moduleType;
                  const { displayTags, hiddenDriveCount } = processQuestionTags(q.tags, q.moduleType);

                  return (
                    <div
                      key={q.id}
                      onClick={() => setPreviewQuestion(q)}
                      className="p-3.5 flex items-center justify-between hover:bg-[#F0F4FF]/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 pr-4 flex-1">
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-[#EAF0FF] text-[#15308F] border border-[#B3C5FF]">
                          {MODULE_LABEL_MAP[displayModule] || displayModule}
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

                            {displayTags.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {displayTags.map((tag: string) => (
                                  <span key={tag} className="text-[10px] text-[#8B8B93] bg-[#EFF0F3] px-1.5 py-0.2 rounded font-mono">
                                    #{tag}
                                  </span>
                                ))}
                                {hiddenDriveCount > 0 && (
                                  <span className="text-[10px] text-[#2F5CFF] bg-[#EAF0FF] px-1.5 py-0.2 rounded font-semibold">
                                    +{hiddenDriveCount} more drives
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#2F5CFF] opacity-0 group-hover:opacity-100 transition-opacity font-medium flex items-center gap-1">
                          <Eye size={12} /> Preview
                        </span>
                        {isQuestionsEditable ? (() => {
                          const conf = moduleConfig[displayModule] || { enabled: false, weight: 0 };
                          const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
                          const reqCount = getRequiredQuestionCount(displayModule, conf.weight, totalDuration, driveEvaluationSummary.resolvedTag);
                          const modAssigned = (questionsBank || []).filter((item) => {
                            const isDeb = item.moduleType === "DEBUGGING" || (Array.isArray(item.tags) && item.tags.includes("debugging"));
                            const dMod = isDeb ? "DEBUGGING" : item.moduleType;
                            return assignedQuestions.includes(item.id) && dMod === displayModule;
                          });
                          const isLimitReached = !isSelected && modAssigned.length >= reqCount;

                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isSelected) {
                                  setAssignedQuestions(assignedQuestions.filter((id) => id !== q.id));
                                } else {
                                  if (modAssigned.length >= reqCount) {
                                    toast.error(`Required question limit reached (${reqCount} questions) for ${displayModule}. No additional questions can be added.`);
                                    return;
                                  }
                                  setAssignedQuestions([...assignedQuestions, q.id]);
                                }
                              }}
                              className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors ${
                                isSelected
                                  ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 cursor-pointer"
                                  : isLimitReached
                                  ? "bg-gray-100 text-[#8B8B93] border border-gray-200 cursor-not-allowed"
                                  : "bg-[#2F5CFF] text-white hover:bg-[#0037FF] cursor-pointer"
                              }`}
                              title={isLimitReached ? `Limit reached: ${reqCount}/${reqCount} questions selected for ${displayModule}` : undefined}
                            >
                              {isSelected ? "Remove" : "Assign"}
                            </button>
                          );
                        })() : (
                          <button
                            disabled
                            className="px-3 py-1 rounded text-[11px] font-medium bg-gray-100 text-[#8B8B93] border border-gray-200 cursor-not-allowed flex items-center gap-1"
                            title="Locked: Candidate links already generated"
                          >
                            <Lock size={10} /> {isSelected ? "Assigned (Locked)" : "Locked"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* BOTTOM ACTION BUTTON: Save & Next -> */}
          <div className="flex justify-start pt-2">
            <button
              type="button"
              onClick={handleSaveQuestionsAndNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#2F5CFF] hover:bg-[#1A44D6] text-white font-semibold text-[14px] rounded-[10px] shadow-md transition-colors cursor-pointer"
            >
              <span>Save &amp; Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
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
                  onClick={() => setShowBulkImportModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#2F5CFF] bg-[#EAF0FF] border border-[#B3C5FF] hover:bg-[#D6E4FF] rounded transition-colors cursor-pointer"
                >
                  <Upload size={13} /> Bulk Import Candidates
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
                    <th className="p-3">Target Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Invite Link</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFF0F3]">
                  {drive.roster.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[12px] italic text-[#8B8B93]">
                        No candidates added to roster yet. Click "Add Candidate" above to get started.
                      </td>
                    </tr>
                  ) : (
                    drive.roster.map((c) => (
                      <tr key={c.candidateId} className="hover:bg-[#F7F7F9]">
                        <td className="p-3 font-semibold text-[#0B0B0D]">{c.candidateName}</td>
                        <td className="p-3 font-mono text-[12px] text-[#5B5B64]">{c.candidateEmail}</td>
                        <td className="p-3 font-mono text-[11px]">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-300">
                            {c.experienceTier ? `${c.experienceTier} yrs` : (c.level || drive.roleTemplateName || "Assigned Role")}
                          </span>
                        </td>
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
                            <button
                              onClick={async () => {
                                await handleGenerateLinks();
                                const updated = await fetchDriveDetail(driveId);
                                const match = (updated.roster || []).find((item: any) => item.candidateId === c.candidateId || item.candidateEmail === c.candidateEmail);
                                if (match?.inviteLink) {
                                  copyCandidateLink(match.inviteLink, c.candidateId);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-[#2F5CFF] hover:bg-[#0037FF] text-white rounded transition-colors cursor-pointer shadow-xs"
                            >
                              <Sparkles size={12} />
                              <span>Generate Link</span>
                            </button>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {c.sessionId && (
                              <Link
                                to="/results/$id"
                                params={{ id: c.sessionId }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-[#EAF0FF] text-[#2F5CFF] rounded hover:bg-[#D9E4FF] transition-colors"
                              >
                                <Eye size={12} /> View Results
                              </Link>
                            )}
                            <button
                              onClick={() => setCandidateToRemove(c)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors cursor-pointer"
                              title="Remove candidate & revoke access"
                            >
                              <Trash2 size={12} />
                              <span>Remove</span>
                            </button>
                          </div>
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
                  <div className="space-y-2">
                    {previewQuestion.content.options.map((opt: any, idx: number) => {
                      const isCorrect = Boolean(
                        opt.isCorrect ||
                        previewQuestion.content?.correctAnswer === idx ||
                        previewQuestion.content?.correctOption === idx ||
                        previewQuestion.content?.correctIndex === idx ||
                        previewQuestion.scoringConfig?.correctIndex === idx ||
                        previewQuestion.scoringConfig?.correctAnswer === idx
                      );
                      const optText = typeof opt === "string" ? opt : opt.text || opt.label;
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg text-[13px] border flex items-center justify-between transition-colors ${
                            isCorrect
                              ? "bg-[#E3F9F2] border-[#A3E6D5] text-[#0C6B58] font-semibold shadow-xs"
                              : "bg-[#F7F7F9] border-[#E6E6EA] text-[#0B0B0D]"
                          }`}
                        >
                          <span><strong className="font-mono mr-2">{String.fromCharCode(65 + idx)}.</strong> {optText}</span>
                          {isCorrect && (
                            <span className="text-[11px] font-bold text-white bg-[#0C6B58] px-2.5 py-0.5 rounded shadow-xs flex items-center gap-1">
                              Answer
                            </span>
                          )}
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

              {/* Expected Answer / Grading Rubric for Test Scenarios & AI Prompting */}
              {(previewQuestion.content?.expectedAnswer || previewQuestion.content?.expectedCriteria) && (
                <div className="space-y-1.5 pt-2 border-t border-[#EFF0F3]">
                  <label className="text-[12px] font-mono uppercase tracking-wider text-[#5B5B64] font-semibold block">
                    Expected Guidelines / Rubric:
                  </label>
                  <div className="p-3 bg-[#EAF0FF] border border-[#B3C5FF] text-[#0B0B0D] text-[13px] rounded-md leading-relaxed">
                    {previewQuestion.content.expectedAnswer || previewQuestion.content.expectedCriteria}
                  </div>
                </div>
              )}

              {/* Tags */}
              {previewQuestion.tags && previewQuestion.tags.length > 0 && (() => {
                const { displayTags, hiddenDriveCount } = processQuestionTags(previewQuestion.tags, previewQuestion.moduleType);
                if (displayTags.length === 0 && hiddenDriveCount === 0) return null;
                return (
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#EFF0F3]">
                    <span className="text-[11px] font-medium text-[#5B5B64]">Tags:</span>
                    {displayTags.map((tag: string) => (
                      <span key={tag} className="text-[11px] text-[#2F5CFF] bg-[#EAF0FF] px-2 py-0.5 rounded font-mono">
                        #{tag}
                      </span>
                    ))}
                    {hiddenDriveCount > 0 && (
                      <span className="text-[11px] text-[#2F5CFF] bg-[#D9E4FF] px-2 py-0.5 rounded font-semibold">
                        +{hiddenDriveCount} more drives
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="px-6 py-4 border-t border-[#E6E6EA] bg-[#F7F7F9] flex items-center justify-end">
              {(() => {
                const isAssigned = assignedQuestions.includes(previewQuestion.id);
                const isDebugging = previewQuestion.moduleType === "DEBUGGING" || (Array.isArray(previewQuestion.tags) && previewQuestion.tags.includes("debugging"));
                const displayModule = isDebugging ? "DEBUGGING" : previewQuestion.moduleType;
                const conf = moduleConfig[displayModule] || { enabled: false, weight: 0 };
                const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
                const reqCount = getRequiredQuestionCount(displayModule, conf.weight, totalDuration, driveEvaluationSummary.resolvedTag);
                const modAssigned = (questionsBank || []).filter((item) => {
                  const isDeb = item.moduleType === "DEBUGGING" || (Array.isArray(item.tags) && item.tags.includes("debugging"));
                  const dMod = isDeb ? "DEBUGGING" : item.moduleType;
                  return assignedQuestions.includes(item.id) && dMod === displayModule;
                });
                const isLimitReached = !isAssigned && modAssigned.length >= reqCount;

                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (isAssigned) {
                        setAssignedQuestions(assignedQuestions.filter((id) => id !== previewQuestion.id));
                        setPreviewQuestion(null);
                      } else {
                        if (modAssigned.length >= reqCount) {
                          toast.error(`Required question limit reached (${reqCount} questions) for ${displayModule}. No additional questions can be added.`);
                          return;
                        }
                        setAssignedQuestions([...assignedQuestions, previewQuestion.id]);
                        setPreviewQuestion(null);
                      }
                    }}
                    className={`px-4 py-2 text-[12px] font-semibold rounded-md shadow-sm transition-colors ${
                      isAssigned
                        ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 cursor-pointer"
                        : isLimitReached
                        ? "bg-gray-100 text-[#8B8B93] border border-gray-200 cursor-not-allowed"
                        : "bg-[#2F5CFF] text-white hover:bg-[#0037FF] cursor-pointer"
                    }`}
                  >
                    {isAssigned ? "Remove Question from Drive" : "Assign Question to Drive"}
                  </button>
                );
              })()}
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

      {/* Confirmation Modal for Removing Candidate */}
      {candidateToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-[12px] border border-[#E6E6EA] p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[#EFF0F3] pb-3">
              <div className="flex items-center gap-2 text-rose-600 font-semibold text-[15px]">
                <AlertTriangle size={18} />
                <span>Remove Candidate</span>
              </div>
              <button
                onClick={() => setCandidateToRemove(null)}
                className="text-[#8B8B93] hover:text-[#0B0B0D] p-1 rounded-md transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-[13px] text-[#5B5B64] leading-relaxed">
              Are you sure you want to remove <strong>{candidateToRemove.candidateName}</strong> (<code>{candidateToRemove.candidateEmail}</code>) from this assessment drive?
            </p>
            <p className="text-[12px] text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
              ⚠️ This will revoke their invite link and expire any active assessment session.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCandidateToRemove(null)}
                disabled={removingCandidate}
                className="px-3.5 py-1.5 text-[12px] font-semibold text-[#5B5B64] bg-[#F7F7F9] hover:bg-[#E6E6EA] rounded border border-[#E6E6EA] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveCandidate}
                disabled={removingCandidate}
                className="px-3.5 py-1.5 text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              >
                {removingCandidate ? "Removing..." : "Remove & Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Candidates Modal */}
      {showBulkImportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[580px] shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-start justify-between">
              <div>
                <h2 className="text-[18px] font-bold text-[#0B0B0D]">Bulk Import Candidates</h2>
                <p className="text-[13px] text-[#5B5B64] mt-0.5">Import candidates and assign directly to test.</p>
              </div>
              <button
                onClick={() => {
                  setShowBulkImportModal(false);
                  setBulkCandidateInput("");
                  setBulkCandidateErrors([]);
                }}
                className="text-[#8B8B93] hover:text-[#0B0B0D] p-1 rounded-md transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[13px] font-semibold text-[#0B0B0D]">
                    Paste CSV or Tab-Separated Data <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCandidates}
                    className="text-[12px] font-semibold text-[#2F5CFF] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Download size={12} /> Download Sample Template
                  </button>
                </div>
                <p className="text-[12px] text-[#8B8B93]">
                  Format: <span className="font-mono text-[#5B5B64]">Candidate Name, candidate.email@company.com</span> (one candidate per line)
                </p>
                <textarea
                  rows={5}
                  value={bulkCandidateInput}
                  onChange={(e) => {
                    setBulkCandidateInput(e.target.value);
                    const { errors } = parseBulkCandidates(e.target.value);
                    setBulkCandidateErrors(errors);
                  }}
                  placeholder={`John Doe, john@example.com\nJane Smith, jane@example.com\nAlex Rivera, alex@example.com`}
                  className="w-full px-3.5 py-2.5 text-[12px] font-mono border border-[#E6E6EA] rounded-lg bg-white focus:outline-none focus:border-[#2F5CFF] focus:ring-1 focus:ring-[#2F5CFF]"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="block text-[13px] font-semibold text-[#0B0B0D]">
                  Select CSV File
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => {
                    const fileInput = document.getElementById("bulk-csv-file-input");
                    if (fileInput) fileInput.click();
                  }}
                  className="border-2 border-dashed border-[#E6E6EA] hover:border-[#2F5CFF] rounded-[10px] p-6 text-center bg-[#FAFBFD] hover:bg-[#F4F7FF] transition-all cursor-pointer group"
                >
                  <UploadCloud className="w-9 h-9 text-[#8B8B93] group-hover:text-[#2F5CFF] mx-auto mb-2 transition-colors" />
                  <p className="text-[13px] font-medium text-[#5B5B64] group-hover:text-[#0B0B0D]">
                    Drag &amp; drop your CSV file here, or click to browse
                  </p>
                  <p className="text-[11px] text-[#8B8B93] mt-1">
                    Accepts .csv format
                  </p>
                  <input
                    id="bulk-csv-file-input"
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              </div>

              {bulkCandidateErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
                  <span className="text-[12px] font-semibold text-red-700 block">Formatting Errors Detected:</span>
                  {bulkCandidateErrors.map((err, idx) => (
                    <p key={idx} className="text-[11px] text-red-600 font-mono">• {err}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-[#FAFBFD] border-t border-[#E6E6EA] flex items-center justify-between">
              <span className="text-[13px] text-[#5B5B64] font-semibold">
                {parseBulkCandidates(bulkCandidateInput).parsed.length} candidate(s) ready
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkImportModal(false);
                    setBulkCandidateInput("");
                    setBulkCandidateErrors([]);
                  }}
                  className="px-4 py-2 text-[13px] font-medium border border-[#E6E6EA] rounded-md hover:bg-[#EFF0F3] transition-colors cursor-pointer text-[#0B0B0D]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkImportSubmit}
                  disabled={submittingBulkImport || parseBulkCandidates(bulkCandidateInput).parsed.length === 0 || bulkCandidateErrors.length > 0}
                  className="px-4 py-2 text-[13px] font-semibold text-white bg-[#2F5CFF] hover:bg-[#0037FF] rounded-md shadow-sm transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {submittingBulkImport ? (
                    "Importing..."
                  ) : (
                    <>
                      <Check size={14} />
                      Import &amp; Assign Candidates
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Select / Change Role Template Modal */}
      {showSelectTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[540px] shadow-2xl flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Select &amp; Apply Role Template</h3>
                <p className="text-[12px] text-[#5B5B64] mt-0.5">
                  Link a Role Template to automatically import questions and preset module weights.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSelectTemplateModal(false)}
                className="text-[#8B8B93] hover:text-[#0B0B0D] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#5B5B64] mb-1">Filter Department</label>
                  <select
                    value={templateDeptFilter}
                    onChange={(e) => setTemplateDeptFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[12px] border border-[#E6E6EA] rounded-md bg-white text-[#0B0B0D]"
                  >
                    <option value="all">All Departments</option>
                    <option value="SOFTWARE_ENGINEERING">Software Engineering</option>
                    <option value="DATA_ENGINEERING">Data Engineering</option>
                    <option value="QA_TESTING">QA &amp; Testing</option>
                    <option value="DEVOPS_SRE">DevOps &amp; SRE</option>
                    <option value="CYBERSECURITY">Cybersecurity</option>
                    <option value="PRODUCT_DESIGN">Product &amp; Design</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5B5B64] mb-1">Filter Category</label>
                  <select
                    value={templateCategoryFilter}
                    onChange={(e) => setTemplateCategoryFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[12px] border border-[#E6E6EA] rounded-md bg-white text-[#0B0B0D]"
                  >
                    <option value="all">All Categories</option>
                    <option value="FRESHER">Fresher (0-1 yrs)</option>
                    <option value="EXPERIENCED">Experienced (2-15 yrs)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#5B5B64] mb-1.5">
                  Select Role Template <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedTemplateForDrive}
                  onChange={(e) => setSelectedTemplateForDrive(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white text-[#0B0B0D] focus:outline-none focus:border-[#2F5CFF]"
                >
                  <option value="">-- Choose Role Template --</option>
                  {(roleTemplates || [])
                    .filter((rt) => {
                      if (templateDeptFilter !== "all" && rt.department !== templateDeptFilter) return false;
                      if (templateCategoryFilter !== "all" && ((rt as any).category || "FRESHER") !== templateCategoryFilter) return false;
                      return true;
                    })
                    .map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.roleName} [{((tpl as any).category || "FRESHER") === "FRESHER" ? "Fresher (0-1 yrs)" : `${(tpl as any).experienceTier || "2-5"} yrs`}] ({tpl.department || "General"})
                      </option>
                    ))}
                </select>
              </div>

              {selectedTemplateForDrive && (
                <div className="p-3.5 bg-[#EAF0FF] border border-[#B3C5FF] rounded-lg space-y-2 text-[12px]">
                  {(() => {
                    const tpl = (roleTemplates || []).find((r) => r.id === selectedTemplateForDrive);
                    if (!tpl) return null;
                    return (
                      <>
                        <div className="flex items-center justify-between font-semibold text-[#15308F]">
                          <span>{tpl.roleName}</span>
                          <span className="px-2 py-0.5 bg-[#2F5CFF] text-white rounded text-[10px] uppercase font-mono">
                            {(tpl as any).experienceTier || "0-1"} yrs
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[#5B5B64] text-[11px]">
                          <span>Department: <strong className="text-[#0B0B0D]">{tpl.department || "General"}</strong></span>
                          <span>•</span>
                          <span>Category: <strong className="text-[#0B0B0D]">{(tpl as any).category || "FRESHER"}</strong></span>
                          <span>•</span>
                          <span>Duration: <strong className="text-[#0B0B0D]">{tpl.durationMinutes || 60}m</strong></span>
                        </div>
                        <p className="text-[11px] text-[#2F5CFF] italic pt-1 border-t border-[#B3C5FF]">
                          💡 Applying this template will update the drive's template reference, link default questions, and apply module weighting presets.
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#E6E6EA] bg-[#F7F7F9] rounded-b-[12px] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSelectTemplateModal(false)}
                className="px-3.5 py-2 text-[12px] font-medium text-[#5B5B64] hover:bg-[#E6E6EA] rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApplyRoleTemplate(selectedTemplateForDrive)}
                disabled={!selectedTemplateForDrive}
                className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-white bg-[#2F5CFF] hover:bg-[#0037FF] rounded-md transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Sparkles size={14} /> Apply Template &amp; Sync Questions
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
