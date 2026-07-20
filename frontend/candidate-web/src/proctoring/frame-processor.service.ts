import { WebcamService } from "./webcam.service";
import { CONFIG } from "./proctoring.constants";

export type FrameListener = (video: HTMLVideoElement, timestamp: number) => void;

export class FrameProcessorService {
  private static instance: FrameProcessorService | null = null;
  private timerId: any = null;
  private isProcessing = false;
  private listeners: FrameListener[] = [];
  private frameCount = 0;

  private constructor() {}

  public static getInstance(): FrameProcessorService {
    if (!FrameProcessorService.instance) {
      FrameProcessorService.instance = new FrameProcessorService();
    }
    return FrameProcessorService.instance;
  }

  /**
   * Register a listener to receive processed frames.
   */
  public subscribe(listener: FrameListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Start the frame capture loop.
   */
  public start(): void {
    if (this.isProcessing) return;

    console.log("[FrameProcessor] FRAME_PROCESSOR_STARTED: Initiating loop...");
    this.isProcessing = true;
    this.frameCount = 0;
    const webcam = WebcamService.getInstance();

    const loop = async () => {
      if (!this.isProcessing) return;

      try {
        const video = webcam.getVideoElement();
        if (video) {
          if (video.readyState >= 2 && !video.paused) {
            this.frameCount++;
            if (this.frameCount % 15 === 1) {
              console.log(
                `[FrameProcessor] FRAME_RECEIVED. Total processed frames: ${this.frameCount}. Subscribers count: ${this.listeners.length}`,
              );
            }

            const timestamp = Date.now();
            // Distribute to all subscribers
            for (const listener of this.listeners) {
              try {
                listener(video, timestamp);
              } catch (err) {
                console.error("Error in frame listener execution:", err);
              }
            }
          } else {
            // Log periodically if video element isn't ready
            if (this.frameCount % 15 === 0) {
              console.warn(
                `[FrameProcessor] Video not ready for frames: readyState=${video.readyState}, paused=${video.paused}`,
              );
            }
          }
        } else {
          console.warn("[FrameProcessor] Webcam video element is null or undefined.");
        }
      } catch (err) {
        console.error("Frame processing execution error:", err);
      }

      this.timerId = setTimeout(loop, CONFIG.FRAME_INTERVAL_MS);
    };

    this.timerId = setTimeout(loop, CONFIG.FRAME_INTERVAL_MS);
  }

  /**
   * Stop the frame capture loop.
   */
  public stop(): void {
    console.log(`[FrameProcessor] Stopping frame loop. Total frames processed: ${this.frameCount}`);
    this.isProcessing = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.listeners = [];
  }
}
