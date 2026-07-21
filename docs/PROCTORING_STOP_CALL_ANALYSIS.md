# Proctoring Camera Stop() Call Analysis

**Bug:** Camera stream stops completely when face is undetected for 2+ seconds, not just logging "FACE_MISSING" event.

**Hypothesis:** Something is calling `stop()` (or a method that leads to it) when `FACE_MISSING` condition is detected, killing the stream instead of just flagging an event.

---

## 1. ALL STOP() CALL SITES

### Primary Stop Path: AssessmentShell.tsx
**File:** `CD-Recruit/frontend/candidate-web/src/pages/Assessment/AssessmentShell.tsx`
**Lines:** 47-52

```typescript
// 1. Initialize Proctoring Pipeline if FULL mode
useEffect(() => {
  if (!sessionId || cvMode !== "FULL") return;

  let stopped = false;
  const startProctoring = async () => {
    if (stopped) return;
    const success = await ProctoringModule.getInstance().start(sessionId);
    if (success) {
      console.log("[Proctoring] Active on-device CV monitoring initialized.");
    } else {
      console.warn("[Proctoring] Failed to start. Running in reduced fallback.");
    }
  };

  void startProctoring();

  return () => {
    stopped = true;
    void ProctoringModule.getInstance().stop();  // <-- CALL SITE #1
  };
}, [sessionId, cvMode]);
```

**Trigger:** Component unmount OR `sessionId` or `cvMode` dependency changes

**What it calls:**
- `ProctoringModule.getInstance().stop()` (line 51 in proctoring.module.ts)

---

### ProctoringModule.stop() Implementation
**File:** `CD-Recruit/frontend/candidate-web/src/proctoring/proctoring.module.ts`
**Lines:** 120-143

```typescript
/**
 * Stop the proctoring pipeline, release camera, and flush remaining uploads.
 */
public async stop(): Promise<void> {
  console.log("[Proctoring] Stopping proctoring module...");

  // Stop frame loops
  FrameProcessorService.getInstance().stop();
  if (this.unsubscribeFrame) {
    this.unsubscribeFrame();
    this.unsubscribeFrame = null;
  }

  // Stop event engine
  if (this.unsubscribeEvents) {
    this.unsubscribeEvents();
    this.unsubscribeEvents = null;
  }
  DetectionEngineService.getInstance().reset();

  // Stop webcam and rolling recorder
  RollingBufferService.getInstance().stop();
  WebcamService.getInstance().stop();  // <-- KILLS CAMERA

  // Flush any pending queue uploads
  await EvidenceUploadService.getInstance().flush();
  EvidenceUploadService.getInstance().reset();

  this.isRunning = false;
  this.sessionId = "";
  console.log("[Proctoring] Proctoring module stopped.");
}
```

**Key line:** `WebcamService.getInstance().stop()` at line 137

---

### WebcamService.stop() Implementation
**File:** `CD-Recruit/frontend/candidate-web/src/proctoring/webcam.service.ts`
**Lines:** 91-106

```typescript
/**
 * Stop the webcam stream and release tracks.
 */
public stop(): void {
  if (this.stream) {
    this.stream.getTracks().forEach((track) => {
      track.stop();  // <-- KILLS ACTUAL CAMERA HARDWARE
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
```

**Critical:** `track.stop()` (line 95) is what actually stops the camera hardware.

---

## 2. FACE_MISSING HANDLER ANALYSIS

**File:** `CD-Recruit/frontend/candidate-web/src/proctoring/detection-engine.service.ts`
**Lines:** 69-77 (evaluation logic) and 128-165 (checkAndTrigger)

```typescript
public evaluate(
  face: FaceDetectionResult,
  pose: PoseDetectionResult,
  object: ObjectDetectionResult,
  timestamp: number,
): void {
  if (!this.sessionId) return;

  // 1. FACE_MISSING (No face detected for configured threshold)
  if (!face.faceDetected || face.faceCount === 0) {
    if (this.faceMissingStartTime === null) {
      this.faceMissingStartTime = timestamp;
    } else if (timestamp - this.faceMissingStartTime >= CONFIG.FACE_MISSING_THRESHOLD_MS) {
      this.checkAndTrigger("FACE_MISSING", "mediapipe-face-v1", timestamp);  // <-- EVENT TRIGGERED
    }
  } else {
    this.faceMissingStartTime = null;
  }
  // ... rest of evaluation
}

/**
 * Applies cooldown logic, and calls listeners if the event passes filters.
 */
private checkAndTrigger(eventType: ProctoringEventType, modelVersion: string, timestamp: number): void {
  const cooldown = COOLDOWN_MAPPING[eventType] ?? 0;
  const lastTrigger = this.lastTriggeredEvents[eventType];

  // If still in cooldown period, do not create duplicate events
  if (cooldown > 0 && timestamp - lastTrigger < cooldown) {
    return;
  }

  // Reset cooldown tracker
  this.lastTriggeredEvents[eventType] = timestamp;

  const event: ProctoringEvent = {
    sessionId: this.sessionId,
    eventType,
    severity: SEVERITY_MAPPING[eventType],
    timestamp: new Date(timestamp).toISOString(),
    modelVersion,
  };

  console.warn(`[Proctoring Event Triggered]: ${eventType} (Severity: ${event.severity})`);

  // Notify subscribers  <-- CALLS EVENT LISTENERS
  for (const listener of this.listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("Error invoking event listener:", err);
    }
  }
}
```

**What checkAndTrigger does:**
1. Creates a `ProctoringEvent` object
2. Logs warning to console
3. **Calls all registered listeners** (line 161)

**Does it call stop()?**
❌ **NO** — `checkAndTrigger()` itself does NOT call `stop()`, `pause()`, `track.stop()`, or any stream-killing method.

