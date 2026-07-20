import type { CodeExecutionPort, ExecutionResult, TestCaseResult } from './port'
import axios from 'axios'
import { useSessionStore } from '../../store/sessionMachine'
import { CODING_QUESTIONS } from '../../fixtures/questions'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const realCodeExecutionAdapter: CodeExecutionPort = {
  async runTests(code: string, questionId: string, mode: 'run' | 'submit'): Promise<ExecutionResult> {
    const sessionId = useSessionStore.getState().assessment?.sessionId
    if (!sessionId) {
      throw new Error('No active assessment session found')
    }

    const question = CODING_QUESTIONS.find((q) => q.id === questionId)
    const language = question ? question.language : 'python'

    try {
      const endpoint = mode === 'run' ? '/coding/run' : '/coding/submit'
      const start = Date.now()
      const res = await apiClient.post(endpoint, {
        sessionId,
        questionId,
        language,
        sourceCode: code,
      })
      const durationMs = Date.now() - start

      const { status, passedTests, totalTests, stdout } = res.data

      if (status === 'COMPILATION_ERROR') {
        return {
          mode,
          success: false,
          compilationError: stdout || 'Compilation Error',
          visibleResults: [],
          durationMs,
        }
      }

      if (status === 'RUNTIME_ERROR') {
        return {
          mode,
          success: false,
          runtimeError: stdout || 'Runtime Error',
          visibleResults: [],
          durationMs,
        }
      }

      // Reconstruct test case results based on passed/total counts
      const visibleResults: TestCaseResult[] = Array.from({ length: totalTests }).map((_, i) => {
        const passed = i < passedTests
        return {
          label: `Test case ${i + 1}`,
          passed,
          input: passed ? 'Passed' : 'Failed',
          expectedOutput: '',
          actualOutput: passed ? '' : stdout || '',
          isVisible: true,
        }
      })

      const allPassed = passedTests === totalTests

      return {
        mode,
        success: allPassed,
        visibleResults,
        durationMs,
      }
    } catch (err: any) {
      console.error('Code execution failed:', err)
      // Throw with type 'infra-failure' to notify UI of sandbox infra issues
      throw Object.assign(new Error(err.response?.data?.message || 'Sandbox execution infrastructure error'), {
        type: 'infra-failure' as const,
      })
    }
  },
}
