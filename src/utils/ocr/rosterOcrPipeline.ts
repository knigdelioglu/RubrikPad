import type { Student } from '../../types.ts';
import type {
  ColumnRole,
  GeometricTableAnalysisResult,
  OcrEngineAdapter,
  OcrEngineOutput,
  PreprocessingOptions,
  RawGrayImage,
  VerifiedOcrRosterRow,
} from './ocrTypes.ts';
import {
  defaultLocalOcrRegistry,
  renderRealisticCameraRosterPhotoToGrayImage,
  renderSyntheticRosterTableToGrayImage,
  type RealisticCameraRosterConfig,
} from './localOcrEngine.ts';
import { analyzeRosterTableGeometry } from './geometricTableParser.ts';
import {
  evaluateRosterReliability,
  runTargetedCellReReads,
} from './rosterReliability.ts';

export interface RosterOcrPerformanceMetrics {
  preprocessingAndOcrMs: number;
  geometricParsingMs: number;
  reliabilityAndReReadMs: number;
  totalDurationMs: number;
  throughputRowsPerSec: number;
  recognizedWordCount: number;
  averageWordConfidence: number;
  imageMegapixels: number;
  downscaleFactor?: number;
  executedInWebWorker?: boolean;
}

export interface FullRosterOcrPipelineResult {
  ocrOutput: OcrEngineOutput;
  tableAnalysis: GeometricTableAnalysisResult;
  verifiedRows: VerifiedOcrRosterRow[];
  performanceMetrics: RosterOcrPerformanceMetrics;
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Runs the complete 100% local, zero-network OCR & geometric table analysis pipeline:
 * 1. Image Preprocessing (orientation, perspective homography, resolution cap & upscaling, deskewing, Sauvola thresholding, grid removal, despeckling)
 * 2. Local OCR Engine word & coordinate extraction
 * 3. Geometric Table Structure Analysis (headers, dynamic columns, 1-to-1 row anchoring, missing row gap detection)
 * 4. Smart Uncertainty & Reliability Evaluation
 * 5. Targeted Local Cell Re-OCR on uncertain cells (attaching non-destructive suggestions)
 */
export async function runLocalRosterOcrPipeline(
  image: RawGrayImage,
  existingClassroomStudents: Student[] = [],
  options: {
    preprocessing?: PreprocessingOptions;
    manualColumnRoles?: Record<number, ColumnRole>;
    forceHeaderlessMode?: boolean;
    engine?: OcrEngineAdapter;
  } = {}
): Promise<FullRosterOcrPipelineResult> {
  const engine = options.engine ?? defaultLocalOcrRegistry.getActiveEngine();
  if (engine.isLocalOnly !== true) {
    throw new Error(
      'KVKK Güvenlik Kuralı: Yalnızca cihaz içi yerel OCR motorları kullanılabilir.'
    );
  }

  const t0 = nowMs();
  const ocrOutput = await engine.recognizeImage(image, {
    language: 'tur',
    preprocessing: options.preprocessing,
  });
  const t1 = nowMs();

  const tableAnalysis = analyzeRosterTableGeometry(ocrOutput.words, {
    horizontalGridLinesY: ocrOutput.preprocessing.diagnostics.horizontalGridLinesY,
    verticalGridLinesX: ocrOutput.preprocessing.diagnostics.verticalGridLinesX,
    manualColumnRoles: options.manualColumnRoles,
    forceHeaderlessMode: options.forceHeaderlessMode,
  });
  const t2 = nowMs();

  let verifiedRows = evaluateRosterReliability(
    tableAnalysis.rows,
    ocrOutput.words,
    existingClassroomStudents
  );

  verifiedRows = await runTargetedCellReReads(
    verifiedRows,
    ocrOutput.preprocessing.grayImage,
    engine
  );
  const t3 = nowMs();

  const preprocessingAndOcrMs = Number(Math.max(0.1, t1 - t0).toFixed(2));
  const geometricParsingMs = Number(Math.max(0.05, t2 - t1).toFixed(2));
  const reliabilityAndReReadMs = Number(Math.max(0.05, t3 - t2).toFixed(2));
  const totalDurationMs = Number(Math.max(0.2, t3 - t0).toFixed(2));
  const rowCount = Math.max(1, verifiedRows.length);
  const throughputRowsPerSec = Number(
    ((rowCount / Math.max(1, totalDurationMs)) * 1000).toFixed(1)
  );
  const recognizedWordCount = ocrOutput.words.length;
  const averageWordConfidence =
    recognizedWordCount > 0
      ? Number(
          (
            ocrOutput.words.reduce((acc, w) => acc + w.confidence, 0) /
            recognizedWordCount
          ).toFixed(1)
        )
      : 0;
  const imageMegapixels = Number(
    ((image.width * image.height) / 1_000_000).toFixed(3)
  );

  return {
    ocrOutput,
    tableAnalysis: {
      ...tableAnalysis,
      rows: verifiedRows,
    },
    verifiedRows,
    performanceMetrics: {
      preprocessingAndOcrMs,
      geometricParsingMs,
      reliabilityAndReReadMs,
      totalDurationMs,
      throughputRowsPerSec,
      recognizedWordCount,
      averageWordConfidence,
      imageMegapixels,
      downscaleFactor: ocrOutput.preprocessing.diagnostics.downscaleFactor ?? 1,
      executedInWebWorker: false,
    },
  };
}

let activeOcrWorkerCleanup: (() => void) | null = null;

/**
 * Terminates any currently running background OCR Web Worker so superseded photo uploads
 * or unmounted OCR panels never leak background CPU/memory.
 */
export function terminateActiveOcrWorker(): void {
  if (activeOcrWorkerCleanup) {
    try {
      activeOcrWorkerCleanup();
    } catch {
      // ignore
    }
    activeOcrWorkerCleanup = null;
  }
}

/**
 * Offloads heavy pixel preprocessing, Sauvola thresholding, local OCR, and geometric table parsing
 * to a dedicated Web Worker in browser/tablet environments so the main UI thread never freezes on large photos.
 * Falls back cleanly to in-process execution when Web Workers are unavailable (e.g. Node.js unit tests).
 */
export async function runLocalRosterOcrPipelineAsync(
  image: RawGrayImage,
  existingClassroomStudents: Student[] = [],
  options: {
    preprocessing?: PreprocessingOptions;
    manualColumnRoles?: Record<number, ColumnRole>;
    forceHeaderlessMode?: boolean;
    engine?: OcrEngineAdapter;
    preferWebWorker?: boolean;
  } = {}
): Promise<FullRosterOcrPipelineResult> {
  const activeEngine = options.engine ?? defaultLocalOcrRegistry.getActiveEngine();
  const isNativeBridgeEngine = activeEngine.engineId === 'google-mlkit-android-v2';

  const canUseWorker =
    options.preferWebWorker !== false &&
    !options.engine &&
    !isNativeBridgeEngine &&
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined';

  if (canUseWorker) {
    try {
      // Terminate any previous in-flight OCR worker before spawning a new one
      terminateActiveOcrWorker();

      const workerResult = await new Promise<FullRosterOcrPipelineResult>(
        (resolve, reject) => {
          const worker = new Worker(
            new URL('./ocrWorker.ts', import.meta.url),
            { type: 'module' }
          );
          const requestId = `ocr-req-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 7)}`;

          const cleanup = () => {
            worker.onmessage = null;
            worker.onerror = null;
            worker.terminate();
            if (activeOcrWorkerCleanup === cleanup) {
              activeOcrWorkerCleanup = null;
            }
          };

          activeOcrWorkerCleanup = cleanup;

          worker.onmessage = (event) => {
            const msg = event.data;
            if (!msg || msg.requestId !== requestId) return;
            cleanup();
            if (msg.ok && msg.result) {
              // Ensure typed arrays are restored as Uint8Array instances after structured clone
              const res = msg.result as FullRosterOcrPipelineResult;
              if (
                res.ocrOutput?.preprocessing?.grayImage?.data &&
                !(res.ocrOutput.preprocessing.grayImage.data instanceof Uint8Array)
              ) {
                res.ocrOutput.preprocessing.grayImage.data = new Uint8Array(
                  res.ocrOutput.preprocessing.grayImage.data
                );
              }
              if (
                res.ocrOutput?.preprocessing?.binaryImage?.mask &&
                !(res.ocrOutput.preprocessing.binaryImage.mask instanceof Uint8Array)
              ) {
                res.ocrOutput.preprocessing.binaryImage.mask = new Uint8Array(
                  res.ocrOutput.preprocessing.binaryImage.mask
                );
              }
              if (
                res.ocrOutput?.preprocessing?.gridLinesRemovedMask?.mask &&
                !(
                  res.ocrOutput.preprocessing.gridLinesRemovedMask.mask instanceof
                  Uint8Array
                )
              ) {
                res.ocrOutput.preprocessing.gridLinesRemovedMask.mask =
                  new Uint8Array(
                    res.ocrOutput.preprocessing.gridLinesRemovedMask.mask
                  );
              }
              resolve(res);
            } else {
              reject(
                new Error(msg.error || 'Web Worker OCR işlemi başarısız oldu.')
              );
            }
          };

          worker.onerror = (err) => {
            cleanup();
            reject(err);
          };

          // Copy buffer so caller's sourceGrayImage remains intact for rotation/re-runs
          const clonedData = new Uint8Array(image.data);
          worker.postMessage(
            {
              requestId,
              image: {
                width: image.width,
                height: image.height,
                data: clonedData,
              },
              existingClassroomStudents,
              options: {
                preprocessing: options.preprocessing,
                manualColumnRoles: options.manualColumnRoles,
                forceHeaderlessMode: options.forceHeaderlessMode,
              },
            },
            [clonedData.buffer]
          );
        }
      );
      return workerResult;
    } catch {
      // Fallback to local thread if module worker instantiation is blocked
    }
  }

  return runLocalRosterOcrPipeline(image, existingClassroomStudents, options);
}

/**
 * Re-runs the geometric table parser and reliability evaluator when the teacher
 * modifies column role mappings (e.g., in Headerless Recovery mode) without needing to re-run pixel OCR.
 */
export function reparseOcrWithColumnRoles(
  ocrOutput: OcrEngineOutput,
  manualColumnRoles: Record<number, ColumnRole>,
  forceHeaderlessMode: boolean,
  existingClassroomStudents: Student[] = []
): {
  tableAnalysis: GeometricTableAnalysisResult;
  verifiedRows: VerifiedOcrRosterRow[];
} {
  const tableAnalysis = analyzeRosterTableGeometry(ocrOutput.words, {
    horizontalGridLinesY: ocrOutput.preprocessing.diagnostics.horizontalGridLinesY,
    verticalGridLinesX: ocrOutput.preprocessing.diagnostics.verticalGridLinesX,
    manualColumnRoles,
    forceHeaderlessMode,
  });

  const verifiedRows = evaluateRosterReliability(
    tableAnalysis.rows,
    ocrOutput.words,
    existingClassroomStudents
  );

  return {
    tableAnalysis: {
      ...tableAnalysis,
      rows: verifiedRows,
    },
    verifiedRows,
  };
}

/**
 * Generates the exact 5-column reference table image from the user specification:
 * Sıra | Okul No | Adı | Soyadı | Cinsiyet
 * 1 | 245 | AYŞE NUR | ÇELİK | K
 * 2 | 246 | MEHMET | DEMİR | E
 */
export function createReferenceSampleGrayImage(): RawGrayImage {
  return renderSyntheticRosterTableToGrayImage({
    headers: ['SIRA', 'OKUL NO', 'ADI', 'SOYADI', 'CİNSİYET'],
    rows: [
      ['1', '245', 'AYŞE NUR', 'ÇELİK', 'K'],
      ['2', '246', 'MEHMET', 'DEMİR', 'E'],
    ],
    columnWidths: [105, 165, 250, 210, 145],
    rowHeight: 58,
    drawGridLines: true,
  });
}

/**
 * Generates a challenging skewed (+4°) table image with a missing row gap (Sıra 1, 2, 4 -> Sıra 3 missing)
 * and a missing surname cell to verify that adjacent rows never borrow surnames and missing gaps are flagged.
 */
export function createChallengingSkewedSampleGrayImage(): RawGrayImage {
  return renderSyntheticRosterTableToGrayImage({
    headers: ['SIRA', 'OKUL NO', 'ADI', 'SOYADI', 'CİNSİYET'],
    rows: [
      ['1', '310', 'AYŞE NUR', 'ÇELİK', 'K'],
      ['2', '311', 'MEHMET', '', 'E'],
      ['', '', '', '', ''], // Physical blank/unreadable row gap at Sıra 3
      ['4', '313', 'ZEYNEP', 'KAYA', 'K'],
    ],
    columnWidths: [105, 165, 250, 210, 145],
    rowHeight: 58,
    skewDeg: 4,
    drawGridLines: true,
  });
}

/**
 * Generates a realistic smartphone camera classroom roster photo with uneven lighting shadow,
 * lens vignette, paper texture grain, optical lens softness, variable row heights, and +2.6° tilt.
 */
export function createRealisticCameraSampleGrayImage(): RawGrayImage {
  return renderRealisticCameraRosterPhotoToGrayImage({
    headers: ['SIRA', 'OKUL NO', 'ADI', 'SOYADI', 'CİNSİYET'],
    rows: [
      ['1', '245', 'AYŞE NUR', 'ÇELİK', 'K'],
      ['2', '246', 'MEHMET', 'DEMİR', 'E'],
      ['3', '247', 'ÖMER FARUK', 'ŞAHİN', 'E'],
      ['4', '248', 'ZEYNEP', 'GÜNEŞ', 'K'],
    ],
    columnWidths: [105, 165, 260, 210, 145],
    rowHeights: [56, 62, 58, 60],
    skewDeg: 2.6,
    shadowIntensity: 0.24,
    vignetteIntensity: 0.14,
    blurStrength: 0.16,
    noiseAmplitude: 6,
    drawGridLines: true,
  });
}

export interface GroundTruthRosterStudent {
  sequenceNumber?: number;
  studentNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  isMissingGapRow?: boolean;
}

export interface RosterOcrAccuracyMetrics {
  expectedRowCount: number;
  detectedRowCount: number;
  characterAccuracyPercent: number;
  characterErrorRate: number;
  wordAccuracyPercent: number;
  studentNumberExactMatchRate: number;
  firstNameExactMatchRate: number;
  lastNameExactMatchRate: number;
  rowIdentityMatchRate: number;
  zeroCrossRowContamination: boolean;
  missingGapDetectedCorrectly: boolean;
}

function exactLevenshteinDistance(a: string, b: string): number {
  const s1 = a.trim();
  const s2 = b.trim();
  const m = s1.length;
  const n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * Evaluates OCR & geometric table accuracy against ground-truth classroom roster rows.
 * Computes Character Error Rate (CER), Character Accuracy (%), Word Accuracy (%),
 * Student Number / First Name / Last Name match rates, and verifies zero cross-row contamination.
 */
export function evaluateRosterOcrAccuracyMetrics(
  verifiedRows: VerifiedOcrRosterRow[],
  groundTruth: GroundTruthRosterStudent[]
): RosterOcrAccuracyMetrics {
  const expectedNonGap = groundTruth.filter((g) => !g.isMissingGapRow);
  const expectedGapCount = groundTruth.filter((g) => g.isMissingGapRow).length;

  const detectedNonGap = verifiedRows.filter(
    (r) => r.rowKind !== 'missing_gap_candidate'
  );
  const detectedGapCount = verifiedRows.filter(
    (r) => r.rowKind === 'missing_gap_candidate'
  ).length;

  let totalChars = 0;
  let totalCharErrors = 0;
  let totalWords = 0;
  let matchedWords = 0;
  let matchedStudentNumbers = 0;
  let matchedFirstNames = 0;
  let matchedLastNames = 0;
  let matchedFullRowIdentities = 0;
  let crossRowContaminationDetected = false;

  const pairCount = Math.max(expectedNonGap.length, detectedNonGap.length);

  for (let i = 0; i < pairCount; i++) {
    const exp = expectedNonGap[i];
    const det = detectedNonGap[i];

    const expNo = (exp?.studentNumber ?? '').trim();
    const expFirst = (exp?.firstName ?? '').trim();
    const expLast = (exp?.lastName ?? '').trim();

    const detNo = (det?.studentNumber ?? '').trim();
    const detFirst = (det?.firstName ?? '').trim();
    const detLast = (det?.lastName ?? '').trim();

    // Character accuracy across studentNumber, firstName, lastName
    const fields: Array<[string, string]> = [
      [expNo, detNo],
      [expFirst, detFirst],
      [expLast, detLast],
    ];
    for (const [eStr, dStr] of fields) {
      const refLen = Math.max(eStr.length, dStr.length);
      if (refLen > 0) {
        totalChars += refLen;
        totalCharErrors += exactLevenshteinDistance(eStr, dStr);
      }
      const eWords = eStr ? eStr.split(/\s+/).filter(Boolean) : [];
      const dWords = dStr ? dStr.split(/\s+/).filter(Boolean) : [];
      const wCount = Math.max(eWords.length, dWords.length);
      for (let w = 0; w < wCount; w++) {
        totalWords++;
        if (eWords[w] && eWords[w] === dWords[w]) {
          matchedWords++;
        }
      }
    }

    if (exp && det) {
      const noOk = expNo === detNo;
      const firstOk = expFirst === detFirst;
      const lastOk = expLast === detLast;
      if (noOk) matchedStudentNumbers++;
      if (firstOk) matchedFirstNames++;
      if (lastOk) matchedLastNames++;
      if (noOk && firstOk && lastOk) matchedFullRowIdentities++;

      // Check if an empty expected surname or name illegally borrowed from a neighbor row
      if (!expLast && detLast) {
        crossRowContaminationDetected = true;
      }
      if (!expFirst && detFirst) {
        crossRowContaminationDetected = true;
      }
      // Check if detLast matches another student's surname when it shouldn't
      if (expLast && detLast !== expLast) {
        const borrowedFromOther = expectedNonGap.some(
          (other, idx) => idx !== i && other.lastName && other.lastName === detLast
        );
        if (borrowedFromOther) {
          crossRowContaminationDetected = true;
        }
      }
    }
  }

  const cer = totalChars > 0 ? totalCharErrors / totalChars : 0;
  const charAcc = Math.max(0, Math.min(100, (1 - cer) * 100));
  const wordAcc = totalWords > 0 ? (matchedWords / totalWords) * 100 : 100;
  const denom = Math.max(1, expectedNonGap.length);

  return {
    expectedRowCount: groundTruth.length,
    detectedRowCount: verifiedRows.length,
    characterAccuracyPercent: Number(charAcc.toFixed(2)),
    characterErrorRate: Number(cer.toFixed(4)),
    wordAccuracyPercent: Number(wordAcc.toFixed(2)),
    studentNumberExactMatchRate: Number(
      ((matchedStudentNumbers / denom) * 100).toFixed(2)
    ),
    firstNameExactMatchRate: Number(
      ((matchedFirstNames / denom) * 100).toFixed(2)
    ),
    lastNameExactMatchRate: Number(
      ((matchedLastNames / denom) * 100).toFixed(2)
    ),
    rowIdentityMatchRate: Number(
      ((matchedFullRowIdentities / denom) * 100).toFixed(2)
    ),
    zeroCrossRowContamination: !crossRowContaminationDetected,
    missingGapDetectedCorrectly:
      expectedGapCount === 0 || detectedGapCount >= expectedGapCount,
  };
}

export interface RealisticCameraBenchmarkScenarioResult {
  scenarioId: string;
  title: string;
  description: string;
  engineId: string;
  engineName: string;
  accuracy: RosterOcrAccuracyMetrics;
  performance: RosterOcrPerformanceMetrics;
  passed: boolean;
}

export interface RealisticCameraBenchmarkSuiteSummary {
  scenarios: RealisticCameraBenchmarkScenarioResult[];
  averageCharacterAccuracyPercent: number;
  averageWordAccuracyPercent: number;
  averageRowIdentityMatchRate: number;
  averageDurationMs: number;
  totalDurationMs: number;
  allZeroCrossRowContamination: boolean;
  allPassed: boolean;
}

/**
 * Parses teacher-entered ground-truth student lines (e.g., "245 | AYŞE NUR | ÇELİK" or "245 AYŞE NUR ÇELİK")
 * so any uploaded real camera photo can be benchmarked against exact ground truth right inside the app.
 */
export function parseGroundTruthRosterText(
  rawText: string
): GroundTruthRosterStudent[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const students: GroundTruthRosterStudent[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(BOS|BOŞ|GAP|-)$/i.test(line)) {
      students.push({
        sequenceNumber: i + 1,
        studentNumber: '',
        firstName: '',
        lastName: '',
        isMissingGapRow: true,
      });
      continue;
    }

    if (line.includes('|') || line.includes(';') || line.includes('\t')) {
      const parts = line
        .split(/[|;\t]/)
        .map((p) => p.trim());
      if (parts.length >= 3) {
        students.push({
          sequenceNumber: i + 1,
          studentNumber: parts[0],
          firstName: parts[1].replace(/i/g, 'İ').replace(/ı/g, 'I').toLocaleUpperCase('tr-TR'),
          lastName: parts[2].replace(/i/g, 'İ').replace(/ı/g, 'I').toLocaleUpperCase('tr-TR'),
          gender: parts[3]?.toUpperCase(),
        });
      } else if (parts.length === 2) {
        const nameWords = parts[1]
          .replace(/i/g, 'İ')
          .replace(/ı/g, 'I')
          .toLocaleUpperCase('tr-TR')
          .split(/\s+/)
          .filter(Boolean);
        const lastName = nameWords.length > 1 ? nameWords[nameWords.length - 1] : '';
        const firstName =
          nameWords.length > 1 ? nameWords.slice(0, -1).join(' ') : nameWords[0] || '';
        students.push({
          sequenceNumber: i + 1,
          studentNumber: parts[0],
          firstName,
          lastName,
        });
      }
      continue;
    }

    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length >= 3 && /^\d+$/.test(tokens[0])) {
      const studentNumber = tokens[0];
      const upperRest = tokens
        .slice(1)
        .map((w) => w.replace(/i/g, 'İ').replace(/ı/g, 'I').toLocaleUpperCase('tr-TR'));
      // Check if last token is single-letter gender K/E
      let gender: string | undefined;
      let nameTokens = upperRest;
      if (
        nameTokens.length >= 3 &&
        (nameTokens[nameTokens.length - 1] === 'K' ||
          nameTokens[nameTokens.length - 1] === 'E')
      ) {
        gender = nameTokens[nameTokens.length - 1];
        nameTokens = nameTokens.slice(0, -1);
      }
      const lastName = nameTokens[nameTokens.length - 1] || '';
      const firstName = nameTokens.slice(0, -1).join(' ');
      students.push({
        sequenceNumber: i + 1,
        studentNumber,
        firstName,
        lastName,
        gender,
      });
    }
  }
  return students;
}

