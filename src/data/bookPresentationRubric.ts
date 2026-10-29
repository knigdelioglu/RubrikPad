import type { Rubric, RubricCriterion, RubricLevel } from '../types.ts';
import {
  SHARED_SPEAKING_CRITERIA_TEMPLATES,
  SHARED_SPEAKING_SECTION_CATEGORY,
  SHARED_SPEAKING_TOTAL_POINTS,
  buildSharedSpeakingCriteria,
  createReusableSpeakingRubric,
  createThreeLevelScale,
} from './speakingEvaluationCriteria.ts';

export {
  SHARED_SPEAKING_CRITERIA_TEMPLATES,
  SHARED_SPEAKING_SECTION_CATEGORY,
  SHARED_SPEAKING_TOTAL_POINTS,
  buildSharedSpeakingCriteria,
  createReusableSpeakingRubric,
  createThreeLevelScale,
};

export const LITERARY_BOOK_PRESENTATION_RUBRIC_ID = 'rub-tde-edebi-eser-sunumu';
export const INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID =
  'rub-tde-bilgilendirici-kitap-sunumu';
export const LEGACY_BOOK_PRESENTATION_RUBRIC_ID = 'rub-tde-kitap-sunumu';

/**
 * Varsayılan kitap sunumu rubrik kimliği (Edebî Eser Okuma ve Sunum).
 */
export const BOOK_PRESENTATION_RUBRIC_ID = LITERARY_BOOK_PRESENTATION_RUBRIC_ID;

export const BOOK_PRESENTATION_RUBRIC_IDS: readonly string[] = [
  LITERARY_BOOK_PRESENTATION_RUBRIC_ID,
  INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID,
] as const;

/**
 * 3 dereceli değerlendirme ölçeğine (Evet – Kısmen – Hayır)
 * uygun puan karşılıkları: Evet = %100, Kısmen = %50, Hayır = %0.
 */
export const BOOK_PRESENTATION_LEVEL_PERCENTAGES: Record<number, number> = {
  0: 0,
  1: 50,
  2: 100,
};

function levels(no: string, partial: string, yes: string): RubricLevel[] {
  return createThreeLevelScale(no, partial, yes);
}

/**
 * Edebî Eser Okuma ve Sunum — 1. Kitap İçeriği Ölçütleri (70 Puan: 20 + 20 + 20 + 10)
 */
const LITERARY_CONTENT_CRITERIA: RubricCriterion[] = [
  {
    id: 'crit-ees-1',
    title: 'Eserin temel anlamını doğru ve konuya uygun aktarma',
    category: '1. Kitap İçeriği (70 Puan)',
    section: 'content',
    weight: 20,
    maxPoints: 20,
    required: true,
    levels: levels(
      'Konuşmada eserin konusu veya temel anlamı doğru ve konuya uygun biçimde aktarılmamıştır.',
      'Konuşmada eserin konusu ve temel anlamı kısmen doğru veya eksik aktarılmıştır.',
      'Konuşmada eserin konusu ve temel anlamı doğru, açık ve konuya uygun biçimde aktarılmıştır.'
    ),
  },
  {
    id: 'crit-ees-2',
    title: 'Türe uygun edebî yapı, dil ve anlatımı çözümleme',
    category: '1. Kitap İçeriği (70 Puan)',
    section: 'content',
    weight: 20,
    maxPoints: 20,
    required: true,
    levels: levels(
      'Eserin türüne özgü yapı unsurlarına (anlatma/göstermeye dayalı türlerde kurgu, kişiler, çatışma, zaman-mekân; şiirde söyleyici, ahenk ve imge düzeni vb.) veya dil ve anlatım özelliklerine değinilmemiştir.',
      'Eserin türüne özgü bazı yapı veya dil ve anlatım özellikleri sıralanmış ancak bunların eserin anlamıyla ilişkisi kısmen kurulmuştur.',
      'Eserin türüne özgü yapı unsurları (kurgu, kişiler/söyleyici, çatışma, ahenk, imge veya sahneleme özellikleri) ile dil ve üslup özellikleri anlamla ilişkilendirilerek çözümlenmiştir.'
    ),
  },
  {
    id: 'crit-ees-3',
    title: 'Yorumlama ve eleştirel değerlendirme',
    category: '1. Kitap İçeriği (70 Puan)',
    section: 'content',
    weight: 20,
    maxPoints: 20,
    required: true,
    levels: levels(
      'Eserin edebî değeri, bakış açısı veya etkisine ilişkin gerekçeli bir yorum ya da eleştirel değerlendirme paylaşılmamıştır.',
      'Eserle ilgili kişisel beğeni veya değerlendirmeler dile getirilmiş ancak gerekçeleri yüzeysel ya da tek yönlü kalmıştır.',
      'Eserin iletisi, sanatsal yönü, bakış açısı ve okur üzerindeki etkisi tutarlı ve gerekçeli bir bakışla değerlendirilmiştir.'
    ),
  },
  {
    id: 'crit-ees-4',
    title: 'Yorumları eserden örneklerle destekleme',
    category: '1. Kitap İçeriği (70 Puan)',
    section: 'content',
    weight: 10,
    maxPoints: 10,
    required: true,
    levels: levels(
      'Yapılan açıklamalar ve yorumlar eserden herhangi bir bölüm, dize, replik, durum veya somut örnekle desteklenmemiştir.',
      'Eserden sınırlı sayıda örnek veya gönderme paylaşılmış ancak bunların yapılan yorumlarla bağı kısmen kurulmuştur.',
      'Açıklama ve yorumlar eserin türüne uygun somut örnekler, bölümler, dizeler, replikler veya metinsel göndermelerle yerinde desteklenmiştir.'
    ),
  },
];

