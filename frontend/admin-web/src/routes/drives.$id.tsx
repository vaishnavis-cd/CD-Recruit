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
  ChevronDown,
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
  Link2,
  Layers,
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

function FigmaMcqIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path d="M2.25 3.74939H2.2575M2.25 8.99999H2.2575M2.25 14.2506H2.2575M6 3.74939H15.75M6 8.99999H15.75M6 14.2506H15.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FigmaSqlIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path d="M15.75 3.74957C15.75 4.99231 12.7279 5.99975 9 5.99975C5.27208 5.99975 2.25 4.99231 2.25 3.74957M15.75 3.74957C15.75 2.50683 12.7279 1.49939 9 1.49939C5.27208 1.49939 2.25 2.50683 2.25 3.74957M15.75 3.74957V14.2504C15.75 14.8472 15.0388 15.4195 13.773 15.8415C12.5071 16.2635 10.7902 16.5006 9 16.5006C7.20979 16.5006 5.4929 16.2635 4.22703 15.8415C2.96116 15.4195 2.25 14.8472 2.25 14.2504V3.74957M2.25 8.99999C2.25 9.59677 2.96116 10.1691 4.22703 10.5911C5.4929 11.0131 7.20979 11.2502 9 11.2502C10.7902 11.2502 12.5071 11.0131 13.773 10.5911C15.0388 10.1691 15.75 9.59677 15.75 8.99999" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FigmaCodingDsaIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path d="M9.00038 14.2506H14.9998M3.00098 12.7504L7.50053 8.2499L3.00098 3.74939" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FigmaDebuggingIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path d="M10.81 5.25039C10.81 5.05407 10.887 4.86559 11.0244 4.72539L13.3546 2.39664C13.5954 2.15514 13.5189 1.74864 13.1904 1.65864C12.3662 1.43204 11.4946 1.44484 10.6774 1.69556C9.86029 1.94627 9.13145 2.42452 8.57619 3.07435C8.02094 3.72418 7.66224 4.5187 7.54207 5.36495C7.4219 6.2112 7.54523 7.07417 7.89762 7.85289L1.96512 13.7854C1.66676 14.0837 1.49909 14.4882 1.49902 14.9101C1.49895 15.332 1.66648 15.7366 1.96475 16.035C2.26302 16.3334 2.6676 16.501 3.08948 16.5011C3.51137 16.5012 3.916 16.3337 4.21437 16.0354L10.1469 10.1029C10.9256 10.4553 11.7886 10.5786 12.6348 10.4584C13.4811 10.3383 14.2756 9.97957 14.9254 9.42432C15.5752 8.86907 16.0535 8.14023 16.3042 7.32308C16.5549 6.50594 16.5677 5.63429 16.3411 4.81014C16.2511 4.48164 15.8439 4.40514 15.6039 4.64664L13.2744 6.97539C13.1342 7.11281 12.9457 7.18978 12.7494 7.18978C12.5531 7.18978 12.3646 7.11281 12.2244 6.97539L11.0244 5.77539C10.887 5.63519 10.81 5.4467 10.81 5.25039Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FigmaAiPromptingIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path d="M8.99962 15.0005V16.5006M8.99962 1.49939V2.99951M12.7499 15.0005V16.5006M12.7499 1.49939V2.99951M1.49902 8.99999H2.99914M1.49902 12.7503H2.99914M1.49902 5.24969H2.99914M15.0001 8.99999H16.5002M15.0001 12.7503H16.5002M15.0001 5.24969H16.5002M5.24932 15.0005V16.5006M5.24932 1.49939V2.99951M4.49926 2.99951H13.5C14.3285 2.99951 15.0001 3.67114 15.0001 4.49963V13.5003C15.0001 14.3288 14.3285 15.0005 13.5 15.0005H4.49926C3.67077 15.0005 2.99914 14.3288 2.99914 13.5003V4.49963C2.99914 3.67114 3.67077 2.99951 4.49926 2.99951ZM6.74944 5.99975H11.2498C11.664 5.99975 11.9999 6.33556 11.9999 6.74981V11.2502C11.9999 11.6644 11.664 12.0002 11.2498 12.0002H6.74944C6.3352 12.0002 5.99938 11.6644 5.99938 11.2502V6.74981C5.99938 6.33556 6.3352 5.99975 6.74944 5.99975Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FigmaContextualSimulationIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path d="M16.5002 8.99999H14.6401C14.3123 8.99929 13.9933 9.10598 13.7318 9.30374C13.4704 9.5015 13.281 9.77945 13.1925 10.0951L11.4298 16.3656C11.4185 16.4045 11.3948 16.4387 11.3623 16.4631C11.3299 16.4874 11.2904 16.5006 11.2498 16.5006C11.2092 16.5006 11.1698 16.4874 11.1373 16.4631C11.1048 16.4387 11.0811 16.4045 11.0698 16.3656L6.92946 1.6344C6.9181 1.59545 6.89441 1.56124 6.86195 1.53689C6.82949 1.51255 6.79002 1.49939 6.74944 1.49939C6.70887 1.49939 6.66939 1.51255 6.63693 1.53689C6.60448 1.56124 6.58079 1.59545 6.56943 1.6344L4.80679 7.9049C4.71863 8.21929 4.5303 8.49634 4.27039 8.69397C4.01048 8.89161 3.69319 8.99905 3.36667 8.99999H1.49902" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FigmaDriveConfigTabIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className}>
      <path d="M8.16673 9.91638H2.91726M8.16673 9.91638C8.16673 10.8828 8.95016 11.6662 9.91656 11.6662C10.883 11.6662 11.6664 10.8828 11.6664 9.91638C11.6664 8.94997 10.883 8.16655 9.91656 8.16655C8.95016 8.16655 8.16673 8.94997 8.16673 9.91638ZM11.0831 4.08363H5.83363M5.83363 4.08363C5.83363 5.05003 5.05021 5.83345 4.08381 5.83345C3.11741 5.83345 2.33398 5.05003 2.33398 4.08363C2.33398 3.11722 3.11741 2.3338 4.08381 2.3338C5.05021 2.3338 5.83363 3.11722 5.83363 4.08363Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FigmaBackArrowIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className}>
      <path d="M6.99982 2.9162L2.91602 7L6.99982 11.0838M2.91602 7H11.0836" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FigmaEnforceFullscreenIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M2.5 6V4C2.5 3.17157 3.17157 2.5 4 2.5H6M10 2.5H12C12.8284 2.5 13.5 3.17157 13.5 4V6M2.5 10V12C2.5 12.8284 3.17157 13.5 4 13.5H6M10 13.5H12C12.8284 13.5 13.5 12.8284 13.5 12V10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
  const [showStatusDropdown, setShowStatusDropdown] = useState<boolean>(false);

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
      } catch { }
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
        if (!enabledKeys.includes(mod as any)) continue;
        const d = distMap[mod as keyof typeof distMap];
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
          if (!enabledKeys.includes(mod as any)) continue;
          const d = distMap[mod as keyof typeof distMap];
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

  const questionDeficits = useMemo(() => {
    const { summaryData } = driveEvaluationSummary;
    const deficits: { modId: string; label: string; reqCount: number; currentCount: number; missing: number }[] = [];
    if (summaryData.length === 0) return deficits;

    for (const m of summaryData) {
      const poolQuestions = (questionsBank || []).filter((q) => {
        const isDebug = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
        const displayMod = isDebug ? "DEBUGGING" : q.moduleType;
        return assignedQuestions.includes(q.id) && displayMod === m.modId;
      });
      if (poolQuestions.length < m.count) {
        deficits.push({
          modId: m.modId,
          label: MODULE_LABEL_MAP[m.modId] || m.modId,
          reqCount: m.count,
          currentCount: poolQuestions.length,
          missing: m.count - poolQuestions.length,
        });
      }
    }
    return deficits;
  }, [driveEvaluationSummary, assignedQuestions, questionsBank]);

  const areQuestionsFullyAssigned = useMemo(() => {
    return questionDeficits.length === 0 && assignedQuestions.length > 0;
  }, [questionDeficits, assignedQuestions]);

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

    try {
      await saveDriveQuestions(driveId, assignedQuestions);
      setSavedAssignedQuestions([...assignedQuestions]);
      if (questionDeficits.length > 0) {
        toast.info(
          `Assigned questions saved (Draft). Note: ${questionDeficits.length} module(s) need more questions before links can be generated.`
        );
      } else {
        toast.success("Assigned questions saved!");
      }
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
      if (questionDeficits.length > 0) {
        toast.info(
          `Assigned questions saved (Draft). Note: ${questionDeficits.length} module(s) need more questions before links can be generated.`
        );
      } else {
        toast.success("Assigned questions saved! Moving to Candidate Roster...");
      }
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
    if (questionDeficits.length > 0) {
      const deficitDetails = questionDeficits.map((d) => `${d.label} (${d.currentCount}/${d.reqCount})`).join(", ");
      toast.error(`Cannot generate links: Please assign all required questions for ${deficitDetails}.`);
      setActiveTab("questions");
      setConfirmGenerateLinks(false);
      return;
    }
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
    const enabled = Object.keys(moduleConfig || {}).filter((k) => moduleConfig[k]?.enabled);
    const deptAllowed = getDepartmentAllowedModules(driveTargetDept);
    return Array.from(new Set([...enabled, ...deptAllowed]));
  }, [moduleConfig, driveTargetDept]);

  const filteredQuestionsList = useMemo(() => {
    return questionsBank.filter((q) => {
      if (q.status === "ARCHIVED") return false;

      const isDebuggingQuestion = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));

      // Module Filter
      if (questionModuleFilter !== "ALL") {
        if (questionModuleFilter === "DEBUGGING") {
          if (!isDebuggingQuestion) return false;
        } else if (questionModuleFilter === "CODING") {
          if (q.moduleType !== "CODING" || isDebuggingQuestion) return false;
        } else {
          if (q.moduleType !== questionModuleFilter) return false;
        }
      }

      // Difficulty Filter
      if (questionDifficultyFilter !== "ALL") {
        const diff = (q.difficulty || "MEDIUM").toUpperCase();
        if (diff !== questionDifficultyFilter.toUpperCase()) return false;
      }

      // Search Query Filter
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
  }, [questionsBank, allowedModules, questionModuleFilter, questionDifficultyFilter, questionSearch]);

  if (loading || !drive) {
    return (
      <AppShell title="Drive Configuration">
        <div className="flex items-center justify-center py-20 text-ink-secondary">
          Loading drive configuration details...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell hideHeader={true}>
      <div className="w-full max-w-[1269px] min-h-[944px] flex flex-col mx-auto gap-6 pb-12">
        {/* TopBar (1269x102 inside 1317x142 region) */}
        <div className="w-full max-w-[1269px] pt-4 pb-4 border-b border-[#2E5DE01A] flex flex-col gap-2.5">
          {/* Breadcrumbs (78x15, gap 6px) */}
          <div className="flex items-center gap-1.5 text-[12px]">
            <Link
              to="/drives"
              className="text-[#6B7280] hover:text-[#2E5DE0] transition-colors"
              style={{ fontFamily: "Instrument Sans, sans-serif" }}
            >
              Drives
            </Link>
            <span className="text-[#6B7280]">/</span>
            <span
              className="font-semibold text-[#2E5DE0]"
              style={{ fontFamily: "Instrument Sans, sans-serif" }}
            >
              {formatDriveName(drive.name)}
            </span>
          </div>

          {/* Header Row: Title & Schedule Button */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Left: Back Arrow + Big Drive Title */}
            <div className="flex items-center gap-3">
              <Link
                to="/drives"
                className="w-[24px] h-[24px] rounded-full border border-[#A4BCFF] bg-white flex items-center justify-center text-[#2E5DE0] hover:bg-blue-50 transition-colors shadow-xs shrink-0 cursor-pointer"
                title="Back to Drives"
              >
                <FigmaBackArrowIcon size={14} className="text-[#2E5DE0]" />
              </Link>
              <h1
                className="text-[32px] sm:text-[40px] font-bold text-[#1E1B4B] leading-none tracking-tight"
                style={{ fontFamily: "Instrument Sans, sans-serif" }}
              >
                {formatDriveName(drive.name)}
              </h1>
            </div>

            {/* Right: Schedule & Generate Links Button (222x34, rounded-24px, linear-gradient, shadow) */}
            <button
              onClick={() => {
                if (isScheduleUnlocked) {
                  setConfirmGenerateLinks(true);
                } else {
                  const reasons: string[] = [];
                  if (!isScheduleDateValid) reasons.push("valid future date & time");
                  if (!hasCandidatesSelected) reasons.push("at least 1 candidate roster item");
                  if (!weightValidation.valid) reasons.push("module weights must total 100%");
                  if (driveEvaluationSummary.isOverTime) reasons.push("estimated duration within schedule window");
                  if (questionDeficits.length > 0) {
                    const deficitDetails = questionDeficits.map((d) => `${d.label} (${d.currentCount}/${d.reqCount})`).join(", ");
                    reasons.push(`assign all required questions (${deficitDetails})`);
                  } else if (!hasQuestionsSelected) {
                    reasons.push("at least 1 question assigned");
                  }
                  toast.error(`Drive scheduling locked. Requirements needed: ${reasons.join("; ")}.`);
                }
              }}
              disabled={generating}
              className="w-auto sm:w-[222px] h-[34px] px-[18px] py-[9px] gap-[7px] text-white text-[13px] font-bold rounded-[24px] flex items-center justify-center cursor-pointer transition-all shrink-0 hover:opacity-95 active:scale-[0.98]"
              style={{
                width: "222px",
                height: "34px",
                paddingTop: "9px",
                paddingBottom: "9px",
                paddingLeft: "18px",
                paddingRight: "18px",
                gap: "7px",
                borderRadius: "24px",
                background: "linear-gradient(135deg, #3A91ED 0%, #2E5DE0 100%)",
                boxShadow: "0px 4px 14px 0px #2E5DE0BF",
                fontFamily: "Instrument Sans, sans-serif",
                opacity: 1,
              }}
            >
              <Link2 size={13} className="shrink-0 text-white" />
              <span className="text-white font-bold text-[13px] leading-none whitespace-nowrap">Schedule &amp; Generate Links</span>
            </button>
          </div>

          {/* Details Subtitle: Role Template, Direct Origin, Active */}
          <div className="flex items-center gap-2.5 flex-wrap text-[13px]" style={{ fontFamily: "Instrument Sans, sans-serif" }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[#6B7280]">Role Template:</span>
              <span className="font-semibold text-[#1E1B4B]">
                {(drive as any).roleTemplate?.roleName || drive.roleTemplateName}
              </span>
              <span className="text-[#6B7280]">
                (v{(drive as any).roleTemplate?.version || 1})
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedTemplateForDrive((drive as any).roleTemplateId || "");
                  fetchRoleTemplates();
                  setShowSelectTemplateModal(true);
                }}
                className="px-2 py-0.5 text-xs font-medium text-[#2E5DE0] bg-blue-50 hover:bg-blue-100 rounded transition-colors cursor-pointer border border-[#D5DAEC] flex items-center gap-1 ml-1"
                title="Select or apply Role Template to this drive"
              >
                <Sparkles size={11} /> Select / Change Template
              </button>
            </div>
            <span className="text-[#9CA3AF]">·</span>
            <div className="px-2 py-0.5 rounded-[8px] bg-[#F3F4F6] inline-flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                {(drive as any).originChannel === "PARTNER_API" ? "PARTNER API" : "DIRECT ORIGIN"}
              </span>
            </div>
            <span className="text-[#9CA3AF]">·</span>
            <div className="relative inline-flex items-center">
              <button
                type="button"
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className={`
                  h-[24px] px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all border outline-none
                  ${drive.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : ''}
                  ${drive.status === 'SCHEDULED' ? 'bg-blue-50 text-blue-700 border-blue-300' : ''}
                  ${drive.status === 'DRAFT' ? 'bg-amber-50 text-amber-700 border-amber-300' : ''}
                  ${drive.status === 'CLOSED' ? 'bg-rose-50 text-rose-700 border-rose-300' : ''}
                `}
                title="Click to change Drive Status"
              >
                <span>{drive.status}</span>
                <ChevronDown size={11} className="shrink-0 opacity-75" />
              </button>

              {showStatusDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStatusDropdown(false)} />
                  <div className="absolute top-full left-0 mt-1.5 w-[140px] bg-white border border-[#E9EEFE] shadow-[0px_10px_30px_0px_rgba(0,0,0,0.12)] rounded-[12px] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-0.5">
                    {[
                      { id: "DRAFT", label: "DRAFT", badge: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
                      { id: "SCHEDULED", label: "SCHEDULED", badge: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
                      { id: "ACTIVE", label: "ACTIVE", badge: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
                      { id: "CLOSED", label: "CLOSED", badge: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setShowStatusDropdown(false);
                          handleStatusChange(item.id);
                        }}
                        className={`w-full px-2.5 py-1.5 text-[11px] font-bold rounded-[8px] flex items-center justify-between transition-colors cursor-pointer text-[#1E1B4B] hover:bg-[#F8FAFC]`}
                      >
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] ${item.badge}`}>
                          {item.label}
                        </span>
                        {drive.status === item.id && <Check size={13} className="shrink-0 text-[#2E5DE0]" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* DriveInfoCard / Tab Navigation Bar (1269x65, py-12px, border-b 1px solid #2E5DE01A) */}
        <div className="w-full max-w-[1269px] py-2 border-b border-[#2E5DE01A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Tab 1: Drive Configuration */}
            <button
              onClick={() => handleTabSwitch("configuration")}
              className={`h-[32px] px-4 py-2 gap-2 text-[13px] flex items-center transition-colors cursor-pointer ${activeTab === "configuration"
                ? "rounded-[16px] border border-[#2E5DE0] bg-white text-[#2E5DE0] font-semibold shadow-xs"
                : "rounded-full border border-[#E9EEFE] bg-white text-[#6B7280] hover:text-[#1E1B4B] hover:border-[#D5DAEC] font-medium"
                }`}
              style={{ fontFamily: "Instrument Sans, sans-serif" }}
            >
              <FigmaDriveConfigTabIcon size={14} className="shrink-0" />
              <span>Drive Configuration</span>
            </button>

            {/* Tab 2: Questions */}
            <button
              onClick={() => handleTabSwitch("questions")}
              className={`h-[32px] px-4 py-2 gap-2 text-[13px] flex items-center transition-colors cursor-pointer ${activeTab === "questions"
                ? "rounded-[16px] border border-[#2E5DE0] bg-white text-[#2E5DE0] font-semibold shadow-xs"
                : "rounded-full border border-[#E9EEFE] bg-white text-[#6B7280] hover:text-[#1E1B4B] hover:border-[#D5DAEC] font-medium"
                }`}
              style={{ fontFamily: "Instrument Sans, sans-serif" }}
            >
              <FileText size={14} className="shrink-0" />
              <span>Questions ({assignedQuestions.length})</span>
            </button>

            {/* Tab 3: Candidates */}
            <button
              onClick={() => handleTabSwitch("roster")}
              className={`h-[32px] px-4 py-2 gap-2 text-[13px] flex items-center transition-colors cursor-pointer ${activeTab === "roster"
                ? "rounded-[16px] border border-[#2E5DE0] bg-white text-[#2E5DE0] font-semibold shadow-xs"
                : "rounded-full border border-[#E9EEFE] bg-white text-[#6B7280] hover:text-[#1E1B4B] hover:border-[#D5DAEC] font-medium"
                }`}
              style={{ fontFamily: "Instrument Sans, sans-serif" }}
            >
              <User size={14} className="shrink-0" />
              <span>Candidates ({drive.roster.length})</span>
            </button>
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
            <div
              className="w-full max-w-[1263px] bg-white rounded-[16px] p-6 shadow-[-4px_4px_15px_0px_rgba(156,163,175,0.2)] border border-[#E9EEFE] space-y-5"
              style={{ fontFamily: "Instrument Sans, sans-serif" }}
            >
              {/* Header row: title and actions */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E9EEFE] pb-4">
                <div className="flex items-center gap-2.5">
                  <Layers size={18} className="text-[#2E5DE0]" />
                  <h3 className="text-[16px] font-bold text-[#1E1B4B] leading-none">
                    Module Selection &amp; 100-Point Scoring Ceiling
                  </h3>
                </div>

                {/* Action Buttons & Total Weight Badge */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Weight Badge (176x27) */}
                  <span
                    className={`h-[27px] px-[12px] py-[6px] rounded-[14px] text-[12px] font-bold inline-flex items-center justify-center ${weightValidation.valid
                      ? "bg-[#D1FAE5] text-[#065F46]"
                      : "bg-rose-50 text-rose-700 border border-red-200"
                      }`}
                  >
                    Total Weight: {weightValidation.coreSum} / 100 pts
                  </span>

                  {/* Auto-Align Assessment (Kept as requested) */}
                  <button
                    type="button"
                    onClick={handleAutoAlignAssessment}
                    className="h-[27px] px-[12px] py-[6px] text-[12px] font-bold text-white bg-gradient-to-r from-[#3A91ED] to-[#2E5DE0] hover:opacity-95 rounded-[14px] shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                    title="One-click automatic alignment of weights, required question counts, difficulty distributions, and timings to fit session window"
                  >
                    <Sparkles size={12} className="text-amber-300" />
                    <span>Auto-Align Assessment</span>
                  </button>

                  {/* Auto-Balance Time (151x27) */}
                  <button
                    type="button"
                    onClick={handleAutoBalanceDurations}
                    className="h-[27px] px-[12px] py-[6px] text-[12px] font-bold text-[#2E5DE0] bg-[#2E5DE014] hover:bg-[#2E5DE024] rounded-[14px] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    title="Auto-balance module durations (preserves manually changed times)"
                  >
                    <Clock size={12} />
                    <span>Auto-Balance Time</span>
                  </button>

                  {/* Auto-Balance Weights (152x27) */}
                  <button
                    type="button"
                    onClick={handleAutoBalanceWeights}
                    className="h-[27px] px-[12px] py-[6px] text-[12px] font-bold text-[#2E5DE0] bg-[#2E5DE014] hover:bg-[#2E5DE024] rounded-[14px] transition-colors cursor-pointer inline-flex items-center"
                  >
                    <span>Auto-Balance Weights</span>
                  </button>
                </div>
              </div>

              {/* Module Cards Grid (1221x409 region, gap 16px) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                {(
                  [
                    { id: "MCQ", name: "Multiple Choice (MCQ)", icon: FigmaMcqIcon, desc: "Evaluated deterministically" },
                    { id: "SQL", name: "SQL Queries", icon: FigmaSqlIcon, desc: "Evaluated via Judge0 DB" },
                    { id: "NOSQL", name: "NoSQL Queries", icon: FigmaSqlIcon, desc: "Evaluated via isolated MongoDB sandbox" },
                    { id: "CODING", name: "Coding / DSA", icon: FigmaCodingDsaIcon, desc: "Evaluated via Judge0" },
                    { id: "DEBUGGING", name: "Debugging", icon: FigmaDebuggingIcon, desc: "Evaluated via Judge0" },
                    { id: "AI_PROMPTING", name: "AI Prompting", icon: FigmaAiPromptingIcon, desc: "Evaluated via Groq/Cerebras" },
                    { id: "SIMULATION", name: "Contextual Simulation", icon: FigmaContextualSimulationIcon, desc: "On-call incident & ticket simulation evaluated via LLM" },
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
                      className={`rounded-[16px] border-[1.5px] p-5 space-y-3 transition-all select-none ${!isGloballyEnabled
                        ? "bg-[#F8FAFC] border-[#E9EEFE] opacity-40 cursor-not-allowed"
                        : conf.enabled
                          ? "bg-white border-[#2E5DE0] shadow-xs cursor-pointer"
                          : "bg-[#F8FAFC]/60 border-[#E9EEFE] opacity-80 hover:border-[#D5DAEC] cursor-pointer"
                        }`}
                    >
                      {/* Card Header (356.33 x 18) */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-[15px] text-[#1E1B4B]">
                          <Icon size={16} className={conf.enabled && isGloballyEnabled ? "text-[#2E5DE0]" : "text-[#6B7280]"} />
                          <span>{mod.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!isGloballyEnabled && (
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                              Disabled in Settings
                            </span>
                          )}
                          <input
                            type="checkbox"
                            checked={conf.enabled && isGloballyEnabled}
                            disabled={!isGloballyEnabled}
                            onChange={() => { }}
                            className="w-4 h-4 text-[#2E5DE0] rounded cursor-pointer pointer-events-none disabled:opacity-40 accent-[#2E5DE0]"
                          />
                        </div>
                      </div>
                      <p className="text-[12px] text-[#6B7280] leading-snug">{mod.desc}</p>

                      {conf.enabled && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="space-y-3 pt-2 border-t border-[#E9EEFE] text-xs"
                        >
                          {/* Duration & Weight Inputs Row (356.33 x 57) */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[12px] font-semibold text-[#1E1B4B]">Duration (min)</label>
                                {conf.isFixed && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setModuleConfig({
                                        ...moduleConfig,
                                        [mod.id]: { ...conf, isFixed: false },
                                      });
                                    }}
                                    className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded-full font-bold cursor-pointer"
                                    title="Click to unlock auto-adjustment"
                                  >
                                    🔒 FIXED
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
                                className={`w-full h-[36px] px-3 rounded-[18px] border font-mono font-bold text-[14px] text-[#1E1B4B] focus:outline-none focus:border-[#2E5DE0] ${conf.isFixed ? "border-[#D97706] bg-amber-50/20" : "border-[#E9EEFE] bg-white"
                                  }`}
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-[12px] font-semibold text-[#1E1B4B]">
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
                                  } as any);
                                }}
                                onFocus={(e) => e.target.select()}
                                className="w-full h-[36px] px-3 rounded-[18px] border border-[#E9EEFE] bg-white font-mono font-bold text-[14px] text-[#1E1B4B] focus:outline-none focus:border-[#2E5DE0]"
                              />
                            </div>
                          </div>

                          {mod.id === "AI_PROMPTING" && (
                            <div className="pt-2 border-t border-[#E9EEFE] space-y-1">
                              <label className="block text-[12px] font-semibold text-[#1E1B4B]">Question &amp; Validation Source</label>
                              <select
                                value={(conf as any).questionSource || "AI_DYNAMIC"}
                                onChange={(e) =>
                                  setModuleConfig({
                                    ...moduleConfig,
                                    [mod.id]: { ...(conf as any), questionSource: e.target.value } as any,
                                  })
                                }
                                className="w-full h-[36px] px-3 rounded-[18px] border border-[#E9EEFE] font-sans text-xs bg-white text-[#1E1B4B] outline-none cursor-pointer focus:border-[#2E5DE0]"
                              >
                                <option value="AI_DYNAMIC">AI-Generated Questions &amp; Autonomous AI Validation</option>
                                <option value="STATIC_BANK">Static Question Bank (Pre-authored Questions &amp; Rules)</option>
                              </select>
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
                              <div className="pt-2 border-t border-[#E9EEFE] space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-[#1E1B4B]">
                                    Difficulty Target (Required: {reqCount})
                                  </span>
                                  <span className="text-[11px] text-[#6B7280] font-medium font-mono">
                                    Est: {estDuration} min
                                  </span>
                                </div>
                                {distSum !== reqCount && (
                                  <div className="text-[11px] text-rose-600 font-bold">
                                    ⚠ Difficulty counts must total {reqCount} (Current: {distSum})
                                  </div>
                                )}
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="block text-[10px] text-emerald-700 font-bold mb-0.5 uppercase tracking-wide">Easy</label>
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
                                      className="w-full h-[30px] px-2 rounded-[14px] border border-[#E9EEFE] font-mono font-bold text-xs text-[#1E1B4B] focus:outline-none focus:border-[#2E5DE0]"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-amber-700 font-bold mb-0.5 uppercase tracking-wide">Medium</label>
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
                                      className="w-full h-[30px] px-2 rounded-[14px] border border-[#E9EEFE] font-mono font-bold text-xs text-[#1E1B4B] focus:outline-none focus:border-[#2E5DE0]"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-rose-700 font-bold mb-0.5 uppercase tracking-wide">Hard</label>
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
                                      className="w-full h-[30px] px-2 rounded-[14px] border border-[#E9EEFE] font-mono font-bold text-xs text-[#1E1B4B] focus:outline-none focus:border-[#2E5DE0]"
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
                <div
                  className="w-full max-w-[1263px] bg-white rounded-[16px] p-6 shadow-[-4px_4px_15px_0px_rgba(156,163,175,0.2)] border border-[#E9EEFE] space-y-4"
                  style={{ fontFamily: "Instrument Sans, sans-serif" }}
                >
                  <div className="flex items-center gap-2.5 border-b border-[#E9EEFE] pb-3">
                    <Settings size={18} className="text-[#2E5DE0]" />
                    <div>
                      <h3 className="text-[16px] font-bold text-[#1E1B4B] leading-none">Assessment Composition Summary (Time-Aware)</h3>
                      <p className="text-[12px] text-[#6B7280] mt-1">Estimated question counts, difficulty mix, and expected candidate duration based on module benchmarks.</p>
                    </div>
                  </div>

                  <div className="border border-[#E9EEFE] rounded-[14px] overflow-hidden shadow-xs bg-white text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F8FAFC] border-b border-[#E9EEFE] font-mono text-[11px] uppercase tracking-wide font-bold text-[#6B7280]">
                          <th className="px-4 py-2.5">Module</th>
                          <th className="px-4 py-2.5 text-center">Weight</th>
                          <th className="px-4 py-2.5 text-center">Marks</th>
                          <th className="px-4 py-2.5 text-center">Required Questions</th>
                          <th className="px-4 py-2.5 text-center">Difficulty Mix</th>
                          <th className="px-4 py-2.5 text-right">Estimated Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E9EEFE] font-mono text-xs">
                        {summaryData.map((m) => (
                          <tr key={m.modId} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 font-bold text-[#1E1B4B]">{m.modId}</td>
                            <td className="px-4 py-3 text-center text-[#2E5DE0] font-bold">{m.weight}%</td>
                            <td className="px-4 py-3 text-center text-[#1E1B4B]">{m.marks} marks</td>
                            <td className="px-4 py-3 text-center text-[#1E1B4B] font-bold">{m.count} questions</td>
                            <td className="px-4 py-3 text-center text-[#6B7280]">
                              <span className="text-emerald-700 font-bold">{m.dist.easy}E</span> / <span className="text-amber-700 font-bold">{m.dist.medium}M</span> / <span className="text-rose-700 font-bold">{m.dist.hard}H</span>
                            </td>
                            <td className="px-4 py-3 text-right text-[#6B7280] font-bold">{m.estTime} min</td>
                          </tr>
                        ))}
                        <tr className="bg-[#F8FAFC] font-bold border-t border-[#E9EEFE]">
                          <td className="px-4 py-3 text-[#1E1B4B]">Total Summary</td>
                          <td className="px-4 py-3 text-center text-[#2E5DE0]">{totalWeight}%</td>
                          <td className="px-4 py-3 text-center text-[#1E1B4B]">{totalMarks} marks</td>
                          <td className="px-4 py-3 text-center text-[#1E1B4B]">{totalQuestions} questions</td>
                          <td className="px-4 py-3 text-center text-[#6B7280]">—</td>
                          <td className="px-4 py-3 text-right text-[#1E1B4B]">
                            <span className={isOverTime ? "text-rose-600 font-bold" : "text-[#1E1B4B]"}>
                              {totalEstTime} min
                            </span>{" "}
                            <span className="text-[11px] text-[#6B7280] font-normal">(out of {totalDuration} min)</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Status Banners */}
                  {isOverTime ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-[12px] text-xs text-rose-900">
                      <div className="flex items-start gap-2.5 max-w-2xl">
                        <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">
                            ⚠ Estimated assessment time exceeds the configured {totalDuration}-minute limit by {overflowMinutes} minutes.
                          </p>
                          <p className="text-[12px] text-rose-700 mt-0.5">
                            The configuration cannot be saved or scheduled until the estimated duration fits within the {totalDuration}-minute window. Click Auto-Align to automatically optimize module difficulties and timings.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAutoAlignAssessment}
                        className="shrink-0 px-3.5 py-2 bg-[#2E5DE0] hover:bg-[#254ec4] text-white text-xs font-bold rounded-[10px] shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles size={14} className="text-amber-300" />
                        <span>Auto-Align to {totalDuration} min</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-[12px] text-xs text-emerald-800 font-medium">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>✓ Assessment configuration fits within the configured {totalDuration}-minute limit ({totalEstTime} min estimated).</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* SECTION 3: System Checks & Proctoring Customization */}
            <div
              className="w-full max-w-[1263px] bg-white rounded-[16px] p-6 shadow-[-4px_4px_15px_0px_rgba(156,163,175,0.2)] border border-[#E9EEFE] space-y-4"
              style={{ fontFamily: "Instrument Sans, sans-serif" }}
            >
              <div className="flex items-center gap-2.5 border-b border-[#E9EEFE] pb-3">
                <ShieldCheck size={20} className="text-[#2E5DE0]" />
                <div>
                  <h3 className="text-[16px] font-bold text-[#1E1B4B] leading-none">
                    System Checks &amp; Proctoring Customization
                  </h3>
                  <p className="text-[12px] text-[#6B7280] mt-1">
                    Enable or customize mandatory hardware, browser, and network checks for candidates.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {[
                  { id: "requireCamera", label: "Webcam & Video Feed Check", icon: Camera, desc: "Verify candidate camera hardware before assessment entry." },
                  { id: "requireMicrophone", label: "Microphone & Audio Detection Check", icon: Mic, desc: "Verify microphone access and monitor ambient sound." },
                  { id: "requireScreenShare", label: "Display & Monitor Validation", icon: Monitor, desc: "Check for secondary monitors and HDMI output displays." },
                  { id: "enforceFullscreen", label: "Enforce Fullscreen Mode", icon: FigmaEnforceFullscreenIcon, desc: "Require candidate browser window to remain in fullscreen." },
                  { id: "cpuMathBenchmark", label: "CPU Performance Benchmark", icon: Cpu, desc: "Run candidate hardware micro-benchmark before starting." },
                  { id: "allowMobileDevice", label: "Allow Mobile Web Candidates", icon: Smartphone, desc: "Permit assessment completion on mobile browsers." },
                ].map((item) => {
                  const Icon = item.icon;
                  const isChecked = Boolean(proctoringConfig[item.id as keyof typeof proctoringConfig]);
                  return (
                    <label
                      key={item.id}
                      className={`flex items-start gap-3.5 p-4 rounded-[16px] border-[1.5px] cursor-pointer transition-all select-none ${isChecked
                        ? "bg-white border-[#2E5DE0] shadow-xs"
                        : "bg-[#F8FAFC]/60 border-[#E9EEFE] opacity-80 hover:border-[#D5DAEC]"
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          setProctoringConfig({
                            ...proctoringConfig,
                            [item.id]: e.target.checked,
                          });
                        }}
                        className="mt-0.5 accent-[#2E5DE0] text-[#2E5DE0] rounded w-4 h-4 cursor-pointer"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-bold text-[14px] text-[#1E1B4B]">
                          <Icon size={16} className={isChecked ? "text-[#2E5DE0]" : "text-[#6B7280]"} />
                          <span>{item.label}</span>
                        </div>
                        <p className="text-[12px] text-[#6B7280] leading-snug">{item.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* BOTTOM ACTION BUTTON: + Save & Next (Aligned Right) */}
            <div className="w-full max-w-[1263px] flex justify-end pt-2 pb-6">
              <button
                type="button"
                onClick={handleSaveAndNext}
                className="h-[38px] px-6 py-2 rounded-full bg-[#2E5DE0] hover:bg-[#254ec4] text-white font-bold text-[14px] flex items-center gap-1.5 shadow-[0px_4px_14px_0px_#2E5DE066] hover:shadow-[0px_6px_18px_0px_#2E5DE088] active:scale-[0.98] transition-all cursor-pointer"
                style={{ fontFamily: "Instrument Sans, sans-serif" }}
              >
                <Plus size={16} className="text-white shrink-0" strokeWidth={2.5} />
                <span>Save &amp; Next</span>
              </button>
            </div>
          </div>
        )}

        {/* QUESTIONS TAB */}
        {activeTab === "questions" && (
          <div className="space-y-6" style={{ fontFamily: "Instrument Sans, sans-serif" }}>
            <div className="w-full max-w-[1263px] bg-white rounded-[16px] p-6 shadow-[-4px_4px_15px_0px_rgba(156,163,175,0.2)] border border-[#E9EEFE] space-y-5">
              {/* WorkspaceHeader */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E9EEFE] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#1E1B4B] leading-none">
                    Question Bank Assignment
                  </h3>
                  <p className="text-[13px] text-[#6B7280] mt-1.5">
                    Select and assign questions from the central question library or import via CSV.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
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
                    className="h-[32px] px-4 py-1.5 gap-2 text-[13px] font-semibold text-[#2E5DE0] bg-[#EEF2FF] hover:bg-blue-100 border border-[#2E5DE0] rounded-full transition-colors cursor-pointer inline-flex items-center shadow-xs"
                    style={{ fontFamily: "Instrument Sans, sans-serif" }}
                  >
                    <Upload size={14} className="text-[#2E5DE0] shrink-0" />
                    <span className="text-[#2E5DE0] leading-none whitespace-nowrap">Bulk Import Questions</span>
                  </button>
                </div>
              </div>

              {/* Locked Warning Banner */}
              {!isQuestionsEditable && (
                <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px] text-[13px] text-[#B45309] flex items-center gap-2.5">
                  <Lock size={16} className="text-[#B45309] shrink-0" />
                  <span>
                    <strong>Questions Locked:</strong> All candidate invite links have already been generated for this drive. Questions are present below for review in read-only mode.
                  </span>
                </div>
              )}

              {/* QuestionsListContainer: Assigned Questions Section */}
              <div className="w-full border border-[#E9EEFE] rounded-[12px] overflow-hidden">
                {/* ListHeader */}
                <div className="h-[42px] px-5 py-3 bg-[#F2F2FB] border-b border-[#E9EEFE] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-[#2E5DE0]" />
                    <h4 className="text-[14px] font-bold text-[#1E1B4B]">
                      Assigned Questions for this Drive ({assignedQuestions.length})
                    </h4>
                  </div>
                  {!isQuestionsEditable && (
                    <span className="h-[18px] px-2 py-0.5 rounded-[9px] bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309] text-[10px] font-bold flex items-center gap-1 uppercase tracking-wider">
                      <Lock size={10} /> Read-Only
                    </span>
                  )}
                </div>

                {assignedQuestions.length === 0 ? (
                  <div className="p-6 text-center text-[13px] text-[#9CA3AF] italic bg-white">
                    No questions assigned to this drive yet. Select and assign questions from the Question Bank below.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E9EEFE] bg-white max-h-[300px] overflow-y-auto">
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
                        <div
                          key={qId}
                          onClick={() => setPreviewQuestion(q)}
                          className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                            <span className="h-[22px] min-w-[50px] px-3 py-0.5 rounded-[12px] bg-[#EEF2FF] text-[#4F46E5] text-[11px] font-bold inline-flex items-center justify-center shrink-0 uppercase tracking-wide">
                              {MODULE_LABEL_MAP[displayModule] || displayModule}
                            </span>
                            <span className="text-[13.5px] font-medium text-[#1E1B4B] group-hover:text-[#2E5DE0] transition-colors truncate leading-[140%]">
                              {title}
                            </span>
                          </div>

                          {/* Row Actions with exact aligned widths */}
                          <div className="w-[172px] flex items-center justify-end gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewQuestion(q);
                              }}
                              className="w-[84px] h-[28px] rounded-[14px] border border-[#E9EEFE] bg-white hover:bg-slate-50 text-[#2E5DE0] text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            >
                              <Eye size={13} className="text-[#2E5DE0]" />
                              <span>Preview</span>
                            </button>
                            {isQuestionsEditable ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssignedQuestions(assignedQuestions.filter((id) => id !== qId));
                                }}
                                className="w-[76px] h-[28px] rounded-[14px] bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[12px] font-semibold flex items-center justify-center transition-colors cursor-pointer"
                              >
                                Remove
                              </button>
                            ) : (
                              <span className="w-[76px] h-[28px] rounded-[14px] bg-[#F2F2FB] text-[#9CA3AF] text-[12px] font-semibold flex items-center justify-center gap-1 cursor-not-allowed">
                                <Lock size={12} className="text-[#9CA3AF]" />
                                <span>Locked</span>
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

                  const isCountMatched = poolSize >= reqCount;
                  const isDifficultyMatched = easyAvail === dist.easy && mediumAvail === dist.medium && hardAvail === dist.hard;

                  const renderDiffMetric = (label: string, val: number) => {
                    const isZero = val === 0;
                    return (
                      <span className={`inline-flex items-center gap-1 ${isZero ? "text-[#9CA3AF]" : "text-[#1E1B4B]"}`}>
                        <span className={isZero ? "text-[#9CA3AF]" : "text-[#6B7280]"}>{label}:</span>
                        <span className={isZero ? "text-[#9CA3AF] font-normal" : "font-bold text-[#1E1B4B]"}>{val}</span>
                      </span>
                    );
                  };

                  return (
                    <div key={modId} className="bg-white border border-[#E9EEFE] rounded-[12px] p-4 space-y-2.5 text-xs shadow-xs">
                      <div className="flex items-center justify-between font-semibold border-b border-[#E9EEFE] pb-2">
                        <span className="text-[#1E1B4B] font-bold text-[13px]">
                          {MODULE_LABEL_MAP[modId] || modId} Module
                        </span>
                        <span className={`text-[12px] font-semibold ${isCountMatched ? "text-emerald-700" : "text-[#2E5DE0]"}`}>
                          {isCountMatched ? `Attached: ${poolSize} / ${reqCount}` : `Required: ${reqCount} (${poolSize} selected)`}
                        </span>
                      </div>

                      <div className="space-y-1.5 font-mono text-[12px]">
                        {/* Strictly aligned vertical grid */}
                        <div className="grid grid-cols-[64px_1fr_1fr_1fr] items-center">
                          <span className="text-[#6B7280] font-sans font-medium text-[12px]">Target:</span>
                          <div>{renderDiffMetric("Easy", dist.easy)}</div>
                          <div>{renderDiffMetric("Medium", dist.medium)}</div>
                          <div>{renderDiffMetric("Hard", dist.hard)}</div>
                        </div>

                        <div className="grid grid-cols-[64px_1fr_1fr_1fr] items-center">
                          <span className="text-[#6B7280] font-sans font-medium text-[12px]">Selected:</span>
                          <div>{renderDiffMetric("Easy", easyAvail)}</div>
                          <div>{renderDiffMetric("Medium", mediumAvail)}</div>
                          <div>{renderDiffMetric("Hard", hardAvail)}</div>
                        </div>

                        {/* Emphasized Progress Ratio & Bar */}
                        <div className="flex items-center justify-between font-sans pt-1.5 border-t border-[#E9EEFE]">
                          <span className="text-[#6B7280] text-[12px] font-medium">Selected:</span>
                          <div className="flex items-center gap-2.5">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${isCountMatched ? "bg-emerald-500" : "bg-[#2E5DE0]"
                                  }`}
                                style={{ width: `${Math.min(100, reqCount > 0 ? (poolSize / reqCount) * 100 : 0)}%` }}
                              />
                            </div>
                            <span className={`text-[12px] font-bold font-mono ${isCountMatched ? "text-emerald-700" : "text-[#1E1B4B]"}`}>
                              {poolSize} / {reqCount}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-1.5 border-t border-[#E9EEFE] text-[12px] space-y-1">
                        {isCountMatched ? (
                          isDifficultyMatched ? (
                            <div className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-[8px] font-medium">
                              ✓ Required question count &amp; target difficulty matched.
                            </div>
                          ) : (
                            <div className="text-emerald-800 bg-emerald-50/80 border border-emerald-200 px-2.5 py-1.5 rounded-[8px] space-y-0.5">
                              <div className="font-medium text-emerald-800">
                                ✓ Required question count reached ({poolSize} attached).
                              </div>
                              <div className="text-[11px] text-[#6B7280]">
                                Note: Difficulty composition ({easyAvail}E / {mediumAvail}M / {hardAvail}H) differs slightly from target ({dist.easy}E / {dist.medium}M / {dist.hard}H).
                              </div>
                            </div>
                          )
                        ) : poolSize === 0 ? (
                          <div className="text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-2 rounded-[8px] space-y-1.5">
                            <div className="font-semibold text-rose-800 flex items-center gap-1.5">
                              <XCircle size={13} className="text-rose-600 shrink-0" />
                              <span>0 questions attached. Please select or import {reqCount} {MODULE_LABEL_MAP[modId] || modId} question(s).</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <button
                                type="button"
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
                                className="px-2 py-0.5 text-[11px] font-semibold text-rose-800 bg-white border border-rose-300 rounded-[6px] hover:bg-rose-100 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Upload size={10} /> Bulk Import (CSV)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  navigate({
                                    to: "/questions",
                                    search: {
                                      fromDriveId: driveId,
                                      driveName: drive.name,
                                    } as any,
                                  });
                                }}
                                className="px-2 py-0.5 text-[11px] font-semibold text-[#6B7280] bg-white border border-[#E9EEFE] rounded-[6px] hover:text-[#1E1B4B] flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <BookOpen size={10} /> Question Bank
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveTab("configuration")}
                                className="px-2 py-0.5 text-[11px] font-semibold text-[#6B7280] bg-white border border-[#E9EEFE] rounded-[6px] hover:text-[#1E1B4B] flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Settings size={10} /> Adjust Weight
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-2 rounded-[8px] space-y-1.5">
                            <div className="font-semibold text-amber-800 flex items-center gap-1.5">
                              <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                              <span>Incomplete: {poolSize} / {reqCount} questions attached ({reqCount - poolSize} more required)</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <button
                                type="button"
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
                                className="px-2 py-0.5 text-[11px] font-semibold text-[#2E5DE0] bg-white border border-[#2E5DE033] rounded-[6px] hover:bg-blue-50 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Upload size={10} /> Bulk Import (CSV)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  navigate({
                                    to: "/questions",
                                    search: {
                                      fromDriveId: driveId,
                                      driveName: drive.name,
                                    } as any,
                                  });
                                }}
                                className="px-2 py-0.5 text-[11px] font-semibold text-[#6B7280] bg-white border border-[#E9EEFE] rounded-[6px] hover:text-[#1E1B4B] flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <BookOpen size={10} /> Question Bank
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveTab("configuration")}
                                className="px-2 py-0.5 text-[11px] font-semibold text-[#6B7280] bg-white border border-[#E9EEFE] rounded-[6px] hover:text-[#1E1B4B] flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Settings size={10} /> Adjust Weight
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* FilterBar (Module tabs + Complexity filters) */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuestionModuleFilter("ALL")}
                    className={`h-[32px] px-3.5 py-1.5 rounded-[16px] text-[13px] transition-colors cursor-pointer ${
                      questionModuleFilter === "ALL"
                        ? "bg-[#2E5DE0] text-white font-semibold border border-[#2E5DE0] shadow-xs"
                        : "bg-white text-[#6B7280] hover:text-[#1E1B4B] font-medium border border-[#E9EEFE] hover:border-[#D5DAEC]"
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
                          type="button"
                          onClick={() => setQuestionModuleFilter(modKey)}
                          className={`h-[32px] px-3.5 py-1.5 rounded-[16px] text-[13px] transition-colors cursor-pointer ${
                            questionModuleFilter === modKey
                              ? "bg-[#2E5DE0] text-white font-semibold border border-[#2E5DE0] shadow-xs"
                              : "bg-white text-[#6B7280] hover:text-[#1E1B4B] font-medium border border-[#E9EEFE] hover:border-[#D5DAEC]"
                          }`}
                        >
                          <span>{labelMap[modKey] || modKey}</span>
                        </button>
                      );
                    })}
                </div>

                {/* Complexity Filters */}
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-[0.05em]">COMPLEXITY:</span>
                  <div className="flex items-center gap-1.5">
                    {[
                      { id: "ALL", label: "All" },
                      { id: "EASY", label: "Easy" },
                      { id: "MEDIUM", label: "Medium" },
                      { id: "HARD", label: "Hard" },
                    ].map((diff) => (
                      <button
                        key={diff.id}
                        type="button"
                        onClick={() => setQuestionDifficultyFilter(diff.id)}
                        className={`h-[27px] px-3 py-1 rounded-[14px] text-[11px] font-bold transition-colors cursor-pointer ${
                          questionDifficultyFilter === diff.id
                            ? "bg-[#2E5DE0] text-white border border-[#2E5DE0] shadow-xs"
                            : "bg-white text-[#6B7280] hover:text-[#1E1B4B] border border-[#E9EEFE] hover:border-[#D5DAEC]"
                        }`}
                      >
                        {diff.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Search Input Bar */}
              <div className="relative w-full">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  type="text"
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                  placeholder="Search questions..."
                  className="w-full h-[38px] pl-9 pr-4 text-[13px] rounded-[16px] border border-[#E9EEFE] bg-white text-[#1E1B4B] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#2E5DE0] transition-colors"
                />
              </div>

              {/* Dynamic AI Mode Notice */}
              {isAiPromptingDynamic && (questionModuleFilter === "ALL" || questionModuleFilter === "AI_PROMPTING") && (
                <div className="p-3.5 bg-[#F2F2FB] border border-[#E9EEFE] rounded-[10px] text-[13px] italic text-[#6B7280] flex items-center gap-2">
                  <Sparkles size={14} className="text-[#2E5DE0] shrink-0" />
                  <span>AI-Generated Mode Selected — Questions &amp; evaluation will be dynamically generated by AI during the candidate assessment.</span>
                </div>
              )}

              {/* Question Selector List in Question Bank */}
              <div className="border border-[#E9EEFE] rounded-[12px] divide-y divide-[#E9EEFE] bg-white max-h-[460px] overflow-y-auto">
                {filteredQuestionsList.length === 0 ? (
                  <div className="p-8 text-center text-[13px] italic text-[#9CA3AF]">
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
                        className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 pr-4 flex-1 min-w-0">
                          <span className="h-[22px] min-w-[50px] px-3 py-0.5 rounded-[12px] bg-[#EEF2FF] text-[#4F46E5] text-[11px] font-bold inline-flex items-center justify-center shrink-0 uppercase tracking-wide">
                            {MODULE_LABEL_MAP[displayModule] || displayModule}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-medium text-[#1E1B4B] group-hover:text-[#2E5DE0] transition-colors truncate">
                              {title}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-[6px] ${
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
                                    <span key={tag} className="text-[10px] font-mono text-[#9CA3AF] bg-[#F3F4F6] px-1.5 py-0.5 rounded-[6px]">
                                      #{tag}
                                    </span>
                                  ))}
                                  {hiddenDriveCount > 0 && (
                                    <span className="text-[10px] text-[#2E5DE0] bg-[#EEF2FF] px-1.5 py-0.5 rounded-[6px] font-semibold">
                                      +{hiddenDriveCount} more drives
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Row Actions with exact aligned widths */}
                        <div className="w-[172px] flex items-center justify-end gap-2.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewQuestion(q);
                            }}
                            className="w-[84px] h-[28px] rounded-[14px] border border-[#E9EEFE] bg-white hover:bg-slate-50 text-[#2E5DE0] text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          >
                            <Eye size={13} className="text-[#2E5DE0]" />
                            <span>Preview</span>
                          </button>
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
                                className={`w-[76px] h-[28px] rounded-[14px] text-[12px] font-semibold transition-colors cursor-pointer flex items-center justify-center ${
                                  isSelected
                                    ? "bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200"
                                    : isLimitReached
                                      ? "bg-gray-100 text-[#9CA3AF] border border-gray-200 cursor-not-allowed"
                                      : "bg-[#2E5DE0] text-white hover:bg-[#254ec4] shadow-xs"
                                }`}
                                title={isLimitReached ? `Limit reached: ${reqCount}/${reqCount} questions selected for ${displayModule}` : undefined}
                              >
                                {isSelected ? "Remove" : "Assign"}
                              </button>
                            );
                          })() : (
                            <span
                              className="w-[76px] h-[28px] rounded-[14px] text-[12px] font-semibold bg-[#F2F2FB] text-[#9CA3AF] flex items-center justify-center gap-1 cursor-not-allowed"
                              title="Locked: Candidate links already generated"
                            >
                              <Lock size={12} className="text-[#9CA3AF]" />
                              <span>Locked</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* BOTTOM ACTION BUTTON: + Save & Next (Aligned Right) */}
            <div className="w-full max-w-[1263px] flex justify-end pt-2 pb-6">
              <button
                type="button"
                onClick={handleSaveQuestionsAndNext}
                className="h-[38px] px-6 py-2 rounded-full bg-[#2E5DE0] hover:bg-[#254ec4] text-white font-bold text-[14px] flex items-center gap-1.5 shadow-[0px_4px_14px_0px_#2E5DE066] hover:shadow-[0px_6px_18px_0px_#2E5DE088] active:scale-[0.98] transition-all cursor-pointer"
                style={{ fontFamily: "Instrument Sans, sans-serif" }}
              >
                <Plus size={16} className="text-white shrink-0" strokeWidth={2.5} />
                <span>Save &amp; Next</span>
              </button>
            </div>
          </div>
        )}

      {/* ROSTER TAB */}
      {activeTab === "roster" && (
        <div className="space-y-6" style={{ fontFamily: "Instrument Sans, sans-serif" }}>
          <div className="w-full max-w-[1263px] bg-white rounded-[16px] p-6 shadow-[-4px_4px_15px_0px_rgba(156,163,175,0.2)] border border-[#E9EEFE] space-y-5">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E9EEFE] pb-4">
              <div>
                <h3 className="text-[16px] font-bold text-[#1E1B4B] leading-none">
                  Candidate Roster &amp; Link Generation
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-1.5">
                  Manage candidates and copy assessment invitation links.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddCandidateModal(true)}
                  className="h-[32px] px-4 py-1.5 rounded-full bg-[#2E5DE0] hover:bg-[#254ec4] text-white text-[13px] font-semibold flex items-center gap-1.5 shadow-[0px_4px_14px_0px_#2E5DE044] transition-all cursor-pointer"
                  style={{ fontFamily: "Instrument Sans, sans-serif" }}
                >
                  <Plus size={15} strokeWidth={2.5} className="text-white shrink-0" />
                  <span>Add Candidate</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkImportModal(true)}
                  className="h-[32px] px-4 py-1.5 rounded-full bg-[#EEF2FF] hover:bg-blue-100 border border-[#2E5DE0] text-[#2E5DE0] text-[13px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  style={{ fontFamily: "Instrument Sans, sans-serif" }}
                >
                  <Upload size={14} className="text-[#2E5DE0] shrink-0" />
                  <span>Bulk Import Candidates</span>
                </button>
              </div>
            </div>

            {/* Candidates Table */}
            <div className="border border-[#E9EEFE] rounded-[12px] overflow-hidden bg-white">
              <table className="w-full text-left text-[13.5px] border-collapse table-fixed">
                <colgroup>
                  <col className="w-[18%]" />
                  <col className="w-[24%]" />
                  <col className="w-[10%]" />
                  <col className="w-[11%]" />
                  <col className="w-[16%]" />
                  <col className="w-[21%]" />
                </colgroup>
                <thead>
                  <tr className="h-[42px] bg-[#F2F2FB] text-[11px] font-bold text-[#64748B] uppercase tracking-[0.5px] border-b border-[#E9EEFE]">
                    <th className="pl-5 pr-3 py-2.5 whitespace-nowrap">Candidate</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Email</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Target Role</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Status</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Invite Link</th>
                    <th className="pl-3 pr-5 py-2.5 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EEFE] bg-white">
                  {drive.roster.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[13px] italic text-[#9CA3AF]">
                        No candidates added to roster yet. Click "Add Candidate" above to get started.
                      </td>
                    </tr>
                  ) : (
                    drive.roster.map((c) => (
                      <tr key={c.candidateId} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="pl-5 pr-3 py-3.5 font-semibold text-[#1E1B4B] max-w-0" title={c.candidateName}>
                          <div className="truncate" title={c.candidateName}>
                            {c.candidateName}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 font-mono text-[12.5px] text-[#6B7280] max-w-0" title={c.candidateEmail}>
                          <div className="truncate" title={c.candidateEmail}>
                            {c.candidateEmail}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          <span className="h-[20px] px-2.5 rounded-[10px] bg-[#EEF2FF] text-[#4F46E5] text-[11px] font-bold inline-flex items-center justify-center whitespace-nowrap">
                            {c.experienceTier ? `${c.experienceTier} yrs` : (c.level || drive.roleTemplateName || "Assigned Role")}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          {c.inviteStatus === "REDEEMED" || c.inviteStatus === "COMPLETED" ? (
                            <span
                              className="w-[82px] h-[21px] px-[10px] py-[4px] rounded-[11px] bg-[#E2F0D9] text-[#385723] text-[11px] font-bold uppercase tracking-[0.5px] inline-flex items-center justify-center leading-none whitespace-nowrap"
                              style={{ fontFamily: "Instrument Sans, sans-serif" }}
                            >
                              REDEEMED
                            </span>
                          ) : (
                            <span
                              className={`h-[21px] px-[10px] py-[4px] rounded-[11px] text-[11px] font-bold uppercase tracking-[0.5px] inline-flex items-center justify-center leading-none whitespace-nowrap ${
                                c.isGenerated
                                  ? "bg-[#EFF6FF] text-[#2563EB]"
                                  : "bg-[#FEF3C7] text-[#D97706]"
                              }`}
                              style={{ fontFamily: "Instrument Sans, sans-serif" }}
                            >
                              {c.isGenerated ? c.inviteStatus : "DRAFT"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          {c.isGenerated && c.inviteLink ? (
                            <button
                              type="button"
                              onClick={() => copyCandidateLink(c.inviteLink, c.candidateId)}
                              className="w-[137px] h-[27px] px-[10px] py-[6px] gap-[6px] rounded-[14px] bg-[#EFF6FF] border border-[#3B82F6] hover:bg-blue-100 text-[#2563EB] text-[12px] font-semibold inline-flex items-center justify-center transition-colors cursor-pointer shadow-xs whitespace-nowrap shrink-0"
                              style={{ fontFamily: "Instrument Sans, sans-serif" }}
                            >
                              {copiedCandidateId === c.candidateId ? (
                                <>
                                  <Check size={12} className="text-emerald-600 shrink-0" />
                                  <span className="text-emerald-600 font-semibold leading-none">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} className="text-[#2563EB] shrink-0" />
                                  <span className="leading-none whitespace-nowrap">Copy Unique Link</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                await handleGenerateLinks();
                                const updated = await fetchDriveDetail(driveId);
                                const match = (updated.roster || []).find((item: any) => item.candidateId === c.candidateId || item.candidateEmail === c.candidateEmail);
                                if (match?.inviteLink) {
                                  copyCandidateLink(match.inviteLink, c.candidateId);
                                }
                              }}
                              className="h-[27px] px-3.5 rounded-[14px] bg-[#2E5DE0] hover:bg-[#254ec4] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                            >
                              <Sparkles size={12} />
                              <span>Generate Link</span>
                            </button>
                          )}
                        </td>
                        <td className="pl-3 pr-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            {c.sessionId && (
                              <Link
                                to="/results/$id"
                                params={{ id: c.sessionId }}
                                className="h-[27px] px-3 py-1 rounded-[14px] border border-[#3B82F6] bg-[#EFF6FF] hover:bg-blue-100 text-[#2563EB] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs whitespace-nowrap shrink-0"
                                style={{ fontFamily: "Instrument Sans, sans-serif" }}
                              >
                                <Eye size={13} className="text-[#2563EB] shrink-0" />
                                <span className="leading-none">View Results</span>
                              </Link>
                            )}
                            <button
                              type="button"
                              onClick={() => setCandidateToRemove(c)}
                              className="h-[27px] px-3 py-1 rounded-[14px] bg-[#FFF1F2] hover:bg-rose-100 border border-[#C62828] text-[#C62828] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs whitespace-nowrap shrink-0"
                              style={{ fontFamily: "Instrument Sans, sans-serif" }}
                              title="Remove candidate &amp; revoke access"
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                                <path d="M5 5.49996V8.5002M7 5.49996V8.5002M9.5 2.99976V10.0003C9.5 10.2656 9.39464 10.5199 9.20711 10.7075C9.01957 10.895 8.76522 11.0004 8.5 11.0004H3.5C3.23478 11.0004 2.98043 10.895 2.79289 10.7075C2.60536 10.5199 2.5 10.2656 2.5 10.0003V2.99976M1.5 2.99976H10.5M4 2.99976V1.99968C4 1.73445 4.10536 1.48007 4.29289 1.29252C4.48043 1.10497 4.73478 0.999603 5 0.999603H7C7.26522 0.999603 7.51957 1.10497 7.70711 1.29252C7.89464 1.48007 8 1.73445 8 1.99968V2.99976" stroke="#C62828" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                              <span className="leading-none">Remove</span>
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

        {/* Preview Question Modal */}
        {previewQuestion && (
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            style={{ fontFamily: "Instrument Sans, sans-serif" }}
            onClick={() => setPreviewQuestion(null)}
          >
            <div
              className="bg-white rounded-[16px] w-full max-w-[660px] shadow-[0px_20px_60px_0px_rgba(0,0,0,0.18)] p-6 sm:p-7 space-y-3 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header: Module badge + Difficulty badge + Close Icon */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-[21px] px-2 rounded-[4px] bg-[#EFF6FF] text-[#2563EB] text-[11px] font-bold uppercase inline-flex items-center justify-center tracking-wide">
                    {previewQuestion.moduleType}
                  </span>
                  <span
                    className={`h-[21px] px-2.5 rounded-[4px] text-[11px] font-bold inline-flex items-center justify-center capitalize ${(previewQuestion.difficulty || "").toUpperCase() === "EASY"
                      ? "bg-[#DCFCE7] text-[#16A34A]"
                      : (previewQuestion.difficulty || "").toUpperCase() === "HARD"
                        ? "bg-[#FFE4E6] text-[#E11D48]"
                        : "bg-[#FEF3C7] text-[#D97706]"
                      }`}
                  >
                    {(previewQuestion.difficulty || "Medium").toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewQuestion(null)}
                  className="w-7 h-7 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer shrink-0"
                  title="Close preview"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9.66736 5.66704L5.66704 9.66736M5.66704 5.66704L9.66736 9.66736M14.3344 7.6672C14.3344 11.3494 11.3494 14.3344 7.6672 14.3344C3.98501 14.3344 1 11.3494 1 7.6672C1 3.98501 3.98501 1 7.6672 1C11.3494 1 14.3344 3.98501 14.3344 7.6672Z" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              {/* Question Title */}
              <div className="pt-0.5">
                <h3 className="text-[17px] sm:text-[18px] font-bold text-[#1E1B4B] leading-snug tracking-tight">
                  {previewQuestion.content?.title || previewQuestion.content?.prompt || previewQuestion.content?.text || previewQuestion.content?.question || "Question Details"}
                </h3>
                {previewQuestion.content?.description && (
                  <p className="text-[13px] text-[#6B7280] leading-relaxed mt-1">
                    {previewQuestion.content.description}
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className="w-full h-px bg-[#E2E8F0]" />

              {/* MCQ Options */}
              {previewQuestion.content?.options && Array.isArray(previewQuestion.content.options) && (
                <div className="space-y-2">
                  <span className="text-[10.5px] font-bold tracking-[0.5px] text-[#64748B] uppercase block">
                    OPTIONS:
                  </span>
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
                          className={`px-4 py-2 rounded-[8px] text-[13px] flex items-center justify-between transition-colors ${
                            isCorrect
                              ? "h-[50px] bg-[#E8F7F0] border border-[#A7F3D0] text-[#065F46] font-semibold"
                              : "h-[44px] bg-[#F1F5F9] text-[#334155] font-medium"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 pr-2">
                            <span className={`font-semibold ${isCorrect ? "text-[#065F46] font-bold" : "text-[#64748B]"}`}>
                              {String.fromCharCode(65 + idx)}.
                            </span>
                            <span>{optText}</span>
                          </div>
                          {isCorrect && (
                            <span className="w-[64px] h-[25px] rounded-[5px] bg-[#0A7E5C] text-white text-[11.5px] font-bold inline-flex items-center justify-center shrink-0">
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
                <div className="space-y-1.5">
                  <span className="text-[10.5px] font-bold tracking-[0.5px] text-[#64748B] uppercase block">
                    Problem Statement:
                  </span>
                  <div className="p-3 bg-[#F8FAFC] border border-[#E9EEFE] text-[#1E1B4B] font-mono text-[11.5px] rounded-[8px] whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                    {previewQuestion.content.problemStatement}
                  </div>
                </div>
              )}

              {/* Expected Answer / Grading Rubric for Test Scenarios & AI Prompting */}
              {(previewQuestion.content?.expectedAnswer || previewQuestion.content?.expectedCriteria) && (
                <div className="space-y-1.5">
                  <span className="text-[10.5px] font-bold tracking-[0.5px] text-[#64748B] uppercase block">
                    Expected Guidelines / Rubric:
                  </span>
                  <div className="p-3 bg-[#EEF2FF] border border-[#E9EEFE] text-[#1E1B4B] text-[12.5px] rounded-[8px] leading-relaxed max-h-24 overflow-y-auto">
                    {previewQuestion.content.expectedAnswer || previewQuestion.content.expectedCriteria}
                  </div>
                </div>
              )}

              {/* Tags */}
              {previewQuestion.tags && previewQuestion.tags.length > 0 && (() => {
                const { displayTags, hiddenDriveCount } = processQuestionTags(previewQuestion.tags, previewQuestion.moduleType);
                if (displayTags.length === 0 && hiddenDriveCount === 0) return null;
                return (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[10.5px] font-bold text-[#64748B]">Tags:</span>
                    {displayTags.map((tag: string) => (
                      <span key={tag} className="text-[10.5px] font-mono text-[#64748B] bg-[#F3F4F6] px-2 py-0.5 rounded-[5px]">
                        #{tag}
                      </span>
                    ))}
                    {hiddenDriveCount > 0 && (
                      <span className="text-[10.5px] text-[#2E5DE0] bg-[#EEF2FF] px-2 py-0.5 rounded-[5px] font-semibold">
                        +{hiddenDriveCount} more drives
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Bottom Action Button (Aligned Right) */}
              <div className="flex justify-end pt-2">
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
                      className={`min-w-[190px] h-[38px] px-5 rounded-[8px] text-[13px] font-bold transition-all shadow-sm flex items-center justify-center ${
                        isAssigned
                          ? "bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                          : isLimitReached
                            ? "bg-gray-100 text-[#9CA3AF] border border-gray-200 cursor-not-allowed"
                            : "bg-[#2E5DE0] hover:bg-[#254ec4] text-white shadow-[0px_4px_12px_0px_#2E5DE044] cursor-pointer"
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
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            style={{ fontFamily: "Instrument Sans, sans-serif" }}
          >
            <div className="bg-white rounded-[20px] w-full max-w-[460px] shadow-[0px_20px_60px_0px_rgba(0,0,0,0.18)] p-6 sm:p-7 space-y-4">
              <div className="flex items-center justify-between border-b border-[#E9EEFE] pb-3.5">
                <h3 className="text-[17px] font-bold text-[#1E1B4B]">Add Candidate</h3>
                <button
                  type="button"
                  onClick={() => setShowAddCandidateModal(false)}
                  className="w-7 h-7 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer shrink-0"
                  title="Close"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9.66736 5.66704L5.66704 9.66736M5.66704 5.66704L9.66736 9.66736M14.3344 7.6672C14.3344 11.3494 11.3494 14.3344 7.6672 14.3344C3.98501 14.3344 1 11.3494 1 7.6672C1 3.98501 3.98501 1 7.6672 1C11.3494 1 14.3344 3.98501 14.3344 7.6672Z" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <div className="space-y-3.5 pt-1">
                <div>
                  <label className="block text-[13px] font-semibold text-[#1E1B4B] mb-1.5">
                    Candidate Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={candidateNameInput}
                    onChange={(e) => setCandidateNameInput(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full h-[40px] px-3.5 text-[13px] border border-[#E9EEFE] rounded-[10px] focus:outline-none focus:border-[#2E5DE0] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#1E1B4B] mb-1.5">
                    Candidate Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={candidateEmailInput}
                    onChange={(e) => setCandidateEmailInput(e.target.value)}
                    placeholder="e.g. john.doe@example.com"
                    className="w-full h-[40px] px-3.5 text-[13px] border border-[#E9EEFE] rounded-[10px] focus:outline-none focus:border-[#2E5DE0] transition-colors"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E9EEFE]">
                <button
                  type="button"
                  onClick={() => setShowAddCandidateModal(false)}
                  className="h-[36px] px-4 rounded-[10px] text-[13px] font-semibold text-[#6B7280] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddCandidate}
                  className="h-[36px] px-5 rounded-[10px] text-[13px] font-semibold text-white bg-[#2E5DE0] hover:bg-[#254ec4] shadow-xs transition-colors cursor-pointer"
                >
                  Add Candidate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Generate Links Modal */}
        {confirmGenerateLinks && (
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            style={{ fontFamily: "Instrument Sans, sans-serif" }}
          >
            <div className="bg-white rounded-[20px] w-full max-w-[460px] p-6 sm:p-7 shadow-[0px_20px_60px_0px_rgba(0,0,0,0.18)] space-y-4">
              <h3 className="text-[17px] font-bold text-[#1E1B4B]">Confirm Drive Schedule &amp; Link Generation</h3>
              <p className="text-[13.5px] text-[#6B7280] leading-relaxed">
                Generate unique assessment links for all {drive.roster.length} candidate(s) in the roster?
              </p>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E9EEFE]">
                <button
                  type="button"
                  onClick={() => setConfirmGenerateLinks(false)}
                  className="h-[36px] px-4 rounded-[10px] text-[13px] font-semibold text-[#6B7280] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerateLinks}
                  disabled={generating}
                  className="h-[36px] px-5 rounded-[10px] text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate Links"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unsaved Question Selection Warning Modal */}
        {pendingTabSwitch && (
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            style={{ fontFamily: "Instrument Sans, sans-serif" }}
          >
            <div className="bg-white rounded-[20px] w-full max-w-[460px] p-6 shadow-[0px_20px_60px_0px_rgba(0,0,0,0.18)] space-y-4 border border-[#E9EEFE]">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[#1E1B4B]">Unsaved Question Assignments</h3>
                  <p className="text-[13px] text-[#6B7280] mt-1 leading-relaxed">
                    Selected questions are not saved. Do you want to save them before proceeding?
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-[#E9EEFE]">
                <button
                  type="button"
                  onClick={() => setPendingTabSwitch(null)}
                  className="h-[34px] px-3.5 text-[12px] font-semibold text-[#6B7280] bg-white border border-[#E9EEFE] hover:bg-slate-50 rounded-[8px] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssignedQuestions(savedAssignedQuestions);
                    setActiveTab(pendingTabSwitch);
                    setPendingTabSwitch(null);
                  }}
                  className="h-[34px] px-3.5 text-[12px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-[8px] transition-colors cursor-pointer"
                >
                  Leave Without Saving
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleSaveQuestions();
                    setActiveTab(pendingTabSwitch);
                    setPendingTabSwitch(null);
                  }}
                  className="h-[34px] px-4 text-[12px] font-semibold text-white bg-[#2E5DE0] hover:bg-[#254ec4] rounded-[8px] shadow-xs transition-colors cursor-pointer"
                >
                  Save &amp; Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal for Removing Candidate */}
        {candidateToRemove && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
            style={{ fontFamily: "Instrument Sans, sans-serif" }}
          >
            <div className="bg-white rounded-[20px] p-6 max-w-md w-full shadow-[0px_20px_60px_0px_rgba(0,0,0,0.18)] space-y-4">
              <div className="flex items-center justify-between border-b border-[#E9EEFE] pb-3">
                <div className="flex items-center gap-2 text-rose-600 font-bold text-[16px]">
                  <AlertTriangle size={18} />
                  <span>Remove Candidate</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCandidateToRemove(null)}
                  className="w-7 h-7 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer shrink-0"
                  title="Close"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9.66736 5.66704L5.66704 9.66736M5.66704 5.66704L9.66736 9.66736M14.3344 7.6672C14.3344 11.3494 11.3494 14.3344 7.6672 14.3344C3.98501 14.3344 1 11.3494 1 7.6672C1 3.98501 3.98501 1 7.6672 1C11.3494 1 14.3344 3.98501 14.3344 7.6672Z" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <p className="text-[13.5px] text-[#1E1B4B] leading-relaxed">
                Are you sure you want to remove <strong>{candidateToRemove.candidateName}</strong> (<code className="text-[#6B7280]">{candidateToRemove.candidateEmail}</code>) from this assessment drive?
              </p>
              <p className="text-[12px] text-amber-800 bg-[#FFFBEB] p-3 rounded-[10px] border border-[#FDE68A]">
                ⚠️ This will revoke their invite link and expire any active assessment session.
              </p>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-[#E9EEFE]">
                <button
                  type="button"
                  onClick={() => setCandidateToRemove(null)}
                  disabled={removingCandidate}
                  className="h-[36px] px-4 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F3F4F6] rounded-[10px] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRemoveCandidate}
                  disabled={removingCandidate}
                  className="h-[36px] px-4 text-[13px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-[10px] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {removingCandidate ? "Removing..." : "Remove & Revoke"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Import Candidates Modal */}
        {showBulkImportModal && (
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            style={{ fontFamily: "Instrument Sans, sans-serif" }}
          >
            <div className="bg-white rounded-[24px] w-full max-w-[580px] shadow-[0px_20px_60px_0px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden">
              <div className="px-7 py-5 border-b border-[#E9EEFE] flex items-start justify-between">
                <div>
                  <h2 className="text-[18px] font-bold text-[#1E1B4B]">Bulk Import Candidates</h2>
                  <p className="text-[13px] text-[#6B7280] mt-0.5">Import candidates and assign directly to test.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkImportModal(false);
                    setBulkCandidateInput("");
                    setBulkCandidateErrors([]);
                  }}
                  className="w-7 h-7 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer shrink-0"
                  title="Close"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9.66736 5.66704L5.66704 9.66736M5.66704 5.66704L9.66736 9.66736M14.3344 7.6672C14.3344 11.3494 11.3494 14.3344 7.6672 14.3344C3.98501 14.3344 1 11.3494 1 7.6672C1 3.98501 3.98501 1 7.6672 1C11.3494 1 14.3344 3.98501 14.3344 7.6672Z" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <div className="p-7 space-y-5 max-h-[75vh] overflow-y-auto">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[13px] font-semibold text-[#1E1B4B]">
                      Paste CSV or Tab-Separated Data <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleDownloadSampleCandidates}
                      className="text-[12px] font-semibold text-[#2E5DE0] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Download size={12} /> Download Sample Template
                    </button>
                  </div>
                  <p className="text-[12px] text-[#9CA3AF]">
                    Format: <span className="font-mono text-[#6B7280]">Candidate Name, candidate.email@company.com</span> (one candidate per line)
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
                    className="w-full p-3 text-[12px] font-mono border border-[#E9EEFE] rounded-[10px] bg-white text-[#1E1B4B] focus:outline-none focus:border-[#2E5DE0] transition-colors"
                  />
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="block text-[13px] font-semibold text-[#1E1B4B]">
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
                    className="border-2 border-dashed border-[#E9EEFE] hover:border-[#2E5DE0] rounded-[14px] p-6 text-center bg-[#F8FAFC] hover:bg-[#EEF2FF] transition-all cursor-pointer group"
                  >
                    <UploadCloud className="w-9 h-9 text-[#9CA3AF] group-hover:text-[#2E5DE0] mx-auto mb-2 transition-colors" />
                    <p className="text-[13.5px] font-medium text-[#6B7280] group-hover:text-[#1E1B4B]">
                      Drag &amp; drop your CSV file here, or click to browse
                    </p>
                    <p className="text-[12px] text-[#9CA3AF] mt-1">
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
                  <div className="bg-rose-50 border border-rose-200 rounded-[10px] p-3.5 max-h-32 overflow-y-auto space-y-1">
                    <span className="text-[12px] font-semibold text-rose-700 block">Formatting Errors Detected:</span>
                    {bulkCandidateErrors.map((err, idx) => (
                      <p key={idx} className="text-[11.5px] text-rose-600 font-mono">• {err}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-7 py-4 bg-[#F8FAFC] border-t border-[#E9EEFE] flex items-center justify-between">
                <span className="text-[13px] text-[#6B7280]">
                  {parseBulkCandidates(bulkCandidateInput).parsed.length} valid candidate(s) ready
                </span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBulkImportModal(false);
                      setBulkCandidateInput("");
                      setBulkCandidateErrors([]);
                    }}
                    className="h-[36px] px-4 rounded-[10px] text-[13px] font-semibold text-[#6B7280] hover:bg-white border border-transparent hover:border-[#E9EEFE] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                    <button
                      type="button"
                      onClick={handleBulkImportSubmit}
                      disabled={submittingBulkImport || parseBulkCandidates(bulkCandidateInput).parsed.length === 0}
                      className="h-[36px] px-5 rounded-[10px] text-[13px] font-semibold text-white bg-[#2E5DE0] hover:bg-[#254ec4] shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingBulkImport ? "Importing..." : "Import Candidates"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      {/* Select / Change Role Template Modal */}
      {showSelectTemplateModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowSelectTemplateModal(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-[540px] shadow-2xl flex flex-col max-h-[85vh] z-[101]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-ink">Select &amp; Apply Role Template</h3>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Link a Role Template to automatically import questions and preset module weights.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSelectTemplateModal(false)}
                className="p-1.5 rounded-lg text-ink-tertiary hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs-plus font-medium text-ink-secondary mb-1">Filter Department</label>
                  <select
                    value={templateDeptFilter}
                    onChange={(e) => setTemplateDeptFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-line rounded-md bg-white text-ink focus:outline-none focus:border-brand"
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
                  <label className="block text-xs-plus font-medium text-ink-secondary mb-1">Filter Category</label>
                  <select
                    value={templateCategoryFilter}
                    onChange={(e) => setTemplateCategoryFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-line rounded-md bg-white text-ink focus:outline-none focus:border-brand"
                  >
                    <option value="all">All Categories</option>
                    <option value="FRESHER">Fresher (0-1 yrs)</option>
                    <option value="EXPERIENCED">Experienced (2+ yrs)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm-minus font-medium text-ink-secondary mb-1.5">
                  Select Role Template <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedTemplateForDrive}
                  onChange={(e) => setSelectedTemplateForDrive(e.target.value)}
                  className="w-full px-3 py-2 text-sm-minus border border-line rounded-md bg-white text-ink focus:outline-none focus:border-brand cursor-pointer"
                >
                  <option value="">-- Choose Role Template --</option>
                  {(roleTemplates || [])
                    .filter((rt) => {
                      if (!rt) return false;
                      if (templateDeptFilter !== "all" && (rt.department || "CUSTOM") !== templateDeptFilter) return false;
                      const cat = (rt as any).category || (rt.level === "FRESHER" ? "FRESHER" : "EXPERIENCED");
                      if (templateCategoryFilter !== "all" && cat !== templateCategoryFilter) return false;
                      return true;
                    })
                    .map((tpl) => {
                      const tier = (tpl as any).experienceTier || (((tpl as any).category || "FRESHER") === "FRESHER" ? "0-1" : "2-5");
                      const tierDisplay = tier === "0-1" ? "Fresher (0–1 yrs)" : tier === "11-15" ? "Level 3 (11+ yrs)" : tier === "6-10" ? "Level 2 (6–10 yrs)" : "Level 1 (2–5 yrs)";
                      const cleanRole = (tpl.roleName || "").replace(/\s*[-–]\s*(Fresher|Level\s*\d).*$/i, "").trim() || tpl.roleName;
                      return (
                        <option key={tpl.id} value={tpl.id}>
                          {cleanRole} • {tierDisplay} (v{tpl.version || 1})
                        </option>
                      );
                    })}
                </select>
              </div>

              {selectedTemplateForDrive && (
                <div className="p-3.5 bg-brand-subtle border border-brand-border rounded-lg space-y-2 text-xs">
                  {(() => {
                    const tpl = (roleTemplates || []).find((r) => r.id === selectedTemplateForDrive);
                    if (!tpl) return null;
                    return (
                      <>
                        <div className="flex items-center justify-between font-semibold text-brand-ink">
                          <span>{tpl.roleName}</span>
                          <span className="px-2 py-0.5 bg-brand text-white rounded text-2xs uppercase font-mono">
                            {(tpl as any).experienceTier || "0-1"} yrs
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-ink-secondary text-xs-plus">
                          <span>Department: <strong className="text-ink">{tpl.department || "General"}</strong></span>
                          <span>•</span>
                          <span>Category: <strong className="text-ink">{(tpl as any).category || "FRESHER"}</strong></span>
                          <span>•</span>
                          <span>Duration: <strong className="text-ink">{tpl.durationMinutes || 60}m</strong></span>
                        </div>
                        <p className="text-xs-plus text-brand italic pt-1 border-t border-brand-border">
                          💡 Applying this template will update the drive's template reference, link default questions, and apply module weighting presets.
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-line bg-canvas rounded-b-[12px] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSelectTemplateModal(false)}
                className="px-3.5 py-2 text-xs font-medium text-ink-secondary hover:bg-line rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApplyRoleTemplate(selectedTemplateForDrive)}
                disabled={!selectedTemplateForDrive}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-md transition-colors cursor-pointer shadow-sm disabled:opacity-50"
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
