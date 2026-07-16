import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CardLayout } from "@/components/layout/CardLayout";
import { Shield, Camera, Check, AlertTriangle } from "lucide-react";

export function ConsentPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as {
    scheduledTime?: string;
    bufferMinutes?: number;
    graceMinutes?: number;
    reducedProctoring?: boolean;
  } | null;

  const [hasConsented, setHasConsented] = useState(false);
  const [photoCaptured, setPhotoCaptured] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    if (state?.reducedProctoring) return;
    setCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 300 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access failed", err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    setCapturing(false);
  };

  const captureSelfie = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 400, 300);
        const data = canvas.toDataURL("image/jpeg");
        setPhotoDataUrl(data);
        setPhotoCaptured(true);
        stopCamera();
      }
    }
  };

  useEffect(() => {
    if (!state?.reducedProctoring) {
      startCamera();
    }
    return () => stopCamera();
  }, [state?.reducedProctoring]);

  const handleNext = () => {
    // Determine path based on scheduled time T
    const now = Date.now();
    const tMs = state?.scheduledTime ? new Date(state.scheduledTime).getTime() : now;
    
    // If we click-through before T, go to Tutorial, otherwise Condensed Tour
    const isBuffer = now < tMs;
    navigate("/tutorial", {
      state: {
        ...state,
        isGracePath: !isBuffer,
        selfieDataUrl: photoDataUrl
      }
    });
  };

  return (
    <CardLayout>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight mb-2 text-center">Consent & Selfie</h1>
        <p className="text-text-secondary text-xs text-center mb-6">
          Establish identity and review data agreements
        </p>

        {/* Biometric consent agreement */}
        <div className="bg-surface border border-border-token rounded-xl p-5 mb-6 text-sm text-left max-h-48 overflow-y-auto">
          <h3 className="font-bold text-text-primary mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent" />
            Biometric Data Consent Policy (DPDP 2023)
          </h3>
          <p className="text-text-secondary leading-relaxed mb-3 text-xs">
            We collect your image and baseline facial patterns for session verification and integrity confirmation. 
            No governmental identity records are compiled. Raw video frames remain private on your browser.
          </p>
          <p className="text-text-secondary leading-relaxed text-xs">
            <strong>Retention & Privacy:</strong> Captured frames are deleted automatically after review finalization. 
            All stored files are encrypted using KMS envelope key security.
          </p>
        </div>

        {/* Camera capture / status */}
        {!state?.reducedProctoring ? (
          <div className="mb-6 text-center">
            {photoCaptured && photoDataUrl ? (
              <div className="relative mx-auto w-64 h-48 rounded-xl border border-success overflow-hidden bg-surface">
                <img src={photoDataUrl} alt="Baseline selfie" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-success/15 flex items-center justify-center">
                  <span className="bg-success text-white rounded-full p-1"><Check className="w-5 h-5" /></span>
                </div>
              </div>
            ) : (
              <div className="relative mx-auto w-64 h-48 rounded-xl border border-border-token overflow-hidden bg-black flex items-center justify-center">
                {capturing && (
                  <>
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                    <div className="absolute inset-0 border-[3px] border-dashed border-accent/40 rounded-xl pointer-events-none flex items-center justify-center">
                      <div className="w-40 h-40 rounded-full border border-accent/45 pointer-events-none" />
                    </div>
                  </>
                )}
                {!capturing && (
                  <span className="text-xs text-text-secondary">Camera Loading...</span>
                )}
              </div>
            )}

            {!photoCaptured && (
              <button
                onClick={captureSelfie}
                disabled={!capturing}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface/85 border border-border-token text-text-primary text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Camera className="w-4 h-4 text-accent" />
                <span>Capture Reference Image</span>
              </button>
            )}

            {photoCaptured && (
              <button
                onClick={() => {
                  setPhotoCaptured(false);
                  startCamera();
                }}
                className="mt-3 text-xs text-accent hover:text-accent-hover font-semibold transition-colors cursor-pointer"
              >
                Retake Reference Image
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 bg-warning/10 border border-warning rounded-xl mb-6 text-left flex gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-warning uppercase tracking-wider mb-1">Reduced Proctoring</h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                Biometric collection is disabled due to your check results. Faceless telemetry (paste check and active-tab checks) will run in parallel.
              </p>
            </div>
          </div>
        )}

        <label className="flex items-start gap-3 p-4 bg-surface/50 border border-border-token rounded-xl mb-6 text-left cursor-pointer">
          <input
            type="checkbox"
            checked={hasConsented}
            onChange={(e) => setHasConsented(e.target.checked)}
            className="mt-1 accent-accent"
          />
          <span className="text-xs text-text-secondary leading-relaxed">
            I explicitly declare consent to the collection of my image and browser events as detailed in the Biometric Data Policy.
          </span>
        </label>

        <button
          onClick={handleNext}
          disabled={!hasConsented || (!state?.reducedProctoring && !photoCaptured)}
          className="w-full py-3 bg-accent text-white hover:bg-accent-hover disabled:bg-surface disabled:text-text-secondary/50 disabled:border disabled:border-border-token font-semibold rounded-xl shadow-lg transition-all duration-150 cursor-pointer"
        >
          Proceed to Lobby / Tutorial
        </button>
      </div>
    </CardLayout>
  );
}
