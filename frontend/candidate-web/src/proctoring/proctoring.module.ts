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

      // 2. Start rolling buffer recorder
      RollingBufferService.getInstance().start(stream);

      // 3. Load computer vision models in parallel
      console.log("[Proctoring] Initializing computer vision models...");
      await Promise.all([
        FaceDetectionService.getInstance().loadModel(),
        PoseDetectionService.getInstance().loadModel(),
        ObjectDetectionService.getInstance().loadModel(),
      ]);

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
        const faceRes = FaceDetectionService.getInstance().detect(video);
        const poseRes = PoseDetectionService.getInstance().detect(video);
        const objectRes = ObjectDetectionService.getInstance().detect(video);

        engine.evaluate(faceRes, poseRes, objectRes, timestamp);
      });

      // Start processing frames
      processor.start();

      this.isRunning = true;
      console.log("[Proctoring] Proctoring module fully running.");
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
