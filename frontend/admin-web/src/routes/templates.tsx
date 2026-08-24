import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  Layers,
  Search,
  X,
  Edit3,
  Trash2,
  GitFork,
  Check,
  AlertCircle,
  Clock,
  Briefcase,
  HelpCircle,
  RotateCcw,
  SlidersHorizontal,
  Send,
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

const DEPARTMENT_LABELS: Record<string, string> = {
  SOFTWARE_ENGINEERING: "Software Engineering",
  DATA_ENGINEERING: "Data Engineering",
  PMO: "Project Management Office",
  QA: "Quality Assurance",
  SYSOPS: "System Operations",
  ITOPS: "IT Operations",
  SECOPS: "Security Operations",
  SRE: "Site Reliability Engineering",
};

const CATEGORIES = ["FRESHER", "EXPERIENCED"] as const;

const TIERS = [
  { value: "0-1", label: "0-1 yrs (Fresher)", category: "FRESHER" },
  { value: "2-5", label: "2-5 yrs (Level 1)", category: "EXPERIENCED" },
  { value: "6-10", label: "6-10 yrs (Level 2)", category: "EXPERIENCED" },
  { value: "11-15", label: "11-15 yrs (Level 3)", category: "EXPERIENCED" },
] as const;

const MODULE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  MCQ: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  SQL: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  CODING: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  DEBUGGING: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  AI_PROMPTING: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  SIMULATION: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  TEST_SCENARIOS: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  NOSQL: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
};

