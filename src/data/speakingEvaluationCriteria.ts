import type { Rubric, RubricCriterion, RubricLevel } from '../types.ts';

export const SHARED_SPEAKING_SECTION_CATEGORY =
  'Ortak Konuşma Değerlendirmesi';

/**
 * 3 dereceli değerlendirme ölçeği (Evet = %100, Kısmen = %50, Hayır = %0) oluşturucu.
 */
export function createThreeLevelScale(
  noDescription: string,
  partialDescription: string,
  yesDescription: string
): RubricLevel[] {
  return [
    {
      level: 0,
      label: 'Hayır',
      points: 0,
      description: noDescription,
    },
    {
      level: 1,
      label: 'Kısmen',
      points: 1,
      description: partialDescription,
    },
    {
      level: 2,
      label: 'Evet',
      points: 2,
      description: yesDescription,
    },
  ];
}

export interface SpeakingCriterionTemplate {
  key: string;
  order: number;
  title: string;
  weight: number;
  maxPoints: number;
  noDescription: string;
  partialDescription: string;
  yesDescription: string;
}

/**
 * Ortak konuşma değerlendirmesi — 100 puan (6 ölçüt):
 * Hem iki kitap okuma ve sunum rubriğinde ortak kullanılır hem de ileride
 * münazara, hazırlıklı konuşma, panel ve diğer sözlü anlatım etkinliklerinde
 * yeniden kullanılabilecek modüler yapıda tasarlanmıştır.
 *
 * Not: Öğretmen isterse sunum sonunda soru sorabilir; ancak soruya verilen cevap
 * ayrı bir zorunlu konuşma ölçütü olarak tutulmaz.
 */
export const SHARED_SPEAKING_CRITERIA_TEMPLATES: readonly SpeakingCriterionTemplate[] =
  [
    {
      key: 'planlama-duzenleme',
      order: 1,
      title: 'Konuşmayı planlama, düzenleme ve konu bütünlüğü',
      weight: 20,
      maxPoints: 20,
      noDescription:
        'Konuşmada giriş, gelişme ve sonuç düzeni kurulmamış; düşünceler dağınık aktarılmış ve konu bütünlüğü sağlanamamıştır.',
      partialDescription:
        'Konuşmanın temel bölümleri bulunmakla birlikte bölümler arası geçişlerde veya konu bütünlüğünü korumada kopukluklar görülmüştür.',
      yesDescription:
        'Konuşma giriş, gelişme ve sonuç bölümleriyle tutarlı bir plan doğrultusunda düzenlenmiş; baştan sona konu bütünlüğü korunmuştur.',
    },
    {
      key: 'turkce-soz-varligi',
      order: 2,
      title: 'Türkçeyi doğru kullanma ve uygun söz varlığı',
      weight: 20,
      maxPoints: 20,
      noDescription:
        'Dil bilgisi ve anlatım kurallarına uyulmamış; söz varlığı konuyu ifade etmekte yetersiz veya bağlama uyumsuz kalmıştır.',
      partialDescription:
        'Türkçe genel olarak kurallarına uygun kullanılmış ancak sözcük seçiminde tekrarlar, daralmış söz varlığı veya bazı anlatım kusurları görülmüştür.',
      yesDescription:
        'Türkçenin dil ve anlatım kurallarına özen gösterilmiş; konuya ve bağlama uygun, zengin ve işlevsel bir söz varlığı kullanılmıştır.',
    },
    {
      key: 'acik-anlasilir-akici',
      order: 3,
      title: 'Açık, anlaşılır ve akıcı konuşma',
      weight: 20,
      maxPoints: 20,
      noDescription:
        'Anlatım sık duraksamalar, kopuk cümleler veya belirsiz ifadeler nedeniyle dinleyiciler tarafından güçlükle takip edilmiştir.',
      partialDescription:
        'Düşünceler genel olarak anlaşılır biçimde aktarılmış ancak zaman zaman akıcılığı yavaşlatan duraksamalar veya dolambaçlı ifadeler kullanılmıştır.',
      yesDescription:
        'Düşünceler açık, yalın ve anlaşılır cümlelerle; gereksiz duraksama ve tekrarlardan arınmış doğal bir akıcılıkla ifade edilmiştir.',
    },
    {
      key: 'ses-telaffuz-vurgu-tonlama',
      order: 4,
      title: 'Ses, telaffuz, vurgu ve tonlama',
      weight: 20,
      maxPoints: 20,
      noDescription:
        'Ses işitilebilir düzeyde ayarlanmamış; belirgin telaffuz yanlışları ve tekdüze ses kullanımı anlamın aktarımını zorlaştırmıştır.',
      partialDescription:
        'Ses duyulabilir düzeydedir ve telaffuz çoğunlukla doğrudur; ancak vurgu ve tonlama anlamı destekleyecek biçimde süreklilik göstermemiştir.',
      yesDescription:
        'Ses yüksekliği ortam koşullarına uygun ayarlanmış; kelimeler doğru telaffuz edilmiş ve vurgu ile tonlama anlamı güçlendirecek biçimde kullanılmıştır.',
    },
    {
      key: 'dinleyiciyle-iletisim',
      order: 5,
      title: 'Dinleyiciyle etkili iletişim',
      weight: 10,
      maxPoints: 10,
      noDescription:
        'Dinleyicilerle göz teması kurulmamış; sürekli nota/metne bağlı kalınarak veya iletişime kapalı bir duruşla konuşulmuştur.',
      partialDescription:
        'Dinleyicilerle zaman zaman göz teması kurulmuş ve doğal duruş kısmen korunmuş ancak etkileşim sunum genelinde sınırlı kalmıştır.',
      yesDescription:
        'Göz teması, doğal beden dili ve canlı hitapla dinleyicilerin ilgisi canlı tutulmuş; gerektiğinde yöneltilen sorulara yapıcı biçimde yanıt verilmiştir.',
    },
    {
      key: 'sureyi-uygun-kullanma',
      order: 6,
      title: 'Süreyi uygun kullanma',
      weight: 10,
      maxPoints: 10,
      noDescription:
        'Ayrılan süre çok aşılmış ya da konuşma hedeflenen içeriği kapsayamayacak kadar kısa sürede sonlandırılmıştır.',
      partialDescription:
        'Konuşma ayrılan süreye yakın tamamlanmış ancak bölümlere ayrılan zaman dengesiz dağılmış veya son bölüm aceleye gelmiştir.',
      yesDescription:
        'Konuşmanın giriş, gelişme ve sonuç bölümleri ayrılan süre içinde dengeli ve planlı biçimde tamamlanmıştır.',
    },
  ] as const;

