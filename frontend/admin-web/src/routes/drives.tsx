import { createFileRoute, Link, useNavigate, Outlet, useLocation } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Calendar,
  User,
  Eye,
  Copy,
  X,
  Check,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Sparkles,
  PenLine,
  BookOpen,
  RefreshCw,
  Lock,
  ChevronDown,
  UploadCloud,
  Upload,
  Download,
  Loader2,
  Clock,
  Award,
  FolderPlus,
  Folder,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type DriveStatus } from "../lib/types";
import { computeDriveStatus } from "@cd-recruit/shared-types";
import { formatDriveName } from "../lib/utils";
import { parseQuestionsFromCSV, downloadUnifiedSampleCSV } from "../lib/csvParser";
import { ALL_MODULE_KEYS, MODULE_LABEL_MAP } from "../lib/roleModules";

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
import { CustomDropdown } from "../components/ui/custom-dropdown";

export const Route = createFileRoute("/drives")({
  component: DrivesPage,
  head: () => ({
    meta: [
      { title: "Drives — Proctora" },
      {
        name: "description",
        content:
          "Manage assessment drives, configure question templates, and view candidate invites.",
      },
    ],
  }),
});

const STATUS_LABEL: Record<DriveStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  CLOSED: "Closed",
};

const STATUS_COLOR: Record<DriveStatus, string> = {
  DRAFT: "bg-surface-inset text-ink-secondary",
  SCHEDULED: "bg-brand-subtle text-brand-ink",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-amber-50 text-amber-700",
};

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "22 Jul 26";
  try {
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return "22 Jul 26";
    const day = dt.getDate();
    const month = dt.toLocaleString("en-US", { month: "short" });
    const year = String(dt.getFullYear()).slice(-2);
    return `${day} ${month} ${year}`;
  } catch {
    return "22 Jul 26";
  }
}

