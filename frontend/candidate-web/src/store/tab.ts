/**
 * TAB_ID — a unique identifier for this browser tab instance.
 *
 * Generated once at module load using crypto.randomUUID().
 * Lives in module memory only — never written to localStorage or sessionStorage.
 *
 * A page reload creates a new TAB_ID. This is intentional: a reload is treated
 * as a reconnect (POST /sessions/:id/resume with the new TAB_ID). If the session
 * was DISCONNECTED when the page reloaded, disconnectCount increments correctly
 * rather than being silently bypassed by reusing a stale tabId.
 *
 * See docs/DECISIONS.md Decision 6.
 */
if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
  throw new Error(
    "[cd-recruit] crypto.randomUUID() is not available. " +
      "The app must be served over HTTPS or localhost.",
  );
}

export const TAB_ID: string = crypto.randomUUID();