/**
 * Bilgilendirici ve Düşünsel Kitap Okuma ve Sunum — 1. Kitap İçeriği Ölçütleri (70 Puan: 20 + 20 + 20 + 10)
 */
const INFORMATIVE_CONTENT_CRITERIA: RubricCriterion[] = [
  {
    id: 'crit-bks-1',
    title: 'Konuyu ve temel düşünceyi doğru ve konuya uygun aktarma',
    category: '1. Kitap İçeriği (70 Puan)',
    section: 'content',
    weight: 20,
    maxPoints: 20,
    required: true,
    levels: levels(
      'Konuşmada kitabın konusu veya temel düşüncesi doğru ve konuya uygun biçimde aktarılmamıştır.',
      'Konuşmada kitabın konusu ve temel düşüncesi kısmen doğru veya eksik aktarılmıştır.',
      'Konuşmada kitabın konusu ve temel düşüncesi doğru, açık ve konuya uygun biçimde aktarılmıştır.'
    ),
  },
  {
    id: 'crit-bks-2',
    title: 'Temel bilgileri, kavramları ve düşünceler arası ilişkileri açıklama',
    category: '1. Kitap İçeriği (70 Puan)',
    section: 'content',
    weight: 20,
    maxPoints: 20,
    required: true,
    levels: levels(
      'Kitaptaki temel kavramlar, bilgiler veya yardımcı düşünceler açıklanmamış; düşünceler arası bağlar kurulmamıştır.',
      'Kitaptaki bazı bilgi ve kavramlar sıralanmış ancak bunların ana düşünceyle ve birbirleriyle ilişkisi kısmen açıklanmıştır.',
      'Kitaptaki temel bilgiler, anahtar kavramlar ve yardımcı düşünceler; neden-sonuç ve gerekçe-sonuç ilişkileriyle tutarlı biçimde açıklanmıştır.'
    ),
  },
  {
    id: 'crit-bks-3',
    title: 'Eleştirel değerlendirme ve çıkarımda bulunma',
    category: '1. Kitap İçeriği (70 Puan)',
    section: 'content',
    weight: 20,
    maxPoints: 20,
    required: true,
    levels: levels(
      'Yazarın yaklaşımı, sunduğu bilgilerin tutarlılığı veya kitabın katkısına ilişkin eleştirel bir değerlendirme ya da çıkarım paylaşılmamıştır.',
      'Kitap hakkında genel görüşler belirtilmiş ancak argümanların gücü ve olası çıkarımlar yüzeysel değerlendirilmiştir.',
      'Yazarın bakış açısı, dayanaklarının gücü ve kitabın düşünce/bilgi alanına katkısı sorgulanarak özgün ve gerekçeli çıkarımlarda bulunulmuştur.'
    ),
  },
  {
    id: 'crit-bks-4',
    title: 'Bilgileri ve yorumları kitaptan örneklerle destekleme',
    category: '1. Kitap İçeriği (70 Puan)',
    section: 'content',
    weight: 10,
    maxPoints: 10,
    required: true,
    levels: levels(
      'Aktarılan bilgiler ve değerlendirmeler kitaptan herhangi bir veri, olgu, argüman, tespit veya somut örnekle desteklenmemiştir.',
      'Kitaptan sınırlı sayıda örnek veya tespit paylaşılmış ancak bunların yapılan değerlendirmelerle ilişkisi kısmen kurulmuştur.',
      'Aktarılan bilgiler ve eleştirel yorumlar kitaptaki somut örnekler, olgular, veriler veya temel tespitlerle yerinde desteklenmiştir.'
    ),
  },
];

