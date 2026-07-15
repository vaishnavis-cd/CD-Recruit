import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
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
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore } from "../lib/store";
import { ModuleType } from "@cd-recruit/shared-types";

export const Route = createFileRoute("/questions")({
  component: QuestionBankPage,
  head: () => ({
    meta: [
      { title: "Question Bank — CD-Recruit" },
      {
        name: "description",
        content:
          "Author and review questions, configure automated validation scripts, and track cohort statistics.",
      },
    ],
  }),
});

function QuestionBankPage() {
  const questions = useStore((s) => s.questions);
  const fetchQuestions = useStore((s) => s.fetchQuestions);
  const createQuestion = useStore((s) => s.createQuestion);
  const archiveQuestion = useStore((s) => s.archiveQuestion);
  const bulkUploadQuestions = useStore((s) => s.bulkUploadQuestions);

  const [query, setQuery] = useState("");
  const [modFilter, setModFilter] = useState<string>("all");
  const [diffFilter, setDiffFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [moduleType, setModuleType] = useState<string>("MCQ");
  const [promptText, setPromptText] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [tagsInput, setTagsInput] = useState("");

  // MCQ specific
  const [mcqOptions, setMcqOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);

  // SQL specific
  const [sqlSchema, setSqlSchema] = useState("");
  const [sqlSeed, setSqlSeed] = useState("");

  // Coding specific
  const [starterCode, setStarterCode] = useState("");
  const [testCasesInput, setTestCasesInput] = useState("");

  // Simulation specific
  const [simTriggers, setSimTriggers] = useState("");
  const [simRubric, setSimRubric] = useState("");

  useEffect(() => {
    fetchQuestions({
      moduleType: modFilter !== "all" ? modFilter : undefined,
      difficulty: diffFilter !== "all" ? diffFilter : undefined,
      search: query ? query : undefined,
    });
  }, [modFilter, diffFilter, query]);

  const handleCreate = async () => {
    const content: any = { prompt: promptText };
    const scoringConfig: any = {};

    try {
      if (moduleType === "MCQ") {
        content.options = mcqOptions.filter((o) => o.trim());
        if (content.options.length < 2) {
          alert("Please provide at least 2 options");
          return;
        }
        scoringConfig.correctIndex = correctIndex;
      } else if (moduleType === "SQL") {
        content.schema = sqlSchema;
        content.seedData = sqlSeed;
      } else if (moduleType === "CODING") {
        content.starterCode = starterCode;
        content.testCases = testCasesInput ? JSON.parse(testCasesInput) : [];
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
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });

      setShowCreateModal(false);
      resetForm();
    } catch (err: any) {
      alert("Failed creating question: " + err.message);
    }
  };

  const resetForm = () => {
    setPromptText("");
    setTagsInput("");
    setMcqOptions(["", "", "", ""]);
    setCorrectIndex(0);
    setSqlSchema("");
    setSqlSeed("");
    setStarterCode("");
    setTestCasesInput("");
    setSimTriggers("");
    setSimRubric("");
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
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[#0B0B0D] rounded-md hover:bg-[#232327] cursor-pointer shadow-sm"
        >
          <Plus size={14} />
          Create Question
        </button>
      }
    >
      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={modFilter}
          onChange={(e) => setModFilter(e.target.value)}
          className="px-3 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] focus:outline-none"
        >
          <option value="all">All Modules</option>
          <option value="MCQ">MCQ</option>
          <option value="SQL">SQL</option>
          <option value="CODING">Coding / DSA</option>
          <option value="AI_PROMPTING">AI Prompting</option>
          <option value="SIMULATION">Contextual Simulation</option>
        </select>

        <select
          value={diffFilter}
          onChange={(e) => setDiffFilter(e.target.value)}
          className="px-3 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] focus:outline-none"
        >
          <option value="all">All Difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {/* Questions list */}
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
              </div>
              <h4 className="text-[13px] font-medium text-[#0B0B0D] line-clamp-2">
                {q.content?.prompt || q.content?.title || "Simulation Scenario"}
              </h4>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {q.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#E6E6EA] text-[10px] text-[#5B5B64]"
                  >
                    <Tag size={8} />
                    {tag}
                  </span>
                ))}
              </div>
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
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to archive this question?")) {
                    archiveQuestion(q.id);
                  }
                }}
                className="p-2 text-[#EF4444] hover:bg-[#FEF2F2] rounded transition-colors cursor-pointer"
                title="Archive Question"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {questions.length === 0 && (
          <p className="text-center py-8 text-[13px] text-[#8B8B93] font-mono">
            No questions found matching criteria.
          </p>
        )}
      </div>

      {/* Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
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
              <div className="grid grid-cols-2 gap-4">
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
                    <option value="CODING">Coding / DSA</option>
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
                </div>
              )}

              {/* Coding Fields */}
              {moduleType === "CODING" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Starter Code
                    </label>
                    <textarea
                      value={starterCode}
                      onChange={(e) => setStarterCode(e.target.value)}
                      rows={4}
                      placeholder="function solve(arr) { \n  // write code \n}"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
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
                className="px-4 py-2 text-[13px] text-white bg-[#2F5CFF] rounded hover:bg-[#1E4DDF] transition-colors cursor-pointer shadow-sm"
              >
                Create Question
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
