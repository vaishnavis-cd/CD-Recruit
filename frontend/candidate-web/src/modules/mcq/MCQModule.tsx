import React, { useEffect, useState } from 'react';
import type { MCQQuestion } from '../../fixtures/questions';
import { useSessionStore } from '../../store/sessionMachine';
import { ModuleShell } from '../../components/ModuleShell';
import { useModuleNavigation } from '../../hooks/useModuleNavigation';
import apiClient from '../../api/client';
import { ChevronLeft } from 'lucide-react';

interface MCQModuleProps {
  moduleIndex: number;
}

export function MCQModule({ moduleIndex }: MCQModuleProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const assessment = useSessionStore(s => s.assessment);
  const setResponse = useSessionStore(s => s.setResponse);
  const setQuestionStatus = useSessionStore(s => s.setQuestionStatus);
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion);

  const assignedMcqQuestions = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) return [];
    return assessment.questions.filter((q) => q.moduleType === 'MCQ');
  }, [assessment?.questions]);

  const questions = assignedMcqQuestions;
  const questionMetadata = questions[currentIndex];
  const questionId = questionMetadata?.questionId ?? '';

  const { handleNext, nextButtonLabel } = useModuleNavigation(moduleIndex, currentIndex, questions.length);

  const [questionData, setQuestionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore current question from persisted state
  useEffect(() => {
    if (assessment?.currentModuleIndex === moduleIndex) {
      setCurrentIndex(assessment.currentQuestionIndex);
    }
  }, []);

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex);
  }, [currentIndex, moduleIndex, setCurrentQuestion]);

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
          setError(err.message || 'Failed to load question details');
          setLoading(false);
        }
      });
    return () => { isMounted = false; };
  }, [assessment?.sessionId, questionId]);

  // Map to MCQQuestion structure
  const question = React.useMemo(() => {
    const content = questionData?.content || questionMetadata?.content || {};
    const rawOptions = content.options || [];
    const options = rawOptions.map((opt: any, optIdx: number) => {
      if (typeof opt === 'string') return { id: `opt_${optIdx}`, text: opt };
      return { id: opt.id || `opt_${optIdx}`, text: opt.text || opt.label || `Option ${optIdx + 1}` };
    });
    return {
      id: questionId || 'mcq_q1',
      moduleIndex,
      type: 'mcq' as const,
      text: content.prompt || content.text || content.question || content.title || 'Multiple Choice Question',
      options: options.length > 0 ? options : [
        { id: 'opt_0', text: 'Option A' },
        { id: 'opt_1', text: 'Option B' },
        { id: 'opt_2', text: 'Option C' },
        { id: 'opt_3', text: 'Option D' },
      ],
      allowMultiple: Boolean(content.allowMultiple),
      correctIds: [],
    } as MCQQuestion;
  }, [questionData, questionMetadata, questionId, moduleIndex]);

  // Sync DB response to store
  useEffect(() => {
    if (questionData && questionId) {
      const dbResponse = questionData.response?.responsePayload as { selectedOptions?: string[] } | undefined;
      if (dbResponse?.selectedOptions && !assessment?.responses[questionId]) {
        setResponse(questionId, dbResponse.selectedOptions);
        setQuestionStatus(questionId, 'answered');
      }
    }
  }, [questionData, questionId]);

  const currentSelection = (assessment?.responses[questionId] as string[] | undefined) || [];

  function handleOptionSelect(optionId: string) {
    if (!question) return;
    let nextSelection: string[];
    if (question.allowMultiple) {
      nextSelection = currentSelection.includes(optionId)
        ? currentSelection.filter(id => id !== optionId)
        : [...currentSelection, optionId];
    } else {
      nextSelection = [optionId];
    }
    setResponse(questionId, nextSelection);
    setQuestionStatus(questionId, 'answered');
  }

  function handleSkip() {
    if (!questionId) return;
    if (!assessment?.questionStatus[questionId] || assessment?.questionStatus[questionId] === 'unvisited') {
      setQuestionStatus(questionId, 'skipped');
    }
    handleNext(() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1)));
  }

  const paletteItems = questions.map((q, i) => ({
    id: q.questionId,
    label: `Q${i + 1}`,
  }));

  if (loading) {
    return (
      <ModuleShell moduleIndex={moduleIndex} questions={paletteItems} currentQuestionIndex={currentIndex} onNavigate={setCurrentIndex}>
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <span className="text-ink-secondary text-sm animate-pulse">Loading question…</span>
        </div>
      </ModuleShell>
    );
  }

  if (error || !question) {
    return (
      <ModuleShell moduleIndex={moduleIndex} questions={paletteItems} currentQuestionIndex={currentIndex} onNavigate={setCurrentIndex}>
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-2">
          <span className="text-warning text-sm font-semibold">{error || 'No questions available for this module.'}</span>
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
      <div className="flex-1 h-full flex flex-col min-h-0 overflow-hidden bg-canvas dark:bg-[#0B0F19]">
        {/* Scrollable Question Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto py-8 px-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Question Tracker & Multiple Select Badge */}
            <div className="flex items-center justify-between">
              <span className="text-2xs font-bold text-ink-dim dark:text-slate-400 uppercase tracking-wider font-mono">
                QUESTION {currentIndex + 1} OF {questions.length}
              </span>
              {question?.allowMultiple && (
                <span className="text-xs px-3 py-1 rounded-full bg-brand-subtle dark:bg-blue-950/50 border border-brand-border dark:border-blue-800 text-brand dark:text-blue-300 font-bold">
                  Multiple Select
                </span>
              )}
            </div>

            {/* Question Text */}
            <h2 className="text-lg font-bold text-ink dark:text-white leading-relaxed">
              {question?.text}
            </h2>

            {/* Options List */}
            <fieldset aria-label={`Question ${currentIndex + 1} options`}>
              <legend className="sr-only">Options</legend>
              <div className="space-y-3 pt-2">
                {question?.options.map((option, optIdx) => {
                  const isSelected = currentSelection.includes(option.id);
                  const inputType = question.allowMultiple ? 'checkbox' : 'radio';
                  const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
                  const letterPrefix = optionLetters[optIdx] ? `${optionLetters[optIdx]}. ` : '';

                  return (
                    <label
                      key={option.id}
                      className={`flex items-center gap-3.5 p-4 rounded-xl border text-sm transition-all cursor-pointer select-none shadow-xs ${
                        isSelected
                          ? 'border-2 border-brand bg-brand-subtle dark:bg-blue-950/50 text-ink dark:text-white font-bold'
                          : 'border-line dark:border-slate-800 bg-white dark:bg-[#111827] text-ink-secondary dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:text-ink dark:hover:text-white'
                      }`}
                    >
                      <input
                        type={inputType}
                        name={`question-${question.id}`}
                        value={option.id}
                        checked={isSelected}
                        onChange={() => handleOptionSelect(option.id)}
                        className="sr-only"
                      />

                      {/* Custom Radio / Checkbox Indicator */}
                      <span
                        aria-hidden
                        className={`w-5 h-5 flex items-center justify-center border text-xs font-bold transition-all shrink-0 ${
                          question.allowMultiple ? 'rounded-md' : 'rounded-full'
                        } ${
                          isSelected
                            ? 'border-2 border-brand bg-white dark:bg-[#111827]'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111827]'
                        }`}
                      >
                        {isSelected && (
                          <span
                            className={`${
                              question.allowMultiple
                                ? 'w-3 h-3 rounded-xs bg-brand'
                                : 'w-2.5 h-2.5 rounded-full bg-brand'
                            }`}
                          />
                        )}
                      </span>

                      <span className="flex-1 text-sm font-inherit leading-normal">
                        {option.text.startsWith('A.') || option.text.startsWith('B.') || option.text.startsWith('C.') || option.text.startsWith('D.')
                          ? option.text
                          : `${letterPrefix}${option.text}`}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Bottom Actions Bar */}
            <div className="flex items-center justify-between pt-6 border-t border-line dark:border-slate-800 mt-8">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-line dark:border-slate-700 bg-white dark:bg-slate-800 text-ink-secondary dark:text-slate-300 hover:text-ink dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700/80 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  aria-label="Previous question"
                >
                  <ChevronLeft size={14} />
                  <span>Previous</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleNext(() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1)))}
                  className="px-4 py-2 rounded-lg border border-line dark:border-slate-700 bg-white dark:bg-slate-800 text-ink-secondary dark:text-slate-300 hover:text-ink dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700/80 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  aria-label={nextButtonLabel}
                >
                  <span>{nextButtonLabel}</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-ink-muted dark:text-slate-400 hover:text-ink dark:hover:text-white border border-line dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors cursor-pointer"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => handleNext(() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1)))}
                  disabled={currentSelection.length === 0}
                  aria-label="Submit answer for this question"
                  className="px-6 py-2.5 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-brand flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <span>Submit Question</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModuleShell>
  );
}