function DrivesPage() {
  const drives = useStore((s) => s.drives);
  const fetchDrives = useStore((s) => s.fetchDrives);
  const createDrive = useStore((s) => s.createDrive);
  const closeDrive = useStore((s) => s.closeDrive);
  const deleteDrive = useStore((s) => s.deleteDrive);
  const questions = useStore((s) => s.questions);
  const fetchQuestions = useStore((s) => s.fetchQuestions);
  const saveDriveQuestions = useStore((s) => s.saveDriveQuestions);
  const bulkUploadQuestions = useStore((s) => s.bulkUploadQuestions);
  const addCandidatesBulk = useStore((s) => s.addCandidatesBulk);
  const generateDriveLinks = useStore((s) => s.generateDriveLinks);
  const loading = useStore((s) => s.loading);
  const roleTemplates = useStore((s) => s.roleTemplates);
  const fetchRoleTemplates = useStore((s) => s.fetchRoleTemplates);

  const navigate = useNavigate();
  const location = useLocation();
  const isExactDrives = location.pathname === "/drives" || location.pathname === "/drives/";

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DriveStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "DIRECT" | "PARTNER_API">("all");
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [confirmDeleteDrive, setConfirmDeleteDrive] = useState<any | null>(null);
  const [confirmCloseDrive, setConfirmCloseDrive] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newDriveIds, setNewDriveIds] = useState<Set<string>>(new Set());
  const knownDriveIdsRef = useRef<Set<string>>(new Set());

  // Track which Partner API drives have been opened/viewed by the recruiter
  const [openedDriveIds, setOpenedDriveIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("cd-recruit-opened-partner-drives");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markDriveOpened = (id: string) => {
    setOpenedDriveIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem("cd-recruit-opened-partner-drives", JSON.stringify(Array.from(next)));
      } catch (e) {
        console.error("Failed to persist opened partner drives:", e);
      }
      return next;
    });
  };

  // Auto-open Create Drive wizard when navigated with ?create=true
  useEffect(() => {
    if (!isExactDrives) return;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("create") === "true" || searchParams.get("new") === "true") {
      setShowWizard(true);
      setStep(1);
    }
  }, [isExactDrives, location.search]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchDrives(undefined, true);
      toast.success("Drives list refreshed.");
    } catch {
      toast.error("Failed to refresh drives.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Wizard State
  const [step, setStep] = useState(1);
  const [creationMode, setCreationMode] = useState<"TEMPLATE" | "CUSTOM">("TEMPLATE");
  const [customRolePathway, setCustomRolePathway] = useState<"MANUAL" | "BULK_IMPORT">("MANUAL");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateDeptFilter, setTemplateDeptFilter] = useState<string>("all");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<string>("all");
  const [driveName, setDriveName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [experiencedLevel, setExperiencedLevel] = useState("L1");
  const [activeTemplatePreview, setActiveTemplatePreview] = useState<any | null>(null);
  const [isLoadingTemplatePreview, setIsLoadingTemplatePreview] = useState(false);
  const [templatePreviewError, setTemplatePreviewError] = useState<string | null>(null);

  // Direct CSV Bulk Import in Drive Creation Wizard
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParsedPreview, setCsvParsedPreview] = useState<any | null>(null);
  const [isCsvParsing, setIsCsvParsing] = useState(false);
  const [isCsvCreating, setIsCsvCreating] = useState(false);
  const bulkImportInputRef = useRef<HTMLInputElement | null>(null);

  const isDuplicateDriveName = useMemo(() => {
    const trimmed = driveName.trim().toLowerCase();
    if (!trimmed) return false;
    return (drives || []).some(
      (d) => d.name.toLowerCase().trim() === trimmed && d.status !== "CLOSED"
    );
  }, [driveName, drives]);

  const filteredTemplates = useMemo(() => {
    return (roleTemplates || []).filter((rt) => {
      if (templateDeptFilter !== "all" && (rt.department || "CUSTOM") !== templateDeptFilter) return false;
      const cat = (rt as any).category || (rt.level === "FRESHER" ? "FRESHER" : "EXPERIENCED");
      if (templateCategoryFilter !== "all" && cat !== templateCategoryFilter) return false;
      return true;
    });
  }, [roleTemplates, templateDeptFilter, templateCategoryFilter]);

  const selectedTemplateObj = useMemo(() => {
    return (roleTemplates || []).find((rt) => rt.id === selectedTemplateId);
  }, [roleTemplates, selectedTemplateId]);

  const handleSelectTemplate = (template: any) => {
    setSelectedTemplateId(template.id);
    setRole(template.roleName || "");
    const dateStr = new Date().toLocaleString("en-US", { month: "short", year: "numeric" });
    if (!driveName || driveName.includes("Drive")) {
      setDriveName(`${template.roleName} Drive - ${dateStr}`);
    }

    if (template.weightingPreset && typeof template.weightingPreset === "object") {
      const preset = template.weightingPreset as Record<string, number>;
      const entries = Object.entries(preset);
      if (entries.length > 0) {
        let total = entries.reduce((s, [_, v]) => s + (typeof v === "number" ? (v <= 1 && v > 0 ? Math.round(v * 100) : Math.round(v)) : 0), 0);
        const normalizedWeights: Record<string, number> = {};
        let running = 0;
        entries.forEach(([mod, v], idx) => {
          let w = typeof v === "number" ? (v <= 1 && v > 0 ? Math.round(v * 100) : Math.round(v)) : 0;
          if (total !== 100 && total > 0) {
            if (idx === entries.length - 1) {
              w = Math.max(1, 100 - running);
            } else {
              w = Math.max(1, Math.round((w / total) * 100));
              running += w;
            }
          }
          normalizedWeights[mod] = w;
        });

        setModulesConfig((prev) => {
          const next = { ...prev };
          Object.entries(normalizedWeights).forEach(([mod, w]) => {
            if (next[mod]) {
              next[mod] = {
                ...next[mod],
                enabled: w > 0,
                weight: w > 1 ? Number((w / 100).toFixed(2)) : w,
              };
            }
          });
          return next;
        });
      }
    }
  };

  const handleCsvFileSelected = async (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a .csv file.");
      return;
    }
    try {
      setIsCsvParsing(true);
      const text = await file.text();
      const defaultName = `Assessment Drive - ${new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
      const currentName = driveName.trim() || defaultName;
      const parseResult = parseQuestionsFromCSV(text, DEFAULT_TIME_MATRIX, currentName);

      if (parseResult.errors.length > 0) {
        toast.error(parseResult.errors[0]);
        return;
      }
      if (parseResult.questions.length === 0) {
        toast.error("No valid questions found in CSV.");
        return;
      }

      setCsvFile(file);
      setCsvParsedPreview(parseResult);
      if (!driveName.trim()) {
        setDriveName(currentName);
      }
      toast.success(
        `Parsed ${parseResult.questions.length} questions across ${parseResult.detectedModules.join(", ")}!`
      );
    } catch (err: any) {
      toast.error("Failed to parse CSV: " + err.message);
    } finally {
      setIsCsvParsing(false);
    }
  };

  const handleCreateDriveFromCSV = async () => {
    if (!csvParsedPreview || csvParsedPreview.questions.length === 0) {
      toast.error("Please select a valid questions CSV file first.");
      return;
    }
    const finalName = driveName.trim() || `Assessment Drive - ${new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;

    try {
      setIsCsvCreating(true);

      // Build module config with Strategy A weights and detected modules
      const modConfig: Record<string, any> = {
        isCustomRole: true,
        isBulkImport: true,
        creationMethod: "BULK_IMPORT",
        creationPathway: "CUSTOM_BULK_IMPORT",
      };
      ALL_MODULE_KEYS.forEach((mod) => {
        if (csvParsedPreview.detectedModules.includes(mod)) {
          modConfig[mod] = {
            enabled: true,
            weight: csvParsedPreview.moduleWeights[mod] || 0,
            durationMinutes: csvParsedPreview.moduleDurations[mod] || 15,
            questionWeighting: { mode: "equal" },
          };
        } else {
          modConfig[mod] = {
            enabled: false,
            weight: 0,
            durationMinutes: 0,
          };
        }
      });

      const now = new Date();
      const start = new Date(now.getTime() + 60 * 60 * 1000);
      start.setMinutes(0, 0, 0);
      const end = new Date(start.getTime() + Math.max(60, csvParsedPreview.totalDurationMinutes) * 60 * 1000);

      // 1. Create drive
      const result = await createDrive({
        name: finalName,
        roleTemplateId: "CUSTOM",
        status: "DRAFT",
        moduleConfig: modConfig,
        scheduleStart: start.toISOString(),
        scheduleEnd: end.toISOString(),
      });

      const newDriveId = result?.driveId || result?.id;
      if (!newDriveId) throw new Error("Failed to retrieve new Drive ID");

      // 2. Bulk upload questions
      const created = await bulkUploadQuestions("ALL", csvParsedPreview.questions);
      const questionIds = Array.isArray(created) ? created.map((q: any) => q.id) : [];

      // 3. Associate questions to drive
      if (questionIds.length > 0) {
        await saveDriveQuestions(newDriveId, questionIds);
      }

      toast.success(`Drive "${finalName}" created with ${questionIds.length} questions! Opening drive configuration...`);
      setShowWizard(false);
      resetWizard();
      navigate({ to: "/drives/$id", params: { id: newDriveId } });
    } catch (err: any) {
      console.error("Bulk Import Drive creation failed:", err);
      toast.error(err.message || "Failed to create drive from CSV");
    } finally {
      setIsCsvCreating(false);
    }
  };

  const handleCreateDriveAndRedirectToBulkImport = async () => {
    if (!driveName.trim()) {
      toast.error("Please enter a drive name.");
      return;
    }
    if (isDuplicateDriveName) {
      toast.error(`A drive named "${driveName.trim()}" already exists. Please choose a unique drive name to prevent repository collisions.`);
      return;
    }
    try {
      setIsCsvCreating(true);
      const finalName = driveName.trim();
      const now = new Date();
      const start = new Date(now.getTime() + 60 * 60 * 1000);
      start.setMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 90 * 60 * 1000);

      const result = await createDrive({
        name: finalName,
        roleTemplateId: "CUSTOM",
        status: "DRAFT",
        moduleConfig: {
          isCustomRole: true,
          creationMethod: "BULK_IMPORT",
          isBulkImport: true,
          creationPathway: "CUSTOM_BULK_IMPORT",
        },
        scheduleStart: start.toISOString(),
        scheduleEnd: end.toISOString(),
      });

      const newDriveId = result?.driveId || result?.id;
      if (!newDriveId) throw new Error("Failed to retrieve new Drive ID");

      toast.success(`Drive "${finalName}" initialized! Opening Question Bank folder...`);
      setShowWizard(false);
      resetWizard();

      navigate({
        to: "/questions",
        search: {
          fromDriveId: newDriveId,
          driveName: finalName,
          autoBulk: "true",
        } as any,
      });
    } catch (err: any) {
      console.error("Failed to initialize drive for bulk import:", err);
      toast.error(err.message || "Failed to create drive");
    } finally {
      setIsCsvCreating(false);
    }
  };

  // Step 2: Modules config
  const [modulesConfig, setModulesConfig] = useState<Record<string, { enabled: boolean; durationMinutes: number; weight: number }>>({
    MCQ: { enabled: true, durationMinutes: 15, weight: 0.15 },
    SQL: { enabled: true, durationMinutes: 20, weight: 0.15 },
    CODING: { enabled: true, durationMinutes: 30, weight: 0.20 },
    DEBUGGING: { enabled: true, durationMinutes: 20, weight: 0.15 },
    AI_PROMPTING: { enabled: true, durationMinutes: 15, weight: 0.10 },
    SIMULATION: { enabled: true, durationMinutes: 10, weight: 0.10 },
    TEST_SCENARIOS: { enabled: true, durationMinutes: 15, weight: 0.15 },
  });

  // Step 3: Selected Questions
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [questionSearch, setQuestionSearch] = useState("");
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>("all");

  // Step 4: Schedule settings
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [bufferMinutes, setBufferMinutes] = useState(15);
  const [graceMinutes, setGraceMinutes] = useState(15);

  // Step 5: Candidates
  const [candidateInput, setCandidateInput] = useState("");
  const [candidateList, setCandidateList] = useState<Array<{ name: string; email: string }>>([]);
  const [candidateErrors, setCandidateErrors] = useState<string[]>([]);
  const [globalModuleSettings, setGlobalModuleSettings] = useState<any[]>([]);

  // Initial fetch and real-time auto-polling for newly created drives (e.g. Partner API)
  useEffect(() => {
    let isMounted = true;

    fetchQuestions();
    fetchRoleTemplates();
    getAuthHeaders().then((headers) => {
      fetch(`${API_BASE}/admin/settings/modules`, { headers })
        .then((res) => res.json())
        .then((data) => setGlobalModuleSettings(Array.isArray(data) ? data : []))
        .catch((e) => console.error("Failed to load module settings: ", e));
    });

    const initialFetch = async () => {
      try {
        const items = await fetchDrives(undefined, false);
        if (isMounted && Array.isArray(items)) {
          knownDriveIdsRef.current = new Set(items.map((d: any) => d.id));
        }
      } catch (e) {
        console.error("Initial fetch error:", e);
      }
    };
    initialFetch();

    // Auto-poll every 3.5 seconds
    const interval = setInterval(async () => {
      if (!isExactDrives) return;
      try {
        const items = await fetchDrives(undefined, true);
        if (!isMounted || !Array.isArray(items)) return;

        if (knownDriveIdsRef.current.size > 0) {
          const freshDrives = items.filter((d: any) => !knownDriveIdsRef.current.has(d.id));
          if (freshDrives.length > 0) {
            freshDrives.forEach((d: any) => knownDriveIdsRef.current.add(d.id));
            setNewDriveIds((prev) => new Set([...prev, ...freshDrives.map((d: any) => d.id)]));

            const latest = freshDrives[0];
            const isPartner = (latest as any).originChannel === "PARTNER_API";
            toast.success(
              `🎉 New Drive Created: "${formatDriveName(latest.name)}" (${isPartner ? "Partner API" : "Direct"})`,
              {
                action: {
                  label: "View Drive",
                  onClick: () => {
                    markDriveOpened(latest.id);
                    navigate({ to: "/drives/$id", params: { id: latest.id } });
                  },
                },
                duration: 8000,
              }
            );
          }
        } else {
          knownDriveIdsRef.current = new Set(items.map((d: any) => d.id));
        }
      } catch (e) {
        console.debug("Silent drives poll error:", e);
      }
    }, 3500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isExactDrives]);

  // Fetch active RoleTemplate preview when department and level are selected
  useEffect(() => {
    if (!department || !level) {
      setActiveTemplatePreview(null);
      setTemplatePreviewError(null);
      return;
    }

    let isMounted = true;
    setIsLoadingTemplatePreview(true);
    setTemplatePreviewError(null);

    getAuthHeaders().then((headers) => {
      const qExp = level === "EXPERIENCED" ? `&experiencedLevel=${experiencedLevel}` : "";
      fetch(`${API_BASE}/admin/role-templates/active?department=${department}&level=${level}${qExp}`, { headers })
        .then(async (res) => {
          if (!isMounted) return;
          if (res.ok) {
            const data = await res.json();
            setActiveTemplatePreview(data);
            if (data.roleName && !role) {
              setRole(data.roleName);
            }
          } else if (res.status === 404) {
            setActiveTemplatePreview(null);
            setTemplatePreviewError(`No active RoleTemplate found for ${department} / ${level}${level === "EXPERIENCED" ? ` (${experiencedLevel})` : ""}.`);
          } else {
            setActiveTemplatePreview(null);
            setTemplatePreviewError("Failed to load active template preview.");
          }
        })
        .catch(() => {
          if (!isMounted) return;
          setActiveTemplatePreview(null);
          setTemplatePreviewError("Failed to reach server for active template preview.");
        })
        .finally(() => {
          if (isMounted) setIsLoadingTemplatePreview(false);
        });
    });

    return () => {
      isMounted = false;
    };
  }, [department, level, experiencedLevel]);

  // Concurrency Check calculations
  const durationHours = useMemo(() => {
    if (!scheduleStart || !scheduleEnd) return 0;
    const diffMs = new Date(scheduleEnd).getTime() - new Date(scheduleStart).getTime();
    if (diffMs <= 0) return 0;
    return diffMs / (1000 * 60 * 60);
  }, [scheduleStart, scheduleEnd]);

  const concurrencyRatio = useMemo(() => {
    if (durationHours <= 0) return 0;
    return candidateList.length / durationHours;
  }, [candidateList.length, durationHours]);

  const showConcurrencyWarning = useMemo(() => {
    return concurrencyRatio > 25;
  }, [concurrencyRatio]);

  // Parse candidates from CSV input
  const parseCandidates = (text: string) => {
    const lines = text.split("\n");
    const parsed: Array<{ name: string; email: string }> = [];
    const errors: string[] = [];
    const emailsSeen = new Set<string>();

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const parts = trimmed.split(/[,;\t]+/);
      if (parts.length < 2) {
        errors.push(`Line ${idx + 1}: Must contain name and email separated by a comma (e.g. "John Doe, john@example.com").`);
        return;
      }

      const name = parts[0].trim();
      const email = parts[1].trim();

      if (!name) {
        errors.push(`Line ${idx + 1}: Name is missing.`);
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push(`Line ${idx + 1}: Invalid email address format "${email}".`);
        return;
      }

      if (emailsSeen.has(email.toLowerCase())) {
        errors.push(`Line ${idx + 1}: Duplicate email address "${email}".`);
        return;
      }

      emailsSeen.add(email.toLowerCase());
      parsed.push({ name, email });
    });

    setCandidateList(parsed);
    setCandidateErrors(errors);
  };

  useEffect(() => {
    parseCandidates(candidateInput);
  }, [candidateInput]);

  // Validate weight sum and questions selection
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!driveName.trim()) {
      errors.push("Drive Name is required.");
    }
    if (!role.trim()) {
      errors.push("Role is required.");
    }

    const enabledModules = Object.keys(modulesConfig).filter(k => modulesConfig[k].enabled);
    if (enabledModules.length === 0) {
      errors.push("At least one module must be enabled.");
    }

    const totalWeight = enabledModules.reduce((sum, k) => sum + modulesConfig[k].weight, 0);
    if (enabledModules.length > 0 && Math.abs(totalWeight - 1.0) > 0.001) {
      errors.push(`Total module weights must sum to 100% (currently ${Math.round(totalWeight * 100)}%).`);
    }

    enabledModules.forEach(modType => {
      const dbType = modType === "AI_PROMPTING" ? "AI_PROMPTING" : modType;
      const selectedForModule = selectedQuestionIds.filter(qId => {
        const q = questions.find(question => question.id === qId);
        return q?.moduleType === dbType;
      });
      if (selectedForModule.length === 0) {
        errors.push(`Module "${modType}" is enabled but has no questions selected.`);
      }
    });

    if (!scheduleStart) {
      errors.push("Schedule Start date is required.");
    }
    if (!scheduleEnd) {
      errors.push("Schedule End date is required.");
    }
    if (scheduleStart && scheduleEnd && new Date(scheduleStart) >= new Date(scheduleEnd)) {
      errors.push("Schedule End date must be after Schedule Start date.");
    }

    if (candidateList.length === 0) {
      errors.push("At least one candidate must be added to the roster.");
    }
    if (candidateErrors.length > 0) {
      errors.push("Please resolve candidate list validation errors.");
    }

    return errors;
  }, [driveName, role, modulesConfig, selectedQuestionIds, questions, scheduleStart, scheduleEnd, candidateList, candidateErrors]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    return (drives || []).map((d) => {
      const resolved = computeDriveStatus(d as any, now);
      return resolved !== d.status ? { ...d, status: resolved as any } : d;
    }).filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (sourceFilter !== "all") {
        const isPartner = (d as any).originChannel === "PARTNER_API" || d.name?.startsWith("[Partner:") || d.name?.includes("(P)");
        if (sourceFilter === "PARTNER_API" && !isPartner) return false;
        if (sourceFilter === "DIRECT" && isPartner) return false;
      }
      return true;
    });
  }, [drives, query, statusFilter, sourceFilter]);

  const handleLaunch = async () => {
    if (validationErrors.length > 0) {
      toast.error("Please resolve all errors before creating the drive.");
      return;
    }

    const matchedTemplate = roleTemplates.find(
      (rt) =>
        (rt.roleName || (rt as any).name || "").toLowerCase() ===
        role.trim().toLowerCase()
    );
    const effectiveRoleTemplateId = matchedTemplate
      ? matchedTemplate.id
      : role.trim();

    try {
      const creationPathway =
        creationMode === "TEMPLATE"
          ? "TEMPLATE"
          : customRolePathway === "BULK_IMPORT"
          ? "CUSTOM_BULK_IMPORT"
          : "CUSTOM_MANUAL";

      const finalModuleConfig = {
        ...modulesConfig,
        isCustomRole: creationMode === "CUSTOM",
        creationPathway,
        ...(creationPathway === "CUSTOM_BULK_IMPORT"
          ? { isBulkImport: true, creationMethod: "BULK_IMPORT" }
          : {}),
      };

      // 1. Create Drive
      const result = await createDrive({
        name: driveName,
        roleTemplateId: effectiveRoleTemplateId,
        status: "SCHEDULED",
        moduleConfig: finalModuleConfig,
        scheduleStart: new Date(scheduleStart).toISOString(),
        scheduleEnd: new Date(scheduleEnd).toISOString(),
      });

      // 2. Link Questions
      if (selectedQuestionIds.length > 0) {
        await saveDriveQuestions(result.driveId, selectedQuestionIds);
      }

      // 3. Add Candidates
      if (candidateList.length > 0) {
        const payload = candidateList.map(c => ({
          name: c.name,
          candidateEmail: c.email
        }));
        await addCandidatesBulk(result.driveId, payload);
        await generateDriveLinks(result.driveId);
      }

      toast.success("Drive scheduled successfully!");
      setShowWizard(false);
      const targetId = result?.driveId || result?.id;
      if (targetId) {
        navigate({ to: "/drives/$id", params: { id: targetId } });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create Drive");
    }
  };

  const resetWizard = () => {
    setStep(1);
    setDriveName("");
    setRole("");
    setDepartment("");
    setLevel("");
    setSelectedTemplateId("");
    setCreationMode("TEMPLATE");
    setCustomRolePathway("MANUAL");
    setCsvFile(null);
    setCsvParsedPreview(null);
    setActiveTemplatePreview(null);
    setTemplatePreviewError(null);
    setModulesConfig({
      MCQ: { enabled: true, durationMinutes: 15, weight: 0.15 },
      SQL: { enabled: true, durationMinutes: 20, weight: 0.20 },
      CODING: { enabled: true, durationMinutes: 30, weight: 0.30 },
      AI_PROMPTING: { enabled: true, durationMinutes: 15, weight: 0.20 },
      SIMULATION: { enabled: true, durationMinutes: 10, weight: 0.15 },
    });
    setSelectedQuestionIds([]);
    setQuestionSearch("");
    setScheduleStart("");
    setScheduleEnd("");
    setCandidateInput("");
    setCandidateList([]);
    setCandidateErrors([]);
  };

  const handleDeleteDrive = async () => {
    if (!confirmDeleteDrive) return;
    try {
      await deleteDrive(confirmDeleteDrive.id);
      setConfirmDeleteDrive(null);
    } catch (err: any) {
      toast.error("Failed to delete drive: " + (err.message || err));
    }
  };

  const filteredQuestionsList = useMemo(() => {
    const s = questionSearch.toLowerCase().trim();
    return (questions || []).filter(q => {
      if (selectedModuleFilter !== "all" && q.moduleType !== selectedModuleFilter) return false;
      if (s) {
        const title = (
          q.content?.title ||
          q.content?.prompt ||
          q.content?.name ||
          q.content?.question ||
          q.content?.text ||
          q.content?.problemStatement ||
          ""
        ).toLowerCase();
        const desc = (q.content?.description || q.content?.text || q.content?.explanation || "").toLowerCase();
        const tags = (q.tags || []).join(" ").toLowerCase();
        if (!title.includes(s) && !desc.includes(s) && !tags.includes(s)) return false;
      }
      return true;
    });
  }, [questions, selectedModuleFilter, questionSearch]);

  if (!isExactDrives) {
    return <Outlet />;
  }

  return (
    <AppShell hideHeader={true}>
      <div className="w-full max-w-[1269px] min-h-[944px] flex flex-col mx-auto transition-opacity">
        {/* TopBar (1269x49) */}
        <div className="w-full max-w-[1269px] h-[49px] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-ink">Drives</h1>
          </div>

          {/* Right Action Container: Search bar + Create Drive Button */}
          <div className="w-[430px] h-[36px] gap-4 flex items-center shrink-0">
            {/* Search Container */}
            <div className="w-[280px] h-[36px] px-4 gap-2 rounded-full border border-line bg-white flex items-center shrink-0 shadow-xs">
              <Search size={14} className="w-[14px] h-[14px] text-ink-muted shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search drives by name..."
                className="w-full text-xs bg-transparent border-none text-ink placeholder:text-ink-muted focus:outline-none p-0 leading-none"
              />
            </div>

            {/* Create Drive Button */}
            <button
              onClick={() => {
                resetWizard();
                setShowWizard(true);
              }}
              className="btn-gradient-primary w-[134px] !h-[34px] !rounded-[24px] !gap-[7px] shrink-0 shadow-brand-glow"
            >
              <Plus size={14} className="shrink-0" />
              <span>Create Drive</span>
            </button>
          </div>
        </div>

        {/* Filters-Row */}
        <div className="w-full max-w-[1269px] h-[65px] py-4 flex items-center justify-between shrink-0 relative z-30 border-b border-brand/10">
          {/* Left Filter Buttons Container */}
          <div className="flex items-center gap-2 shrink-0">
            {[
              { label: "All Drives", value: "all" },
              { label: "Draft", value: "DRAFT" },
              { label: "Scheduled", value: "SCHEDULED" },
              { label: "Active", value: "ACTIVE" },
              { label: "Closed", value: "CLOSED" },
            ].map((tab) => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value as any)}
                  className={`h-[33px] px-4 rounded-full border flex items-center justify-center cursor-pointer transition-all whitespace-nowrap text-[13px] ${
                    active
                      ? "bg-white border-brand text-brand font-bold shadow-2xs"
                      : "bg-white border-brand-subtle text-ink-secondary font-medium hover:border-line"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Source Container */}
          <div className="flex items-center gap-2 justify-end shrink-0">
            {/* All Sources Custom Dropdown */}
            <div className="relative w-[160px] h-[32px] shrink-0">
              <button
                type="button"
                onClick={() => setSourceDropdownOpen((prev) => !prev)}
                className="w-[160px] h-[32px] px-4 rounded-[16px] border border-line bg-white text-ink-secondary text-[13px] font-medium flex items-center justify-between cursor-pointer focus:outline-none transition-all select-none"
              >
                <span className="truncate">
                  {sourceFilter === "DIRECT"
                    ? "Direct"
                    : sourceFilter === "PARTNER_API"
                      ? "Partner API"
                      : "All Sources"}
                </span>
                <ChevronDown
                  size={12}
                  className={`w-3 h-3 transition-transform duration-150 shrink-0 ${
                    sourceDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {sourceDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setSourceDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-[160px] bg-white rounded-xl border border-line shadow-lg py-1 z-50 animate-in fade-in-50 zoom-in-95 duration-100">
                    {[
                      { label: "All Sources", value: "all" },
                      { label: "Direct", value: "DIRECT" },
                      { label: "Partner API", value: "PARTNER_API" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSourceFilter(opt.value as any);
                          setSourceDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between ${
                          sourceFilter === opt.value
                            ? "bg-brand-subtle text-brand font-semibold"
                            : "text-ink-secondary hover:bg-slate-50 font-medium"
                        }`}
                      >
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Grid of Drives */}
        {filtered.length === 0 ? (
          <div className="flex justify-center w-full py-16">
            <p className="text-xs italic text-ink-muted">To get started click on Create Drive</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-[1269px] py-4">
            {filtered.map((d) => {
              const isPartner = (d as any).originChannel === "PARTNER_API" || d.name?.startsWith("[Partner:") || d.name?.includes("(P)");
              const isOpened = openedDriveIds.has(d.id);
              // NEW tag ONLY appears for Partner API drives, and once opened, it goes off permanently
              const isNewlyDetected = isPartner && !isOpened && (() => {
                if (newDriveIds.has(d.id)) return true;
                if (!d.createdAt) return false;
                const createdTime = new Date(d.createdAt).getTime();
                // Mark as NEW if created in the last 24 hours
                return !isNaN(createdTime) && (Date.now() - createdTime) < 24 * 60 * 60 * 1000;
              })();
              return (
                <div
                  key={d.id}
                  className="w-[407px] max-w-full h-[194px] p-6 rounded-2xl bg-white border border-line shadow-[-4px_4px_15px_0px_rgba(156,163,175,0.2)] flex flex-col justify-between relative transition-all shrink-0"
                >
                  {isNewlyDetected && (
                    <div className="absolute -top-2.5 right-4 bg-gradient-to-r from-brand to-brand-ink text-white text-2xs font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 z-10">
                      <Sparkles size={11} className="text-amber-300" />
                      <span>NEW</span>
                    </div>
                  )}

                  {/* Top Content Frame */}
                  <div className="w-full h-[51px] flex flex-col justify-between">
                    {/* Top Row: Title & Badges */}
                    <div className="w-full h-[22px] flex items-center justify-between">
                      <h3
                        className="truncate max-w-[220px] text-[18px] font-bold text-ink"
                        title={d.name}
                      >
                        {formatDriveName(d.name)}
                      </h3>

                      {/* Badges Container */}
                      <div className="h-[18px] flex items-center gap-1.5">
                        {/* Origin Badge */}
                        <div
                          className={
                            isPartner ? "badge-pill-purple min-w-[68px]" : "badge-pill-neutral min-w-[53px]"
                          }
                        >
                          {isPartner ? "PARTNER" : "DIRECT"}
                        </div>

                        {/* Status Badge */}
                        <div
                          className={
                            d.status === "ACTIVE"
                              ? "badge-pill-active"
                              : d.status === "SCHEDULED"
                                ? "badge-pill-scheduled"
                                : "badge-pill-closed"
                          }
                        >
                          {d.status === "ACTIVE"}
                          <span>{d.status}</span>
                        </div>
                      </div>
                    </div>

                    {/* Subtitle / Role */}
                    <p
                      className="truncate text-[14px] text-ink-secondary"
                      title={d.roleTemplateName || "Software Developer"}
                    >
                      {d.roleTemplateName || "Software Developer"}
                    </p>
                  </div>

                  {/* Date Frame */}
                  <div className="w-full h-[15px] flex items-center gap-1.5">
                    <Calendar size={14} className="text-ink-muted shrink-0" />
                    <span className="text-[12px] font-medium text-ink-muted">
                      {formatShortDate(d.scheduleStart || d.createdAt)}
                    </span>
                  </div>

                  {/* Actions Row */}
                  <div className="w-full h-10 flex items-center gap-3">
                    <Link
                      to="/drives/$id"
                      params={{ id: d.id }}
                      onClick={() => markDriveOpened(d.id)}
                      className="flex-1 h-[37px] rounded-full border border-brand-subtle bg-white hover:bg-blue-50/40 flex items-center justify-center text-[14px] font-semibold text-brand transition-all cursor-pointer"
                    >
                      View Drive
                    </Link>
                    <button
                      onClick={() => setConfirmDeleteDrive(d)}
                      className="w-10 h-10 rounded-full border border-brand-subtle bg-white flex items-center justify-center cursor-pointer transition-all hover:border-rose-200 hover:bg-rose-50 group shrink-0"
                      title="Delete Drive"
                    >
                      <Trash2 size={16} className="text-ink-muted group-hover:text-rose-600 transition-colors" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CreateNewDriveModal Overlay (Instant animation) */}
      {showWizard && (
        <div
          data-overlay="CreateNewDriveModal"
          className="modal-overlay-backdrop"
        >
          <div
            className="modal-shell-card"
          >
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Create New Drive</h2>
                <p className="text-xs text-ink-secondary mt-0.5">Select a Role Template or define custom role settings for direct drive creation.</p>
              </div>
              <button onClick={() => setShowWizard(false)} className="text-ink-tertiary hover:text-ink cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Creation Mode Toggle - 2 Options Only */}
              <div className="flex bg-canvas p-1 rounded-lg border border-line gap-1">
                <button
                  type="button"
                  onClick={() => setCreationMode("TEMPLATE")}
                  className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${creationMode === "TEMPLATE"
                    ? "bg-white text-brand shadow-sm font-bold"
                    : "text-ink-secondary hover:text-ink"
                    }`}
                >
                  <Sparkles size={13} /> Role Template
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreationMode("CUSTOM");
                    setSelectedTemplateId("");
                  }}
                  className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${creationMode === "CUSTOM"
                    ? "bg-white text-brand shadow-sm font-bold"
                    : "text-ink-secondary hover:text-ink"
                    }`}
                >
                  <PenLine size={13} /> Custom Role
                </button>
              </div>

              {creationMode === "TEMPLATE" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
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
                          { value: "QA", label: "Quality Assurance" },
                          { value: "SRE", label: "Site Reliability Engineering" },
                          { value: "SYSOPS", label: "System Operations" },
                          { value: "ITOPS", label: "IT Operations" },
                          { value: "PMO", label: "Project Management" },
                          { value: "SECOPS", label: "Security Operations" },
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
                      value={selectedTemplateId}
                      onChange={(val) => {
                        const tpl = (roleTemplates || []).find((r) => r.id === val);
                        if (tpl) handleSelectTemplate(tpl);
                        else setSelectedTemplateId("");
                      }}
                      placeholder="-- Choose a Role Template --"
                      rounded="16px"
                      size="md"
                      className="w-full"
                      options={filteredTemplates.map((tpl) => {
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

                  {selectedTemplateObj && (
                    <div className="p-3.5 bg-brand-subtle border border-brand-border rounded-lg space-y-2 text-xs">
                      <div className="flex items-center justify-between font-semibold text-brand-ink">
                        <span>{selectedTemplateObj.roleName}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-brand/10 text-brand font-mono font-bold rounded text-2xs">
                            {Math.max(90, selectedTemplateObj.durationMinutes || 90)} mins
                          </span>
                          <span className="px-2 py-0.5 bg-brand text-white rounded text-2xs  font-mono font-bold">
                            {(selectedTemplateObj as any).experienceTier || "0-1"} yrs
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-ink-secondary text-xs-plus">
                        <span>Department: <strong className="text-ink">{selectedTemplateObj.department || "General"}</strong></span>
                        <span>•</span>
                        <span>Category: <strong className="text-ink">{(selectedTemplateObj as any).category || "FRESHER"}</strong></span>
                        <span>•</span>
                        <span>Questions: <strong className="text-ink">{((selectedTemplateObj as any).questions || []).length}</strong></span>
                      </div>
                      <div className="text-2xs text-brand-ink/80 flex items-center gap-1 font-medium pt-1 border-t border-brand-border/60">
                        <Lock size={11} className="text-brand shrink-0" />
                        <span>Template Governed: Modules and questions are standardized to ensure uniform candidate evaluation.</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm-minus font-medium text-ink-secondary mb-1.5">
                  Drive Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={driveName}
                  onChange={(e) => setDriveName(e.target.value)}
                  placeholder="e.g. Senior Software Engineer Drive - August 2026"
                  className={`w-full px-3.5 py-2 text-sm-minus border rounded-md bg-white focus:outline-none ${isDuplicateDriveName ? "border-amber-400 focus:border-amber-500" : "border-line focus:border-brand"}`}
                />
                {isDuplicateDriveName && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                    <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                    <span>A drive named "{driveName.trim()}" already exists. Drive names must be unique.</span>
                  </div>
                )}
              </div>

              {creationMode === "CUSTOM" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm-minus font-medium text-ink-secondary mb-1.5">
                      Role Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="e.g. Senior Software Engineer"
                      className="w-full px-3.5 py-2 text-sm-minus border border-line rounded-md bg-white focus:outline-none focus:border-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wider">
                      Setup Method
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setCustomRolePathway("MANUAL")}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          customRolePathway === "MANUAL"
                            ? "border-brand bg-blue-50/50 shadow-xs"
                            : "border-line bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${customRolePathway === "MANUAL" ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>
                            <PenLine size={14} />
                          </div>
                          {customRolePathway === "MANUAL" && (
                            <span className="w-2 h-2 rounded-full bg-brand" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-ink">Manual Wizard</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            Configure modules, duration, questions & roster step-by-step.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCustomRolePathway("BULK_IMPORT")}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          customRolePathway === "BULK_IMPORT"
                            ? "border-brand bg-blue-50/50 shadow-xs"
                            : "border-line bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${customRolePathway === "BULK_IMPORT" ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>
                            <UploadCloud size={14} />
                          </div>
                          {customRolePathway === "BULK_IMPORT" && (
                            <span className="w-2 h-2 rounded-full bg-brand" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-ink">Bulk Import (CSV)</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            Ingest questions via dedicated Question Bank folder.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {customRolePathway === "BULK_IMPORT" && (
                    <div className="p-4 rounded-xl border border-line bg-canvas space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-brand shrink-0">
                          <FolderPlus size={20} className="text-brand" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-xs font-bold text-ink">
                            Question Bank Dedicated Folder Workflow
                          </h4>
                          <p className="text-[11px] text-ink-secondary leading-relaxed">
                            Creating this drive will initialize its record and automatically redirect you to the <strong>Question Bank</strong> with a dedicated folder created in the drive's name. The bulk upload prompt will open immediately so you can ingest questions from CSV.
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-medium">Need sample multi-module CSV format?</span>
                        <button
                          type="button"
                          onClick={downloadUnifiedSampleCSV}
                          className="h-[28px] px-3 text-[11px] font-semibold text-ink-secondary bg-white hover:bg-slate-100 border border-line rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                        >
                          <Download size={12} />
                          <span>Download Sample CSV</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-line bg-canvas rounded-b-[12px] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowWizard(false);
                  resetWizard();
                }}
                className="px-3.5 py-2 text-xs font-medium text-ink-secondary hover:bg-line rounded-full transition-colors cursor-pointer"
              >
                Cancel
              </button>

              {creationMode === "CUSTOM" && customRolePathway === "BULK_IMPORT" ? (
                <button
                  type="button"
                  disabled={isCsvCreating || !driveName.trim()}
                  onClick={handleCreateDriveAndRedirectToBulkImport}
                  className="btn-gradient-primary flex items-center gap-1.5 px-4 py-2 text-xs !font-bold text-white rounded-full shadow-xs disabled:opacity-50"
                >
                  {isCsvCreating ? <Loader2 size={13} className="animate-spin" /> : <FolderPlus size={13} />}
                  <span>{isCsvCreating ? "Creating Drive..." : "Create Drive & Bulk Import in Question Bank"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    if (!driveName.trim()) {
                      toast.error("Please enter a drive name.");
                      return;
                    }
                    if (isDuplicateDriveName) {
                      toast.error(`A drive named "${driveName.trim()}" already exists. Please choose a unique drive name.`);
                      return;
                    }
                    if (creationMode === "TEMPLATE" && !selectedTemplateId) {
                      toast.error("Please select a Role Template.");
                      return;
                    }
                    if (creationMode === "CUSTOM" && !role.trim()) {
                      toast.error("Please enter a role title.");
                      return;
                    }

                    const isCustom = creationMode === "CUSTOM";
                    const effectiveRoleTemplateId =
                      !isCustom && selectedTemplateId
                        ? selectedTemplateId
                        : role.trim();

                    try {
                      const res = await createDrive({
                        name: driveName.trim(),
                        roleTemplateId: effectiveRoleTemplateId,
                        status: "DRAFT",
                        moduleConfig: {
                          isCustomRole: isCustom,
                        },
                      });
                      const targetId = res?.driveId || res?.id;
                      toast.success(
                        isCustom
                          ? "Custom Role drive created! Opening full configuration workspace..."
                          : "Drive created with selected Role Template! Opening configuration screen..."
                      );
                      setShowWizard(false);
                      if (targetId) {
                        navigate({ to: "/drives/$id", params: { id: targetId } });
                      }
                    } catch (err: any) {
                      toast.error("Failed to create drive: " + (err.message || err));
                    }
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-full transition-colors cursor-pointer shadow-sm"
                >
                  Create &amp; Configure Drive
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Close Confirmation Modal */}
      {confirmCloseDrive && (
        <div className="modal-overlay-backdrop">
          <div className="modal-shell-card max-w-[440px] p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-line pb-3">
              <div className="p-2 bg-amber-50 text-amber-500 rounded-full">
                <AlertTriangle size={18} />
              </div>
              <h3 className="text-base font-semibold text-ink">Close Drive Early?</h3>
            </div>

            <p className="text-sm-minus text-ink-secondary leading-relaxed">
              Are you sure you want to close <span className="font-semibold text-ink">"{confirmCloseDrive.name}"</span>?
              Candidates will no longer be able to start this assessment, but existing submitted sessions will be preserved for evaluation.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-sm-minus">
              <button
                onClick={() => setConfirmCloseDrive(null)}
                className="btn-secondary-outline"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  closeDrive(confirmCloseDrive.id);
                  setConfirmCloseDrive(null);
                }}
                className="px-4 py-2 text-white bg-amber-600 hover:bg-amber-700 font-semibold cursor-pointer shadow-xs transition-colors rounded-full text-xs"
              >
                Close Drive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteDrive && (
        <div className="modal-overlay-backdrop">
          <div className="modal-shell-card max-w-[440px] p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-line pb-3">
              <div className="p-2 bg-red-50 text-red-500 rounded-full">
                <AlertTriangle size={18} />
              </div>
              <h3 className="text-base font-semibold text-ink">Delete Drive?</h3>
            </div>

            <p className="text-sm-minus text-ink-secondary leading-relaxed">
              Are you sure you want to delete the assessment drive <span className="font-semibold text-ink">"{confirmDeleteDrive.name}"</span>?
              This will permanently revoke all invites and delete all candidate sessions, proctoring/event logs, and scores. This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-sm-minus">
              <button
                onClick={() => setConfirmDeleteDrive(null)}
                className="btn-secondary-outline"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDrive}
                className="px-4 py-2 text-white bg-danger hover:bg-danger-hover font-semibold cursor-pointer shadow-xs transition-colors rounded-full text-xs"
              >
                Delete Drive
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
