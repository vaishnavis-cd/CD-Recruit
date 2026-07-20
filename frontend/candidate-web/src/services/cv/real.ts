import type { CvDetectionPort, DetectionEvent } from './port'

export const realCvDetectionAdapter: CvDetectionPort = {
  async start(): Promise<void> {
    // MediaPipe CV deliberately deferred — see docs/DECISIONS.md
    return Promise.resolve()
  },

  async stop(): Promise<void> {
    // No-op
  },

  onDetectionEvent(_callback: (event: DetectionEvent) => void): () => void {
    return () => {}
  },

  async captureFrame(): Promise<string> {
    // MediaPipe CV deliberately deferred — see docs/DECISIONS.md
    return Promise.resolve("")
  },

  isWasmSupported(): boolean {
    return false
  },
}
