import type {
  Classroom,
  Rubric,
  RubricCriterion,
  RubricCriterionSection,
  DualEvaluationResult,
  Student,
  StudentAuditEntry,
  StudentEvaluation,
  EvaluationSession,
  StudentGroup,
  ParsedRosterRow,
  EvaluationActionHistoryEntry,
} from '../types.ts';
import {
  INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID,
  LEGACY_BOOK_PRESENTATION_RUBRIC,
  LEGACY_BOOK_PRESENTATION_RUBRIC_ID,
  LEGACY_V3_INFORMATIVE_BOOK_RUBRIC,
  LEGACY_V3_LITERARY_BOOK_RUBRIC,
  LITERARY_BOOK_PRESENTATION_RUBRIC_ID,
} from '../data/bookPresentationRubric.ts';

export const MAX_STUDENT_AUDIT_LOG_ENTRIES = 50;
export const MAX_UNDO_HISTORY_ENTRIES = 30;
export const MAX_NOTE_LENGTH = 1000;
export const MAX_SESSION_TITLE_LENGTH = 120;

let entitySequenceCounter = 0;

/**
 * Generates a collision-proof entity ID combining timestamp, a monotonic counter,
 * and random entropy so rapid bulk operations in the same millisecond never collide.
 */
export function createUniqueEntityId(prefix: string): string {
  entitySequenceCounter = (entitySequenceCounter + 1) % 1000000;
  const randomSuffix = Math.floor(Math.random() * 46656)
    .toString(36)
    .padStart(3, '0');
  return `${prefix}-${Date.now()}-${entitySequenceCounter}-${randomSuffix}`;
}

/**
 * Prepends a new audit log entry to a student's audit history while bounding the array
 * to `maxEntries` (default 50) so local storage never bloats unboundedly.
 */
export function appendStudentAuditLog(
  existingLog: StudentAuditEntry[] | undefined,
  newEntry: StudentAuditEntry,
  maxEntries = MAX_STUDENT_AUDIT_LOG_ENTRIES
): StudentAuditEntry[] {
  const safeExisting = Array.isArray(existingLog) ? existingLog : [];
  return [newEntry, ...safeExisting].slice(0, Math.max(1, maxEntries));
}

/**
 * Sanitizes observation notes or text inputs by stripping null bytes and non-printable
 * control characters (while preserving newlines, tabs, and all Turkish characters) and capping length.
 */
export function sanitizeObservationText(
  text: string,
  maxLength = MAX_NOTE_LENGTH
): string {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .slice(0, Math.max(1, maxLength));
}

/**
 * Sanitizes an arbitrary title into a safe, bounded download filename slug (preserving Turkish letters).
 */
export function sanitizeExportFilename(
  rawTitle: string,
  fallback = 'rapor'
): string {
  const cleaned = String(rawTitle ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöç]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return cleaned || fallback;
}

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
/**
 * Detects whether a book presentation session without an explicit `rubricSnapshot`
 * was recorded using the legacy 7-criterion v3 rubric (`edebi-1..7` or `bilgi-1..7`),
 * ensuring historical v3 sessions are never retroactively recalculated under the 10-criterion v4 rubric.
 */
export function inferLegacyBookRubricSnapshotIfNeeded(
  session: EvaluationSession | null | undefined
): Rubric | null {
  if (!session) return null;
  if (session.rubricSnapshot && session.rubricSnapshot.id === session.rubricId) {
    return session.rubricSnapshot;
  }
  if (
    session.rubricId !== LITERARY_BOOK_PRESENTATION_RUBRIC_ID &&
    session.rubricId !== INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID
  ) {
    return null;
  }

  const allCriterionKeys = new Set<string>();
  let hasDualScoreFields = false;

  for (const ev of Object.values(session.evaluations || {})) {
    if (!ev) continue;
    if (
      ev.bookPresentationScore !== undefined ||
      ev.speakingExamScore !== undefined ||
      ev.contentScoreOutOf70 !== undefined ||
      ev.groupBookPresentationScore !== undefined ||
      ev.groupSpeakingExamScore !== undefined ||
      ev.groupContentScoreOutOf70 !== undefined
    ) {
      hasDualScoreFields = true;
    }
    for (const k of Object.keys(ev.criterionScores || {})) allCriterionKeys.add(k);
    for (const k of Object.keys(ev.directCriterionScores || {})) allCriterionKeys.add(k);
    for (const k of Object.keys(ev.groupCriterionScores || {})) allCriterionKeys.add(k);
    for (const k of Object.keys(ev.groupDirectScores || {})) allCriterionKeys.add(k);
  }

  for (const grp of session.groups || []) {
    if (!grp) continue;
    if (
      grp.groupBookPresentationScore !== undefined ||
      grp.groupSpeakingExamScore !== undefined ||
      grp.groupContentScoreOutOf70 !== undefined
    ) {
      hasDualScoreFields = true;
    }
    for (const k of Object.keys(grp.criterionScores || {})) allCriterionKeys.add(k);
    for (const k of Object.keys(grp.directCriterionScores || {})) allCriterionKeys.add(k);
  }

  const hasV4OnlyKey = Array.from(allCriterionKeys).some(
    (k) =>
      k.includes('-konusma-') ||
      k.endsWith('-8') ||
      k.endsWith('-9') ||
      k.endsWith('-10')
  );
  if (hasV4OnlyKey || hasDualScoreFields) {
    return null;
  }

  const hasLegacyNamedV3Criteria =
    allCriterionKeys.has('edebi-5') ||
    allCriterionKeys.has('edebi-6') ||
    allCriterionKeys.has('edebi-7') ||
    allCriterionKeys.has('bilgi-5') ||
    allCriterionKeys.has('bilgi-6') ||
    allCriterionKeys.has('bilgi-7');

  const isCompletedHistoricalV3 =
    session.status === 'completed' && allCriterionKeys.size > 0;

  if (hasLegacyNamedV3Criteria || isCompletedHistoricalV3) {
    return freezeRubricSnapshot(
      session.rubricId === LITERARY_BOOK_PRESENTATION_RUBRIC_ID
        ? LEGACY_V3_LITERARY_BOOK_RUBRIC
        : LEGACY_V3_INFORMATIVE_BOOK_RUBRIC
    );
  }

  return null;
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
  const inferredLegacy = inferLegacyBookRubricSnapshotIfNeeded(session);
  if (inferredLegacy) {
    return inferredLegacy;
  }
  if (rubricsById[session.rubricId]) {
    return rubricsById[session.rubricId];
  }
  if (session.rubricId === LEGACY_BOOK_PRESENTATION_RUBRIC_ID) {
    return freezeRubricSnapshot(LEGACY_BOOK_PRESENTATION_RUBRIC);
  }
  return null;
}

/**
 * Checks whether a rubric uses the “Tek Değerlendirme, İki Sonuç” (Kitap İçeriği 70 + Ortak Konuşma 100)
 * dual evaluation system.
 * Historical 7-criterion (v3) or 8-criterion (v2) snapshots return false so past sessions are never recalculated.
 */
export function isDualBookSpeakingRubric(
  rubric: Rubric | null | undefined
): boolean {
  if (!rubric || !Array.isArray(rubric.criteria)) return false;
  if (rubric.scoringMode === 'standard_100') return false;
  if (rubric.scoringMode === 'dual_weighted_book_and_speaking') return true;
  if (rubric.scoringMode === 'dual_book_and_speaking') return true;
  const hasContent = rubric.criteria.some((c) => c.section === 'content');
  const hasSpeaking = rubric.criteria.some((c) => c.section === 'speaking');
  return hasContent && hasSpeaking;
}

/**
 * Resolves which section ('content' | 'speaking') a criterion belongs to in a dual rubric.
 */
export function getCriterionSection(
  criterion: RubricCriterion,
  index?: number,
  rubric?: Rubric | null
): RubricCriterionSection | null {
  if (criterion.section === 'content' || criterion.section === 'speaking') {
    return criterion.section;
  }
  if (rubric && isDualBookSpeakingRubric(rubric)) {
    const cat = (criterion.category || '').toLocaleLowerCase('tr-TR');
    if (cat.includes('konuşma') || cat.includes('sözlü')) {
      return 'speaking';
    }
    if (cat.includes('içerik') || cat.includes('içeriği') || cat.includes('eser')) {
      return 'content';
    }
    if (typeof index === 'number') {
      return index < 4 ? 'content' : 'speaking';
    }
  }
  return null;
}

function getPerformanceBandAndLabel(scoreOutOf100: number): {
  performanceBand: 'Ornek' | 'Yetkin' | 'Gelismekte' | 'DestekGerekli';
  performanceLabel: string;
} {
  if (scoreOutOf100 >= 85) {
    return { performanceBand: 'Ornek', performanceLabel: 'Örnek Düzey' };
  }
  if (scoreOutOf100 >= 70) {
    return { performanceBand: 'Yetkin', performanceLabel: 'Yetkin' };
  }
  if (scoreOutOf100 >= 50) {
    return { performanceBand: 'Gelismekte', performanceLabel: 'Gelişmekte' };
  }
  return { performanceBand: 'DestekGerekli', performanceLabel: 'Destek Gerekli' };
}

