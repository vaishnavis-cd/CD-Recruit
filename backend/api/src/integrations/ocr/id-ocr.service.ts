import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as ort from "onnxruntime-web";
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ClipperLib = require("clipper-lib");

export interface OcrBbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrLine {
  text: string;
  bbox: OcrBbox;
  confidence: number;
}

export interface IdOcrExtractionResult {
  name: string | null;
  confidence: string;
  source?: string;
  reason?: string;
  rawLines: OcrLine[];
  details?: Record<string, any>;
}

@Injectable()
export class IdOcrService implements OnModuleInit {
  private readonly logger = new Logger(IdOcrService.name);
  private detSession: any = null;
  private recSession: any = null;
  private dict: string[] = [];

  async onModuleInit(): Promise<void> {
    try {
      this.logger.log("Initializing PaddleOCR ONNX models for IdOcrService...");

      const possibleModelDirs = [
        path.join(process.cwd(), "models"),
        path.join(process.cwd(), "backend", "api", "models"),
        path.join(__dirname, "..", "..", "..", "models"),
        path.join(__dirname, "models"),
      ];

      let modelsDir = "";
      for (const dir of possibleModelDirs) {
        if (
          fs.existsSync(path.join(dir, "det_model.onnx")) &&
          fs.existsSync(path.join(dir, "rec_model.onnx"))
        ) {
          modelsDir = dir;
          break;
        }
      }

      if (!modelsDir) {
        this.logger.error("PaddleOCR model files (det_model.onnx / rec_model.onnx) not found in expected paths.");
        return;
      }

      const detPath = path.join(modelsDir, "det_model.onnx");
      const recPath = path.join(modelsDir, "rec_model.onnx");
      const dictPath = path.join(modelsDir, "ppocr_keys_v1.txt");

      this.detSession = await ort.InferenceSession.create(detPath, {
        executionProviders: ["wasm"],
      });
      this.recSession = await ort.InferenceSession.create(recPath, {
        executionProviders: ["wasm"],
      });

      if (fs.existsSync(dictPath)) {
        const content = fs.readFileSync(dictPath, "utf-8");
        this.dict = content.split(/\r?\n/).filter((l) => l.length > 0);
        this.dict.unshift("blank");
        this.dict.push(" ");
      }

      this.logger.log(`PaddleOCR ONNX models loaded successfully from ${modelsDir}. Dictionary size: ${this.dict.length}`);
    } catch (err: any) {
      this.logger.error(`Failed to initialize PaddleOCR ONNX models: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Main entry point: runs PaddleOCR ONNX on the image buffer, then extracts
   * candidate name based on documentType (PAN, AADHAAR, DL, PASSPORT).
   */
  async extractIdName(
    imageBuffer: Buffer,
    documentType?: string,
  ): Promise<IdOcrExtractionResult> {
    const rawLines = await this.runOcr(imageBuffer);

    if (!documentType || documentType.trim().length === 0) {
      // Auto-fallback: try known handlers in order of specificity
      const panRes = this.extractNamePAN(rawLines);
      if (panRes.name && (panRes.confidence === "high" || panRes.confidence === "medium")) {
        return { ...panRes, rawLines };
      }

      const dlRes = this.extractNameDL(rawLines);
      if (dlRes.name && dlRes.confidence === "high") {
        return { ...dlRes, rawLines };
      }

      const passRes = this.extractNamePassport(rawLines);
      if (passRes.name && (passRes.confidence === "high" || passRes.confidence === "medium")) {
        return { ...passRes, rawLines };
      }

      const aadhRes = this.extractNameAadhaar(rawLines);
      if (aadhRes.name) {
        return { ...aadhRes, rawLines };
      }

      return {
        name: null,
        confidence: "low",
        reason: "auto_detect_no_matching_document_layout",
        rawLines,
      };
    }

    const extraction = this.extractName(documentType, rawLines);
    return {
      ...extraction,
      rawLines,
    };
  }

  /**
   * Runs end-to-end PaddleOCR detection + recognition pipeline on an image buffer.
   */
  async runOcr(imageBuffer: Buffer): Promise<OcrLine[]> {
    if (!this.detSession || !this.recSession) {
      await this.onModuleInit();
    }

    if (!this.detSession || !this.recSession) {
      this.logger.warn("PaddleOCR ONNX inference sessions not initialized.");
      return [];
    }

    const { boxes, origW, origH } = await this.detectText(imageBuffer);
    const lines: OcrLine[] = [];
    const baseImage = sharp(imageBuffer);

    for (const boxItem of boxes) {
      const { x, y, width, height } = boxItem.bbox;
      const safeX = Math.max(0, x);
      const safeY = Math.max(0, y);
      const safeW = Math.min(origW - safeX, width);
      const safeH = Math.min(origH - safeY, height);

      if (safeW <= 0 || safeH <= 0) continue;

      try {
        const cropBuffer = await baseImage
          .clone()
          .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
          .toBuffer();

        const { text, confidence } = await this.recognizeCrop(cropBuffer);

        if (text && text.trim().length > 0) {
          lines.push({
            text: text.trim(),
            bbox: {
              x: safeX,
              y: safeY,
              width: safeW,
              height: safeH,
            },
            confidence,
          });
        }
      } catch (err: any) {
        // Skip unprocessable crop
      }
    }

    lines.sort((a, b) => a.bbox.y - b.bbox.y);
    return lines;
  }

  // ---------------------------------------------------------------------------
  // Text Detection (DBNet)
  // ---------------------------------------------------------------------------

  private async detectText(
    imageBuffer: Buffer,
    limitSideLen = 960,
    thresh = 0.3,
    boxThresh = 0.5,
    unclipRatio = 1.6,
  ): Promise<{ boxes: Array<{ bbox: OcrBbox; score: number }>; origW: number; origH: number }> {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const origW = metadata.width || 800;
    const origH = metadata.height || 600;

    let ratio = 1.0;
    const maxSide = Math.max(origW, origH);
    if (maxSide > limitSideLen) {
      ratio = limitSideLen / maxSide;
    }
    let resizeH = Math.round((origH * ratio) / 32) * 32;
    let resizeW = Math.round((origW * ratio) / 32) * 32;
    resizeH = Math.max(32, resizeH);
    resizeW = Math.max(32, resizeW);
    const ratioW = resizeW / origW;
    const ratioH = resizeH / origH;

    const rawRgb = await image
      .resize(resizeW, resizeH, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();

    const means = [0.485, 0.456, 0.406];
    const stds = [0.229, 0.224, 0.225];
    const totalPixels = resizeW * resizeH;
    const float32Data = new Float32Array(3 * totalPixels);

    for (let i = 0; i < totalPixels; i++) {
      const r = rawRgb[i * 3] / 255.0;
      const g = rawRgb[i * 3 + 1] / 255.0;
      const b = rawRgb[i * 3 + 2] / 255.0;

      float32Data[i] = (r - means[0]) / stds[0];
      float32Data[totalPixels + i] = (g - means[1]) / stds[1];
      float32Data[2 * totalPixels + i] = (b - means[2]) / stds[2];
    }

    const inputTensor = new ort.Tensor("float32", float32Data, [1, 3, resizeH, resizeW]);
    const feeds: Record<string, any> = {};
    feeds[this.detSession.inputNames[0]] = inputTensor;

    const results = await this.detSession.run(feeds);
    const outputTensor = results[this.detSession.outputNames[0]];
    const predData = outputTensor.data as Float32Array;

    const mask = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      mask[i] = predData[i] >= thresh ? 1 : 0;
    }

    const components = this.findConnectedComponents(mask, resizeW, resizeH);
    const detectedBoxes: Array<{ bbox: OcrBbox; score: number }> = [];

    for (const comp of components) {
      const rawBox = this.getBoundingBox(comp);
      const minX = rawBox[0][0];
      const minY = rawBox[0][1];
      const maxX = rawBox[2][0];
      const maxY = rawBox[2][1];

      const score = this.boxScore(predData, resizeW, resizeH, minX, minY, maxX, maxY);
      if (score < boxThresh) continue;

      const unclipped = this.unclipPolygon(rawBox, unclipRatio);
      let uMinX = Infinity,
        uMaxX = -Infinity,
        uMinY = Infinity,
        uMaxY = -Infinity;
      for (const [px, py] of unclipped) {
        if (px < uMinX) uMinX = px;
        if (px > uMaxX) uMaxX = px;
        if (py < uMinY) uMinY = py;
        if (py > uMaxY) uMaxY = py;
      }

      const origBoxMinX = Math.max(0, Math.round(uMinX / ratioW));
      const origBoxMinY = Math.max(0, Math.round(uMinY / ratioH));
      const origBoxMaxX = Math.min(origW, Math.round(uMaxX / ratioW));
      const origBoxMaxY = Math.min(origH, Math.round(uMaxY / ratioH));

      const boxW = origBoxMaxX - origBoxMinX;
      const boxH = origBoxMaxY - origBoxMinY;

      if (boxW < 5 || boxH < 5) continue;

      detectedBoxes.push({
        bbox: {
          x: origBoxMinX,
          y: origBoxMinY,
          width: boxW,
          height: boxH,
        },
        score,
      });
    }

    detectedBoxes.sort((a, b) => a.bbox.y - b.bbox.y);
    return { boxes: detectedBoxes, origW, origH };
  }

  // ---------------------------------------------------------------------------
  // Text Recognition (SVTR / CRNN)
  // ---------------------------------------------------------------------------

  private async recognizeCrop(cropBuffer: Buffer): Promise<{ text: string; confidence: number }> {
    const targetH = 48;
    const metadata = await sharp(cropBuffer).metadata();
    const origW = metadata.width || 1;
    const origH = metadata.height || 1;

    const ratio = origW / origH;
    let targetW = Math.max(32, Math.round(targetH * ratio));
    targetW = Math.round(targetW / 8) * 8;
    targetW = Math.min(960, targetW);

    const rawRgb = await sharp(cropBuffer)
      .resize(targetW, targetH, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();

    const totalPixels = targetW * targetH;
    const float32Data = new Float32Array(3 * totalPixels);

    for (let i = 0; i < totalPixels; i++) {
      const r = rawRgb[i * 3] / 255.0;
      const g = rawRgb[i * 3 + 1] / 255.0;
      const b = rawRgb[i * 3 + 2] / 255.0;

      float32Data[i] = (r - 0.5) / 0.5;
      float32Data[totalPixels + i] = (g - 0.5) / 0.5;
      float32Data[2 * totalPixels + i] = (b - 0.5) / 0.5;
    }

    const inputTensor = new ort.Tensor("float32", float32Data, [1, 3, targetH, targetW]);
    const feeds: Record<string, any> = {};
    feeds[this.recSession.inputNames[0]] = inputTensor;

    const results = await this.recSession.run(feeds);
    const outputTensor = results[this.recSession.outputNames[0]];
    const predData = outputTensor.data as Float32Array;

    const dims = outputTensor.dims;
    const timeSteps = dims[1];
    const numClasses = dims[2];

    const decodedIndices: number[] = [];
    const probs: number[] = [];

    for (let t = 0; t < timeSteps; t++) {
      let maxProb = -Infinity;
      let maxIdx = 0;
      const offset = t * numClasses;

      for (let c = 0; c < numClasses; c++) {
        const val = predData[offset + c];
        if (val > maxProb) {
          maxProb = val;
          maxIdx = c;
        }
      }

      decodedIndices.push(maxIdx);
      probs.push(maxProb);
    }

    const charList: string[] = [];
    const confList: number[] = [];
    let lastIdx = -1;

    for (let i = 0; i < decodedIndices.length; i++) {
      const idx = decodedIndices[i];
      if (idx !== 0 && idx !== lastIdx) {
        if (idx < this.dict.length) {
          charList.push(this.dict[idx]);
          confList.push(probs[i]);
        }
      }
      lastIdx = idx;
    }

    const text = charList.join("");
    const confidence = confList.length > 0 ? confList.reduce((a, b) => a + b, 0) / confList.length : 0;

    return { text, confidence: parseFloat(confidence.toFixed(4)) };
  }

  // ---------------------------------------------------------------------------
  // Geometry & DBNet Helpers
  // ---------------------------------------------------------------------------

  private findConnectedComponents(mask: Uint8Array, width: number, height: number): number[][][] {
    const visited = new Uint8Array(width * height);
    const components: number[][][] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (mask[idx] === 1 && !visited[idx]) {
          const points: number[][] = [];
          const queue = [x, y];
          visited[idx] = 1;
          let qHead = 0;

          while (qHead < queue.length) {
            const cx = queue[qHead++];
            const cy = queue[qHead++];
            points.push([cx, cy]);

            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  const nIdx = ny * width + nx;
                  if (mask[nIdx] === 1 && !visited[nIdx]) {
                    visited[nIdx] = 1;
                    queue.push(nx, ny);
                  }
                }
              }
            }
          }

          if (points.length >= 10) {
            components.push(points);
          }
        }
      }
    }
    return components;
  }

  private getBoundingBox(points: number[][]): number[][] {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    return [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
  }

  private unclipPolygon(poly: number[][], unclipRatio = 1.6): number[][] {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    }
    area = Math.abs(area) / 2.0;

    let perimeter = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const dx = poly[j][0] - poly[i][0];
      const dy = poly[j][1] - poly[i][1];
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }

    if (perimeter === 0) return poly;
    const distance = (area * unclipRatio) / perimeter;

    const path = poly.map(([x, y]) => ({ X: Math.round(x * 1000), Y: Math.round(y * 1000) }));
    const co = new ClipperLib.ClipperOffset();
    co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);

    const solution = new ClipperLib.Paths();
    co.Execute(solution, distance * 1000);

    if (solution.length > 0 && solution[0].length >= 4) {
      return solution[0].map((pt: any) => [pt.X / 1000, pt.Y / 1000]);
    }
    return poly;
  }

  private boxScore(
    pred: Float32Array,
    width: number,
    height: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): number {
    let sum = 0;
    let count = 0;
    const x0 = Math.max(0, Math.floor(minX));
    const x1 = Math.min(width - 1, Math.ceil(maxX));
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(height - 1, Math.ceil(maxY));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        sum += pred[y * width + x];
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  // ---------------------------------------------------------------------------
  // Multi-Document Name Extractor
  // ---------------------------------------------------------------------------

  public extractName(
    documentType: string,
    ocrLines: OcrLine[],
  ): { name: string | null; confidence: string; source?: string; reason?: string; details?: any } {
    switch (documentType.toUpperCase()) {
      case "PAN":
        return this.extractNamePAN(ocrLines);
      case "AADHAAR":
      case "AADHAR":
        return this.extractNameAadhaar(ocrLines);
      case "DL":
      case "DRIVING_LICENCE":
      case "DRIVING_LICENSE":
        return this.extractNameDL(ocrLines);
      case "PASSPORT":
        return this.extractNamePassport(ocrLines);
      default:
        return {
          name: null,
          confidence: "unsupported",
          reason: `no_handler_for_${documentType}`,
        };
    }
  }

  private normalize(text: string): string {
    return text.trim().replace(/\s+/g, " ");
  }

  private horizontalOverlap(a: OcrBbox, b: OcrBbox): number {
    const left = Math.max(a.x, b.x);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const overlap = Math.max(0, right - left);
    const smaller = Math.min(a.width, b.width);
    return smaller === 0 ? 0 : overlap / smaller;
  }

  private findLineBelow(lines: OcrLine[], labelLine: OcrLine, maxGapMultiplier = 4): OcrLine | null {
    const maxGap = labelLine.bbox.height * maxGapMultiplier;
    const labelTop = labelLine.bbox.y;
    const labelBottom = labelLine.bbox.y + labelLine.bbox.height;

    const candidates = lines
      .filter((l) => l !== labelLine)
      .filter((l) => l.bbox.y >= labelTop + labelLine.bbox.height * 0.5)
      .filter((l) => l.bbox.y - labelBottom < maxGap)
      .filter((l) => this.horizontalOverlap(l.bbox, labelLine.bbox) > 0.2);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.bbox.y - b.bbox.y);
    return candidates[0];
  }

  private looksLikeAName(text: string): boolean {
    const t = this.normalize(text);
    if (t.length < 2) return false;
    if (/\d/.test(t)) return false;
    if (/[/#]/.test(t)) return false;
    if (
      /^(name|नाम|dob|date of birth|father|पिता|govt|income tax|permanent account|male|female|फीमेल|pancard|pan card|aadhaar|aadhar|passport|surname|sumame|given name|given|place of|date of|nationality|republic|indian|type|code|sex|signature|driving|licence|license|union of india)/i.test(
        t,
      )
    ) {
      return false;
    }
    return true;
  }

  private isLatinScript(text: string): boolean {
    const letters = text.replace(/[^a-zA-Z\u00C0-\u024F]/g, "");
    const total = text.replace(/\s/g, "").length;
    if (total === 0) return false;
    return letters.length / total > 0.6;
  }

  // --- PAN Extractor ---
  private extractNamePAN(lines: OcrLine[]): { name: string | null; confidence: string; source?: string; reason?: string } {
    const nameLabel = lines.find((l) => {
      const t = this.normalize(l.text);
      const isFather = /father|पिता/i.test(t);
      const hasName = /(नाम|\bname\b|\/name)/i.test(t);
      return hasName && !isFather;
    });

    if (nameLabel) {
      const nameLine = this.findLineBelow(lines, nameLabel);
      if (nameLine && this.looksLikeAName(nameLine.text)) {
        return {
          name: this.normalize(nameLine.text),
          confidence: "high",
          source: "label_anchor:Name",
        };
      }
    }

    const fatherLabel = lines.find((l) => /father|पिता/i.test(this.normalize(l.text)));
    if (fatherLabel) {
      const above = lines
        .filter((l) => l !== fatherLabel)
        .filter((l) => l.bbox.y < fatherLabel.bbox.y)
        .filter((l) => this.horizontalOverlap(l.bbox, fatherLabel.bbox) > 0.2)
        .sort((a, b) => b.bbox.y - a.bbox.y);

      const nameCandidate = above.find((l) => this.looksLikeAName(l.text));
      if (nameCandidate) {
        return {
          name: this.normalize(nameCandidate.text),
          confidence: "medium",
          source: "position_anchor:above_FatherName",
        };
      }
    }

    const panNumLine = lines.find((l) => /[A-Z]{5}[0-9]{4}[A-Z]/i.test(this.normalize(l.text)));
    if (panNumLine) {
      const below = lines
        .filter((l) => l !== panNumLine)
        .filter((l) => l.bbox.y > panNumLine.bbox.y)
        .filter((l) => this.horizontalOverlap(l.bbox, panNumLine.bbox) > 0.2)
        .sort((a, b) => a.bbox.y - b.bbox.y);

      const nameCandidate = below.find((l) => this.looksLikeAName(l.text));
      if (nameCandidate) {
        return {
          name: this.normalize(nameCandidate.text),
          confidence: "medium",
          source: "position_anchor:below_PAN_number",
        };
      }
    }

    const fallbackCandidates = lines
      .filter((l) => this.isLatinScript(l.text) && this.looksLikeAName(l.text))
      .filter((l) => (l.confidence ?? 1) >= 0.9)
      .sort((a, b) => a.bbox.y - b.bbox.y);

    if (fallbackCandidates.length > 0) {
      return {
        name: this.normalize(fallbackCandidates[0].text),
        confidence: "low-medium",
        source: "fallback:first_high_confidence_latin_name_shaped_line",
      };
    }

    return { name: null, confidence: "low", reason: "name_label_not_found" };
  }

  // --- Aadhaar Extractor ---
  private extractNameAadhaar(lines: OcrLine[]): { name: string | null; confidence: string; source?: string; reason?: string } {
    const govLine = lines.find((l) => /govern?ment\s*of\s*india/i.test(this.normalize(l.text)));
    if (govLine) {
      const below = lines
        .filter((l) => l !== govLine)
        .filter((l) => l.bbox.y > govLine.bbox.y)
        .filter((l) => this.horizontalOverlap(l.bbox, govLine.bbox) > 0.2)
        .sort((a, b) => a.bbox.y - b.bbox.y);

      const latinNameLine = below.find((l) => this.isLatinScript(l.text) && this.looksLikeAName(l.text));
      if (latinNameLine) {
        return {
          name: this.normalize(latinNameLine.text),
          confidence: "high",
          source: "position_anchor:below_GovernmentOfIndia,latin_script",
        };
      }
    }

    const dobLine = lines.find((l) => /dob|date of birth|பிறந்த|जन्म/i.test(l.text));
    if (dobLine) {
      const above = lines
        .filter((l) => l !== dobLine)
        .filter((l) => l.bbox.y < dobLine.bbox.y)
        .filter((l) => this.horizontalOverlap(l.bbox, dobLine.bbox) > 0.2)
        .sort((a, b) => b.bbox.y - a.bbox.y);

      const latinNameLine = above.find((l) => this.isLatinScript(l.text) && this.looksLikeAName(l.text));
      if (latinNameLine) {
        return {
          name: this.normalize(latinNameLine.text),
          confidence: "medium",
          source: "position_anchor:above_DOB,latin_script",
        };
      }
    }

    const fallbackCandidates = lines
      .filter((l) => this.isLatinScript(l.text) && this.looksLikeAName(l.text))
      .filter((l) => (l.confidence ?? 1) >= 0.9)
      .sort((a, b) => a.bbox.y - b.bbox.y);

    if (fallbackCandidates.length > 0) {
      return {
        name: this.normalize(fallbackCandidates[0].text),
        confidence: "low-medium",
        source: "fallback:first_high_confidence_latin_name_shaped_line",
      };
    }

    return { name: null, confidence: "low", reason: "no_anchor_or_fallback_found" };
  }

  // --- Driving Licence Extractor ---
  private extractNameDL(lines: OcrLine[]): { name: string | null; confidence: string; source?: string; reason?: string } {
    const nameLabel = lines.find((l) => /^name$/i.test(this.normalize(l.text)));
    if (!nameLabel) {
      return { name: null, confidence: "low", reason: "name_label_not_found" };
    }

    const nameLine = this.findLineBelow(lines, nameLabel);
    if (!nameLine || !this.looksLikeAName(nameLine.text)) {
      return { name: null, confidence: "low", reason: "name_value_not_found" };
    }

    if (/son|daughter|wife/i.test(nameLine.text)) {
      return { name: null, confidence: "low", reason: "matched_relative_label_not_name" };
    }

    return {
      name: this.normalize(nameLine.text),
      confidence: "high",
      source: "label_anchor:Name",
    };
  }

  // --- Passport Extractor ---
  private extractNamePassport(lines: OcrLine[]): {
    name: string | null;
    confidence: string;
    source?: string;
    reason?: string;
    details?: any;
  } {
    // Tier 1: MRZ Parsing
    const mrzCandidateRegex = /^[A-Z0-9<]{30,48}$/;
    const candidates = lines
      .map((l) => ({ ...l, cleaned: l.text.replace(/\s/g, "").toUpperCase() }))
      .filter((l) => mrzCandidateRegex.test(l.cleaned))
      .sort((a, b) => a.bbox.y - b.bbox.y);

    if (candidates.length >= 2) {
      const line1Candidate = candidates.find((l) => l.cleaned.startsWith("P<"));
      if (line1Candidate) {
        const line2Candidate = candidates
          .filter((l) => l !== line1Candidate)
          .filter((l) => l.bbox.y > line1Candidate.bbox.y)
          .sort((a, b) => a.bbox.y - b.bbox.y)[0];

        if (line2Candidate) {
          const line1 = line1Candidate.cleaned;
          const countryCode = line1.substring(2, 5);
          const nameField = line1.substring(5);
          const [surnameRaw, ...givenRaw] = nameField.split("<<");
          const surname = surnameRaw.replace(/</g, " ").trim();
          const givenNames = givenRaw.join(" ").replace(/</g, " ").trim().replace(/\s+/g, " ");

          if (surname || givenNames) {
            const fullName = [givenNames, surname].filter(Boolean).join(" ").trim();
            return {
              name: fullName,
              confidence: "high",
              source: "mrz_td3_line1",
              details: { surname, givenNames, countryCode },
            };
          }
        }
      }
    }

    // Tier 2: Visual field labels fallback
    const surnameLabel = lines.find((l) =>
      /(?:^|[^\w])(su(?:rn|r|m|n)ame|उपनाम)/i.test(this.normalize(l.text)),
    );
    const givenNameLabel = lines.find((l) =>
      /(?:given\s*names?|दी\s*गई\s*नाम|given)/i.test(this.normalize(l.text)),
    );

    let surname: string | null = null;
    let givenName: string | null = null;

    if (surnameLabel) {
      const surnameLine = this.findLineBelow(lines, surnameLabel);
      if (surnameLine && this.looksLikeAName(surnameLine.text)) {
        surname = this.normalize(surnameLine.text);
      }
    }

    if (givenNameLabel) {
      const givenNameLine = this.findLineBelow(lines, givenNameLabel);
      if (givenNameLine && this.looksLikeAName(givenNameLine.text)) {
        givenName = this.normalize(givenNameLine.text);
      }
    }

    if (givenName && surname) {
      return {
        name: `${givenName} ${surname}`,
        confidence: "high",
        source: "label_anchor:given_name+surname",
        details: { givenName, surname },
      };
    }

    if (givenName) {
      return {
        name: givenName,
        confidence: "high",
        source: "label_anchor:given_name",
      };
    }

    if (surname) {
      return {
        name: surname,
        confidence: "medium",
        source: "label_anchor:surname_only",
      };
    }

    // Tier 3: Positional Fallback
    const dobOrPob = lines.find((l) =>
      /date\s*of\s*birth|place\s*of\s*birth|date\s*of\s*issue|sex/i.test(this.normalize(l.text)),
    );
    if (dobOrPob) {
      const above = lines
        .filter((l) => l !== dobOrPob)
        .filter((l) => l.bbox.y < dobOrPob.bbox.y)
        .filter((l) => this.isLatinScript(l.text) && this.looksLikeAName(l.text))
        .sort((a, b) => a.bbox.y - b.bbox.y);

      if (above.length > 0) {
        return {
          name: this.normalize(above[0].text),
          confidence: "low-medium",
          source: "fallback:above_dob_or_pob",
        };
      }
    }

    return { name: null, confidence: "low", reason: "passport_name_not_found" };
  }
}
