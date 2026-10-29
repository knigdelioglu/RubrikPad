import test from 'node:test';
import assert from 'node:assert/strict';
import { LISTENING_EXAM_RUBRIC, LISTENING_EXAM_RUBRIC_ID } from '../../data/listeningExamRubric.ts';
import { SPEAKING_EXAM_RUBRIC, SPEAKING_EXAM_RUBRIC_ID } from '../../data/speakingExamRubric.ts';
import { INITIAL_RUBRICS } from '../../data/seedData.ts';
import {
  BOOK_PRESENTATION_RUBRIC_ID,
  BOOK_PRESENTATION_RUBRIC,
  BOOK_PRESENTATION_RUBRIC_IDS,
  BOOK_PRESENTATION_RUBRICS,
  LITERARY_BOOK_PRESENTATION_RUBRIC_ID,
  LITERARY_BOOK_PRESENTATION_RUBRIC,
  INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID,
  INFORMATIVE_BOOK_PRESENTATION_RUBRIC,
  LEGACY_BOOK_PRESENTATION_RUBRIC_ID,
  LEGACY_BOOK_PRESENTATION_RUBRIC,
  LEGACY_V3_LITERARY_BOOK_RUBRIC,
  LEGACY_V3_INFORMATIVE_BOOK_RUBRIC,
  BOOK_PRESENTATION_LEVEL_PERCENTAGES,
} from '../../data/bookPresentationRubric.ts';
import {
  SHARED_SPEAKING_CRITERIA_TEMPLATES,
  buildSharedSpeakingCriteria,
  createReusableSpeakingRubric,
} from '../../data/speakingEvaluationCriteria.ts';
import {
  isScoreAssigned,
  validateRubric,
  calculateWeightedScore,
  calculateDualBookSpeakingScore,
  isDualBookSpeakingRubric,
  getCriterionSection,
  getCriterionLevelPercentage,
  getCriterionEarnedPoints,
  getStudentConsecutiveLowScoreReminder,
  getEffectiveSessionRubric,
  getStudentEvaluationBreakdown,
  getNextUnscoredCriterion,
  applyCriterionScoreToStudents,
  applyIndividualCriterionEdit,
  generateSessionCsv,
} from '../rubricLogic.ts';
import type { Classroom, EvaluationSession, Rubric } from '../../types.ts';
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

