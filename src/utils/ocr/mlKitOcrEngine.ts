import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  BoundingBox,
  ColumnRole,
  OcrCellReReadOutput,
  OcrEngineAdapter,
  OcrEngineOptions,
  OcrEngineOutput,
  OcrWordAlternative,
  OcrWordToken,
  Point2D,
  RawGrayImage,
} from './ocrTypes.ts';
import {
  cropGrayImageRegion,
  preprocessRosterImage,
  upscaleGrayImageBilinear,
} from './imagePreprocessor.ts';
import { TURKISH_ROSTER_LEXICON } from './localOcrEngine.ts';

export interface MlKitSymbolPayload {
  symbolIndex: number;
  text: string;
  confidence: number;
  angle: number;
  bbox: BoundingBox;
}

export interface MlKitElementPayload {
  elementIndex: number;
  text: string;
  confidence: number;
  angle: number;
  recognizedLanguage?: string;
  bbox: BoundingBox;
  cornerPoints?: Point2D[];
  symbols?: MlKitSymbolPayload[];
}

export interface MlKitLinePayload {
  lineIndex: number;
  text: string;
  confidence: number;
  angle: number;
  recognizedLanguage?: string;
  bbox: BoundingBox;
  cornerPoints?: Point2D[];
  elements: MlKitElementPayload[];
}

export interface MlKitBlockPayload {
  blockIndex: number;
  text: string;
  recognizedLanguage?: string;
  bbox: BoundingBox;
  cornerPoints?: Point2D[];
  lines: MlKitLinePayload[];
}

export interface MlKitRecognizeResponse {
  text: string;
  imageWidth: number;
  imageHeight: number;
  elapsedMs: number;
  isLocalOnly: true;
  blocks: MlKitBlockPayload[];
}

export interface MlKitCapabilitiesResponse {
  available: boolean;
  engineId: string;
  engineName: string;
  isLocalOnly: boolean;
  script: string;
}

export interface MlKitTextRecognitionPluginContract {
  getCapabilities(): Promise<MlKitCapabilitiesResponse>;
  recognizeText(options: {
    base64Image: string;
    rotationDegrees?: number;
  }): Promise<MlKitRecognizeResponse>;
}

export const MlKitTextRecognitionBridge =
  registerPlugin<MlKitTextRecognitionPluginContract>('MlKitTextRecognition');

