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

/**
 * Escapes PDF literal string delimiters `(`, `)`, `\` while preserving
 * 100% of Turkish characters (`ğ, Ğ, ü, Ü, ş, Ş, ı, İ, ö, Ö, ç, Ç`) intact.
 */
function escapePdfText(text: string): string {
  return String(text ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/[—–]/g, '-')
    .replace(/[·•]/g, '|')
    .replace(/[“”"]/g, "'")
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
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
 * Generates a real, multi-page paginated PDF binary (`%PDF-1.4`) for a session (P1 #8).
 * - Preserves all Turkish characters (`ğ, Ğ, ü, Ü, ş, Ş, ı, İ, ö, Ö, ç, Ç`) with a custom PDF `/Encoding`
 *   dictionary (`/Differences` for Turkish glyphs) and UTF-8 text streams.
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

    // 1. Header Title with preserved Turkish characters
    ops.push('BT');
    ops.push('/F2 12 Tf');
    ops.push('36 560 Td');
    ops.push(
      `(${escapePdfText(
        `ÖLÇÜT TEMELLİ DEĞERLENDİRME RAPORU - ${classroom.name}`
      )}) Tj`
    );
    ops.push('ET');

    // 2. Subtitle Metadata
    ops.push('BT');
    ops.push('/F1 8.5 Tf');
    ops.push('36 545 Td');
    ops.push(
      `(${escapePdfText(
        `Oturum: ${session.title} | Rubrik: ${effectiveRubric.title} (${allCriteria.length} Ölçüt) | Tarih: ${session.date} | Sayfa ${
          pageIdx + 1
        }/${totalPages}`
      )}) Tj`
    );
    ops.push('ET');

    // 3. Full Rubric Criteria Legend (lists EVERY criterion 1..N with Turkish title & points)
    const criteriaLegendChunks = chunkArray(
      allCriteria.map(
        (c, idx) =>
          `K${idx + 1}: ${c.title} (${c.maxPoints ?? c.weight}P / %${c.weight})`
      ),
      3
    );

    let legendY = 532;
    criteriaLegendChunks.forEach((lineItems) => {
      ops.push('BT');
      ops.push('/F1 7.5 Tf');
      ops.push(`36 ${legendY} Td`);
      ops.push(`(${escapePdfText(lineItems.join('   |   '))}) Tj`);
      ops.push('ET');
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

      ops.push('BT');
      ops.push('/F2 7.5 Tf');
      ops.push(`36 ${tableHeaderY} Td`);
      ops.push(`(${escapePdfText(headerLine)}) Tj`);
      ops.push('ET');
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

        ops.push('BT');
        ops.push('/F1 7.5 Tf');
        ops.push(`36 ${y} Td`);
        ops.push(`(${escapePdfText(rowLine)}) Tj`);
        ops.push('ET');
        y -= 12;
      });

      // Include student/group observation note if present
      const combinedNote = [ev?.note, ev?.groupNote]
        .filter((n) => Boolean(n && n.trim()))
        .join(' | ');
      if (combinedNote) {
        ops.push('BT');
        ops.push('/F1 6.8 Tf');
        ops.push(`48 ${y + 2} Td`);
        ops.push(`(${escapePdfText(`Not: ${combinedNote.slice(0, 110)}`)}) Tj`);
        ops.push('ET');
        y -= 10;
      }

      y -= 3;
    });

    // 6. Footer & Official Signature Block on every page
    ops.push('0.5 w 36 54 m 806 54 l S');
    ops.push('BT');
    ops.push('/F2 8 Tf');
    ops.push('36 38 Td');
    ops.push(
      `(${escapePdfText(
        `Ders Öğretmeni İmza: ______________________          Okul Müdürlüğü Onay: ______________________          Sayfa ${
          pageIdx + 1
        } / ${totalPages}`
      )}) Tj`
    );
    ops.push('ET');

    pageStreams.push(ops.join('\n'));
  });

  // Construct valid PDF 1.4 objects with Turkish glyph encoding (/Differences for Type1 fonts)
  // Object 1: Catalog
  // Object 2: Pages
  // Object 3: Turkish Font Encoding (/WinAnsiEncoding + Turkish ISO-8859-9 / Differences)
  // Object 4: Font F1 (Courier with Turkish Encoding)
  // Object 5: Font F2 (Helvetica-Bold with Turkish Encoding)
  const objects: string[] = [];
  const pageObjNums: number[] = [];

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Lang (tr-TR) >>\nendobj');
  objects.push(''); // Placeholder for 2 0 obj (Pages)
  objects.push(
    '3 0 obj\n<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [ 208 /Gbreve 221 /Idotaccent 222 /Scedilla 240 /gbreve 253 /dotlessi 254 /scedilla ] >>\nendobj'
  );
  objects.push(
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding 3 0 R >>\nendobj'
  );
  objects.push(
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding 3 0 R >>\nendobj'
  );

  const encoder = new TextEncoder();
  let nextObjNum = 6;
  for (const streamContent of pageStreams) {
    const pageObjNum = nextObjNum++;
    const contentObjNum = nextObjNum++;
    pageObjNums.push(pageObjNum);

    const streamByteLength = encoder.encode(streamContent).byteLength;

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamByteLength} >>\nstream\n${streamContent}\nendstream\nendobj`
    );
  }

  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums
    .map((n) => `${n} 0 R`)
    .join(' ')}] /Count ${pageObjNums.length} >>\nendobj`;

  // Compute byte-exact offsets using UTF-8 byte lengths so multi-byte Turkish characters never skew xref offsets
  const chunks: Uint8Array[] = [];
  let currentByteOffset = 0;
  const pushText = (str: string) => {
    const encoded = encoder.encode(str);
    chunks.push(encoded);
    currentByteOffset += encoded.byteLength;
  };

  pushText('%PDF-1.4\n');
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(currentByteOffset);
    pushText(obj + '\n');
  }

  const xrefOffset = currentByteOffset;
  let trailer = `xref\n0 ${objects.length + 1}\n`;
  trailer += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    trailer += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  pushText(trailer);

  const output = new Uint8Array(currentByteOffset);
  let pos = 0;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return output;
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
