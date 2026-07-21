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
          className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[#2F5CFF] rounded-md hover:bg-[#0037FF] shadow-sm transition-colors cursor-pointer"
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

      {/* Streamlined Drive Creation Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[480px] shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-[#0B0B0D]">Create New Drive</h2>
                <p className="text-[12px] text-[#5B5B64] mt-0.5">Enter drive name and target role to begin configuration.</p>
              </div>
              <button onClick={() => setShowWizard(false)} className="text-[#8B8B93] hover:text-[#0B0B0D]">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
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
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                  Target Role Preset
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3.5 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
                >
                  {roleTemplates.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name}
                    </option>
                  ))}
                  <option value="rt-custom">+ Custom Role Name</option>
                </select>
              </div>

              {selectedRole === "rt-custom" && (
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                    Custom Role Name
                  </label>
                  <input
                    type="text"
                    value={customRoleName}
                    onChange={(e) => setCustomRoleName(e.target.value)}
                    placeholder="e.g. Senior DevOps Specialist"
                    className="w-full px-3.5 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
                  />
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
                    const res = await createDrive({
                      name: driveName.trim(),
                      roleTemplateId: selectedRole === "rt-custom" ? (roleTemplates[0]?.id ?? "") : selectedRole,
                      status: "DRAFT",
                    });
                    toast.success("Drive created! Opening configuration screen...");
                    setShowWizard(false);
                    navigate({ to: "/drives/$id", params: { id: res.driveId } });
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
