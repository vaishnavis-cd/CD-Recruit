/**
 * Real CV detection adapter.
 *
 * Full MediaPipe integration is deferred (see docs/DECISIONS.md).
 * This adapter handles the permission request and basic camera lifecycle
 * so the system check and consent flows work end-to-end.
 * Detection events (face-detected, multiple-faces, etc.) are not yet emitted
 * — that requires the full MediaPipe wiring.
 */
import type { CvDetectionPort, DetectionEvent } from './port'
import { ProctoringModule } from '../../proctoring/proctoring.module'
import { DetectionEngineService } from '../../proctoring/detection-engine.service'
import { WebcamService } from '../../proctoring/webcam.service'

const subscribers = new Set<(event: DetectionEvent) => void>()
let activeStream: MediaStream | null = null

function emit(event: DetectionEvent) {
  subscribers.forEach(cb => cb(event))
}

import { useSessionStore } from '../../store/sessionMachine'

export function createRealCvDetectionAdapter(getSessionId?: () => string | null | undefined): CvDetectionPort & { _activeStream: () => MediaStream | null } {
  return {
    _activeStream: () => activeStream,

    async start(): Promise<void> {
      // For system pre-flight check and hardware testing, start only the webcam stream
      const webcam = WebcamService.getInstance();
      const permitted = await webcam.requestPermission();
      if (permitted) {
        activeStream = await webcam.start();
      }
    },

    async stop(): Promise<void> {
      WebcamService.getInstance().stop();
      activeStream = null;
    },

    onDetectionEvent(callback: (event: DetectionEvent) => void): () => void {
      return DetectionEngineService.getInstance().subscribe((evt) => {
        const ts = new Date(evt.timestamp).getTime()
        if (evt.eventType === 'FACE_MISSING') {
          callback({ type: 'face-lost', timestamp: ts })
        } else if (evt.eventType === 'MULTIPLE_FACES') {
          callback({ type: 'multiple-faces', count: 2, timestamp: ts })
        } else {
          callback({ type: 'face-detected', confidence: 0.95, timestamp: ts })
        }
      })
    },

    async captureFrame(): Promise<string> {
      const video = WebcamService.getInstance().getVideoElement()
      if (!video || video.readyState < 2) return ""
      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext("2d")
      if (!ctx) return ""
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL("image/jpeg", 0.7)
    },

    isWasmSupported(): boolean {
      return typeof WebAssembly !== "undefined"
    },
  }
}

export const realCvDetectionAdapter = createRealCvDetectionAdapter()
