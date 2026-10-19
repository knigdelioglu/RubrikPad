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

export type IndividualCriterionEditAction =
  | {
      type: 'level';
      criterionId: string;
      points: number;
    }
  | {
      type: 'direct';
      criterionId: string;
      directPoints: number | null;
    }
  | {
      type: 'clear';
      criterionId: string;
    };

/**
 * Applies a single-criterion edit (normal rubric level, precision direct integer score, or clear)
 * to a student's evaluation, guaranteeing identical group-to-individual seeding semantics across
 * normal level selection and precision direct score entry (P1 Precision Scoring Consistency).
 *
 * When a student is currently using their reflected group evaluation (`activeSource === 'group'`),
 * editing any criterion via either normal level selection OR precision direct score entry seeds
 * all other criteria from `groupCriterionScores` and `groupDirectScores` so a completed evaluation
 * never loses its other criteria or becomes incomplete.
 */
export function applyIndividualCriterionEdit(
  rubric: Rubric,
  existing: StudentEvaluation | undefined,
  studentId: string,
  action: IndividualCriterionEditAction,
  timestampIso = new Date().toISOString()
): {
  updatedEvaluation: StudentEvaluation;
  prevCalc: ScoreCalculationResult;
  newCalc: ScoreCalculationResult;
  transitionedFromGroup: boolean;
} {
  const breakdown = getStudentEvaluationBreakdown(rubric, existing);
  const prevCalc = breakdown.effectiveCalc;
  const seedFromGroup = breakdown.activeSource === 'group';

  const nextScores: Record<string, number | null> = seedFromGroup
    ? {
        ...(existing?.criterionScores || {}),
        ...(existing?.groupCriterionScores || {}),
      }
    : { ...(existing?.criterionScores || {}) };

  const nextDirect: Record<string, number | null> = seedFromGroup
    ? {
        ...(existing?.directCriterionScores || {}),
        ...(existing?.groupDirectScores || {}),
      }
    : { ...(existing?.directCriterionScores || {}) };

  if (seedFromGroup) {
    // Ensure group authority per criterion before applying the new individual edit:
    // if a criterion in group was scored ONLY via level (not direct), clear any stale individual direct override for it
    for (const crit of rubric.criteria) {
      const grpHasDirect = isScoreAssigned(
        existing?.groupDirectScores?.[crit.id]
      );
      const grpHasLevel = isScoreAssigned(
        existing?.groupCriterionScores?.[crit.id]
      );
      if (grpHasLevel && !grpHasDirect) {
        delete nextDirect[crit.id];
      }
    }
  }

  if (action.type === 'level') {
    nextScores[action.criterionId] = action.points;
    delete nextDirect[action.criterionId];
  } else if (action.type === 'direct') {
    if (action.directPoints === null || action.directPoints === undefined) {
      delete nextDirect[action.criterionId];
    } else {
      nextDirect[action.criterionId] = action.directPoints;
    }
  } else if (action.type === 'clear') {
    delete nextScores[action.criterionId];
    delete nextDirect[action.criterionId];
  }

  const updatedEvaluation: StudentEvaluation = {
    ...existing,
    studentId,
    criterionScores: nextScores,
    directCriterionScores: nextDirect,
    activeScoreSource: 'individual',
    note: existing?.note || '',
    tags: existing?.tags || [],
    updatedAt: timestampIso,
  };

  const newCalc = calculateWeightedScore(rubric, nextScores, nextDirect);

  return {
    updatedEvaluation,
    prevCalc,
    newCalc,
    transitionedFromGroup: seedFromGroup,
  };
}

/**
 * Checks whether a group's evaluation is complete and eligible to be applied to its member students.
 * P0: Incomplete group evaluations (where any required criterion is unscored) or empty groups
 * MUST NOT be applied to members.
 */