export const SHARED_SPEAKING_TOTAL_POINTS = 100;

/**
 * Ortak 6 konuşma ölçütünü (toplam 100 puan) istenen kimlik öneki ve başlangıç sıra numarasıyla üretir.
 * Kitap sunumu rubriklerinde (5..10. ölçütler) ve bağımsız/karma sözlü etkinliklerde (münazara, hazırlıklı konuşma vb.)
 * ölçüt tekrarı olmadan doğrudan kullanılır.
 */
export function buildSharedSpeakingCriteria(options?: {
  idPrefix?: string;
  startCriterionNumber?: number;
  category?: string;
}): RubricCriterion[] {
  const prefix = options?.idPrefix?.trim() || 'spk';
  const startNum = options?.startCriterionNumber ?? 5;
  const category = options?.category || SHARED_SPEAKING_SECTION_CATEGORY;

  return SHARED_SPEAKING_CRITERIA_TEMPLATES.map((tpl, idx) => ({
    id: `crit-${prefix}-${startNum + idx}`,
    title: tpl.title,
    category,
    section: 'speaking',
    weight: tpl.weight,
    maxPoints: tpl.maxPoints,
    required: true,
    levels: createThreeLevelScale(
      tpl.noDescription,
      tpl.partialDescription,
      tpl.yesDescription
    ),
  }));
}

/**
 * İleride münazara, hazırlıklı konuşma veya bağımsız konuşma sınavı gibi sözlü etkinliklerde
 * doğrudan 100 puanlık bağımsız konuşma rubriği veya içerik + konuşma birleşik rubrik oluşturmak için yardımcı fabrika.
 */
export function createReusableSpeakingRubric(config?: {
  id?: string;
  title?: string;
  gradeLevel?: string;
  subject?: string;
  description?: string;
  idPrefix?: string;
  contentCriteria?: RubricCriterion[];
}): Rubric {
  const hasContent =
    Array.isArray(config?.contentCriteria) && config.contentCriteria.length > 0;
  const prefix = config?.idPrefix || 'konusma';
  const taggedContent: RubricCriterion[] = hasContent
    ? config!.contentCriteria!.map((c) => ({
        ...c,
        section: c.section ?? 'content',
      }))
    : [];
  const speakingCriteria = buildSharedSpeakingCriteria({
    idPrefix: prefix,
    startCriterionNumber: taggedContent.length + 1,
  });

  return {
    id: config?.id || 'rub-tde-ortak-konusma',
    title: config?.title || 'Hazırlıklı Konuşma ve Sözlü Anlatım Değerlendirmesi',
    subject: config?.subject || 'Türk Dili ve Edebiyatı',
    gradeLevel: config?.gradeLevel || 'Genel',
    description:
      config?.description ||
      'Planlama ve konu bütünlüğü, Türkçeyi doğru kullanma, akıcılık, ses ve telaffuz, dinleyiciyle iletişim ve süre yönetimi boyutlarını 3 dereceli (Evet %100, Kısmen %50, Hayır %0) ölçekle değerlendiren 100 puanlık ortak konuşma rubriği.',
    maxLevelPoints: 2,
    createdAt: '2026-10-27',
    version: 1,
    scoringMode: hasContent ? 'dual_book_and_speaking' : 'standard_100',
    criteria: [...taggedContent, ...speakingCriteria],
  };
}
