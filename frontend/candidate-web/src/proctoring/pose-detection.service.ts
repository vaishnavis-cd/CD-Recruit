import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { PoseDetectionResult } from "./proctoring.types";

export class PoseDetectionService {
  private static instance: PoseDetectionService | null = null;
  private landmarker: PoseLandmarker | null = null;
  private isLoading = false;
  private isLoaded = false;

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
      console.log("Loading MediaPipe Pose Landmarker model...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
      );

      this.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
      });

      this.isLoaded = true;
      this.isLoading = false;
      console.log("MediaPipe Pose Landmarker model loaded successfully.");
    } catch (err) {
      this.isLoading = false;
      console.error("Failed to load Pose Landmarker model:", err);
      throw err;
    }
  }

  /**
   * Process a frame and return pose detection metadata.
   */
  public detect(videoElement: HTMLVideoElement): PoseDetectionResult {
    if (!this.isLoaded || !this.landmarker) {
      return { inFrame: true, isLeavingSeat: false, isStanding: false, movementMetric: 0 };
    }

    try {
      const result = this.landmarker.detect(videoElement);

      if (!result || !result.landmarks || result.landmarks.length === 0) {
        // No body detected
        return {
          inFrame: false,
          isLeavingSeat: true,
          isStanding: false,
          movementMetric: 0,
        };
      }

      const landmarks = result.landmarks[0]; // Primary body
      // Key points:
      // Nose: 0
      // Left shoulder: 11
      // Right shoulder: 12
      const nose = landmarks[0];
      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];

      // 1. Candidate presence check
      // If shoulders and nose are missing or have very low coordinates, we consider them out of frame
      const isPresent = !!(nose && leftShoulder && rightShoulder);

      if (!isPresent) {
        return {
          inFrame: false,
          isLeavingSeat: true,
          isStanding: false,
          movementMetric: 0,
        };
      }

      // 2. Seat Exit check (leaving seat)
      // If the visibility metric of key face/torso features is low, we assume they are leaving the frame
      const noseVisibility = nose.visibility ?? 1.0;
      const leftShoulderVisibility = leftShoulder.visibility ?? 1.0;
      const rightShoulderVisibility = rightShoulder.visibility ?? 1.0;

      const avgVisibility = (noseVisibility + leftShoulderVisibility + rightShoulderVisibility) / 3;
      const isLeavingSeat = avgVisibility < 0.45; // If visibility drops significantly

      // 3. Standing up check
      // Normally candidate shoulder y-coordinates are around 0.5 - 0.8 in the image frame.
      // If they stand up, shoulders rise up (y-value decreases to < 0.25).
      const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
      const isStanding = avgShoulderY < 0.3;

      // 4. Movement Metric calculation (displacement from previous frame)
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

      // Update previous coordinates
      this.prevKeyPoints = currentKeyPoints.map((kp) => ({ x: kp.x, y: kp.y }));

      return {
        inFrame: true,
        isLeavingSeat,
        isStanding,
        movementMetric,
      };
    } catch (err) {
      console.error("Error during pose landmark detection:", err);
      return { inFrame: true, isLeavingSeat: false, isStanding: false, movementMetric: 0 };
    }
  }

  public isModelLoaded(): boolean {
    return this.isLoaded;
  }
}
