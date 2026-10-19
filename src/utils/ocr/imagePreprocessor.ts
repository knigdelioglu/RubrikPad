import type {
  Point2D,
  PreprocessingOptions,
  PreprocessingResult,
  RawBinaryImage,
  RawGrayImage,
} from './ocrTypes.ts';

/**
 * Converts RGBA pixel buffer (from Canvas ImageData) to single-channel grayscale (0..255).
 */
export function rgbaToGrayImage(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): RawGrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    const a = rgba[p + 3] ?? 255;
    if (a < 16) {
      data[i] = 255; // transparent treated as white paper
    } else {
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      // Luminance formula
      data[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
  return { width, height, data };
}

/**
 * Converts a RawGrayImage or RawBinaryImage back into an RGBA Uint8ClampedArray for Canvas display.
 */
export function grayToRgbaBuffer(image: RawGrayImage): Uint8ClampedArray {
  const out = new Uint8ClampedArray(image.width * image.height * 4);
  for (let i = 0, p = 0; i < image.data.length; i++, p += 4) {
    const v = image.data[i];
    out[p] = v;
    out[p + 1] = v;
    out[p + 2] = v;
    out[p + 3] = 255;
  }
  return out;
}

/**
 * Rotates a grayscale image by 0, 90, 180, or 270 degrees clockwise.
 */
export function rotateGrayImage90n(
  image: RawGrayImage,
  deg: 0 | 90 | 180 | 270
): RawGrayImage {
  const { width, height, data } = image;
  if (deg === 0) {
    return { width, height, data: new Uint8Array(data) };
  }
  if (deg === 180) {
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        out[(height - 1 - y) * width + (width - 1 - x)] = data[y * width + x];
      }
    }
    return { width, height, data: out };
  }
  if (deg === 90) {
    const outW = height;
    const outH = width;
    const out = new Uint8Array(outW * outH);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = height - 1 - y;
        const ny = x;
        out[ny * outW + nx] = data[y * width + x];
      }
    }
    return { width: outW, height: outH, data: out };
  }
  // 270 deg
  const outW = height;
  const outH = width;
  const out = new Uint8Array(outW * outH);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = y;
      const ny = width - 1 - x;
      out[ny * outW + nx] = data[y * width + x];
    }
  }
  return { width: outW, height: outH, data: out };
}

/**
 * Detects whether an image is oriented upright (0/180) or sideways (90) by comparing
 * horizontal vs vertical gradient / projection variance of dark pixels.
 */
export function detectAutoOrientation90(image: RawGrayImage): 0 | 90 {
  const { width, height } = image;
  if (width < 20 || height < 20) return 0;

  const bin = adaptiveLocalBinarize(image);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 160));
  const ptsX: number[] = [];
  const ptsY: number[] = [];
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y += step) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += step) {
      if (bin.mask[rowOff + x]) {
        ptsX.push(x - cx);
        ptsY.push(y - cy);
      }
    }
  }

  if (ptsX.length < 25) return 0;

  const diag = Math.ceil(Math.hypot(width, height)) + 20;
  const offset = Math.floor(diag / 2);

  const profileEnergyAtAngle = (deg: number): number => {
    const rad = (deg * Math.PI) / 180;
    const sinA = Math.sin(-rad);
    const cosA = Math.cos(-rad);
    const bins = new Int32Array(diag);
    for (let i = 0; i < ptsX.length; i++) {
      const r = Math.round(ptsX[i] * sinA + ptsY[i] * cosA) + offset;
      if (r >= 0 && r < diag) bins[r]++;
    }
    let energy = 0;
    for (let b = 1; b < diag; b++) {
      const diff = bins[b] - bins[b - 1];
      energy += diff * diff;
    }
    return energy;
  };

  let maxHorizEnergy = 0;
  for (const deg of [-12, -8, -4, 0, 4, 8, 12]) {
    const e = profileEnergyAtAngle(deg);
    if (e > maxHorizEnergy) maxHorizEnergy = e;
  }

  let maxVertEnergy = 0;
  for (const deg of [78, 82, 86, 90, 94, 98, 102]) {
    const e = profileEnergyAtAngle(deg);
    if (e > maxVertEnergy) maxVertEnergy = e;
  }

  if (maxVertEnergy > maxHorizEnergy * 1.65 && height >= width * 0.85) {
    return 90;
  }
  return 0;
}

