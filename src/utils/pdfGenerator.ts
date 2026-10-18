import type {
  Classroom,
  EvaluationSession,
  Rubric,
  Student,
} from '../types.ts';
import {
  getEffectiveSessionRubric,
  getStudentEvaluationBreakdown,
  isScoreAssigned,
} from './rubricLogic.ts';

/**
 * Converts Turkish characters to ASCII-safe WinAnsi / PDF Type1 Helvetica equivalents
 * so standard PDF readers render every line cleanly without font embedding bloat.
 */
function toPdfSafeAscii(text: string): string {
  return String(text ?? '')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/[—–]/g, '-')
    .replace(/[·•]/g, '|')
    .replace(/[“”"]/g, "'")
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Generates a real, multi-page paginated PDF binary (`%PDF-1.4`) for a session (P1 #8).
 * Validates that the rubric and classroom belong to the session (P2 Export Security).
 */
export function generatePaginatedSessionPdfBytes(
  session: EvaluationSession,
  rubric: Rubric | null | undefined,
  classroom: Classroom | null | undefined,
  students: Student[],
  rowsPerPage = 20
): Uint8Array {
  const effectiveRubric = getEffectiveSessionRubric(
    session,
    rubric ? { [rubric.id]: rubric } : {}
  );

  if (!effectiveRubric || effectiveRubric.id !== session.rubricId) {
    throw new Error('PDF oluşturulamadı: Oturum rubriği doğrulanamadı.');
  }

  const allowedClassIds = new Set(
    session.classIds && session.classIds.length > 0 ? session.classIds : [session.classId]
  );

  if (!classroom || !allowedClassIds.has(classroom.id)) {
    throw new Error('PDF oluşturulamadı: Sınıf bilgisi oturumla eşleşmiyor.');
  }

  const sessionStudents = students
    .filter((s) => allowedClassIds.has(s.classId) && !s.archived)
    .sort((a, b) =>
      a.studentNumber.localeCompare(b.studentNumber, undefined, { numeric: true })
    );

  const chunks: Student[][] = [];
  if (sessionStudents.length === 0) {
    chunks.push([]);
  } else {
    for (let i = 0; i < sessionStudents.length; i += rowsPerPage) {
      chunks.push(sessionStudents.slice(i, i + rowsPerPage));
    }
  }

  const totalPages = chunks.length;
  const pageStreams: string[] = [];

  chunks.forEach((pageStudents, pageIdx) => {
    const ops: string[] = [];

    // Header Title
    ops.push('BT');
    ops.push('/F2 13 Tf');
    ops.push('40 555 Td');
    ops.push(
      `(${toPdfSafeAscii(
        `OLCUT TEMELLI DEGERLENDIRME RAPORU - ${classroom.name}`
      )}) Tj`
    );
    ops.push('ET');

    // Subtitle metadata
    ops.push('BT');
    ops.push('/F1 9 Tf');
    ops.push('40 539 Td');
    ops.push(
      `(${toPdfSafeAscii(
        `Oturum: ${session.title} | Rubrik: ${effectiveRubric.title} | Tarih: ${session.date} | Sayfa ${
          pageIdx + 1
        }/${totalPages}`
      )}) Tj`
    );
    ops.push('ET');

    // Horizontal divider line
    ops.push('0.75 w 40 530 m 802 530 l S');

    // Table Header
    ops.push('BT');
    ops.push('/F2 8 Tf');
    ops.push('40 516 Td');
    const critShortHeaders = effectiveRubric.criteria
      .slice(0, 8)
      .map((c, idx) => `K${idx + 1}(${c.maxPoints ?? c.weight}P)`)
      .join('  ');
    ops.push(
      `(${toPdfSafeAscii(
        `No     Ad Soyad                  ${critShortHeaders}    Bireysel  Grup   Kesin(100)  Duzey`
      )}) Tj`
    );
    ops.push('ET');

    ops.push('0.5 w 40 510 m 802 510 l S');

    // Student rows
    let y = 496;
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

      const critVals = effectiveRubric.criteria
        .slice(0, 8)
        .map((c) => {
          const d = activeDirect[c.id];
          if (isScoreAssigned(d)) return String(d).padEnd(6, ' ');
          const p = activeScores[c.id];
          return (isScoreAssigned(p) ? String(p) : '-').padEnd(6, ' ');
        })
        .join(' ');

      const indStr = (
        individualCalc.finalScoreOutOf100 !== null
          ? String(individualCalc.finalScoreOutOf100)
          : individualCalc.completedCriteriaCount > 0
          ? 'Eksik'
          : '-'
      ).padEnd(8, ' ');

      const grpStr = (
        groupCalc.finalScoreOutOf100 !== null
          ? String(groupCalc.finalScoreOutOf100)
          : groupCalc.completedCriteriaCount > 0
          ? 'Eksik'
          : '-'
      ).padEnd(6, ' ');

      const finalStr = (
        effectiveCalc.finalScoreOutOf100 !== null
          ? String(effectiveCalc.finalScoreOutOf100)
          : effectiveCalc.completedCriteriaCount > 0
          ? `Taslak(${effectiveCalc.completedCriteriaCount}/${effectiveCalc.totalCriteriaCount})`
          : '-'
      ).padEnd(10, ' ');

      const rowLine = `${stu.studentNumber.padEnd(6, ' ')} ${stu.fullName
        .slice(0, 24)
        .padEnd(25, ' ')} ${critVals}  ${indStr}  ${grpStr} ${finalStr}  ${
        effectiveCalc.performanceLabel
      }`;

      ops.push('BT');
      ops.push('/F1 8 Tf');
      ops.push(`40 ${y} Td`);
      ops.push(`(${toPdfSafeAscii(rowLine)}) Tj`);
      ops.push('ET');
      y -= 18;
    });

    // Footer & Official Signature Block on every page
    ops.push('0.5 w 40 75 m 802 75 l S');
    ops.push('BT');
    ops.push('/F2 8 Tf');
    ops.push('40 60 Td');
    ops.push(
      `(${toPdfSafeAscii(
        `Ders Ogretmeni Imza: ______________________          Okul Mudurlugu Onay: ______________________          Sayfa ${
          pageIdx + 1
        } / ${totalPages}`
      )}) Tj`
    );
    ops.push('ET');

    pageStreams.push(ops.join('\n'));
  });

  // Construct valid PDF 1.4 objects
  // Object 1: Catalog
  // Object 2: Pages
  // Object 3: Font F1 (Courier for tabular alignment)
  // Object 4: Font F2 (Helvetica-Bold for headers)
  // Objects 5..(4 + 2*N): Page and Content Stream pairs
  const objects: string[] = [];
  const pageObjNums: number[] = [];

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  // Placeholder for 2 0 obj (Pages)
  objects.push('');
  objects.push(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj'
  );
  objects.push(
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj'
  );

  let nextObjNum = 5;
  for (const streamContent of pageStreams) {
    const pageObjNum = nextObjNum++;
    const contentObjNum = nextObjNum++;
    pageObjNums.push(pageObjNum);

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`
    );
  }

  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums
    .map((n) => `${n} 0 R`)
    .join(' ')}] /Count ${pageObjNums.length} >>\nendobj`;

  let pdfText = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdfText.length);
    pdfText += obj + '\n';
  }

  const xrefOffset = pdfText.length;
  pdfText += `xref\n0 ${objects.length + 1}\n`;
  pdfText += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdfText += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdfText += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdfText);
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
  const bytes = generatePaginatedSessionPdfBytes(session, rubric, classroom, students);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
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
