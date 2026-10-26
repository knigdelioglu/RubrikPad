import type { Rubric, RubricLevel } from '../types.ts';

export const BOOK_PRESENTATION_RUBRIC_ID = 'rub-tde-kitap-sunumu';

/**
 * MEB ders kitaplarındaki 3 dereceli değerlendirme formlarına (Evet – Kısmen – Hayır)
 * uygun puan karşılıkları: Evet = %100, Kısmen = %50, Hayır = %0.
 */
export const BOOK_PRESENTATION_LEVEL_PERCENTAGES: Record<number, number> = {
  0: 0,
  1: 50,
  2: 100,
};

/**
 * MEB TYMM Eleştirel Okuma, Dinleme/İzleme Formu (Ek-1) ve ders kitaplarındaki
 * 3 dereceli (Evet – Kısmen – Hayır) değerlendirme formları dikkate alınarak
 * kitap sunumuna uyarlanmış rubrik.
 * Bu 100 puanlık dağılım uygulamaya özeldir; MEB'in zorunlu puan anahtarı değildir.
 */
function levels(no: string, partial: string, yes: string): RubricLevel[] {
  return [
    {
      level: 0,
      label: 'Hayır',
      points: 0,
      description: no,
    },
    {
      level: 1,
      label: 'Kısmen',
      points: 1,
      description: partial,
    },
    {
      level: 2,
      label: 'Evet',
      points: 2,
      description: yes,
    },
  ];
}

/** Bütün sınıf düzeylerindeki Türk Dili ve Edebiyatı şubelerinde kullanılabilir. */
export const BOOK_PRESENTATION_RUBRIC: Rubric = {
  id: BOOK_PRESENTATION_RUBRIC_ID,
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

