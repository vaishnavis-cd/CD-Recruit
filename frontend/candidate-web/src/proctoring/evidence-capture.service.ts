import { RollingBufferService } from "./rolling-buffer.service";

export class EvidenceCaptureService {
  private static instance: EvidenceCaptureService | null = null;

  private constructor() {}

  public static getInstance(): EvidenceCaptureService {
    if (!EvidenceCaptureService.instance) {
      EvidenceCaptureService.instance = new EvidenceCaptureService();
    }
    return EvidenceCaptureService.instance;
  }

  /**
   * Captures a 100% native, standalone WebM video clip directly produced by browser MediaRecorder.onstop.
   */
  public async captureClip(_stream?: MediaStream): Promise<Blob> {
    console.log("[EvidenceCaptureService] CAPTURE_CLIP_REQUESTED: Retrieving native standalone WebM segment...");
    const clipBlob = await RollingBufferService.getInstance().captureClip();
    console.log(`[EvidenceCaptureService] CAPTURE_CLIP_SUCCESS: blobSize=${clipBlob.size} bytes (${(clipBlob.size / 1024).toFixed(1)} KB), type=${clipBlob.type}`);
    return clipBlob;
  }
}
