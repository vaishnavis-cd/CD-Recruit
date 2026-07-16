import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SessionStatus } from "@cd-recruit/shared-types";
import { useSessionStore } from "@/store/session.store";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { LoginPage } from "@/pages/Login/LoginPage";
import { LobbyPage } from "@/pages/Lobby/LobbyPage";
import { ErrorPage } from "@/pages/Error/ErrorPage";
import { TooEarlyPage } from "@/pages/TooEarly/TooEarlyPage";
import { SystemCheckPage } from "@/pages/SystemCheck/SystemCheckPage";
import { ConsentPage } from "@/pages/Consent/ConsentPage";
import { TutorialPage } from "@/pages/Tutorial/TutorialPage";
import { WaitingRoomPage } from "@/pages/WaitingRoom/WaitingRoomPage";
import { AssessmentShell } from "@/pages/Assessment/AssessmentShell";
import { PreSubmitPage } from "@/pages/PreSubmit/PreSubmitPage";
import { SyncValidationPage } from "@/pages/SyncValidation/SyncValidationPage";
import { ThankYouPage } from "@/pages/ThankYou/ThankYouPage";
import { LinkExpiredPage } from "@/pages/LinkExpired/LinkExpiredPage";

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
      <Route path="/too-early" element={<TooEarlyPage />} />
      <Route path="/link-expired" element={<LinkExpiredPage />} />
      <Route path="/thank-you" element={<ThankYouPage />} />

      {/* Protected */}
      <Route
        path="/lobby"
        element={
          <RequireSession>
            <LobbyPage />
          </RequireSession>
        }
      />
      <Route
        path="/system-check"
        element={
          <RequireSession>
            <SystemCheckPage />
          </RequireSession>
        }
      />
      <Route
        path="/consent"
        element={
          <RequireSession>
            <ConsentPage />
          </RequireSession>
        }
      />
      <Route
        path="/tutorial"
        element={
          <RequireSession>
            <TutorialPage />
          </RequireSession>
        }
      />
      <Route
        path="/waiting-room"
        element={
          <RequireSession>
            <WaitingRoomPage />
          </RequireSession>
        }
      />
      <Route
        path="/assessment"
        element={
          <RequireSession>
            <AssessmentShell />
          </RequireSession>
        }
      />
      <Route
        path="/pre-submit"
        element={
          <RequireSession>
            <PreSubmitPage />
          </RequireSession>
        }
      />
      <Route
        path="/sync-validation"
        element={
          <RequireSession>
            <SyncValidationPage />
          </RequireSession>
        }
      />

      {/* 404 */}
      <Route path="*" element={<ErrorPage />} />
    </Routes>
  );
}
