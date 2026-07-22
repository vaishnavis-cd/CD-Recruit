import { CONFIG } from "./proctoring.constants";

export class RollingBufferService {
  private static instance: RollingBufferService | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private isAborted = false;
  private startInProgress = false;

  private constructor() {}

  public static getInstance(): RollingBufferService {
    if (!RollingBufferService.instance) {
      RollingBufferService.instance = new RollingBufferService();
    }
    return RollingBufferService.instance;
  }

  /**
   * Start recording in-memory 1-second chunks from the webcam stream.
   * Safe against rapid mount/unmount cycles — checks for abort flag and stream readiness.
   */
  public start(stream: MediaStream): void {
    // If already started or currently starting, don't re-enter
    if (this.recorder || this.startInProgress) return;

    // Guard: stream must be provided and not null (cleanup can race with start)
    if (!stream) {
      console.log("[RollingBufferService] Stream is null, likely due to concurrent cleanup. Aborting start.");
      return;
    }

    // Reset abort flag when starting a new session
    this.isAborted = false;
    this.startInProgress = true;

    try {
      // 1. Verify stream is actually ready before proceeding
      // readyState === 4 means "live", videoWidth > 0 means video is flowing
      if (!this._isStreamReady(stream)) {
        console.warn(
          `[RollingBufferService] Stream not ready yet. Deferring start...`
        );
        // Poll briefly to check if stream becomes ready
        this._waitForStreamReady(stream);
        return;
      }

      // 2. Check abort flag before proceeding with MediaRecorder creation
      if (this.isAborted) {
        console.log("[RollingBufferService] Start aborted during stream readiness check.");
        return;
      }

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

      // 3. Check abort flag again before creating MediaRecorder
      if (this.isAborted) {
        console.log("[RollingBufferService] Start aborted before MediaRecorder creation.");
        return;
      }

      try {
        this.recorder = new MediaRecorder(
          stream,
          selectedMimeType ? { mimeType: selectedMimeType } : undefined
        );
      } catch (err) {
        console.error(
          `[RollingBufferService] Failed to construct MediaRecorder: ${err}. Stream may not be ready.`,
          err
        );
        this.recorder = null;
        return;
      }

      // 4. Check abort flag before configuring event handlers
      if (this.isAborted) {
        console.log("[RollingBufferService] Start aborted before configuring recorder.");
        if (this.recorder && this.recorder.state !== "inactive") {
          this.recorder.stop();
        }
        this.recorder = null;
        return;
      }

      this.recorder.ondataavailable = (event) => {
        // Verify abort flag even in callback — stale callbacks shouldn't execute
        if (this.isAborted) {
          console.log("[RollingBufferService] Ignoring stale ondataavailable callback (aborted).");
          return;
        }

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
      this.recorder = null;
    } finally {
      this.startInProgress = false;
    }
  }

  /**
   * Check if a MediaStream is actually ready for recording.
   * A stream is ready when it has active video tracks flowing.
   */
  private _isStreamReady(stream: MediaStream): boolean {
    if (!stream || !stream.active) {
      return false;
    }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      return false;
    }

    // Check if all video tracks are in "live" state
    return videoTracks.every(track => track.readyState === "live");
  }

  /**
   * Poll for stream readiness with short timeout.
   * If stream becomes ready, automatically call start.
   */
  private _waitForStreamReady(stream: MediaStream): void {
    const maxAttempts = 20; // ~2 seconds with 100ms polling
    let attempts = 0;

    const poll = () => {
      attempts++;

      // Check abort flag
      if (this.isAborted) {
        console.log("[RollingBufferService] Stream readiness poll cancelled (aborted).");
        this.startInProgress = false;
        return;
      }

      if (this._isStreamReady(stream)) {
        console.log(`[RollingBufferService] Stream ready after ${attempts * 100}ms. Retrying start...`);
        this.startInProgress = false;
        this.start(stream);
        return;
      }

      if (attempts >= maxAttempts) {
        console.warn(
          `[RollingBufferService] Stream did not become ready after ${maxAttempts * 100}ms. Giving up.`
        );
        this.startInProgress = false;
        return;
      }

      setTimeout(poll, 100);
    };

    poll();
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
    // Set abort flag to cancel any in-flight start sequences
    this.isAborted = true;

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

