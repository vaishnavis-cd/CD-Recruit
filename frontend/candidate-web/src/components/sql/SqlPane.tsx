import { useState, useEffect, useCallback } from "react";
import { Play, Server, Database, CheckCircle, XCircle } from "lucide-react";
import apiClient from "@/api/client";

interface SqlPaneProps {
  sessionId: string;
  questionId: string;
  schema: string;
  seedData?: string;
  draftContent: { query: string } | null;
  isSubmitted: boolean;
  onDraftSave: (content: { query: string }) => void;
  onSubmit: (content: { query: string }) => void;
}

interface RunResult {
  executionId?: string;
  status?: string;
  passed?: boolean;
  executionTime?: number;
  resultRows?: number;
  error?: string;
}

export function SqlPane({
  sessionId,
  questionId,
  schema,
  draftContent,
  isSubmitted,
  onDraftSave,
  onSubmit,
}: SqlPaneProps) {
  const [query, setQuery] = useState(draftContent?.query ?? "");
  const [results, setResults] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setQuery(draftContent?.query ?? "");
    setResults(null);
  }, [draftContent]);

  const handleQueryChange = useCallback(
    (val: string) => {
      if (isSubmitted) return;
      setQuery(val);
      const timer = setTimeout(() => {
        onDraftSave({ query: val });
      }, 10_000);
      return () => clearTimeout(timer);
    },
    [isSubmitted, onDraftSave],
  );

  const runQuery = async () => {
    if (!query.trim()) return;
    setRunning(true);
    setResults(null);
    try {
      const { data } = await apiClient.post("/sql/run", {
        sessionId,
        questionId,
        query,
      });
      setResults(data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? err?.message ?? "Run failed";
      setResults({ error: msg });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Editor + results */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-surface border-b border-border-token px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs font-bold text-text-secondary font-mono">
            query.sql
          </span>
          <div className="flex gap-2">
            <button
              disabled={running || isSubmitted}
              onClick={runQuery}
              className="inline-flex items-center gap-1 px-3 py-1 bg-surface border border-border-token hover:bg-surface/80 disabled:opacity-40 text-text-primary text-xs font-semibold rounded transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 text-success" />
              {running ? "Running…" : "Run Query"}
            </button>
            <button
              disabled={!query.trim() || isSubmitted}
              onClick={() => onSubmit({ query })}
              className="inline-flex items-center gap-1 px-3 py-1 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
            >
              <Server className="w-3.5 h-3.5" />
              Submit
            </button>
          </div>
        </div>

        <textarea
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          disabled={isSubmitted}
          placeholder="SELECT ..."
          className="flex-1 p-4 font-mono text-xs bg-bg text-text-primary focus:outline-none resize-none"
          style={{ minHeight: "12rem" }}
        />

        {results && (
          <div className="border-t border-border-token p-4 bg-surface/30">
            {results.error ? (
              <div className="flex items-center gap-2 text-xs text-red-500 font-mono">
                <XCircle className="w-4 h-4 shrink-0" />
                {results.error}
              </div>
            ) : (
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  {results.passed ? (
                    <CheckCircle className="w-4 h-4 text-success" />
                  ) : (
                    <XCircle className="w-4 h-4 text-warning" />
                  )}
                  <span className={results.passed ? "text-success font-semibold" : "text-warning font-semibold"}>
                    {results.passed ? "Correct output" : "Output does not match"}
                  </span>
                </div>
                <span className="text-text-secondary">
                  {results.resultRows ?? 0} row{results.resultRows !== 1 ? "s" : ""} returned
                </span>
                {results.executionTime !== undefined && (
                  <span className="text-text-secondary">{results.executionTime}ms</span>
                )}
              </div>
            )}
          </div>
        )}

        {isSubmitted && (
          <div className="border-t border-border-token px-4 py-2 bg-success/10 text-xs text-success font-semibold">
            ✓ Answer submitted
          </div>
        )}
      </div>

      {/* Schema panel */}
      <div className="w-72 border-l border-border-token flex flex-col bg-surface/20 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-token flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-text-secondary" />
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
            Schema
          </span>
        </div>
        <pre className="flex-1 p-4 text-xs font-mono text-text-secondary overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">
          {schema}
        </pre>
      </div>
    </div>
  );
}
