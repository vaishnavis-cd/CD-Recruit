import { useSessionStore } from "@/store/session.store";
import { useHeartbeat } from "@/hooks/useHeartbeat";

/**
 * LobbyPage — Phase 2 placeholder.
 *
 * Phase 2 adds: hardware diagnostics, selfie capture, "Start Assessment" button,
 * CSS watermark overlay.
 *
 * Phase 1 purpose: confirms session is active, heartbeat is running,
 * and the RequireSession routing guard works end-to-end.
 *
 * useHeartbeat() is called here — this is the top-level session entry point
 * for the entire assessment flow. The hook must be mounted exactly once per
 * session while the candidate is in the assessment.
 */
export function LobbyPage() {
  useHeartbeat();

  const roleTemplateName = useSessionStore((s) => s.roleTemplateName);
  const disconnectCount = useSessionStore((s) => s.disconnectCount);
  const deadlineAt = useSessionStore((s) => s.deadlineAt);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f5f5f5",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "2.5rem",
          maxWidth: "520px",
          width: "100%",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            marginBottom: "0.5rem",
            color: "#111",
          }}
        >
          Assessment Lobby
        </h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Role: <strong>{roleTemplateName ?? "—"}</strong>
        </p>

        {deadlineAt && (
          <p
            style={{
              color: "#555",
              fontSize: "0.875rem",
              marginBottom: "0.5rem",
            }}
          >
            Deadline: {new Date(deadlineAt).toLocaleTimeString()}
          </p>
        )}

        {disconnectCount > 0 && (
          <p
            style={{
              color: "#e65100",
              fontSize: "0.875rem",
              marginBottom: "0.5rem",
            }}
          >
            Reconnects used: {disconnectCount} / 3
          </p>
        )}

        <p
          style={{
            marginTop: "2rem",
            padding: "0.875rem",
            backgroundColor: "#e8f4fd",
            borderRadius: "8px",
            color: "#0d47a1",
            fontSize: "0.875rem",
          }}
        >
          ✓ Session active. Heartbeat running. Hardware diagnostics and selfie
          capture will be added in Phase 2.
        </p>
      </div>
    </div>
  );
}
