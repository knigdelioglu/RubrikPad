import type {
  Classroom,
  EvaluationSession,
  Rubric,
  RubricCriterion,
  Student,
} from '../types.ts';
import {
  getEffectiveSessionRubric,
  getStudentEvaluationBreakdown,
  isScoreAssigned,
} from './rubricLogic.ts';
import {
  LIBERATION_MONO_REGULAR_TTF_BASE64,
  LIBERATION_MONO_BOLD_TTF_BASE64,
} from './embeddedTurkishFont.ts';

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
 * Normalizes typography punctuation while keeping 100% of Turkish characters
 * (`ğ, Ğ, ü, Ü, ş, Ş, ı, İ, ö, Ö, ç, Ç`) intact.
 */
function normalizePdfTextLine(text: string): string {
  return String(text ?? '')
    .replace(/\r?\n/g, ' ')
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
export function generatePaginatedSessionPdfBytes(
  session: EvaluationSession,
  rubric: Rubric | null | undefined,
  classroom: Classroom | null | undefined,
  students: Student[],
  rowsPerPage = 16
): Uint8Array {
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

  const { regularTtf, boldTtf, regularGid, boldGid } = getEmbeddedFonts();
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
  const criteriaPerBand = 8;
  const criterionBands = chunkArray(allCriteria, criteriaPerBand);

  const sessionStudents = students
    .filter((s) => allowedClassIds.has(s.classId) && !s.archived)
    .sort((a, b) =>
      a.studentNumber.localeCompare(b.studentNumber, undefined, {
        numeric: true,
      })
    );

  // If a rubric has > 8 criteria, each student row uses 1 extra continuation line per additional band
  const effectiveRowsPerPage =
    criterionBands.length > 1
      ? Math.max(5, Math.min(rowsPerPage, Math.floor(14 / criterionBands.length)))
      : rowsPerPage;

  const studentPages = chunkArray(sessionStudents, effectiveRowsPerPage);
  const totalPages = studentPages.length;
  const pageStreams: string[] = [];

  studentPages.forEach((pageStudents, pageIdx) => {
    const ops: string[] = [];

    // 1. Header Title with embedded Unicode TrueType font
    pushTextOp(
      ops,
      '/F2',
      11.5,
      36,
      560,
      `ÖLÇÜT TEMELLİ DEĞERLENDİRME RAPORU - ${classroom.name}`
    );

    // 2. Subtitle Metadata
    pushTextOp(
      ops,
      '/F1',
      8,
      36,
      545,
      `Oturum: ${session.title} | Rubrik: ${effectiveRubric.title} (${allCriteria.length} Ölçüt) | Tarih: ${session.date} | Sayfa ${
        pageIdx + 1
      }/${totalPages}`
    );

    // 3. Full Rubric Criteria Legend (lists EVERY criterion 1..N with Turkish title & points, 2 per line so long titles never clip)
    const criteriaLegendChunks = chunkArray(
      allCriteria.map(
        (c, idx) =>
          `K${idx + 1}: ${c.title} (${c.maxPoints ?? c.weight}P / %${c.weight})`
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

    // 4. Table Header (shows K1..KN; if > 8 criteria, shows band 1 headers + continuation band headers)
    let tableHeaderY = headerDividerY - 12;
    criterionBands.forEach((band, bandIdx) => {
      const bandOffset = bandIdx * criteriaPerBand;
      const critHeaders = band
        .map(
          (c, idx) =>
            `K${bandOffset + idx + 1}(${c.maxPoints ?? c.weight}P)`.padEnd(8, ' ')
        )
        .join(' ');

      const headerLine =
        bandIdx === 0
          ? `No     Ad Soyad                  ${critHeaders}  Bireysel  Grup    Kesin(100)  Düzey`
          : `       [Ek Ölçütler K${bandOffset + 1}-K${
              bandOffset + band.length
            }]       ${critHeaders}`;

      pushTextOp(ops, '/F2', 7.2, 36, tableHeaderY, headerLine);
      tableHeaderY -= 11;
    });

    const tableTopLineY = tableHeaderY + 5;
    ops.push(`0.5 w 36 ${tableTopLineY} m 806 ${tableTopLineY} l S`);

    // 5. Student Rows (renders ALL criteria across 1 or more bands per student)
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

      const indStr = (
        individualCalc.finalScoreOutOf100 !== null
          ? String(individualCalc.finalScoreOutOf100)
          : individualCalc.completedCriteriaCount > 0
          ? `Eksik(${individualCalc.completedCriteriaCount}/${individualCalc.totalCriteriaCount})`
          : '-'
      ).padEnd(8, ' ');

      const grpStr = (
        groupCalc.finalScoreOutOf100 !== null
          ? String(groupCalc.finalScoreOutOf100)
          : groupCalc.completedCriteriaCount > 0
          ? `Eksik(${groupCalc.completedCriteriaCount}/${groupCalc.totalCriteriaCount})`
          : '-'
      ).padEnd(6, ' ');

      const finalStr = (
        effectiveCalc.finalScoreOutOf100 !== null
          ? String(effectiveCalc.finalScoreOutOf100)
          : effectiveCalc.completedCriteriaCount > 0
          ? `Taslak(${effectiveCalc.completedCriteriaCount}/${effectiveCalc.totalCriteriaCount})`
          : '-'
      ).padEnd(10, ' ');

      criterionBands.forEach((band, bandIdx) => {
        const bandOffset = bandIdx * criteriaPerBand;
        const critVals = band
          .map((c, idx) => {
            const codePrefix = `K${bandOffset + idx + 1}:`;
            const d = activeDirect[c.id];
            if (isScoreAssigned(d)) {
              return `${codePrefix}${d}`.padEnd(8, ' ');
            }
            const p = activeScores[c.id];
            const valStr = isScoreAssigned(p) ? String(p) : '-';
            return `${codePrefix}${valStr}`.padEnd(8, ' ');
          })
          .join(' ');

        const rowLine =
          bandIdx === 0
            ? `${stu.studentNumber.padEnd(6, ' ')} ${stu.fullName
                .slice(0, 24)
                .padEnd(25, ' ')} ${critVals}  ${indStr}  ${grpStr}  ${finalStr}  ${
                effectiveCalc.performanceLabel
              }`
            : `       (Ek Ölçüt Puanları)       ${critVals}`;

        pushTextOp(ops, '/F1', 7.2, 36, y, rowLine);
        y -= 12;
      });

      // Include student/group observation note if present
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

      y -= 3;
    });

    // 6. Footer & Official Signature Block on every page
    ops.push('0.5 w 36 54 m 806 54 l S');
    pushTextOp(
      ops,
      '/F2',
      7.5,
      36,
      38,
      `Ders Öğretmeni İmza: ______________________          Okul Müdürlüğü Onay: ______________________          Sayfa ${
        pageIdx + 1
      } / ${totalPages}`
    );

    pageStreams.push(ops.join('\n'));
  });

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

  // Reserve object numbers:
  // 1: Catalog
  // 2: Pages
  // 3..7: Font F1 (Type0 LiberationMono-Regular + CIDFontType2 + FontDescriptor + FontFile2 + ToUnicode)
  // 8..12: Font F2 (Type0 LiberationMono-Bold + CIDFontType2 + FontDescriptor + FontFile2 + ToUnicode)
  // 13..: Page and Content objects
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

/**
 * Triggers direct browser download of the paginated `.pdf` file without window.print().
 */
export function downloadSessionPdfFile(
  session: EvaluationSession,
  rubric: Rubric | null | undefined,
  classroom: Classroom | null | undefined,
  students: Student[]
): void {
  const bytes = generatePaginatedSessionPdfBytes(
    session,
    rubric,
    classroom,
    students
  );
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/pdf',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeTitle = session.title
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöç]/gi, '_');
  link.href = url;
  link.setAttribute('download', `degerlendirme_raporu_${safeTitle}.pdf`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
