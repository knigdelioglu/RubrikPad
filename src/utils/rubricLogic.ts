import type {
  Rubric,
  RubricCriterion,
  Student,
  StudentEvaluation,
  EvaluationSession,
  StudentGroup,
  ParsedRosterRow,
  EvaluationActionHistoryEntry,
} from '../types.ts';

/**
 * Checks whether a score value is a valid assigned score (0 is valid; null/undefined/NaN is unscored).
 */
export function isScoreAssigned(val: unknown): val is number {
  return typeof val === 'number' && !Number.isNaN(val) && val >= 0;
}

/**
 * Deep-clones a rubric to freeze its criteria, weights, and maxPoints inside a session.
 */
export function freezeRubricSnapshot(rubric: Rubric): Rubric {
  return JSON.parse(JSON.stringify(rubric));
}

/**
 * Resolves the authoritative rubric for a session: prefers the frozen snapshot so
 * editing a rubric template later never alters historical session grades.
 * Returns null if the rubric does not exist (never silently falls back to an unrelated rubric).
 */
export function getEffectiveSessionRubric(
  session: EvaluationSession | null | undefined,
  rubricsById: Record<string, Rubric>
): Rubric | null {
  if (!session) return null;
  if (session.rubricSnapshot && session.rubricSnapshot.id === session.rubricId) {
    return session.rubricSnapshot;
  }
  return rubricsById[session.rubricId] || null;
}

/**
 * Validates a rubric before saving (P1 #1):
 * - Non-empty title
 * - At least 1 criterion
 * - Total criterion points === 100 and total weight === 100
 * - Each criterion has non-empty title, positive points/weight, and valid ordered levels
 */