/**
 * Bilinear sub-pixel sampling on a grayscale image with edge replication clamping
 * so deskewing/homography on shadowed camera photos never introduces artificial white border cliffs.
 */
export function sampleGrayBilinear(
  image: RawGrayImage,
  x: number,
  y: number
): number {
  const { width, height, data } = image;
  if (width === 0 || height === 0) return 255;
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const dx = cx - x0;
  const dy = cy - y0;

  const v00 = data[y0 * width + x0];
  const v10 = data[y0 * width + x1];
  const v01 = data[y1 * width + x0];
  const v11 = data[y1 * width + x1];

  const top = v00 * (1 - dx) + v10 * dx;
  const bottom = v01 * (1 - dx) + v11 * dx;
  return Math.round(top * (1 - dy) + bottom * dy);
}

/**
 * Upscales a grayscale image using bilinear interpolation when resolution is low.
 */
export function upscaleGrayImageBilinear(
  image: RawGrayImage,
  scaleFactor: number
): RawGrayImage {
  if (scaleFactor <= 1.02) return image;
  const outW = Math.max(1, Math.round(image.width * scaleFactor));
  const outH = Math.max(1, Math.round(image.height * scaleFactor));
  const out = new Uint8Array(outW * outH);

  for (let y = 0; y < outH; y++) {
    const srcY = y / scaleFactor;
    const rowOff = y * outW;
    for (let x = 0; x < outW; x++) {
      const srcX = x / scaleFactor;
      out[rowOff + x] = sampleGrayBilinear(image, srcX, srcY);
    }
  }
  return { width: outW, height: outH, data: out };
}

/**
 * Solves an 8x8 linear system A * h = b via Gaussian elimination with partial pivoting
 * to compute the 3x3 homography matrix mapping target rectangle (0..outW, 0..outH)
 * back to the source quadrilateral corners [TL, TR, BR, BL].
 */
export function applyPerspectiveHomography(
  image: RawGrayImage,
  corners: [Point2D, Point2D, Point2D, Point2D],
  outWidth?: number,
  outHeight?: number
): RawGrayImage {
  const [tl, tr, br, bl] = corners;
  const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
  const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);

  const targetW = outWidth ?? Math.max(32, Math.round(Math.max(topW, botW)));
  const targetH = outHeight ?? Math.max(32, Math.round(Math.max(leftH, rightH)));

  // Destination points (rectified coordinates) -> Source points (corners)
  const dstPts: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 0, y: 0 },
    { x: targetW - 1, y: 0 },
    { x: targetW - 1, y: targetH - 1 },
    { x: 0, y: targetH - 1 },
  ];
  const srcPts = corners;

  // Build 8x9 augmented matrix for inverse homography (dst -> src)
  const M: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const X = dstPts[i].x;
    const Y = dstPts[i].y;
    const u = srcPts[i].x;
    const v = srcPts[i].y;
    M.push([X, Y, 1, 0, 0, 0, -u * X, -u * Y, u]);
    M.push([0, 0, 0, X, Y, 1, -v * X, -v * Y, v]);
  }

  // Gaussian elimination
  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(M[pivot][col]) < 1e-10) {
      return image; // Degenerate quad
    }
    const tmp = M[col];
    M[col] = M[pivot];
    M[pivot] = tmp;

    const div = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= div;

    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = M[row][col];
        for (let j = col; j <= n; j++) {
          M[row][j] -= factor * M[col][j];
        }
      }
    }
  }

  const h00 = M[0][8];
  const h01 = M[1][8];
  const h02 = M[2][8];
  const h10 = M[3][8];
  const h11 = M[4][8];
  const h12 = M[5][8];
  const h20 = M[6][8];
  const h21 = M[7][8];

  const out = new Uint8Array(targetW * targetH);
  for (let y = 0; y < targetH; y++) {
    const rowOff = y * targetW;
    for (let x = 0; x < targetW; x++) {
      const denom = h20 * x + h21 * y + 1;
      if (Math.abs(denom) < 1e-7) {
        out[rowOff + x] = 255;
        continue;
      }
      const srcX = (h00 * x + h01 * y + h02) / denom;
      const srcY = (h10 * x + h11 * y + h12) / denom;
      out[rowOff + x] = sampleGrayBilinear(image, srcX, srcY);
    }
  }

  return { width: targetW, height: targetH, data: out };
}

