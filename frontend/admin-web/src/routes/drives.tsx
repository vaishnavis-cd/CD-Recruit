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
import { useStore } from "../lib/store";
import { ROLE_TEMPLATES } from "../lib/mock-data";
import { type DriveStatus } from "../lib/types";

export const Route = createFileRoute("/drives")({
  component: DrivesPage,
  head: () => ({
    meta: [
      { title: "Drives — CD-Recruit" },
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
  ACTIVE: "bg-[#E3F9F2] text-[#0C6B58]",
  CLOSED: "bg-[#FDF2E9] text-[#AD5B0B]",
};
function DrivesPage() {
  const drives = useStore((s) => s.drives);
  const fetchDrives = useStore((s) => s.fetchDrives);
  const createDrive = useStore((s) => s.createDrive);
  const duplicateDrive = useStore((s) => s.duplicateDrive);
  const closeDrive = useStore((s) => s.closeDrive);
  const deleteDrive = useStore((s) => s.deleteDrive);
  const questions = useStore((s) => s.questions);
  const fetchQuestions = useStore((s) => s.fetchQuestions);
  const saveDriveQuestions = useStore((s) => s.saveDriveQuestions);
  const addCandidatesBulk = useStore((s) => s.addCandidatesBulk);
  const generateDriveLinks = useStore((s) => s.generateDriveLinks);
  const loading = useStore((s) => s.loading);
  const roleTemplates = useStore((s) => s.roleTemplates);

  const navigate = useNavigate();
  const location = useLocation();
  const isExactDrives = location.pathname === "/drives" || location.pathname === "/drives/";

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DriveStatus | "all">("all");
  const [showWizard, setShowWizard] = useState(false);
  const [confirmDeleteDrive, setConfirmDeleteDrive] = useState<any | null>(null);
  const [confirmCloseDrive, setConfirmCloseDrive] = useState<any | null>(null);

  // Wizard State
  const [step, setStep] = useState(1);
  const [driveName, setDriveName] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [customRoleName, setCustomRoleName] = useState("");
  
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
  }, []);

  // Sync selectedRole with first template when templates load
  useEffect(() => {
    if (roleTemplates.length > 0 && selectedRole !== "rt-custom") {
      const exists = roleTemplates.some((r) => r.id === selectedRole);
      if (!exists) {
        setSelectedRole(roleTemplates[0].id);
      }
    }
  }, [roleTemplates, selectedRole]);

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
    if (selectedRole === "rt-custom" && !customRoleName.trim()) {
      errors.push("Custom Role Name is required.");
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
  }, [driveName, selectedRole, customRoleName, modulesConfig, selectedQuestionIds, questions, scheduleStart, scheduleEnd, candidateList, candidateErrors]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drives.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      return true;
    });
  }, [drives, query, statusFilter]);

  const handleLaunch = async () => {
    if (validationErrors.length > 0) {
      toast.error("Please resolve all errors before creating the drive.");
      return;
    }

    const effectiveRoleTemplateId =
      selectedRole === "rt-custom"
        ? (roleTemplates[0]?.id ?? "")
        : selectedRole;

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
      resetWizard();
      navigate({ to: `/drives/${result.driveId}` });
    } catch (err: any) {
      toast.error(err.message || "Failed to create Drive");
    }
  };

  const resetWizard = () => {
    setStep(1);
    setDriveName("");
    setSelectedRole(roleTemplates[0]?.id || "");
    setCustomRoleName("");
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

  if (!isExactDrives) {
    return <Outlet />;
  }

  // Filtered Questions for Step 3 selector
  const filteredQuestionsList = useMemo(() => {
    const s = questionSearch.toLowerCase().trim();
    return questions.filter(q => {
      if (selectedModuleFilter !== "all" && q.moduleType !== selectedModuleFilter) return false;
      if (s) {
        const title = (q.content?.title || "").toLowerCase();
        const desc = (q.content?.description || q.content?.text || "").toLowerCase();
        if (!title.includes(s) && !desc.includes(s)) return false;
      }
      return true;
    });
  }, [questions, selectedModuleFilter, questionSearch]);

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
          className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[#2F5CFF] rounded-md hover:bg-[#1E4DDF] shadow-sm transition-colors cursor-pointer"
        >
          <Plus size={14} />
          Create Drive
        </button>
      }
    >
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(["all", "DRAFT", "SCHEDULED", "ACTIVE", "CLOSED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors cursor-pointer ${
              statusFilter === s
                ? "bg-[#2F5CFF] text-white border-[#2F5CFF]"
                : "bg-white text-[#5B5B64] border-[#E6E6EA] hover:border-[#D6D7DC]"
            }`}
          >
            {s === "all" ? "All Drives" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Grid of Drives */}
      {filtered.length === 0 ? (
        <div className="flex justify-center w-full py-8">
          <p className="text-[12px] italic text-[#8B8B93]">No Entries</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <div
              key={d.id}
              className="bg-white border border-[#E6E6EA] rounded-[10px] p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-wide font-medium ${STATUS_COLOR[d.status]}`}
                  >
                    {STATUS_LABEL[d.status]}
                  </span>
                  <span className="text-[11px] font-mono text-[#8B8B93]">
                    {d.createdAt.slice(0, 10)}
                  </span>
                </div>
                <h3 className="text-[15px] font-semibold text-[#0B0B0D] mb-1.5 line-clamp-1">
                  {d.name}
                </h3>
                <p className="text-[12px] text-[#5B5B64] mb-4">Role: {d.roleTemplateName}</p>

                <div className="grid grid-cols-3 gap-2 py-3 border-y border-[#EFF0F3] mb-4 text-center">
                  <div>
                    <div className="text-[15px] font-mono font-semibold text-[#0B0B0D]">
                      {d.invitedCount}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-[#8B8B93] mt-0.5">
                      Invited
                    </div>
                  </div>
                  <div>
                    <div className="text-[15px] font-mono font-semibold text-[#0B0B0D]">
                      {d.startedCount}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-[#8B8B93] mt-0.5">
                      Started
                    </div>
                  </div>
                  <div>
                    <div className="text-[15px] font-mono font-semibold text-[#0B0B0D]">
                      {d.completedCount}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-[#8B8B93] mt-0.5">
                      Finished
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to="/drives/$id"
                  params={{ id: d.id }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium border border-[#E6E6EA] rounded-md hover:bg-[#F7F7F9] transition-colors"
                >
                  <Eye size={12} />
                  View Details
                </Link>
                <button
                  onClick={() => duplicateDrive(d.id)}
                  className="p-2 border border-[#E6E6EA] rounded-md hover:bg-[#F7F7F9] text-[#5B5B64] transition-colors"
                  title="Duplicate Drive"
                >
                  <Copy size={12} />
                </button>
                <button
                  onClick={() => setConfirmDeleteDrive(d)}
                  className="p-2 border border-red-100 bg-red-50/50 hover:bg-red-50 text-red-500 rounded-md transition-colors cursor-pointer"
                  title="Delete Drive"
                >
                  <Trash2 size={12} />
                </button>
                {d.status === "ACTIVE" && (
                  <button
                    onClick={() => setConfirmCloseDrive(d)}
                    className="px-2.5 py-1.5 text-[12px] font-medium border border-[#FEE2E2] bg-[#FEF2F2] text-[#EF4444] rounded-md hover:bg-[#FEE2E2] transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 6-Step Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[700px] shadow-2xl flex flex-col h-[85vh]">
            {/* Header with Steps Indicators */}
            <div className="px-6 py-4 border-b border-[#E6E6EA] bg-[#F7F7F9] rounded-t-[12px]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[16px] font-semibold text-[#0B0B0D]">
                  Create Drive Wizard
                </h2>
                <button
                  onClick={() => setShowWizard(false)}
                  className="text-[#8B8B93] hover:text-[#0B0B0D]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-medium text-[#8B8B93]">
                {[
                  "Basics",
                  "Modules",
                  "Questions",
                  "Schedule",
                  "Candidates",
                  "Review",
                ].map((sName, idx) => (
                  <div key={sName} className="flex items-center gap-1.5">
                    <span
                      className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                        step === idx + 1
                          ? "bg-[#2F5CFF] text-white"
                          : step > idx + 1
                          ? "bg-[#0C6B58] text-white"
                          : "bg-[#EFF0F3] text-[#5B5B64]"
                      }`}
                    >
                      {step > idx + 1 ? "✓" : idx + 1}
                    </span>
                    <span className={step === idx + 1 ? "text-[#0B0B0D] font-semibold" : ""}>
                      {sName}
                    </span>
                    {idx < 5 && <span className="mx-1 text-[#D6D7DC]">→</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Step Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* STEP 1: BASICS */}
              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="text-[14px] font-semibold text-[#0B0B0D]">Step 1: Drive Basics</h3>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                      Drive Name
                    </label>
                    <input
                      value={driveName}
                      onChange={(e) => setDriveName(e.target.value)}
                      placeholder="e.g. Senior Backend Engineer - July 2026 Batch"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none focus:border-[#2F5CFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                      Role Template
                    </label>
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none focus:border-[#2F5CFF]"
                    >
                      {roleTemplates.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.roleName} {r.track ? `(${r.track})` : ""}
                        </option>
                      ))}
                      <option value="rt-custom">Custom Role</option>
                    </select>
                  </div>
                  {selectedRole === "rt-custom" && (
                    <div>
                      <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                        Custom Role Name
                      </label>
                      <input
                        value={customRoleName}
                        onChange={(e) => setCustomRoleName(e.target.value)}
                        placeholder="e.g. Senior DevOps Specialist"
                        className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none focus:border-[#2F5CFF]"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: MODULES CONFIG */}
              {step === 2 && (
                <div className="space-y-4">
                  <h3 className="text-[14px] font-semibold text-[#0B0B0D]">Step 2: Module Configurations</h3>
                  <p className="text-[12px] text-[#8B8B93] mb-2">Enable modules and allocate time and scoring weights. Total weight must equal 100%.</p>
                  
                  <div className="space-y-3">
                    {Object.keys(modulesConfig).map((key) => {
                      const mod = modulesConfig[key];
                      return (
                        <div key={key} className="flex items-center gap-4 p-3 border border-[#E6E6EA] rounded-md bg-[#F7F7F9]">
                          <input
                            type="checkbox"
                            checked={mod.enabled}
                            onChange={(e) => setModulesConfig({
                              ...modulesConfig,
                              [key]: { ...mod, enabled: e.target.checked }
                            })}
                            className="h-4 w-4 rounded border-[#D6D7DC]"
                          />
                          <span className="w-40 text-[13px] font-semibold text-[#0B0B0D]">{key}</span>
                          
                          {mod.enabled ? (
                            <div className="flex items-center gap-4 flex-1">
                              <div className="flex items-center gap-1.5">
                                <label className="text-[11px] text-[#5B5B64]">Mins:</label>
                                <input
                                  type="number"
                                  min={1}
                                  value={mod.durationMinutes}
                                  onChange={(e) => setModulesConfig({
                                    ...modulesConfig,
                                    [key]: { ...mod, durationMinutes: parseInt(e.target.value) || 0 }
                                  })}
                                  className="w-16 px-2 py-1 text-[12px] border border-[#D6D7DC] rounded bg-white"
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <label className="text-[11px] text-[#5B5B64]">Weight:</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={Math.round(mod.weight * 100)}
                                  onChange={(e) => setModulesConfig({
                                    ...modulesConfig,
                                    [key]: { ...mod, weight: (parseInt(e.target.value) || 0) / 100 }
                                  })}
                                  className="w-16 px-2 py-1 text-[12px] border border-[#D6D7DC] rounded bg-white"
                                />
                                <span className="text-[11px] text-[#8B8B93]">%</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#8B8B93] italic">Disabled</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white border border-[#E6E6EA] rounded-md text-[13px]">
                    <span className="font-semibold text-[#5B5B64]">Total Allocated Weight:</span>
                    <span className={`font-mono font-bold ${
                      Math.abs(Object.keys(modulesConfig).filter(k => modulesConfig[k].enabled).reduce((s, k) => s + modulesConfig[k].weight, 0) - 1.0) < 0.001
                        ? "text-[#0C6B58]"
                        : "text-[#C0392B]"
                    }`}>
                      {Math.round(Object.keys(modulesConfig).filter(k => modulesConfig[k].enabled).reduce((s, k) => s + modulesConfig[k].weight, 0) * 100)}% / 100%
                    </span>
                  </div>
                </div>
              )}

              {/* STEP 3: QUESTIONS SELECTOR */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[14px] font-semibold text-[#0B0B0D]">Step 3: Question Bank Select</h3>
                    <span className="text-[12px] font-semibold text-[#2F5CFF]">
                      {selectedQuestionIds.length} Selected
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B8B93]" />
                      <input
                        value={questionSearch}
                        onChange={(e) => setQuestionSearch(e.target.value)}
                        placeholder="Search questions by text…"
                        className="w-full pl-8 pr-2 py-1.5 text-[12px] border border-[#E6E6EA] rounded bg-white"
                      />
                    </div>
                    <select
                      value={selectedModuleFilter}
                      onChange={(e) => setSelectedModuleFilter(e.target.value)}
                      className="text-[12px] border border-[#E6E6EA] rounded px-2 bg-white"
                    >
                      <option value="all">All Modules</option>
                      <option value="MCQ">MCQ</option>
                      <option value="SQL">SQL</option>
                      <option value="CODING">Coding</option>
                      <option value="AI_PROMPTING">AI Prompting</option>
                      <option value="SIMULATION">Simulation</option>
                    </select>
                  </div>

                  <div className="border border-[#E6E6EA] rounded-md max-h-[300px] overflow-y-auto divide-y divide-[#E6E6EA]">
                    {filteredQuestionsList.map((q) => {
                      const isSelected = selectedQuestionIds.includes(q.id);
                      return (
                        <div key={q.id} className="p-3 flex items-start gap-3 hover:bg-[#F7F7F9]">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) {
                                setSelectedQuestionIds(selectedQuestionIds.filter(id => id !== q.id));
                              } else {
                                setSelectedQuestionIds([...selectedQuestionIds, q.id]);
                              }
                            }}
                            className="mt-1 h-3.5 w-3.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="px-1.5 py-0.5 rounded bg-[#EFF0F3] text-[#5B5B64] font-mono text-[9px] uppercase">
                                {q.moduleType}
                              </span>
                              <span className="text-[10px] text-[#8B8B93]">{q.difficulty}</span>
                            </div>
                            <h4 className="text-[12px] font-semibold text-[#0B0B0D] truncate">
                              {q.content?.title || q.content?.text || "Untitled Question"}
                            </h4>
                            <p className="text-[11px] text-[#8B8B93] truncate mt-0.5">
                              {q.content?.description || q.content?.text || ""}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 4: SCHEDULE CONFIG */}
              {step === 4 && (
                <div className="space-y-4">
                  <h3 className="text-[14px] font-semibold text-[#0B0B0D]">Step 4: Scheduling & Concurrency</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">Start Time</label>
                      <input
                        type="datetime-local"
                        value={scheduleStart}
                        onChange={(e) => setScheduleStart(e.target.value)}
                        className="w-full px-3 py-1.5 text-[12px] border border-[#E6E6EA] rounded bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">End Time</label>
                      <input
                        type="datetime-local"
                        value={scheduleEnd}
                        onChange={(e) => setScheduleEnd(e.target.value)}
                        className="w-full px-3 py-1.5 text-[12px] border border-[#E6E6EA] rounded bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">Buffer Window (Mins)</label>
                      <input
                        type="number"
                        value={bufferMinutes}
                        onChange={(e) => setBufferMinutes(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 text-[12px] border border-[#E6E6EA] rounded bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">Grace Period (Mins)</label>
                      <input
                        type="number"
                        value={graceMinutes}
                        onChange={(e) => setGraceMinutes(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 text-[12px] border border-[#E6E6EA] rounded bg-white"
                      />
                    </div>
                  </div>

                  {showConcurrencyWarning && (
                    <div className="flex items-start gap-2.5 p-3 rounded-md bg-orange-50 border border-orange-200 text-orange-700 text-[12px] leading-relaxed">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-orange-500" />
                      <div>
                        <span className="font-semibold block mb-0.5">High Concurrency warning!</span>
                        <span>The concurrency ratio is {concurrencyRatio.toFixed(1)} candidates per hour (Threshold: 25/hr). This schedule may saturate local sandbox capacity. Consider expanding the scheduled window.</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 5: CANDIDATE ROSTER */}
              {step === 5 && (
                <div className="space-y-4">
                  <h3 className="text-[14px] font-semibold text-[#0B0B0D]">Step 5: Candidates Roster</h3>
                  
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                      Pasted CSV Candidate List (Name, Email per line)
                    </label>
                    <textarea
                      value={candidateInput}
                      onChange={(e) => setCandidateInput(e.target.value)}
                      placeholder="John Doe, john@example.com&#10;Alice Smith, alice@example.com"
                      rows={5}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono focus:outline-none focus:border-[#2F5CFF] resize-none"
                    />
                  </div>

                  {candidateErrors.length > 0 && (
                    <div className="flex items-start gap-2.5 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-[12px] leading-relaxed max-h-[150px] overflow-y-auto">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
                      <div>
                        <span className="font-semibold block mb-1">Roster Validation Errors:</span>
                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
                          {candidateErrors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[12px] text-[#5B5B64]">
                    <span>Valid Candidates Parsed:</span>
                    <span className="font-semibold text-[#0B0B0D]">{candidateList.length}</span>
                  </div>
                </div>
              )}

              {/* STEP 6: REVIEW & SEND */}
              {step === 6 && (
                <div className="space-y-4">
                  <h3 className="text-[14px] font-semibold text-[#0B0B0D]">Step 6: Review Configuration</h3>
                  
                  {validationErrors.length > 0 && (
                    <div className="flex items-start gap-2.5 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-[12px] leading-relaxed">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
                      <div>
                        <span className="font-semibold block mb-1">Completeness Block:</span>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                          {validationErrors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="border border-[#E6E6EA] rounded-md divide-y divide-[#E6E6EA] text-[13px] bg-[#F7F7F9]">
                    <div className="p-3 flex justify-between">
                      <span className="text-[#5B5B64] font-medium">Drive Name:</span>
                      <span className="font-semibold text-[#0B0B0D]">{driveName}</span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-[#5B5B64] font-medium">Role Preset:</span>
                      <span className="font-semibold text-[#0B0B0D]">
                        {selectedRole === "rt-custom" ? `Custom (${customRoleName})` : roleTemplates.find(r => r.id === selectedRole)?.roleName}
                      </span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-[#5B5B64] font-medium">Schedule:</span>
                      <span className="font-semibold text-[#0B0B0D]">{scheduleStart.replace("T", " ")} to {scheduleEnd.replace("T", " ")}</span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-[#5B5B64] font-medium">Total Candidates:</span>
                      <span className="font-semibold text-[#0B0B0D]">{candidateList.length}</span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-[#5B5B64] font-medium">Selected Questions:</span>
                      <span className="font-semibold text-[#0B0B0D]">{selectedQuestionIds.length}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with Prev/Next Buttons */}
            <div className="px-6 py-4 border-t border-[#E6E6EA] flex items-center justify-between bg-[#F7F7F9] rounded-b-[12px]">
              <div>
                {step > 1 && (
                  <button
                    onClick={() => setStep(step - 1)}
                    className="flex items-center gap-1.5 py-1.5 px-3 text-[12px] font-semibold border border-[#E6E6EA] bg-white rounded hover:bg-[#F7F7F9] text-[#5B5B64] transition-colors cursor-pointer"
                  >
                    <ArrowLeft size={14} />
                    Back
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowWizard(false)}
                  className="py-1.5 px-3.5 text-[12px] font-medium text-[#8B8B93] hover:text-[#0B0B0D] transition-colors"
                >
                  Cancel
                </button>
                {step < 6 ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    disabled={
                      (step === 1 && (!driveName.trim() || (selectedRole === "rt-custom" && !customRoleName.trim()))) ||
                      (step === 2 && Math.abs(Object.keys(modulesConfig).filter(k => modulesConfig[k].enabled).reduce((s, k) => s + modulesConfig[k].weight, 0) - 1.0) > 0.001) ||
                      (step === 5 && candidateErrors.length > 0)
                    }
                    className="flex items-center gap-1.5 py-1.5 px-3.5 text-[12px] font-semibold text-white bg-[#2F5CFF] rounded hover:bg-[#1E4DDF] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    onClick={handleLaunch}
                    disabled={validationErrors.length > 0}
                    className="flex items-center gap-1.5 py-1.5 px-4 text-[12px] font-semibold text-white bg-[#0C6B58] rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Check size={14} />
                    Create & Schedule
                  </button>
                )}
              </div>
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
