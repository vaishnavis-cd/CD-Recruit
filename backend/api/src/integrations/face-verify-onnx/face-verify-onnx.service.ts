import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import { ONNX_ARCFACE_THRESHOLD } from "./threshold";

// Load ONNX Runtime (prefer native onnxruntime-node, fall back to onnxruntime-web WASM backend)
let ortModule: typeof import("onnxruntime-node");
try {
  if (process.platform === "win32") {
    const binDir = path.join(
      process.cwd(),
      "node_modules",
      "onnxruntime-node",
      "bin",
      "napi-v6",
      "win32",
      "x64",
    );
    if (fs.existsSync(binDir)) {
      process.env.PATH = `${binDir};${process.env.PATH}`;
    }
  }
  ortModule = require("onnxruntime-node");
} catch (_) {
  ortModule = require("onnxruntime-web");
}

export interface FaceDetectionResult {
  box: [number, number, number, number];
  landmarks: [number, number][];
  score: number;
}

const ARCFACE_REF_LANDMARKS: [number, number][] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

@Injectable()
export class FaceVerifyOnnxService implements OnModuleInit {
  private readonly logger = new Logger(FaceVerifyOnnxService.name);
  private retinafaceSession: any = null;
  private arcfaceSession: any = null;

  constructor(private configService: ConfigService) {}

  /**
   * Loads both RetinaFace and ArcFace ONNX models in background on startup.
   */
  onModuleInit(): void {
    this.initModels().catch((error: any) => {
      this.logger.error(
        `Failed to load ONNX models during startup: ${error.message}`,
        error.stack,
      );
    });
  }

