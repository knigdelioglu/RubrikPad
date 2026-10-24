import type {
  BoundingBox,
  ColumnRole,
  DetectedColumnBand,
  GeometricTableAnalysisResult,
  OcrCellCoordinateMap,
  OcrWordToken,
  SurnameOrderAlignmentPair,
  UncertaintyCode,
  VerifiedOcrRosterRow,
} from './ocrTypes.ts';
import { splitTurkishFullName } from '../rubricLogic.ts';

export interface SurnameCandidateBlock {
  candidateIndex: number;
  tokens: OcrWordToken[];
  text: string;
  bbox: BoundingBox;
  correctedY: number;
  rawCenterY: number;
  lineIndex?: number;
  blockIndex?: number;
}

export interface AnchorRowSurnameTarget {
  rowIndex: number;
  anchorCorrectedY: number;
  anchorRawY: number;
  lineIndex?: number;
  blockIndex?: number;
}

export interface OrderPreservingSurnameMatchResult {
  matchedByRowIndex: Map<number, SurnameCandidateBlock>;
  unmatchedCandidates: SurnameCandidateBlock[];
  alignmentPairs: SurnameOrderAlignmentPair[];
  estimatedColumnVerticalOffsetPx: number;
  alignmentApplied: boolean;
}

export interface GeometricTableParseOptions {
  horizontalGridLinesY?: number[];
  verticalGridLinesX?: number[];
  manualColumnRoles?: Record<number, ColumnRole>;
  forceHeaderlessMode?: boolean;
}

/**
 * Normalizes Turkish text for header keyword matching (handles İ/I/i/ı, Ş/S, Ç/C, Ğ/G, Ö/O, Ü/U).
 */
export function normalizeHeaderKeyword(raw: string): string {
  return raw
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ç/g, 'C')
    .replace(/Ğ/g, 'G')
    .replace(/Ö/g, 'O')
    .replace(/Ü/g, 'U')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTurkishGenderToken(raw: string): boolean {
  const norm = normalizeHeaderKeyword(raw);
  return (
    norm === 'K' ||
    norm === 'E' ||
    norm === 'KIZ' ||
    norm === 'ERKEK' ||
    norm === 'KADIN' ||
    norm === 'BAY' ||
    norm === 'BAYAN'
  );
}

export function isTurkishRosterStatusOrBoardingToken(raw: string): boolean {
  const trimmed = raw.trim();
  if (/^(yat\.|günd\.|gund\.|pan\.|örg\.|org\.)$/i.test(trimmed)) {
    return true;
  }
  const norm = normalizeHeaderKeyword(trimmed);
  if (!norm) return false;
  return (
    norm === 'YAT' ||
    norm === 'YATILI' ||
    norm === 'YATILILIK' ||
    norm === 'GUND' ||
    norm === 'GUNDUZLU' ||
    norm === 'PARALI' ||
    norm === 'PARASIZ' ||
    norm === 'PARALI YATILI' ||
    norm === 'PARASIZ YATILI' ||
    norm === 'PANSIYON' ||
    norm === 'PANSIYONLU' ||
    norm === 'BURSLU' ||
    norm === 'ORGUN' ||
    norm === 'KAYITLI' ||
    norm === 'DEVAMLI' ||
    norm === 'DEVAMSIZ' ||
    norm === 'MISAFIR' ||
    norm === 'NAKIL' ||
    norm === 'IOO'
  );
}

