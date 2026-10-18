import type { Student } from '../../types.ts';
import type {
  OcrEngineAdapter,
  OcrFieldSuggestion,
  OcrWordToken,
  RawGrayImage,
  UncertaintyCode,
  VerifiedOcrRosterRow,
} from './ocrTypes.ts';
import { computeRowApprovalSignature } from './geometricTableParser.ts';

const TURKISH_DIACRITIC_SUGGESTION_MAP: Record<string, string> = {
  AYSE: 'AYŞE',
  CELIK: 'ÇELİK',
  ÇELIK: 'ÇELİK',
  CELİK: 'ÇELİK',
  DEMIR: 'DEMİR',
  ELIF: 'ELİF',
  SAHIN: 'ŞAHİN',
  ŞAHIN: 'ŞAHİN',
  SAHİN: 'ŞAHİN',
  NILUFER: 'NİLÜFER',
  NİLÜFER: 'NİLÜFER',
  EMIRHAN: 'EMİRHAN',
  OZTURK: 'ÖZTÜRK',
  OZTÜRK: 'ÖZTÜRK',
  ÖZTÜRK: 'ÖZTÜRK',
  TEKIN: 'TEKİN',
  ALI: 'ALİ',
  HATICE: 'HATİCE',
  EMINE: 'EMİNE',
  HUSEYIN: 'HÜSEYİN',
  IBRAHIM: 'İBRAHİM',
  OMER: 'ÖMER',
  MIRAC: 'MİRAÇ',
  YIGIT: 'YİĞİT',
  DENIZ: 'DENİZ',
  YAGMUR: 'YAĞMUR',
  DOGAN: 'DOĞAN',
  KILIC: 'KILIÇ',
  CETIN: 'ÇETİN',
  KOC: 'KOÇ',
  OZKAN: 'ÖZKAN',
  SIMSEK: 'ŞİMŞEK',
  OZDEMIR: 'ÖZDEMİR',
  CAKIR: 'ÇAKIR',
  ERDOGAN: 'ERDOĞAN',
  GULER: 'GÜLER',
  AKTAS: 'AKTAŞ',
  GUNES: 'GÜNEŞ',
  UNAL: 'ÜNAL',
};

function normalizeNameForComparison(name: string): string {
  return name
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ç/g, 'C')
    .replace(/Ğ/g, 'G')
    .replace(/Ö/g, 'O')
    .replace(/Ü/g, 'U')
    .replace(/\s+/g, ' ');
}

function buildDiacriticRepairSuggestion(
  field: 'firstName' | 'lastName',
  currentText: string,
  rowId: string
): OcrFieldSuggestion | null {
  const words = currentText.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  let changed = false;
  const repairedWords = words.map((w) => {
    const upper = w.toLocaleUpperCase('tr-TR');
    const mapped = TURKISH_DIACRITIC_SUGGESTION_MAP[upper];
    if (mapped && mapped !== upper) {
      changed = true;
      return mapped;
    }
    return w;
  });

  if (!changed) return null;
  const suggestedText = repairedWords.join(' ');
  if (suggestedText === currentText.trim()) return null;

  return {
    id: `sug-diacritic-${rowId}-${field}`,
    field,
    currentText: currentText.trim(),
    suggestedText,
    reason: 'Türkçe karakter (Ç, Ğ, İ, Ö, Ş, Ü) düzeltme önerisi',
    confidence: 90,
    source: 'diacritic_repair',
  };
}

function buildDigitDisambiguationSuggestion(
  currentNum: string,
  rowId: string
): OcrFieldSuggestion | null {
  const trimmed = currentNum.trim();
  if (!trimmed || /^\d+$/.test(trimmed)) return null;

  const converted = trimmed
    .toUpperCase()
    .replace(/[OÖD]/g, '0')
    .replace(/[IİLl|]/g, '1')
    .replace(/[SŞ]/g, '5')
    .replace(/B/g, '8')
    .replace(/Z/g, '2');

  if (/^\d+$/.test(converted) && converted !== trimmed) {
    return {
      id: `sug-digit-${rowId}-studentNumber`,
      field: 'studentNumber',
      currentText: trimmed,
      suggestedText: converted,
      reason: `Harf/rakam benzerliği düzeltme önerisi ("${trimmed}" → "${converted}")`,
      confidence: 88,
      source: 'digit_letter_disambiguation',
    };
  }
  return null;
}

