import React, { useEffect, useState } from 'react'
import { CODING_QUESTIONS } from '../../fixtures/questions'
import { useSessionStore, QuestionStatus } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { CodingWorkspace } from '../../components/coding/CodingWorkspace'
import apiClient from '../../api/client'
import { Loader2, AlertCircle } from 'lucide-react'

/** Simple UUID v4 check — NestJS ParseUUIDPipe rejects anything else with 400. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

import { useModuleNavigation } from '../../hooks/useModuleNavigation'

interface CodingModuleProps {
  moduleIndex: number
}

export function CodingModule({ moduleIndex }: CodingModuleProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const setQuestionStatus = useSessionStore(s => s.setQuestionStatus)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)

  // Only use real DB UUIDs — fixture IDs like 'code-1' are rejected by ParseUUIDPipe
  const codingQuestions = assessment?.questions?.filter(q => q.moduleType === 'CODING') ?? []
  const questionId = codingQuestions[currentIndex]?.questionId ?? ''
  const isValidUUID = UUID_RE.test(questionId)

  const { handleNext: triggerNext } = useModuleNavigation(moduleIndex, currentIndex, codingQuestions.length || 1)

  const [questionData, setQuestionData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Restore current question from persisted state on mount
  useEffect(() => {
    if (assessment?.currentModuleIndex === moduleIndex) {
      setCurrentIndex(assessment.currentQuestionIndex)
    }
  }, [])

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex)
  }, [currentIndex, moduleIndex, setCurrentQuestion])

  // Fetch question details from backend
  useEffect(() => {
    // Guard: need a session and a real UUID questionId from the DB.
    // If assessment.questions is missing (stale localStorage before Phase 2),
    // isValidUUID will be false and we surface a clear message instead of
    // sending 'code-1' to ParseUUIDPipe which returns 400.
    if (!assessment?.sessionId) return

    if (!isValidUUID) {
      // questions not yet loaded from server or stale state — not a fetch error
      setLoading(false)
      setError(
        codingQuestions.length === 0
          ? 'No coding questions found for this session. Please refresh or contact support.'
          : `Invalid question ID (${questionId || 'empty'}). Please refresh the page.`
      )
      return
    }

    let isMounted = true
    setLoading(true)
    setError(null)

    apiClient.get(`/sessions/${assessment.sessionId}/questions/${questionId}`)
      .then(res => {
        if (isMounted) {
          setQuestionData(res.data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (isMounted) {
          const status = err?.response?.status
          const msg = err?.response?.data?.message ?? err?.message ?? 'Unknown error'
          console.error(`[CodingModule] Failed to fetch question ${questionId} (HTTP ${status}):`, msg, err)
          setError(`Failed to load coding challenge (${status ?? 'network error'}): ${msg}`)
          setLoading(false)
        }
      })

    return () => { isMounted = false }
  }, [assessment?.sessionId, questionId, isValidUUID])

  const paletteItems = (codingQuestions.length > 0 ? codingQuestions : CODING_QUESTIONS).map((q, i) => ({
    id: 'questionId' in q ? q.questionId : (q as any).id,
    label: `Challenge ${i + 1}`,
  }))

  function handleUpdateStatus(status: QuestionStatus) {
    if (questionId) {
      setQuestionStatus(questionId, status)
    }
  }

  function handleNext() {
    if (currentIndex < CODING_QUESTIONS.length - 1) {
      setCurrentIndex(i => i + 1)
    }
  }

  if (loading) {
    return (
      <ModuleShell
        moduleIndex={moduleIndex}
        questions={paletteItems}
        currentQuestionIndex={currentIndex}
        onNavigate={setCurrentIndex}
      >
        <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <span className="text-sm text-text-secondary font-medium">Loading coding challenge...</span>
        </div>
      </ModuleShell>
    )
  }

  if (error || !questionData) {
    return (
      <ModuleShell
        moduleIndex={moduleIndex}
        questions={paletteItems}
        currentQuestionIndex={currentIndex}
        onNavigate={setCurrentIndex}
      >
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-critical" />
          <span className="text-sm font-semibold text-text-primary">{error || "Failed to load question"}</span>
        </div>
      </ModuleShell>
    )
  }

  // Map backend question response to shape expected by CodingWorkspace
  const workspaceQuestion = {
    id: questionId,
    title: CODING_QUESTIONS[currentIndex]?.title || "Coding Challenge",
    prompt: questionData.content?.prompt || "Write your solution",
    content: {
      starterCode: questionData.content?.starterCode,
      // Map visibleTestCases to testCases in workspace
      testCases: questionData.content?.visibleTestCases || questionData.content?.testCases || [],
      constraints: questionData.content?.constraints || [],
      difficulty: questionData.content?.difficulty || "medium",
    },
    response: questionData.response || null,
  }

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={paletteItems}
      currentQuestionIndex={currentIndex}
      onNavigate={setCurrentIndex}
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 h-full overflow-hidden">
        {/* Left Panel: Description */}
        <div className="lg:col-span-2 border-r border-border-token bg-surface overflow-y-auto flex flex-col h-full">
          <div className="px-6 py-5 border-b border-border-token">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Challenge {currentIndex + 1} of {CODING_QUESTIONS.length}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent/15 text-accent uppercase tracking-wider">
                {workspaceQuestion.content.difficulty}
              </span>
            </div>
            <h2 className="text-lg font-bold text-text-primary mb-3">
              {workspaceQuestion.title}
            </h2>
            <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap font-sans">
              {workspaceQuestion.prompt}
            </div>

            {workspaceQuestion.content.constraints.length > 0 && (
              <div className="mt-5">
                <h4 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-2">Constraints</h4>
                <ul className="list-disc pl-4 space-y-1 text-xs text-text-secondary font-mono">
                  {workspaceQuestion.content.constraints.map((c: string, idx: number) => (
                    <li key={idx}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Monaco Workspace */}
        <div className="lg:col-span-3 h-full flex flex-col overflow-hidden">
          <CodingWorkspace
            question={workspaceQuestion}
            onNext={handleNext}
            updateStatus={handleUpdateStatus}
          />
        </div>
      </div>
    </ModuleShell>
  )
}
