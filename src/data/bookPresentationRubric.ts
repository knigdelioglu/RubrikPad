import type { Rubric, RubricLevel } from '../types.ts';

export const BOOK_PRESENTATION_RUBRIC_ID = 'rub-tde-kitap-sunumu';

/**
 * MEB TYMM Eleştirel Okuma, Dinleme/İzleme Formu (Ek-1) ve ODSGM konuşma
 * değerlendirme alanları dikkate alınarak kitap sunumuna uyarlanmış rubrik.
 * Bu 100 puanlık dağılım uygulamaya özeldir; MEB'in zorunlu puan anahtarı değildir.
 */
function levels(
  support: string,
  developing: string,
  proficient: string,
  exemplary: string
): RubricLevel[] {
  return [
    {
      level: 0,
      label: 'Gözlenmedi (0)',
      points: 0,
      description: 'Bu ölçüte ilişkin değerlendirilebilir bir performans sergilenmedi.',
    },
    { level: 1, label: 'Destek Gerekli', points: 1, description: support },
    { level: 2, label: 'Gelişmekte', points: 2, description: developing },
    { level: 3, label: 'Yetkin', points: 3, description: proficient },
    { level: 4, label: 'Örnek Düzey', points: 4, description: exemplary },
  ];
}

/** Bütün sınıf düzeylerindeki Türk Dili ve Edebiyatı şubelerinde kullanılabilir. */
export const BOOK_PRESENTATION_RUBRIC: Rubric = {
  id: BOOK_PRESENTATION_RUBRIC_ID,
  title: 'Kitap Okuma ve Sunum Değerlendirmesi',
  subject: 'Türk Dili ve Edebiyatı',
  gradeLevel: 'Genel',
  description:
    'Okunan eserin çözümlemesini, eleştirel değerlendirmeyi, metinsel kanıtları ve sözlü sunumu ölçen 100 puanlık rubrik. TYMM Ek-1 ve MEB ODSGM sunum ölçütlerinden uyarlanmıştır; MEB tarafından yayımlanmış zorunlu kitap sunumu puanlama anahtarı değildir.',
  maxLevelPoints: 4,
  createdAt: '2026-10-26',
  version: 1,
  criteria: [
    {
      id: 'crit-ks-1',
      title: 'Eserin içeriğini ve temel iletisini kavrama',
      category: 'Eseri Anlama ve Çözümleme',
      weight: 20,
      maxPoints: 20,
      required: true,
      levels: levels(
        'Eserin konusu, temel olayları veya ana düşüncesi yanlış ya da çok eksik aktarılmıştır.',
        'Eserin ana hatları açıklanmış ancak önemli olaylar, kişiler veya ileti eksik ya da karışıktır.',
        'Eserin konusu, temel olayları, önemli kişiler ve ana iletisi doğru, açık ve tutarlı aktarılmıştır.',
        'Eserin ana iletisi ve önemli ayrıntıları arasındaki ilişkiler güçlü bir kavrayışla açıklanmıştır.'
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
        'Eserin bazı yapı ve anlatım unsurları sayılmış ancak aralarındaki ilişkiler açıklanmamıştır.',
        'Eserin türüne uygun yapı ve anlatım unsurları, olay örgüsü ve çatışmalarıyla ilişkilendirilmiştir.',
        'Yapı, dil ve anlatım tercihleri ile eserin anlamı arasındaki ilişkiler özgün ve derinlikli çözümlenmiştir.'
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
        'Eser hakkında gerekçeli kişisel değerlendirme veya eleştirel yorum bulunmamaktadır.',
        'Beğeni ve eleştiriler dile getirilmiş ancak gerekçeler yüzeysel ya da çelişkilidir.',
        'Eserin güçlü ve zayıf yönlerine ilişkin kişisel görüşler tutarlı gerekçelerle açıklanmıştır.',
        'Eserin bakış açısı, değerleri ve iletisi çok yönlü sorgulanmış; özgün ve dengeli yargılara ulaşılmıştır.'
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
        'Yorumlar eserden herhangi bir olay, ifade veya örnekle ilişkilendirilmemiştir.',
        'Örnekler verilmiş ancak yorumlarla ilişkileri zayıf kalmış; karşılaştırmalar yüzeysel olmuştur.',
        'Yorumlar eserden yerinde örneklerle desteklenmiş, uygun bağlamlarda karşılaştırmalara yer verilmiştir.',
        'Seçilen güçlü metinsel kanıtlar ve anlamlı karşılaştırmalar eleştirel görüşleri ikna edici biçimde temellendirmiştir.'
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
        'Konuşma anlaşılmayacak derecede kopuk; sözcük seçimi ve dil kullanımı belirgin biçimde sorunludur.',
        'Konuşma genel olarak anlaşılır ancak sık duraksama, tekrar ve anlatım kusurları vardır.',
        'Konuya uygun söz varlığıyla akıcı, açık, anlaşılır ve Türkçenin kurallarına uygun konuşulmuştur.',
        'Zengin söz varlığı, akıcı cümleler ve yerinde vurgularla anlam etkili biçimde aktarılmıştır.'
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
        'Ses yeterince duyulmamış; göz teması veya dinleyiciyle iletişim kurulmamıştır.',
        'Ses duyulabilir düzeydedir ancak vurgu, tonlama, jest, mimik ve göz teması sınırlıdır.',
        'Ses, vurgu, tonlama, doğal beden dili ve göz teması anlatımı ve dinleyici ilgisini desteklemiştir.',
        'Ses ve beden dili anlamla uyum içinde kullanılmış; dinleyiciyle güçlü ve sürdürülebilir bağ kurulmuştur.'
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
        'Sunumun giriş, gelişme ve sonuç akışı belirgin değildir; içerik dağınıktır.',
        'Temel bir plan vardır ancak geçişler, içerik sırası veya görsel destek yetersizdir.',
        'Sunum giriş-gelişme-sonuç bütünlüğüyle düzenlenmiş; kullanılan materyaller içeriği desteklemiştir.',
        'Dikkat çekici giriş, güçlü geçişler, özlü görsel destek ve sonuçla tutarlı bir bütünlük kurulmuştur.'
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
        'Sunum belirlenen süreyi önemli ölçüde aşmış veya içeriğin büyük bölümü tamamlanamamıştır.',
        'Süre dağılımı dengesiz kalmış; bazı bölümler gereğinden uzun ya da kısa tutulmuştur.',
        'Belirlenen süre içinde konunun temel boyutları dengeli ve tamamlanmış biçimde sunulmuştur.',
        'Süre bilinçli yönetilmiş; her bölüme amacına uygun zaman ayrılarak etkili bir kapanış yapılmıştır.'
      ),
    },
  ],
};