/**
 * Validates a rubric before saving (P1 #1):
 * - Non-empty title
 * - At least 1 criterion
 * - Standard rubrics: Total criterion points === 100 and total weight === 100
 * - Dual book & speaking rubrics: Content section === 70 points and Speaking section === 100 points (total 170 raw criterion points)
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
  let contentWeight = 0;
  let contentPoints = 0;
  let speakingWeight = 0;
  let speakingPoints = 0;
  const isDual = isDualBookSpeakingRubric(rubric);

  rubric.criteria.forEach((crit, idx) => {
    const labelPrefix = `${idx + 1}. Ölçüt`;
    if (!crit.title || !crit.title.trim()) {
      errors.push(`${labelPrefix}: Başlık boş olamaz.`);
    }
    const weight = Number(crit.weight);
    const pts = Number(crit.maxPoints ?? crit.weight);
    const sec = getCriterionSection(crit, idx, rubric);

    if (Number.isNaN(weight) || weight <= 0) {
      errors.push(`${labelPrefix}: Ağırlık 0'dan büyük olmalıdır.`);
    } else {
      totalWeight += weight;
      if (sec === 'content') contentWeight += weight;
      if (sec === 'speaking') speakingWeight += weight;
    }

    if (Number.isNaN(pts) || pts <= 0) {
      errors.push(`${labelPrefix}: Kriter puanı 0'dan büyük olmalıdır.`);
    } else {
      totalPoints += pts;
      if (sec === 'content') contentPoints += pts;
      if (sec === 'speaking') speakingPoints += pts;
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

  if (isDual) {
    if (rubric.scoringMode === 'dual_weighted_book_and_speaking' &&
        (rubric.criteria.length !== 10 ||
          getCriterionSection(rubric.criteria[0], 0, rubric) !== 'content' ||
          rubric.criteria.filter((c, i) => getCriterionSection(c, i, rubric) === 'content').length !== 4 ||
          rubric.criteria.filter((c, i) => getCriterionSection(c, i, rubric) === 'speaking').length !== 6 ||
          rubric.criteria.some((c, i) => getCriterionSection(c, i, rubric) !== (i < 4 ? 'content' : 'speaking')))) {
      errors.push('Bu puanlama modeli K1 ilk ölçüt olmak üzere dört içerik ve altı konuşma ölçütü gerektirir.');
    }
    if (Math.round(contentPoints * 100) / 100 !== 70 || Math.round(contentWeight * 100) / 100 !== 70) {
      errors.push(
        `Kitap içeriği bölümü toplam 70 puan olmalıdır (Şu an: ${contentPoints} Puan).`
      );
    }
    if (Math.round(speakingPoints * 100) / 100 !== 100 || Math.round(speakingWeight * 100) / 100 !== 100) {
      errors.push(
        `Ortak konuşma değerlendirmesi bölümü toplam 100 puan olmalıdır (Şu an: ${speakingPoints} Puan).`
      );
    }
  } else {
    if (Math.round(totalWeight * 100) / 100 !== 100) {
      errors.push(`Toplam ağırlık %100 olmalıdır (Şu an: %${totalWeight}).`);
    }

    if (Math.round(totalPoints * 100) / 100 !== 100) {
      errors.push(`Toplam kriter puanı 100 olmalıdır (Şu an: ${totalPoints} Puan).`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Resolves the normalized [0, 1] achievement ratio for a selected level score on a criterion.
 * Supports both 5-level (0..4) and 3-level MEB (Hayır=0/%0, Kısmen=1/%50, Evet=2/%100) rubrics,
 * as well as percentage inputs (50, 100) when maxLevelPts === 2.
 */
export function resolveCriterionLevelRatio(
  criterion: RubricCriterion,
  selectedLevelPts: number
): number {
  const maxLevelPts = Math.max(...criterion.levels.map((l) => l.points), 1);
  if (selectedLevelPts <= 0) return 0;
  if (maxLevelPts === 2 && (selectedLevelPts === 50 || selectedLevelPts === 100)) {
    return selectedLevelPts / 100;
  }
  return Math.max(0, Math.min(1, selectedLevelPts / maxLevelPts));
}

/**
 * Returns the percentage equivalent (0..100) for a criterion level score.
 */
export function getCriterionLevelPercentage(
  criterion: RubricCriterion,
  selectedLevelPts: number
): number {
  return Math.round(resolveCriterionLevelRatio(criterion, selectedLevelPts) * 100);
}

/**
 * Returns the earned points out of the criterion's weight/maxPoints (e.g., 20, 10, 0 for a 20-point criterion).
 * Buçuklu puanlar öğretmen değerlendirmesinde bir üst tam puana tamamlanır (Math.ceil).
 */
export function getCriterionEarnedPoints(
  criterion: RubricCriterion,
  selectedLevelPts: number | null | undefined,
  directPts?: number | null | undefined
): number | null {
  const effectiveWeight =
    typeof criterion.maxPoints === 'number' && criterion.maxPoints > 0
      ? criterion.maxPoints
      : criterion.weight;
  if (isScoreAssigned(directPts)) {
    return Math.max(0, Math.min(effectiveWeight, directPts));
  }
  if (isScoreAssigned(selectedLevelPts)) {
    const ratio = resolveCriterionLevelRatio(criterion, selectedLevelPts);
    const maxLevelPts = Math.max(...criterion.levels.map((l) => l.points), 1);
    // 3 dereceli MEB ölçeklerinde (Evet - Kısmen - Hayır) buçuklu puanlar bir üst tam puana tamamlanır (Math.ceil)
    return maxLevelPts === 2
      ? Math.ceil(ratio * effectiveWeight)
      : Math.round(ratio * effectiveWeight * 100) / 100;
  }
  return null;
}

/** Returns the actual contribution of one criterion to a weighted dual report. */
export function getWeightedDualReportCriterion(
  rubric: Rubric,
  index: number,
  report: 'book' | 'speaking',
  scores: Record<string, number | null | undefined>,
  directScores?: Record<string, number | null | undefined>
): { maximum: number; earned: number | null } | null {
  if (!isDualBookSpeakingRubric(rubric)) return null;
  const criterion = rubric.criteria[index];
  if (!criterion) return null;
  const section = getCriterionSection(criterion, index, rubric);
  const speakingIndex = rubric.criteria.slice(0, index).filter((c, i) => getCriterionSection(c, i, rubric) === 'speaking').length;
  if (rubric.scoringMode !== 'dual_weighted_book_and_speaking') {
    if (report === 'speaking' && section !== 'speaking') return null;
    const sectionMaximum = rubric.criteria.reduce((sum, item, i) => getCriterionSection(item, i, rubric) === section ? sum + (item.maxPoints ?? item.weight) : sum, 0);
    if (!sectionMaximum) return null;
    const total = section === 'content' ? 70 : report === 'book' ? 30 : 100;
    const rawMaximum = criterion.maxPoints ?? criterion.weight;
    const maximum = Math.round((rawMaximum / sectionMaximum) * total * 100) / 100;
    const raw = getCriterionEarnedPoints(criterion, scores?.[criterion.id], directScores?.[criterion.id]);
    return { maximum, earned: raw === null ? null : Math.round((raw / sectionMaximum) * total * 100) / 100 };
  }
  const bookUsesThreeSpeakingCriteria = (rubric.version ?? 0) >= 7;
  const maximum = report === 'book'
    ? section === 'content' ? (criterion.maxPoints ?? criterion.weight) : bookUsesThreeSpeakingCriteria ? (speakingIndex < 3 ? 10 : undefined) : 5
    : index === 0 ? 10 : section === 'speaking' ? [15, 20, 20, 15, 15, 5][speakingIndex] : undefined;
  if (maximum === undefined) return null;
  const raw = getCriterionEarnedPoints(criterion, scores?.[criterion.id], directScores?.[criterion.id]);
  if (raw === null) return { maximum, earned: null };
  const rawMaximum = criterion.maxPoints ?? criterion.weight;
  const contribution = rawMaximum > 0 ? raw / rawMaximum * maximum : 0;
  return { maximum, earned: (rubric.version ?? 0) >= 6 ? Math.ceil(contribution - 1e-10) : contribution };
}

/**
 * “Tek Değerlendirme, İki Sonuç” hesaplayıcısı:
 * - 1. Kitap içeriği: 4 ölçüt, 70 puan
 * - 2. Ortak konuşma değerlendirmesi: 6 ölçüt, 100 puan
 * - Konuşma sınavı notu (100 üzerinden): 6 konuşma ölçütünün toplamı (yalnızca 6 konuşma ölçütü tamamlandığında kesinleşir).
 * - Kitap sunumu notu (100 üzerinden): İçerik puanı (70 üzerinden) + konuşma puanının %30'u (yalnızca 10 ölçütün tamamı puanlandığında kesinleşir).
 */
