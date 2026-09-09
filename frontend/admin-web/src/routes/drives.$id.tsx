import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
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
  Pin,
  Loader2,
  Undo2,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { SingleDateTimePicker, computeRollingEndDate, computeEndTimeWithDuration } from "../components/single-date-time-picker";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type DriveDetail } from "../lib/types";
import { validateDriveModuleWeights, type DriveModuleConfigEntry, resolveDrivePathway, type DriveCreationPathway } from "@cd-recruit/shared-types";
import { formatDriveName } from "../lib/utils";
import { parseQuestionsFromCSV, downloadUnifiedSampleCSV } from "../lib/csvParser";
import { CustomDropdown } from "../components/ui/custom-dropdown";
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

export const DEFAULT_SENIORITY_RATIOS: Record<string, { easy: number; medium: number; hard: number }> = {
  fresher: { easy: 0.50, medium: 0.40, hard: 0.10 },
  l1: { easy: 0.30, medium: 0.50, hard: 0.20 },
  l2: { easy: 0.15, medium: 0.50, hard: 0.35 },
  l3: { easy: 0.10, medium: 0.45, hard: 0.45 },
};

export const DEFAULT_TIME_MATRIX: Record<string, Record<string, number>> = {
  MCQ: { EASY: 1, MEDIUM: 2, HARD: 3 },
  SQL: { EASY: 3, MEDIUM: 6, HARD: 12 },
  CODING: { EASY: 6, MEDIUM: 12, HARD: 22 },
  DEBUGGING: { EASY: 5, MEDIUM: 10, HARD: 18 },
  TEST_SCENARIOS: { EASY: 3, MEDIUM: 6, HARD: 12 },
  AI_PROMPTING: { EASY: 4, MEDIUM: 7, HARD: 12 },
  SIMULATION: { EASY: 6, MEDIUM: 12, HARD: 22 },
  NOSQL: { EASY: 3, MEDIUM: 6, HARD: 12 },
};

export const SENIORITY_RATIOS = DEFAULT_SENIORITY_RATIOS;
export const TIME_MATRIX = DEFAULT_TIME_MATRIX;

let dynamicSeniorityRatios: Record<string, { easy: number; medium: number; hard: number }> | null = null;
let dynamicTimeMatrix: Record<string, Record<string, number>> | null = null;

export function setDynamicCalibrationConfig(
  matrix?: Record<string, Record<string, number>> | null,
  ratios?: Record<string, { easy: number; medium: number; hard: number }> | null
) {
  if (matrix) dynamicTimeMatrix = matrix;
  if (ratios) dynamicSeniorityRatios = ratios;
}

export function getRequiredQuestionCount(
  moduleType: string,
  weight: number,
  totalDuration: number,
  seniority: string,
  customRatios?: Record<string, { easy: number; medium: number; hard: number }>,
  customMatrix?: Record<string, Record<string, number>>,
): number {
  const activeRatios = customRatios || dynamicSeniorityRatios || DEFAULT_SENIORITY_RATIOS;
  const activeMatrix = customMatrix || dynamicTimeMatrix || DEFAULT_TIME_MATRIX;
  const ratios = activeRatios[seniority] || activeRatios.fresher || DEFAULT_SENIORITY_RATIOS.fresher;
  const times = activeMatrix[moduleType] || DEFAULT_TIME_MATRIX[moduleType] || { EASY: 5, MEDIUM: 5, HARD: 5 };
  const avgTime =
    ratios.easy * (times.EASY ?? 1) +
    ratios.medium * (times.MEDIUM ?? 2) +
    ratios.hard * (times.HARD ?? 3);
  const timeBudget = totalDuration * (weight / 100);

  return Math.max(1, Math.round(timeBudget / (avgTime || 1)));
}