/**
 * Evaluates all rows in an OCR roster batch for missing fields, duplicates,
 * physical row collisions, similar names, and conflicting OCR alternatives.
 * Never auto-applies suggestions and never merges similar-named students.
 */
export function evaluateRosterReliability(
  rows: VerifiedOcrRosterRow[],
  tokens: OcrWordToken[] = [],
  existingClassroomStudents: Student[] = []
): VerifiedOcrRosterRow[] {
  const activeExisting = existingClassroomStudents.filter((s) => !s.archived);
  const existingNumbers = new Set(
    activeExisting.map((s) => s.studentNumber.trim())
  );
  const existingNormNames = new Map<string, string>();
  for (const s of activeExisting) {
    existingNormNames.set(
      normalizeNameForComparison(s.fullName),
      `#${s.studentNumber} ${s.fullName}`
    );
  }

  const tokensById = new Map<string, OcrWordToken>();
  for (const t of tokens) {
    tokensById.set(t.id, t);
  }

  // Count occurrences of studentNumber, physicalRowId, and normalized fullName within the batch
  const batchNumberCounts = new Map<string, number>();
  const batchPhysicalRowCounts = new Map<string, number>();
  const batchNormNameCounts = new Map<string, number>();

  for (const r of rows) {
    const num = r.studentNumber.trim();
    if (num) {
      batchNumberCounts.set(num, (batchNumberCounts.get(num) ?? 0) + 1);
    }
    if (r.physicalRowId) {
      batchPhysicalRowCounts.set(
        r.physicalRowId,
        (batchPhysicalRowCounts.get(r.physicalRowId) ?? 0) + 1
      );
    }
    const full = `${r.firstName.trim()} ${r.lastName.trim()}`.trim();
    if (full.length >= 4) {
      const norm = normalizeNameForComparison(full);
      batchNormNameCounts.set(norm, (batchNormNameCounts.get(norm) ?? 0) + 1);
    }
  }

  return rows.map((row) => {
    const num = row.studentNumber.trim();
    const first = row.firstName.trim();
    const last = row.lastName.trim();
    const fullName = [first, last].filter(Boolean).join(' ').trim();

    // Preserve structural geometry flags from geometricTableParser
    const structuralFlags = row.uncertaintyFlags.filter((f) =>
      [
        'MISSING_ROW_GAP',
        'SEQUENCE_GAP',
        'SUSPICIOUS_ROW_ALIGNMENT',
        'COLUMN_BOUNDARY_OVERLAP',
        'HEADERLESS_COLUMN_INFERRED',
        'COMBINED_NAME_SPLIT',
      ].includes(f)
    );
    const flags = new Set<UncertaintyCode>(structuralFlags);
    const reasons: string[] = row.uncertaintyReasons.filter(
      (msg) =>
        msg.includes('boşluk') ||
        msg.includes('dikey hizalaması') ||
        msg.includes('Birleşik Ad-Soyad')
    );
    const validationErrors: string[] = [];

    // Preserve existing local_reread suggestions while refreshing field suggestions
    const suggestions: OcrFieldSuggestion[] = row.suggestions.filter(
      (s) => s.source === 'local_reread' && s.suggestedText !== row[s.field].trim()
    );

    // 1. Validate Student Number
    if (!num) {
      flags.add('MISSING_STUDENT_NUMBER');
      validationErrors.push('Okul numarası eksik (rastgele numara üretilmez).');
      const digitSug = buildDigitDisambiguationSuggestion(
        row.rawCells.studentNumber,
        row.rowId
      );
      if (digitSug) suggestions.push(digitSug);
    } else if (!/^\d+$/.test(num)) {
      flags.add('MISSING_STUDENT_NUMBER');
      validationErrors.push(
        `Okul numarası yalnızca rakamlardan oluşmalıdır ("${num}").`
      );
      const digitSug = buildDigitDisambiguationSuggestion(num, row.rowId);
      if (digitSug) suggestions.push(digitSug);
    } else if (
      existingNumbers.has(num) ||
      (batchNumberCounts.get(num) ?? 0) > 1
    ) {
      flags.add('DUPLICATE_STUDENT_NUMBER');
      validationErrors.push(
        existingNumbers.has(num)
          ? `#${num} okul numarası sınıfta zaten kayıtlı.`
          : `#${num} okul numarası bu OCR listesinde birden fazla satırda tekrar ediyor.`
      );
    }

    // 2. Validate Physical Row Uniqueness
    if (
      row.physicalRowId &&
      (batchPhysicalRowCounts.get(row.physicalRowId) ?? 0) > 1
    ) {
      flags.add('DUPLICATE_PHYSICAL_ROW');
      validationErrors.push(
        'Aynı fiziksel fotoğraf satırından iki ayrı öğrenci kaydedilemez.'
      );
    }

    // 3. Validate First Name
    if (first.length < 2) {
      flags.add('MISSING_FIRST_NAME');
      validationErrors.push('Öğrenci adı en az 2 harf olmalıdır.');
    } else {
      const firstSug = buildDiacriticRepairSuggestion(
        'firstName',
        first,
        row.rowId
      );
      if (firstSug) {
        flags.add('CONFLICTING_ALTERNATIVES');
        suggestions.push(firstSug);
      }
    }

    // 4. Validate Last Name
    if (last.length < 2) {
      flags.add('MISSING_LAST_NAME');
      validationErrors.push('Öğrenci soyadı en az 2 harf olmalıdır.');
    } else {
      const lastSug = buildDiacriticRepairSuggestion(
        'lastName',
        last,
        row.rowId
      );
      if (lastSug) {
        flags.add('CONFLICTING_ALTERNATIVES');
        suggestions.push(lastSug);
      }
    }

    // 5. Check token-level OCR alternatives and low confidence
    if (row.confidence > 0 && row.confidence < 78) {
      flags.add('LOW_CONFIDENCE_OCR');
      reasons.push(
        `Satır OCR güven skoru düşük (%${row.confidence}); fotoğraf satırıyla karşılaştırın.`
      );
    }

    for (const tokId of row.sourceTokenIds) {
      const tok = tokensById.get(tokId);
      if (
        !tok ||
        tok.confidence >= 92 ||
        !tok.alternatives ||
        tok.alternatives.length === 0
      ) {
        continue;
      }

      for (const alt of tok.alternatives) {
        if (!alt.text || alt.text === tok.text) continue;
        // Determine which field this token belongs to
        if (tok.text === num && /^\d+$/.test(alt.text) && alt.text !== num) {
          flags.add('CONFLICTING_ALTERNATIVES');
          if (
            !suggestions.some(
              (s) =>
                s.field === 'studentNumber' && s.suggestedText === alt.text
            )
          ) {
            suggestions.push({
              id: `sug-alt-${row.rowId}-num-${alt.text}`,
              field: 'studentNumber',
              currentText: num,
              suggestedText: alt.text,
              reason: alt.reason || 'Alternatif OCR numara okuması',
              confidence: alt.confidence,
              source: 'alternative_reading',
            });
          }
        } else if (
          tok.text === last &&
          alt.text !== last &&
          !/^\d+$/.test(alt.text)
        ) {
          flags.add('CONFLICTING_ALTERNATIVES');
          if (
            !suggestions.some(
              (s) => s.field === 'lastName' && s.suggestedText === alt.text
            )
          ) {
            suggestions.push({
              id: `sug-alt-${row.rowId}-last-${alt.text}`,
              field: 'lastName',
              currentText: last,
              suggestedText: alt.text,
              reason: alt.reason || 'Alternatif OCR soyadı okuması',
              confidence: alt.confidence,
              source: 'alternative_reading',
            });
          }
        }
      }
    }

    // 6. Check Similar / Identical Student Names (Never auto-merge!)
    if (fullName.length >= 4) {
      const normFull = normalizeNameForComparison(fullName);
      if (existingNormNames.has(normFull)) {
        flags.add('SIMILAR_STUDENT_NAME');
        reasons.push(
          `Sınıfta benzer/aynı isimli öğrenci mevcut (${existingNormNames.get(
            normFull
          )}). Farklı bir öğrenciyse okul numarasını doğrulayarak kaydedebilirsiniz; kayıtlar otomatik birleştirilmez.`
        );
      } else if ((batchNormNameCounts.get(normFull) ?? 0) > 1) {
        flags.add('SIMILAR_STUDENT_NAME');
        reasons.push(
          `Listede aynı ad-soyada sahip ("${fullName}") birden fazla satır var. Otomatik birleştirme yapılmaz; okul numaralarını kontrol edin.`
        );
      }
    }

    if (flags.has('HEADERLESS_COLUMN_INFERRED')) {
      reasons.push(
        'Tablo sütun başlıkları okunamadığı için sütun rolleri geometrik olarak tahmin edildi.'
      );
    }

    // Determine reliability level
    let reliabilityLevel: 'high' | 'review_required' | 'invalid' = 'high';
    if (validationErrors.length > 0 || row.rowKind === 'missing_gap_candidate') {
      reliabilityLevel = 'invalid';
    } else if (flags.size > 0 || suggestions.length > 0) {
      reliabilityLevel = 'review_required';
    }

    // Verify approval signature integrity: if identity changed or row became invalid, invalidate approval!
    const currentSig = computeRowApprovalSignature({
      studentNumber: num,
      firstName: first,
      lastName: last,
    });
    const isStillApproved =
      row.approvedByTeacher &&
      validationErrors.length === 0 &&
      row.approvedSignature === currentSig;

    const effectiveRowKind =
      row.rowKind === 'missing_gap_candidate' && num && first && last
        ? 'extracted'
        : row.rowKind;

    return {
      ...row,
      rowKind: effectiveRowKind,
      studentNumber: num,
      firstName: first,
      lastName: last,
      fullName,
      reliabilityLevel,
      uncertaintyFlags: Array.from(flags),
      uncertaintyReasons: reasons,
      validationErrors,
      suggestions,
      approvedByTeacher: isStillApproved,
      approvedSignature: isStillApproved ? currentSig : '',
    };
  });
}

