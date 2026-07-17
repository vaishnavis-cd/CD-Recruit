import type { CvDetectionPort, DetectionEvent } from './port'

// Dev panel toggles
export let simulateWebcamDenied = false
export let simulateWasmUnsupported = false
export function setSimulateWebcamDenied(v: boolean) { simulateWebcamDenied = v }
export function setSimulateWasmUnsupported(v: boolean) { simulateWasmUnsupported = v }

const detectionSubscribers = new Set<(event: DetectionEvent) => void>()
let tickInterval: ReturnType<typeof setInterval> | null = null
let isRunning = false
let activeStream: MediaStream | null = null

function emitEvent(event: DetectionEvent) {
  detectionSubscribers.forEach(cb => cb(event))
}

function startDetectionTicks() {
  if (tickInterval) return
  // Simulate periodic face detection events every ~5 seconds
  tickInterval = setInterval(() => {
    if (!isRunning) return
    const r = Math.random()
    if (r < 0.7) {
      emitEvent({ type: 'face-detected', confidence: 0.85 + Math.random() * 0.12, timestamp: Date.now() })
    } else if (r < 0.85) {
      emitEvent({ type: 'face-lost', timestamp: Date.now() })
    } else {
      emitEvent({ type: 'multiple-faces', count: 2, timestamp: Date.now() })
    }
  }, 5000)
}

export const mockCvDetectionAdapter: CvDetectionPort = {
  async start(): Promise<void> {
    if (simulateWasmUnsupported) {
      emitEvent({ type: 'wasm-unsupported' })
      return
    }

    if (simulateWebcamDenied) {
      await new Promise(resolve => setTimeout(resolve, 800)) // simulate permission dialog delay
      emitEvent({ type: 'permission-denied' })
      return
    }

    // Actually request camera access (for real) so the native permission dialog appears
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      activeStream = stream
      // Permission granted — emit event
      emitEvent({ type: 'permission-granted' })
      isRunning = true
      startDetectionTicks()
    } catch (err) {
      // Permission denied or error
      emitEvent({ type: 'permission-denied' })
    }
  },

  stop(): void {
    isRunning = false
    if (tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
    // Stop all tracks to release camera
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop())
      activeStream = null
    }
  },

  onDetectionEvent(callback: (event: DetectionEvent) => void): () => void {
    detectionSubscribers.add(callback)
    return () => {
      detectionSubscribers.delete(callback)
    }
  },

  async captureFrame(): Promise<string> {
    if (simulateWebcamDenied) {
      throw new Error('Webcam access denied')
    }

    // Use the active stream if available, otherwise request camera
    let stream = activeStream
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true })
        activeStream = stream
      } catch (err) {
        throw new Error('Failed to access camera')
      }
    }

    // Create a video element to capture from the stream
    const video = document.createElement('video')
    video.srcObject = stream
    video.autoplay = true
    video.playsInline = true

    // Wait for video to be ready
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.play().then(() => resolve()).catch(reject)
      }
      video.onerror = reject
    })

    // Wait a bit for the camera to stabilize
    await new Promise(resolve => setTimeout(resolve, 500))

    // Capture to canvas
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    }

    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    
    // Emit capture-ready event
    emitEvent({ type: 'capture-ready', frameDataUrl: dataUrl })
    
    return dataUrl
  },

  isWasmSupported(): boolean {
    if (simulateWasmUnsupported) return false
    // Check real WASM support
    try {
      return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
    } catch {
      return false
    }
  },
}
