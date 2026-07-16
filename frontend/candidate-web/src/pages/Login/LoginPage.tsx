import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSessionStore } from "@/store/session.store";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

/**
 * Error code → human-readable message.
 * Based on the exact error codes the backend returns (verified against implementation).
 */
const ERROR_MESSAGES: Record<string, string> = {
  INVITE_TOKEN_INVALID: "This invite link is not valid.",
  INVITE_TOKEN_EXPIRED:
    "This invite link has expired. Contact your recruiter for a new one.",
  SESSION_ALREADY_ACTIVE:
    "You already have an active session. Please use the same browser tab you started with.",
  NETWORK_ERROR:
    "Could not connect to the server. Check your connection and try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES["UNKNOWN"];
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sessionId = useSessionStore((s) => s.sessionId);
  const isLoading = useSessionStore((s) => s.isLoading);
  const error = useSessionStore((s) => s.error);
  const doStartSession = useSessionStore((s) => s.startSession);
  const clearError = useSessionStore((s) => s.clearError);

  // Pre-fill from ?token= query param (invite link carries the token in the URL)
  const tokenFromUrl = searchParams.get("token") ?? "";
  const [inviteToken, setInviteToken] = useState(tokenFromUrl);

  // If the store already has a session (from a previous start or resume),
  // skip this page immediately
  useEffect(() => {
    if (sessionId) {
      navigate("/lobby", { replace: true });
    }
  }, [sessionId, navigate]);

  // Auto-submit when a token arrives via URL and nothing is in progress
  useEffect(() => {
    if (tokenFromUrl && !sessionId && !isLoading) {
      void doStartSession(tokenFromUrl);
    }
    // Only run on initial mount — not on subsequent changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim() || isLoading) return;
    clearError();
    void doStartSession(inviteToken.trim());
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInviteToken(e.target.value);
    if (error) clearError();
  };

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
          width: "100%",
          maxWidth: "440px",
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
          CD-Recruit Assessment
        </h1>
        <p
          style={{ color: "#666", marginBottom: "2rem", fontSize: "0.9375rem" }}
        >
          Enter your invite token to begin.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: "1rem" }}>
            <label
              htmlFor="invite-token"
              style={{
                display: "block",
                fontWeight: 600,
                marginBottom: "0.5rem",
                fontSize: "0.875rem",
                color: "#333",
              }}
            >
              Invite token
            </label>
            <input
              id="invite-token"
              type="text"
              value={inviteToken}
              onChange={handleChange}
              disabled={isLoading}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste your invite token here"
              aria-describedby={error ? "login-error" : undefined}
              aria-invalid={!!error}
              style={{
                width: "100%",
                padding: "0.625rem 0.875rem",
                fontSize: "0.9375rem",
                border: `1.5px solid ${error ? "#d32f2f" : "#ccc"}`,
                borderRadius: "8px",
                boxSizing: "border-box",
                outline: "none",
                fontFamily: "monospace",
                backgroundColor: isLoading ? "#f9f9f9" : "#fff",
                transition: "border-color 0.15s",
              }}
            />
          </div>

          {error && (
            <p
              id="login-error"
              role="alert"
              style={{
                color: "#d32f2f",
                fontSize: "0.875rem",
                marginBottom: "1rem",
                padding: "0.625rem 0.75rem",
                backgroundColor: "#fdf0f0",
                borderRadius: "6px",
                border: "1px solid #f5c6c6",
              }}
            >
              {getErrorMessage(error.code)}
            </p>
          )}

          <button
            type="submit"
            disabled={!inviteToken.trim() || isLoading}
            style={{
              width: "100%",
              padding: "0.75rem",
              fontSize: "1rem",
              fontWeight: 600,
              color: "#fff",
              backgroundColor: "#1a56db",
              border: "none",
              borderRadius: "8px",
              cursor:
                isLoading || !inviteToken.trim() ? "not-allowed" : "pointer",
              opacity: !inviteToken.trim() ? 0.5 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "opacity 0.15s",
            }}
          >
            {isLoading ? (
              <>
                <LoadingSpinner size={18} label="Starting session…" />
                Starting…
              </>
            ) : (
              "Start Assessment"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