/**
 * Runs targeted local cell re-OCR on rows that have low confidence or missing/ambiguous cells.
 * Never overwrites existing readings automatically; attaches distinct readings as suggestions.
 */
export async function runTargetedCellReReads(
  rows: VerifiedOcrRosterRow[],
  grayImage: RawGrayImage,
  engine: OcrEngineAdapter
): Promise<VerifiedOcrRosterRow[]> {
  if (!engine.recognizeCellRegion) return rows;

  const updated: VerifiedOcrRosterRow[] = [];

  for (const row of rows) {
    if (row.reliabilityLevel === 'high' || row.reReadAttempted) {
      updated.push(row);
      continue;
    }

    const nextSuggestions = [...row.suggestions];
    const fieldsToInspect: ('studentNumber' | 'firstName' | 'lastName')[] = [
      'studentNumber',
      'firstName',
      'lastName',
    ];

    for (const field of fieldsToInspect) {
      const cellBox = row.cellBboxes[field];
      if (!cellBox) continue;

      const reRead = await engine.recognizeCellRegion(
        grayImage,
        cellBox,
        field
      );
      const cleanText = reRead.text.trim();
      const currentVal = row[field].trim();

      if (
        cleanText &&
        cleanText !== currentVal &&
        !nextSuggestions.some(
          (s) => s.field === field && s.suggestedText === cleanText
        )
      ) {
        nextSuggestions.push({
          id: `sug-reread-${row.rowId}-${field}`,
          field,
          currentText: currentVal,
          suggestedText: cleanText,
          reason: `Yerel hücre yeniden okuma önerisi (%${reRead.confidence} güven)`,
          confidence: reRead.confidence,
          source: 'local_reread',
        });
      }
    }

    updated.push({
      ...row,
      suggestions: nextSuggestions,
      reReadAttempted: true,
    });
  }

  return updated;
}

