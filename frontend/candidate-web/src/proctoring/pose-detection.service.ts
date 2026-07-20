import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { PoseDetectionResult } from "./proctoring.types";

export class PoseDetectionService {
  private static instance: PoseDetectionService | null = null;
  private landmarker: PoseLandmarker | null = null;
  private isLoading = false;
  private isLoaded = false;
  private detectCount = 0;

  // Previous landmark coordinates to compute movement displacement
  private prevKeyPoints: { x: number; y: number }[] = [];

  private constructor() {}

  public static getInstance(): PoseDetectionService {
    if (!PoseDetectionService.instance) {
      PoseDetectionService.instance = new PoseDetectionService();
    }
    return PoseDetectionService.instance;
  }

  /**
   * Load the MediaPipe Pose Landmarker model.
   */
  public async loadModel(): Promise<void> {
    if (this.isLoaded || this.isLoading) return;

    this.isLoading = true;
    try {
      console.log("[PoseDetection] POSE_MODEL_LOADING: Loading MediaPipe Pose Landmarker wasm resolver...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm",
      );

      console.log("[PoseDetection] Loading Pose Landmarker task model from Google storage...");
      this.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
      });

      this.isLoaded = true;
      this.isLoading = false;
      console.log("[PoseDetection] POSE_MODEL_LOADED: MediaPipe Pose Landmarker initialized.");
    } catch (err) {
      this.isLoading = false;
      console.error("[PoseDetection] Failed to load Pose Landmarker model:", err);
      throw err;
    }
  }

  /**
   * Process a frame and return pose detection metadata.
   */
  public detect(videoElement: HTMLVideoElement): PoseDetectionResult {
    this.detectCount++;
    if (!this.isLoaded || !this.landmarker) {
      if (this.detectCount % 15 === 1) {
        console.warn("[PoseDetection] Pose Landmarker model is not loaded yet.");
      }
      return { inFrame: true, isLeavingSeat: false, isStanding: false, movementMetric: 0 };
    }

    try {
      const result = this.landmarker.detect(videoElement);

      if (!result || !result.landmarks || result.landmarks.length === 0) {
        const fallbackRes: PoseDetectionResult = {
          inFrame: false,
          isLeavingSeat: true,
          isStanding: false,
          movementMetric: 0,
        };
        if (this.detectCount % 15 === 1) {
          console.log("[PoseDetection] Result:", JSON.stringify(fallbackRes));
        }
        return fallbackRes;
      }

      const landmarks = result.landmarks[0]; // Primary body
      const nose = landmarks[0];
      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];

      const isPresent = !!(nose && leftShoulder && rightShoulder);

      if (!isPresent) {
        const missingRes: PoseDetectionResult = {
          inFrame: false,
          isLeavingSeat: true,
          isStanding: false,
          movementMetric: 0,
        };
        if (this.detectCount % 15 === 1) {
          console.log("[PoseDetection] Result (Missing Keypoints):", JSON.stringify(missingRes));
        }
        return missingRes;
      }

      const noseVisibility = nose.visibility ?? 1.0;
      const leftShoulderVisibility = leftShoulder.visibility ?? 1.0;
      const rightShoulderVisibility = rightShoulder.visibility ?? 1.0;

      const avgVisibility = (noseVisibility + leftShoulderVisibility + rightShoulderVisibility) / 3;
      const isLeavingSeat = avgVisibility < 0.45;

      const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
      const isStanding = avgShoulderY < 0.3;

      let movementMetric = 0;
      const currentKeyPoints = [nose, leftShoulder, rightShoulder];

      if (this.prevKeyPoints.length === currentKeyPoints.length) {
        let totalDisplacement = 0;
        for (let i = 0; i < currentKeyPoints.length; i++) {
          const curr = currentKeyPoints[i];
          const prev = this.prevKeyPoints[i];
          const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
          totalDisplacement += dist;
        }
        movementMetric = totalDisplacement / currentKeyPoints.length;
      }

      this.prevKeyPoints = currentKeyPoints.map((kp) => ({ x: kp.x, y: kp.y }));

      const finalRes: PoseDetectionResult = {
        inFrame: true,
        isLeavingSeat,
        isStanding,
        movementMetric,
      };

      if (this.detectCount % 15 === 1) {
        console.log(
          `[PoseDetection] Result: ${JSON.stringify(finalRes)} (avgVisibility=${avgVisibility.toFixed(
            3,
          )}, avgShoulderY=${avgShoulderY.toFixed(3)})`,
        );
      }

      return finalRes;
    } catch (err) {
      console.error("[PoseDetection] Error during pose landmark detection:", err);
      return { inFrame: true, isLeavingSeat: false, isStanding: false, movementMetric: 0 };
    }
  }

  public isModelLoaded(): boolean {
    return this.isLoaded;
  }
}
