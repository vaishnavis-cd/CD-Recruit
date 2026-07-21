import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";
import { ObjectDetectionResult } from "./proctoring.types";

export class ObjectDetectionService {
  private static instance: ObjectDetectionService | null = null;
  private detector: ObjectDetector | null = null;
  private isLoading = false;
  private isLoaded = false;
  private detectCount = 0;

  private constructor() {}

  public static getInstance(): ObjectDetectionService {
    if (!ObjectDetectionService.instance) {
      ObjectDetectionService.instance = new ObjectDetectionService();
    }
    return ObjectDetectionService.instance;
  }

  /**
   * Load the MediaPipe Object Detector model.
   */
  public async loadModel(): Promise<void> {
    if (this.isLoaded || this.isLoading) return;

    this.isLoading = true;
    try {
      console.log("[ObjectDetection] OBJECT_MODEL_LOADING: Loading MediaPipe Object Detector resolver...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm",
      );

      console.log("[ObjectDetection] Loading Object Detector task model from Google storage...");
      try {
        this.detector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.task",
            delegate: "GPU",
          },
          runningMode: "IMAGE",
          scoreThreshold: 0.35,
        });
      } catch (gpuErr) {
        console.warn("[ObjectDetection] GPU delegate failed for Object Detector, falling back to CPU:", gpuErr);
        this.detector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.task",
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          scoreThreshold: 0.35,
        });
      }

      this.isLoaded = true;
      this.isLoading = false;
      console.log("[ObjectDetection] OBJECT_MODEL_LOADED: MediaPipe Object Detector initialized.");
    } catch (err) {
      this.isLoading = false;
      console.error("[ObjectDetection] Failed to load Object Detector model:", err);
      throw err;
    }
  }

  /**
   * Run object detection on a frame.
   */
  public detect(videoElement: HTMLVideoElement): ObjectDetectionResult {
    this.detectCount++;
    if (!this.isLoaded || !this.detector) {
      if (this.detectCount % 15 === 1) {
        console.warn("[ObjectDetection] Object Detector model is not loaded yet.");
      }
      return { phoneDetected: false, headphonesDetected: false, bookDetected: false };
    }

    try {
      const result = this.detector.detect(videoElement);

      let phoneDetected = false;
      let headphonesDetected = false;
      let bookDetected = false;

      if (result && result.detections) {
        for (const detection of result.detections) {
          if (!detection.categories) continue;

          for (const category of detection.categories) {
            const label = category.categoryName.toLowerCase();
            const score = category.score;

            if (
              label.includes("cell phone") ||
              label.includes("phone") ||
              label.includes("mobile") ||
              label.includes("telephone")
            ) {
              phoneDetected = true;
            } else if (
              label.includes("headphone") ||
              label.includes("earphone") ||
              label.includes("headset") ||
              label.includes("headphones")
            ) {
              headphonesDetected = true;
            } else if (
              label.includes("book") ||
              label.includes("notes") ||
              label.includes("notebook") ||
              label.includes("document") ||
              label.includes("paper")
            ) {
              bookDetected = true;
            }
          }
        }
      }

      const finalRes: ObjectDetectionResult = {
        phoneDetected,
        headphonesDetected,
        bookDetected,
      };

      if (this.detectCount % 15 === 1) {
        console.log(`[ObjectDetection] Result: ${JSON.stringify(finalRes)}`);
      }

      return finalRes;
    } catch (err) {
      console.error("[ObjectDetection] Error during object detection:", err);
      return { phoneDetected: false, headphonesDetected: false, bookDetected: false };
    }
  }

  public isModelLoaded(): boolean {
    return this.isLoaded;
  }
}