test('INITIAL_RUBRICS retains the 8 100-point 11th grade rubrics alongside the 2 all-grade book presentation rubrics', () => {
  assert.equal(INITIAL_RUBRICS.length, 12);
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

test('11th grade rubrics remain restricted while both book presentation rubrics are shared across 9, 10, 11, and 12th grade TDE', () => {
  // 11. Sınıf + Türk Dili ve Edebiyatı -> 8 local + 2 shared book rubrics = 10
  const matched11Tde = getRubricsByGradeAndSubject(
    INITIAL_RUBRICS,
    '11. Sınıf',
    'Türk Dili ve Edebiyatı'
  );
  assert.equal(matched11Tde.length, 12);
  assert.equal(
    matched11Tde.some((r) => r.id === LITERARY_BOOK_PRESENTATION_RUBRIC_ID),
    true
  );
  assert.equal(
    matched11Tde.some((r) => r.id === INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID),
    true
  );

  // 10. Sınıf + Türk Dili ve Edebiyatı -> shared book + speaking + listening rubrics
  const matched10Tde = getRubricsByGradeAndSubject(
    INITIAL_RUBRICS,
    '10. Sınıf',
    'Türk Dili ve Edebiyatı'
  );
  assert.deepEqual(
    matched10Tde.map((r) => r.id),
    [...BOOK_PRESENTATION_RUBRIC_IDS, SPEAKING_EXAM_RUBRIC_ID, LISTENING_EXAM_RUBRIC_ID]
  );

  // 9. Sınıf + Türk Dili ve Edebiyatı -> shared book + speaking + listening rubrics
  const matched9Tde = getRubricsByGradeAndSubject(
    INITIAL_RUBRICS,
    '9. Sınıf',
    'Türk Dili ve Edebiyatı'
  );
  assert.deepEqual(
    matched9Tde.map((r) => r.id),
    [...BOOK_PRESENTATION_RUBRIC_IDS, SPEAKING_EXAM_RUBRIC_ID, LISTENING_EXAM_RUBRIC_ID]
  );

  // 12. Sınıf + Türk Dili ve Edebiyatı -> shared book + speaking + listening rubrics
  const matched12Tde = getRubricsByGradeAndSubject(
    INITIAL_RUBRICS,
    '12. Sınıf',
    'Türk Dili ve Edebiyatı'
  );
  assert.deepEqual(
    matched12Tde.map((r) => r.id),
    [...BOOK_PRESENTATION_RUBRIC_IDS, SPEAKING_EXAM_RUBRIC_ID, LISTENING_EXAM_RUBRIC_ID]
  );

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

  assert.equal(getRubricsForClassrooms(INITIAL_RUBRICS, [cls11Tde]).length, 12);
  assert.deepEqual(
    getRubricsForClassrooms(INITIAL_RUBRICS, [cls10Tde]).map((r) => r.id),
    [...BOOK_PRESENTATION_RUBRIC_IDS, SPEAKING_EXAM_RUBRIC_ID, LISTENING_EXAM_RUBRIC_ID]
  );
  assert.equal(getRubricsForClassrooms(INITIAL_RUBRICS, [cls11Math]).length, 0);
  assert.deepEqual(
    getRubricsForClassrooms(INITIAL_RUBRICS, [cls11Tde, cls10Tde]).map((r) => r.id),
    [...BOOK_PRESENTATION_RUBRIC_IDS, SPEAKING_EXAM_RUBRIC_ID, LISTENING_EXAM_RUBRIC_ID]
  );
  assert.equal(getRubricsForClassrooms(INITIAL_RUBRICS, []).length, 0);
});

test('RubrikService.filterRubricsForSelection allows only its all-grade TDE exceptions', () => {
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
  assert.equal(for11Tde.length, 12);
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

test('both Edebî Eser and Bilgilendirici Kitap rubrics implement Tek Değerlendirme, İki Sonuç (4 content criteria = 70 pts + 6 shared speaking criteria = 100 pts) and support grades 9-12 TDE', () => {
  assert.equal(BOOK_PRESENTATION_RUBRICS.length, 2);

  // Reusable speaking criteria templates total 100 points across 6 criteria
  assert.equal(SHARED_SPEAKING_CRITERIA_TEMPLATES.length, 6);
  assert.equal(
    SHARED_SPEAKING_CRITERIA_TEMPLATES.reduce((s, c) => s + c.weight, 0),
    100
  );
  const reusableDebateRubric = createReusableSpeakingRubric({
    id: 'rub-test-hazirlikli-konusma',
    title: 'Hazırlıklı Konuşma Değerlendirme Rubriği',
    description: 'Ortak konuşma ölçütlerini kullanan bağımsız konuşma rubriği.',
    idPrefix: 'crit-hk-konusma',
  });
  assert.equal(reusableDebateRubric.criteria.length, 6);
  assert.equal(validateRubric(reusableDebateRubric).isValid, true);
  assert.equal(
    buildSharedSpeakingCriteria({ idPrefix: 'munazara' }).reduce(
      (s, c) => s + c.weight,
      0
    ),
    100
  );

  const literary = INITIAL_RUBRICS.find(
    (r) => r.id === LITERARY_BOOK_PRESENTATION_RUBRIC_ID
  );
  const informative = INITIAL_RUBRICS.find(
    (r) => r.id === INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID
  );
  assert.ok(literary);
  assert.ok(informative);

  assert.equal(literary.title, 'Edebî Eser Okuma ve Sunum');
  assert.equal(
    informative.title,
    'Bilgilendirici ve Düşünsel Kitap Okuma ve Sunum'
  );

  // Check exact criterion titles, weights, and sections for Literary rubric (4 content + 6 speaking = 10)
  assert.deepEqual(
    literary.criteria.map((c) => [c.title, c.weight, c.maxPoints, c.section]),
    [
      ['Eserin temel anlamını doğru ve konuya uygun aktarma', 20, 20, 'content'],
      ['Türe uygun edebî yapı, dil ve anlatımı çözümleme', 20, 20, 'content'],
      ['Yorumlama ve eleştirel değerlendirme', 20, 20, 'content'],
      ['Yorumları eserden örneklerle destekleme', 10, 10, 'content'],
      ['Konuşmayı planlama, düzenleme ve konu bütünlüğü', 20, 20, 'speaking'],
      ['Türkçeyi doğru kullanma ve uygun söz varlığı', 20, 20, 'speaking'],
      ['Açık, anlaşılır ve akıcı konuşma', 20, 20, 'speaking'],
      ['Ses, telaffuz, vurgu ve tonlama', 20, 20, 'speaking'],
      ['Dinleyiciyle etkili iletişim', 10, 10, 'speaking'],
      ['Süreyi uygun kullanma', 10, 10, 'speaking'],
    ]
  );

  // Check exact criterion titles, weights, and sections for Informative rubric (4 content + 6 speaking = 10)
  assert.deepEqual(
    informative.criteria.map((c) => [c.title, c.weight, c.maxPoints, c.section]),
    [
      ['Konuyu ve temel düşünceyi doğru ve konuya uygun aktarma', 20, 20, 'content'],
      [
        'Temel bilgileri, kavramları ve düşünceler arası ilişkileri açıklama',
        20,
        20,
        'content',
      ],
      ['Eleştirel değerlendirme ve çıkarımda bulunma', 20, 20, 'content'],
      ['Bilgileri ve yorumları kitaptan örneklerle destekleme', 10, 10, 'content'],
      ['Konuşmayı planlama, düzenleme ve konu bütünlüğü', 20, 20, 'speaking'],
      ['Türkçeyi doğru kullanma ve uygun söz varlığı', 20, 20, 'speaking'],
      ['Açık, anlaşılır ve akıcı konuşma', 20, 20, 'speaking'],
      ['Ses, telaffuz, vurgu ve tonlama', 20, 20, 'speaking'],
      ['Dinleyiciyle etkili iletişim', 10, 10, 'speaking'],
      ['Süreyi uygun kullanma', 10, 10, 'speaking'],
    ]
  );

  for (const rubric of [literary, informative]) {
    assert.equal(ALL_GRADE_TDE_RUBRIC_IDS.has(rubric.id), true);
    assert.equal(isDualBookSpeakingRubric(rubric), true);
    assert.equal(rubric.scoringMode, 'dual_weighted_book_and_speaking');
    assert.equal(rubric.gradeLevel, 'Genel');
    assert.equal(RubrikService.getEffectiveRubricGradeLevel(rubric), 'Genel');
    assert.equal(
      RubrikService.getEffectiveRubricSubject(rubric),
      'Türk Dili ve Edebiyatı'
    );
    assert.equal(validateRubric(rubric).isValid, true);
    assert.equal(rubric.maxLevelPoints, 2);
    assert.equal(rubric.criteria.length, 10);

    const contentCriteria = rubric.criteria.filter(
      (c, idx) => getCriterionSection(c, idx, rubric) === 'content'
    );
    const speakingCriteria = rubric.criteria.filter(
      (c, idx) => getCriterionSection(c, idx, rubric) === 'speaking'
    );
    assert.equal(contentCriteria.length, 4);
    assert.equal(speakingCriteria.length, 6);
    assert.equal(
      contentCriteria.reduce((s, c) => s + c.weight, 0),
      70
    );
    assert.equal(
      speakingCriteria.reduce((s, c) => s + c.weight, 0),
      100
    );
    assert.equal(
      new Set(rubric.criteria.map((c) => c.id)).size,
      rubric.criteria.length
    );

    for (const c of rubric.criteria) {
      assert.equal(c.levels.length, 3);
      assert.equal(c.levels[0].label, 'Hayır');
      assert.equal(c.levels[0].points, 0);
      assert.equal(c.levels[1].label, 'Kısmen');
      assert.equal(c.levels[1].points, 1);
      assert.equal(c.levels[2].label, 'Evet');
      assert.equal(c.levels[2].points, 2);

      // Descriptions must be non-empty, observable, and mutually distinct
      const descriptions = c.levels.map((l) => l.description.trim());
      assert.ok(descriptions.every((d) => d.length >= 25));
      assert.equal(new Set(descriptions).size, 3);

      // Must NOT require comparison, visual usage, or speaking from memory
      for (const desc of descriptions) {
        const lower = desc.toLocaleLowerCase('tr-TR');
        assert.equal(
          lower.includes('karşılaştırma'),
          false,
          `${rubric.title} - ${c.title} karşılaştırma zorunluluğu içermemeli`
        );
        assert.equal(
          lower.includes('görsel'),
          false,
          `${rubric.title} - ${c.title} görsel kullanımı zorunluluğu içermemeli`
        );
        assert.equal(
          lower.includes('ezber'),
          false,
          `${rubric.title} - ${c.title} ezberden konuşma zorunluluğu içermemeli`
        );
      }
    }

    for (const grade of ['9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf']) {
      assert.ok(
        getRubricsByGradeAndSubject(
          INITIAL_RUBRICS,
          grade,
          'Türk Dili ve Edebiyatı'
        ).some((r) => r.id === rubric.id)
      );
      assert.ok(
        getRubricsForClassrooms(INITIAL_RUBRICS, [
          {
            id: 'class-' + grade,
            name: grade,
            gradeLevel: grade,
            subject: 'Türk Dili ve Edebiyatı',
            academicYear: '2026-2027',
          },
        ]).some((r) => r.id === rubric.id)
      );
    }
    assert.equal(
      getRubricsByGradeAndSubject(INITIAL_RUBRICS, '10. Sınıf', 'Matematik').some(
        (r) => r.id === rubric.id
      ),
      false
    );
    assert.equal(
      getRubricsByGradeAndSubject(INITIAL_RUBRICS, '11. Sınıf', 'Türkçe').some(
        (r) => r.id === rubric.id
      ),
      false
    );

    // Dual Result Calculation:
    // 1. All Evet (%100 -> 2 points): Content = 70/70, Speaking = 100/100 => Book = 70 + 30 = 100, Speaking = 100
    const allEvetCalc = calculateWeightedScore(
      rubric,
      Object.fromEntries(rubric.criteria.map((c) => [c.id, 2]))
    );
    assert.equal(allEvetCalc.isComplete, true);
    assert.equal(allEvetCalc.finalScoreOutOf100, 100);
    assert.equal(allEvetCalc.dualResult?.contentScoreOutOf70, 70);
    assert.equal(allEvetCalc.dualResult?.speakingScoreOutOf100, 100);
    assert.equal(allEvetCalc.dualResult?.speakingContributionOutOf30, 30);
    assert.equal(allEvetCalc.dualResult?.finalBookPresentationScoreOutOf100, 100);
    assert.equal(allEvetCalc.dualResult?.finalSpeakingScoreOutOf100, 100);

    // 2. All Kısmen (%50 -> 1 point): Content = 35/70, Speaking = 50/100 => Book = 35 + 15 = 50, Speaking = 50
    const allKismenCalc = calculateWeightedScore(
      rubric,
      Object.fromEntries(rubric.criteria.map((c) => [c.id, 1]))
    );
    assert.equal(allKismenCalc.isComplete, true);
    assert.equal(allKismenCalc.finalScoreOutOf100, 50);
    assert.equal(allKismenCalc.dualResult?.contentScoreOutOf70, 35);
    assert.equal(allKismenCalc.dualResult?.speakingScoreOutOf100, 52);
    assert.equal(allKismenCalc.dualResult?.speakingContributionOutOf30, 15);
    assert.equal(allKismenCalc.dualResult?.finalBookPresentationScoreOutOf100, 50);
    assert.equal(allKismenCalc.dualResult?.finalSpeakingScoreOutOf100, 52);

    // 3. All Hayır (%0 -> 0 points): Complete with 0 for both results!
    const allNoResult = calculateWeightedScore(
      rubric,
      Object.fromEntries(rubric.criteria.map((c) => [c.id, 0]))
    );
    assert.equal(allNoResult.isComplete, true);
    assert.equal(allNoResult.completedCriteriaCount, 10);
    assert.equal(allNoResult.finalScoreOutOf100, 0);
    assert.equal(allNoResult.dualResult?.finalBookPresentationScoreOutOf100, 0);
    assert.equal(allNoResult.dualResult?.finalSpeakingScoreOutOf100, 0);

    // 4. Distinct Content vs Speaking performance:
    // Content: c1(20)=Evet(20), c2(20)=Kısmen(10), c3(20)=Evet(20), c4(10)=Hayır(0) => 50 / 70
    // Speaking: s1(20)=Evet(20), s2(20)=Evet(20), s3(20)=Kısmen(10), s4(20)=Evet(20), s5(10)=Evet(10), s6(10)=Hayır(0) => 80 / 100
    // Expected:
    // - Konuşma Sınavı Notu = 80 / 100
    // - Kitap Sunumu Notu = 50 + (80 * 0.30 = 24) = 74 / 100
    const mixedScores: Record<string, number | null> = {
      [rubric.criteria[0].id]: 2, // 20
      [rubric.criteria[1].id]: 1, // 10
      [rubric.criteria[2].id]: 2, // 20
      [rubric.criteria[3].id]: 0, // 0  -> Content = 50/70
      [rubric.criteria[4].id]: 2, // 20
      [rubric.criteria[5].id]: 2, // 20
      [rubric.criteria[6].id]: 1, // 10
      [rubric.criteria[7].id]: 2, // 20
      [rubric.criteria[8].id]: 2, // 10
      [rubric.criteria[9].id]: 0, // 0  -> Speaking = 80/100
    };
    const mixedResult = calculateWeightedScore(rubric, mixedScores);
    assert.equal(mixedResult.isComplete, true);
    assert.equal(mixedResult.dualResult?.contentScoreOutOf70, 50);
    assert.equal(mixedResult.dualResult?.speakingScoreOutOf100, 85);
    assert.equal(mixedResult.dualResult?.speakingContributionOutOf30, 25);
    assert.equal(mixedResult.dualResult?.finalSpeakingScoreOutOf100, 85);
    assert.equal(mixedResult.dualResult?.finalBookPresentationScoreOutOf100, 75);
    assert.equal(mixedResult.finalScoreOutOf100, 75);

    // 5. Independent completion rules:
    // (a) If all 6 speaking criteria are scored (80/100) but 1 content criterion is unscored (null):
    //     -> Konuşma Sınavı Notu IS finalized (80/100), while Kitap Sunumu Notu is NOT finalized (null)!
    const speakingCompleteContentIncomplete = {
      ...mixedScores,
      [rubric.criteria[3].id]: null,
    };
    const partialContentResult = calculateDualBookSpeakingScore(
      rubric,
      speakingCompleteContentIncomplete
    );
    assert.equal(partialContentResult.isContentComplete, false);
    assert.equal(partialContentResult.isSpeakingComplete, true);
    assert.equal(partialContentResult.isBookPresentationComplete, false);
    assert.equal(partialContentResult.finalSpeakingScoreOutOf100, 85);
    assert.equal(partialContentResult.finalBookPresentationScoreOutOf100, null);

    // (b) If all 4 content criteria are scored (50/70) but 1 speaking criterion is unscored (null):
    //     -> Neither Konuşma Sınavı Notu nor Kitap Sunumu Notu is finalized (both depend on speaking)!
    const contentCompleteSpeakingIncomplete = {
      ...mixedScores,
      [rubric.criteria[9].id]: null,
    };
    const partialSpeakingResult = calculateWeightedScore(
      rubric,
      contentCompleteSpeakingIncomplete
    );
    assert.equal(isScoreAssigned(0), true);
    assert.equal(isScoreAssigned(null), false);
    assert.equal(isScoreAssigned(undefined), false);
    assert.equal(partialSpeakingResult.isComplete, false);
    assert.equal(partialSpeakingResult.completedCriteriaCount, 9);
    assert.equal(partialSpeakingResult.finalScoreOutOf100, 75);
    assert.equal(
      partialSpeakingResult.dualResult?.isContentComplete,
      true
    );
    assert.equal(
      partialSpeakingResult.dualResult?.isSpeakingComplete,
      false
    );
    assert.equal(
      partialSpeakingResult.dualResult?.finalSpeakingScoreOutOf100,
      null
    );
    assert.equal(
      partialSpeakingResult.dualResult?.finalBookPresentationScoreOutOf100,
      75
    );
    assert.equal(
      getNextUnscoredCriterion(rubric.criteria, contentCompleteSpeakingIncomplete)?.criterion.id,
      rubric.criteria[9].id
    );
    assert.equal(
      getNextUnscoredCriterion(rubric.criteria, mixedScores),
      null
    );

    // 6. Persisting both scores separately on StudentEvaluation via applyIndividualCriterionEdit:
    let persistedEval = undefined;
    for (const [critId, val] of Object.entries(mixedScores)) {
      const editResult = applyIndividualCriterionEdit(
        rubric,
        persistedEval,
        'stu-dual-1',
        { type: 'level', criterionId: critId, points: val ?? 0 },
        '2026-10-27T12:00:00Z'
      );
      persistedEval = editResult.updatedEvaluation;
    }
    assert.ok(persistedEval);
    assert.equal(persistedEval.contentScoreOutOf70, 50);
    assert.equal(persistedEval.speakingExamScore, 85);
    assert.equal(persistedEval.bookPresentationScore, 75);

    // 7. CSV export contains separate columns for Content (70), %30 Speaking (30), Book Presentation (100), and Speaking Exam (100)
    const dualSession: EvaluationSession = {
      id: 'ses-dual-csv',
      title: 'Kitap ve Konuşma Değerlendirmesi',
      classId: 'cls-10a',
      rubricId: rubric.id,
      date: '2026-10-27',
      status: 'completed',
      mode: 'individual',
      groups: [],
      generalSessionNote: '',
      evaluations: {
        'stu-dual-1': persistedEval,
      },
    };
    const csvText = generateSessionCsv(
      dualSession,
      rubric,
      [
        {
          id: 'stu-dual-1',
          studentNumber: '109',
          fullName: 'Deniz Arslan',
          classId: 'cls-10a',
        },
      ],
      'cls-10a'
    );
    assert.equal(csvText.includes('Kitap İçeriği Puanı (70)'), true);
    assert.equal(csvText.includes('Sunum Katkısı (30)'), true);
    assert.equal(csvText.includes('Kitap Sunumu Notu (100)'), true);
    assert.equal(csvText.includes('Konuşma Sınavı Notu (100)'), true);
    assert.equal(csvText.includes('50,25,75,85'), true);

    // 8. Bulk fast evaluation ("Sadece Puanlanmamışlara Uygula") respects Hayır (0 points) as already scored:
    const bulkEvaluations = applyCriterionScoreToStudents(
      {
        'stu-hayir': {
          studentId: 'stu-hayir',
          criterionScores: { [rubric.criteria[0].id]: 0 },
          note: '',
          tags: [],
          updatedAt: '2026-10-27',
        },
        'stu-unscored': {
          studentId: 'stu-unscored',
          criterionScores: {},
          note: '',
          tags: [],
          updatedAt: '2026-10-27',
        },
      },
      ['stu-hayir', 'stu-unscored'],
      rubric.criteria[0].id,
      2,
      '2026-10-27T12:00:00Z',
      true // onlyUnscored = true
    );
    assert.equal(
      bulkEvaluations['stu-hayir'].criterionScores[rubric.criteria[0].id],
      0,
      'Hayır (0 puan) verilmiş öğrencinin puanı puansız sayılmamalı ve ezilmemeli'
    );
    assert.equal(
      bulkEvaluations['stu-unscored'].criterionScores[rubric.criteria[0].id],
      2,
      'Henüz değerlendirilmemiş öğrenciye toplu puan atanmalı'
    );
  }

  // Other 8 rubrics remain 5-level (0..4) and standard single-score
  const otherRubrics = INITIAL_RUBRICS.filter(
    (r) => !BOOK_PRESENTATION_RUBRIC_IDS.includes(r.id) && r.id !== SPEAKING_EXAM_RUBRIC_ID && r.id !== LISTENING_EXAM_RUBRIC_ID
  );
  assert.equal(otherRubrics.length, 8);
  assert.ok(
    otherRubrics.every(
      (r) =>
        !isDualBookSpeakingRubric(r) &&
        r.maxLevelPoints === 4 &&
        r.criteria.every((c) => c.levels.length === 5)
    )
  );
});

test('generateStudentPortfolioPdfBytes and generateClassroomOverviewPdfBytes produce valid %PDF-1.4 documents with Turkish Unicode text', async () => {
  const {
    generatePaginatedSessionPdfBytes,
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

  // Dual evaluation session (Content = 50/70, Speaking = 80/100 => Book = 74/100, Speaking = 80/100)
  const dualScores: Record<string, number> = {
    [LITERARY_BOOK_PRESENTATION_RUBRIC.criteria[0].id]: 2,
    [LITERARY_BOOK_PRESENTATION_RUBRIC.criteria[1].id]: 1,
    [LITERARY_BOOK_PRESENTATION_RUBRIC.criteria[2].id]: 2,
    [LITERARY_BOOK_PRESENTATION_RUBRIC.criteria[3].id]: 0,
    [LITERARY_BOOK_PRESENTATION_RUBRIC.criteria[4].id]: 2,
    [LITERARY_BOOK_PRESENTATION_RUBRIC.criteria[5].id]: 2,
    [LITERARY_BOOK_PRESENTATION_RUBRIC.criteria[6].id]: 1,
    [LITERARY_BOOK_PRESENTATION_RUBRIC.criteria[7].id]: 2,
    [LITERARY_BOOK_PRESENTATION_RUBRIC.criteria[8].id]: 2,
    [LITERARY_BOOK_PRESENTATION_RUBRIC.criteria[9].id]: 0,
  };
  const dualSession: EvaluationSession = {
    id: 'ses-dual-pdf-1',
    title: 'Edebî Eser ve Konuşma Değerlendirmesi',
    classId: 'cls-11a',
    rubricId: LITERARY_BOOK_PRESENTATION_RUBRIC.id,
    date: '2026-10-27',
    status: 'completed',
    mode: 'individual',
    groups: [],
    generalSessionNote: '',
    evaluations: {
      'stu-1': {
        studentId: 'stu-1',
        criterionScores: dualScores,
        bookPresentationScore: 74,
        speakingExamScore: 80,
        contentScoreOutOf70: 50,
        note: 'Eserden seçtiği örnekler ve diksiyonu çok başarılı.',
        tags: [],
        updatedAt: '2026-10-27',
      },
    },
  };

  const dualSessionPdfBytes = generatePaginatedSessionPdfBytes(
    dualSession,
    LITERARY_BOOK_PRESENTATION_RUBRIC,
    cls,
    [stu]
  );
  const dualSessionPdfText = decodePdfTextWithToUnicode(dualSessionPdfBytes);
  assert.equal(dualSessionPdfText.includes('Kitap(100)'), true);
  assert.equal(dualSessionPdfText.includes('Konuşma Sınavı Notu: 85/100'), true);

  const portfolioBytes = generateStudentPortfolioPdfBytes(
    stu,
    cls,
    [dualSession],
    rubricsMap
  );
  const portfolioHeader = new TextDecoder('ascii').decode(
    portfolioBytes.slice(0, 8)
  );
  assert.equal(portfolioHeader, '%PDF-1.4');
  const portfolioText = decodePdfTextWithToUnicode(portfolioBytes);
  assert.equal(
    portfolioText.includes('ÖĞRENCİ GELİŞİM VE PERFORMANS RAPORU'),
    true
  );
  assert.equal(portfolioText.includes('Çağrı Şahin Öztürk'), true);
  assert.equal(portfolioText.includes('Kitap Sunumu Notu: 75 / 100'), true);
  assert.equal(portfolioText.includes('Konuşma Sınavı Notu: 85 / 100'), true);
  assert.equal(portfolioText.includes('Türk Dili ve Edebiyatı Öğretmeni'), true);
  assert.equal(portfolioText.includes('Okul Müdürü'), true);
  assert.equal(portfolioText.includes('Veli Adı Soyadı'), false);
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

test('3-level book presentation rubric helpers, low-score reminder, and historical rubricSnapshot preservation', () => {
  assert.deepEqual(BOOK_PRESENTATION_LEVEL_PERCENTAGES, { 0: 0, 1: 50, 2: 100 });

  for (const rubric of [
    LITERARY_BOOK_PRESENTATION_RUBRIC,
    INFORMATIVE_BOOK_PRESENTATION_RUBRIC,
  ]) {
    for (const crit of rubric.criteria) {
      // Hayır = %0, Kısmen = %50, Evet = %100
      assert.equal(getCriterionLevelPercentage(crit, 0), 0);
      assert.equal(getCriterionLevelPercentage(crit, 1), 50);
      assert.equal(getCriterionLevelPercentage(crit, 2), 100);

      // Earned points out of criterion weight (10 or 5 for 20-pt and 10-pt criteria)
      assert.equal(getCriterionEarnedPoints(crit, 0), 0);
      assert.equal(getCriterionEarnedPoints(crit, 1), crit.weight * 0.5);
      assert.equal(getCriterionEarnedPoints(crit, 2), crit.weight);
    }
  }

  // Consecutive Evet (2 points = %100) must NOT trigger low-score reminder
  const rubricsById: Record<string, Rubric> = {
    [LITERARY_BOOK_PRESENTATION_RUBRIC.id]: LITERARY_BOOK_PRESENTATION_RUBRIC,
    [INFORMATIVE_BOOK_PRESENTATION_RUBRIC.id]: INFORMATIVE_BOOK_PRESENTATION_RUBRIC,
  };
  const allEvetSession: EvaluationSession = {
    id: 'ses-ks-evet',
    title: 'Edebî Eser Sunumu - Tam Puan',
    classId: 'cls-10a',
    rubricId: LITERARY_BOOK_PRESENTATION_RUBRIC.id,
    date: '2026-10-27',
    status: 'in_progress',
    mode: 'individual',
    groups: [],
    generalSessionNote: '',
    evaluations: {
      'stu-1': {
        studentId: 'stu-1',
        criterionScores: Object.fromEntries(
          LITERARY_BOOK_PRESENTATION_RUBRIC.criteria.map((c) => [c.id, 2])
        ),
        note: '',
        tags: [],
        updatedAt: '2026-10-27',
      },
    },
  };
  const evetReminder = getStudentConsecutiveLowScoreReminder(
    'stu-1',
    allEvetSession,
    [allEvetSession],
    rubricsById
  );
  assert.equal(evetReminder.shouldRemind, false);

  // 3 consecutive Kısmen (1 point = %50) SHOULD trigger low-score reminder
  const kismenStreakSession: EvaluationSession = {
    ...allEvetSession,
    id: 'ses-ks-kismen',
    evaluations: {
      'stu-1': {
        studentId: 'stu-1',
        criterionScores: {
          'crit-ees-1': 1,
          'crit-ees-2': 1,
          'crit-ees-3': 1,
          'crit-ees-4': 2,
        },
        note: '',
        tags: [],
        updatedAt: '2026-10-27',
      },
    },
  };
  const kismenReminder = getStudentConsecutiveLowScoreReminder(
    'stu-1',
    kismenStreakSession,
    [kismenStreakSession],
    rubricsById
  );
  assert.equal(kismenReminder.shouldRemind, true);
  assert.equal(kismenReminder.triggerType, 'consecutive_criteria');
  assert.equal(kismenReminder.consecutiveCount, 3);

  // 1. Historical session with frozen 5-level rubricSnapshot remains intact and keeps its exact score
  const legacy5LevelSnapshot: Rubric = {
    ...LEGACY_BOOK_PRESENTATION_RUBRIC,
    maxLevelPoints: 4,
    version: 1,
    criteria: LEGACY_BOOK_PRESENTATION_RUBRIC.criteria.map((c) => ({
      ...c,
      levels: [
        { level: 0, label: 'Gözlenmedi (0)', points: 0, description: 'Yok' },
        { level: 1, label: 'Destek Gerekli', points: 1, description: 'D1' },
        { level: 2, label: 'Gelişmekte', points: 2, description: 'D2' },
        { level: 3, label: 'Yetkin', points: 3, description: 'D3' },
        { level: 4, label: 'Örnek Düzey', points: 4, description: 'D4' },
      ],
    })),
  };
  const historical5LevelSession: EvaluationSession = {
    id: 'ses-legacy-ks-v1',
    title: 'Geçmiş Kitap Sunumu (5 Dereceli Snapshot)',
    classId: 'cls-10a',
    rubricId: LEGACY_BOOK_PRESENTATION_RUBRIC_ID,
    rubricSnapshot: legacy5LevelSnapshot,
    date: '2026-09-15',
    status: 'completed',
    mode: 'individual',
    groups: [],
    generalSessionNote: '',
    evaluations: {
      'stu-1': {
        studentId: 'stu-1',
        criterionScores: Object.fromEntries(
          legacy5LevelSnapshot.criteria.map((c) => [c.id, 3])
        ), // 3/4 = 75% => 75 points
        note: 'Geçmiş değerlendirme kaydı',
        tags: [],
        updatedAt: '2026-09-15',
      },
    },
  };

  const effectiveV1Rubric = getEffectiveSessionRubric(
    historical5LevelSession,
    rubricsById
  );
  assert.ok(effectiveV1Rubric);
  assert.equal(effectiveV1Rubric.maxLevelPoints, 4);
  assert.equal(effectiveV1Rubric.criteria.length, 8);
  const breakdownV1 = getStudentEvaluationBreakdown(
    effectiveV1Rubric,
    historical5LevelSession.evaluations['stu-1']
  );
  assert.equal(breakdownV1.effectiveCalc.finalScoreOutOf100, 75);

  // 2. Historical session referencing 'rub-tde-kitap-sunumu' WITHOUT a prior snapshot still resolves the 8-criterion legacy rubric
  const historicalV2SessionWithoutSnapshot: EvaluationSession = {
    id: 'ses-legacy-ks-v2',
    title: 'Geçmiş Kitap Sunumu (8 Ölçütlü V2)',
    classId: 'cls-10a',
    rubricId: LEGACY_BOOK_PRESENTATION_RUBRIC_ID,
    date: '2026-10-26',
    status: 'completed',
    mode: 'individual',
    groups: [],
    generalSessionNote: '',
    evaluations: {
      'stu-1': {
        studentId: 'stu-1',
        criterionScores: {
          'crit-ks-1': 2,
          'crit-ks-2': 1,
          'crit-ks-3': 1,
          'crit-ks-4': 0,
          'crit-ks-5': 2,
          'crit-ks-6': 0,
          'crit-ks-7': 1,
          'crit-ks-8': 2,
        }, // 20 + 10 + 8 + 0 + 10 + 0 + 3 + 5 = 56
        note: '8 ölçütlü eski oturum',
        tags: [],
        updatedAt: '2026-10-26',
      },
    },
  };
  const effectiveV2Rubric = getEffectiveSessionRubric(
    historicalV2SessionWithoutSnapshot,
    rubricsById
  );
  assert.ok(effectiveV2Rubric);
  assert.equal(effectiveV2Rubric.id, LEGACY_BOOK_PRESENTATION_RUBRIC_ID);
  assert.equal(effectiveV2Rubric.criteria.length, 8);
  const breakdownV2 = getStudentEvaluationBreakdown(
    effectiveV2Rubric,
    historicalV2SessionWithoutSnapshot.evaluations['stu-1']
  );
  assert.equal(breakdownV2.effectiveCalc.isComplete, true);
  assert.equal(breakdownV2.effectiveCalc.finalScoreOutOf100, 56);

  // 3. Historical V3 session (7-criterion single-score Literary or Informative book rubric) is NOT retroactively recalculated as a 10-criterion dual rubric
  const historicalV3Session: EvaluationSession = {
    id: 'ses-legacy-ees-v3',
    title: 'Geçmiş Edebî Eser Sunumu (7 Ölçütlü V3)',
    classId: 'cls-10a',
    rubricId: LITERARY_BOOK_PRESENTATION_RUBRIC_ID,
    rubricSnapshot: LEGACY_V3_LITERARY_BOOK_RUBRIC,
    date: '2026-10-26',
    status: 'completed',
    mode: 'individual',
    groups: [],
    generalSessionNote: '',
    evaluations: {
      'stu-1': {
        studentId: 'stu-1',
        criterionScores: {
          'crit-ees-1': 2, // 20
          'crit-ees-2': 1, // 10
          'crit-ees-3': 2, // 20
          'crit-ees-4': 1, // 5
          'crit-ees-5': 2, // 10
          'crit-ees-6': 0, // 0
          'crit-ees-7': 1, // 5 -> 70/100 single score
        },
        note: '7 ölçütlü V3 oturumu',
        tags: [],
        updatedAt: '2026-10-26',
      },
    },
  };
  const effectiveV3Rubric = getEffectiveSessionRubric(
    historicalV3Session,
    rubricsById
  );
  assert.ok(effectiveV3Rubric);
  assert.equal(isDualBookSpeakingRubric(effectiveV3Rubric), false);
  assert.equal(effectiveV3Rubric.criteria.length, 7);
  const breakdownV3 = getStudentEvaluationBreakdown(
    effectiveV3Rubric,
    historicalV3Session.evaluations['stu-1']
  );
  assert.equal(breakdownV3.effectiveCalc.isComplete, true);
  assert.equal(breakdownV3.effectiveCalc.finalScoreOutOf100, 70);
  assert.equal(breakdownV3.effectiveCalc.dualResult, undefined);
  assert.equal(LEGACY_V3_INFORMATIVE_BOOK_RUBRIC.criteria.length, 7);
});

test('multi-class evaluation sessions isolate students and groups per classroom in both individual and group evaluation modes', async () => {
  const {
    getSessionClassIds,
    resolveActiveSessionClassId,
    getSessionStudentsForClassroom,
    groupSessionStudentsByClassroom,
    createInitialSessionGroups,
    getSessionGroupsForClassroom,
    replaceClassroomGroupsInSession,
    generateBalancedRandomGroups,
    redistributeGroupsSafely,
    toggleGroupMemberAndReconcile,
    transferAllCompletedGroupsToMembers,
  } = await import('../rubricLogic.ts');

  const classrooms: Classroom[] = [
    {
      id: 'cls-11a',
      name: '11-A',
      gradeLevel: '11. Sınıf',
      subject: 'Türk Dili ve Edebiyatı',
      academicYear: '2026-2027',
    },
    {
      id: 'cls-11b',
      name: '11-B',
      gradeLevel: '11. Sınıf',
      subject: 'Türk Dili ve Edebiyatı',
      academicYear: '2026-2027',
    },
  ];

  const students = [
    { id: 'stu-11a-1', studentNumber: '101', fullName: 'Ahmet Yılmaz', classId: 'cls-11a' },
    { id: 'stu-11a-2', studentNumber: '105', fullName: 'Zeynep Kaya', classId: 'cls-11a' },
    { id: 'stu-11a-3', studentNumber: '108', fullName: 'Burak Demir', classId: 'cls-11a' },
    { id: 'stu-11b-1', studentNumber: '102', fullName: 'Elif Çelik', classId: 'cls-11b' },
    { id: 'stu-11b-2', studentNumber: '103', fullName: 'Canan Aydın', classId: 'cls-11b' },
    { id: 'stu-11b-3', studentNumber: '109', fullName: 'Mert Şahin', classId: 'cls-11b' },
  ];

  const initialGroups = createInitialSessionGroups(['cls-11a', 'cls-11b']);
  assert.equal(initialGroups.length, 2);
  assert.equal(initialGroups[0].classId, 'cls-11a');
  assert.equal(initialGroups[1].classId, 'cls-11b');

  const multiClassSession: EvaluationSession = {
    id: 'ses-multi-11ab',
    title: '11-A ve 11-B Ortak Kitap Sunumu',
    classId: 'cls-11a',
    classIds: ['cls-11a', 'cls-11b'],
    rubricId: BOOK_PRESENTATION_RUBRIC.id,
    date: '2026-10-26',
    status: 'in_progress',
    mode: 'individual',
    groups: initialGroups,
    generalSessionNote: '',
    evaluations: {},
  };

  assert.deepEqual(getSessionClassIds(multiClassSession), ['cls-11a', 'cls-11b']);
  assert.equal(resolveActiveSessionClassId(multiClassSession, 'cls-11b'), 'cls-11b');
  assert.equal(resolveActiveSessionClassId(multiClassSession, 'cls-invalid'), 'cls-11a');

  // 1. Individual mode: students are strictly scoped to the selected classroom (never interleaved)
  const students11A = getSessionStudentsForClassroom(students, multiClassSession, 'cls-11a');
  const students11B = getSessionStudentsForClassroom(students, multiClassSession, 'cls-11b');

  assert.deepEqual(students11A.map((s) => s.id), ['stu-11a-1', 'stu-11a-2', 'stu-11a-3']);
  assert.deepEqual(students11B.map((s) => s.id), ['stu-11b-1', 'stu-11b-2', 'stu-11b-3']);

  const grouped = groupSessionStudentsByClassroom(students, classrooms, multiClassSession);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].classId, 'cls-11a');
  assert.equal(grouped[1].classId, 'cls-11b');

  // 2. Group mode: random group generation never mixes students from 11-A and 11-B
  const mixedInputGroups = generateBalancedRandomGroups(students, {
    targetGroupSize: 2,
    seed: 42,
  });
  for (const grp of mixedInputGroups) {
    const memberClasses = new Set(
      grp.studentIds.map((sid) => students.find((s) => s.id === sid)?.classId)
    );
    assert.equal(
      memberClasses.size,
      1,
      `Grup (${grp.name}) farklı sınıflardan öğrenci içermemeli`
    );
  }

  // 3. Redistributing groups for 11-A only updates 11-A groups while preserving 11-B groups intact
  const redistr11A = redistributeGroupsSafely(initialGroups, students11A, {
    targetGroupSize: 2,
    preserveEvaluatedGroups: true,
    allowOverwriteEvaluated: false,
    classId: 'cls-11a',
  });
  assert.equal(redistr11A.blocked, false);
  assert.ok(redistr11A.groups.every((g) => g.classId === 'cls-11a'));

  const mergedGroups = replaceClassroomGroupsInSession(
    multiClassSession.groups,
    redistr11A.groups,
    students,
    'cls-11a',
    multiClassSession.classId
  );

  const groupsFor11A = getSessionGroupsForClassroom(
    mergedGroups,
    students,
    'cls-11a',
    multiClassSession.classId
  );
  const groupsFor11B = getSessionGroupsForClassroom(
    mergedGroups,
    students,
    'cls-11b',
    multiClassSession.classId
  );

  assert.equal(groupsFor11A.length, redistr11A.groups.length);
  assert.equal(groupsFor11B.length, 1);
  assert.equal(groupsFor11B[0].id, initialGroups[1].id);

  // 4. Cross-classroom membership guard: a student from 11-B cannot be added to an 11-A group
  const sessionWithMergedGroups: EvaluationSession = {
    ...multiClassSession,
    groups: mergedGroups,
  };
  const target11AGroupId = groupsFor11A[0].id;
  const afterCrossClassAttempt = toggleGroupMemberAndReconcile(
    sessionWithMergedGroups,
    target11AGroupId,
    'stu-11b-1',
    '2026-10-26T10:00:00.000Z',
    BOOK_PRESENTATION_RUBRIC,
    students
  );
  const target11AGroupAfter = afterCrossClassAttempt.groups.find(
    (g) => g.id === target11AGroupId
  );
  assert.equal(target11AGroupAfter?.studentIds.includes('stu-11b-1'), false);

  // 5. Scoped transfer: transferAllCompletedGroupsToMembers with classId only transfers that classroom's groups
  const fullScores = Object.fromEntries(
    BOOK_PRESENTATION_RUBRIC.criteria.map((c) => [c.id, 2])
  );
  const sessionWithScoredGroupsBothClasses: EvaluationSession = {
    ...multiClassSession,
    groups: [
      {
        id: 'grp-11a-scored',
        name: '11-A Grup 1',
        classId: 'cls-11a',
        studentIds: ['stu-11a-1', 'stu-11a-2'],
        criterionScores: fullScores,
        groupNote: '11-A grup notu',
      },
      {
        id: 'grp-11b-scored',
        name: '11-B Grup 1',
        classId: 'cls-11b',
        studentIds: ['stu-11b-1', 'stu-11b-2'],
        criterionScores: fullScores,
        groupNote: '11-B grup notu',
      },
    ],
  };

  const transfer11AResult = transferAllCompletedGroupsToMembers(
    sessionWithScoredGroupsBothClasses,
    BOOK_PRESENTATION_RUBRIC,
    '2026-10-26T11:00:00.000Z',
    'cls-11a',
    students
  );
  assert.equal(transfer11AResult.transferredGroupCount, 1);
  assert.equal(transfer11AResult.transferredStudentCount, 2);
  assert.ok(transfer11AResult.updatedSession.evaluations['stu-11a-1']);
  assert.equal(transfer11AResult.updatedSession.evaluations['stu-11b-1'], undefined);
});



test('independent exam uses exactly the six common speaking criteria and their original points', () => {
  const dual = INFORMATIVE_BOOK_PRESENTATION_RUBRIC;
  const speaking = SPEAKING_EXAM_RUBRIC;
  assert.equal(speaking.scoringMode, 'standard_100');
  assert.equal(validateRubric(speaking).isValid, true);
  assert.deepEqual(speaking.criteria.map(c => c.maxPoints), [20, 20, 20, 20, 10, 10]);
  assert.deepEqual(speaking.criteria.map(c => [c.title, c.maxPoints, c.levels]), dual.criteria.slice(4).map(c => [c.title, c.maxPoints, c.levels]));
  for (const grade of ['9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf']) {
    assert.ok(getRubricsByGradeAndSubject(INITIAL_RUBRICS, grade, 'Türk Dili ve Edebiyatı').some(r => r.id === speaking.id));
  }
  assert.ok(!getRubricsByGradeAndSubject(INITIAL_RUBRICS, '11. Sınıf', 'Matematik').some(r => r.id === speaking.id));
  for (const [level, expected] of [[0, 0], [1, 50], [2, 100]] as const) {
    const scores = Object.fromEntries(speaking.criteria.map(c => [c.id, level]));
    assert.equal(calculateWeightedScore(speaking, scores).finalScoreOutOf100, expected);
  }
  const mixed = [1, 2, 2, 1, 1, 2];
  assert.equal(calculateWeightedScore(speaking, Object.fromEntries(speaking.criteria.map((c, i) => [c.id, mixed[i]]))).finalScoreOutOf100, 75);
  const partial = calculateWeightedScore(speaking, { [speaking.criteria[0].id]: 2 });
  assert.equal(partial.finalScoreOutOf100, null);
  assert.equal(partial.dualResult, undefined);
});

test('listening exam rubric has five 20-point criteria and is available across 9-12 TDE grades as a general rubric', () => {
  const rubric = LISTENING_EXAM_RUBRIC;
  assert.equal(rubric.scoringMode, 'standard_100');
  assert.equal(rubric.gradeLevel, 'Genel');
  assert.equal(validateRubric(rubric).isValid, true);
  assert.deepEqual(rubric.criteria.map(c => c.title), [
    'Metnin konusunu ve ana iletisini belirleme',
    'Önemli bilgileri ve ayrıntıları anlama',
    'Bağlamdan anlam çıkarma ve çıkarım yapma',
    'Metnin yapı, dil ve anlatım özelliklerini çözümleme',
    'Metni değerlendirme ve gerekçeli yorumlama',
  ]);
  assert.deepEqual(rubric.criteria.map(c => c.maxPoints), [20, 20, 20, 20, 20]);
  for (const [level, expected] of [[0, 0], [1, 50], [2, 100]] as const) {
    const result = calculateWeightedScore(rubric, Object.fromEntries(rubric.criteria.map(c => [c.id, level])));
    assert.equal(result.finalScoreOutOf100, expected);
  }
  const mixed = [2, 1, 0, 2, 1];
  const result = calculateWeightedScore(rubric, Object.fromEntries(rubric.criteria.map((c, i) => [c.id, mixed[i]])));
  assert.equal(result.finalScoreOutOf100, 60);
  assert.equal(calculateWeightedScore(rubric, { [rubric.criteria[0].id]: 0 }).finalScoreOutOf100, null);
  for (const grade of ['9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf']) {
    assert.ok(getRubricsByGradeAndSubject(INITIAL_RUBRICS, grade, 'Türk Dili ve Edebiyatı').some(r => r.id === rubric.id));
  }
  assert.ok(!getRubricsByGradeAndSubject(INITIAL_RUBRICS, '11. Sınıf', 'Matematik').some(r => r.id === rubric.id));
});

test('listening exam scores appear correctly in CSV and PDF reports', async () => {
  const { generatePaginatedSessionPdfBytes, decodePdfTextWithToUnicode } = await import('../pdfGenerator.ts');
  const rubric = LISTENING_EXAM_RUBRIC;
  const classroom: Classroom = { id: 'class', name: 'A', gradeLevel: '11. Sınıf', subject: 'Türk Dili ve Edebiyatı', academicYear: '2026-2027' };
  const student = { id: 'student', classId: 'class', studentNumber: '123', fullName: 'Örnek Öğrenci' };
  const levels = [2, 1, 0, 2, 1];
  const session: EvaluationSession = { id: 'session', title: 'Dinleme Sınavı', classId: 'class', rubricId: rubric.id, rubricSnapshot: rubric, date: '2026-10-29', status: 'completed', mode: 'individual', groups: [], generalSessionNote: '', evaluations: { student: { studentId: 'student', criterionScores: Object.fromEntries(rubric.criteria.map((c, i) => [c.id, levels[i]])), note: '', tags: [], updatedAt: '2026-10-29' } } };
  const csv = generateSessionCsv(session, rubric, [student], classroom.id);
  assert.ok(csv.includes('20,10,0,20,10'));
  const pdf = decodePdfTextWithToUnicode(generatePaginatedSessionPdfBytes(session, rubric, classroom, [student]));
  assert.match(pdf, /123\s+Örnek Öğrenci[^\n]*K1:20[^\n]*K2:10[^\n]*K3:0[^\n]*K4:20[^\n]*K5:10[^\n]*60/);
});
