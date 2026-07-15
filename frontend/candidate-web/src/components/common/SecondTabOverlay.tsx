import { useSessionStore } from "@/store/session.store";

/**
 * SecondTabOverlay — full-screen, non-dismissable blocking overlay.
 *
 * Rendered at the root App level (outside the router) so it covers everything
 * regardless of which route is currently active.
 *
 * Triggered when the Zustand store's isSecondTab flag becomes true, which
 * happens when the heartbeat receives a 409 SECOND_TAB_DETECTED response.
 *
 * Intentionally NOT a <dialog> — those can be dismissed with Escape.
 * The candidate must return to the original tab.
 */
export function SecondTabOverlay() {
  const isSecondTab = useSessionStore((s) => s.isSecondTab);

  if (!isSecondTab) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="second-tab-heading"
      aria-describedby="second-tab-body"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "2.5rem",
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{ fontSize: "3rem", marginBottom: "1rem" }}
          aria-hidden="true"
        >
          ⚠️
        </div>
        <h1
          id="second-tab-heading"
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            marginBottom: "0.75rem",
            color: "#111",
          }}
        >
          Another tab is already active
        </h1>
        <p id="second-tab-body" style={{ color: "#555", lineHeight: 1.6 }}>
          This assessment is open in another browser tab. Please return to that
          tab to continue. This tab cannot be used for the assessment.
        </p>
      </div>
    </div>
  );
}
