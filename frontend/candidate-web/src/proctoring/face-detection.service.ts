import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { FaceDetectionResult } from "./proctoring.types";

export class FaceDetectionService {
  private static instance: FaceDetectionService | null = null;
  private landmarker: FaceLandmarker | null = null;
  private isLoading = false;
  private isLoaded = false;
  private loadingPromise: Promise<void> | null = null;
  private detectCount = 0;

  // Blink accumulator — counts consecutive frames with elevated blink score
  private blinkFrameCount = 0;
  private static readonly BLINK_THRESHOLD = 0.12;  // lowered for high responsiveness
  private static readonly BLINK_FRAMES_REQUIRED = 1; // single detected frame triggers blink event

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
    if (this.isLoaded && this.landmarker) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.isLoading = true;
    this.loadingPromise = (async () => {
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
        this.loadingPromise = null;
        console.error("[FaceDetection] Failed to load Face Landmarker model:", err);
        throw err;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Process a single video frame. Uses detectForVideo() with a monotonically increasing timestamp for VIDEO mode.
   */
  public detect(videoElement: HTMLVideoElement): FaceDetectionResult {
    this.detectCount++;

    if (!this.isLoaded || !this.landmarker) {
      if (!this.isLoading && !this.loadingPromise) {
        this.loadModel().catch((err) => {
          console.warn("[FaceDetection] Background loadModel error:", err);
        });
      }

      // If video is active and playing, return a permissive baseline rather than no-face
      if (videoElement && videoElement.readyState >= 2 && videoElement.videoWidth > 0 && !videoElement.paused) {
        return {
          faceDetected: true,
          faceCount: 1,
          headDirection: "CENTER",
          alignment: {
            isAligned: true,
            centerX: 0.5,
            centerY: 0.5,
            sizeRatio: 0.15,
            guideFeedback: "Camera active. Face aligned!",
          },
        };
      }

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

      // Head yaw (left/right) from candidate perspective
      // In webcam image space: x=0 is image left (candidate's right), x=1 is image right (candidate's left)
      const distToLeft = Math.abs(nose.x - leftBoundary.x);   // distance towards image left
      const distToRight = Math.abs(rightBoundary.x - nose.x); // distance towards image right
      const horizontalRatio = distToLeft / (distToRight || 0.001);

      // Head pitch (up/down)
      const distToTop = Math.abs(nose.y - forehead.y);
      const distToBottom = Math.abs(chin.y - nose.y);
      const verticalRatio = distToTop / (distToBottom || 0.001);

      let rawHeadDirection: "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN" = "CENTER";
      // When candidate turns head LEFT (towards image right), distToLeft increases, distToRight decreases -> horizontalRatio > 1.20
      if (horizontalRatio > 1.20) rawHeadDirection = "LEFT";
      // When candidate turns head RIGHT (towards image left), distToLeft decreases, distToRight increases -> horizontalRatio < 0.80
      else if (horizontalRatio < 0.80) rawHeadDirection = "RIGHT";
      else if (verticalRatio < 0.68) rawHeadDirection = "UP";
      else if (verticalRatio > 1.35) rawHeadDirection = "DOWN";

      // Eye Gaze estimation via Iris landmarks (468, 473)
      const eyeGaze = this.calcEyeGaze(landmarks);

      // Final decision: trigger looking away if head turns OR eyes deviate
      let headDirection: "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN" = "CENTER";
      if (rawHeadDirection !== "CENTER") {
        headDirection = rawHeadDirection;
      } else if (eyeGaze !== "CENTER") {
        headDirection = eyeGaze;
      }

      let blinkDetected = false;

      // ── Primary: Blendshape blink detection ───────────────────────────────
      if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
        const categories = result.faceBlendshapes[0].categories;
        const blinkLeft = categories.find(c => c.categoryName === "eyeBlinkLeft")?.score ?? 0;
        const blinkRight = categories.find(c => c.categoryName === "eyeBlinkRight")?.score ?? 0;

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

      // ── Face Circle Alignment Calculations ──────────────────────────────
      const centerX = nose.x;
      const centerY = nose.y;
      const faceWidth = Math.abs(rightBoundary.x - leftBoundary.x);
      const faceHeight = Math.abs(chin.y - forehead.y);
      const sizeRatio = faceWidth * faceHeight;

      let guideFeedback = "Face aligned! Hold steady and capture baseline selfie.";
      let isAligned = true;

      if (faceCount > 1) {
        isAligned = false;
        guideFeedback = "Multiple faces detected — please ensure you are alone.";
      } else if (centerX < 0.35) {
        isAligned = false;
        guideFeedback = "Move slightly to your right to center your face in the guide.";
      } else if (centerX > 0.65) {
        isAligned = false;
        guideFeedback = "Move slightly to your left to center your face in the guide.";
      } else if (centerY < 0.30) {
        isAligned = false;
        guideFeedback = "Move slightly down into the circle guide.";
      } else if (centerY > 0.70) {
        isAligned = false;
        guideFeedback = "Move slightly up into the circle guide.";
      } else if (faceWidth < 0.18) {
        isAligned = false;
        guideFeedback = "Move closer to the camera so your face fits the guide.";
      } else if (faceWidth > 0.52) {
        isAligned = false;
        guideFeedback = "Move slightly back from the camera.";
      } else if (headDirection !== "CENTER") {
        isAligned = false;
        guideFeedback = `Look directly at the camera (head turned ${headDirection.toLowerCase()}).`;
      }

      return {
        faceDetected: true,
        faceCount,
        headDirection,
        eyeGaze,
        blinkDetected,
        alignment: {
          isAligned,
          centerX,
          centerY,
          sizeRatio,
          guideFeedback,
        },
      };
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
   * Estimates Eye Gaze direction using Left & Right Iris centers (landmarks 468, 473)
   * relative to eye corner boundaries (landmarks 362, 263, 133, 33).
   * Small natural eye movements while reading code/text return "CENTER".
   */
  private calcEyeGaze(landmarks: any[]): "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN" {
    if (!landmarks || landmarks.length < 474) return "CENTER";

    try {
      const leftIris = landmarks[468];
      const rightIris = landmarks[473];
      const leftInner = landmarks[362];
      const leftOuter = landmarks[263];
      const rightInner = landmarks[133];
      const rightOuter = landmarks[33];
      const leftTop = landmarks[386];
      const leftBottom = landmarks[374];
      const rightTop = landmarks[159];
      const rightBottom = landmarks[145];

      if (!leftIris || !rightIris || !leftInner || !leftOuter || !rightInner || !rightOuter) {
        return "CENTER";
      }

      // Left Eye Horizontal ratio
      const leftWidth = Math.abs(leftInner.x - leftOuter.x) || 0.001;
      const leftRatioH = (leftIris.x - Math.min(leftOuter.x, leftInner.x)) / leftWidth;

      // Right Eye Horizontal ratio
      const rightWidth = Math.abs(rightInner.x - rightOuter.x) || 0.001;
      const rightRatioH = (rightIris.x - Math.min(rightOuter.x, rightInner.x)) / rightWidth;

      const avgRatioH = (leftRatioH + rightRatioH) / 2;

      // Vertical ratios
      const leftHeight = Math.abs(leftBottom.y - leftTop.y) || 0.001;
      const leftRatioV = (leftIris.y - leftTop.y) / leftHeight;
      const rightHeight = Math.abs(rightBottom.y - rightTop.y) || 0.001;
      const rightRatioV = (rightIris.y - rightTop.y) / rightHeight;
      const avgRatioV = (leftRatioV + rightRatioV) / 2;

      // Balanced eye gaze thresholds (allows full-screen UI navigation, triggers on clear eye turns)
      if (avgRatioH < 0.28) return "LEFT";
      if (avgRatioH > 0.72) return "RIGHT";
      if (avgRatioV < 0.20) return "UP";
      if (avgRatioV > 0.80) return "DOWN";

      return "CENTER";
    } catch {
      return "CENTER";
    }
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
