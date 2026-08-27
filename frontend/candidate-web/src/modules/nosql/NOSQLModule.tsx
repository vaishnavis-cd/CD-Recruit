import React, { useEffect, useRef, useState } from 'react'
import { CodeEditor } from '../../components/common/CodeEditor'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { useTheme } from '../../theme/ThemeProvider'
import { useModuleNavigation } from '../../hooks/useModuleNavigation'
import apiClient from '../../api/client'
import { ChevronLeft } from 'lucide-react'

interface QueryResult {
  result: any;
  executionTimeMs: number;
}

interface EvaluationResult {
  passed: boolean;
  status: string;
  error?: string;
  executionTime?: number;
}

interface NOSQLModuleProps {
  moduleIndex: number
}

/**
 * Client-side mongosh syntax parser converting `db.col.op(...)` to MongoOperationObject JSON.
 */
export function parseMongoshQuery(query: string): { collection: string; operator: string; payload: any } {
  const cleanQuery = query.trim();
  const regex = /^db\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s*\(([\s\S]*)\)\s*;?$/;
  const match = cleanQuery.match(regex);
  if (!match) {
    throw new Error("Syntax Error: Query must match 'db.collection.operation(...)' pattern (e.g. db.employees.find({}))");
  }
  const [, collection, operator, argsStr] = match;

  const validOperators = [
    "find",
    "aggregate",
    "insertOne",
    "insertMany",
    "updateOne",
    "updateMany",
    "deleteOne",
    "deleteMany",
    "countDocuments",
  ];
  if (!validOperators.includes(operator)) {
    throw new Error(`Unsupported operator: '${operator}'. Supported operators are: ${validOperators.join(', ')}`);
  }

  let args: any[] = [];
  if (argsStr.trim()) {
    try {
      const ObjectIdStub = (id: string) => ({ $oid: id });
      const ISODateStub = (d: string) => ({ $date: d });
      const DateStub = (d: string) => ({ $date: d });
      
      const evaluator = new Function(
        "ObjectId",
        "ISODate",
        "Date",
        `return [${argsStr}];`
      );
      args = evaluator(ObjectIdStub, ISODateStub, DateStub);
    } catch (err: any) {
      throw new Error(`Failed to parse operation arguments: ${err.message}`);
    }
  }

  let payload: any = {};
  switch (operator) {
    case "find":
      payload = {
        filter: args[0] || {},
        projection: args[1] || undefined,
      };
      break;
    case "aggregate":
      payload = {
        pipeline: args[0] || [],
      };
      break;
    case "insertOne":
      payload = {
        document: args[0] || {},
      };
      break;
    case "insertMany":
      payload = {
        documents: args[0] || [],
      };
      break;
    case "updateOne":
    case "updateMany":
      payload = {
        filter: args[0] || {},
        update: args[1] || {},
        options: args[2] || undefined,
      };
      break;
    case "deleteOne":
    case "deleteMany":
    case "countDocuments":
      payload = {
        filter: args[0] || {},
      };
      break;
  }

  return {
    collection,
    operator,
    payload,
  };
}

