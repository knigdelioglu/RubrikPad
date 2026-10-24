import type { Classroom, EvaluationSession, Rubric } from '../types.ts';
import {
  getEffectiveSessionRubric,
  getStudentEvaluationBreakdown,
  getStudentProgressHistory,
} from './rubricLogic.ts';

export const ALL_ACADEMIC_TERMS = 'ALL';

export const DEFAULT_ACADEMIC_TERM_OPTIONS: readonly string[] = [
  '2024-2025 Güz',
  '2024-2025 Bahar',
  '2025-2026 Güz',
  '2025-2026 Bahar',
  '2026-2027 Güz',
  '2026-2027 Bahar',
];

export interface AcademicTermOption {
  value: string;
  label: string;
  academicYear: string;
  semester: 'Güz' | 'Bahar' | 'Tümü';
  sessionCount: number;
}

export interface TermMetricSnapshot {
  term: string;
  sessionCount: number;
  evaluatedRecordCount: number;
  averageScore: number | null;
}

export interface TermComparisonSummary {
  selectedTerm: string;
  selectedTermLabel: string;
  currentSnapshot: TermMetricSnapshot;
  comparisonSnapshot: TermMetricSnapshot | null;
  scoreDelta: number | null;
  termBreakdown: TermMetricSnapshot[];
}

/**
 * Bir ISO tarih dizgesinden (`YYYY-MM-DD`) eğitim dönemini (`YYYY-YYYY Güz` veya `YYYY-YYYY Bahar`) hesaplar.
 * - Eylül (09) – Ocak (01): Güz Dönemi
 * - Şubat (02) – Ağustos (08): Bahar Dönemi
 */
export function deriveAcademicTermFromDate(
  dateStr: string | undefined | null,
  fallbackAcademicYear = '2024-2025'
): string {
  const cleaned = String(dateStr ?? '').trim();
  const match = cleaned.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) {
    const yearMatch = String(fallbackAcademicYear).match(/(\d{4}-\d{4})/);
    const baseYear = yearMatch ? yearMatch[1] : '2024-2025';
    return `${baseYear} Güz`;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month >= 9 && month <= 12) {
    return `${year}-${year + 1} Güz`;
  }
  if (month === 1) {
    return `${year - 1}-${year} Güz`;
  }
  return `${year - 1}-${year} Bahar`;
}

/**
 * Bir değerlendirme oturumunun ait olduğu eğitim dönemini belirler.
 */
export function resolveSessionAcademicTerm(
  session: EvaluationSession,
  classroom?: Classroom | null
): string {
  return deriveAcademicTermFromDate(
    session.date,
    classroom?.academicYear || '2024-2025'
  );
}

/**
 * Seçilen eğitim dönemine göre oturumları filtreler.
 * `ALL` seçildiğinde tüm oturumları döndürür.
 */
export function filterSessionsByAcademicTerm(
  sessions: EvaluationSession[],
  selectedTerm: string,
  classroom?: Classroom | null
): EvaluationSession[] {
  if (!selectedTerm || selectedTerm === ALL_ACADEMIC_TERMS) {
    return sessions;
  }
  const normalizedTarget = selectedTerm.trim();
  return sessions.filter(
    (s) => resolveSessionAcademicTerm(s, classroom) === normalizedTarget
  );
}

/**
 * Seçili dönemde karşılaştırma yapılacak komşu/önceki dönemi döndürür.
 * Örn: '2024-2025 Bahar' -> '2024-2025 Güz', '2024-2025 Güz' -> '2024-2025 Bahar'
 */
export function getComparisonAcademicTerm(selectedTerm: string): string | null {
  const match = String(selectedTerm ?? '')
    .trim()
    .match(/^(\d{4})-(\d{4})\s+(Güz|Bahar)$/i);
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  const semester = match[3].toLowerCase() === 'bahar' ? 'Bahar' : 'Güz';

  if (semester === 'Bahar') {
    return `${startYear}-${endYear} Güz`;
  }
  return `${startYear}-${endYear} Bahar`;
}

/**
 * Açılır menüde gösterilecek eğitim dönemi seçeneklerini oturum sayılarıyla birlikte üretir.
 * '2024-2025 Güz' ve '2024-2025 Bahar' başta olmak üzere standart dönemleri her zaman içerir.
 */
export function getAcademicTermOptions(
  sessions: EvaluationSession[],
  classroom?: Classroom | null
): AcademicTermOption[] {
  const countsByTerm = new Map<string, number>();

  for (const term of DEFAULT_ACADEMIC_TERM_OPTIONS) {
    countsByTerm.set(term, 0);
  }

  if (classroom?.academicYear) {
    const yearMatch = classroom.academicYear.match(/^(\d{4}-\d{4})$/);
    if (yearMatch) {
      const y = yearMatch[1];
      if (!countsByTerm.has(`${y} Güz`)) countsByTerm.set(`${y} Güz`, 0);
      if (!countsByTerm.has(`${y} Bahar`)) countsByTerm.set(`${y} Bahar`, 0);
    }
  }

  for (const session of sessions) {
    const term = resolveSessionAcademicTerm(session, classroom);
    countsByTerm.set(term, (countsByTerm.get(term) ?? 0) + 1);
  }

  const termEntries: AcademicTermOption[] = Array.from(
    countsByTerm.entries()
  ).map(([term, sessionCount]) => {
    const parts = term.split(' ');
    const academicYear = parts[0] || '2024-2025';
    const semester: 'Güz' | 'Bahar' =
      parts[1] === 'Bahar' ? 'Bahar' : 'Güz';
    return {
      value: term,
      label:
        sessionCount > 0 ? `${term} (${sessionCount} Oturum)` : term,
      academicYear,
      semester,
      sessionCount,
    };
  });

  return [
    {
      value: ALL_ACADEMIC_TERMS,
      label:
        sessions.length > 0
          ? `Tüm Eğitim Dönemleri (${sessions.length} Oturum)`
          : 'Tüm Eğitim Dönemleri (Karşılaştırmalı)',
      academicYear: 'Tümü',
      semester: 'Tümü',
      sessionCount: sessions.length,
    },
    ...termEntries,
  ];
}

