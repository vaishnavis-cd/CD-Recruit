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
  ChevronDown,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type DriveStatus } from "../lib/types";
import { formatDriveName } from "../lib/utils";

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
                  onClick: () => navigate({ to: "/drives/$id", params: { id: latest.id } }),
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
    return drives.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (sourceFilter !== "all" && ((d as any).originChannel || "DIRECT") !== sourceFilter) return false;
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
      // 1. Create Drive
      const result = await createDrive({
        name: driveName,
        roleTemplateId: effectiveRoleTemplateId,
        status: "SCHEDULED",
        moduleConfig: modulesConfig,
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
      <div
        className="w-full max-w-[1269px] min-h-[944px] flex flex-col mx-auto opacity-100 rotate-0 transition-opacity"
        style={{
          maxWidth: "1269px",
          minHeight: "944px",
          opacity: 1,
          transform: "rotate(0deg)",
        }}
      >
        {/* TopBar (1269x49) */}
        <div
          className="w-full max-w-[1269px] h-[49px] flex items-center justify-between opacity-100 rotate-0 shrink-0"
          style={{
            height: "49px",
            justifyContent: "space-between",
            transform: "rotate(0deg)",
            opacity: 1,
          }}
        >
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-[#0d1424]">Drives</h1>
          </div>

          {/* Right Action Container: Search bar + Create Drive Button */}
          <div
            className="w-[430px] h-[36px] gap-[16px] flex items-center shrink-0 opacity-100 rotate-0"
            style={{
              width: "430px",
              height: "36px",
              gap: "16px",
              transform: "rotate(0deg)",
              opacity: 1,
            }}
          >
            {/* Search Container */}
            <div
              className="w-[280px] h-[36px] pt-[10px] pb-[10px] px-[16px] gap-[8px] rounded-[99px] flex items-center shrink-0 opacity-100 rotate-0 shadow-xs"
              style={{
                width: "280px",
                height: "36px",
                paddingTop: "10px",
                paddingBottom: "10px",
                paddingLeft: "16px",
                paddingRight: "16px",
                gap: "8px",
                borderRadius: "99px",
                border: "1px solid #D5DAEC",
                background: "#FFFFFF",
                transform: "rotate(0deg)",
                opacity: 1,
              }}
            >
              <Search
                size={14}
                className="w-[14px] h-[14px] text-[#94a3b8] shrink-0 opacity-100 rotate-0"
                style={{
                  width: "14px",
                  height: "14px",
                  transform: "rotate(0deg)",
                  opacity: 1,
                }}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search drives by name..."
                className="w-[226px] h-[16px] text-xs bg-transparent border-none text-[#0d1424] placeholder:text-[#94a3b8] focus:outline-none p-0 leading-none opacity-100 rotate-0"
                style={{
                  width: "226px",
                  height: "16px",
                  transform: "rotate(0deg)",
                  opacity: 1,
                }}
              />
            </div>

            {/* Create Drive Button */}
            <button
              onClick={() => {
                resetWizard();
                setShowWizard(true);
              }}
              className="w-[134px] h-[34px] pt-[9px] pb-[9px] px-[18px] gap-[7px] text-white text-xs font-semibold rounded-[24px] flex items-center justify-center cursor-pointer shrink-0 opacity-100 rotate-0 transition-none"
              style={{
                width: "134px",
                height: "34px",
                paddingTop: "9px",
                paddingBottom: "9px",
                paddingLeft: "18px",
                paddingRight: "18px",
                gap: "7px",
                borderRadius: "24px",
                transform: "rotate(0deg)",
                opacity: 1,
                background: "linear-gradient(135deg, #3A91ED 0%, #2E5DE0 100%)",
                boxShadow: "0px 4px 14px 0px #2E5DE0BF",
                animationDuration: "0ms",
              }}
            >
              <Plus size={14} className="shrink-0" />
              <span>Create Drive</span>
            </button>
          </div>
        </div>

        {/* Filters-Row (1269x65, border-bottom 1px solid #2E5DE01A) */}
        <div
          className="w-full max-w-[1269px] h-[65px] pt-[16px] pb-[16px] flex items-center justify-between opacity-100 rotate-0 shrink-0 relative z-30"
          style={{
            height: "65px",
            paddingTop: "16px",
            paddingBottom: "16px",
            justifyContent: "space-between",
            borderBottom: "1px solid #2E5DE01A",
            borderBottomWidth: "1px",
            transform: "rotate(0deg)",
            opacity: 1,
          }}
        >
          {/* Left Filter Buttons Container (443x33, gap 8px) */}
          <div
            className="w-[443px] h-[33px] gap-[8px] flex items-center shrink-0 opacity-100 rotate-0"
            style={{
              width: "443px",
              height: "33px",
              gap: "8px",
              transform: "rotate(0deg)",
              opacity: 1,
            }}
          >
            {/* All Drives */}
            <button
              onClick={() => setStatusFilter("all")}
              className="w-[91px] h-[32px] pt-[8px] pb-[8px] px-[16px] rounded-[99px] flex items-center justify-center cursor-pointer shrink-0 opacity-100 rotate-0 transition-all whitespace-nowrap"
              style={{
                width: "91px",
                height: "32px",
                paddingTop: "8px",
                paddingBottom: "8px",
                paddingLeft: "16px",
                paddingRight: "16px",
                borderRadius: "99px",
                borderWidth: "1px",
                background: "#FFFFFF",
                border: statusFilter === "all" ? "1px solid #2E5DE0" : "1px solid #E9EEFE",
                transform: "rotate(0deg)",
                opacity: 1,
                whiteSpace: "nowrap",
              }}
            >
              <span
                className="whitespace-nowrap"
                style={{
                  fontFamily: "Instrument Sans, sans-serif",
                  fontWeight: statusFilter === "all" ? 700 : 500,
                  fontSize: "13px",
                  lineHeight: "100%",
                  letterSpacing: "0%",
                  color: statusFilter === "all" ? "#2E5DE0" : "#6B7280",
                  whiteSpace: "nowrap",
                }}
              >
                All Drives
              </span>
            </button>

            {/* Draft */}
            <button
              onClick={() => setStatusFilter("DRAFT")}
              className="w-[66px] h-[33px] pt-[8px] pb-[8px] px-[16px] rounded-[99px] flex items-center justify-center cursor-pointer shrink-0 opacity-100 rotate-0 transition-all whitespace-nowrap"
              style={{
                width: "66px",
                height: "33px",
                paddingTop: "8px",
                paddingBottom: "8px",
                paddingLeft: "16px",
                paddingRight: "16px",
                borderRadius: "99px",
                borderWidth: "1px",
                background: "#FFFFFF",
                border: statusFilter === "DRAFT" ? "1px solid #2E5DE0" : "1px solid #E9EEFE",
                transform: "rotate(0deg)",
                opacity: 1,
                whiteSpace: "nowrap",
              }}
            >
              <span
                className="whitespace-nowrap"
                style={{
                  fontFamily: "Instrument Sans, sans-serif",
                  fontWeight: statusFilter === "DRAFT" ? 700 : 500,
                  fontSize: "14px",
                  lineHeight: "100%",
                  letterSpacing: "0%",
                  color: statusFilter === "DRAFT" ? "#2E5DE0" : "#6B7280",
                  whiteSpace: "nowrap",
                }}
              >
                Draft
              </span>
            </button>

            {/* Scheduled */}
            <button
              onClick={() => setStatusFilter("SCHEDULED")}
              className="w-[102px] h-[33px] pt-[8px] pb-[8px] px-[16px] rounded-[99px] flex items-center justify-center cursor-pointer shrink-0 opacity-100 rotate-0 transition-all whitespace-nowrap"
              style={{
                width: "102px",
                height: "33px",
                paddingTop: "8px",
                paddingBottom: "8px",
                paddingLeft: "16px",
                paddingRight: "16px",
                borderRadius: "99px",
                borderWidth: "1px",
                background: "#FFFFFF",
                border: statusFilter === "SCHEDULED" ? "1px solid #2E5DE0" : "1px solid #E9EEFE",
                transform: "rotate(0deg)",
                opacity: 1,
                whiteSpace: "nowrap",
              }}
            >
              <span
                className="whitespace-nowrap"
                style={{
                  fontFamily: "Instrument Sans, sans-serif",
                  fontWeight: statusFilter === "SCHEDULED" ? 700 : 500,
                  fontSize: "14px",
                  lineHeight: "100%",
                  letterSpacing: "0%",
                  color: statusFilter === "SCHEDULED" ? "#2E5DE0" : "#6B7280",
                  whiteSpace: "nowrap",
                }}
              >
                Scheduled
              </span>
            </button>

            {/* Active */}
            <button
              onClick={() => setStatusFilter("ACTIVE")}
              className="w-[74px] h-[33px] pt-[8px] pb-[8px] px-[16px] rounded-[99px] flex items-center justify-center cursor-pointer shrink-0 opacity-100 rotate-0 transition-all whitespace-nowrap"
              style={{
                width: "74px",
                height: "33px",
                paddingTop: "8px",
                paddingBottom: "8px",
                paddingLeft: "16px",
                paddingRight: "16px",
                borderRadius: "99px",
                borderWidth: "1px",
                background: "#FFFFFF",
                border: statusFilter === "ACTIVE" ? "1px solid #2E5DE0" : "1px solid #E9EEFE",
                transform: "rotate(0deg)",
                opacity: 1,
                whiteSpace: "nowrap",
              }}
            >
              <span
                className="whitespace-nowrap"
                style={{
                  fontFamily: "Instrument Sans, sans-serif",
                  fontWeight: statusFilter === "ACTIVE" ? 700 : 500,
                  fontSize: "14px",
                  lineHeight: "100%",
                  letterSpacing: "0%",
                  color: statusFilter === "ACTIVE" ? "#2E5DE0" : "#6B7280",
                  whiteSpace: "nowrap",
                }}
              >
                Active
              </span>
            </button>

            {/* Closed */}
            <button
              onClick={() => setStatusFilter("CLOSED")}
              className="w-[78px] h-[33px] pt-[8px] pb-[8px] px-[16px] rounded-[99px] flex items-center justify-center cursor-pointer shrink-0 opacity-100 rotate-0 transition-all whitespace-nowrap"
              style={{
                width: "78px",
                height: "33px",
                paddingTop: "8px",
                paddingBottom: "8px",
                paddingLeft: "16px",
                paddingRight: "16px",
                borderRadius: "99px",
                borderWidth: "1px",
                background: "#FFFFFF",
                border: statusFilter === "CLOSED" ? "1px solid #2E5DE0" : "1px solid #E9EEFE",
                transform: "rotate(0deg)",
                opacity: 1,
                whiteSpace: "nowrap",
              }}
            >
              <span
                className="whitespace-nowrap"
                style={{
                  fontFamily: "Instrument Sans, sans-serif",
                  fontWeight: statusFilter === "CLOSED" ? 700 : 500,
                  fontSize: "14px",
                  lineHeight: "100%",
                  letterSpacing: "0%",
                  color: statusFilter === "CLOSED" ? "#2E5DE0" : "#6B7280",
                  whiteSpace: "nowrap",
                }}
              >
                Closed
              </span>
            </button>
          </div>

          {/* Source Container (217x32, gap 8px) */}
          <div
            className="w-[217px] h-[32px] gap-[8px] flex items-center justify-end shrink-0 opacity-100 rotate-0"
            style={{
              width: "217px",
              height: "32px",
              gap: "8px",
              transform: "rotate(0deg)",
              opacity: 1,
            }}
          >
            {/* SOURCE: Label (49x10) */}
            <span
              className="w-[49px] h-[10px] uppercase shrink-0 opacity-100 rotate-0 inline-flex items-center whitespace-nowrap"
              style={{
                width: "49px",
                height: "10px",
                fontFamily: "Instrument Sans, sans-serif",
                fontWeight: 700,
                fontSize: "11px",
                lineHeight: "100%",
                letterSpacing: "0.08em",
                color: "#9CA3AF",
                transform: "rotate(0deg)",
                opacity: 1,
                whiteSpace: "nowrap",
              }}
            >
              SOURCE:
            </span>

            {/* All Sources Custom Dropdown (160x32) */}
            <div
              className="relative w-[160px] h-[32px] shrink-0 opacity-100 rotate-0"
              style={{
                width: "160px",
                height: "32px",
                transform: "rotate(0deg)",
                opacity: 1,
              }}
            >
              <button
                type="button"
                onClick={() => setSourceDropdownOpen((prev) => !prev)}
                className="w-[160px] h-[32px] pt-[8px] pb-[8px] pl-[16px] pr-[16px] rounded-[16px] flex items-center justify-between cursor-pointer focus:outline-none transition-all select-none"
                style={{
                  width: "160px",
                  height: "32px",
                  paddingTop: "8px",
                  paddingBottom: "8px",
                  paddingLeft: "16px",
                  paddingRight: "16px",
                  borderRadius: "16px",
                  border: "1px solid #D5DAEC",
                  background: "#FFFFFF",
                  fontFamily: "Instrument Sans, sans-serif",
                  fontWeight: 500,
                  fontSize: "13px",
                  lineHeight: "100%",
                  letterSpacing: "0%",
                  color: "#6B7280",
                }}
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
                  className={`w-[12px] h-[12px] transition-transform duration-150 shrink-0 ${
                    sourceDropdownOpen ? "rotate-180" : ""
                  }`}
                  style={{
                    width: "12px",
                    height: "12px",
                    color: "#6B7280",
                  }}
                />
              </button>

              {sourceDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setSourceDropdownOpen(false)}
                  />
                  <div
                    className="absolute top-[36px] left-0 w-[160px] bg-white border border-[#D5DAEC] rounded-[12px] shadow-lg py-1 z-40 overflow-hidden"
                    style={{
                      fontFamily: "Instrument Sans, sans-serif",
                    }}
                  >
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
                            ? "bg-[#eff6ff] text-[#2E5DE0] font-semibold"
                            : "text-[#6B7280] hover:bg-slate-50 font-medium"
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
            <p className="text-xs italic text-[#94a3b8]">To get started click on Create Drive</p>
          </div>
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[24px] w-full max-w-[1269px] pt-[16px] pb-[16px] opacity-100 rotate-0"
            style={{
              minHeight: "226px",
              paddingTop: "16px",
              paddingBottom: "16px",
              gap: "24px",
              transform: "rotate(0deg)",
              opacity: 1,
            }}
          >
            {filtered.map((d) => {
              const isNewlyDetected = newDriveIds.has(d.id);
              const isPartner = (d as any).originChannel === "PARTNER_API";
              return (
                <div
                  key={d.id}
                  className="w-[407px] max-w-full h-[194px] p-[24px] rounded-[16px] bg-white flex flex-col justify-between relative transition-all opacity-100 rotate-0 shrink-0"
                  style={{
                    width: "407px",
                    height: "194px",
                    padding: "24px",
                    gap: "20px",
                    borderRadius: "16px",
                    background: "#FFFFFF",
                    border: "1px solid #E8EDF2",
                    boxShadow: "-4px 4px 15px 0px rgba(156, 163, 175, 0.2)",
                    animationDuration: "0ms",
                    transform: "rotate(0deg)",
                    opacity: 1,
                  }}
                >
                  {isNewlyDetected && (
                    <div className="absolute -top-2.5 right-4 bg-gradient-to-r from-brand to-brand-ink text-white text-2xs font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 z-10">
                      <Sparkles size={11} className="text-amber-300" />
                      <span>NEW</span>
                    </div>
                  )}

                  {/* Top Content Frame (359x51, gap 12px) */}
                  <div
                    className="w-[359px] max-w-full h-[51px] flex flex-col justify-between opacity-100 rotate-0"
                    style={{
                      width: "359px",
                      height: "51px",
                      gap: "12px",
                      transform: "rotate(0deg)",
                      opacity: 1,
                    }}
                  >
                    {/* Top Row: Title & Badges ("test frame" - 359x22) */}
                    <div
                      className="w-[359px] max-w-full h-[22px] flex items-center justify-between opacity-100 rotate-0"
                      style={{
                        width: "359px",
                        height: "22px",
                        justifyContent: "space-between",
                        transform: "rotate(0deg)",
                        opacity: 1,
                      }}
                    >
                      <h3
                        className="truncate"
                        title={d.name}
                        style={{
                          maxWidth: "220px",
                          fontFamily: "Instrument Sans, sans-serif",
                          fontWeight: 700,
                          fontSize: "18px",
                          lineHeight: "100%",
                          letterSpacing: "0%",
                          color: "#1E1B4B",
                          transform: "rotate(0deg)",
                          opacity: 1,
                        }}
                      >
                        {formatDriveName(d.name)}
                      </h3>

                      {/* Badges Container ("active+direct frame" - 112x18, gap 6px) */}
                      <div
                        className="h-[18px] flex items-center opacity-100 rotate-0"
                        style={{
                          gap: "6px",
                          transform: "rotate(0deg)",
                          opacity: 1,
                        }}
                      >
                        {/* Origin Badge */}
                        <div
                          className="h-[18px] flex items-center justify-center opacity-100 rotate-0"
                          style={{
                            minWidth: isPartner ? "74px" : "53px",
                            height: "18px",
                            paddingTop: "3px",
                            paddingBottom: "3px",
                            paddingLeft: "8px",
                            paddingRight: "8px",
                            borderRadius: "6px",
                            background: isPartner ? "#EDE9FE" : "#F3F4F6",
                            transform: "rotate(0deg)",
                            opacity: 1,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "Instrument Sans, sans-serif",
                              fontWeight: 700,
                              fontSize: "10px",
                              lineHeight: "100%",
                              letterSpacing: "0%",
                              color: isPartner ? "#8B5CF6" : "#6B7280",
                              textTransform: "uppercase",
                            }}
                          >
                            {isPartner ? "PARTNER API" : "DIRECT"}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div
                          className="h-[18px] flex items-center justify-center opacity-100 rotate-0"
                          style={{
                            minWidth: "53px",
                            height: "18px",
                            paddingTop: "3px",
                            paddingBottom: "3px",
                            paddingLeft: "8px",
                            paddingRight: "8px",
                            borderRadius: "6px",
                            background:
                              d.status === "ACTIVE"
                                ? "#D1FAE5"
                                : d.status === "SCHEDULED"
                                ? "#E0E7FF"
                                : d.status === "CLOSED"
                                ? "#FEF3C7"
                                : "#F3F4F6",
                            transform: "rotate(0deg)",
                            opacity: 1,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "Instrument Sans, sans-serif",
                              fontWeight: 700,
                              fontSize: "10px",
                              lineHeight: "100%",
                              letterSpacing: "0%",
                              color:
                                d.status === "ACTIVE"
                                  ? "#10B981"
                                  : d.status === "SCHEDULED"
                                  ? "#4338CA"
                                  : d.status === "CLOSED"
                                  ? "#D97706"
                                  : "#6B7280",
                              textTransform: "uppercase",
                            }}
                          >
                            {d.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Subtitle / Role ("sde-text" - 359x17) */}
                    <p
                      className="truncate"
                      title={d.roleTemplateName || "Software Developer"}
                      style={{
                        width: "359px",
                        maxWidth: "100%",
                        height: "17px",
                        fontFamily: "Instrument Sans, sans-serif",
                        fontWeight: 400,
                        fontSize: "14px",
                        lineHeight: "100%",
                        letterSpacing: "0%",
                        color: "#6B7280",
                        transform: "rotate(0deg)",
                        opacity: 1,
                      }}
                    >
                      {d.roleTemplateName || "Software Developer"}
                    </p>
                  </div>

                  {/* Date Frame (359x15, gap 6px) */}
                  <div
                    className="w-[359px] max-w-full h-[15px] flex items-center opacity-100 rotate-0"
                    style={{
                      width: "359px",
                      height: "15px",
                      gap: "6px",
                      transform: "rotate(0deg)",
                      opacity: 1,
                    }}
                  >
                    <Calendar
                      size={14}
                      className="w-[14px] h-[14px] text-[#9CA3AF] shrink-0"
                      style={{
                        width: "14px",
                        height: "14px",
                        color: "#9CA3AF",
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "Instrument Sans, sans-serif",
                        fontWeight: 500,
                        fontSize: "12px",
                        lineHeight: "100%",
                        letterSpacing: "0%",
                        color: "#9CA3AF",
                      }}
                    >
                      {formatShortDate(d.scheduleStart || d.createdAt)}
                    </span>
                  </div>

                  {/* Actions Row ("view drive+delete icon frame" - 359x40, gap 12px) */}
                  <div
                    className="w-[359px] max-w-full h-[40px] flex items-center opacity-100 rotate-0"
                    style={{
                      width: "359px",
                      height: "40px",
                      gap: "12px",
                      transform: "rotate(0deg)",
                      opacity: 1,
                    }}
                  >
                    <Link
                      to="/drives/$id"
                      params={{ id: d.id }}
                      className="w-[307px] flex-1 h-[37px] rounded-[19px] flex items-center justify-center cursor-pointer transition-all hover:bg-blue-50/40"
                      style={{
                        width: "307px",
                        height: "37px",
                        paddingTop: "10px",
                        paddingBottom: "10px",
                        borderRadius: "19px",
                        borderWidth: "1px",
                        border: "1px solid #E9EEFE",
                        background: "#FFFFFF",
                        transform: "rotate(0deg)",
                        opacity: 1,
                        animationDuration: "0ms",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "Instrument Sans, sans-serif",
                          fontWeight: 600,
                          fontSize: "14px",
                          lineHeight: "100%",
                          letterSpacing: "0%",
                          color: "#2E5DE0",
                        }}
                      >
                        View Drive
                      </span>
                    </Link>
                    <button
                      onClick={() => setConfirmDeleteDrive(d)}
                      className="w-[40px] h-[40px] rounded-[20px] flex items-center justify-center cursor-pointer transition-all hover:border-rose-200 hover:bg-rose-50 group shrink-0"
                      style={{
                        width: "40px",
                        height: "40px",
                        padding: "10px",
                        borderRadius: "20px",
                        borderWidth: "1px",
                        border: "1px solid #E9EEFE",
                        background: "#FFFFFF",
                        transform: "rotate(0deg)",
                        opacity: 1,
                      }}
                      title="Delete Drive"
                    >
                      <Trash2 size={16} className="w-[16px] h-[16px] text-[#9CA3AF] group-hover:text-rose-600 transition-colors" />
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
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 transition-none"
          style={{ animationDuration: "0ms", transitionDuration: "0ms" }}
        >
          <div
            className="bg-white rounded-xl w-full max-w-[560px] shadow-2xl flex flex-col max-h-[90vh] transition-none"
            style={{ animationDuration: "0ms", transitionDuration: "0ms" }}
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
              {/* Creation Mode Toggle */}
              <div className="flex bg-canvas p-1 rounded-lg border border-line">
                <button
                  type="button"
                  onClick={() => setCreationMode("TEMPLATE")}
                  className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    creationMode === "TEMPLATE"
                      ? "bg-white text-brand shadow-sm"
                      : "text-ink-secondary hover:text-ink"
                  }`}
                >
                  <Sparkles size={14} /> Use Role Template (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreationMode("CUSTOM");
                    setSelectedTemplateId("");
                  }}
                  className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    creationMode === "CUSTOM"
                      ? "bg-white text-brand shadow-sm"
                      : "text-ink-secondary hover:text-ink"
                  }`}
                >
                  <PenLine size={14} /> Custom Role (No Template)
                </button>
              </div>

              {creationMode === "TEMPLATE" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs-plus font-medium text-ink-secondary mb-1">Filter Department</label>
                      <select
                        value={templateDeptFilter}
                        onChange={(e) => setTemplateDeptFilter(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-line rounded-md bg-white text-ink"
                      >
                        <option value="all">All Departments</option>
                        <option value="SOFTWARE_ENGINEERING">Software Engineering</option>
                        <option value="DATA_ENGINEERING">Data Engineering</option>
                        <option value="QA">Quality Assurance</option>
                        <option value="SRE">Site Reliability Engineering</option>
                        <option value="SYSOPS">System Operations</option>
                        <option value="ITOPS">IT Operations</option>
                        <option value="PMO">Project Management</option>
                        <option value="SECOPS">Security Operations</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs-plus font-medium text-ink-secondary mb-1">Filter Category</label>
                      <select
                        value={templateCategoryFilter}
                        onChange={(e) => setTemplateCategoryFilter(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-line rounded-md bg-white text-ink"
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
                      value={selectedTemplateId}
                      onChange={(e) => {
                        const tpl = (roleTemplates || []).find((r) => r.id === e.target.value);
                        if (tpl) handleSelectTemplate(tpl);
                        else setSelectedTemplateId("");
                      }}
                      className="w-full px-3 py-2 text-sm-minus border border-line rounded-md bg-white text-ink focus:outline-none focus:border-brand"
                    >
                      <option value="">-- Choose a Role Template --</option>
                      {filteredTemplates.map((tpl) => {
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

                  {selectedTemplateObj && (
                    <div className="p-3 bg-brand-subtle border border-brand-border rounded-lg space-y-1.5 text-xs">
                      <div className="flex items-center justify-between font-semibold text-brand-ink">
                        <span>{selectedTemplateObj.roleName}</span>
                        <span className="px-2 py-0.5 bg-brand text-white rounded text-2xs uppercase font-mono">
                          {(selectedTemplateObj as any).experienceTier || "0-1"} yrs
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-ink-secondary text-xs-plus">
                        <span>Department: <strong className="text-ink">{selectedTemplateObj.department || "General"}</strong></span>
                        <span>•</span>
                        <span>Category: <strong className="text-ink">{(selectedTemplateObj as any).category || "FRESHER"}</strong></span>
                        <span>•</span>
                        <span>Questions: <strong className="text-ink">{((selectedTemplateObj as any).questions || []).length}</strong></span>
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
                  className="w-full px-3.5 py-2 text-sm-minus border border-line rounded-md bg-white focus:outline-none focus:border-brand"
                />
              </div>

              {creationMode === "CUSTOM" && (
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
              )}
            </div>

            <div className="px-6 py-4 border-t border-line bg-canvas rounded-b-[12px] flex items-center justify-end gap-2">
              <button
                onClick={() => setShowWizard(false)}
                className="px-3.5 py-2 text-xs font-medium text-ink-secondary hover:bg-line rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!driveName.trim()) {
                    toast.error("Please enter a drive name.");
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

                  const effectiveRoleTemplateId =
                    creationMode === "TEMPLATE" && selectedTemplateId
                      ? selectedTemplateId
                      : role.trim();

                  try {
                    const res = await createDrive({
                      name: driveName.trim(),
                      roleTemplateId: effectiveRoleTemplateId,
                      status: "DRAFT",
                    });
                    const targetId = res?.driveId || res?.id;
                    toast.success("Drive created with selected template! Opening configuration screen...");
                    setShowWizard(false);
                    if (targetId) {
                      navigate({ to: "/drives/$id", params: { id: targetId } });
                    }
                  } catch (err: any) {
                    toast.error("Failed to create drive: " + (err.message || err));
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-md transition-colors cursor-pointer shadow-sm"
              >
                Create &amp; Configure Drive
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Drive Confirmation Modal */}
      {confirmCloseDrive && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-line pb-3">
              <div className="p-2 bg-orange-50 text-orange-500 rounded-full">
                <X size={18} />
              </div>
              <h3 className="text-base font-semibold text-ink">Close Drive Early?</h3>
            </div>
            
            <p className="text-sm-minus text-ink-secondary leading-relaxed">
              Are you sure you want to close the assessment drive <span className="font-semibold text-ink">"{confirmCloseDrive.name}"</span> early? This will prevent any new candidates from starting the assessment and mark the drive as closed.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-sm-minus">
              <button
                onClick={() => setConfirmCloseDrive(null)}
                className="px-3.5 py-2 border border-line rounded hover:bg-canvas text-ink-secondary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  closeDrive(confirmCloseDrive.id);
                  setConfirmCloseDrive(null);
                }}
                className="px-4 py-2 text-white bg-orange-500 hover:bg-orange-600 font-semibold cursor-pointer shadow-sm transition-colors rounded"
              >
                Close Drive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteDrive && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-[440px] shadow-2xl p-6 space-y-4">
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
                className="px-3.5 py-2 border border-line rounded hover:bg-canvas text-ink-secondary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDrive}
                className="px-4 py-2 text-white bg-red-500 hover:bg-red-600 font-semibold cursor-pointer shadow-sm transition-colors rounded"
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
