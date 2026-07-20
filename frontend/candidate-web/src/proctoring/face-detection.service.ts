import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { FaceDetectionResult } from "./proctoring.types";

export class FaceDetectionService {
  private static instance: FaceDetectionService | null = null;
  private landmarker: FaceLandmarker | null = null;
  private isLoading = false;
  private isLoaded = false;
  private detectCount = 0;

  private constructor() {}

  public static getInstance(): FaceDetectionService {
    if (!FaceDetectionService.instance) {
      FaceDetectionService.instance = new FaceDetectionService();
    }
    return FaceDetectionService.instance;
  }

  /**
   * Load the MediaPipe Face Landmarker model.
   */
  public async loadModel(): Promise<void> {
    if (this.isLoaded || this.isLoading) return;

    this.isLoading = true;
    try {
      console.log("[FaceDetection] FACE_MODEL_LOADING: Loading MediaPipe Face Landmarker wasm resolver...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm",
      );

      console.log("[FaceDetection] Loading Face Landmarker task model from Google storage...");
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker_with_blendshapes/float16/1/face_landmarker_with_blendshapes.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numFaces: 4,
      });

      this.isLoaded = true;
      this.isLoading = false;
      console.log("[FaceDetection] FACE_MODEL_LOADED: MediaPipe Face Landmarker initialized.");
    } catch (err) {
      this.isLoading = false;
      console.error("[FaceDetection] Failed to load Face Landmarker model:", err);
      throw err;
    }
  }

  /**
   * Process a frame and return face detection metadata.
   */
  public detect(videoElement: HTMLVideoElement): FaceDetectionResult {
    this.detectCount++;
    if (!this.isLoaded || !this.landmarker) {
      if (this.detectCount % 15 === 1) {
        console.warn("[FaceDetection] Face Landmarker model is not loaded yet.");
      }
      return { faceDetected: false, faceCount: 0, headDirection: "CENTER" };
    }

    try {
      const result = this.landmarker.detect(videoElement);

      if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
        const fallbackRes: FaceDetectionResult = {
          faceDetected: false,
          faceCount: 0,
          headDirection: "CENTER",
        };
        if (this.detectCount % 15 === 1) {
          console.log("[FaceDetection] Result:", JSON.stringify(fallbackRes));
        }
        return fallbackRes;
      }

      const faceCount = result.faceLandmarks.length;
      const landmarks = result.faceLandmarks[0]; // Primary face

      const nose = landmarks[4];
      const leftBoundary = landmarks[234];
      const rightBoundary = landmarks[454];
      const forehead = landmarks[10];
      const chin = landmarks[152];

      if (!nose || !leftBoundary || !rightBoundary || !forehead || !chin) {
        const partialRes: FaceDetectionResult = {
          faceDetected: true,
          faceCount,
          headDirection: "CENTER",
        };
        if (this.detectCount % 15 === 1) {
          console.log("[FaceDetection] Result (Partial Landmarks):", JSON.stringify(partialRes));
        }
        return partialRes;
      }

      // Horizontal head orientation (Yaw)
      const distToLeft = Math.abs(nose.x - leftBoundary.x);
      const distToRight = Math.abs(rightBoundary.x - nose.x);
      const horizontalRatio = distToLeft / (distToRight || 0.001);

      // Vertical head orientation (Pitch)
      const distToTop = Math.abs(nose.y - forehead.y);
      const distToBottom = Math.abs(chin.y - nose.y);
      const verticalRatio = distToTop / (distToBottom || 0.001);

      let headDirection: "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN" = "CENTER";

      if (horizontalRatio < 0.6) {
        headDirection = "LEFT";
      } else if (horizontalRatio > 1.6) {
        headDirection = "RIGHT";
      } else if (verticalRatio < 0.7) {
        headDirection = "UP";
      } else if (verticalRatio > 1.35) {
        headDirection = "DOWN";
      }

      let blinkDetected = false;
      if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
        const categories = result.faceBlendshapes[0].categories;
        const blinkLeft = categories.find((c) => c.categoryName === "eyeBlinkLeft")?.score ?? 0;
        const blinkRight = categories.find((c) => c.categoryName === "eyeBlinkRight")?.score ?? 0;
        if (blinkLeft > 0.45 || blinkRight > 0.45) {
          blinkDetected = true;
        }
      }

      const finalRes: FaceDetectionResult = {
        faceDetected: true,
        faceCount,
        headDirection,
        blinkDetected,
      };

      if (this.detectCount % 15 === 1) {
        console.log(
          `[FaceDetection] Result: ${JSON.stringify(finalRes)} (horizontalRatio=${horizontalRatio.toFixed(
            3,
          )}, verticalRatio=${verticalRatio.toFixed(3)})`,
        );
      }

      return finalRes;
    } catch (err) {
      console.error("[FaceDetection] Error during landmark detection:", err);
      return { faceDetected: false, faceCount: 0, headDirection: "CENTER" };
    }
  }

  public isModelLoaded(): boolean {
    return this.isLoaded;
  }
}