/**
 * Updates a student's identity field in the verification table and automatically invalidates
 * any previous teacher approval if studentNumber, firstName, or lastName changed.
 */
export function updateOcrRowIdentityField(
  rows: VerifiedOcrRosterRow[],
  rowId: string,
  field: 'studentNumber' | 'firstName' | 'lastName' | 'gender',
  newValue: string,
  tokens: OcrWordToken[] = [],
  existingStudents: Student[] = []
): VerifiedOcrRosterRow[] {
  const modified = rows.map((r) => {
    if (r.rowId !== rowId) return r;
    const prevVal = r[field];
    const identityChanged =
      (field === 'studentNumber' ||
        field === 'firstName' ||
        field === 'lastName') &&
      prevVal.trim() !== newValue.trim();

    return {
      ...r,
      [field]: newValue,
      approvedByTeacher: identityChanged ? false : r.approvedByTeacher,
      approvedSignature: identityChanged ? '' : r.approvedSignature,
    };
  });

  return evaluateRosterReliability(modified, tokens, existingStudents);
}

/**
 * Applies a non-destructive suggestion selected by the teacher.
 */
export function applyOcrFieldSuggestion(
  rows: VerifiedOcrRosterRow[],
  rowId: string,
  suggestionId: string,
  tokens: OcrWordToken[] = [],
  existingStudents: Student[] = []
): VerifiedOcrRosterRow[] {
  const modified = rows.map((r) => {
    if (r.rowId !== rowId) return r;
    const sug = r.suggestions.find((s) => s.id === suggestionId);
    if (!sug) return r;

    return {
      ...r,
      [sug.field]: sug.suggestedText,
      suggestions: r.suggestions.filter((s) => s.id !== suggestionId),
      // Teacher explicitly clicked to apply this suggestion; require fresh approval or re-evaluation
      approvedByTeacher: false,
      approvedSignature: '',
    };
  });

  return evaluateRosterReliability(modified, tokens, existingStudents);
}

