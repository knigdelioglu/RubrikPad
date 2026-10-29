import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  Classroom,
  EvaluationSession,
  Rubric,
  RubricCriterion,
  Student,
} from '../types.ts';
import {
  getCriterionEarnedPoints,
  getCriterionSection,
  getEffectiveSessionRubric,
  getStudentEvaluationBreakdown,
  getStudentProgressHistory,
  isDualBookSpeakingRubric,
  isScoreAssigned,
} from './rubricLogic.ts';
import {
  LIBERATION_MONO_REGULAR_TTF_BASE64,
  LIBERATION_MONO_BOLD_TTF_BASE64,
} from './embeddedTurkishFont.ts';
import {
  loadInstitutionSettings,
  sanitizeInstitutionSettings,
} from './storageLayer.ts';

/**
 * Decodes a base64 string into a Uint8Array in both browser and Node environments.
 */
function decodeBase64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Parses the Format 4 `cmap` subtable of a TrueType (.ttf) font binary
 * and returns a lookup function mapping Unicode codePoint -> 16-bit Glyph ID (GID).
 */
function createTrueTypeGidLookup(ttfBytes: Uint8Array): (codePoint: number) => number {
  const view = new DataView(
    ttfBytes.buffer,
    ttfBytes.byteOffset,
    ttfBytes.byteLength
  );
  const numTables = view.getUint16(4, false);
  let cmapOffset = 0;

  for (let i = 0; i < numTables; i++) {
    const recordPos = 12 + i * 16;
    const tag = String.fromCharCode(
      ttfBytes[recordPos],
      ttfBytes[recordPos + 1],
      ttfBytes[recordPos + 2],
      ttfBytes[recordPos + 3]
    );
    if (tag === 'cmap') {
      cmapOffset = view.getUint32(recordPos + 8, false);
      break;
    }
  }

  if (!cmapOffset) {
    return () => 0;
  }

  const numSubtables = view.getUint16(cmapOffset + 2, false);
  let subtableOffset = 0;
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const platformID = view.getUint16(rec, false);
    const encodingID = view.getUint16(rec + 2, false);
    const offset = view.getUint32(rec + 4, false);
    if ((platformID === 3 && encodingID === 1) || platformID === 0) {
      subtableOffset = cmapOffset + offset;
      if (platformID === 3 && encodingID === 1) break;
    }
  }

  if (!subtableOffset) {
    return () => 0;
  }

  const segCount = view.getUint16(subtableOffset + 6, false) / 2;
  const endCodeOffset = subtableOffset + 14;
  const startCodeOffset = endCodeOffset + segCount * 2 + 2;
  const idDeltaOffset = startCodeOffset + segCount * 2;
  const idRangeOffsetPos = idDeltaOffset + segCount * 2;

  const cache = new Map<number, number>();

  return (codePoint: number): number => {
    const cached = cache.get(codePoint);
    if (cached !== undefined) return cached;

    for (let i = 0; i < segCount; i++) {
      const endCode = view.getUint16(endCodeOffset + i * 2, false);
      if (codePoint <= endCode) {
        const startCode = view.getUint16(startCodeOffset + i * 2, false);
        if (codePoint < startCode) {
          cache.set(codePoint, 0);
          return 0;
        }
        const idDelta = view.getInt16(idDeltaOffset + i * 2, false);
        const idRangeOffset = view.getUint16(idRangeOffsetPos + i * 2, false);
        let gid = 0;
        if (idRangeOffset === 0) {
          gid = (codePoint + idDelta) & 0xffff;
        } else {
          const glyphOffset =
            idRangeOffsetPos +
            i * 2 +
            idRangeOffset +
            (codePoint - startCode) * 2;
          const rawGid = view.getUint16(glyphOffset, false);
          gid = rawGid === 0 ? 0 : (rawGid + idDelta) & 0xffff;
        }
        cache.set(codePoint, gid);
        return gid;
      }
    }

    cache.set(codePoint, 0);
    return 0;
  };
}

let cachedRegularTtf: Uint8Array | null = null;
let cachedBoldTtf: Uint8Array | null = null;
let cachedRegularLookup: ((cp: number) => number) | null = null;
let cachedBoldLookup: ((cp: number) => number) | null = null;

function getEmbeddedFonts() {
  if (!cachedRegularTtf) {
    cachedRegularTtf = decodeBase64ToBytes(LIBERATION_MONO_REGULAR_TTF_BASE64);
    cachedRegularLookup = createTrueTypeGidLookup(cachedRegularTtf);
  }
  if (!cachedBoldTtf) {
    cachedBoldTtf = decodeBase64ToBytes(LIBERATION_MONO_BOLD_TTF_BASE64);
    cachedBoldLookup = createTrueTypeGidLookup(cachedBoldTtf);
  }
  return {
    regularTtf: cachedRegularTtf,
    boldTtf: cachedBoldTtf,
    regularGid: cachedRegularLookup!,
    boldGid: cachedBoldLookup!,
  };
}

/**
 * Normalizes typography punctuation and strips control characters / bare CR/LF/Line-Separators
 * so user text can never break out of PDF comment lines (`% UTF8: ...`) or corrupt PDF content streams,
 * while keeping 100% of Turkish characters (`ğ, Ğ, ü, Ü, ş, Ş, ı, İ, ö, Ö, ç, Ç`) intact.
 */
