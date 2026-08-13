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
import { SingleDateTimePicker } from "../components/single-date-time-picker";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type DriveDetail } from "../lib/types";
import { validateDriveModuleWeights, type DriveModuleConfigEntry } from "@cd-recruit/shared-types";
import {
  getDepartmentAllowedModules,
  extractQuestionTier,
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
  const ONE_HOUR = 60 *60*1000;
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

  const [drive, setDrive] = useState<DriveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isEditingUnlocked, setIsEditingUnlocked] = useState<boolean>(false);
  const [showUnlockConfirmModal, setShowUnlockConfirmModal] = useState<boolean>(false);

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

  // Module Config State (7 Modules)
  const [moduleConfig, setModuleConfig] = useState<Record<string, DriveModuleConfigEntry>>({
    MCQ: { enabled: true, durationMinutes: 15, weight: 15, isBonus: false, questionWeighting: { mode: "equal" } },
    SQL: { enabled: true, durationMinutes: 20, weight: 15, isBonus: false, questionWeighting: { mode: "equal" } },
    CODING: { enabled: true, durationMinutes: 30, weight: 20, isBonus: false, questionWeighting: { mode: "equal" } },
    DEBUGGING: { enabled: true, durationMinutes: 20, weight: 15, isBonus: false, questionWeighting: { mode: "equal" } },
    AI_PROMPTING: { enabled: true, durationMinutes: 15, weight: 10, isBonus: false, questionWeighting: { mode: "equal" }, questionSource: "AI_DYNAMIC" } as any,
    SIMULATION: { enabled: true, durationMinutes: 10, weight: 10, isBonus: false, questionWeighting: { mode: "equal" } },
    TEST_SCENARIOS: { enabled: true, durationMinutes: 15, weight: 15, isBonus: false, questionWeighting: { mode: "equal" } },
  });

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
  const [questionTierFilter, setQuestionTierFilter] = useState<string>("ALL");
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

      // Check if email already exists in current drive roster
      if (existingRosterEmails.has(email)) {
        errors.push(`Line ${idx + 1}: Candidate email "${email}" is ALREADY registered in this drive roster.`);
        return;
      }

      // Check if email is duplicated within the input file lines
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
        CODING: { enabled: true, durationMinutes: 30, weight: 25, isBonus: false, questionWeighting: { mode: "equal" } },
        DEBUGGING: { enabled: true, durationMinutes: 20, weight: 15, isBonus: false, questionWeighting: { mode: "equal" } },
        AI_PROMPTING: { enabled: true, durationMinutes: 15, weight: 10, isBonus: false, questionWeighting: { mode: "equal" }, questionSource: "AI_DYNAMIC" } as any,
        SIMULATION: { enabled: true, durationMinutes: 10, weight: 10, isBonus: false, questionWeighting: { mode: "equal" } },
      };

      let initialConfig = {
        ...defaultModules,
        ...(data.moduleConfig || {}),
      };

      if ((data.moduleConfig as any)?.proctoringConfig) {
        setProctoringConfig((data.moduleConfig as any).proctoringConfig);
      }
      
      // Auto-fit default module durations to time window on initial load if needed
      const confSum = Object.values(initialConfig).filter((m: any) => m.enabled).reduce((sum: number, m: any) => sum + (Number(m.durationMinutes) || 0), 0);
      if (confSum !== winMins) {
        initialConfig = autoAllocateModuleDurations(initialConfig, winMins);
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

  // Relative Module Time Complexity ratios for proportional split
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

    // If ALL enabled modules are fixed by admin, keep them untouched
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

  const handleAutoBalanceDurations = () => {
    const windowMins = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm);
    const enabledKeys = Object.keys(moduleConfig).filter((k) => moduleConfig[k]?.enabled);
    if (enabledKeys.length === 0) return;

    const fixedKeys = enabledKeys.filter((k) => moduleConfig[k]?.isFixed);
    const unfixedKeys = enabledKeys.filter((k) => !moduleConfig[k]?.isFixed);

    if (unfixedKeys.length === 0) {
      const totalFixedMins = fixedKeys.reduce(
        (sum, k) => sum + (Number(moduleConfig[k]?.durationMinutes) || 0),
        0
      );

      if (totalFixedMins === windowMins) {
        toast.success(`All module durations are manually fixed and match the total scheduled window (${windowMins} mins)!`);
      } else {
        toast.error(
          `All enabled modules are manually fixed, but cumulative time (${totalFixedMins} mins) does not equal the selected time range (${windowMins} mins). Total is ${totalFixedMins} mins vs ${windowMins} mins.`
        );
      }
      return;
    }

    const reallocated = autoAllocateModuleDurations(moduleConfig, windowMins);
    setModuleConfig(reallocated);
    toast.success("Module durations auto-balanced (preserving manually set module times)!");
  };

  // Total Weight Validation Result
  const weightValidation = useMemo(() => {
    return validateDriveModuleWeights(moduleConfig);
  }, [moduleConfig]);

  // Auto-Balance Weights tool ( Ceil: 100 ) - Only balances enabled Core module weights!
  const handleAutoBalanceWeights = () => {
    const coreKeys = Object.keys(moduleConfig).filter(
      (k) => moduleConfig[k].enabled && !moduleConfig[k].isBonus
    );
    if (coreKeys.length === 0) {
      toast.error("No enabled Core modules found to auto-balance.");
      return;
    }

    const equalWeight = Math.floor(100 / coreKeys.length);
    const remainder = 100 - equalWeight * coreKeys.length;

    const updated = { ...moduleConfig };
    coreKeys.forEach((k, idx) => {
      updated[k] = {
        ...updated[k],
        weight: equalWeight + (idx === 0 ? remainder : 0),
      };
    });

    setModuleConfig(updated);
    toast.success("Core scoring weights auto-balanced to sum to 100 points!");
  };

  // Schedule & DateTime Edge Case Validations
  const validateDateTimeConfig = (): { valid: boolean; error?: string } => {
    if (!startDate) {
      return { valid: false, error: "Please select a schedule date on the calendar." };
    }
    const startIso = amPmToIso(startDate, startHour, startMinute, startAmPm);
    const endIso = amPmToIso(endDate || startDate, endHour, endMinute, endAmPm);

    if (!startIso || !endIso) {
      return { valid: false, error: "Invalid date or time selection." };
    }

    const startDateObj = new Date(startIso);
    const endDateObj = new Date(endIso);
    const now = new Date();

    if (startDateObj < now) {
      return {
        valid: false,
        error: "Schedule start date & time cannot be in the past. Please select a valid future date and time.",
      };
    }

    if (endDateObj <= startDateObj) {
      return {
        valid: false,
        error: "Schedule end time must be strictly after the start time.",
      };
    }

    return { valid: true };
  };

  const isScheduleDateValid = useMemo(() => {
    return validateDateTimeConfig().valid;
  }, [startDate, endDate, startHour, startMinute, startAmPm, endHour, endMinute, endAmPm]);

  const hasQuestionsSelected = useMemo(() => {
    return assignedQuestions.length > 0;
  }, [assignedQuestions]);

  const hasCandidatesSelected = useMemo(() => {
    return (drive?.roster?.length || 0) > 0;
  }, [drive]);

  const isScheduleUnlocked = useMemo(() => {
    return isScheduleDateValid && hasQuestionsSelected && hasCandidatesSelected;
  }, [isScheduleDateValid, hasQuestionsSelected, hasCandidatesSelected]);

  const validateCumulativeDuration = (): boolean => {
    const windowMins = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm);
    const cumulativeMins = Object.values(moduleConfig)
      .filter((m) => m.enabled)
      .reduce((sum, m) => sum + (Number(m.durationMinutes) || 0), 0);

    if (cumulativeMins > windowMins) {
      toast.error(
        `Total module durations (${cumulativeMins} mins) exceed the scheduled test window (${windowMins} mins). Please adjust module durations or extend the schedule window.`
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

    const enabledMods = Object.values(moduleConfig).filter((m) => m.enabled);
    if (enabledMods.length === 0) {
      toast.error("At least one assessment module must be enabled.");
      return;
    }

    const weightVal = validateDriveModuleWeights(moduleConfig);
    if (!weightVal.valid) {
      toast.error(weightVal.error || "Invalid module score weights configuration.");
      return;
    }

    if (!validateCumulativeDuration()) {
      return;
    }

    try {
      const startIso = amPmToIso(startDate, startHour, startMinute, startAmPm);
      const endIso = amPmToIso(endDate || startDate, endHour, endMinute, endAmPm);

      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: editName,
          scheduleStart: startIso,
          scheduleEnd: endIso,
          status: editStatus,
          moduleConfig: { ...moduleConfig, proctoringConfig },
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
    if (activeTab === "configuration" && targetTab !== "configuration") {
      if (!validateCumulativeDuration()) {
        return;
      }
    }
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

  // Infer target department for this drive
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
    // Default to SOFTWARE_ENGINEERING / SDE
    return "SOFTWARE_ENGINEERING";
  }, [drive]);

  // Allowed Modules for this drive based on target department / RoleTemplate
  const allowedModules = useMemo(() => {
    return getDepartmentAllowedModules(driveTargetDept);
  }, [driveTargetDept]);

  // Filtered Questions Bank List (Filtered to target department/role and enabled modules)
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

      // Always include assigned questions so user can review/manage what's assigned
      const isAssigned = assignedQuestions.includes(q.id);

      if (!isAssigned) {
        // Enforce allowed modules restriction for this department
        const isDebuggingQuestion = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
        const effectiveModule = isDebuggingQuestion ? "DEBUGGING" : q.moduleType;
        if (!allowedModules.includes(effectiveModule) && !allowedModules.includes(q.moduleType)) {
          return false;
        }

        // Department / Role matching check
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

        // If question belongs to a specific department, it MUST match the Drive's target department
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

      if (questionTierFilter !== "ALL") {
        const qTier = extractQuestionTier(q);
        if (qTier !== questionTierFilter) return false;
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
  }, [questionsBank, driveTargetDept, allowedModules, assignedQuestions, questionModuleFilter, questionDifficultyFilter, questionTierFilter, questionSearch, isAiPromptingDynamic]);

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
              
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-[12px] text-[#5B5B64]">
            <span>
              Role Template: <span className="font-semibold text-[#0B0B0D]">{(drive as any).roleTemplate?.roleName || drive.roleTemplateName}</span> (v{(drive as any).roleTemplate?.version || 1})
            </span>
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
            <span>•</span>
            <span>Total Roster: {drive.roster.length} candidates</span>
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

            {/* 7 Modules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {(
                [
                  { id: "MCQ", name: "Multiple Choice (MCQ)", icon: CheckCircle2, desc: "Evaluated deterministically" },
                  { id: "SQL", name: "SQL Queries", icon: Database, desc: "Evaluated via Judge0 DB" },
                  { id: "CODING", name: "Coding / DSA", icon: Code2, desc: "Evaluated via Judge0" },
                  { id: "DEBUGGING", name: "Debugging", icon: Bug, desc: "Evaluated via Judge0" },
                  { id: "AI_PROMPTING", name: "AI Prompting", icon: Bot, desc: "Evaluated via Groq/Cerebras" },
                  { id: "SIMULATION", name: "Contextual Simulation", icon: Play, desc: "On-call incident & ticket simulation evaluated via LLM" },
                  { id: "TEST_SCENARIOS", name: "Test Scenarios", icon: FileText, desc: "Role-specific scenario questions evaluated via structured criteria" },
                ] as const
              ).map((mod) => {
                const Icon = mod.icon;
                const conf = moduleConfig[mod.id] || { enabled: false, durationMinutes: 15, weight: 15, isBonus: false, isFixed: false };
                return (
                  <div
                    key={mod.id}
                    onClick={() => {
                      const isNowEnabled = !conf.enabled;
                      const nextConfig = {
                        ...moduleConfig,
                        [mod.id]: { ...conf, enabled: isNowEnabled },
                      };
                      const winMins = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm);
                      const reallocated = autoAllocateModuleDurations(nextConfig, winMins);
                      setModuleConfig(reallocated);
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
                                title="Time manually fixed. Click to unfix and auto-balance"
                                className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 flex items-center gap-0.5 cursor-pointer hover:bg-amber-100"
                              >
                                <Lock size={10} /> Fixed
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
                              setModuleConfig({
                                ...moduleConfig,
                                [mod.id]: { ...conf, weight: val },
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

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
                {allowedModules.map((modKey) => {
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
                      <span>{MODULE_LABEL_MAP[modKey] || modKey}</span>
                    </button>
                  );
                })}
              </div>

              {/* Complexity / Difficulty & Tier Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
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

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-[#5B5B64] uppercase tracking-wider hidden sm:inline">Tier:</span>
                  <div className="flex items-center bg-white p-0.5 rounded-md border border-[#E6E6EA]">
                    {[
                      { id: "ALL", label: "All" },
                      { id: "TIER_1", label: "Tier 1" },
                      { id: "TIER_2", label: "Tier 2" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setQuestionTierFilter(t.id)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                          questionTierFilter === t.id
                            ? t.id === "TIER_1"
                              ? "bg-indigo-100 text-indigo-900 font-bold"
                              : t.id === "TIER_2"
                              ? "bg-purple-100 text-purple-900 font-bold"
                              : "bg-[#2F5CFF] text-white font-bold"
                            : "text-[#5B5B64] hover:text-[#0B0B0D]"
                        }`}
                      >
                        {t.label}
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
                  const qTier = extractQuestionTier(q);
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

                            <span
                              className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.2 rounded ${
                                qTier === "TIER_2"
                                  ? "bg-purple-50 text-purple-700 border border-purple-200"
                                  : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                              }`}
                            >
                              {qTier === "TIER_2" ? "TIER 2" : "TIER 1"}
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
                        {isQuestionsEditable ? (
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
                        ) : (
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
                  <div className="p-3 bg-[#EEF2FF] border border-[#C5D5FF] text-[#1E293B] text-[13px] rounded-md leading-relaxed">
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
      {/* Bulk Import Candidates Modal matching Image 1 & 2 */}
      {showBulkImportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[580px] shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header matching Image 2 */}
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

            {/* Modal Body matching Image 1 & 2 */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Section 1: Manual Paste Entry */}
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

              {/* Section 2: Drag & Drop CSV File Dropzone matching Image 1 */}
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

              {/* Error messages list */}
              {bulkCandidateErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
                  <span className="text-[12px] font-semibold text-red-700 block">Formatting Errors Detected:</span>
                  {bulkCandidateErrors.map((err, idx) => (
                    <p key={idx} className="text-[11px] text-red-600 font-mono">• {err}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer matching Image 1 & 2 */}
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
    </AppShell>
  );
}