/**
 * 1. Edebî Eser Okuma ve Sunum Rubriği (Tek Değerlendirme, İki Sonuç — v4)
 * - 1. Kitap İçeriği: 4 ölçüt, 70 puan
 * - 2. Ortak konuşma: 6 ölçüt, ham ölçek toplamı 100 puan
 * - Kitap Sunumu Notu (100 üzerinden): İçerik Puanı (70) + altı sunum ölçütü (her biri 5, toplam 30)
 * - Konuşma Sınavı Notu (100 üzerinden): K1 (10) ve altı konuşma ölçütü (15, 20, 20, 15, 15, 5)
 * 9, 10, 11 ve 12. sınıflarda Türk Dili ve Edebiyatı dersi için erişilebilirdir.
 */
export const LITERARY_BOOK_PRESENTATION_RUBRIC: Rubric = {
  id: LITERARY_BOOK_PRESENTATION_RUBRIC_ID,
  title: 'Edebî Eser Okuma ve Sunum',
  subject: 'Türk Dili ve Edebiyatı',
  gradeLevel: 'Genel',
  description:
    'Roman, hikâye, şiir, tiyatro ve diğer edebî türlerdeki eserlerin sunumunu “Tek Değerlendirme, İki Sonuç” sistemiyle değerlendirir: 4 içerik ölçütü (70 puan) ve 6 ortak konuşma ölçütü (100 puan) tek seferde puanlanarak hem Kitap Sunumu Notu (İçerik 70 + Sunum 30 = 100) hem de Konuşma Sınavı Notu (K1 10 + konuşma 90 = 100) ayrı ayrı hesaplanır.',
  maxLevelPoints: 2,
  createdAt: '2026-10-27',
  version: 6,
  scoringMode: 'dual_weighted_book_and_speaking',
  criteria: [
    ...LITERARY_CONTENT_CRITERIA,
    ...buildSharedSpeakingCriteria({
      idPrefix: 'ees',
      startCriterionNumber: 5,
      category: '2. Ortak Konuşma Değerlendirmesi (100 Puan)',
    }),
  ],
};

/**
 * 2. Bilgilendirici ve Düşünsel Kitap Okuma ve Sunum Rubriği (Tek Değerlendirme, İki Sonuç — v4)
 * - 1. Kitap İçeriği: 4 ölçüt, 70 puan
 * - 2. Ortak konuşma: 6 ölçüt, ham ölçek toplamı 100 puan
 * - Kitap Sunumu Notu (100 üzerinden): İçerik Puanı (70) + altı sunum ölçütü (her biri 5, toplam 30)
 * - Konuşma Sınavı Notu (100 üzerinden): K1 (10) ve altı konuşma ölçütü (15, 20, 20, 15, 15, 5)
 * 9, 10, 11 ve 12. sınıflarda Türk Dili ve Edebiyatı dersi için erişilebilirdir.
 */
export const INFORMATIVE_BOOK_PRESENTATION_RUBRIC: Rubric = {
  id: INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID,
  title: 'Bilgilendirici ve Düşünsel Kitap Okuma ve Sunum',
  subject: 'Türk Dili ve Edebiyatı',
  gradeLevel: 'Genel',
  description:
    'Tarih, bilim, felsefe, araştırma ve düşünce kitaplarının sunumunu “Tek Değerlendirme, İki Sonuç” sistemiyle değerlendirir: 4 içerik ölçütü (70 puan) ve 6 ortak konuşma ölçütü (100 puan) tek seferde puanlanarak hem Kitap Sunumu Notu (İçerik 70 + Sunum 30 = 100) hem de Konuşma Sınavı Notu (K1 10 + konuşma 90 = 100) ayrı ayrı hesaplanır.',
  maxLevelPoints: 2,
  createdAt: '2026-10-27',
  version: 6,
  scoringMode: 'dual_weighted_book_and_speaking',
  criteria: [
    ...INFORMATIVE_CONTENT_CRITERIA,
    ...buildSharedSpeakingCriteria({
      idPrefix: 'bks',
      startCriterionNumber: 5,
      category: '2. Ortak Konuşma Değerlendirmesi (100 Puan)',
    }),
  ],
};

