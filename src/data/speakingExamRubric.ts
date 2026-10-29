import type { Rubric } from '../types.ts';
import { buildSharedSpeakingCriteria, createThreeLevelScale } from './speakingEvaluationCriteria.ts';

export const SPEAKING_EXAM_RUBRIC_ID = 'rub-tde-bagimsiz-konusma-sinavi';

/** The same seven criteria and weights as the book-and-speaking exam, independently scored. */
export const SPEAKING_EXAM_RUBRIC: Rubric = {
  id: SPEAKING_EXAM_RUBRIC_ID,
  title: 'Konuşma Sınavı',
  subject: 'Türk Dili ve Edebiyatı',
  gradeLevel: 'Genel',
  description: 'Konuyu ve temel düşünceyi aktarma, planlama, Türkçe kullanımı, akıcılık, ses ve telaffuz, dinleyiciyle iletişim ve süre yönetimini 100 puan üzerinden değerlendirir.',
  maxLevelPoints: 2,
  createdAt: '2026-10-29',
  version: 1,
  scoringMode: 'standard_100',
  criteria: [
    {
      id: 'crit-bagimsiz-konusma-1',
      title: 'Konuyu ve temel düşünceyi doğru ve konuya uygun aktarma',
      category: 'Konuşma Sınavı',
      section: 'speaking',
      weight: 10,
      maxPoints: 10,
      required: true,
      levels: createThreeLevelScale(
        'Konuşmada konu veya temel düşünce doğru ve konuya uygun biçimde aktarılmamıştır.',
        'Konuşmada konu ve temel düşünce kısmen doğru veya eksik aktarılmıştır.',
        'Konuşmada konu ve temel düşünce doğru, açık ve konuya uygun biçimde aktarılmıştır.'
      ),
    },
    ...buildSharedSpeakingCriteria({ idPrefix: 'bagimsiz-konusma', startCriterionNumber: 2, category: 'Konuşma Sınavı' })
      .map((criterion, index) => ({ ...criterion, weight: [15, 20, 20, 15, 15, 5][index], maxPoints: [15, 20, 20, 15, 15, 5][index] })),
  ],
};