/**
 * Pure TypeScript uncompressed PNG + Base64 encoder for RawGrayImage.
 * Works identically in browser, Web Worker, Android WebView, and Node.js tests without requiring DOM Canvas.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function writeUint32BE(arr: Uint8Array, offset: number, val: number): void {
  arr[offset] = (val >>> 24) & 0xff;
  arr[offset + 1] = (val >>> 16) & 0xff;
  arr[offset + 2] = (val >>> 8) & 0xff;
  arr[offset + 3] = val & 0xff;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? chars[b2 & 63] : '=';
  }
  return result;
}

export function encodeGrayImageToPngBase64(image: RawGrayImage): string {
  const { width, height, data } = image;
  // Build raw scanlines (1 filter byte 0x00 per row + width grayscale bytes)
  const rawLen = height * (1 + width);
  const rawScanlines = new Uint8Array(rawLen);
  let ptr = 0;
  for (let y = 0; y < height; y++) {
    rawScanlines[ptr++] = 0; // Filter type 0 (None)
    const rowOff = y * width;
    rawScanlines.set(data.subarray(rowOff, rowOff + width), ptr);
    ptr += width;
  }

  // Wrap rawScanlines in zlib stored deflate blocks (max 65535 bytes per block)
  const maxBlock = 65535;
  const numBlocks = Math.max(1, Math.ceil(rawLen / maxBlock));
  const zlibLen = 2 + rawLen + numBlocks * 5 + 4;
  const zlibData = new Uint8Array(zlibLen);
  let zPtr = 0;
  zlibData[zPtr++] = 0x78; // CMF
  zlibData[zPtr++] = 0x01; // FLG (no compression)

  let rem = rawLen;
  let srcOff = 0;
  for (let b = 0; b < numBlocks; b++) {
    const blockLen = Math.min(maxBlock, rem);
    const isFinal = b === numBlocks - 1 ? 1 : 0;
    zlibData[zPtr++] = isFinal;
    zlibData[zPtr++] = blockLen & 0xff;
    zlibData[zPtr++] = (blockLen >>> 8) & 0xff;
    const nlen = ~blockLen & 0xffff;
    zlibData[zPtr++] = nlen & 0xff;
    zlibData[zPtr++] = (nlen >>> 8) & 0xff;
    zlibData.set(rawScanlines.subarray(srcOff, srcOff + blockLen), zPtr);
    zPtr += blockLen;
    srcOff += blockLen;
    rem -= blockLen;
  }
  writeUint32BE(zlibData, zPtr, adler32(rawScanlines));

  // Build PNG chunks: Signature (8) + IHDR (25) + IDAT (12 + zlibLen) + IEND (12)
  const pngBytes = new Uint8Array(8 + 25 + (12 + zlibLen) + 12);
  let p = 0;
  // Signature
  pngBytes.set([137, 80, 78, 71, 13, 10, 26, 10], p);
  p += 8;

  // IHDR
  writeUint32BE(pngBytes, p, 13);
  p += 4;
  const ihdrStart = p;
  pngBytes.set([73, 72, 68, 82], p); // 'IHDR'
  p += 4;
  writeUint32BE(pngBytes, p, width);
  p += 4;
  writeUint32BE(pngBytes, p, height);
  p += 4;
  pngBytes[p++] = 8; // bit depth 8
  pngBytes[p++] = 0; // color type 0 (grayscale)
  pngBytes[p++] = 0; // compression
  pngBytes[p++] = 0; // filter
  pngBytes[p++] = 0; // interlace
  writeUint32BE(pngBytes, p, crc32(pngBytes.subarray(ihdrStart, p)));
  p += 4;

  // IDAT
  writeUint32BE(pngBytes, p, zlibLen);
  p += 4;
  const idatStart = p;
  pngBytes.set([73, 68, 65, 84], p); // 'IDAT'
  p += 4;
  pngBytes.set(zlibData, p);
  p += zlibLen;
  writeUint32BE(pngBytes, p, crc32(pngBytes.subarray(idatStart, p)));
  p += 4;

  // IEND
  writeUint32BE(pngBytes, p, 0);
  p += 4;
  const iendStart = p;
  pngBytes.set([73, 69, 78, 68], p); // 'IEND'
  p += 4;
  writeUint32BE(pngBytes, p, crc32(pngBytes.subarray(iendStart, p)));

  return uint8ToBase64(pngBytes);
}

/**
 * Normalizes and repairs Turkish OCR tokens produced by Google ML Kit Text Recognition v2 (Latin script).
 * - Cleans stray table-border pipes/brackets (`|`, `[`, `]`, `_`, `—`) at word boundaries.
 * - Normalizes Unicode combining diacritics (NFC + `I\u0307` -> `İ`, `ı` -> `I`, `i` -> `İ` in Turkish uppercase).
 * - Repairs common ML Kit Latin diacritic drops on Turkish names/headers (`CELIK` -> `ÇELİK`, `AYSE` -> `AYŞE`, `OMER` -> `ÖMER`, `SAHIN` -> `ŞAHİN`, `GUNES` -> `GÜNEŞ`) while preserving original readings in `alternatives`.
 * - Disambiguates digit/letter confusions (`24S` -> `245`, `31O` -> `310`, `1O8` -> `108`) when a token is predominantly numeric or in a numeric column.
 */
