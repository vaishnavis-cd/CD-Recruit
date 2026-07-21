import { DetectionEngineService } from "./detection-engine.service";

export class AudioDetectionService {
  private static instance: AudioDetectionService | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private timerId: any = null;
  private isRunning = false;

  // Heuristic state variables
  private continuousSpeechDurationMs = 0;
  private lastCheckTime = 0;

  private constructor() {}

  public static getInstance(): AudioDetectionService {
    if (!AudioDetectionService.instance) {
      AudioDetectionService.instance = new AudioDetectionService();
    }
    return AudioDetectionService.instance;
  }

  /**
   * Start listening to the microphone stream.
   */
  public start(stream: MediaStream): void {
    if (this.isRunning) return;

    // Check if the stream has audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("[AudioDetection] No audio tracks found in stream. Audio detection disabled.");
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;

      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      this.isRunning = true;
      this.lastCheckTime = Date.now();
      this.continuousSpeechDurationMs = 0;

      // Start evaluation loop
      this.loop();
      console.log("[AudioDetection] Audio voice-activity detection pipeline started.");
    } catch (err) {
      console.error("[AudioDetection] Failed to initialize AudioContext:", err);
    }
  }

  /**
   * Stop the audio listening pipeline.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioContext) {
      if (this.audioContext.state !== "closed") {
        this.audioContext.close().catch((err) => {
          console.error("[AudioDetection] Error closing AudioContext:", err);
        });
      }
      this.audioContext = null;
    }

    this.analyser = null;
    this.continuousSpeechDurationMs = 0;
    console.log("[AudioDetection] Audio voice-activity detection pipeline stopped.");
  }

  /**
   * Periodically analyze frequency bins to detect speech.
   */
  private loop(): void {
    if (!this.isRunning || !this.analyser || !this.audioContext) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    const now = Date.now();
    const deltaTime = now - this.lastCheckTime;
    this.lastCheckTime = now;

    // Speech frequency range: ~85Hz to ~2000Hz
    // Bin frequency = (index * sampleRate) / fftSize
    const sampleRate = this.audioContext.sampleRate;
    const fftSize = this.analyser.fftSize;

    let speechEnergySum = 0;
    let speechBinsCount = 0;

    for (let i = 0; i < bufferLength; i++) {
      const frequency = (i * sampleRate) / fftSize;
      if (frequency >= 85 && frequency <= 2000) {
        speechEnergySum += dataArray[i];
        speechBinsCount++;
      }
    }

    const averageSpeechEnergy = speechBinsCount > 0 ? speechEnergySum / speechBinsCount : 0;
    
    // Threshold for voice activity detection
    // Value range for byte frequency data is 0 - 255
    const VAD_ENERGY_THRESHOLD = 35; 

    if (averageSpeechEnergy > VAD_ENERGY_THRESHOLD) {
      this.continuousSpeechDurationMs += deltaTime;

      // 1. Emit generic speech detection signal
      DetectionEngineService.getInstance().triggerMockEvent("SPEECH_DETECTED", "audio-detector-v1");

      // 2. Heuristic: sustained overlapping speech suggests presence of a second speaker.
      // True speaker diarization (distinguishing specific individual speakers) is explicitly deferred for MVP.
      // Sustained speech over 3.5 seconds is used as a proxy flag.
      if (this.continuousSpeechDurationMs >= 3500) {
        DetectionEngineService.getInstance().triggerMockEvent("SECOND_VOICE_SUSPECTED", "audio-detector-v1");
      }
    } else {
      // Decay duration value quickly if silence is detected to reset the window
      this.continuousSpeechDurationMs = Math.max(0, this.continuousSpeechDurationMs - deltaTime * 1.5);
    }

    // Schedule next tick (200ms interval, matching vision frame loop)
    this.timerId = setTimeout(() => this.loop(), 200);
  }
}
