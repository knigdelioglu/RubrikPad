import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_RUBRICS } from '../../data/seedData.ts';
import { BOOK_PRESENTATION_RUBRIC_ID } from '../../data/bookPresentationRubric.ts';
import { validateRubric, calculateWeightedScore } from '../rubricLogic.ts';
import type { Classroom, Rubric } from '../../types.ts';
import {
  RubrikService,
  normalizeGradeLevel,
  normalizeSubjectName,
  isEleventhGradeTurkishLiterature,
  getRubricsForClassrooms,
  getRubricsByGradeAndSubject,
  summarizeRubricCatalogByGradeAndSubject,
  TDE_11_RUBRIC_IDS,
  ALL_GRADE_TDE_RUBRIC_IDS,
} from '../../services/RubrikService.ts';

test('INITIAL_RUBRICS retains the 8 100-point 11th grade rubrics alongside the all-grade book rubric', () => {
  assert.equal(INITIAL_RUBRICS.length, 9);
  const grade11Rubrics = INITIAL_RUBRICS.filter((r) => TDE_11_RUBRIC_IDS.has(r.id));
  assert.equal(grade11Rubrics.length, 8);
  for (const rubric of grade11Rubrics) {
    assert.equal(TDE_11_RUBRIC_IDS.has(rubric.id), true);
    const assoc = RubrikService.getRubricAssociation(rubric);
    assert.equal(assoc.gradeLevel, '11. Sınıf');
    assert.equal(assoc.subject, 'Türk Dili ve Edebiyatı');
    assert.equal(assoc.isEleventhGradeTurkishLiterature, true);
    const totalPoints = rubric.criteria.reduce(
      (sum, c) => sum + Number(c.maxPoints ?? c.weight ?? 0),
      0
    );
    assert.equal(totalPoints, 100, `${rubric.title} toplam puanı 100 olmalı`);
  }
});

test('normalizeGradeLevel and normalizeSubjectName handle common Turkish input variations', () => {
  assert.equal(normalizeGradeLevel('11'), '11. Sınıf');
  assert.equal(normalizeGradeLevel('11. sınıf'), '11. Sınıf');
  assert.equal(normalizeGradeLevel('11.Sınıf'), '11. Sınıf');
  assert.equal(normalizeGradeLevel('11-A Sınıfı'), '11. Sınıf');
  assert.equal(normalizeGradeLevel('10. Sınıf'), '10. Sınıf');

  assert.equal(
    normalizeSubjectName('türk dili ve edebiyatı'),
    'Türk Dili ve Edebiyatı'
  );
  assert.equal(normalizeSubjectName('Edebiyat'), 'Türk Dili ve Edebiyatı');
  assert.equal(normalizeSubjectName('TDE'), 'Türk Dili ve Edebiyatı');
  assert.equal(
    isEleventhGradeTurkishLiterature('11. Sınıf', 'Türk Dili ve Edebiyatı'),
    true
  );
  assert.equal(
    isEleventhGradeTurkishLiterature('10. Sınıf', 'Türk Dili ve Edebiyatı'),
    false
  );
  assert.equal(
    isEleventhGradeTurkishLiterature('11. Sınıf', 'Matematik'),
    false
  );
});

