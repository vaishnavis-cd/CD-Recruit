import type * as ort from 'onnxruntime-node';
import { detectFace } from './detect';
import { alignFace } from './align';
import { getEmbedding, cosineDistance } from './embed';
import { ONNX_ARCFACE_THRESHOLD } from './threshold';

export type VerificationSuccessResult = {
  matched: boolean;
  distance: number;
  threshold: number;
};

export type VerificationErrorResult = {
  matched: false;
  distance: null;
  threshold: number;
  error: string;
};

export type VerificationResult = VerificationSuccessResult | VerificationErrorResult;

/**
 * High-level orchestration function for face verification.
 * Runs: detect both faces -> align both -> embed both -> compute cosine distance -> compare to threshold.
 * Catches any detection/inference errors and returns a structured error result instead of crashing.
 */
export async function verifyFaces(
  imagePathA: string,
  imagePathB: string,
  models: { retinaface: ort.InferenceSession; arcface: ort.InferenceSession }
): Promise<VerificationResult> {
  try {
    const faceA = await detectFace(imagePathA, models.retinaface);
    const alignedA = await alignFace(imagePathA, faceA.landmarks);
    const embA = await getEmbedding(alignedA, models.arcface);

    const faceB = await detectFace(imagePathB, models.retinaface);
    const alignedB = await alignFace(imagePathB, faceB.landmarks);
    const embB = await getEmbedding(alignedB, models.arcface);

    const distance = cosineDistance(embA, embB);
    const matched = distance <= ONNX_ARCFACE_THRESHOLD;

    return {
      matched,
      distance,
      threshold: ONNX_ARCFACE_THRESHOLD,
    };
  } catch (err: any) {
    return {
      matched: false,
      distance: null,
      threshold: ONNX_ARCFACE_THRESHOLD,
      error: err.message || String(err),
    };
  }
}