export const BOOK_PRESENTATION_RUBRICS: readonly Rubric[] = [
  LITERARY_BOOK_PRESENTATION_RUBRIC,
  INFORMATIVE_BOOK_PRESENTATION_RUBRIC,
] as const;

export const BOOK_PRESENTATION_RUBRIC: Rubric = LITERARY_BOOK_PRESENTATION_RUBRIC;

/**
 * Önceki sürüm (v3 — 7 ölçütlü tek sonuçlu) kitap rubrikleriyle oluşturulmuş geçmiş oturumların
 * geriye dönük yeniden hesaplanmaması için korunan dondurulmuş v3 rubrik tanımları.
 */
function createLegacyV3PresentationCriteria(prefix: 'ees' | 'bks'): RubricCriterion[] {
  return [
    {
      id: `crit-${prefix}-5`,
      title: 'Türkçeyi doğru, açık ve akıcı kullanma',
      category: 'Sözlü Anlatım ve Sunum',
      weight: 10,
      maxPoints: 10,
      required: true,
      levels: levels(
        'Anlatım kopuk ilerlemiş; sözcük seçimi, telaffuz ve cümle kurgusu anlaşılırlığı güçleştirecek düzeyde sorunlu olmuştur.',
        'Anlatım genel olarak anlaşılır olmakla birlikte sık tekrarlar, anlatım kusurları veya akıcılığı azaltan duraksamalar görülmüştür.',
        'Konuya uygun söz varlığıyla Türkçenin kurallarına uygun, açık, anlaşılır ve akıcı bir anlatım sergilenmiştir.'
      ),
    },
    {
      id: `crit-${prefix}-6`,
      title: 'Ses kullanımı ve dinleyiciyle iletişim',
      category: 'Sözlü Anlatım ve Sunum',
      weight: 10,
      maxPoints: 10,
      required: true,
      levels: levels(
        'Ses dinleyicilerin duyabileceği açıklıkta kullanılmamış; tekdüze anlatım nedeniyle dinleyiciyle iletişim kurulamamıştır.',
        'Ses duyulabilir düzeydedir ancak vurgu, tonlama ve göz teması sunum boyunca kısmen korunabilmiştir.',
        'Ses tonu, vurgu ve tonlama anlamı destekleyecek biçimde ayarlanmış; göz teması ve doğal duruşla dinleyiciyle canlı bir iletişim kurulmuştur.'
      ),
    },
    {
      id: `crit-${prefix}-7`,
      title: 'Sunumu düzenleme ve süreyi yönetme',
      category: 'Sözlü Anlatım ve Sunum',
      weight: 10,
      maxPoints: 10,
      required: true,
      levels: levels(
        'Sunumda giriş, gelişme ve sonuç düzeni belirsiz kalmış; süre çok aşılmış ya da sunum tamamlanamamıştır.',
        'Sunumun temel bölümleri bulunmakla birlikte geçişlerde veya bölümlere ayrılan sürede dengesizlikler yaşanmıştır.',
        'Sunum giriş, gelişme ve sonuç bütünlüğü içinde tutarlı bir sırayla yürütülmüş ve ayrılan sürede dengeli biçimde tamamlanmıştır.'
      ),
    },
  ];
}

export const LEGACY_V3_LITERARY_BOOK_RUBRIC: Rubric = {
  id: LITERARY_BOOK_PRESENTATION_RUBRIC_ID,
  title: 'Edebî Eser Okuma ve Sunum',
  subject: 'Türk Dili ve Edebiyatı',
  gradeLevel: 'Genel',
  description:
    'Roman, hikâye, şiir, tiyatro ve diğer edebî türlerdeki eserlerin okuma ve sunum süreçlerini 7 ölçütle 100 puan üzerinden değerlendiren önceki sürüm (v3) rubrik.',
  maxLevelPoints: 2,
  createdAt: '2026-10-27',
  version: 3,
  scoringMode: 'standard_100',
  criteria: [
    ...LITERARY_CONTENT_CRITERIA.map((c) => ({
      ...c,
      category:
        c.id === 'crit-ees-1' || c.id === 'crit-ees-2'
          ? 'Eseri Anlama ve Çözümleme'
          : 'Yorumlama ve Kanıtlama',
      section: undefined,
    })),
    ...createLegacyV3PresentationCriteria('ees'),
  ],
};