/**
 * Computes contrast score (standard deviation of grayscale values, 0..100 normalized).
 */
export function computeContrastScore(image: RawGrayImage): number {
  const { data } = image;
  if (data.length === 0) return 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / data.length;
  const variance = Math.max(0, sumSq / data.length - mean * mean);
  const stdDev = Math.sqrt(variance);
  return Math.min(100, Math.round((stdDev / 64) * 100));
}

/**
 * Adaptive local binarization using Integral Images (Bradley-Roth / Sauvola hybrid).
 * Handles uneven classroom lighting and shadows in O(W * H) time.
 */
export function adaptiveLocalBinarize(
  image: RawGrayImage,
  windowRadius?: number,
  sensitivity: number = 0.12
): RawBinaryImage {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  if (width === 0 || height === 0) return { width, height, mask };

  const rad =
    windowRadius ?? Math.max(12, Math.min(48, Math.round(Math.min(width, height) / 18)));

  // Build summed-area table (integral image)
  const integral = new Float64Array((width + 1) * (height + 1));
  const stride = width + 1;

  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    const srcRow = (y - 1) * width;
    const intRow = y * stride;
    const prevIntRow = (y - 1) * stride;
    for (let x = 1; x <= width; x++) {
      rowSum += data[srcRow + (x - 1)];
      integral[intRow + x] = prevIntRow ? integral[prevIntRow + x] + rowSum : rowSum;
    }
  }

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - rad);
    const y1 = Math.min(height - 1, y + rad);
    const rowOff = y * width;

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - rad);
      const x1 = Math.min(width - 1, x + rad);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);

      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];

      const localMean = sum / count;
      const pixel = data[rowOff + x];

      // Foreground ink if significantly darker than local paper background and below absolute ceiling 215
      const threshold = localMean * (1 - sensitivity) - 6;
      mask[rowOff + x] = pixel < threshold && pixel < 215 ? 1 : 0;
    }
  }

  return { width, height, mask };
}

/**
 * Estimates document skew angle in degrees (-14° to +14°) using projection profile variance maximization.
 */
export function estimateSkewAngleDeg(binary: RawBinaryImage): number {
  const { width, height, mask } = binary;
  if (width < 20 || height < 20) return 0;

  // Subsample foreground points for fast angular sweep
  const stepX = Math.max(1, Math.floor(width / 240));
  const stepY = Math.max(1, Math.floor(height / 240));
  const ptsX: number[] = [];
  const ptsY: number[] = [];
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y += stepY) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += stepX) {
      if (mask[rowOff + x]) {
        ptsX.push(x - cx);
        ptsY.push(y - cy);
      }
    }
  }

  if (ptsX.length < 30) return 0;

  const evalAngle = (deg: number): number => {
    const rad = (deg * Math.PI) / 180;
    const sinA = Math.sin(-rad);
    const cosA = Math.cos(-rad);
    const bins = new Int32Array(height + 40);
    const offset = Math.floor((height + 40) / 2);

    for (let i = 0; i < ptsX.length; i++) {
      const ry = Math.round(ptsX[i] * sinA + ptsY[i] * cosA) + offset;
      if (ry >= 0 && ry < bins.length) {
        bins[ry]++;
      }
    }

    let score = 0;
    for (let b = 1; b < bins.length; b++) {
      const diff = bins[b] - bins[b - 1];
      score += diff * diff;
    }
    return score;
  };

  let bestDeg = 0;
  let bestScore = evalAngle(0);

  // Coarse search (-14° to +14° step 1°)
  for (let deg = -14; deg <= 14; deg += 1) {
    if (deg === 0) continue;
    const s = evalAngle(deg);
    if (s > bestScore * 1.015) {
      bestScore = s;
      bestDeg = deg;
    }
  }

  // Fine search around bestDeg (-0.75° to +0.75° step 0.25°)
  const coarseCenter = bestDeg;
  for (let delta = -0.75; delta <= 0.75; delta += 0.25) {
    const deg = coarseCenter + delta;
    const s = evalAngle(deg);
    if (s > bestScore * 1.005) {
      bestScore = s;
      bestDeg = deg;
    }
  }

  return Math.abs(bestDeg) < 0.35 ? 0 : Number(bestDeg.toFixed(2));
}

