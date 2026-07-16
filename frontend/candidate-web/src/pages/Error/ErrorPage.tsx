import { useLocation, useNavigate } from "react-router-dom";

interface ErrorState {
  code?: string;
  message?: string;
}

const ERROR_MAP: Record<string, { title: string; body: string }> = {
  RESUME_WINDOW_EXPIRED: {
    title: "Session expired",
    body: "The reconnect window has passed and your session was automatically submitted with your answers so far.",
  },
  MAX_DISCONNECTS_REACHED: {
    title: "Too many disconnections",
    body: "Your session was automatically submitted due to repeated connection drops.",
  },
  SESSION_EXPIRED: {
    title: "Session ended",
    body: "Your assessment session has ended.",
  },
  NOT_FOUND: {
    title: "Page not found",
    body: "The page you're looking for doesn't exist.",
  },
};

/**
 * Generic error display page.
 *
 * Handles:
 *   - 404 (catch-all route — no state)
 *   - Terminal session states navigated to by RequireSession or resume failures
 *     (state: { code, message })
 */
export function ErrorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as ErrorState;

  const entry = state.code
    ? (ERROR_MAP[state.code] ?? {
        title: "Something went wrong",
        body: state.message ?? "",
      })
    : ERROR_MAP["NOT_FOUND"];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "#f5f5f5",
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
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{ fontSize: "3rem", marginBottom: "1rem" }}
          aria-hidden="true"
        >
          ❌
        </div>
        <h1
          style={{
            fontSize: "1.375rem",
            fontWeight: 700,
            marginBottom: "0.75rem",
            color: "#111",
          }}
        >
          {entry.title}
        </h1>
        <p style={{ color: "#555", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          {entry.body}
        </p>
        <button
          onClick={() => navigate("/login", { replace: true })}
          style={{
            padding: "0.625rem 1.5rem",
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "#fff",
            backgroundColor: "#1a56db",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          Back to login
        </button>
      </div>
    </div>
  );
}