export function validateRubric(rubric: Rubric): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!rubric.title || !rubric.title.trim()) {
    errors.push('Rubrik başlığı boş bırakılamaz.');
  }

  if (!Array.isArray(rubric.criteria) || rubric.criteria.length === 0) {
    errors.push('En az bir değerlendirme ölçütü eklenmelidir.');
    return { isValid: false, errors };
  }

  let totalWeight = 0;
  let totalPoints = 0;

  rubric.criteria.forEach((crit, idx) => {
    const labelPrefix = `${idx + 1}. Ölçüt`;
    if (!crit.title || !crit.title.trim()) {
      errors.push(`${labelPrefix}: Başlık boş olamaz.`);
    }
    const weight = Number(crit.weight);
    const pts = Number(crit.maxPoints ?? crit.weight);

    if (Number.isNaN(weight) || weight <= 0) {
      errors.push(`${labelPrefix}: Ağırlık 0'dan büyük olmalıdır.`);
    } else {
      totalWeight += weight;
    }

    if (Number.isNaN(pts) || pts <= 0) {
      errors.push(`${labelPrefix}: Kriter puanı 0'dan büyük olmalıdır.`);
    } else {
      totalPoints += pts;
    }

    if (!Array.isArray(crit.levels) || crit.levels.length < 2) {
      errors.push(`${labelPrefix}: En az 2 performans düzeyi tanımlanmalıdır.`);
    } else {
      for (let i = 0; i < crit.levels.length; i++) {
        const lvl = crit.levels[i];
        if (!lvl.label || !lvl.label.trim()) {
          errors.push(`${labelPrefix} (${i + 1}. Düzey): Düzey etiketi boş olamaz.`);
        }
        if (typeof lvl.points !== 'number' || Number.isNaN(lvl.points) || lvl.points < 0) {
          errors.push(`${labelPrefix} (${i + 1}. Düzey): Puan negatif olamaz.`);
        }
        if (i > 0 && lvl.points < crit.levels[i - 1].points) {
          errors.push(
            `${labelPrefix}: Performans düzeyi puanları küçükten büyüğe sıralı olmalıdır.`
          );
        }
      }
    }
  });

  if (Math.round(totalWeight * 100) / 100 !== 100) {
    errors.push(`Toplam ağırlık %100 olmalıdır (Şu an: %${totalWeight}).`);
  }

  if (Math.round(totalPoints * 100) / 100 !== 100) {
    errors.push(`Toplam kriter puanı 100 olmalıdır (Şu an: ${totalPoints} Puan).`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Calculates a student's weighted score based on their rubric criterion selections.
 * - P0 #1: 0 is treated as a valid scored point; null/undefined is treated as unscored.
 * - P0 #2: Partial evaluations do NOT produce a final 100-point grade until all required criteria are scored.
 * - P1 #2: Supports direct integer criterion scores (directCriterionScores) within [0, maxPoints].
 */
export function calculateWeightedScore(
  rubric: Rubric,
  criterionScores: Record<string, number | null | undefined>,
  directCriterionScores?: Record<string, number | null | undefined>
): {
  scoreOutOf100: number;
  finalScoreOutOf100: number | null;
  provisionalScoreOutOf100: number;
  rawPoints: number;
  maxRawPoints: number;
  completedCriteriaCount: number;
  totalCriteriaCount: number;
  isComplete: boolean;
  performanceBand:
    | 'Ornek'
    | 'Yetkin'
    | 'Gelismekte'
    | 'DestekGerekli'
    | 'Kismi'
    | 'Baslanmadi';
  performanceLabel: string;
} {
  const totalCriteriaCount = rubric.criteria.length;
  if (totalCriteriaCount === 0) {
    return {
      scoreOutOf100: 0,
      finalScoreOutOf100: null,
      provisionalScoreOutOf100: 0,
      rawPoints: 0,
      maxRawPoints: 0,
      completedCriteriaCount: 0,
      totalCriteriaCount: 0,
      isComplete: false,
      performanceBand: 'Baslanmadi',
      performanceLabel: 'Değerlendirilmedi',
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let rawPoints = 0;
  let maxRawPoints = 0;
  let completedCriteriaCount = 0;
  let requiredCriteriaCount = 0;
  let completedRequiredCount = 0;

  for (const criterion of rubric.criteria) {
    const isRequired = criterion.required !== false;
    if (isRequired) requiredCriteriaCount += 1;

    const maxLevelPts = Math.max(...criterion.levels.map((l) => l.points), 1);
    const effectiveWeight =
      typeof criterion.maxPoints === 'number' && criterion.maxPoints > 0
        ? criterion.maxPoints
        : criterion.weight;
    const critMaxDirectPts =
      typeof criterion.maxPoints === 'number' && criterion.maxPoints > 0
        ? criterion.maxPoints
        : criterion.weight;

    maxRawPoints += maxLevelPts;
    totalWeight += effectiveWeight;

    const directVal = directCriterionScores?.[criterion.id];
    const selectedLevelPts = criterionScores?.[criterion.id];

    if (isScoreAssigned(directVal)) {
      const clampedDirect = Math.max(0, Math.min(critMaxDirectPts, directVal));
      completedCriteriaCount += 1;
      if (isRequired) completedRequiredCount += 1;
      const ratio = critMaxDirectPts > 0 ? clampedDirect / critMaxDirectPts : 0;
      rawPoints += Math.round(ratio * maxLevelPts * 100) / 100;
      weightedSum += ratio * effectiveWeight;
    } else if (isScoreAssigned(selectedLevelPts)) {
      completedCriteriaCount += 1;
      if (isRequired) completedRequiredCount += 1;
      rawPoints += selectedLevelPts;
      const normalizedRatio = Math.max(0, Math.min(1, selectedLevelPts / maxLevelPts));
      weightedSum += normalizedRatio * effectiveWeight;
    }
  }

  if (completedCriteriaCount === 0) {
    return {
      scoreOutOf100: 0,
      finalScoreOutOf100: null,
      provisionalScoreOutOf100: 0,
      rawPoints: 0,
      maxRawPoints,
      completedCriteriaCount: 0,
      totalCriteriaCount,
      isComplete: false,
      performanceBand: 'Baslanmadi',
      performanceLabel: 'Değerlendirilmedi',
    };
  }

  const normalizer = totalWeight > 0 ? 100 / totalWeight : 1;
  const provisionalScoreOutOf100 = Math.round(weightedSum * normalizer);
  const isComplete =
    completedRequiredCount === requiredCriteriaCount &&
    completedCriteriaCount === totalCriteriaCount;

  // P0 #2: Do not produce a definitive total out of 100 until all required criteria are completed
  if (!isComplete) {
    return {
      scoreOutOf100: 0,
      finalScoreOutOf100: null,
      provisionalScoreOutOf100,
      rawPoints,
      maxRawPoints,
      completedCriteriaCount,
      totalCriteriaCount,
      isComplete: false,
      performanceBand: 'Kismi',
      performanceLabel: `Eksik Ölçüt (${completedCriteriaCount}/${totalCriteriaCount})`,
    };
  }

  const scoreOutOf100 = provisionalScoreOutOf100;
  let performanceBand: 'Ornek' | 'Yetkin' | 'Gelismekte' | 'DestekGerekli' =
    'DestekGerekli';
  let performanceLabel = 'Destek Gerekli';

  if (scoreOutOf100 >= 85) {
    performanceBand = 'Ornek';
    performanceLabel = 'Örnek Düzey';
  } else if (scoreOutOf100 >= 70) {
    performanceBand = 'Yetkin';
    performanceLabel = 'Yetkin';
  } else if (scoreOutOf100 >= 50) {
    performanceBand = 'Gelismekte';
    performanceLabel = 'Gelişmekte';
  }

  return {
    scoreOutOf100,
    finalScoreOutOf100: scoreOutOf100,
    provisionalScoreOutOf100,
    rawPoints,
    maxRawPoints,
    completedCriteriaCount,
    totalCriteriaCount,
    isComplete: true,
    performanceBand,
    performanceLabel,
  };
}

/**
 * Computes both Individual and Group score breakdowns for a student without mixing them (P0 #4).
 */
export function getStudentEvaluationBreakdown(
  rubric: Rubric,
  evaluation: StudentEvaluation | undefined
) {
  const individualCalc = calculateWeightedScore(
    rubric,
    evaluation?.criterionScores || {},
    evaluation?.directCriterionScores
  );
  const groupCalc = calculateWeightedScore(
    rubric,
    evaluation?.groupCriterionScores || {},
    evaluation?.groupDirectScores
  );

  const preferGroup =
    evaluation?.activeScoreSource === 'group' ||
    (individualCalc.completedCriteriaCount === 0 && groupCalc.completedCriteriaCount > 0);

  const effectiveCalc = preferGroup ? groupCalc : individualCalc;

  return {
    individualCalc,
    groupCalc,
    effectiveCalc,
    activeSource: preferGroup ? ('group' as const) : ('individual' as const),
  };
}

/**
 * Propagates a group's criterion scores and observation note to all member students in the session.
 * P0 #4: Stores group results in separate `groupCriterionScores` and `groupNote` fields so
 * individual `criterionScores` and individual `note` are NEVER overwritten or destroyed.
 */
export function applyGroupScoresToMembers(
  currentEvaluations: Record<string, StudentEvaluation>,
  group: StudentGroup,
  timestampIso: string
): Record<string, StudentEvaluation> {
  const updated: Record<string, StudentEvaluation> = { ...currentEvaluations };

  for (const studentId of group.studentIds) {
    const existing = updated[studentId];
    const preservedIndividualScores = { ...(existing?.criterionScores || {}) };
    const preservedIndividualDirect = existing?.directCriterionScores
      ? { ...existing.directCriterionScores }
      : undefined;

    const nextGroupScores = {
      ...(existing?.groupCriterionScores || {}),
      ...group.criterionScores,
    };
    const nextGroupDirect = group.directCriterionScores
      ? {
          ...(existing?.groupDirectScores || {}),
          ...group.directCriterionScores,
        }
      : existing?.groupDirectScores;

    const existingNote = existing?.note ? existing.note.trim() : '';
    const groupNoteClean = group.groupNote ? group.groupNote.trim() : '';

    const existingTags = existing?.tags || [];
    const nextTags = existingTags.includes('Grup Çalışması')
      ? existingTags
      : [...existingTags, 'Grup Çalışması'];

    const hasIndividualScores = Object.values(preservedIndividualScores).some((v) =>
      isScoreAssigned(v)
    );

    updated[studentId] = {
      studentId,
      criterionScores: preservedIndividualScores,
      directCriterionScores: preservedIndividualDirect,
      groupCriterionScores: nextGroupScores,
      groupDirectScores: nextGroupDirect,
      groupNote: groupNoteClean || existing?.groupNote || '',
      groupId: group.id,
      activeScoreSource: hasIndividualScores ? existing?.activeScoreSource || 'individual' : 'group',
      note: existingNote,
      tags: nextTags,
      updatedAt: timestampIso,
      evaluatedViaGroup: group.name,
    };
  }

  return updated;
}

/**
 * Applies a specific criterion score to a list of students in bulk (used in Hızlı Değerlendirme Grid).
 * If onlyUnscored is true, only assigns the score to students who do not yet have a valid score (including 0) for that criterion.
 */
export function applyCriterionScoreToStudents(
  currentEvaluations: Record<string, StudentEvaluation>,
  studentIds: string[],
  criterionId: string,
  points: number,
  timestampIso: string,
  onlyUnscored = false
): Record<string, StudentEvaluation> {
  const updated: Record<string, StudentEvaluation> = { ...currentEvaluations };

  for (const studentId of studentIds) {
    const existing = updated[studentId];
    const currentPoints = existing?.criterionScores?.[criterionId];
    if (onlyUnscored && isScoreAssigned(currentPoints)) {
      continue;
    }

    const nextDirect = { ...(existing?.directCriterionScores || {}) };
    delete nextDirect[criterionId];

    updated[studentId] = {
      ...existing,
      studentId,
      criterionScores: {
        ...(existing?.criterionScores || {}),
        [criterionId]: points,
      },
      directCriterionScores: nextDirect,
      activeScoreSource: 'individual',
      note: existing?.note || '',
      tags: existing?.tags || [],
      updatedAt: timestampIso,
      evaluatedViaGroup: existing?.evaluatedViaGroup,
    };
  }

  return updated;
}

/**
 * Finds the next unscored criterion for a student, or null if all are completed (0 counts as scored!).
 */
export function getNextUnscoredCriterion(
  criteria: RubricCriterion[],
  criterionScores: Record<string, number | null | undefined>,
  directCriterionScores?: Record<string, number | null | undefined>
): { criterion: RubricCriterion; index: number } | null {
  for (let i = 0; i < criteria.length; i++) {
    const crit = criteria[i];
    if (
      !isScoreAssigned(criterionScores?.[crit.id]) &&
      !isScoreAssigned(directCriterionScores?.[crit.id])
    ) {
      return { criterion: crit, index: i };
    }
  }
  return null;
}

/**
 * Finds the next student in the list who still has pending (unscored) criteria.
 */
export function getNextPendingStudent(
  students: Student[],
  evaluations: Record<string, StudentEvaluation>,
  rubric: Rubric,
  currentStudentId: string
): Student | null {
  if (students.length === 0) return null;
  const currentIdx = students.findIndex((s) => s.id === currentStudentId);

  for (let i = currentIdx + 1; i < students.length; i++) {
    const s = students[i];
    const ev = evaluations[s.id];
    const { effectiveCalc } = getStudentEvaluationBreakdown(rubric, ev);
    if (!effectiveCalc.isComplete) {
      return s;
    }
  }

  for (let i = 0; i <= currentIdx && i < students.length; i++) {
    const s = students[i];
    if (s.id === currentStudentId) continue;
    const ev = evaluations[s.id];
    const { effectiveCalc } = getStudentEvaluationBreakdown(rubric, ev);
    if (!effectiveCalc.isComplete) {
      return s;
    }
  }

  return null;
}

/**
 * Splits a full Turkish name into firstName (given names) and lastName (family surname).
 */
export function splitTurkishFullName(rawFullName: string): {
  firstName: string;
  lastName: string;
  fullName: string;
} {
  const cleaned = rawFullName.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return { firstName: '', lastName: '', fullName: '' };
  }
  const parts = cleaned.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '', fullName: parts[0] };
  }
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
  };
}

