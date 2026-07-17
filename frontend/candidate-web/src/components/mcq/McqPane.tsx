import { useState, useEffect, useCallback } from "react";
import { CheckCircle } from "lucide-react";

interface McqPaneProps {
  sessionId: string;
  questionId: string;
  prompt: string;
  options: string[];
  draftContent: { selectedIndex: number } | null;
  isSubmitted: boolean;
  onDraftSave: (content: { selectedIndex: number }) => void;
  onSubmit: (content: { selectedIndex: number }) => void;
}

/**
 * MCQ answer pane.
 * - Restores selection from draftContent on mount.
 * - Autosaves draft 10 s after every selection change.
 * - Locked when isSubmitted = true.
 */
export function McqPane({
  prompt,
  options,
  draftContent,
  isSubmitted,
  onDraftSave,
  onSubmit,
}: McqPaneProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    draftContent?.selectedIndex ?? null,
  );

  // Restore draft on question change
  useEffect(() => {
    setSelectedIndex(draftContent?.selectedIndex ?? null);
  }, [draftContent]);

  // Autosave 10 s after selection
  const handleSelect = useCallback(
    (idx: number) => {
      if (isSubmitted) return;
      setSelectedIndex(idx);
      const timer = setTimeout(() => {
        onDraftSave({ selectedIndex: idx });
      }, 10_000);
      return () => clearTimeout(timer);
    },
    [isSubmitted, onDraftSave],
  );

  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto">
      <p className="text-sm text-text-secondary leading-relaxed mb-6">{prompt}</p>

      <div className="space-y-3 mb-8">
        {options.map((opt, idx) => (
          <button
            key={idx}
            disabled={isSubmitted}
            onClick={() => handleSelect(idx)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left text-sm transition-all cursor-pointer ${
              selectedIndex === idx
                ? "bg-accent/10 border-accent text-accent font-semibold"
                : "bg-surface border-border-token text-text-primary hover:bg-surface/80"
            } ${isSubmitted ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <span
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                selectedIndex === idx
                  ? "border-accent bg-accent text-white"
                  : "border-border-token"
              }`}
            >
              {String.fromCharCode(65 + idx)}
            </span>
            {opt}
            {isSubmitted && selectedIndex === idx && (
              <CheckCircle className="w-4 h-4 ml-auto text-success" />
            )}
          </button>
        ))}
      </div>

      {!isSubmitted && (
        <button
          disabled={selectedIndex === null}
          onClick={() => selectedIndex !== null && onSubmit({ selectedIndex })}
          className="mt-auto px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Submit Answer
        </button>
      )}

      {isSubmitted && (
        <div className="mt-auto px-4 py-2 bg-success/10 border border-success/30 rounded-lg text-xs text-success font-semibold">
          ✓ Answer submitted
        </div>
      )}
    </div>
  );
}
