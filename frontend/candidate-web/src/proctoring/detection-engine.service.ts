import { FaceDetectionResult, PoseDetectionResult, ObjectDetectionResult, ProctoringEventType, ProctoringEvent } from "./proctoring.types";
import { CONFIG, COOLDOWN_MAPPING, SEVERITY_MAPPING } from "./proctoring.constants";

export type EventTriggerListener = (event: ProctoringEvent) => void;

export class DetectionEngineService {
  private static instance: DetectionEngineService | null = null;
  private listeners: EventTriggerListener[] = [];
  private sessionId: string = "";

  // Duration accumulation states
  private faceMissingStartTime: number | null = null;
  private lookingAwayStartTime: number | null = null;

  // Track last triggered timestamp to enforce cooldowns
  private lastTriggeredEvents: Record<ProctoringEventType, number> = {
    FACE_MISSING: 0,
    MULTIPLE_FACES: 0,
    LOOKING_AWAY: 0,
    SEAT_EXIT: 0,
    EXCESSIVE_MOVEMENT: 0,
    PHONE_DETECTED: 0,
    HEADPHONES_DETECTED: 0,
    BOOK_DETECTED: 0,
    SPEECH_DETECTED: 0,
    SECOND_VOICE_SUSPECTED: 0,
    IDENTITY_MISMATCH: 0,
    TAB_SWITCH: 0,
  };

  private constructor() {}

  public static getInstance(): DetectionEngineService {
    if (!DetectionEngineService.instance) {
      DetectionEngineService.instance = new DetectionEngineService();
    }
    return DetectionEngineService.instance;
  }

  public setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  public subscribe(listener: EventTriggerListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Evaluates outputs from all three detection sub-services and determines
   * if a suspicious event should be registered.
   */
  public evaluate(
    face: FaceDetectionResult,
    pose: PoseDetectionResult,
    object: ObjectDetectionResult,
    timestamp: number,
  ): void {
    if (!this.sessionId) return;

    // 1. FACE_MISSING (No face detected for configured threshold)
    if (!face.faceDetected || face.faceCount === 0) {
      if (this.faceMissingStartTime === null) {
        this.faceMissingStartTime = timestamp;
      } else if (timestamp - this.faceMissingStartTime >= CONFIG.FACE_MISSING_THRESHOLD_MS) {
        this.checkAndTrigger("FACE_MISSING", "mediapipe-face-v1", timestamp);
      }
    } else {
      this.faceMissingStartTime = null;
    }

    // 2. MULTIPLE_FACES (Face count > 1)
    if (face.faceDetected && face.faceCount > 1) {
      this.checkAndTrigger("MULTIPLE_FACES", "mediapipe-face-v1", timestamp);
    }

    // 3. LOOKING_AWAY (Head direction not centered for configured threshold)
    if (face.faceDetected && face.headDirection !== "CENTER") {
      if (this.lookingAwayStartTime === null) {
        this.lookingAwayStartTime = timestamp;
      } else if (timestamp - this.lookingAwayStartTime >= CONFIG.LOOKING_AWAY_THRESHOLD_MS) {
        this.checkAndTrigger("LOOKING_AWAY", "mediapipe-face-v1", timestamp);
      }
    } else {
      this.lookingAwayStartTime = null;
    }

    // 4. SEAT_EXIT (Body leaves frame)
    if (!pose.inFrame || pose.isLeavingSeat) {
      this.checkAndTrigger("SEAT_EXIT", "mediapipe-pose-v1", timestamp);
    }

    // 5. EXCESSIVE_MOVEMENT (Abnormal continuous body motion)
    if (pose.inFrame && pose.movementMetric > CONFIG.EXCESSIVE_MOVEMENT_THRESHOLD) {
      this.checkAndTrigger("EXCESSIVE_MOVEMENT", "mediapipe-pose-v1", timestamp);
    }

    // 6. PHONE_DETECTED (Phone visible)
    if (object.phoneDetected) {
      this.checkAndTrigger("PHONE_DETECTED", "object-detector-v1", timestamp);
    }

    // 7. HEADPHONES_DETECTED (Headphones visible)
    if (object.headphonesDetected) {
      this.checkAndTrigger("HEADPHONES_DETECTED", "object-detector-v1", timestamp);
    }

    // 8. BOOK_DETECTED (Book / notes visible)
    if (object.bookDetected) {
      this.checkAndTrigger("BOOK_DETECTED", "object-detector-v1", timestamp);
    }
  }

  /**
   * Applies cooldown logic, and calls listeners if the event passes filters.
   */
  private checkAndTrigger(eventType: ProctoringEventType, modelVersion: string, timestamp: number): void {
    const cooldown = COOLDOWN_MAPPING[eventType] ?? 0;
    const lastTrigger = this.lastTriggeredEvents[eventType];

    // If still in cooldown period, do not create duplicate events
    if (cooldown > 0 && timestamp - lastTrigger < cooldown) {
      return;
    }

    // Reset cooldown tracker
    this.lastTriggeredEvents[eventType] = timestamp;

    const event: ProctoringEvent = {
      sessionId: this.sessionId,
      eventType,
      severity: SEVERITY_MAPPING[eventType],
      timestamp: new Date(timestamp).toISOString(),
      modelVersion,
    };

    console.log(
      `[DetectionEngine] EVENT_CREATED: eventType=${eventType}, modelVersion=${modelVersion}, timestamp=${event.timestamp}`,
    );
    console.warn(
      `[Proctoring Event Triggered]: EVENT_TYPE=${eventType}, TIMESTAMP=${event.timestamp} (Severity: ${event.severity})`,
    );

    // Notify subscribers
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error invoking event listener:", err);
      }
    }
  }

  /**
   * Helper to trigger mock proctoring events directly in development mode.
   */
  public triggerMockEvent(eventType: ProctoringEventType, modelVersion: string): void {
    this.checkAndTrigger(eventType, modelVersion, Date.now());
  }

  public reset(): void {
    this.faceMissingStartTime = null;
    this.lookingAwayStartTime = null;
    this.listeners = [];
    this.sessionId = "";
    Object.keys(this.lastTriggeredEvents).forEach((k) => {
      this.lastTriggeredEvents[k as ProctoringEventType] = 0;
    });
  }
}
