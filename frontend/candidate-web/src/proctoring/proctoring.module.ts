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
import { runCapabilityCheck, CapabilityReport } from "./capability-check";

export class ProctoringModule {
  private static instance: ProctoringModule | null = null;
  private isRunning = false;
  private sessionId = "";
  private startingPromise: Promise<boolean> | null = null;
  private capabilityReport: CapabilityReport | null = null;

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
   * Runs pre-flight WASM capability check, initializes models, camera, and rolling buffers.
   * Returns true if successful, false if camera access is denied.
   */
  public async start(sessionId: string): Promise<boolean> {
    if (this.isRunning) {
      if (sessionId && this.sessionId !== sessionId) {
        console.log(`[Proctoring] Updating active proctoring session ID from ${this.sessionId} to ${sessionId}`);
        this.sessionId = sessionId;
        DetectionEngineService.getInstance().setSessionId(sessionId);
      }
      return true;
    }
    if (this.startingPromise) return this.startingPromise;

    this.startingPromise = (async () => {
      const startTime = performance.now();
      this.sessionId = sessionId;
      console.log(`[Proctoring] [PRE-FLIGHT] Executing WASM benchmark & capability check for session: ${sessionId}...`);

      this.capabilityReport = await runCapabilityCheck();

      const webcam = WebcamService.getInstance();
      const hasPermission = await webcam.requestPermission();

      if (!hasPermission) {
        console.warn(`[Proctoring] [STEP 1 FAILURE] Webcam permission denied (${(performance.now() - startTime).toFixed(1)}ms). Running in REDUCED mode.`);
        return false;
      }

      try {
        // STEP 1: Webcam
        const stream = await webcam.start();
        const videoElement = webcam.getVideoElement();
        console.log(`[Proctoring] [STEP 1 SUCCESS] Camera acquired, streamId=${stream.id} (${(performance.now() - startTime).toFixed(1)}ms)`);

        // STEP 2: Rolling Buffer
        const step2Start = performance.now();
        console.log(`[Proctoring] [STEP 2 START] Initializing Rolling Buffer...`);
        RollingBufferService.getInstance().start(stream);
        console.log(`[Proctoring] [STEP 2 SUCCESS] Rolling Buffer active (${(performance.now() - step2Start).toFixed(1)}ms)`);

        // STEP 3-5: Vision Models
        const step3Start = performance.now();
        console.log("[Proctoring] [STEP 3-5 START] Initializing Computer Vision models (Face, Pose, Object)...");
        const modelResults = await Promise.allSettled([
          FaceDetectionService.getInstance().loadModel(),
          PoseDetectionService.getInstance().loadModel(),
          ObjectDetectionService.getInstance().loadModel(),
        ]);

        const faceModelOk = modelResults[0].status === "fulfilled";
        const poseModelOk = modelResults[1].status === "fulfilled";
        const objectModelOk = modelResults[2].status === "fulfilled";

        if (modelResults[0].status === "rejected") {
          console.warn("[Proctoring] [STEP 3 FAILURE] Face Landmarker failed:", modelResults[0].reason);
        } else console.log(`[Proctoring] [STEP 3 SUCCESS] Face Landmarker loaded (${(performance.now() - step3Start).toFixed(1)}ms)`);

        if (modelResults[1].status === "rejected") {
          console.warn("[Proctoring] [STEP 4 FAILURE] Pose Landmarker failed:", modelResults[1].reason);
        } else console.log(`[Proctoring] [STEP 4 SUCCESS] Pose Landmarker loaded (${(performance.now() - step3Start).toFixed(1)}ms)`);

        if (modelResults[2].status === "rejected") {
          console.warn("[Proctoring] [STEP 5 FAILURE] Object Detector failed:", modelResults[2].reason);
        } else console.log(`[Proctoring] [STEP 5 SUCCESS] Object Detector loaded (${(performance.now() - step3Start).toFixed(1)}ms)`);

        // STEP 6 & 7: Engine & Frame Processor setup
        console.log("[Proctoring] [STEP 6-7 START] Initializing Frame Processor & Detection Engine...");
        const engine = DetectionEngineService.getInstance();
        engine.setSessionId(sessionId);

        // STEP 8: Event Listeners
        console.log("[Proctoring] [STEP 8 START] Registering Evidence Upload event listeners...");
        this.unsubscribeEvents = engine.subscribe(async (event) => {
          try {
            const activeStream = webcam.getStream();
            if (activeStream) {
              console.log(`[Proctoring] Triggering evidence clip capture for event: ${event.eventType}`);
              const clipBlob = await EvidenceCaptureService.getInstance().captureClip(activeStream);
              await EvidenceUploadService.getInstance().uploadEvidence(sessionId, event, clipBlob);
            }
          } catch (err: any) {
            console.error("[Proctoring] Failed to process evidence capture for event:", event.eventType, err?.stack || err);
          }
        });
        console.log("[Proctoring] [STEP 8 SUCCESS] Event listeners registered.");

        // Connect frame processor loop to models and evaluator
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

        // STEP 9: Start Processing Frames
        console.log("[Proctoring] [STEP 9 START] Starting FrameProcessor loop...");
        processor.start();
        console.log("[Proctoring] [STEP 9 SUCCESS] FrameProcessor loop active.");

        // Start audio detection service if microphone consent is granted
        if (localStorage.getItem("cd-recruit-mic-consent") === "true") {
          AudioDetectionService.getInstance().start(stream);
        }

        this.isRunning = true;

        // STEP 10: Startup Complete
        const totalDuration = (performance.now() - startTime).toFixed(1);
        console.log(`\n==================================================`);
        console.log(`🚀 [STEP 10 SUCCESS] PROCTORING PIPELINE FULLY INITIALIZED (${totalDuration}ms):`);
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
      } catch (err: any) {
        console.error("[Proctoring] Critical error during proctoring initialization:", err?.stack || err);
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
