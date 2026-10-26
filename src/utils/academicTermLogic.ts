import type { Classroom, EvaluationSession, Rubric, Student } from '../types.ts';
import {
  getEffectiveSessionRubric,
  getStudentEvaluationBreakdown,
  getStudentProgressHistory,
} from './rubricLogic.ts';

export const ALL_ACADEMIC_TERMS = 'ALL';

export const MANAGED_ACADEMIC_TERMS_STORAGE_KEY =
  'rubrikpad_managed_academic_terms_v2';

export const DEFAULT_ACADEMIC_TERM_OPTIONS: readonly string[] = [
  '2026-2027 Güz',
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

export type StudentTrendDirection =
  | 'up'
  | 'down'
  | 'stable'
  | 'insufficient_data';

export interface StudentTermPercentageRow {
  studentId: string;
  studentNumber: string;
  fullName: string;
  previousTerm: string;
  currentTerm: string;
  previousSessionCount: number;
  currentSessionCount: number;
  previousAverage: number | null;
  currentAverage: number | null;
  pointDelta: number | null;
  percentageChange: number | null;
  trend: StudentTrendDirection;
}

export interface StudentTermPercentageComparison {
  currentTerm: string;
  previousTerm: string;
  rows: StudentTermPercentageRow[];
  classPreviousAverage: number | null;
  classCurrentAverage: number | null;
  classPointDelta: number | null;
  classPercentageChange: number | null;
  classTrend: StudentTrendDirection;
}

export function compareAcademicTerms(a: string, b: string): number {
  const yearDifference = Number(a.slice(0, 4)) - Number(b.slice(0, 4));
  if (yearDifference !== 0) return yearDifference;
  return Number(a.endsWith('Bahar')) - Number(b.endsWith('Bahar'));
}

/**
 * Kullanıcının girdiği akademik yıl (`2024-2025` veya `2024`) ve dönem (`Güz` | `Bahar`)
 * ya da tam dönem dizgesini (`2024-2025 Güz`) doğrular ve standart biçime dönüştürür.
 */
export function parseAndValidateAcademicTermInput(
  yearOrFullInput: string,
  semesterInput?: 'Güz' | 'Bahar'
): { isValid: boolean; term?: string; error?: string } {
  const raw = String(yearOrFullInput ?? '').trim();
  if (!raw) {
    return {
      isValid: false,
      error: 'Lütfen akademik yıl girin (Örn: 2024-2025).',
    };
  }

  // Tam dönem formatı: "2024-2025 Güz" veya "2024-2025 Bahar"
  const fullMatch = raw.match(/^(\d{4})\s*-\s*(\d{4})\s+(Güz|Guz|Bahar)$/i);
  if (fullMatch) {
    const startYear = Number(fullMatch[1]);
    const endYear = Number(fullMatch[2]);
    const semRaw = fullMatch[3].toLowerCase();
    const semester: 'Güz' | 'Bahar' = semRaw === 'bahar' ? 'Bahar' : 'Güz';
    if (startYear < 2000 || startYear > 2100) {
      return {
        isValid: false,
        error: 'Akademik başlangıç yılı 2000 ile 2100 arasında olmalıdır.',
      };
    }
    if (endYear !== startYear + 1) {
      return {
        isValid: false,
        error: `Akademik yıl ardışık olmalıdır (Örn: ${startYear}-${startYear + 1}).`,
      };
    }
    return {
      isValid: true,
      term: `${startYear}-${endYear} ${semester}`,
    };
  }

  const normalizedSemester: 'Güz' | 'Bahar' =
    semesterInput === 'Bahar' ? 'Bahar' : 'Güz';

  // Yıl aralığı formatı: "2024-2025"
  const rangeMatch = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (rangeMatch) {
    const startYear = Number(rangeMatch[1]);
    const endYear = Number(rangeMatch[2]);
    if (startYear < 2000 || startYear > 2100) {
      return {
        isValid: false,
        error: 'Akademik başlangıç yılı 2000 ile 2100 arasında olmalıdır.',
      };
    }
    if (endYear !== startYear + 1) {
      return {
        isValid: false,
        error: `Akademik yıl ardışık olmalıdır (Örn: ${startYear}-${startYear + 1}).`,
      };
    }
    return {
      isValid: true,
      term: `${startYear}-${endYear} ${normalizedSemester}`,
    };
  }

  // Tek yıl formatı: "2024" -> "2024-2025"
  const singleYearMatch = raw.match(/^(\d{4})$/);
  if (singleYearMatch) {
    const startYear = Number(singleYearMatch[1]);
    if (startYear < 2000 || startYear > 2100) {
      return {
        isValid: false,
        error: 'Akademik başlangıç yılı 2000 ile 2100 arasında olmalıdır.',
      };
    }
    return {
      isValid: true,
      term: `${startYear}-${startYear + 1} ${normalizedSemester}`,
    };
  }

  return {
    isValid: false,
    error:
      'Geçersiz akademik yıl formatı. Lütfen "2024-2025" biçiminde girin.',
  };
}

/**
 * Eğitim dönemi listesine yeni bir dönem ekler ve kronolojik sırayla döndürür.
 */
export function addAcademicTerm(
  existingTerms: readonly string[],
  yearOrFullInput: string,
  semesterInput?: 'Güz' | 'Bahar'
): { terms: string[]; addedTerm?: string; error?: string } {
  const validated = parseAndValidateAcademicTermInput(
    yearOrFullInput,
    semesterInput
  );
  if (!validated.isValid || !validated.term) {
    return {
      terms: [...existingTerms],
      error: validated.error || 'Geçersiz eğitim dönemi.',
    };
  }

  if (existingTerms.includes(validated.term)) {
    return {
      terms: [...existingTerms],
      error: `"${validated.term}" dönemi zaten listede mevcut.`,
    };
  }

  const nextTerms = [...existingTerms, validated.term].sort(
    compareAcademicTerms
  );
  return {
    terms: nextTerms,
    addedTerm: validated.term,
  };
}

/**
 * Eğitim dönemi listesinden seçili bir dönemi siler ve güncel seçili dönemi döndürür.
 */
export function deleteAcademicTerm(
  existingTerms: readonly string[],
  termToDelete: string,
  currentSelectedTerm: string = ALL_ACADEMIC_TERMS
): {
  terms: string[];
  nextSelectedTerm: string;
  deletedTerm?: string;
  error?: string;
} {
  const target = String(termToDelete ?? '').trim();
  if (!target || target === ALL_ACADEMIC_TERMS) {
    return {
      terms: [...existingTerms],
      nextSelectedTerm: currentSelectedTerm,
      error:
        'Tüm Eğitim Dönemleri genel görünümü silinemez. Silmek için belirli bir dönem seçin.',
    };
  }

  if (!existingTerms.includes(target)) {
    return {
      terms: [...existingTerms],
      nextSelectedTerm: currentSelectedTerm,
      error: `"${target}" dönemi listede bulunamadı.`,
    };
  }

  const nextTerms = existingTerms.filter((t) => t !== target);
  const nextSelectedTerm =
    currentSelectedTerm === target ? ALL_ACADEMIC_TERMS : currentSelectedTerm;

  return {
    terms: nextTerms,
    nextSelectedTerm,
    deletedTerm: target,
  };
}

/**
 * Bir ISO tarih dizgesinden (`YYYY-MM-DD`) eğitim dönemini (`YYYY-YYYY Güz` veya `YYYY-YYYY Bahar`) hesaplar.
 * MEB Eğitim Takvimi:
 * - Eylül (09) – Ocak (01) ve 1 - 14 Şubat: Güz Dönemi (1. Dönem)
 * - 15 Şubat ve sonrası – Ağustos (08): Bahar Dönemi (2. Dönem)
 */
export function deriveAcademicTermFromDate(
  dateStr: string | undefined | null,
  fallbackAcademicYear = '2026-2027'
): string {
  const cleaned = String(dateStr ?? '').trim();
  const match = cleaned.match(/^(\d{4})-(\d{2})(?:-(\d{2})(?:T.*)?)?$/);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3] ?? 1);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!match || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    const yearMatch = String(fallbackAcademicYear).match(/(\d{4}-\d{4})/);
    const baseYear = yearMatch ? yearMatch[1] : '2026-2027';
    return `${baseYear} Güz`;
  }

  // Eylül - Aralık: Güz Dönemi (1. Dönem)
  if (month >= 9 && month <= 12) {
    return `${year}-${year + 1} Güz`;
  }
  // Ocak: Güz Dönemi devamı (1. Dönem)
  if (month === 1) {
    return `${year - 1}-${year} Güz`;
  }
  // Şubat: 15 Şubat öncesi Güz Dönemi (1. Dönem sonu ve yarıyıl tatili), 15 Şubat ve sonrası Bahar Dönemi (2. Dönem)
  if (month === 2) {
    if (day < 15) {
      return `${year - 1}-${year} Güz`;
    }
    return `${year - 1}-${year} Bahar`;
  }
  // Mart - Ağustos: Bahar Dönemi (2. Dönem)
  return `${year - 1}-${year} Bahar`;
}

