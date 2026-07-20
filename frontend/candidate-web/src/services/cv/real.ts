import type { CvDetectionPort, DetectionEvent } from './port'

export const realCvDetectionAdapter: CvDetectionPort = {
  async start(): Promise<void> {
    throw new Error('MediaPipe CV proctoring is out of scope: stays mock')
  },

  stop(): void {},

  onDetectionEvent(_callback: (event: DetectionEvent) => void): () => void {
    return () => {}
  },

  async captureFrame(): Promise<string> {
    throw new Error('MediaPipe CV proctoring is out of scope: stays mock')
  },

  isWasmSupported(): boolean {
    return false
  },
}
