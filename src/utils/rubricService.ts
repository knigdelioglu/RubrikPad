import type { Classroom, Rubric } from '../types.ts';
import {
  LITERARY_BOOK_PRESENTATION_RUBRIC_ID,
  INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID,
  LEGACY_BOOK_PRESENTATION_RUBRIC_ID,
} from '../data/bookPresentationRubric.ts';
import { SPEAKING_EXAM_RUBRIC_ID } from '../data/speakingExamRubric.ts';

/**
 * Standart lise ve ortaokul sınıf düzeyleri (Kademe / Seviye).
 */
export const STANDARD_GRADE_LEVELS: string[] = [
  '9. Sınıf',
  '10. Sınıf',
  '11. Sınıf',
  '12. Sınıf',
  '5. Sınıf',
  '6. Sınıf',
  '7. Sınıf',
  '8. Sınıf',
  'Genel',
];

/**
 * Standart ders / branş katalog listesi.
 */
export const STANDARD_SUBJECTS: string[] = [
  'Türk Dili ve Edebiyatı',
  'Türkçe',
  'Matematik',
  'Tarih',
  'Coğrafya',
  'Felsefe',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Yabancı Dil',
  'Fen Bilimleri',
  'Sosyal Bilgiler',
  'Genel Değerlendirme',
];

export const DEFAULT_GRADE_LEVEL = '11. Sınıf';
export const DEFAULT_SUBJECT = 'Türk Dili ve Edebiyatı';

export interface RubricCourseAssociation {
  rubricId: string;
  gradeLevel: string;
  subject: string;
  isEleventhGradeTurkishLiterature: boolean;
}

/**
 * 11. Sınıf Türk Dili ve Edebiyatı dersine özel 8 yerleşik rubriğin kimlikleri.
 * Bu 8 rubrik yalnızca 11. Sınıf + Türk Dili ve Edebiyatı seçildiğinde gösterilir.
 */
export const TDE_11_RUBRIC_IDS: ReadonlySet<string> = new Set([
  'rub-tde-iletisim-engelleri',
  'rub-tde-eposta',
  'rub-tde-turk-dunyasi-konusma',
  'rub-tde-muze-izlenim-yazisi',
  'rub-tde-kemal-tahir-mulakat',
  'rub-tde-diyalog-donusturme',
  'rub-tde-tiyatro-canlandirma',
  'rub-tde-afis',
]);

/**
 * 9, 10, 11 ve 12. sınıfların tamamında Türk Dili ve Edebiyatı dersinde erişilebilir olan
 * yerleşik kitap okuma ve sunum rubriklerinin kimlikleri.
 */
export const ALL_GRADE_TDE_RUBRIC_IDS: ReadonlySet<string> = new Set([
  LITERARY_BOOK_PRESENTATION_RUBRIC_ID,
  INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID,
  LEGACY_BOOK_PRESENTATION_RUBRIC_ID,
  SPEAKING_EXAM_RUBRIC_ID,
]);

export const RUBRIC_COURSE_REGISTRY: Readonly<
  Record<string, { gradeLevel: string; subject: string }>
> = {
  [SPEAKING_EXAM_RUBRIC_ID]: {
    gradeLevel: 'Genel',
    subject: 'Türk Dili ve Edebiyatı',
  },
  [LITERARY_BOOK_PRESENTATION_RUBRIC_ID]: {
    gradeLevel: 'Genel',
    subject: 'Türk Dili ve Edebiyatı',
  },
  [INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID]: {
    gradeLevel: 'Genel',
    subject: 'Türk Dili ve Edebiyatı',
  },
  [LEGACY_BOOK_PRESENTATION_RUBRIC_ID]: {
    gradeLevel: 'Genel',
    subject: 'Türk Dili ve Edebiyatı',
  },
  'rub-tde-iletisim-engelleri': {
    gradeLevel: '11. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
  },
  'rub-tde-eposta': {
    gradeLevel: '11. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
  },
  'rub-tde-turk-dunyasi-konusma': {
    gradeLevel: '11. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
  },
  'rub-tde-muze-izlenim-yazisi': {
    gradeLevel: '11. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
  },
  'rub-tde-kemal-tahir-mulakat': {
    gradeLevel: '11. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
  },
  'rub-tde-diyalog-donusturme': {
    gradeLevel: '11. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
  },
  'rub-tde-tiyatro-canlandirma': {
    gradeLevel: '11. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
  },
  'rub-tde-afis': {
    gradeLevel: '11. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
  },
};

/**
 * Türkçe karakter duyarlı küçük harf dönüşümü ve boşluk temizleme.
 */
