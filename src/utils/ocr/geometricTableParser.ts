import type {
  BoundingBox,
  ColumnRole,
  DetectedColumnBand,
  GeometricTableAnalysisResult,
  OcrCellCoordinateMap,
  OcrWordToken,
  UncertaintyCode,
  VerifiedOcrRosterRow,
} from './ocrTypes.ts';
import { splitTurkishFullName } from '../rubricLogic.ts';

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

export function classifyHeaderRole(text: string): ColumnRole | null {
  const norm = normalizeHeaderKeyword(text);
  if (!norm) return null;

  if (
    norm === 'SIRA' ||
    norm === 'SIRA NO' ||
    norm === 'SNO' ||
    norm === 'S NO' ||
    norm === 'SN'
  ) {
    return 'sequence';
  }
  if (
    norm === 'OKUL NO' ||
    norm === 'OKUL' ||
    norm === 'OKUL NUMARASI' ||
    norm === 'OGRENCI NO' ||
    norm === 'OGRENCI NUMARASI' ||
    norm === 'OGRENCI' ||
    norm === 'NO' ||
    norm === 'NUMARA' ||
    norm === 'OKULNO'
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
    norm === 'SUBE' ||
    norm === 'IMZA' ||
    norm === 'ACIKLAMA' ||
    norm === 'NOT' ||
    norm === 'DURUM'
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
 * Groups tokens into physical horizontal rows using slant-corrected Y centers and horizontal grid lines.
 */
function clusterTokensIntoPhysicalRows(
  items: InternalTokenWithCorrectedY[],
  medianH: number,
  horizontalGridLinesY: number[] = []
): PhysicalRowCluster[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.correctedY - b.correctedY);
  const maxRowDeltaY = Math.max(8, medianH * 0.62);

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

    if (!separatedByGridLine && verticalDist <= maxRowDeltaY) {
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
 * Detects whether a row cluster is a table header row.
 */
function isClusterHeaderRow(cluster: PhysicalRowCluster): boolean {
  let recognizedHeaderMatches = 0;
  const texts = cluster.items.map((it) => it.token.text);

  for (let i = 0; i < texts.length; i++) {
    if (classifyHeaderRole(texts[i])) {
      recognizedHeaderMatches++;
    } else if (
      i + 1 < texts.length &&
      classifyHeaderRole(`${texts[i]} ${texts[i + 1]}`)
    ) {
      recognizedHeaderMatches++;
    }
  }
  return recognizedHeaderMatches >= 2;
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

  // Group horizontally overlapping or aligned tokens across rows into column spans
  // First, merge same-row tokens that are close together (e.g. "AYŞE" + "NUR") if not separated by a vertical grid line
  const rowCells: { x0: number; x1: number; cx: number; cy: number; text: string }[] = [];
  const hasVertLine = (xA: number, xB: number) =>
    verticalGridLinesX.some((vx) => vx > Math.min(xA, xB) + 2 && vx < Math.max(xA, xB) - 2);

  for (const row of bodyRows) {
    const items = [...row.items].sort((a, b) => a.token.bbox.x0 - b.token.bbox.x0);
    let idx = 0;
    while (idx < items.length) {
      let x0 = items[idx].token.bbox.x0;
      let x1 = items[idx].token.bbox.x1;
      const cy = items[idx].cy;
      let text = items[idx].token.text;
      while (
        idx + 1 < items.length &&
        !hasVertLine(x1, items[idx + 1].token.bbox.x0) &&
        items[idx + 1].token.bbox.x0 - x1 <= Math.max(22, items[idx].height * 1.05) &&
        !/^\d+$/.test(text) &&
        !/^\d+$/.test(items[idx + 1].token.text)
      ) {
        idx++;
        x1 = items[idx].token.bbox.x1;
        text = `${text} ${items[idx].token.text}`;
      }
      rowCells.push({ x0, x1, cx: (x0 + x1) / 2, cy, text });
      idx++;
    }
  }

  // Sort cells by center X and cluster into columns
  const sortedCells = [...rowCells].sort((a, b) => a.cx - b.cx);
  const colClusters: typeof rowCells[] = [];

  for (const cell of sortedCells) {
    let bestCol: typeof rowCells | null = null;
    let bestDist = Infinity;
    for (const col of colClusters) {
      const colMeanX = col.reduce((s, c) => s + c.cx, 0) / col.length;
      const colMinX = Math.min(...col.map((c) => c.x0));
      const colMaxX = Math.max(...col.map((c) => c.x1));
      const separatedByGrid = hasVertLine(colMeanX, cell.cx);
      const overlapsHorizontally =
        Math.min(colMaxX, cell.x1) - Math.max(colMinX, cell.x0) > -18;
      const dist = Math.abs(cell.cx - colMeanX);
      if (!separatedByGrid && (overlapsHorizontally || dist < 42) && dist < bestDist) {
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
    const numericCount = texts.filter((t) => /^\d+$/.test(t)).length;
    const genderCount = texts.filter((t) => /^[KEke]$/.test(t)).length;
    const alphaCount = texts.filter((t) => /[A-ZÇĞİÖŞÜa-zçğıöşü]{2,}/.test(t)).length;
    const nums = texts.filter((t) => /^\d+$/.test(t)).map((t) => Number(t));

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
      alphaRatio: alphaCount / Math.max(1, texts.length),
      isSequentialSmall,
      avgTextLen:
        texts.reduce((s, t) => s + t.length, 0) / Math.max(1, texts.length),
    };
  });

  // Assign default inferred roles
  const inferredRoles: ColumnRole[] = new Array(colStats.length).fill('auxiliary');

  // Identify numeric columns
  const numericCols = colStats.filter((c) => c.numericRatio >= 0.5);
  if (numericCols.length >= 2) {
    // Leftmost small sequential is sequence, second is studentNumber
    inferredRoles[numericCols[0].colIdx] = 'sequence';
    inferredRoles[numericCols[1].colIdx] = 'studentNumber';
  } else if (numericCols.length === 1) {
    inferredRoles[numericCols[0].colIdx] = 'studentNumber';
  }

  // Identify gender column
  for (const c of colStats) {
    if (c.genderRatio >= 0.6 && inferredRoles[c.colIdx] === 'auxiliary') {
      inferredRoles[c.colIdx] = 'gender';
    }
  }

  // Identify alphabetic name columns
  const alphaCols = colStats.filter(
    (c) => c.alphaRatio >= 0.5 && inferredRoles[c.colIdx] === 'auxiliary'
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
      idx === 0 ? Math.min(minX - 20, st.centerX - 60) : (prevCenter + st.centerX) / 2;
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
          /^\d{2,6}$/.test(it.token.text.replace(/[OÖ]/g, '0').replace(/[Iİ]/g, '1'))
      )
      .sort((a, b) => a.correctedY - b.correctedY);

    if (
      anchorItems.length >= 2 &&
      anchorItems[anchorItems.length - 1].correctedY - anchorItems[0].correctedY >=
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
              sortedLR.reduce((s, it) => s + it.correctedY, 0) / sortedLR.length,
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
 * Core Geometric Table Structure Analyzer.
 * Analyzes word coordinates, physical table headers, dynamic column bands,
 * order-preserving 1-to-1 physical row matching (with zero cross-row borrowing),
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

  // 2. Cluster into initial physical rows
  const allPhysicalRows = clusterTokensIntoPhysicalRows(
    internalItems,
    medianWordH,
    options.horizontalGridLinesY
  );

  // 3. Detect header row (within first 2 clusters) unless forceHeaderlessMode is true
  let headerRowIdx = -1;
  if (!options.forceHeaderlessMode) {
    for (let i = 0; i < Math.min(2, allPhysicalRows.length); i++) {
      if (isClusterHeaderRow(allPhysicalRows[i])) {
        headerRowIdx = i;
        break;
      }
    }
  }

  const headerDetected = headerRowIdx !== -1;
  const headerCluster = headerDetected ? allPhysicalRows[headerRowIdx] : null;
  const headerRowYBand = headerCluster
    ? { y0: headerCluster.minY, y1: headerCluster.maxY }
    : null;

  const rawBodyClusters = headerDetected
    ? allPhysicalRows.slice(headerRowIdx + 1)
    : allPhysicalRows;

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

  // 5. Ensure no physical row cluster has merged two distinct studentNumber anchors
  const bodyClusters = splitMergedRowClustersByStudentNumberAnchors(
    rawBodyClusters,
    columns,
    medianWordH
  );

  const rowStepDeltas: number[] = [];
  for (let i = 1; i < bodyClusters.length; i++) {
    const dy = bodyClusters[i].meanCorrectedY - bodyClusters[i - 1].meanCorrectedY;
    if (dy > medianWordH * 0.6) {
      rowStepDeltas.push(dy);
    }
  }
  const medianRowStepY =
    rowStepDeltas.length > 0 ? median(rowStepDeltas) : Math.round(medianWordH * 2.1);

  const unassignedTokens: OcrWordToken[] = [];
  const extractedRows: VerifiedOcrRosterRow[] = [];
  const headerRefY = headerCluster?.minY ?? (bodyClusters[0]?.minY ?? 0);

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

    // Assign each token strictly within THIS physical row to its matching geometric column band
    for (const item of rowCluster.items) {
      const dyFromTop = Math.max(0, item.cy - headerRefY);

      // Check vertical alignment within the physical row cluster
      if (Math.abs(item.correctedY - rowCluster.meanCorrectedY) > medianWordH * 0.48) {
        uncertaintyFlags.add('SUSPICIOUS_ROW_ALIGNMENT');
        if (
          !uncertaintyReasons.some((r) => r.includes('dikey hizalaması'))
        ) {
          uncertaintyReasons.push(
            `"${item.token.text}" kelimesinin satır içi dikey hizalaması olağan dışı.`
          );
        }
      }

      // Find matching column at this vertical position (accounting for column drift slope)
      let matchedCol: DetectedColumnBand | null = null;
      let minColDist = Infinity;

      for (const col of columns) {
        const driftX = col.driftSlopeXPerY * dyFromTop;
        const effX0 = col.x0 + driftX;
        const effX1 = col.x1 + driftX;
        const effCenter = col.centerX + driftX;

        if (item.cx >= effX0 && item.cx <= effX1) {
          // Check if token straddles the boundary with an adjacent column
          const distToEdge = Math.min(
            Math.abs(item.token.bbox.x0 - effX0),
            Math.abs(item.token.bbox.x1 - effX1)
          );
          if (distToEdge < 3 && columns.length > 1) {
            uncertaintyFlags.add('COLUMN_BOUNDARY_OVERLAP');
          }
          matchedCol = col;
          break;
        }

        const d = Math.abs(item.cx - effCenter);
        if (d < minColDist) {
          minColDist = d;
          matchedCol = col;
        }
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

    // Sort tokens within each cell strictly left-to-right
    const sortLR = (arr: OcrWordToken[]) =>
      [...arr].sort((a, b) => a.bbox.x0 - b.bbox.x0);

    const sortedSeq = sortLR(seqTokens);
    const sortedStuNum = sortLR(stuNumTokens);
    let sortedFirst = sortLR(firstTokens);
    let sortedLast = sortLR(lastTokens);
    const sortedFull = sortLR(fullNameTokens);
    const sortedGender = sortLR(genderTokens);

    // If table used a single combined "Adı Soyadı" column, split rightmost word as surname
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
    }

    const rawSeqText = sortedSeq.map((t) => t.text).join('').trim();
    const parsedSeq = /^\d+$/.test(rawSeqText) ? Number(rawSeqText) : null;

    // Never borrow from adjacent rows! If stuNumTokens or lastTokens is empty in this row, it stays ""
    const studentNumber = sortedStuNum.map((t) => t.text).join('').trim();
    const firstName = sortedFirst.map((t) => t.text).join(' ').trim();
    const lastName = sortedLast.map((t) => t.text).join(' ').trim();
    const gender = sortedGender.map((t) => t.text).join(' ').trim();

    // Skip completely empty noise rows that have neither numbers nor names
    if (!studentNumber && !firstName && !lastName && parsedSeq === null) {
      return;
    }

    const allRowTokens = rowCluster.items.map((it) => it.token);
    const rowBbox = unionBbox(allRowTokens.map((t) => t.bbox));
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

    const avgConf = Math.round(
      allRowTokens.reduce((s, t) => s + t.confidence, 0) /
        Math.max(1, allRowTokens.length)
    );

    const physicalRowId = `prow-${rIdx + 1}-${Math.round(rowBbox.y0)}-${Math.round(rowBbox.y1)}`;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    const rowObj: VerifiedOcrRosterRow = {
      rowId: `ocr-row-${rIdx + 1}`,
      physicalRowId,
      rowIndex: extractedRows.length + 1,
      rowKind: 'extracted',
      sequenceNumber: parsedSeq,
      studentNumber,
      firstName,
      lastName,
      gender,
      fullName,
      rowBbox,
      cellBboxes,
      sourceTokenIds: allRowTokens.map((t) => t.id),
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

    extractedRows.push(rowObj);
  });

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
      } else if (
        medianRowStepY > 12 &&
        deltaY > medianRowStepY * 1.72
      ) {
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
  };
}