export const LEGACY_V3_INFORMATIVE_BOOK_RUBRIC: Rubric = {
  id: INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID,
  title: 'Bilgilendirici ve Düşünsel Kitap Okuma ve Sunum',
  subject: 'Türk Dili ve Edebiyatı',
  gradeLevel: 'Genel',
  description:
    'Tarih, bilim, felsefe, araştırma ve düşünce kitaplarının okuma ve sunum süreçlerini 7 ölçütle 100 puan üzerinden değerlendiren önceki sürüm (v3) rubrik.',
  maxLevelPoints: 2,
  createdAt: '2026-10-27',
  version: 3,
  scoringMode: 'standard_100',
  criteria: [
    ...INFORMATIVE_CONTENT_CRITERIA.map((c) => ({
      ...c,
      category:
        c.id === 'crit-bks-1' || c.id === 'crit-bks-2'
          ? 'İçeriği ve Düşünce Yapısını Kavrama'
          : 'Eleştirel Değerlendirme ve Kanıtlama',
      section: undefined,
    })),
    ...createLegacyV3PresentationCriteria('bks'),
  ],
};

/**
 * Geçmiş değerlendirme oturumlarının (`rub-tde-kitap-sunumu` kimlikli 8 ölçütlü sürüm)
 * puanlarını ve rubrik yapısını değiştirmeden korumak için saklanan eski rubrik tanımı.
 */
