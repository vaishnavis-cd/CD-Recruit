import { createFileRoute, Link, useNavigate, Outlet, useLocation } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
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
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type DriveStatus } from "../lib/types";

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
  DRAFT: "bg-[#EFF0F3] text-[#5B5B64]",
  SCHEDULED: "bg-[#EAF0FF] text-[#15308F]",
  ACTIVE: "bg-[#E6F7F4] text-[#0B6B58]",
  CLOSED: "bg-[#FDF2E9] text-[#AD5B0B]",
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
  const [showWizard, setShowWizard] = useState(false);
  const [confirmDeleteDrive, setConfirmDeleteDrive] = useState<any | null>(null);
  const [confirmCloseDrive, setConfirmCloseDrive] = useState<any | null>(null);

  // Wizard State
  const [step, setStep] = useState(1);
  const [driveName, setDriveName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [activeTemplatePreview, setActiveTemplatePreview] = useState<any | null>(null);
  const [isLoadingTemplatePreview, setIsLoadingTemplatePreview] = useState(false);
  const [templatePreviewError, setTemplatePreviewError] = useState<string | null>(null);
  
  // Step 2: Modules config
  const [modulesConfig, setModulesConfig] = useState<Record<string, { enabled: boolean; durationMinutes: number; weight: number }>>({
    MCQ: { enabled: true, durationMinutes: 15, weight: 0.15 },
    SQL: { enabled: true, durationMinutes: 20, weight: 0.20 },
    CODING: { enabled: true, durationMinutes: 30, weight: 0.30 },
    AI_PROMPTING: { enabled: true, durationMinutes: 15, weight: 0.20 },
    SIMULATION: { enabled: true, durationMinutes: 10, weight: 0.15 },
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

  // Fetch all questions and drives when modal opens/mounts
  useEffect(() => {
    fetchQuestions();
    fetchDrives();
    fetchRoleTemplates();
  }, []);

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
      fetch(`${API_BASE}/admin/role-templates/active?department=${department}&level=${level}`, { headers })
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
            setTemplatePreviewError(`No active RoleTemplate found for ${department} / ${level}.`);
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
  }, [department, level]);



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

  // Filtered Questions for Step 3 selector
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
    <AppShell
      title="Drives"
      count={filtered.length}
      search={
        <div className="relative w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9CA5]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search drives by name…"
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
          />
        </div>
      }
      actions={
        <button
          onClick={() => {
            resetWizard();
            setShowWizard(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[#2F5CFF] rounded-md hover:bg-[#0037FF] shadow-sm transition-colors cursor-pointer"
        >
          <Plus size={14} />
          Create Drive
        </button>
      }
    >
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "DRAFT", "SCHEDULED", "ACTIVE", "CLOSED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors cursor-pointer ${
                statusFilter === s
                  ? "text-black border-[#2F5CFF] border-2"
                  : "bg-white text-[#5B5B64] border-[#E6E6EA] border-2 hover:border-[#D6D7DC]"
              }`}
            >
              {s === "all" ? "All Drives" : STATUS_LABEL[s]}  
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 border-l border-[#E6E6EA] pl-3">
          <span className="text-[11px] font-semibold text-[#8B8B93] uppercase tracking-wider">Source:</span>
          {(["all", "DIRECT", "PARTNER_API"] as const).map((src) => (
            <button
              key={src}
              onClick={() => setSourceFilter(src)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                sourceFilter === src
                  ? "bg-[#2F5CFF] text-white border-[#2F5CFF]"
                  : "bg-white text-[#5B5B64] border-[#E6E6EA] hover:border-[#D6D7DC]"
              }`}
            >
              {src === "all" ? "All Sources" : src === "DIRECT" ? "Direct" : "Partner API"}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Drives */}
      {filtered.length === 0 ? (
        <div className="flex justify-center w-full py-8">
          <p className="text-[12px] italic text-[#8B8B93]">To get Started click on Create Drive</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <div
              key={d.id}
              className="bg-white border border-[#E6E6EA] rounded-[16px] p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div className="flex items-baseline justify-between gap-3 mb-8">
                <div className="min-w-0 flex-1 space-y-2">
                  <h3 className="text-[18px] font-bold text-[#0B0B0D] tracking-tight truncate leading-snug">
                    {d.name}
                  </h3>
                  <p className="text-[13px] text-[#8B8B93] font-normal truncate">
                    {d.roleTemplateName || "Software Developer"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="flex items-center gap-1">
                    <span
                      className={`px-2 py-0.5 rounded-[999px] text-[10px] font-mono uppercase tracking-wider font-semibold ${
                        (d as any).originChannel === "PARTNER_API"
                          ? "bg-purple-100 text-purple-800 border border-purple-200"
                          : "bg-gray-100 text-gray-600 border border-gray-200"
                      }`}
                    >
                      {(d as any).originChannel === "PARTNER_API" ? "Partner API" : "Direct"}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-[999px] text-[11px] font-mono uppercase tracking-wider font-semibold ${STATUS_COLOR[d.status]}`}
                    >
                      {STATUS_LABEL[d.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8B8B93]">
                    <Calendar size={13} className="text-[#8B8B93] shrink-0" />
                    <span>{formatShortDate(d.scheduleStart || d.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3.5">
                <Link
                  to="/drives/$id"
                  params={{ id: d.id }}
                  className="flex-1 py-1.5 px-4 text-[13px] font-semibold text-[#2F5CFF] border border-[#2F5CFF] bg-transparent hover:bg-[#2F5CFF] hover:text-white rounded-[12px] transition-all text-center cursor-pointer flex items-center justify-center"
                >
                  View Drive
                </Link>
                <button
                  onClick={() => setConfirmDeleteDrive(d)}
                  className="p-2 text-[#8B8B93] hover:text-[#C0392B] hover:bg-[#FFE8E6] border border-[#E6E6EA] hover:border-[#FFAEA4] rounded-[12px] transition-all cursor-pointer flex items-center justify-center shrink-0"
                  title="Delete Drive"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Streamlined Drive Creation Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[480px] shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-[#0B0B0D]">Create New Drive</h2>
                <p className="text-[12px] text-[#5B5B64] mt-0.5">Enter drive name and target role to begin configuration.</p>
              </div>
              <button onClick={() => setShowWizard(false)} className="text-[#8B8B93] hover:text-[#0B0B0D] cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[14px] font-medium text-[#5B5B64] mb-1.5">
                  Drive Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={driveName}
                  onChange={(e) => setDriveName(e.target.value)}
                  placeholder="e.g. Software Developer Drive - July 2026"
                  className="w-full px-3.5 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#5B5B64] mb-1.5">
                  Role <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Software Developer"
                  className="w-full px-3.5 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[13px] font-medium text-[#5B5B64] mb-1">
                    Department (Partner API)
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
                  >
                    <option value="">Select Department...</option>
                    <option value="SOFTWARE_ENGINEERING">Software Engineering</option>
                    <option value="DATA_ENGINEERING">Data Engineering</option>
                    <option value="PMO">PMO</option>
                    <option value="QA">QA</option>
                    <option value="SYSOPS">SysOps</option>
                    <option value="ITOPS">ITOps</option>
                    <option value="SECOPS">SecOps</option>
                    <option value="SRE">SRE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#5B5B64] mb-1">
                    Experience Level
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
                  >
                    <option value="">Select Level...</option>
                    <option value="FRESHER">Fresher</option>
                    <option value="EXPERIENCED">Experienced</option>
                  </select>
                </div>
              </div>

              {/* Live Preview of Attached Active RoleTemplate */}
              {isLoadingTemplatePreview && (
                <div className="p-3.5 bg-[#F7F7F9] border border-[#E6E6EA] rounded-lg text-[12px] text-[#5B5B64] flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-[#2F5CFF] border-t-transparent rounded-full animate-spin"></div>
                  <span>Fetching active role template preview...</span>
                </div>
              )}

              {!isLoadingTemplatePreview && activeTemplatePreview && (
                <div className="p-3.5 bg-[#F0F4FF] border border-[#C6D4FF] rounded-lg text-[13px] space-y-2">
                  <div className="flex items-center justify-between font-semibold text-[#1E3A8A]">
                    <span>⚡ Active Role Template Preview: {activeTemplatePreview.roleName} (v{activeTemplatePreview.version})</span>
                    <span className="px-2 py-0.5 text-[11px] bg-[#2F5CFF] text-white rounded font-medium">Active</span>
                  </div>
                  <div className="text-[12px] text-[#3B82F6]">
                    Duration: {activeTemplatePreview.durationMinutes} mins | Dept: {activeTemplatePreview.department} | Level: {activeTemplatePreview.level}
                  </div>
                  {activeTemplatePreview.questions && activeTemplatePreview.questions.length > 0 ? (
                    <div className="space-y-1 pt-1">
                      <div className="text-[11px] font-medium text-[#4B5563] uppercase tracking-wider">
                        Attached Questions ({activeTemplatePreview.questions.length}):
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                        {activeTemplatePreview.questions.map((q: any, idx: number) => (
                          <div key={q.id || idx} className="flex items-center justify-between px-2.5 py-1 bg-white border border-[#E0E7FF] rounded text-[12px]">
                            <span className="font-mono text-[#2F5CFF] font-medium">[{q.moduleType}]</span>
                            <span className="truncate max-w-[220px] text-[#374151]">
                              {q.question?.content?.prompt || q.question?.content?.title || `Question #${idx + 1}`}
                            </span>
                            <span className="text-[11px] text-[#6B7280]">v{q.questionVersionSnapshot || q.question?.version || 1}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[12px] text-[#6B7280] italic">No questions attached to this template.</div>
                  )}
                </div>
              )}

              {!isLoadingTemplatePreview && templatePreviewError && (
                <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg text-[12px] text-[#991B1B]">
                  ⚠️ {templatePreviewError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#E6E6EA] bg-[#F7F7F9] rounded-b-[12px] flex items-center justify-end gap-2">
              <button
                onClick={() => setShowWizard(false)}
                className="px-3.5 py-2 text-[12px] font-medium text-[#5B5B64] hover:bg-[#E6E6EA] rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!driveName.trim()) {
                    toast.error("Please enter a drive name.");
                    return;
                  }
                  try {
                    if (!role.trim()) {
                      toast.error("Please enter a role.");
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

                    const res = await createDrive({
                      name: driveName.trim(),
                      roleTemplateId: effectiveRoleTemplateId,
                      status: "DRAFT",
                    });
                    const targetId = res?.driveId || res?.id;
                    toast.success("Drive created! Opening configuration screen...");
                    setShowWizard(false);
                    if (targetId) {
                      navigate({ to: "/drives/$id", params: { id: targetId } });
                    }
                  } catch (err: any) {
                    toast.error("Failed to create drive: " + (err.message || err));
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-white bg-[#2F5CFF] hover:bg-[#0037FF] rounded-md transition-colors cursor-pointer shadow-sm"
              >
                Create & Configure Drive
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Drive Confirmation Modal */}
      {confirmCloseDrive && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#E6E6EA] pb-3">
              <div className="p-2 bg-orange-50 text-orange-500 rounded-full">
                <X size={18} />
              </div>
              <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Close Drive Early?</h3>
            </div>
            
            <p className="text-[13px] text-[#5B5B64] leading-relaxed">
              Are you sure you want to close the assessment drive <span className="font-semibold text-[#0B0B0D]">"{confirmCloseDrive.name}"</span> early? This will prevent any new candidates from starting the assessment and mark the drive as closed.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-[13px]">
              <button
                onClick={() => setConfirmCloseDrive(null)}
                className="px-3.5 py-2 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] transition-colors cursor-pointer"
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
          <div className="bg-white rounded-[12px] w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#E6E6EA] pb-3">
              <div className="p-2 bg-red-50 text-red-500 rounded-full">
                <AlertTriangle size={18} />
              </div>
              <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Delete Drive?</h3>
            </div>
            
            <p className="text-[13px] text-[#5B5B64] leading-relaxed">
              Are you sure you want to delete the assessment drive <span className="font-semibold text-[#0B0B0D]">"{confirmDeleteDrive.name}"</span>?
              This will permanently revoke all invites and delete all candidate sessions, proctoring/event logs, and scores. This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-[13px]">
              <button
                onClick={() => setConfirmDeleteDrive(null)}
                className="px-3.5 py-2 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] transition-colors cursor-pointer"
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