---

## 3. EVENT LISTENER REGISTRATION (FACE_MISSING Handler)

**File:** `CD-Recruit/frontend/candidate-web/src/proctoring/proctoring.module.ts`
**Lines:** 73-84

```typescript
const engine = DetectionEngineService.getInstance();
engine.setSessionId(sessionId);

this.unsubscribeEvents = engine.subscribe(async (event) => {
  try {
    const activeStream = webcam.getStream();
    if (activeStream) {
      // Trigger 6-second capture (3s past + 3s future)
      const clipBlob = await EvidenceCaptureService.getInstance().captureClip(activeStream);
      // Queue / upload to MinIO and store metadata
      await EvidenceUploadService.getInstance().uploadEvidence(sessionId, event, clipBlob);
    }
  } catch (err) {
    console.error("[Proctoring] Failed to process evidence capture for event:", event.eventType, err);
  }
});
```

**What the listener does when FACE_MISSING fires:**
1. Gets the active stream
2. Calls `EvidenceCaptureService.getInstance().captureClip(activeStream)`
3. Calls `EvidenceUploadService.getInstance().uploadEvidence(sessionId, event, clipBlob)`

**Does it call stop()?**
❌ **NO** — The listener only captures evidence and uploads it. No stop() call.

---

## 4. VISIBILITY/BLUR/TAB-SWITCH HANDLERS

**Search result:** ❌ **NO EVENT LISTENERS FOUND**

Grep searched for:
- `visibilitychange`
- `addEventListener.*blur`
- `addEventListener.*focus`

**Result:** No matches found in any proctoring file.

---

## 5. POTENTIAL CULPRIT: EvidenceCaptureService

**File:** `CD-Recruit/frontend/candidate-web/src/proctoring/evidence-capture.service.ts`
**Lines:** 26-52

```typescript
public async captureClip(stream: MediaStream): Promise<Blob> {
  const rollingBuffer = RollingBufferService.getInstance();
  const pastChunks = rollingBuffer.getPastBuffer();

  console.log(`Generating evidence clip. Past chunks count: ${pastChunks.length}`);

  return new Promise((resolve, reject) => {
    try {
      const mimeType = pastChunks[0]?.type || "video/webm";
      const tempRecorder = new MediaRecorder(stream, { mimeType });
      const futureChunks: Blob[] = [];

      tempRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          futureChunks.push(event.data);
        }
      };

      tempRecorder.onstop = () => {
        try {
          // Merge the in-memory chunks
          const mergedBlob = new Blob([...pastChunks, ...futureChunks], {
            type: mimeType,
          });
          console.log(`Evidence clip merged successfully. Size: ${mergedBlob.size} bytes`);
          resolve(mergedBlob);
        } catch (err) {
          console.error("Failed to merge evidence clip chunks:", err);
          reject(err);
        }
      };

      // Record the next 3 seconds
      tempRecorder.start();

      setTimeout(() => {
        try {
          if (tempRecorder.state !== "inactive") {
            tempRecorder.stop();  // <-- ONLY STOPS LOCAL RECORDER, NOT CAMERA
          }
        } catch (err) {
          console.error("Error stopping temp recorder for evidence capture:", err);
          reject(err);
        }
      }, CONFIG.FUTURE_BUFFER_SECONDS * 1000);
    } catch (err) {
      console.error("Error setting up temp recorder for evidence capture:", err);
      reject(err);
    }
  });
}
```

**Does it call stop() on the camera?**
❌ **NO** — Line 47 calls `tempRecorder.stop()`, which stops only the **local MediaRecorder instance**, not the underlying stream. The `stream` parameter passed to `EvidenceCaptureService.captureClip()` is NOT stopped.

---

## 6. ROOT CAUSE ANALYSIS

### ONLY Stop Path That Could Fire on FACE_MISSING:

**AssessmentShell useEffect cleanup (line 51)**

This is triggered when:
1. Component unmounts
2. `sessionId` dependency changes
3. `cvMode` dependency changes

**Hypothesis:** Is `sessionId` or `cvMode` changing when face goes missing?

---

## SUMMARY

| Call Site | File | Line | Trigger | Calls stop()? |
|-----------|------|------|---------|--------------|
| AssessmentShell useEffect cleanup | AssessmentShell.tsx | 51 | Component unmount or dependency change | ✅ YES |
| FACE_MISSING event handler | proctoring.module.ts | 73-84 | When FACE_MISSING event fires | ❌ NO |
| checkAndTrigger listener | detection-engine.service.ts | 161 | When any event triggers | ❌ NO |
| EvidenceCaptureService | evidence-capture.service.ts | 47 | Evidence recording timeout | ❌ NO (only stops local recorder) |

---

## CRITICAL FINDING

**The ONLY place that calls `WebcamService.stop()` is the AssessmentShell useEffect cleanup.**

**If the camera is stopping when face goes missing, it means:**

1. ❓ `sessionId` is being reset/cleared somewhere when face detection fails
2. ❓ `cvMode` is being changed from "FULL" to something else when face detection fails
3. ❓ Some OTHER code outside proctoring services is calling `ProctoringModule.getInstance().stop()`

---

## NEXT INVESTIGATION STEPS

**Need to check:**

1. Does `sessionId` or `cvMode` change when FACE_MISSING event fires?
   - Add logging to AssessmentShell useEffect dependencies
   - Check if session store is being updated

2. Search for ANY calls to `ProctoringModule.getInstance().stop()` OUTSIDE of:
   - AssessmentShell cleanup return
   - Tests/mock code
   
3. Check if there's a router/navigation trigger that unmounts the component

4. Add error boundary around FACE_MISSING logic to see if exceptions are triggering cleanup