/**
 * Rotates a grayscale image by `-skewDeg` to deskew tilted table photos.
 */
export function deskewGrayImage(
  image: RawGrayImage,
  skewDeg: number
): RawGrayImage {
  if (Math.abs(skewDeg) < 0.35) return image;
  const { width, height } = image;
  const rad = (skewDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const cx = width / 2;
  const cy = height / 2;

  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      // Inverse mapping from deskewed output (x, y) back to skewed input (srcX, srcY)
      const srcX = dx * cosA - dy * sinA + cx;
      const srcY = dx * sinA + dy * cosA + cy;
      out[rowOff + x] = sampleGrayBilinear(image, srcX, srcY);
    }
  }
  return { width, height, data: out };
}

/**
 * Clusters close 1D line coordinates (e.g. thick 2-4px table border lines) into single line centers.
 */
function cluster1DLinePositions(positions: number[], maxGap: number = 6): number[] {
  if (positions.length === 0) return [];
  const sorted = [...positions].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const prevCluster = clusters[clusters.length - 1];
    if (sorted[i] - prevCluster[prevCluster.length - 1] <= maxGap) {
      prevCluster.push(sorted[i]);
    } else {
      clusters.push([sorted[i]]);
    }
  }
  return clusters.map((c) =>
    Math.round(c.reduce((acc, v) => acc + v, 0) / c.length)
  );
}

/**
 * Detects horizontal and vertical solid table borders and removes them from the binary mask
 * without erasing character strokes that cross the border.
 */
