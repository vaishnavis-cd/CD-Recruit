import { useEffect, useState, useCallback } from 'react'
import { services } from '../services'
import type { IntegrityAlert } from '../components/common/IntegrityAlertBanner'

export function useIntegrityEvents() {
  const [alerts, setAlerts] = useState<IntegrityAlert[]>([])

  const addAlert = useCallback((type: 'tab-switch' | 'fullscreen-exit', message: string) => {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const newAlert: IntegrityAlert = {
      id,
      type,
      message,
      timestamp: Date.now(),
    }
    setAlerts(prev => [...prev, newAlert])

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== id))
    }, 5000)
  }, [])

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }, [])

  useEffect(() => {
    let wasFullscreen = !!document.fullscreenElement

    // 1. Tab switch / visibilitychange listener
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden
      } else {
        // Returned to tab — report event & trigger candidate-facing alert
        const now = Date.now()
        services.sessionApi.reportIntegritySignal({
          kind: 'tab-switch',
          category: 'silent',
          timestamp: new Date(now).toISOString(),
        })
        addAlert('tab-switch', 'Tab switch detected — this has been logged.')
      }
    }

    // 2. Fullscreen exit listener
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement
      if (wasFullscreen && !isCurrentlyFullscreen) {
        services.sessionApi.reportIntegritySignal({
          kind: 'fullscreen-exit',
          category: 'functional',
          timestamp: new Date().toISOString(),
        })
        addAlert('fullscreen-exit', 'Fullscreen exited — this has been logged.')
      }
      wasFullscreen = isCurrentlyFullscreen
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [addAlert])

  return {
    alerts,
    dismissAlert,
  }
}
