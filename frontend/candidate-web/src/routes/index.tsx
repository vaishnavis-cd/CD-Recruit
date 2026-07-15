import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SessionStatus } from "@cd-recruit/shared-types";
import { useSessionStore } from "@/store/session.store";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { LoginPage } from "@/pages/Login/LoginPage";
import { LobbyPage } from "@/pages/Lobby/LobbyPage";
import { ErrorPage } from "@/pages/Error/ErrorPage";

// ─────────────────────────────────────────────────────────────────────────────
// RequireSession guard
// ─────────────────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES: SessionStatus[] = [
  SessionStatus.SUBMITTED,
  SessionStatus.AUTO_SUBMITTED,
  SessionStatus.CLOSED,
  SessionStatus.ABANDONED,
];

function RequireSession({ children }: { children: ReactNode }) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const status = useSessionStore((s) => s.status);
  const isLoading = useSessionStore((s) => s.isLoading);

  // Resume call is in-flight — hold here to prevent a flash redirect to /login
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LoadingSpinner size={40} label="Resuming session…" />
      </div>
    );
  }

  if (!sessionId) {
    return <Navigate to="/login" replace />;
  }

  if (status && TERMINAL_STATUSES.includes(status)) {
    return (
      <Navigate
        to="/error"
        replace
        state={{ code: "SESSION_EXPIRED", message: "Your session has ended." }}
      />
    );
  }

  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route table
// ─────────────────────────────────────────────────────────────────────────────

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/error" element={<ErrorPage />} />

      {/* Protected */}
      <Route
        path="/lobby"
        element={
          <RequireSession>
            <LobbyPage />
          </RequireSession>
        }
      />

      {/* Phase 3+ assessment stub */}
      <Route
        path="/assessment/*"
        element={
          <RequireSession>
            <div style={{ padding: "2rem" }}>Assessment — Phase 3</div>
          </RequireSession>
        }
      />

      {/* 404 */}
      <Route path="*" element={<ErrorPage />} />
    </Routes>
  );
}
