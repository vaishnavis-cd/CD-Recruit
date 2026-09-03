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
  private lastSpeechTriggerTime = 0;
  private lastSecondVoiceTriggerTime = 0;

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
    // High-frequency noise band (>4000Hz) for transient keyboard/mouse click suppression
    const sampleRate = this.audioContext.sampleRate;
    const fftSize = this.analyser.fftSize;

    let speechEnergySum = 0;
    let speechBinsCount = 0;
    let noiseEnergySum = 0;
    let noiseBinsCount = 0;

    for (let i = 0; i < bufferLength; i++) {
      const frequency = (i * sampleRate) / fftSize;
      if (frequency >= 85 && frequency <= 2000) {
        speechEnergySum += dataArray[i];
        speechBinsCount++;
      } else if (frequency >= 4000) {
        noiseEnergySum += dataArray[i];
        noiseBinsCount++;
      }
    }

    const averageSpeechEnergy = speechBinsCount > 0 ? speechEnergySum / speechBinsCount : 0;
    const averageNoiseEnergy = noiseBinsCount > 0 ? noiseEnergySum / noiseBinsCount : 0;
    
    // Voice activity detection thresholds (raised to prevent false positives from background room noise)
    const VAD_ENERGY_THRESHOLD = 75; 
    const isVoiceHarmonic = averageSpeechEnergy > VAD_ENERGY_THRESHOLD &&
      (averageSpeechEnergy / (averageNoiseEnergy || 1)) >= 1.8 &&
      averageNoiseEnergy < (averageSpeechEnergy * 0.9);

    if (isVoiceHarmonic) {
      this.continuousSpeechDurationMs += deltaTime;

      // 1. Only trigger SPEECH_DETECTED after 2.5s of continuous sustained voice
      if (this.continuousSpeechDurationMs >= 2500 && (now - this.lastSpeechTriggerTime) > 30000) {
        this.lastSpeechTriggerTime = now;
        DetectionEngineService.getInstance().triggerMockEvent("SPEECH_DETECTED", "audio-detector-v1");
      }

      // 2. Sustained continuous speech over 6 seconds triggers SECOND_VOICE_SUSPECTED
      if (this.continuousSpeechDurationMs >= 6000 && (now - this.lastSecondVoiceTriggerTime) > 60000) {
        this.lastSecondVoiceTriggerTime = now;
        DetectionEngineService.getInstance().triggerMockEvent("SECOND_VOICE_SUSPECTED", "audio-detector-v1");
      }
    } else {
      // Decay duration value quickly if silence or transient noise is detected
      this.continuousSpeechDurationMs = Math.max(0, this.continuousSpeechDurationMs - deltaTime * 2.0);
    }

    // Schedule next tick (1000ms interval to minimize CPU overhead)
    this.timerId = setTimeout(() => this.loop(), 1000);
  }
}