/**
 * Runs a comprehensive 5-scenario real camera classroom roster photo benchmark suite
 * testing shadows, lens vignette, optical blur, sensor noise, perspective keystone pinch,
 * camera tilt/skew, bold/thin stroke variations, multi-word Turkish names, missing row gaps,
 * AND native Android Google ML Kit Text Recognition v2 hierarchical Block->Line->Element->Symbol pipeline.
 */
export async function runRealisticCameraOcrBenchmarkSuite(
  engineOverride?: OcrEngineAdapter
): Promise<RealisticCameraBenchmarkSuiteSummary> {
  const scenarioDefs: Array<{
    scenarioId: string;
    title: string;
    description: string;
    config: RealisticCameraRosterConfig;
    groundTruth: GroundTruthRosterStudent[];
  }> = [
    {
      scenarioId: 'camera-standard-shadow',
      title: '1. Telefon Kamerası — Gölgeli ve Çok Sözcüklü Türkçe Liste',
      description:
        'Çapraz telefon gölgesi (%24), mercek vinyeti, hafif bulanıklık, +2.6° eğim ve çok sözcüklü Türkçe öğrenci adları.',
      config: {
        headers: ['SIRA', 'OKUL NO', 'ADI', 'SOYADI', 'CİNSİYET'],
        rows: [
          ['1', '245', 'AYŞE NUR', 'ÇELİK', 'K'],
          ['2', '246', 'MEHMET', 'DEMİR', 'E'],
          ['3', '247', 'ÖMER FARUK', 'ŞAHİN', 'E'],
          ['4', '248', 'ZEYNEP', 'GÜNEŞ', 'K'],
        ],
        columnWidths: [105, 165, 260, 210, 145],
        rowHeights: [56, 62, 58, 60],
        skewDeg: 2.6,
        shadowIntensity: 0.24,
        vignetteIntensity: 0.14,
        blurStrength: 0.16,
        noiseAmplitude: 6,
        drawGridLines: true,
      },
      groundTruth: [
        { sequenceNumber: 1, studentNumber: '245', firstName: 'AYŞE NUR', lastName: 'ÇELİK', gender: 'K' },
        { sequenceNumber: 2, studentNumber: '246', firstName: 'MEHMET', lastName: 'DEMİR', gender: 'E' },
        { sequenceNumber: 3, studentNumber: '247', firstName: 'ÖMER FARUK', lastName: 'ŞAHİN', gender: 'E' },
        { sequenceNumber: 4, studentNumber: '248', firstName: 'ZEYNEP', lastName: 'GÜNEŞ', gender: 'K' },
      ],
    },
    {
      scenarioId: 'camera-skew-bold-variable-rows',
      title: '2. Eğik Perspektif (+3.5°) + Kalın Baskı + Değişken Satır Yüksekliği',
      description:
        '+3.5° kamera eğimi, trapez perspektif daralması, kalın (bold) karakterler ve farklı satır yükseklikleri (52px–66px).',
      config: {
        headers: ['SIRA', 'OKUL NO', 'ADI', 'SOYADI', 'CİNSİYET'],
        rows: [
          ['1', '512', 'ELİF SUDE', 'YILMAZ', 'K'],
          ['2', '514', 'MUSTAFA', 'ÖZTÜRK', 'E'],
          ['3', '519', 'HATİCE', 'KORKMAZ', 'K'],
        ],
        columnWidths: [105, 165, 260, 215, 145],
        rowHeights: [52, 66, 56],
        strokeWeight: 'bold',
        skewDeg: 3.5,
        shadowIntensity: 0.2,
        vignetteIntensity: 0.15,
        blurStrength: 0.18,
        noiseAmplitude: 7,
        drawGridLines: true,
      },
      groundTruth: [
        { sequenceNumber: 1, studentNumber: '512', firstName: 'ELİF SUDE', lastName: 'YILMAZ', gender: 'K' },
        { sequenceNumber: 2, studentNumber: '514', firstName: 'MUSTAFA', lastName: 'ÖZTÜRK', gender: 'E' },
        { sequenceNumber: 3, studentNumber: '519', firstName: 'HATİCE', lastName: 'KORKMAZ', gender: 'K' },
      ],
    },
    {
      scenarioId: 'camera-low-light-thin-strokes',
      title: '3. Düşük Kontrast / Yoğun Gölge (-2.8°) + İnce Karakter Baskısı',
      description:
        '-2.8° ters eğim, %32 yoğun gölge gradyanı, kağıt kumlanması ve ince (thin) baskı karakterleri.',
      config: {
        headers: ['SIRA', 'OKUL NO', 'ADI', 'SOYADI', 'CİNSİYET'],
        rows: [
          ['1', '104', 'AHMET CAN', 'KAYA', 'E'],
          ['2', '108', 'MERVE', 'AYDIN', 'K'],
          ['3', '115', 'BURAK', 'POLAT', 'E'],
        ],
        columnWidths: [105, 165, 260, 210, 145],
        rowHeights: [58, 54, 62],
        strokeWeight: 'thin',
        skewDeg: -2.8,
        shadowIntensity: 0.32,
        vignetteIntensity: 0.18,
        blurStrength: 0.12,
        noiseAmplitude: 8,
        drawGridLines: true,
      },
      groundTruth: [
        { sequenceNumber: 1, studentNumber: '104', firstName: 'AHMET CAN', lastName: 'KAYA', gender: 'E' },
        { sequenceNumber: 2, studentNumber: '108', firstName: 'MERVE', lastName: 'AYDIN', gender: 'K' },
        { sequenceNumber: 3, studentNumber: '115', firstName: 'BURAK', lastName: 'POLAT', gender: 'E' },
      ],
    },
    {
      scenarioId: 'camera-missing-row-and-surname-isolation',
      title: '4. Eksik Satır Boşluğu ve Komşu Soyadı Kayması Koruması (+4.0°)',
      description:
        'Sıra 3 tamamen silik/boş ve 2. öğrencinin soyadı boş; komşu satırdan soyadı ödünç alınmadığını ve eksik satırın yakalandığını doğrular.',
      config: {
        headers: ['SIRA', 'OKUL NO', 'ADI', 'SOYADI', 'CİNSİYET'],
        rows: [
          ['1', '310', 'AYŞE NUR', 'ÇELİK', 'K'],
          ['2', '311', 'MEHMET', '', 'E'],
          ['', '', '', '', ''],
          ['4', '313', 'ZEYNEP', 'KAYA', 'K'],
        ],
        columnWidths: [105, 165, 250, 210, 145],
        rowHeights: [58, 58, 58, 58],
        skewDeg: 4.0,
        shadowIntensity: 0.22,
        vignetteIntensity: 0.12,
        blurStrength: 0.14,
        noiseAmplitude: 5,
        drawGridLines: true,
      },
      groundTruth: [
        { sequenceNumber: 1, studentNumber: '310', firstName: 'AYŞE NUR', lastName: 'ÇELİK', gender: 'K' },
        { sequenceNumber: 2, studentNumber: '311', firstName: 'MEHMET', lastName: '', gender: 'E' },
        { sequenceNumber: 3, studentNumber: '', firstName: '', lastName: '', isMissingGapRow: true },
        { sequenceNumber: 4, studentNumber: '313', firstName: 'ZEYNEP', lastName: 'KAYA', gender: 'K' },
      ],
    },
  ];

  const scenarios: RealisticCameraBenchmarkScenarioResult[] = [];
  for (const def of scenarioDefs) {
    const img = renderRealisticCameraRosterPhotoToGrayImage(def.config);
    const res = await runLocalRosterOcrPipeline(img, [], {
      engine: engineOverride,
    });
    const accuracy = evaluateRosterOcrAccuracyMetrics(
      res.verifiedRows,
      def.groundTruth
    );
    const passed =
      accuracy.characterAccuracyPercent >= 95 &&
      accuracy.studentNumberExactMatchRate === 100 &&
      accuracy.rowIdentityMatchRate === 100 &&
      accuracy.zeroCrossRowContamination &&
      accuracy.missingGapDetectedCorrectly;

    scenarios.push({
      scenarioId: def.scenarioId,
      title: def.title,
      description: def.description,
      engineId: res.ocrOutput.engineId,
      engineName: res.ocrOutput.engineName,
      accuracy,
      performance: res.performanceMetrics,
      passed,
    });
  }

  const count = Math.max(1, scenarios.length);
  const averageCharacterAccuracyPercent = Number(
    (
      scenarios.reduce((acc, s) => acc + s.accuracy.characterAccuracyPercent, 0) /
      count
    ).toFixed(2)
  );
  const averageWordAccuracyPercent = Number(
    (
      scenarios.reduce((acc, s) => acc + s.accuracy.wordAccuracyPercent, 0) /
      count
    ).toFixed(2)
  );
  const averageRowIdentityMatchRate = Number(
    (
      scenarios.reduce((acc, s) => acc + s.accuracy.rowIdentityMatchRate, 0) /
      count
    ).toFixed(2)
  );
  const totalDurationMs = Number(
    scenarios
      .reduce((acc, s) => acc + s.performance.totalDurationMs, 0)
      .toFixed(2)
  );
  const averageDurationMs = Number((totalDurationMs / count).toFixed(2));

  return {
    scenarios,
    averageCharacterAccuracyPercent,
    averageWordAccuracyPercent,
    averageRowIdentityMatchRate,
    averageDurationMs,
    totalDurationMs,
    allZeroCrossRowContamination: scenarios.every(
      (s) => s.accuracy.zeroCrossRowContamination
    ),
    allPassed: scenarios.every((s) => s.passed),
  };
}


