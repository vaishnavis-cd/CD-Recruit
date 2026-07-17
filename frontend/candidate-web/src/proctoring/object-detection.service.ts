import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";
import { ObjectDetectionResult } from "./proctoring.types";

export class ObjectDetectionService {
  private static instance: ObjectDetectionService | null = null;
  private detector: ObjectDetector | null = null;
  private isLoading = false;
  private isLoaded = false;

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
      console.log("Loading MediaPipe Object Detector model...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
      );

      this.detector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        scoreThreshold: 0.35,
      });

      this.isLoaded = true;
      this.isLoading = false;
      console.log("MediaPipe Object Detector model loaded successfully.");
    } catch (err) {
      this.isLoading = false;
      console.error("Failed to load Object Detector model:", err);
      throw err;
    }
  }

  /**
   * Run object detection on a frame.
   */
  public detect(videoElement: HTMLVideoElement): ObjectDetectionResult {
    if (!this.isLoaded || !this.detector) {
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

            // Log details in debug mode
            // console.debug(`Detected: ${label} with score: ${score}`);

            // Map COCO classes / labels to specified proctoring categories
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

      return {
        phoneDetected,
        headphonesDetected,
        bookDetected,
      };
    } catch (err) {
      console.error("Error during object detection:", err);
      return { phoneDetected: false, headphonesDetected: false, bookDetected: false };
    }
  }

  public isModelLoaded(): boolean {
    return this.isLoaded;
  }
}
