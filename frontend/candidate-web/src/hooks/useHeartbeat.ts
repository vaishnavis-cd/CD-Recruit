import { useEffect, useRef } from 'react'
import axios from 'axios'
import { WebcamService } from '../proctoring/webcam.service'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
})

function getTabId(): string {
  let tabId = sessionStorage.getItem('cd-recruit-tab-id')
  if (!tabId) {
    tabId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    sessionStorage.setItem('cd-recruit-tab-id', tabId)
  }
  return tabId
}

export function useHeartbeat(sessionId: string | undefined) {
  const inFlightCaptureRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!sessionId) return

    const tabId = getTabId()

    async function sendHeartbeat() {
      try {
        const res = await apiClient.post(`/sessions/${sessionId}/heartbeat`, {
          sessionId,
          tabId,
        })

        const captureRequired = res.data?.captureRequired
        if (captureRequired?.captureId && sessionId) {
          const captureId = captureRequired.captureId
          if (!inFlightCaptureRef.current.has(captureId)) {
            inFlightCaptureRef.current.add(captureId)
            performSilentFrameCapture(sessionId, captureId)
          }
        }
      } catch (err: any) {
        // Silent catch for network drops — server sweep handles missed captures
        console.warn('[useHeartbeat] Heartbeat call warning:', err?.message)
      }
    }

    // Send initial heartbeat immediately, then every 15s
    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 15000)

    return () => clearInterval(interval)
  }, [sessionId])
}

async function performSilentFrameCapture(sessionId: string, captureId: string, isRetry = false) {
  try {
    const video = WebcamService.getInstance().getVideoElement()
    if (!video || !video.videoWidth || !video.videoHeight) {
      console.warn('[useHeartbeat] Silent capture skipped: Video element not ready.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(async (blob) => {
      if (!blob) return

      const formData = new FormData()
      formData.append('file', blob, `identity-capture-${captureId}.jpg`)

      try {
        await apiClient.post(
          `/sessions/${sessionId}/identity-captures/${captureId}/submit`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        )
        console.log(`[useHeartbeat] Silent identity capture ${captureId} uploaded successfully.`)
      } catch (uploadErr: any) {
        console.warn(`[useHeartbeat] Silent capture upload error for ${captureId}:`, uploadErr?.message)
        // Single silent retry attempt if initial attempt failed
        if (!isRetry) {
          setTimeout(() => performSilentFrameCapture(sessionId, captureId, true), 3000)
        }
      }
    }, 'image/jpeg', 0.85)
  } catch (err: any) {
    console.warn('[useHeartbeat] Exception during silent frame capture:', err?.message)
  }
}
