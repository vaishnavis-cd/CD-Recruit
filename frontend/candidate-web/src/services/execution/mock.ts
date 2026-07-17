import type { CodeExecutionPort, ExecutionResult } from './port'

// Dev panel flag to simulate sandbox infra failure
export let simulateSandboxFailure = false
export function setSimulateSandboxFailure(v: boolean) { simulateSandboxFailure = v }

// Canned pass/fail results per question fixture.
// Visible test cases are always returned; hidden cases are modeled but never shown.
const FIXTURE_RESULTS: Record<string, {
  visiblePassed: boolean[]
  hiddenPassed: boolean[]
}> = {
  'code-1': { visiblePassed: [true, true, true], hiddenPassed: [true, true, false] },
  'code-2': { visiblePassed: [true, true, false], hiddenPassed: [false, true] },
}

export const mockCodeExecutionAdapter: CodeExecutionPort = {
  async runTests(code: string, questionId: string, mode: 'run' | 'submit'): Promise<ExecutionResult> {
    // Simulate 1-3s execution delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))

    if (simulateSandboxFailure) {
      // Visually distinct infra failure — NOT "your code failed"
      throw Object.assign(new Error('Sandbox execution infrastructure error — not a code failure'), {
        type: 'infra-failure' as const,
      })
    }

    const fixture = FIXTURE_RESULTS[questionId] ?? { visiblePassed: [true], hiddenPassed: [true] }

    // Simulate a compilation error if code is very short (clearly not a real attempt)
    if (code.trim().length < 10) {
      return {
        mode,
        success: false,
        compilationError: 'SyntaxError: unexpected EOF while parsing',
        visibleResults: [],
        durationMs: 120,
      }
    }

    const visibleResults = fixture.visiblePassed.map((passed, i) => ({
      label: `Test case ${i + 1}`,
      passed,
      input: `example_input_${i + 1}`,
      expectedOutput: `expected_${i + 1}`,
      actualOutput: passed ? `expected_${i + 1}` : `wrong_output_${i + 1}`,
      isVisible: true,
    }))

    const hiddenResults = mode === 'submit'
      ? fixture.hiddenPassed.map((passed, i) => ({
          label: `Hidden case ${i + 1}`,
          passed,
          input: `[hidden]`,
          expectedOutput: `[hidden]`,
          actualOutput: `[hidden]`,
          isVisible: false,
        }))
      : undefined

    const allPassed = visibleResults.every(r => r.passed)

    return {
      mode,
      success: allPassed,
      visibleResults,
      _hiddenResults: hiddenResults,
      durationMs: 800 + Math.random() * 400,
    }
  },
}
