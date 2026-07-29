export type ProctoringEventType =
  | "FACE_MISSING"
  | "MULTIPLE_FACES"
  | "LOOKING_AWAY"
  | "SEAT_EXIT"
  | "EXCESSIVE_MOVEMENT"
  | "PHONE_DETECTED"
  | "HEADPHONES_DETECTED"
  | "BOOK_DETECTED"
  | "SPEECH_DETECTED"
  | "SECOND_VOICE_SUSPECTED"
  | "IDENTITY_MISMATCH";

export type HeadDirection = "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN";

export interface FaceDetectionResult {
  faceDetected: boolean;
  faceCount: number;
  headDirection: HeadDirection;
  blinkDetected?: boolean;
  alignment?: {
    isAligned: boolean;
    centerX: number;
    centerY: number;
    sizeRatio: number;
    guideFeedback: string;
  };
}

export interface PoseDetectionResult {
  inFrame: boolean;
  isLeavingSeat: boolean;
  isStanding: boolean;
  movementMetric: number;
}

export interface ObjectDetectionResult {
  phoneDetected: boolean;
  headphonesDetected: boolean;
  bookDetected: boolean;
}

export interface ProctoringEvent {
  id?: string;
  sessionId: string;
  eventType: ProctoringEventType;
  severity: "MEDIUM" | "HIGH";
  timestamp: string;
  clipUrl?: string | null;
  modelVersion?: string;
  uploadStatus?: "PENDING" | "UPLOADED" | "FAILED";
  metadata?: Record<string, any>;
  createdAt?: string;
}