/**
 * Takvim tarihine göre bugünün aktif eğitim dönemini hesaplar.
 * (Örn: 15 Şubat öncesinde '2026-2027 Güz', 15 Şubat ve sonrasında otomatik olarak '2026-2027 Bahar')
 */
export function getCurrentAcademicTerm(nowDate = new Date()): string {
  const year = nowDate.getFullYear();
  const month = String(nowDate.getMonth() + 1).padStart(2, '0');
  const day = String(nowDate.getDate()).padStart(2, '0');
  return deriveAcademicTermFromDate(`${year}-${month}-${day}`);
}

/**
 * Mevcut dönem listesine takvim tarihine göre bugünün aktif dönemini (örneğin 15 Şubat'tan
 * sonra 'Bahar' dönemini) ve oturumlarda yer alan dönemleri otomatik olarak ekler.
 * Böylece öğretmen manuel işlem yapmadan dönemler takvime göre kendiliğinden açılır.
 */
export function ensureAutoAcademicTerms(
  baseTerms: readonly string[] = DEFAULT_ACADEMIC_TERM_OPTIONS,
  sessions: EvaluationSession[] = [],
  classroom?: Classroom | null,
  nowDate = new Date()
): string[] {
  const currentTerm = getCurrentAcademicTerm(nowDate);
  const sessionTerms = sessions.map((s) => resolveSessionAcademicTerm(s, classroom));
  const termSet = new Set<string>([...baseTerms, currentTerm, ...sessionTerms]);
  return Array.from(termSet).sort(compareAcademicTerms);
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
    classroom?.academicYear || '2026-2027'
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
 * Örn: '2026-2027 Bahar' -> '2026-2027 Güz', '2026-2027 Güz' -> '2026-2027 Bahar'
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
 * Seçilen dönemin kronolojik olarak bir önceki dönemini döndürür.
 * Örn: '2026-2027 Bahar' -> '2026-2027 Güz'
 *      '2026-2027 Güz'   -> '2025-2026 Bahar'
 */
export function getPreviousAcademicTerm(selectedTerm: string): string | null {
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
  return `${startYear - 1}-${endYear - 1} Bahar`;
}

/**
 * Açılır menüde gösterilecek eğitim dönemi seçeneklerini oturum sayılarıyla birlikte üretir.
 * Güncel takvim dönemini (örneğin 15 Şubat'tan sonra Bahar dönemi) otomatik olarak açar ve dahil eder.
 */
export function getAcademicTermOptions(
  sessions: EvaluationSession[],
  classroom?: Classroom | null,
  managedTerms?: readonly string[],
  nowDate = new Date()
): AcademicTermOption[] {
  const countsByTerm = new Map<string, number>();

  if (managedTerms !== undefined) {
    for (const term of managedTerms) {
      countsByTerm.set(term, 0);
    }
    for (const session of sessions) {
      const term = resolveSessionAcademicTerm(session, classroom);
      if (countsByTerm.has(term)) {
        countsByTerm.set(term, (countsByTerm.get(term) ?? 0) + 1);
      }
    }
  } else {
    const autoTerms = ensureAutoAcademicTerms(
      DEFAULT_ACADEMIC_TERM_OPTIONS,
      sessions,
      classroom,
      nowDate
    );
    for (const term of autoTerms) {
      countsByTerm.set(term, 0);
    }

    if (classroom?.academicYear) {
      const yearMatch = classroom.academicYear.match(/^(\d{4}-\d{4})$/);
      if (yearMatch) {
        const y = yearMatch[1];
        if (compareAcademicTerms(`${y} Güz`, '2026-2027 Güz') >= 0) {
          if (!countsByTerm.has(`${y} Güz`)) countsByTerm.set(`${y} Güz`, 0);
        }
      }
    }

    for (const session of sessions) {
      const term = resolveSessionAcademicTerm(session, classroom);
      countsByTerm.set(term, (countsByTerm.get(term) ?? 0) + 1);
    }
  }

  const termEntries: AcademicTermOption[] = Array.from(
    countsByTerm.entries()
  ).sort(([a], [b]) => compareAcademicTerms(a, b)).map(([term, sessionCount]) => {
    const parts = term.split(' ');
    const academicYear = parts[0] || '2026-2027';
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
  studentId?: string,
  managedTerms?: readonly string[]
): TermComparisonSummary {
  const baseTerms = managedTerms ?? DEFAULT_ACADEMIC_TERM_OPTIONS;
  const allTermsList = Array.from(
    new Set([
      ...baseTerms,
      ...allClassSessions.map((s) => resolveSessionAcademicTerm(s, classroom)),
    ])
  ).sort(compareAcademicTerms);

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

/**
 * İki ortalama puan arasındaki yüzde değişimi (`%`) ve yönünü (`up` | `down` | `stable` | `insufficient_data`) hesaplar.
 */
export function calculateScorePercentageChange(
  previousAverage: number | null,
  currentAverage: number | null
): {
  pointDelta: number | null;
  percentageChange: number | null;
  trend: StudentTrendDirection;
} {
  if (previousAverage === null || currentAverage === null) {
    return {
      pointDelta: null,
      percentageChange: null,
      trend: 'insufficient_data',
    };
  }

  const pointDelta = Math.round((currentAverage - previousAverage) * 10) / 10;
  let percentageChange: number;
  if (previousAverage === 0) {
    percentageChange = currentAverage > 0 ? 100 : 0;
  } else {
    percentageChange =
      Math.round(((currentAverage - previousAverage) / previousAverage) * 1000) /
      10;
  }

  const trend: StudentTrendDirection =
    pointDelta > 0 ? 'up' : pointDelta < 0 ? 'down' : 'stable';

  return {
    pointDelta,
    percentageChange,
    trend,
  };
}

/**
 * Seçilen dönem ile bir önceki dönemi kıyaslayan öğrenci bazlı yüzde-değişim tablosu verilerini üretir.
 */
export function computeStudentTermPercentageComparison(
  students: Student[],
  allClassSessions: EvaluationSession[],
  rubricsById: Record<string, Rubric>,
  selectedTerm: string,
  classroom?: Classroom | null,
  managedTerms?: readonly string[]
): StudentTermPercentageComparison {
  const sortedActiveTerms = Array.from(
    new Set(
      allClassSessions.map((s) => resolveSessionAcademicTerm(s, classroom))
    )
  ).sort(compareAcademicTerms);

  let currentTerm: string;
  let previousTerm: string;

  if (selectedTerm && selectedTerm !== ALL_ACADEMIC_TERMS) {
    currentTerm = selectedTerm;
    const chronologicalPrev = getPreviousAcademicTerm(selectedTerm);
    const siblingPrev = getComparisonAcademicTerm(selectedTerm);

    // Eğer kronolojik önceki dönemde veri yoksa ve aynı akademik yılın komşu döneminde veri varsa,
    // yine de kronolojik önceki dönemi baz alırız; ancak kronolojik önceki dönem hesaplanamazsa komşu döneme düşeriz.
    previousTerm = chronologicalPrev || siblingPrev || '2026-2027 Güz';
  } else if (sortedActiveTerms.length >= 2) {
    currentTerm = sortedActiveTerms[sortedActiveTerms.length - 1];
    previousTerm = sortedActiveTerms[sortedActiveTerms.length - 2];
  } else if (sortedActiveTerms.length === 1) {
    currentTerm = sortedActiveTerms[0];
    previousTerm =
      getPreviousAcademicTerm(currentTerm) ||
      getComparisonAcademicTerm(currentTerm) ||
      '2026-2027 Güz';
  } else {
    const baseList =
      managedTerms && managedTerms.length > 0
        ? [...managedTerms].sort(compareAcademicTerms)
        : [...DEFAULT_ACADEMIC_TERM_OPTIONS];
    currentTerm = baseList[1] || baseList[0] || '2026-2027 Güz';
    previousTerm =
      getPreviousAcademicTerm(currentTerm) ||
      baseList[0] ||
      '2026-2027 Güz';
  }

  const previousSessions = filterSessionsByAcademicTerm(
    allClassSessions,
    previousTerm,
    classroom
  );
  const currentSessions = filterSessionsByAcademicTerm(
    allClassSessions,
    currentTerm,
    classroom
  );

  // Eğer sınıfta kayıtlı öğrenci listesi boşsa ama oturumlarda değerlendirilen öğrenci ID'leri varsa onları da kapsa
  const effectiveStudents: Student[] =
    students.length > 0
      ? students
      : Array.from(
          new Set(
            allClassSessions.flatMap((s) => Object.keys(s.evaluations || {}))
          )
        ).map((id, idx) => ({
          id,
          studentNumber: String(idx + 1),
          fullName: `Öğrenci #${id}`,
          classId: classroom?.id || '',
        }));

  const rows: StudentTermPercentageRow[] = effectiveStudents.map((student) => {
    const prevHistory = getStudentProgressHistory(
      student.id,
      previousSessions,
      rubricsById
    );
    const currHistory = getStudentProgressHistory(
      student.id,
      currentSessions,
      rubricsById
    );

    const previousAverage =
      prevHistory.length > 0
        ? Math.round(
            prevHistory.reduce((acc, h) => acc + h.scoreOutOf100, 0) /
              prevHistory.length
          )
        : null;

    const currentAverage =
      currHistory.length > 0
        ? Math.round(
            currHistory.reduce((acc, h) => acc + h.scoreOutOf100, 0) /
              currHistory.length
          )
        : null;

    const { pointDelta, percentageChange, trend } =
      calculateScorePercentageChange(previousAverage, currentAverage);

    return {
      studentId: student.id,
      studentNumber: student.studentNumber,
      fullName: student.fullName,
      previousTerm,
      currentTerm,
      previousSessionCount: prevHistory.length,
      currentSessionCount: currHistory.length,
      previousAverage,
      currentAverage,
      pointDelta,
      percentageChange,
      trend,
    };
  });

  const validPrevScores = rows
    .map((r) => r.previousAverage)
    .filter((v): v is number => v !== null);
  const validCurrScores = rows
    .map((r) => r.currentAverage)
    .filter((v): v is number => v !== null);

  const classPreviousAverage =
    validPrevScores.length > 0
      ? Math.round(
          validPrevScores.reduce((a, b) => a + b, 0) / validPrevScores.length
        )
      : null;
  const classCurrentAverage =
    validCurrScores.length > 0
      ? Math.round(
          validCurrScores.reduce((a, b) => a + b, 0) / validCurrScores.length
        )
      : null;

  const {
    pointDelta: classPointDelta,
    percentageChange: classPercentageChange,
    trend: classTrend,
  } = calculateScorePercentageChange(classPreviousAverage, classCurrentAverage);

  return {
    currentTerm,
    previousTerm,
    rows,
    classPreviousAverage,
    classCurrentAverage,
    classPointDelta,
    classPercentageChange,
    classTrend,
  };
}