export function cleanNumericTokenText(raw: string): string {
  return raw
    .trim()
    .replace(/^[.#(\[]+|[.):\-\]]+$/g, '')
    .trim();
}

export function isNumericTokenText(raw: string): boolean {
  const cleaned = cleanNumericTokenText(raw);
  return /^\d{1,6}$/.test(cleaned);
}

export function classifyHeaderRole(text: string): ColumnRole | null {
  const norm = normalizeHeaderKeyword(text);
  if (!norm) return null;

  if (
    norm === 'SIRA' ||
    norm === 'SIRA NO' ||
    norm === 'SIRANO' ||
    norm === 'SNO' ||
    norm === 'S NO' ||
    norm === 'SN'
  ) {
    return 'sequence';
  }
  if (
    norm === 'OKUL NO' ||
    norm === 'OKUL NUMARASI' ||
    norm === 'OGRENCI NO' ||
    norm === 'OGRENCI NUMARASI' ||
    norm === 'NO' ||
    norm === 'NUMARA' ||
    norm === 'NUMARASI' ||
    norm === 'OKULNO' ||
    norm === 'OGRENCINO'
  ) {
    return 'studentNumber';
  }
  if (
    norm === 'ADI SOYADI' ||
    norm === 'AD SOYAD' ||
    norm === 'ISIM SOYISIM' ||
    norm === 'OGRENCI ADI SOYADI'
  ) {
    return 'fullName';
  }
  if (
    norm === 'SOYADI' ||
    norm === 'SOYAD' ||
    norm === 'SOYISIM' ||
    norm === 'SOYADLAR'
  ) {
    return 'lastName';
  }
  if (
    norm === 'ADI' ||
    norm === 'AD' ||
    norm === 'ISIM' ||
    norm === 'OGRENCI ADI'
  ) {
    return 'firstName';
  }
  if (
    norm === 'CINSIYET' ||
    norm === 'CINSIYETI' ||
    norm === 'CINS' ||
    norm.startsWith('CINS') ||
    norm === 'KE'
  ) {
    return 'gender';
  }
  if (
    norm === 'SINIF' ||
    norm === 'SINIFI' ||
    norm === 'SUBE' ||
    norm === 'SUBESI' ||
    norm === 'IMZA' ||
    norm === 'ACIKLAMA' ||
    norm === 'NOT' ||
    norm === 'DURUM' ||
    norm === 'DURUMU' ||
    norm === 'PANSIYON' ||
    norm === 'PANSIYON DURUMU' ||
    norm === 'YATILILIK' ||
    norm === 'YATILILIK DURUMU' ||
    norm === 'YATILI' ||
    norm === 'DEVAM' ||
    norm === 'DEVAM DURUMU' ||
    norm === 'OGRENIM' ||
    norm === 'OGRENIM SEKLI'
  ) {
    return 'auxiliary';
  }
  return null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function unionBbox(boxes: BoundingBox[]): BoundingBox {
  if (boxes.length === 0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    if (b.x0 < x0) x0 = b.x0;
    if (b.y0 < y0) y0 = b.y0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y1 > y1) y1 = b.y1;
  }
  return { x0, y0, x1, y1 };
}

/**
 * Estimates residual horizontal row slant (dy/dx) from horizontally adjacent word tokens
 * so tilted or perspectively slanted rows do not shift right-hand columns (Soyadı/Cinsiyet) into neighbor rows.
 */
export function estimateResidualRowSlant(
  words: OcrWordToken[],
  medianWordH: number
): { slopeDyDx: number; angleDeg: number; refX: number } {
  if (words.length < 2) return { slopeDyDx: 0, angleDeg: 0, refX: 0 };

  const refX = median(words.map((w) => (w.bbox.x0 + w.bbox.x1) / 2));
  const slopes: number[] = [];

  const sortedByX = [...words].sort(
    (a, b) => (a.bbox.x0 + a.bbox.x1) / 2 - (b.bbox.x0 + b.bbox.x1) / 2
  );

  for (let i = 0; i < sortedByX.length; i++) {
    const a = sortedByX[i];
    const ax = (a.bbox.x0 + a.bbox.x1) / 2;
    const ay = (a.bbox.y0 + a.bbox.y1) / 2;

    for (let j = i + 1; j < sortedByX.length; j++) {
      const b = sortedByX[j];
      const bx = (b.bbox.x0 + b.bbox.x1) / 2;
      const by = (b.bbox.y0 + b.bbox.y1) / 2;
      const dx = bx - ax;
      const dy = by - ay;
      if (dx >= 45 && dx <= 480 && Math.abs(dy) <= medianWordH * 1.15) {
        slopes.push(dy / dx);
      }
    }
  }

  if (slopes.length < 2) {
    return { slopeDyDx: 0, angleDeg: 0, refX };
  }

  const medSlope = median(slopes);
  const clampedSlope = Math.max(-0.28, Math.min(0.28, medSlope));
  const angleDeg = Number(((Math.atan(clampedSlope) * 180) / Math.PI).toFixed(2));
  return { slopeDyDx: clampedSlope, angleDeg, refX };
}

interface InternalTokenWithCorrectedY {
  token: OcrWordToken;
  cx: number;
  cy: number;
  correctedY: number;
  width: number;
  height: number;
}

interface PhysicalRowCluster {
  clusterIndex: number;
  items: InternalTokenWithCorrectedY[];
  meanCorrectedY: number;
  minY: number;
  maxY: number;
}

/**
 * Groups tokens into physical horizontal rows using slant-corrected Y centers, horizontal grid lines,
 * vertical bounding-box overlap ratio, and native ML Kit line indices so adjacent students never merge into a single row.
 */
function clusterTokensIntoPhysicalRows(
  items: InternalTokenWithCorrectedY[],
  medianH: number,
  horizontalGridLinesY: number[] = []
): PhysicalRowCluster[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.correctedY - b.correctedY);
  const maxRowDeltaY = Math.max(7, medianH * 0.56);

  const sortedHorizLines = [...horizontalGridLinesY].sort((a, b) => a - b);
  const hasGridDividerBetween = (yA: number, yB: number): boolean => {
    const lo = Math.min(yA, yB) + 2;
    const hi = Math.max(yA, yB) - 2;
    if (hi <= lo) return false;
    return sortedHorizLines.some((gy) => gy >= lo && gy <= hi);
  };

  const rawClusters: InternalTokenWithCorrectedY[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const currentCluster = rawClusters[rawClusters.length - 1];
    const clusterMeanCorrY =
      currentCluster.reduce((acc, it) => acc + it.correctedY, 0) /
      currentCluster.length;
    const clusterMeanRawY =
      currentCluster.reduce((acc, it) => acc + it.cy, 0) /
      currentCluster.length;

    const separatedByGridLine = hasGridDividerBetween(clusterMeanRawY, item.cy);
    const verticalDist = Math.abs(item.correctedY - clusterMeanCorrY);

    // Check if an existing token in currentCluster occupies the same horizontal X column span (which means item is on the next physical row!)
    const overlapsHorizontallyWithSameColumnToken = currentCluster.some(
      (existing) => {
        const xOverlap =
          Math.min(existing.token.bbox.x1, item.token.bbox.x1) -
          Math.max(existing.token.bbox.x0, item.token.bbox.x0);
        const minW = Math.min(existing.width, item.width);
        const yGap = Math.abs(item.correctedY - existing.correctedY);
        const differentMlKitLine =
          existing.token.blockIndex !== undefined &&
          item.token.blockIndex !== undefined &&
          existing.token.blockIndex === item.token.blockIndex &&
          existing.token.lineIndex !== undefined &&
          item.token.lineIndex !== undefined &&
          existing.token.lineIndex !== item.token.lineIndex;
        return (
          xOverlap >= Math.max(4, minW * 0.35) &&
          (yGap >= medianH * 0.38 || differentMlKitLine)
        );
      }
    );

    if (
      !separatedByGridLine &&
      !overlapsHorizontallyWithSameColumnToken &&
      verticalDist <= maxRowDeltaY
    ) {
      currentCluster.push(item);
    } else {
      rawClusters.push([item]);
    }
  }

  return rawClusters.map((clusterItems, idx) => {
    const sortedLeftToRight = [...clusterItems].sort((a, b) => a.cx - b.cx);
    const meanCorrectedY =
      sortedLeftToRight.reduce((acc, it) => acc + it.correctedY, 0) /
      sortedLeftToRight.length;
    const minY = Math.min(...sortedLeftToRight.map((it) => it.token.bbox.y0));
    const maxY = Math.max(...sortedLeftToRight.map((it) => it.token.bbox.y1));
    return {
      clusterIndex: idx,
      items: sortedLeftToRight,
      meanCorrectedY,
      minY,
      maxY,
    };
  });
}

/**
 * Merges multi-word header phrases in the header row (e.g. "OKUL" + "NO" -> "OKUL NO", "ADI" + "SOYADI" -> "ADI SOYADI").
 */
function buildHeaderCellsFromRow(
  headerRow: PhysicalRowCluster,
  verticalGridLinesX: number[]
): { text: string; role: ColumnRole; bbox: BoundingBox; centerX: number }[] {
  const sorted = [...headerRow.items].sort((a, b) => a.cx - b.cx);
  const mergedCells: { tokens: OcrWordToken[]; text: string }[] = [];

  const hasVertLineBetween = (xA: number, xB: number): boolean => {
    const lo = Math.min(xA, xB) + 2;
    const hi = Math.max(xA, xB) - 2;
    return verticalGridLinesX.some((vx) => vx >= lo && vx <= hi);
  };

  let i = 0;
  while (i < sorted.length) {
    const cur = sorted[i];
    const next = i + 1 < sorted.length ? sorted[i + 1] : null;
    if (next && !hasVertLineBetween(cur.token.bbox.x1, next.token.bbox.x0)) {
      const combinedText = `${cur.token.text} ${next.token.text}`;
      const combinedRole = classifyHeaderRole(combinedText);
      const gap = next.token.bbox.x0 - cur.token.bbox.x1;
      if (combinedRole && gap <= Math.max(48, cur.height * 2.2)) {
        mergedCells.push({
          tokens: [cur.token, next.token],
          text: combinedText,
        });
        i += 2;
        continue;
      }
    }
    mergedCells.push({
      tokens: [cur.token],
      text: cur.token.text,
    });
    i += 1;
  }

  return mergedCells.map((cell) => {
    const bbox = unionBbox(cell.tokens.map((t) => t.bbox));
    const role = classifyHeaderRole(cell.text) ?? 'auxiliary';
    return {
      text: cell.text,
      role,
      bbox,
      centerX: (bbox.x0 + bbox.x1) / 2,
    };
  });
}

/**
 * Detects whether a row cluster is an e-Okul / MEB page banner, title, or signature footer
 * rather than a table header or student row.
 */
function isNonStudentBannerOrFooterRow(cluster: PhysicalRowCluster): boolean {
  const joinedNorm = normalizeHeaderKeyword(
    cluster.items.map((it) => it.token.text).join(' ')
  );
  if (!joinedNorm) return true;

  if (
    joinedNorm.includes('BAKANLIGI') ||
    joinedNorm.includes('MUDURLUGU') ||
    joinedNorm.includes('VALILIGI') ||
    joinedNorm.includes('KAYMAKAMLIGI') ||
    joinedNorm.includes('EGITIM OGRETIM') ||
    joinedNorm.includes('SINIF LISTESI') ||
    joinedNorm.includes('OGRENCI LISTESI') ||
    joinedNorm.includes('PUAN LISTESI') ||
    joinedNorm.includes('OKUL MUDURU') ||
    joinedNorm.includes('MUDUR YARDIMCISI') ||
    joinedNorm.includes('SINIF OGRETMENI') ||
    joinedNorm.includes('TOPLAM OGRENCI') ||
    /^T\s*C(\s|$)/.test(joinedNorm) ||
    /^SAYFA\s*\d+/.test(joinedNorm)
  ) {
    return true;
  }
  return false;
}

/**
 * Evaluates how strongly a row cluster matches a table header row.
 * Requires at least 2 recognized column headers AND at least 1 core student identity header
 * (sequence, studentNumber, firstName, lastName, fullName), and rejects page title banners.
 */
function scoreClusterAsHeaderRow(cluster: PhysicalRowCluster): number {
  if (isNonStudentBannerOrFooterRow(cluster)) {
    return 0;
  }

  let recognizedHeaderMatches = 0;
  let coreIdentityMatches = 0;
  const texts = cluster.items.map((it) => it.token.text);

  let i = 0;
  while (i < texts.length) {
    const combinedRole =
      i + 1 < texts.length
        ? classifyHeaderRole(`${texts[i]} ${texts[i + 1]}`)
        : null;
    const singleRole = classifyHeaderRole(texts[i]);
    const role = combinedRole ?? singleRole;

    if (role) {
      recognizedHeaderMatches++;
      if (
        role === 'sequence' ||
        role === 'studentNumber' ||
        role === 'firstName' ||
        role === 'lastName' ||
        role === 'fullName'
      ) {
        coreIdentityMatches++;
      }
      i += combinedRole ? 2 : 1;
    } else {
      i += 1;
    }
  }

  if (recognizedHeaderMatches < 2 || coreIdentityMatches < 1) {
    return 0;
  }
  return coreIdentityMatches * 10 + recognizedHeaderMatches;
}

/**
 * Discovers physical columns when no header row exists (or when headerless mode is forced)
 * by clustering X-intervals of body tokens and inferring column roles from token statistics.
 */
function discoverHeaderlessColumns(
  bodyRows: PhysicalRowCluster[],
  verticalGridLinesX: number[],
  manualColumnRoles?: Record<number, ColumnRole>
): DetectedColumnBand[] {
  const allItems = bodyRows.flatMap((r) => r.items);
  if (allItems.length === 0) return [];

  const minX = Math.min(...allItems.map((it) => it.token.bbox.x0));
  const maxX = Math.max(...allItems.map((it) => it.token.bbox.x1));

  // Group horizontally overlapping or aligned tokens across rows into column spans.
  // Never merge numeric tokens, gender tokens ("Kız"/"Erkek"/"K"/"E"), or boarding/status tokens ("Yat."/"Günd.") with neighbor words!
  const rowCells: {
    rowIndex: number;
    x0: number;
    x1: number;
    cx: number;
    cy: number;
    text: string;
    isNumeric: boolean;
  }[] = [];
  const hasVertLine = (xA: number, xB: number) =>
    verticalGridLinesX.some(
      (vx) => vx > Math.min(xA, xB) + 2 && vx < Math.max(xA, xB) - 2
    );

  bodyRows.forEach((row, rowIndex) => {
    const items = [...row.items].sort(
      (a, b) => a.token.bbox.x0 - b.token.bbox.x0
    );
    let idx = 0;
    while (idx < items.length) {
      let x0 = items[idx].token.bbox.x0;
      let x1 = items[idx].token.bbox.x1;
      const cy = items[idx].cy;
      let text = items[idx].token.text;
      const curIsNumeric = isNumericTokenText(text);
      const curIsGenderOrStatus =
        isTurkishGenderToken(text) || isTurkishRosterStatusOrBoardingToken(text);

      while (
        !curIsNumeric &&
        !curIsGenderOrStatus &&
        idx + 1 < items.length &&
        !hasVertLine(x1, items[idx + 1].token.bbox.x0) &&
        items[idx + 1].token.bbox.x0 - x1 <=
          Math.max(22, items[idx].height * 1.05) &&
        !isNumericTokenText(items[idx + 1].token.text) &&
        !isTurkishGenderToken(items[idx + 1].token.text) &&
        !isTurkishRosterStatusOrBoardingToken(items[idx + 1].token.text)
      ) {
        idx++;
        x1 = items[idx].token.bbox.x1;
        text = `${text} ${items[idx].token.text}`;
      }
      rowCells.push({
        rowIndex,
        x0,
        x1,
        cx: (x0 + x1) / 2,
        cy,
        text,
        isNumeric: curIsNumeric,
      });
      idx++;
    }
  });

  // Sort cells by center X and cluster into columns
  const sortedCells = [...rowCells].sort((a, b) => a.cx - b.cx);
  const colClusters: typeof rowCells[] = [];

  for (const cell of sortedCells) {
    let bestCol: typeof rowCells | null = null;
    let bestDist = Infinity;
    for (const col of colClusters) {
      // Never merge two numeric cells from the same physical row (e.g. Sıra No "1." and Okul No "105") into the same column cluster
      const hasSameRowNumericConflict =
        cell.isNumeric &&
        col.some((c) => c.rowIndex === cell.rowIndex && c.isNumeric);
      if (hasSameRowNumericConflict) {
        continue;
      }

      const colMeanX = col.reduce((s, c) => s + c.cx, 0) / col.length;
      const colMinX = Math.min(...col.map((c) => c.x0));
      const colMaxX = Math.max(...col.map((c) => c.x1));
      const separatedByGrid = hasVertLine(colMeanX, cell.cx);
      const overlapX = Math.min(colMaxX, cell.x1) - Math.max(colMinX, cell.x0);
      const overlapsHorizontally = cell.isNumeric
        ? overlapX >= -4
        : overlapX > -14;
      const maxAllowedDist = cell.isNumeric ? 22 : 38;
      const dist = Math.abs(cell.cx - colMeanX);
      if (
        !separatedByGrid &&
        (overlapsHorizontally || dist < maxAllowedDist) &&
        dist < bestDist
      ) {
        bestDist = dist;
        bestCol = col;
      }
    }
    if (bestCol) {
      bestCol.push(cell);
    } else {
      colClusters.push([cell]);
    }
  }

  colClusters.sort(
    (a, b) =>
      a.reduce((s, c) => s + c.cx, 0) / a.length -
      b.reduce((s, c) => s + c.cx, 0) / b.length
  );

  // Infer role for each column cluster
  const colStats = colClusters.map((col, colIdx) => {
    const texts = col.map((c) => c.text.trim());
    const numericCount = texts.filter((t) => isNumericTokenText(t)).length;
    const genderCount = texts.filter((t) => isTurkishGenderToken(t)).length;
    const statusCount = texts.filter((t) =>
      isTurkishRosterStatusOrBoardingToken(t)
    ).length;
    const alphaCount = texts.filter(
      (t) =>
        !isTurkishGenderToken(t) &&
        !isTurkishRosterStatusOrBoardingToken(t) &&
        /[A-ZÇĞİÖŞÜa-zçğıöşü]{2,}/.test(t)
    ).length;
    const nums = texts
      .filter((t) => isNumericTokenText(t))
      .map((t) => Number(cleanNumericTokenText(t)));

    // Check if strictly sequential 1, 2, 3... or small 1-2 digit sequence numbers
    let isSequentialSmall = false;
    if (nums.length >= 2 && numericCount >= texts.length * 0.6) {
      const sortedNums = [...nums].sort((a, b) => a - b);
      const maxNum = sortedNums[sortedNums.length - 1];
      const stepsOfOne = sortedNums.filter(
        (n, i) => i > 0 && n - sortedNums[i - 1] === 1
      ).length;
      if (maxNum <= 60 && stepsOfOne >= Math.max(1, sortedNums.length - 2)) {
        isSequentialSmall = true;
      }
    }

    const centerX = col.reduce((s, c) => s + c.cx, 0) / col.length;
    return {
      colIdx,
      col,
      centerX,
      numericRatio: numericCount / Math.max(1, texts.length),
      genderRatio: genderCount / Math.max(1, texts.length),
      statusRatio: statusCount / Math.max(1, texts.length),
      alphaRatio: alphaCount / Math.max(1, texts.length),
      isSequentialSmall,
      avgTextLen:
        texts.reduce((s, t) => s + t.length, 0) / Math.max(1, texts.length),
    };
  });

  // Assign default inferred roles
  const inferredRoles: ColumnRole[] = new Array(colStats.length).fill(
    'auxiliary'
  );

  // Identify numeric columns
  const numericCols = colStats.filter((c) => c.numericRatio >= 0.5);
  if (numericCols.length >= 2) {
    // Leftmost small sequential is sequence, second is studentNumber
    inferredRoles[numericCols[0].colIdx] = 'sequence';
    inferredRoles[numericCols[1].colIdx] = 'studentNumber';
  } else if (numericCols.length === 1) {
    inferredRoles[numericCols[0].colIdx] = 'studentNumber';
  }

  // Identify gender column (supports K/E as well as Kız/Erkek)
  for (const c of colStats) {
    if (c.genderRatio >= 0.45 && inferredRoles[c.colIdx] === 'auxiliary') {
      inferredRoles[c.colIdx] = 'gender';
    }
  }

  // Identify alphabetic name columns (excluding gender and boarding/status columns like Yat./Günd.)
  const alphaCols = colStats.filter(
    (c) =>
      c.alphaRatio >= 0.5 &&
      c.genderRatio < 0.35 &&
      c.statusRatio < 0.35 &&
      inferredRoles[c.colIdx] === 'auxiliary'
  );
  if (alphaCols.length >= 2) {
    inferredRoles[alphaCols[0].colIdx] = 'firstName';
    inferredRoles[alphaCols[1].colIdx] = 'lastName';
  } else if (alphaCols.length === 1) {
    inferredRoles[alphaCols[0].colIdx] = 'fullName';
  }

  const roleLabels: Record<ColumnRole, string> = {
    sequence: 'Sıra (Tahmini)',
    studentNumber: 'Okul No (Tahmini)',
    firstName: 'Adı (Tahmini)',
    lastName: 'Soyadı (Tahmini)',
    fullName: 'Adı Soyadı (Tahmini)',
    gender: 'Cinsiyet (Tahmini)',
    auxiliary: 'Ek Sütun',
    ignore: 'Yoksay',
  };

  return colStats.map((st, idx) => {
    const prevCenter = idx > 0 ? colStats[idx - 1].centerX : minX - 40;
    const nextCenter =
      idx + 1 < colStats.length ? colStats[idx + 1].centerX : maxX + 40;

    const leftBoundary =
      idx === 0
        ? Math.min(minX - 20, st.centerX - 60)
        : (prevCenter + st.centerX) / 2;
    const rightBoundary =
      idx === colStats.length - 1
        ? Math.max(maxX + 20, st.centerX + 60)
        : (st.centerX + nextCenter) / 2;

    const role = manualColumnRoles?.[idx] ?? inferredRoles[idx];

    return {
      columnIndex: idx,
      role,
      headerText: roleLabels[role],
      x0: Math.round(leftBoundary),
      x1: Math.round(rightBoundary),
      centerX: Math.round(st.centerX),
      driftSlopeXPerY: 0,
      inferredWithoutHeader: true,
      confidence: 74,
    };
  });
}

/**
 * Estimates horizontal column drift per vertical pixel (dx/dy) for each column
 * so narrowed or perspectively tilted columns track accurately from top to bottom.
 * Also guards against stretching `studentNumber` across an unheadered left `sequence` column
 * or stretching `lastName` across right-hand `gender` / `boarding status` columns.
 */
function refineColumnBandsWithBodyTokens(
  initialColumns: DetectedColumnBand[],
  bodyRows: PhysicalRowCluster[],
  verticalGridLinesX: number[],
  headerMinY: number
): DetectedColumnBand[] {
  if (initialColumns.length === 0) return [];
  const sortedCols = [...initialColumns].sort((a, b) => a.centerX - b.centerX);

  const allTokens = bodyRows.flatMap((r) => r.items);

  // Check if there is an unheadered sequence column to the left of the first column (`studentNumber`)
  if (
    sortedCols[0].role === 'studentNumber' &&
    !sortedCols.some((c) => c.role === 'sequence')
  ) {
    const leftNumericItems = allTokens.filter(
      (it) =>
        isNumericTokenText(it.token.text) &&
        it.token.bbox.x1 <= sortedCols[0].x0 + 8
    );
    if (leftNumericItems.length >= 2) {
      const seqCenterX = Math.round(
        leftNumericItems.reduce((s, it) => s + it.cx, 0) /
          leftNumericItems.length
      );
      const seqMinX = Math.min(...leftNumericItems.map((it) => it.token.bbox.x0));
      sortedCols.unshift({
        columnIndex: 0,
        role: 'sequence',
        headerText: 'Sıra (Tahmini)',
        x0: seqMinX - 15,
        x1: Math.round((seqCenterX + sortedCols[0].centerX) / 2),
        centerX: seqCenterX,
        driftSlopeXPerY: 0,
        inferredWithoutHeader: true,
        confidence: 80,
      });
    }
  }

  // Check if there are unheadered gender or boarding/status tokens to the right of the rightmost name column
  const lastCol = sortedCols[sortedCols.length - 1];
  if (
    lastCol.role === 'lastName' ||
    lastCol.role === 'fullName' ||
    lastCol.role === 'firstName'
  ) {
    const rightGenderOrStatusItems = allTokens.filter(
      (it) =>
        it.cx > lastCol.centerX + 28 &&
        (isTurkishGenderToken(it.token.text) ||
          isTurkishRosterStatusOrBoardingToken(it.token.text))
    );
    if (rightGenderOrStatusItems.length >= 1) {
      const rightMinX = Math.min(
        ...rightGenderOrStatusItems.map((it) => it.token.bbox.x0)
      );
      const rightCenterX = Math.round(
        rightGenderOrStatusItems.reduce((s, it) => s + it.cx, 0) /
          rightGenderOrStatusItems.length
      );
      const isMostlyGender =
        rightGenderOrStatusItems.filter((it) =>
          isTurkishGenderToken(it.token.text)
        ).length >=
        rightGenderOrStatusItems.length * 0.5;
      sortedCols.push({
        columnIndex: sortedCols.length,
        role: isMostlyGender ? 'gender' : 'auxiliary',
        headerText: isMostlyGender ? 'Cinsiyet (Tahmini)' : 'Ek Sütun',
        x0: Math.round((lastCol.centerX + rightMinX) / 2),
        x1:
          Math.max(...rightGenderOrStatusItems.map((it) => it.token.bbox.x1)) +
          20,
        centerX: rightCenterX,
        driftSlopeXPerY: 0,
        inferredWithoutHeader: true,
        confidence: 80,
      });
    }
  }

  // Re-index columnIndex after any prepended/appended bands
  sortedCols.forEach((c, idx) => {
    c.columnIndex = idx;
  });

  const globalMinX =
    allTokens.length > 0
      ? Math.min(...allTokens.map((t) => t.token.bbox.x0), sortedCols[0].x0)
      : sortedCols[0].x0;
  const globalMaxX =
    allTokens.length > 0
      ? Math.max(
          ...allTokens.map((t) => t.token.bbox.x1),
          sortedCols[sortedCols.length - 1].x1
        )
      : sortedCols[sortedCols.length - 1].x1;

  // Compute boundaries between adjacent columns using vertical grid lines if present, or midpoints
  for (let i = 0; i < sortedCols.length; i++) {
    const cur = sortedCols[i];
    if (i === 0) {
      cur.x0 = Math.min(globalMinX - 25, cur.x0);
    } else {
      const prev = sortedCols[i - 1];
      const gridBetween = verticalGridLinesX.filter(
        (vx) => vx > prev.centerX + 8 && vx < cur.centerX - 8
      );
      const dividerX =
        gridBetween.length > 0
          ? median(gridBetween)
          : (prev.centerX + cur.centerX) / 2;
      prev.x1 = Math.round(dividerX);
      cur.x0 = Math.round(dividerX);
    }
    if (i === sortedCols.length - 1) {
      cur.x1 = Math.max(globalMaxX + 25, cur.x1);
    }
  }

  // Estimate linear drift slope dx/dy per column
  for (const col of sortedCols) {
    const colPoints: { x: number; y: number }[] = [];
    for (const row of bodyRows) {
      const inCol = row.items.filter(
        (it) => it.cx >= col.x0 && it.cx <= col.x1
      );
      if (inCol.length > 0) {
        const meanX =
          inCol.reduce((s, it) => s + it.cx, 0) / inCol.length;
        const meanY =
          inCol.reduce((s, it) => s + it.cy, 0) / inCol.length;
        colPoints.push({ x: meanX, y: meanY });
      }
    }
    if (colPoints.length >= 3) {
      const first = colPoints[0];
      const last = colPoints[colPoints.length - 1];
      const dy = last.y - first.y;
      if (dy > 40) {
        const slope = (last.x - first.x) / dy;
        col.driftSlopeXPerY = Math.max(-0.22, Math.min(0.22, slope));
        // Anchor centerX at headerMinY
        col.centerX = Math.round(
          first.x - col.driftSlopeXPerY * (first.y - headerMinY)
        );
      }
    }
  }

  return sortedCols;
}

/**
 * Checks if a physical row cluster accidentally contains two vertically distinct `studentNumber` anchors
 * (e.g. if two rows had very tight line spacing) and splits the cluster cleanly along their vertical midpoint.
 */
function splitMergedRowClustersByStudentNumberAnchors(
  bodyRows: PhysicalRowCluster[],
  columns: DetectedColumnBand[],
  medianWordH: number
): PhysicalRowCluster[] {
  const stuNumCol = columns.find((c) => c.role === 'studentNumber');
  if (!stuNumCol) return bodyRows;

  const result: PhysicalRowCluster[] = [];

  for (const row of bodyRows) {
    const anchorItems = row.items
      .filter(
        (it) =>
          it.cx >= stuNumCol.x0 - 10 &&
          it.cx <= stuNumCol.x1 + 10 &&
          /^\d{2,6}$/.test(
            cleanNumericTokenText(it.token.text)
              .replace(/[OÖ]/g, '0')
              .replace(/[Iİ]/g, '1')
          )
      )
      .sort((a, b) => a.correctedY - b.correctedY);

    if (
      anchorItems.length >= 2 &&
      anchorItems[anchorItems.length - 1].correctedY -
        anchorItems[0].correctedY >=
        medianWordH * 0.45
    ) {
      // Split items into sub-rows assigned to the closest anchor by correctedY
      const buckets = new Map<number, InternalTokenWithCorrectedY[]>();
      anchorItems.forEach((_, idx) => buckets.set(idx, []));

      for (const item of row.items) {
        let bestIdx = 0;
        let bestDist = Infinity;
        anchorItems.forEach((anc, idx) => {
          const d = Math.abs(item.correctedY - anc.correctedY);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = idx;
          }
        });
        buckets.get(bestIdx)!.push(item);
      }

      for (const subItems of buckets.values()) {
        if (subItems.length > 0) {
          const sortedLR = [...subItems].sort((a, b) => a.cx - b.cx);
          result.push({
            clusterIndex: result.length,
            items: sortedLR,
            meanCorrectedY:
              sortedLR.reduce((s, it) => s + it.correctedY, 0) /
              sortedLR.length,
            minY: Math.min(...sortedLR.map((it) => it.token.bbox.y0)),
            maxY: Math.max(...sortedLR.map((it) => it.token.bbox.y1)),
          });
        }
      }
    } else {
      result.push({
        ...row,
        clusterIndex: result.length,
      });
    }
  }

  return result;
}

