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
  renderSyntheticRosterTableToGrayImage,
} from './localOcrEngine.ts';
import { analyzeRosterTableGeometry } from './geometricTableParser.ts';
import {
  evaluateRosterReliability,
  runTargetedCellReReads,
} from './rosterReliability.ts';

export interface FullRosterOcrPipelineResult {
  ocrOutput: OcrEngineOutput;
  tableAnalysis: GeometricTableAnalysisResult;
  verifiedRows: VerifiedOcrRosterRow[];
}

/**
 * Runs the complete 100% local, zero-network OCR & geometric table analysis pipeline:
 * 1. Image Preprocessing (orientation, perspective homography, upscaling, deskewing, Sauvola thresholding, grid removal)
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

  const ocrOutput = await engine.recognizeImage(image, {
    language: 'tur',
    preprocessing: options.preprocessing,
  });

  const tableAnalysis = analyzeRosterTableGeometry(ocrOutput.words, {
    horizontalGridLinesY: ocrOutput.preprocessing.diagnostics.horizontalGridLinesY,
    verticalGridLinesX: ocrOutput.preprocessing.diagnostics.verticalGridLinesX,
    manualColumnRoles: options.manualColumnRoles,
    forceHeaderlessMode: options.forceHeaderlessMode,
  });

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

  return {
    ocrOutput,
    tableAnalysis: {
      ...tableAnalysis,
      rows: verifiedRows,
    },
    verifiedRows,
  };
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
