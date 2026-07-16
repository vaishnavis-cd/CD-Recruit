import { useEffect } from "react";
import { useSessionStore } from "@/store/session.store";
import { SecondTabOverlay } from "@/components/common/SecondTabOverlay";
import { AppRoutes } from "@/routes";

/**
 * App — root component.
 *
 * Responsibilities:
 *  1. Attempt session resume on page load if sessionStorage has a persisted sessionId
 *  2. Render SecondTabOverlay at root level — outside the router so it covers
 *     every route when isSecondTab becomes true
 *  3. Render the router
 */
export function App() {
  const persistedSessionId = useSessionStore((s) => s.persistedSessionId);
  const sessionId = useSessionStore((s) => s.sessionId);
  const resumeSession = useSessionStore((s) => s.resumeSession);

  // Resume-on-load: sessionStorage has a sessionId but the in-memory store
  // is not yet hydrated (page was refreshed). Attempt resume once on mount.
  useEffect(() => {
    if (persistedSessionId && !sessionId) {
      void resumeSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <SecondTabOverlay />
      <AppRoutes />
    </>
  );
}
