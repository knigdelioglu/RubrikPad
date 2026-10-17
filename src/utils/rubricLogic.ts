import type {
  Rubric,
  RubricCriterion,
  Student,
  StudentEvaluation,
  EvaluationSession,
  StudentGroup,
} from '../types.ts';

/**
 * Calculates a student's weighted score out of 100 based on their rubric criterion selections.
 */
export function calculateWeightedScore(
  rubric: Rubric,
  criterionScores: Record<string, number>
): {
  scoreOutOf100: number;
  rawPoints: number;
  maxRawPoints: number;
  completedCriteriaCount: number;
  totalCriteriaCount: number;
  isComplete: boolean;
  performanceBand: 'Ornek' | 'Yetkin' | 'Gelismekte' | 'DestekGerekli' | 'Baslanmadi';
  performanceLabel: string;
} {
  const totalCriteriaCount = rubric.criteria.length;
  if (totalCriteriaCount === 0) {
    return {
      scoreOutOf100: 0,
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

  for (const criterion of rubric.criteria) {
    const maxPts = Math.max(...criterion.levels.map((l) => l.points), 1);
    maxRawPoints += maxPts;
    const effectiveWeight =
      typeof criterion.maxPoints === 'number' && criterion.maxPoints > 0
        ? criterion.maxPoints
        : criterion.weight;
    totalWeight += effectiveWeight;

    const selectedPoints = criterionScores[criterion.id];
    if (typeof selectedPoints === 'number' && selectedPoints > 0) {
      completedCriteriaCount += 1;
      rawPoints += selectedPoints;
      const normalizedRatio = selectedPoints / maxPts;
      weightedSum += normalizedRatio * effectiveWeight;
    }
  }

  if (completedCriteriaCount === 0) {
    return {
      scoreOutOf100: 0,
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
  const scoreOutOf100 = Math.round(weightedSum * normalizer);
  const isComplete = completedCriteriaCount === totalCriteriaCount;

  let performanceBand: 'Ornek' | 'Yetkin' | 'Gelismekte' | 'DestekGerekli' = 'DestekGerekli';
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
    rawPoints,
    maxRawPoints,
    completedCriteriaCount,
    totalCriteriaCount,
    isComplete,
    performanceBand,
    performanceLabel,
  };
}

/**
 * Propagates a group's criterion scores and observation note to all member students in the session.
 */
export function applyGroupScoresToMembers(
  currentEvaluations: Record<string, StudentEvaluation>,
  group: StudentGroup,
  timestampIso: string
): Record<string, StudentEvaluation> {
  const updated: Record<string, StudentEvaluation> = { ...currentEvaluations };

  for (const studentId of group.studentIds) {
    const existing = updated[studentId];
    const mergedScores = {
      ...(existing?.criterionScores || {}),
      ...group.criterionScores,
    };

    const existingNote = existing?.note ? existing.note.trim() : '';
    const groupNoteClean = group.groupNote ? group.groupNote.trim() : '';
    let combinedNote = existingNote;

    if (groupNoteClean) {
      const groupPrefix = `[${group.name}]: ${groupNoteClean}`;
      if (!existingNote.includes(groupNoteClean)) {
        combinedNote = existingNote ? `${existingNote}\n${groupPrefix}` : groupPrefix;
      }
    }

    const existingTags = existing?.tags || [];
    const nextTags = existingTags.includes('Grup Çalışması')
      ? existingTags
      : [...existingTags, 'Grup Çalışması'];

    updated[studentId] = {
      studentId,
      criterionScores: mergedScores,
      note: combinedNote,
      tags: nextTags,
      updatedAt: timestampIso,
      evaluatedViaGroup: group.name,
    };
  }

  return updated;
}

/**
 * Applies a specific criterion score to a list of students in bulk (used in Hızlı Değerlendirme Grid).
 * If onlyUnscored is true, only assigns the score to students who do not yet have a score for that criterion.
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
    if (onlyUnscored && typeof currentPoints === 'number' && currentPoints > 0) {
      continue;
    }

    updated[studentId] = {
      studentId,
      criterionScores: {
        ...(existing?.criterionScores || {}),
        [criterionId]: points,
      },
      note: existing?.note || '',
      tags: existing?.tags || [],
      updatedAt: timestampIso,
      evaluatedViaGroup: existing?.evaluatedViaGroup,
    };
  }

  return updated;
}

/**
 * Finds the next unscored criterion for a student, or null if all are completed.
 */
export function getNextUnscoredCriterion(
  criteria: RubricCriterion[],
  criterionScores: Record<string, number>
): { criterion: RubricCriterion; index: number } | null {
  for (let i = 0; i < criteria.length; i++) {
    const crit = criteria[i];
    if (typeof criterionScores[crit.id] !== 'number') {
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

  // Search forward starting after current student
  for (let i = currentIdx + 1; i < students.length; i++) {
    const s = students[i];
    const ev = evaluations[s.id];
    const calc = calculateWeightedScore(rubric, ev?.criterionScores || {});
    if (!calc.isComplete) {
      return s;
    }
  }

  // Wrap around and search from beginning up to current student
  for (let i = 0; i <= currentIdx && i < students.length; i++) {
    const s = students[i];
    if (s.id === currentStudentId) continue;
    const ev = evaluations[s.id];
    const calc = calculateWeightedScore(rubric, ev?.criterionScores || {});
    if (!calc.isComplete) {
      return s;
    }
  }

  return null;
}

/**
 * Parses OCR or raw pasted classroom roster lines into structured student records.
 * Supports formats like:
 * "104 - Elif Yılmaz"
 * "105\tKerem Demir"
 * "106. Zeynep Kaya"
 * "Mert Çelik" (auto-assigns sequential student number)
 */
export function parseStudentRosterText(
  rawText: string,
  startingNumber = 201
): Array<{ studentNumber: string; fullName: string }> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const results: Array<{ studentNumber: string; fullName: string }> = [];
  let autoNum = startingNumber;

  for (const line of lines) {
    // Match optional leading "No:" + student number + separator (or space) + full name
    const matchWithNum = line.match(
      /^(?:No[:.]?\s*)?(\d{1,6})(?:\s*[-–—:.\t|)]+\s*|\s+)([A-Za-zÇĞİÖŞÜçğıöşü].+)$/i
    );

    if (matchWithNum) {
      const studentNumber = matchWithNum[1].trim();
      const fullName = matchWithNum[2].replace(/\s+/g, ' ').trim();
      if (fullName.length >= 2) {
        results.push({ studentNumber, fullName });
        const parsedInt = parseInt(studentNumber, 10);
        if (!Number.isNaN(parsedInt) && parsedInt >= autoNum) {
          autoNum = parsedInt + 1;
        }
      }
    } else {
      // Clean any leading bullet or single-digit list index if followed by text
      const cleanedName = line.replace(/^[*•-]\s*/, '').replace(/\s+/g, ' ').trim();
      if (cleanedName.length >= 3) {
        results.push({
          studentNumber: String(autoNum++),
          fullName: cleanedName,
        });
      }
    }
  }

  return results;
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
  performanceLabel: string;
  note: string;
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
    performanceLabel: string;
    note: string;
    criterionBreakdown: Array<{
      criterionTitle: string;
      scorePercent: number;
      selectedPoints: number;
      maxPoints: number;
    }>;
  }> = [];

  for (const session of sortedSessions) {
    const evalRecord = session.evaluations[studentId];
    const rubric = rubricsById[session.rubricId];
    if (!evalRecord || !rubric) continue;

    const calc = calculateWeightedScore(rubric, evalRecord.criterionScores);
    if (calc.completedCriteriaCount === 0) continue;

    const criterionBreakdown = rubric.criteria.map((c: RubricCriterion) => {
      const maxPoints = Math.max(...c.levels.map((l) => l.points), 1);
      const selectedPoints = evalRecord.criterionScores[c.id] || 0;
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
      scoreOutOf100: calc.scoreOutOf100,
      performanceLabel: calc.performanceLabel,
      note: evalRecord.note || '',
      criterionBreakdown,
    });
  }

  return history;
}

/**
 * Generates a UTF-8 BOM CSV string for an evaluation session so Excel & Google Sheets open Turkish characters properly.
 */
export function generateSessionCsv(
  session: EvaluationSession,
  rubric: Rubric,
  students: Student[]
): string {
  const escapeCsvCell = (val: string | number): string => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'Öğrenci No',
    'Ad Soyad',
    ...rubric.criteria.map(
      (c) => `${c.title} (${c.maxPoints ?? c.weight}P / %${c.weight})`
    ),
    'Toplam Puan (100)',
    'Düzey',
    'Değerlendirme Yöntemi',
    'Gözlem Notu',
    'Etiketler',
  ];

  const rows = students.map((student) => {
    const evaluation = session.evaluations[student.id];
    const scores = evaluation?.criterionScores || {};
    const calc = calculateWeightedScore(rubric, scores);

    const criterionCells = rubric.criteria.map((c) => {
      const pts = scores[c.id];
      return typeof pts === 'number' ? pts : '-';
    });

    const method = evaluation?.evaluatedViaGroup
      ? `Grup (${evaluation.evaluatedViaGroup})`
      : calc.completedCriteriaCount > 0
      ? 'Bireysel'
      : 'Değerlendirilmedi';

    return [
      student.studentNumber,
      student.fullName,
      ...criterionCells,
      calc.completedCriteriaCount > 0 ? calc.scoreOutOf100 : '-',
      calc.performanceLabel,
      method,
      (evaluation?.note || '').replace(/\r?\n/g, ' | '),
      (evaluation?.tags || []).join('; '),
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
}
