import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { FaceDetectionResult } from "./proctoring.types";

export class FaceDetectionService {
  private static instance: FaceDetectionService | null = null;
  private landmarker: FaceLandmarker | null = null;
  private isLoading = false;
  private isLoaded = false;
  private detectCount = 0;

  // Blink accumulator — counts consecutive frames with elevated blink score
  // A real blink spans ~150-400ms; smoothed VIDEO mode dampens peak scores.
  // We require 2 consecutive detections (~200ms) to confirm a blink.
  private blinkFrameCount = 0;
  private static readonly BLINK_THRESHOLD = 0.15;  // lowered from 0.3 (smoothing dampens peaks)
  private static readonly BLINK_FRAMES_REQUIRED = 2; // consecutive frames needed to confirm

  private constructor() {}

  public static getInstance(): FaceDetectionService {
    if (!FaceDetectionService.instance) {
      FaceDetectionService.instance = new FaceDetectionService();
    }
    return FaceDetectionService.instance;
  }

  /**
   * Load the MediaPipe Face Landmarker model.
   * WASM and model are served from /mediapipe/ (copied from node_modules at build/dev time)
   * to avoid CDN dependency and COEP cross-origin issues.
   */
  public async loadModel(): Promise<void> {
    if (this.isLoaded || this.isLoading) return;

    this.isLoading = true;
    try {
      console.log("[FaceDetection] Loading MediaPipe Face Landmarker from local assets...");

      const vision = await FilesetResolver.forVisionTasks("/mediapipe");

      console.log("[FaceDetection] Loading Face Landmarker task model from local /models/face_landmarker.task...");
      try {
        this.landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "/models/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 4,
          outputFaceBlendshapes: true,
        });
      } catch (gpuErr) {
        console.warn("[FaceDetection] GPU delegate failed for Face Landmarker, falling back to CPU:", gpuErr);
        this.landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "/models/face_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 4,
          outputFaceBlendshapes: true,
        });
      }

      this.isLoaded = true;
      this.isLoading = false;
      console.log("[FaceDetection] FACE_MODEL_LOADED: Face Landmarker ready.");
    } catch (err) {
      this.isLoading = false;
      console.error("[FaceDetection] Failed to load Face Landmarker model:", err);
      throw err;
    }
  }

  /**
   * Process a single video frame. Must only be called once the model is loaded.
   * Uses detectForVideo() with a monotonically increasing timestamp for VIDEO mode.
   */
  public detect(videoElement: HTMLVideoElement): FaceDetectionResult {
    this.detectCount++;

    if (!this.isLoaded || !this.landmarker) {
      return { faceDetected: false, faceCount: 0, headDirection: "CENTER" };
    }

    // Guard: video must have actual frame data before we call detect
    if (
      videoElement.readyState < 2 ||        // HAVE_CURRENT_DATA
      videoElement.videoWidth === 0 ||
      videoElement.paused
    ) {
      return { faceDetected: false, faceCount: 0, headDirection: "CENTER" };
    }

    try {
      const result = this.landmarker.detectForVideo(videoElement, performance.now());

      if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
        return { faceDetected: false, faceCount: 0, headDirection: "CENTER" };
      }

      const faceCount = result.faceLandmarks.length;
      const landmarks = result.faceLandmarks[0];

      const nose = landmarks[4];
      const leftBoundary = landmarks[234];
      const rightBoundary = landmarks[454];
      const forehead = landmarks[10];
      const chin = landmarks[152];

      if (!nose || !leftBoundary || !rightBoundary || !forehead || !chin) {
        return { faceDetected: true, faceCount, headDirection: "CENTER" };
      }

      // Head yaw (left/right)
      const distToLeft = Math.abs(nose.x - leftBoundary.x);
      const distToRight = Math.abs(rightBoundary.x - nose.x);
      const horizontalRatio = distToLeft / (distToRight || 0.001);

      // Head pitch (up/down)
      const distToTop = Math.abs(nose.y - forehead.y);
      const distToBottom = Math.abs(chin.y - nose.y);
      const verticalRatio = distToTop / (distToBottom || 0.001);

      let headDirection: "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN" = "CENTER";
      if (horizontalRatio < 0.6) headDirection = "LEFT";
      else if (horizontalRatio > 1.6) headDirection = "RIGHT";
      else if (verticalRatio < 0.7) headDirection = "UP";
      else if (verticalRatio > 1.35) headDirection = "DOWN";

      let blinkDetected = false;

      // ── Primary: Blendshape blink detection ───────────────────────────────
      // VIDEO mode temporal smoothing can dampen transient blink peaks from ~0.9
      // down to ~0.15-0.2 by the time the 100ms poll fires. Threshold is 0.15.
      // We require BLINK_FRAMES_REQUIRED consecutive frames to confirm a real blink.
      if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
        const categories = result.faceBlendshapes[0].categories;
        const blinkLeft = categories.find(c => c.categoryName === "eyeBlinkLeft")?.score ?? 0;
        const blinkRight = categories.find(c => c.categoryName === "eyeBlinkRight")?.score ?? 0;

        if (this.detectCount % 10 === 1) {
          console.log(`[FaceDetection] blink scores — left: ${blinkLeft.toFixed(3)}, right: ${blinkRight.toFixed(3)}, accumulator: ${this.blinkFrameCount}, direction: ${headDirection}`);
        }

        if (blinkLeft > FaceDetectionService.BLINK_THRESHOLD || blinkRight > FaceDetectionService.BLINK_THRESHOLD) {
          this.blinkFrameCount++;
          if (this.blinkFrameCount >= FaceDetectionService.BLINK_FRAMES_REQUIRED) {
            blinkDetected = true;
          }
        } else {
          this.blinkFrameCount = 0;
        }
      }

      // ── Fallback: Eye Aspect Ratio (EAR) from landmarks ───────────────────
      // EAR is illumination-agnostic and more reliable on dark skin / low-light.
      // Uses 6 landmark points per eye (standard Dlib 68-point mapping on MediaPipe).
      // MediaPipe face landmark indices for left eye: 362,385,387,263,373,380
      // Right eye: 33,160,158,133,153,144
      if (!blinkDetected) {
        try {
          const L = (i: number) => landmarks[i];
          // Left eye EAR
          const earLeft = this.calcEAR(
            L(362), L(385), L(387), L(263), L(373), L(380)
          );
          // Right eye EAR
          const earRight = this.calcEAR(
            L(33), L(160), L(158), L(133), L(153), L(144)
          );
          // EAR < 0.2 indicates eye is significantly closed (blink)
          if (earLeft < 0.2 || earRight < 0.2) {
            blinkDetected = true;
            if (this.detectCount % 10 === 1) {
              console.log(`[FaceDetection] EAR fallback triggered — left: ${earLeft.toFixed(3)}, right: ${earRight.toFixed(3)}`);
            }
          }
        } catch {
          // landmark indices not available for this frame — ignore
        }
      }

      return { faceDetected: true, faceCount, headDirection, blinkDetected };
    } catch (err) {
      // Suppress noisy frame errors — only log occasionally
      if (this.detectCount % 30 === 1) {
        console.error("[FaceDetection] detect error:", err);
      }
      return { faceDetected: false, faceCount: 0, headDirection: "CENTER" };
    }
  }

  public isModelLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Eye Aspect Ratio (EAR) — ratio of vertical to horizontal eye openness.
   * Points: p1=outer corner, p2=upper-outer, p3=upper-inner,
   *         p4=inner corner, p5=lower-inner, p6=lower-outer
   * EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
   * A value < 0.2 reliably indicates a closed eye.
   */
  private calcEAR(
    p1: {x:number;y:number}, p2: {x:number;y:number}, p3: {x:number;y:number},
    p4: {x:number;y:number}, p5: {x:number;y:number}, p6: {x:number;y:number}
  ): number {
    const dist = (a: {x:number;y:number}, b: {x:number;y:number}) =>
      Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    const vertical = dist(p2, p6) + dist(p3, p5);
    const horizontal = 2 * dist(p1, p4);
    return horizontal > 0 ? vertical / horizontal : 1.0;
  }
}
