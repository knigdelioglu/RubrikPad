export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface RawGrayImage {
  width: number;
  height: number;
  /** Grayscale intensity 0..255 (0 = black ink, 255 = white background) */
  data: Uint8Array;
}

export interface RawBinaryImage {
  width: number;
  height: number;
  /** Binary foreground mask (1 = ink foreground, 0 = paper background) */
  mask: Uint8Array;
}

export interface OcrWordAlternative {
  text: string;
  confidence: number;
  reason?: string;
}

export interface OcrWordToken {
  id: string;
  text: string;
  confidence: number; // 0..100
  bbox: BoundingBox;
  cornerPoints?: Point2D[];
  baselineY?: number;
  skewDeg?: number;
  blockIndex?: number;
  lineIndex?: number;
  elementIndex?: number;
  symbolConfidences?: number[];
  alternatives?: OcrWordAlternative[];
}

export interface PreprocessingOptions {
  manualRotationDeg?: 0 | 90 | 180 | 270;
  autoOrient?: boolean;
  autoDeskew?: boolean;
  perspectiveCorners?: [Point2D, Point2D, Point2D, Point2D]; // TL, TR, BR, BL
  targetMinWidth?: number;
  targetMaxDimension?: number;
  removeGridLines?: boolean;
}

export interface PreprocessingResult {
  grayImage: RawGrayImage;
  binaryImage: RawBinaryImage;
  gridLinesRemovedMask: RawBinaryImage;
  diagnostics: {
    originalWidth: number;
    originalHeight: number;
    processedWidth: number;
    processedHeight: number;
    appliedRotationDeg: 0 | 90 | 180 | 270;
    detectedSkewDeg: number;
    perspectiveRectified: boolean;
    upscaleFactor: number;
    downscaleFactor?: number;
    contrastScore: number;
    horizontalGridLinesY: number[];
    verticalGridLinesX: number[];
    qualityWarnings: string[];
  };
}

export type ColumnRole =
  | 'sequence'
  | 'studentNumber'
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'gender'
  | 'auxiliary'
  | 'ignore';

export interface DetectedColumnBand {
  columnIndex: number;
  role: ColumnRole;
  headerText: string;
  x0: number;
  x1: number;
  centerX: number;
  /** Horizontal drift per vertical pixel (dx/dy) to handle tilted/narrowing columns */
  driftSlopeXPerY: number;
  inferredWithoutHeader: boolean;
  confidence: number;
}

export interface OcrCellCoordinateMap {
  sequence?: BoundingBox;
  studentNumber?: BoundingBox;
  firstName?: BoundingBox;
  lastName?: BoundingBox;
  gender?: BoundingBox;
}

export type UncertaintyCode =
  | 'MISSING_STUDENT_NUMBER'
  | 'MISSING_FIRST_NAME'
  | 'MISSING_LAST_NAME'
  | 'MISSING_ROW_GAP'
  | 'SEQUENCE_GAP'
  | 'LOW_CONFIDENCE_OCR'
  | 'CONFLICTING_ALTERNATIVES'
  | 'SUSPICIOUS_ROW_ALIGNMENT'
  | 'COLUMN_BOUNDARY_OVERLAP'
  | 'DUPLICATE_STUDENT_NUMBER'
  | 'DUPLICATE_PHYSICAL_ROW'
  | 'SIMILAR_STUDENT_NAME'
  | 'HEADERLESS_COLUMN_INFERRED'
  | 'COMBINED_NAME_SPLIT';

export interface OcrFieldSuggestion {
  id: string;
  field: 'studentNumber' | 'firstName' | 'lastName';
  currentText: string;
  suggestedText: string;
  reason: string;
  confidence: number;
  source:
    | 'alternative_reading'
    | 'local_reread'
    | 'diacritic_repair'
    | 'digit_letter_disambiguation';
}

export interface VerifiedOcrRosterRow {
  rowId: string;
  /** Unique identifier of the physical table row on the image; prevents duplicate students from the same row */
  physicalRowId: string;
  rowIndex: number;
  rowKind: 'extracted' | 'missing_gap_candidate' | 'manual_addition';
  sequenceNumber: number | null;
  studentNumber: string;
  firstName: string;
  lastName: string;
  gender: string;
  fullName: string;
  rowBbox: BoundingBox;
  cellBboxes: OcrCellCoordinateMap;
  sourceTokenIds: string[];
  /** Raw token texts per cell before any teacher edit */
  rawCells: {
    sequence: string;
    studentNumber: string;
    firstName: string;
    lastName: string;
    gender: string;
  };
  confidence: number;
  reliabilityLevel: 'high' | 'review_required' | 'invalid';
  uncertaintyFlags: UncertaintyCode[];
  uncertaintyReasons: string[];
  validationErrors: string[];
  suggestions: OcrFieldSuggestion[];
  approvedByTeacher: boolean;
  /** Signature of `studentNumber|firstName|lastName` at the moment of teacher approval */
  approvedSignature: string;
  reReadAttempted?: boolean;
}

export interface SurnameOrderAlignmentPair {
  rowIndex: number;
  rowAnchorY: number;
  surnameTokenId: string;
  surnameText: string;
  surnameCorrectedY: number;
  verticalCostPx: number;
}

export interface GeometricTableAnalysisResult {
  headerDetected: boolean;
  headerRowYBand: { y0: number; y1: number } | null;
  headerlessRecoveryRequired: boolean;
  estimatedRowSlantDeg: number;
  columns: DetectedColumnBand[];
  rows: VerifiedOcrRosterRow[];
  unassignedTokens: OcrWordToken[];
  medianRowHeight: number;
  medianRowStepY: number;
  surnameOrderAlignmentApplied?: boolean;
  surnameOrderAlignmentPairs?: SurnameOrderAlignmentPair[];
}

export interface OcrEngineOptions {
  language?: 'tur';
  preprocessing?: PreprocessingOptions;
}

export interface OcrEngineOutput {
  engineId: string;
  engineName: string;
  requestedEngineId?: string;
  requestedEngineName?: string;
  fallbackOccurred?: boolean;
  fallbackReason?: string;
  isLocalOnly: true;
  words: OcrWordToken[];
  preprocessing: PreprocessingResult;
}

export interface OcrCellReReadOutput {
  text: string;
  confidence: number;
  alternatives: OcrWordAlternative[];
}

export interface OcrEngineAdapter {
  readonly engineId: string;
  readonly engineName: string;
  readonly isLocalOnly: true;
  recognizeImage(
    image: RawGrayImage,
    options?: OcrEngineOptions
  ): Promise<OcrEngineOutput>;
  recognizeCellRegion?(
    image: RawGrayImage,
    bbox: BoundingBox,
    roleHint: ColumnRole
  ): Promise<OcrCellReReadOutput>;
}