/**
 * Parses OCR or raw pasted classroom roster lines into structured, validated student records.
 * P0 #5 & P1 #3:
 * - NEVER invents fake sequential student numbers when a number is missing.
 * - Splits firstName and lastName and validates each field separately.
 * - Flags missing school numbers, missing surnames, or duplicate student numbers.
 */
export function parseStudentRosterText(
  rawText: string,
  existingNumbers: Set<string> = new Set()
): ParsedRosterRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const results: ParsedRosterRow[] = [];
  const seenInBatch = new Set<string>();

  for (const line of lines) {
    const matchWithNum = line.match(
      /^(?:No[:.]?\s*)?(\d{1,6})(?:\s*[-–—:.\t|)]+\s*|\s+)([A-Za-zÇĞİÖŞÜçğıöşü].+)$/i
    );

    let studentNumber = '';
    let rawName = '';

    if (matchWithNum) {
      studentNumber = matchWithNum[1].trim();
      rawName = matchWithNum[2].replace(/\s+/g, ' ').trim();
    } else {
      rawName = line.replace(/^[*•-]\s*/, '').replace(/\s+/g, ' ').trim();
    }

    const { firstName, lastName, fullName } = splitTurkishFullName(rawName);
    const validationErrors: string[] = [];

    if (!studentNumber) {
      validationErrors.push('Okul numarası eksik');
    } else if (!/^\d+$/.test(studentNumber)) {
      validationErrors.push('Okul numarası yalnızca rakam olmalıdır');
    } else if (existingNumbers.has(studentNumber) || seenInBatch.has(studentNumber)) {
      validationErrors.push('Mükerrer okul numarası');
    }

    if (!firstName || firstName.length < 2) {
      validationErrors.push('Öğrenci adı eksik');
    }
    if (!lastName || lastName.length < 2) {
      validationErrors.push('Öğrenci soyadı eksik');
    }

    if (studentNumber) {
      seenInBatch.add(studentNumber);
    }

    results.push({
      studentNumber,
      firstName,
      lastName,
      fullName,
      isValid: validationErrors.length === 0,
      validationErrors,
    });
  }

  return results;
}

