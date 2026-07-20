// PORT: CvDetectionPort
// Computer-vision proctoring interface.
// Real implementation: MediaPipe face detection WASM.
// Mock: dev-panel-controlled simulation.

export type DetectionEvent =
  | { type: 'face-detected'; confidence: number; timestamp: number }
  | { type: 'face-lost'; timestamp: number }
  | { type: 'multiple-faces'; count: number; timestamp: number }
  | { type: 'capture-ready'; frameDataUrl: string }
  | { type: 'wasm-unsupported' }
  | { type: 'permission-denied' }
  | { type: 'permission-granted' }

export interface CvDetectionPort {
  /** Start the CV pipeline (webcam + detection). Triggers permission request. */
  start(): Promise<void>

  /** Stop the CV pipeline and release the camera. */
  stop(): void

  /** Subscribe to detection events. Returns unsubscribe function. */
  onDetectionEvent(callback: (event: DetectionEvent) => void): () => void

  /** Capture a single frame for baseline selfie. Returns a data URL. */
  captureFrame(): Promise<string>

  /** Whether WASM is supported in this browser. */
  isWasmSupported(): boolean
}
