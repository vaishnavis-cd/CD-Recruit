import { CONFIG } from "./proctoring.constants";

export class RollingBufferService {
  private static instance: RollingBufferService | null = null;
  private recorder: MediaRecorder | null = null;
  private currentSegmentChunks: Blob[] = [];
  private completedSegments: Blob[] = [];
  private selectedMimeType = "";
  private stream: MediaStream | null = null;
  private isAborted = false;
  private startInProgress = false;
  private cycleTimer: any = null;
  private activeStopResolver: ((blob: Blob) => void) | null = null;

  private constructor() {}

  public static getInstance(): RollingBufferService {
    if (!RollingBufferService.instance) {
      RollingBufferService.instance = new RollingBufferService();
    }
    return RollingBufferService.instance;
  }

  /**
   * Start 6-second native MediaRecorder segment cycles on the webcam stream.
   * Uses 1000ms timeslice to ensure continuous data flushing.
   */
  public start(stream: MediaStream): void {
    if (this.recorder || this.startInProgress) return;

    if (!stream) {
      console.log("[RollingBufferService] Stream is null. Aborting start.");
      return;
    }

    this.stream = stream;
    this.isAborted = false;
    this.startInProgress = true;

    try {
      if (!this._isStreamReady(stream)) {
        console.warn("[RollingBufferService] Stream not ready yet. Deferring start...");
        this._waitForStreamReady(stream);
        return;
      }

      if (this.isAborted) return;

      const mimeTypes = [
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp8",
        "video/webm;codecs=h264",
        "video/webm",
      ];

      this.selectedMimeType = "";
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          this.selectedMimeType = mime;
          break;
        }
      }

      this._startSegmentCycle();
      console.log(`[RollingBufferService] Segmented MediaRecorder STARTED with MIME=${this.selectedMimeType}`);
    } catch (err) {
      console.error("[RollingBufferService] Failed to initialize MediaRecorder segmenting:", err);
    } finally {
      this.startInProgress = false;
    }
  }

  private _startSegmentCycle(): void {
    if (this.isAborted || !this.stream) return;

    this.currentSegmentChunks = [];

    try {
      this.recorder = new MediaRecorder(
        this.stream,
        this.selectedMimeType ? { mimeType: this.selectedMimeType } : undefined
      );
    } catch (err) {
      console.error("[RollingBufferService] Failed to construct MediaRecorder for segment:", err);
      this.recorder = null;
      return;
    }

    this.recorder.ondataavailable = (event) => {
      if (this.isAborted) return;
      if (event.data && event.data.size > 0) {
        this.currentSegmentChunks.push(event.data);
      }
    };

    this.recorder.onstop = () => {
      let segmentBlob = new Blob([], { type: "video/webm" });
      if (this.currentSegmentChunks.length > 0) {
        segmentBlob = new Blob(this.currentSegmentChunks, {
          type: this.selectedMimeType || "video/webm",
        });
        
        this.completedSegments.push(segmentBlob);
        if (this.completedSegments.length > 3) {
          this.completedSegments.shift();
        }
      }

      if (this.activeStopResolver) {
        const resolve = this.activeStopResolver;
        this.activeStopResolver = null;
        resolve(segmentBlob);
      }

      // Immediately start next cycle if session is active
      if (!this.isAborted && this.stream) {
        this._startSegmentCycle();
      }
    };

    // Start with 1000ms timeslice to ensure continuous ondataavailable events
    this.recorder.start(1000);

    if (this.cycleTimer) clearTimeout(this.cycleTimer);
    this.cycleTimer = setTimeout(() => {
      try {
        if (this.recorder && this.recorder.state === "recording") {
          this.recorder.stop();
        }
      } catch (err) {
        console.error("[RollingBufferService] Error stopping segment recorder:", err);
      }
    }, CONFIG.FUTURE_BUFFER_SECONDS * 2000); // 6-second segment window
  }

  private _isStreamReady(stream: MediaStream): boolean {
    if (!stream || !stream.active) return false;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return false;
    return videoTracks.every(track => track.readyState === "live");
  }

  private _waitForStreamReady(stream: MediaStream): void {
    const maxAttempts = 20;
    let attempts = 0;
    const poll = () => {
      attempts++;
      if (this.isAborted) {
        this.startInProgress = false;
        return;
      }
      if (this._isStreamReady(stream)) {
        this.startInProgress = false;
        this.start(stream);
        return;
      }
      if (attempts >= maxAttempts) {
        this.startInProgress = false;
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  }

  /**
   * Captures a 100% native, spec-compliant standalone WebM video clip directly produced by MediaRecorder.onstop.
   */
  public async captureClip(): Promise<Blob> {
    console.log(`[RollingBufferService] CAPTURE_CLIP_REQUESTED: Available segments=${this.completedSegments.length}`);

    // If a segment is currently recording, stop it and wait for onstop to resolve
    if (this.recorder && this.recorder.state === "recording") {
      const stopPromise = new Promise<Blob>((resolve) => {
        this.activeStopResolver = resolve;
      });

      try {
        this.recorder.stop();
      } catch (e) {
        console.warn("[RollingBufferService] Error stopping recorder during captureClip:", e);
      }

      const flushedBlob = await stopPromise;
      if (flushedBlob && flushedBlob.size > 100) {
        console.log(`[RollingBufferService] RETURN_FLUSHED_BLOB: size=${flushedBlob.size} bytes (${(flushedBlob.size / 1024).toFixed(1)} KB)`);
        return flushedBlob;
      }
    }

    const latest = this.completedSegments[this.completedSegments.length - 1];
    if (latest && latest.size > 100) {
      console.log(`[RollingBufferService] RETURNING_LATEST_COMPLETED_WEBM: size=${latest.size} bytes (${(latest.size / 1024).toFixed(1)} KB), type=${latest.type}`);
      return latest;
    }

    // Fallback: wait 2 seconds for initial segment if array is empty
    await new Promise(r => setTimeout(r, 2000));
    const fallback = this.completedSegments[this.completedSegments.length - 1];
    console.log(`[RollingBufferService] RETURNING_FALLBACK_WEBM: size=${fallback?.size || 0} bytes`);
    return (fallback && fallback.size > 100) ? fallback : new Blob([], { type: "video/webm" });
  }

  public getPastBuffer(): Blob[] {
    return [...this.completedSegments];
  }

  public stop(): void {
    this.isAborted = true;
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    if (this.recorder) {
      try {
        if (this.recorder.state !== "inactive") {
          this.recorder.stop();
        }
      } catch (err) {
        console.error("[RollingBufferService] Error stopping MediaRecorder:", err);
      }
      this.recorder = null;
    }
    this.stream = null;
    this.currentSegmentChunks = [];
    this.completedSegments = [];
    this.activeStopResolver = null;
    console.log("[RollingBufferService] Segmented MediaRecorder STOPPED.");
  }
}