export function detectAndRemoveTableGridLines(binary: RawBinaryImage): {
  cleaned: RawBinaryImage;
  horizontalGridLinesY: number[];
  verticalGridLinesX: number[];
} {
  const { width, height, mask } = binary;
  const out = new Uint8Array(mask);
  if (width < 20 || height < 20) {
    return {
      cleaned: { width, height, mask: out },
      horizontalGridLinesY: [],
      verticalGridLinesX: [],
    };
  }

  const minHorizRun = Math.max(24, Math.floor(width * 0.32));
  const minVertRun = Math.max(24, Math.floor(height * 0.28));

  const rawHorizY: number[] = [];
  const rawVertX: number[] = [];

  // 1. Detect horizontal line runs
  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    let runStart = -1;
    let totalInkInRow = 0;
    for (let x = 0; x <= width; x++) {
      const bit = x < width ? mask[rowOff + x] : 0;
      if (bit) totalInkInRow++;
      if (bit && runStart === -1) {
        runStart = x;
      } else if (!bit && runStart !== -1) {
        const runLen = x - runStart;
        if (runLen >= minHorizRun) {
          rawHorizY.push(y);
          // Erase horizontal line pixels unless vertical character stroke crosses at (x, y)
          for (let rx = runStart; rx < x; rx++) {
            const hasAbove = y > 2 && mask[(y - 2) * width + rx] && mask[(y - 1) * width + rx];
            const hasBelow =
              y + 2 < height && mask[(y + 2) * width + rx] && mask[(y + 1) * width + rx];
            if (!(hasAbove && hasBelow)) {
              out[rowOff + rx] = 0;
            }
          }
        }
        runStart = -1;
      }
    }
    if (totalInkInRow > width * 0.55 && !rawHorizY.includes(y)) {
      rawHorizY.push(y);
    }
  }

  // 2. Detect continuous vertical line runs
  for (let x = 0; x < width; x++) {
    let runStart = -1;
    for (let y = 0; y <= height; y++) {
      const bit = y < height ? mask[y * width + x] : 0;
      if (bit && runStart === -1) {
        runStart = y;
      } else if (!bit && runStart !== -1) {
        const runLen = y - runStart;
        if (runLen >= minVertRun) {
          rawVertX.push(x);
          for (let ry = runStart; ry < y; ry++) {
            const hasLeft =
              x > 2 &&
              mask[ry * width + (x - 2)] &&
              mask[ry * width + (x - 1)];
            const hasRight =
              x + 2 < width &&
              mask[ry * width + (x + 2)] &&
              mask[ry * width + (x + 1)];
            if (!(hasLeft && hasRight)) {
              out[ry * width + x] = 0;
            }
          }
        }
        runStart = -1;
      }
    }
  }

  // Also clear 1px fringe on detected continuous horizontal and vertical grid lines
  const horizontalGridLinesY = cluster1DLinePositions(rawHorizY, 6);
  const verticalGridLinesX = cluster1DLinePositions(rawVertX, 6);

  for (const gy of horizontalGridLinesY) {
    for (let dy = -2; dy <= 2; dy++) {
      const y = gy + dy;
      if (y < 0 || y >= height) continue;
      const rowOff = y * width;
      let rowCount = 0;
      for (let x = 0; x < width; x++) rowCount += mask[rowOff + x];
      if (rowCount > width * 0.4) {
        for (let x = 0; x < width; x++) {
          const hasAbove = y > 3 && mask[(y - 3) * width + x];
          const hasBelow = y + 3 < height && mask[(y + 3) * width + x];
          if (!(hasAbove && hasBelow)) {
            out[rowOff + x] = 0;
          }
        }
      }
    }
  }

  for (const gx of verticalGridLinesX) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = gx + dx;
      if (x < 0 || x >= width) continue;
      let colCount = 0;
      for (let y = 0; y < height; y++) colCount += mask[y * width + x];
      if (colCount > height * 0.4) {
        for (let y = 0; y < height; y++) {
          const hasLeft = x > 3 && mask[y * width + (x - 3)];
          const hasRight = x + 3 < width && mask[y * width + (x + 3)];
          if (!(hasLeft && hasRight)) {
            out[y * width + x] = 0;
          }
        }
      }
    }
  }

  return {
    cleaned: { width, height, mask: out },
    horizontalGridLinesY,
    verticalGridLinesX,
  };
}

/**
 * Full image preprocessing pipeline for photographed student rosters:
 * 1. Orientation normalization (manual or auto 90° detection)
 * 2. Perspective homography rectification (if 4 corners supplied)
 * 3. Resolution upscaling for low-resolution images
 * 4. Skew angle estimation & deskewing
 * 5. Adaptive Sauvola/Bradley local thresholding
 * 6. Table grid line detection & removal
 */