export function normalizePdfTextLine(text: string): string {
  return String(text ?? '')
    .replace(/[\r\n\u2028\u2029\t]+/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[—–]/g, '-')
    .replace(/[·•]/g, '|')
    .replace(/[“”"]/g, "'");
}

/**
 * Encodes a Unicode string into a 2-byte big-endian CID/GID hex string `<GGGG...>`
 * for a `/Type0` `/Identity-H` TrueType font, recording used `GID -> Unicode` pairs
 * for the font's `/ToUnicode` CMap stream.
 */
function encodeUnicodeToCidHex(
  rawText: string,
  gidLookup: (cp: number) => number,
  usedGidToUnicode: Map<number, number>
): { hexToken: string; normalizedText: string } {
  const normalizedText = normalizePdfTextLine(rawText);
  const spaceGid = gidLookup(32) || 3;
  let hex = '';

  for (const ch of normalizedText) {
    const cp = ch.codePointAt(0) ?? 32;
    let gid = gidLookup(cp);
    if (!gid) {
      gid = spaceGid;
      usedGidToUnicode.set(gid, 32);
    } else {
      usedGidToUnicode.set(gid, cp);
    }
    hex += gid.toString(16).toUpperCase().padStart(4, '0');
  }

  return {
    hexToken: `<${hex}>`,
    normalizedText,
  };
}

/**
 * Builds a standard Adobe `/ToUnicode` CMap stream mapping 2-byte Glyph IDs `<GGGG>`
 * back to 2-byte UTF-16BE Unicode code points `<UUUU>` so PDF viewers and text extractors
 * (Ghostscript, Acrobat, Chromium, PDF.js) accurately decode every Turkish character.
 */
function buildToUnicodeCMapStream(gidToUnicode: Map<number, number>): string {
  const entries = Array.from(gidToUnicode.entries()).sort((a, b) => a[0] - b[0]);
  const bfLines = entries
    .map(
      ([gid, cp]) =>
        `<${gid.toString(16).toUpperCase().padStart(4, '0')}> <${cp
          .toString(16)
          .toUpperCase()
          .padStart(4, '0')}>`
    )
    .join('\n');

  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    `${entries.length} beginbfchar`,
    bfLines,
    'endbfchar',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
}

/**
 * Splits an array into chunks of at most `chunkSize` items.
 */
function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Generates a real, multi-page paginated PDF binary (`%PDF-1.4`) for a session (P1 #8 & P1 Turkish Font Fix).
 * - Embeds genuine Unicode TrueType fonts (`LiberationMono-Regular.ttf` and `LiberationMono-Bold.ttf`)
 *   using `/Type0` + `/CIDFontType2` + `/Identity-H` + `/CIDToGIDMap /Identity` + `/ToUnicode` CMap.
 * - Encodes all text operators as 2-byte TrueType Glyph IDs (`<GGGG...> Tj`) so Turkish characters
 *   (`ğ, Ğ, ü, Ü, ş, Ş, ı, İ, ö, Ö, ç, Ç`) render accurately in every PDF reader and extract cleanly as Unicode.
 * - Includes ALL rubric criteria (no `.slice(0, 8)` truncation!) both in the full criteria legend
 *   and in every student's score breakdown.
 * - Validates that the rubric and classroom belong to the session (P2 Export Security).
 */
export type PdfColumnPreset = 'names_only' | 'with_scores' | 'with_notes';
export type DualReportMode = 'both' | 'book' | 'speaking';

export interface PdfColumnOptions {
  preset?: PdfColumnPreset;
  showCriterionScores?: boolean;
  showFinalScoreAndLevel?: boolean;
  showObservationNotes?: boolean;
  showSignatures?: boolean;
  dualReportMode?: DualReportMode;
  schoolName?: string;
  teacherName?: string;
  principalName?: string;
}

export function resolvePdfColumnOptions(
  options?: PdfColumnOptions
): Required<PdfColumnOptions> {
  const preset: PdfColumnPreset = options?.preset || 'with_notes';
  const storedInstitution = loadInstitutionSettings();
  const sanitizedOverrides = sanitizeInstitutionSettings({
    schoolName: options?.schoolName ?? storedInstitution.schoolName,
    teacherName: options?.teacherName ?? storedInstitution.teacherName,
    principalName: options?.principalName ?? storedInstitution.principalName,
  });
  const defaultByPreset: Record<
    PdfColumnPreset,
    Omit<
      Required<PdfColumnOptions>,
      'preset' | 'dualReportMode' | 'schoolName' | 'teacherName' | 'principalName'
    >
  > = {
    names_only: {
      showCriterionScores: false,
      showFinalScoreAndLevel: false,
      showObservationNotes: false,
      showSignatures: true,
    },
    with_scores: {
      showCriterionScores: true,
      showFinalScoreAndLevel: true,
      showObservationNotes: false,
      showSignatures: true,
    },
    with_notes: {
      showCriterionScores: true,
      showFinalScoreAndLevel: true,
      showObservationNotes: true,
      showSignatures: true,
    },
  };
  const base = defaultByPreset[preset];
  return {
    preset,
    showCriterionScores:
      options?.showCriterionScores ?? base.showCriterionScores,
    showFinalScoreAndLevel:
      options?.showFinalScoreAndLevel ?? base.showFinalScoreAndLevel,
    showObservationNotes:
      options?.showObservationNotes ?? base.showObservationNotes,
    showSignatures: options?.showSignatures ?? base.showSignatures,
    dualReportMode: options?.dualReportMode ?? 'both',
    schoolName: sanitizedOverrides.schoolName,
    teacherName: sanitizedOverrides.teacherName,
    principalName: sanitizedOverrides.principalName,
  };
}

type PdfTextWriter = (ops: string[], font: '/F1' | '/F2', size: number, x: number, y: number, text: string) => void;

function writeOfficialSignatureBlock(
  ops: string[], write: PdfTextWriter, teacherName: string, principalName: string,
  pageCounterText?: string
): void {
  // Keep names and their titles in separate, aligned lines, even when names are not set.
  const nameSize = (name: string) => Math.min(8, 260 / Math.max(name.length * 0.6, 1));
  if (teacherName) write(ops, '/F2', nameSize(teacherName), 36, 40, teacherName);
  if (principalName) write(ops, '/F2', nameSize(principalName), 340, 40, principalName);
  write(ops, '/F1', 7.5, 36, 27, 'Türk Dili ve Edebiyatı Öğretmeni');
  write(ops, '/F1', 7.5, 340, 27, 'Okul Müdürü');
  if (pageCounterText) write(ops, '/F2', 7.5, 700, 40, pageCounterText);
}

function formatReportClassName(classroom: Classroom | null | undefined): string {
  if (!classroom) return 'Belirtilmedi';
  const name = classroom.name.trim();
  const grade = classroom.gradeLevel?.match(/^\s*(\d{1,2})(?:\D|$)/)?.[1];
  // Current records store a branch such as "A" separately; older records may
  // already contain a complete name such as "11-A Sınıfı".
  if (grade && /^[A-ZÇĞİÖŞÜ]{1,10}$/.test(name)) return `${grade}/${name} Sınıfı`;
  return name || classroom.gradeLevel || 'Belirtilmedi';
}

export function generatePaginatedSessionPdfBytes(
  session: EvaluationSession,
  rubric: Rubric | null | undefined,
  classroom: Classroom | null | undefined,
  students: Student[],
  rowsPerPage = 16,
  columnOptions?: PdfColumnOptions
): Uint8Array {
  const colOpts = resolvePdfColumnOptions(columnOptions);
  const effectiveRubric = getEffectiveSessionRubric(
    session,
    rubric ? { [rubric.id]: rubric } : {}
  );

  if (!effectiveRubric || effectiveRubric.id !== session.rubricId) {
    throw new Error('PDF oluşturulamadı: Oturum rubriği doğrulanamadı.');
  }

  const allowedClassIds = new Set(
    session.classIds && session.classIds.length > 0
      ? session.classIds
      : [session.classId]
  );

  if (!classroom || !allowedClassIds.has(classroom.id)) {
    throw new Error('PDF oluşturulamadı: Sınıf bilgisi oturumla eşleşmiyor.');
  }

  const { regularGid, boldGid } = getEmbeddedFonts();
  const usedRegularGids = new Map<number, number>();
  const usedBoldGids = new Map<number, number>();

  const pushTextOp = (
    ops: string[],
    fontTag: '/F1' | '/F2',
    fontSize: number,
    x: number,
    y: number,
    text: string
  ) => {
    const isBold = fontTag === '/F2';
    const { hexToken, normalizedText } = encodeUnicodeToCidHex(
      text,
      isBold ? boldGid : regularGid,
      isBold ? usedBoldGids : usedRegularGids
    );
    ops.push(`% UTF8: ${normalizedText}`);
    ops.push('BT');
    ops.push(`${fontTag} ${fontSize} Tf`);
    ops.push(`${x} ${y} Td`);
    ops.push(`${hexToken} Tj`);
    ops.push('ET');
  };

  const allCriteria: RubricCriterion[] = effectiveRubric.criteria || [];
  // All criterion columns belong on the student's single table row.
  const criterionBands = chunkArray(allCriteria, Math.max(1, allCriteria.length));
  const criteriaPerBand = Math.max(1, allCriteria.length);
  const tableFontSize = colOpts.showCriterionScores
    ? Math.min(7.2, 770 / ((33 + allCriteria.length * 9 + (colOpts.showFinalScoreAndLevel ? 38 : 0)) * 0.6))
    : 7.2;

  // Strictly isolate students to the requested `classroom.id` so multi-class sessions never leak another class's roster into this classroom's official PDF report
  const sessionStudents = students
    .filter((s) => s.classId === classroom.id && !s.archived)
    .sort((a, b) =>
      a.studentNumber.localeCompare(b.studentNumber, undefined, {
        numeric: true,
      })
    );

  // Reserve room for the footer when every student has an observation note.
  const maxRowsForLegend = (criterionCount: number) => {
    const firstRowY = 532 - Math.ceil(criterionCount / 2) * 10 - 33;
    const rowHeight = colOpts.showObservationNotes ? 25 : 15;
    return Math.max(1, Math.floor((firstRowY - 68) / rowHeight));
  };
  const effectiveRowsPerPage = Math.min(rowsPerPage, maxRowsForLegend(allCriteria.length));

  const studentPages = chunkArray(sessionStudents, effectiveRowsPerPage);
  const isDualRubric = isDualBookSpeakingRubric(effectiveRubric);
  const includeBookSection =
    !isDualRubric ||
    colOpts.dualReportMode === 'both' ||
    colOpts.dualReportMode === 'book';
  const includeSpeakingSection =
    isDualRubric &&
    (colOpts.dualReportMode === 'both' || colOpts.dualReportMode === 'speaking');

  const speakingCriteria = isDualRubric
    ? allCriteria.filter(
        (c, idx) => getCriterionSection(c, idx, effectiveRubric) === 'speaking'
      )
    : [];
  const speakingStudentPages = includeSpeakingSection
    ? chunkArray(sessionStudents, Math.min(rowsPerPage, maxRowsForLegend(speakingCriteria.length)))
    : [];
  const bookStudentPages = includeBookSection ? studentPages : [];
  const totalPages = bookStudentPages.length + speakingStudentPages.length;
  const pageStreams: string[] = [];

  bookStudentPages.forEach((pageStudents, pageIdx) => {
    const ops: string[] = [];

    // 1. Header Title with embedded Unicode TrueType font
    const schoolPrefix = colOpts.schoolName ? `${colOpts.schoolName} — ` : '';
    pushTextOp(
      ops,
      '/F2',
      11.5,
      36,
      560,
      isDualRubric
        ? `${schoolPrefix}ÖLÇÜT TEMELLİ DEĞERLENDİRME RAPORU (KİTAP SUNUMU - 100 PUAN) - ${formatReportClassName(classroom)}`
        : `${schoolPrefix}ÖLÇÜT TEMELLİ DEĞERLENDİRME RAPORU - ${formatReportClassName(classroom)}`
    );

    // 2. Subtitle Metadata
    const schoolMetaPrefix = colOpts.schoolName
      ? `Okul: ${colOpts.schoolName} | `
      : '';
    pushTextOp(
      ops,
      '/F1',
      8,
      36,
      545,
      `${schoolMetaPrefix}Oturum: ${session.title} | Rubrik: ${effectiveRubric.title} (${allCriteria.length} Ölçüt) | Tarih: ${session.date} | Sayfa ${
        pageIdx + 1
      }/${totalPages}`
    );

    // 3. Full Rubric Criteria Legend
    const criteriaLegendChunks = chunkArray(
      allCriteria.map((c, idx) =>
        colOpts.showCriterionScores
          ? `K${idx + 1}: ${c.title} (${c.maxPoints ?? c.weight}P / %${c.weight})`
          : `K${idx + 1}: ${c.title}`
      ),
      2
    );

    let legendY = 532;
    criteriaLegendChunks.forEach((lineItems) => {
      pushTextOp(ops, '/F1', 7, 36, legendY, lineItems.join('   |   '));
      legendY -= 10;
    });

    const headerDividerY = legendY - 2;
    ops.push(`0.75 w 36 ${headerDividerY} m 806 ${headerDividerY} l S`);

    // 4. Table Header
    let tableHeaderY = headerDividerY - 12;
    if (!colOpts.showCriterionScores && !colOpts.showFinalScoreAndLevel) {
      const headerLine = colOpts.showObservationNotes
        ? 'No     Ad Soyad                           Gözlem Notları'
        : 'No     Ad Soyad';
      pushTextOp(ops, '/F2', 7.5, 36, tableHeaderY, headerLine);
      tableHeaderY -= 11;
    } else {
      criterionBands.forEach((band, bandIdx) => {
        const bandOffset = bandIdx * criteriaPerBand;
        const critHeaders = colOpts.showCriterionScores
          ? band
              .map(
                (c, idx) =>
                  `K${bandOffset + idx + 1}(${c.maxPoints ?? c.weight}P)`.padEnd(
                    8,
                    ' '
                  )
              )
              .join(' ')
          : '';

        const scoreCols = colOpts.showFinalScoreAndLevel
          ? isDualRubric
            ? '  İçerik(70) Sunum(%30)   Kitap(100)'
            : '  Bireysel  Grup    Kesin(100)'
          : '';

        const headerLine =
          bandIdx === 0
            ? `No     Ad Soyad                  ${critHeaders}${scoreCols}`
            : critHeaders;

        pushTextOp(ops, '/F2', tableFontSize, 36, tableHeaderY, headerLine);
        tableHeaderY -= 11;
      });
    }

    const tableTopLineY = tableHeaderY + 5;
    ops.push(`0.5 w 36 ${tableTopLineY} m 806 ${tableTopLineY} l S`);

    // 5. Student Rows
    let y = tableTopLineY - 13;
    pageStudents.forEach((stu) => {
      const ev = session.evaluations[stu.id];
      const { individualCalc, groupCalc, effectiveCalc, activeSource } =
        getStudentEvaluationBreakdown(effectiveRubric, ev);

      const activeScores =
        activeSource === 'group'
          ? ev?.groupCriterionScores || {}
          : ev?.criterionScores || {};
      const activeDirect =
        activeSource === 'group'
          ? ev?.groupDirectScores || {}
          : ev?.directCriterionScores || {};

      const dual = effectiveCalc.dualResult;

      const indStr = (
        isDualRubric && dual
          ? dual.isContentComplete
            ? `${dual.contentScoreOutOf70}/70`
            : dual.completedContentCount > 0
            ? `Eksik(${dual.completedContentCount}/${dual.totalContentCount})`
            : '-'
          : individualCalc.finalScoreOutOf100 !== null
          ? String(individualCalc.finalScoreOutOf100)
          : individualCalc.completedCriteriaCount > 0
          ? `Eksik(${individualCalc.completedCriteriaCount}/${individualCalc.totalCriteriaCount})`
          : '-'
      ).padEnd(isDualRubric ? 10 : 8, ' ');

      const grpStr = (
        isDualRubric && dual
          ? dual.completedSpeakingCount > 0
            ? `${dual.speakingContributionOutOf30}/30`
            : '-'
          : groupCalc.finalScoreOutOf100 !== null
          ? String(groupCalc.finalScoreOutOf100)
          : groupCalc.completedCriteriaCount > 0
          ? `Eksik(${groupCalc.completedCriteriaCount}/${groupCalc.totalCriteriaCount})`
          : '-'
      ).padEnd(isDualRubric ? 12 : 6, ' ');

      const finalStr = (
        isDualRubric && dual
          ? dual.finalBookPresentationScoreOutOf100 !== null
            ? String(dual.finalBookPresentationScoreOutOf100)
            : effectiveCalc.completedCriteriaCount > 0
            ? `Taslak(${effectiveCalc.completedCriteriaCount}/${effectiveCalc.totalCriteriaCount})`
            : '-'
          : effectiveCalc.finalScoreOutOf100 !== null
          ? String(effectiveCalc.finalScoreOutOf100)
          : effectiveCalc.completedCriteriaCount > 0
          ? `Taslak(${effectiveCalc.completedCriteriaCount}/${effectiveCalc.totalCriteriaCount})`
          : '-'
      ).padEnd(10, ' ');

      if (!colOpts.showCriterionScores && !colOpts.showFinalScoreAndLevel) {
        const rowLine = `${stu.studentNumber.padEnd(6, ' ')} ${stu.fullName
          .slice(0, 32)
          .padEnd(34, ' ')}`;
        pushTextOp(ops, '/F1', 7.5, 36, y, rowLine);
        y -= 12;
      } else {
        criterionBands.forEach((band, bandIdx) => {
          const bandOffset = bandIdx * criteriaPerBand;
          const critVals = colOpts.showCriterionScores
            ? band
                .map((c, idx) => {
                  const codePrefix = `K${bandOffset + idx + 1}:`;
                  const d = activeDirect[c.id];
                  if (isScoreAssigned(d)) {
                    return `${codePrefix}${d}`.padEnd(8, ' ');
                  }
                  const p = activeScores[c.id];
                  if (!isScoreAssigned(p)) {
                    return `${codePrefix}-`.padEnd(8, ' ');
                  }
                  const maxLvl = Math.max(...c.levels.map((l) => l.points), 1);
                  const displayVal =
                    isDualRubric || maxLvl === 2
                      ? getCriterionEarnedPoints(c, p, d) ?? p
                      : p;
                  return `${codePrefix}${displayVal}`.padEnd(8, ' ');
                })
                .join(' ')
            : '';

          const scoreVals = colOpts.showFinalScoreAndLevel
            ? `  ${indStr}  ${grpStr}  ${finalStr}`
            : '';

          const rowLine = `${stu.studentNumber.padEnd(6, ' ')} ${stu.fullName
            .slice(0, 24)
            .padEnd(25, ' ')} ${critVals}${scoreVals}`;

          pushTextOp(ops, '/F1', tableFontSize, 36, y, rowLine);
          y -= 12;
        });
      }

      // Include student/group observation note if enabled and present
      if (colOpts.showObservationNotes) {
        const combinedNote = [ev?.note, ev?.groupNote]
          .filter((n) => Boolean(n && n.trim()))
          .join(' | ');
        if (combinedNote) {
          pushTextOp(
            ops,
            '/F1',
            6.6,
            48,
            y + 2,
            `Not: ${combinedNote.slice(0, 110)}`
          );
          y -= 10;
        }
      }

      y -= 3;
    });

    // 6. Footer & Official Signature Block on every page
    if (colOpts.showSignatures) {
      ops.push('0.5 w 36 54 m 806 54 l S');
      writeOfficialSignatureBlock(ops, pushTextOp, colOpts.teacherName, colOpts.principalName, `Sayfa ${pageIdx + 1} / ${totalPages}`);
    }

    pageStreams.push(ops.join('\n'));
  });

  // Dedicated Speaking Exam Report Pages (100 Puan) for dual book + speaking rubrics
  speakingStudentPages.forEach((pageStudents, spkPageIdx) => {
    const ops: string[] = [];
    const globalPageNum = bookStudentPages.length + spkPageIdx + 1;
    const schoolPrefix = colOpts.schoolName ? `${colOpts.schoolName} — ` : '';
    const schoolMetaPrefix = colOpts.schoolName
      ? `Okul: ${colOpts.schoolName} | `
      : '';

    pushTextOp(
      ops,
      '/F2',
      11.5,
      36,
      560,
      `${schoolPrefix}KONUŞMA SINAVI DEĞERLENDİRME RAPORU (100 PUAN) - ${formatReportClassName(classroom)}`
    );

    pushTextOp(
      ops,
      '/F1',
      8,
      36,
      545,
      `${schoolMetaPrefix}Oturum: ${session.title} | Ortak Konuşma Ölçütleri (${speakingCriteria.length} Ölçüt / 100 Puan) | Tarih: ${session.date} | Sayfa ${globalPageNum}/${totalPages}`
    );

    const speakingLegendChunks = chunkArray(
      speakingCriteria.map((c, idx) =>
        colOpts.showCriterionScores
          ? `S${idx + 1}: ${c.title} (${c.maxPoints ?? c.weight}P)`
          : `S${idx + 1}: ${c.title}`
      ),
      2
    );

    let legendY = 532;
    speakingLegendChunks.forEach((lineItems) => {
      pushTextOp(ops, '/F1', 7, 36, legendY, lineItems.join('   |   '));
      legendY -= 10;
    });

    const headerDividerY = legendY - 2;
    ops.push(`0.75 w 36 ${headerDividerY} m 806 ${headerDividerY} l S`);

    let tableHeaderY = headerDividerY - 12;
    const spkCritHeaders = colOpts.showCriterionScores
      ? speakingCriteria
          .map(
            (c, idx) =>
              `S${idx + 1}(${c.maxPoints ?? c.weight}P)`.padEnd(9, ' ')
          )
          .join(' ')
      : '';
    const spkScoreCols = colOpts.showFinalScoreAndLevel
      ? '  Konuşma Sınavı (100)'
      : '';

    pushTextOp(
      ops,
      '/F2',
      7.2,
      36,
      tableHeaderY,
      `No     Ad Soyad                  ${spkCritHeaders}${spkScoreCols}`
    );
    tableHeaderY -= 11;

    const tableTopLineY = tableHeaderY + 5;
    ops.push(`0.5 w 36 ${tableTopLineY} m 806 ${tableTopLineY} l S`);

    let y = tableTopLineY - 13;
    pageStudents.forEach((stu) => {
      const ev = session.evaluations[stu.id];
      const { effectiveCalc, activeSource } = getStudentEvaluationBreakdown(
        effectiveRubric,
        ev
      );
      const dual = effectiveCalc.dualResult;

      const activeScores =
        activeSource === 'group'
          ? ev?.groupCriterionScores || {}
          : ev?.criterionScores || {};
      const activeDirect =
        activeSource === 'group'
          ? ev?.groupDirectScores || {}
          : ev?.directCriterionScores || {};

      const spkVals = colOpts.showCriterionScores
        ? speakingCriteria
            .map((c, idx) => {
              const earned = getCriterionEarnedPoints(
                c,
                activeScores[c.id],
                activeDirect[c.id]
              );
              const valStr = earned !== null ? String(earned) : '-';
              return `S${idx + 1}:${valStr}`.padEnd(9, ' ');
            })
            .join(' ')
        : '';

      const spkFinalStr = (
        dual && dual.finalSpeakingScoreOutOf100 !== null
          ? `Konuşma Sınavı Notu: ${dual.finalSpeakingScoreOutOf100}/100`
          : dual && dual.completedSpeakingCount > 0
          ? `Eksik(${dual.completedSpeakingCount}/${dual.totalSpeakingCount})`
          : '-'
      ).padEnd(28, ' ');

      const rowLine = `${stu.studentNumber.padEnd(6, ' ')} ${stu.fullName
        .slice(0, 24)
        .padEnd(25, ' ')} ${spkVals}${
        colOpts.showFinalScoreAndLevel ? `  ${spkFinalStr}` : ''
      }`;

      pushTextOp(ops, '/F1', 7.2, 36, y, rowLine);
      y -= 12;

      if (colOpts.showObservationNotes) {
        const combinedNote = [ev?.note, ev?.groupNote]
          .filter((n) => Boolean(n && n.trim()))
          .join(' | ');
        if (combinedNote) {
          pushTextOp(
            ops,
            '/F1',
            6.6,
            48,
            y + 2,
            `Not: ${combinedNote.slice(0, 110)}`
          );
          y -= 10;
        }
      }

      y -= 3;
    });

    if (colOpts.showSignatures) {
      ops.push('0.5 w 36 54 m 806 54 l S');
      writeOfficialSignatureBlock(ops, pushTextOp, colOpts.teacherName, colOpts.principalName, `Sayfa ${globalPageNum} / ${totalPages}`);
    }

    pageStreams.push(ops.join('\n'));
  });

  return assemblePdfDocumentFromPageStreams(
    pageStreams,
    usedRegularGids,
    usedBoldGids
  );
}

/**
 * Shared PDF 1.4 binary assembler with embedded TrueType Turkish fonts.
 */
function assemblePdfDocumentFromPageStreams(
  pageStreams: string[],
  usedRegularGids: Map<number, number>,
  usedBoldGids: Map<number, number>
): Uint8Array {
  const { regularTtf, boldTtf } = getEmbeddedFonts();
  const regularToUnicodeCMap = buildToUnicodeCMapStream(usedRegularGids);
  const boldToUnicodeCMap = buildToUnicodeCMapStream(usedBoldGids);

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let currentByteOffset = 0;
  const offsets: number[] = [0];

  const pushStr = (s: string) => {
    const encoded = encoder.encode(s);
    chunks.push(encoded);
    currentByteOffset += encoded.byteLength;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    currentByteOffset += b.byteLength;
  };
  const startObj = (objNum: number) => {
    offsets[objNum] = currentByteOffset;
    pushStr(`${objNum} 0 obj\n`);
  };
  const endObj = () => {
    pushStr('\nendobj\n');
  };

  // Binary PDF 1.4 header
  pushBytes(
    new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3,
      0xcf, 0xd3, 0x0a,
    ])
  );

  const firstPageObjNum = 13;
  const pageObjNums: number[] = [];
  for (let i = 0; i < pageStreams.length; i++) {
    pageObjNums.push(firstPageObjNum + i * 2);
  }

  // 1 0 obj: Catalog
  startObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R /Lang (tr-TR) >>');
  endObj();

  // 2 0 obj: Pages
  startObj(2);
  pushStr(
    `<< /Type /Pages /Kids [${pageObjNums
      .map((n) => `${n} 0 R`)
      .join(' ')}] /Count ${pageObjNums.length} >>`
  );
  endObj();

  // 3..7: Font F1 (LiberationMono-Regular Type0 Unicode)
  startObj(3);
  pushStr(
    '<< /Type /Font /Subtype /Type0 /BaseFont /LiberationMono /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 7 0 R >>'
  );
  endObj();

  startObj(4);
  pushStr(
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /LiberationMono /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 600 /CIDToGIDMap /Identity >>'
  );
  endObj();

  startObj(5);
  pushStr(
    '<< /Type /FontDescriptor /FontName /LiberationMono /Flags 33 /FontBBox [-300 -300 1000 1000] /ItalicAngle 0 /Ascent 832 /Descent -300 /CapHeight 700 /StemV 80 /FontFile2 6 0 R >>'
  );
  endObj();

  startObj(6);
  pushStr(
    `<< /Length ${regularTtf.byteLength} /Length1 ${regularTtf.byteLength} >>\nstream\n`
  );
  pushBytes(regularTtf);
  pushStr('\nendstream');
  endObj();

  const regCmapBytes = encoder.encode(regularToUnicodeCMap);
  startObj(7);
  pushStr(`<< /Length ${regCmapBytes.byteLength} >>\nstream\n`);
  pushBytes(regCmapBytes);
  pushStr('\nendstream');
  endObj();

  // 8..12: Font F2 (LiberationMono-Bold Type0 Unicode)
  startObj(8);
  pushStr(
    '<< /Type /Font /Subtype /Type0 /BaseFont /LiberationMono-Bold /Encoding /Identity-H /DescendantFonts [9 0 R] /ToUnicode 12 0 R >>'
  );
  endObj();

  startObj(9);
  pushStr(
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /LiberationMono-Bold /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 10 0 R /DW 600 /CIDToGIDMap /Identity >>'
  );
  endObj();

  startObj(10);
  pushStr(
    '<< /Type /FontDescriptor /FontName /LiberationMono-Bold /Flags 33 /FontBBox [-300 -300 1000 1000] /ItalicAngle 0 /Ascent 832 /Descent -300 /CapHeight 700 /StemV 120 /FontFile2 11 0 R >>'
  );
  endObj();

  startObj(11);
  pushStr(
    `<< /Length ${boldTtf.byteLength} /Length1 ${boldTtf.byteLength} >>\nstream\n`
  );
  pushBytes(boldTtf);
  pushStr('\nendstream');
  endObj();

  const boldCmapBytes = encoder.encode(boldToUnicodeCMap);
  startObj(12);
  pushStr(`<< /Length ${boldCmapBytes.byteLength} >>\nstream\n`);
  pushBytes(boldCmapBytes);
  pushStr('\nendstream');
  endObj();

  // 13..: Pages and Content Streams
  let nextObjNum = firstPageObjNum;
  for (const streamContent of pageStreams) {
    const pageObjNum = nextObjNum++;
    const contentObjNum = nextObjNum++;
    const contentBytes = encoder.encode(streamContent);

    startObj(pageObjNum);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 8 0 R >> >> /Contents ${contentObjNum} 0 R >>`
    );
    endObj();

    startObj(contentObjNum);
    pushStr(`<< /Length ${contentBytes.byteLength} >>\nstream\n`);
    pushBytes(contentBytes);
    pushStr('\nendstream');
    endObj();
  }

  const totalObjCount = nextObjNum;
  const xrefOffset = currentByteOffset;
  let trailer = `xref\n0 ${totalObjCount}\n`;
  trailer += '0000000000 65535 f \n';
  for (let i = 1; i < totalObjCount; i++) {
    trailer += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  trailer += `trailer\n<< /Size ${totalObjCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  pushStr(trailer);

  const output = new Uint8Array(currentByteOffset);
  let pos = 0;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return output;
}

/**
 * Generates a parent-shareable & printable Individual Student Progress Portfolio PDF (`%PDF-1.4`).
 * Designed for teachers to print or share directly with parents, including:
 * - Official header (`VELİ BİLGİLENDİRME VE ÖĞRENCİ GELİŞİM RAPORU`)
 * - Student & Classroom metadata + KPI summary (`Tamamlanan Oturum`, `Dönem Ortalaması`, `Son Kesin Puan`, `Gelişim Farkı`)
 * - Session-by-session rubric criterion breakdowns and teacher observation notes
 * - Parent & Teacher signature block (`Ders Öğretmeni İmza`, `Okul Müdürlüğü Onay`, `Veli Adı Soyadı ve İmza`)
 */
export function generateStudentPortfolioPdfBytes(
  student: Student,
  classroom: Classroom | null | undefined,
  sessions: EvaluationSession[],
  rubricsById: Record<string, Rubric>,
  columnOptions?: PdfColumnOptions
): Uint8Array {
  const colOpts = resolvePdfColumnOptions(columnOptions);
  const { regularGid, boldGid } = getEmbeddedFonts();
  const usedRegularGids = new Map<number, number>();
  const usedBoldGids = new Map<number, number>();

  const pushTextOp = (
    ops: string[],
    fontTag: '/F1' | '/F2',
    fontSize: number,
    x: number,
    y: number,
    text: string
  ) => {
    const isBold = fontTag === '/F2';
    const { hexToken, normalizedText } = encodeUnicodeToCidHex(
      text,
      isBold ? boldGid : regularGid,
      isBold ? usedBoldGids : usedRegularGids
    );
    ops.push(`% UTF8: ${normalizedText}`);
    ops.push('BT');
    ops.push(`${fontTag} ${fontSize} Tf`);
    ops.push(`${x} ${y} Td`);
    ops.push(`${hexToken} Tj`);
    ops.push('ET');
  };

  const history = getStudentProgressHistory(student.id, sessions, rubricsById);
  const scores = history.map((h) => h.scoreOutOf100);
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
  const latestScore = scores.length > 0 ? scores[scores.length - 1] : 0;
  const delta = scores.length > 1 ? latestScore - scores[0] : 0;

  const sessionChunks = chunkArray(history, 4);
  const totalPages = sessionChunks.length;
  const pageStreams: string[] = [];
  const reportDate = new Date().toISOString().slice(0, 10);

  sessionChunks.forEach((pageHistory, pageIdx) => {
    const ops: string[] = [];

    // Header Banner
    const schoolPrefix = colOpts.schoolName ? `${colOpts.schoolName} — ` : '';
    const schoolMetaPrefix = colOpts.schoolName
      ? `Okul: ${colOpts.schoolName} | `
      : '';
    pushTextOp(
      ops,
      '/F2',
      12,
      36,
      560,
      `${schoolPrefix}ÖĞRENCİ GELİŞİM VE PERFORMANS RAPORU — ${student.fullName}`
    );

    pushTextOp(
      ops,
      '/F1',
      8.5,
      36,
      544,
      `${schoolMetaPrefix}Okul No: #${student.studentNumber} | Sınıf: ${
        formatReportClassName(classroom)
      } | Ders: ${
        classroom?.subject || 'Türk Dili ve Edebiyatı'
      } | Rapor Tarihi: ${reportDate} | Sayfa ${pageIdx + 1}/${totalPages}`
    );

    if (colOpts.showFinalScoreAndLevel) {
      const deltaText = delta > 0 ? `+${delta} Puan` : `${delta} Puan`;
      pushTextOp(
        ops,
        '/F2',
        8.5,
        36,
        528,
        `GENEL ÖZET -> Tamamlanan Değerlendirme: ${history.length}  |  Dönem Ortalaması: ${avgScore}/100  |  Son Kesin Puan: ${latestScore}/100  |  Gelişim Farkı: ${deltaText}`
      );
    }

    ops.push('0.75 w 36 520 m 806 520 l S');

    let y = 504;

    if (pageHistory.length === 0) {
      pushTextOp(
        ops,
        '/F1',
        9,
        36,
        y,
        'Bu öğrenci için henüz tamamlanmış kesin değerlendirme oturumu bulunmamaktadır.'
      );
    } else {
      pageHistory.forEach((item, idx) => {
        const seqNum = pageIdx * 4 + idx + 1;
        pushTextOp(
          ops,
          '/F2',
          8.5,
          36,
          y,
          `${seqNum}. OTURUM: ${item.sessionTitle} (${item.date}) — Rubrik: ${item.rubricTitle}`
        );
        y -= 12;

        if (colOpts.showFinalScoreAndLevel) {
          if (item.isDualEvaluation) {
            pushTextOp(
              ops,
              '/F2',
              8,
              46,
              y,
              `Kesin Puan: ${item.scoreOutOf100} / 100   |   Kitap Sunumu Notu: ${
                item.bookPresentationScoreOutOf100 ?? item.scoreOutOf100
              } / 100 (İçerik: ${item.contentScoreOutOf70 ?? 0}/70 + %30 Konuşma: ${
                item.speakingContributionOutOf30 ?? 0
              }/30)   |   Konuşma Sınavı Notu: ${
                item.speakingExamScoreOutOf100 ?? '-'
              } / 100`
            );
          } else {
            pushTextOp(
              ops,
              '/F2',
              8,
              46,
              y,
              `Kesin Puan: ${item.scoreOutOf100} / 100${
                item.individualScoreOutOf100 !== null
                  ? `   |   Bireysel: ${item.individualScoreOutOf100}`
                  : ''
              }${
                item.groupScoreOutOf100 !== null
                  ? `   |   Grup: ${item.groupScoreOutOf100}`
                  : ''
              }`
            );
          }
          y -= 12;
        }

        const critPairs = chunkArray(
          item.criterionBreakdown.map((cb, cIdx) =>
            colOpts.showCriterionScores
              ? `Ö${cIdx + 1} ${cb.criterionTitle.slice(0, 32)}: ${
                  cb.selectedPoints
                }/${cb.maxPoints}P (%${cb.scorePercent})`
              : `Ö${cIdx + 1} ${cb.criterionTitle.slice(0, 38)}`
          ),
          2
        );

        critPairs.forEach((pair) => {
          pushTextOp(ops, '/F1', 7.3, 46, y, pair.join('     |     '));
          y -= 10;
        });

        if (colOpts.showObservationNotes && (item.note || item.groupNote)) {
          const noteLine = [
            item.note ? `Bireysel Gözlem: ${item.note}` : '',
            item.groupNote ? `Grup Gözlemi: ${item.groupNote}` : '',
          ]
            .filter(Boolean)
            .join(' | ');
          pushTextOp(
            ops,
            '/F1',
            7.2,
            46,
            y,
            `Öğretmen Notu: ${noteLine.slice(0, 115)}`
          );
          y -= 11;
        }

        ops.push(`0.35 w 36 ${y + 3} m 806 ${y + 3} l S`);
        y -= 10;
      });
    }

    // Official Teacher & Principal Signature Block
    if (colOpts.showSignatures) {
      ops.push('0.5 w 36 58 m 806 58 l S');
      writeOfficialSignatureBlock(ops, pushTextOp, colOpts.teacherName, colOpts.principalName, `Sayfa ${pageIdx + 1} / ${totalPages}`);
    }

    pageStreams.push(ops.join('\n'));
  });

  return assemblePdfDocumentFromPageStreams(
    pageStreams,
    usedRegularGids,
    usedBoldGids
  );
}

/**
 * Generates a Classroom & Rubric Evaluation Summary PDF (`%PDF-1.4`) when no specific student or session is selected yet,
 * or when exporting a general overview of the classroom's rubrics and sessions.
 */
export function generateClassroomOverviewPdfBytes(
  classroom: Classroom | null | undefined,
  students: Student[],
  sessions: EvaluationSession[],
  rubrics: Rubric[],
  columnOptions?: PdfColumnOptions
): Uint8Array {
  const colOpts = resolvePdfColumnOptions(columnOptions);
  const { regularGid, boldGid } = getEmbeddedFonts();
  const usedRegularGids = new Map<number, number>();
  const usedBoldGids = new Map<number, number>();

  const pushTextOp = (
    ops: string[],
    fontTag: '/F1' | '/F2',
    fontSize: number,
    x: number,
    y: number,
    text: string
  ) => {
    const isBold = fontTag === '/F2';
    const { hexToken, normalizedText } = encodeUnicodeToCidHex(
      text,
      isBold ? boldGid : regularGid,
      isBold ? usedBoldGids : usedRegularGids
    );
    ops.push(`% UTF8: ${normalizedText}`);
    ops.push('BT');
    ops.push(`${fontTag} ${fontSize} Tf`);
    ops.push(`${x} ${y} Td`);
    ops.push(`${hexToken} Tj`);
    ops.push('ET');
  };

  const ops: string[] = [];
  const reportDate = new Date().toISOString().slice(0, 10);
  const className = formatReportClassName(classroom);
  const gradeLevel = classroom?.gradeLevel || '11. Sınıf';
  const subject = classroom?.subject || 'Türk Dili ve Edebiyatı';

  const schoolPrefix = colOpts.schoolName ? `${colOpts.schoolName} — ` : '';
  const schoolMetaPrefix = colOpts.schoolName
    ? `Okul: ${colOpts.schoolName} | `
    : '';

  pushTextOp(
    ops,
    '/F2',
    12,
    36,
    560,
    `${schoolPrefix}SINIF GELİŞİM VE RUBRİK DEĞERLENDİRME ÖZET RAPORU — ${className}`
  );

  pushTextOp(
    ops,
    '/F1',
    8.5,
    36,
    544,
    `${schoolMetaPrefix}Kademe: ${gradeLevel} | Ders: ${subject} | Kayıtlı Öğrenci: ${students.length} | Oturum Sayısı: ${sessions.length} | Tarih: ${reportDate}`
  );

  ops.push('0.75 w 36 534 m 806 534 l S');

  let y = 516;
  pushTextOp(
    ops,
    '/F2',
    9,
    36,
    y,
    colOpts.showFinalScoreAndLevel
      ? `TANIMLI ÖLÇÜT TEMELLİ RUBRİKLER (${rubrics.length} Adet — 100 Puan Üzerinden)`
      : `TANIMLI ÖLÇÜT TEMELLİ RUBRİKLER (${rubrics.length} Adet — Sadece İsimler)`
  );
  y -= 14;

  rubrics.slice(0, 10).forEach((rub, idx) => {
    const isDual = isDualBookSpeakingRubric(rub);
    const totalPts = rub.criteria.reduce(
      (s, c) => s + Number(c.maxPoints ?? c.weight ?? 0),
      0
    );
    const critSummary = rub.criteria
      .map((c) =>
        colOpts.showCriterionScores
          ? `${c.title} (${c.maxPoints ?? c.weight}P)`
          : c.title
      )
      .join(', ');
    pushTextOp(
      ops,
      '/F2',
      8,
      36,
      y,
      colOpts.showFinalScoreAndLevel
        ? isDual
          ? `${idx + 1}. ${rub.title} [${rub.gradeLevel || gradeLevel} · ${
              rub.subject
            }] — Tek Değerlendirme, İki Sonuç: Kitap Sunumu (100P) + Konuşma Sınavı (100P) (${
              rub.criteria.length
            } Ölçüt)`
          : `${idx + 1}. ${rub.title} [${rub.gradeLevel || gradeLevel} · ${
              rub.subject
            }] — Toplam: ${totalPts} Puan (${rub.criteria.length} Ölçüt)`
        : `${idx + 1}. ${rub.title} [${rub.gradeLevel || gradeLevel} · ${
            rub.subject
          }] (${rub.criteria.length} Ölçüt)`
    );
    y -= 11;
    pushTextOp(
      ops,
      '/F1',
      7.1,
      48,
      y,
      `Ölçütler: ${critSummary.slice(0, 120)}`
    );
    y -= 11;
    if (colOpts.showObservationNotes && rub.description) {
      pushTextOp(
        ops,
        '/F1',
        6.9,
        48,
        y,
        `Gözlem / Değerlendirme Notu: ${rub.description.slice(0, 115)}`
      );
      y -= 11;
    }
    y -= 2;
  });

  if (students.length > 0 && y > 130) {
    ops.push(`0.4 w 36 ${y + 4} m 806 ${y + 4} l S`);
    y -= 10;
    pushTextOp(
      ops,
      '/F2',
      8.5,
      36,
      y,
      `SINIF ÖĞRENCİ LİSTESİ (${students.length} Öğrenci)`
    );
    y -= 12;
    const stuPairs = chunkArray(
      students
        .slice(0, 24)
        .map((s) => `#${s.studentNumber} ${s.fullName}`),
      4
    );
    stuPairs.forEach((row) => {
      if (y > 75) {
        pushTextOp(ops, '/F1', 7.3, 46, y, row.join('     |     '));
        y -= 10;
      }
    });
  }

  if (colOpts.showSignatures) {
    ops.push('0.5 w 36 58 m 806 58 l S');
    writeOfficialSignatureBlock(ops, pushTextOp, colOpts.teacherName, colOpts.principalName);
  }

  return assemblePdfDocumentFromPageStreams(
    [ops.join('\n')],
    usedRegularGids,
    usedBoldGids
  );
}

/**
 * Decodes `<GGGG...> Tj` CID/GID hex text streams from a generated PDF using its embedded
 * `/ToUnicode` CMap tables, verifying that PDF readers map every glyph back to exact Turkish Unicode.
 */
export function decodePdfTextWithToUnicode(pdfBytes: Uint8Array): string {
  const rawAscii = new TextDecoder('latin1').decode(pdfBytes);

  // Extract all <GGGG> <UUUU> mappings from the /ToUnicode CMap sections
  const gidToUnicode = new Map<string, string>();
  const cmapRegex = /beginbfchar\s+([\s\S]*?)\s+endbfchar/g;
  let cmapMatch: RegExpExecArray | null;
  while ((cmapMatch = cmapRegex.exec(rawAscii)) !== null) {
    const block = cmapMatch[1];
    const pairRegex = /<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>/g;
    let pair: RegExpExecArray | null;
    while ((pair = pairRegex.exec(block)) !== null) {
      gidToUnicode.set(
        pair[1].toUpperCase(),
        String.fromCodePoint(parseInt(pair[2], 16))
      );
    }
  }

  // Decode all `<HEX> Tj` operators across content streams
  const decodedLines: string[] = [];
  const tjRegex = /<([0-9A-Fa-f]+)>\s*Tj/g;
  let tjMatch: RegExpExecArray | null;
  while ((tjMatch = tjRegex.exec(rawAscii)) !== null) {
    const hex = tjMatch[1].toUpperCase();
    let line = '';
    for (let i = 0; i < hex.length; i += 4) {
      const gidHex = hex.slice(i, i + 4);
      line += gidToUnicode.get(gidHex) ?? '';
    }
    decodedLines.push(line);
  }

  return decodedLines.join('\n');
}

const pdfBridge = registerPlugin<{ savePdfDocument(options: { fileName: string; content: string }): Promise<{ saved: boolean; cancelled: boolean; fileName?: string; error?: string }> }>('SafBackup');

async function triggerPdfBlobDownload(bytes: Uint8Array, filename: string): Promise<string | null> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    const result = await pdfBridge.savePdfDocument({ fileName: filename, content: btoa(binary) });
    if (result.cancelled) return null;
    if (!result.saved) throw new Error(result.error || 'PDF kaydedilemedi.');
    return result.fileName || filename;
  }
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

/**
 * Triggers direct browser download of the paginated `.pdf` file without window.print().
 */
export async function downloadSessionPdfFile(
  session: EvaluationSession,
  rubric: Rubric | null | undefined,
  classroom: Classroom | null | undefined,
  students: Student[],
  columnOptions?: PdfColumnOptions
): Promise<string | null> {
  const bytes = generatePaginatedSessionPdfBytes(
    session,
    rubric,
    classroom,
    students,
    16,
    columnOptions
  );
  const safeTitle =
    session.title
      .toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'oturum';
  const prefix =
    columnOptions?.dualReportMode === 'book'
      ? 'kitap_sunumu_raporu'
      : columnOptions?.dualReportMode === 'speaking'
      ? 'konusma_sinavi_raporu'
      : 'degerlendirme_raporu';
  const filename = `${prefix}_${safeTitle}.pdf`;
  return triggerPdfBlobDownload(bytes, filename);
}

/**
 * Triggers direct browser download of the parent-shareable Student Portfolio `.pdf` file.
 */
export async function downloadStudentPortfolioPdfFile(
  student: Student,
  classroom: Classroom | null | undefined,
  sessions: EvaluationSession[],
  rubricsById: Record<string, Rubric>,
  columnOptions?: PdfColumnOptions
): Promise<string | null> {
  const bytes = generateStudentPortfolioPdfBytes(
    student,
    classroom,
    sessions,
    rubricsById,
    columnOptions
  );
  const safeStudent =
    student.fullName
      .toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'ogrenci';
  const filename = `veli_gelisim_raporu_${student.studentNumber}_${safeStudent}.pdf`;
  return triggerPdfBlobDownload(bytes, filename);
}

/**
 * Triggers direct browser download of the Classroom & Rubric Evaluation Overview `.pdf` file.
 */
export async function downloadClassroomOverviewPdfFile(
  classroom: Classroom | null | undefined,
  students: Student[],
  sessions: EvaluationSession[],
  rubrics: Rubric[],
  columnOptions?: PdfColumnOptions
): Promise<string | null> {
  const bytes = generateClassroomOverviewPdfBytes(
    classroom,
    students,
    sessions,
    rubrics,
    columnOptions
  );
  const safeClass =
    (classroom?.name || '11_sinif_tde')
      .toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'sinif';
  const filename = `sinif_degerlendirme_raporu_${safeClass}.pdf`;
  return triggerPdfBlobDownload(bytes, filename);
}