test('11th grade rubrics remain restricted while the book presentation rubric is shared across TDE grades', () => {
  // 11. Sınıf + Türk Dili ve Edebiyatı -> 8 local + 1 common rubric
  const matched11Tde = getRubricsByGradeAndSubject(
    INITIAL_RUBRICS,
    '11. Sınıf',
    'Türk Dili ve Edebiyatı'
  );
  assert.equal(matched11Tde.length, 9);
  assert.equal(matched11Tde.some((r) => r.id === BOOK_PRESENTATION_RUBRIC_ID), true);

  // 10. Sınıf + Türk Dili ve Edebiyatı -> only the shared book rubric
  const matched10Tde = getRubricsByGradeAndSubject(
    INITIAL_RUBRICS,
    '10. Sınıf',
    'Türk Dili ve Edebiyatı'
  );
  assert.deepEqual(matched10Tde.map((r) => r.id), [BOOK_PRESENTATION_RUBRIC_ID]);

  // 9. Sınıf + Türk Dili ve Edebiyatı -> only the shared book rubric
  const matched9Tde = getRubricsByGradeAndSubject(
    INITIAL_RUBRICS,
    '9. Sınıf',
    'Türk Dili ve Edebiyatı'
  );
  assert.deepEqual(matched9Tde.map((r) => r.id), [BOOK_PRESENTATION_RUBRIC_ID]);

  // 12. Sınıf + Türk Dili ve Edebiyatı -> only the shared book rubric
  const matched12Tde = getRubricsByGradeAndSubject(
    INITIAL_RUBRICS,
    '12. Sınıf',
    'Türk Dili ve Edebiyatı'
  );
  assert.deepEqual(matched12Tde.map((r) => r.id), [BOOK_PRESENTATION_RUBRIC_ID]);

  // 11. Sınıf + Matematik -> 0 rubrics
  const matched11Math = getRubricsByGradeAndSubject(
    INITIAL_RUBRICS,
    '11. Sınıf',
    'Matematik'
  );
  assert.equal(matched11Math.length, 0);

  // Unselected grade/subject -> 0 rubrics
  assert.equal(getRubricsByGradeAndSubject(INITIAL_RUBRICS, '', '').length, 0);
});

test('getRubricsForClassrooms filters rubrics by classroom gradeLevel and subject', () => {
  const cls11Tde: Classroom = {
    id: 'cls-11a',
    name: '11-A',
    gradeLevel: '11. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
    academicYear: '2026-2027',
  };
  const cls10Tde: Classroom = {
    id: 'cls-10a',
    name: '10-A',
    gradeLevel: '10. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
    academicYear: '2026-2027',
  };
  const cls11Math: Classroom = {
    id: 'cls-11b',
    name: '11-B',
    gradeLevel: '11. Sınıf',
    subject: 'Matematik',
    academicYear: '2026-2027',
  };

  assert.equal(getRubricsForClassrooms(INITIAL_RUBRICS, [cls11Tde]).length, 9);
  assert.deepEqual(getRubricsForClassrooms(INITIAL_RUBRICS, [cls10Tde]).map((r) => r.id), [BOOK_PRESENTATION_RUBRIC_ID]);
  assert.equal(getRubricsForClassrooms(INITIAL_RUBRICS, [cls11Math]).length, 0);
  assert.deepEqual(
    getRubricsForClassrooms(INITIAL_RUBRICS, [cls11Tde, cls10Tde]).map((r) => r.id),
    [BOOK_PRESENTATION_RUBRIC_ID]
  );
  assert.equal(getRubricsForClassrooms(INITIAL_RUBRICS, []).length, 0);
});

test('RubrikService.filterRubricsForSelection allows only its all-grade TDE exception', () => {
  const math10Rubric: Rubric = {
    ...INITIAL_RUBRICS[0],
    id: 'rub-custom-math-10',
    title: '10. Sınıf Fonksiyonlar Proje Rubriği',
    gradeLevel: '10. Sınıf',
    subject: 'Matematik',
  };
  const generalRubric: Rubric = {
    ...INITIAL_RUBRICS[0],
    id: 'rub-custom-genel',
    title: 'Genel Sunum Rubriği',
    gradeLevel: 'Genel',
    subject: 'Genel Değerlendirme',
  };
  const tde10Rubric: Rubric = {
    ...INITIAL_RUBRICS[0],
    id: 'rub-custom-tde-10',
    title: '10. Sınıf Destan İnceleme Rubriği',
    gradeLevel: '10. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
  };
  const all = [...INITIAL_RUBRICS, math10Rubric, generalRubric, tde10Rubric];

  const for11Tde = RubrikService.filterRubricsForSelection(
    all,
    '11. Sınıf',
    'Türk Dili ve Edebiyatı'
  );
  assert.equal(for11Tde.length, 9);
  assert.equal(
    for11Tde.some((r) => r.id === 'rub-custom-math-10'),
    false
  );
  assert.equal(
    for11Tde.some((r) => r.id === 'rub-custom-genel'),
    false
  );
  assert.equal(
    for11Tde.some((r) => r.id === 'rub-custom-tde-10'),
    false
  );

  const for10Math = RubrikService.filterRubricsForSelection(
    all,
    '10. Sınıf',
    'Matematik'
  );
  assert.equal(for10Math.length, 1);
  assert.equal(for10Math[0].id, 'rub-custom-math-10');

  const summary = summarizeRubricCatalogByGradeAndSubject(all);
  assert.equal(summary.length, 5);
});

