import React, { useEffect, useState } from 'react'
import { PROMPTING_QUESTIONS } from '../../fixtures/questions'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'

interface PromptingModuleProps {
  moduleIndex: number
}

export function PromptingModule({ moduleIndex }: PromptingModuleProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const setResponse = useSessionStore(s => s.setResponse)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)

  const questions = PROMPTING_QUESTIONS
  const question = questions[currentIndex]

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

    // Mock: return scripted response after delay
    await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 800))

    const response = question.suggestedResponse ?? 'Mock AI response: your prompt has been evaluated.'
    setAiResponse(response)
    setLoading(false)
    setSubmitted(true)
    setResponse(question.id, { prompt: promptText, aiResponse: response })
  }

  async function handleRevise() {
    setAiResponse(null)
    setSubmitted(false)
    setLoading(false)
  }

  const paletteItems = questions.map((q, i) => ({ id: q.id, label: `Prompt ${i + 1}` }))

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
          <label htmlFor={`prompt-${question.id}`} className="block text-sm font-medium text-[var(--text-primary)] mb-2">
            Your prompt to the AI assistant
          </label>
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
            <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-3">
              AI Response
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
            onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
            disabled={currentIndex === questions.length - 1}
            className="px-4 py-2 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
          >
            Next →
          </button>
        </div>
      </div>
    </ModuleShell>
  )
}
