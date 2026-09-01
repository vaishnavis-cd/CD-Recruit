import React, { useEffect, useRef, useState } from 'react';
import { FaceDetectionService } from '../../proctoring/face-detection.service';
import { StatusChip } from '../../components/common/StatusChip';
import { RetryButton } from '../../components/common/RetryButton';
import { useSessionStore } from '../../store/sessionMachine';
import apiClient from '../../api/client';
import { Loader2, ShieldCheck, XCircle, AlertTriangle, Info, ShieldAlert } from 'lucide-react';

interface ConsentSelfieStepProps {
  onComplete: () => void;
}

type VerificationState =
  | { type: 'idle' }
  | { type: 'verifying' }
  | { type: 'verified' }
  | { type: 'not_verified'; distance?: number }
  | { type: 'no_id_proof_on_file' }
  | { type: 'error'; message: string };

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

  // Verification & Flag states
  const [verificationState, setVerificationState] = useState<VerificationState>({ type: 'idle' });
  const [showFlagConfirmModal, setShowFlagConfirmModal] = useState(false);
  const [flaggingInFlight, setFlaggingInFlight] = useState(false);

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

  async function runIdentityVerification(dataUrl: string) {
    if (!sessionId) return;
    setVerificationState({ type: 'verifying' });

    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();

      const formData = new FormData();
      formData.append('file', blob, 'selfie.jpg');

      const response = await apiClient.post(`/sessions/${sessionId}/verify-identity`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = response.data;
      console.log('[ConsentSelfieStep] Identity verification response:', data);

      if (data.status === 'verified') {
        setVerificationState({ type: 'verified' });
        setTimeout(() => {
          onComplete();
        }, 800);
      } else if (data.status === 'not_verified') {
        setVerificationState({
          type: 'not_verified',
          distance: data.distance,
        });
      } else if (data.status === 'no_id_proof_on_file') {
        setVerificationState({ type: 'no_id_proof_on_file' });
      } else {
        setVerificationState({
          type: 'error',
          message: 'Unexpected verification result received from server.',
        });
      }
    } catch (err: any) {
      console.error('[ConsentSelfieStep] Identity verification network error:', err);
      const errDetail = err?.response?.data?.message || err?.message || 'Something went wrong, please try again';
      setVerificationState({
        type: 'error',
        message: typeof errDetail === 'string' ? errDetail : 'Something went wrong, please try again',
      });
    }
  }

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

      // Upload baseline selfie directly to MinIO and extract embedding in PostgreSQL
      if (sessionId) {
        try {
          await apiClient.post(`/sessions/${sessionId}/selfie`, { image: dataUrl });
          console.log('[ConsentSelfieStep] Baseline selfie uploaded and enrolled successfully.');
        } catch (err) {
          console.error('[ConsentSelfieStep] Failed to upload selfie to MinIO:', err);
        }
      }

      // Proceed to next step / test start smoothly
      setTimeout(() => {
        onComplete();
      }, 700);
    }
  }

  function handleRetake() {
    setSelfieCaptured(false);
    setCapturedDataUrl(null);
    setVerificationState({ type: 'idle' });
    localStorage.removeItem('cd-recruit-selfie-data');

    // Re-attach video stream so element never turns black
    if (streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    } else {
      startWebcam();
    }
  }

  async function executeFlagAndContinue() {
    if (!sessionId) return;
    setFlaggingInFlight(true);
    try {
      await apiClient.post(`/sessions/${sessionId}/flag-and-continue`);
      setShowFlagConfirmModal(false);
      onComplete();
    } catch (err: any) {
      console.error('[ConsentSelfieStep] Flag and continue failed:', err);
      setFlaggingInFlight(false);
      setShowFlagConfirmModal(false);
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

        {/* Loading overlay during verification */}
        {verificationState.type === 'verifying' && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center text-white space-y-3 z-30 animate-cd-fade-in">
            <Loader2 className="w-10 h-10 animate-spin text-[var(--accent)]" />
            <div className="text-sm font-semibold tracking-wide">Verifying Identity...</div>
            <div className="text-xs text-slate-300">Comparing live selfie against enrolled ID proof</div>
          </div>
        )}

        {flash && (
          <div className="absolute inset-0 bg-white/80 animate-cd-flash pointer-events-none z-10" />
        )}

        <div className="absolute top-3 left-3 z-20">
          <StatusChip
            tone={
              verificationState.type === 'verified'
                ? 'success'
                : verificationState.type === 'not_verified'
                ? 'critical'
                : selfieCaptured
                ? 'success'
                : isAligned
                ? 'success'
                : faceDetected
                ? 'accent'
                : 'critical'
            }
            label={
              verificationState.type === 'verified'
                ? 'Identity Verified'
                : verificationState.type === 'not_verified'
                ? 'Not Matched'
                : selfieCaptured
                ? 'Captured'
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

      {/* Identity Verification Feedback Banners */}
      {selfieCaptured && (
        <div className="space-y-3">
          {verificationState.type === 'verified' && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2.5 shadow-sm">
              <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
              <div>
                <span className="font-semibold">Identity Verified Successfully.</span> Proceeding to test start...
              </div>
            </div>
          )}

          {verificationState.type === 'not_verified' && (
            <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-rose-300 font-semibold text-sm">
                <XCircle size={18} className="text-rose-400" />
                Face Identity Not Matched
              </div>
              <p className="text-rose-200/90 leading-relaxed">
                The captured selfie photo could not be matched with the enrolled ID proof photo on file.
                Please ensure good lighting and face position, then click <strong>Retake Selfie</strong> to try again.
              </p>
            </div>
          )}

          {verificationState.type === 'no_id_proof_on_file' && (
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs flex items-center gap-2.5 shadow-sm">
              <Info size={18} className="text-amber-400 shrink-0" />
              <div>
                <span className="font-medium text-slate-200">Identity verification unavailable for this session.</span> You may proceed directly to test start.
              </div>
            </div>
          )}

          {verificationState.type === 'error' && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-2.5 shadow-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                <span>{verificationState.message}</span>
              </div>
              {capturedDataUrl && (
                <button
                  onClick={() => runIdentityVerification(capturedDataUrl)}
                  type="button"
                  className="px-3 py-1 bg-amber-800/60 hover:bg-amber-700/80 text-amber-100 text-xs rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  Retry Verification
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-[var(--muted-foreground)]">
          Neutral expression, good lighting, no hat or sunglasses.
        </p>

        {selfieCaptured ? (
          <div className="flex items-center gap-3">
            {verificationState.type === 'not_verified' ? (
              <>
                <RetryButton onClick={handleRetake} label="Retake Selfie" />
                <button
                  onClick={() => setShowFlagConfirmModal(true)}
                  type="button"
                  className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 border border-rose-700/50 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldAlert size={14} /> Flag & Continue
                </button>
              </>
            ) : verificationState.type === 'no_id_proof_on_file' || verificationState.type === 'idle' ? (
              <button
                onClick={onComplete}
                type="button"
                className="btn-primary text-xs font-semibold px-6 py-2.5 animate-border-ripple shadow-lg cursor-pointer"
              >
                Continue to Test
              </button>
            ) : (
              <RetryButton onClick={handleRetake} label="Retake Selfie" />
            )}
          </div>
        ) : (
          <button
            onClick={handleCapture}
            disabled={!hasStream}
            type="button"
            className={`text-xs font-semibold px-6 py-2.5 rounded-lg transition-all cursor-pointer ${
              hasStream
                ? 'btn-primary animate-border-ripple shadow-lg'
                : 'bg-slate-700 text-slate-400 opacity-60 cursor-not-allowed border border-slate-600'
            }`}
          >
            Capture Selfie
          </button>
        )}
      </div>

      {/* Flag & Continue Confirmation Modal */}
      {showFlagConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-cd-fade-in text-left">
            <div className="flex items-center gap-3 text-rose-400 font-semibold text-base">
              <ShieldAlert size={22} className="shrink-0" />
              Flag Session & Continue?
            </div>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              This action will mark your assessment session with an identity mismatch flag for review by the recruiting team. You will be allowed to take the test, but the flag will be visible on your final report.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowFlagConfirmModal(false)}
                type="button"
                disabled={flaggingInFlight}
                className="px-4 py-2 text-xs font-medium border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-[var(--foreground)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeFlagAndContinue}
                type="button"
                disabled={flaggingInFlight}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
              >
                {flaggingInFlight && <Loader2 size={13} className="animate-spin" />}
                {flaggingInFlight ? 'Flagging...' : 'Confirm & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
