import { useEffect, useRef } from "react";
import { SessionStatus } from "@cd-recruit/shared-types";
import { sendHeartbeat } from "@/api/session";
import type { ApiError } from "@/api/session";
import { useSessionStore } from "@/store/session.store";
import { TAB_ID } from "@/store/tab";

/** Heartbeat interval in milliseconds — matches docs/DECISIONS.md Decision 7. */
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * useHeartbeat — sends a heartbeat every 15 seconds while a session is active.
 *
 * Responsibilities:
 *   - Start a setInterval on mount (or when sessionId/status become valid)
 *   - Stop the interval when:
 *       * sessionId is null
 *       * status is not IN_PROGRESS
 *       * isSecondTab is true
 *       * component unmounts
 *   - On 409 SECOND_TAB_DETECTED: call setSecondTab() — interval stops on
 *     next render because isSecondTab becomes true
 *   - On sessionStatus from 200 response: call updateFromHeartbeat() so the
 *     store reacts to out-of-band status changes (AUTO_SUBMITTED, CLOSED)
 *   - On transient network errors: log and continue — one missed heartbeat is
 *     not a client-side concern; the backend handles stale detection at 45 s
 *
 * Call this hook once in the session shell layout — not in individual pages.
 */
export function useHeartbeat(): void {
  const sessionId = useSessionStore((s) => s.sessionId);
  const status = useSessionStore((s) => s.status);
  const isSecondTab = useSessionStore((s) => s.isSecondTab);
  const updateFromHeartbeat = useSessionStore((s) => s.updateFromHeartbeat);
  const setSecondTab = useSessionStore((s) => s.setSecondTab);

  // Keep a ref to the latest store values so the interval closure never goes stale
  const refs = useRef({
    sessionId,
    status,
    isSecondTab,
    updateFromHeartbeat,
    setSecondTab,
  });
  useEffect(() => {
    refs.current = {
      sessionId,
      status,
      isSecondTab,
      updateFromHeartbeat,
      setSecondTab,
    };
  });

  const shouldRun =
    sessionId !== null && status === SessionStatus.IN_PROGRESS && !isSecondTab;

  useEffect(() => {
    if (!shouldRun) return;

    const tick = async () => {
      const { sessionId: sid, isSecondTab: ist } = refs.current;
      if (!sid || ist) return;

      try {
        const response = await sendHeartbeat(sid, TAB_ID);
        refs.current.updateFromHeartbeat(
          response.sessionStatus,
          response.deadlineAt,
        );
      } catch (err) {
        const apiError = err as ApiError;

        if (
          apiError.status === 409 &&
          apiError.code === "SECOND_TAB_DETECTED"
        ) {
          refs.current.setSecondTab();
          return;
        }

        // 422: session ended out-of-band — log; the status update will arrive via
        // the next heartbeat response or after a reload
        if (apiError.status === 422) {
          console.warn("[heartbeat] session not in progress:", apiError.code);
          return;
        }

        // Transient network error — log and allow next tick to retry
        console.warn(
          "[heartbeat] network error, will retry:",
          apiError.message,
        );
      }
    };

    // Run one tick immediately so we don't wait 15 s for the first heartbeat
    void tick();
    const id = setInterval(() => void tick(), HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(id);
  }, [shouldRun]);
}
