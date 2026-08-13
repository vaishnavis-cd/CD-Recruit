import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Filter,
  Database,
  Tag,
  ShieldCheck,
  FileSpreadsheet,
  Trash2,
  X,
  Edit3,
  Download,
  UploadCloud,
  Check,
  Folder,
  ChevronRight,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore } from "../lib/store";
import { ModuleType } from "@cd-recruit/shared-types";
import { CodeEditor } from "../components/common/CodeEditor";
import { processQuestionTags } from "./drives.$id";
import {
  extractQuestionTier,
  MODULE_LABEL_MAP,
  getDepartmentAllowedModules,
} from "../lib/roleModules";

export const Route = createFileRoute("/questions")({
  component: QuestionBankPage,
  head: () => ({
    meta: [
      { title: "Question Bank — Proctora" },
      {
        name: "description",
        content:
          "Author and review questions, configure automated validation scripts, and track cohort statistics.",
      },
    ],
  }),
});

function QuestionBankPage() {
  const navigate = useNavigate();
  const questions = useStore((s) => s.questions);
  const fetchQuestions = useStore((s) => s.fetchQuestions);
  const createQuestion = useStore((s) => s.createQuestion);
  const updateQuestion = useStore((s) => s.updateQuestion);
  const archiveQuestion = useStore((s) => s.archiveQuestion);
  const bulkUploadQuestions = useStore((s) => s.bulkUploadQuestions);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [modFilter, setModFilter] = useState<string>("all");
  const [diffFilter, setDiffFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const autoBulk = params.get("autoBulk") === "true";
      const driveName = params.get("driveName");

      if (driveName) {
        setSelectedFolder(driveName);
      }
      if (autoBulk) {
        setShowImportModal(true);
      }
    }
  }, []);

  // Form State (Create)
  const [moduleType, setModuleType] = useState<string>("MCQ");
  const [promptText, setPromptText] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [tagsInput, setTagsInput] = useState("");
  const [role, setRole] = useState("General");

  // MCQ specific (Create)
  const [mcqOptions, setMcqOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);

  // SQL specific (Create)
  const [sqlSchema, setSqlSchema] = useState("");
  const [sqlSeed, setSqlSeed] = useState("");
  const [sqlExpectedQuery, setSqlExpectedQuery] = useState("");

  // NoSQL specific (Create)
  const [nosqlCollections, setNosqlCollections] = useState("");
  const [nosqlAllowedOps, setNosqlAllowedOps] = useState<string[]>([]);
  const [nosqlValidatorType, setNosqlValidatorType] = useState("OUTPUT_COMPARISON");
  const [nosqlExpectedOp, setNosqlExpectedOp] = useState("");
  const [nosqlDatasetRef, setNosqlDatasetRef] = useState("");

  // Coding specific (Create)
  const [starterCode, setStarterCode] = useState("");
  const [testCasesInput, setTestCasesInput] = useState("");

  // Simulation specific (Create)
  const [simTriggers, setSimTriggers] = useState("");
  const [simRubric, setSimRubric] = useState("");

  // AI Prompting specific (Create)
  const [aiSystemContext, setAiSystemContext] = useState("");
  const [aiTechStack, setAiTechStack] = useState("React/TypeScript");
  const [aiIdealResponse, setAiIdealResponse] = useState("");

  // Edit Form State
  const [editPromptText, setEditPromptText] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("medium");
  const [editTagsInput, setEditTagsInput] = useState("");
  const [editRole, setEditRole] = useState("General");
  const [editMcqOptions, setEditMcqOptions] = useState<string[]>(["", "", "", ""]);
  const [editCorrectIndex, setEditCorrectIndex] = useState(0);
  const [editSqlSchema, setEditSqlSchema] = useState("");
  const [editSqlSeed, setEditSqlSeed] = useState("");
  const [editSqlExpectedQuery, setEditSqlExpectedQuery] = useState("");
  const [editNosqlCollections, setEditNosqlCollections] = useState("");
  const [editNosqlAllowedOps, setEditNosqlAllowedOps] = useState<string[]>([]);
  const [editNosqlValidatorType, setEditNosqlValidatorType] = useState("OUTPUT_COMPARISON");
  const [editNosqlExpectedOp, setEditNosqlExpectedOp] = useState("");
  const [editNosqlDatasetRef, setEditNosqlDatasetRef] = useState("");

  const [editStarterCode, setEditStarterCode] = useState("");
  const [editTestCasesInput, setEditTestCasesInput] = useState("");
  const [editSimTriggers, setEditSimTriggers] = useState("");
  const [editSimRubric, setEditSimRubric] = useState("");
  const [editAiSystemContext, setEditAiSystemContext] = useState("");
  const [editAiTechStack, setEditAiTechStack] = useState("React/TypeScript");
  const [editAiIdealResponse, setEditAiIdealResponse] = useState("");

  // Preview Drawer State
  const [previewQuestion, setPreviewQuestion] = useState<any | null>(null);

  // Bulk Import State
  const [importModuleType, setImportModuleType] = useState<string>("MCQ");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // Confirmation Modal State
  const [confirmArchiveQuestion, setConfirmArchiveQuestion] = useState<any | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<string | null>(null);



  useEffect(() => {
    fetchQuestions({
      moduleType: modFilter !== "all" ? modFilter : undefined,
      difficulty: diffFilter !== "all" ? diffFilter : undefined,
      role: roleFilter !== "all" ? roleFilter : undefined,
      search: query ? query : undefined,
    });
  }, [modFilter, diffFilter, roleFilter, query]);

  // Grouped questions helper by tags
  const groupedQuestions = useMemo(() => {
    const groups: Record<string, typeof questions> = {};
    questions.forEach((q) => {
      if (!q.tags || q.tags.length === 0) {
        if (!groups["untagged"]) {
          groups["untagged"] = [];
        }
        groups["untagged"].push(q);
      } else {
        q.tags.forEach((tag) => {
          const t = tag.trim().toLowerCase();
          if (!t) return;
          if (!groups[t]) {
            groups[t] = [];
          }
          if (!groups[t].some((x) => x.id === q.id)) {
            groups[t].push(q);
          }
        });
      }
    });
    return groups;
  }, [questions]);

  const handleOpenEdit = (q: any) => {
    setEditingQuestion(q);
    setEditDifficulty(q.difficulty);
    setEditTagsInput(q.tags?.join(", ") || "");
    setEditPromptText(q.content?.prompt || q.content?.title || "");
    setEditRole(q.role || "General");

    if (q.moduleType === "MCQ") {
      const opts = [...(q.content?.options || ["", "", "", ""])];
      while (opts.length < 4) opts.push("");
      setEditMcqOptions(opts);
      setEditCorrectIndex(q.scoringConfig?.correctIndex ?? 0);
    } else if (q.moduleType === "SQL") {
      setEditSqlSchema(q.content?.schema || "");
      setEditSqlSeed(q.content?.seedData || "");
      setEditSqlExpectedQuery(q.content?.expectedQuery || "");

    } else if (q.moduleType === "NOSQL") {
      setEditNosqlCollections(q.content?.collections?.join(", ") || "");
      setEditNosqlAllowedOps(q.content?.allowedOperations || []);
      setEditNosqlValidatorType(q.content?.validatorType || "OUTPUT_COMPARISON");
      setEditNosqlExpectedOp(
        q.content?.expectedOperation ? JSON.stringify(q.content.expectedOperation, null, 2) : ""
      );
      setEditNosqlDatasetRef(q.content?.datasetRef || "");

    } else if (q.moduleType === "CODING" || q.moduleType === "DEBUGGING") {
      const code = typeof q.content?.starterCode === "object"
        ? (q.content.starterCode.javascript || q.content.starterCode.python || JSON.stringify(q.content.starterCode, null, 2))
        : (q.content?.starterCode || "");
      setEditStarterCode(code);
      setEditTestCasesInput(
        q.content?.testCases ? JSON.stringify(q.content.testCases, null, 2) : ""
      );
    } else if (q.moduleType === "AI_PROMPTING") {
      setEditAiSystemContext(q.content?.context || q.content?.systemContext || "");
      setEditAiTechStack(q.content?.techStack || "React/TypeScript");
      setEditAiIdealResponse(q.content?.idealResponseSummary || "");
    } else if (q.moduleType === "SIMULATION") {
      setEditSimTriggers(
        q.content?.triggers ? JSON.stringify(q.content.triggers, null, 2) : ""
      );
      setEditSimRubric(
        q.content?.rubric ? JSON.stringify(q.content.rubric, null, 2) : ""
      );
    }
  };

  const handleUpdate = async () => {
    if (!editingQuestion) return;
    const content: any = { prompt: editPromptText };
    const scoringConfig: any = {};

    try {
      if (editingQuestion.moduleType === "MCQ") {
        content.options = editMcqOptions.filter((o) => o.trim());
        if (content.options.length < 2) {
          toast.error("Please provide at least 2 options");
          return;
        }
        scoringConfig.correctIndex = editCorrectIndex;
      } else if (editingQuestion.moduleType === "SQL") {
        content.schema = editSqlSchema;
        content.seedData = editSqlSeed;
        content.expectedQuery = editSqlExpectedQuery;
      } else if (editingQuestion.moduleType === "NOSQL") {
        content.collections = editNosqlCollections.split(",").map((c) => c.trim()).filter(Boolean);
        content.allowedOperations = editNosqlAllowedOps;
        content.validatorType = editNosqlValidatorType;
        if (editNosqlExpectedOp.trim()) {
          try {
            content.expectedOperation = JSON.parse(editNosqlExpectedOp);
          } catch {
            toast.error("Invalid Expected Operation JSON format");
            return;
          }
        }
        content.datasetRef = editNosqlDatasetRef;
      } else if (editingQuestion.moduleType === "CODING" || editingQuestion.moduleType === "DEBUGGING") {
        content.starterCode = editStarterCode;
        if (editTestCasesInput.trim()) {
          try {
            content.testCases = JSON.parse(editTestCasesInput);
          } catch {
            toast.error("Invalid Test Cases JSON format");
            return;
          }
        }
      } else if (editingQuestion.moduleType === "AI_PROMPTING") {
        content.context = editAiSystemContext;
        content.techStack = editAiTechStack;
        content.idealResponseSummary = editAiIdealResponse;
      } else if (editingQuestion.moduleType === "SIMULATION") {
        content.title = editPromptText;
        content.triggers = editSimTriggers ? JSON.parse(editSimTriggers) : [];
        content.rubric = editSimRubric ? JSON.parse(editSimRubric) : [];
      }

      await updateQuestion(editingQuestion.id, { ...editingQuestion, difficulty: editDifficulty, tags: editTagsInput.split(",").map((t) => t.trim()).filter(Boolean), role: editRole, content });
      toast.success("Question updated successfully");
      setEditingQuestion(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update question");
    }
  };

  const handleCreate = async () => {
    const content: any = { prompt: promptText };
    const scoringConfig: any = {};

    try {
      if (moduleType === "MCQ") {
        content.options = mcqOptions.filter((o) => o.trim());
        if (content.options.length < 2) {
          toast.error("Please provide at least 2 options");
          return;
        }
        scoringConfig.correctIndex = correctIndex;
      } else if (moduleType === "SQL") {
        content.schema = sqlSchema;
        content.seedData = sqlSeed;
        content.expectedQuery = sqlExpectedQuery;
      } else if (moduleType === "NOSQL") {
        content.collections = nosqlCollections.split(",").map((c) => c.trim()).filter(Boolean);
        content.allowedOperations = nosqlAllowedOps;
        content.validatorType = nosqlValidatorType;
        if (nosqlExpectedOp.trim()) {
          try {
            content.expectedOperation = JSON.parse(nosqlExpectedOp);
          } catch {
            toast.error("Invalid Expected Operation JSON format");
            return;
          }
        }
        content.datasetRef = nosqlDatasetRef;
      } else if (moduleType === "CODING" || moduleType === "DEBUGGING") {
        content.starterCode = starterCode;
        content.testCases = testCasesInput ? JSON.parse(testCasesInput) : [];
      } else if (moduleType === "AI_PROMPTING") {
        content.context = aiSystemContext;
        content.techStack = aiTechStack;
        content.idealResponseSummary = aiIdealResponse;
      } else if (moduleType === "SIMULATION") {
        content.title = promptText;
        content.triggers = simTriggers ? JSON.parse(simTriggers) : [];
        content.rubric = simRubric ? JSON.parse(simRubric) : [];
      }

      await createQuestion({
        moduleType,
        content,
        scoringConfig,
        difficulty,
        role,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });

      setShowCreateModal(false);
      resetForm();
    } catch (err: any) {
      toast.error("Failed creating question: " + err.message);
    }
  };

  const resetForm = () => {
    setPromptText("");
    setTagsInput("");
    setRole("General");
    setMcqOptions(["", "", "", ""]);
    setCorrectIndex(0);
    setSqlSchema("");
    setSqlSeed("");
    setSqlExpectedQuery("");

    setStarterCode("");
    setTestCasesInput("");
    setSimTriggers("");
    setSimRubric("");
    setAiSystemContext("");
    setAiTechStack("React/TypeScript");
    setAiIdealResponse("");
  };

  // CSV Parser Utility
  function parseCSV(text: string) {
    const lines = [];
    let row: string[] = [];
    let inQuotes = false;
    let val = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          val += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === "," && !inQuotes) {
        row.push(val.trim());
        val = "";
      } else if ((c === "\n" || c === "\r") && !inQuotes) {
        if (c === "\r" && next === "\n") i++;
        row.push(val.trim());
        if (row.length > 0 && row.some((x) => x)) {
          lines.push(row);
        }
        row = [];
        val = "";
      } else {
        val += c;
      }
    }
    if (val || row.length > 0) {
      row.push(val.trim());
      lines.push(row);
    }
    return lines;
  }

  // Dynamic CSV Template Download
  const handleDownloadSample = (mod: string) => {
    let headers = "";
    let sampleRow = "";
    if (mod === "MCQ") {
      headers = "prompt,difficulty,tags,role,option1,option2,option3,option4,correctIndex";
      sampleRow =
        '"What is the time complexity of binary search?",easy,"algorithms,binary search","Backend Engineer",O(n),O(log n),O(n log n),O(1),1';
    } else if (mod === "SQL") {
      headers = "prompt,difficulty,tags,role,schema,seedData";
      sampleRow =
        '"Select all employees from sales department",medium,"sql,databases","Data Engineer","CREATE TABLE employees (id SERIAL, name TEXT, department TEXT);","INSERT INTO employees (name, department) VALUES (\'John\', \'sales\');"';
    } else if (mod === "CODING") {
      headers = "prompt,difficulty,tags,role,starterCode,testCasesJSON";
      sampleRow =
        '"Write a function to sum two numbers",easy,"basics,math","Backend Engineer","function sum(a, b) {\n  return a + b;\n}","[{\"input\": \"[1, 2]\", \"expected\": \"3\"}]"';
    } else if (mod === "AI_PROMPTING") {
      headers = "prompt,difficulty,tags,role,rubricJSON";
      sampleRow =
        '"Draft a prompt for an assistant to write professional emails",medium,"ai,prompting","AI Engineer","[{\\"criteria\\": \\"Tone\\", \\"maxScore\\": 5}]"';
    } else if (mod === "SIMULATION") {
      headers = "title,difficulty,tags,role,triggersJSON,rubricJSON";
      sampleRow =
        '"Handle a production outage call with client",hard,"communication,outage","Full-stack Engineer","[{\\"timeSeconds\\": 15, \\"message\\": \\"Client is asking for ETA.\\"}]","[{\\"criteria\\": \\"Transparency\\", \\"maxScore\\": 10}]"';
    }
    const csvContent =
      "data:text/csv;charset=utf-8," + encodeURIComponent(headers + "\n" + sampleRow);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `sample_${mod.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = () => {
    if (!csvFile) {
      toast.error("Please select a CSV file first.");
      return;
    }
    const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const fromDriveId = searchParams.get("fromDriveId");
    const driveNameParam = searchParams.get("driveName");

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          toast.error("The CSV file must contain at least a header row and one data row.");
          return;
        }
        const headers = rows[0].map((h) => h.toLowerCase());
        const parsedQuestions = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length === 0 || (row.length === 1 && !row[0])) continue;

          const getVal = (headerName: string) => {
            const idx = headers.indexOf(headerName.toLowerCase());
            return idx !== -1 ? row[idx] : "";
          };

          const difficulty = getVal("difficulty") || "medium";
          const roleVal = getVal("role") || "General";
          const tags = (getVal("tags") || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

          if (driveNameParam) {
            const driveTag = `Drive: ${driveNameParam}`;
            if (!tags.some((t) => t.toLowerCase() === driveTag.toLowerCase())) {
              tags.push(driveTag);
            }
          }

          const content: any = {};
          const scoringConfig: any = {};

          if (importModuleType === "MCQ") {
            content.prompt = getVal("prompt");
            const opt1 = getVal("option1");
            const opt2 = getVal("option2");
            const opt3 = getVal("option3");
            const opt4 = getVal("option4");
            content.options = [opt1, opt2, opt3, opt4].filter(Boolean);
            scoringConfig.correctIndex = parseInt(getVal("correctIndex")) || 0;
          } else if (importModuleType === "SQL") {
            content.prompt = getVal("prompt");
            content.schema = getVal("schema");
            content.seedData = getVal("seedData");
          } else if (importModuleType === "CODING") {
            content.prompt = getVal("prompt");
            content.starterCode = getVal("starterCode");
            const tcVal = getVal("testCasesJSON");
            const tcParsed = tcVal ? JSON.parse(tcVal) : [];
            content.testCases = tcParsed;
            content.visibleTestCases = tcParsed;
          } else if (importModuleType === "AI_PROMPTING") {
            content.prompt = getVal("prompt");
            const rub = getVal("rubricJSON");
            content.rubric = rub ? JSON.parse(rub) : [];
          } else if (importModuleType === "SIMULATION") {
            content.title = getVal("title") || getVal("prompt");
            const trig = getVal("triggersJSON");
            const rubricVal = getVal("rubricJSON");
            content.triggers = trig ? JSON.parse(trig) : [];
            content.rubric = rubricVal ? JSON.parse(rubricVal) : [];
          }

          parsedQuestions.push({
            difficulty,
            tags,
            role: roleVal,
            content,
            scoringConfig,
          });
        }

        const created = await bulkUploadQuestions(importModuleType, parsedQuestions);
        toast.success(`Successfully imported ${parsedQuestions.length} questions!`);
        setCsvFile(null);
        setShowImportModal(false);

        if (fromDriveId) {
          try {
            const driveDetail = await useStore.getState().fetchDriveDetail(fromDriveId);
            const existingIds = driveDetail.questionIds || [];
            const newIds = Array.isArray(created) ? created.map((q: any) => q.id) : [];
            const combinedIds = Array.from(new Set([...existingIds, ...newIds]));
            await useStore.getState().saveDriveQuestions(fromDriveId, combinedIds);
            toast.success(`Linked imported questions to drive. Redirecting back to Drive Config...`);
          } catch (e) {
            console.error("Auto linking questions to drive failed", e);
          }
          navigate({ to: `/drives/${fromDriveId}` as any });
        }
      } catch (err: any) {
        toast.error("CSV Import failed: " + err.message);
      }
    };
    reader.readAsText(csvFile);
  };

  return (
    <AppShell
      title="Question Bank"
      count={questions.length}
      search={
        <div className="relative w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9CA5]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions or tags…"
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
          />
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          <select
            value={modFilter}
            onChange={(e) => setModFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] font-medium focus:outline-none focus:border-[#2F5CFF]"
          >
            <option value="all">All Modules</option>
            <option value="MCQ">MCQ</option>
            <option value="SQL">SQL</option>
            <option value="NOSQL">NoSQL</option>
            <option value="CODING">Coding</option>
            <option value="DEBUGGING">Debugging</option>
            <option value="AI_PROMPTING">AI Prompting</option>
            <option value="SIMULATION">Context Simulation</option>
            <option value="TEST_SCENARIOS">Test Scenarios</option>
          </select>

          {/* Difficulty Filter */}
          <select
            value={diffFilter}
            onChange={(e) => setDiffFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] font-medium focus:outline-none focus:border-[#2F5CFF]"
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* Tier Filter */}
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] font-medium focus:outline-none focus:border-[#2F5CFF]"
          >
            <option value="all">All Tiers</option>
            <option value="TIER_1">Tier 1</option>
            <option value="TIER_2">Tier 2</option>
          </select>

          {/* Department / Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] font-medium focus:outline-none focus:border-[#2F5CFF]"
          >
            <option value="all">All Roles / Depts</option>
            <option value="SOFTWARE_ENGINEERING">Software Engineering</option>
            <option value="DATA_ENGINEERING">Data Engineering</option>
            <option value="QA">QA</option>
            <option value="SRE">SRE</option>
            <option value="SYSOPS">SysOps</option>
            <option value="ITOPS">ITOps</option>
            <option value="PMO">PMO</option>
            <option value="SECOPS">SecOps</option>
            <option value="General">General</option>
          </select>

          <div className="relative group">
            <button
              className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[#2F5CFF] hover:bg-[#0037FF] cursor-pointer shadow-sm transition-colors rounded-md"
            >
              <Plus size={14} /> Add Question
            </button>
            {/* Dropdown Menu on Hover */}
            <div className="absolute right-0 top-full w-44 pt-1.5 z-50 hidden group-hover:block hover:block">
              <div className="bg-white border border-[#E6E6EA] rounded-lg shadow-lg py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full text-left px-4 py-2 text-[12px] text-[#0B0B0D] hover:bg-[#F7F7F9] hover:text-[#2F5CFF] font-medium transition-colors cursor-pointer"
                >
                  Create Manually
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="w-full text-left px-4 py-2 text-[12px] text-[#0B0B0D] hover:bg-[#F7F7F9] hover:text-[#2F5CFF] font-medium transition-colors cursor-pointer"
                >
                  Bulk Import CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    >
      {/* Single-Click Return Banner if navigated from a Drive */}
      {(() => {
        if (typeof window === "undefined") return null;
        const params = new URLSearchParams(window.location.search);
        const driveId = params.get("driveId") || params.get("fromDrive");
        if (!driveId) return null;
        return (
          <div className="mb-4 p-3 bg-[#EAF0FF] border border-[#2F5CFF]/30 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5 text-[#15308F] text-[13px] font-medium">
              <Sparkles size={16} className="text-[#2F5CFF]" />
              <span>You are currently managing questions for an active Drive.</span>
            </div>
            <Link
              to="/drives/$id"
              params={{ id: driveId }}
              search={{ tab: "questions" } as any}
              className="px-3.5 py-1.5 bg-[#2F5CFF] hover:bg-[#0037FF] text-white text-[12px] font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Return to Drive Questions</span>
            </Link>
          </div>
        );
      })()}

      {/* Tag Directory Navigation */}
      {query.trim() !== "" ? (
        /* Search results list */
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-3">
            <h3 className="text-[13px] font-semibold text-[#0B0B0D]">
              Search Results for "{query}" ({questions.length})
            </h3>
            {query.trim() !== "" && (
              <button
                onClick={() => setQuery("")}
                className="text-[11px] text-[#2F5CFF] hover:underline cursor-pointer"
              >
                Clear search
              </button>
            )}
          </div>
          <div className="space-y-3">
            {questions.map((q) => (
              <div
                key={q.id}
                className="bg-white border border-[#E6E6EA] rounded-[10px] p-4 shadow-sm hover:border-[#D6D7DC] transition-colors flex items-start justify-between"
              >
                <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#EFF0F3] text-[#5B5B64] font-mono text-[10px] uppercase font-semibold">
                      {q.moduleType}
                    </span>
                    <span className="text-[10px] text-[#8B8B93] font-mono">v{q.version}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                        q.difficulty === "easy"
                          ? "bg-emerald-50 text-emerald-700"
                          : q.difficulty === "medium"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {q.difficulty}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#EAF0FF] text-[#15308F] text-[10px] font-medium">
                      Role: {q.role || "General"}
                    </span>
                  </div>
                  <h4 className="text-[13px] font-medium text-[#0B0B0D] line-clamp-2">
                    {q.content?.prompt || q.content?.title || "Simulation Scenario"}
                  </h4>
                  {q.tags && q.tags.length > 0 && (() => {
                    const { displayTags, hiddenDriveCount } = processQuestionTags(q.tags, q.moduleType);
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {displayTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#E6E6EA] text-[10px] text-[#5B5B64] font-mono"
                          >
                            <Tag size={8} />
                            {tag}
                          </span>
                        ))}
                        {hiddenDriveCount > 0 && (
                          <span className="text-[10px] text-[#2F5CFF] bg-[#EAF0FF] px-2 py-0.5 rounded-full font-semibold">
                            +{hiddenDriveCount} more drives
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center font-mono">
                    <div className="text-[13px] font-semibold text-[#0B0B0D]">{q.usageCount}</div>
                    <div className="text-[9px] uppercase tracking-wider text-[#8B8B93]">Drives</div>
                  </div>
                  <div className="text-center font-mono">
                    <div className="text-[13px] font-semibold text-[#0B0B0D]">
                      {q.avgScore !== null ? `${q.avgScore}%` : "—"}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-[#8B8B93]">Avg Score</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(q)}
                      className="p-2 text-[#2F5CFF] hover:bg-[#EFF4FF] rounded transition-colors cursor-pointer"
                      title="Preview & Edit"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmArchiveQuestion(q)}
                      className="p-2 text-[#EF4444] hover:bg-[#FEF2F2] rounded transition-colors cursor-pointer"
                      title="Archive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : selectedFolder !== null ? (
        /* Inside a folder */
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedFolder(null)}
                className="flex items-center gap-1 text-[12px] font-medium text-[#2F5CFF] hover:underline cursor-pointer"
              >
                <ArrowLeft size={13} /> Back to Folders
              </button>
              <span className="text-[#8B8B93]">/</span>
              <span className="text-[13px] font-semibold text-[#0B0B0D] capitalize flex items-center gap-1.5">
                <Folder size={14} className="text-[#2F5CFF]" />
                {selectedFolder} ({groupedQuestions[selectedFolder]?.length || 0})
              </span>
            </div>
          </div>
          <div className="space-y-3">
            {(groupedQuestions[selectedFolder] || []).map((q) => (
              <div
                key={q.id}
                className="bg-white border border-[#E6E6EA] rounded-[10px] p-4 shadow-sm hover:border-[#D6D7DC] transition-colors flex items-start justify-between"
              >
                <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#EFF0F3] text-[#5B5B64] font-mono text-[10px] uppercase font-semibold">
                      {q.moduleType}
                    </span>
                    <span className="text-[10px] text-[#8B8B93] font-mono">v{q.version}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                        q.difficulty === "easy"
                          ? "bg-emerald-50 text-emerald-700"
                          : q.difficulty === "medium"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {q.difficulty}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                        extractQuestionTier(q) === "TIER_2"
                          ? "bg-purple-100 text-purple-800 border border-purple-200"
                          : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                      }`}
                    >
                      {extractQuestionTier(q) === "TIER_2" ? "TIER 2" : "TIER 1"}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#EAF0FF] text-[#15308F] text-[10px] font-medium">
                      Role: {q.role || "General"}
                    </span>
                  </div>
                  <h4 className="text-[13px] font-medium text-[#0B0B0D] line-clamp-2">
                    {q.content?.prompt || q.content?.title || "Simulation Scenario"}
                  </h4>
                  {q.tags && q.tags.length > 0 && (() => {
                    const { displayTags, hiddenDriveCount } = processQuestionTags(q.tags, q.moduleType);
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {displayTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#E6E6EA] text-[10px] text-[#5B5B64] font-mono"
                          >
                            <Tag size={8} />
                            {tag}
                          </span>
                        ))}
                        {hiddenDriveCount > 0 && (
                          <span className="text-[10px] text-[#2F5CFF] bg-[#EAF0FF] px-2 py-0.5 rounded-full font-semibold">
                            +{hiddenDriveCount} more drives
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center font-mono">
                    <div className="text-[13px] font-semibold text-[#0B0B0D]">{q.usageCount}</div>
                    <div className="text-[9px] uppercase tracking-wider text-[#8B8B93]">Drives</div>
                  </div>
                  <div className="text-center font-mono">
                    <div className="text-[13px] font-semibold text-[#0B0B0D]">
                      {q.avgScore !== null ? `${q.avgScore}%` : "—"}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-[#8B8B93]">Avg Score</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(q)}
                      className="p-2 text-[#2F5CFF] hover:bg-[#EFF4FF] rounded transition-colors cursor-pointer"
                      title="Preview & Edit"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmArchiveQuestion(q)}
                      className="p-2 text-[#EF4444] hover:bg-[#FEF2F2] rounded transition-colors cursor-pointer"
                      title="Archive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Folder Grid directory list */
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-3">
            <h3 className="text-[13px] font-semibold text-[#0B0B0D]">Question Repositories</h3>
            <span className="text-[11px] text-[#8B8B93] font-mono">
              {Object.keys(groupedQuestions).length} tag directories
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.keys(groupedQuestions).length === 0 ? (
              <p className="col-span-full text-center py-8 text-[13px] text-[#8B8B93] font-mono border border-dashed border-[#E6E6EA] rounded-lg bg-white">
                No questions found.
              </p>
            ) : (
              Object.entries(groupedQuestions).map(([tag, list]) => (
                <div
                  key={tag}
                  onClick={() => setSelectedFolder(tag)}
                  className="p-5 bg-white border border-[#E6E6EA] rounded-[12px] shadow-sm hover:shadow-md hover:border-[#2F5CFF] transition-all cursor-pointer flex flex-col justify-between group relative"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-[#EFF4FF] text-[#2F5CFF] rounded-lg group-hover:bg-[#2F5CFF] group-hover:text-white transition-colors">
                        <Folder size={20} />
                      </div>
                      <div>
                        <h4 className="text-[13px] font-semibold text-[#0B0B0D] group-hover:text-[#2F5CFF] transition-colors truncate max-w-[120px] capitalize">
                          {tag}
                        </h4>
                        <p className="text-[11px] text-[#8B8B93] font-mono mt-0.5">
                          {list.length} {list.length === 1 ? "question" : "questions"}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteFolder(tag);
                      }}
                      className="p-1.5 text-[#8B8B93] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer shrink-0"
                      title="Delete folder"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="flex justify-end pt-4">
                    <span className="text-[11px] font-medium text-[#2F5CFF] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                      Open <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[580px] shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#0B0B0D]">
                Create Assessment Question
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[#8B8B93] hover:text-[#0B0B0D]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Module Type
                  </label>
                  <select
                    value={moduleType}
                    onChange={(e) => setModuleType(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="MCQ">MCQ</option>
                    <option value="SQL">SQL</option>
                    <option value="NOSQL">NoSQL Queries</option>
                    <option value="CODING">Coding / DSA</option>
                    <option value="DEBUGGING">Debugging</option>
                    <option value="AI_PROMPTING">AI Prompting</option>
                    <option value="SIMULATION">Contextual Simulation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Difficulty
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Target Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="General">General</option>
                    <option value="Backend Engineer">Backend Engineer</option>
                    <option value="Full-stack Engineer">Full-stack Engineer</option>
                    <option value="Data Engineer">Data Engineer</option>
                    <option value="ML Engineer">ML Engineer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                  Tags (comma separated)
                </label>
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. recursion, arrays, medium"
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                  {moduleType === "SIMULATION" ? "Scenario Description" : "Question Prompt"}
                </label>
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  rows={4}
                  placeholder={
                    moduleType === "SIMULATION"
                      ? "Describe the simulation roleplay scenario context..."
                      : "Enter the question prompt here..."
                  }
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none focus:border-[#2F5CFF]"
                />
              </div>

              {/* MCQ Fields */}
              {moduleType === "MCQ" && (
                <div className="space-y-2">
                  <label className="block text-[12px] font-medium text-[#5B5B64]">
                    MCQ Options
                  </label>
                  {mcqOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={correctIndex === i}
                        onChange={() => setCorrectIndex(i)}
                        className="w-4 h-4 text-[#2F5CFF]"
                      />
                      <input
                        value={opt}
                        onChange={(e) => {
                          const list = [...mcqOptions];
                          list[i] = e.target.value;
                          setMcqOptions(list);
                        }}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 px-3 py-1.5 border border-[#E6E6EA] rounded text-[13px]"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* SQL Fields */}
              {moduleType === "SQL" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Schema Definition SQL
                    </label>
                    <textarea
                      value={sqlSchema}
                      onChange={(e) => setSqlSchema(e.target.value)}
                      rows={3}
                      placeholder="CREATE TABLE users (id SERIAL, name VARCHAR(100));"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Seed Data SQL
                    </label>
                    <textarea
                      value={sqlSeed}
                      onChange={(e) => setSqlSeed(e.target.value)}
                      rows={3}
                      placeholder="INSERT INTO users (name) VALUES ('Alice');"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Expected Query SQL (Used for validation)
                    </label>
                    <textarea
                      value={sqlExpectedQuery}
                      onChange={(e) => setSqlExpectedQuery(e.target.value)}
                      rows={3}
                      placeholder="SELECT * FROM users ORDER BY name;"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>

                </div>
              )}

              {/* NoSQL Fields */}
              {moduleType === "NOSQL" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Collections (comma-separated, e.g. employees, departments)
                    </label>
                    <input
                      type="text"
                      value={nosqlCollections}
                      onChange={(e) => setNosqlCollections(e.target.value)}
                      placeholder="employees, departments"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Allowed Operations
                    </label>
                    <div className="flex flex-wrap gap-2 p-2 border border-[#E6E6EA] rounded-md bg-white">
                      {["find", "aggregate", "insertOne", "insertMany", "updateOne", "updateMany", "deleteOne", "deleteMany", "countDocuments"].map((op) => (
                        <label key={op} className="flex items-center gap-1 text-[11px] font-mono cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={nosqlAllowedOps.includes(op)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNosqlAllowedOps([...nosqlAllowedOps, op]);
                              } else {
                                setNosqlAllowedOps(nosqlAllowedOps.filter((x) => x !== op));
                              }
                            }}
                          />
                          {op}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Validator Type
                    </label>
                    <select
                      value={nosqlValidatorType}
                      onChange={(e) => setNosqlValidatorType(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    >
                      <option value="OUTPUT_COMPARISON">OUTPUT_COMPARISON</option>
                      <option value="STATE_COMPARISON">STATE_COMPARISON</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Dataset Reference Path (MinIO object key)
                    </label>
                    <input
                      type="text"
                      value={nosqlDatasetRef}
                      onChange={(e) => setNosqlDatasetRef(e.target.value)}
                      placeholder="datasets/employees-seed.json"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Expected Operation (JSON format)
                    </label>
                    <textarea
                      value={nosqlExpectedOp}
                      onChange={(e) => setNosqlExpectedOp(e.target.value)}
                      rows={4}
                      placeholder={JSON.stringify({ collection: "employees", operator: "find", payload: { filter: { salary: { $gt: 50000 } } } }, null, 2)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Coding & Debugging Fields */}
              {(moduleType === "CODING" || moduleType === "DEBUGGING") && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Starter Code
                    </label>
                    <div className="h-40 border border-[#E6E6EA] rounded-md overflow-hidden">
                      <CodeEditor
                        value={starterCode}
                        onChange={(val) => setStarterCode(val)}
                        language="javascript"
                        theme="light"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Test Cases JSON (Array of input/expected)
                    </label>
                    <textarea
                      value={testCasesInput}
                      onChange={(e) => setTestCasesInput(e.target.value)}
                      rows={3}
                      placeholder='[{"input": "[1, 2]", "expected": "3"}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}

              {/* AI Prompting Fields */}
              {moduleType === "AI_PROMPTING" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Primary Technology / Stack Selection
                    </label>
                    <select
                      value={aiTechStack}
                      onChange={(e) => setAiTechStack(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    >
                      <option value="React/TypeScript">React / TypeScript</option>
                      <option value="Node.js/Express">Node.js / Express</option>
                      <option value="Python/FastAPI">Python / FastAPI</option>
                      <option value="SQL/PostgreSQL">SQL / PostgreSQL</option>
                      <option value="Docker/Kubernetes">Docker / Kubernetes</option>
                      <option value="AWS/Cloud Infrastructure">AWS / Cloud Infrastructure</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      AI System Context / Role Guidelines
                    </label>
                    <textarea
                      value={aiSystemContext}
                      onChange={(e) => setAiSystemContext(e.target.value)}
                      rows={3}
                      placeholder="Specify system instructions for the LLM assistant (e.g. You are an expert code reviewer evaluating Express middleware request signatures...)"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Expected Response Criteria / Ideal Summary
                    </label>
                    <textarea
                      value={aiIdealResponse}
                      onChange={(e) => setAiIdealResponse(e.target.value)}
                      rows={3}
                      placeholder="Outline key elements that the student's prompt should instruct the LLM to cover (e.g., must include error handling, TypeScript types, edge cases)..."
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px]"
                    />
                  </div>
                </div>
              )}

              {/* Simulation Fields */}
              {moduleType === "SIMULATION" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Triggers JSON Array
                    </label>
                    <textarea
                      value={simTriggers}
                      onChange={(e) => setSimTriggers(e.target.value)}
                      rows={3}
                      placeholder='[{"timeSeconds": 10, "message": "Can you refactor this?"}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Rubric Criteria JSON Array
                    </label>
                    <textarea
                      value={simRubric}
                      onChange={(e) => setSimRubric(e.target.value)}
                      rows={3}
                      placeholder='[{"criterion": "Code Quality", "maxPoints": 5}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#E6E6EA] flex justify-end gap-2 bg-[#F7F7F9] rounded-b-[12px]">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3.5 py-2 text-[13px] border border-[#E6E6EA] rounded hover:bg-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 text-[13px] text-white bg-[#2F5CFF] rounded hover:bg-[#0037FF] transition-colors cursor-pointer shadow-sm"
              >
                Create Question
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[580px] shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#0B0B0D]">
                Bulk Upload Questions
              </h2>
              <button
                onClick={() => {
                  setCsvFile(null);
                  setShowImportModal(false);
                }}
                className="text-[#8B8B93] hover:text-[#0B0B0D]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <p className="text-[12px] text-[#5B5B64]">
                Select a module category and download the matched template layout to begin importing questions.
              </p>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                  Module Category
                </label>
                <select
                  value={importModuleType}
                  onChange={(e) => setImportModuleType(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none"
                >
                  <option value="MCQ">Multiple Choice (MCQ)</option>
                  <option value="SQL">SQL Database Evaluation</option>
                  <option value="NOSQL">NoSQL Database Evaluation</option>
                  <option value="CODING">Coding & Algorithms</option>
                  <option value="DEBUGGING">Debugging</option>
                  <option value="AI_PROMPTING">AI Prompting</option>
                  <option value="SIMULATION">Contextual Simulation</option>
                </select>
              </div>

              {/* Template Downloader section */}
              <div className="p-4 bg-[#F7F7F9] rounded-lg border border-[#E6E6EA] flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-[12px] font-semibold text-[#0B0B0D]">CSV Template Ready</div>
                  <div className="text-[11px] text-[#8B8B93]">
                    Matches layout header schema precisely for {importModuleType}
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadSample(importModuleType)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2F5CFF] text-[#2F5CFF] bg-white rounded hover:bg-[#2F5CFF] hover:text-white transition-all text-[12px] font-medium cursor-pointer shadow-sm"
                >
                  <Download size={13} />
                  Download template
                </button>
              </div>

              {/* Upload Area */}
              <div className="space-y-2">
                <label className="block text-[12px] font-medium text-[#5B5B64]">Select CSV File</label>
                <div className="border-2 border-dashed border-[#E6E6EA] rounded-lg p-6 flex flex-col items-center justify-center bg-[#FDFDFD] hover:bg-[#F9FBFD] transition-colors relative cursor-pointer">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setCsvFile(file);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <UploadCloud size={32} className="text-[#8B8B93] mb-2" />
                  <span className="text-[12px] text-[#5B5B64] font-medium text-center px-4">
                    {csvFile ? csvFile.name : "Drag & drop your CSV file here, or click to browse"}
                  </span>
                  <span className="text-[10px] text-[#8B8B93] mt-1">Accepts .csv format</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#E6E6EA] flex justify-end gap-2 bg-[#F7F7F9] rounded-b-[12px]">
              <button
                onClick={() => {
                  setCsvFile(null);
                  setShowImportModal(false);
                }}
                className="px-3.5 py-2 text-[12px] border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!csvFile}
                className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-white bg-[#2F5CFF] rounded hover:bg-[#0037FF] disabled:bg-[#EFF0F3] disabled:text-[#8B8B93] disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer"
              >
                <Check size={14} />
                Import Questions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview & Edit Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[580px] shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#0B0B0D]">
                Preview & Edit Question (v{editingQuestion.version})
              </h2>
              <button
                onClick={() => setEditingQuestion(null)}
                className="text-[#8B8B93] hover:text-[#0B0B0D]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Module Type (Read-Only)
                  </label>
                  <input
                    value={editingQuestion.moduleType}
                    disabled
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-[#EFF0F3] text-[13px] text-[#5B5B64] cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Difficulty
                  </label>
                  <select
                    value={editDifficulty}
                    onChange={(e) => setEditDifficulty(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Target Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="General">General</option>
                    <option value="Backend Engineer">Backend Engineer</option>
                    <option value="Full-stack Engineer">Full-stack Engineer</option>
                    <option value="Data Engineer">Data Engineer</option>
                    <option value="ML Engineer">ML Engineer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                  Tags (comma separated)
                </label>
                <input
                  value={editTagsInput}
                  onChange={(e) => setEditTagsInput(e.target.value)}
                  placeholder="e.g. recursion, arrays, medium"
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                  {editingQuestion.moduleType === "SIMULATION" ? "Scenario Description" : "Question Prompt"}
                </label>
                <textarea
                  value={editPromptText}
                  onChange={(e) => setEditPromptText(e.target.value)}
                  rows={4}
                  placeholder={
                    editingQuestion.moduleType === "SIMULATION"
                      ? "Describe the simulation roleplay scenario context..."
                      : "Enter the question prompt here..."
                  }
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none focus:border-[#2F5CFF]"
                />
              </div>

              {/* MCQ Fields */}
              {editingQuestion.moduleType === "MCQ" && (
                <div className="space-y-2">
                  <label className="block text-[12px] font-medium text-[#5B5B64]">
                    MCQ Options
                  </label>
                  {editMcqOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={editCorrectIndex === i}
                        onChange={() => setEditCorrectIndex(i)}
                        className="w-4 h-4 text-[#2F5CFF]"
                      />
                      <input
                        value={opt}
                        onChange={(e) => {
                          const list = [...editMcqOptions];
                          list[i] = e.target.value;
                          setEditMcqOptions(list);
                        }}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 px-3 py-1.5 border border-[#E6E6EA] rounded text-[13px]"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* SQL Fields */}
              {editingQuestion.moduleType === "SQL" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Schema Definition SQL
                    </label>
                    <textarea
                      value={editSqlSchema}
                      onChange={(e) => setEditSqlSchema(e.target.value)}
                      rows={3}
                      placeholder="CREATE TABLE users (id SERIAL, name VARCHAR(100));"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Seed Data SQL
                    </label>
                    <textarea
                      value={editSqlSeed}
                      onChange={(e) => setEditSqlSeed(e.target.value)}
                      rows={3}
                      placeholder="INSERT INTO users (name) VALUES ('Alice');"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Expected Query SQL (Used for validation)
                    </label>
                    <textarea
                      value={editSqlExpectedQuery}
                      onChange={(e) => setEditSqlExpectedQuery(e.target.value)}
                      rows={3}
                      placeholder="SELECT * FROM users ORDER BY name;"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>

                </div>
              )}

              {/* NoSQL Fields */}
              {editingQuestion.moduleType === "NOSQL" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Collections (comma-separated, e.g. employees, departments)
                    </label>
                    <input
                      type="text"
                      value={editNosqlCollections}
                      onChange={(e) => setEditNosqlCollections(e.target.value)}
                      placeholder="employees, departments"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Allowed Operations
                    </label>
                    <div className="flex flex-wrap gap-2 p-2 border border-[#E6E6EA] rounded-md bg-white">
                      {["find", "aggregate", "insertOne", "insertMany", "updateOne", "updateMany", "deleteOne", "deleteMany", "countDocuments"].map((op) => (
                        <label key={op} className="flex items-center gap-1 text-[11px] font-mono cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editNosqlAllowedOps.includes(op)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditNosqlAllowedOps([...editNosqlAllowedOps, op]);
                              } else {
                                setEditNosqlAllowedOps(editNosqlAllowedOps.filter((x) => x !== op));
                              }
                            }}
                          />
                          {op}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Validator Type
                    </label>
                    <select
                      value={editNosqlValidatorType}
                      onChange={(e) => setEditNosqlValidatorType(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    >
                      <option value="OUTPUT_COMPARISON">OUTPUT_COMPARISON</option>
                      <option value="STATE_COMPARISON">STATE_COMPARISON</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Dataset Reference Path (MinIO object key)
                    </label>
                    <input
                      type="text"
                      value={editNosqlDatasetRef}
                      onChange={(e) => setEditNosqlDatasetRef(e.target.value)}
                      placeholder="datasets/employees-seed.json"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Expected Operation (JSON format)
                    </label>
                    <textarea
                      value={editNosqlExpectedOp}
                      onChange={(e) => setEditNosqlExpectedOp(e.target.value)}
                      rows={4}
                      placeholder={JSON.stringify({ collection: "employees", operator: "find", payload: { filter: { salary: { $gt: 50000 } } } }, null, 2)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Coding & Debugging Fields */}
              {(editingQuestion.moduleType === "CODING" || editingQuestion.moduleType === "DEBUGGING") && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Starter Code
                    </label>
                    <div className="h-40 border border-[#E6E6EA] rounded-md overflow-hidden">
                      <CodeEditor
                        value={editStarterCode}
                        onChange={(val) => setEditStarterCode(val)}
                        language="javascript"
                        theme="light"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Test Cases JSON (Array of input/expected)
                    </label>
                    <textarea
                      value={editTestCasesInput}
                      onChange={(e) => setEditTestCasesInput(e.target.value)}
                      rows={3}
                      placeholder='[{"input": "[1, 2]", "expected": "3"}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Simulation Fields */}
              {editingQuestion.moduleType === "SIMULATION" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Triggers JSON Array
                    </label>
                    <textarea
                      value={editSimTriggers}
                      onChange={(e) => setEditSimTriggers(e.target.value)}
                      rows={3}
                      placeholder='[{"timeSeconds": 10, "message": "Can you refactor this?"}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Rubric Criteria JSON Array
                    </label>
                    <textarea
                      value={editSimRubric}
                      onChange={(e) => setEditSimRubric(e.target.value)}
                      rows={3}
                      placeholder='[{"criterion": "Code Quality", "maxPoints": 5}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#E6E6EA] flex justify-end gap-2 bg-[#F7F7F9] rounded-b-[12px]">
              <button
                onClick={() => setEditingQuestion(null)}
                className="px-3.5 py-2 text-[13px] border border-[#E6E6EA] rounded hover:bg-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 text-[13px] text-white bg-[#2F5CFF] rounded hover:bg-[#0037FF] transition-colors cursor-pointer shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Question Confirmation Modal */}
      {confirmArchiveQuestion && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#E6E6EA] pb-3">
              <div className="p-2 bg-red-50 text-red-500 rounded-full">
                <Trash2 size={18} />
              </div>
              <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Archive Question?</h3>
            </div>
            
            <p className="text-[13px] text-[#5B5B64] leading-relaxed">
              Are you sure you want to archive this question? The question will be removed from active use and won't appear in new drive assignments.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-[13px]">
              <button
                onClick={() => setConfirmArchiveQuestion(null)}
                className="px-3.5 py-2 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  archiveQuestion(confirmArchiveQuestion.id);
                  setConfirmArchiveQuestion(null);
                }}
                className="px-4 py-2 text-white bg-red-500 hover:bg-red-600 font-semibold cursor-pointer shadow-sm transition-colors rounded"
              >
                Archive Question
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Folder Confirmation Modal */}
      {confirmDeleteFolder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#E6E6EA] pb-3">
              <div className="p-2 bg-red-50 text-red-500 rounded-full">
                <Trash2 size={18} />
              </div>
              <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Delete Question Folder?</h3>
            </div>
            
            <p className="text-[13px] text-[#5B5B64] leading-relaxed">
              Are you sure you want to delete the folder <strong className="text-[#0B0B0D]">"{confirmDeleteFolder}"</strong> containing{" "}
              <strong className="text-[#0B0B0D]">{groupedQuestions[confirmDeleteFolder]?.length || 0} questions</strong>? All questions in this repository will be archived.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-[13px]">
              <button
                onClick={() => setConfirmDeleteFolder(null)}
                className="px-3.5 py-2 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const tag = confirmDeleteFolder;
                  const list = groupedQuestions[tag] || [];
                  try {
                    for (const q of list) {
                      await archiveQuestion(q.id);
                    }
                    toast.success(`Deleted folder "${tag}" and archived ${list.length} questions`);
                    setConfirmDeleteFolder(null);
                  } catch (err: any) {
                    toast.error("Failed deleting folder: " + (err.message || err));
                  }
                }}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 font-semibold cursor-pointer shadow-sm transition-colors rounded"
              >
                Delete Folder &amp; Questions
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