export function getDefaultDifficultyDistribution(
  requiredCount: number,
  seniority: string,
  customRatios?: Record<string, { easy: number; medium: number; hard: number }>,
): { easy: number; medium: number; hard: number } {
  const activeRatios = customRatios || dynamicSeniorityRatios || DEFAULT_SENIORITY_RATIOS;
  const ratios = activeRatios[seniority] || activeRatios.fresher || DEFAULT_SENIORITY_RATIOS.fresher;
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
  customMatrix?: Record<string, Record<string, number>>,
): number {
  const activeMatrix = customMatrix || dynamicTimeMatrix || DEFAULT_TIME_MATRIX;
  const times = activeMatrix[moduleType] || DEFAULT_TIME_MATRIX[moduleType] || { EASY: 5, MEDIUM: 5, HARD: 5 };
  return (
    (dist.easy || 0) * (times.EASY ?? 1) +
    (dist.medium || 0) * (times.MEDIUM ?? 2) +
    (dist.hard || 0) * (times.HARD ?? 3)
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
  const bulkUploadQuestions = useStore((s) => s.bulkUploadQuestions);
  const suggestDeficitQuestions = useStore((s) => s.suggestDeficitQuestions);
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
  const [activeTab, setActiveTab] = useState<"roster" | "questions" | "configuration">(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const tab = p.get("tab");
      if (tab === "questions" || tab === "roster" || tab === "configuration") return tab;
    }
    return "configuration";
  });

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
  const [pinnedWeights, setPinnedWeights] = useState<Record<string, boolean>>({});
  const [pinnedDifficulties, setPinnedDifficulties] = useState<Record<string, boolean>>({});

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

  // Direct CSV Question Ingestion & Timing Deficit State
  const [isCsvUploading, setIsCsvUploading] = useState(false);
  const [suggestedDeficitModalOpen, setSuggestedDeficitModalOpen] = useState(false);
  const [suggestedDeficitData, setSuggestedDeficitData] = useState<any>(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [highlightTrimmingMode, setHighlightTrimmingMode] = useState(false);
  const [deficitSelectedQuestionIds, setDeficitSelectedQuestionIds] = useState<string[]>([]);
  const [deficitModuleFilter, setDeficitModuleFilter] = useState<string>("ALL");
  const [deficitSearchQuery, setDeficitSearchQuery] = useState("");
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

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
  const [showBankSelector, setShowBankSelector] = useState(false);

  // Timing & Question Assignment Undo History Stack
  interface DriveHistorySnapshot {
    label: string;
    schedule: {
      startHour: string;
      startMinute: string;
      startAmPm: string;
      endHour: string;
      endMinute: string;
      endAmPm: string;
      startDate: string;
      endDate: string;
    };
    assignedQuestions: string[];
  }
  const [historyStack, setHistoryStack] = useState<DriveHistorySnapshot[]>([]);

  const pushHistory = (label: string) => {
    setHistoryStack((prev) => [
      ...prev,
      {
        label,
        schedule: {
          startHour,
          startMinute,
          startAmPm,
          endHour,
          endMinute,
          endAmPm,
          startDate,
          endDate,
        },
        assignedQuestions: [...assignedQuestions],
      },
    ]);
  };

  const handleUndo = async () => {
    if (historyStack.length === 0) return;
    const lastSnapshot = historyStack[historyStack.length - 1];
    setHistoryStack((prev) => prev.slice(0, -1));

    setStartHour(lastSnapshot.schedule.startHour);
    setStartMinute(lastSnapshot.schedule.startMinute);
    setStartAmPm(lastSnapshot.schedule.startAmPm);
    setEndHour(lastSnapshot.schedule.endHour);
    setEndMinute(lastSnapshot.schedule.endMinute);
    setEndAmPm(lastSnapshot.schedule.endAmPm);
    setStartDate(lastSnapshot.schedule.startDate);
    setEndDate(lastSnapshot.schedule.endDate);

    setAssignedQuestions(lastSnapshot.assignedQuestions);
    try {
      await saveDriveQuestions(driveId, lastSnapshot.assignedQuestions);
    } catch (err) {
      console.error("Failed to sync restored questions to drive", err);
    }

    toast.success(`Undid: "${lastSnapshot.label}". Restored previous timing and questions.`);
  };

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
      // Sync dynamic calibration matrix and difficulty ratios from Admin Settings
      try {
        const [tmRes, srRes] = await Promise.all([
          fetch(`${API_BASE}/settings/time-matrix`).catch(() => null),
          fetch(`${API_BASE}/settings/seniority-ratios`).catch(() => null),
        ]);
        if (tmRes && tmRes.ok) {
          const tmData = await tmRes.json();
          if (tmData) setDynamicCalibrationConfig(tmData, null);
        }
        if (srRes && srRes.ok) {
          const srData = await srRes.json();
          if (srData) setDynamicCalibrationConfig(null, srData);
        }
      } catch (err) {
        console.warn("Using default calibration settings:", err);
      }

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

      const isCustomRoleDrive = (data.moduleConfig as any)?.isCustomRole === true;
      if (!isCustomRoleDrive && (!data.questionIds || data.questionIds.length === 0) && data.roleTemplateId) {
        try {
          const headers = await getAuthHeaders();
          const tplRes = await fetch(`${API_BASE}/admin/role-templates/${data.roleTemplateId}`, { headers });
          if (tplRes.ok) {
            const tplData = await tplRes.json();
            const tplQuestionIds = (tplData.questions || []).map((q: any) => q.questionId).filter(Boolean);
            if (tplQuestionIds.length > 0) {
              setAssignedQuestions(tplQuestionIds);
              setSavedAssignedQuestions(tplQuestionIds);
              saveDriveQuestions(driveId, tplQuestionIds).catch(() => { });
            }
          }
        } catch (e) {
          console.warn("Failed fetching role template questions in loadData:", e);
        }
      }

      // Parse schedule dates to 12-hour AM/PM controls
      let sDate = "";
      let sHour = "10";
      let sMin = "00";
      let sAmPm = "AM";
      let eDate = "";
      let eHour = "11";
      let eMin = "30";
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

        const endParsed = isoToAmPm(data.scheduleEnd, "11", "30", "AM");
        eDate = endParsed.date;
        eHour = endParsed.hour;
        eMin = endParsed.minute;
        eAmPm = endParsed.ampm;
      }

      if (!isCustomRoleDrive) {
        const derived = computeEndTimeWithDuration(sHour, sMin, sAmPm, 90);
        eHour = derived.endHour;
        eMin = derived.endMinute;
        eAmPm = derived.endAmPm;
        eDate = sDate;
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

        const activeEnabled = Object.keys(initialConfig).filter(
          (m) => initialConfig[m]?.enabled && (enabledForDept.length === 0 || enabledForDept.includes(m))
        );
        const totalW = activeEnabled.reduce(
          (sum, m) => sum + (Number(initialConfig[m]?.weight) || 0),
          0
        );
        if (activeEnabled.length > 0 && totalW !== 100) {
          let running = 0;
          activeEnabled.forEach((m, idx) => {
            const rawW = Number(initialConfig[m]?.weight) || 0;
            let newW = 0;
            if (idx === activeEnabled.length - 1) {
              newW = Math.max(1, 100 - running);
            } else {
              newW = totalW > 0 ? Math.max(1, Math.round((rawW / totalW) * 100)) : Math.floor(100 / activeEnabled.length);
              running += newW;
            }
            initialConfig[m].weight = newW;
          });
        }
      } else {
        const preset = ((data as any).roleTemplate?.weightingPreset as Record<string, number>) || {};
        const allMods = Object.keys(initialConfig);
        const rawWeights: Record<string, number> = {};
        let enabledSum = 0;

        allMods.forEach((mod) => {
          const isGloballyEnabled = enabledForDept.includes(mod);
          const rawPreset = preset[mod] !== undefined ? Number(preset[mod]) : 0;
          let weight = 0;
          if (rawPreset > 100) weight = Math.round(rawPreset / 100);
          else if (rawPreset <= 1 && rawPreset > 0) weight = Math.round(rawPreset * 100);
          else weight = Math.round(rawPreset);

          weight = isGloballyEnabled ? weight : 0;
          rawWeights[mod] = weight;
          if (weight > 0) enabledSum += weight;
        });

        // Ensure active modules strictly calibrate to 100 marks standard
        const activeModList = allMods.filter((m) => enabledForDept.includes(m) && rawWeights[m] > 0);
        if (activeModList.length > 0 && enabledSum !== 100) {
          let running = 0;
          activeModList.forEach((m, idx) => {
            if (idx === activeModList.length - 1) {
              rawWeights[m] = Math.max(1, 100 - running);
            } else {
              const scaled = Math.max(1, Math.round((rawWeights[m] / enabledSum) * 100));
              rawWeights[m] = scaled;
              running += scaled;
            }
          });
        }

        allMods.forEach((mod) => {
          const isGloballyEnabled = enabledForDept.includes(mod);
          const weight = rawWeights[mod] || 0;
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
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const tab = p.get("tab");
      if (tab === "questions" || tab === "roster" || tab === "configuration") {
        setActiveTab(tab);
      }
      if (p.get("imported") === "true") {
        toast.success("Questions successfully imported and assigned to this drive!");
      }
    }
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
        body: JSON.stringify({
          roleTemplateId: templateId,
          moduleConfig: {
            ...moduleConfig,
            isCustomRole: false,
          },
        }),
      });

      if (!updateRes.ok) {
        throw new Error("Failed to update drive role template.");
      }

      const tplRes = await fetch(`${API_BASE}/admin/role-templates/${templateId}`, { headers });
      if (tplRes.ok) {
        const tplData = await tplRes.json();
        const tplQuestionIds = (tplData.questions || []).map((q: any) => q.questionId).filter(Boolean);

        if (tplQuestionIds.length > 0) {
          sessionStorage.removeItem(`drive_draft_questions_${driveId}`);
          await saveDriveQuestions(driveId, tplQuestionIds);
          setAssignedQuestions(tplQuestionIds);
          setSavedAssignedQuestions(tplQuestionIds);
        }

        if (tplData.weightingPreset) {
          const preset = tplData.weightingPreset as Record<string, number>;
          const entries = Object.entries(preset);
          let sum = entries.reduce((s, [_, w]) => s + (typeof w === "number" ? (w <= 1 && w > 0 ? Math.round(w * 100) : Math.round(w)) : 0), 0);
          const normalizedWeights: Record<string, number> = {};
          let running = 0;

          entries.forEach(([mod, w], idx) => {
            let weightNum = typeof w === "number" ? (w <= 1 && w > 0 ? Math.round(w * 100) : Math.round(w)) : 0;
            if (sum !== 100 && sum > 0) {
              if (idx === entries.length - 1) {
                weightNum = Math.max(1, 100 - running);
              } else {
                weightNum = Math.max(1, Math.round((weightNum / sum) * 100));
                running += weightNum;
              }
            }
            normalizedWeights[mod] = weightNum;
          });

          setModuleConfig((prev) => {
            const updated = { ...prev };
            Object.entries(normalizedWeights).forEach(([mod, w]) => {
              if (updated[mod]) {
                updated[mod] = {
                  ...updated[mod],
                  enabled: w > 0,
                  weight: w,
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

  const pathway: DriveCreationPathway = useMemo(() => {
    if (!drive) return "CUSTOM_MANUAL";
    const resolved = resolveDrivePathway(drive);
    if (resolved === "CUSTOM_MANUAL") {
      const mc = drive.moduleConfig as any;
      if (mc?.creationMethod === "BULK_IMPORT" || mc?.isBulkImport === true) return "CUSTOM_BULK_IMPORT";
      const driveNameLower = drive.name?.toLowerCase().trim();
      if (
        driveNameLower &&
        assignedQuestions.some((qId: string) => {
          const q = questionsBank.find((item) => item.id === qId);
          return (q?.tags || []).some((t: string) => t.toLowerCase() === `drive:${driveNameLower}` || t.toLowerCase() === `#drive:${driveNameLower}`);
        })
      ) {
        return "CUSTOM_BULK_IMPORT";
      }
    }
    return resolved;
  }, [drive, assignedQuestions, questionsBank]);

  const isPartnerApi = pathway === "PARTNER_API";
  const isTemplateDrive = pathway === "TEMPLATE";
  const isManualDrive = pathway === "CUSTOM_MANUAL";
  const isBulkImportDrive = pathway === "CUSTOM_BULK_IMPORT";
  const isTemplateGoverned = isTemplateDrive || isPartnerApi;
  const isCustomRole = isManualDrive || isBulkImportDrive;

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
    if (isTemplateGoverned || rollingWindow || (drive as any)?.originChannel === "PARTNER_API") {
      const templateDuration = (drive as any)?.roleTemplate?.durationMinutes || 90;
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
    resolvedTag: string,
    options?: { forceEqualWeights?: boolean }
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

    const weights: Record<string, number> = {};
    const currentWeightSum = enabledKeys.reduce(
      (sum, k) => sum + (Number(baseConfig[k]?.weight) || 0),
      0
    );

    if (options?.forceEqualWeights || currentWeightSum === 0) {
      const baseWeight = Math.floor(100 / enabledKeys.length);
      const remainder = 100 - baseWeight * enabledKeys.length;
      enabledKeys.forEach((key, idx) => {
        weights[key] = baseWeight + (idx < remainder ? 1 : 0);
      });
    } else if (currentWeightSum === 100) {
      enabledKeys.forEach((key) => {
        weights[key] = Number(baseConfig[key]?.weight) || 0;
      });
    } else {
      let runningSum = 0;
      const sortedKeysByWeightDesc = [...enabledKeys].sort(
        (a, b) => (Number(baseConfig[b]?.weight) || 0) - (Number(baseConfig[a]?.weight) || 0)
      );

      enabledKeys.forEach((key) => {
        const rawW = Number(baseConfig[key]?.weight) || 0;
        const scaled = Math.max(1, Math.round((rawW / currentWeightSum) * 100));
        weights[key] = scaled;
        runningSum += scaled;
      });

      const diff = 100 - runningSum;
      if (diff !== 0 && sortedKeysByWeightDesc.length > 0) {
        const topKey = sortedKeysByWeightDesc[0];
        weights[topKey] = Math.max(1, weights[topKey] + diff);
      }
    }

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

    const computeTotalEst = () => {
      return enabledKeys.reduce((sum, key) => {
        const d = distMap[key];
        return sum + getEstimatedModuleDuration(key, d);
      }, 0);
    };

    let totalEst = computeTotalEst();
    const priorityModules = ["SIMULATION", "CODING", "DEBUGGING", "SQL", "NOSQL", "TEST_SCENARIOS", "AI_PROMPTING", "MCQ"];
    let maxIterations = 200;

    while (totalEst > targetDuration && maxIterations > 0) {
      maxIterations--;
      let reduced = false;

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

    ALL_DRIVE_MODULES.forEach((key) => {
      if (enabledKeys.includes(key)) {
        const d = distMap[key];
        const estTime = getEstimatedModuleDuration(key, d);

        nextConfig[key] = {
          ...(nextConfig[key] || {}),
          enabled: true,
          weight: weights[key],
          requiredCount: d.reqCount,
          durationMinutes: estTime,
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

  const togglePinWeight = (modId: string) => {
    setPinnedWeights((prev) => ({
      ...prev,
      [modId]: !prev[modId],
    }));
  };

  const handleWeightChange = (modId: string, val: number) => {
    const clampedVal = Math.min(100, Math.max(0, val));
    const nextPinned = { ...pinnedWeights, [modId]: true };
    setPinnedWeights(nextPinned);

    const enabledKeys = ALL_DRIVE_MODULES.filter((k) => moduleConfig[k]?.enabled);
    if (enabledKeys.length <= 1) {
      setModuleConfig((prev) => ({
        ...prev,
        [modId]: { ...prev[modId], weight: clampedVal },
      }));
      return;
    }

    const unpinnedEntries = enabledKeys.filter((k) => k !== modId && !nextPinned[k]);
    let pinnedSum = clampedVal;
    for (const k of enabledKeys) {
      if (k !== modId && nextPinned[k]) {
        pinnedSum += Number(moduleConfig[k]?.weight) || 0;
      }
    }

    const updated = { ...moduleConfig };
    updated[modId] = { ...updated[modId], weight: clampedVal };

    if (unpinnedEntries.length > 0) {
      const remainingWeight = Math.max(0, 100 - pinnedSum);
      const currentUnpinnedSum = unpinnedEntries.reduce(
        (sum, k) => sum + (Number(moduleConfig[k]?.weight) || 0),
        0
      );

      let allocatedUnpinned = 0;
      unpinnedEntries.forEach((k, idx) => {
        let w = 0;
        if (idx === unpinnedEntries.length - 1) {
          w = Math.max(0, remainingWeight - allocatedUnpinned);
        } else {
          if (currentUnpinnedSum > 0) {
            const ratio = (Number(moduleConfig[k]?.weight) || 0) / currentUnpinnedSum;
            w = Math.round(remainingWeight * ratio);
          } else {
            w = Math.floor(remainingWeight / unpinnedEntries.length);
          }
          allocatedUnpinned += w;
        }
        updated[k] = { ...updated[k], weight: w };
      });
    }

    const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
    const lowerName = (drive?.roleTemplateName || "").toLowerCase();
    const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
      lowerName.includes("l1") ? "l1" : (
        lowerName.includes("l2") ? "l2" : "l3"
      )
    );

    enabledKeys.forEach((k) => {
      const conf = updated[k];
      if (!pinnedDifficulties[k]) {
        const reqCount = getRequiredQuestionCount(k, conf.weight, totalDuration, resolvedTag);
        const dist = getDefaultDifficultyDistribution(reqCount, resolvedTag);
        const estTime = getEstimatedModuleDuration(k, dist);
        updated[k] = {
          ...conf,
          requiredCount: reqCount,
          difficultyDistribution: dist,
          durationMinutes: estTime,
        } as any;
      }
    });

    setModuleConfig(updated);
  };

  const handleDifficultyChange = (modId: string, diffKey: "easy" | "medium" | "hard", val: number) => {
    setPinnedDifficulties((prev) => ({ ...prev, [modId]: true }));
    const conf = moduleConfig[modId];
    const currentDist = (conf as any).difficultyDistribution || { easy: 0, medium: 0, hard: 0 };
    const nextDist = { ...currentDist, [diffKey]: Math.max(0, val) };
    const reqCount = (Number(nextDist.easy) || 0) + (Number(nextDist.medium) || 0) + (Number(nextDist.hard) || 0);
    const estTime = getEstimatedModuleDuration(modId, nextDist);

    setModuleConfig((prev) => ({
      ...prev,
      [modId]: {
        ...prev[modId],
        requiredCount: reqCount,
        difficultyDistribution: nextDist,
        durationMinutes: estTime,
      } as any,
    }));
  };

  const handleSmartFitToTime = () => {
    const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
    const enabledKeys = ALL_DRIVE_MODULES.filter((k) => moduleConfig[k]?.enabled && Number(moduleConfig[k]?.weight) > 0);
    if (enabledKeys.length === 0) return;

    const nextConfig = { ...moduleConfig };
    const distMap: Record<string, { easy: number; medium: number; hard: number }> = {};

    enabledKeys.forEach((k) => {
      const conf = nextConfig[k];
      distMap[k] = { ...((conf as any).difficultyDistribution || { easy: 0, medium: 0, hard: 0 }) };
    });

    const computeTotalEst = () => {
      return enabledKeys.reduce((sum, k) => sum + getEstimatedModuleDuration(k, distMap[k]), 0);
    };

    let totalEst = computeTotalEst();
    const priorityModules = ["SIMULATION", "CODING", "DEBUGGING", "SQL", "NOSQL", "TEST_SCENARIOS", "AI_PROMPTING", "MCQ"];
    let maxIterations = 200;

    while (totalEst > totalDuration && maxIterations > 0) {
      maxIterations--;
      let reduced = false;

      for (const mod of priorityModules) {
        if (!enabledKeys.includes(mod as any)) continue;
        const d = distMap[mod];
        if (d.hard > 0) {
          d.hard--;
          d.medium++;
          reduced = true;
          totalEst = computeTotalEst();
          if (totalEst <= totalDuration) break;
        }
      }

      if (totalEst <= totalDuration) break;

      if (!reduced || totalEst > totalDuration) {
        for (const mod of priorityModules) {
          if (!enabledKeys.includes(mod as any)) continue;
          const d = distMap[mod];
          if (d.medium > 0) {
            d.medium--;
            d.easy++;
            reduced = true;
            totalEst = computeTotalEst();
            if (totalEst <= totalDuration) break;
          }
        }
      }

      if (!reduced) break;
    }

    enabledKeys.forEach((k) => {
      const d = distMap[k];
      const reqCount = d.easy + d.medium + d.hard;
      const estTime = getEstimatedModuleDuration(k, d);
      nextConfig[k] = {
        ...nextConfig[k],
        requiredCount: reqCount,
        difficultyDistribution: d,
        durationMinutes: estTime,
      } as any;
    });

    setModuleConfig(nextConfig);
    toast.success(`Assessment question counts smartly fitted to ${totalDuration} min window!`);
  };

  const handleAutoBalanceWeights = () => {
    setPinnedWeights({});
    setPinnedDifficulties({});
    const lowerName = (drive?.roleTemplateName || "").toLowerCase();
    const resolvedTag = lowerName.includes("fresher") ? "fresher" : (
      lowerName.includes("l1") ? "l1" : (
        lowerName.includes("l2") ? "l2" : "l3"
      )
    );
    const windowMins = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
    const aligned = autoAlignModuleConfig(moduleConfig, windowMins, resolvedTag, { forceEqualWeights: true });
    setModuleConfig(aligned);
    toast.success("Core scoring weights equally balanced across active modules (100% split)!");
  };

  const weightValidation = useMemo(() => {
    return validateDriveModuleWeights(moduleConfig);
  }, [moduleConfig]);

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

  // Resolved question objects and Timing / Scoring Metrics
  const assignedQuestionObjects = useMemo(() => {
    return (assignedQuestions || []).map((id) => {
      const found = questionsBank.find((q) => q.id === id);
      if (found) return found;
      return {
        id,
        moduleType: "MCQ",
        difficulty: "medium",
        content: { prompt: "Assigned Question" },
      };
    });
  }, [assignedQuestions, questionsBank]);

  const totalContentDuration = useMemo(() => {
    return assignedQuestionObjects.reduce((sum, q: any) => {
      const dur = q.durationMinutes || (q.content as any)?.durationMinutes;
      if (dur && dur > 0) return sum + dur;
      const modTimes = DEFAULT_TIME_MATRIX[q.moduleType] || { EASY: 5, MEDIUM: 5, HARD: 5 };
      const diffKey = String(q.difficulty || "MEDIUM").toUpperCase();
      return sum + (modTimes[diffKey] || modTimes.MEDIUM || 5);
    }, 0);
  }, [assignedQuestionObjects]);

  const totalContentPoints = useMemo(() => {
    return assignedQuestionObjects.reduce((sum, q: any) => {
      const pts = q.points || (q.scoringConfig as any)?.points;
      if (pts && pts > 0) return sum + pts;
      const diff = String(q.difficulty || "medium").toLowerCase();
      return sum + (diff === "hard" ? 3 : diff === "medium" ? 2 : 1);
    }, 0);
  }, [assignedQuestionObjects]);

  const scheduledWindowDuration = useMemo(() => {
    return computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;
  }, [startHour, startMinute, startAmPm, endHour, endMinute, endAmPm]);

  // Timing mismatch diagnostics are strictly targeted for Bulk Import drives where content duration comes dynamically from CSV
  const shouldShowTimingDiagnostics = isBulkImportDrive;
  const isTimingOverBudget = shouldShowTimingDiagnostics && totalContentDuration > scheduledWindowDuration;
  const isTimingUnderBudget = shouldShowTimingDiagnostics && totalContentDuration > 0 && totalContentDuration < scheduledWindowDuration;
  const timingMismatchDiff = Math.abs(scheduledWindowDuration - totalContentDuration);

  const templateModulesSummary = useMemo(() => {
    if (!isTemplateGoverned) return null;

    const assignedObjs = (assignedQuestions || []).map((id) =>
      questionsBank.find((q) => q.id === id) || { id, moduleType: "MCQ", difficulty: "MEDIUM" }
    );

    const modulesPresent = Array.from(
      new Set(
        assignedObjs.map((q) => {
          const isDebug = q.moduleType === "DEBUGGING" || (Array.isArray((q as any).tags) && (q as any).tags.includes("debugging"));
          return isDebug ? "DEBUGGING" : q.moduleType;
        })
      )
    ).filter(Boolean);

    const activeModules = modulesPresent.length > 0
      ? modulesPresent
      : ["MCQ", "SQL", "NOSQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS"].filter((k) => moduleConfig[k]?.enabled);

    const preset = ((drive as any)?.roleTemplate?.weightingPreset as Record<string, number>) || {};

    const summaryData = activeModules.map((modId) => {
      const modQuestions = assignedObjs.filter((q) => {
        const isDebug = q.moduleType === "DEBUGGING" || (Array.isArray((q as any).tags) && (q as any).tags.includes("debugging"));
        const m = isDebug ? "DEBUGGING" : q.moduleType;
        return m === modId;
      });

      const count = modQuestions.length || ((moduleConfig[modId] as any)?.requiredCount || 1);
      const easyCount = modQuestions.filter((q) => (q.difficulty || "").toUpperCase() === "EASY").length;
      const mediumCount = modQuestions.filter((q) => (q.difficulty || "").toUpperCase() === "MEDIUM").length;
      const hardCount = modQuestions.filter((q) => (q.difficulty || "").toUpperCase() === "HARD").length;

      let rawWeight = preset[modId] !== undefined ? preset[modId] : (moduleConfig[modId]?.weight || 0);
      let weight = rawWeight > 100 ? Math.round(rawWeight / 100) : (rawWeight <= 1 && rawWeight > 0 ? Math.round(rawWeight * 100) : Math.round(rawWeight));
      if (weight === 0 && activeModules.length > 0) {
        weight = Math.round(100 / activeModules.length);
      }

      const duration = moduleConfig[modId]?.durationMinutes || Math.max(5, Math.round((weight / 100) * 90));

      return {
        modId,
        enabled: true,
        weight,
        marks: weight,
        count,
        dist: {
          easy: easyCount || (count === 1 ? 1 : Math.ceil(count / 2)),
          medium: mediumCount || (count > 1 ? Math.floor(count / 2) : 0),
          hard: hardCount || 0,
        },
        estTime: duration,
      };
    });

    let totalWeight = summaryData.reduce((sum, m) => sum + m.weight, 0);
    if (summaryData.length > 0 && totalWeight !== 100) {
      if (totalWeight === 0) {
        const base = Math.floor(100 / summaryData.length);
        const rem = 100 - base * summaryData.length;
        summaryData.forEach((m, idx) => {
          m.weight = base + (idx < rem ? 1 : 0);
          m.marks = m.weight;
        });
      } else {
        let running = 0;
        summaryData.forEach((m, idx) => {
          if (idx === summaryData.length - 1) {
            m.weight = Math.max(1, 100 - running);
          } else {
            m.weight = Math.max(1, Math.round((m.weight / totalWeight) * 100));
            running += m.weight;
          }
          m.marks = m.weight;
        });
      }
      totalWeight = 100;
    }

    const totalMarks = 100;
    const totalQuestions = summaryData.reduce((sum, m) => sum + m.count, 0);

    return {
      summaryData,
      totalDuration: 90,
      totalWeight: 100,
      totalMarks: 100,
      totalQuestions,
      totalEstTime: 90,
      isOverTime: false,
      overflowMinutes: 0,
      resolvedTag: "standard",
    };
  }, [isTemplateGoverned, assignedQuestions, questionsBank, moduleConfig, drive]);

  const driveEvaluationSummary = useMemo(() => {
    if (isTemplateGoverned && templateModulesSummary) {
      return templateModulesSummary;
    }

    if (isBulkImportDrive) {
      const summaryData = ["MCQ", "SQL", "NOSQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS"]
        .map((modId) => {
          const conf = moduleConfig[modId] || { enabled: false, weight: 0 };
          if (!conf.enabled || Number(conf.weight) <= 0) {
            return { modId, enabled: false, weight: 0, marks: 0, count: 0, dist: { easy: 0, medium: 0, hard: 0 }, estTime: 0 };
          }
          const modQuestions = assignedQuestionObjects.filter((q: any) => {
            const isDebug = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
            const m = isDebug ? "DEBUGGING" : q.moduleType;
            return m === modId;
          });
          const easyCount = modQuestions.filter((q: any) => (q.difficulty || "").toUpperCase() === "EASY").length;
          const mediumCount = modQuestions.filter((q: any) => (q.difficulty || "").toUpperCase() === "MEDIUM").length;
          const hardCount = modQuestions.filter((q: any) => (q.difficulty || "").toUpperCase() === "HARD").length;
          const weight = Number(conf.weight) || 0;
          const estTime = modQuestions.reduce((sum: number, q: any) => {
            const dur = q.durationMinutes || (q.content as any)?.durationMinutes;
            if (dur && dur > 0) return sum + dur;
            const modTimes = DEFAULT_TIME_MATRIX[modId] || { EASY: 5, MEDIUM: 5, HARD: 5 };
            const diffKey = String(q.difficulty || "MEDIUM").toUpperCase();
            return sum + (modTimes[diffKey] || modTimes.MEDIUM || 5);
          }, 0) || conf.durationMinutes || 15;

          return {
            modId,
            enabled: true,
            weight,
            marks: weight,
            count: modQuestions.length,
            dist: { easy: easyCount, medium: mediumCount, hard: hardCount },
            estTime,
          };
        })
        .filter((m) => m.enabled);

      const totalWeight = summaryData.reduce((sum, m) => sum + m.weight, 0);
      const totalMarks = summaryData.reduce((sum, m) => sum + m.marks, 0);
      const totalQuestions = summaryData.reduce((sum, m) => sum + m.count, 0);
      const totalDuration = scheduledWindowDuration;
      const totalEstTime = totalContentDuration;
      const isOverTime = totalContentDuration > scheduledWindowDuration;
      const overflowMinutes = isOverTime ? Number((totalContentDuration - scheduledWindowDuration).toFixed(1)) : 0;

      return {
        summaryData,
        totalDuration,
        totalWeight,
        totalMarks,
        totalQuestions,
        totalEstTime,
        isOverTime,
        overflowMinutes,
        resolvedTag: "standard",
      };
    }

    // CUSTOM_MANUAL:
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
        const dist = (conf as any).difficultyDistribution || getDefaultDifficultyDistribution(getRequiredQuestionCount(modId, weight, totalDuration, resolvedTag), resolvedTag);
        const reqCount = (conf as any).requiredCount !== undefined ? (conf as any).requiredCount : ((Number(dist.easy) || 0) + (Number(dist.medium) || 0) + (Number(dist.hard) || 0));
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
  }, [isTemplateGoverned, templateModulesSummary, isBulkImportDrive, assignedQuestionObjects, scheduledWindowDuration, totalContentDuration, moduleConfig, startHour, startMinute, startAmPm, endHour, endMinute, endAmPm, rollingWindow, drive]);

  const questionDeficits = useMemo(() => {
    // Question deficits checklist is strictly for CUSTOM_MANUAL drives!
    // For Bulk Import, Template, and Partner API drives, bypass deficit checks completely.
    if (!isManualDrive) {
      return [];
    }

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
  }, [isManualDrive, driveEvaluationSummary, assignedQuestions, questionsBank]);

  const areQuestionsFullyAssigned = useMemo(() => {
    if (isManualDrive) {
      return questionDeficits.length === 0 && assignedQuestions.length > 0;
    }
    return assignedQuestions.length > 0;
  }, [isManualDrive, questionDeficits, assignedQuestions]);

  const isScheduleUnlocked = useMemo(() => {
    if (isPartnerApi) {
      return hasCandidatesSelected && assignedQuestions.length > 0;
    }
    if (isTemplateDrive) {
      return (
        isScheduleDateValid &&
        hasCandidatesSelected &&
        assignedQuestions.length > 0
      );
    }
    if (isBulkImportDrive) {
      return (
        isScheduleDateValid &&
        hasCandidatesSelected &&
        assignedQuestions.length > 0 &&
        !isTimingOverBudget
      );
    }
    // CUSTOM_MANUAL:
    return (
      isScheduleDateValid &&
      hasCandidatesSelected &&
      weightValidation.valid &&
      !driveEvaluationSummary.isOverTime &&
      areQuestionsFullyAssigned
    );
  }, [
    isPartnerApi,
    isTemplateDrive,
    isBulkImportDrive,
    isScheduleDateValid,
    hasCandidatesSelected,
    isTimingOverBudget,
    weightValidation,
    driveEvaluationSummary,
    areQuestionsFullyAssigned,
    assignedQuestions,
  ]);

  const validateCumulativeDuration = (config = moduleConfig): boolean => {
    if (isTemplateGoverned) return true;
    const windowMins = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;

    let totalEstMins = 0;
    for (const [modId, conf] of Object.entries(config)) {
      if (!conf.enabled || Number(conf.weight) <= 0) continue;
      const dist = (conf as any).difficultyDistribution || { easy: 0, medium: 0, hard: 0 };
      totalEstMins += getEstimatedModuleDuration(modId, dist);
    }

    if (totalEstMins > windowMins) {
      const overflow = (totalEstMins - windowMins).toFixed(1);
      toast.error(
        `⚠ Estimated assessment time (${totalEstMins} min) exceeds the configured ${windowMins}-minute limit by ${overflow} minutes. Click "Smart Fit to Time" or reduce question counts.`
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
    if (isTemplateGoverned && totalDuration < 90) {
      toast.error("Standard role templates require at least a 90-minute assessment window.");
      return;
    }

    const updatedModuleConfig = { ...moduleConfig };
    for (const [modId, conf] of Object.entries(updatedModuleConfig)) {
      if (!conf.enabled || Number(conf.weight) <= 0) continue;
      const dist = (conf as any).difficultyDistribution || getDefaultDifficultyDistribution(getRequiredQuestionCount(modId, conf.weight, totalDuration, resolvedTag), resolvedTag);
      const reqCount = (Number(dist.easy) || 0) + (Number(dist.medium) || 0) + (Number(dist.hard) || 0);
      const estTime = getEstimatedModuleDuration(modId, dist);
      updatedModuleConfig[modId] = {
        ...conf,
        requiredCount: reqCount,
        difficultyDistribution: dist,
        durationMinutes: estTime,
      } as any;
    }

    const enabledEntries = Object.entries(updatedModuleConfig).filter(
      ([m, conf]) => conf && conf.enabled && (globalEnabledModules.length === 0 || globalEnabledModules.includes(m))
    );
    if (enabledEntries.length === 0) {
      toast.error("At least one assessment module must be enabled.");
      return;
    }

    // Automatically rebalance active enabled modules to strictly sum to 100%
    const currentWeightSum = enabledEntries.reduce((s, [_, c]) => s + (Number(c.weight) || 0), 0);
    if (currentWeightSum !== 100) {
      let running = 0;
      enabledEntries.forEach(([modId, conf], idx) => {
        const rawW = Number(conf.weight) || 0;
        let scaled = 0;
        if (idx === enabledEntries.length - 1) {
          scaled = Math.max(1, 100 - running);
        } else {
          scaled = currentWeightSum > 0 ? Math.max(1, Math.round((rawW / currentWeightSum) * 100)) : Math.floor(100 / enabledEntries.length);
          running += scaled;
        }
        updatedModuleConfig[modId] = {
          ...conf,
          weight: scaled,
        };
      });
    }

    if (isManualDrive) {
      const weightVal = validateDriveModuleWeights(updatedModuleConfig);
      if (!weightVal.valid) {
        toast.error(weightVal.error || "Invalid module score weights configuration.");
        return;
      }

      if (!validateCumulativeDuration(updatedModuleConfig)) {
        return;
      }
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
          moduleConfig: {
            ...updatedModuleConfig,
            creationPathway: pathway,
            isCustomRole: isCustomRole,
            proctoringConfig,
          },
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
    if (isTemplateGoverned) return false;
    const roster = drive?.roster || [];
    if (roster.length === 0) return true;
    const ungeneratedCount = roster.filter((c) => !c.isGenerated).length;
    return ungeneratedCount >= 1;
  }, [drive, isTemplateGoverned]);

  const handleSaveQuestions = async () => {
    if (!isQuestionsEditable) {
      toast.error(
        isTemplateGoverned
          ? "Drive questions are locked by Role Template to ensure standard candidate evaluation."
          : "Drive questions are locked because all candidate links have already been generated."
      );
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
    if (isTemplateGoverned) {
      setActiveTab("roster");
      return;
    }
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

  const handleAutoExtendWindow = () => {
    pushHistory(`Auto-Extend Window (${totalContentDuration}m)`);
    const derived = computeEndTimeWithDuration(startHour, startMinute, startAmPm, totalContentDuration);
    setEndHour(derived.endHour);
    setEndMinute(derived.endMinute);
    setEndAmPm(derived.endAmPm);
    toast.success(
      `Extended scheduled window to ${totalContentDuration} minutes (${startHour}:${startMinute} ${startAmPm} - ${derived.endHour}:${derived.endMinute} ${derived.endAmPm}).`,
      {
        action: {
          label: "Undo",
          onClick: () => handleUndo(),
        },
      }
    );
  };

  const handleFitWindowToContent = () => {
    pushHistory(`Fit Window (${totalContentDuration}m)`);
    const derived = computeEndTimeWithDuration(startHour, startMinute, startAmPm, totalContentDuration);
    setEndHour(derived.endHour);
    setEndMinute(derived.endMinute);
    setEndAmPm(derived.endAmPm);
    toast.success(
      `Adjusted schedule window to match content duration (${totalContentDuration} mins).`,
      {
        action: {
          label: "Undo",
          onClick: () => handleUndo(),
        },
      }
    );
  };

  const handleFetchDeficitSuggestions = async () => {
    try {
      setIsLoadingSuggestions(true);
      const res = await suggestDeficitQuestions(driveId, timingMismatchDiff);
      setSuggestedDeficitData(res);
      const initialSelected = (res?.suggestedQuestions || []).map((q: any) => q.id);
      setDeficitSelectedQuestionIds(initialSelected);
      setDeficitModuleFilter("ALL");
      setDeficitSearchQuery("");
      setSuggestedDeficitModalOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch suggested questions");
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleToggleDeficitQuestion = (questionId: string) => {
    setDeficitSelectedQuestionIds((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    );
  };

  const handleSelectAllSuggestedDeficit = () => {
    const suggestedIds = (suggestedDeficitData?.suggestedQuestions || []).map((q: any) => q.id);
    setDeficitSelectedQuestionIds(Array.from(new Set([...deficitSelectedQuestionIds, ...suggestedIds])));
  };

  const handleClearDeficitSelection = () => {
    setDeficitSelectedQuestionIds([]);
  };

  const handleApplyInteractiveDeficitQuestions = async (selectedDuration: number) => {
    if (deficitSelectedQuestionIds.length === 0) {
      toast.error("Please select at least one question to add.");
      return;
    }
    pushHistory(`Add ${deficitSelectedQuestionIds.length} question(s) (+${selectedDuration}m)`);
    const combined = Array.from(new Set([...assignedQuestions, ...deficitSelectedQuestionIds]));
    setAssignedQuestions(combined);
    await saveDriveQuestions(driveId, combined);
    setSuggestedDeficitModalOpen(false);
    toast.success(`Assigned ${deficitSelectedQuestionIds.length} question(s) totaling +${selectedDuration}m to drive!`, {
      action: {
        label: "Undo",
        onClick: () => handleUndo(),
      },
    });
    loadData();
  };

  const handleDirectCSVUpload = async (file: File) => {
    try {
      setIsCsvUploading(true);
      const text = await file.text();
      const driveTag = `Drive: ${drive?.name || "Assessment"}`;
      const parseResult = parseQuestionsFromCSV(text, DEFAULT_TIME_MATRIX, driveTag);

      if (parseResult.errors.length > 0) {
        toast.error(parseResult.errors[0]);
        return;
      }

      if (parseResult.questions.length === 0) {
        toast.error("No valid questions found in CSV.");
        return;
      }

      // 1. Bulk upload questions
      const created = await bulkUploadQuestions("ALL", parseResult.questions);
      const newQuestionIds = Array.isArray(created) ? created.map((q: any) => q.id) : [];

      // 2. Associate to drive
      const currentIds = drive?.questionIds || [];
      const combinedIds = Array.from(new Set([...currentIds, ...newQuestionIds]));
      setAssignedQuestions(combinedIds);
      await saveDriveQuestions(driveId, combinedIds);

      // 3. Decouple module selection: Enable detected modules & set Strategy A weights!
      const nextModConfig: Record<string, any> = {
        ...moduleConfig,
        creationPathway: "CUSTOM_BULK_IMPORT",
        creationMethod: "BULK_IMPORT",
        isBulkImport: true,
      };
      ALL_MODULE_KEYS.forEach((mod) => {
        if (parseResult.detectedModules.includes(mod)) {
          nextModConfig[mod] = {
            ...nextModConfig[mod],
            enabled: true,
            weight: parseResult.moduleWeights[mod] || 0,
            durationMinutes: parseResult.moduleDurations[mod] || 15,
          };
        } else {
          nextModConfig[mod] = {
            ...nextModConfig[mod],
            enabled: false,
            weight: 0,
          };
        }
      });
      setModuleConfig(nextModConfig);

      // 4. Timing auto-extension if content duration exceeds scheduled window
      if (parseResult.totalDurationMinutes > scheduledWindowDuration) {
        const derived = computeEndTimeWithDuration(startHour, startMinute, startAmPm, parseResult.totalDurationMinutes);
        setEndHour(derived.endHour);
        setEndMinute(derived.endMinute);
        setEndAmPm(derived.endAmPm);
        toast.success(
          `Imported ${parseResult.questions.length} questions across ${parseResult.detectedModules.join(", ")}. Window auto-extended to ${parseResult.totalDurationMinutes}m.`
        );
      } else {
        toast.success(
          `Imported ${parseResult.questions.length} questions across ${parseResult.detectedModules.join(", ")} with Strategy A weights!`
        );
      }

      loadData();
    } catch (err: any) {
      console.error("Direct CSV Upload failed:", err);
      toast.error(err.message || "Failed to import questions from CSV");
    } finally {
      setIsCsvUploading(false);
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
    if (isManualDrive && questionDeficits.length > 0) {
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

  const handleAutoAssignQuestions = (targetModId?: string) => {
    const modulesToProcess = targetModId
      ? [targetModId]
      : allowedModules.filter((m) => {
        const conf = moduleConfig[m];
        return conf && conf.enabled && Number(conf.weight) > 0;
      });

    let newAssigned = [...assignedQuestions];
    let newlyAddedCount = 0;
    const resolvedTag = driveEvaluationSummary.resolvedTag || "fresher";
    const totalDuration = computeTimeWindowMinutes(startHour, startMinute, startAmPm, endHour, endMinute, endAmPm) || 90;

    modulesToProcess.forEach((modId) => {
      const conf = moduleConfig[modId];
      if (!conf || !conf.enabled || Number(conf.weight) <= 0) return;

      const reqCount = getRequiredQuestionCount(modId, conf.weight, totalDuration, resolvedTag);
      const dist = (conf as any).difficultyDistribution || getDefaultDifficultyDistribution(reqCount, resolvedTag);

      // Current attached questions for this module
      const currentModQuestions = (questionsBank || []).filter((q) => {
        const isDebug = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
        const displayMod = isDebug ? "DEBUGGING" : q.moduleType;
        return newAssigned.includes(q.id) && displayMod === modId;
      });

      const missingCount = reqCount - currentModQuestions.length;
      if (missingCount <= 0) return;

      // Available unassigned questions for this module
      const availableUnassigned = (questionsBank || []).filter((q) => {
        if (q.status === "ARCHIVED") return false;
        const isDebug = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
        const displayMod = isDebug ? "DEBUGGING" : q.moduleType;
        return !newAssigned.includes(q.id) && displayMod === modId;
      });

      const easyNeed = Math.max(0, dist.easy - currentModQuestions.filter((q) => (q.difficulty || "medium").toUpperCase() === "EASY").length);
      const mediumNeed = Math.max(0, dist.medium - currentModQuestions.filter((q) => (q.difficulty || "medium").toUpperCase() === "MEDIUM").length);
      const hardNeed = Math.max(0, dist.hard - currentModQuestions.filter((q) => (q.difficulty || "medium").toUpperCase() === "HARD").length);

      const deptKey = (driveTargetDept || "").toLowerCase().replace(/[^a-z0-9]/g, "");

      const sortQuestions = (list: typeof availableUnassigned) => {
        return [...list].sort((a, b) => {
          const aDeptMatch = (a.role || "").toLowerCase().includes(deptKey) || (a.tags || []).some((t: string) => t.toLowerCase().includes(deptKey));
          const bDeptMatch = (b.role || "").toLowerCase().includes(deptKey) || (b.tags || []).some((t: string) => t.toLowerCase().includes(deptKey));
          if (aDeptMatch && !bDeptMatch) return -1;
          if (!aDeptMatch && bDeptMatch) return 1;
          const aTagMatch = (a.tags || []).some((t: string) => t.toLowerCase().includes(resolvedTag));
          const bTagMatch = (b.tags || []).some((t: string) => t.toLowerCase().includes(resolvedTag));
          if (aTagMatch && !bTagMatch) return -1;
          if (!aTagMatch && bTagMatch) return 1;
          return 0;
        });
      };

      const selectedForMod: string[] = [];

      // Pass 1: Try satisfying difficulty distribution
      const easyPool = sortQuestions(availableUnassigned.filter((q) => (q.difficulty || "medium").toUpperCase() === "EASY"));
      const mediumPool = sortQuestions(availableUnassigned.filter((q) => (q.difficulty || "medium").toUpperCase() === "MEDIUM"));
      const hardPool = sortQuestions(availableUnassigned.filter((q) => (q.difficulty || "medium").toUpperCase() === "HARD"));

      easyPool.slice(0, easyNeed).forEach((q) => selectedForMod.push(q.id));
      mediumPool.slice(0, mediumNeed).forEach((q) => selectedForMod.push(q.id));
      hardPool.slice(0, hardNeed).forEach((q) => selectedForMod.push(q.id));

      // Pass 2: Fill remainder from any available questions in this module
      if (selectedForMod.length < missingCount) {
        const remainingPool = sortQuestions(availableUnassigned.filter((q) => !selectedForMod.includes(q.id)));
        remainingPool.slice(0, missingCount - selectedForMod.length).forEach((q) => selectedForMod.push(q.id));
      }

      selectedForMod.forEach((id) => {
        newAssigned.push(id);
        newlyAddedCount++;
      });
    });

    if (newlyAddedCount > 0) {
      setAssignedQuestions(newAssigned);
      toast.success(
        targetModId
          ? `Auto-assigned ${newlyAddedCount} question(s) for ${MODULE_LABEL_MAP[targetModId] || targetModId} from Question Bank!`
          : `Auto-assigned ${newlyAddedCount} missing question(s) across modules from Question Bank!`
      );
    } else {
      toast.info("No matching questions available to auto-assign.");
    }
  };

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
        {/* Hidden Global CSV File Input for Drive Direct Question Ingestion */}
        <input
          ref={csvFileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              handleDirectCSVUpload(e.target.files[0]);
              e.target.value = "";
            }
          }}
        />

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
                  if (!isScheduleDateValid && !isPartnerApi) reasons.push("valid future date & time");
                  if (!hasCandidatesSelected) reasons.push("at least 1 candidate roster item");
                  if (isManualDrive && !weightValidation.valid) reasons.push("module weights must total 100%");
                  if (isManualDrive && driveEvaluationSummary.isOverTime) reasons.push("estimated duration within schedule window");
                  if (isBulkImportDrive && isTimingOverBudget) reasons.push(`content duration exceeds window by +${timingMismatchDiff}m (click Auto-Extend)`);
                  if (isManualDrive && questionDeficits.length > 0) {
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

          {/* Details Subtitle: Role Template, Direct Origin, Active, Upfront Bulk Import */}
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
                  ${drive.status === 'DRAFT' ? 'bg-slate-100 text-slate-700 border-slate-300' : ''}
                  ${drive.status === 'CLOSED' ? 'bg-slate-50 text-slate-500 border-slate-200' : ''}
                `}
                title="Click to change Drive Status"
              >
                {drive.status === 'ACTIVE' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                )}
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
                        <span>{item.label}</span>
                        {drive.status === item.id && <Check size={12} className="text-[#2E5DE0]" />}
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
                isFixedDuration={isTemplateGoverned}
                fixedDurationMinutes={90}
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

            {/* SECTION 2: Module Selection & 100-Point Scoring Ceiling (Decoupled for Template vs Custom) */}
            {isTemplateGoverned ? (
              <div
                className="w-full max-w-[1263px] bg-white rounded-[16px] p-6 shadow-[-4px_4px_15px_0px_rgba(156,163,175,0.2)] border border-[#E9EEFE] space-y-5"
                style={{ fontFamily: "Instrument Sans, sans-serif" }}
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E9EEFE] pb-4">
                  <div className="flex items-center gap-2.5">
                    <Layers size={18} className="text-[#2E5DE0]" />
                    <div>
                      <h3 className="text-[16px] font-bold text-[#1E1B4B] leading-none">
                        Pre-Calibrated Assessment Modules (Role Template Governed)
                      </h3>
                      <p className="text-[12px] text-[#6B7280] mt-1">
                        Modules, question distributions, and scoring weights are standardized and pre-calibrated by the role template.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="h-[27px] px-[12px] py-[6px] rounded-[14px] text-[12px] font-bold bg-[#D1FAE5] text-[#065F46] inline-flex items-center justify-center gap-1.5">
                      <CheckCircle2 size={12} className="text-[#059669]" />
                      <span>Total Weight: 100 / 100 pts</span>
                    </span>
                    <span className="h-[27px] px-[12px] py-[6px] rounded-[14px] text-[12px] font-bold bg-[#EEF2FF] text-[#2E5DE0] inline-flex items-center justify-center gap-1.5">
                      <Clock size={12} />
                      <span>90-min Fixed Window</span>
                    </span>
                  </div>
                </div>

                {/* Compact Pre-Calibrated Module Tabs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 pt-1">
                  {(() => {
                    const MODULE_ICONS: Record<string, any> = {
                      MCQ: FigmaMcqIcon,
                      SQL: FigmaSqlIcon,
                      NOSQL: FigmaSqlIcon,
                      CODING: FigmaCodingDsaIcon,
                      DEBUGGING: FigmaDebuggingIcon,
                      AI_PROMPTING: FigmaAiPromptingIcon,
                      SIMULATION: FigmaContextualSimulationIcon,
                      TEST_SCENARIOS: FileText,
                    };
                    const MODULE_NAMES: Record<string, string> = {
                      MCQ: "Multiple Choice",
                      SQL: "SQL Queries",
                      NOSQL: "NoSQL Queries",
                      CODING: "Coding / DSA",
                      DEBUGGING: "Debugging",
                      AI_PROMPTING: "AI Prompting",
                      SIMULATION: "Simulation",
                      TEST_SCENARIOS: "Test Scenarios",
                    };

                    const activeList = (templateModulesSummary?.summaryData || []).filter((m) => m.count > 0 || m.weight > 0);

                    if (activeList.length === 0) {
                      return (
                        <div className="col-span-full p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                          Calibrating template modules...
                        </div>
                      );
                    }

                    return activeList.map((m) => {
                      const Icon = MODULE_ICONS[m.modId] || Layers;
                      const displayName = MODULE_NAMES[m.modId] || m.modId;
                      return (
                        <div
                          key={m.modId}
                          className="rounded-[14px] border border-[#D5DAEC] bg-gradient-to-b from-white to-[#F8FAFC] p-3.5 space-y-2.5 shadow-2xs hover:border-[#2E5DE0] transition-colors"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Icon size={16} className="text-[#2E5DE0] shrink-0" />
                              <span className="font-bold text-[13px] text-[#1E1B4B] truncate" title={displayName}>
                                {displayName}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-[#065F46] bg-[#D1FAE5] px-1.5 py-0.5 rounded font-bold shrink-0">
                              {m.weight}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono text-[#6B7280] pt-1.5 border-t border-[#E9EEFE]">
                            <span className="font-bold text-[#1E1B4B]">{m.count} {m.count === 1 ? "Question" : "Questions"}</span>
                            <span>{m.estTime} min</span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : (
              /* Full Interactive Module Selection for Custom Roles */
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
                    {/* Weight Badge */}
                    <span
                      className={`h-[27px] px-[12px] py-[6px] rounded-[14px] text-[12px] font-bold inline-flex items-center justify-center ${weightValidation.valid
                        ? "bg-[#D1FAE5] text-[#065F46]"
                        : "bg-rose-50 text-rose-700 border border-red-200"
                        }`}
                    >
                      Total Weight: {weightValidation.coreSum} / 100 pts
                    </span>

                    {/* Auto-Balance Weights & Smart Fit to Time Buttons (CUSTOM_MANUAL Only) */}
                    {isManualDrive && (
                      <>
                        <button
                          type="button"
                          onClick={handleAutoBalanceWeights}
                          className="h-[27px] px-[12px] py-[6px] text-[12px] font-bold text-[#2E5DE0] bg-[#2E5DE014] hover:bg-[#2E5DE024] rounded-[14px] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                          title="Equally balance 100 points across all active modules"
                        >
                          <Sparkles size={12} className="text-[#2E5DE0]" />
                          <span>Auto-Balance Weights</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSmartFitToTime}
                          className="h-[27px] px-[12px] py-[6px] text-[12px] font-bold text-white bg-gradient-to-r from-[#3A91ED] to-[#2E5DE0] hover:opacity-95 rounded-[14px] shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                          title="Adjust question difficulty mixes to fit within your assessment time window"
                        >
                          <Clock size={12} className="text-white" />
                          <span>Smart Fit to Time</span>
                        </button>
                      </>
                    )}

                    {/* Bulk Import Questions Button */}
                    <button
                      type="button"
                      disabled={isCsvUploading}
                      onClick={() => csvFileInputRef.current?.click()}
                      className="h-[27px] px-[12px] py-[6px] text-[12px] font-bold text-white bg-gradient-to-r from-[#3A91ED] to-[#2E5DE0] hover:opacity-95 rounded-[14px] shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                      title="Ingest questions via CSV to auto-detect modules and calibrate Strategy A weights"
                    >
                      {isCsvUploading ? <Loader2 size={12} className="animate-spin text-[#2E5DE0]" /> : <Upload size={12} />}
                      <span>Bulk Import via CSV</span>
                    </button>
                  </div>
                </div>

                {/* Live Assessment Time Gauge Bar */}
                {(() => {
                  const { totalEstTime, totalDuration, isOverTime, overflowMinutes } = driveEvaluationSummary;
                  const percentUsed = Math.min(100, Math.round((totalEstTime / (totalDuration || 1)) * 100));
                  const buffer = Math.max(0, totalDuration - totalEstTime);

                  return (
                    <div className="bg-[#F8FAFC] border border-[#E9EEFE] rounded-[14px] p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-[#2E5DE0]" />
                          <span className="font-bold text-[#1E1B4B]">Estimated Assessment Solving Time:</span>
                          <span className="font-mono font-bold text-[#2E5DE0]">{totalEstTime} min</span>
                          <span className="text-[#6B7280]">/ {totalDuration} min window</span>
                        </div>
                        <div>
                          {isOverTime ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              <AlertTriangle size={12} />
                              Over by {overflowMinutes} min — click Smart Fit to Time
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 size={12} />
                              {buffer} min buffer remaining
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Visual progress bar */}
                      <div className="w-full bg-[#E9EEFE] h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${isOverTime ? "bg-rose-500" : percentUsed > 90 ? "bg-amber-500" : "bg-[#2E5DE0]"
                            }`}
                          style={{ width: `${percentUsed}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Module Cards Grid */}
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
                    const conf = moduleConfig[mod.id] || { enabled: false, durationMinutes: 15, weight: 15, isBonus: false };
                    const isPinned = !!pinnedWeights[mod.id];

                    const dist = (conf as any).difficultyDistribution || { easy: 0, medium: 0, hard: 0 };
                    const reqCount = (conf as any).requiredCount !== undefined
                      ? (conf as any).requiredCount
                      : (Number(dist.easy) || 0) + (Number(dist.medium) || 0) + (Number(dist.hard) || 0);
                    const estDuration = getEstimatedModuleDuration(mod.id, dist);

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
                        {/* Card Header */}
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
                            {/* Score Weight with Pin/Unpin */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[12px] font-semibold text-[#1E1B4B]">
                                  Score Weight (%)
                                </label>
                                <button
                                  type="button"
                                  onClick={() => togglePinWeight(mod.id)}
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold cursor-pointer transition-all flex items-center gap-1 ${isPinned
                                      ? "bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE] hover:bg-[#E0E7FF]"
                                      : "bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0] hover:bg-[#E2E8F0] hover:text-[#334155]"
                                    }`}
                                  title={isPinned ? "Click to unlock automatic weight rebalancing" : "Click to pin this weight"}
                                >
                                  {isPinned ? (
                                    <>
                                      <Pin size={10} className="text-[#4F46E5] fill-[#4F46E5]" />
                                      <span>Pinned</span>
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles size={10} className="text-[#64748B]" />
                                      <span>Auto</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                placeholder="0"
                                value={conf.weight !== undefined && conf.weight !== null ? conf.weight : 0}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const val = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                                  handleWeightChange(mod.id, val);
                                }}
                                onFocus={(e) => e.target.select()}
                                className={`w-full h-[36px] px-3 rounded-[18px] border font-mono font-bold text-[14px] text-[#1E1B4B] focus:outline-none focus:border-[#2E5DE0] ${isPinned ? "border-indigo-300 bg-indigo-50/20" : "border-[#E9EEFE] bg-white"
                                  }`}
                              />
                            </div>

                            {mod.id === "AI_PROMPTING" && (
                              <div className="pt-2 border-t border-[#E9EEFE] space-y-1.5">
                                <label className="block text-[11px] font-semibold text-[#1E1B4B]">Question &amp; Validation Source</label>
                                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F8FAFC] border border-[#E9EEFE] rounded-[10px]">
                                  <label
                                    onClick={() =>
                                      setModuleConfig({
                                        ...moduleConfig,
                                        [mod.id]: { ...(conf as any), questionSource: "AI_DYNAMIC" } as any,
                                      })
                                    }
                                    className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-[7px] text-[11px] font-medium transition-all cursor-pointer select-none ${((conf as any).questionSource || "AI_DYNAMIC") === "AI_DYNAMIC"
                                        ? "bg-white text-[#2E5DE0] shadow-2xs border border-[#2E5DE0]/20 font-bold"
                                        : "text-[#6B7280] hover:text-[#1E1B4B]"
                                      }`}
                                  >
                                    <input
                                      type="radio"
                                      name="aiPromptingSource"
                                      checked={((conf as any).questionSource || "AI_DYNAMIC") === "AI_DYNAMIC"}
                                      onChange={() => { }}
                                      className="w-3 h-3 text-[#2E5DE0] accent-[#2E5DE0] cursor-pointer"
                                    />
                                    <span>AI Generated</span>
                                  </label>

                                  <label
                                    onClick={() =>
                                      setModuleConfig({
                                        ...moduleConfig,
                                        [mod.id]: { ...(conf as any), questionSource: "STATIC_BANK" } as any,
                                      })
                                    }
                                    className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-[7px] text-[11px] font-medium transition-all cursor-pointer select-none ${(conf as any).questionSource === "STATIC_BANK"
                                        ? "bg-white text-[#2E5DE0] shadow-2xs border border-[#2E5DE0]/20 font-bold"
                                        : "text-[#6B7280] hover:text-[#1E1B4B]"
                                      }`}
                                  >
                                    <input
                                      type="radio"
                                      name="aiPromptingSource"
                                      checked={(conf as any).questionSource === "STATIC_BANK"}
                                      onChange={() => { }}
                                      className="w-3 h-3 text-[#2E5DE0] accent-[#2E5DE0] cursor-pointer"
                                    />
                                    <span>Question Bank</span>
                                  </label>
                                </div>
                              </div>
                            )}

                            {/* Direct Question Complexity Control */}
                            {isManualDrive ? (
                              <div className="pt-2 border-t border-[#E9EEFE] space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-[#1E1B4B]">
                                    Question Difficulty (Total: {reqCount})
                                  </span>
                                  <span className="text-[11px] text-[#2E5DE0] bg-[#2E5DE014] px-1.5 py-0.5 rounded font-bold font-mono">
                                    ⏱ {estDuration} min
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="block text-[10px] text-emerald-700 font-bold mb-0.5 uppercase tracking-wide">Easy</label>
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={dist.easy !== undefined && dist.easy !== null ? dist.easy : 0}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const val = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                                        handleDifficultyChange(mod.id, "easy", val);
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      className="w-full h-[30px] px-2 rounded-[14px] border border-[#E9EEFE] font-mono font-bold text-xs text-[#1E1B4B] focus:outline-none focus:border-[#2E5DE0]"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-amber-700 font-bold mb-0.5 uppercase tracking-wide">Medium</label>
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={dist.medium !== undefined && dist.medium !== null ? dist.medium : 0}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const val = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                                        handleDifficultyChange(mod.id, "medium", val);
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      className="w-full h-[30px] px-2 rounded-[14px] border border-[#E9EEFE] font-mono font-bold text-xs text-[#1E1B4B] focus:outline-none focus:border-[#2E5DE0]"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-rose-700 font-bold mb-0.5 uppercase tracking-wide">Hard</label>
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={dist.hard !== undefined && dist.hard !== null ? dist.hard : 0}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const val = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                                        handleDifficultyChange(mod.id, "hard", val);
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      className="w-full h-[30px] px-2 rounded-[14px] border border-[#E9EEFE] font-mono font-bold text-xs text-[#1E1B4B] focus:outline-none focus:border-[#2E5DE0]"
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-2 border-t border-[#E9EEFE] flex items-center justify-between text-xs">
                                <span className="font-semibold text-[#1E1B4B]">
                                  Imported: {reqCount} questions
                                </span>
                                <span className="text-[11px] text-[#2E5DE0] bg-[#2E5DE014] px-1.5 py-0.5 rounded font-bold font-mono">
                                  ⏱ {estDuration} min
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                  {isTemplateGoverned ? (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-[12px] text-xs text-emerald-800 font-medium">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>✓ Assessment configuration fits within the configured 90-minute limit ({totalEstTime} min estimated).</span>
                    </div>
                  ) : isOverTime ? (
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
                        onClick={handleSmartFitToTime}
                        className="shrink-0 px-3.5 py-2 bg-[#2E5DE0] hover:bg-[#254ec4] text-white text-xs font-bold rounded-[10px] shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles size={14} className="text-amber-300" />
                        <span>Smart Fit to {totalDuration} min</span>
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
                    {isPartnerApi
                      ? "Partner Assessment Questions"
                      : isTemplateDrive
                        ? "Template Assigned Questions"
                        : isBulkImportDrive
                          ? "Imported Assessment Questions"
                          : "Question Bank Assignment"}
                  </h3>
                  <p className="text-[13px] text-[#6B7280] mt-1.5">
                    {isPartnerApi
                      ? "Standardized assessment questions governed by partner integration."
                      : isTemplateDrive
                        ? "Standardized assessment questions pre-calibrated by the selected Role Template."
                        : isBulkImportDrive
                          ? "Questions ingested from CSV and calibrated to your schedule window."
                          : "Review, calibrate, and verify questions assigned to this drive assessment."}
                  </p>
                </div>
              </div>

              {/* Locked Warning Banner */}
              {!isQuestionsEditable && (
                <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px] text-[13px] text-[#B45309] flex items-center gap-2.5">
                  <Lock size={16} className="text-[#B45309] shrink-0" />
                  <span>
                    <strong>
                      {isPartnerApi
                        ? "Partner Integration Governed:"
                        : isTemplateDrive
                          ? "Role Template Governed:"
                          : "Questions Locked:"}
                    </strong>{" "}
                    {isPartnerApi
                      ? "Questions are governed by partner integration to ensure uniform candidate evaluation. Preview questions in read-only mode below."
                      : isTemplateDrive
                        ? "Questions are standardized and pre-calibrated by the selected Role Template to ensure uniform candidate evaluation. Preview questions in read-only mode below."
                        : "All candidate invite links have already been generated for this drive. Questions are present below for review in read-only mode."}
                  </span>
                </div>
              )}

              {/* Timing Mismatch Diagnostic Alerts (CUSTOM_BULK_IMPORT Only) */}
              {isTimingOverBudget && (
                <div className="p-4 rounded-[12px] bg-rose-50 border border-rose-200 text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[13.5px] font-bold text-rose-900 flex items-center gap-2">
                        <span>Over-Budget: Content Exceeds Scheduled Drive Window</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-200 text-rose-800 font-mono font-bold">
                          +{timingMismatchDiff}m Over
                        </span>
                      </div>
                      <p className="text-[12px] text-rose-800 mt-0.5">
                        Assigned questions require <strong>{totalContentDuration} mins</strong> (Total Marks: {totalContentPoints}), but the scheduled drive window is only <strong>{scheduledWindowDuration} mins</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleAutoExtendWindow}
                      className="h-[32px] px-3.5 py-1 text-[12px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                      title={`Extend schedule window end time to allow full ${totalContentDuration}m`}
                    >
                      <Sparkles size={13} className="text-amber-300" />
                      <span>Auto-Extend Window ({totalContentDuration}m)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHighlightTrimmingMode(!highlightTrimmingMode)}
                      className={`h-[32px] px-3 py-1 text-[12px] font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5 ${
                        highlightTrimmingMode
                          ? "bg-rose-100 text-rose-900 border-rose-300"
                          : "bg-white text-rose-700 border-rose-300 hover:bg-rose-50"
                      }`}
                    >
                      <span>{highlightTrimmingMode ? "Done Trimming" : "Rework / Trim Questions"}</span>
                    </button>
                    {historyStack.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUndo}
                        className="h-[32px] px-3.5 py-1 text-[12px] font-bold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                        title={`Undo: ${historyStack[historyStack.length - 1].label}`}
                      >
                        <Undo2 size={13} className="text-white" />
                        <span>Undo ({historyStack[historyStack.length - 1].label})</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isTimingUnderBudget && (
                <div className="p-4 rounded-[12px] bg-amber-50 border border-amber-200 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[13.5px] font-bold text-amber-900 flex items-center gap-2">
                        <span>Under-Budget: Schedule Window Has Deficit</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 font-mono font-bold">
                          {timingMismatchDiff}m Deficit
                        </span>
                      </div>
                      <p className="text-[12px] text-amber-800 mt-0.5">
                        Assigned questions total <strong>{totalContentDuration} mins</strong> (Total Marks: {totalContentPoints}), but the scheduled drive window is <strong>{scheduledWindowDuration} mins</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleFitWindowToContent}
                      className="h-[32px] px-3.5 py-1 text-[12px] font-semibold text-[#475569] bg-white hover:bg-slate-50 border border-[#CBD5E1] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      title={`Shorten schedule window to match content duration (${totalContentDuration}m)`}
                    >
                      <span>Fit Window to Content ({totalContentDuration}m)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFetchDeficitSuggestions}
                      disabled={isLoadingSuggestions}
                      className="h-[32px] px-3.5 py-1 text-[12px] font-bold text-white bg-[#2F5CFF] hover:bg-[#0037FF] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                      title={`Find matching questions in Question Bank whose total duration fills the +${timingMismatchDiff}m deficit`}
                    >
                      {isLoadingSuggestions ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Sparkles size={13} className="text-blue-100" />
                      )}
                      <span>Add Matching Questions (+{timingMismatchDiff}m)</span>
                    </button>
                    {historyStack.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUndo}
                        className="h-[32px] px-3.5 py-1 text-[12px] font-bold text-[#0F172A] bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                        title={`Undo: ${historyStack[historyStack.length - 1].label}`}
                      >
                        <Undo2 size={13} className="text-[#0F172A]" />
                        <span>Undo ({historyStack[historyStack.length - 1].label})</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* QuestionsListContainer: Assigned Questions Section */}
              <div className="w-full border border-[#E9EEFE] rounded-[12px] overflow-hidden">
                {/* ListHeader */}
                <div className="h-auto min-h-[42px] px-5 py-2.5 bg-[#F2F2FB] border-b border-[#E9EEFE] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-[#2E5DE0]" />
                    <h4 className="text-[14px] font-bold text-[#1E1B4B]">
                      Assigned Questions for this Drive ({assignedQuestions.length})
                    </h4>
                    {assignedQuestions.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="h-[20px] px-2 py-0.5 rounded-[6px] bg-slate-200/80 text-[#334155] text-[11px] font-mono font-semibold inline-flex items-center gap-1">
                          <Clock size={10} className="text-[#64748B]" />
                          {totalContentDuration}m
                        </span>
                        <span className="h-[20px] px-2 py-0.5 rounded-[6px] bg-amber-100/70 text-amber-900 text-[11px] font-mono font-semibold inline-flex items-center gap-1 border border-amber-200">
                          <Award size={10} className="text-amber-700" />
                          {totalContentPoints} pts
                        </span>
                        {historyStack.length > 0 && (
                          <button
                            type="button"
                            onClick={handleUndo}
                            className="h-[22px] px-2.5 py-0.5 rounded-[6px] bg-[#0F172A] hover:bg-[#1E293B] text-white text-[11px] font-bold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                            title={`Undo: ${historyStack[historyStack.length - 1].label}`}
                          >
                            <Undo2 size={11} className="text-white" />
                            <span>Undo</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isQuestionsEditable && isManualDrive && questionDeficits.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleAutoAssignQuestions()}
                        className="h-[26px] px-2.5 py-0.5 text-[11px] font-bold text-white bg-gradient-to-r from-[#3A91ED] to-[#2E5DE0] hover:opacity-95 rounded-[13px] flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                        title="Automatically assign missing questions from Question Bank to satisfy all module requirements"
                      >
                        <Sparkles size={11} className="text-amber-300" />
                        <span>Auto-Assign All Missing ({questionDeficits.reduce((sum, d) => sum + d.missing, 0)})</span>
                      </button>
                    )}
                    {!isQuestionsEditable && (
                      <span className="h-[18px] px-2 py-0.5 rounded-[9px] bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309] text-[10px] font-bold flex items-center gap-1 uppercase tracking-wider">
                        <Lock size={10} /> Read-Only
                      </span>
                    )}
                  </div>
                </div>

                {/* Module Requirements Checklist Bar (CUSTOM_MANUAL Only) */}
                {isManualDrive && driveEvaluationSummary.summaryData.length > 0 && (
                  <div className="px-5 py-2.5 bg-[#FAF5FF] border-b border-[#E9D5FF] flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-[#581C87] uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 size={13} className="text-[#7E22CE]" />
                        Requirements Checklist:
                      </span>
                      {driveEvaluationSummary.summaryData.map((m) => {
                        const poolQuestions = (questionsBank || []).filter((q) => {
                          const isDebug = q.moduleType === "DEBUGGING" || (Array.isArray(q.tags) && q.tags.includes("debugging"));
                          const displayMod = isDebug ? "DEBUGGING" : q.moduleType;
                          return assignedQuestions.includes(q.id) && displayMod === m.modId;
                        });
                        const isSatisfied = poolQuestions.length >= m.count;
                        return (
                          <span
                            key={m.modId}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[12px] text-[11px] font-bold border transition-all ${
                              isSatisfied
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                : "bg-amber-50 text-amber-900 border-amber-300"
                            }`}
                          >
                            <span>{MODULE_LABEL_MAP[m.modId] || m.modId}</span>
                            <span className="font-mono">({poolQuestions.length}/{m.count})</span>
                            {isSatisfied ? <Check size={11} className="text-emerald-600" /> : <AlertTriangle size={11} className="text-amber-600" />}
                          </span>
                        );
                      })}
                    </div>
                    {questionDeficits.length === 0 ? (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/60 px-2.5 py-0.5 rounded-full border border-emerald-300">
                        All module requirements fulfilled ✓
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-100/60 px-2.5 py-0.5 rounded-full border border-amber-300">
                        {questionDeficits.reduce((sum, d) => sum + d.missing, 0)} questions remaining to satisfy checklist
                      </span>
                    )}
                  </div>
                )}

                {assignedQuestions.length === 0 ? (
                  <div className="p-6 text-center text-[13px] text-[#9CA3AF] italic bg-white">
                    No questions assigned to this drive yet. Select and assign questions from the Question Bank below.
                  </div>
                ) : (
                  <div className={`divide-y divide-[#E9EEFE] bg-white ${isTemplateGoverned || assignedQuestions.length > 0 ? "max-h-[550px]" : "max-h-[300px]"} overflow-y-auto`}>
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
                      const dur = (q as any).durationMinutes || (q.content as any)?.durationMinutes || (DEFAULT_TIME_MATRIX[displayModule] || { EASY: 5, MEDIUM: 5, HARD: 5 })[String(q.difficulty || "MEDIUM").toUpperCase()] || 5;
                      const pts = (q as any).points || (q as any).scoringConfig?.points || (String(q.difficulty || "medium").toLowerCase() === "hard" ? 3 : String(q.difficulty || "medium").toLowerCase() === "medium" ? 2 : 1);
                      return (
                        <div
                          key={qId}
                          onClick={() => setPreviewQuestion(q)}
                          className={`px-5 py-3.5 flex items-center justify-between gap-4 transition-colors cursor-pointer group ${
                            highlightTrimmingMode
                              ? "bg-rose-50/40 hover:bg-rose-50 border-l-4 border-l-rose-500"
                              : "hover:bg-[#F8FAFC]"
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                            <span className="h-[22px] min-w-[50px] px-3 py-0.5 rounded-[12px] bg-[#EEF2FF] text-[#4F46E5] text-[11px] font-bold inline-flex items-center justify-center shrink-0 uppercase tracking-wide">
                              {MODULE_LABEL_MAP[displayModule] || displayModule}
                            </span>
                            <span className="text-[13.5px] font-medium text-[#1E1B4B] group-hover:text-[#2E5DE0] transition-colors truncate leading-[140%]">
                              {title}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="h-[20px] px-2 py-0.5 rounded-[6px] bg-slate-100 text-[#475569] text-[11px] font-mono font-medium inline-flex items-center gap-1">
                                <Clock size={10} className="text-[#64748B]" />
                                {dur}m
                              </span>
                              <span className="h-[20px] px-2 py-0.5 rounded-[6px] bg-amber-50 text-amber-800 text-[11px] font-mono font-medium inline-flex items-center gap-1 border border-amber-200/60">
                                <Award size={10} className="text-amber-600" />
                                {pts} pts
                              </span>
                            </div>
                          </div>

                          {/* Row Actions with exact aligned widths */}
                          <div className={`${isTemplateGoverned ? "w-[84px]" : highlightTrimmingMode ? "w-[200px]" : "w-[172px]"} flex items-center justify-end gap-2.5 shrink-0`} onClick={(e) => e.stopPropagation()}>
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
                              highlightTrimmingMode ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    pushHistory(`Trim question (-${dur}m)`);
                                    setAssignedQuestions(assignedQuestions.filter((id) => id !== qId));
                                    toast.info(`Trimmed question (-${dur}m).`, {
                                      action: {
                                        label: "Undo",
                                        onClick: () => handleUndo(),
                                      },
                                    });
                                  }}
                                  className="h-[28px] px-3 rounded-[14px] bg-rose-600 hover:bg-rose-700 text-white font-bold text-[12px] flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                                  title={`Trim question (-${dur}m)`}
                                >
                                  <Trash2 size={12} />
                                  <span>Trim (-{dur}m)</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    pushHistory(`Remove question`);
                                    setAssignedQuestions(assignedQuestions.filter((id) => id !== qId));
                                    toast.info("Question removed from drive.", {
                                      action: {
                                        label: "Undo",
                                        onClick: () => handleUndo(),
                                      },
                                    });
                                  }}
                                  className="w-[76px] h-[28px] rounded-[14px] bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[12px] font-semibold flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  Remove
                                </button>
                              )
                            ) : isTemplateGoverned ? null : (
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

              {/* Central Question Bank Selector Toggle (Custom Role Drives Only) */}
              {!isTemplateGoverned && (
                <>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setShowBankSelector(!showBankSelector)}
                      className="h-[32px] px-4 text-[12px] font-semibold text-[#2E5DE0] bg-[#EEF2FF] hover:bg-blue-100 border border-[#2E5DE033] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <BookOpen size={13} />
                      <span>{showBankSelector ? "Hide Central Question Bank" : "+ Add More Questions from Question Bank"}</span>
                    </button>
                    {assignedQuestions.length === 0 && (
                      <span className="text-[12px] text-amber-700 font-medium">
                        Please assign assessment questions from the library below.
                      </span>
                    )}
                  </div>

                  {(showBankSelector || assignedQuestions.length === 0) && (
                    <div className="space-y-4 pt-3 border-t border-[#E9EEFE]">
                      {/* FilterBar (Module tabs + Complexity filters) */}
                      <div id="question-bank-selector-section" className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuestionModuleFilter("ALL")}
                        className={`h-[32px] px-3.5 py-1.5 rounded-[16px] text-[13px] transition-colors cursor-pointer ${questionModuleFilter === "ALL"
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
                              className={`h-[32px] px-3.5 py-1.5 rounded-[16px] text-[13px] transition-colors cursor-pointer ${questionModuleFilter === modKey
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
                            className={`h-[27px] px-3 py-1 rounded-[14px] text-[11px] font-bold transition-colors cursor-pointer ${questionDifficultyFilter === diff.id
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
                                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-[6px] ${difficulty.toUpperCase() === "EASY"
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
                                const isLimitReached = isManualDrive && !isSelected && modAssigned.length >= reqCount;

                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isSelected) {
                                        setAssignedQuestions(assignedQuestions.filter((id) => id !== q.id));
                                      } else {
                                        if (isManualDrive && modAssigned.length >= reqCount) {
                                          toast.error(`Required question limit reached (${reqCount} questions) for ${displayModule}. No additional questions can be added.`);
                                          return;
                                        }
                                        setAssignedQuestions([...assignedQuestions, q.id]);
                                      }
                                    }}
                                    className={`w-[76px] h-[28px] rounded-[14px] text-[12px] font-semibold transition-colors cursor-pointer flex items-center justify-center ${isSelected
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
              )}
            </>
          )}
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
            <div className="border border-[#E9EEFE] rounded-[12px] overflow-x-auto bg-white">
              <table className="w-full text-left text-[13.5px] border-collapse min-w-[780px]">
                <colgroup>
                  <col className="w-[24%]" />
                  <col className="w-[28%]" />
                  <col className="w-[14%]" />
                  <col className="w-[18%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <thead>
                  <tr className="h-[44px] bg-[#F2F2FB] text-[11px] font-bold text-[#64748B] uppercase tracking-[0.5px] border-b border-[#E9EEFE]">
                    <th className="pl-6 pr-4 py-3 whitespace-nowrap">Candidate</th>
                    <th className="px-4 py-3 whitespace-nowrap">Email</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Invite Link</th>
                    <th className="pl-4 pr-6 py-3 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EEFE] bg-white">
                  {drive.roster.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-[13px] italic text-[#9CA3AF]">
                        No candidates added to roster yet. Click "Add Candidate" above to get started.
                      </td>
                    </tr>
                  ) : (
                    drive.roster.map((c) => (
                      <tr key={c.candidateId} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="pl-6 pr-4 py-3.5 font-semibold text-[#1E1B4B]">
                          <div className="truncate max-w-[200px]" title={c.candidateName}>
                            {c.candidateName}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-[12.5px] text-[#6B7280]">
                          <div className="truncate max-w-[240px]" title={c.candidateEmail}>
                            {c.candidateEmail}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          {c.inviteStatus === "REDEEMED" || c.inviteStatus === "COMPLETED" ? (
                            <span
                              className="h-[22px] px-2.5 py-1 rounded-[11px] bg-[#E2F0D9] text-[#385723] text-[11px] font-bold uppercase tracking-[0.5px] inline-flex items-center justify-center leading-none whitespace-nowrap"
                              style={{ fontFamily: "Instrument Sans, sans-serif" }}
                            >
                              REDEEMED
                            </span>
                          ) : (
                            <span
                              className={`h-[22px] px-2.5 py-1 rounded-[11px] text-[11px] font-bold uppercase tracking-[0.5px] inline-flex items-center justify-center leading-none whitespace-nowrap ${
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
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          {c.isGenerated && c.inviteLink ? (
                            <button
                              type="button"
                              onClick={() => copyCandidateLink(c.inviteLink, c.candidateId)}
                              className="h-[27px] px-3.5 gap-1.5 rounded-[14px] bg-[#EFF6FF] border border-[#3B82F6] hover:bg-blue-100 text-[#2563EB] text-[12px] font-semibold inline-flex items-center justify-center transition-colors cursor-pointer shadow-xs whitespace-nowrap shrink-0"
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
                                  <span className="leading-none whitespace-nowrap">Copy Link</span>
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
                        <td className="pl-4 pr-6 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2.5 whitespace-nowrap">
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
                              className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              title="Remove candidate & revoke access"
                            >
                              <Trash2 size={15} />
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
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            style={{ fontFamily: "Instrument Sans, sans-serif" }}
            onClick={() => setPreviewQuestion(null)}
          >
            <div
              className="bg-white rounded-[16px] w-full max-w-[660px] shadow-[0px_20px_60px_0px_rgba(0,0,0,0.25)] p-6 sm:p-7 space-y-3 overflow-hidden z-[201]"
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
                    <path d="M9.66736 5.66704L5.66704 9.66736M5.66704 5.66704L9.66736 9.66736M14.3344 7.6672C14.3344 11.3494 11.3494 14.3344 7.6672 14.3344C3.98501 14.3344 1 11.3494 1 7.6672C1 3.98501 3.98501 1 7.6672 1C11.3494 1 14.3344 3.98501 14.3344 7.6672Z" stroke="#64748B" strokeWidth="2" strokeLinecap="round" />
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
                          className={`px-4 py-2 rounded-[8px] text-[13px] flex items-center justify-between transition-colors ${isCorrect
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
                  const isLimitReached = isManualDrive && !isAssigned && modAssigned.length >= reqCount;

                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (isAssigned) {
                          setAssignedQuestions(assignedQuestions.filter((id) => id !== previewQuestion.id));
                          setPreviewQuestion(null);
                        } else {
                          if (isManualDrive && modAssigned.length >= reqCount) {
                            toast.error(`Required question limit reached (${reqCount} questions) for ${displayModule}. No additional questions can be added.`);
                            return;
                          }
                          setAssignedQuestions([...assignedQuestions, previewQuestion.id]);
                          setPreviewQuestion(null);
                        }
                      }}
                      className={`min-w-[190px] h-[38px] px-5 rounded-[8px] text-[13px] font-bold transition-all shadow-sm flex items-center justify-center ${isAssigned
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
                    <path d="M9.66736 5.66704L5.66704 9.66736M5.66704 5.66704L9.66736 9.66736M14.3344 7.6672C14.3344 11.3494 11.3494 14.3344 7.6672 14.3344C3.98501 14.3344 1 11.3494 1 7.6672C1 3.98501 3.98501 1 7.6672 1C11.3494 1 14.3344 3.98501 14.3344 7.6672Z" stroke="#64748B" strokeWidth="2" strokeLinecap="round" />
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
                    <path d="M9.66736 5.66704L5.66704 9.66736M5.66704 5.66704L9.66736 9.66736M14.3344 7.6672C14.3344 11.3494 11.3494 14.3344 7.6672 14.3344C3.98501 14.3344 1 11.3494 1 7.6672C1 3.98501 3.98501 1 7.6672 1C11.3494 1 14.3344 3.98501 14.3344 7.6672Z" stroke="#64748B" strokeWidth="2" strokeLinecap="round" />
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
                    <path d="M9.66736 5.66704L5.66704 9.66736M5.66704 5.66704L9.66736 9.66736M14.3344 7.6672C14.3344 11.3494 11.3494 14.3344 7.6672 14.3344C3.98501 14.3344 1 11.3494 1 7.6672C1 3.98501 3.98501 1 7.6672 1C11.3494 1 14.3344 3.98501 14.3344 7.6672Z" stroke="#64748B" strokeWidth="2" strokeLinecap="round" />
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

            <div className="p-6 space-y-4 overflow-visible">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs-plus font-medium text-ink-secondary mb-1">Filter Department</label>
                  <CustomDropdown
                    value={templateDeptFilter}
                    onChange={setTemplateDeptFilter}
                    rounded="16px"
                    size="sm"
                    className="w-full"
                    options={[
                      { value: "all", label: "All Departments" },
                      { value: "SOFTWARE_ENGINEERING", label: "Software Engineering" },
                      { value: "DATA_ENGINEERING", label: "Data Engineering" },
                      { value: "QA_TESTING", label: "QA & Testing" },
                      { value: "DEVOPS_SRE", label: "DevOps & SRE" },
                      { value: "CYBERSECURITY", label: "Cybersecurity" },
                      { value: "PRODUCT_DESIGN", label: "Product & Design" },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-xs-plus font-medium text-ink-secondary mb-1">Filter Category</label>
                  <CustomDropdown
                    value={templateCategoryFilter}
                    onChange={setTemplateCategoryFilter}
                    rounded="16px"
                    size="sm"
                    className="w-full"
                    options={[
                      { value: "all", label: "All Categories" },
                      { value: "FRESHER", label: "Fresher (0-1 yrs)" },
                      { value: "EXPERIENCED", label: "Experienced (2+ yrs)" },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm-minus font-medium text-ink-secondary mb-1.5">
                  Select Role Template <span className="text-red-500">*</span>
                </label>
                <CustomDropdown
                  value={selectedTemplateForDrive}
                  onChange={setSelectedTemplateForDrive}
                  placeholder="-- Choose Role Template --"
                  rounded="16px"
                  size="md"
                  className="w-full"
                  options={(roleTemplates || [])
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
                      return {
                        value: tpl.id,
                        label: `${cleanRole} • ${tierDisplay} (v${tpl.version || 1})`,
                      };
                    })}
                />
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

      {/* Interactive Multi-Module Deficit Question Suggestions Modal */}
      {suggestedDeficitModalOpen && (() => {
        // Collect all pool questions
        const backendCandidates: any[] = suggestedDeficitData?.availableQuestions || [];
        const backendSuggestions: any[] = suggestedDeficitData?.suggestedQuestions || [];
        
        // Merge without duplicates, preferring availableQuestions or falling back to questionsBank
        const poolMap = new Map<string, any>();
        backendSuggestions.forEach((q) => poolMap.set(q.id, q));
        backendCandidates.forEach((q) => poolMap.set(q.id, q));
        questionsBank.forEach((q) => {
          if (!assignedQuestions.includes(q.id) && !poolMap.has(q.id)) {
            const modTimes = (DEFAULT_TIME_MATRIX as any)[q.moduleType] || { EASY: 5, MEDIUM: 5, HARD: 5 };
            const diffKey = String(q.difficulty || "MEDIUM").toUpperCase();
            const dur = (q.content as any)?.durationMinutes || modTimes[diffKey] || modTimes.MEDIUM || 5;
            const pts = (q.scoringConfig as any)?.points || (q.difficulty === "hard" ? 3 : q.difficulty === "medium" ? 2 : 1);
            poolMap.set(q.id, { ...q, durationMinutes: dur, points: pts });
          }
        });
        const allPoolQuestions = Array.from(poolMap.values());

        // Modules present with counts
        const moduleCounts: Record<string, number> = { ALL: allPoolQuestions.length };
        allPoolQuestions.forEach((q) => {
          moduleCounts[q.moduleType] = (moduleCounts[q.moduleType] || 0) + 1;
        });

        // Filtered pool
        const filteredDeficitPool = allPoolQuestions.filter((q) => {
          if (deficitModuleFilter !== "ALL" && deficitModuleFilter !== "SUGGESTED") {
            if (q.moduleType !== deficitModuleFilter) return false;
          }
          if (deficitModuleFilter === "SUGGESTED") {
            if (!backendSuggestions.some((s) => s.id === q.id)) return false;
          }
          if (deficitSearchQuery.trim()) {
            const query = deficitSearchQuery.toLowerCase().trim();
            const title = String(q.content?.title || q.content?.prompt || q.content?.question || "").toLowerCase();
            const tags = Array.isArray(q.tags) ? q.tags.join(" ").toLowerCase() : "";
            if (!title.includes(query) && !tags.includes(query) && !q.moduleType.toLowerCase().includes(query)) {
              return false;
            }
          }
          return true;
        });

        // Current selection metrics
        const selectedQuestions = allPoolQuestions.filter((q) => deficitSelectedQuestionIds.includes(q.id));
        const currentSelectedDuration = selectedQuestions.reduce((sum, q) => sum + (Number(q.durationMinutes) || 5), 0);
        const currentSelectedPoints = selectedQuestions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);
        const diffMinutes = currentSelectedDuration - timingMismatchDiff;

        return (
          <div
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setSuggestedDeficitModalOpen(false)}
          >
            <div
              className="bg-white rounded-2xl w-full max-w-[780px] shadow-2xl flex flex-col max-h-[90vh] z-[101] overflow-hidden border border-[#E2E8F0]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header with Live Counter Bar */}
              <div className="px-6 py-4 border-b border-[#E2E8F0] bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#EAF0FF] border border-[#B3C5FF] flex items-center justify-center text-[#2F5CFF] shrink-0">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#0B0B0D]">
                        Select Deficit Fill Questions
                      </h3>
                      <p className="text-xs text-[#5B5B64] mt-0.5">
                        Pick and choose questions across any module to fill the schedule window deficit.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSuggestedDeficitModalOpen(false)}
                    className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#0B0B0D] hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Real-time Deficit Balance Summary */}
                <div className="mt-3.5 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] shadow-2xs flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-600">
                      Target Deficit: <strong className="font-mono text-[#0B0B0D] font-bold">+{timingMismatchDiff}m</strong>
                    </div>
                    <div className="h-3 w-px bg-slate-200" />
                    <div className="text-xs text-slate-600">
                      Selected: <strong className="font-mono text-[#2F5CFF] font-bold">+{currentSelectedDuration}m</strong> ({deficitSelectedQuestionIds.length} qs, {currentSelectedPoints} pts)
                    </div>
                  </div>

                  <div>
                    {diffMinutes === 0 ? (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] flex items-center gap-1 font-mono">
                        <Check size={12} strokeWidth={3} /> Exact Match (+{timingMismatchDiff}m)
                      </span>
                    ) : diffMinutes < 0 ? (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] flex items-center gap-1 font-mono">
                        <Clock size={12} /> {Math.abs(diffMinutes)}m Remaining Deficit
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] flex items-center gap-1 font-mono">
                        <Plus size={12} /> +{diffMinutes}m Over Target
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Filters Bar: Search & Module Pills */}
              <div className="px-6 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by question title, prompt or tags..."
                      value={deficitSearchQuery}
                      onChange={(e) => setDeficitSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#CBD5E1] bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#2F5CFF]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllSuggestedDeficit}
                      className="text-[11px] font-semibold text-[#2F5CFF] hover:text-[#0037FF] cursor-pointer"
                    >
                      Select Smart Picks
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleClearDeficitSelection}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>

                {/* Module Pill Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setDeficitModuleFilter("ALL")}
                    className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                      deficitModuleFilter === "ALL"
                        ? "bg-[#2F5CFF] text-white shadow-2xs"
                        : "bg-white text-[#5B5B64] hover:bg-slate-100 hover:text-[#0B0B0D] border border-[#E2E8F0]"
                    }`}
                  >
                    All Modules ({allPoolQuestions.length})
                  </button>

                  {backendSuggestions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDeficitModuleFilter("SUGGESTED")}
                      className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
                        deficitModuleFilter === "SUGGESTED"
                          ? "bg-[#2F5CFF] text-white shadow-2xs"
                          : "bg-[#EAF0FF] text-[#2F5CFF] hover:bg-[#DBE6FF] border border-[#B3C5FF]"
                      }`}
                    >
                      <Sparkles size={11} />
                      <span>Smart Picks ({backendSuggestions.length})</span>
                    </button>
                  )}

                  {ALL_MODULE_KEYS.filter((mod) => (moduleCounts[mod] || 0) > 0).map((mod) => (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => setDeficitModuleFilter(mod)}
                      className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                        deficitModuleFilter === mod
                          ? "bg-[#2F5CFF] text-white shadow-2xs"
                          : "bg-white text-[#5B5B64] hover:bg-slate-100 hover:text-[#0B0B0D] border border-[#E2E8F0]"
                      }`}
                    >
                      {MODULE_LABEL_MAP[mod] || mod} ({moduleCounts[mod] || 0})
                    </button>
                  ))}
                </div>
              </div>

              {/* Questions List with Checkboxes */}
              <div className="p-6 space-y-2 overflow-y-auto flex-1 max-h-[380px] bg-[#F8FAFC]">
                {filteredDeficitPool.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400 italic">
                    No questions found matching the selected module filter or search query.
                  </div>
                ) : (
                  filteredDeficitPool.map((q) => {
                    const isSelected = deficitSelectedQuestionIds.includes(q.id);
                    const isSmartPick = backendSuggestions.some((s) => s.id === q.id);
                    const title = q.content?.title || q.content?.prompt || q.content?.question || `Question #${q.id.slice(0, 6)}`;
                    const dur = q.durationMinutes || 5;
                    const pts = q.points || 1;

                    return (
                      <div
                        key={q.id}
                        onClick={() => handleToggleDeficitQuestion(q.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? "bg-white border-[#2F5CFF] shadow-2xs ring-1 ring-[#2F5CFF]/20"
                            : "bg-white border-[#E2E8F0] hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {/* Checkbox */}
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0 ${
                              isSelected
                                ? "bg-[#2F5CFF] text-white"
                                : "border border-slate-300 bg-white"
                            }`}
                          >
                            {isSelected && <Check size={11} strokeWidth={3} />}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EEF2FF] text-[#4F46E5] uppercase font-mono">
                                {MODULE_LABEL_MAP[q.moduleType] || q.moduleType}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-[#475569] uppercase font-mono">
                                {q.difficulty}
                              </span>
                              {isSmartPick && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EAF0FF] text-[#2F5CFF] border border-[#B3C5FF] flex items-center gap-1">
                                  <Sparkles size={9} /> Smart Pick
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-[#0F172A] truncate">{title}</p>
                          </div>
                        </div>

                        {/* Badges & Preview */}
                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-100 text-[#475569] flex items-center gap-1">
                            <Clock size={11} className="text-[#64748B]" />
                            {dur}m
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200/60 flex items-center gap-1">
                            <Award size={11} className="text-amber-600" />
                            {pts} pts
                          </span>
                          <button
                            type="button"
                            onClick={() => setPreviewQuestion(q)}
                            className="p-1 text-slate-400 hover:text-[#2F5CFF] hover:bg-[#EAF0FF] rounded transition-colors"
                            title="Preview Question"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-[#E2E8F0] bg-white flex items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  Total Selected: <strong className="font-bold text-[#0F172A]">+{currentSelectedDuration}m</strong> ({deficitSelectedQuestionIds.length} questions, {currentSelectedPoints} pts)
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSuggestedDeficitModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deficitSelectedQuestionIds.length === 0}
                    onClick={() => handleApplyInteractiveDeficitQuestions(currentSelectedDuration)}
                    className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-[#2F5CFF] hover:bg-[#0037FF] rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    <span>Add Selected Questions (+{currentSelectedDuration}m)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </AppShell>
  );
}
