import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "@/store/session.store";
import { uploadSelfie } from "@/api/session";
import { CheckCircle, XCircle, Loader2, Camera, ShieldAlert, Shield, Check, AlertTriangle, Play, ChevronRight, BookOpen, Clock, AlertCircle } from "lucide-react";
import { CardLayout } from "@/components/layout/CardLayout";

interface CheckItem {
  id: string;
  name: string;
  description: string;
  status: "idle" | "loading" | "pass" | "fail";
}

export function LobbyPage() {
  const navigate = useNavigate();
  
  // Store fields
  const sessionId = useSessionStore((s) => s.sessionId);
  const status = useSessionStore((s) => s.status);
  const roleTemplateName = useSessionStore((s) => s.roleTemplateName);
  const durationMinutes = useSessionStore((s) => s.durationMinutes ?? 60);
  const beginSessionStore = useSessionStore((s) => s.beginSession);
  const isLoading = useSessionStore((s) => s.isLoading);

  // Sub-stages: "SYSTEM_CHECK" | "CONSENT_SELFIE" | "READY_TO_BEGIN"
  const [stage, setStage] = useState<"SYSTEM_CHECK" | "CONSENT_SELFIE" | "READY_TO_BEGIN">("SYSTEM_CHECK");

  // If session status updates to IN_PROGRESS, redirect to assessment
  useEffect(() => {
    if (status === "IN_PROGRESS") {
      navigate("/assessment", { replace: true });
    }
  }, [status, navigate]);

  // Stage 1: System Checks state
  const [checks, setChecks] = useState<CheckItem[]>([
    { id: "wasm", name: "WebAssembly Support", description: "Required for on-device browser checks", status: "idle" },
    { id: "webcam", name: "Webcam Access", description: "Required for identity and proctor validation", status: "idle" },
    { id: "cpu", name: "Processor Core Check", description: "Checks CPU resources for local ML", status: "idle" },
    { id: "memory", name: "Device Memory Check", description: "Validates available system RAM", status: "idle" },
    { id: "storage", name: "Local Storage Estimate", description: "Verifies local space for autosave buffers", status: "idle" },
  ]);
  const [checksRunning, setChecksRunning] = useState(false);
  const [checksFinished, setChecksFinished] = useState(false);

  // Stage 2: Consent & Selfie state
  const [hasConsented, setHasConsented] = useState(false);
  const [photoCaptured, setPhotoCaptured] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reducedProctoring, setReducedProctoring] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Run diagnostics checks
  const runDiagnostics = async () => {
    setChecksRunning(true);
    setChecksFinished(false);

    const updateStatus = (id: string, status: "loading" | "pass" | "fail") => {
      setChecks(prev => prev.map(item => item.id === id ? { ...item, status } : item));
    };

    // 1. WASM
    updateStatus("wasm", "loading");
    await new Promise(r => setTimeout(r, 400));
    updateStatus("wasm", typeof WebAssembly === "object" ? "pass" : "fail");

    // 2. Webcam
    updateStatus("webcam", "loading");
    await new Promise(r => setTimeout(r, 500));
    let webcamOk = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      webcamOk = true;
      updateStatus("webcam", "pass");
    } catch {
      updateStatus("webcam", "fail");
    }

    // 3. CPU
    updateStatus("cpu", "loading");
    await new Promise(r => setTimeout(r, 300));
    const cores = navigator.hardwareConcurrency || 4;
    updateStatus("cpu", cores >= 2 ? "pass" : "fail");

    // 4. Memory
    updateStatus("memory", "loading");
    await new Promise(r => setTimeout(r, 300));
    // @ts-ignore
    const mem = navigator.deviceMemory || 4;
    updateStatus("memory", mem >= 2 ? "pass" : "fail");

    // 5. Storage
    updateStatus("storage", "loading");
    await new Promise(r => setTimeout(r, 300));
    let storageOk = true;
    if (navigator.storage && navigator.storage.estimate) {
      const { quota, usage } = await navigator.storage.estimate();
      const freeGb = ((quota || 0) - (usage || 0)) / (1024 * 1024 * 1024);
      storageOk = freeGb > 0.1;
    }
    updateStatus("storage", storageOk ? "pass" : "fail");

    setChecksRunning(false);
    setChecksFinished(true);
  };

  const handleSystemCheckNext = (forceReduced = false) => {
    const isWebcamFail = checks.find(c => c.id === "webcam")?.status === "fail";
    const reduced = forceReduced || isWebcamFail;
    setReducedProctoring(reduced);
    setStage("CONSENT_SELFIE");
  };

  // Camera setup for Consent & Selfie
  const startCamera = async () => {
    if (reducedProctoring) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 300 } });
      streamRef.current = stream;
      setCapturing(true);
      // Wait one tick for React to render the <video> element before attaching
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 0);
    } catch (err) {
      console.error("Camera access failed", err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
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
    if (stage === "CONSENT_SELFIE" && !reducedProctoring) {
      void startCamera();
    }
    return () => stopCamera();
  }, [stage, reducedProctoring]);

  // Attach stream to video element once both are available
  useEffect(() => {
    if (capturing && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [capturing]);

  const handleConsentSelfieNext = async () => {
    if (reducedProctoring) {
      setStage("READY_TO_BEGIN");
      return;
    }

    if (!photoDataUrl || !sessionId) return;

    setUploading(true);
    try {
      await uploadSelfie(sessionId, photoDataUrl);
    } catch (err) {
      // Log but don't block — MinIO may not be configured in dev
      console.warn("Selfie upload failed (non-blocking):", err);
    } finally {
      setUploading(false);
    }
    setStage("READY_TO_BEGIN");
  };

  const handleStartAssessment = async () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    await beginSessionStore();
  };

  // Renderers for different stages
  if (stage === "SYSTEM_CHECK") {
    const hasFailedWebcam = checks.find(c => c.id === "webcam")?.status === "fail";
    const allPassed = checks.every(c => c.status === "pass");
    const hasStartedChecks = checks.some(c => c.status !== "idle");

    return (
      <CardLayout>
        {!hasStartedChecks ? (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent mb-6" style={{ background: "rgba(26, 86, 219, 0.1)", color: "#1a56db" }}>
              <Camera className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight mb-4">Device & Hardware Check</h1>
            <p className="text-text-secondary text-sm mb-6 leading-relaxed">
              Before beginning, the platform needs to verify your camera permissions and device capabilities. 
              <strong> Raw video streams stay on your device by default</strong>; only structured flags are processed.
            </p>
            <button
              onClick={runDiagnostics}
              className="w-full py-3 bg-accent text-white hover:bg-accent-hover font-semibold rounded-xl shadow-lg transition-colors cursor-pointer"
              style={{ backgroundColor: "#1a56db" }}
            >
              Start Device Checks
            </button>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight mb-2 text-center">Diagnostics Checklist</h1>
            <p className="text-text-secondary text-xs text-center mb-6">
              Verifying core browser specs and media devices
            </p>

            <div className="space-y-4 mb-8">
              {checks.map(item => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border-token" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", display: "flex", justifyContent: "space-between", padding: "1rem", marginBottom: "0.5rem" }}>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary" style={{ margin: 0 }}>{item.name}</h3>
                    <p className="text-xs text-text-secondary" style={{ margin: 0, color: "#6b7280" }}>{item.description}</p>
                  </div>
                  <div>
                    {item.status === "idle" && <span style={{ color: "#9ca3af" }}>Pending</span>}
                    {item.status === "loading" && <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#1a56db" }} />}
                    {item.status === "pass" && <CheckCircle className="w-5 h-5" style={{ color: "#10b981" }} />}
                    {item.status === "fail" && <XCircle className="w-5 h-5" style={{ color: "#ef4444" }} />}
                  </div>
                </div>
              ))}
            </div>

            {hasFailedWebcam && checksFinished && (
              <div className="p-4 bg-critical/10 border border-critical rounded-xl mb-6 text-left flex gap-3" style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", borderRadius: "12px", padding: "1rem", marginBottom: "1rem" }}>
                <ShieldAlert className="w-5 h-5 text-critical shrink-0" style={{ color: "#ef4444" }} />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#ef4444", margin: 0 }}>Webcam Required</h4>
                  <p className="text-xs text-text-secondary leading-relaxed" style={{ margin: 0, color: "#4b5563" }}>
                    Camera access was denied. You may proceed in <strong>Reduced-Proctoring Mode</strong>. 
                    Your recruiter will be notified of this hardware fallback.
                  </p>
                </div>
              </div>
            )}

            {checksRunning && (
              <div className="text-center py-2 text-sm text-text-secondary flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                Running diagnostics...
              </div>
            )}

            {checksFinished && (
              <div className="space-y-3">
                {allPassed ? (
                  <button
                    onClick={() => handleSystemCheckNext(false)}
                    className="w-full py-3 bg-accent text-white hover:bg-accent-hover font-semibold rounded-xl shadow-lg transition-colors cursor-pointer"
                    style={{ backgroundColor: "#1a56db", width: "100%", padding: "0.75rem", borderRadius: "12px", color: "#fff", fontWeight: "bold" }}
                  >
                    Proceed to Consent
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: "1rem" }}>
                    <button
                      onClick={runDiagnostics}
                      className="flex-1 py-3 bg-surface hover:bg-surface/80 border border-border-token text-text-primary font-semibold rounded-xl transition-all cursor-pointer"
                      style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", flex: 1, padding: "0.75rem", borderRadius: "12px" }}
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => handleSystemCheckNext(true)}
                      className="flex-1 py-3 bg-accent text-white hover:bg-accent-hover font-semibold rounded-xl shadow-lg transition-colors cursor-pointer"
                      style={{ backgroundColor: "#1a56db", flex: 1, padding: "0.75rem", borderRadius: "12px", color: "#fff", fontWeight: "bold" }}
                    >
                      Proceed with Fallbacks
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardLayout>
    );
  }

  if (stage === "CONSENT_SELFIE") {
    return (
      <CardLayout>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight mb-2 text-center">Consent & Selfie</h1>
          <p className="text-text-secondary text-xs text-center mb-6" style={{ color: "#6b7280" }}>
            Establish identity and review data agreements
          </p>

          <div className="bg-surface border border-border-token rounded-xl p-5 mb-6 text-sm text-left max-h-48 overflow-y-auto" style={{ background: "#f9fafb", border: "1px solid #e5e7eb", padding: "1rem", borderRadius: "12px", maxHeight: "12rem", overflowY: "auto", textAlign: "left", marginBottom: "1rem" }}>
            <h3 className="font-bold text-text-primary mb-2 flex items-center gap-2" style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0 0 0.5rem 0" }}>
              <Shield className="w-4 h-4 text-accent" style={{ color: "#1a56db" }} />
              Biometric Data Consent Policy
            </h3>
            <p className="text-text-secondary leading-relaxed mb-3 text-xs" style={{ fontSize: "0.75rem", color: "#4b5563" }}>
              We collect your image and baseline facial patterns for session verification and integrity confirmation. 
              No governmental identity records are compiled. Raw video frames remain private on your browser.
            </p>
          </div>

          {!reducedProctoring ? (
            <div className="mb-6 text-center">
              {photoCaptured && photoDataUrl ? (
                <div className="relative mx-auto w-64 h-48 rounded-xl border border-success overflow-hidden bg-surface" style={{ width: "16rem", height: "12rem", margin: "0 auto 1rem auto", borderRadius: "12px", border: "2px solid #10b981", overflow: "hidden", position: "relative" }}>
                  <img src={photoDataUrl} alt="Baseline selfie" className="w-full h-full object-cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div className="absolute inset-0 bg-success/15 flex items-center justify-center" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(16, 185, 129, 0.15)" }}>
                    <span className="bg-success text-white rounded-full p-1" style={{ background: "#10b981", borderRadius: "50%", padding: "0.25rem", color: "#fff" }}><Check className="w-5 h-5" /></span>
                  </div>
                </div>
              ) : (
                <div className="relative mx-auto w-64 h-48 rounded-xl border border-border-token overflow-hidden bg-black flex items-center justify-center" style={{ width: "16rem", height: "12rem", margin: "0 auto 1rem auto", borderRadius: "12px", background: "#000", overflow: "hidden", position: "relative" }}>
                  {capturing ? (
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                  ) : (
                    <span className="text-xs text-text-secondary" style={{ color: "#9ca3af" }}>Camera Loading...</span>
                  )}
                </div>
              )}

              {!photoCaptured && (
                <button
                  onClick={captureSelfie}
                  disabled={!capturing}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface/85 border border-border-token text-text-primary text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "8px", cursor: "pointer" }}
                >
                  <Camera className="w-4 h-4 text-accent" style={{ color: "#1a56db" }} />
                  <span>Capture Reference Image</span>
                </button>
              )}

              {photoCaptured && (
                <button
                  onClick={() => {
                    setPhotoCaptured(false);
                    void startCamera();
                  }}
                  className="mt-3 text-xs text-accent hover:text-accent-hover font-semibold transition-colors cursor-pointer"
                  style={{ border: "none", background: "none", color: "#1a56db", fontWeight: "bold", cursor: "pointer" }}
                >
                  Retake Reference Image
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 bg-warning/10 border border-warning rounded-xl mb-6 text-left flex gap-3" style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid #f59e0b", borderRadius: "12px", padding: "1rem", marginBottom: "1rem" }}>
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" style={{ color: "#f59e0b" }} />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#f59e0b", margin: 0 }}>Reduced Proctoring</h4>
                <p className="text-xs text-text-secondary leading-relaxed" style={{ margin: 0, color: "#4b5563" }}>
                  Biometric collection is disabled due to your check results. Faceless telemetry will run in parallel.
                </p>
              </div>
            </div>
          )}

          <label className="flex items-start gap-3 p-4 bg-surface/50 border border-border-token rounded-xl mb-6 text-left cursor-pointer" style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", background: "#f9fafb", border: "1px solid #e5e7eb", padding: "1rem", borderRadius: "12px", textAlign: "left", marginBottom: "1.5rem" }}>
            <input
              type="checkbox"
              checked={hasConsented}
              onChange={(e) => setHasConsented(e.target.checked)}
              style={{ marginTop: "0.2rem" }}
            />
            <span className="text-xs text-text-secondary leading-relaxed" style={{ fontSize: "0.75rem", color: "#4b5563" }}>
              I explicitly declare consent to the collection of my image and browser events as detailed in the Biometric Data Policy.
            </span>
          </label>

          <button
            onClick={handleConsentSelfieNext}
            disabled={!hasConsented || (!reducedProctoring && !photoCaptured) || uploading}
            className="w-full py-3 bg-accent text-white hover:bg-accent-hover disabled:bg-surface disabled:text-text-secondary/50 disabled:border disabled:border-border-token font-semibold rounded-xl shadow-lg transition-all duration-150 cursor-pointer"
            style={{ backgroundColor: "#1a56db", width: "100%", padding: "0.75rem", borderRadius: "12px", color: "#fff", fontWeight: "bold", opacity: (!hasConsented || (!reducedProctoring && !photoCaptured) || uploading) ? 0.5 : 1 }}
          >
            {uploading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading Selfie...
              </span>
            ) : (
              "Proceed to Lobby"
            )}
          </button>
        </div>
      </CardLayout>
    );
  }

  // Stage 3: READY_TO_BEGIN
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f5f5f5",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "2.5rem",
          maxWidth: "520px",
          width: "100%",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            marginBottom: "0.5rem",
            color: "#111",
          }}
        >
          Assessment Lobby
        </h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Role: <strong>{roleTemplateName ?? "—"}</strong>
        </p>

        <div style={{ marginBottom: "2rem" }}>
          <p style={{ color: "#4b5563", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
            Duration: <strong>{durationMinutes} minutes</strong>
          </p>
          <p style={{ color: "#4b5563", fontSize: "0.875rem" }}>
            Status: <strong>Ready to start</strong>
          </p>
        </div>

        <button
          onClick={handleStartAssessment}
          disabled={isLoading}
          style={{
            backgroundColor: "#1a56db",
            width: "100%",
            padding: "0.75rem",
            borderRadius: "12px",
            color: "#fff",
            fontWeight: "bold",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Starting...
            </>
          ) : (
            <>
              Start Assessment <ChevronRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
