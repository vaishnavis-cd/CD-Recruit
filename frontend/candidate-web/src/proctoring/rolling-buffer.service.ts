import { CONFIG } from "./proctoring.constants";

export class RollingBufferService {
  private static instance: RollingBufferService | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  private constructor() {}

  public static getInstance(): RollingBufferService {
    if (!RollingBufferService.instance) {
      RollingBufferService.instance = new RollingBufferService();
    }
    return RollingBufferService.instance;
  }

  /**
   * Start recording in-memory 1-second chunks from the webcam stream.
   */
  public start(stream: MediaStream): void {
    if (this.recorder) return;

    this.chunks = [];

    // Find a supported video mimeType
    const mimeTypes = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp8",
      "video/webm;codecs=h264",
      "video/webm",
    ];

    let selectedMimeType = "";
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMimeType = mime;
        break;
      }
    }

    try {
      this.recorder = new MediaRecorder(
        stream,
        selectedMimeType ? { mimeType: selectedMimeType } : undefined
      );

      this.recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);

          // Maintain exactly the last 3 seconds of footage (3 chunks)
          if (this.chunks.length > CONFIG.PAST_BUFFER_SECONDS) {
            this.chunks.shift();
          }
        }
      };

      // Request data chunks every 1000ms
      this.recorder.start(CONFIG.ROLLING_BUFFER_CHUNK_MS);
      console.log(`Webcam rolling buffer started using MIME: ${selectedMimeType || "default"}`);
    } catch (err) {
      console.error("Failed to initialize MediaRecorder rolling buffer:", err);
    }
  }

  /**
   * Returns a copy of the current 3-second past buffer.
   */
  public getPastBuffer(): Blob[] {
    return [...this.chunks];
  }

  /**
   * Stop the rolling buffer recording and release chunks.
   */
  public stop(): void {
    if (this.recorder) {
      try {
        if (this.recorder.state !== "inactive") {
          this.recorder.stop();
        }
      } catch (err) {
        console.error("Error stopping MediaRecorder:", err);
      }
      this.recorder = null;
    }
    this.chunks = [];
  }
}