/**
 * Validates adding or updating a student in a classroom (P0 #7 & P1 #4).
 */
export function validateStudentRecord(
  input: { studentNumber: string; firstName: string; lastName: string },
  classStudents: Student[],
  editingStudentId?: string
): { isValid: boolean; error?: string } {
  const num = input.studentNumber.trim();
  const first = input.firstName.trim();
  const last = input.lastName.trim();

  if (!num) {
    return { isValid: false, error: 'Okul numarası zorunludur.' };
  }
  if (!/^\d{1,8}$/.test(num)) {
    return { isValid: false, error: 'Okul numarası yalnızca rakamlardan oluşmalıdır.' };
  }
  if (first.length < 2) {
    return { isValid: false, error: 'Öğrenci adı en az 2 karakter olmalıdır.' };
  }
  if (last.length < 2) {
    return { isValid: false, error: 'Öğrenci soyadı en az 2 karakter olmalıdır.' };
  }

  const duplicate = classStudents.find(
    (s) => !s.archived && s.studentNumber === num && s.id !== editingStudentId
  );
  if (duplicate) {
    return {
      isValid: false,
      error: `#${num} okul numarası bu sınıfta zaten ${duplicate.fullName} adına kayıtlı.`,
    };
  }

  return { isValid: true };
}

