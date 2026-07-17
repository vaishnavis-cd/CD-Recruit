import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { FaceDetectionResult } from "./proctoring.types";

export class FaceDetectionService {
  private static instance: FaceDetectionService | null = null;
  private landmarker: FaceLandmarker | null = null;
  private isLoading = false;
  private isLoaded = false;

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
      console.log("Loading MediaPipe Face Landmarker model...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
      );

      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker_with_blendshapes/float16/1/face_landmarker_with_blendshapes.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numFaces: 4,
      });

      this.isLoaded = true;
      this.isLoading = false;
      console.log("MediaPipe Face Landmarker model loaded successfully.");
    } catch (err) {
      this.isLoading = false;
      console.error("Failed to load Face Landmarker model:", err);
      throw err;
    }
  }

  /**
   * Process a frame and return face detection metadata.
   */
  public detect(videoElement: HTMLVideoElement): FaceDetectionResult {
    if (!this.isLoaded || !this.landmarker) {
      return { faceDetected: false, faceCount: 0, headDirection: "CENTER" };
    }

    try {
      const result = this.landmarker.detect(videoElement);

      if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
        return { faceDetected: false, faceCount: 0, headDirection: "CENTER" };
      }

      const faceCount = result.faceLandmarks.length;
      const landmarks = result.faceLandmarks[0]; // Primary face

      // Key landmark indices:
      // Nose Tip: 4
      // Left cheek/edge boundary: 234
      // Right cheek/edge boundary: 454
      // Forehead top boundary: 10
      // Chin bottom boundary: 152

      const nose = landmarks[4];
      const leftBoundary = landmarks[234];
      const rightBoundary = landmarks[454];
      const forehead = landmarks[10];
      const chin = landmarks[152];

      if (!nose || !leftBoundary || !rightBoundary || !forehead || !chin) {
        return { faceDetected: true, faceCount, headDirection: "CENTER" };
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

      // Coarse orientation logic
      if (horizontalRatio < 0.6) {
        headDirection = "LEFT";
      } else if (horizontalRatio > 1.6) {
        headDirection = "RIGHT";
      } else if (verticalRatio < 0.7) {
        headDirection = "UP";
      } else if (verticalRatio > 1.35) {
        headDirection = "DOWN";
      }

      return {
        faceDetected: true,
        faceCount,
        headDirection,
      };
    } catch (err) {
      console.error("Error during face landmark detection:", err);
      return { faceDetected: false, faceCount: 0, headDirection: "CENTER" };
    }
  }

  public isModelLoaded(): boolean {
    return this.isLoaded;
  }
}
