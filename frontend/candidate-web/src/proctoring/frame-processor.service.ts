import { WebcamService } from "./webcam.service";
import { CONFIG } from "./proctoring.constants";

export type FrameListener = (video: HTMLVideoElement, timestamp: number) => void;

export class FrameProcessorService {
  private static instance: FrameProcessorService | null = null;
  private timerId: any = null;
  private isProcessing = false;
  private listeners: FrameListener[] = [];

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

    this.isProcessing = true;
    const webcam = WebcamService.getInstance();

    const loop = async () => {
      if (!this.isProcessing) return;

      try {
        const video = webcam.getVideoElement();
        // Only process if video is playing and has valid dimensions
        if (video && video.readyState >= 2 && !video.paused) {
          const timestamp = Date.now();
          // Distribute to all subscribers
          for (const listener of this.listeners) {
            try {
              listener(video, timestamp);
            } catch (err) {
              console.error("Error in frame listener:", err);
            }
          }
        }
      } catch (err) {
        console.error("Frame processing error:", err);
      }

      this.timerId = setTimeout(loop, CONFIG.FRAME_INTERVAL_MS);
    };

    this.timerId = setTimeout(loop, CONFIG.FRAME_INTERVAL_MS);
  }

  /**
   * Stop the frame capture loop.
   */
  public stop(): void {
    this.isProcessing = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.listeners = [];
  }
}
