import type { Rubric } from '../types.ts';
import { buildSharedSpeakingCriteria } from './speakingEvaluationCriteria.ts';

export const SPEAKING_EXAM_RUBRIC_ID = 'rub-tde-bagimsiz-konusma-sinavi';

/** The six shared speaking criteria, with the same 100-point raw scale. */
export const SPEAKING_EXAM_RUBRIC: Rubric = {
  id: SPEAKING_EXAM_RUBRIC_ID,
  title: 'Konuşma Sınavı',
  subject: 'Türk Dili ve Edebiyatı',
  gradeLevel: 'Genel',
  description: 'Planlama, Türkçeyi doğru kullanma, akıcılık, ses ve telaffuz, dinleyiciyle iletişim ve süre yönetimini 100 puan üzerinden değerlendirir.',
  maxLevelPoints: 2,
  createdAt: '2026-10-29',
  version: 4,
  scoringMode: 'standard_100',
  criteria: buildSharedSpeakingCriteria({
    idPrefix: 'bagimsiz-konusma',
    startCriterionNumber: 2,
    category: 'Konuşma Sınavı',
  }),
};
