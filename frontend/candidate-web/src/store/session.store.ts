/**
 * session.store.ts — compatibility shim for components that import
 * `useSessionStore` from `@/store/session.store`.
 *
 * The real store lives in sessionMachine.ts. This re-exports it with a
 * derived `sessionId` selector so CodingWorkspace and similar components
 * can do:
 *
 *   const sessionId = useSessionStore((s) => s.sessionId)
 *
 * without duplicating store logic.
 */
import { useSessionStore as _useSessionStore } from "./sessionMachine";

// Re-export the raw store hook with an added `sessionId` derived field.
// Zustand selectors receive the full store slice; we add sessionId as a
// computed property pulled from the assessment state.
export function useSessionStore<T>(
  selector: (state: ReturnType<typeof _useSessionStore.getState> & { sessionId: string | null }) => T,
): T {
  return _useSessionStore((state) => {
    const extended = Object.assign(Object.create(state as object), state, {
      sessionId: state.assessment?.sessionId ?? state.session?.id ?? null,
    });
    return selector(extended);
  });
}

// Also re-export the raw store for cases that need direct access
export { _useSessionStore as useSessionStoreDirect };