export function computeRowApprovalSignature(row: {
  studentNumber: string;
  firstName: string;
  lastName: string;
}): string {
  return `${row.studentNumber.trim()}|${row.firstName.trim()}|${row.lastName.trim()}`;
}

/**
 * Detects and splits OCR-glued row sequence numbers + student school numbers
 * (e.g. Row 1: "1105" -> seq=1, no="105"; Row 2: "2108" -> seq=2, no="108").
 * Guards against false splits when school numbers genuinely share a constant prefix (e.g. 1001, 1002, 1003).
 */
function splitGluedSequenceAndStudentNumbers(
  rows: VerifiedOcrRosterRow[]
): void {
  if (rows.length === 0) return;

  // Candidate analysis: check how many rows have sequenceNumber === null and studentNumber starting with (rowIndex)
  const candidates: Array<{
    idx: number;
    expectedSeq: number;
    remainder: string;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.sequenceNumber !== null) continue;
    const num = r.studentNumber.trim();
    if (!/^\d{3,7}$/.test(num)) continue;

    const expectedSeq = i + 1;
    const prefix = String(expectedSeq);
    if (num.startsWith(prefix)) {
      const remainder = num.slice(prefix.length);
      if (/^\d{2,5}$/.test(remainder)) {
        candidates.push({ idx: i, expectedSeq, remainder });
      }
    }
  }

  if (candidates.length === 0) return;

  // Determine if the table exhibits sequential row-prefix gluing:
  // Case A: >= 2 rows match sequential prefixes AND at least one has expectedSeq >= 2 (disproving constant '100x' school numbers)
  const hasMultiRowSequentialEvidence =
    candidates.length >= 2 && candidates.some((c) => c.expectedSeq >= 2);

  // Case B: Other rows already have explicit sequenceNumber and a consistent studentNumber digit length
  const rowsWithExplicitSeq = rows.filter(
    (r) => r.sequenceNumber !== null && /^\d{2,5}$/.test(r.studentNumber.trim())
  );
  const medianExplicitStuLen =
    rowsWithExplicitSeq.length > 0
      ? Math.round(
          median(
            rowsWithExplicitSeq.map((r) => r.studentNumber.trim().length)
          )
        )
      : 0;

  for (const cand of candidates) {
    const matchesExplicitLengthPattern =
      medianExplicitStuLen >= 2 &&
      cand.remainder.length === medianExplicitStuLen;

    const singleRowObviousGlue =
      rows.length === 1 &&
      cand.expectedSeq === 1 &&
      rows[0].studentNumber.length >= 4 &&
      !cand.remainder.startsWith('0');

    if (
      hasMultiRowSequentialEvidence ||
      matchesExplicitLengthPattern ||
      singleRowObviousGlue
    ) {
      const targetRow = rows[cand.idx];
      targetRow.sequenceNumber = cand.expectedSeq;
      targetRow.studentNumber = cand.remainder;
      targetRow.rawCells.sequence = String(cand.expectedSeq);
      targetRow.rawCells.studentNumber = cand.remainder;
    }
  }
}