export function NOSQLModule({ moduleIndex }: NOSQLModuleProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const setResponse = useSessionStore(s => s.setResponse)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)
  const { theme } = useTheme()

  const assignedQuestions = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) return []
    return assessment.questions.filter((q) => q.moduleType === 'NOSQL')
  }, [assessment?.questions])

  const questions = assignedQuestions
  const questionMetadata = questions[currentIndex]
  const questionId = questionMetadata?.questionId ?? ''

  const { handleNext, nextButtonLabel } = useModuleNavigation(moduleIndex, currentIndex, questions.length)

  const [questionData, setQuestionData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editorQuery, setEditorQuery] = useState('')
  const [output, setOutput] = useState<any>(null)
  const [executionTime, setExecutionTime] = useState<number | null>(null)
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null)
  const [running, setRunning] = useState(false)
  const [dbState, setDbState] = useState<Record<string, any[]>>({})

  // Resizer Panel widths
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

  // Restore current index on mount
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
          setError(err.message || 'Failed to load NoSQL question details')
          setLoading(false)
        }
      })
    return () => { isMounted = false }
  }, [assessment?.sessionId, questionId])

  const question = React.useMemo(() => {
    const content = questionData?.content || questionMetadata?.content || {}
    return {
      id: questionId || 'nosql_q1',
      moduleIndex,
      type: 'nosql' as const,
      title: content.title || 'NoSQL Querying Challenge',
      text: content.prompt || content.instructions || content.description || 'Write a MongoDB query to fetch or modify the requested database records.',
      collections: content.collections || [],
      hint: content.hint || '',
    }
  }, [questionData, questionMetadata, questionId, moduleIndex])

  // Sync DB response query to store & local state, and trigger start endpoint
  useEffect(() => {
    if (questionData && questionId && assessment?.sessionId) {
      const dbResponse = questionData.response?.responsePayload as { operation?: any } | undefined
      const savedResponse = (assessment?.responses[questionId] as string)
      
      if (typeof savedResponse === 'string') {
        setEditorQuery(savedResponse)
      } else if (dbResponse?.operation) {
        // Construct string representation if saved as structured operation
        const op = dbResponse.operation;
        let queryStr = `db.${op.collection}.${op.operator}(`;
        if (op.operator === 'find') {
          queryStr += `${JSON.stringify(op.payload.filter || {})}`;
          if (op.payload.projection) queryStr += `, ${JSON.stringify(op.payload.projection)}`;
        } else if (op.operator === 'aggregate') {
          queryStr += `${JSON.stringify(op.payload.pipeline || [])}`;
        } else if (op.operator === 'insertOne') {
          queryStr += `${JSON.stringify(op.payload.document || {})}`;
        } else if (op.operator === 'insertMany') {
          queryStr += `${JSON.stringify(op.payload.documents || [])}`;
        } else if (op.operator === 'updateOne' || op.operator === 'updateMany') {
          queryStr += `${JSON.stringify(op.payload.filter || {})}, ${JSON.stringify(op.payload.update || {})}`;
          if (op.payload.options) queryStr += `, ${JSON.stringify(op.payload.options)}`;
        } else if (op.operator === 'deleteOne' || op.operator === 'deleteMany' || op.operator === 'countDocuments') {
          queryStr += `${JSON.stringify(op.payload.filter || {})}`;
        }
        queryStr += `)`;
        setEditorQuery(queryStr)
        setResponse(questionId, queryStr)
      } else {
        const defaultCol = question.collections[0] || 'records'
        setEditorQuery(`db.${defaultCol}.find({});`)
      }

      setOutput(null)
      setExecutionTime(null)
      setEvalResult(null)
      setError(null)

      // Start the sandbox session
      apiClient.post('/nosql/start', {
        sessionId: assessment.sessionId,
        questionId: question.id,
      })
      .then((res) => {
        if (res.data?.seededState) {
          setDbState(res.data.seededState)
        }
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to initialize sandbox database.')
      })
    }
  }, [questionData, questionId])

  function handleQueryChange(value: string | undefined) {
    const val = value ?? ''
    setEditorQuery(val)
    if (question) {
      setResponse(question.id, val)
    }
  }

  async function handleRun() {
    if (!editorQuery.trim()) return
    setRunning(true)
    setError(null)
    setOutput(null)
    setExecutionTime(null)
    setEvalResult(null)

    // 1. Parse client-side syntax
    let parsedOp: any;
    try {
      parsedOp = parseMongoshQuery(editorQuery);
    } catch (err: any) {
      setError(err.message);
      setRunning(false);
      return;
    }

    // 2. Execute on backend
    if (assessment?.sessionId && question) {
      try {
        const res = await apiClient.post('/nosql/run', {
          sessionId: assessment.sessionId,
          questionId: question.id,
          operation: parsedOp,
        })
        if (res.data) {
          setOutput(res.data.result)
          setExecutionTime(res.data.executionTimeMs)
          setEvalResult({
            passed: !!res.data.passed,
            status: res.data.passed ? 'PASSED' : 'FAILED',
            executionTime: res.data.executionTimeMs || 0,
          })
        }
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Execution failed')
      }
    }
    setRunning(false)
  }

  async function handleReset() {
    if (!assessment?.sessionId || !question) return
    setError(null)
    setOutput(null)
    setExecutionTime(null)
    setEvalResult(null)
    try {
      const res = await apiClient.post('/nosql/reset', {
        sessionId: assessment.sessionId,
        questionId: question.id,
      })
      if (res.data) {
        // Start again to reload seeded state preview
        const startRes = await apiClient.post('/nosql/start', {
          sessionId: assessment.sessionId,
          questionId: question.id,
        })
        if (startRes.data?.seededState) {
          setDbState(startRes.data.seededState)
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to reset database state.')
    }
  }

  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  async function handleSubmitQuery() {
    if (!question || !editorQuery.trim()) return
    setSubmitting(true)
    setError(null)
    setEvalResult(null)

    let parsedOp: any;
    try {
      parsedOp = parseMongoshQuery(editorQuery);
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
      return;
    }

    try {
      setResponse(question.id, editorQuery)
      if (assessment?.sessionId) {
        const res = await apiClient.post('/nosql/submit', {
          sessionId: assessment.sessionId,
          questionId: question.id,
          operation: parsedOp,
          query: editorQuery,
        })
        setEvalResult({
          passed: res.data?.passed || false,
          status: res.data?.passed ? 'PASSED' : 'FAILED',
        })
        setSubmitSuccess(true)
        setTimeout(() => setSubmitSuccess(false), 3000)
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to submit answer')
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
        {/* Left Column: Prompt & Database Seed Data Preview */}
        <div
          style={{ width: `${leftPanelWidth}%` }}
          className="w-full lg:w-auto h-full border-r border-[var(--border)] flex flex-col overflow-y-auto bg-[var(--surface)] p-6 space-y-6 shrink-0 select-text"
        >
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--accent)] font-bold">
              Query {currentIndex + 1} of {questions.length}
            </span>
            <h2 className="text-base font-bold text-[var(--text-primary)] mt-1">{question.title}</h2>
          </div>

          <div className="space-y-3">
            <p className="text-[var(--text-primary)] text-sm leading-relaxed whitespace-pre-wrap">{question.text}</p>
            {question.hint && (
              <div className="p-3 bg-[var(--background)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-secondary)] italic">
                💡 Hint: {question.hint}
              </div>
            )}
          </div>

          {/* Database Preview */}
          <div className="space-y-4 pt-2">
            <div className="text-xs font-mono uppercase tracking-wider text-[var(--text-secondary)] font-bold">
              Database Seed Collections
            </div>

            {Object.keys(dbState).length > 0 ? (
              Object.keys(dbState).map((colName) => (
                <div key={colName} className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background)] shadow-sm">
                  <div className="px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)] font-mono text-xs font-bold text-[var(--text-primary)] flex items-center justify-between">
                    <span>Collection: {colName}</span>
                    <span className="text-2xs text-[var(--text-secondary)] font-normal">{dbState[colName].length} documents</span>
                  </div>
                  <div className="p-3 overflow-x-auto max-h-60 overflow-y-auto font-mono text-xs text-[var(--text-primary)]">
                    {dbState[colName].length > 0 ? (
                      <pre className="whitespace-pre overflow-x-auto text-xs-plus leading-relaxed">
                        {JSON.stringify(dbState[colName], null, 2)}
                      </pre>
                    ) : (
                      <span className="text-[var(--text-secondary)] italic">Empty collection</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 border border-[var(--border)] rounded-xl bg-[var(--background)] text-xs font-mono text-[var(--text-secondary)] text-center italic">
                No active collections seeded.
              </div>
            )}
          </div>
        </div>

        {/* Horizontal Resizer handle */}
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

        {/* Right Column: Editor, Console, Output */}
        <div className="flex-1 h-full flex flex-col min-w-0 bg-[var(--background)] select-text">
          {/* Editor Area */}
          <div className="flex-1 min-h-0 relative border-b border-[var(--border)]">
            <CodeEditor
              language="javascript"
              value={editorQuery}
              onChange={handleQueryChange}
              theme={theme === 'dark' ? 'dark' : 'light'}
            />
          </div>

          {/* JSON Output / Error Log Console */}
          <div className="h-56 bg-background text-foreground font-mono text-xs flex flex-col overflow-hidden border-t border-border shrink-0">
            <div className="px-4 py-2 bg-surface border-b border-border text-2xs text-muted-foreground uppercase tracking-wider font-bold flex items-center justify-between">
              <span>Console Output</span>
              {executionTime !== null && (
                <span className="text-2xs lowercase font-normal text-emerald-500">
                  executed in {executionTime}ms
                </span>
              )}
            </div>
            <div className="flex-1 p-4 overflow-y-auto select-text">
              {error ? (
                <div className="text-rose-500 font-bold whitespace-pre-wrap">
                  ⚠️ Error: {error}
                </div>
              ) : output !== null ? (
                <pre className="whitespace-pre overflow-x-auto leading-relaxed">
                  {JSON.stringify(output, null, 2)}
                </pre>
              ) : (
                <div className="text-muted-foreground italic">
                  Press Run Query to view output.
                </div>
              )}
            </div>
          </div>

          {/* Standardized Pinned Bottom Navigation Bar */}
          <footer className="h-14 border-t border-border bg-surface px-6 flex items-center justify-between shrink-0 z-10 shadow-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={handleRun}
                disabled={running || !editorQuery.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-xs"
              >
                {running ? 'Running…' : '▶ Run Query'}
              </button>

              <button
                onClick={handleReset}
                className="px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-background text-xs font-bold transition-all cursor-pointer shadow-xs bg-surface"
              >
                Reset DB State
              </button>

              <button
                onClick={handleSubmitQuery}
                disabled={submitting || !editorQuery.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-xs"
              >
                {submitting ? 'Saving…' : submitSuccess ? '✓ Answer Saved' : 'Save Answer'}
              </button>

              {evalResult && (
                <div className={`px-2.5 py-1 rounded-full text-xs-plus font-mono font-medium flex items-center gap-1.5 ${
                  evalResult.passed 
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' 
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                }`}>
                  <span>{evalResult.passed ? '✓ PASSED' : '✕ QUERY ERROR'}</span>
                </div>
              )}
            </div>

            <span className="text-xs font-mono font-medium text-muted-foreground hidden sm:inline">
              NoSQL Task {currentIndex + 1} of {questions.length}
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
