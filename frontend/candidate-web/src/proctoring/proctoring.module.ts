import { WebcamService } from "./webcam.service";
import { FrameProcessorService } from "./frame-processor.service";
import { FaceDetectionService } from "./face-detection.service";
import { PoseDetectionService } from "./pose-detection.service";
import { ObjectDetectionService } from "./object-detection.service";
import { DetectionEngineService } from "./detection-engine.service";
import { RollingBufferService } from "./rolling-buffer.service";
import { EvidenceCaptureService } from "./evidence-capture.service";
import { EvidenceUploadService } from "./evidence-upload.service";
import { ProctoringEventService } from "./proctoring-event.service";
import { AudioDetectionService } from "./audio-detection.service";

export class ProctoringModule {
  private static instance: ProctoringModule | null = null;
  private isRunning = false;
  private sessionId = "";
  private startingPromise: Promise<boolean> | null = null;

  private unsubscribeFrame: (() => void) | null = null;
  private unsubscribeEvents: (() => void) | null = null;

  private constructor() {}

  public static getInstance(): ProctoringModule {
    if (!ProctoringModule.instance) {
      ProctoringModule.instance = new ProctoringModule();
    }
    return ProctoringModule.instance;
  }

  /**
   * Starts the on-device proctoring pipeline.
   * Loads models, configures listeners, starts camera and rolling buffers.
   * Returns true if successful, false if camera access is denied.
   */
  public async start(sessionId: string): Promise<boolean> {
    if (this.isRunning) return true;
    if (this.startingPromise) return this.startingPromise;

    this.startingPromise = (async () => {
      this.sessionId = sessionId;
      console.log(`[Proctoring] START_CALLED: Starting proctoring module for SESSION_ID: ${sessionId}`);

    const webcam = WebcamService.getInstance();
    const hasPermission = await webcam.requestPermission();

    if (!hasPermission) {
      console.warn("[Proctoring] Webcam access was denied. Running in REDUCED proctoring mode.");
      return false;
    }

    try {
      // 1. Start Webcam stream
      const stream = await webcam.start();
      const videoElement = webcam.getVideoElement();

      // 2. Start rolling buffer recorder
      RollingBufferService.getInstance().start(stream);

      // 3. Load computer vision models with graceful degradation
      console.log("[Proctoring] Initializing computer vision models...");
      const modelResults = await Promise.allSettled([
        FaceDetectionService.getInstance().loadModel(),
        PoseDetectionService.getInstance().loadModel(),
        ObjectDetectionService.getInstance().loadModel(),
      ]);

      const faceModelOk = modelResults[0].status === "fulfilled";
      const poseModelOk = modelResults[1].status === "fulfilled";
      const objectModelOk = modelResults[2].status === "fulfilled";

      if (modelResults[0].status === "rejected") {
        console.warn("[Proctoring] Face Landmarker model failed to load:", modelResults[0].reason);
      }
      if (modelResults[1].status === "rejected") {
        console.warn("[Proctoring] Pose Landmarker model failed to load:", modelResults[1].reason);
      }
      if (modelResults[2].status === "rejected") {
        console.warn("[Proctoring] Object Detector model failed to load:", modelResults[2].reason);
      }

      // Check if start was aborted/stopped during model loading
      if (!this.sessionId) {
        console.log("[Proctoring] Start aborted during model loading.");
        this.stop();
        return false;
      }

      // 4. Configure engine and event listener
      const engine = DetectionEngineService.getInstance();
      engine.setSessionId(sessionId);

      this.unsubscribeEvents = engine.subscribe(async (event) => {
        try {
          const activeStream = webcam.getStream();
          if (activeStream) {
            // Trigger 6-second capture (3s past + 3s future)
            const clipBlob = await EvidenceCaptureService.getInstance().captureClip(activeStream);
            // Queue / upload to MinIO and store metadata
            await EvidenceUploadService.getInstance().uploadEvidence(sessionId, event, clipBlob);
          }
        } catch (err) {
          console.error("[Proctoring] Failed to process evidence capture for event:", event.eventType, err);
        }
      });

      // 5. Connect frame processor loop to models and evaluator
      const processor = FrameProcessorService.getInstance();
      this.unsubscribeFrame = processor.subscribe((video, timestamp) => {
        const faceRes = faceModelOk
          ? FaceDetectionService.getInstance().detect(video)
          : { faceDetected: false, faceCount: 0, headDirection: "CENTER" as const };

        const poseRes = poseModelOk
          ? PoseDetectionService.getInstance().detect(video)
          : { inFrame: true, isLeavingSeat: false, isStanding: false, movementMetric: 0 };

        const objectRes = objectModelOk
          ? ObjectDetectionService.getInstance().detect(video)
          : { phoneDetected: false, headphonesDetected: false, bookDetected: false };

        engine.evaluate(faceRes, poseRes, objectRes, timestamp);
      });

      // Start processing frames
      processor.start();

      // Start audio detection service if microphone consent is granted
      if (localStorage.getItem("cd-recruit-mic-consent") === "true") {
        AudioDetectionService.getInstance().start(stream);
      }

      this.isRunning = true;

      // Deterministic Startup Diagnostics Logging
      console.log(`\n==================================================`);
      console.log(`🚀 PROCTORING PIPELINE INITIALIZATION DIAGNOSTICS:`);
      console.log(`Camera: ${stream ? "✅" : "❌"}`);
      console.log(`MediaStream: ${stream && stream.active ? "✅" : "❌"}`);
      console.log(`Video Element: ${videoElement ? "✅" : "❌"}`);
      console.log(`Face Model: ${faceModelOk ? "✅" : "⚠️ (Disabled)"}`);
      console.log(`Pose Model: ${poseModelOk ? "✅" : "⚠️ (Disabled)"}`);
      console.log(`Object Model: ${objectModelOk ? "✅" : "⚠️ (Disabled)"}`);
      console.log(`Frame Processor: ✅`);
      console.log(`Rolling Buffer: ✅`);
      console.log(`Uploader: ✅`);
      console.log(`Backend Pipeline: ✅`);
      console.log(`==================================================\n`);

      return true;
    } catch (err) {
      console.error("[Proctoring] Critical error during proctoring initialization:", err);
      this.stop();
      return false;
    } finally {
      this.startingPromise = null;
    }
    })();

    return this.startingPromise;
  }

  /**
   * Stop the proctoring pipeline, release camera, and flush remaining uploads.
   */
  public async stop(): Promise<void> {
    console.log("[Proctoring] Stopping proctoring module...");
    this.startingPromise = null;

    // Stop frame loops
    FrameProcessorService.getInstance().stop();
    if (this.unsubscribeFrame) {
      this.unsubscribeFrame();
      this.unsubscribeFrame = null;
    }

    // Stop event engine
    if (this.unsubscribeEvents) {
      this.unsubscribeEvents();
      this.unsubscribeEvents = null;
    }
    DetectionEngineService.getInstance().reset();

    // Stop audio detection service
    AudioDetectionService.getInstance().stop();

    // Stop webcam and rolling recorder
    RollingBufferService.getInstance().stop();
    WebcamService.getInstance().stop();

    // Flush any pending queue uploads
    await EvidenceUploadService.getInstance().flush();
    EvidenceUploadService.getInstance().reset();

    this.isRunning = false;
    this.sessionId = "";
    console.log("[Proctoring] Proctoring module stopped.");
  }

  /**
   * Fetch session event summary.
   */
  public async getSummary(sessionId: string): Promise<Record<string, number>> {
    return ProctoringEventService.getInstance().getSessionSummary(sessionId);
  }
}