/**
 * Helper to match a single token item to its best-fitting geometric column band.
 */
function matchTokenItemToColumnBand(
  item: InternalTokenWithCorrectedY,
  columns: DetectedColumnBand[],
  headerRefY: number
): { matchedCol: DetectedColumnBand | null; nearBoundaryEdge: boolean } {
  const dyFromTop = Math.max(0, item.cy - headerRefY);
  let matchedCol: DetectedColumnBand | null = null;
  let bestColScore = -Infinity;

  for (const col of columns) {
    const driftX = col.driftSlopeXPerY * dyFromTop;
    const effX0 = col.x0 + driftX;
    const effX1 = col.x1 + driftX;
    const effCenter = col.centerX + driftX;

    const overlapW = Math.max(
      0,
      Math.min(item.token.bbox.x1, effX1) -
        Math.max(item.token.bbox.x0, effX0)
    );
    const overlapRatio = overlapW / Math.max(1, item.width);
    const centerInside = item.cx >= effX0 && item.cx <= effX1;
    const distToCenter = Math.abs(item.cx - effCenter);

    const score =
      overlapRatio * 120 + (centerInside ? 50 : 0) - distToCenter * 0.25;

    if (score > bestColScore) {
      bestColScore = score;
      matchedCol = col;
    }
  }

  let nearBoundaryEdge = false;
  if (matchedCol && columns.length > 1) {
    const driftX = matchedCol.driftSlopeXPerY * dyFromTop;
    const effX0 = matchedCol.x0 + driftX;
    const effX1 = matchedCol.x1 + driftX;
    const distToEdge = Math.min(
      Math.abs(item.token.bbox.x0 - effX0),
      Math.abs(item.token.bbox.x1 - effX1)
    );
    if (distToEdge < 3) {
      nearBoundaryEdge = true;
    }
  }

  return { matchedCol, nearBoundaryEdge };
}