export function RoleTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [questionsBank, setQuestionsBank] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [versionFilter, setVersionFilter] = useState<string>("latest");
  const [activeOnlyFilter, setActiveOnlyFilter] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [roleName, setRoleName] = useState("");
  const [department, setDepartment] = useState<string>("SOFTWARE_ENGINEERING");
  const [category, setCategory] = useState<string>("EXPERIENCED");
  const [experienceTier, setExperienceTier] = useState<string>("2-5");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [isActive, setIsActive] = useState(true);
  const [weightingPreset, setWeightingPreset] = useState({
    MCQ: 20,
    SQL: 20,
    CODING: 30,
    DEBUGGING: 15,
    AI_PROMPTING: 15,
  });

  // Modal Question Search & Filters
  const [modalQuestionSearch, setModalQuestionSearch] = useState("");
  const [modalModuleFilter, setModalModuleFilter] = useState<string>("all");

  // Selected questions for template authoring: map of questionId -> { moduleType, pointShare }
  const [selectedQuestionsMap, setSelectedQuestionsMap] = useState<
    Record<string, { moduleType: string; pointShare: number }>
  >({});

  const [publishingId, setPublishingId] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/role-templates`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
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
      console.warn("Could not load question bank:", err);
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
    setCategory("EXPERIENCED");
    setExperienceTier("2-5");
    setDurationMinutes(60);
    setIsActive(true);
    setWeightingPreset({
      MCQ: 20,
      SQL: 20,
      CODING: 30,
      DEBUGGING: 15,
      AI_PROMPTING: 15,
    });
    setSelectedQuestionsMap({});
    setModalQuestionSearch("");
    setModalModuleFilter("all");
    setShowModal(true);
  };

  const handleOpenEdit = (tpl: any) => {
    setEditingTemplate(tpl);
    setRoleName(tpl.roleName || "");
    setDepartment(tpl.department || "SOFTWARE_ENGINEERING");
    const tCategory = tpl.category || (tpl.level === "FRESHER" ? "FRESHER" : "EXPERIENCED");
    setCategory(tCategory);
    setExperienceTier(tpl.experienceTier || (tCategory === "FRESHER" ? "0-1" : "2-5"));
    setDurationMinutes(tpl.durationMinutes || 60);
    setIsActive(tpl.isActive ?? true);

    const preset =
      typeof tpl.weightingPreset === "object" && tpl.weightingPreset
        ? tpl.weightingPreset
        : { MCQ: 20, SQL: 20, CODING: 30, DEBUGGING: 15, AI_PROMPTING: 15 };
    setWeightingPreset(preset);

    const qMap: Record<string, { moduleType: string; pointShare: number }> = {};
    if (tpl.questions && Array.isArray(tpl.questions)) {
      tpl.questions.forEach((q: any) => {
        qMap[q.questionId] = {
          moduleType: q.moduleType,
          pointShare: q.pointShare ?? 20,
        };
      });
    }
    setSelectedQuestionsMap(qMap);
    setModalQuestionSearch("");
    setModalModuleFilter("all");
    setShowModal(true);
  };

  const handleSaveTemplate = async () => {
    if (!roleName.trim()) {
      toast.error("Please enter a role template name");
      return;
    }

    setSaving(true);
    const questionPayload = Object.entries(selectedQuestionsMap).map(([qId, val], idx) => {
      const foundQ = questionsBank.find((q) => q.id === qId);
      return {
        questionId: qId,
        moduleType: val.moduleType,
        orderIndex: idx + 1,
        questionVersionSnapshot: foundQ?.version || 1,
        pointShare: Number(val.pointShare) || 20,
      };
    });

    const payload = {
      roleName: roleName.trim(),
      department,
      category,
      experienceTier: category === "FRESHER" ? "0-1" : experienceTier,
      level: category === "FRESHER" ? "FRESHER" : "EXPERIENCED",
      durationMinutes: Number(durationMinutes),
      isActive,
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
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(
          editingTemplate
            ? "Role template updated successfully"
            : "Role template created successfully"
        );
        setShowModal(false);
        fetchTemplates();
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to save role template");
      }
    } catch (err) {
      toast.error("An error occurred while saving the role template");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string, name?: string) => {
    if (!confirm(`Are you sure you want to delete role template '${name || id}'?`)) {
      return;
    }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/role-templates/${id}`, {
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
      toast.error("Error deleting role template");
    }
  };

  const handlePublishNewVersion = async (templateId: string) => {
    setPublishingId(templateId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${API_BASE}/admin/role-templates/${templateId}/publish-version`,
        {
          method: "POST",
          headers,
        }
      );
      if (res.ok) {
        toast.success("New active template version published successfully!");
        fetchTemplates();
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to publish new version");
      }
    } catch (err) {
      toast.error("Error publishing new version");
    } finally {
      setPublishingId(null);
    }
  };

  const toggleQuestionSelection = (question: any) => {
    setSelectedQuestionsMap((prev) => {
      const next = { ...prev };
      if (next[question.id]) {
        delete next[question.id];
      } else {
        next[question.id] = {
          moduleType: question.moduleType,
          pointShare: 20,
        };
      }
      return next;
    });
  };

  const resetFilters = () => {
    setDeptFilter("all");
    setCategoryFilter("all");
    setTierFilter("all");
    setVersionFilter("latest");
    setActiveOnlyFilter(false);
    setSearchQuery("");
  };

  const hasActiveFilters =
    deptFilter !== "all" ||
    categoryFilter !== "all" ||
    tierFilter !== "all" ||
    versionFilter !== "latest" ||
    activeOnlyFilter ||
    Boolean(searchQuery.trim());

  // Distinct version numbers available in dataset
  const availableVersions = useMemo(() => {
    const vSet = new Set<number>();
    templates.forEach((t) => {
      if (typeof t.version === "number") {
        vSet.add(t.version);
      }
    });
    return Array.from(vSet).sort((a, b) => a - b);
  }, [templates]);

  // Filtered Templates calculation
  const filteredTemplates = useMemo(() => {
    let list = [...templates];

    // Filter out legacy unmapped templates without department
    list = list.filter((t) => Boolean(t.department));

    // 1. Version filtering
    if (versionFilter === "latest") {
      const groupMap = new Map<string, any>();
      for (const t of list) {
        const key = `${t.department}__${t.category || (t.level === "FRESHER" ? "FRESHER" : "EXPERIENCED")}__${t.experienceTier || (t.level === "FRESHER" ? "0-1" : "2-5")}`;
        const existing = groupMap.get(key);
        if (!existing || (t.version || 1) > (existing.version || 1)) {
          groupMap.set(key, t);
        }
      }
      list = Array.from(groupMap.values());
    } else if (versionFilter === "active") {
      list = list.filter((t) => t.isActive);
    } else if (versionFilter !== "all") {
      const targetV = Number(versionFilter);
      if (!isNaN(targetV)) {
        list = list.filter((t) => (t.version || 1) === targetV);
      }
    }

    // 2. Department filter
    if (deptFilter !== "all") {
      list = list.filter((t) => t.department === deptFilter);
    }

    // 3. Category filter
    if (categoryFilter !== "all") {
      list = list.filter(
        (t) => (t.category || (t.level === "FRESHER" ? "FRESHER" : "EXPERIENCED")) === categoryFilter
      );
    }

    // 4. Tier filter
    if (tierFilter !== "all") {
      list = list.filter(
        (t) => (t.experienceTier || (t.level === "FRESHER" ? "0-1" : "2-5")) === tierFilter
      );
    }

    // 5. Active Only checkbox filter
    if (activeOnlyFilter) {
      list = list.filter((t) => t.isActive);
    }

    // 6. Search text query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => {
        const nameMatch = (t.roleName || "").toLowerCase().includes(q);
        const deptMatch = (t.department || "").toLowerCase().includes(q);
        const deptLabelMatch = (DEPARTMENT_LABELS[t.department] || "").toLowerCase().includes(q);
        return nameMatch || deptMatch || deptLabelMatch;
      });
    }

    // 7. Stable canonical sort
    return list.sort((a, b) => {
      const deptA = a.department || "";
      const deptB = b.department || "";
      if (deptA !== deptB) return deptA.localeCompare(deptB);
      const tierA = a.experienceTier || (a.level === "FRESHER" ? "0-1" : "2-5");
      const tierB = b.experienceTier || (b.level === "FRESHER" ? "0-1" : "2-5");
      return tierA.localeCompare(tierB);
    });
  }, [templates, versionFilter, deptFilter, categoryFilter, tierFilter, activeOnlyFilter, searchQuery]);

  // Modal questions filtered
  const modalEligibleQuestions = useMemo(() => {
    const allowedMods = getDepartmentAllowedModules(department);
    return questionsBank.filter((q) => {
      if (modalModuleFilter !== "all" && q.moduleType !== modalModuleFilter) return false;
      if (modalModuleFilter === "all" && !allowedMods.includes(q.moduleType)) return false;
      if (modalQuestionSearch.trim()) {
        const term = modalQuestionSearch.toLowerCase();
        const prompt = (q.content?.prompt || q.content?.title || "").toLowerCase();
        const tags = (q.tags || []).join(" ").toLowerCase();
        if (!prompt.includes(term) && !tags.includes(term)) return false;
      }
      return true;
    });
  }, [questionsBank, department, modalModuleFilter, modalQuestionSearch]);

  return (
    <AppShell
      title="Role Templates"
      count={filteredTemplates.length}
      actions={
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 shadow-xs transition-all cursor-pointer"
        >
          <Plus size={15} />
          <span>New Role Template</span>
        </button>
      }
    >
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Controls / Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative min-w-[260px] flex-1 max-w-md">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search templates by role name or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 text-slate-800"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Dropdown Filters */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Version Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Version:
                </span>
                <select
                  value={versionFilter}
                  onChange={(e) => setVersionFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                >
                  <option value="latest">Latest Versions</option>
                  <option value="all">All Versions</option>
                  <option value="active">Active Only</option>
                  {availableVersions.map((v) => (
                    <option key={v} value={v.toString()}>
                      Version {v}
                    </option>
                  ))}
                </select>
              </div>

              {/* Department Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Dept:
                </span>
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                >
                  <option value="all">All Departments</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {DEPARTMENT_LABELS[d] || d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Category:
                </span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c === "FRESHER" ? "Fresher (0-1 yrs)" : "Experienced (2-15 yrs)"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tier Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Tier:
                </span>
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                >
                  <option value="all">All Tiers</option>
                  {TIERS.map((tier) => (
                    <option key={tier.value} value={tier.value}>
                      {tier.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Active Toggle */}
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={activeOnlyFilter}
                  onChange={(e) => setActiveOnlyFilter(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                />
                <span>Active only</span>
              </label>

              {/* Reset Filters */}
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  title="Reset all filters"
                >
                  <RotateCcw size={12} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Templates Grid */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
            <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span>Loading role templates...</span>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="p-16 bg-white rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Layers size={24} />
            </div>
            <h3 className="text-base font-semibold text-slate-800">No Role Templates Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {hasActiveFilters
                ? "No templates match your active filter criteria. Click 'Reset' to view all calibrated templates."
                : "Create your first role template with department, category, experience tier, duration, and question presets."}
            </p>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTemplates.map((tpl) => {
              const tCategory = tpl.category || (tpl.level === "FRESHER" ? "FRESHER" : "EXPERIENCED");
              const tTier = tpl.experienceTier || (tCategory === "FRESHER" ? "0-1" : "2-5");
              const matchedTier = TIERS.find((t) => t.value === tTier);

              return (
                <div
                  key={tpl.id}
                  className={`bg-white border rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-md ${
                    tpl.isActive
                      ? "border-blue-200/90 shadow-xs ring-1 ring-blue-500/10"
                      : "border-slate-200 opacity-90"
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
                          <span className="px-2 py-0.5 text-[11px] font-medium bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] rounded">
                            {tCategory}
                          </span>
                          <span className="px-2 py-0.5 text-[11px] font-medium bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] rounded">
                            {matchedTier?.label || `${tTier} yrs`}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full shrink-0 ${
                          tpl.isActive
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            tpl.isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                          }`}
                        />
                        {tpl.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>

                    {/* Metadata Strip */}
                    <div className="flex items-center gap-4 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-slate-400" />
                        <span className="font-semibold text-slate-700">
                          {tpl.durationMinutes || 60} mins
                        </span>
                      </div>
                      <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                      <div className="flex items-center gap-1.5">
                        <HelpCircle size={14} className="text-slate-400" />
                        <span className="font-semibold text-slate-700">
                          {tpl.questions?.length || 0} attached question(s)
                        </span>
                      </div>
                    </div>

                    {/* Question Module Badges */}
                    {tpl.questions && tpl.questions.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="text-[11px] font-medium text-slate-400">
                          Question Modules:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Array.from(
                            new Set(tpl.questions.map((q: any) => q.moduleType))
                          ).map((mod: any) => (
                            <span
                              key={mod}
                              className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-blue-600 border border-slate-200 rounded font-semibold"
                            >
                              {MODULE_LABEL_MAP[mod] || mod}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenEdit(tpl)}
                      className="p-2 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Edit template & questions"
                    >
                      <Edit3 size={15} />
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePublishNewVersion(tpl.id)}
                        disabled={publishingId === tpl.id}
                        title="Publish new active version (clones into next version number)"
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <GitFork size={13} />
                        <span>
                          {publishingId === tpl.id ? "Publishing..." : "Publish new version"}
                        </span>
                      </button>

                      <button
                        onClick={() => handleDeleteTemplate(tpl.id, tpl.roleName)}
                        className="p-2 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete template"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Authoring & Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingTemplate
                    ? `Edit Role Template (${editingTemplate.roleName})`
                    : "Create New Role Template"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure department specifications, test duration, and attach questions from the Question Bank.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Role Template Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Software Engineering - Experienced (2-5 yrs)"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Assessment Duration (Minutes) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={240}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Target Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {DEPARTMENT_LABELS[d] || d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Candidate Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => {
                      const newCat = e.target.value;
                      setCategory(newCat);
                      if (newCat === "FRESHER") {
                        setExperienceTier("0-1");
                      } else if (experienceTier === "0-1") {
                        setExperienceTier("2-5");
                      }
                    }}
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c === "FRESHER" ? "Fresher (0-1 yrs)" : "Experienced (2-15 yrs)"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Experience Tier
                  </label>
                  <select
                    value={experienceTier}
                    onChange={(e) => setExperienceTier(e.target.value)}
                    disabled={category === "FRESHER"}
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-lg bg-white disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {TIERS.filter((t) => category === "FRESHER" ? t.category === "FRESHER" : t.category === "EXPERIENCED").map((tier) => (
                      <option key={tier.value} value={tier.value}>
                        {tier.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Question Bank Selection Section */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>Attach Questions from Question Bank</span>
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-mono font-bold rounded-md border border-blue-200">
                        {DEPARTMENT_LABELS[department] || department}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Allowed Modules for {DEPARTMENT_LABELS[department] || department}:{" "}
                      <span className="font-semibold text-slate-700">
                        {getDepartmentAllowedModules(department).join(", ")}
                      </span>
                    </p>
                  </div>
                  <div className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-xs">
                    {Object.keys(selectedQuestionsMap).length} question(s) selected
                  </div>
                </div>

                {/* Filter bar for questions inside modal */}
                <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search question prompts or tags..."
                      value={modalQuestionSearch}
                      onChange={(e) => setModalQuestionSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-slate-500">Module:</span>
                    <select
                      value={modalModuleFilter}
                      onChange={(e) => setModalModuleFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
                    >
                      <option value="all">Allowed Modules</option>
                      {getDepartmentAllowedModules(department).map((mod) => (
                        <option key={mod} value={mod}>
                          {MODULE_LABEL_MAP[mod] || mod}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Questions List */}
                {modalEligibleQuestions.length === 0 ? (
                  <div className="p-8 bg-slate-50/70 rounded-xl text-xs text-slate-500 text-center border border-dashed border-slate-200 space-y-1">
                    <AlertCircle size={20} className="mx-auto text-slate-400" />
                    <p className="font-semibold text-slate-700">No questions found matching your filter</p>
                    <p className="text-[11px] text-slate-400">
                      Try adjusting the search query or module filter above. Total bank contains {questionsBank.length} questions.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/30">
                    {modalEligibleQuestions.map((q) => {
                      const isSelected = !!selectedQuestionsMap[q.id];
                      const qTier = extractQuestionTier(q);
                      const modStyle =
                        MODULE_COLORS[q.moduleType] || {
                          bg: "bg-slate-100",
                          text: "text-slate-700",
                          border: "border-slate-200",
                        };
                      const prompt =
                        q.content?.prompt ||
                        q.content?.title ||
                        q.content?.text ||
                        "Untitled Question";

                      return (
                        <div
                          key={q.id}
                          onClick={() => toggleQuestionSelection(q)}
                          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 cursor-pointer transition-all ${
                            isSelected
                              ? "bg-blue-50/80 border-blue-500 shadow-xs"
                              : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="pt-0.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="rounded text-blue-600 cursor-pointer h-4 w-4"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 line-clamp-2">
                                {prompt}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${modStyle.bg} ${modStyle.text} ${modStyle.border}`}
                                >
                                  {MODULE_LABEL_MAP[q.moduleType] || q.moduleType}
                                </span>
                                {q.difficulty && (
                                  <span className="uppercase text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                    {q.difficulty}
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
                                    qTier === "TIER_2"
                                      ? "bg-purple-50 text-purple-700 border-purple-200"
                                      : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  }`}
                                >
                                  {qTier === "TIER_2" ? "Tier 2" : "Tier 1"}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  v{q.version || 1}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isSelected ? (
                              <span className="px-2 py-1 bg-blue-600 text-white text-[11px] font-bold rounded-md flex items-center gap-1 shadow-xs">
                                <Check size={12} />
                                Attached
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs font-medium hover:text-slate-600">
                                Click to attach
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  {Object.keys(selectedQuestionsMap).length}
                </span>{" "}
                question(s) will be linked to this template.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving...</span>
                    </>
                  ) : editingTemplate ? (
                    "Save Changes"
                  ) : (
                    "Create Role Template"
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