export function normalizeTurkishText(value?: string | null): string {
  if (!value || typeof value !== 'string') return '';
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

/**
 * Sınıf düzeyini (örn: "11", "11. sınıf", "11.Sınıf", "11-A") standart biçime ("11. Sınıf") dönüştürür.
 */
export function normalizeGradeLevel(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = normalizeTurkishText(raw);
  if (!cleaned) return '';

  if (
    cleaned === 'genel' ||
    cleaned === 'tümü' ||
    cleaned === 'tumu' ||
    cleaned === 'tüm sınıflar'
  ) {
    return 'Genel';
  }

  // "11. sınıf", "11.sınıf", "11 sınıf", "11", "11-a" vb. içinden sınıf numarasını yakala
  const gradeMatch = cleaned.match(/\b(5|6|7|8|9|10|11|12)\b/);
  if (gradeMatch) {
    return `${gradeMatch[1]}. Sınıf`;
  }

  return raw.trim();
}

/**
 * Ders adını standart biçime dönüştürür (örn: "tde", "türk dili ve edebiyatı" -> "Türk Dili ve Edebiyatı").
 */
export function normalizeSubjectName(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = normalizeTurkishText(raw);
  if (!cleaned) return '';

  if (
    cleaned === 'türk dili ve edebiyatı' ||
    cleaned === 'turk dili ve edebiyati' ||
    cleaned === 'türk dili edebiyatı' ||
    cleaned === 'edebiyat' ||
    cleaned === 'tde'
  ) {
    return 'Türk Dili ve Edebiyatı';
  }

  if (cleaned === 'türkçe' || cleaned === 'turkce') return 'Türkçe';
  if (cleaned === 'matematik') return 'Matematik';
  if (cleaned === 'tarih') return 'Tarih';
  if (cleaned === 'coğrafya' || cleaned === 'cografya') return 'Coğrafya';
  if (cleaned === 'felsefe') return 'Felsefe';
  if (cleaned === 'fizik') return 'Fizik';
  if (cleaned === 'kimya') return 'Kimya';
  if (cleaned === 'biyoloji') return 'Biyoloji';
  if (cleaned === 'fen bilimleri') return 'Fen Bilimleri';
  if (cleaned === 'sosyal bilgiler') return 'Sosyal Bilgiler';
  if (cleaned === 'yabancı dil' || cleaned === 'ingilizce') return 'Yabancı Dil';
  if (
    cleaned === 'genel değerlendirme' ||
    cleaned === 'genel' ||
    cleaned === 'genel ders'
  ) {
    return 'Genel Değerlendirme';
  }

  return raw.trim();
}

/**
 * Bir rubriğin etkin sınıf düzeyini döndürür.
 * 8 adet 11. Sınıf Türk Dili ve Edebiyatı rubriği her zaman '11. Sınıf' olarak çözümlenir.
 */
export function getEffectiveRubricGradeLevel(rubric: Rubric): string {
  const registered = RUBRIC_COURSE_REGISTRY[rubric.id];
  if (registered) {
    return registered.gradeLevel;
  }
  const normalized = normalizeGradeLevel(rubric.gradeLevel);
  return normalized || 'Genel';
}

/**
 * Bir rubriğin etkin ders/branş adını döndürür.
 */
export function getEffectiveRubricSubject(rubric: Rubric): string {
  const registered = RUBRIC_COURSE_REGISTRY[rubric.id];
  if (registered) {
    return registered.subject;
  }
  const normalized = normalizeSubjectName(rubric.subject);
  return normalized || 'Genel Değerlendirme';
}

/**
 * Verilen sınıf düzeyi ve ders kombinasyonunun "11. Sınıf Türk Dili ve Edebiyatı" olup olmadığını denetler.
 */
export function isEleventhGradeTurkishLiterature(
  gradeLevel?: string | null,
  subject?: string | null
): boolean {
  return (
    normalizeGradeLevel(gradeLevel) === '11. Sınıf' &&
    normalizeSubjectName(subject) === 'Türk Dili ve Edebiyatı'
  );
}

/**
 * Bir rubriğin hangi sınıf seviyesi ve ders ile ilişkili olduğunu döndürür.
 */
export function getRubricAssociation(rubric: Rubric): RubricCourseAssociation {
  const gradeLevel = getEffectiveRubricGradeLevel(rubric);
  const subject = getEffectiveRubricSubject(rubric);
  return {
    rubricId: rubric.id,
    gradeLevel,
    subject,
    isEleventhGradeTurkishLiterature: isEleventhGradeTurkishLiterature(
      gradeLevel,
      subject
    ),
  };
}

/**
 * Bir rubriğe normalize edilmiş sınıf düzeyi ve ders bilgisini atar.
 */
export function assignCourseToRubric(
  rubric: Rubric,
  gradeLevel?: string | null,
  subject?: string | null
): Rubric {
  if (RUBRIC_COURSE_REGISTRY[rubric.id]) {
    return {
      ...rubric,
      gradeLevel: RUBRIC_COURSE_REGISTRY[rubric.id].gradeLevel,
      subject: RUBRIC_COURSE_REGISTRY[rubric.id].subject,
    };
  }
  return {
    ...rubric,
    gradeLevel: normalizeGradeLevel(gradeLevel ?? rubric.gradeLevel) || DEFAULT_GRADE_LEVEL,
    subject: normalizeSubjectName(subject ?? rubric.subject) || DEFAULT_SUBJECT,
  };
}

/**
 * Bir rubriğin seçilen sınıf düzeyi (gradeLevel) ve ders (subject) ile eşleşip eşleşmediğini kontrol eder.
 * Kural:
 * - Seçili sınıf düzeyi ve ders dışında kalan tüm rubrikler gizlenir.
 * - 11. Sınıf Türk Dili ve Edebiyatı seçildiğinde yalnızca 11. Sınıf Türk Dili ve Edebiyatı rubrikleri gösterilir.
 * - Başka bir sınıf düzeyi veya ders seçildiğinde 11. Sınıf Türk Dili ve Edebiyatı rubrikleri gizlenir.
 */
export function doesRubricMatchGradeAndSubject(
  rubric: Rubric,
  selectedGradeLevel?: string | null,
  selectedSubject?: string | null
): boolean {
  const targetGrade = normalizeGradeLevel(selectedGradeLevel);
  const targetSubject = normalizeSubjectName(selectedSubject);

  if (!targetGrade || !targetSubject) {
    return false;
  }

  const rubricGrade = getEffectiveRubricGradeLevel(rubric);
  const rubricSubject = getEffectiveRubricSubject(rubric);

  // Yerleşik kitap sunumu rubriği tüm sınıf düzeylerinde, yalnızca TDE dersinde görünür.
  if (ALL_GRADE_TDE_RUBRIC_IDS.has(rubric.id)) {
    return targetSubject === 'Türk Dili ve Edebiyatı';
  }

  if (TDE_11_RUBRIC_IDS.has(rubric.id)) {
    return (
      targetGrade === '11. Sınıf' &&
      targetSubject === 'Türk Dili ve Edebiyatı'
    );
  }

  return (
    rubricGrade === targetGrade &&
    normalizeTurkishText(rubricSubject) === normalizeTurkishText(targetSubject)
  );
}

/**
 * Belirli bir sınıf düzeyi ve ders seçimine göre rubrik listesini filtreler.
 * Seçili sınıf düzeyi ve ders dışında kalan tüm rubrikleri gizler.
 */
export function getRubricsByGradeAndSubject(
  rubrics: Rubric[],
  gradeLevel?: string | null,
  subject?: string | null
): Rubric[] {
  return rubrics.filter((r) =>
    doesRubricMatchGradeAndSubject(r, gradeLevel, subject)
  );
}

/**
 * Sınıf bazlı rubrik servisi:
 * Seçili şube veya şubeler (Classroom[]) için uygun rubrikleri filtreler.
 */
export function getRubricsForClassrooms(
  rubrics: Rubric[],
  selectedClassrooms: Classroom[]
): Rubric[] {
  if (!selectedClassrooms || selectedClassrooms.length === 0) {
    return [];
  }

  return rubrics.filter((rubric) =>
    selectedClassrooms.every((cls) =>
      doesRubricMatchGradeAndSubject(rubric, cls.gradeLevel, cls.subject)
    )
  );
}

export interface CurriculumGroupSummary {
  gradeLevel: string;
  subject: string;
  rubricCount: number;
  rubricIds: string[];
}

/**
 * Sistemdeki rubriklerin hangi sınıf düzeyi ve ders altında toplandığını özetler.
 */
export function summarizeRubricCatalogByGradeAndSubject(
  rubrics: Rubric[]
): CurriculumGroupSummary[] {
  const map = new Map<string, CurriculumGroupSummary>();
  for (const r of rubrics) {
    const gradeLevel = getEffectiveRubricGradeLevel(r);
    const subject = getEffectiveRubricSubject(r);
    const key = `${gradeLevel}___${subject}`;
    const existing = map.get(key);
    if (existing) {
      existing.rubricCount += 1;
      existing.rubricIds.push(r.id);
    } else {
      map.set(key, {
        gradeLevel,
        subject,
        rubricCount: 1,
        rubricIds: [r.id],
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Sınıf ve ders bazlı rubrik yönetim servisi (RubrikService).
 */
export const RubrikService = {
  STANDARD_GRADE_LEVELS,
  STANDARD_SUBJECTS,
  DEFAULT_GRADE_LEVEL,
  DEFAULT_SUBJECT,
  TDE_11_RUBRIC_IDS,
  ALL_GRADE_TDE_RUBRIC_IDS,
  RUBRIC_COURSE_REGISTRY,
  normalizeGradeLevel,
  normalizeSubjectName,
  getEffectiveRubricGradeLevel,
  getEffectiveRubricSubject,
  getRubricAssociation,
  assignCourseToRubric,
  isEleventhGradeTurkishLiterature,
  doesRubricMatchGradeAndSubject,
  getRubricsByGradeAndSubject,
  filterRubricsForSelection: getRubricsByGradeAndSubject,
  getRubricsForClassrooms,
  summarizeRubricCatalogByGradeAndSubject,
} as const;