  private async initModels(): Promise<void> {
    try {
      this.logger.log("Initializing ONNX Face Verification Service models in background...");

      const possibleModelDirs = [
        path.join(process.cwd(), "models"),
        path.join(process.cwd(), "backend", "api", "models"),
        path.join(__dirname, "..", "..", "..", "models"),
        path.join(__dirname, "models"),
      ];

      let modelsDir = "";
      for (const dir of possibleModelDirs) {
        if (
          fs.existsSync(path.join(dir, "retinaface.onnx")) ||
          fs.existsSync(path.join(dir, "det_10g.onnx"))
        ) {
          modelsDir = dir;
          break;
        }
      }

      if (!modelsDir) {
        modelsDir = possibleModelDirs[0];
      }

      const retinaPath =
        [
          path.join(modelsDir, "retinaface.onnx"),
          path.join(modelsDir, "det_10g.onnx"),
        ].find((p) => fs.existsSync(p)) || path.join(modelsDir, "retinaface.onnx");

      const arcPath =
        [
          path.join(modelsDir, "arcface.onnx"),
          path.join(modelsDir, "w600k_r50.onnx"),
        ].find((p) => fs.existsSync(p)) || path.join(modelsDir, "arcface.onnx");

      if (!fs.existsSync(retinaPath) || !fs.existsSync(arcPath)) {
        this.logger.warn(
          `ONNX Model files missing at: ${retinaPath} / ${arcPath}. Service will initialize when models are provided.`,
        );
        return;
      }

      this.logger.log(`Loading RetinaFace ONNX model from: ${retinaPath}`);
      this.retinafaceSession = await ortModule.InferenceSession.create(retinaPath);

      this.logger.log(`Loading ArcFace ONNX model from: ${arcPath}`);
      this.arcfaceSession = await ortModule.InferenceSession.create(arcPath);

      this.logger.log(
        "ONNX Face Verification Service initialized successfully (Models loaded into memory).",
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to load ONNX models during background startup: ${error.message}`,
        error.stack,
      );
    }
  }


  /**
   * Enrolls a face image by extracting its 512-dim ArcFace embedding.
   */
  async enroll(
    imageBuffer: Buffer,
    filename: string,
  ): Promise<{ embedding: number[]; model: string }> {
    try {
      this.logger.log(`[ONNX] Enrolling face ID proof image: ${filename}`);
      this.ensureModelsLoaded();

      const detection = await this.detectFace(imageBuffer, filename);
      const alignedBuffer = await this.alignFace(imageBuffer, detection.landmarks);
      const embedding = await this.getEmbedding(alignedBuffer);

      this.logger.log(
        `[ONNX] Successfully enrolled face ID proof for ${filename} (512-dim vector)`,
      );

      return {
        embedding: Array.from(embedding),
        model: "ArcFace-ONNX-ResNet50",
      };
    } catch (error: any) {
      this.logger.error(
        `[ONNX] Failed to enroll face ID proof: ${error.message}`,
      );
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error.message || "Face enrollment failed",
      );
    }
  }

  /**
   * Verifies a live selfie image buffer against a stored 512-dim embedding.
   */
  async verify(
    imageBuffer: Buffer,
    filename: string,
    storedEmbedding: number[],
  ): Promise<{ matched: boolean; distance: number; threshold: number }> {
    try {
      this.logger.log(
        `[ONNX] Verifying live selfie ${filename} against stored face embedding`,
      );
      this.ensureModelsLoaded();

      const enrollment = await this.enroll(imageBuffer, filename);
      const selfieEmb = new Float32Array(enrollment.embedding);
      const storedEmb = new Float32Array(storedEmbedding);

      const distance = this.cosineDistance(selfieEmb, storedEmb);
      const matched = distance <= ONNX_ARCFACE_THRESHOLD;

      this.logger.log(
        `[ONNX] Face verification result: matched=${matched}, distance=${distance.toFixed(4)}, threshold=${ONNX_ARCFACE_THRESHOLD}`,
      );

      return {
        matched,
        distance,
        threshold: ONNX_ARCFACE_THRESHOLD,
      };
    } catch (error: any) {
      this.logger.error(
        `[ONNX] Failed to execute face verification: ${error.message}`,
      );
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error.message || "Face verification failed",
      );
    }
  }

  /**
   * High-level helper: Verifies two image buffers directly side-by-side.
   */
  async verifyBuffers(
    bufferA: Buffer,
    filenameA: string,
    bufferB: Buffer,
    filenameB: string,
  ): Promise<{ matched: boolean; distance: number; threshold: number }> {
    const enrollA = await this.enroll(bufferA, filenameA);
    return this.verify(bufferB, filenameB, enrollA.embedding);
  }

  /**
   * Verifies two 512-dim embedding arrays directly.
   */
  verifyEmbeddings(
    embA: number[],
    embB: number[],
    customThreshold?: number,
  ): { matched: boolean; distance: number; threshold: number } {
    const threshold = customThreshold ?? ONNX_ARCFACE_THRESHOLD;
    const vecA = new Float32Array(embA);
    const vecB = new Float32Array(embB);
    const distance = this.cosineDistance(vecA, vecB);
    const matched = distance <= threshold;
    return {
      matched,
      distance: Number(distance.toFixed(4)),
      threshold,
    };
  }

  // ============================================================================
  // INTERNAL PIPELINE HELPER METHODS
  // ============================================================================

  private ensureModelsLoaded(): void {
    if (!this.retinafaceSession || !this.arcfaceSession) {
      throw new InternalServerErrorException(
        "ONNX models are not loaded. Please ensure retinaface.onnx and arcface.onnx exist in models/ directory.",
      );
    }
  }

  private async detectFace(
    imageInput: Buffer | string,
    filename: string,
  ): Promise<FaceDetectionResult> {
    const metadata = await sharp(imageInput).metadata();
    const origW = metadata.width || 640;
    const origH = metadata.height || 640;

    const inputSize = 640;
    const { data: rawRgb } = await sharp(imageInput)
      .resize(inputSize, inputSize, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const floatData = new Float32Array(1 * 3 * inputSize * inputSize);
    const area = inputSize * inputSize;

    for (let i = 0; i < area; i++) {
      floatData[i] = (rawRgb[i * 3] - 127.5) / 128.0;
      floatData[area + i] = (rawRgb[i * 3 + 1] - 127.5) / 128.0;
      floatData[2 * area + i] = (rawRgb[i * 3 + 2] - 127.5) / 128.0;
    }

    const inputName = this.retinafaceSession.inputNames[0] || "input";
    const tensor = new ortModule.Tensor("float32", floatData, [
      1,
      3,
      inputSize,
      inputSize,
    ]);

    const results = await this.retinafaceSession.run({ [inputName]: tensor });
    const detectedFaces = this.decodeRetinaFaceOutputs(results, origW, origH, inputSize);

    if (detectedFaces.length === 0) {
      this.logger.warn(
        `[ONNX] No face detected by detector in ${filename}. Fallback to centered crop region.`,
      );
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
      this.logger.warn(
        `[ONNX] Multiple faces (${detectedFaces.length}) detected in ${filename}. Selecting face with highest confidence score.`,
      );
    }

    detectedFaces.sort((a, b) => b.score - a.score);
    return detectedFaces[0];
  }

  private decodeRetinaFaceOutputs(
    outputs: any,
    origW: number,
    origH: number,
    inputSize: number,
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
                    const lx =
                      ((anchorX + kpsData[idx * 10 + k * 2] * stride) /
                        inputSize) *
                      origW;
                    const ly =
                      ((anchorY + kpsData[idx * 10 + k * 2 + 1] * stride) /
                        inputSize) *
                      origH;
                    landmarks.push([lx, ly]);
                  }
                }

                faces.push({
                  box: [
                    Math.round(x1),
                    Math.round(y1),
                    Math.round(x2 - x1),
                    Math.round(y2 - y1),
                  ],
                  landmarks:
                    landmarks.length === 5
                      ? landmarks
                      : [
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
        if (this.computeIoU(f.box, selected.box) > 0.4) {
          keep = false;
          break;
        }
      }
      if (keep) nmsFaces.push(f);
    }

    return nmsFaces;
  }

  private computeIoU(
    boxA: [number, number, number, number],
    boxB: [number, number, number, number],
  ): number {
    const xA = Math.max(boxA[0], boxB[0]);
    const yA = Math.max(boxA[1], boxB[1]);
    const xB = Math.min(boxA[0] + boxA[2], boxB[0] + boxB[2]);
    const yB = Math.min(boxA[1] + boxA[3], boxB[1] + boxB[3]);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const unionArea = boxA[2] * boxA[3] + boxB[2] * boxB[3] - interArea;
    return unionArea > 0 ? interArea / unionArea : 0;
  }

  private async alignFace(
    imageInput: Buffer | string,
    landmarks: [number, number][],
  ): Promise<Buffer> {
    const { data: rawRgb, info } = await sharp(imageInput)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const origW = info.width;
    const origH = info.height;
    const channels = info.channels;

    const targetW = 112;
    const targetH = 112;
    const alignedRgb = Buffer.alloc(targetW * targetH * 3);

    const { a, b, tx, ty } = this.computeSimilarityTransform(
      landmarks,
      ARCFACE_REF_LANDMARKS,
    );
    const det = a * a + b * b || 1e-6;

    for (let yOut = 0; yOut < targetH; yOut++) {
      for (let xOut = 0; xOut < targetW; xOut++) {
        const dx = xOut - tx;
        const dy = yOut - ty;
        const xIn = (a * dx + b * dy) / det;
        const yIn = (-b * dx + a * dy) / det;

        const [r, g, bVal] = this.sampleBilinear(
          rawRgb,
          origW,
          origH,
          channels,
          xIn,
          yIn,
        );
        const targetIdx = (yOut * targetW + xOut) * 3;

        alignedRgb[targetIdx] = r;
        alignedRgb[targetIdx + 1] = g;
        alignedRgb[targetIdx + 2] = bVal;
      }
    }

    return sharp(alignedRgb, {
      raw: { width: targetW, height: targetH, channels: 3 },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
  }

  private computeSimilarityTransform(
    srcPoints: [number, number][],
    dstPoints: [number, number][] = ARCFACE_REF_LANDMARKS,
  ): { a: number; b: number; tx: number; ty: number } {
    let srcMeanX = 0,
      srcMeanY = 0;
    let dstMeanX = 0,
      dstMeanY = 0;
    const n = srcPoints.length;

    for (let i = 0; i < n; i++) {
      srcMeanX += srcPoints[i][0];
      srcMeanY += srcPoints[i][1];
      dstMeanX += dstPoints[i][0];
      dstMeanY += dstPoints[i][1];
    }
    srcMeanX /= n;
    srcMeanY /= n;
    dstMeanX /= n;
    dstMeanY /= n;

    let numA = 0,
      numB = 0,
      den = 0;
    for (let i = 0; i < n; i++) {
      const sxc = srcPoints[i][0] - srcMeanX;
      const syc = srcPoints[i][1] - srcMeanY;
      const dxc = dstPoints[i][0] - dstMeanX;
      const dyc = dstPoints[i][1] - dstMeanY;

      numA += sxc * dxc + syc * dyc;
      numB += sxc * dyc - syc * dxc;
      den += sxc * sxc + syc * syc;
    }

    const a = numA / (den || 1e-6);
    const b = numB / (den || 1e-6);
    const tx = dstMeanX - (a * srcMeanX - b * srcMeanY);
    const ty = dstMeanY - (b * srcMeanX + a * srcMeanY);

    return { a, b, tx, ty };
  }

  private sampleBilinear(
    buf: Buffer,
    w: number,
    h: number,
    ch: number,
    x: number,
    y: number,
  ): [number, number, number] {
    if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) {
      const cx = Math.max(0, Math.min(w - 1, Math.round(x)));
      const cy = Math.max(0, Math.min(h - 1, Math.round(y)));
      const idx = (cy * w + cx) * ch;
      return [buf[idx], buf[idx + 1], buf[idx + 2]];
    }

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const dx = x - x0;
    const dy = y - y0;

    const w00 = (1 - dx) * (1 - dy);
    const w10 = dx * (1 - dy);
    const w01 = (1 - dx) * dy;
    const w11 = dx * dy;

    const i00 = (y0 * w + x0) * ch;
    const i10 = (y0 * w + x1) * ch;
    const i01 = (y1 * w + x0) * ch;
    const i11 = (y1 * w + x1) * ch;

    const r = Math.round(
      w00 * buf[i00] + w10 * buf[i10] + w01 * buf[i01] + w11 * buf[i11],
    );
    const g = Math.round(
      w00 * buf[i00 + 1] +
        w10 * buf[i10 + 1] +
        w01 * buf[i01 + 1] +
        w11 * buf[i11 + 1],
    );
    const b = Math.round(
      w00 * buf[i00 + 2] +
        w10 * buf[i10 + 2] +
        w01 * buf[i01 + 2] +
        w11 * buf[i11 + 2],
    );

    return [r, g, b];
  }

  private async getEmbedding(
    alignedFaceBuffer: Buffer,
  ): Promise<Float32Array> {
    const { data: rawRgb } = await sharp(alignedFaceBuffer)
      .resize(112, 112, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const numPixels = 112 * 112;
    const tensorData = new Float32Array(1 * 3 * numPixels);

    for (let i = 0; i < numPixels; i++) {
      tensorData[i] = (rawRgb[i * 3] - 127.5) / 128.0;
      tensorData[numPixels + i] = (rawRgb[i * 3 + 1] - 127.5) / 128.0;
      tensorData[2 * numPixels + i] = (rawRgb[i * 3 + 2] - 127.5) / 128.0;
    }

    const inputName = this.arcfaceSession.inputNames[0] || "input";
    const tensor = new ortModule.Tensor("float32", tensorData, [
      1,
      3,
      112,
      112,
    ]);

    const results = await this.arcfaceSession.run({ [inputName]: tensor });
    const outputName =
      this.arcfaceSession.outputNames[0] || Object.keys(results)[0];
    const embedding = results[outputName].data as Float32Array;

    return this.normalizeL2(embedding);
  }

  private normalizeL2(vec: Float32Array): Float32Array {
    let normSq = 0;
    for (let i = 0; i < vec.length; i++) normSq += vec[i] * vec[i];
    const norm = Math.sqrt(normSq) || 1e-6;
    const out = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
    return out;
  }

  private cosineDistance(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error(`Embedding length mismatch: ${a.length} vs ${b.length}`);
    }

    let dot = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    return normA === 0 || normB === 0 ? 1.0 : 1.0 - dot / (normA * normB);
  }
}
