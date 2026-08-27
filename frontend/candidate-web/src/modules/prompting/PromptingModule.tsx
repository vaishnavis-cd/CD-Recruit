import React, { useEffect, useState } from 'react';
import type { PromptingQuestion } from '../../fixtures/questions';
import { useSessionStore } from '../../store/sessionMachine';
import { ModuleShell } from '../../components/ModuleShell';
import { services } from '../../services';
import { ProctoringEventService } from '../../proctoring/proctoring-event.service';
import { useModuleNavigation } from '../../hooks/useModuleNavigation';
import apiClient from '../../api/client';
import { StatusChip } from '../../components/common/StatusChip';
import { Loader2, Sparkles, Lightbulb, ChevronLeft } from 'lucide-react';

interface PromptingModuleProps {
  moduleIndex: number;
}

export function PromptingModule({ moduleIndex }: PromptingModuleProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const assessment = useSessionStore(s => s.assessment);
  const setResponse = useSessionStore(s => s.setResponse);
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion);

  const assignedPromptingQuestions = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) return [];
    return assessment.questions.filter((q) => q.moduleType === 'AI_PROMPTING');
  }, [assessment?.questions]);

  const questions = assignedPromptingQuestions;
  const questionMetadata = questions[currentIndex];
  const questionId = questionMetadata?.questionId ?? '';

  const { handleNext, nextButtonLabel } = useModuleNavigation(moduleIndex, currentIndex, questions.length);

  const [questionData, setQuestionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Restore current question index on mount
  useEffect(() => {
    if (assessment?.currentModuleIndex === moduleIndex) {
      setCurrentIndex(assessment.currentQuestionIndex);
    }
  }, []);

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex);
  }, [currentIndex]);

  // Fetch question details and responses from backend
  useEffect(() => {
    if (!assessment?.sessionId || !questionId) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    setLoading(true);
    setError(null);
    apiClient.get(`/sessions/${assessment.sessionId}/questions/${questionId}`)
      .then(res => {
        if (isMounted) {
          setQuestionData(res.data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message || 'Failed to load prompting question details');
          setLoading(false);
        }
      });
    return () => { isMounted = false; };
  }, [assessment?.sessionId, questionId]);

  // Map to PromptingQuestion structure
  const question = React.useMemo(() => {
    const content = questionData?.content || {};
    return {
      id: questionId || 'ai-prompting-dynamic',
      moduleIndex,
      type: 'prompting' as const,
      text: content.prompt || content.scenario || content.instructions || content.description || content.title || 'AI Prompting Challenge: Craft a structured system prompt and test cases to evaluate LLM output accuracy.',
      systemContext: content.context || content.systemContext || 'You are an AI assistant helping with an engineering evaluation.',
      suggestedResponse: content.idealResponseSummary || '',
    } as PromptingQuestion;
  }, [questionData, questionId, moduleIndex]);

  // Sync DB response query to store & local state
  useEffect(() => {
    if (questionData && questionId) {
      const dbResponse = questionData.response?.responsePayload as { prompt?: string; aiResponse?: string } | undefined;
      const savedResponse = (assessment?.responses[questionId] as { prompt?: string; aiResponse?: string } | undefined) ?? dbResponse;
      if (savedResponse?.prompt) {
        setPromptText(savedResponse.prompt);
        setAiResponse(savedResponse.aiResponse || null);
        setSubmitted(!!savedResponse.aiResponse);
        if (!assessment?.responses[questionId]) {
          setResponse(questionId, savedResponse);
        }
      } else {
        setPromptText('');
        setAiResponse(null);
        setSubmitted(false);
      }
    }
  }, [questionData, questionId]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    const targetSessionId = assessment?.sessionId || useSessionStore.getState().session?.id || useSessionStore.getState().assessment?.sessionId;
    if (targetSessionId && pastedText) {
      try {
        ProctoringEventService.getInstance().createEvent({
          sessionId: targetSessionId,
          eventType: 'PASTE' as any,
          severity: 'MEDIUM' as any,
          timestamp: new Date().toISOString(),
          metadata: {
            charCount: pastedText.length,
            textSnippet: pastedText.slice(0, 100),
            questionId: questionId,
          },
        });
      } catch (err) {
        console.warn('Failed to record AI prompting paste event:', err);
      }
    }
  };

  function handlePromptChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setPromptText(e.target.value);
    setResponse(questionId, { prompt: e.target.value, aiResponse });
  }

  async function handleSubmitPrompt() {
    if (!promptText.trim()) return;
    setLoadingPrompt(true);
    setAiResponse(null);

    try {
      const sessionId = assessment?.sessionId || '';
      const aiRes = await services.sessionApi.runAiPrompt({
        sessionId,
        questionId: questionId,
        prompt: promptText
      });
      setAiResponse(aiRes);
      setSubmitted(true);
      setResponse(questionId, { prompt: promptText, aiResponse: aiRes });
    } catch (err) {
      console.error('Failed to run AI prompt', err);
      const fallback = question?.suggestedResponse ?? 'Mock AI response: your prompt has been evaluated.';
      setAiResponse(fallback);
      setSubmitted(true);
      setResponse(questionId, { prompt: promptText, aiResponse: fallback });
    } finally {
      setLoadingPrompt(false);
    }
  }

  async function handleRevise() {
    setAiResponse(null);
    setSubmitted(false);
    setLoadingPrompt(false);
  }

  const paletteItems = questions.map((q, i) => ({ id: q.questionId, label: `Prompt ${i + 1}` }));

  // Check client-side verbatim similarity for real-time prompt guidance
  const isVerbatimPrompt = React.useMemo(() => {
    if (!promptText.trim() || !question?.text) return false;
    const cleanP = promptText.toLowerCase().replace(/[^\w\s]/g, "").trim();
    const cleanT = question.text.toLowerCase().replace(/[^\w\s]/g, "").trim();
    if (!cleanP || !cleanT) return false;
    if (cleanP === cleanT || cleanT.includes(cleanP) || cleanP.includes(cleanT)) {
      if (Math.min(cleanP.length, cleanT.length) / Math.max(cleanP.length, cleanT.length) > 0.5) return true;
    }
    const pTokens = new Set(cleanP.split(/\s+/).filter(t => t.length > 2));
    const tTokens = new Set(cleanT.split(/\s+/).filter(t => t.length > 2));
    if (tTokens.size === 0) return false;
    let intersection = 0;
    pTokens.forEach((t: string) => { if (tTokens.has(t)) intersection++; });
    return (intersection / tTokens.size) >= 0.65;
  }, [promptText, question?.text]);

  if (loading) {
    return (
      <ModuleShell moduleIndex={moduleIndex} questions={paletteItems} currentQuestionIndex={currentIndex} onNavigate={setCurrentIndex}>
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <span className="text-[var(--text-secondary)] text-sm animate-pulse">Loading question…</span>
        </div>
      </ModuleShell>
    );
  }

  if (error || !question) {
    return (
      <ModuleShell moduleIndex={moduleIndex} questions={paletteItems} currentQuestionIndex={currentIndex} onNavigate={setCurrentIndex}>
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-2">
          <span className="text-[var(--warning)] text-sm">{error || 'No questions available for this module.'}</span>
        </div>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={paletteItems}
      currentQuestionIndex={currentIndex}
      onNavigate={setCurrentIndex}
    >
      <div className="flex-1 h-full flex flex-col min-h-0 overflow-hidden bg-[var(--background)]">
        {/* Scrollable Question & Prompt Sandbox Area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Candidate Evaluation Guidance Banner */}
            <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-secondary)] flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                <span>Iterate freely on your prompt. <strong>Only your final active prompt &amp; generated output submission</strong> will be evaluated by the grading engine.</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] text-2xs font-mono font-semibold">
                Task Scoped AI Sandbox
              </span>
            </div>

            <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
              Prompt {currentIndex + 1} of {questions.length}
            </div>

            {/* System context */}
            {question.systemContext && (
              <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs">
                <span className="font-medium text-[var(--text-secondary)]">Context: </span>
                <span className="text-[var(--text-secondary)]">{question.systemContext}</span>
              </div>
            )}

            {/* Task */}
            <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">{question.text}</p>
            </div>

            {/* Prompt input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor={`prompt-${question.id}`} className="block text-sm font-medium text-[var(--text-primary)]">
                  Your prompt to the AI assistant
                </label>
                {isVerbatimPrompt && (
                  <StatusChip
                    variant="warning"
                    label="Direct Copy Detected — Add Persona & Constraints"
                    size="sm"
                  />
                )}
              </div>

              <textarea
                id={`prompt-${question.id}`}
                value={promptText}
                onChange={handlePromptChange}
                onPaste={handlePaste}
                disabled={loadingPrompt}
                placeholder="Write your prompt here..."
                rows={6}
                aria-label="Enter your prompt to the AI assistant"
                className="w-full px-3.5 py-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--text-primary)] text-xs font-mono placeholder:text-[var(--text-secondary)] placeholder:font-sans resize-y focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] disabled:opacity-60 transition-colors"
              />
              {isVerbatimPrompt && (
                <div className="text-xs text-[var(--warning)] flex items-start gap-1.5">
                  <Lightbulb size={14} className="shrink-0 mt-0.5" />
                  <span><strong>Prompt Tip:</strong> Directly repeating the question will cause the AI assistant to ask for clarifying instructions rather than solving the task for you. Provide explicit persona framing, output formatting, or constraints.</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSubmitPrompt}
                disabled={loadingPrompt || !promptText.trim()}
                aria-label="Submit prompt to AI assistant"
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] flex items-center gap-2 cursor-pointer shadow-xs"
              >
                {loadingPrompt ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Getting response…</span>
                  </>
                ) : submitted ? (
                  <span>Resubmit Prompt</span>
                ) : (
                  <span>Submit Prompt</span>
                )}
              </button>
              {submitted && (
                <button
                  onClick={handleRevise}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border)] transition-colors cursor-pointer"
                >
                  Revise prompt
                </button>
              )}
            </div>

            {/* AI response area */}
            {loadingPrompt && (
              <div
                aria-live="polite"
                aria-label="AI response loading"
                className="p-5 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/10"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent)]">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Generating response from AI assistant…</span>
                </div>
              </div>
            )}

            {aiResponse && !loadingPrompt && (
              <div
                role="region"
                aria-label="AI assistant response"
                aria-live="polite"
                className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} className="text-[var(--accent)]" />
                    <span>AI Response</span>
                  </div>
                  {isVerbatimPrompt && (
                    <StatusChip
                      variant="warning"
                      label="Socratic Mode Active"
                      size="sm"
                    />
                  )}
                </div>
                <div className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-mono bg-[var(--background)] p-4 rounded-xl border border-[var(--border)]">
                  {aiResponse}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Standardized Pinned Bottom Navigation Bar */}
        <footer className="h-14 border-t border-[var(--border)] bg-[var(--surface)] px-6 flex items-center justify-between shrink-0 z-10 shadow-xs">
          <button
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            aria-label="Previous prompt"
          >
            <ChevronLeft size={14} />
            <span>Previous</span>
          </button>

          <span className="text-xs font-mono font-medium text-[var(--text-secondary)] hidden sm:inline">
            Prompt {currentIndex + 1} of {questions.length}
          </span>

          <button
            onClick={() => handleNext(() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1)))}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
            aria-label={nextButtonLabel}
          >
            <span>{nextButtonLabel}</span>
          </button>
        </footer>
      </div>
    </ModuleShell>
  );
}
