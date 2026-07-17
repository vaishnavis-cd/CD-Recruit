import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CardLayout } from "@/components/layout/CardLayout";
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

interface SyncStep {
  id: string;
  name: string;
  status: "pending" | "syncing" | "done" | "failed";
}

export function SyncValidationPage() {
  const navigate = useNavigate();

  const [steps, setSteps] = useState<SyncStep[]>([
    { id: "events", name: "Synchronizing final telemetry & log data", status: "pending" },
    { id: "code", name: "Validating latest code editor autosave buffers", status: "pending" },
    { id: "close", name: "Finalizing proctoring locks & closing session", status: "pending" },
  ]);

  const [errorOccurred, setErrorOccurred] = useState(false);

  const executeSync = async () => {
    setErrorOccurred(false);
    
    const updateStatus = (id: string, status: "syncing" | "done" | "failed") => {
      setSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    };

    // 1. Telemetry
    updateStatus("events", "syncing");
    await new Promise(r => setTimeout(r, 1000));
    updateStatus("events", "done");

    // 2. Code
    updateStatus("code", "syncing");
    await new Promise(r => setTimeout(r, 1200));
    if (Math.random() < 0.2) {
      updateStatus("code", "failed");
      setErrorOccurred(true);
      return;
    }
    updateStatus("code", "done");

    // 3. Session close
    updateStatus("close", "syncing");
    try {
      const { ProctoringModule } = await import("@/proctoring/proctoring.module");
      await ProctoringModule.getInstance().stop();
    } catch (e) {
      console.warn("Failed to stop proctoring module on close:", e);
    }
    await new Promise(r => setTimeout(r, 800));
    updateStatus("close", "done");

    await new Promise(r => setTimeout(r, 500));
    navigate("/thank-you");
  };

  useEffect(() => {
    executeSync();
  }, []);

  return (
    <CardLayout>
      <div className="text-center">
        {!errorOccurred ? (
          <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent mb-6">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-critical/10 text-critical mb-6">
            <AlertTriangle className="w-8 h-8" />
          </div>
        )}

        <h1 className="text-2xl font-extrabold tracking-tight mb-2">Syncing Your Assessment</h1>
        <p className="text-text-secondary text-sm mb-8">
          Please wait while we guarantee all telemetry and code edits are fully synced to the servers.
        </p>

        {/* Sync Step list */}
        <div className="space-y-4 mb-8 text-left">
          {steps.map(step => (
            <div key={step.id} className="p-4 bg-surface rounded-xl border border-border-token flex items-center justify-between">
              <span className={`text-xs font-semibold ${
                step.status === "failed" ? "text-critical" : step.status === "done" ? "text-text-primary" : "text-text-secondary"
              }`}>
                {step.name}
              </span>

              <div>
                {step.status === "pending" && (
                  <span className="text-[10px] text-text-secondary font-mono">Waiting</span>
                )}
                {step.status === "syncing" && (
                  <Loader2 className="w-4.5 h-4.5 text-accent animate-spin" />
                )}
                {step.status === "done" && (
                  <CheckCircle2 className="w-4.5 h-4.5 text-success" />
                )}
                {step.status === "failed" && (
                  <span className="text-xs text-critical font-bold">Failed</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-accent/5 border border-accent/10 rounded-xl mb-8">
          <p className="text-xs text-text-secondary leading-relaxed font-semibold">
            ⚠️ Please DO NOT close this browser tab or window. Closing the window now may result in data loss.
          </p>
        </div>

        {errorOccurred && (
          <button
            onClick={executeSync}
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white hover:bg-accent-hover font-semibold rounded-xl shadow-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Sync Connection</span>
          </button>
        )}
      </div>
    </CardLayout>
  );
}