function computeSnapshotForSessions(
  term: string,
  termSessions: EvaluationSession[],
  rubricsById: Record<string, Rubric>,
  studentId?: string
): TermMetricSnapshot {
  if (studentId) {
    const history = getStudentProgressHistory(
      studentId,
      termSessions,
      rubricsById
    );
    if (history.length === 0) {
      return {
        term,
        sessionCount: termSessions.length,
        evaluatedRecordCount: 0,
        averageScore: null,
      };
    }
    const sum = history.reduce((acc, h) => acc + h.scoreOutOf100, 0);
    return {
      term,
      sessionCount: termSessions.length,
      evaluatedRecordCount: history.length,
      averageScore: Math.round(sum / history.length),
    };
  }

  const scores: number[] = [];
  for (const sess of termSessions) {
    const rubric = getEffectiveSessionRubric(sess, rubricsById);
    if (!rubric) continue;
    for (const ev of Object.values(sess.evaluations || {})) {
      const { effectiveCalc } = getStudentEvaluationBreakdown(rubric, ev);
      if (
        effectiveCalc.isComplete &&
        effectiveCalc.finalScoreOutOf100 !== null
      ) {
        scores.push(effectiveCalc.finalScoreOutOf100);
      }
    }
  }

  return {
    term,
    sessionCount: termSessions.length,
    evaluatedRecordCount: scores.length,
    averageScore:
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
  };
}

/**
 * Dönemsel karşılaştırmalı gelişim analizi (Güz vs Bahar veya seçili dönem vs karşılaştırma dönemi) üretir.
 */
export function computeTermComparisonAnalytics(
  allClassSessions: EvaluationSession[],
  rubricsById: Record<string, Rubric>,
  selectedTerm: string,
  classroom?: Classroom | null,
  studentId?: string
): TermComparisonSummary {
  const allTermsList = Array.from(
    new Set([
      ...DEFAULT_ACADEMIC_TERM_OPTIONS,
      ...allClassSessions.map((s) => resolveSessionAcademicTerm(s, classroom)),
    ])
  );

  const termBreakdown: TermMetricSnapshot[] = allTermsList.map((term) => {
    const matched = filterSessionsByAcademicTerm(
      allClassSessions,
      term,
      classroom
    );
    return computeSnapshotForSessions(term, matched, rubricsById, studentId);
  });

  if (!selectedTerm || selectedTerm === ALL_ACADEMIC_TERMS) {
    const allSnapshot = computeSnapshotForSessions(
      ALL_ACADEMIC_TERMS,
      allClassSessions,
      rubricsById,
      studentId
    );
    const activeSnapshots = termBreakdown.filter(
      (t) => t.averageScore !== null
    );
    const firstWithScore =
      activeSnapshots.length >= 2 ? activeSnapshots[0] : null;
    const latestWithScore =
      activeSnapshots.length >= 2
        ? activeSnapshots[activeSnapshots.length - 1]
        : null;
    const delta =
      firstWithScore &&
      latestWithScore &&
      firstWithScore.averageScore !== null &&
      latestWithScore.averageScore !== null
        ? latestWithScore.averageScore - firstWithScore.averageScore
        : null;

    return {
      selectedTerm: ALL_ACADEMIC_TERMS,
      selectedTermLabel: 'Tüm Eğitim Dönemleri',
      currentSnapshot: allSnapshot,
      comparisonSnapshot: firstWithScore,
      scoreDelta: delta,
      termBreakdown,
    };
  }

  const currentSessions = filterSessionsByAcademicTerm(
    allClassSessions,
    selectedTerm,
    classroom
  );
  const currentSnapshot = computeSnapshotForSessions(
    selectedTerm,
    currentSessions,
    rubricsById,
    studentId
  );

  const compTerm = getComparisonAcademicTerm(selectedTerm);
  const comparisonSnapshot = compTerm
    ? computeSnapshotForSessions(
        compTerm,
        filterSessionsByAcademicTerm(allClassSessions, compTerm, classroom),
        rubricsById,
        studentId
      )
    : null;

  const scoreDelta =
    currentSnapshot.averageScore !== null &&
    comparisonSnapshot &&
    comparisonSnapshot.averageScore !== null
      ? currentSnapshot.averageScore - comparisonSnapshot.averageScore
      : null;

  return {
    selectedTerm,
    selectedTermLabel: selectedTerm,
    currentSnapshot,
    comparisonSnapshot,
    scoreDelta,
    termBreakdown,
  };
}
