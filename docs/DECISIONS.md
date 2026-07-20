# Architectural Decisions

## Decision 8: MediaPipe CV Proctoring Deferral for Candidate Web

### Context
The original specifications outline local candidate webcam frame analysis via MediaPipe (including face, object, and pose detection) to capture suspicious events in-memory.

### Decision
For Phase 2 production release, candidate-side automated MediaPipe Computer Vision models processing (outside of initial KYC liveness/selfie verification checks) is deferred for the following reasons:
1. Client-side WASM initialization overhead and performance degradation on low-end candidate devices.
2. Inconsistencies in dynamically downloading 30MB+ task models over high-latency client networks.

### Consequence
- The frontend `cv` detection adapters (`cv/real.ts`) are structured as success-resolved no-ops instead of throwing exceptions.
- Proctoring verification relies on telemetry (tab switches, paste actions, and fullscreen exits) and candidate metadata logs rather than automated vision triggers.
