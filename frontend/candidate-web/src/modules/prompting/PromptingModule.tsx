import React, { useEffect, useState } from 'react'
import { PROMPTING_QUESTIONS } from '../../fixtures/questions'
import type { PromptingQuestion } from '../../fixtures/questions'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { services } from '../../services'
import { useModuleNavigation } from '../../hooks/useModuleNavigation'

interface PromptingModuleProps {
  moduleIndex: number
}

export function PromptingModule({ moduleIndex }: PromptingModuleProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const setResponse = useSessionStore(s => s.setResponse)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)

  const assignedPromptingQuestions = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) return PROMPTING_QUESTIONS
    const filtered = assessment.questions.filter((q) => q.moduleType === 'AI_PROMPTING')
    if (filtered.length === 0) return []
    return filtered.map((q, i) => {
      const content = q.content || {}
      return {
        id: q.questionId,
        moduleIndex,
        type: 'prompting' as const,
        text: content.prompt || content.scenario || content.instructions || content.description || content.title || `AI Prompting Task ${i + 1}`,
        systemContext: content.context || content.systemContext || 'You are an AI assistant helping with an engineering evaluation.',
        suggestedResponse: content.idealResponseSummary || '',
      } as PromptingQuestion
    })
  }, [assessment?.questions, moduleIndex])

  const questions = assignedPromptingQuestions
  const question = questions[currentIndex]

  const { handleNext, nextButtonLabel } = useModuleNavigation(moduleIndex, currentIndex, questions.length)

  const [promptText, setPromptText] = useState('')
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Restore
  useEffect(() => {
    const saved = assessment?.responses[question?.id] as { prompt?: string } | undefined
    setPromptText(saved?.prompt ?? '')
    setAiResponse(null)
    setSubmitted(false)
  }, [currentIndex])

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex)
  }, [currentIndex])

  function handlePromptChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setPromptText(e.target.value)
    setResponse(question.id, { prompt: e.target.value, aiResponse })
  }

  async function handleSubmitPrompt() {
    if (!promptText.trim()) return
    setLoading(true)
    setAiResponse(null)

    try {
      const sessionId = assessment?.sessionId || ''
      const aiRes = await services.sessionApi.runAiPrompt({
        sessionId,
        questionId: question.id,
        prompt: promptText
      })
      setAiResponse(aiRes)
      setSubmitted(true)
      setResponse(question.id, { prompt: promptText, aiResponse: aiRes })
    } catch (err) {
      console.error('Failed to run AI prompt', err)
      const fallback = question.suggestedResponse ?? 'Mock AI response: your prompt has been evaluated.'
      setAiResponse(fallback)
      setSubmitted(true)
      setResponse(question.id, { prompt: promptText, aiResponse: fallback })
    } finally {
      setLoading(false)
    }
  }

  async function handleRevise() {
    setAiResponse(null)
    setSubmitted(false)
    setLoading(false)
  }

  const paletteItems = questions.map((q, i) => ({ id: q.id, label: `Prompt ${i + 1}` }))

  // Check client-side verbatim similarity for real-time prompt guidance
  const isVerbatimPrompt = React.useMemo(() => {
    if (!promptText.trim() || !question?.text) return false
    const cleanP = promptText.toLowerCase().replace(/[^\w\s]/g, "").trim()
    const cleanT = question.text.toLowerCase().replace(/[^\w\s]/g, "").trim()
    if (!cleanP || !cleanT) return false
    if (cleanP === cleanT || cleanT.includes(cleanP) || cleanP.includes(cleanT)) {
      if (Math.min(cleanP.length, cleanT.length) / Math.max(cleanP.length, cleanT.length) > 0.5) return true
    }
    const pTokens = new Set(cleanP.split(/\s+/).filter(t => t.length > 2))
    const tTokens = new Set(cleanT.split(/\s+/).filter(t => t.length > 2))
    if (tTokens.size === 0) return false
    let intersection = 0
    pTokens.forEach((t: string) => { if (tTokens.has(t)) intersection++ })
    return (intersection / tTokens.size) >= 0.65
  }, [promptText, question?.text])

  if (!question) return null

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={paletteItems}
      currentQuestionIndex={currentIndex}
      onNavigate={setCurrentIndex}
    >
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-3">
          Prompt {currentIndex + 1} of {questions.length}
        </div>

        {/* System context */}
        <div className="mb-4 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs">
          <span className="font-medium text-[var(--text-secondary)]">Context: </span>
          <span className="text-[var(--text-secondary)]">{question.systemContext}</span>
        </div>

        {/* Task */}
        <div className="mb-6 p-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{question.text}</p>
        </div>

        {/* Prompt input */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor={`prompt-${question.id}`} className="block text-sm font-medium text-[var(--text-primary)]">
              Your prompt to the AI assistant
            </label>
            {isVerbatimPrompt && (
              <span className="text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                Direct Copy Detected — Add Persona & Constraints
              </span>
            )}
          </div>
          <textarea
            id={`prompt-${question.id}`}
            value={promptText}
            onChange={handlePromptChange}
            disabled={loading}
            placeholder="Write your prompt here…"
            rows={6}
            aria-label="Enter your prompt to the AI assistant"
            className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm font-mono placeholder:text-[var(--text-secondary)] placeholder:font-sans resize-y focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] disabled:opacity-60 transition-colors"
          />
          {isVerbatimPrompt && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              💡 <strong>Prompt Tip:</strong> Directly repeating the question will cause the AI assistant to ask for clarifying instructions rather than solving the task for you. Provide explicit persona framing, output formatting, or constraints.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={handleSubmitPrompt}
            disabled={loading || !promptText.trim()}
            aria-label="Submit prompt to AI assistant"
            className="px-4 py-2 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
          >
            {loading ? 'Getting response…' : submitted ? 'Resubmit' : 'Submit Prompt'}
          </button>
          {submitted && (
            <button
              onClick={handleRevise}
              className="px-4 py-2 rounded text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              Revise prompt
            </button>
          )}
        </div>

        {/* AI response area */}
        {loading && (
          <div
            aria-live="polite"
            aria-label="AI response loading"
            className="p-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              Generating response…
            </div>
          </div>
        )}

        {aiResponse && !loading && (
          <div
            role="region"
            aria-label="AI assistant response"
            aria-live="polite"
            className="p-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                AI Response
              </div>
              {isVerbatimPrompt && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Socratic Mode Active
                </span>
              )}
            </div>
            <div className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-mono">
              {aiResponse}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--border)]">
          <button
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="px-4 py-2 rounded text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            ← Previous
          </button>
          <button
            onClick={() => handleNext(() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1)))}
            className="px-4 py-2 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 cursor-pointer shadow-sm"
          >
            {nextButtonLabel}
          </button>
        </div>
      </div>
    </ModuleShell>
  )
}
