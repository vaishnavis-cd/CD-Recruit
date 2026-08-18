import type * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { ortModule } from './models';

/**
 * Preprocesses 112x112 aligned face buffer into RGB tensor normalized to [-1, 1]
 * ([1, 3, 112, 112]), runs ArcFace inference, and returns L2-normalized 512-dim embedding.
 */
export async function getEmbedding(
  alignedFaceBuffer: Buffer,
  session: ort.InferenceSession
): Promise<Float32Array> {
  const { data: rawRgb } = await sharp(alignedFaceBuffer)
    .resize(112, 112, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const numPixels = 112 * 112;
  const tensorData = new Float32Array(1 * 3 * numPixels);

  for (let i = 0; i < numPixels; i++) {
    tensorData[i] = (rawRgb[i * 3] - 127.5) / 128.0;
    tensorData[numPixels + i] = (rawRgb[i * 3 + 1] - 127.5) / 128.0;
    tensorData[2 * numPixels + i] = (rawRgb[i * 3 + 2] - 127.5) / 128.0;
  }

  const inputName = session.inputNames[0] || 'input';
  const tensor = new ortModule.Tensor('float32', tensorData, [1, 3, 112, 112]);

  const results = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0] || Object.keys(results)[0];
  const embedding = results[outputName].data as Float32Array;

  return normalizeL2(embedding);
}

function normalizeL2(vec: Float32Array): Float32Array {
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) normSq += vec[i] * vec[i];
  const norm = Math.sqrt(normSq) || 1e-6;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/**
 * Computes Cosine Distance between two 512-dim embedding vectors.
 * Formula: 1 - (dot(a, b) / (norm(a) * norm(b)))
 */
export function cosineDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding length mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  return normA === 0 || normB === 0 ? 1.0 : 1.0 - dot / (normA * normB);
}
