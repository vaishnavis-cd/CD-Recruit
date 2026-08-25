// ONNX_ARCFACE_THRESHOLD: empirically derived from labeled test data
// (multiple candidates, correct-ID and wrong-ID pairs tested)
// Same-person distances observed: 0.36–0.53
// Different-person distances observed: 0.90–1.03
// Threshold set at midpoint with safety margin on both sides.
export const ONNX_ARCFACE_THRESHOLD = 0.72;