export function canApplyGroupScoresToMembers(
  group: StudentGroup | null | undefined,
  rubric?: Rubric
): {
  allowed: boolean;
  completedCriteriaCount: number;
  totalCriteriaCount: number;
  reason?: string;
} {
  if (!group) {
    return {
      allowed: false,
      completedCriteriaCount: 0,
      totalCriteriaCount: rubric?.criteria?.length || 0,
      reason: 'Geçerli bir grup seçilmedi.',
    };
  }

  if (!Array.isArray(group.studentIds) || group.studentIds.length === 0) {
    return {
      allowed: false,
      completedCriteriaCount: 0,
      totalCriteriaCount: rubric?.criteria?.length || 0,
      reason: 'Grupta henüz üye öğrenci bulunmuyor.',
    };
  }

  if (rubric) {
    const calc = calculateWeightedScore(
      rubric,
      group.criterionScores || {},
      group.directCriterionScores
    );
    if (!calc.isComplete) {
      return {
        allowed: false,
        completedCriteriaCount: calc.completedCriteriaCount,
        totalCriteriaCount: calc.totalCriteriaCount,
        reason: `Eksik grup değerlendirmesi (${calc.completedCriteriaCount}/${calc.totalCriteriaCount} ölçüt) üyelere uygulanamaz. Lütfen tüm ölçütleri tamamlayın.`,
      };
    }
    return {
      allowed: true,
      completedCriteriaCount: calc.completedCriteriaCount,
      totalCriteriaCount: calc.totalCriteriaCount,
    };
  }

  // Fallback check when rubric is not passed: ensure at least one score is assigned and no explicit null/undefined entries exist
  const levelEntries = Object.entries(group.criterionScores || {});
  const directEntries = Object.entries(group.directCriterionScores || {});
  const assignedCount =
    levelEntries.filter(([, v]) => isScoreAssigned(v)).length +
    directEntries.filter(
      ([k, v]) => isScoreAssigned(v) && !isScoreAssigned(group.criterionScores?.[k])
    ).length;

  const hasExplicitUnscored =
    levelEntries.some(
      ([k, v]) => !isScoreAssigned(v) && !isScoreAssigned(group.directCriterionScores?.[k])
    ) ||
    directEntries.some(
      ([k, v]) => !isScoreAssigned(v) && !isScoreAssigned(group.criterionScores?.[k])
    );

  if (assignedCount === 0 || hasExplicitUnscored) {
    return {
      allowed: false,
      completedCriteriaCount: assignedCount,
      totalCriteriaCount: Math.max(levelEntries.length, directEntries.length, 1),
      reason: 'Eksik grup değerlendirmesi üyelere uygulanamaz.',
    };
  }

  return {
    allowed: true,
    completedCriteriaCount: assignedCount,
    totalCriteriaCount: assignedCount,
  };
}

/**
 * Propagates a group's criterion scores and observation note to all member students in the session.
 * P0 #4 & P0 Group Completeness Guard:
 * - Stores group results in separate `groupCriterionScores` and `groupNote` fields so
 *   individual `criterionScores` and individual `note` are NEVER overwritten or destroyed.
 * - Strictly refuses to apply incomplete group evaluations to member students.
 */
export function applyGroupScoresToMembers(
  currentEvaluations: Record<string, StudentEvaluation>,
  group: StudentGroup,
  timestampIso: string,
  rubric?: Rubric
): Record<string, StudentEvaluation> {
  const eligibility = canApplyGroupScoresToMembers(group, rubric);
  if (!eligibility.allowed) {
    return currentEvaluations;
  }

  const updated: Record<string, StudentEvaluation> = { ...currentEvaluations };

  for (const studentId of group.studentIds) {
    const existing = updated[studentId];
    const preservedIndividualScores = { ...(existing?.criterionScores || {}) };
    const preservedIndividualDirect = existing?.directCriterionScores
      ? { ...existing.directCriterionScores }
      : undefined;

    const nextGroupScores = { ...(group.criterionScores || {}) };
    const nextGroupDirect = group.directCriterionScores
      ? { ...group.directCriterionScores }
      : undefined;

    const existingNote = existing?.note ? existing.note.trim() : '';
    const groupNoteClean = group.groupNote ? group.groupNote.trim() : '';

    const existingTags = existing?.tags || [];
    const nextTags = existingTags.includes('Grup Çalışması')
      ? existingTags
      : [...existingTags, 'Grup Çalışması'];

    updated[studentId] = {
      studentId,
      criterionScores: preservedIndividualScores,
      directCriterionScores: preservedIndividualDirect,
      groupCriterionScores: nextGroupScores,
      groupDirectScores: nextGroupDirect,
      groupNote: groupNoteClean,
      groupId: group.id,
      activeScoreSource: 'group',
      note: existingNote,
      tags: nextTags,
      updatedAt: timestampIso,
      evaluatedViaGroup: group.name,
    };
  }

  return updated;
}

/**
 * Determines whether auto-advance to the next pending student/group should trigger:
 * Strictly triggers ONLY when transitioning from incomplete (`wasCompleteBefore === false`)
 * to complete (`isCompleteAfter === true`) — never when editing an already completed evaluation.
 */
export function shouldTriggerAutoAdvance(
  wasCompleteBefore: boolean,
  isCompleteAfter: boolean,
  autoAdvanceEnabled: boolean
): boolean {
  return !wasCompleteBefore && isCompleteAfter && autoAdvanceEnabled;
}

export type GroupLifecycleState =
  | 'in_progress'
  | 'completed_unapplied'
  | 'applied';

export interface GroupLifecycleStatus {
  state: GroupLifecycleState;
  shortLabel: string;
  label: string;
  completedCriteriaCount: number;
  totalCriteriaCount: number;
  isComplete: boolean;
  finalScoreOutOf100: number | null;
  performanceLabel: string;
  appliedMemberCount: number;
  totalMemberCount: number;
  hasStaleMemberScores: boolean;
}

/**
 * Computes the explicit 3-stage lifecycle status for a group evaluation:
 * 1. `in_progress` ("Puanlanıyor"): Not all criteria are scored yet; definitive score is null.
 * 2. `completed_unapplied` ("Tamamlandı"): All criteria are scored, but scores have not yet been applied
 *    to group members (or group scores/members changed since last application).
 * 3. `applied` ("Üyelere Uygulandı"): All criteria are scored AND all current group members have
 *    synchronized reflected group scores in `evaluations`.
 */
