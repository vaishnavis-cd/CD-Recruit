import { RollingBufferService } from "./rolling-buffer.service";
import { CONFIG } from "./proctoring.constants";

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
   * Generates a 6-second WebM clip: 3 seconds before event + 3 seconds after.
   */
  public async captureClip(stream: MediaStream): Promise<Blob> {
    const rollingBuffer = RollingBufferService.getInstance();
    const pastChunks = rollingBuffer.getPastBuffer();

    console.log(`Generating evidence clip. Past chunks count: ${pastChunks.length}`);

    return new Promise((resolve, reject) => {
      try {
        const mimeType = pastChunks[0]?.type || "video/webm";
        const tempRecorder = new MediaRecorder(stream, { mimeType });
        const futureChunks: Blob[] = [];

        tempRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            futureChunks.push(event.data);
          }
        };

        tempRecorder.onstop = () => {
          try {
            // Merge the in-memory chunks
            const mergedBlob = new Blob([...pastChunks, ...futureChunks], {
              type: mimeType,
            });
            console.log(`Evidence clip merged successfully. Size: ${mergedBlob.size} bytes`);
            resolve(mergedBlob);
          } catch (err) {
            console.error("Failed to merge evidence clip chunks:", err);
            reject(err);
          }
        };

        // Record the next 3 seconds
        tempRecorder.start();

        setTimeout(() => {
          try {
            if (tempRecorder.state !== "inactive") {
              tempRecorder.stop();
            }
          } catch (err) {
            console.error("Error stopping temp recorder for evidence capture:", err);
            reject(err);
          }
        }, CONFIG.FUTURE_BUFFER_SECONDS * 1000);
      } catch (err) {
        console.error("Error setting up temp recorder for evidence capture:", err);
        reject(err);
      }
    });
  }
}