/**
 * Checks whether a student has historical evaluation records or group memberships (P0 #7).
 */
export function checkStudentDeletionImpact(
  studentId: string,
  sessions: EvaluationSession[]
): {
  hasHistory: boolean;
  sessionCount: number;
  groupCount: number;
} {
  let sessionCount = 0;
  let groupCount = 0;

  for (const ses of sessions) {
    const ev = ses.evaluations[studentId];
    if (ev) {
      const hasAnyScore =
        Object.values(ev.criterionScores || {}).some((v) => isScoreAssigned(v)) ||
        Object.values(ev.groupCriterionScores || {}).some((v) => isScoreAssigned(v)) ||
        Boolean(ev.note?.trim());
      if (hasAnyScore) {
        sessionCount += 1;
      }
    }
    for (const grp of ses.groups) {
      if (grp.studentIds.includes(studentId)) {
        const groupHasEvaluation =
          Object.values(grp.criterionScores || {}).some((v) =>
            isScoreAssigned(v)
          ) || Boolean(grp.groupNote?.trim());
        if (groupHasEvaluation) {
          groupCount += 1;
        }
      }
    }
  }

  return {
    hasHistory: sessionCount > 0 || groupCount > 0,
    sessionCount,
    groupCount,
  };
}

/**
 * Checks whether a rubric is referenced in sessions and whether it can be safely deleted (P0 #7).
 */
export function checkRubricDeletionImpact(
  rubricId: string,
  allRubrics: Rubric[],
  sessions: EvaluationSession[]
): {
  canDelete: boolean;
  usedInSessionsCount: number;
  reason?: string;
} {
  if (allRubrics.length <= 1) {
    return {
      canDelete: false,
      usedInSessionsCount: 0,
      reason: 'En az bir rubrik şablonu sistemde kalmalıdır.',
    };
  }
  const usedInSessionsCount = sessions.filter((s) => s.rubricId === rubricId).length;
  return {
    canDelete: true,
    usedInSessionsCount,
  };
}

/**
 * Computes summary progress stats for a list of students in a session.
 */
export function getSessionProgressStats(
  students: Student[],
  evaluations: Record<string, StudentEvaluation>,
  rubric: Rubric
): {
  totalStudents: number;
  fullyEvaluatedCount: number;
  partialCount: number;
  unstartedCount: number;
  completionPercent: number;
} {
  const activeStudents = students.filter((s) => !s.archived);
  const totalStudents = activeStudents.length;
  if (totalStudents === 0) {
    return {
      totalStudents: 0,
      fullyEvaluatedCount: 0,
      partialCount: 0,
      unstartedCount: 0,
      completionPercent: 0,
    };
  }

  let fullyEvaluatedCount = 0;
  let partialCount = 0;
  let unstartedCount = 0;

  for (const stu of activeStudents) {
    const ev = evaluations[stu.id];
    const { effectiveCalc } = getStudentEvaluationBreakdown(rubric, ev);
    if (effectiveCalc.isComplete) {
      fullyEvaluatedCount += 1;
    } else if (effectiveCalc.completedCriteriaCount > 0) {
      partialCount += 1;
    } else {
      unstartedCount += 1;
    }
  }

  return {
    totalStudents,
    fullyEvaluatedCount,
    partialCount,
    unstartedCount,
    completionPercent: Math.round((fullyEvaluatedCount / totalStudents) * 100),
  };
}

