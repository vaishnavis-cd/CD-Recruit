import sharp from 'sharp';

/**
 * Standard ArcFace 112x112 Canonical Face Template Landmarks (5-point):
 * 1. Left Eye:           [38.2946, 51.6963]
 * 2. Right Eye:          [73.5318, 51.5014]
 * 3. Nose Tip:           [56.0252, 71.7366]
 * 4. Left Mouth Corner:  [41.5493, 92.3655]
 * 5. Right Mouth Corner: [70.7299, 92.2041]
 */
export const ARCFACE_REF_LANDMARKS: [number, number][] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

export function computeSimilarityTransform(
  srcPoints: [number, number][],
  dstPoints: [number, number][] = ARCFACE_REF_LANDMARKS
): { a: number; b: number; tx: number; ty: number } {
  let srcMeanX = 0, srcMeanY = 0;
  let dstMeanX = 0, dstMeanY = 0;
  const n = srcPoints.length;

  for (let i = 0; i < n; i++) {
    srcMeanX += srcPoints[i][0];
    srcMeanY += srcPoints[i][1];
    dstMeanX += dstPoints[i][0];
    dstMeanY += dstPoints[i][1];
  }
  srcMeanX /= n; srcMeanY /= n;
  dstMeanX /= n; dstMeanY /= n;

  let numA = 0, numB = 0, den = 0;
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

/**
 * Warps and crops original image into a 112x112 aligned face image using 5 landmarks
 * via Umeyama least-squares similarity transformation and bilinear pixel sampling.
 */
export async function alignFace(
  imagePath: string,
  landmarks: [number, number][]
): Promise<Buffer> {
  const { data: rawRgb, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const origW = info.width;
  const origH = info.height;
  const channels = info.channels;

  const targetW = 112;
  const targetH = 112;
  const alignedRgb = Buffer.alloc(targetW * targetH * 3);

  const { a, b, tx, ty } = computeSimilarityTransform(landmarks, ARCFACE_REF_LANDMARKS);
  const det = a * a + b * b || 1e-6;

  for (let yOut = 0; yOut < targetH; yOut++) {
    for (let xOut = 0; xOut < targetW; xOut++) {
      const dx = xOut - tx;
      const dy = yOut - ty;
      const xIn = (a * dx + b * dy) / det;
      const yIn = (-b * dx + a * dy) / det;

      const [r, g, bVal] = sampleBilinear(rawRgb, origW, origH, channels, xIn, yIn);
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

function sampleBilinear(
  buf: Buffer,
  w: number,
  h: number,
  ch: number,
  x: number,
  y: number
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

  const r = Math.round(w00 * buf[i00] + w10 * buf[i10] + w01 * buf[i01] + w11 * buf[i11]);
  const g = Math.round(w00 * buf[i00 + 1] + w10 * buf[i10 + 1] + w01 * buf[i01 + 1] + w11 * buf[i11 + 1]);
  const b = Math.round(w00 * buf[i00 + 2] + w10 * buf[i10 + 2] + w01 * buf[i01 + 2] + w11 * buf[i11 + 2]);

  return [r, g, b];
}