export function calculateDualBookSpeakingScore(
  rubric: Rubric,
  criterionScores: Record<string, number | null | undefined>,
  directCriterionScores?: Record<string, number | null | undefined>
): DualEvaluationResult {
  const weightedDual = rubric.scoringMode === 'dual_weighted_book_and_speaking';
  // Version 6 assigns a whole-number contribution to each criterion. Version 5
  // snapshots keep their original final-only rounding for historical reports.
  const wholeCriterionScores = weightedDual && (rubric.version ?? 0) >= 6;
  const bookUsesThreeSpeakingCriteria = weightedDual && (rubric.version ?? 0) >= 7;
  let contentEarnedPoints = 0;
  let contentMaxPoints = 0;
  let contentCompletedCount = 0;
  let contentTotalCount = 0;
  let contentRequiredCount = 0;
  let contentCompletedRequiredCount = 0;

  let speakingEarnedPoints = 0;
  let speakingMaxPoints = 0;
  let speakingCompletedCount = 0;
  let speakingTotalCount = 0;
  let speakingRequiredCount = 0;
  let speakingCompletedRequiredCount = 0;

  let weightedBookSpeaking = 0;
  let weightedSpeaking = 0;
  let sharedTopicCompleted = false;
  let bookSpeakingTotal = 0;
  let bookSpeakingCompleted = 0;
  rubric.criteria.forEach((criterion, idx) => {
    const sec = getCriterionSection(criterion, idx, rubric) || (idx < 4 ? 'content' : 'speaking');
    const isRequired = criterion.required !== false;
    const effectiveWeight =
      typeof criterion.maxPoints === 'number' && criterion.maxPoints > 0
        ? criterion.maxPoints
        : criterion.weight;

    const earned = getCriterionEarnedPoints(
      criterion,
      criterionScores?.[criterion.id],
      directCriterionScores?.[criterion.id]
    );

    if (sec === 'content') {
      contentTotalCount += 1;
      contentMaxPoints += effectiveWeight;
      if (isRequired) contentRequiredCount += 1;
      if (earned !== null) {
        contentCompletedCount += 1;
        if (isRequired) contentCompletedRequiredCount += 1;
        contentEarnedPoints += wholeCriterionScores ? Math.ceil(earned - 1e-10) : earned;
        if (weightedDual && idx === 0) {
          weightedSpeaking += getWeightedDualReportCriterion(rubric, idx, 'speaking', criterionScores, directCriterionScores)?.earned ?? 0;
          sharedTopicCompleted = true;
        }
      }
    } else {
      const bookCriterion = weightedDual ? getWeightedDualReportCriterion(rubric, idx, 'book', criterionScores, directCriterionScores) : null;
      if (bookCriterion) {
        bookSpeakingTotal += 1;
        if (bookCriterion.earned !== null) bookSpeakingCompleted += 1;
      }
      speakingTotalCount += 1;
      speakingMaxPoints += effectiveWeight;
      if (isRequired) speakingRequiredCount += 1;
      if (earned !== null) {
        speakingCompletedCount += 1;
        if (isRequired) speakingCompletedRequiredCount += 1;
        speakingEarnedPoints += earned;
        if (weightedDual) {
          weightedSpeaking += getWeightedDualReportCriterion(rubric, idx, 'speaking', criterionScores, directCriterionScores)?.earned ?? 0;
          weightedBookSpeaking += bookCriterion?.earned ?? 0;
        }
      }
    }
  });

  const isContentComplete =
    contentTotalCount > 0 &&
    contentCompletedRequiredCount === contentRequiredCount &&
    contentCompletedCount === contentTotalCount;

  const isSpeakingComplete =
    speakingTotalCount > 0 &&
    speakingCompletedRequiredCount === speakingRequiredCount &&
    speakingCompletedCount === speakingTotalCount &&
    (!weightedDual || sharedTopicCompleted);

  const normalizedContentEarned =
    contentMaxPoints > 0 && contentMaxPoints !== 70
      ? (contentEarnedPoints / contentMaxPoints) * 70
      : contentEarnedPoints;

  const finalContentScoreOutOf70 = isContentComplete
    ? Math.min(70, Math.max(0, wholeCriterionScores ? normalizedContentEarned : Math.round(normalizedContentEarned)))
    : null;

  const normalizedSpeakingEarned = weightedDual ? weightedSpeaking :
    speakingMaxPoints > 0 && speakingMaxPoints !== 100
      ? (speakingEarnedPoints / speakingMaxPoints) * 100
      : speakingEarnedPoints;

  const provisionalSpeakingScoreOutOf100 = Math.min(
    100,
    Math.max(0, wholeCriterionScores ? normalizedSpeakingEarned : Math.round(normalizedSpeakingEarned))
  );

  const finalSpeakingScoreOutOf100 = isSpeakingComplete
    ? provisionalSpeakingScoreOutOf100
    : null;

  const speakingContributionRaw = weightedDual ? weightedBookSpeaking : normalizedSpeakingEarned * 0.3;
  const speakingContributionOutOf30 =
    wholeCriterionScores ? speakingContributionRaw : weightedDual ? Math.round(speakingContributionRaw) : Math.round(speakingContributionRaw * 10) / 10;

  const isBookPresentationComplete = isContentComplete && (bookUsesThreeSpeakingCriteria
    ? bookSpeakingTotal === 3 && bookSpeakingCompleted === 3
    : isSpeakingComplete);

  const provisionalBookPresentationScoreOutOf100 = Math.min(
    100,
    Math.max(0, wholeCriterionScores ? normalizedContentEarned + speakingContributionRaw : Math.round(normalizedContentEarned + speakingContributionRaw))
  );

  const finalBookPresentationScoreOutOf100 = isBookPresentationComplete
    ? provisionalBookPresentationScoreOutOf100
    : null;

  const speakingPerformanceLabel =
    speakingCompletedCount === 0 && !(weightedDual && sharedTopicCompleted)
      ? 'Değerlendirilmedi'
      : !isSpeakingComplete
      ? `Eksik Ölçüt (${speakingCompletedCount + (weightedDual && sharedTopicCompleted ? 1 : 0)}/${speakingTotalCount + (weightedDual ? 1 : 0)})`
      : getPerformanceBandAndLabel(provisionalSpeakingScoreOutOf100)
          .performanceLabel;

  const totalCompleted = contentCompletedCount + (bookUsesThreeSpeakingCriteria ? bookSpeakingCompleted : speakingCompletedCount);
  const totalCount = contentTotalCount + (bookUsesThreeSpeakingCriteria ? bookSpeakingTotal : speakingTotalCount);

  const bookPresentationPerformanceLabel =
    totalCompleted === 0
      ? 'Değerlendirilmedi'
      : !isBookPresentationComplete
      ? `Eksik Ölçüt (${totalCompleted}/${totalCount})`
      : getPerformanceBandAndLabel(provisionalBookPresentationScoreOutOf100)
          .performanceLabel;

  const roundedContentEarned = Math.round(normalizedContentEarned * 100) / 100;
  const roundedSpeakingEarned = Math.round(normalizedSpeakingEarned * 100) / 100;

  return {
    isDualRubric: true,
    contentEarnedPoints: roundedContentEarned,
    contentScoreOutOf70: Math.min(70, Math.max(0, Math.round(normalizedContentEarned))),
    contentMaxPoints: contentMaxPoints || 70,
    contentCompletedCount,
    completedContentCount: contentCompletedCount,
    contentTotalCount,
    totalContentCount: contentTotalCount,
    isContentComplete,
    finalContentScoreOutOf70,
    speakingEarnedPoints: weightedDual ? Math.round(roundedSpeakingEarned) : roundedSpeakingEarned,
    speakingScoreOutOf100: provisionalSpeakingScoreOutOf100,
    speakingMaxPoints: speakingMaxPoints || 100,
    speakingCompletedCount: speakingCompletedCount + (weightedDual && sharedTopicCompleted ? 1 : 0),
    completedSpeakingCount: speakingCompletedCount + (weightedDual && sharedTopicCompleted ? 1 : 0),
    speakingTotalCount: speakingTotalCount + (weightedDual ? 1 : 0),
    totalSpeakingCount: speakingTotalCount + (weightedDual ? 1 : 0),
    isSpeakingComplete,
    finalSpeakingScoreOutOf100,
    provisionalSpeakingScoreOutOf100,
    speakingPerformanceLabel,
    speakingContributionOutOf30,
    isBookPresentationComplete,
    finalBookPresentationScoreOutOf100,
    provisionalBookPresentationScoreOutOf100,
    bookPresentationPerformanceLabel,
  };
}

