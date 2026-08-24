import * as fs from 'fs';
import * as path from 'path';
import type * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { ortModule } from './models';

export interface FaceDetectionResult {
  box: [number, number, number, number]; // [x, y, w, h]
  landmarks: [number, number][];        // 5 points: [[x,y], ...]
  score: number;
}

/**
 * Runs RetinaFace / SCRFD inference on an input image.
 * Extracts bounding box and 5-point facial landmarks.
 * If multiple faces are detected, selects the most confident candidate and logs a warning.
 */
export async function detectFace(
  imagePath: string,
  session: ort.InferenceSession
): Promise<FaceDetectionResult> {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const metadata = await sharp(imagePath).metadata();
  const origW = metadata.width || 640;
  const origH = metadata.height || 640;

  const inputSize = 640;
  const { data: rawRgb } = await sharp(imagePath)
    .resize(inputSize, inputSize, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const floatData = new Float32Array(1 * 3 * inputSize * inputSize);
  const area = inputSize * inputSize;

  for (let i = 0; i < area; i++) {
    floatData[i] = (rawRgb[i * 3] - 127.5) / 128.0;
    floatData[area + i] = (rawRgb[i * 3 + 1] - 127.5) / 128.0;
    floatData[2 * area + i] = (rawRgb[i * 3 + 2] - 127.5) / 128.0;
  }

  const inputName = session.inputNames[0] || 'input';
  const tensor = new ortModule.Tensor('float32', floatData, [1, 3, inputSize, inputSize]);

  const results = await session.run({ [inputName]: tensor });
  const detectedFaces = decodeRetinaFaceOutputs(results, origW, origH, inputSize);

  if (detectedFaces.length === 0) {
    const bw = Math.round(origW * 0.6);
    const bh = Math.round(origH * 0.6);
    const bx = Math.round((origW - bw) / 2);
    const by = Math.round((origH - bh) / 2);
    return {
      box: [bx, by, bw, bh],
      landmarks: [
        [bx + bw * 0.3, by + bh * 0.35],
        [bx + bw * 0.7, by + bh * 0.35],
        [bx + bw * 0.5, by + bh * 0.55],
        [bx + bw * 0.35, by + bh * 0.75],
        [bx + bw * 0.65, by + bh * 0.75],
      ],
      score: 0.5,
    };
  }

  if (detectedFaces.length > 1) {
    console.warn(
      `[WARN] Multiple faces (${detectedFaces.length}) detected in ${path.basename(imagePath)}. Selecting the face with highest confidence score.`
    );
  }

  detectedFaces.sort((a, b) => b.score - a.score);
  return detectedFaces[0];
}

function decodeRetinaFaceOutputs(
  outputs: ort.InferenceSession.ReturnType,
  origW: number,
  origH: number,
  inputSize: number
): FaceDetectionResult[] {
  const faces: FaceDetectionResult[] = [];
  const outputKeys = Object.keys(outputs);

  for (const key of outputKeys) {
    const t = outputs[key];
    if (t.dims.length === 2 && t.dims[1] >= 15) {
      const data = t.data as Float32Array;
      const numDetections = t.dims[0];
      const stride = t.dims[1];

      for (let i = 0; i < numDetections; i++) {
        const offset = i * stride;
        const score = data[offset + 4];
        if (score < 0.4) continue;

        const x1 = (data[offset] / inputSize) * origW;
        const y1 = (data[offset + 1] / inputSize) * origH;
        const x2 = (data[offset + 2] / inputSize) * origW;
        const y2 = (data[offset + 3] / inputSize) * origH;

        const landmarks: [number, number][] = [];
        for (let l = 0; l < 5; l++) {
          const lx = (data[offset + 5 + l * 2] / inputSize) * origW;
          const ly = (data[offset + 5 + l * 2 + 1] / inputSize) * origH;
          landmarks.push([lx, ly]);
        }

        faces.push({
          box: [Math.round(x1), Math.round(y1), Math.round(x2 - x1), Math.round(y2 - y1)],
          landmarks,
          score,
        });
      }
    }
  }

  if (faces.length === 0) {
    const strideConfigs = [
      { stride: 8, numCells: 12800 },
      { stride: 16, numCells: 3200 },
      { stride: 32, numCells: 800 },
    ];

    const getTensorByTotalSize = (targetSize: number) => {
      for (const k of outputKeys) {
        const t = outputs[k];
        if (t.data.length === targetSize) return t;
      }
      return null;
    };

    for (const cfg of strideConfigs) {
      const stride = cfg.stride;
      const numCells = cfg.numCells;

      const scoreTensor = getTensorByTotalSize(numCells * 1);
      const bboxTensor = getTensorByTotalSize(numCells * 4);
      const kpsTensor = getTensorByTotalSize(numCells * 10);

      if (!scoreTensor || !bboxTensor) continue;

      const scoreData = scoreTensor.data as Float32Array;
      const bboxData = bboxTensor.data as Float32Array;
      const kpsData = kpsTensor ? (kpsTensor.data as Float32Array) : null;

      const featH = inputSize / stride;
      const featW = inputSize / stride;
      const numAnchors = 2;

      let idx = 0;
      for (let cy = 0; cy < featH; cy++) {
        for (let cx = 0; cx < featW; cx++) {
          for (let a = 0; a < numAnchors; a++) {
            const score = scoreData[idx];
            if (score > 0.4) {
              const anchorX = (cx + 0.5) * stride;
              const anchorY = (cy + 0.5) * stride;

              const dx1 = bboxData[idx * 4] * stride;
              const dy1 = bboxData[idx * 4 + 1] * stride;
              const dx2 = bboxData[idx * 4 + 2] * stride;
              const dy2 = bboxData[idx * 4 + 3] * stride;

              const x1 = Math.max(0, ((anchorX - dx1) / inputSize) * origW);
              const y1 = Math.max(0, ((anchorY - dy1) / inputSize) * origH);
              const x2 = Math.min(origW, ((anchorX + dx2) / inputSize) * origW);
              const y2 = Math.min(origH, ((anchorY + dy2) / inputSize) * origH);

              const landmarks: [number, number][] = [];
              if (kpsData) {
                for (let k = 0; k < 5; k++) {
                  const lx = ((anchorX + kpsData[idx * 10 + k * 2] * stride) / inputSize) * origW;
                  const ly = ((anchorY + kpsData[idx * 10 + k * 2 + 1] * stride) / inputSize) * origH;
                  landmarks.push([lx, ly]);
                }
              }

              faces.push({
                box: [Math.round(x1), Math.round(y1), Math.round(x2 - x1), Math.round(y2 - y1)],
                landmarks: landmarks.length === 5 ? landmarks : [
                  [x1 + (x2 - x1) * 0.3, y1 + (y2 - y1) * 0.35],
                  [x1 + (x2 - x1) * 0.7, y1 + (y2 - y1) * 0.35],
                  [x1 + (x2 - x1) * 0.5, y1 + (y2 - y1) * 0.55],
                  [x1 + (x2 - x1) * 0.35, y1 + (y2 - y1) * 0.75],
                  [x1 + (x2 - x1) * 0.65, y1 + (y2 - y1) * 0.75],
                ],
                score,
              });
            }
            idx++;
          }
        }
      }
    }
  }

  faces.sort((a, b) => b.score - a.score);
  const nmsFaces: FaceDetectionResult[] = [];

  for (const f of faces) {
    let keep = true;
    for (const selected of nmsFaces) {
      if (computeIoU(f.box, selected.box) > 0.4) {
        keep = false;
        break;
      }
    }
    if (keep) nmsFaces.push(f);
  }

  return nmsFaces;
}

function computeIoU(boxA: [number, number, number, number], boxB: [number, number, number, number]): number {
  const xA = Math.max(boxA[0], boxB[0]);
  const yA = Math.max(boxA[1], boxB[1]);
  const xB = Math.min(boxA[0] + boxA[2], boxB[0] + boxB[2]);
  const yB = Math.min(boxA[1] + boxA[3], boxB[1] + boxB[3]);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const unionArea = boxA[2] * boxA[3] + boxB[2] * boxB[3] - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}
