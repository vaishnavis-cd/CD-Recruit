import { createFileRoute, Link, useNavigate, Outlet, useLocation } from "@tanstack/react-router";
import { useState, useMemo } from "react";
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
  const loading = useStore((s) => s.loading);

  const location = useLocation();
  const isExactDrives = location.pathname === "/drives" || location.pathname === "/drives/";

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DriveStatus | "all">("all");
  const [showWizard, setShowWizard] = useState(false);
  const [confirmDeleteDrive, setConfirmDeleteDrive] = useState<any | null>(null);

  // Wizard State
  const [wizardStep, setWizardStep] = useState(1);
  const [driveName, setDriveName] = useState("");
  const [selectedRole, setSelectedRole] = useState(ROLE_TEMPLATES[0].id);
  const [customRoleName, setCustomRoleName] = useState("");
  const [moduleConfig, setModuleConfig] = useState<any>({
    MCQ: { enabled: true, durationMinutes: 15, weight: 0.2 },
    SQL: { enabled: true, durationMinutes: 20, weight: 0.2 },
    CODING: { enabled: true, durationMinutes: 30, weight: 0.3 },
    AI_PROMPTING: { enabled: false, durationMinutes: 15, weight: 0.15 },
    SIMULATION: { enabled: false, durationMinutes: 10, weight: 0.15 },
  });
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [candidateInput, setCandidateInput] = useState("");
  const [wizardWarning, setWizardWarning] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drives.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      return true;
    });
  }, [drives, query, statusFilter]);

  const candidatesList = useMemo(() => {
    if (!candidateInput.trim()) return [];
    return candidateInput
      .split("\n")
      .map((line) => {
        const parts = line.split(",");
        const name = parts[0]?.trim() || "";
        const email = parts[1]?.trim() || "";
        return { name, email };
      })
      .filter((c) => c.name && c.email);
  }, [candidateInput]);

  const handleLaunch = async () => {
    try {
      const startIso = scheduleStart
        ? new Date(scheduleStart).toISOString()
        : new Date().toISOString();
      const endIso = scheduleEnd
        ? new Date(scheduleEnd).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const result = await createDrive({
        name: driveName,
        roleTemplateId: "1f2407c1-c096-49ba-9905-b0802104a802",
        moduleConfig,
        status: scheduleStart ? "SCHEDULED" : "ACTIVE",
        scheduleStart: startIso,
        scheduleEnd: endIso,
        candidates: candidatesList.map((c) => ({ name: c.name, candidateEmail: c.email }) as any),
      });

      if (result.warning) {
        setWizardWarning(result.warning);
        setWizardStep(6); // stay on final step to show warning
      } else {
        setShowWizard(false);
        resetWizard();
      }
    } catch (err: any) {
      alert(err.message || "Failed to create Drive");
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setDriveName("");
    setSelectedRole(ROLE_TEMPLATES[0].id);
    setCustomRoleName("");
    setSelectedQuestions([]);
    setScheduleStart("");
    setScheduleEnd("");
    setCandidateInput("");
    setWizardWarning(null);
  };

  const handleDeleteDrive = async () => {
    if (!confirmDeleteDrive) return;
    try {
      await deleteDrive(confirmDeleteDrive.id);
      setConfirmDeleteDrive(null);
    } catch (err: any) {
      alert("Failed to delete drive: " + (err.message || err));
    }
  };

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
                  onClick={() => {
                    if (confirm("Are you sure you want to close this Drive early?")) {
                      closeDrive(d.id);
                    }
                  }}
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

      {/* Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[680px] shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-[#0B0B0D]">
                  Create Assessment Drive
                </h2>
                <p className="text-[11px] text-[#8B8B93]">Step {wizardStep} of 6</p>
              </div>
              <button
                onClick={() => setShowWizard(false)}
                className="text-[#8B8B93] hover:text-[#0B0B0D]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Step 1: Basics */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                      Drive Name
                    </label>
                    <input
                      value={driveName}
                      onChange={(e) => setDriveName(e.target.value)}
                      placeholder="e.g. Backend Developer Batch - July 2026"
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
                      {ROLE_TEMPLATES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.roleName} ({r.track})
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
                        placeholder="e.g. Senior iOS Developer / DevOps Engineer"
                        className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none focus:border-[#2F5CFF]"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Modules Configuration */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <p className="text-[12px] text-[#5B5B64]">
                    Toggle active modules and configure timers/weightings:
                  </p>
                  {Object.entries(moduleConfig).map(([mod, conf]: [string, any]) => (
                    <div
                      key={mod}
                      className="p-3 border border-[#E6E6EA] rounded-lg flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={conf.enabled}
                          onChange={(e) => {
                            setModuleConfig({
                              ...moduleConfig,
                              [mod]: { ...conf, enabled: e.target.checked },
                            });
                          }}
                          className="w-4 h-4 rounded text-[#2F5CFF] focus:ring-[#2F5CFF]"
                        />
                        <div>
                          <div className="text-[13px] font-semibold text-[#0B0B0D]">{mod}</div>
                          <div className="text-[11px] text-[#8B8B93]">
                            Weight: {conf.weight * 100}%
                          </div>
                        </div>
                      </div>
                      {conf.enabled && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={conf.durationMinutes}
                            onChange={(e) => {
                              setModuleConfig({
                                ...moduleConfig,
                                [mod]: { ...conf, durationMinutes: parseInt(e.target.value) || 1 },
                              });
                            }}
                            className="w-16 px-2 py-1 text-center border border-[#E6E6EA] rounded text-[12px]"
                          />
                          <span className="text-[11px] text-[#8B8B93]">mins</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Step 3: Question Assignment */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <p className="text-[12px] text-[#5B5B64]">
                    Assign specific questions for the enabled modules from the bank (Optional):
                  </p>
                  <div className="border border-[#E6E6EA] rounded-md divide-y divide-[#EFF0F3] max-h-[300px] overflow-y-auto">
                    {(() => {
                      const enabledMods = Object.entries(moduleConfig)
                        .filter(([_, conf]: [string, any]) => conf.enabled)
                        .map(([mod]) => mod);
                      const filteredQs = questions.filter((q) => enabledMods.includes(q.moduleType));

                      return filteredQs.length === 0 ? (
                        <p className="p-4 text-center text-[12px] text-[#8B8B93]">
                          No questions found in bank matching active modules.
                        </p>
                      ) : (
                        filteredQs.map((q) => (
                          <div
                            key={q.id}
                            className="p-3 flex items-center justify-between hover:bg-[#F7F7F9]"
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={selectedQuestions.includes(q.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedQuestions([...selectedQuestions, q.id]);
                                  } else {
                                    setSelectedQuestions(
                                      selectedQuestions.filter((id) => id !== q.id),
                                    );
                                  }
                                }}
                                className="w-4 h-4 text-[#2F5CFF] border-[#E6E6EA]"
                              />
                              <div>
                                <div className="text-[12px] font-medium text-[#0B0B0D] line-clamp-1">
                                  {q.content?.prompt || q.content?.title || "No Prompt"}
                                </div>
                                <div className="text-[10px] text-[#8B8B93] uppercase font-mono mt-0.5">
                                  {q.moduleType} · {q.difficulty}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Step 4: Schedule */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <p className="text-[12px] text-[#5B5B64]">
                    Leave empty to launch instantly. Specify windows to schedule later:
                  </p>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                      Start Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduleStart}
                      onChange={(e) => setScheduleStart(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                      End Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduleEnd}
                      onChange={(e) => setScheduleEnd(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    />
                  </div>
                </div>
              )}

              {/* Step 5: Candidates */}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                    Candidate Roster (Name, Email per line)
                  </label>
                  <textarea
                    value={candidateInput}
                    onChange={(e) => setCandidateInput(e.target.value)}
                    placeholder="John Doe, john@example.com&#10;Jane Smith, jane@example.com"
                    rows={6}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] font-mono focus:outline-none focus:border-[#2F5CFF]"
                  />
                  <p className="text-[10px] text-[#8B8B93]">
                    Parsed: {candidatesList.length} candidate(s).
                  </p>
                </div>
              )}

              {/* Step 6: Review & Launch */}
              {wizardStep === 6 && (
                <div className="space-y-4">
                  <div className="p-4 bg-[#F7F7F9] rounded-lg space-y-2.5 text-[13px]">
                    <div>
                      <span className="text-[#8B8B93] font-medium">Drive Name:</span>{" "}
                      {driveName || "Unnamed Drive"}
                    </div>
                    <div>
                      <span className="text-[#8B8B93] font-medium">Role:</span>{" "}
                      {selectedRole === "rt-custom"
                        ? `${customRoleName || "Custom Role"}`
                        : ROLE_TEMPLATES.find((r) => r.id === selectedRole)?.roleName}
                    </div>
                    <div>
                      <span className="text-[#8B8B93] font-medium">Schedule:</span>{" "}
                      {scheduleStart
                        ? `${scheduleStart} to ${scheduleEnd}`
                        : "Instant Launch (Active immediately)"}
                    </div>
                    <div>
                      <span className="text-[#8B8B93] font-medium">Candidates:</span>{" "}
                      {candidatesList.length} total
                    </div>
                  </div>

                  {wizardWarning && (
                    <div className="p-4 bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg text-[#EF4444] text-[12px] flex gap-2">
                      <AlertTriangle size={16} className="shrink-0" />
                      <div>{wizardWarning}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#E6E6EA] flex items-center justify-between bg-[#F7F7F9] rounded-b-[12px]">
              {wizardStep > 1 ? (
                <button
                  onClick={() => setWizardStep(wizardStep - 1)}
                  className="flex items-center gap-1 py-2 px-3 text-[13px] font-medium border border-[#E6E6EA] rounded hover:bg-white transition-colors cursor-pointer"
                >
                  <ArrowLeft size={14} /> Back
                </button>
              ) : (
                <div />
              )}

              {wizardStep < 6 ? (
                <button
                  onClick={() => setWizardStep(wizardStep + 1)}
                  className="flex items-center gap-1 py-2 px-3.5 text-[13px] font-medium text-white bg-[#2F5CFF] rounded hover:bg-[#2448D9] transition-colors cursor-pointer"
                >
                  Next <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  onClick={handleLaunch}
                  className="flex items-center gap-1.5 py-2 px-4 text-[13px] font-medium text-white bg-[#2F5CFF] rounded hover:bg-[#1E4DDF] transition-colors cursor-pointer shadow-sm"
                >
                  <Check size={14} /> Launch Drive
                </button>
              )}
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
