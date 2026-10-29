import type { Rubric } from '../types.ts';
import { createThreeLevelScale } from './speakingEvaluationCriteria.ts';

export const LISTENING_EXAM_RUBRIC_ID = 'rub-tde-dinleme-izleme-sinavi';

const criteria = [
  'Metnin konusunu ve ana iletisini belirleme',
  'Önemli bilgileri ve ayrıntıları anlama',
  'Bağlamdan anlam çıkarma ve çıkarım yapma',
  'Metnin yapı, dil ve anlatım özelliklerini çözümleme',
  'Metni değerlendirme ve gerekçeli yorumlama',
];

export const LISTENING_EXAM_RUBRIC: Rubric = {
  id: LISTENING_EXAM_RUBRIC_ID,
  title: 'Dinleme/İzleme Sınavı',
  subject: 'Türk Dili ve Edebiyatı',
  gradeLevel: 'Genel',
  description: 'Dinlenen veya izlenen metne ilişkin cevapları anlama, çözümleme ve yorumlama bakımından değerlendirir.',
  maxLevelPoints: 2,
  createdAt: '2026-10-29',
  version: 4,
  scoringMode: 'standard_100',
  criteria: criteria.map((title, index) => ({
    id: `crit-dinleme-izleme-${index + 1}`,
    title,
    category: 'Dinleme/İzleme Sınavı',
    weight: 20,
    maxPoints: 20,
    required: true,
    levels: createThreeLevelScale(
      'Cevap yanlış, ilgisiz veya boş bırakılmıştır.',
      'Cevap doğru unsurlar içermekle birlikte eksiktir.',
      'Beklenen cevabı doğru ve yeterli biçimde vermiştir.'
    ),
  })),
};
