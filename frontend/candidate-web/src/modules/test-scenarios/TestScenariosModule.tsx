import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { useModuleNavigation } from '../../hooks/useModuleNavigation'
import apiClient from '../../api/client'
import { FileText, CheckCircle, ChevronLeft, Save, AlertCircle, HelpCircle } from 'lucide-react'

interface TestScenariosModuleProps {
  moduleIndex: number
}

export function TestScenariosModule({ moduleIndex }: TestScenariosModuleProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const assessment = useSessionStore((s) => s.assessment)
  const setResponse = useSessionStore((s) => s.setResponse)
  const setQuestionStatus = useSessionStore((s) => s.setQuestionStatus)
  const setCurrentQuestion = useSessionStore((s) => s.setCurrentQuestion)

  // Filter questions belonging to TEST_SCENARIOS module
  const assignedScenarioQuestions = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) return []
    return assessment.questions.filter((q) => q.moduleType === 'TEST_SCENARIOS')
  }, [assessment?.questions])

  const questions = assignedScenarioQuestions
  const questionMetadata = questions[currentIndex]
  const questionId = questionMetadata?.questionId ?? ''

  const { handleNext, nextButtonLabel } = useModuleNavigation(moduleIndex, currentIndex, questions.length)

  const [questionData, setQuestionData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Restore current question index on mount
  useEffect(() => {
    if (assessment?.currentModuleIndex === moduleIndex) {
      setCurrentIndex(assessment.currentQuestionIndex)
    }
  }, [])

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex)
  }, [currentIndex, moduleIndex, setCurrentQuestion])

  // Fetch question details and saved response from backend API
  useEffect(() => {
    if (!assessment?.sessionId || !questionId) {
      setLoading(false)
      return
    }
    let isMounted = true
    setLoading(true)
    setError(null)
    apiClient
      .get(`/sessions/${assessment.sessionId}/questions/${questionId}`)
      .then((res) => {
        if (isMounted) {
          setQuestionData(res.data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load test scenario question details')
          setLoading(false)
        }
      })
    return () => {
      isMounted = false
    }
  }, [assessment?.sessionId, questionId])

  // Sync DB response query to store & local state
  useEffect(() => {
    if (questionData && questionId) {
      const dbResponse = questionData.response?.responsePayload as { answer?: string; text?: string } | undefined
      const storeResponse = assessment?.responses[questionId] as { answer?: string; text?: string } | string | undefined

      let initialText = ''
      if (typeof storeResponse === 'string') {
        initialText = storeResponse
      } else if (storeResponse?.answer || storeResponse?.text) {
        initialText = storeResponse.answer || storeResponse.text || ''
      } else if (dbResponse?.answer || dbResponse?.text) {
        initialText = dbResponse.answer || dbResponse.text || ''
      }

      setResponseText(initialText)
      if (initialText.trim() && !assessment?.responses[questionId]) {
        setResponse(questionId, { answer: initialText })
        setQuestionStatus(questionId, 'answered')
      }
    }
  }, [questionData, questionId])

  // Auto-save response draft to backend & local store
  const handleSaveResponse = async (textToSave = responseText) => {
    if (!questionId || !assessment?.sessionId) return
    setIsSaving(true)
    setSaveSuccess(false)

    // Local store update
    setResponse(questionId, { answer: textToSave })
    if (textToSave.trim()) {
      setQuestionStatus(questionId, 'answered')
    }

    try {
      await apiClient.post(`/sessions/${assessment.sessionId}/responses`, {
        questionId,
        moduleType: 'TEST_SCENARIOS',
        responsePayload: { answer: textToSave, timestamp: Date.now() },
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err) {
      console.warn('Failed to save scenario response draft to server:', err)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Next step navigation with auto-save
  const onNextQuestion = async () => {
    if (responseText.trim()) {
      await handleSaveResponse(responseText)
    }
    handleNext(() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1)))
  }

  // Question details derived from DB or metadata fallback
  const content = questionData?.content || questionMetadata?.content || {}
  const scenarioPrompt = content.prompt || content.question || content.description || content.text || 'Scenario evaluation question prompt.'
  const category = content.category || questionData?.category || 'Scenario Evaluation'
  const difficulty = (questionData?.difficulty || (questionMetadata as any)?.difficulty || 'MEDIUM').toString().toUpperCase()
  const tier = (content.tier || 'TIER_1').toString().toUpperCase()

  const wordCount = responseText.trim() ? responseText.trim().split(/\s+/).length : 0

  const paletteItems = questions.map((q, i) => ({
    id: q.questionId,
    label: `Q${i + 1}`,
  }))

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={paletteItems}
      currentQuestionIndex={currentIndex}
      onNavigate={setCurrentIndex}
    >
      <div className="max-w-5xl mx-auto space-y-6 pb-12">
        {/* Module Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Module: Test Scenarios
                </span>
                <span className="text-xs font-mono text-slate-500">
                  Question {currentIndex + 1} of {questions.length || 1}
                </span>
              </div>
              <h1 className="text-lg font-bold text-slate-900">Practical &amp; Operational Test Scenarios</h1>
              <p className="text-xs text-slate-500">Analyze the situation below and provide a structured, detailed solution.</p>
            </div>
          </div>

          {/* Question Index Pills */}
          {questions.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {questions.map((q, idx) => {
                const qResp = assessment?.responses[q.questionId] as { answer?: string } | string | undefined
                const hasAnswer = typeof qResp === 'string' ? Boolean(qResp.trim()) : Boolean(qResp?.answer?.trim())
                const isCurrent = idx === currentIndex
                return (
                  <button
                    key={q.questionId || idx}
                    onClick={async () => {
                      if (responseText.trim()) await handleSaveResponse()
                      setCurrentIndex(idx)
                    }}
                    className={`w-7 h-7 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                      isCurrent
                        ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-200'
                        : hasAnswer
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {idx + 1}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium">Loading scenario details...</p>
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center text-rose-700 space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto text-rose-500" />
            <p className="font-semibold text-sm">{error}</p>
            <p className="text-xs text-rose-600">Please verify network connectivity or contact assessment admin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Scenario Problem Statement */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm h-fit">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{category}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded font-mono ${
                      difficulty === 'HARD'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : difficulty === 'EASY'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {difficulty}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-base font-bold text-slate-900 flex items-start gap-2">
                  <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <span>Scenario Description</span>
                </h2>
                <div className="text-sm text-slate-700 leading-relaxed font-sans bg-slate-50/80 p-4 rounded-lg border border-slate-200/60 whitespace-pre-wrap">
                  {scenarioPrompt}
                </div>
              </div>

              {content.instructions && (
                <div className="p-3.5 bg-indigo-50/50 rounded-lg border border-indigo-100 text-xs text-indigo-900 space-y-1">
                  <span className="font-semibold block">Instructions:</span>
                  <p>{content.instructions}</p>
                </div>
              )}
            </div>

            {/* Right Column: Candidate Structured Workspace */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Your Proposed Solution &amp; Action Plan</span>
                    <span className="text-xs font-normal text-slate-400 font-mono">({wordCount} words)</span>
                  </label>
                  {saveSuccess && (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Draft Saved
                    </span>
                  )}
                </div>

                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Outline your analysis, step-by-step resolution, risk mitigation, communication strategy, or technical approach here..."
                  rows={14}
                  className="w-full p-4 text-sm font-sans border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 leading-relaxed bg-slate-50/30"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleSaveResponse()}
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? 'Saving...' : 'Save Draft'}
                </button>

                <div className="flex items-center gap-2">
                  {currentIndex > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (responseText.trim()) await handleSaveResponse()
                        setCurrentIndex((prev) => prev - 1)
                      }}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Previous
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onNextQuestion}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                  >
                    {nextButtonLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModuleShell>
  )
}
