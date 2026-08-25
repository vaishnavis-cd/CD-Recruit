import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  Layers,
  Search,
  X,
  Edit2,
  Trash2,
  GitFork,
  Check,
  AlertCircle,
  Clock,
  Briefcase,
  HelpCircle,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { API_BASE, getAuthHeaders } from "../lib/store";
import {
  getDepartmentAllowedModules,
  extractQuestionTier,
  MODULE_LABEL_MAP,
} from "../lib/roleModules";

export const Route = createFileRoute("/templates")({
  component: RoleTemplatesPage,
  head: () => ({
    meta: [
      { title: "Role Templates — Proctora" },
      {
        name: "description",
        content: "Author and publish module-aware role templates and versioned question presets.",
      },
    ],
  }),
});

const DEPARTMENTS = [
  "SOFTWARE_ENGINEERING",
  "DATA_ENGINEERING",
  "PMO",
  "QA",
  "SYSOPS",
  "ITOPS",
  "SECOPS",
  "SRE",
] as const;

const LEVELS = ["FRESHER", "EXPERIENCED"] as const;
const EXPERIENCED_LEVELS = ["L1", "L2", "L3"] as const;

export function RoleTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [questionsBank, setQuestionsBank] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [activeOnlyFilter, setActiveOnlyFilter] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);

  // Form State
  const [roleName, setRoleName] = useState("");
  const [department, setDepartment] = useState<string>("SOFTWARE_ENGINEERING");
  const [level, setLevel] = useState<string>("FRESHER");
  const [experiencedLevel, setExperiencedLevel] = useState<string>("L1");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [weightingPreset, setWeightingPreset] = useState({
    MCQ: 0.2,
    SQL: 0.2,
    CODING: 0.3,
    AI_PROMPTING: 0.15,
    SIMULATION: 0.15,
  });

  // Selected questions for template authoring: map of questionId -> { moduleType, pointShare }
  const [selectedQuestionsMap, setSelectedQuestionsMap] = useState<
    Record<string, { moduleType: string; pointShare: number }>
  >({});

  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [filterByRoleAndLevel, setFilterByRoleAndLevel] = useState(true);

  const getEligibleQuestions = (
    dept: string,
    lvl: string,
    expLvl: string | null
  ) => {
    const allowedMods = getDepartmentAllowedModules(dept);
    return questionsBank.filter((q) => {
      if (!allowedMods.includes(q.moduleType)) return false;

      // Role / Department Match
      const qRole = (q.role || "").toUpperCase();
      const currentDept = dept.toUpperCase();
      const isGeneral = !qRole || qRole === "GENERAL";

      let isRoleMatch = isGeneral;
      if (!isRoleMatch) {
        if (currentDept === "SOFTWARE_ENGINEERING") {
          isRoleMatch = qRole === "SDE" || qRole === "SOFTWARE_ENGINEERING";
        } else {
          isRoleMatch = qRole === currentDept;
        }
      }
      if (!isRoleMatch) return false;

      // Experience Level / Tier Match
      const qTags = (q.tags || []).map((t: string) => t.toLowerCase());
      const hasTier1 = qTags.includes("tier_1") || qTags.includes("tier1");
      const hasTier2 = qTags.includes("tier_2") || qTags.includes("tier2");
      const qDiff = (q.difficulty || "").toLowerCase();

      const hasSpecificL1 = qTags.includes("l1");
      const hasSpecificL2 = qTags.includes("l2");
      const hasSpecificL3 = qTags.includes("l3");

      if (lvl === "FRESHER") {
        if (hasSpecificL1 || hasSpecificL2 || hasSpecificL3) return false;
        if (hasTier2) return false;
        if (!hasTier1 && qDiff === "hard") return false;
      } else {
        const targetLvl = (expLvl || "L1").toLowerCase();
        if (targetLvl === "l1") {
          if (hasSpecificL2 || hasSpecificL3) return false;
          if (!hasSpecificL1) {
            if (hasTier1) return false;
            if (!hasTier2 && qDiff === "easy") return false;
          }
        } else if (targetLvl === "l2") {
          if (hasSpecificL1 || hasSpecificL3) return false;
          if (!hasSpecificL2) {
            if (hasTier1) return false;
            if (!hasTier2 && qDiff === "easy") return false;
          }
        } else if (targetLvl === "l3") {
          if (hasSpecificL1 || hasSpecificL2) return false;
          if (!hasSpecificL3) {
            if (hasTier1) return false;
            if (!hasTier2 && qDiff === "easy") return false;
          }
        }
      }

      return true;
    });
  };

  const autoSelectQuestionsFor = (dept: string, lvl: string, expLvl: string | null) => {
    const eligible = getEligibleQuestions(dept, lvl, expLvl);
    const newMap: Record<string, { moduleType: string; pointShare: number }> = {};
    eligible.forEach((q) => {
      newMap[q.id] = {
        moduleType: q.moduleType,
        pointShare: 1.0,
      };
    });
    setSelectedQuestionsMap(newMap);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/role-templates`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      } else {
        toast.error("Failed to fetch role templates");
      }
    } catch (err) {
      toast.error("Error loading role templates");
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestionsBank = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/questions?pageSize=1000`, { headers });
      if (res.ok) {
        const data = await res.json();
        setQuestionsBank(Array.isArray(data) ? data : data.items || data.questions || []);
      }
    } catch (err) {
      // Non-blocking
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchQuestionsBank();
  }, []);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setRoleName("");
    setDepartment("SOFTWARE_ENGINEERING");
    setLevel("FRESHER");
    setExperiencedLevel("L1");
    setDurationMinutes(60);
    setWeightingPreset({
      MCQ: 0.2,
      SQL: 0.2,
      CODING: 0.3,
      AI_PROMPTING: 0.15,
      SIMULATION: 0.15,
    });
    setFilterByRoleAndLevel(true);
    setShowModal(true);
    // Auto select questions for SDE Fresher on open
    setTimeout(() => {
      autoSelectQuestionsFor("SOFTWARE_ENGINEERING", "FRESHER", "L1");
    }, 0);
  };

  const handleOpenEdit = (tpl: any) => {
    setEditingTemplate(tpl);
    setRoleName(tpl.roleName || "");
    setDepartment(tpl.department || "SOFTWARE_ENGINEERING");
    setLevel(tpl.level || "FRESHER");
    setExperiencedLevel(tpl.experiencedLevel || "L1");
    setDurationMinutes(tpl.durationMinutes || 60);

    const preset = typeof tpl.weightingPreset === "object" && tpl.weightingPreset
      ? tpl.weightingPreset
      : { MCQ: 0.2, SQL: 0.2, CODING: 0.3, AI_PROMPTING: 0.15, SIMULATION: 0.15 };
    setWeightingPreset(preset);

    const qMap: Record<string, { moduleType: string; pointShare: number }> = {};
    const hasExistingQuestions = tpl.questions && Array.isArray(tpl.questions) && tpl.questions.length > 0;
    if (hasExistingQuestions) {
      tpl.questions.forEach((q: any) => {
        qMap[q.questionId] = {
          moduleType: q.moduleType,
          pointShare: q.pointShare ?? 1,
        };
      });
    }
    setSelectedQuestionsMap(qMap);
    setFilterByRoleAndLevel(true);
    setShowModal(true);

    // If template has 0 questions assigned in the database, automatically select matching ones on open
    if (!hasExistingQuestions) {
      setTimeout(() => {
        autoSelectQuestionsFor(
          tpl.department || "SOFTWARE_ENGINEERING",
          tpl.level || "FRESHER",
          tpl.experiencedLevel || "L1"
        );
      }, 0);
    }
  };

  const handleSaveTemplate = async () => {
    if (!roleName.trim()) {
      toast.error("Please enter a role template name");
      return;
    }

    const questionPayload = Object.entries(selectedQuestionsMap).map(([qId, val], idx) => {
      const foundQ = questionsBank.find((q) => q.id === qId);
      return {
        questionId: qId,
        moduleType: val.moduleType,
        orderIndex: idx,
        questionVersionSnapshot: foundQ?.version || 1,
        pointShare: val.pointShare,
      };
    });

    const payload = {
      roleName: roleName.trim(),
      department,
      level,
      experiencedLevel: level === "EXPERIENCED" ? experiencedLevel : null,
      durationMinutes: Number(durationMinutes),
      weightingPreset,
      questions: questionPayload,
    };

    try {
      const headers = await getAuthHeaders();
      const url = editingTemplate
        ? `${API_BASE}/admin/role-templates/${editingTemplate.id}`
        : `${API_BASE}/admin/role-templates`;
      const method = editingTemplate ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(
          editingTemplate
            ? "Role template updated successfully!"
            : "Role template created successfully!"
        );
        setShowModal(false);
        fetchTemplates();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.message || "Failed to save role template");
      }
    } catch (err) {
      toast.error("Network error while saving template");
    }
  };

  const handlePublishNewVersion = async (tplId: string) => {
    setPublishingId(tplId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${API_BASE}/admin/role-templates/${tplId}/publish-version`,
        {
          method: "POST",
          headers,
        }
      );

      if (res.ok) {
        const published = await res.json();
        toast.success(
          `Published new active version (v${published.version}) for ${published.department} / ${published.level}!`
        );
        fetchTemplates();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.message || "Failed to publish new version");
      }
    } catch (err) {
      toast.error("Network error while publishing new version");
    } finally {
      setPublishingId(null);
    }
  };

  const handleDeleteTemplate = async (tplId: string) => {
    if (!confirm("Are you sure you want to delete this role template?")) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/role-templates/${tplId}`, {
        method: "DELETE",
        headers,
      });

      if (res.ok) {
        toast.success("Role template deleted");
        fetchTemplates();
      } else {
        toast.error("Failed to delete role template");
      }
    } catch (err) {
      toast.error("Error deleting template");
    }
  };

  const toggleQuestionSelection = (q: any) => {
    setSelectedQuestionsMap((prev) => {
      const next = { ...prev };
      if (next[q.id]) {
        delete next[q.id];
      } else {
        next[q.id] = {
          moduleType: q.moduleType,
          pointShare: 1.0,
        };
      }
      return next;
    });
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (deptFilter !== "all" && t.department !== deptFilter) return false;
      if (levelFilter !== "all" && t.level !== levelFilter) return false;
      if (activeOnlyFilter && !t.isActive) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (t.roleName || "").toLowerCase().includes(q);
        const matchesDept = (t.department || "").toLowerCase().includes(q);
        if (!matchesName && !matchesDept) return false;
      }
      return true;
    });
  }, [templates, deptFilter, levelFilter, activeOnlyFilter, searchQuery]);

  return (
    <AppShell
      title="Role Templates"
      count={filteredTemplates.length}
      actions={
        <button
          onClick={handleOpenCreate}
          className="px-3.5 py-2 bg-[#2F5CFF] hover:bg-[#254EDB] text-white text-[12px] font-medium rounded-md flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
        >
          <Plus size={14} />
          <span>New Role Template</span>
        </button>
      }
    >
      <div className="p-6 space-y-6">
        {/* Controls / Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#E6E6EA]">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative w-64">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B8B93]"
              />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-[13px] border border-[#E6E6EA] rounded-md bg-[#F7F7F9] focus:bg-white focus:outline-none focus:border-[#2F5CFF]"
              />
            </div>

            {/* Department Filter */}
            <div>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-3 py-1.5 text-[13px] border border-[#E6E6EA] rounded-md bg-white text-[#5B5B64]"
              >
                <option value="all">All Departments</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Level Filter */}
            <div>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="px-3 py-1.5 text-[13px] border border-[#E6E6EA] rounded-md bg-white text-[#5B5B64]"
              >
                <option value="all">All Levels</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {/* Active Only */}
            <label className="flex items-center gap-2 text-[13px] text-[#5B5B64] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activeOnlyFilter}
                onChange={(e) => setActiveOnlyFilter(e.target.checked)}
                className="rounded border-[#E6E6EA] text-[#2F5CFF] focus:ring-0"
              />
              <span>Active templates only</span>
            </label>
          </div>
        </div>

        {/* Templates Grid / Cards */}
        {loading ? (
          <div className="p-12 text-center text-[13px] text-[#8B8B93]">
            Loading role templates...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="p-12 bg-white rounded-xl border border-[#E6E6EA] text-center space-y-2">
            <Layers size={32} className="mx-auto text-[#8B8B93]" />
            <h3 className="text-[15px] font-semibold text-[#0B0B0D]">
              No Role Templates Found
            </h3>
            <p className="text-[13px] text-[#8B8B93] max-w-sm mx-auto">
              Create your first role template with department, level, duration, and question presets.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className={`bg-white border rounded-xl p-5 space-y-4 flex flex-col justify-between transition-shadow hover:shadow-md ${
                  tpl.isActive ? "border-[#C6D4FF]" : "border-[#E6E6EA]"
                }`}
              >
                <div className="space-y-3">
                  {/* Title & Status Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[15px] text-[#0B0B0D]">
                          {tpl.roleName}
                        </h3>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-[#F0F4FF] text-[#2F5CFF] rounded">
                          v{tpl.version}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {tpl.department && (
                          <span className="px-2 py-0.5 text-[11px] font-mono bg-[#F7F7F9] text-[#5B5B64] border border-[#E6E6EA] rounded">
                            {tpl.department}
                          </span>
                        )}
                        {tpl.level && (
                          <span className="px-2 py-0.5 text-[11px] font-medium bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] rounded">
                            {tpl.level === "FRESHER" ? "Fresher (0–1 years)" : `Experienced — ${tpl.experiencedLevel || "L1"} (${tpl.experiencedLevel === "L3" ? "11–15" : tpl.experiencedLevel === "L2" ? "6–10" : "2–5"} years)`}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-full shrink-0 ${
                        tpl.isActive
                          ? "bg-[#DCFCE7] text-[#15803D]"
                          : "bg-[#F3F4F6] text-[#6B7280]"
                      }`}
                    >
                      {tpl.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Details summary */}
                  <div className="flex items-center gap-4 text-[12px] text-[#5B5B64]">
                    <div className="flex items-center gap-1">
                      <Clock size={13} className="text-[#8B8B93]" />
                      <span>{tpl.durationMinutes} mins</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <HelpCircle size={13} className="text-[#8B8B93]" />
                      <span>
                        {tpl.questions?.length || 0} attached question(s)
                      </span>
                    </div>
                  </div>

                  {/* Attached Questions Preview */}
                  {tpl.questions && tpl.questions.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="text-[11px] font-medium text-[#8B8B93] uppercase tracking-wider">
                        Attached Questions:
                      </div>
                      <div className="max-h-28 overflow-y-auto space-y-1">
                        {tpl.questions.map((q: any, idx: number) => (
                          <div
                            key={q.id || idx}
                            className="flex items-center justify-between px-2.5 py-1 bg-[#F7F7F9] rounded text-[11px]"
                          >
                            <span className="font-mono text-[#2F5CFF] font-medium">
                              [{q.moduleType}]
                            </span>
                            <span className="truncate max-w-[170px] text-[#374151]">
                              {q.question?.content?.prompt ||
                                q.question?.content?.title ||
                                `Question #${idx + 1}`}
                            </span>
                            <span className="text-[10px] text-[#8B8B93]">
                              v{q.questionVersionSnapshot || 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Action Bar */}
                <div className="pt-3 border-t border-[#E6E6EA] flex items-center justify-between gap-2">
                  <button
                    onClick={() => handlePublishNewVersion(tpl.id)}
                    disabled={publishingId === tpl.id}
                    title="Publish new active version (clones into next version number)"
                    className="px-2.5 py-1.5 bg-[#F0F4FF] hover:bg-[#D9E4FF] text-[#2F5CFF] text-[11px] font-semibold rounded flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <GitFork size={12} />
                    <span>
                      {publishingId === tpl.id ? "Publishing..." : "Publish new version"}
                    </span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(tpl)}
                      className="p-1.5 text-[#5B5B64] hover:text-[#2F5CFF] rounded hover:bg-[#F7F7F9]"
                      title="Edit template"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      className="p-1.5 text-[#5B5B64] hover:text-red-600 rounded hover:bg-[#F7F7F9]"
                      title="Delete template"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Authoring / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between bg-[#F7F7F9]">
              <div>
                <h2 className="text-[16px] font-semibold text-[#0B0B0D]">
                  {editingTemplate ? `Edit Role Template (${editingTemplate.roleName})` : "Create Role Template"}
                </h2>
                <p className="text-[12px] text-[#5B5B64]">
                  Configure role metadata, duration, module weightings, and select questions from Question Bank.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#8B8B93] hover:text-[#0B0B0D]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-[#5B5B64] mb-1">
                    Role Template Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="e.g. Software Engineer"
                    className="w-full px-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#5B5B64] mb-1">
                    Duration (Minutes) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#5B5B64] mb-1">
                    Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDepartment(val);
                      autoSelectQuestionsFor(val, level, experiencedLevel);
                    }}
                    className="w-full px-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#5B5B64] mb-1">
                    Experience Type
                  </label>
                  <select
                    value={level}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLevel(val);
                      const nextExpLvl = val === "EXPERIENCED" && !experiencedLevel ? "L1" : experiencedLevel;
                      if (val === "EXPERIENCED" && !experiencedLevel) {
                        setExperiencedLevel("L1");
                      }
                      autoSelectQuestionsFor(department, val, nextExpLvl);
                    }}
                    className="w-full px-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white"
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l === "FRESHER" ? "Fresher (0–1 years)" : "Experienced (2–15 years)"}
                      </option>
                    ))}
                  </select>
                </div>

                {level === "EXPERIENCED" && (
                  <div>
                    <label className="block text-[13px] font-medium text-[#5B5B64] mb-1">
                      Experienced Level
                    </label>
                    <select
                      value={experiencedLevel}
                      onChange={(e) => {
                        const val = e.target.value;
                        setExperiencedLevel(val);
                        autoSelectQuestionsFor(department, level, val);
                      }}
                      className="w-full px-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white"
                    >
                      {EXPERIENCED_LEVELS.map((el) => (
                        <option key={el} value={el}>
                          {el === "L1" ? "L1 (2–5 years)" : el === "L2" ? "L2 (6–10 years)" : "L3 (11–15 years)"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Question Bank Selection */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-2">
                  <div className="flex flex-col gap-1">
                    <h4 className="text-[14px] font-semibold text-[#0B0B0D]">
                      Attach Questions from Question Bank ({department})
                    </h4>
                    <label className="flex items-center gap-1.5 text-[11px] text-[#5B5B64] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={filterByRoleAndLevel}
                        onChange={(e) => setFilterByRoleAndLevel(e.target.checked)}
                        className="rounded border-[#E6E6EA] text-[#2F5CFF] focus:ring-0"
                      />
                      <span>Filter by department & experience level (recommended)</span>
                    </label>
                  </div>
                  <span className="text-[12px] font-medium text-[#2F5CFF]">
                    {Object.keys(selectedQuestionsMap).length} question(s) selected
                  </span>
                </div>

                {(() => {
                  const allowedMods = getDepartmentAllowedModules(department);
                  const eligibleQuestions = filterByRoleAndLevel
                    ? getEligibleQuestions(department, level, experiencedLevel)
                    : questionsBank.filter((q) => allowedMods.includes(q.moduleType));

                  if (eligibleQuestions.length === 0) {
                    return (
                      <div className="p-4 bg-[#F7F7F9] rounded text-[12px] text-[#8B8B93] text-center">
                        No eligible questions available for department {department}.
                      </div>
                    );
                  }

                  return (
                    <div className="max-h-60 overflow-y-auto space-y-2 border border-[#E6E6EA] rounded-md p-3">
                      {eligibleQuestions.map((q) => {
                        const isSelected = !!selectedQuestionsMap[q.id];
                        const qTier = extractQuestionTier(q);
                        return (
                          <div
                            key={q.id}
                            onClick={() => toggleQuestionSelection(q)}
                            className={`p-2.5 rounded border text-[12px] flex items-center justify-between cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-[#F0F4FF] border-[#2F5CFF]"
                                : "bg-white border-[#E6E6EA] hover:border-[#C6D4FF]"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="rounded text-[#2F5CFF]"
                              />
                              <div>
                                <div className="font-medium text-[#0B0B0D]">
                                  {q.content?.prompt || q.content?.title || "Untitled Question"}
                                </div>
                                <div className="text-[11px] text-[#8B8B93] flex items-center gap-2 mt-0.5">
                                  <span className="font-mono text-[#2F5CFF] font-semibold">
                                    [{MODULE_LABEL_MAP[q.moduleType] || q.moduleType}]
                                  </span>
                                  {q.difficulty && (
                                    <span className="uppercase text-[10px] bg-gray-100 px-1 py-0.2 rounded">{q.difficulty}</span>
                                  )}
                                  <span className={`text-[10px] font-mono font-bold uppercase px-1 py-0.2 rounded ${qTier === "TIER_2" ? "bg-purple-100 text-purple-800" : "bg-indigo-100 text-indigo-800"}`}>
                                    {qTier === "TIER_2" ? "TIER 2" : "TIER 1"}
                                  </span>
                                  <span>v{q.version || 1}</span>
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <span className="text-[11px] text-[#2F5CFF] font-semibold">
                                Attached
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#E6E6EA] bg-[#F7F7F9] flex items-center justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-[12px] text-[#5B5B64] hover:bg-[#E6E6EA] rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                className="px-4 py-2 text-[12px] font-medium bg-[#2F5CFF] text-white rounded-md hover:bg-[#254EDB]"
              >
                {editingTemplate ? "Save Changes" : "Create Role Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
