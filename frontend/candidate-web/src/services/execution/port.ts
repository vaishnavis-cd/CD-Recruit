// PORT: CodeExecutionPort
// Run / Submit code against test cases.
// Real implementation would call Judge0 or similar sandbox.

export interface TestCaseResult {
  label: string
  passed: boolean
  input: string
  expectedOutput: string
  actualOutput: string
  isVisible: boolean
}

export interface ExecutionResult {
  mode: 'run' | 'submit'
  success: boolean
  compilationError?: string
  runtimeError?: string
  visibleResults: TestCaseResult[]
  // Hidden case results exist in the mock so UI logic is exercised,
  // but they are NEVER shown to the candidate.
  _hiddenResults?: TestCaseResult[]
  durationMs: number
}

export interface CodeExecutionPort {
  runTests(code: string, questionId: string, mode: 'run' | 'submit'): Promise<ExecutionResult>
}