export function normalizeMlKitTurkishToken(
  rawText: string,
  rawConfidence: number,
  roleHint?: ColumnRole
): {
  text: string;
  confidence: number;
  alternatives: OcrWordAlternative[];
} {
  const alternatives: OcrWordAlternative[] = [];

  // 1. Strip stray table border artifacts around words (e.g. "|245|", "[AYŞE", "ÇELİK|")
  const stripped = rawText
    .normalize('NFC')
    .replace(/^[|[\](){}_—–\-.,:;!'"`~]+/, '')
    .replace(/[|[\](){}_—–\-.,:;!'"`~]+$/, '')
    .trim();

  if (!stripped) {
    return { text: '', confidence: 0, alternatives: [] };
  }

  // 2. Convert to Turkish uppercase with proper İ / I handling
  const upper = stripped
    .replace(/i\u0307/g, 'i')
    .replace(/I\u0307/g, 'İ')
    .replace(/i/g, 'İ')
    .replace(/ı/g, 'I')
    .toLocaleUpperCase('tr-TR')
    .replace(/I\u0307/g, 'İ');

  // 2. Preserve true OCR confidence without artificial inflation:
  //    - If rawConfidence is 0 or negative/missing, keep it at 0 (never inflate to 92!)
  //    - If rawConfidence is in (0, 1], scale to 1..100 percentage
  //    - If rawConfidence is in (1, 100], clamp to 1..100
  const baseConf =
    !Number.isFinite(rawConfidence) || rawConfidence <= 0
      ? 0
      : rawConfidence <= 1
      ? Math.round(rawConfidence * 100)
      : Math.round(Math.min(100, rawConfidence));

  // 3. Check if token is numeric or near-numeric (e.g. school number or sequence number)
  const digitCount = (upper.match(/[0-9]/g) || []).length;
  const lookalikeDigitCount = (upper.match(/[0-9OÖDIİLl|SŞBZ]/g) || []).length;

  const isNumericCandidate =
    roleHint === 'studentNumber' ||
    roleHint === 'sequence' ||
    (digitCount >= 1 &&
      lookalikeDigitCount === upper.length &&
      upper.length <= 6 &&
      (digitCount >= Math.ceil(upper.length * 0.5) || upper.length <= 2));

  if (isNumericCandidate) {
    const convertedDigits = upper
      .replace(/[OÖD]/g, '0')
      .replace(/[IİLl|]/g, '1')
      .replace(/[SŞ]/g, '5')
      .replace(/B/g, '8')
      .replace(/Z/g, '2');

    if (/^\d+$/.test(convertedDigits)) {
      if (convertedDigits !== upper) {
        alternatives.push({
          text: upper,
          confidence: Math.max(0, baseConf - 8),
          reason: 'Ham ML Kit okuması (harf/rakam benzerliği)',
        });
      }
      // Never artificially raise confidence above raw baseConf; slightly penalize if character conversion occurred
      const adjustedConf =
        convertedDigits !== upper ? Math.max(0, baseConf - 3) : baseConf;
      return {
        text: convertedDigits,
        confidence: adjustedConf,
        alternatives,
      };
    }
  }

  // 4. Turkish lexicon & diacritic normalization for alphabetic words (headers, first names, surnames)
  //    IMPORTANT: Lexicon matching NEVER inflates confidence (e.g. a low-confidence 60% reading stays 60%!).
  if (upper.length >= 2 && /[A-ZÇĞİÖŞÜ]/.test(upper)) {
    const asciiFold = (s: string) =>
      s
        .replace(/Ç/g, 'C')
        .replace(/Ğ/g, 'G')
        .replace(/İ/g, 'I')
        .replace(/Ö/g, 'O')
        .replace(/Ş/g, 'S')
        .replace(/Ü/g, 'U');

    const foldedUpper = asciiFold(upper);

    // Exact match in Turkish lexicon: keep original baseConf without boosting to 95%
    if (TURKISH_ROSTER_LEXICON.includes(upper)) {
      return {
        text: upper,
        confidence: baseConf,
        alternatives,
      };
    }

    // Diacritic-equivalent match in Turkish roster lexicon (e.g., ML Kit read "CELIK" or "ÇELIK" -> "ÇELİK")
    const diacriticMatch = TURKISH_ROSTER_LEXICON.find(
      (lex) => asciiFold(lex) === foldedUpper
    );
    if (diacriticMatch && diacriticMatch !== upper) {
      alternatives.push({
        text: upper,
        confidence: baseConf,
        reason: 'Ham ML Kit Latin okuması',
      });
      // Never boost confidence above baseConf; slightly penalize automatic diacritic repair so low-confidence words stay low
      const repairedConf = baseConf > 0 ? Math.max(1, baseConf - 2) : 0;
      return {
        text: diacriticMatch,
        confidence: repairedConf,
        alternatives,
      };
    }
  }

  return {
    text: upper,
    confidence: baseConf,
    alternatives,
  };
}

/**
 * Converts a native ML Kit Text Recognition response (`Blocks -> Lines -> Elements -> Symbols`)
 * into calibrated `OcrWordToken[]` tokens ready for `analyzeRosterTableGeometry`.
 * - Splits any element that accidentally merged a vertical column border or wide multi-column gap
 *   (e.g. `"1|245"` or `"245 AYŞE"`) using symbol bounding boxes so adjacent columns never mix.
 */
export function convertMlKitResponseToWordTokens(
  response: MlKitRecognizeResponse,
  verticalGridLinesX: number[] = []
): OcrWordToken[] {
  const tokens: OcrWordToken[] = [];
  let tokCounter = 1;

  const hasVertGridBetween = (xA: number, xB: number): boolean => {
    const lo = Math.min(xA, xB) + 1;
    const hi = Math.max(xA, xB) - 1;
    if (hi <= lo) return false;
    return verticalGridLinesX.some((vx) => vx >= lo && vx <= hi);
  };

  for (const block of response.blocks || []) {
    for (const line of block.lines || []) {
      for (const elem of line.elements || []) {
        const symbols = elem.symbols || [];
        const rawElemConf =
          !Number.isFinite(elem.confidence) || elem.confidence <= 0
            ? 0
            : elem.confidence <= 1
            ? Math.round(elem.confidence * 100)
            : Math.round(Math.min(100, elem.confidence));

        // Check if this element contains a pipe '|' separator, digit-to-letter transition ("245AYŞE"), or straddles a vertical grid line
        const subElements: Array<{
          text: string;
          bbox: BoundingBox;
          confidence: number;
          symbolConfidences: number[];
        }> = [];

        if (symbols.length >= 2) {
          let curSyms: MlKitSymbolPayload[] = [];
          const flushSyms = () => {
            if (curSyms.length === 0) return;
            const rawSubText = curSyms.map((s) => s.text).join('');
            const x0 = Math.min(...curSyms.map((s) => s.bbox.x0));
            const y0 = Math.min(...curSyms.map((s) => s.bbox.y0));
            const x1 = Math.max(...curSyms.map((s) => s.bbox.x1));
            const y1 = Math.max(...curSyms.map((s) => s.bbox.y1));
            const symConfs = curSyms.map((s) =>
              !Number.isFinite(s.confidence) || s.confidence <= 0
                ? 0
                : s.confidence <= 1
                ? Math.round(s.confidence * 100)
                : Math.round(Math.min(100, s.confidence))
            );
            const avgSymConf =
              symConfs.reduce((a, b) => a + b, 0) / symConfs.length;
            const effectiveConf =
              rawElemConf > 0 && avgSymConf > 0
                ? Math.min(rawElemConf, avgSymConf)
                : avgSymConf > 0
                ? avgSymConf
                : rawElemConf;
            subElements.push({
              text: rawSubText,
              bbox: { x0, y0, x1, y1 },
              confidence: effectiveConf,
              symbolConfidences: symConfs,
            });
            curSyms = [];
          };

          for (let sIdx = 0; sIdx < symbols.length; sIdx++) {
            const sym = symbols[sIdx];
            if (sym.text === '|' || sym.text === '¦') {
              flushSyms();
              continue;
            }
            if (curSyms.length > 0) {
              const prevSym = curSyms[curSyms.length - 1];
              const symGap = sym.bbox.x0 - prevSym.bbox.x1;
              const symH = Math.max(8, prevSym.bbox.y1 - prevSym.bbox.y0);
              const crossedGrid = hasVertGridBetween(
                prevSym.bbox.x1,
                sym.bbox.x0
              );
              const wideGap = symGap > symH * 0.85;
              if (crossedGrid || wideGap) {
                flushSyms();
              }
            }
            curSyms.push(sym);
          }
          flushSyms();
        } else {
          // Fallback if symbols list is empty: split on '|' if present
          const parts = (elem.text || '').split(/[|¦]+/).filter(Boolean);
          if (parts.length <= 1) {
            subElements.push({
              text: elem.text,
              bbox: elem.bbox,
              confidence: elem.confidence,
              symbolConfidences: [],
            });
          } else {
            const totalW = Math.max(1, elem.bbox.x1 - elem.bbox.x0);
            const totalChars = Math.max(1, elem.text.length);
            let charOffset = 0;
            for (const part of parts) {
              const px0 = Math.round(
                elem.bbox.x0 + (charOffset / totalChars) * totalW
              );
              const px1 = Math.round(
                elem.bbox.x0 + ((charOffset + part.length) / totalChars) * totalW
              );
              subElements.push({
                text: part,
                bbox: {
                  x0: px0,
                  y0: elem.bbox.y0,
                  x1: Math.max(px0 + 4, px1),
                  y1: elem.bbox.y1,
                },
                confidence: elem.confidence,
                symbolConfidences: [],
              });
              charOffset += part.length + 1;
            }
          }
        }

        for (const sub of subElements) {
          const normalized = normalizeMlKitTurkishToken(
            sub.text,
            sub.confidence
          );
          if (!normalized.text) continue;

          tokens.push({
            id: `mlkit-tok-${tokCounter++}`,
            text: normalized.text,
            confidence: normalized.confidence,
            bbox: sub.bbox,
            cornerPoints: elem.cornerPoints,
            baselineY: sub.bbox.y1,
            skewDeg: elem.angle ?? line.angle ?? 0,
            blockIndex: block.blockIndex,
            lineIndex: line.lineIndex,
            elementIndex: elem.elementIndex,
            symbolConfidences: sub.symbolConfidences,
            alternatives: normalized.alternatives,
          });
        }
      }
    }
  }

  return tokens;
}

/**
 * Google ML Kit Text Recognition v2 (Android Native via Capacitor) Adapter.
 * Executes 100% on-device (KVKK compliant) on Android tablets/phones.
 * When native Android ML Kit is unavailable or returns an error, it NEVER hides the failure:
 * it records the exact failure cause (`fallbackReason`) and transparently reports the actual fallback engine
 * (`engineId`, `engineName`, `requestedEngineId`, `fallbackOccurred: true`) to the user.
 */
export class CapacitorMlKitOcrEngine implements OcrEngineAdapter {
  public readonly engineId = 'google-mlkit-android-v2';
  public readonly engineName =
    'Google ML Kit Text Recognition v2 (Android Cihaz İçi Yerel Motor)';
  public readonly isLocalOnly = true as const;

  private customBridge?: MlKitTextRecognitionPluginContract;
  private fallbackEngine: OcrEngineAdapter;

  constructor(
    fallbackEngine: OcrEngineAdapter,
    customBridge?: MlKitTextRecognitionPluginContract
  ) {
    this.fallbackEngine = fallbackEngine;
    this.customBridge = customBridge;
  }

  public isNativeAndroidAvailable(): boolean {
    if (this.customBridge) return true;
    try {
      return (
        typeof Capacitor !== 'undefined' &&
        Capacitor.isNativePlatform() &&
        Capacitor.getPlatform() === 'android'
      );
    } catch {
      return false;
    }
  }

  private getBridge(): MlKitTextRecognitionPluginContract {
    return this.customBridge ?? MlKitTextRecognitionBridge;
  }

  public async recognizeImage(
    image: RawGrayImage,
    options: OcrEngineOptions = {}
  ): Promise<OcrEngineOutput> {
    if (!this.isNativeAndroidAvailable()) {
      const reason =
        'Google ML Kit yerel Android köprüsü bu ortamda (Web/Tarayıcı) aktif değil; işlem alternatif yerel tarayıcı OCR motoruyla gerçekleştirildi.';
      const fallbackRes = await this.fallbackEngine.recognizeImage(image, options);
      return {
        ...fallbackRes,
        engineId: fallbackRes.engineId,
        engineName: fallbackRes.engineName,
        requestedEngineId: this.engineId,
        requestedEngineName: this.engineName,
        fallbackOccurred: true,
        fallbackReason: reason,
        preprocessing: {
          ...fallbackRes.preprocessing,
          diagnostics: {
            ...fallbackRes.preprocessing.diagnostics,
            qualityWarnings: [
              `[Motor Bilgilendirmesi] ${reason}`,
              ...fallbackRes.preprocessing.diagnostics.qualityWarnings,
            ],
          },
        },
      };
    }

    // Preserve high resolution (up to 3200px) so ML Kit gets crisp Turkish diacritics & small digits
    const preprocessing = preprocessRosterImage(image, {
      ...options.preprocessing,
      targetMaxDimension:
        options.preprocessing?.targetMaxDimension ?? 3200,
    });

    try {
      const base64Png = encodeGrayImageToPngBase64(preprocessing.grayImage);
      const mlkitResponse = await this.getBridge().recognizeText({
        base64Image: base64Png,
        rotationDegrees: 0,
      });

      const words = convertMlKitResponseToWordTokens(
        mlkitResponse,
        preprocessing.diagnostics.verticalGridLinesX
      );

      return {
        engineId: this.engineId,
        engineName: this.engineName,
        requestedEngineId: this.engineId,
        requestedEngineName: this.engineName,
        fallbackOccurred: false,
        isLocalOnly: true,
        words,
        preprocessing,
      };
    } catch (err) {
      const errDetail =
        err instanceof Error ? err.message : String(err || 'Bilinmeyen Capacitor köprü hatası');
      const reason = `Google ML Kit yerel OCR köprüsü başarısız oldu (${errDetail}). İşlem kesintisiz devam etmesi için '${this.fallbackEngine.engineName}' motoruna devredildi.`;
      const fallbackRes = await this.fallbackEngine.recognizeImage(image, options);
      return {
        ...fallbackRes,
        engineId: fallbackRes.engineId,
        engineName: fallbackRes.engineName,
        requestedEngineId: this.engineId,
        requestedEngineName: this.engineName,
        fallbackOccurred: true,
        fallbackReason: reason,
        preprocessing: {
          ...fallbackRes.preprocessing,
          diagnostics: {
            ...fallbackRes.preprocessing.diagnostics,
            qualityWarnings: [
              `[ML Kit Hatası — Yedek Motora Geçildi] ${reason}`,
              ...fallbackRes.preprocessing.diagnostics.qualityWarnings,
            ],
          },
        },
      };
    }
  }

  public async recognizeCellRegion(
    image: RawGrayImage,
    bbox: BoundingBox,
    roleHint: ColumnRole
  ): Promise<OcrCellReReadOutput> {
    if (!this.isNativeAndroidAvailable()) {
      if (this.fallbackEngine.recognizeCellRegion) {
        return this.fallbackEngine.recognizeCellRegion(image, bbox, roleHint);
      }
      return { text: '', confidence: 0, alternatives: [] };
    }

    const pad = 6;
    const x0 = Math.max(0, Math.floor(bbox.x0 - pad));
    const y0 = Math.max(0, Math.floor(bbox.y0 - pad));
    const x1 = Math.min(image.width - 1, Math.ceil(bbox.x1 + pad));
    const y1 = Math.min(image.height - 1, Math.ceil(bbox.y1 + pad));
    const cropped = cropGrayImageRegion(
      image,
      x0,
      y0,
      Math.max(1, x1 - x0 + 1),
      Math.max(1, y1 - y0 + 1)
    );
    const upscaled = upscaleGrayImageBilinear(cropped, 2.0);

    try {
      const base64Png = encodeGrayImageToPngBase64(upscaled);
      const res = await this.getBridge().recognizeText({
        base64Image: base64Png,
        rotationDegrees: 0,
      });
      const tokens = convertMlKitResponseToWordTokens(res);
      if (tokens.length === 0) {
        if (this.fallbackEngine.recognizeCellRegion) {
          return this.fallbackEngine.recognizeCellRegion(image, bbox, roleHint);
        }
        return { text: '', confidence: 0, alternatives: [] };
      }

      const normalizedParts = tokens.map((t) =>
        normalizeMlKitTurkishToken(t.text, t.confidence, roleHint)
      );
      const text = normalizedParts
        .map((p) => p.text)
        .filter(Boolean)
        .join(' ')
        .trim();
      const confidence = Math.round(
        normalizedParts.reduce((s, p) => s + p.confidence, 0) /
          normalizedParts.length
      );
      const alternatives = normalizedParts.flatMap((p) => p.alternatives);

      return { text, confidence, alternatives };
    } catch {
      if (this.fallbackEngine.recognizeCellRegion) {
        return this.fallbackEngine.recognizeCellRegion(image, bbox, roleHint);
      }
      return { text: '', confidence: 0, alternatives: [] };
    }
  }
}