/**
 * Strictly calculates weighted score out of 100:
 * - P0 #1: 0 is treated as a valid scored point; null/undefined is treated as unscored.
 * - P0 #2: Partial evaluations do NOT produce a final 100-point grade until all required criteria are scored.
 * - P1 #2: Supports direct integer criterion scores (directCriterionScores) within [0, maxPoints].
 * - Dual Mode (“Tek Değerlendirme, İki Sonuç”): When `isDualBookSpeakingRubric(rubric)` is true,
 *   computes both Kitap Sunumu Notu (İçerik 70 + %30 Konuşma = 100) and Konuşma Sınavı Notu (100) via `dualResult`.
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
  dualResult?: DualEvaluationResult;
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
      weightedSum += clampedDirect;
    } else if (isScoreAssigned(selectedLevelPts)) {
      completedCriteriaCount += 1;
      if (isRequired) completedRequiredCount += 1;
      const normalizedRatio = resolveCriterionLevelRatio(criterion, selectedLevelPts);
      rawPoints +=
        maxLevelPts === 2 && (selectedLevelPts === 50 || selectedLevelPts === 100)
          ? Math.round(normalizedRatio * maxLevelPts * 100) / 100
          : selectedLevelPts;
      // 3 dereceli MEB ölçeklerinde (Evet - Kısmen - Hayır) buçuklu puanlar bir üst tam puana tamamlanır (Math.ceil)
      const earnedCriterionPts =
        maxLevelPts === 2
          ? Math.ceil(normalizedRatio * effectiveWeight)
          : normalizedRatio * effectiveWeight;
      weightedSum += earnedCriterionPts;
    }
  }

  if (isDualBookSpeakingRubric(rubric)) {
    const dualResult = calculateDualBookSpeakingScore(
      rubric,
      criterionScores,
      directCriterionScores
    );

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
        dualResult,
      };
    }

    if (!dualResult.isBookPresentationComplete) {
      return {
        scoreOutOf100: 0,
        finalScoreOutOf100: null,
        provisionalScoreOutOf100:
          dualResult.provisionalBookPresentationScoreOutOf100,
        rawPoints,
        maxRawPoints,
        completedCriteriaCount,
        totalCriteriaCount,
        isComplete: false,
        performanceBand: 'Kismi',
        performanceLabel: dualResult.bookPresentationPerformanceLabel,
        dualResult,
      };
    }

    const scoreOutOf100 =
      dualResult.finalBookPresentationScoreOutOf100 ??
      dualResult.provisionalBookPresentationScoreOutOf100;
    const { performanceBand, performanceLabel } =
      getPerformanceBandAndLabel(scoreOutOf100);

    return {
      scoreOutOf100,
      finalScoreOutOf100: scoreOutOf100,
      provisionalScoreOutOf100:
        dualResult.provisionalBookPresentationScoreOutOf100,
      rawPoints,
      maxRawPoints,
      completedCriteriaCount,
      totalCriteriaCount,
      // Continue prompting for K8–K10 until the speaking result is complete,
      // even when the book result has already become available.
      isComplete: dualResult.isSpeakingComplete,
      performanceBand,
      performanceLabel,
      dualResult,
    };
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
  const rawProvisional = Math.round(weightedSum * normalizer);
  const provisionalScoreOutOf100 = Math.min(100, Math.max(0, rawProvisional));
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

  const scoreOutOf100 = Math.min(100, Math.max(0, provisionalScoreOutOf100));
  const { performanceBand, performanceLabel } =
    getPerformanceBandAndLabel(scoreOutOf100);

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
  prevCalc: ReturnType<typeof getStudentEvaluationBreakdown>['effectiveCalc'];
  newCalc: ReturnType<typeof getStudentEvaluationBreakdown>['effectiveCalc'];
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

  const newCalc = calculateWeightedScore(rubric, nextScores, nextDirect);

  const dualFields: Partial<StudentEvaluation> = newCalc.dualResult
    ? {
        bookPresentationScore:
          newCalc.dualResult.finalBookPresentationScoreOutOf100,
        speakingExamScore: newCalc.dualResult.finalSpeakingScoreOutOf100,
        contentScoreOutOf70: newCalc.dualResult.finalContentScoreOutOf70,
      }
    : {
        bookPresentationScore: undefined,
        speakingExamScore: undefined,
        contentScoreOutOf70: undefined,
      };

  const updatedEvaluation: StudentEvaluation = {
    ...existing,
    studentId,
    criterionScores: nextScores,
    directCriterionScores: nextDirect,
    activeScoreSource: 'individual',
    note: existing?.note || '',
    tags: existing?.tags || [],
    updatedAt: timestampIso,
    ...dualFields,
  };

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

  const groupDualFields: Partial<StudentEvaluation> = {};
  if (rubric && isDualBookSpeakingRubric(rubric)) {
    const grpCalc = calculateWeightedScore(
      rubric,
      group.criterionScores || {},
      group.directCriterionScores
    );
    if (grpCalc.dualResult) {
      groupDualFields.groupBookPresentationScore =
        grpCalc.dualResult.finalBookPresentationScoreOutOf100;
      groupDualFields.groupSpeakingExamScore =
        grpCalc.dualResult.finalSpeakingScoreOutOf100;
      groupDualFields.groupContentScoreOutOf70 =
        grpCalc.dualResult.finalContentScoreOutOf70;
    }
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
      ...existing,
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
      ...groupDualFields,
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
  dualResult?: DualEvaluationResult;
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
      dualResult: calc.dualResult,
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
      dualResult: calc.dualResult,
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
    dualResult: calc.dualResult,
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
  onlyUnscored = false,
  rubric?: Rubric
): Record<string, StudentEvaluation> {
  const updated: Record<string, StudentEvaluation> = { ...currentEvaluations };

  for (const studentId of studentIds) {
    const existing = updated[studentId];
    const currentPoints = existing?.criterionScores?.[criterionId];
    const currentDirect = existing?.directCriterionScores?.[criterionId];
    if (
      onlyUnscored &&
      (isScoreAssigned(currentPoints) || isScoreAssigned(currentDirect))
    ) {
      continue;
    }

    const nextScores = {
      ...(existing?.criterionScores || {}),
      [criterionId]: points,
    };
    const nextDirect = { ...(existing?.directCriterionScores || {}) };
    delete nextDirect[criterionId];

    let scoreFields: Partial<StudentEvaluation> = {};
    if (rubric) {
      const calc = calculateWeightedScore(rubric, nextScores, nextDirect);
      scoreFields = calc.dualResult
        ? {
            bookPresentationScore:
              calc.dualResult.finalBookPresentationScoreOutOf100,
            speakingExamScore: calc.dualResult.finalSpeakingScoreOutOf100,
            contentScoreOutOf70: calc.dualResult.finalContentScoreOutOf70,
          }
        : {
            bookPresentationScore: undefined,
            speakingExamScore: undefined,
            contentScoreOutOf70: undefined,
          };
    }

    updated[studentId] = {
      ...existing,
      studentId,
      criterionScores: nextScores,
      directCriterionScores: nextDirect,
      activeScoreSource: 'individual',
      note: existing?.note || '',
      tags: existing?.tags || [],
      updatedAt: timestampIso,
      evaluatedViaGroup: existing?.evaluatedViaGroup,
      ...scoreFields,
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

function stripTrailingRosterGenderAndStatusTokens(rawName: string): string {
  const words = rawName
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  const isTrailingMetaWord = (w: string): boolean => {
    const cleaned = w.replace(/^[(\[]+|[.):,\-\]]+$/g, '').trim();
    if (!cleaned) return true;
    const norm = cleaned
      .toLocaleUpperCase('tr-TR')
      .replace(/İ/g, 'I')
      .replace(/İ/g, 'I')
      .replace(/Ş/g, 'S')
      .replace(/Ç/g, 'C')
      .replace(/Ğ/g, 'G')
      .replace(/Ö/g, 'O')
      .replace(/Ü/g, 'U');
    return (
      norm === 'K' ||
      norm === 'E' ||
      norm === 'KIZ' ||
      norm === 'ERKEK' ||
      norm === 'KADIN' ||
      norm === 'BAY' ||
      norm === 'BAYAN' ||
      norm === 'YAT' ||
      norm === 'YATILI' ||
      norm === 'YATILILIK' ||
      norm === 'GUND' ||
      norm === 'GUNDUZLU' ||
      norm === 'PARALI' ||
      norm === 'PARASIZ' ||
      norm === 'PANSIYON' ||
      norm === 'PANSIYONLU' ||
      norm === 'BURSLU' ||
      norm === 'ORGUN' ||
      norm === 'KAYITLI' ||
      norm === 'DEVAMLI' ||
      norm === 'DEVAMSIZ' ||
      norm === 'MISAFIR' ||
      norm === 'NAKIL'
    );
  };

  while (words.length > 1 && isTrailingMetaWord(words[words.length - 1])) {
    words.pop();
  }

  return words.join(' ').trim();
}

/**
 * Parses OCR or raw pasted classroom roster lines into structured, validated student records.
 * P0 #5 & P1 #3:
 * - NEVER invents fake sequential student numbers when a number is missing.
 * - Handles optional leading row sequence numbers ("1. 105 Ayşe Melek") without merging "1" and "105".
 * - Strips trailing e-Okul gender ("Kız"/"Erkek") and boarding status ("Yat."/"Günd.") columns from surname.
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
    // 1. Check for Sequence No + School No + Name (e.g. "1. 105 Ayşe Melek Kız Yat." or "1 105 Ayşe Melek")
    const matchSeqAndNum = line.match(
      /^(?:Sıra[:.]?\s*)?\d{1,3}(?:\s*[-–—:.\t|)]+\s*|\s+)(?:No[:.]?\s*)?(\d{1,6})(?:\s*[-–—:.\t|)]+\s*|\s+)([A-Za-zÇĞİÖŞÜçğıöşü].+)$/i
    );
    // 2. Check for School No + Name (e.g. "105 Ayşe Melek")
    const matchWithNum = line.match(
      /^(?:No[:.]?\s*)?(\d{1,6})(?:\s*[-–—:.\t|)]+\s*|\s+)([A-Za-zÇĞİÖŞÜçğıöşü].+)$/i
    );

    let studentNumber = '';
    let rawName = '';

    if (matchSeqAndNum) {
      studentNumber = matchSeqAndNum[1].trim();
      rawName = stripTrailingRosterGenderAndStatusTokens(matchSeqAndNum[2]);
    } else if (matchWithNum) {
      studentNumber = matchWithNum[1].trim();
      rawName = stripTrailingRosterGenderAndStatusTokens(matchWithNum[2]);
    } else {
      rawName = stripTrailingRosterGenderAndStatusTokens(
        line.replace(/^[*•-]\s*/, '')
      );
    }

    const { firstName, lastName, fullName } = splitTurkishFullName(rawName);
    const validationErrors: string[] = [];

    if (!studentNumber) {
      validationErrors.push('Okul numarası eksik');
    } else if (!/^\d+$/.test(studentNumber)) {
      validationErrors.push('Okul numarası yalnızca rakam olmalıdır');
    } else if (
      existingNumbers.has(studentNumber) ||
      seenInBatch.has(studentNumber)
    ) {
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
 * Sınıf ekleme formundaki şube adı girdisini yalnızca büyük harflerden (A, B, C...) oluşacak şekilde temizler.
 * Rakamları, boşlukları ve noktalama işaretlerini kaldırır; klavyeden Caps Lock açmaya gerek kalmadan Türkçe büyük harfe çevirir.
 */
export function normalizeClassroomBranchInput(rawInput: string): string {
  return String(rawInput ?? '')
    .replace(/[^a-zA-ZÇĞİÖŞÜçğıöşü]/g, '')
    .toLocaleUpperCase('tr-TR')
    .slice(0, 10);
}

/**
 * Validates creating or updating a classroom record (prevents empty or duplicate classroom names).
 * Supports single-letter uppercase branch names (e.g., "A", "B") alongside selected gradeLevel.
 */
export function validateClassroomRecord(
  input: {
    name: string;
    gradeLevel?: string;
    subject?: string;
    academicYear?: string;
    branchOnly?: boolean;
  },
  allClassrooms: Classroom[],
  editingClassroomId?: string
): { isValid: boolean; error?: string } {
  const trimmedName = (input.name || '').trim();
  if (trimmedName.length < 1) {
    return {
      isValid: false,
      error: 'Lütfen şube harfini girin (Örn: A, B).',
    };
  }
  if (input.branchOnly && !/^[A-ZÇĞİÖŞÜ]+$/.test(trimmedName)) {
    return {
      isValid: false,
      error: 'Şube adına yalnızca harf (A, B, C gibi) girilmelidir.',
    };
  }
  if (trimmedName.length > 80) {
    return {
      isValid: false,
      error: 'Sınıf / şube adı en fazla 80 karakter olabilir.',
    };
  }
  const normalizedTarget = trimmedName.toLocaleLowerCase('tr-TR');
  const normalizedGrade = (input.gradeLevel || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  const duplicate = allClassrooms.find((c) => {
    if (c.id === editingClassroomId) return false;
    const sameName =
      c.name.trim().toLocaleLowerCase('tr-TR') === normalizedTarget;
    if (!sameName) return false;
    if (!normalizedGrade || !c.gradeLevel) return true;
    return c.gradeLevel.trim().toLocaleLowerCase('tr-TR') === normalizedGrade;
  });
  if (duplicate) {
    return {
      isValid: false,
      error: duplicate.gradeLevel && input.gradeLevel
        ? `${duplicate.gradeLevel} düzeyinde "${duplicate.name}" şubesi zaten kayıtlı.`
        : `"${duplicate.name}" adında bir sınıf zaten kayıtlı.`,
    };
  }
  return { isValid: true };
}


/**
 * Checks whether a classroom has associated students or evaluation sessions before deletion.
 * Blocks deletion if it is the last classroom or if it has any students or sessions.
 */
export function checkClassroomDeletionImpact(
  classroomId: string,
  allClassrooms: Classroom[],
  students: Student[],
  sessions: EvaluationSession[]
): {
  canDelete: boolean;
  studentCount: number;
  sessionCount: number;
  reason?: string;
} {
  const studentCount = students.filter((s) => s.classId === classroomId).length;
  const sessionCount = sessions.filter(
    (s) =>
      s.classId === classroomId ||
      (Array.isArray(s.classIds) && s.classIds.includes(classroomId))
  ).length;

  if (allClassrooms.length <= 1) {
    return {
      canDelete: false,
      studentCount,
      sessionCount,
      reason: 'Sistemde en az bir sınıf tanımlı kalmalıdır.',
    };
  }

  if (studentCount > 0 || sessionCount > 0) {
    return {
      canDelete: false,
      studentCount,
      sessionCount,
      reason: `Bu sınıfa bağlı ${studentCount} öğrenci ve ${sessionCount} değerlendirme oturumu bulunduğu için veri bütünlüğünü korumak amacıyla sınıf silinemez.`,
    };
  }

  return {
    canDelete: true,
    studentCount: 0,
    sessionCount: 0,
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
 * Returns the ordered list of classroom IDs associated with an evaluation session.
 */
export function getSessionClassIds(
  session: Pick<EvaluationSession, 'classId' | 'classIds'> | null | undefined
): string[] {
  if (!session) return [];
  const raw =
    Array.isArray(session.classIds) && session.classIds.length > 0
      ? session.classIds
      : session.classId
      ? [session.classId]
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of raw) {
    const trimmed = String(id || '').trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Resolves the active classroom ID within a single-class or multi-class evaluation session.
 * Guarantees that multi-class evaluations always operate on a specific active classroom (`sınıf bazlı`).
 */
export function resolveActiveSessionClassId(
  session: Pick<EvaluationSession, 'classId' | 'classIds'> | null | undefined,
  requestedClassId?: string
): string {
  const allowedIds = getSessionClassIds(session);
  if (allowedIds.length === 0) return '';
  if (requestedClassId && allowedIds.includes(requestedClassId)) {
    return requestedClassId;
  }
  if (session?.classId && allowedIds.includes(session.classId)) {
    return session.classId;
  }
  return allowedIds[0];
}

/**
 * Returns the non-archived students belonging strictly to the target (or active) classroom of a session,
 * sorted numerically by studentNumber. Prevents mixing students from multiple classes together.
 */
export function getSessionStudentsForClassroom(
  students: Student[],
  session: Pick<EvaluationSession, 'classId' | 'classIds'> | null | undefined,
  targetClassId?: string
): Student[] {
  const activeClassId = resolveActiveSessionClassId(session, targetClassId);
  if (!activeClassId) return [];
  return students
    .filter((s) => !s.archived && s.classId === activeClassId)
    .sort((a, b) =>
      a.studentNumber.localeCompare(b.studentNumber, undefined, {
        numeric: true,
      })
    );
}

/**
 * Groups a session's non-archived students strictly by classroom (in the order of `getSessionClassIds(session)`),
 * with each classroom's students sorted by studentNumber.
 */
export function groupSessionStudentsByClassroom(
  students: Student[],
  classrooms: Classroom[],
  session: Pick<EvaluationSession, 'classId' | 'classIds'> | null | undefined
): Array<{
  classId: string;
  classroom: Classroom | undefined;
  students: Student[];
}> {
  const classIds = getSessionClassIds(session);
  const classroomsById = new Map<string, Classroom>();
  for (const c of classrooms) {
    classroomsById.set(c.id, c);
  }
  return classIds.map((classId) => ({
    classId,
    classroom: classroomsById.get(classId),
    students: getSessionStudentsForClassroom(students, session, classId),
  }));
}

/**
 * Resolves which classroom (`classId`) a `StudentGroup` belongs to:
 * 1. Explicit `group.classId` if present
 * 2. The `classId` of the group's first valid member student in `students`
 * 3. `fallbackClassId` (e.g. `session.classId`)
 */
export function resolveGroupClassId(
  group: StudentGroup,
  studentsOrMap: Student[] | Record<string, Student> | Map<string, Student>,
  fallbackClassId = ''
): string {
  if (group.classId && group.classId.trim()) {
    return group.classId.trim();
  }
  const lookup = (stuId: string): Student | undefined => {
    if (Array.isArray(studentsOrMap)) {
      return studentsOrMap.find((s) => s.id === stuId);
    }
    if (studentsOrMap instanceof Map) {
      return studentsOrMap.get(stuId);
    }
    return studentsOrMap[stuId];
  };
  for (const stuId of group.studentIds || []) {
    const stu = lookup(stuId);
    if (stu?.classId) {
      return stu.classId;
    }
  }
  return fallbackClassId;
}

/**
 * Filters a session's groups strictly to those belonging to `targetClassId`.
 * Also sanitizes any group whose member list accidentally spans multiple classrooms by keeping only members of `targetClassId`.
 */
export function getSessionGroupsForClassroom(
  groups: StudentGroup[],
  students: Student[],
  targetClassId: string,
  fallbackClassId = ''
): StudentGroup[] {
  if (!targetClassId) return groups || [];
  const studentsById = new Map<string, Student>();
  for (const s of students) {
    studentsById.set(s.id, s);
  }

  const matching: StudentGroup[] = [];
  for (const grp of groups || []) {
    const resolvedClassId = resolveGroupClassId(
      grp,
      studentsById,
      fallbackClassId || targetClassId
    );
    if (resolvedClassId === targetClassId) {
      const validClassMemberIds = (grp.studentIds || []).filter((sid) => {
        const stu = studentsById.get(sid);
        return !stu || stu.classId === targetClassId;
      });
      matching.push(
        validClassMemberIds.length === (grp.studentIds || []).length
          ? grp
          : { ...grp, classId: targetClassId, studentIds: validClassMemberIds }
      );
    }
  }
  return matching;
}

/**
 * Creates initial class-scoped default groups (`Grup 1: Çalışma Ekibi`) for each classroom in `classIds`
 * so multi-class sessions start with isolated per-classroom group workspaces.
 */
export function createInitialSessionGroups(classIds: string[]): StudentGroup[] {
  const uniqueIds = Array.from(
    new Set(classIds.map((id) => String(id || '').trim()).filter(Boolean))
  );
  if (uniqueIds.length === 0) {
    return [
      {
        id: createUniqueEntityId('grp'),
        name: 'Grup 1: Çalışma Ekibi',
        studentIds: [],
        criterionScores: {},
        groupNote: '',
      },
    ];
  }
  return uniqueIds.map((classId) => ({
    id: createUniqueEntityId('grp'),
    name: 'Grup 1: Çalışma Ekibi',
    classId,
    studentIds: [],
    criterionScores: {},
    groupNote: '',
  }));
}

/**
 * Replaces only the groups belonging to `targetClassId` within a session's `allGroups` array,
 * preserving all groups belonging to other classrooms in multi-class sessions.
 */
export function replaceClassroomGroupsInSession(
  allGroups: StudentGroup[],
  replacementClassGroups: StudentGroup[],
  students: Student[],
  targetClassId: string,
  fallbackClassId = ''
): StudentGroup[] {
  if (!targetClassId) return replacementClassGroups;
  const studentsById = new Map<string, Student>();
  for (const s of students) {
    studentsById.set(s.id, s);
  }
  const otherClassGroups = (allGroups || []).filter(
    (g) =>
      resolveGroupClassId(g, studentsById, fallbackClassId || targetClassId) !==
      targetClassId
  );
  const taggedReplacement = replacementClassGroups.map((g) => ({
    ...g,
    classId: g.classId || targetClassId,
  }));
  return [...otherClassGroups, ...taggedReplacement];
}

/**
 * Generates balanced random student groups and enforces unique membership (P1 #5) and strict class isolation:
 * - Students from different classrooms (`classId`) are NEVER mixed into the same group.
 * - When `options.classId` is provided, only students and preserved groups of that classroom are included.
 * - When `students` contains multiple classrooms and `options.classId` is omitted, groups are generated separately per classroom.
 */
export function generateBalancedRandomGroups(
  students: Student[],
  options: {
    groupCount?: number;
    targetGroupSize?: number;
    seed?: number;
    existingGroups?: StudentGroup[];
    preserveEvaluatedGroups?: boolean;
    classId?: string;
  }
): StudentGroup[] {
  const activeStudents = students.filter(
    (s) => !s.archived && (!options.classId || s.classId === options.classId)
  );
  if (activeStudents.length === 0) return [];

  const distinctClassIds = Array.from(
    new Set(activeStudents.map((s) => s.classId).filter(Boolean))
  );

  // If multiple classrooms are present in `students` and no single `classId` filter was passed,
  // partition by classroom so students from different classes are NEVER mixed into the same group.
  if (!options.classId && distinctClassIds.length > 1) {
    const allGenerated: StudentGroup[] = [];
    distinctClassIds.forEach((clsId, clsIdx) => {
      const clsStudents = activeStudents.filter((s) => s.classId === clsId);
      const clsExistingGroups = getSessionGroupsForClassroom(
        options.existingGroups || [],
        activeStudents,
        clsId,
        clsId
      );
      const clsGroups = generateBalancedRandomGroups(clsStudents, {
        ...options,
        seed: (options.seed ?? Date.now()) + clsIdx * 7919,
        existingGroups: clsExistingGroups,
        classId: clsId,
      });
      allGenerated.push(...clsGroups);
    });
    return allGenerated;
  }

  const effectiveClassId = options.classId || distinctClassIds[0];

  const shouldPreserve =
    Array.isArray(options.existingGroups) &&
    options.existingGroups.length > 0 &&
    options.preserveEvaluatedGroups !== false;

  const scopedExistingGroups = options.classId
    ? getSessionGroupsForClassroom(
        options.existingGroups || [],
        students,
        options.classId,
        options.classId
      )
    : options.existingGroups || [];

  const preservedGroups: StudentGroup[] = shouldPreserve
    ? scopedExistingGroups
        .filter((g) => hasGroupEvaluationData(g))
        .map((g) => ({
          ...JSON.parse(JSON.stringify(g)),
          ...(options.classId ? { classId: options.classId } : {}),
        }))
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
  const newGroups: StudentGroup[] = buckets.map((studentIds, idx) => ({
    id: `grp-rand-${Date.now()}-${startNum + idx + 1}`,
    name: `Grup ${startNum + idx + 1}`,
    ...(effectiveClassId ? { classId: effectiveClassId } : {}),
    studentIds,
    criterionScores: {},
    groupNote: '',
  }));

  return [...preservedGroups, ...newGroups];
}

/**
 * Safely redistributes session groups while protecting already-evaluated groups from accidental loss
 * and keeping groups strictly separated by classroom (`classId`).
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
    classId?: string;
  }
): {
  groups: StudentGroup[];
  preservedGroupCount: number;
  newGroupCount: number;
  redistributedStudentCount: number;
  blocked: boolean;
  warning?: string;
} {
  const scopedExistingGroups = options.classId
    ? getSessionGroupsForClassroom(
        existingGroups || [],
        students,
        options.classId,
        options.classId
      )
    : existingGroups || [];

  const scopedStudents = options.classId
    ? students.filter((s) => !s.archived && s.classId === options.classId)
    : students;

  const evaluatedExisting = scopedExistingGroups.filter((g) =>
    hasGroupEvaluationData(g)
  );
  const preserve = options.preserveEvaluatedGroups !== false;

  if (!preserve && evaluatedExisting.length > 0 && !options.allowOverwriteEvaluated) {
    return {
      groups: scopedExistingGroups,
      preservedGroupCount: evaluatedExisting.length,
      newGroupCount: 0,
      redistributedStudentCount: 0,
      blocked: true,
      warning: `${evaluatedExisting.length} grupta kayıtlı puan veya gözlem notu bulunduğu için açık onay olmadan mevcut gruplar silinemez.`,
    };
  }

  const nextGroups = generateBalancedRandomGroups(scopedStudents, {
    targetGroupSize: options.targetGroupSize,
    groupCount: options.groupCount,
    seed: options.seed,
    existingGroups: scopedExistingGroups,
    preserveEvaluatedGroups: preserve,
    classId: options.classId,
  });

  const preservedCount = preserve ? evaluatedExisting.length : 0;
  const newGroupCount = Math.max(0, nextGroups.length - preservedCount);
  const lockedIds = new Set(
    preserve ? evaluatedExisting.flatMap((g) => g.studentIds) : []
  );
  const redistributedStudentCount = scopedStudents.filter(
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
          groupBookPresentationScore: undefined,
          groupSpeakingExamScore: undefined,
          groupContentScoreOutOf70: undefined,
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
          groupBookPresentationScore: undefined,
          groupSpeakingExamScore: undefined,
          groupContentScoreOutOf70: undefined,
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

      let groupDualFields: Partial<StudentEvaluation> = {};
      if (rubric && isDualBookSpeakingRubric(rubric)) {
        const grpCalc = calculateWeightedScore(
          rubric,
          assignedGroup.criterionScores || {},
          assignedGroup.directCriterionScores
        );
        if (grpCalc.dualResult) {
          groupDualFields = {
            groupBookPresentationScore:
              grpCalc.dualResult.finalBookPresentationScoreOutOf100,
            groupSpeakingExamScore:
              grpCalc.dualResult.finalSpeakingScoreOutOf100,
            groupContentScoreOutOf70:
              grpCalc.dualResult.finalContentScoreOutOf70,
          };
        }
      }

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
        ...groupDualFields,
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
      let groupDualFields: Partial<StudentEvaluation> = {};
      if (rubric && isDualBookSpeakingRubric(rubric)) {
        const grpCalc = calculateWeightedScore(
          rubric,
          grp.criterionScores || {},
          grp.directCriterionScores
        );
        if (grpCalc.dualResult) {
          groupDualFields = {
            groupBookPresentationScore:
              grpCalc.dualResult.finalBookPresentationScoreOutOf100,
            groupSpeakingExamScore:
              grpCalc.dualResult.finalSpeakingScoreOutOf100,
            groupContentScoreOutOf70:
              grpCalc.dualResult.finalContentScoreOutOf70,
          };
        }
      }

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
        ...groupDualFields,
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
  let groupDualFields: Partial<StudentGroup> = {};
  if (effectiveRubric) {
    const grpCalc = calculateWeightedScore(
      effectiveRubric,
      nextGroupRaw.criterionScores || {},
      nextGroupRaw.directCriterionScores
    );
    groupDualFields = grpCalc.dualResult
      ? {
          groupBookPresentationScore:
            grpCalc.dualResult.finalBookPresentationScoreOutOf100,
          groupSpeakingExamScore: grpCalc.dualResult.finalSpeakingScoreOutOf100,
          groupContentScoreOutOf70: grpCalc.dualResult.finalContentScoreOutOf70,
        }
      : {
          groupBookPresentationScore: undefined,
          groupSpeakingExamScore: undefined,
          groupContentScoreOutOf70: undefined,
        };
  }
  const nextGroupWithScores: StudentGroup = {
    ...nextGroupRaw,
    ...groupDualFields,
  };

  const eligibilityAfter = canApplyGroupScoresToMembers(
    nextGroupWithScores,
    effectiveRubric
  );
  const isCompleteAfter = eligibilityAfter.allowed;

  const shouldTransferNow =
    isCompleteAfter &&
    (autoTransfer || Boolean(targetGroup.lastAppliedAt));

  const finalizedGroup: StudentGroup = shouldTransferNow
    ? { ...nextGroupWithScores, lastAppliedAt: nowIso }
    : !isCompleteAfter
    ? { ...nextGroupWithScores, lastAppliedAt: undefined }
    : nextGroupWithScores;

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
  timestampIso = new Date().toISOString(),
  targetClassId?: string,
  students?: Student[]
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
    if (targetClassId) {
      const grpClassId = resolveGroupClassId(
        grp,
        students || [],
        session.classId
      );
      if (grpClassId !== targetClassId) {
        return grp;
      }
    }
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
    let grpDualFields: Partial<StudentGroup> = {};
    if (effectiveRubric) {
      const grpCalc = calculateWeightedScore(
        effectiveRubric,
        grp.criterionScores || {},
        grp.directCriterionScores
      );
      grpDualFields = grpCalc.dualResult
        ? {
            groupBookPresentationScore:
              grpCalc.dualResult.finalBookPresentationScoreOutOf100,
            groupSpeakingExamScore:
              grpCalc.dualResult.finalSpeakingScoreOutOf100,
            groupContentScoreOutOf70:
              grpCalc.dualResult.finalContentScoreOutOf70,
          }
        : {
            groupBookPresentationScore: undefined,
            groupSpeakingExamScore: undefined,
            groupContentScoreOutOf70: undefined,
          };
    }
    return {
      ...grp,
      ...grpDualFields,
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
 * - Enforces class-based group isolation when `students` is provided: students from a different classroom cannot be added to another classroom's group.
 */
export function toggleGroupMemberAndReconcile(
  session: EvaluationSession,
  groupId: string,
  studentId: string,
  timestampIso = new Date().toISOString(),
  rubric?: Rubric,
  students?: Student[]
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
  let resolvedGroupClassId = targetGroup.classId;

  if (!isRemoving && Array.isArray(students) && students.length > 0) {
    const candidateStudent = students.find((s) => s.id === studentId);
    if (candidateStudent) {
      const existingGroupClassId = resolveGroupClassId(
        targetGroup,
        students,
        ''
      );
      if (
        existingGroupClassId &&
        existingGroupClassId !== candidateStudent.classId
      ) {
        // Prevent mixing students from different classrooms into the same group
        return session;
      }
      resolvedGroupClassId = candidateStudent.classId;
    }
  }

  const nextGroups = (session.groups || []).map((g) => {
    if (g.id !== groupId) return g;
    return {
      ...g,
      ...(resolvedGroupClassId ? { classId: resolvedGroupClassId } : {}),
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
 * In multi-classroom sessions, filters groups strictly to `classId` when provided.
 */
export function getGroupProgressHistory(
  sessions: EvaluationSession[],
  rubricsById: Record<string, Rubric>,
  classId?: string,
  students?: Student[]
): Array<{
  sessionId: string;
  sessionTitle: string;
  date: string;
  groupId: string;
  groupName: string;
  classId?: string;
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
      const classes =
        s.classIds && s.classIds.length > 0 ? s.classIds : [s.classId];
      return classes.includes(classId);
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const results: Array<{
    sessionId: string;
    sessionTitle: string;
    date: string;
    groupId: string;
    groupName: string;
    classId?: string;
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
      const grpClassId = resolveGroupClassId(
        grp,
        students || [],
        ses.classId
      );
      if (classId && grpClassId && grpClassId !== classId) {
        continue;
      }

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
        classId: grpClassId || undefined,
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
    id: createUniqueEntityId('undo'),
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
  return [nextEntry, ...current].slice(0, MAX_UNDO_HISTORY_ENTRIES);
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
  isDualEvaluation?: boolean;
  bookPresentationScoreOutOf100?: number | null;
  speakingExamScoreOutOf100?: number | null;
  contentScoreOutOf70?: number | null;
  speakingContributionOutOf30?: number | null;
  isComplete: boolean;
  performanceLabel: string;
  note: string;
  groupNote?: string;
  criterionBreakdown: Array<{
    criterionTitle: string;
    scorePercent: number;
    selectedPoints: number;
    maxPoints: number;
    section?: RubricCriterionSection | null;
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
    isDualEvaluation?: boolean;
    bookPresentationScoreOutOf100?: number | null;
    speakingExamScoreOutOf100?: number | null;
    contentScoreOutOf70?: number | null;
    speakingContributionOutOf30?: number | null;
    isComplete: boolean;
    performanceLabel: string;
    note: string;
    groupNote?: string;
    criterionBreakdown: Array<{
      criterionTitle: string;
      scorePercent: number;
      selectedPoints: number;
      maxPoints: number;
      section?: RubricCriterionSection | null;
    }>;
  }> = [];

  for (const session of sortedSessions) {
    const evalRecord = session.evaluations[studentId];
    const rubric = getEffectiveSessionRubric(session, rubricsById);
    if (!evalRecord || !rubric) continue;

    const { individualCalc, groupCalc, effectiveCalc, activeSource } =
      getStudentEvaluationBreakdown(rubric, evalRecord);

    // P0 #2: Only include completed evaluations in final longitudinal grade progression
    if (effectiveCalc.finalScoreOutOf100 === null) continue;

    const activeScores =
      activeSource === 'group'
        ? evalRecord.groupCriterionScores || {}
        : evalRecord.criterionScores || {};
    const activeDirect =
      activeSource === 'group'
        ? evalRecord.groupDirectScores || {}
        : evalRecord.directCriterionScores || {};

    const criterionBreakdown = rubric.criteria.flatMap((c: RubricCriterion, idx: number) => {
      const section = getCriterionSection(c, idx, rubric);
      const useBookCriteria = rubric.scoringMode === 'dual_weighted_book_and_speaking' && (rubric.version ?? 0) >= 7;
      const reportCriterion = useBookCriteria ? getWeightedDualReportCriterion(rubric, idx, 'book', activeScores, activeDirect) : null;
      if (useBookCriteria && !reportCriterion) return [];
      const maxPoints = reportCriterion?.maximum ?? c.maxPoints ?? c.weight;
      const earnedPts = reportCriterion ? reportCriterion.earned : getCriterionEarnedPoints(c, activeScores[c.id], activeDirect[c.id]);
      const selectedPoints = earnedPts !== null ? earnedPts : 0;
      const scorePercent = maxPoints > 0 ? Math.round((selectedPoints / maxPoints) * 100) : 0;
      return [{
        criterionTitle: c.title,
        scorePercent,
        selectedPoints,
        maxPoints,
        section,
      }];
    });

    const dual = effectiveCalc.dualResult;

    history.push({
      sessionId: session.id,
      sessionTitle: session.title,
      date: session.date,
      rubricTitle: rubric.title,
      scoreOutOf100: effectiveCalc.finalScoreOutOf100,
      finalScoreOutOf100: effectiveCalc.finalScoreOutOf100,
      individualScoreOutOf100: individualCalc.finalScoreOutOf100,
      groupScoreOutOf100: groupCalc.finalScoreOutOf100,
      isDualEvaluation: Boolean(dual),
      bookPresentationScoreOutOf100: dual
        ? dual.finalBookPresentationScoreOutOf100
        : undefined,
      speakingExamScoreOutOf100: dual
        ? dual.finalSpeakingScoreOutOf100
        : undefined,
      contentScoreOutOf70: dual ? dual.finalContentScoreOutOf70 : undefined,
      speakingContributionOutOf30: dual
        ? dual.speakingContributionOutOf30
        : undefined,
      isComplete: true,
      performanceLabel: effectiveCalc.performanceLabel,
      note: evalRecord.note || '',
      groupNote: evalRecord.groupNote,
      criterionBreakdown,
    });
  }

  return history;
}

export interface ConsecutiveLowScoreReminder {
  shouldRemind: boolean;
  consecutiveCount: number;
  triggerType: 'consecutive_criteria' | 'consecutive_sessions' | null;
  reminderLabel: 'Gözlem notu ekle';
  message: string;
  hasObservationNote: boolean;
}

/**
 * Checks whether a student has received a low score (level 1 or 2, or direct score <= 50% of maxPoints)
 * in 3 consecutive evaluations — either across 3 consecutive criteria in the active evaluation
 * OR across 3 consecutive evaluation sessions — and returns a 'Gözlem notu ekle' reminder state.
 */
export function getStudentConsecutiveLowScoreReminder(
  studentId: string,
  activeSession: EvaluationSession | null | undefined,
  allSessions: EvaluationSession[],
  rubricsById: Record<string, Rubric>
): ConsecutiveLowScoreReminder {
  const defaultResult: ConsecutiveLowScoreReminder = {
    shouldRemind: false,
    consecutiveCount: 0,
    triggerType: null,
    reminderLabel: 'Gözlem notu ekle',
    message: '',
    hasObservationNote: false,
  };

  if (!studentId || !activeSession) {
    return defaultResult;
  }

  const currentEval = activeSession.evaluations?.[studentId];
  const hasObservationNote = Boolean(
    (currentEval?.note && currentEval.note.trim().length > 0) ||
      (currentEval?.groupNote && currentEval.groupNote.trim().length > 0)
  );

  const isLowCriterionScore = (
    criterion: RubricCriterion,
    levelScore: number | null | undefined,
    directScore: number | null | undefined
  ): 'low' | 'high_or_zero' | 'unscored' => {
    if (isScoreAssigned(directScore)) {
      const maxDirect = criterion.maxPoints ?? criterion.weight;
      if (maxDirect > 2 && (directScore === 1 || directScore === 2)) return 'low';
      if (directScore > 0 && maxDirect > 0 && directScore / maxDirect <= 0.5) {
        return 'low';
      }
      return 'high_or_zero';
    }
    if (isScoreAssigned(levelScore)) {
      const maxLevelPts = Math.max(...criterion.levels.map((l) => l.points), 1);
      if (maxLevelPts <= 2) {
        const ratio = resolveCriterionLevelRatio(criterion, levelScore);
        if (ratio > 0 && ratio <= 0.5) {
          return 'low';
        }
        return 'high_or_zero';
      }
      if (levelScore === 1 || levelScore === 2) {
        return 'low';
      }
      return 'high_or_zero';
    }
    return 'unscored';
  };

  // 1. Check 3 consecutive criteria with low scores (1 or 2) in the active session
  const activeRubric = getEffectiveSessionRubric(activeSession, rubricsById);
  let maxCriteriaStreak = 0;
  let currentCriteriaStreak = 0;

  if (activeRubric && currentEval) {
    const breakdown = getStudentEvaluationBreakdown(activeRubric, currentEval);
    const activeScores =
      breakdown.activeSource === 'group'
        ? currentEval.groupCriterionScores || {}
        : currentEval.criterionScores || {};
    const activeDirect =
      breakdown.activeSource === 'group'
        ? currentEval.groupDirectScores || {}
        : currentEval.directCriterionScores || {};

    for (const crit of activeRubric.criteria) {
      const status = isLowCriterionScore(
        crit,
        activeScores[crit.id],
        activeDirect[crit.id]
      );
      if (status === 'low') {
        currentCriteriaStreak += 1;
        if (currentCriteriaStreak > maxCriteriaStreak) {
          maxCriteriaStreak = currentCriteriaStreak;
        }
      } else if (status === 'high_or_zero') {
        currentCriteriaStreak = 0;
      }
    }
  }

  // 2. Check 3 consecutive evaluation sessions where the student received low scores (1 or 2)
  const mergedSessions = [
    ...allSessions.filter((s) => s.id !== activeSession.id),
    activeSession,
  ].sort((a, b) => a.date.localeCompare(b.date));

  let maxSessionStreak = 0;
  let currentSessionStreak = 0;

  for (const ses of mergedSessions) {
    const ev = ses.evaluations?.[studentId];
    const rub = getEffectiveSessionRubric(ses, rubricsById);
    if (!ev || !rub) continue;

    const { effectiveCalc, activeSource } = getStudentEvaluationBreakdown(
      rub,
      ev
    );
    if (effectiveCalc.completedCriteriaCount === 0) continue;

    const activeScores =
      activeSource === 'group'
        ? ev.groupCriterionScores || {}
        : ev.criterionScores || {};
    const activeDirect =
      activeSource === 'group'
        ? ev.groupDirectScores || {}
        : ev.directCriterionScores || {};

    let lowCount = 0;
    let scoredCount = 0;
    let sumLevels = 0;

    for (const crit of rub.criteria) {
      const st = isLowCriterionScore(
        crit,
        activeScores[crit.id],
        activeDirect[crit.id]
      );
      if (st !== 'unscored') {
        scoredCount += 1;
        if (st === 'low') {
          lowCount += 1;
          sumLevels += isScoreAssigned(activeScores[crit.id])
            ? (activeScores[crit.id] as number)
            : 1.5;
        } else {
          const pts = isScoreAssigned(activeScores[crit.id])
            ? (activeScores[crit.id] as number)
            : 3;
          sumLevels += pts;
        }
      }
    }

    const avgLevel = scoredCount > 0 ? sumLevels / scoredCount : 0;
    const isLowSession =
      scoredCount > 0 &&
      (lowCount === scoredCount ||
        (lowCount >= 1 && avgLevel >= 1 && avgLevel <= 2.25) ||
        (effectiveCalc.provisionalScoreOutOf100 > 0 &&
          effectiveCalc.provisionalScoreOutOf100 <= 50));

    if (isLowSession) {
      currentSessionStreak += 1;
      if (currentSessionStreak > maxSessionStreak) {
        maxSessionStreak = currentSessionStreak;
      }
    } else {
      currentSessionStreak = 0;
    }
  }

  if (maxCriteriaStreak >= 3) {
    return {
      shouldRemind: !hasObservationNote,
      consecutiveCount: maxCriteriaStreak,
      triggerType: 'consecutive_criteria',
      reminderLabel: 'Gözlem notu ekle',
      message: `Üst üste ${maxCriteriaStreak} değerlendirmede düşük puan (1 veya 2) verildi`,
      hasObservationNote,
    };
  }

  if (maxSessionStreak >= 3) {
    return {
      shouldRemind: !hasObservationNote,
      consecutiveCount: maxSessionStreak,
      triggerType: 'consecutive_sessions',
      reminderLabel: 'Gözlem notu ekle',
      message: `Üst üste ${maxSessionStreak} değerlendirme oturumunda düşük puan (1 veya 2) alındı`,
      hasObservationNote,
    };
  }

  return defaultResult;
}

/**
 * Neutralizes Spreadsheet / CSV Formula Injection (DDE / Excel / Calc formula execution)
 * by prefixing a single quote `'` when a text value (or its trimmed leading character)
 * starts with `=`, `+`, `-`, `@`, `|`, `\t`, `\r`, or `\n`.
 */
export function sanitizeCsvFormulaInjection(val: string | number): string {
  if (typeof val === 'number') return String(val);
  const str = String(val ?? '');
  if (!str || str === '-') return str;
  const trimmedStart = str.trimStart();
  if (
    /^[=+\-@|\t\r\n]/.test(str) ||
    (trimmedStart.length > 0 &&
      trimmedStart !== '-' &&
      /^[=+\-@|]/.test(trimmedStart))
  ) {
    return `'${str}`;
  }
  return str;
}

/**
 * Generates a UTF-8 BOM CSV string for an evaluation session with:
 * - Strict rubric/session validation (no wrong fallback)
 * - Optional `targetClassId` isolation for multi-class sessions so another class's students never leak into a single-class export
 * - CSV formula injection protection (P2)
 * - Separate Individual vs Group score columns (P0 #4)
 * - Definitive total only when all criteria are completed (P0 #2)
 */
export function generateSessionCsv(
  session: EvaluationSession,
  rubric: Rubric | null | undefined,
  students: Student[],
  targetClassId?: string,
  dualReportMode: 'both' | 'book' | 'speaking' = 'both'
): string {
  const effectiveRubric =
    session.rubricSnapshot && session.rubricSnapshot.id === session.rubricId
      ? session.rubricSnapshot
      : inferLegacyBookRubricSnapshotIfNeeded(session) ?? rubric;

  if (!effectiveRubric || effectiveRubric.id !== session.rubricId) {
    throw new Error(
      'Rapor oluşturulamadı: Oturuma ait geçerli rubrik bulunamadı veya rubrik eşleşmiyor.'
    );
  }

  const allowedClassIds = new Set(
    session.classIds && session.classIds.length > 0 ? session.classIds : [session.classId]
  );

  if (targetClassId && !allowedClassIds.has(targetClassId)) {
    throw new Error(
      'Rapor oluşturulamadı: Seçilen sınıf bu değerlendirme oturumuna dahil değil.'
    );
  }

  const sessionStudents = students.filter((s) => {
    if (s.archived) return false;
    if (targetClassId) {
      return s.classId === targetClassId;
    }
    return allowedClassIds.has(s.classId);
  });

  const escapeCsvCell = (val: string | number): string => {
    const safeStr = sanitizeCsvFormulaInjection(val);
    if (safeStr.includes(',') || safeStr.includes('"') || safeStr.includes('\n')) {
      return `"${safeStr.replace(/"/g, '""')}"`;
    }
    return safeStr;
  };

  const isDual = isDualBookSpeakingRubric(effectiveRubric);
  const includedCriteria =
    isDual && dualReportMode === 'speaking'
      ? effectiveRubric.criteria.filter(
          (c, idx) =>
            getCriterionSection(c, idx, effectiveRubric) === 'speaking' || (effectiveRubric.scoringMode === 'dual_weighted_book_and_speaking' && idx === 0)
        )
      : effectiveRubric.criteria;

  const criterionColumns = isDual
    ? [
        ...(dualReportMode !== 'speaking' ? effectiveRubric.criteria.flatMap((criterion, index) => getWeightedDualReportCriterion(effectiveRubric, index, 'book', {}) ? [{ criterion, index, report: 'book' as const }] : []) : []),
        ...(dualReportMode !== 'book' ? effectiveRubric.criteria.flatMap((criterion, index) => getWeightedDualReportCriterion(effectiveRubric, index, 'speaking', {}) ? [{ criterion, index, report: 'speaking' as const }] : []) : []),
      ]
    : includedCriteria.map((criterion) => ({ criterion, index: effectiveRubric.criteria.indexOf(criterion), report: null }));

  const headers = [
    'Öğrenci No',
    'Ad',
    'Soyad',
    'Ad Soyad',
    ...criterionColumns.map(({ criterion, index, report }) => report
      ? `${report === 'book' ? 'Kitap' : 'Konuşma'} K${index + 1}: ${criterion.title} (${getWeightedDualReportCriterion(effectiveRubric, index, report, {})!.maximum}P)`
      : `${criterion.title} (${criterion.maxPoints ?? criterion.weight}P / %${criterion.weight})`),
    ...(isDual
      ? dualReportMode === 'book'
        ? [
            'Kitap İçeriği Puanı (70)',
            'Sunum Katkısı (30)',
            'Kitap Sunumu Notu (100)',
          ]
        : dualReportMode === 'speaking'
        ? ['Konuşma Sınavı Notu (100)']
        : [
            'Kitap İçeriği Puanı (70)',
            'Sunum Katkısı (30)',
            'Kitap Sunumu Notu (100)',
            'Konuşma Sınavı Notu (100)',
          ]
      : []),
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

    const criterionCells = criterionColumns.map(({ criterion: c, index, report }) => {
      const earned = report
        ? getWeightedDualReportCriterion(effectiveRubric, index, report, activeScores, activeDirect)?.earned
        : getCriterionEarnedPoints(c, activeScores[c.id], activeDirect[c.id]);
      return earned != null ? earned : '-';
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

    const dual = effectiveCalc.dualResult;
    const contentCell =
      dual?.finalContentScoreOutOf70 !== null &&
      dual?.finalContentScoreOutOf70 !== undefined
        ? dual.finalContentScoreOutOf70
        : dual && dual.contentCompletedCount > 0
        ? `Eksik (${dual.contentCompletedCount}/${dual.contentTotalCount})`
        : '-';
    const contribCell =
      dual && dual.speakingCompletedCount > 0
        ? dual.speakingContributionOutOf30
        : '-';
    const bookFinalCell =
      dual?.finalBookPresentationScoreOutOf100 !== null &&
      dual?.finalBookPresentationScoreOutOf100 !== undefined
        ? dual.finalBookPresentationScoreOutOf100
        : dual &&
          dual.contentCompletedCount + dual.speakingCompletedCount > 0
        ? dual.bookPresentationPerformanceLabel
        : '-';
    const speakingFinalCell =
      dual?.finalSpeakingScoreOutOf100 !== null &&
      dual?.finalSpeakingScoreOutOf100 !== undefined
        ? dual.finalSpeakingScoreOutOf100
        : dual && dual.speakingCompletedCount > 0
        ? `Eksik (${dual.speakingCompletedCount}/${dual.speakingTotalCount})`
        : '-';

    const dualCells = isDual
      ? dualReportMode === 'book'
        ? [contentCell, contribCell, bookFinalCell]
        : dualReportMode === 'speaking'
        ? [speakingFinalCell]
        : [contentCell, contribCell, bookFinalCell, speakingFinalCell]
      : [];

    const effectiveLevel =
      isDual && dualReportMode === 'speaking' && dual
        ? dual.speakingPerformanceLabel
        : effectiveCalc.performanceLabel;

    return [
      student.studentNumber,
      firstName,
      lastName,
      student.fullName,
      ...criterionCells,
      ...dualCells,
      indScoreCell,
      grpScoreCell,
      finalScoreCell,
      effectiveLevel,
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

/**
 * Returns true if the student has a non-empty observation note or at least one quick observation tag in the session.
 */
export function hasStudentObservationData(
  evaluation?: StudentEvaluation | null
): boolean {
  if (!evaluation) return false;
  if (typeof evaluation.note === 'string' && evaluation.note.trim().length > 0) {
    return true;
  }
  if (Array.isArray(evaluation.tags) && evaluation.tags.length > 0) {
    return true;
  }
  return false;
}

/**
 * Safely updates a specific student's session-scoped quick observation note and optional tags
 * while preserving all individual/group scores and recording an undo history entry when modified.
 */
export function upsertStudentQuickObservation(
  session: EvaluationSession,
  studentId: string,
  payload: {
    note: string;
    tags?: string[];
    studentName?: string;
    timestampIso?: string;
  }
): EvaluationSession {
  const cleanStudentId = studentId.trim();
  if (!cleanStudentId) return session;

  const existing = session.evaluations[cleanStudentId];
  const sanitizedNote = sanitizeObservationText(payload.note, MAX_NOTE_LENGTH);
  const sanitizedTags = Array.isArray(payload.tags)
    ? Array.from(
        new Set(
          payload.tags
            .map((t) => sanitizeObservationText(String(t), 80).trim())
            .filter((t) => t.length > 0)
        )
      )
    : existing?.tags || [];

  const prevNote = existing?.note || '';
  const prevTags = existing?.tags || [];
  const tagsChanged =
    prevTags.length !== sanitizedTags.length ||
    prevTags.some((t, idx) => t !== sanitizedTags[idx]);
  const noteChanged = prevNote !== sanitizedNote;

  if (!noteChanged && !tagsChanged) {
    return session;
  }

  const nowIso = payload.timestampIso || new Date().toISOString();
  const labelName = payload.studentName?.trim() || cleanStudentId;
  const undoHistory = recordSessionUndoEntry(session, {
    scope: 'student',
    studentId: cleanStudentId,
    description: `${labelName} — hızlı gözlem notu güncellendi`,
    previousEvaluations: session.evaluations,
  });

  return {
    ...session,
    evaluations: {
      ...session.evaluations,
      [cleanStudentId]: {
        ...existing,
        studentId: cleanStudentId,
        criterionScores: existing?.criterionScores || {},
        note: sanitizedNote,
        tags: sanitizedTags,
        updatedAt: nowIso,
      },
    },
    undoHistory,
  };
}

export type CriterionFocusDisplayMode = 'hide_others' | 'dim_others';

/**
 * Resolves a valid criterion index for Focus Mode (Odak Modu).
 * When `preferFirstUnscored` is true (e.g. when switching students/groups or turning on Focus Mode),
 * jumps directly to the first unscored criterion so the teacher can immediately continue grading.
 */
export function resolveFocusedCriterionIndex(
  criteria: RubricCriterion[],
  requestedIndex: number,
  criterionScores?: Record<string, number | null | undefined>,
  directCriterionScores?: Record<string, number | null | undefined>,
  preferFirstUnscored = false
): number {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return 0;
  }

  if (preferFirstUnscored) {
    const firstUnscored = getNextUnscoredCriterion(
      criteria,
      criterionScores || {},
      directCriterionScores
    );
    if (firstUnscored) {
      return firstUnscored.index;
    }
    return 0;
  }

  if (
    typeof requestedIndex !== 'number' ||
    Number.isNaN(requestedIndex) ||
    requestedIndex < 0
  ) {
    return 0;
  }

  if (requestedIndex >= criteria.length) {
    return criteria.length - 1;
  }

  return Math.floor(requestedIndex);
}

/**
 * Computes the next criterion index to focus after scoring a criterion in Focus Mode (Odak Modu).
 * Searches forward from `currentCriterionIndex + 1` for the next unscored criterion, then wraps around
 * from `0` to `currentCriterionIndex - 1`. If all criteria are now scored, keeps the index bounded
 * and reports `allCompleted: true`.
 */
export function getNextFocusedCriterionIndexAfterScore(
  criteria: RubricCriterion[],
  currentCriterionIndex: number,
  updatedCriterionScores: Record<string, number | null | undefined>,
  updatedDirectScores?: Record<string, number | null | undefined>
): {
  nextIndex: number;
  allCompleted: boolean;
  advancedToUnscored: boolean;
} {
  const total = Array.isArray(criteria) ? criteria.length : 0;
  if (total === 0) {
    return { nextIndex: 0, allCompleted: true, advancedToUnscored: false };
  }

  const safeCurrent = resolveFocusedCriterionIndex(criteria, currentCriterionIndex);

  const isCritScored = (crit: RubricCriterion): boolean =>
    isScoreAssigned(updatedDirectScores?.[crit.id]) ||
    isScoreAssigned(updatedCriterionScores?.[crit.id]);

  // 1. Look forward after safeCurrent for an unscored criterion
  for (let i = safeCurrent + 1; i < total; i++) {
    if (!isCritScored(criteria[i])) {
      return {
        nextIndex: i,
        allCompleted: false,
        advancedToUnscored: true,
      };
    }
  }

  // 2. Wrap around from 0 to safeCurrent - 1 for any earlier unscored criterion
  for (let i = 0; i < safeCurrent; i++) {
    if (!isCritScored(criteria[i])) {
      return {
        nextIndex: i,
        allCompleted: false,
        advancedToUnscored: true,
      };
    }
  }

  // 3. Check if current itself is unscored (e.g. score was cleared)
  if (!isCritScored(criteria[safeCurrent])) {
    return {
      nextIndex: safeCurrent,
      allCompleted: false,
      advancedToUnscored: false,
    };
  }

  return {
    nextIndex: safeCurrent,
    allCompleted: true,
    advancedToUnscored: false,
  };
}

export interface FocusModeCriterionStep {
  id: string;
  index: number;
  numberLabel: string;
  title: string;
  weight: number;
  maxPoints: number;
  isActive: boolean;
  isScored: boolean;
  scoreLabel: string | null;
}

/**
 * Builds the step-by-step progress and navigation state for Single-Criterion Focus Mode (Odak Modu).
 */
export function getFocusModeStepSummary(
  criteria: RubricCriterion[],
  activeIndex: number,
  criterionScores?: Record<string, number | null | undefined>,
  directCriterionScores?: Record<string, number | null | undefined>
): {
  activeIndex: number;
  activeCriterion: RubricCriterion | null;
  totalCount: number;
  completedCount: number;
  remainingCount: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  steps: FocusModeCriterionStep[];
} {
  const totalCount = Array.isArray(criteria) ? criteria.length : 0;
  if (totalCount === 0) {
    return {
      activeIndex: 0,
      activeCriterion: null,
      totalCount: 0,
      completedCount: 0,
      remainingCount: 0,
      canGoPrev: false,
      canGoNext: false,
      steps: [],
    };
  }

  const safeIndex = resolveFocusedCriterionIndex(criteria, activeIndex);
  let completedCount = 0;

  const steps: FocusModeCriterionStep[] = criteria.map((crit, idx) => {
    const maxPts = crit.maxPoints ?? crit.weight;
    const directVal = directCriterionScores?.[crit.id];
    const levelVal = criterionScores?.[crit.id];
    const hasDirect = isScoreAssigned(directVal);
    const hasLevel = isScoreAssigned(levelVal);
    const isScored = hasDirect || hasLevel;

    if (isScored) {
      completedCount += 1;
    }

    let scoreLabel: string | null = null;
    if (hasDirect) {
      scoreLabel = `${directVal}/${maxPts}`;
    } else if (hasLevel) {
      scoreLabel = `${levelVal}P`;
    }

    return {
      id: crit.id,
      index: idx,
      numberLabel: idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`,
      title: crit.title,
      weight: crit.weight,
      maxPoints: maxPts,
      isActive: idx === safeIndex,
      isScored,
      scoreLabel,
    };
  });

  return {
    activeIndex: safeIndex,
    activeCriterion: criteria[safeIndex] || null,
    totalCount,
    completedCount,
    remainingCount: Math.max(0, totalCount - completedCount),
    canGoPrev: safeIndex > 0,
    canGoNext: safeIndex < totalCount - 1,
    steps,
  };
}

/**
 * Toggles or sets the archived status of an evaluation session.
 * Preserves all evaluations, notes, criteria scores, snapshots, and groups.
 */
export function archiveEvaluationSession(
  session: EvaluationSession,
  archived: boolean = true
): EvaluationSession {
  return {
    ...session,
    archived,
    archivedAt: archived ? new Date().toISOString() : undefined,
  };
}

/**
 * Removes an evaluation session by its id from the sessions list.
 */
export function deleteEvaluationSession(
  sessions: EvaluationSession[],
  sessionId: string
): EvaluationSession[] {
  return sessions.filter((s) => s.id !== sessionId);
}

/**
 * Partitions evaluation sessions into active and archived lists.
 */
export function partitionSessionsByArchiveStatus(
  sessions: EvaluationSession[]
): {
  activeSessions: EvaluationSession[];
  archivedSessions: EvaluationSession[];
} {
  const activeSessions: EvaluationSession[] = [];
  const archivedSessions: EvaluationSession[] = [];

  for (const s of sessions) {
    if (s.archived) {
      archivedSessions.push(s);
    } else {
      activeSessions.push(s);
    }
  }

  return { activeSessions, archivedSessions };
}


