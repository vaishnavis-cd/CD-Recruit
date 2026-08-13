import { ProctoringEventType } from "./proctoring.types";

export const SEVERITY_MAPPING: Record<ProctoringEventType, "MEDIUM" | "HIGH"> = {
  FACE_MISSING: "MEDIUM",
  LOOKING_AWAY: "MEDIUM",
  BOOK_DETECTED: "MEDIUM",
  MULTIPLE_FACES: "HIGH",
  SEAT_EXIT: "HIGH",
  PHONE_DETECTED: "HIGH",
  HEADPHONES_DETECTED: "HIGH",
  EXCESSIVE_MOVEMENT: "HIGH",
  SPEECH_DETECTED: "MEDIUM",
  SECOND_VOICE_SUSPECTED: "HIGH",
  IDENTITY_MISMATCH: "HIGH",
  TAB_SWITCH: "HIGH",
};

export const COOLDOWN_MAPPING: Record<ProctoringEventType, number> = {
  PHONE_DETECTED: 1000,     // Reduced to 1s so repeat phone detections show the popup cleanly
  HEADPHONES_DETECTED: 15000,
  BOOK_DETECTED: 15000,
  FACE_MISSING: 10000,
  LOOKING_AWAY: 10000,
  EXCESSIVE_MOVEMENT: 10000,
  MULTIPLE_FACES: 1000,     // Reduced to 1s
  SEAT_EXIT: 0,
  SPEECH_DETECTED: 10000,
  SECOND_VOICE_SUSPECTED: 15000,
  IDENTITY_MISMATCH: 15000,
  TAB_SWITCH: 1000,         // Reduced to 1s
};

// Consecutive processed frame validation thresholds (processed at 5 FPS)
export const CONSECUTIVE_FRAMES_REQUIRED: Record<ProctoringEventType, number> = {
  PHONE_DETECTED: 1,        // Instant response
  MULTIPLE_FACES: 1,        // Instant response
  LOOKING_AWAY: 1,          // Instant response
  SEAT_EXIT: 2,            // ~0.4s
  BOOK_DETECTED: 1,         // Instant response
  HEADPHONES_DETECTED: 1,   // Instant response
  FACE_MISSING: 1,          // Instant response
  EXCESSIVE_MOVEMENT: 2,    // ~0.4s
  SPEECH_DETECTED: 1,       // Immediate
  SECOND_VOICE_SUSPECTED: 1,
  IDENTITY_MISMATCH: 1,
  TAB_SWITCH: 1,
};

// Recognition & tracking thresholds
export const CONFIG = {
  FACE_MISSING_THRESHOLD_MS: 300,    // 0.3s instant threshold
  LOOKING_AWAY_THRESHOLD_MS: 800,    // 0.8s balanced threshold (ignores brief screen glances, catches sustained looking away)
  EXCESSIVE_MOVEMENT_THRESHOLD: 0.15, // frame-to-frame shoulder deviation
  FRAME_INTERVAL_MS: 200,             // process 5 frames per second to keep CPU load low
  ROLLING_BUFFER_CHUNK_MS: 1000,      // 1-second chunks for MediaRecorder
  PAST_BUFFER_SECONDS: 3,
  FUTURE_BUFFER_SECONDS: 3,
  MAX_RETRY_ATTEMPTS: 5,
  RETRY_INTERVAL_MS: 30000,
};