test('book presentation rubric has clear 100-point descriptors and supports all TDE grades', () => {
  const rubric = INITIAL_RUBRICS.find((r) => r.id === BOOK_PRESENTATION_RUBRIC_ID);
  assert.ok(rubric);
  assert.equal(ALL_GRADE_TDE_RUBRIC_IDS.has(rubric.id), true);
  assert.equal(rubric.gradeLevel, 'Genel');
  assert.equal(RubrikService.getEffectiveRubricGradeLevel(rubric), 'Genel');
  assert.equal(RubrikService.getEffectiveRubricSubject(rubric), 'Türk Dili ve Edebiyatı');
  assert.equal(validateRubric(rubric).isValid, true);
  assert.deepEqual(rubric.criteria.map((c) => c.maxPoints), [20, 20, 15, 15, 10, 10, 5, 5]);
  assert.equal(new Set(rubric.criteria.map((c) => c.id)).size, rubric.criteria.length);
  assert.ok(rubric.criteria.every((c) => c.levels.length === 5 && c.levels[0].points === 0));
  assert.ok(rubric.description.includes('zorunlu kitap sunumu puanlama anahtarı değildir'));

  for (const grade of ['9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf']) {
    assert.ok(getRubricsByGradeAndSubject(INITIAL_RUBRICS, grade, 'Türk Dili ve Edebiyatı').some((r) => r.id === rubric.id));
    assert.ok(getRubricsForClassrooms(INITIAL_RUBRICS, [{
      id: 'class-' + grade,
      name: grade,
      gradeLevel: grade,
      subject: 'Türk Dili ve Edebiyatı',
      academicYear: '2026-2027',
    }]).some((r) => r.id === rubric.id));
  }
  assert.equal(getRubricsByGradeAndSubject(INITIAL_RUBRICS, '10. Sınıf', 'Matematik').some((r) => r.id === rubric.id), false);
  assert.equal(getRubricsByGradeAndSubject(INITIAL_RUBRICS, '11. Sınıf', 'Türkçe').some((r) => r.id === rubric.id), false);
  assert.equal(calculateWeightedScore(rubric, Object.fromEntries(rubric.criteria.map((c) => [c.id, 4]))).finalScoreOutOf100, 100);
  assert.equal(calculateWeightedScore(rubric, Object.fromEntries(rubric.criteria.map((c) => [c.id, 0]))).finalScoreOutOf100, 0);
  assert.equal(calculateWeightedScore(rubric, Object.fromEntries(rubric.criteria.map((c) => [c.id, 2]))).finalScoreOutOf100, 50);
});

test('generateStudentPortfolioPdfBytes and generateClassroomOverviewPdfBytes produce valid %PDF-1.4 documents with Turkish Unicode text', async () => {
  const {
    generateStudentPortfolioPdfBytes,
    generateClassroomOverviewPdfBytes,
    decodePdfTextWithToUnicode,
  } = await import('../pdfGenerator.ts');

  const cls: Classroom = {
    id: 'cls-11a',
    name: '11-A',
    gradeLevel: '11. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
    academicYear: '2026-2027',
  };
  const stu = {
    id: 'stu-1',
    studentNumber: '104',
    fullName: 'Çağrı Şahin Öztürk',
    classId: 'cls-11a',
  };

  const overviewBytes = generateClassroomOverviewPdfBytes(
    cls,
    [stu],
    [],
    INITIAL_RUBRICS
  );
  const overviewHeader = new TextDecoder('ascii').decode(
    overviewBytes.slice(0, 8)
  );
  assert.equal(overviewHeader, '%PDF-1.4');
  const overviewText = decodePdfTextWithToUnicode(overviewBytes);
  assert.equal(
    overviewText.includes('SINIF GELİŞİM VE RUBRİK DEĞERLENDİRME ÖZET RAPORU'),
    true
  );
  assert.equal(overviewText.includes('İletişim Engelleri'), true);

  const rubricsMap: Record<string, Rubric> = {};
  for (const r of INITIAL_RUBRICS) rubricsMap[r.id] = r;

  const portfolioBytes = generateStudentPortfolioPdfBytes(
    stu,
    cls,
    [],
    rubricsMap
  );
  const portfolioHeader = new TextDecoder('ascii').decode(
    portfolioBytes.slice(0, 8)
  );
  assert.equal(portfolioHeader, '%PDF-1.4');
  const portfolioText = decodePdfTextWithToUnicode(portfolioBytes);
  assert.equal(
    portfolioText.includes('VELİ BİLGİLENDİRME VE ÖĞRENCİ GELİŞİM RAPORU'),
    true
  );
  assert.equal(portfolioText.includes('Çağrı Şahin Öztürk'), true);
  assert.equal(portfolioText.includes('Veli Adı Soyadı / İmza'), true);
});