/**
 * Generates balanced random student groups and enforces unique membership (P1 #5).
 */
export function generateBalancedRandomGroups(
  students: Student[],
  options: { groupCount?: number; targetGroupSize?: number; seed?: number }
): StudentGroup[] {
  const activeStudents = students.filter((s) => !s.archived);
  if (activeStudents.length === 0) return [];

  let numGroups = options.groupCount || 0;
  if (numGroups <= 0) {
    const size = Math.max(2, options.targetGroupSize || 3);
    numGroups = Math.max(1, Math.ceil(activeStudents.length / size));
  }
  numGroups = Math.min(numGroups, activeStudents.length);

  // Deterministic or seeded Fisher-Yates shuffle
  const pool = [...activeStudents];
  let currentSeed = options.seed ?? Date.now();
  const nextRand = () => {
    currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
    return currentSeed / 4294967296;
  };

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }

  const buckets: string[][] = Array.from({ length: numGroups }, () => []);
  pool.forEach((stu, idx) => {
    buckets[idx % numGroups].push(stu.id);
  });

  return buckets.map((studentIds, idx) => ({
    id: `grp-rand-${Date.now()}-${idx + 1}`,
    name: `Grup ${idx + 1}`,
    studentIds,
    criterionScores: {},
    groupNote: '',
  }));
}

/**
 * Validates that no student in candidateStudentIds is already assigned to another group in the session (P1 #5).
 */
export function findDuplicateGroupMemberships(
  groups: StudentGroup[],
  candidateStudentIds: string[],
  excludeGroupId?: string
): Array<{ studentId: string; existingGroupName: string }> {
  const conflicts: Array<{ studentId: string; existingGroupName: string }> = [];
  for (const grp of groups) {
    if (grp.id === excludeGroupId) continue;
    for (const sid of candidateStudentIds) {
      if (grp.studentIds.includes(sid)) {
        conflicts.push({ studentId: sid, existingGroupName: grp.name });
      }
    }
  }
  return conflicts;
}

/**
 * Computes longitudinal group evaluation history across sessions (P1 #6).
 */
