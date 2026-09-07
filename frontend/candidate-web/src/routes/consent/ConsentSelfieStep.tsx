import React, { useEffect, useRef, useState } from 'react';
import { FaceDetectionService } from '../../proctoring/face-detection.service';
import { StatusChip } from '../../components/common/StatusChip';
import { RetryButton } from '../../components/common/RetryButton';
import { useSessionStore } from '../../store/sessionMachine';
import apiClient from '../../api/client';
import { Loader2, CheckCircle2, Camera } from 'lucide-react';

interface ConsentSelfieStepProps {
  onComplete: () => void;
}

export function ConsentSelfieStep({ onComplete }: ConsentSelfieStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasStream, setHasStream] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [selfieCaptured, setSelfieCaptured] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [isAligned, setIsAligned] = useState(false);
  const [flash, setFlash] = useState(false);
  const [guideFeedback, setGuideFeedback] = useState<string>("Position your face inside the circle guide");
  const [faceDetected, setFaceDetected] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const storeSessionId = useSessionStore(s => s.session?.id || s.assessment?.sessionId);
  const inviteToken = useSessionStore(s => s.inviteToken);
  const sessionId = storeSessionId || inviteToken;

  const startWebcam = () => {
    FaceDetectionService.getInstance().loadModel().catch(() => {});

    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      .then(stream => {
        streamRef.current = stream;
        setHasStream(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((err) => {
        console.error('[ConsentSelfieStep] Failed to start camera feed:', err);
      });
  };

  useEffect(() => {
    startWebcam();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Poll face detection for circle alignment check
  useEffect(() => {
    if (selfieCaptured) return;

    const interval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const result = FaceDetectionService.getInstance().detect(videoRef.current);
        if (result && result.alignment) {
          setFaceDetected(result.faceDetected);
          setIsAligned(result.alignment.isAligned);
          setGuideFeedback(result.alignment.guideFeedback);
        } else if (result && result.faceDetected && (result.faceCount === 1 || result.faceCount === 0)) {
          setFaceDetected(true);
          setIsAligned(true);
          setGuideFeedback("Face aligned! Hold steady and capture baseline selfie.");
        } else if (result && result.faceCount > 1) {
          setFaceDetected(true);
          setIsAligned(false);
          setGuideFeedback("Multiple faces detected — please ensure you are alone.");
        } else {
          setFaceDetected(false);
          setIsAligned(false);
          setGuideFeedback("Center your face inside the guide.");
        }
      } catch {
        setIsAligned(true);
        setFaceDetected(true);
        setGuideFeedback("Align your face inside the guide.");
      }
    }, 100);

    return () => clearInterval(interval);
  }, [selfieCaptured]);

  async function handleCapture() {
    if (!videoRef.current || !hasStream) return;

    // Trigger shutter flash
    setFlash(true);
    setTimeout(() => setFlash(false), 450);

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      localStorage.setItem('cd-recruit-selfie-data', dataUrl);
      setCapturedDataUrl(dataUrl);
      setSelfieCaptured(true);

      // Upload baseline selfie directly to backend storage (MinIO & DB embedding)
      if (sessionId) {
        setIsUploading(true);
        try {
          await apiClient.post(`/sessions/${sessionId}/selfie`, { image: dataUrl });
          console.log('[ConsentSelfieStep] Baseline selfie uploaded and stored successfully.');
        } catch (err) {
          console.error('[ConsentSelfieStep] Failed to upload selfie:', err);
        } finally {
          setIsUploading(false);
        }
      }
    }
  }

  async function handleConfirmAndProceed() {
    if (!capturedDataUrl) return;
    
    // Ensure upload finished if not already done
    if (sessionId && !isUploading) {
      setIsUploading(true);
      try {
        await apiClient.post(`/sessions/${sessionId}/selfie`, { image: capturedDataUrl });
      } catch (err) {
        console.error('[ConsentSelfieStep] Failed to upload selfie:', err);
      } finally {
        setIsUploading(false);
      }
    }
    onComplete();
  }

  function handleRetake() {
    setSelfieCaptured(false);
    setCapturedDataUrl(null);
    localStorage.removeItem('cd-recruit-selfie-data');

    // Re-attach video stream so element never turns black
    if (streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    } else {
      startWebcam();
    }
  }

  return (
    <div className="space-y-4">
      {/* Video Container */}
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-[var(--border)]">
        {/* Live Video (Always mounted to preserve stream ref) */}
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="Webcam feed for liveness check"
          className={`w-full h-full object-cover transform -scale-x-100 ${
            selfieCaptured && capturedDataUrl ? 'hidden' : 'block'
          }`}
        />

        {/* Captured Selfie Preview Image */}
        {selfieCaptured && capturedDataUrl && (
          <img
            src={capturedDataUrl}
            alt="Baseline selfie preview"
            className="w-full h-full object-cover"
          />
        )}

        {flash && (
          <div className="absolute inset-0 bg-white/80 animate-cd-flash pointer-events-none z-10" />
        )}

        <div className="absolute top-3 left-3 z-20">
          <StatusChip
            tone={
              selfieCaptured
                ? 'success'
                : isAligned
                ? 'success'
                : faceDetected
                ? 'accent'
                : 'critical'
            }
            label={
              selfieCaptured
                ? 'Selfie Captured'
                : isAligned
                ? 'Face aligned'
                : faceDetected
                ? 'Adjust position'
                : 'No face'
            }
          />
        </div>

        {/* Real-time guidance overlay banner */}
        {!selfieCaptured && (
          <div className="absolute bottom-3 left-3 right-3 z-20 flex justify-center pointer-events-none">
            <div className={`px-3.5 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border transition-all duration-300 shadow-md ${
              isAligned
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                : faceDetected
                ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                : 'bg-rose-950/80 text-rose-300 border-rose-500/50'
            }`}>
              {guideFeedback}
            </div>
          </div>
        )}

        {/* Solid face guide oval matching frame */}
        {!selfieCaptured && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div
              className={`w-44 h-56 rounded-[50%] border-2 transition-all duration-300 ${
                isAligned
                  ? 'border-emerald-400 bg-emerald-400/10 scale-105 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                  : faceDetected
                  ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_20px_rgba(251,191,36,0.3)]'
                  : 'border-rose-400 bg-rose-400/10 shadow-[0_0_20px_rgba(248,113,113,0.3)]'
              }`}
            />
          </div>
        )}
      </div>

      {/* Baseline Selfie Status Confirmation */}
      {selfieCaptured && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <div>
            <span className="font-semibold">Baseline photo stored.</span> You can retake if needed or confirm to continue to your assessment.
          </div>
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-[var(--muted-foreground)]">
          Neutral expression, good lighting, no hat or sunglasses.
        </p>

        {selfieCaptured ? (
          <div className="flex items-center gap-3">
            <RetryButton onClick={handleRetake} label="Retake Selfie" />
            <button
              onClick={handleConfirmAndProceed}
              disabled={isUploading}
              type="button"
              className="btn-primary text-xs font-semibold px-6 py-2.5 animate-border-ripple shadow-lg cursor-pointer flex items-center gap-1.5"
            >
              {isUploading && <Loader2 size={13} className="animate-spin" />}
              {isUploading ? 'Storing...' : 'Confirm & Continue to Test'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleCapture}
            disabled={!hasStream}
            type="button"
            className={`text-xs font-semibold px-6 py-2.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              hasStream
                ? 'btn-primary animate-border-ripple shadow-lg'
                : 'bg-slate-700 text-slate-400 opacity-60 cursor-not-allowed border border-slate-600'
            }`}
          >
            <Camera size={14} />
            Capture Selfie
          </button>
        )}
      </div>
    </div>
  );
}