/**
 * Puanla's Order-Preserving 1-to-1 Surname Matching Algorithm (Sıra Koruyan Bire Bir Soyadı Eşleştirme).
 *
 * Solves the classic classroom roster OCR problem where right-hand surname cells drift vertically
 * (due to camera tilt, page curvature, or separate block segmentation) relative to left-hand
 * student anchor rows (Sıra / Okul No / Adı), while strictly guaranteeing:
 * 1. Monotonic Order Preservation: If student row i1 < i2 are matched to surnames j1 and j2, then j1 < j2 (surnames never cross/swap order).
 * 2. Strict 1-to-1 Exclusivity: Each student row receives at most one surname block, and each surname block is assigned to at most one student row.
 * 3. Zero Cross-Row Borrowing: If a student's surname cell is empty on the page, that student row is skipped cleanly in the DP alignment rather than stealing a neighbor student's surname.
 */
export function matchSurnamesOrderPreservingOneToOne(
  anchors: AnchorRowSurnameTarget[],
  surnameBlocks: SurnameCandidateBlock[],
  medianWordH: number,
  medianRowStepY: number
): OrderPreservingSurnameMatchResult {
  const N = anchors.length;
  const M = surnameBlocks.length;

  if (N === 0 || M === 0) {
    return {
      matchedByRowIndex: new Map(),
      unmatchedCandidates: [...surnameBlocks],
      alignmentPairs: [],
      estimatedColumnVerticalOffsetPx: 0,
      alignmentApplied: false,
    };
  }

  const effectiveStepY = Math.max(
    medianWordH * 1.5,
    medianRowStepY || medianWordH * 2.0
  );
  const maxAllowedColumnOffset = effectiveStepY * 0.78;

  // Step 1: Estimate systematic vertical offset (deltaY) between surname column and left anchor rows
  const candidateOffsets = new Set<number>([0]);

  if (N === M) {
    const directDiffs = anchors.map(
      (a, idx) => surnameBlocks[idx].correctedY - a.anchorCorrectedY
    );
    candidateOffsets.add(median(directDiffs));
  }

  // Top-aligned and bottom-aligned offset hypotheses (crucial when a middle row has a blank surname!)
  candidateOffsets.add(
    surnameBlocks[0].correctedY - anchors[0].anchorCorrectedY
  );
  candidateOffsets.add(
    surnameBlocks[M - 1].correctedY - anchors[N - 1].anchorCorrectedY
  );

  for (const sb of surnameBlocks) {
    for (const anc of anchors) {
      const diff = sb.correctedY - anc.anchorCorrectedY;
      if (Math.abs(diff) <= maxAllowedColumnOffset) {
        candidateOffsets.add(diff);
      }
    }
  }

  const tightResidualGate = Math.max(6, medianWordH * 0.45);
  let bestOffset = 0;
  let bestOffsetScore = -Infinity;

  for (const delta of candidateOffsets) {
    if (Math.abs(delta) > maxAllowedColumnOffset) continue;

    // Greedily count strictly order-preserving 1-to-1 matches within tightResidualGate under this delta
    let lastAnchorIdx = -1;
    let tightMatches = 0;
    let residualSum = 0;

    for (let j = 0; j < M; j++) {
      const shiftedY = surnameBlocks[j].correctedY - delta;
      let bestI = -1;
      let bestDist = Infinity;
      for (let i = lastAnchorIdx + 1; i < N; i++) {
        const d = Math.abs(shiftedY - anchors[i].anchorCorrectedY);
        if (d <= tightResidualGate && d < bestDist) {
          bestDist = d;
          bestI = i;
        }
      }
      if (bestI !== -1) {
        tightMatches++;
        residualSum += bestDist;
        lastAnchorIdx = bestI;
      }
    }

    // Small regularization on |delta| so delta=0 wins whenever surnames are already aligned without offset
    const score =
      tightMatches * 250 - residualSum * 4 - Math.abs(delta) * 0.45;
    if (score > bestOffsetScore) {
      bestOffsetScore = score;
      bestOffset = delta;
    }
  }

  const estimatedOffset =
    Math.abs(bestOffset) <= 1.5 ? 0 : Number(bestOffset.toFixed(2));

  // Step 2: Build admissible pairwise score matrix for Order-Preserving 1-to-1 Dynamic Programming
  const maxCompGate = Math.max(medianWordH * 0.82, effectiveStepY * 0.42);
  const maxRawGate = Math.max(medianWordH * 1.65, effectiveStepY * 0.85);

  const pairScore: number[][] = Array.from({ length: N }, () =>
    new Array(M).fill(-Infinity)
  );

  for (let i = 0; i < N; i++) {
    const anc = anchors[i];
    for (let j = 0; j < M; j++) {
      const sb = surnameBlocks[j];
      const rawDist = Math.abs(sb.correctedY - anc.anchorCorrectedY);
      const compY = sb.correctedY - estimatedOffset;
      const compDist = Math.abs(compY - anc.anchorCorrectedY);

      if (compDist > maxCompGate || rawDist > maxRawGate) {
        continue;
      }

      // Anti-Cross-Row-Borrowing Guard:
      // Check if another anchor row i' != i is substantially closer to compY than anchor i
      let closerNeighborExists = false;
      for (let iOther = 0; iOther < N; iOther++) {
        if (iOther === i) continue;
        const otherDist = Math.abs(compY - anchors[iOther].anchorCorrectedY);
        if (otherDist + Math.max(4, medianWordH * 0.22) < compDist) {
          closerNeighborExists = true;
          break;
        }
      }
      if (closerNeighborExists) {
        continue;
      }

      const sameMlKitLine =
        anc.blockIndex !== undefined &&
        sb.blockIndex !== undefined &&
        anc.blockIndex === sb.blockIndex &&
        anc.lineIndex !== undefined &&
        sb.lineIndex !== undefined &&
        anc.lineIndex === sb.lineIndex;

      pairScore[i][j] =
        1000 - compDist * 10 - rawDist * 1.2 + (sameMlKitLine ? 60 : 0);
    }
  }

  // Step 3: Solve Monotonic 1-to-1 Bipartite Matching via Dynamic Programming
  const dp: number[][] = Array.from({ length: N + 1 }, () =>
    new Array(M + 1).fill(0)
  );
  const choice: number[][] = Array.from({ length: N + 1 }, () =>
    new Array(M + 1).fill(0)
  ); // 1 = skip anchor i-1, 2 = skip surname j-1, 3 = match (i-1, j-1)

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      // Option 1: skip anchor i-1 (leave row i-1 without surname)
      let best = dp[i - 1][j];
      let bestWay = 1;

      // Option 2: skip surname j-1
      if (dp[i][j - 1] > best) {
        best = dp[i][j - 1];
        bestWay = 2;
      }

      // Option 3: match anchor i-1 with surname j-1 (strictly 1-to-1 and order-preserving)
      const mScore = pairScore[i - 1][j - 1];
      if (mScore > -Infinity) {
        const cand = dp[i - 1][j - 1] + mScore;
        if (cand >= best) {
          best = cand;
          bestWay = 3;
        }
      }

      dp[i][j] = best;
      choice[i][j] = bestWay;
    }
  }

  // Backtrack to recover strictly order-preserving 1-to-1 pairs
  const matchedPairs: Array<{ anchorIdx: number; surnameIdx: number }> = [];
  let ci = N;
  let cj = M;
  while (ci > 0 && cj > 0) {
    const way = choice[ci][cj];
    if (way === 3) {
      matchedPairs.push({ anchorIdx: ci - 1, surnameIdx: cj - 1 });
      ci--;
      cj--;
    } else if (way === 2) {
      cj--;
    } else {
      ci--;
    }
  }
  matchedPairs.reverse();

  const matchedByRowIndex = new Map<number, SurnameCandidateBlock>();
  const matchedSurnameIndices = new Set<number>();
  const alignmentPairs: SurnameOrderAlignmentPair[] = [];
  let nonTrivialShiftResolved = Math.abs(estimatedOffset) >= 4;

  for (const { anchorIdx, surnameIdx } of matchedPairs) {
    const anc = anchors[anchorIdx];
    const sb = surnameBlocks[surnameIdx];
    matchedByRowIndex.set(anc.rowIndex, sb);
    matchedSurnameIndices.add(surnameIdx);

    const rawCost = Number(
      Math.abs(sb.correctedY - anc.anchorCorrectedY).toFixed(2)
    );
    if (rawCost >= medianWordH * 0.45) {
      nonTrivialShiftResolved = true;
    }

    alignmentPairs.push({
      rowIndex: anc.rowIndex + 1,
      rowAnchorY: Number(anc.anchorCorrectedY.toFixed(1)),
      surnameTokenId: sb.tokens.map((t) => t.id).join('+'),
      surnameText: sb.text,
      surnameCorrectedY: Number(sb.correctedY.toFixed(1)),
      verticalCostPx: rawCost,
    });
  }

  const unmatchedCandidates = surnameBlocks.filter(
    (_, idx) => !matchedSurnameIndices.has(idx)
  );

  return {
    matchedByRowIndex,
    unmatchedCandidates,
    alignmentPairs,
    estimatedColumnVerticalOffsetPx: estimatedOffset,
    alignmentApplied: nonTrivialShiftResolved || matchedPairs.length > 0,
  };
}

/**
 * Core Geometric Table Structure Analyzer.
 * Analyzes word coordinates, physical table headers, dynamic column bands,
 * Puanla's order-preserving 1-to-1 surname alignment (with zero cross-row borrowing),
 * and missing student sequence/spacing gaps.
 */
