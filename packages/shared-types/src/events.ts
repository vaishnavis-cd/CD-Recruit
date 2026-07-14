export interface LogEventRequest {
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string; // ISO8601
}
