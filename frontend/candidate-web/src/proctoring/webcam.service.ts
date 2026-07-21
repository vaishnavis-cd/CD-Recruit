export class WebcamService {
  private static instance: WebcamService | null = null;
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;

  private constructor() {}

  public static getInstance(): WebcamService {
    if (!WebcamService.instance) {
      WebcamService.instance = new WebcamService();
    }
    return WebcamService.instance;
  }

  /**
   * Request webcam access permissions. Reuses stream if acquired.
   */
  public async requestPermission(): Promise<boolean> {
    if (this.stream && this.stream.active) {
      return true;
    }

    try {
      console.log("[WebcamService] CAMERA_PERMISSION_REQUEST initiated");
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 },
        },
        audio: false,
      });
      this.stream = tempStream;
      console.log("[WebcamService] CAMERA_PERMISSION_SUCCESS: permission granted");
      return true;
    } catch (err) {
      console.error("[WebcamService] CAMERA_PERMISSION_DENIED or unavailable:", err);
      return false;
    }
  }

  /**
   * Initialize webcam stream and attach it to the hidden video element.
   */
  public async start(): Promise<MediaStream> {
    if (!this.stream || !this.stream.active) {
      console.log("[WebcamService] Creating media stream (getUserMedia)...");
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 },
        },
        audio: false,
      });
      console.log("[WebcamService] STREAM_CREATED successfully:", this.stream.id);
    } else {
      console.log("[WebcamService] Reusing active stream:", this.stream.id);
    }

    try {
      const video = this.getVideoElement();
      if (video.srcObject !== this.stream) {
        console.log("[WebcamService] VIDEO_ELEMENT_ASSIGNED to stream object");
        video.srcObject = this.stream;
      }

      video.onloadedmetadata = () => {
        console.log(
          `[WebcamService] LOADEDMETADATA event fired: videoWidth=${video.videoWidth}, videoHeight=${video.videoHeight}, readyState=${video.readyState}`,
        );
      };

      console.log("[WebcamService] Triggering video.play()...");
      try {
        await video.play();
      } catch (playErr: any) {
        if (playErr?.name === "AbortError") {
          console.warn(
            "[WebcamService] video.play() interrupted by load request (handled):",
            playErr.message,
          );
        } else {
          throw playErr;
        }
      }

      console.log(
        `[WebcamService] VIDEO_PLAY_SUCCESS: videoWidth=${video.videoWidth}, videoHeight=${video.videoHeight}, readyState=${video.readyState}`,
      );

      return this.stream;
    } catch (err) {
      console.error("[WebcamService] Failed to start webcam stream or play video:", err);
      throw err;
    }
  }

  /**
   * Stop the webcam stream and release tracks.
   */
  public stop(): void {
    if (this.stream) {
      console.log("[WebcamService] Stopping stream tracks...");
      this.stream.getTracks().forEach((track) => {
        track.stop();
        this.stream?.removeTrack(track);
      });
      this.stream = null;
    }

    if (this.videoElement) {
      console.log("[WebcamService] Clearing hidden video element srcObject");
      this.videoElement.srcObject = null;
      if (this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Returns a hidden video element that plays the stream.
   * MediaPipe needs this element to extract frames.
   */
  public getVideoElement(): HTMLVideoElement {
    if (!this.videoElement) {
      this.videoElement = document.createElement("video");
      this.videoElement.id = "proctoring-hidden-webcam";
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;
      this.videoElement.setAttribute("playsinline", "true");
      this.videoElement.setAttribute("muted", "true");
      this.videoElement.style.position = "fixed";
      this.videoElement.style.top = "-9999px";
      this.videoElement.style.left = "-9999px";
      this.videoElement.style.width = "640px";
      this.videoElement.style.height = "480px";
      document.body.appendChild(this.videoElement);
    }
    return this.videoElement;
  }
}