export function getGroupLifecycleStatus(
  rubric: Rubric,
  group: StudentGroup,
  evaluations: Record<string, StudentEvaluation>
): GroupLifecycleStatus {
  const calc = calculateWeightedScore(
    rubric,
    group.criterionScores || {},
    group.directCriterionScores
  );
  const totalMemberCount = group.studentIds.length;
  let appliedMemberCount = 0;
  let membersWithAnyGroupScore = 0;

  for (const stuId of group.studentIds) {
    const ev = evaluations[stuId];
    if (!ev) continue;

    const hasAnyReflected =
      Object.values(ev.groupCriterionScores || {}).some((v) =>
        isScoreAssigned(v)
      ) ||
      Object.values(ev.groupDirectScores || {}).some((v) =>
        isScoreAssigned(v)
      ) ||
      Boolean(ev.groupNote && ev.groupNote.trim());

    if (hasAnyReflected) {
      membersWithAnyGroupScore += 1;
    }

    const matchesGroupIdentity =
      ev.groupId === group.id || ev.evaluatedViaGroup === group.name;
    if (!matchesGroupIdentity || calc.completedCriteriaCount === 0) {
      continue;
    }

    let allCriteriaMatch = true;
    for (const crit of rubric.criteria) {
      const grpDirect = group.directCriterionScores?.[crit.id];
      const stuDirect = ev.groupDirectScores?.[crit.id];
      const grpLvl = group.criterionScores?.[crit.id];
      const stuLvl = ev.groupCriterionScores?.[crit.id];

      if (isScoreAssigned(grpDirect) || isScoreAssigned(stuDirect)) {
        if ((grpDirect ?? null) !== (stuDirect ?? null)) {
          allCriteriaMatch = false;
          break;
        }
      } else if ((grpLvl ?? null) !== (stuLvl ?? null)) {
        allCriteriaMatch = false;
        break;
      }
    }

    const grpNoteClean = (group.groupNote || '').trim();
    const stuNoteClean = (ev.groupNote || '').trim();
    if (allCriteriaMatch && grpNoteClean === stuNoteClean) {
      appliedMemberCount += 1;
    }
  }

  const hasStaleMemberScores =
    membersWithAnyGroupScore > 0 && appliedMemberCount < totalMemberCount;

  if (!calc.isComplete) {
    return {
      state: 'in_progress',
      shortLabel: 'Puanlanıyor',
      label: `Puanlanıyor (${calc.completedCriteriaCount}/${calc.totalCriteriaCount} Ölçüt)`,
      completedCriteriaCount: calc.completedCriteriaCount,
      totalCriteriaCount: calc.totalCriteriaCount,
      isComplete: false,
      finalScoreOutOf100: null,
      performanceLabel: calc.performanceLabel,
      appliedMemberCount,
      totalMemberCount,
      hasStaleMemberScores,
    };
  }

  if (totalMemberCount > 0 && appliedMemberCount === totalMemberCount) {
    return {
      state: 'applied',
      shortLabel: 'Üyelere Uygulandı',
      label: `Üyelere Uygulandı (${appliedMemberCount}/${totalMemberCount} Üye)`,
      completedCriteriaCount: calc.completedCriteriaCount,
      totalCriteriaCount: calc.totalCriteriaCount,
      isComplete: true,
      finalScoreOutOf100: calc.finalScoreOutOf100,
      performanceLabel: calc.performanceLabel,
      appliedMemberCount,
      totalMemberCount,
      hasStaleMemberScores: false,
    };
  }

  return {
    state: 'completed_unapplied',
    shortLabel: 'Tamamlandı',
    label:
      totalMemberCount === 0
        ? 'Tamamlandı (Gruba Üye Ekleyin)'
        : hasStaleMemberScores
        ? 'Tamamlandı (Güncellemeyi Üyelere Uygulayın)'
        : 'Tamamlandı (Üyelere Uygulanmayı Bekliyor)',
    completedCriteriaCount: calc.completedCriteriaCount,
    totalCriteriaCount: calc.totalCriteriaCount,
    isComplete: true,
    finalScoreOutOf100: calc.finalScoreOutOf100,
    performanceLabel: calc.performanceLabel,
    appliedMemberCount,
    totalMemberCount,
    hasStaleMemberScores,
  };
}

/**
 * Finds the next group in the session that is either not yet completed or not yet applied to members.
 */
