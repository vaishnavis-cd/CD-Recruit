import React, { useEffect, useRef, useState } from 'react'
import { CodeEditor } from '../../components/common/CodeEditor'
import type { SQLQuestion } from '../../fixtures/questions'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { useTheme } from '../../theme/ThemeProvider'
import { useModuleNavigation } from '../../hooks/useModuleNavigation'
import apiClient from '../../api/client'
import { services } from '../../services'

let sqlPromise: Promise<any> | null = null

async function getSqlDb(schema: string, seed: string) {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const SQL = await (window as any).initSqlJs({
        locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`,
      })
      return SQL
    })()
  }
  const SQL = await sqlPromise
  const db = new SQL.Database()
  db.run(schema)
  db.run(seed)
  return db
}

interface QueryResult {
  columns: string[]
  rows: any[][]
}

interface EvaluationResult {
  passed: boolean
  executionTime: number
  status: string
  error?: string
}

interface SQLModuleProps {
  moduleIndex: number
}

export function SQLModule({ moduleIndex }: SQLModuleProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const setResponse = useSessionStore(s => s.setResponse)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)
  const { theme } = useTheme()

  const assignedSqlQuestions = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) return []
    return assessment.questions.filter((q) => q.moduleType === 'SQL')
  }, [assessment?.questions])

  const questions = assignedSqlQuestions
  const questionMetadata = questions[currentIndex]
  const questionId = questionMetadata?.questionId ?? ''

  const { handleNext, nextButtonLabel } = useModuleNavigation(moduleIndex, currentIndex, questions.length)

  const [questionData, setQuestionData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<QueryResult | null>(null)
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null)
  const [running, setRunning] = useState(false)
  const [dbReady, setDbReady] = useState(false)
  const dbRef = useRef<any>(null)

  // Restore current question index on mount
  useEffect(() => {
    if (assessment?.currentModuleIndex === moduleIndex) {
      setCurrentIndex(assessment.currentQuestionIndex)
    }
  }, [])

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex)
  }, [currentIndex])

  // Fetch question details and responses from backend
  useEffect(() => {
    if (!assessment?.sessionId || !questionId) {
      setLoading(false)
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
          setError(err.message || 'Failed to load SQL question details')
          setLoading(false)
        }
      })
    return () => { isMounted = false }
  }, [assessment?.sessionId, questionId])

  // Map to SQLQuestion structure
  const question = React.useMemo(() => {
    if (!questionData) return null
    const content = questionData.content || {}
    return {
      id: questionId,
      moduleIndex,
      type: 'sql' as const,
      text: content.prompt || content.instructions || content.description || content.title || 'SQL Challenge',
      schema: content.schema || `CREATE TABLE employees (id INT, name TEXT, salary INT);`,
      seed: content.seedData || content.seed || `INSERT INTO employees VALUES (1, 'Alice', 90000), (2, 'Bob', 80000);`,
      hint: content.hint || '',
    } as SQLQuestion
  }, [questionData, questionId, moduleIndex])

  // Sync DB response query to store & local state
  useEffect(() => {
    if (questionData && questionId) {
      const dbResponse = questionData.response?.responsePayload as { query?: string } | undefined
      const savedQuery = (assessment?.responses[questionId] as string) ?? dbResponse?.query
      if (typeof savedQuery === 'string') {
        setQuery(savedQuery)
        if (!assessment?.responses[questionId]) {
          setResponse(questionId, savedQuery)
        }
      } else {
        setQuery('')
      }
      setResults(null)
      setEvalResult(null)
      setError(null)
    }
  }, [questionData, questionId])

  // Load sql.js DB
  useEffect(() => {
    if (!question) return
    setDbReady(false)
    getSqlDb(question.schema, question.seed)
      .then(db => {
        dbRef.current = db
        setDbReady(true)
      })
      .catch(err => {
        setError(`Failed to initialize database: ${err.message}`)
      })

    return () => {
      dbRef.current?.close?.()
    }
  }, [currentIndex, question?.id])

  function handleQueryChange(value: string | undefined) {
    const val = value ?? ''
    setQuery(val)
    if (question) {
      setResponse(question.id, val)
    }
  }

  async function handleRun() {
    if (!query.trim()) return
    setRunning(true)
    setError(null)
    setResults(null)
    setEvalResult(null)

    // 1. Run local preview with a fresh, disposable sql.js WASM DB instance (stateless)
    if (question) {
      try {
        const freshDb = await getSqlDb(question.schema, question.seed)
        const result = freshDb.exec(query)
        if (!result || result.length === 0) {
          setResults({ columns: ['Result'], rows: [['Query executed, no rows returned']] })
        } else {
          setResults({
            columns: result[0].columns,
            rows: result[0].values,
          })
        }
        freshDb.close?.()
      } catch (err: any) {
        setError(err.message ?? 'SQL syntax or execution error in local preview')
      }
    }

    // 2. Execute server-side PostgreSQL evaluation
    if (assessment?.sessionId && question) {
      try {
        const res = await apiClient.post('/sql/run', {
          sessionId: assessment.sessionId,
          questionId: question.id,
          query,
        })

        if (res.data) {
          setEvalResult({
            passed: !!res.data.passed,
            executionTime: res.data.executionTime || 0,
            status: res.data.status || 'COMPLETED',
            error: res.data.result?.error,
          })
          if (res.data.result?.error) {
            setError(res.data.result.error)
          }
        }
      } catch (err: any) {
        const backendMsg = err.response?.data?.message || err.message
        console.error('[SQLModule] Backend run error:', backendMsg)
      }
    }

    setRunning(false)
  }

  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  async function handleSubmitQuery() {
    if (!question || !query.trim() || !assessment?.sessionId) return
    setSubmitting(true)
    setError(null)
    try {
      setResponse(question.id, query)
      const res = await apiClient.post('/sql/submit', {
        sessionId: assessment.sessionId,
        questionId: question.id,
        query,
      })

      if (res.data) {
        setEvalResult({
          passed: !!res.data.passed,
          executionTime: res.data.executionTime || 0,
          status: res.data.status || 'COMPLETED',
        })
      }
      setSubmitSuccess(true)
      setTimeout(() => setSubmitSuccess(false), 3000)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to submit SQL answer')
    } finally {
      setSubmitting(false)
    }
  }

  const paletteItems = questions.map((q, i) => ({ id: q.questionId, label: `Query ${i + 1}` }))

  if (!question) return null

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={paletteItems}
      currentQuestionIndex={currentIndex}
      onNavigate={setCurrentIndex}
    >
      <div className="flex flex-col h-full">
        {/* Question text */}
        <div className="px-6 py-5 border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">
            Query {currentIndex + 1} of {questions.length}
          </div>
          <p className="text-[var(--text-primary)] text-sm leading-relaxed">{question.text}</p>
          {question.hint && (
            <p className="mt-2 text-xs text-[var(--text-secondary)] italic">Hint: {question.hint}</p>
          )}
        </div>

        {/* Schema reference */}
        <details className="px-6 py-2 border-b border-[var(--border)] bg-[var(--bg)]">
          <summary className="text-xs text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] py-1 font-medium">
            View schema reference
          </summary>
          <pre className="mt-2 text-xs font-mono text-[var(--text-secondary)] bg-[var(--surface)] p-3 rounded overflow-x-auto">
            {question.schema}
          </pre>
        </details>

        {/* Editor */}
        <div className="flex-1 min-h-0" style={{ minHeight: '200px' }}>
          {!dbReady ? (
            <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
              Loading SQL engine…
            </div>
          ) : (
            <CodeEditor
              language="sql"
              value={query}
              onChange={handleQueryChange}
              theme={theme === 'dark' ? 'dark' : 'light'}
            />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--surface)]">
          <button
            onClick={handleRun}
            disabled={!dbReady || running || !query.trim()}
            aria-label="Run SQL query against visible test data"
            className="px-4 py-2 rounded text-sm font-medium bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] cursor-pointer"
          >
            {running ? 'Running…' : '▶ Run Query'}
          </button>

          <button
            onClick={handleSubmitQuery}
            disabled={!dbReady || submitting || !query.trim()}
            aria-label="Submit SQL query answer"
            className="px-4 py-2 rounded text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 cursor-pointer"
          >
            {submitting ? 'Submitting…' : submitSuccess ? '✓ Answer Saved' : 'Submit Answer'}
          </button>

          {/* Official Evaluation Status Badge */}
          {evalResult && (
            <div className={`px-3 py-1.5 rounded text-xs font-mono font-medium flex items-center gap-1.5 ${
              evalResult.passed 
                ? 'bg-green-500/10 text-green-600 border border-green-500/30' 
                : 'bg-red-500/10 text-red-600 border border-red-500/30'
            }`}>
              <span>{evalResult.passed ? '✓ Official Evaluation: PASSED' : '✗ Official Evaluation: FAILED'}</span>
              <span className="text-[10px] opacity-75">({evalResult.executionTime}ms)</span>
            </div>
          )}

          <div className="flex-1" />
          <button
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed border border-[var(--border)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            ← Prev
          </button>
          <button
            onClick={() => handleNext(() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1)))}
            className="px-3 py-1.5 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 cursor-pointer"
          >
            {nextButtonLabel}
          </button>
        </div>

        {/* Results */}
        {(results || error) && (
          <div className="border-t border-[var(--border)] bg-[var(--surface)] max-h-48 overflow-auto">
            {error ? (
              <div
                role="alert"
                className="px-4 py-3 text-sm font-mono text-[var(--critical)]"
              >
                {error}
              </div>
            ) : results ? (
              <div>
                <div className="px-3 py-1.5 bg-[var(--bg)] border-b border-[var(--border)] text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
                  Local Preview — SQLite (not graded)
                </div>
                <table className="w-full text-xs font-mono" aria-label="Query results">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      {results.columns.map(col => (
                        <th key={col} scope="col" className="text-left px-3 py-2 text-[var(--text-secondary)] font-medium">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg)]/50">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-1.5 text-[var(--text-primary)]">
                            {cell === null ? <span className="text-[var(--text-secondary)] italic">NULL</span> : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {results.rows.length === 0 && (
                      <tr>
                        <td colSpan={results.columns.length} className="px-3 py-3 text-center text-[var(--text-secondary)]">
                          No rows returned
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <caption className="text-xs text-[var(--text-secondary)] py-1 caption-bottom">
                    {results.rows.length} row{results.rows.length !== 1 ? 's' : ''} returned
                  </caption>
                </table>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </ModuleShell>
  )
}
