import React, { useEffect, useRef, useState } from 'react';
import { FaceDetectionService } from '../../proctoring/face-detection.service';
import { StatusChip } from '../../components/common/StatusChip';

interface ConsentLivenessStepProps {
  onComplete: () => void;
}

export function ConsentLivenessStep({ onComplete }: ConsentLivenessStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tasks, setTasks] = useState({
    blink: false,
    turnLeft: false,
    turnRight: false,
  });
  const [hasStream, setHasStream] = useState(false);
  const [isFaceAligned, setIsFaceAligned] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Explicitly warm up MediaPipe Face Landmarker model on mount
    FaceDetectionService.getInstance().loadModel().catch(() => {});

    let active = true;

    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      .then(stream => {
        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        setHasStream(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((err) => {
        console.error('[ConsentLivenessStep] Camera stream error:', err);
      });

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Poll face detection for real liveness movement checks & face circle alignment
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const result = FaceDetectionService.getInstance().detect(videoRef.current);
        if (!result) {
          setIsFaceAligned(false);
          return;
        }

        // Face alignment check in oval guide
        const aligned = Boolean(result.faceDetected && (result.faceCount === 1 || result.alignment?.isAligned));
        setIsFaceAligned(aligned || result.faceDetected);

        if (result.blinkDetected) {
          setTasks(t => ({ ...t, blink: true }));
        }
        if (result.headDirection === 'LEFT') {
          setTasks(t => ({ ...t, turnLeft: true }));
        }
        if (result.headDirection === 'RIGHT') {
          setTasks(t => ({ ...t, turnRight: true }));
        }
      } catch {
        setIsFaceAligned(false);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const allPassed = tasks.blink && tasks.turnLeft && tasks.turnRight;

  // Auto-advance once all 3 liveness checks pass
  useEffect(() => {
    if (allPassed) {
      const timer = setTimeout(() => {
        onComplete();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [allPassed, onComplete]);

  function handleSkipFailsafe() {
    setTasks({ blink: true, turnLeft: true, turnRight: true });
    onComplete();
  }

  const activePromptLabel = !tasks.blink
    ? 'Blink twice'
    : !tasks.turnLeft
    ? 'Turn your head left'
    : !tasks.turnRight
    ? 'Turn your head right'
    : 'Liveness confirmed';

  return (
    <div className="max-w-[640px] mx-auto space-y-4">
      {/* Video Container (Spacious and aligned with action buttons) */}
      <div className="relative rounded-2xl overflow-hidden aspect-video max-h-[380px] bg-[var(--surface)] border border-[var(--border)] shadow-md">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transform -scale-x-100"
        />

        {!hasStream && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 bg-slate-900 font-mono">
            Starting camera feed…
          </div>
        )}

        <div className="absolute top-3 left-3">
          <StatusChip
            tone={allPassed ? 'success' : 'accent'}
            label={allPassed ? 'Liveness confirmed' : 'Camera live'}
          />
        </div>

        {/* Dashed face guide circle overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`w-40 sm:w-44 h-52 sm:h-60 rounded-[50%] border-2 border-dashed transition-all duration-300 ${
              isFaceAligned ? 'border-[var(--success)] bg-[var(--success)]/10 scale-105' : 'border-white/35'
            }`}
          />
        </div>

        {/* Bottom center prompt pill overlay */}
        <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
          <div className="inline-block px-3.5 py-1.5 rounded-full text-xs font-semibold bg-black/75 text-white backdrop-blur-xs border border-white/10 font-mono">
            {allPassed ? 'Liveness confirmed' : activePromptLabel}
          </div>
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-1.5">
        {[
          { key: 'blink', label: 'Blink twice', done: tasks.blink },
          { key: 'turnLeft', label: 'Turn your head left', done: tasks.turnLeft },
          { key: 'turnRight', label: 'Turn your head right', done: tasks.turnRight },
        ].map(t => (
          <div
            key={t.key}
            className="flex items-center justify-between text-xs py-2 px-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]"
          >
            <span className="font-medium text-[var(--foreground)]">{t.label}</span>
            <StatusChip
              tone={t.done ? 'success' : 'pending'}
              label={t.done ? 'Done' : 'Waiting'}
              loading={!t.done && isFaceAligned}
            />
          </div>
        ))}
      </div>

      {/* Bottom Action Bar */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={handleSkipFailsafe}
          type="button"
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline cursor-pointer"
        >
          Skip liveness check
        </button>
        <button
          onClick={onComplete}
          disabled={!allPassed}
          type="button"
          className="btn-primary text-xs font-semibold px-6 py-2.5 cursor-pointer"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
