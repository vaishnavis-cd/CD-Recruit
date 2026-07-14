import { ExecutionStatus } from "./enums";

// ---------------------------------------------------------------------------
// Proctoring event log (fire-and-forget)
//
// Sent by the frontend for any integrity event. Backend persists to EventLog.
// Event types enforced by @cd-recruit/shared-types (not an enum to stay flexible):
//
//   Proctoring:   PASTE | TAB_SWITCH | GAZE_DEVIATION | FACE_NOT_VISIBLE | MULTIPLE_FACES
//   Session:      HEARTBEAT_MISSED | DISCONNECTED | RECONNECTED | GRACE_WINDOW_EXPIRED
//                 AUTO_SUBMITTED | SECOND_TAB_DETECTED | DEADLINE_REACHED
// ---------------------------------------------------------------------------

export type ProctoringEventType =
  | "PASTE"
  | "TAB_SWITCH"
  | "GAZE_DEVIATION"
  | "FACE_NOT_VISIBLE"
  | "MULTIPLE_FACES";

export type SessionEventType =
  | "HEARTBEAT_MISSED"
  | "DISCONNECTED"
  | "RECONNECTED"
  | "GRACE_WINDOW_EXPIRED"
  | "AUTO_SUBMITTED"
  | "SECOND_TAB_DETECTED"
  | "DEADLINE_REACHED";

export type EventType = ProctoringEventType | SessionEventType;

export interface LogEventRequest {
  eventType: EventType;
  payload: Record<string, unknown>;
  occurredAt: string; // ISO-8601
}
