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
   * Request webcam access permissions.
   */
  public async requestPermission(): Promise<boolean> {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      tempStream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      console.error("Webcam permission denied or unavailable:", err);
      return false;
    }
  }

  /**
   * Initialize webcam stream and attach it to the hidden video element.
   */
  public async start(): Promise<MediaStream> {
    if (this.stream) {
      return this.stream;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 },
        },
        audio: false, // We do not need audio for this CV module
      });

      const video = this.getVideoElement();
      video.srcObject = this.stream;
      await video.play();

      return this.stream;
    } catch (err) {
      console.error("Failed to start webcam stream:", err);
      throw err;
    }
  }

  /**
   * Stop the webcam stream and release tracks.
   */
  public stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
        this.stream?.removeTrack(track);
      });
      this.stream = null;
    }

    if (this.videoElement) {
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
      this.videoElement.setAttribute("playsinline", "true");
      this.videoElement.setAttribute("muted", "true");
      this.videoElement.style.position = "fixed";
      this.videoElement.style.top = "-9999px";
      this.videoElement.style.left = "-9999px";
      this.videoElement.style.width = "640px";
      this.videoElement.style.height = "480px";
      this.videoElement.style.opacity = "0";
      this.videoElement.style.pointerEvents = "none";
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
      document.body.appendChild(this.videoElement);
    }
    return this.videoElement;
  }
}
