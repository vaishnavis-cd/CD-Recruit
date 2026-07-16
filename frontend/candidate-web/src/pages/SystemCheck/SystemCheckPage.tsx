import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CardLayout } from "@/components/layout/CardLayout";
import { CheckCircle, XCircle, Loader2, Camera, ShieldAlert } from "lucide-react";

interface CheckItem {
  id: string;
  name: string;
  description: string;
  status: "idle" | "loading" | "pass" | "fail";
}

export function SystemCheckPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as {
    scheduledTime?: string;
    bufferMinutes?: number;
    graceMinutes?: number;
  } | null;

  const [priming, setPriming] = useState(true);
  const [checks, setChecks] = useState<CheckItem[]>([
    { id: "wasm", name: "WebAssembly Support", description: "Required for on-device browser checks", status: "idle" },
    { id: "webcam", name: "Webcam Access", description: "Required for identity and proctor validation", status: "idle" },
    { id: "cpu", name: "Processor Core Check", description: "Checks CPU resources for local ML", status: "idle" },
    { id: "memory", name: "Device Memory Check", description: "Validates available system RAM", status: "idle" },
    { id: "storage", name: "Local Storage Estimate", description: "Verifies local space for autosave buffers", status: "idle" },
  ]);

  const [isRunning, setIsRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const startChecks = async () => {
    setPriming(false);
    setIsRunning(true);
    setFinished(false);
    
    // Helper to update check status
    const updateStatus = (id: string, status: "loading" | "pass" | "fail") => {
      setChecks(prev => prev.map(item => item.id === id ? { ...item, status } : item));
    };

    // 1. WASM
    updateStatus("wasm", "loading");
    await new Promise(r => setTimeout(r, 600));
    const wasmSupported = typeof WebAssembly === "object";
    updateStatus("wasm", wasmSupported ? "pass" : "fail");

    // 2. Webcam
    updateStatus("webcam", "loading");
    await new Promise(r => setTimeout(r, 800));
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
    await new Promise(r => setTimeout(r, 500));
    const cores = navigator.hardwareConcurrency || 4;
    updateStatus("cpu", cores >= 2 ? "pass" : "fail");

    // 4. Memory
    updateStatus("memory", "loading");
    await new Promise(r => setTimeout(r, 500));
    // @ts-ignore
    const mem = navigator.deviceMemory || 4;
    updateStatus("memory", mem >= 2 ? "pass" : "fail");

    // 5. Storage
    updateStatus("storage", "loading");
    await new Promise(r => setTimeout(r, 500));
    let storageOk = true;
    if (navigator.storage && navigator.storage.estimate) {
      const { quota, usage } = await navigator.storage.estimate();
      const freeGb = ((quota || 0) - (usage || 0)) / (1024 * 1024 * 1024);
      storageOk = freeGb > 0.1; // at least 100MB
    }
    updateStatus("storage", storageOk ? "pass" : "fail");

    setIsRunning(false);
    setFinished(true);
  };

  const handleNext = (reduced = false) => {
    // Attempt fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    navigate("/consent", {
      state: {
        ...state,
        reducedProctoring: reduced || checks.some(c => c.id === "webcam" && c.status === "fail")
      }
    });
  };

  const hasFailedWebcam = checks.find(c => c.id === "webcam")?.status === "fail";
  const allPassed = checks.every(c => c.status === "pass");

  if (priming) {
    return (
      <CardLayout>
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent mb-6">
            <Camera className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight mb-4">Device & Hardware Check</h1>
          <p className="text-text-secondary text-sm mb-6 leading-relaxed">
            Before beginning, the platform needs to verify your camera permissions and device capabilities. 
            <strong> Raw video streams stay on your device by default</strong>; only structured flags are processed.
          </p>

          <div className="bg-surface border border-border-token rounded-xl p-5 text-left mb-8 text-sm space-y-3">
            <div className="flex items-start gap-2.5">
              <span className="text-accent font-bold">•</span>
              <p className="text-text-secondary">We will request camera access to verify your identity.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="text-accent font-bold">•</span>
              <p className="text-text-secondary">We check CPU & memory resources to run lightweight on-device verification.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="text-accent font-bold">•</span>
              <p className="text-text-secondary">You will be prompted to enter full-screen mode next.</p>
            </div>
          </div>

          <button
            onClick={startChecks}
            className="w-full py-3 bg-accent text-white hover:bg-accent-hover font-semibold rounded-xl shadow-lg transition-colors cursor-pointer"
          >
            Start Device Checks
          </button>
        </div>
      </CardLayout>
    );
  }

  return (
    <CardLayout>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight mb-2 text-center">Diagnostics Checklist</h1>
        <p className="text-text-secondary text-xs text-center mb-6">
          Verifying core browser specs and media devices
        </p>

        <div className="space-y-4 mb-8">
          {checks.map(item => (
            <div key={item.id} className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border-token">
              <div>
                <h3 className="text-sm font-bold text-text-primary">{item.name}</h3>
                <p className="text-xs text-text-secondary">{item.description}</p>
              </div>

              <div>
                {item.status === "idle" && (
                  <span className="text-xs text-text-secondary font-mono">Pending</span>
                )}
                {item.status === "loading" && (
                  <Loader2 className="w-5 h-5 text-accent animate-spin" />
                )}
                {item.status === "pass" && (
                  <CheckCircle className="w-5 h-5 text-success" />
                )}
                {item.status === "fail" && (
                  <XCircle className="w-5 h-5 text-critical" />
                )}
              </div>
            </div>
          ))}
        </div>

        {hasFailedWebcam && finished && (
          <div className="p-4 bg-critical/10 border border-critical rounded-xl mb-6 text-left flex gap-3">
            <ShieldAlert className="w-5 h-5 text-critical shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-critical uppercase tracking-wider mb-1">Webcam Required</h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                Camera access was denied. You may proceed in <strong>Reduced-Proctoring Mode</strong>. 
                Your recruiter will be notified of this hardware fallback.
              </p>
            </div>
          </div>
        )}

        {isRunning && (
          <div className="text-center py-2 text-sm text-text-secondary flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            Running diagnostics...
          </div>
        )}

        {finished && (
          <div className="space-y-3">
            {allPassed ? (
              <button
                onClick={() => handleNext(false)}
                className="w-full py-3 bg-accent text-white hover:bg-accent-hover font-semibold rounded-xl shadow-lg transition-colors cursor-pointer"
              >
                Proceed to Consent
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={startChecks}
                  className="flex-1 py-3 bg-surface hover:bg-surface/80 border border-border-token text-text-primary font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Retry Checks
                </button>
                <button
                  onClick={() => handleNext(true)}
                  className="flex-1 py-3 bg-accent text-white hover:bg-accent-hover font-semibold rounded-xl shadow-lg transition-colors cursor-pointer"
                >
                  Proceed with Fallbacks
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </CardLayout>
  );
}