export function preprocessRosterImage(
  source: RawGrayImage,
  options: PreprocessingOptions = {}
): PreprocessingResult {
  const originalWidth = source.width;
  const originalHeight = source.height;
  const qualityWarnings: string[] = [];

  // 1. Rotation
  let appliedRotationDeg: 0 | 90 | 180 | 270 = options.manualRotationDeg ?? 0;
  if (options.manualRotationDeg === undefined && options.autoOrient !== false) {
    appliedRotationDeg = detectAutoOrientation90(source);
  }
  let working = rotateGrayImage90n(source, appliedRotationDeg);
  if (appliedRotationDeg !== 0) {
    qualityWarnings.push(
      `Görsel yönü otomatik olarak ${appliedRotationDeg}° döndürülerek düzeltildi.`
    );
  }

  // 2. Perspective homography rectification
  let perspectiveRectified = false;
  if (options.perspectiveCorners && options.perspectiveCorners.length === 4) {
    working = applyPerspectiveHomography(working, options.perspectiveCorners);
    perspectiveRectified = true;
  }

  // 3. Resolution check & upscaling
  const targetMinWidth = options.targetMinWidth ?? 900;
  let upscaleFactor = 1;
  if (working.width > 0 && working.width < targetMinWidth) {
    upscaleFactor = Number(
      Math.min(2.5, targetMinWidth / working.width).toFixed(2)
    );
    if (upscaleFactor > 1.05) {
      working = upscaleGrayImageBilinear(working, upscaleFactor);
    } else {
      upscaleFactor = 1;
    }
  }

  const contrastScore = computeContrastScore(working);
  if (contrastScore < 18) {
    qualityWarnings.push(
      'Görsel kontrastı düşük. Yerel adaptif eşikleme (Sauvola) uygulandı; belirsiz hücreleri yakınlaştırarak kontrol edin.'
    );
  }

  // 4. Initial binarization + skew detection & deskew
  let binary = adaptiveLocalBinarize(working);
  let detectedSkewDeg = 0;
  if (options.autoDeskew !== false) {
    detectedSkewDeg = estimateSkewAngleDeg(binary);
    if (Math.abs(detectedSkewDeg) >= 0.4) {
      working = deskewGrayImage(working, detectedSkewDeg);
      binary = adaptiveLocalBinarize(working);
      if (Math.abs(detectedSkewDeg) >= 1.5) {
        qualityWarnings.push(
          `Fotoğrafta ${detectedSkewDeg > 0 ? '+' : ''}${detectedSkewDeg}° eğim tespit edildi ve otomatik olarak yatay hizalandı.`
        );
      }
    }
  }

  // 5. Grid line extraction and removal
  const {
    cleaned: rawGridCleanedMask,
    horizontalGridLinesY,
    verticalGridLinesX,
  } = options.removeGridLines !== false
    ? detectAndRemoveTableGridLines(binary)
    : {
        cleaned: binary,
        horizontalGridLinesY: [],
        verticalGridLinesX: [],
      };

  // 6. Morphological despeckle pass to strip isolated 1-2px camera/shadow noise while preserving Turkish dots
  const gridLinesRemovedMask = despeckleBinaryMask(rawGridCleanedMask);

  return {
    grayImage: working,
    binaryImage: binary,
    gridLinesRemovedMask,
    diagnostics: {
      originalWidth,
      originalHeight,
      processedWidth: working.width,
      processedHeight: working.height,
      appliedRotationDeg,
      detectedSkewDeg,
      perspectiveRectified,
      upscaleFactor,
      contrastScore,
      horizontalGridLinesY,
      verticalGridLinesX,
      qualityWarnings,
    },
  };
}

/**
 * Removes isolated 1-pixel and 2-pixel salt-and-pepper noise from a binary mask
 * caused by camera sensor grain or paper texture under uneven lighting,
 * without eroding real character strokes or Turkish diacritics (which are >= 4px).
 */
export function despeckleBinaryMask(binary: RawBinaryImage): RawBinaryImage {
  const { width, height, mask } = binary;
  if (width < 3 || height < 3) return binary;

  const out = new Uint8Array(mask);
  for (let y = 1; y < height - 1; y++) {
    const rOff = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = rOff + x;
      if (!mask[idx]) continue;

      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const nr = (y + dy) * width;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (mask[nr + (x + dx)]) neighbors++;
        }
      }
      // If a foreground pixel has 0 or 1 neighbor in its 3x3 window, check if it's an isolated 1-2px speck
      if (neighbors === 0) {
        out[idx] = 0;
      } else if (neighbors === 1) {
        // Check if that single neighbor also has <= 1 neighbor
        let singleNeighborDeg = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const nr = (y + dy) * width;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (mask[nr + (x + dx)]) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 1 && ny < height - 1 && nx >= 1 && nx < width - 1) {
                for (let ndy = -1; ndy <= 1; ndy++) {
                  for (let ndx = -1; ndx <= 1; ndx++) {
                    if (ndx === 0 && ndy === 0) continue;
                    if (mask[(ny + ndy) * width + (nx + ndx)]) {
                      singleNeighborDeg++;
                    }
                  }
                }
              }
            }
          }
        }
        if (singleNeighborDeg <= 1) {
          out[idx] = 0;
        }
      }
    }
  }

  return { width, height, mask: out };
}