export function getNextPendingGroup(
  groups: StudentGroup[],
  evaluations: Record<string, StudentEvaluation>,
  rubric: Rubric,
  currentGroupId: string
): StudentGroup | null {
  if (groups.length === 0) return null;
  const currentIdx = groups.findIndex((g) => g.id === currentGroupId);

  for (let i = currentIdx + 1; i < groups.length; i++) {
    const g = groups[i];
    const status = getGroupLifecycleStatus(rubric, g, evaluations);
    if (status.state !== 'applied') {
      return g;
    }
  }

  for (let i = 0; i <= currentIdx && i < groups.length; i++) {
    const g = groups[i];
    if (g.id === currentGroupId) continue;
    const status = getGroupLifecycleStatus(rubric, g, evaluations);
    if (status.state !== 'applied') {
      return g;
    }
  }

  return null;
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
 * Checks whether a group already has any recorded criterion scores, direct scores, or observation notes.
 */
export function hasGroupEvaluationData(group: StudentGroup): boolean {
  const hasLevelScore = Object.values(group.criterionScores || {}).some((v) =>
    isScoreAssigned(v)
  );
  const hasDirectScore = Object.values(group.directCriterionScores || {}).some(
    (v) => isScoreAssigned(v)
  );
  const hasNote = Boolean(group.groupNote && group.groupNote.trim().length > 0);
  const hasApplied = Boolean(group.lastAppliedAt);
  return hasLevelScore || hasDirectScore || hasNote || hasApplied;
}

/**
 * Generates balanced random student groups and enforces unique membership (P1 #5).
 * When `existingGroups` is provided and `preserveEvaluatedGroups !== false`, any group
 * that already has scores or notes is preserved intact, and only the remaining students
 * are redistributed into new balanced groups.
 */
export function generateBalancedRandomGroups(
  students: Student[],
  options: {
    groupCount?: number;
    targetGroupSize?: number;
    seed?: number;
    existingGroups?: StudentGroup[];
    preserveEvaluatedGroups?: boolean;
  }
): StudentGroup[] {
  const activeStudents = students.filter((s) => !s.archived);
  if (activeStudents.length === 0) return [];

  const shouldPreserve =
    Array.isArray(options.existingGroups) &&
    options.existingGroups.length > 0 &&
    options.preserveEvaluatedGroups !== false;

  const preservedGroups: StudentGroup[] = shouldPreserve
    ? options.existingGroups!
        .filter((g) => hasGroupEvaluationData(g))
        .map((g) => JSON.parse(JSON.stringify(g)))
    : [];

  const lockedStudentIds = new Set<string>(
    preservedGroups.flatMap((g) => g.studentIds)
  );

  const availableStudents = activeStudents.filter(
    (s) => !lockedStudentIds.has(s.id)
  );

  if (availableStudents.length === 0) {
    return preservedGroups;
  }

  let numGroups = options.groupCount || 0;
  if (numGroups <= 0) {
    const size = Math.max(2, options.targetGroupSize || 3);
    numGroups = Math.max(1, Math.ceil(availableStudents.length / size));
  }
  numGroups = Math.min(numGroups, availableStudents.length);

  // Deterministic or seeded Fisher-Yates shuffle
  const pool = [...availableStudents];
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

  const startNum = preservedGroups.length;
  const newGroups = buckets.map((studentIds, idx) => ({
    id: `grp-rand-${Date.now()}-${startNum + idx + 1}`,
    name: `Grup ${startNum + idx + 1}`,
    studentIds,
    criterionScores: {},
    groupNote: '',
  }));

  return [...preservedGroups, ...newGroups];
}

/**
 * Safely redistributes session groups while protecting already-evaluated groups from accidental loss.
 * - By default (`preserveEvaluatedGroups: true`), keeps scored groups untouched and only distributes remaining students.
 * - If `preserveEvaluatedGroups: false`, blocks overwriting scored groups unless `allowOverwriteEvaluated: true` is explicitly passed.
 */
export function redistributeGroupsSafely(
  existingGroups: StudentGroup[],
  students: Student[],
  options: {
    targetGroupSize?: number;
    groupCount?: number;
    seed?: number;
    preserveEvaluatedGroups?: boolean;
    allowOverwriteEvaluated?: boolean;
  }
): {
  groups: StudentGroup[];
  preservedGroupCount: number;
  newGroupCount: number;
  redistributedStudentCount: number;
  blocked: boolean;
  warning?: string;
} {
  const evaluatedExisting = (existingGroups || []).filter((g) =>
    hasGroupEvaluationData(g)
  );
  const preserve = options.preserveEvaluatedGroups !== false;

  if (!preserve && evaluatedExisting.length > 0 && !options.allowOverwriteEvaluated) {
    return {
      groups: existingGroups,
      preservedGroupCount: evaluatedExisting.length,
      newGroupCount: 0,
      redistributedStudentCount: 0,
      blocked: true,
      warning: `${evaluatedExisting.length} grupta kayıtlı puan veya gözlem notu bulunduğu için açık onay olmadan mevcut gruplar silinemez.`,
    };
  }

  const nextGroups = generateBalancedRandomGroups(students, {
    targetGroupSize: options.targetGroupSize,
    groupCount: options.groupCount,
    seed: options.seed,
    existingGroups,
    preserveEvaluatedGroups: preserve,
  });

  const preservedCount = preserve ? evaluatedExisting.length : 0;
  const newGroupCount = Math.max(0, nextGroups.length - preservedCount);
  const lockedIds = new Set(
    preserve ? evaluatedExisting.flatMap((g) => g.studentIds) : []
  );
  const redistributedStudentCount = students.filter(
    (s) => !s.archived && !lockedIds.has(s.id)
  ).length;

  return {
    groups: nextGroups,
    preservedGroupCount: preservedCount,
    newGroupCount,
    redistributedStudentCount,
    blocked: false,
  };
}

/**
 * Checks whether an evaluation session already has any scored students or scored groups.
 */
export function hasSessionEvaluations(session: EvaluationSession): {
  hasEvaluations: boolean;
  evaluatedStudentCount: number;
  evaluatedGroupCount: number;
} {
  let evaluatedStudentCount = 0;
  for (const ev of Object.values(session.evaluations || {})) {
    const hasInd = Object.values(ev.criterionScores || {}).some((v) =>
      isScoreAssigned(v)
    );
    const hasIndDirect = Object.values(ev.directCriterionScores || {}).some(
      (v) => isScoreAssigned(v)
    );
    const hasGrp = Object.values(ev.groupCriterionScores || {}).some((v) =>
      isScoreAssigned(v)
    );
    const hasGrpDirect = Object.values(ev.groupDirectScores || {}).some((v) =>
      isScoreAssigned(v)
    );
    const hasNote = Boolean(ev.note && ev.note.trim().length > 0);
    if (hasInd || hasIndDirect || hasGrp || hasGrpDirect || hasNote) {
      evaluatedStudentCount += 1;
    }
  }

  const evaluatedGroupCount = (session.groups || []).filter((g) =>
    hasGroupEvaluationData(g)
  ).length;

  return {
    hasEvaluations: evaluatedStudentCount > 0 || evaluatedGroupCount > 0,
    evaluatedStudentCount,
    evaluatedGroupCount,
  };
}

/**
 * Checks whether a session's rubric can be changed directly without losing scored evaluations.
 */
export function canChangeSessionRubric(
  session: EvaluationSession,
  targetRubricId: string
): {
  allowed: boolean;
  evaluatedStudentCount: number;
  evaluatedGroupCount: number;
  reason?: string;
} {
  if (session.rubricId === targetRubricId) {
    return {
      allowed: true,
      evaluatedStudentCount: 0,
      evaluatedGroupCount: 0,
    };
  }

  const stats = hasSessionEvaluations(session);
  if (stats.hasEvaluations) {
    return {
      allowed: false,
      evaluatedStudentCount: stats.evaluatedStudentCount,
      evaluatedGroupCount: stats.evaluatedGroupCount,
      reason: `Bu oturumda ${stats.evaluatedStudentCount} öğrenci ve ${stats.evaluatedGroupCount} grup için puanlama yapılmıştır. Mevcut puanların bozulmaması için oturum rubriği doğrudan değiştirilemez.`,
    };
  }

  return {
    allowed: true,
    evaluatedStudentCount: 0,
    evaluatedGroupCount: 0,
  };
}

/**
 * Safely changes a session's rubric:
 * - Blocks in-place rubric changes if the session already has evaluations unless `confirmResetExistingScores` is true.
 * - When `confirmResetExistingScores` is true, records the previous state (evaluations, groups, rubricId, rubricSnapshot)
 *   into `undoHistory` before resetting criterion scores and freezing the new rubricSnapshot.
 */
export function changeSessionRubricSafely(
  session: EvaluationSession,
  newRubric: Rubric,
  options?: { confirmResetExistingScores?: boolean }
): {
  allowed: boolean;
  updatedSession: EvaluationSession;
  evaluatedStudentCount: number;
  evaluatedGroupCount: number;
  blockedReason?: string;
} {
  if (session.rubricId === newRubric.id) {
    return {
      allowed: true,
      updatedSession: session,
      evaluatedStudentCount: 0,
      evaluatedGroupCount: 0,
    };
  }

  const check = canChangeSessionRubric(session, newRubric.id);
  if (!check.allowed && !options?.confirmResetExistingScores) {
    return {
      allowed: false,
      updatedSession: session,
      evaluatedStudentCount: check.evaluatedStudentCount,
      evaluatedGroupCount: check.evaluatedGroupCount,
      blockedReason: check.reason,
    };
  }

  const snapshot = freezeRubricSnapshot(newRubric);

  if (!check.allowed && options?.confirmResetExistingScores) {
    const undoHistory = recordSessionUndoEntry(session, {
      scope: 'session',
      description: `Rubrik değişimi öncesi puanlar yedeklendi (${newRubric.title})`,
      previousEvaluations: session.evaluations,
      previousGroups: session.groups,
      previousRubricId: session.rubricId,
      previousRubricSnapshot: session.rubricSnapshot,
    });

    const resetGroups = (session.groups || []).map((g) => ({
      ...g,
      criterionScores: {},
      directCriterionScores: {},
      lastAppliedAt: undefined,
    }));

    return {
      allowed: true,
      evaluatedStudentCount: check.evaluatedStudentCount,
      evaluatedGroupCount: check.evaluatedGroupCount,
      updatedSession: {
        ...session,
        rubricId: newRubric.id,
        rubricSnapshot: snapshot,
        evaluations: {},
        groups: resetGroups,
        undoHistory,
      },
    };
  }

  return {
    allowed: true,
    evaluatedStudentCount: 0,
    evaluatedGroupCount: 0,
    updatedSession: {
      ...session,
      rubricId: newRubric.id,
      rubricSnapshot: snapshot,
    },
  };
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
 * Reconciles all students' reflected group scores (`groupCriterionScores`, `groupDirectScores`,
 * `groupNote`, `groupId`, `evaluatedViaGroup`, `'Grup Çalışması'` tag, and `activeScoreSource`)
 * with the current `groups` list in the session (P2 Group Membership & Score Reconciliation):
 * - When a student is removed from a group or their group is deleted, clears their stale reflected
 *   group scores/notes/groupId and switches `activeScoreSource` back to `'individual'`, while
 *   preserving 100% of their individual `criterionScores` and `note`.
 * - When a student is added to a group that already has recorded/applied scores, or remains in an
 *   evaluated group, keeps their reflected group scores synchronized with that group.
 */
export function reconcileGroupEvaluationsWithMemberships(
  currentEvaluations: Record<string, StudentEvaluation>,
  groups: StudentGroup[],
  timestampIso = new Date().toISOString(),
  rubric?: Rubric
): Record<string, StudentEvaluation> {
  const updated: Record<string, StudentEvaluation> = { ...currentEvaluations };

  const currentGroupByStudentId = new Map<string, StudentGroup>();
  for (const grp of groups || []) {
    for (const sid of grp.studentIds || []) {
      currentGroupByStudentId.set(sid, grp);
    }
  }

  const isGroupEligibleToApply = (grp: StudentGroup): boolean => {
    if (!hasGroupEvaluationData(grp)) return false;
    return canApplyGroupScoresToMembers(grp, rubric).allowed;
  };

  // 1. Clean or update existing student evaluation records
  for (const [stuId, existing] of Object.entries(updated)) {
    if (!existing) continue;
    const assignedGroup = currentGroupByStudentId.get(stuId);

    const hadReflectedGroupData =
      Boolean(existing.groupId) ||
      Boolean(existing.evaluatedViaGroup) ||
      Boolean(existing.groupNote && existing.groupNote.trim()) ||
      Object.values(existing.groupCriterionScores || {}).some((v) =>
        isScoreAssigned(v)
      ) ||
      Object.values(existing.groupDirectScores || {}).some((v) =>
        isScoreAssigned(v)
      ) ||
      existing.activeScoreSource === 'group';

    if (!assignedGroup) {
      // Student is no longer a member of ANY group: strip stale reflected group scores/metadata
      if (hadReflectedGroupData) {
        updated[stuId] = {
          ...existing,
          groupCriterionScores: {},
          groupDirectScores: undefined,
          groupNote: '',
          groupId: undefined,
          evaluatedViaGroup: undefined,
          activeScoreSource: 'individual',
          tags: (existing.tags || []).filter((t) => t !== 'Grup Çalışması'),
          updatedAt: timestampIso,
        };
      }
      continue;
    }

    // Student IS in `assignedGroup`
    const groupEligible = isGroupEligibleToApply(assignedGroup);
    if (!groupEligible) {
      // Student is in an unscored or incomplete group: clear any stale reflected group scores
      if (hadReflectedGroupData) {
        updated[stuId] = {
          ...existing,
          groupCriterionScores: {},
          groupDirectScores: undefined,
          groupNote: '',
          groupId: assignedGroup.id,
          evaluatedViaGroup: undefined,
          activeScoreSource: 'individual',
          tags: (existing.tags || []).filter((t) => t !== 'Grup Çalışması'),
          updatedAt: timestampIso,
        };
      }
    } else if (
      Boolean(assignedGroup.lastAppliedAt) ||
      hadReflectedGroupData
    ) {
      // Sync student's reflected group scores with their current COMPLETE evaluated group
      const wasAlreadyInSameGroup = existing.groupId === assignedGroup.id;
      const existingTags = existing.tags || [];
      const nextTags = existingTags.includes('Grup Çalışması')
        ? existingTags
        : [...existingTags, 'Grup Çalışması'];

      updated[stuId] = {
        ...existing,
        groupCriterionScores: { ...(assignedGroup.criterionScores || {}) },
        groupDirectScores: assignedGroup.directCriterionScores
          ? { ...assignedGroup.directCriterionScores }
          : undefined,
        groupNote: assignedGroup.groupNote || '',
        groupId: assignedGroup.id,
        evaluatedViaGroup: assignedGroup.name,
        activeScoreSource: wasAlreadyInSameGroup
          ? existing.activeScoreSource || 'group'
          : 'group',
        tags: nextTags,
        updatedAt: timestampIso,
      };
    }
  }

  // 2. Also ensure any newly added member of a COMPLETE group that ALREADY had scores applied gets synced
  for (const [stuId, grp] of currentGroupByStudentId.entries()) {
    const groupWasAlreadyApplied =
      Boolean(grp.lastAppliedAt) ||
      grp.studentIds.some((id) => {
        const ev = updated[id];
        return (
          ev &&
          (ev.groupId === grp.id || ev.evaluatedViaGroup === grp.name) &&
          (Object.values(ev.groupCriterionScores || {}).some((v) =>
            isScoreAssigned(v)
          ) ||
            Object.values(ev.groupDirectScores || {}).some((v) =>
              isScoreAssigned(v)
            ))
        );
      });

    if (
      !updated[stuId] &&
      isGroupEligibleToApply(grp) &&
      groupWasAlreadyApplied
    ) {
      updated[stuId] = {
        studentId: stuId,
        criterionScores: {},
        groupCriterionScores: { ...(grp.criterionScores || {}) },
        groupDirectScores: grp.directCriterionScores
          ? { ...grp.directCriterionScores }
          : undefined,
        groupNote: grp.groupNote || '',
        groupId: grp.id,
        evaluatedViaGroup: grp.name,
        activeScoreSource: 'group',
        note: '',
        tags: ['Grup Çalışması'],
        updatedAt: timestampIso,
      };
    }
  }

  return updated;
}

/**
 * Evaluates a group as a unit (updating criterionScores, directCriterionScores, or groupNote)
 * and transfers the evaluation to the group's member students when complete:
 * - If the updated group evaluation is complete (`canApplyGroupScoresToMembers` is true) and
 *   `autoTransferToMembers !== false`, automatically transfers the group evaluation to all member students.
 * - If the updated group evaluation becomes incomplete (e.g., a criterion was cleared or reset),
 *   reconciles member records so incomplete group scores are never left applied on members.
 */
export function evaluateGroupAndTransferToMembers(
  session: EvaluationSession,
  groupId: string,
  updater: (group: StudentGroup) => StudentGroup,
  options?: {
    rubric?: Rubric;
    timestampIso?: string;
    autoTransferToMembers?: boolean;
    undoDescription?: string;
    criterionId?: string;
  }
): {
  updatedSession: EvaluationSession;
  transferredToMembers: boolean;
  transferredMemberCount: number;
  wasCompleteBefore: boolean;
  isCompleteAfter: boolean;
} {
  const effectiveRubric = options?.rubric ?? session.rubricSnapshot;
  const nowIso = options?.timestampIso ?? new Date().toISOString();
  const autoTransfer = options?.autoTransferToMembers !== false;

  const targetGroup = (session.groups || []).find((g) => g.id === groupId);
  if (!targetGroup) {
    return {
      updatedSession: session,
      transferredToMembers: false,
      transferredMemberCount: 0,
      wasCompleteBefore: false,
      isCompleteAfter: false,
    };
  }

  const wasCompleteBefore = canApplyGroupScoresToMembers(
    targetGroup,
    effectiveRubric
  ).allowed;

  const nextGroupRaw = updater(targetGroup);
  const eligibilityAfter = canApplyGroupScoresToMembers(
    nextGroupRaw,
    effectiveRubric
  );
  const isCompleteAfter = eligibilityAfter.allowed;

  const shouldTransferNow =
    isCompleteAfter &&
    (autoTransfer || Boolean(targetGroup.lastAppliedAt));

  const finalizedGroup: StudentGroup = shouldTransferNow
    ? { ...nextGroupRaw, lastAppliedAt: nowIso }
    : !isCompleteAfter
    ? { ...nextGroupRaw, lastAppliedAt: undefined }
    : nextGroupRaw;

  const updatedGroups = (session.groups || []).map((g) =>
    g.id === groupId ? finalizedGroup : g
  );

  let updatedEvaluations = session.evaluations;
  let transferredToMembers = false;

  if (shouldTransferNow) {
    updatedEvaluations = applyGroupScoresToMembers(
      session.evaluations,
      finalizedGroup,
      nowIso,
      effectiveRubric
    );
    transferredToMembers = true;
  } else if (!isCompleteAfter) {
    updatedEvaluations = reconcileGroupEvaluationsWithMemberships(
      session.evaluations,
      updatedGroups,
      nowIso,
      effectiveRubric
    );
  }

  const undoHistory = options?.undoDescription
    ? recordSessionUndoEntry(session, {
        scope: 'group',
        groupId,
        criterionId: options.criterionId,
        description: options.undoDescription,
        previousEvaluations: session.evaluations,
        previousGroups: session.groups,
      })
    : session.undoHistory;

  return {
    updatedSession: {
      ...session,
      groups: updatedGroups,
      evaluations: updatedEvaluations,
      undoHistory,
    },
    transferredToMembers,
    transferredMemberCount: transferredToMembers
      ? finalizedGroup.studentIds.length
      : 0,
    wasCompleteBefore,
    isCompleteAfter,
  };
}

/**
 * Transfers all completed group evaluations in a session to their respective member students.
 * Incomplete or empty groups are strictly skipped.
 */
export function transferAllCompletedGroupsToMembers(
  session: EvaluationSession,
  rubric?: Rubric,
  timestampIso = new Date().toISOString()
): {
  updatedSession: EvaluationSession;
  transferredGroupCount: number;
  transferredStudentCount: number;
} {
  const effectiveRubric = rubric ?? session.rubricSnapshot;
  let nextEvaluations = { ...session.evaluations };
  let transferredGroupCount = 0;
  let transferredStudentCount = 0;

  const nextGroups = (session.groups || []).map((grp) => {
    const eligibility = canApplyGroupScoresToMembers(grp, effectiveRubric);
    if (!eligibility.allowed) {
      return grp;
    }
    transferredGroupCount += 1;
    transferredStudentCount += grp.studentIds.length;
    nextEvaluations = applyGroupScoresToMembers(
      nextEvaluations,
      grp,
      timestampIso,
      effectiveRubric
    );
    return {
      ...grp,
      lastAppliedAt: timestampIso,
    };
  });

  if (transferredGroupCount === 0) {
    return {
      updatedSession: session,
      transferredGroupCount: 0,
      transferredStudentCount: 0,
    };
  }

  const undoHistory = recordSessionUndoEntry(session, {
    scope: 'group',
    description: `${transferredGroupCount} grubun değerlendirmesi ${transferredStudentCount} öğrenciye aktarıldı`,
    previousEvaluations: session.evaluations,
    previousGroups: session.groups,
  });

  return {
    updatedSession: {
      ...session,
      groups: nextGroups,
      evaluations: nextEvaluations,
      undoHistory,
    },
    transferredGroupCount,
    transferredStudentCount,
  };
}

/**
 * Deletes a group from a session and automatically reconciles all former members' reflected
 * `groupCriterionScores`, `groupDirectScores`, `groupNote`, and `groupId` while recording an undo entry.
 */
export function deleteGroupAndReconcile(
  session: EvaluationSession,
  groupId: string,
  timestampIso = new Date().toISOString(),
  rubric?: Rubric
): EvaluationSession {
  const targetGroup = (session.groups || []).find((g) => g.id === groupId);
  const nextGroups = (session.groups || []).filter((g) => g.id !== groupId);
  const undoHistory = recordSessionUndoEntry(session, {
    scope: 'group',
    groupId,
    description: `${targetGroup?.name || 'Grup'} silindi ve üye grup puanları uzlaştırıldı`,
    previousEvaluations: session.evaluations,
    previousGroups: session.groups,
  });
  const nextEvaluations = reconcileGroupEvaluationsWithMemberships(
    session.evaluations,
    nextGroups,
    timestampIso,
    rubric ?? session.rubricSnapshot
  );

  return {
    ...session,
    groups: nextGroups,
    evaluations: nextEvaluations,
    undoHistory,
  };
}

/**
 * Toggles a student's membership in a group and automatically reconciles reflected group scores:
 * - Removing a student from a group immediately clears their stale `groupCriterionScores`, `groupNote`, and `groupId`.
 * - Adding a student to a completed evaluated group syncs that group's scores to the student's `groupCriterionScores`.
 */
export function toggleGroupMemberAndReconcile(
  session: EvaluationSession,
  groupId: string,
  studentId: string,
  timestampIso = new Date().toISOString(),
  rubric?: Rubric
): EvaluationSession {
  const conflicts = findDuplicateGroupMemberships(
    session.groups || [],
    [studentId],
    groupId
  );
  if (conflicts.length > 0) {
    return session;
  }

  const targetGroup = (session.groups || []).find((g) => g.id === groupId);
  if (!targetGroup) return session;

  const isRemoving = targetGroup.studentIds.includes(studentId);
  const nextGroups = (session.groups || []).map((g) => {
    if (g.id !== groupId) return g;
    return {
      ...g,
      studentIds: isRemoving
        ? g.studentIds.filter((id) => id !== studentId)
        : [...g.studentIds, studentId],
    };
  });

  const undoHistory = recordSessionUndoEntry(session, {
    scope: 'group',
    groupId,
    studentId,
    description: isRemoving
      ? `${targetGroup.name} grubundan öğrenci çıkarıldı`
      : `${targetGroup.name} grubuna öğrenci eklendi`,
    previousEvaluations: session.evaluations,
    previousGroups: session.groups,
  });

  const nextEvaluations = reconcileGroupEvaluationsWithMemberships(
    session.evaluations,
    nextGroups,
    timestampIso,
    rubric ?? session.rubricSnapshot
  );

  return {
    ...session,
    groups: nextGroups,
    evaluations: nextEvaluations,
    undoHistory,
  };
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
    previousRubricId: entry.previousRubricId,
    previousRubricSnapshot: entry.previousRubricSnapshot
      ? JSON.parse(JSON.stringify(entry.previousRubricSnapshot))
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