/**
 * Toggles teacher approval on a single row (only allowed when validationErrors is empty).
 */
export function toggleOcrRowApproval(
  rows: VerifiedOcrRosterRow[],
  rowId: string,
  tokens: OcrWordToken[] = [],
  existingStudents: Student[] = []
): VerifiedOcrRosterRow[] {
  const evaluated = evaluateRosterReliability(rows, tokens, existingStudents);
  return evaluated.map((r) => {
    if (r.rowId !== rowId) return r;
    if (r.validationErrors.length > 0) {
      return { ...r, approvedByTeacher: false, approvedSignature: '' };
    }
    const nextApproved = !r.approvedByTeacher;
    const sig = nextApproved
      ? computeRowApprovalSignature({
          studentNumber: r.studentNumber,
          firstName: r.firstName,
          lastName: r.lastName,
        })
      : '';
    return {
      ...r,
      approvedByTeacher: nextApproved,
      approvedSignature: sig,
    };
  });
}

/**
 * Bulk approves ONLY rows that have `reliabilityLevel === 'high'` (zero errors and zero uncertainty flags).
 * Uncertain or invalid rows are left unapproved so the teacher must review them individually.
 */
export function bulkApproveReliableOcrRows(
  rows: VerifiedOcrRosterRow[],
  tokens: OcrWordToken[] = [],
  existingStudents: Student[] = []
): {
  rows: VerifiedOcrRosterRow[];
  newlyApprovedCount: number;
  skippedUncertainCount: number;
} {
  const evaluated = evaluateRosterReliability(rows, tokens, existingStudents);
  let newlyApprovedCount = 0;
  let skippedUncertainCount = 0;

  const updated = evaluated.map((r) => {
    if (r.reliabilityLevel === 'high' && r.validationErrors.length === 0) {
      if (!r.approvedByTeacher) newlyApprovedCount++;
      const sig = computeRowApprovalSignature({
        studentNumber: r.studentNumber,
        firstName: r.firstName,
        lastName: r.lastName,
      });
      return {
        ...r,
        approvedByTeacher: true,
        approvedSignature: sig,
      };
    } else {
      skippedUncertainCount++;
      return r;
    }
  });

  return {
    rows: updated,
    newlyApprovedCount,
    skippedUncertainCount,
  };
}