export function analyzeRosterTableGeometry(
  words: OcrWordToken[],
  options: GeometricTableParseOptions = {}
): GeometricTableAnalysisResult {
  const validWords = words.filter((w) => w.text.trim().length > 0);
  if (validWords.length === 0) {
    return {
      headerDetected: false,
      headerRowYBand: null,
      headerlessRecoveryRequired: false,
      estimatedRowSlantDeg: 0,
      columns: [],
      rows: [],
      unassignedTokens: [],
      medianRowHeight: 0,
      medianRowStepY: 0,
      surnameOrderAlignmentApplied: false,
      surnameOrderAlignmentPairs: [],
    };
  }

  const wordHeights = validWords.map((w) => Math.max(4, w.bbox.y1 - w.bbox.y0));
  const medianWordH = median(wordHeights) || 20;

  // 1. Estimate residual horizontal row slant and compute slant-compensated Y coordinates
  const slant = estimateResidualRowSlant(validWords, medianWordH);
  const internalItems: InternalTokenWithCorrectedY[] = validWords.map((token) => {
    const cx = (token.bbox.x0 + token.bbox.x1) / 2;
    const cy = (token.bbox.y0 + token.bbox.y1) / 2;
    const correctedY = cy - slant.slopeDyDx * (cx - slant.refX);
    return {
      token,
      cx,
      cy,
      correctedY,
      width: Math.max(1, token.bbox.x1 - token.bbox.x0),
      height: Math.max(1, token.bbox.y1 - token.bbox.y0),
    };
  });

  // 2. Cluster into initial physical rows for header discovery
  const allPhysicalRows = clusterTokensIntoPhysicalRows(
    internalItems,
    medianWordH,
    options.horizontalGridLinesY
  );

  // 3. Detect header row (within first 10 clusters to skip top-of-page e-Okul school/class title banners)
  let headerRowIdx = -1;
  let bestHeaderScore = 0;
  if (!options.forceHeaderlessMode) {
    const searchLimit = Math.min(10, allPhysicalRows.length);
    for (let i = 0; i < searchLimit; i++) {
      const score = scoreClusterAsHeaderRow(allPhysicalRows[i]);
      if (score > bestHeaderScore) {
        bestHeaderScore = score;
        headerRowIdx = i;
      }
    }
  }

  const headerDetected = headerRowIdx !== -1;
  const headerCluster = headerDetected ? allPhysicalRows[headerRowIdx] : null;
  const headerRowYBand = headerCluster
    ? { y0: headerCluster.minY, y1: headerCluster.maxY }
    : null;

  // Exclude header row and any top/bottom e-Okul title banners or signature footers from body rows
  const candidateBodyClusters = headerDetected
    ? allPhysicalRows.slice(headerRowIdx + 1)
    : allPhysicalRows;
  const rawBodyClusters = candidateBodyClusters.filter(
    (cluster) => !isNonStudentBannerOrFooterRow(cluster)
  );

  // 4. Build dynamic column bands from headers OR headerless statistical inference
  let columns: DetectedColumnBand[] = [];
  let headerlessRecoveryRequired = false;

  if (headerDetected && headerCluster) {
    const headerCells = buildHeaderCellsFromRow(
      headerCluster,
      options.verticalGridLinesX ?? []
    );
    const initialCols: DetectedColumnBand[] = headerCells.map((hc, idx) => ({
      columnIndex: idx,
      role: options.manualColumnRoles?.[idx] ?? hc.role,
      headerText: hc.text,
      x0: hc.bbox.x0 - 15,
      x1: hc.bbox.x1 + 15,
      centerX: Math.round(hc.centerX),
      driftSlopeXPerY: 0,
      inferredWithoutHeader: false,
      confidence: 95,
    }));

    columns = refineColumnBandsWithBodyTokens(
      initialCols,
      rawBodyClusters,
      options.verticalGridLinesX ?? [],
      headerCluster.minY
    );
  } else {
    headerlessRecoveryRequired = !options.manualColumnRoles;
    columns = discoverHeaderlessColumns(
      rawBodyClusters,
      options.verticalGridLinesX ?? [],
      options.manualColumnRoles
    );
    columns = refineColumnBandsWithBodyTokens(
      columns,
      rawBodyClusters,
      options.verticalGridLinesX ?? [],
      rawBodyClusters[0]?.minY ?? 0
    );
  }

  const hasDedicatedLastCol = columns.some((c) => c.role === 'lastName');
  const hasDedicatedStuNumCol = columns.some(
    (c) => c.role === 'studentNumber'
  );
  const headerRefY = headerCluster?.minY ?? (rawBodyClusters[0]?.minY ?? 0);

  // 5. Separate dedicated Surname (`lastName`) and Gender (`gender`) column tokens from Left Anchor tokens
  //    so vertically shifted surname cells never merge into neighbor student rows before Puanla's 1-to-1 matcher runs.
  //    Also intercept gender ("Kız"/"Erkek") and boarding/status ("Yat."/"Günd.") tokens so they NEVER enter surnameBodyItems.
  const allBodyItems = rawBodyClusters.flatMap((c) => c.items);
  const anchorBodyItems: InternalTokenWithCorrectedY[] = [];
  const surnameBodyItems: InternalTokenWithCorrectedY[] = [];
  const genderBodyItems: InternalTokenWithCorrectedY[] = [];

  if (hasDedicatedLastCol) {
    for (const item of allBodyItems) {
      if (isTurkishRosterStatusOrBoardingToken(item.token.text)) {
        continue;
      }
      if (isTurkishGenderToken(item.token.text)) {
        genderBodyItems.push(item);
        continue;
      }
      const { matchedCol } = matchTokenItemToColumnBand(
        item,
        columns,
        headerRefY
      );
      if (matchedCol?.role === 'lastName') {
        surnameBodyItems.push(item);
      } else if (matchedCol?.role === 'gender') {
        genderBodyItems.push(item);
      } else {
        anchorBodyItems.push(item);
      }
    }
  } else {
    for (const item of allBodyItems) {
      if (isTurkishRosterStatusOrBoardingToken(item.token.text)) {
        continue;
      }
      anchorBodyItems.push(item);
    }
  }

  // Cluster anchor tokens into physical rows and split any merged studentNumber anchors
  const rawAnchorClusters = clusterTokensIntoPhysicalRows(
    anchorBodyItems,
    medianWordH,
    options.horizontalGridLinesY
  );
  const bodyClusters = splitMergedRowClustersByStudentNumberAnchors(
    rawAnchorClusters,
    columns,
    medianWordH
  );

  const rowStepDeltas: number[] = [];
  for (let i = 1; i < bodyClusters.length; i++) {
    const dy =
      bodyClusters[i].meanCorrectedY - bodyClusters[i - 1].meanCorrectedY;
    if (dy > medianWordH * 0.6) {
      rowStepDeltas.push(dy);
    }
  }
  const medianRowStepY =
    rowStepDeltas.length > 0
      ? median(rowStepDeltas)
      : Math.round(medianWordH * 2.1);

  // 5b. Run Puanla's Order-Preserving 1-to-1 Surname Matching Algorithm on the dedicated `lastName` column
  const sortLR = (arr: OcrWordToken[]) =>
    [...arr].sort((a, b) => a.bbox.x0 - b.bbox.x0);

  let surnameMatchResult: OrderPreservingSurnameMatchResult = {
    matchedByRowIndex: new Map(),
    unmatchedCandidates: [],
    alignmentPairs: [],
    estimatedColumnVerticalOffsetPx: 0,
    alignmentApplied: false,
  };
  let genderMatchResult: OrderPreservingSurnameMatchResult = {
    matchedByRowIndex: new Map(),
    unmatchedCandidates: [],
    alignmentPairs: [],
    estimatedColumnVerticalOffsetPx: 0,
    alignmentApplied: false,
  };

  if (hasDedicatedLastCol) {
    const surnameRowClusters = clusterTokensIntoPhysicalRows(
      surnameBodyItems,
      medianWordH,
      options.horizontalGridLinesY
    );
    const surnameBlocks: SurnameCandidateBlock[] = surnameRowClusters.map(
      (sc, idx) => {
        const toks = sortLR(sc.items.map((it) => it.token));
        const rawCenterY =
          sc.items.reduce((s, it) => s + it.cy, 0) / sc.items.length;
        return {
          candidateIndex: idx,
          tokens: toks,
          text: toks.map((t) => t.text).join(' ').trim(),
          bbox: unionBbox(toks.map((t) => t.bbox)),
          correctedY: sc.meanCorrectedY,
          rawCenterY,
          lineIndex: toks[0]?.lineIndex,
          blockIndex: toks[0]?.blockIndex,
        };
      }
    );

    const anchorTargets: AnchorRowSurnameTarget[] = bodyClusters.map(
      (bc, idx) => {
        const anchorRawY =
          bc.items.reduce((s, it) => s + it.cy, 0) / bc.items.length;
        return {
          rowIndex: idx,
          anchorCorrectedY: bc.meanCorrectedY,
          anchorRawY,
          lineIndex: bc.items[0]?.token.lineIndex,
          blockIndex: bc.items[0]?.token.blockIndex,
        };
      }
    );

    surnameMatchResult = matchSurnamesOrderPreservingOneToOne(
      anchorTargets,
      surnameBlocks,
      medianWordH,
      medianRowStepY
    );

    if (genderBodyItems.length > 0) {
      const genderRowClusters = clusterTokensIntoPhysicalRows(
        genderBodyItems,
        medianWordH,
        options.horizontalGridLinesY
      );
      const genderBlocks: SurnameCandidateBlock[] = genderRowClusters.map(
        (gc, idx) => {
          const toks = sortLR(gc.items.map((it) => it.token));
          const rawCenterY =
            gc.items.reduce((s, it) => s + it.cy, 0) / gc.items.length;
          return {
            candidateIndex: idx,
            tokens: toks,
            text: toks.map((t) => t.text).join(' ').trim(),
            bbox: unionBbox(toks.map((t) => t.bbox)),
            correctedY: gc.meanCorrectedY,
            rawCenterY,
            lineIndex: toks[0]?.lineIndex,
            blockIndex: toks[0]?.blockIndex,
          };
        }
      );

      genderMatchResult = matchSurnamesOrderPreservingOneToOne(
        anchorTargets,
        genderBlocks,
        medianWordH,
        medianRowStepY
      );
    }
  }

  const unassignedTokens: OcrWordToken[] = [];
  const extractedRowsWithSortY: Array<{
    sortY: number;
    row: VerifiedOcrRosterRow;
  }> = [];

  // 6. Strict 1-to-1 Physical Row Extraction (Zero Cross-Row Borrowing!)
  bodyClusters.forEach((rowCluster, rIdx) => {
    const seqTokens: OcrWordToken[] = [];
    const stuNumTokens: OcrWordToken[] = [];
    const firstTokens: OcrWordToken[] = [];
    const lastTokens: OcrWordToken[] = [];
    const fullNameTokens: OcrWordToken[] = [];
    const genderTokens: OcrWordToken[] = [];

    const uncertaintyFlags = new Set<UncertaintyCode>();
    const uncertaintyReasons: string[] = [];

    if (!headerDetected) {
      uncertaintyFlags.add('HEADERLESS_COLUMN_INFERRED');
    }

    // Assign each anchor token strictly within THIS physical row to its matching geometric column band
    for (const item of rowCluster.items) {
      if (isTurkishRosterStatusOrBoardingToken(item.token.text)) {
        continue;
      }
      if (isTurkishGenderToken(item.token.text)) {
        genderTokens.push(item.token);
        continue;
      }

      // Check vertical alignment within the physical row cluster
      if (
        Math.abs(item.correctedY - rowCluster.meanCorrectedY) >
        medianWordH * 0.48
      ) {
        uncertaintyFlags.add('SUSPICIOUS_ROW_ALIGNMENT');
        if (!uncertaintyReasons.some((r) => r.includes('dikey hizalaması'))) {
          uncertaintyReasons.push(
            `"${item.token.text}" kelimesinin satır içi dikey hizalaması olağan dışı.`
          );
        }
      }

      const { matchedCol, nearBoundaryEdge } = matchTokenItemToColumnBand(
        item,
        columns,
        headerRefY
      );

      if (nearBoundaryEdge) {
        uncertaintyFlags.add('COLUMN_BOUNDARY_OVERLAP');
      }

      if (!matchedCol || matchedCol.role === 'ignore') {
        unassignedTokens.push(item.token);
        continue;
      }

      switch (matchedCol.role) {
        case 'sequence':
          seqTokens.push(item.token);
          break;
        case 'studentNumber':
          stuNumTokens.push(item.token);
          break;
        case 'firstName':
          firstTokens.push(item.token);
          break;
        case 'lastName':
          lastTokens.push(item.token);
          break;
        case 'fullName':
          fullNameTokens.push(item.token);
          break;
        case 'gender':
          genderTokens.push(item.token);
          break;
        default:
          break;
      }
    }

    // Attach 1-to-1 order-preserving matched surname and gender tokens when dedicated lastName column is used
    if (hasDedicatedLastCol) {
      const matchedSurname = surnameMatchResult.matchedByRowIndex.get(rIdx);
      if (matchedSurname) {
        for (const st of matchedSurname.tokens) {
          if (isTurkishRosterStatusOrBoardingToken(st.text)) {
            continue;
          }
          if (isTurkishGenderToken(st.text)) {
            genderTokens.push(st);
            continue;
          }
          lastTokens.push(st);
        }
        const verticalDrift = Math.abs(
          matchedSurname.correctedY - rowCluster.meanCorrectedY
        );
        if (verticalDrift > medianWordH * 0.65 && lastTokens.length > 0) {
          uncertaintyFlags.add('SUSPICIOUS_ROW_ALIGNMENT');
          uncertaintyReasons.push(
            `Soyadı ("${matchedSurname.text}") dikey sapmaya (${Math.round(
              verticalDrift
            )}px) rağmen sıra koruyan 1'e 1 eşleştirme ile bu satıra bağlandı; kontrol edin.`
          );
        }
      }

      const matchedGender = genderMatchResult.matchedByRowIndex.get(rIdx);
      if (matchedGender) {
        genderTokens.push(...matchedGender.tokens);
      }
    }

    const sortedSeq = sortLR(seqTokens);
    let sortedStuNum = sortLR(stuNumTokens);
    let sortedFirst = sortLR(firstTokens).filter(
      (t) =>
        !isTurkishGenderToken(t.text) &&
        !isTurkishRosterStatusOrBoardingToken(t.text)
    );
    let sortedLast = sortLR(lastTokens).filter(
      (t) =>
        !isTurkishGenderToken(t.text) &&
        !isTurkishRosterStatusOrBoardingToken(t.text)
    );
    const sortedFull = sortLR(fullNameTokens).filter(
      (t) =>
        !isTurkishGenderToken(t.text) &&
        !isTurkishRosterStatusOrBoardingToken(t.text)
    );
    const sortedGender = sortLR(genderTokens);

    // Guard against two separate numeric tokens (e.g. ["1", "105"] or ["1.", "105"]) landing in `sortedStuNum`
    if (sortedStuNum.length >= 2) {
      const firstClean = cleanNumericTokenText(sortedStuNum[0].text);
      const secondClean = cleanNumericTokenText(sortedStuNum[1].text);
      if (
        sortedSeq.length === 0 &&
        /^\d{1,2}$/.test(firstClean) &&
        /^\d{2,6}$/.test(secondClean)
      ) {
        sortedSeq.push(sortedStuNum[0]);
        sortedStuNum = sortedStuNum.slice(1);
      } else {
        // Pick the rightmost numeric token as school number; never concatenate separate tokens with join('')
        sortedStuNum = [sortedStuNum[sortedStuNum.length - 1]];
      }
    }

    // Also handle single token with internal punctuation like "1.105" or "1-105"
    let inlineSplitSeq: number | null = null;
    let inlineSplitStuNum: string | null = null;
    if (sortedStuNum.length === 1) {
      const m = sortedStuNum[0].text
        .trim()
        .match(/^(\d{1,2})[.\-):/](\d{2,5})$/);
      if (m) {
        inlineSplitSeq = Number(m[1]);
        inlineSplitStuNum = m[2];
      }
    }

    if (
      sortedFull.length > 0 &&
      sortedFirst.length === 0 &&
      sortedLast.length === 0
    ) {
      if (sortedFull.length >= 2) {
        sortedFirst = sortedFull.slice(0, -1);
        sortedLast = [sortedFull[sortedFull.length - 1]];
        if (sortedFull.length >= 3) {
          uncertaintyFlags.add('COMBINED_NAME_SPLIT');
          uncertaintyReasons.push(
            'Birleşik Ad-Soyad sütununda çok sözcüklü isim tespit edildi; ad ve soyad ayrımını kontrol edin.'
          );
        }
      } else {
        const split = splitTurkishFullName(sortedFull[0].text);
        sortedFirst = [sortedFull[0]];
        if (split.lastName) {
          uncertaintyFlags.add('COMBINED_NAME_SPLIT');
        }
      }
    } else if (
      (!hasDedicatedLastCol || surnameBodyItems.length === 0) &&
      sortedLast.length === 0 &&
      sortedFirst.length >= 2
    ) {
      sortedLast = [sortedFirst[sortedFirst.length - 1]];
      sortedFirst = sortedFirst.slice(0, -1);
    }

    const rawSeqText =
      inlineSplitSeq !== null
        ? String(inlineSplitSeq)
        : sortedSeq
            .map((t) => cleanNumericTokenText(t.text))
            .filter(Boolean)
            .join('');
    const parsedSeq = /^\d+$/.test(rawSeqText) ? Number(rawSeqText) : null;

    // Never borrow from adjacent rows! If stuNumTokens or lastTokens is empty in this row, it stays ""
    const rawStuNum =
      inlineSplitStuNum !== null
        ? inlineSplitStuNum
        : sortedStuNum.length > 0
          ? cleanNumericTokenText(sortedStuNum[0].text)
          : '';
    const studentNumber =
      rawStuNum ||
      (!hasDedicatedStuNumCol && /^\d+$/.test(rawSeqText) ? rawSeqText : '');
    const firstName = sortedFirst.map((t) => t.text).join(' ').trim();
    const lastName = sortedLast.map((t) => t.text).join(' ').trim();
    const gender = sortedGender.map((t) => t.text).join(' ').trim();

    if (!studentNumber && !firstName && !lastName && parsedSeq === null) {
      return;
    }

    const anchorTokens = rowCluster.items.map((it) => it.token);
    const allRowTokens = [
      ...anchorTokens,
      ...(hasDedicatedLastCol ? sortedLast : []),
      ...(hasDedicatedLastCol ? sortedGender : []),
    ];
    // Deduplicate tokens by id
    const uniqueRowTokens = Array.from(
      new Map(allRowTokens.map((t) => [t.id, t])).values()
    );

    // Anchor rowBbox Y-span on primary row tokens so vertical gap detection isn't distorted by a curled right column
    const anchorBbox = unionBbox(anchorTokens.map((t) => t.bbox));
    const fullUnionBbox = unionBbox(uniqueRowTokens.map((t) => t.bbox));
    const rowBbox: BoundingBox = {
      x0: fullUnionBbox.x0,
      y0: anchorTokens.length > 0 ? anchorBbox.y0 : fullUnionBbox.y0,
      x1: fullUnionBbox.x1,
      y1: anchorTokens.length > 0 ? anchorBbox.y1 : fullUnionBbox.y1,
    };

    const cellBboxes: OcrCellCoordinateMap = {};
    if (sortedSeq.length > 0) {
      cellBboxes.sequence = unionBbox(sortedSeq.map((t) => t.bbox));
    }
    if (sortedStuNum.length > 0) {
      cellBboxes.studentNumber = unionBbox(sortedStuNum.map((t) => t.bbox));
    }
    if (sortedFirst.length > 0) {
      cellBboxes.firstName = unionBbox(sortedFirst.map((t) => t.bbox));
    }
    if (sortedLast.length > 0) {
      cellBboxes.lastName = unionBbox(sortedLast.map((t) => t.bbox));
    }
    if (sortedGender.length > 0) {
      cellBboxes.gender = unionBbox(sortedGender.map((t) => t.bbox));
    }

    // Compute row confidence without allowing high-confidence sequence/gender cells to hide a 0% or low-confidence identity token
    const identityTokens = [...sortedStuNum, ...sortedFirst, ...sortedLast];
    const meanAllConf =
      uniqueRowTokens.reduce((s, t) => s + t.confidence, 0) /
      Math.max(1, uniqueRowTokens.length);
    const minIdentityConf =
      identityTokens.length > 0
        ? Math.min(...identityTokens.map((t) => t.confidence))
        : meanAllConf;
    const avgConf = Math.round(
      minIdentityConf === 0
        ? 0
        : Math.min(meanAllConf, minIdentityConf + 8)
    );

    const physicalRowId = `prow-${rIdx + 1}-${Math.round(rowBbox.y0)}-${Math.round(rowBbox.y1)}`;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    const rowObj: VerifiedOcrRosterRow = {
      rowId: `ocr-row-${rIdx + 1}`,
      physicalRowId,
      rowIndex: extractedRowsWithSortY.length + 1,
      rowKind: 'extracted',
      sequenceNumber: parsedSeq,
      studentNumber,
      firstName,
      lastName,
      gender,
      fullName,
      rowBbox,
      cellBboxes,
      sourceTokenIds: uniqueRowTokens.map((t) => t.id),
      rawCells: {
        sequence: rawSeqText,
        studentNumber,
        firstName,
        lastName,
        gender,
      },
      confidence: avgConf,
      reliabilityLevel: 'high',
      uncertaintyFlags: Array.from(uncertaintyFlags),
      uncertaintyReasons,
      validationErrors: [],
      suggestions: [],
      approvedByTeacher: false,
      approvedSignature: '',
    };

    extractedRowsWithSortY.push({
      sortY: rowCluster.meanCorrectedY,
      row: rowObj,
    });
  });

  // 6b. Preserve any unmatched surname-only rows (where school number and first name were completely unread on that line)
  for (const unmatchedSb of surnameMatchResult.unmatchedCandidates) {
    const sbTokens = unmatchedSb.tokens.filter(
      (t) =>
        !isTurkishGenderToken(t.text) &&
        !isTurkishRosterStatusOrBoardingToken(t.text)
    );
    if (sbTokens.length === 0) continue;
    const cleanText = sbTokens.map((t) => t.text).join(' ').trim();
    const avgConf = Math.round(
      sbTokens.reduce((s, t) => s + t.confidence, 0) /
        Math.max(1, sbTokens.length)
    );
    const rowBbox = unmatchedSb.bbox;
    const physicalRowId = `prow-surname-only-${Math.round(rowBbox.y0)}-${Math.round(rowBbox.y1)}`;
    const flags: UncertaintyCode[] = [];
    if (!headerDetected) {
      flags.push('HEADERLESS_COLUMN_INFERRED');
    }

    extractedRowsWithSortY.push({
      sortY: unmatchedSb.correctedY,
      row: {
        rowId: `ocr-row-unmatched-last-${unmatchedSb.candidateIndex + 1}`,
        physicalRowId,
        rowIndex: 0,
        rowKind: 'extracted',
        sequenceNumber: null,
        studentNumber: '',
        firstName: '',
        lastName: cleanText,
        gender: '',
        fullName: cleanText,
        rowBbox,
        cellBboxes: {
          lastName: unmatchedSb.bbox,
        },
        sourceTokenIds: sbTokens.map((t) => t.id),
        rawCells: {
          sequence: '',
          studentNumber: '',
          firstName: '',
          lastName: cleanText,
          gender: '',
        },
        confidence: avgConf,
        reliabilityLevel: 'invalid',
        uncertaintyFlags: flags,
        uncertaintyReasons: [],
        validationErrors: [],
        suggestions: [],
        approvedByTeacher: false,
        approvedSignature: '',
      },
    });
  }

  extractedRowsWithSortY.sort((a, b) => a.sortY - b.sortY);
  const extractedRows = extractedRowsWithSortY.map((entry, idx) => ({
    ...entry.row,
    rowId: `ocr-row-${idx + 1}`,
    rowIndex: idx + 1,
  }));

  // If header-based parsing produced 0 student rows despite having body tokens, automatically retry in headerless mode
  if (
    headerDetected &&
    !options.forceHeaderlessMode &&
    extractedRows.length === 0 &&
    rawBodyClusters.length > 0
  ) {
    return analyzeRosterTableGeometry(words, {
      ...options,
      forceHeaderlessMode: true,
    });
  }

  // 6c. Split OCR-glued row sequence numbers + student school numbers (e.g. Row 1: "1105" -> seq=1, no="105")
  splitGluedSequenceAndStudentNumbers(extractedRows);

  // 7. Missing Student Detection (Sequence Number Gaps & Physical Vertical Row Spacing Gaps)
  const finalRowsWithGapCandidates: VerifiedOcrRosterRow[] = [];
  const tableMinX =
    columns.length > 0
      ? columns[0].x0
      : Math.min(...validWords.map((w) => w.bbox.x0));
  const tableMaxX =
    columns.length > 0
      ? columns[columns.length - 1].x1
      : Math.max(...validWords.map((w) => w.bbox.x1));

  for (let i = 0; i < extractedRows.length; i++) {
    const cur = extractedRows[i];
    finalRowsWithGapCandidates.push(cur);

    if (i + 1 < extractedRows.length) {
      const next = extractedRows[i + 1];
      const curCenterY = (cur.rowBbox.y0 + cur.rowBbox.y1) / 2;
      const nextCenterY = (next.rowBbox.y0 + next.rowBbox.y1) / 2;
      const deltaY = nextCenterY - curCenterY;

      let missingCount = 0;
      let bySeqGap = false;
      let byVerticalGap = false;

      if (
        cur.sequenceNumber !== null &&
        next.sequenceNumber !== null &&
        next.sequenceNumber - cur.sequenceNumber > 1 &&
        next.sequenceNumber - cur.sequenceNumber <= 6
      ) {
        missingCount = next.sequenceNumber - cur.sequenceNumber - 1;
        bySeqGap = true;
      } else if (medianRowStepY > 12 && deltaY > medianRowStepY * 1.72) {
        const estimated = Math.round(deltaY / medianRowStepY) - 1;
        if (estimated >= 1 && estimated <= 4) {
          missingCount = estimated;
          byVerticalGap = true;
        }
      }

      if (missingCount > 0) {
        const gapTopY = cur.rowBbox.y1 + 2;
        const gapBotY = Math.max(gapTopY + 12, next.rowBbox.y0 - 2);
        const slotHeight = (gapBotY - gapTopY) / missingCount;

        for (let m = 0; m < missingCount; m++) {
          const sy0 = Math.round(gapTopY + m * slotHeight);
          const sy1 = Math.round(gapTopY + (m + 1) * slotHeight);
          const expectedSeq =
            bySeqGap && cur.sequenceNumber !== null
              ? cur.sequenceNumber + m + 1
              : null;

          const flags: UncertaintyCode[] = ['MISSING_ROW_GAP'];
          const reasons: string[] = [];
          if (bySeqGap && expectedSeq !== null) {
            flags.push('SEQUENCE_GAP');
            reasons.push(
              `Basılı sıra numaralarında boşluk tespit edildi (Sıra #${expectedSeq} okunamadı). Numara veya isim uydurulmadı.`
            );
          } else if (byVerticalGap) {
            reasons.push(
              'Komşu satırlar arasında olağan dışı fiziksel boşluk tespit edildi. Okunamayan satır için boş aday oluşturuldu.'
            );
          }

          finalRowsWithGapCandidates.push({
            rowId: `ocr-gap-${cur.rowId}-${m + 1}`,
            physicalRowId: `prow-gap-${sy0}-${sy1}`,
            rowIndex: 0,
            rowKind: 'missing_gap_candidate',
            sequenceNumber: expectedSeq,
            studentNumber: '',
            firstName: '',
            lastName: '',
            gender: '',
            fullName: '',
            rowBbox: {
              x0: tableMinX,
              y0: sy0,
              x1: tableMaxX,
              y1: sy1,
            },
            cellBboxes: {},
            sourceTokenIds: [],
            rawCells: {
              sequence: expectedSeq !== null ? String(expectedSeq) : '',
              studentNumber: '',
              firstName: '',
              lastName: '',
              gender: '',
            },
            confidence: 0,
            reliabilityLevel: 'invalid',
            uncertaintyFlags: flags,
            uncertaintyReasons: reasons,
            validationErrors: [
              'Okunamayan satır: Okul numarası, ad ve soyad fotoğraf üzerinden kontrol edilerek girilmeli veya satır silinmelidir.',
            ],
            suggestions: [],
            approvedByTeacher: false,
            approvedSignature: '',
          });
        }
      }
    }
  }

  // Re-index rows sequentially
  finalRowsWithGapCandidates.forEach((r, idx) => {
    r.rowIndex = idx + 1;
  });

  return {
    headerDetected,
    headerRowYBand,
    headerlessRecoveryRequired,
    estimatedRowSlantDeg: slant.angleDeg,
    columns,
    rows: finalRowsWithGapCandidates,
    unassignedTokens,
    medianRowHeight: medianWordH,
    medianRowStepY,
    surnameOrderAlignmentApplied: surnameMatchResult.alignmentApplied,
    surnameOrderAlignmentPairs: surnameMatchResult.alignmentPairs,
  };
}