test('resolvePdfColumnOptions and PDF generators respect Sadece İsimler, Puanlar ile, and Gözlem Notları ile presets', async () => {
  const {
    resolvePdfColumnOptions,
    generateClassroomOverviewPdfBytes,
    generatePaginatedSessionPdfBytes,
    decodePdfTextWithToUnicode,
  } = await import('../pdfGenerator.ts');

  const namesOnly = resolvePdfColumnOptions({ preset: 'names_only' });
  assert.equal(namesOnly.showCriterionScores, false);
  assert.equal(namesOnly.showFinalScoreAndLevel, false);
  assert.equal(namesOnly.showObservationNotes, false);

  const withScores = resolvePdfColumnOptions({ preset: 'with_scores' });
  assert.equal(withScores.showCriterionScores, true);
  assert.equal(withScores.showFinalScoreAndLevel, true);
  assert.equal(withScores.showObservationNotes, false);

  const withNotes = resolvePdfColumnOptions({ preset: 'with_notes' });
  assert.equal(withNotes.showCriterionScores, true);
  assert.equal(withNotes.showFinalScoreAndLevel, true);
  assert.equal(withNotes.showObservationNotes, true);

  const cls: Classroom = {
    id: 'cls-11a',
    name: '11-A',
    gradeLevel: '11. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
    academicYear: '2026-2027',
  };
  const stu = {
    id: 'stu-1',
    studentNumber: '104',
    fullName: 'Çağrı Şahin Öztürk',
    classId: 'cls-11a',
  };

  const overviewNamesOnlyBytes = generateClassroomOverviewPdfBytes(
    cls,
    [stu],
    [],
    INITIAL_RUBRICS,
    { preset: 'names_only' }
  );
  const overviewNamesOnlyText = decodePdfTextWithToUnicode(
    overviewNamesOnlyBytes
  );
  assert.equal(overviewNamesOnlyText.includes('Sadece İsimler'), true);

  const sessionObj = {
    id: 'sess-1',
    title: 'E-posta Yazma Değerlendirmesi',
    date: '2026-10-24',
    classId: 'cls-11a',
    rubricId: INITIAL_RUBRICS[1].id,
    status: 'completed' as const,
    mode: 'individual' as const,
    groups: [],
    generalSessionNote: '',
    evaluations: {
      'stu-1': {
        studentId: 'stu-1',
        criterionScores: {},
        note: 'Özel gözlem notu metni',
        tags: [],
        updatedAt: '2026-10-24',
      },
    },
  };

  const sessionNamesOnlyBytes = generatePaginatedSessionPdfBytes(
    sessionObj,
    INITIAL_RUBRICS[1],
    cls,
    [stu],
    16,
    { preset: 'names_only' }
  );
  const sessionNamesOnlyText = decodePdfTextWithToUnicode(sessionNamesOnlyBytes);
  assert.equal(sessionNamesOnlyText.includes('Çağrı Şahin'), true);
  assert.equal(sessionNamesOnlyText.includes('Özel gözlem notu metni'), false);

  const sessionWithNotesBytes = generatePaginatedSessionPdfBytes(
    sessionObj,
    INITIAL_RUBRICS[1],
    cls,
    [stu],
    16,
    { preset: 'with_notes' }
  );
  const sessionWithNotesText = decodePdfTextWithToUnicode(sessionWithNotesBytes);
  assert.equal(sessionWithNotesText.includes('Özel gözlem notu metni'), true);
});