/**
 * Atomic, all-or-nothing commit validator and Student record builder.
 * Prevents partial saves, unapproved rows, duplicate school numbers, or duplicate physical rows.
 */
export function commitVerifiedOcrRosterAtomically(
  rows: VerifiedOcrRosterRow[],
  activeClassId: string,
  existingClassroomStudents: Student[],
  timestampIso: string = new Date().toISOString()
): {
  ok: boolean;
  error?: string;
  createdStudents: Student[];
} {
  if (rows.length === 0) {
    return {
      ok: false,
      error: 'Kaydedilecek öğrenci satırı bulunmuyor.',
      createdStudents: [],
    };
  }

  // Re-evaluate reliability right before commit to guarantee zero stale state
  const freshRows = evaluateRosterReliability(
    rows,
    [],
    existingClassroomStudents
  );

  // Check if any row has validation errors
  const invalidRows = freshRows.filter((r) => r.validationErrors.length > 0);
  if (invalidRows.length > 0) {
    const firstErr = invalidRows[0];
    return {
      ok: false,
      error: `Atomik Kayıt Engellendi: ${firstErr.rowIndex}. satırda düzeltilmemiş hata var (${firstErr.validationErrors[0]}). Tüm satırlar geçerli olmadan kayıt yapılamaz.`,
      createdStudents: [],
    };
  }

  // Check if any row is not approved by teacher or had its approval invalidated after an edit
  const unapprovedRows = freshRows.filter(
    (r) =>
      !r.approvedByTeacher ||
      r.approvedSignature !==
        computeRowApprovalSignature({
          studentNumber: r.studentNumber,
          firstName: r.firstName,
          lastName: r.lastName,
        })
  );
  if (unapprovedRows.length > 0) {
    return {
      ok: false,
      error: `Atomik Kayıt Engellendi: ${unapprovedRows.length} satır henüz öğretmen tarafından onaylanmadı (${unapprovedRows[0].rowIndex}. satır: #${unapprovedRows[0].studentNumber || '?'} ${unapprovedRows[0].fullName}). Lütfen satırları inceleyip onaylayın.`,
      createdStudents: [],
    };
  }

  // Final check for duplicate school numbers or duplicate physicalRowIds
  const seenNumbers = new Set(
    existingClassroomStudents
      .filter((s) => !s.archived)
      .map((s) => s.studentNumber.trim())
  );
  const seenPhysicalRows = new Set<string>();

  for (const r of freshRows) {
    const num = r.studentNumber.trim();
    if (seenNumbers.has(num)) {
      return {
        ok: false,
        error: `Atomik Kayıt Engellendi: #${num} okul numarası mükerrer.`,
        createdStudents: [],
      };
    }
    seenNumbers.add(num);

    if (seenPhysicalRows.has(r.physicalRowId)) {
      return {
        ok: false,
        error: `Atomik Kayıt Engellendi: Aynı fiziksel fotoğraf satırından (${r.physicalRowId}) birden fazla öğrenci kaydedilemez.`,
        createdStudents: [],
      };
    }
    seenPhysicalRows.add(r.physicalRowId);
  }

  const createdStudents: Student[] = freshRows.map((r, idx) => {
    const num = r.studentNumber.trim();
    const first = r.firstName.trim();
    const last = r.lastName.trim();
    const full = `${first} ${last}`.trim();
    return {
      id: `stu-ocr-${Date.now()}-${idx + 1}`,
      studentNumber: num,
      firstName: first,
      lastName: last,
      fullName: full,
      classId: activeClassId,
      createdAt: timestampIso,
      updatedAt: timestampIso,
      auditLog: [
        {
          timestamp: timestampIso,
          action: 'created',
          details: `Yerel geometrik tablo OCR ve öğretmen doğrulaması ile eklendi (#${num} ${full}, Kaynak Satır: ${r.physicalRowId}).`,
        },
      ],
    };
  });

  return {
    ok: true,
    createdStudents,
  };
}
