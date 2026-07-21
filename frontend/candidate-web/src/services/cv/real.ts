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

const subscribers = new Set<(event: DetectionEvent) => void>()
let activeStream: MediaStream | null = null

function emit(event: DetectionEvent) {
  subscribers.forEach(cb => cb(event))
}

export const realCvDetectionAdapter: CvDetectionPort & { _activeStream: () => MediaStream | null } = {
  _activeStream: () => activeStream,

  async start(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      activeStream = stream
      emit({ type: 'permission-granted' })
    } catch (err: any) {
      console.error('[realCvDetectionAdapter] getUserMedia failed:', err?.name, err?.message)
      emit({ type: 'permission-denied' })
    }
  },

  stop(): void {
    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop())
      activeStream = null
    }
  },

  onDetectionEvent(callback: (event: DetectionEvent) => void): () => void {
    subscribers.add(callback)
    return () => subscribers.delete(callback)
  },

  async captureFrame(): Promise<string> {
    let stream = activeStream
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      activeStream = stream
    }
    const video = document.createElement('video')
    video.srcObject = stream
    video.autoplay = true
    video.playsInline = true
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => video.play().then(resolve).catch(reject)
      video.onerror = () => reject(new Error('Video load error'))
    })
    await new Promise(r => setTimeout(r, 400))
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    emit({ type: 'capture-ready', frameDataUrl: dataUrl })
    return dataUrl
  },

  isWasmSupported(): boolean {
    try {
      return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
    } catch {
      return false
    }
  },
}