test('academicTermLogic derives 2024-2025 Güz / 2024-2025 Bahar terms, filters sessions, and computes comparative delta', async () => {
  const {
    deriveAcademicTermFromDate,
    getAcademicTermOptions,
    filterSessionsByAcademicTerm,
    computeTermComparisonAnalytics,
    ALL_ACADEMIC_TERMS,
  } = await import('../academicTermLogic.ts');

  assert.equal(deriveAcademicTermFromDate('2024-11-15'), '2024-2025 Güz');
  assert.equal(deriveAcademicTermFromDate('2025-01-10'), '2024-2025 Güz');
  assert.equal(deriveAcademicTermFromDate('2025-03-22'), '2024-2025 Bahar');
  assert.equal(deriveAcademicTermFromDate('2026-10-24'), '2026-2027 Güz');

  const rubric = INITIAL_RUBRICS[2];
  const makeFullScores = (ptsPerCriterion: number) => {
    const direct: Record<string, number> = {};
    const level: Record<string, number> = {};
    for (const c of rubric.criteria) {
      direct[c.id] = ptsPerCriterion;
      level[c.id] = 4;
    }
    return { direct, level };
  };

  const fallScores = makeFullScores(14); // 5 * 14 = 70
  const springScores = makeFullScores(18); // 5 * 18 = 90

  const sessions = [
    {
      id: 'sess-fall',
      title: 'Güz Konuşma Sınavı',
      classId: 'cls-11a',
      rubricId: rubric.id,
      date: '2024-11-20',
      status: 'completed' as const,
      mode: 'individual' as const,
      groups: [],
      generalSessionNote: '',
      evaluations: {
        'stu-1': {
          studentId: 'stu-1',
          criterionScores: fallScores.level,
          directCriterionScores: fallScores.direct,
          note: '',
          tags: [],
          updatedAt: '2024-11-20',
        },
      },
    },
    {
      id: 'sess-spring',
      title: 'Bahar Konuşma Sınavı',
      classId: 'cls-11a',
      rubricId: rubric.id,
      date: '2025-04-15',
      status: 'completed' as const,
      mode: 'individual' as const,
      groups: [],
      generalSessionNote: '',
      evaluations: {
        'stu-1': {
          studentId: 'stu-1',
          criterionScores: springScores.level,
          directCriterionScores: springScores.direct,
          note: '',
          tags: [],
          updatedAt: '2025-04-15',
        },
      },
    },
  ];

  const options = getAcademicTermOptions(sessions);
  assert.equal(
    options.some((o) => o.value === '2024-2025 Güz'),
    true
  );
  assert.equal(
    options.some((o) => o.value === '2024-2025 Bahar'),
    true
  );

  const fallFiltered = filterSessionsByAcademicTerm(sessions, '2024-2025 Güz');
  assert.equal(fallFiltered.length, 1);
  assert.equal(fallFiltered[0].id, 'sess-fall');

  const springFiltered = filterSessionsByAcademicTerm(
    sessions,
    '2024-2025 Bahar'
  );
  assert.equal(springFiltered.length, 1);
  assert.equal(springFiltered[0].id, 'sess-spring');

  const allFiltered = filterSessionsByAcademicTerm(
    sessions,
    ALL_ACADEMIC_TERMS
  );
  assert.equal(allFiltered.length, 2);

  const rubricsMap = { [rubric.id]: rubric };
  const comparison2024Spring = computeTermComparisonAnalytics(
    sessions,
    rubricsMap,
    '2024-2025 Bahar',
    null,
    'stu-1'
  );
  assert.equal(comparison2024Spring.currentSnapshot.averageScore, 90);
  assert.equal(comparison2024Spring.comparisonSnapshot?.term, '2024-2025 Güz');
  assert.equal(comparison2024Spring.comparisonSnapshot?.averageScore, 70);
  assert.equal(comparison2024Spring.scoreDelta, 20);
});
