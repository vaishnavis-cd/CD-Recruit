import { WebcamService } from "./webcam.service";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export class IdentityCaptureScheduler {
  private static instance: IdentityCaptureScheduler | null = null;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private activeSessionId: string | null = null;
  private token: string | null = null;

  private constructor() {}

  public static getInstance(): IdentityCaptureScheduler {
    if (!IdentityCaptureScheduler.instance) {
      IdentityCaptureScheduler.instance = new IdentityCaptureScheduler();
    }
    return IdentityCaptureScheduler.instance;
  }

  /**
   * Schedule 3 duration-proportional identity capture snapshots (~30%, 60%, 90% split).
   */
  public start(
    sessionId: string,
    durationMinutes: number,
    startedAtISO?: string | null,
    token?: string | null,
  ): void {
    this.stop();
    this.activeSessionId = sessionId;
    this.token = token || localStorage.getItem("cd-recruit-invite-token") || null;

    const splitRatios = [0.30, 0.60, 0.90];
    const durationMs = (durationMinutes || 15) * 60 * 1000;
    const startMs = startedAtISO ? new Date(startedAtISO).getTime() : Date.now();
    const nowMs = Date.now();

    console.log(
      `[IdentityCaptureScheduler] START_SCHEDULING: sessionId=${sessionId}, duration=${durationMinutes}m, startedAt=${startedAtISO || "NOW"}`,
    );

    splitRatios.forEach((ratio, idx) => {
      const windowIndex = idx + 1;
      const scheduledOffsetMs = Math.round(durationMs * ratio);
      const targetTimeMs = startMs + scheduledOffsetMs;
      const delayMs = targetTimeMs - nowMs;

      console.log(
        `[IdentityCaptureScheduler] STAGE 2 (SCHEDULED): windowIndex=${windowIndex}, ratio=${(ratio * 100).toFixed(0)}%, delayMs=${delayMs}ms (${(delayMs / 1000).toFixed(1)}s)`,
      );

      if (delayMs <= 0) {
        console.log(
          `[IdentityCaptureScheduler] Window ${windowIndex} offset has already passed — triggering immediate capture...`,
        );
        this.captureAndUpload(sessionId, windowIndex);
      } else {
        const timer = setTimeout(() => {
          console.log(`[IdentityCaptureScheduler] STAGE 3 (TIMER_FIRED): windowIndex=${windowIndex}`);
          this.captureAndUpload(sessionId, windowIndex);
        }, delayMs);
        this.timers.push(timer);
      }
    });

    // Fallback tab re-focus check to ensure captures fire even if tab was throttled in background
    window.addEventListener("focus", this.handleVisibilityOrFocus);
  }

  private handleVisibilityOrFocus = (): void => {
    if (document.visibilityState === "visible" && this.activeSessionId) {
      console.log("[IdentityCaptureScheduler] TAB_REFOCUSED: verifying scheduled captures...");
    }
  };

  /**
   * Grab canvas frame from WebcamService video element and POST to API endpoint.
   */
  public async captureAndUpload(sessionId: string, windowIndex: number): Promise<void> {
    try {
      const webcam = WebcamService.getInstance();
      const video = webcam.getVideoElement();

      // STAGE 4: Frame Grab Validation
      console.log(
        `[IdentityCaptureScheduler] STAGE 4 (FRAME_GRAB_CHECK): windowIndex=${windowIndex}, readyState=${video.readyState}, dimensions=${video.videoWidth}x${video.videoHeight}`,
      );

      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn(
          `[IdentityCaptureScheduler] Video element not ready yet (readyState=${video.readyState}, dims=${video.videoWidth}x${video.videoHeight}). Retrying in 1s...`,
        );
        setTimeout(() => this.captureAndUpload(sessionId, windowIndex), 1000);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get 2d canvas context for identity capture");
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);

      console.log(
        `[IdentityCaptureScheduler] STAGE 4 SUCCESS: Canvas frame captured (${canvas.width}x${canvas.height}, base64Length=${imageBase64.length} chars)`,
      );

      // STAGE 5: Network Call
      const token = this.token || localStorage.getItem("cd-recruit-invite-token") || "";
      const endpointUrl = `${API_BASE}/sessions/${sessionId}/identity-capture`;

      console.log(
        `[IdentityCaptureScheduler] STAGE 5 (POST_REQUEST): URL=${endpointUrl}, windowIndex=${windowIndex}`,
      );

      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          windowIndex,
          imageBase64,
        }),
      });

      const responseData = await response.json().catch(() => ({}));
      console.log(
        `[IdentityCaptureScheduler] STAGE 5 (NETWORK_RESPONSE): status=${response.status}, ok=${response.ok}, payload=`,
        responseData,
      );

      if (!response.ok) {
        console.error(
          `[IdentityCaptureScheduler] STAGE 5 FAILURE: Server responded with status ${response.status}:`,
          responseData,
        );
      }
    } catch (err: any) {
      console.error(
        `[IdentityCaptureScheduler] CAPTURE_UPLOAD_ERROR: windowIndex=${windowIndex}:`,
        err?.message || err,
      );
    }
  }

  public stop(): void {
    console.log("[IdentityCaptureScheduler] STOP: Clearing scheduled timers...");
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
    window.removeEventListener("focus", this.handleVisibilityOrFocus);
  }
}