export function getGroupProgressHistory(
  sessions: EvaluationSession[],
  rubricsById: Record<string, Rubric>,
  classId?: string
): Array<{
  sessionId: string;
  sessionTitle: string;
  date: string;
  groupId: string;
  groupName: string;
  memberCount: number;
  memberIds: string[];
  scoreOutOf100: number | null;
  provisionalScoreOutOf100: number;
  isComplete: boolean;
  performanceLabel: string;
  groupNote: string;
}> {
  const filteredSessions = [...sessions]
    .filter((s) => {
      if (!classId) return true;
      const classes = s.classIds && s.classIds.length > 0 ? s.classIds : [s.classId];
      return classes.includes(classId);
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const results: Array<{
    sessionId: string;
    sessionTitle: string;
    date: string;
    groupId: string;
    groupName: string;
    memberCount: number;
    memberIds: string[];
    scoreOutOf100: number | null;
    provisionalScoreOutOf100: number;
    isComplete: boolean;
    performanceLabel: string;
    groupNote: string;
  }> = [];

  for (const ses of filteredSessions) {
    const rubric = getEffectiveSessionRubric(ses, rubricsById);
    if (!rubric) continue;

    for (const grp of ses.groups || []) {
      const calc = calculateWeightedScore(
        rubric,
        grp.criterionScores,
        grp.directCriterionScores
      );
      if (calc.completedCriteriaCount === 0 && !grp.groupNote) continue;

      results.push({
        sessionId: ses.id,
        sessionTitle: ses.title,
        date: ses.date,
        groupId: grp.id,
        groupName: grp.name,
        memberCount: grp.studentIds.length,
        memberIds: grp.studentIds,
        scoreOutOf100: calc.finalScoreOutOf100,
        provisionalScoreOutOf100: calc.provisionalScoreOutOf100,
        isComplete: calc.isComplete,
        performanceLabel: calc.performanceLabel,
        groupNote: grp.groupNote || '',
      });
    }
  }

  return results;
}

/**
 * Pushes an action onto a session's bounded undo history stack (P1 #7).
 */
export function recordSessionUndoEntry(
  session: EvaluationSession,
  entry: Omit<EvaluationActionHistoryEntry, 'id' | 'timestamp'>
): EvaluationActionHistoryEntry[] {
  const nextEntry: EvaluationActionHistoryEntry = {
    ...entry,
    id: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    previousEvaluations: JSON.parse(JSON.stringify(entry.previousEvaluations)),
    previousGroups: entry.previousGroups
      ? JSON.parse(JSON.stringify(entry.previousGroups))
      : undefined,
  };
  const current = session.undoHistory || [];
  return [nextEntry, ...current].slice(0, 30);
}

/**
 * Computes longitudinal progress points for a given student across chronological evaluation sessions.
 */
export function getStudentProgressHistory(
  studentId: string,
  sessions: EvaluationSession[],
  rubricsById: Record<string, Rubric>
): Array<{
  sessionId: string;
  sessionTitle: string;
  date: string;
  rubricTitle: string;
  scoreOutOf100: number;
  finalScoreOutOf100: number | null;
  individualScoreOutOf100: number | null;
  groupScoreOutOf100: number | null;
  isComplete: boolean;
  performanceLabel: string;
  note: string;
  groupNote?: string;
  criterionBreakdown: Array<{
    criterionTitle: string;
    scorePercent: number;
    selectedPoints: number;
    maxPoints: number;
  }>;
}> {
  const sortedSessions = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const history: Array<{
    sessionId: string;
    sessionTitle: string;
    date: string;
    rubricTitle: string;
    scoreOutOf100: number;
    finalScoreOutOf100: number | null;
    individualScoreOutOf100: number | null;
    groupScoreOutOf100: number | null;
    isComplete: boolean;
    performanceLabel: string;
    note: string;
    groupNote?: string;
    criterionBreakdown: Array<{
      criterionTitle: string;
      scorePercent: number;
      selectedPoints: number;
      maxPoints: number;
    }>;
  }> = [];

  for (const session of sortedSessions) {
    const evalRecord = session.evaluations[studentId];
    const rubric = getEffectiveSessionRubric(session, rubricsById);
    if (!evalRecord || !rubric) continue;

    const { individualCalc, groupCalc, effectiveCalc, activeSource } =
      getStudentEvaluationBreakdown(rubric, evalRecord);

    // P0 #2: Only include completed evaluations in final longitudinal grade progression
    if (!effectiveCalc.isComplete || effectiveCalc.finalScoreOutOf100 === null) continue;

    const activeScores =
      activeSource === 'group'
        ? evalRecord.groupCriterionScores || {}
        : evalRecord.criterionScores || {};
    const activeDirect =
      activeSource === 'group'
        ? evalRecord.groupDirectScores || {}
        : evalRecord.directCriterionScores || {};

    const criterionBreakdown = rubric.criteria.map((c: RubricCriterion) => {
      const directVal = activeDirect[c.id];
      if (isScoreAssigned(directVal)) {
        const maxDirect = c.maxPoints ?? c.weight;
        const scorePercent = maxDirect > 0 ? Math.round((directVal / maxDirect) * 100) : 0;
        return {
          criterionTitle: c.title,
          scorePercent,
          selectedPoints: directVal,
          maxPoints: maxDirect,
        };
      }

      const maxPoints = Math.max(...c.levels.map((l) => l.points), 1);
      const selectedPoints = isScoreAssigned(activeScores[c.id])
        ? (activeScores[c.id] as number)
        : 0;
      const scorePercent = Math.round((selectedPoints / maxPoints) * 100);
      return {
        criterionTitle: c.title,
        scorePercent,
        selectedPoints,
        maxPoints,
      };
    });

    history.push({
      sessionId: session.id,
      sessionTitle: session.title,
      date: session.date,
      rubricTitle: rubric.title,
      scoreOutOf100: effectiveCalc.finalScoreOutOf100,
      finalScoreOutOf100: effectiveCalc.finalScoreOutOf100,
      individualScoreOutOf100: individualCalc.finalScoreOutOf100,
      groupScoreOutOf100: groupCalc.finalScoreOutOf100,
      isComplete: true,
      performanceLabel: effectiveCalc.performanceLabel,
      note: evalRecord.note || '',
      groupNote: evalRecord.groupNote,
      criterionBreakdown,
    });
  }

  return history;
}

/**
 * Neutralizes Spreadsheet / CSV Formula Injection (DDE / Excel formula execution)
 * by prefixing a single quote `'` when a text value starts with `=`, `+`, `-`, `@`, `\t`, or `\r`.
 */
export function sanitizeCsvFormulaInjection(val: string | number): string {
  if (typeof val === 'number') return String(val);
  const str = String(val ?? '');
  if (str.length > 0 && /^[=+\-@\t\r]/.test(str) && str !== '-') {
    return `'${str}`;
  }
  return str;
}

/**
 * Generates a UTF-8 BOM CSV string for an evaluation session with:
 * - Strict rubric/session validation (no wrong fallback)
 * - CSV formula injection protection (P2)
 * - Separate Individual vs Group score columns (P0 #4)
 * - Definitive total only when all criteria are completed (P0 #2)
 */
export function generateSessionCsv(
  session: EvaluationSession,
  rubric: Rubric | null | undefined,
  students: Student[]
): string {
  const effectiveRubric =
    session.rubricSnapshot && session.rubricSnapshot.id === session.rubricId
      ? session.rubricSnapshot
      : rubric;

  if (!effectiveRubric || effectiveRubric.id !== session.rubricId) {
    throw new Error(
      'Rapor oluşturulamadı: Oturuma ait geçerli rubrik bulunamadı veya rubrik eşleşmiyor.'
    );
  }

  const allowedClassIds = new Set(
    session.classIds && session.classIds.length > 0 ? session.classIds : [session.classId]
  );
  const sessionStudents = students.filter(
    (s) => allowedClassIds.has(s.classId) && !s.archived
  );

  const escapeCsvCell = (val: string | number): string => {
    const safeStr = sanitizeCsvFormulaInjection(val);
    if (safeStr.includes(',') || safeStr.includes('"') || safeStr.includes('\n')) {
      return `"${safeStr.replace(/"/g, '""')}"`;
    }
    return safeStr;
  };

  const headers = [
    'Öğrenci No',
    'Ad',
    'Soyad',
    'Ad Soyad',
    ...effectiveRubric.criteria.map(
      (c) => `${c.title} (${c.maxPoints ?? c.weight}P / %${c.weight})`
    ),
    'Bireysel Puan (100)',
    'Grup Puanı (100)',
    'Kesin Toplam Puan (100)',
    'Düzey',
    'Değerlendirme Yöntemi',
    'Bireysel Gözlem Notu',
    'Grup Gözlem Notu',
    'Etiketler',
  ];

  const rows = sessionStudents.map((student) => {
    const evaluation = session.evaluations[student.id];
    const { individualCalc, groupCalc, effectiveCalc, activeSource } =
      getStudentEvaluationBreakdown(effectiveRubric, evaluation);

    const activeScores =
      activeSource === 'group'
        ? evaluation?.groupCriterionScores || {}
        : evaluation?.criterionScores || {};
    const activeDirect =
      activeSource === 'group'
        ? evaluation?.groupDirectScores || {}
        : evaluation?.directCriterionScores || {};

    const criterionCells = effectiveRubric.criteria.map((c) => {
      const directVal = activeDirect[c.id];
      if (isScoreAssigned(directVal)) return directVal;
      const pts = activeScores[c.id];
      return isScoreAssigned(pts) ? pts : '-';
    });

    const splitName = splitTurkishFullName(student.fullName);
    const firstName = student.firstName || splitName.firstName;
    const lastName = student.lastName || splitName.lastName;

    const method =
      individualCalc.completedCriteriaCount > 0 && groupCalc.completedCriteriaCount > 0
        ? `Bireysel + Grup (${evaluation?.evaluatedViaGroup || 'Grup'})`
        : groupCalc.completedCriteriaCount > 0
        ? `Grup (${evaluation?.evaluatedViaGroup || 'Grup'})`
        : individualCalc.completedCriteriaCount > 0
        ? 'Bireysel'
        : 'Değerlendirilmedi';

    const indScoreCell =
      individualCalc.finalScoreOutOf100 !== null
        ? individualCalc.finalScoreOutOf100
        : individualCalc.completedCriteriaCount > 0
        ? `Eksik (${individualCalc.completedCriteriaCount}/${individualCalc.totalCriteriaCount})`
        : '-';

    const grpScoreCell =
      groupCalc.finalScoreOutOf100 !== null
        ? groupCalc.finalScoreOutOf100
        : groupCalc.completedCriteriaCount > 0
        ? `Eksik (${groupCalc.completedCriteriaCount}/${groupCalc.totalCriteriaCount})`
        : '-';

    const finalScoreCell =
      effectiveCalc.finalScoreOutOf100 !== null
        ? effectiveCalc.finalScoreOutOf100
        : effectiveCalc.completedCriteriaCount > 0
        ? `Eksik (${effectiveCalc.completedCriteriaCount}/${effectiveCalc.totalCriteriaCount})`
        : '-';

    return [
      student.studentNumber,
      firstName,
      lastName,
      student.fullName,
      ...criterionCells,
      indScoreCell,
      grpScoreCell,
      finalScoreCell,
      effectiveCalc.performanceLabel,
      method,
      (evaluation?.note || '').replace(/\r?\n/g, ' | '),
      (evaluation?.groupNote || '').replace(/\r?\n/g, ' | '),
      (evaluation?.tags || []).join('; '),
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
}