export const LEGACY_BOOK_PRESENTATION_RUBRIC: Rubric = {
  id: LEGACY_BOOK_PRESENTATION_RUBRIC_ID,
  title: 'Kitap Okuma ve Sunum Değerlendirmesi',
  subject: 'Türk Dili ve Edebiyatı',
  gradeLevel: 'Genel',
  description:
    'Okunan eserin çözümlemesini, eleştirel değerlendirmeyi, metinsel kanıtları ve sözlü sunumu MEB kitaplarındaki 3 dereceli (Evet %100 – Kısmen %50 – Hayır %0) değerlendirme formuna uygun olarak ölçen 100 puanlık rubrik. TYMM Ek-1 ve MEB ODSGM sunum ölçütlerinden uyarlanmıştır; MEB tarafından yayımlanmış zorunlu kitap sunumu puanlama anahtarı değildir.',
  maxLevelPoints: 2,
  createdAt: '2026-10-26',
  version: 2,
  criteria: [
    {
      id: 'crit-ks-1',
      title: 'Eserin içeriğini ve temel iletisini kavrama',
      category: 'Eseri Anlama ve Çözümleme',
      weight: 20,
      maxPoints: 20,
      required: true,
      levels: levels(
        'Eserin konusu, temel olayları veya ana iletisi doğru aktarılmamış ya da hiç açıklanmamıştır.',
        'Eserin ana hatları açıklanmış ancak önemli olaylar, kişiler veya temel ileti kısmen/eksik aktarılmıştır.',
        'Eserin konusu, temel olayları, önemli kişiler ve ana iletisi doğru, açık ve tutarlı biçimde açıklanmıştır.'
      ),
    },
    {
      id: 'crit-ks-2',
      title: 'Edebi yapıyı ve anlatım unsurlarını çözümleme',
      category: 'Eseri Anlama ve Çözümleme',
      weight: 20,
      maxPoints: 20,
      required: true,
      levels: levels(
        'Kişiler, çatışma, anlatıcı, zaman, mekân veya tür özelliklerine ilişkin çözümleme yapılmamıştır.',
        'Eserin bazı yapı ve anlatım unsurları belirtilmiş ancak olay örgüsü ve anlamla ilişkileri kısmen açıklanmıştır.',
        'Eserin türüne uygun yapı, dil ve anlatım unsurları olay örgüsü, çatışma ve anlamla ilişkilendirilerek çözümlenmiştir.'
      ),
    },
    {
      id: 'crit-ks-3',
      title: 'Eleştirel yorum ve kişisel değerlendirme',
      category: 'Eleştirel Yorum ve Kanıt',
      weight: 15,
      maxPoints: 15,
      required: true,
      levels: levels(
        'Eser hakkında gerekçeli kişisel değerlendirme veya eleştirel yorum paylaşılmamıştır.',
        'Eserle ilgili kişisel beğeni ve eleştiriler dile getirilmiş ancak gerekçeleri yüzeysel veya kısmi kalmıştır.',
        'Eserin güçlü ve zayıf yönlerine, bakış açısına ve iletisine ilişkin görüşler tutarlı gerekçelerle değerlendirilmiştir.'
      ),
    },
    {
      id: 'crit-ks-4',
      title: 'Yorumları metinsel kanıt ve karşılaştırmalarla destekleme',
      category: 'Eleştirel Yorum ve Kanıt',
      weight: 15,
      maxPoints: 15,
      required: true,
      levels: levels(
        'Yorumlar eserden herhangi bir olay, alıntı, örnek veya karşılaştırmayla desteklenmemiştir.',
        'Eserden sınırlı örnek verilmiş ancak yorumlarla ve karşılaştırmalarla ilişkisi kısmen kurulabilmiştir.',
        'Yorumlar eserden yerinde örnek ve metinsel kanıtlarla desteklenmiş; anlamlı karşılaştırmalara yer verilmiştir.'
      ),
    },
    {
      id: 'crit-ks-5',
      title: 'Türkçeyi doğru, akıcı ve etkili kullanma',
      category: 'Sözlü Anlatım ve İletişim',
      weight: 10,
      maxPoints: 10,
      required: true,
      levels: levels(
        'Konuşma kopuk ilerlemiş; sözcük seçimi ve dil kullanımı anlatımı engelleyecek düzeyde sorunlu olmuştur.',
        'Konuşma genel olarak anlaşılır olmakla birlikte duraksama, tekrar veya anlatım kusurları görülmüştür.',
        'Konuya uygun söz varlığıyla akıcı, açık, anlaşılır ve Türkçenin kurallarına uygun konuşulmuştur.'
      ),
    },
    {
      id: 'crit-ks-6',
      title: 'Ses, beden dili ve dinleyiciyle iletişim',
      category: 'Sözlü Anlatım ve İletişim',
      weight: 10,
      maxPoints: 10,
      required: true,
      levels: levels(
        'Ses yeterince duyulmamış; göz teması ve dinleyiciyle etkili iletişim kurulamamıştır.',
        'Ses duyulabilir düzeydedir ancak vurgu, tonlama, beden dili ve göz teması kısmen kullanılmıştır.',
        'Ses, vurgu, tonlama, doğal beden dili ve göz teması anlamla uyumlu biçimde dinleyici ilgisini desteklemiştir.'
      ),
    },
    {
      id: 'crit-ks-7',
      title: 'Sunumu planlama ve içeriği düzenleme',
      category: 'Sunum Düzeni ve Zaman',
      weight: 5,
      maxPoints: 5,
      required: true,
      levels: levels(
        'Sunumun giriş, gelişme ve sonuç akışı belirgin değildir; içerik dağınık sunulmuştur.',
        'Temel bir sunum planı bulunmakla birlikte bölümler arası geçişler veya içerik sırası kısmen düzenlenmiştir.',
        'Sunum giriş-gelişme-sonuç bütünlüğüyle planlanmış ve içerik tutarlı bir akışla sunulmuştur.'
      ),
    },
    {
      id: 'crit-ks-8',
      title: 'Sunum süresini etkili kullanma',
      category: 'Sunum Düzeni ve Zaman',
      weight: 5,
      maxPoints: 5,
      required: true,
      levels: levels(
        'Sunum belirlenen süreyi önemli ölçüde aşmış veya içeriğin büyük bölümü sürede tamamlanamamıştır.',
        'Süre dağılımı kısmen dengeli olmuş; bazı bölümlere gereğinden fazla veya az zaman ayrılmıştır.',
        'Belirlenen süre içinde sunumun tüm bölümleri dengeli ve etkili bir zaman yönetimiyle tamamlanmıştır.'
      ),
    },
  ],
};
