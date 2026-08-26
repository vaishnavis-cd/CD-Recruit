import { Injectable, Logger } from "@nestjs/common";
import { createWorker } from "tesseract.js";
import sharp from "sharp";

export interface OcrEngineOutput {
  rawText: string;
  lines: string[];
  confidence: number;
}

@Injectable()
export class OcrEngineService {
  private readonly logger = new Logger(OcrEngineService.name);

  /**
   * Pre-processes an ID image buffer with sharp for optimal OCR accuracy.
   * Uses high-resolution scaling, contrast linear stretch, and edge sharpening to separate ink from ID background patterns.
   */
  async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(imageBuffer)
        .rotate() // Auto-orient using EXIF
        .resize({ width: 2000, withoutEnlargement: true })
        .grayscale()
        .linear(1.35, -25) // Boost dark text contrast over light card background
        .sharpen({ sigma: 1.5 })
        .toBuffer();
    } catch (err: any) {
      this.logger.warn(`Sharp image preprocessing warning: ${err.message}. Using raw buffer.`);
      return imageBuffer;
    }
  }

  /**
   * Recognizes text from an image buffer using Tesseract.js.
   */
  async recognize(imageBuffer: Buffer): Promise<OcrEngineOutput> {
    try {
      const processedBuffer = await this.preprocessImage(imageBuffer);

      const worker = await createWorker("eng");
      const { data } = await worker.recognize(processedBuffer);
      await worker.terminate();

      const rawText = data.text || "";
      const lines = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const confidence = data.confidence ? data.confidence / 100 : 0.8;

      return {
        rawText,
        lines,
        confidence,
      };
    } catch (err: any) {
      this.logger.error(`Tesseract OCR processing failed: ${err.message}`);
      return {
        rawText: `OCR_ERROR: ${err.message}`,
        lines: [],
        confidence: 0.0,
      };
    }
  }
}
