import React, { useEffect, useRef, useState } from 'react'
import { CodeEditor } from '../../components/common/CodeEditor'
import type { SQLQuestion } from '../../fixtures/questions'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { useTheme } from '../../theme/ThemeProvider'
import { useModuleNavigation } from '../../hooks/useModuleNavigation'
import apiClient from '../../api/client'
import { services } from '../../services'
import { ProctoringEventService } from '../../proctoring/proctoring-event.service'
import { ChevronLeft } from 'lucide-react'

let sqlPromise: Promise<any> | null = null

async function getSqlDb(schema: string, seed: string) {
  try {
    if (!sqlPromise) {
      sqlPromise = (async () => {
        if (typeof (window as any).initSqlJs !== 'function') {
          return null
        }
        const SQL = await (window as any).initSqlJs({
          locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`,
        })
        return SQL
      })()
    }
    const SQL = await sqlPromise
    if (!SQL) return null
    const db = new SQL.Database()
    if (schema) db.run(schema)
    if (seed) db.run(seed)
    return db
  } catch (err) {
    console.warn('[SQLModule] getSqlDb failed:', err)
    return null
  }
}

function parseTablesFromDdl(schema: string, seed: string) {
  const tables: Array<{ name: string; columns: string[]; rows: any[][] }> = []
  if (!schema) return tables

  const cleanSchema = schema.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const tableMatches = [...cleanSchema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([^;]+)\)/gi)]

  for (const match of tableMatches) {
    const tableName = match[1]
    const body = match[2]
    const columns: string[] = []

    const lines = body.split(',').map((l) => l.trim())
    for (const line of lines) {
      if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|CONSTRAINT|UNIQUE|INDEX|KEY)\b/i.test(line)) continue
      const colNameMatch = line.match(/^["`]?(\w+)["`]?/)
      if (colNameMatch && !['PRIMARY', 'FOREIGN', 'CONSTRAINT', 'UNIQUE', 'CHECK'].includes(colNameMatch[1].toUpperCase())) {
        columns.push(colNameMatch[1])
      }
    }

    const rows: any[][] = []
    if (seed) {
      const cleanSeed = seed.replace(/--.*$/gm, '')
      const seedRegex = new RegExp(`INSERT\\s+INTO\\s+["\`]?${tableName}["\`]?\\s*(?:\\([^)]+\\))?\\s*VALUES\\s*([^;]+);?`, 'gi')
      const seedMatch = seedRegex.exec(cleanSeed)
      if (seedMatch && seedMatch[1]) {
        const valGroups = [...seedMatch[1].matchAll(/\(([^)]+)\)/g)]
        for (const vg of valGroups) {
          const vals = vg[1].split(',').map((v) => {
            const tr = v.trim()
            if (tr.startsWith("'") && tr.endsWith("'")) return tr.slice(1, -1)
            if (!isNaN(Number(tr))) return Number(tr)
            return tr
          })
          rows.push(vals)
        }
      }
    }

    tables.push({ name: tableName, columns, rows })
  }
  return tables
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

  const [schemaTables, setSchemaTables] = useState<Array<{ name: string; columns: string[]; rows: any[][] }>>([])
  const [dialect, setDialect] = useState<'PostgreSQL' | 'MySQL' | 'SQLite'>('PostgreSQL')

  // Resizer States (Horizontal left panel width & Vertical terminal height)
  const [leftPanelWidth, setLeftPanelWidth] = useState(42) // percentage
  const isDraggingHorizontalRef = useRef(false)

  const handleHorizontalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingHorizontalRef.current = true
    const startX = e.clientX
    const startWidth = leftPanelWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingHorizontalRef.current) return
      const containerWidth = window.innerWidth
      const deltaX = moveEvent.clientX - startX
      const deltaPercentage = (deltaX / containerWidth) * 100
      const newWidth = Math.max(20, Math.min(75, startWidth + deltaPercentage))
      setLeftPanelWidth(newWidth)
    }

    const onMouseUp = () => {
      isDraggingHorizontalRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const [resultsHeight, setResultsHeight] = useState(240) // pixels
  const isDraggingVerticalRef = useRef(false)

  const handleVerticalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingVerticalRef.current = true
    const startY = e.clientY
    const startHeight = resultsHeight

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingVerticalRef.current) return
      const deltaY = startY - moveEvent.clientY
      const newHeight = Math.max(100, Math.min(600, startHeight + deltaY))
      setResultsHeight(newHeight)
    }

    const onMouseUp = () => {
      isDraggingVerticalRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

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

  // Map to SQLQuestion structure with instant fallback
  const question = React.useMemo(() => {
    const content = questionData?.content || questionMetadata?.content || {}
    return {
      id: questionId || 'sql_q1',
      moduleIndex,
      type: 'sql' as const,
      text: content.prompt || content.instructions || content.description || content.title || 'Write a SQL query to extract the requested dataset.',
      schema: content.schema || `CREATE TABLE employees (\n  id INT PRIMARY KEY,\n  name VARCHAR(100),\n  department VARCHAR(50),\n  salary INT\n);`,
      seed: content.seedData || content.seed || `INSERT INTO employees VALUES (1, 'Alice', 'Engineering', 95000), (2, 'Bob', 'Marketing', 78000), (3, 'Charlie', 'Engineering', 105000);`,
      hint: content.hint || '',
    } as SQLQuestion
  }, [questionData, questionMetadata, questionId, moduleIndex])

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
        setQuery('-- Write your SQL query here:\nSELECT * FROM employees;')
      }
      setResults(null)
      setEvalResult(null)
      setError(null)
    }
  }, [questionData, questionId])

  // Load SQL tables & extract visual schema
  useEffect(() => {
    if (!question) return
    setDbReady(true)

    // Extract table preview immediately via DDL parsing
    const parsed = parseTablesFromDdl(question.schema, question.seed)
    if (parsed.length > 0) {
      setSchemaTables(parsed)
    }

    // Attempt sql.js in background for local preview if available
    getSqlDb(question.schema, question.seed)
      .then((db) => {
        if (db) {
          dbRef.current = db
          try {
            const tblRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
            if (tblRes.length > 0) {
              const tableNames = tblRes[0].values.map((v: any) => v[0])
              const tablesData = tableNames.map((tbl: string) => {
                const data = db.exec(`SELECT * FROM "${tbl}" LIMIT 5;`)
                return {
                  name: tbl,
                  columns: data[0]?.columns || [],
                  rows: data[0]?.values || [],
                }
              })
              setSchemaTables(tablesData)
            }
          } catch (e) {
            // ignore
          }
        }
      })
      .catch((err) => {
        console.warn('[SQLModule] sql.js background load skipped:', err.message)
      })

    return () => {
      dbRef.current?.close?.()
    }
  }, [currentIndex, question?.id, question?.schema, question?.seed])

  function handleQueryChange(value: string | undefined) {
    const val = value ?? ''
    setQuery(val)
    if (question) {
      setResponse(question.id, val)
    }
  }

  const handlePaste = (data: any) => {
    const targetSessionId = assessment?.sessionId || useSessionStore.getState().session?.id || useSessionStore.getState().assessment?.sessionId
    if (targetSessionId) {
      try {
        ProctoringEventService.getInstance().createEvent({
          sessionId: targetSessionId,
          eventType: 'PASTE' as any,
          severity: 'MEDIUM' as any,
          timestamp: new Date(data.timestamp).toISOString(),
          metadata: {
            charCount: data.length,
            textSnippet: data.text?.slice(0, 100),
            questionId: questionId,
          },
        })
      } catch (err) {
        console.warn('Failed to record SQL paste event:', err)
      }
    }
  }

  async function handleRun() {
    if (!query.trim()) return
    setRunning(true)
    setError(null)
    setResults(null)
    setEvalResult(null)

    const startTime = performance.now()
    let localPreviewSuccess = false

    if (dbRef.current && question) {
      try {
        const result = dbRef.current.exec(query)
        const endTime = performance.now()
        const execTimeMs = Math.max(1, Math.round(endTime - startTime))

        if (!result || result.length === 0) {
          setResults({ columns: ['Status'], rows: [['Query executed successfully. 0 rows affected.']] })
          setEvalResult({ passed: true, executionTime: execTimeMs, status: 'COMPLETED' })
        } else {
          setResults({
            columns: result[0].columns,
            rows: result[0].values,
          })
          setEvalResult({ passed: true, executionTime: execTimeMs, status: 'COMPLETED' })
        }
        localPreviewSuccess = true
      } catch (err: any) {
        // local preview error, fallback to backend
      }
    }

    if (assessment?.sessionId && question) {
      try {
        const res = await apiClient.post('/sql/run', {
          sessionId: assessment.sessionId,
          questionId: question.id,
          query,
        })
        if (res.data) {
          const isError = res.data.status === 'QUERY_ERROR' || res.data.status === 'TIMEOUT' || res.data.status === 'FAILED' || !!res.data.result?.error
          setEvalResult({
            passed: !!res.data.passed,
            executionTime: res.data.executionTime || 4,
            status: res.data.status || 'COMPLETED',
            error: res.data.result?.error,
          })
          if (isError) {
            setError(res.data.result?.error || 'SQL execution failed')
            setResults(null)
          } else {
            const backendColumns = res.data.result?.columns || []
            const backendRows = res.data.result?.rows || []
            const formattedRows = backendRows.map((rowObj: any) => {
              return backendColumns.map((colName: string) => rowObj[colName])
            })
            setResults({
              columns: backendColumns,
              rows: formattedRows,
            })
            setError(null)
          }
        }
      } catch (err: any) {
        const backendMsg = err.response?.data?.message || err.message
        console.error('[SQLModule] Backend run error:', backendMsg)
        if (!localPreviewSuccess) {
          setError(backendMsg)
          setEvalResult({
            passed: false,
            executionTime: 0,
            status: 'QUERY_ERROR',
            error: backendMsg,
          })
        }
      }
    }

    setRunning(false)
  }

  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  async function handleSubmitQuery() {
    if (!question || !query.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      setResponse(question.id, query)
      if (assessment?.sessionId) {
        await apiClient.post('/sql/submit', {
          sessionId: assessment.sessionId,
          questionId: question.id,
          query,
        }).catch(() => {})
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
      <div className="flex flex-col lg:flex-row h-full w-full overflow-hidden bg-[var(--background)] select-none">
        {/* Left Column: Problem Prompt & Visual Schema Tables */}
        <div
          style={{ width: `${leftPanelWidth}%` }}
          className="w-full lg:w-auto h-full border-r border-[var(--border)] flex flex-col overflow-y-auto bg-[var(--surface)] p-6 space-y-6 shrink-0 select-text"
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--accent)] font-bold">
                Query {currentIndex + 1} of {questions.length}
              </span>
              <h2 className="text-base font-bold text-[var(--text-primary)] mt-1">SQL Assessment Problem</h2>
            </div>

            {/* Language/Dialect Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] font-mono">Dialect:</span>
              <select
                value={dialect}
                onChange={(e) => setDialect(e.target.value as any)}
                className="bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--text-primary)] rounded-lg px-2.5 py-1 font-mono focus:outline-none"
              >
                <option value="PostgreSQL">PostgreSQL</option>
                <option value="MySQL">MySQL</option>
                <option value="SQLite">SQLite</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[var(--text-primary)] text-sm leading-relaxed whitespace-pre-wrap">{question.text}</p>
            {question.hint && (
              <div className="p-3 bg-[var(--background)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-secondary)] italic">
                💡 Hint: {question.hint}
              </div>
            )}
          </div>

          {/* Visual Table Renderer (Schema & Seed Data Tables) */}
          <div className="space-y-4 pt-2">
            <div className="text-xs font-mono uppercase tracking-wider text-[var(--text-secondary)] font-bold">
              Database Schema & Table Data Preview
            </div>

            {schemaTables.length > 0 ? (
              schemaTables.map((tbl) => (
                <div key={tbl.name} className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background)] shadow-sm space-y-0">
                  <div className="px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)] font-mono text-xs font-bold text-[var(--text-primary)] flex items-center justify-between">
                    <span>Table: {tbl.name}</span>
                    <span className="text-[10px] text-[var(--text-secondary)] font-normal">{tbl.columns.length} columns</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface)]/50">
                          {tbl.columns.map((col) => (
                            <th key={col} className="px-3 py-2 text-left font-semibold text-[var(--text-secondary)]">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tbl.rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-[var(--border)]/40 hover:bg-[var(--surface)]/40">
                            {row.map((cell: any, ci: number) => (
                              <td key={ci} className="px-3 py-1.5 text-[var(--text-primary)]">
                                {cell === null ? <span className="text-[var(--text-secondary)] italic">NULL</span> : String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            ) : (
              <details className="border border-[var(--border)] rounded-xl p-3 bg-[var(--background)]">
                <summary className="text-xs font-mono text-[var(--text-secondary)] cursor-pointer">View Raw DDL Schema</summary>
                <pre className="mt-2 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto">{question.schema}</pre>
              </details>
            )}
          </div>
        </div>

        {/* Horizontal Resizer handle with grip dots */}
        <div
          onMouseDown={handleHorizontalMouseDown}
          className="hidden lg:flex w-3.5 bg-[var(--surface)] hover:bg-[var(--accent)]/30 border-x border-[var(--border)] cursor-col-resize items-center justify-center transition-colors group select-none shrink-0"
          title="Drag horizontally to adjust panel widths"
        >
          <div className="w-1.5 h-8 flex flex-col justify-between items-center opacity-60 group-hover:opacity-100">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] group-hover:bg-[var(--accent)]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] group-hover:bg-[var(--accent)]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] group-hover:bg-[var(--accent)]" />
          </div>
        </div>

        {/* Right Column: SQL Editor & Output */}
        <div className="flex-1 h-full flex flex-col min-w-0 bg-background select-text overflow-hidden">
          {/* Editor Area */}
          <div className="flex-1 min-h-0 relative">
            <CodeEditor
              language="sql"
              value={query}
              onChange={handleQueryChange}
              onPaste={handlePaste}
              theme={theme === 'dark' ? 'dark' : 'light'}
            />
          </div>

          {/* Results Output Panel & Vertical Resizer */}
          {(results || error) && (
            <>
              {/* Vertical Resizer handle with grip dots */}
              <div
                onMouseDown={handleVerticalMouseDown}
                className="h-3 bg-surface hover:bg-accent/30 border-y border-border cursor-row-resize flex items-center justify-center transition-colors group select-none shrink-0"
                title="Drag vertically to adjust results terminal height"
              >
                <div className="h-1.5 w-8 flex justify-between items-center opacity-60 group-hover:opacity-100">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground group-hover:bg-accent" />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground group-hover:bg-accent" />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground group-hover:bg-accent" />
                </div>
              </div>

              <div
                style={{ height: `${resultsHeight}px` }}
                className="bg-surface overflow-auto shrink-0 max-h-[50vh]"
              >
                {error ? (
                  <div role="alert" className="p-4 text-xs font-mono text-rose-500 bg-rose-500/10">
                    {error}
                  </div>
                ) : results ? (
                  <div>
                    <div className="px-4 py-2 bg-background border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex justify-between">
                      <span>Query Output Results</span>
                      <span>{results.rows.length} rows</span>
                    </div>
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-border bg-surface">
                          {results.columns.map(col => (
                            <th key={col} className="text-left px-3 py-2 text-muted-foreground font-medium">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-border/40 hover:bg-background/50">
                            {row.map((cell: any, ci: number) => (
                              <td key={ci} className="px-3 py-1.5 text-foreground">
                                {cell === null ? <span className="text-muted-foreground italic">NULL</span> : String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </>
          )}

          {/* Standardized Pinned Bottom Navigation Bar */}
          <footer className="h-14 border-t border-border bg-surface px-6 flex items-center justify-between shrink-0 z-10 shadow-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={handleRun}
                disabled={running || !query.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-xs"
              >
                {running ? 'Running…' : '▶ Run Query'}
              </button>

              <button
                onClick={handleSubmitQuery}
                disabled={submitting || !query.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-xs"
              >
                {submitting ? 'Saving…' : submitSuccess ? '✓ Answer Saved' : 'Save Answer'}
              </button>

              {evalResult && (
                <div className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-medium flex items-center gap-1.5 ${
                  evalResult.passed 
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' 
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                }`}>
                  <span>{evalResult.passed ? '✓ PASSED' : '✕ QUERY ERROR'}</span>
                  <span className="text-[10px] opacity-75">({evalResult.executionTime}ms)</span>
                </div>
              )}
            </div>

            <span className="text-xs font-mono font-medium text-muted-foreground hidden sm:inline">
              SQL Task {currentIndex + 1} of {questions.length}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="Previous question"
              >
                <ChevronLeft size={14} />
                <span>Previous</span>
              </button>
              <button
                onClick={() => handleNext(() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1)))}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
              >
                <span>{nextButtonLabel}</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </ModuleShell>
  )
}
