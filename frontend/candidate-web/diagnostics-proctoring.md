# Proctoring Face Detection Diagnostics

Run these commands in the browser console **while on the assessment page with proctoring active**.

---

## Step 1: Camera Enumeration

Check how many video input devices are available and their labels (to detect IR camera vs RGB camera):

```javascript
navigator.mediaDevices.enumerateDevices().then(devices => {
  const videoDevices = devices.filter(d => d.kind === 'videoinput');
  console.log(`Found ${videoDevices.length} video input device(s):`);
  console.table(videoDevices.map(d => ({
    label: d.label,
    deviceId: d.deviceId.substring(0, 20) + '...',
    groupId: d.groupId
  })));
});
```

**What to look for:**
- If you see "IR Camera" or "Windows Hello" → This is the IR camera that outputs infrared (appears black)
- If you see "Integrated Camera", "HD Webcam", "Front Camera" → This is the RGB camera that works with face detection
- If only 1 device is listed → Camera selection is not the issue

---

## Step 2: GPU/WebGL Delegate Check

The console should already have these logs from the model loading. Search for:

```
[FaceDetection] MediaPipe Face Landmarker model loaded successfully with GPU delegate.
[PoseDetection] MediaPipe Pose Landmarker model loaded successfully with GPU delegate.
[ObjectDetection] MediaPipe Object Detector model loaded successfully with GPU delegate.
```

**What to look for:**
- ✅ All three "loaded successfully with GPU delegate" → GPU is working
- ❌ Any "Failed to load" errors → Note the exact error message
- ⚠️ WebGL warnings before model loading → GPU delegate may have fallen back to CPU

To manually check WebGL support:
```javascript
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
console.log('WebGL supported:', !!gl);
if (gl) {
  console.log('WebGL version:', gl.getParameter(gl.VERSION));
  console.log('WebGL renderer:', gl.getParameter(gl.RENDERER));
}
```

---

## Step 3: Stream Validation (Already Fixed)

The `webcam.service.ts` now logs dimensions automatically. Look for these console messages:

```
[Webcam] Video metadata loaded. Dimensions: WIDTHxHEIGHT, readyState: N
[Webcam] Video playback started. Current dimensions: WIDTHxHEIGHT, readyState: N, currentTime: N
```

**What to look for:**
- ✅ Dimensions are > 0 (e.g., "640x480" or "1280x720") → Video loaded correctly
- ❌ Dimensions are "0x0" → Video metadata wasn't loaded before detection started (should be fixed now)
- ⚠️ readyState < 2 → Video isn't ready for frame processing

---

## Step 4: Live Stream Settings Check

Check the actual camera being used and its settings:

```javascript
const video = document.getElementById('proctoring-hidden-webcam');
if (!video) {
  console.error('Video element not found. Is proctoring running?');
} else if (!video.srcObject) {
  console.error('No stream attached to video element.');
} else {
  const stream = video.srcObject;
  const track = stream.getVideoTracks()[0];
  
  console.log('=== ACTIVE CAMERA ===');
  console.log('Label:', track.label);
  console.log('Device ID:', track.getSettings().deviceId);
  console.log('Settings:', track.getSettings());
  
  console.log('\n=== VIDEO ELEMENT STATE ===');
  console.log('Dimensions:', video.videoWidth, 'x', video.videoHeight);
  console.log('ReadyState:', video.readyState, '(0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA)');
  console.log('CurrentTime:', video.currentTime);
  console.log('Paused:', video.paused);
  console.log('Duration:', video.duration);
  
  console.log('\n=== TRACK CONSTRAINTS ===');
  console.log('Capabilities:', track.getCapabilities ? track.getCapabilities() : 'Not supported');
  console.log('Constraints:', track.getConstraints());
}
```

**What to look for:**
- **Label**: Does it say "IR Camera" or "RGB Camera"? If IR → that's the problem
- **Dimensions**: Should match requested 640x480 or actual camera resolution (e.g., 1280x720)
- **ReadyState**: Should be 2, 3, or 4 when detection is running
- **CurrentTime**: Should be > 0 and incrementing (indicates video is playing)
- **Settings**: Check `width`, `height`, `frameRate`, `facingMode` values

---

## Step 5: Manual Face Detection Test

Test MediaPipe face detection directly on the current video frame:

```javascript
// Get the video element
const video = document.getElementById('proctoring-hidden-webcam');
if (!video || !video.srcObject) {
  console.error('Video not ready');
} else {
  console.log('Video ready. Dimensions:', video.videoWidth, 'x', video.videoHeight);
  console.log('ReadyState:', video.readyState);
  
  // Try to detect face using the existing service
  import('@/proctoring/face-detection.service').then(({ FaceDetectionService }) => {
    const service = FaceDetectionService.getInstance();
    if (!service.isModelLoaded()) {
      console.error('Face detection model not loaded yet. Wait a few seconds and try again.');
    } else {
      const result = service.detect(video);
      console.log('=== FACE DETECTION RESULT ===');
      console.log('Face detected:', result.faceDetected);
      console.log('Face count:', result.faceCount);
      console.log('Head direction:', result.headDirection);
      
      if (!result.faceDetected) {
        console.warn('⚠️ NO FACE DETECTED. Possible causes:');
        console.warn('1. IR camera selected (video appears black)');
        console.warn('2. Poor lighting or face not clearly visible');
        console.warn('3. Face too far from camera or out of frame');
        console.warn('4. Video frame not yet available (check readyState)');
      }
    }
  });
}
```

---

## Expected Output Summary

After running all commands, you should see:

### ✅ Good State (Detection Should Work)
```
Found 1 video input device(s):
  Label: "Integrated Camera" or "HD Webcam"
  
[FaceDetection] MediaPipe Face Landmarker model loaded successfully with GPU delegate.
[PoseDetection] MediaPipe Pose Landmarker model loaded successfully with GPU delegate.
[ObjectDetection] MediaPipe Object Detector model loaded successfully with GPU delegate.

[Webcam] Video metadata loaded. Dimensions: 640x480, readyState: 1
[Webcam] Video playback started. Current dimensions: 640x480, readyState: 3, currentTime: 0.033

=== ACTIVE CAMERA ===
Label: Integrated Camera
Dimensions: 640 x 480
ReadyState: 3
CurrentTime: 1.234 (incrementing)

=== FACE DETECTION RESULT ===
Face detected: true
Face count: 1
Head direction: CENTER
```

### ❌ Bad State (Detection Will Fail)
```
Found 2 video input devices:
  Label: "IR Camera" ← PROBLEM: IR camera outputs infrared
  Label: "Integrated Camera"
  
Active Camera: IR Camera ← PROBLEM: Wrong camera selected

OR

Dimensions: 0 x 0 ← PROBLEM: Video metadata not loaded
ReadyState: 0 or 1 ← PROBLEM: Video not ready

OR

Face detected: false ← PROBLEM: MediaPipe can't find a face
```

---

## Next Steps

After gathering all diagnostic output:

1. **If only 1 camera exists** → Camera selection is not the issue
2. **If multiple cameras exist and IR is active** → Need to add deviceId selection logic
3. **If GPU delegate failed** → Need to add CPU fallback
4. **If dimensions are 0x0** → The loadedmetadata fix should resolve this
5. **If everything looks good but no face detected** → Only then consider lowering confidence thresholds

Report all console output back for analysis.
