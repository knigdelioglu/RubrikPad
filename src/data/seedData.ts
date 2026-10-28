import type {
  Classroom,
  Student,
  Rubric,
  RubricLevel,
  EvaluationSession,
} from '../types.ts';
import {
  LITERARY_BOOK_PRESENTATION_RUBRIC,
  INFORMATIVE_BOOK_PRESENTATION_RUBRIC,
} from './bookPresentationRubric.ts';

export const INITIAL_CLASSROOMS: Classroom[] = [];

export const INITIAL_STUDENTS: Student[] = [];

function createCriterionLevels(
  d1: string,
  d2: string,
  d3: string,
  d4: string
): RubricLevel[] {
  return [
    {
      level: 0,
      label: 'Gözlenmedi (0)',
      points: 0,
      description: 'Bu ölçüt için gözlemlenebilir performans sergilenmedi.',
    },
    {
      level: 1,
      label: 'Destek Gerekli',
      points: 1,
      description: d1,
    },
    {
      level: 2,
      label: 'Gelişmekte',
      points: 2,
      description: d2,
    },
    {
      level: 3,
      label: 'Yetkin',
      points: 3,
      description: d3,
    },
    {
      level: 4,
      label: 'Örnek Düzey',
      points: 4,
      description: d4,
    },
  ];
}

export const INITIAL_RUBRICS: Rubric[] = [
  // 1. İletişim Engelleri — Grup Draması (Toplam: 100 Puan)
  {
    id: 'rub-tde-iletisim-engelleri',
    title: 'İletişim Engelleri — Grup Draması',
    subject: 'Türk Dili ve Edebiyatı',
    gradeLevel: '11. Sınıf',
    description:
      'İletişim engellerini konu alan grup draması çalışmalarının hazırlık, içerik, canlandırma ve dil kullanımı ölçütlerine göre değerlendirilmesi (100 Puan).',
    maxLevelPoints: 4,
    createdAt: '2026-10-24',
    version: 3,
    criteria: [
      {
        id: 'crit-ie-1',
        title: 'Konu, amaç ve iletişim engeliyle uyum',
        category: 'İçerik ve Amaç',
        weight: 10,
        maxPoints: 10,
        required: true,
        levels: createCriterionLevels(
          'Seçilen iletişim engeli ve drama amacı belirsizdir; konu dışına çıkılmıştır.',
          'Konu ve iletişim engeli kısmen yansıtılmış ancak amaçla bağlantısı zayıf kalmıştır.',
          'Canlandırma belirlenen konu, amaç ve iletişim engeliyle uyumlu biçimde sunulmuştur.',
          'Konu, amaç ve hedeflenen iletişim engeli tam bir bütünlük ve güçlü kurguyla yansıtılmıştır.'
        ),
      },
      {
        id: 'crit-ie-2',
        title: 'İçeriğin doğruluğu ve çözümün gösterilmesi',
        category: 'İçerik ve Çözüm',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'İletişim engeli yanlış tanımlanmış ve çözüm önerisine yer verilmemiştir.',
          'İletişim engeli doğru örneklendirilmiş ancak etkili iletişim çözümü yüzeysel kalmıştır.',
          'İletişim engeli doğru aktarılmış ve uygulanabilir bir çözüm durumu gösterilmiştir.',
          'İletişim engeli ve doğru iletişim çözümü karşılaştırmalı, ikna edici ve eksiksiz biçimde somutlaştırılmıştır.'
        ),
      },
      {
        id: 'crit-ie-3',
        title: 'Planlama ve hazırlık',
        category: 'Süreç',
        weight: 15,
        maxPoints: 15,
        required: true,
        levels: createCriterionLevels(
          'Rol dağılımı ve senaryo hazırlığı yapılmamış, hazırlıksız çıkılmıştır.',
          'Temel rol dağılımı yapılmış ancak prova ve sahne hazırlığı eksiktir.',
          'Senaryo akışı, rol dağılımı ve gerekli hazırlıklar zamanında tamamlanmıştır.',
          'Ayrıntılı senaryo planlaması, kostüm/materyal hazırlığı ve prova disiplini üst düzeydedir.'
        ),
      },
      {
        id: 'crit-ie-4',
        title: 'Canlandırma becerisi ve dramatik akış',
        category: 'Sahneleme',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Roller benimsenmemiş, dramatik akışta sık kopukluklar yaşanmıştır.',
          'Roller kısmen canlandırılmış ancak geçişlerde duraksamalar gözlenmiştir.',
          'Roller doğal biçimde canlandırılmış ve olay örgüsü akıcı şekilde sürdürülmüştür.',
          'Karakterler yüksek inandırıcılıkla canlandırılmış, dramatik gerilim ve akış ustalıkla yönetilmiştir.'
        ),
      },
      {
        id: 'crit-ie-5',
        title: 'Sözü, Türkçeyi ve beden dilini etkili kullanma',
        category: 'Dil ve Anlatım',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Ses tonu duyulmayacak kadar kısık, Türkçe kullanımı hatalı ve beden dili donuktur.',
          'Türkçe genel olarak doğru kullanılsa da vurgu, tonlama ve jest-mimikler sınırlıdır.',
          'Türkçe kurallarına uygun, anlaşılır bir diksiyon ve role uygun beden dili kullanılmıştır.',
          'Söz varlığı, vurgu, tonlama ve jest-mimikler karakterin duygusunu güçlendirecek şekilde etkileyici kullanılmıştır.'
        ),
      },
      {
        id: 'crit-ie-6',
        title: 'Grupla uyum ve izleyiciyle iletişim',
        category: 'Etkileşim',
        weight: 10,
        maxPoints: 10,
        required: true,
        levels: createCriterionLevels(
          'Grup üyeleri arasında koordinasyon yoktur ve izleyiciden kopuk kalınmıştır.',
          'Grup içi uyum kısmen sağlanmış ancak izleyiciye dönük sahne kullanımı zayıftır.',
          'Grup üyeleri birbirini tamamlayarak oynamış ve izleyiciyle bağı korumuştur.',
          'Sahne içi paslaşmalar, grup sinerjisi ve izleyicinin dikkatini canlı tutma becerisi örnek düzeydedir.'
        ),
      },
      {
        id: 'crit-ie-7',
        title: 'Özgünlük',
        category: 'Yaratıcılık',
        weight: 5,
        maxPoints: 5,
        required: true,
        levels: createCriterionLevels(
          'Klişe ve hazır kalıplar dışına çıkılmamıştır.',
          'Bilinen örnekler küçük değişikliklerle uyarlanmıştır.',
          'Kurguda ve diyaloglarda grubun kendine özgü yaklaşımı hissedilir.',
          'Özgün kurgu, yaratıcı bakış açısı ve akılda kalıcı diyaloglarla fark yaratılmıştır.'
        ),
      },
    ],
  },

  // 2. E-posta (Toplam: 100 Puan)
  {
    id: 'rub-tde-eposta',
    title: 'E-posta',
    subject: 'Türk Dili ve Edebiyatı',
    gradeLevel: '11. Sınıf',
    description:
      'E-posta yazma çalışmalarının dil, üslup, hitap, özgünlük ve yazım-noktalama ölçütlerine göre değerlendirilmesi (100 Puan).',
    maxLevelPoints: 4,
    createdAt: '2026-10-24',
    version: 3,
    criteria: [
      {
        id: 'crit-ep-1',
        title: 'Türkçenin doğru kullanımı',
        category: 'Dil Bilgisi',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Anlatım bozuklukları ve yabancı/argo sözcük kullanımları anlamı bozmaktadır.',
          'Cümle yapılarında kısmi anlatım kusurları ve sözcük seçimi hataları vardır.',
          'Kelimeler anlamına uygun seçilmiş, Türkçe kurallarına uygun ve duru cümleler kurulmuştur.',
          'Türkçenin anlatım olanakları, deyim ve söz varlığı zenginliğiyle kusursuz biçimde kullanılmıştır.'
        ),
      },
      {
        id: 'crit-ep-2',
        title: 'Dil ve üslup',
        category: 'Anlatım',
        weight: 18,
        maxPoints: 18,
        required: true,
        levels: createCriterionLevels(
          'Üslup e-postanın gönderildiği muhataba ve bağlama uygun değildir.',
          'Üslup yer yer tutarsızdır; resmiyet veya samimiyet dengesi korunamamıştır.',
          'İletişim amacına ve alıcıya uygun, tutarlı ve nezaket kurallarına bağlı bir üslup kullanılmıştır.',
          'Bağlama, hedef kitleye ve iletişim amacına tam uyum sağlayan akıcı, etkileyici bir üslup sergilenmiştir.'
        ),
      },
      {
        id: 'crit-ep-3',
        title: 'Özgünlük',
        category: 'Yaratıcılık',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Metin basmakalıp ifadelerden oluşmakta, kişisel anlatım içermemektedir.',
          'Kalıp ifadeler ağırlıktadır; özgün düşünceler sınırlı düzeydedir.',
          'Konu öğrencinin kendi ifadeleri ve özgün bakış açısıyla ele alınmıştır.',
          'Seçilen yaklaşım, örnekler ve anlatım diliyle dikkat çekici derecede özgün bir metin oluşturulmuştur.'
        ),
      },
      {
        id: 'crit-ep-4',
        title: 'Gerekli durumlarda öznel ve nesnel ifadelere yer verme',
        category: 'İçerik',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Öznel ve nesnel ifadeler bağlama uygun kullanılmamış, ayrım gözetilmemiştir.',
          'Öznel veya nesnel yargılardan yalnızca birine ağırlık verilmiş, denge kurulamamıştır.',
          'Konunun gerektirdiği yerlerde nesnel bilgiler ve öznel değerlendirmeler yerinde kullanılmıştır.',
          'Kanıtlanabilir nesnel veriler ile kişisel yorumlar metnin amacını güçlendirecek şekilde ustalıkla harmanlanmıştır.'
        ),
      },
      {
        id: 'crit-ep-5',
        title: 'Başlık ve hitap kullanımı',
        category: 'Biçim',
        weight: 18,
        maxPoints: 18,
        required: true,
        levels: createCriterionLevels(
          'Konu başlığı (konu satırı), hitap veya kapanış ifadeleri eksiktir ya da hatalıdır.',
          'Başlık ve hitap kullanılmış ancak içeriği tam yansıtmamakta veya biçimsel eksikler taşımaktadır.',
          'İçeriği özetleyen net bir konu başlığı ile alıcıya uygun hitap ve kapanış ifadeleri kullanılmıştır.',
          'Konu satırı, hitap, giriş-gelişme-sonuç bölümleri ve esenlik dileği e-posta standartlarına örnek biçimde düzenlenmiştir.'
        ),
      },
      {
        id: 'crit-ep-6',
        title: 'Yazım ve noktalama',
        category: 'Yazım Kuralları',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Metin genelinde okunabilirliği güçleştiren çok sayıda yazım ve noktalama hatası vardır.',
          'Bazı temel yazım ve noktalama kurallarında tekrarlayan hatalar bulunmaktadır.',
          'Yazım ve noktalama kurallarına büyük ölçüde uyulmuştur.',
          'Büyük harf, eklerin yazımı ve noktalama işaretleri TDK kurallarına tam uygunlukla kullanılmıştır.'
        ),
      },
    ],
  },

  // 3. Türk Dünyası Konuşma (Toplam: 100 Puan)
  {
    id: 'rub-tde-turk-dunyasi-konusma',
    title: 'Türk Dünyası Konuşma',
    subject: 'Türk Dili ve Edebiyatı',
    gradeLevel: '11. Sınıf',
    description:
      'Türk dünyası temalı sözlü anlatım ve konuşma performanslarının içerik, söz varlığı, beden dili, zaman yönetimi ve dinleyici etkileşimi açısından değerlendirilmesi (100 Puan).',
    maxLevelPoints: 4,
    createdAt: '2026-10-24',
    version: 3,
    criteria: [
      {
        id: 'crit-tdk-1',
        title: 'Konuya hâkimiyet',
        category: 'İçerik',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Konuyla ilgili temel bilgiler eksiktir; konuşma yalnızca kâğıttan okunarak sürdürülmüştür.',
          'Konunun ana hatları bilinmekte ancak ayrıntılarda ve örneklerde eksiklikler görülmektedir.',
          'Türk dünyası konusu doğru bilgiler, uygun örnekler ve tutarlı bir planla aktarılmıştır.',
          'Konuya derinlemesine hâkimiyet sergilenmiş; tarihsel, kültürel ve edebi bağlamlar zengin örneklerle bütünleştirilmiştir.'
        ),
      },
      {
        id: 'crit-tdk-2',
        title: 'Söz varlığını etkili ve güzel kullanma',
        category: 'Dil ve Anlatım',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Sınırlı kelime dağarcığıyla konuşulmuş, sık kelime tekrarları ve doldurma ifadeler kullanılmıştır.',
          'Anlaşılır bir dil kullanılmış ancak deyim, atasözü ve zengin kavram seçimi sınırlı kalmıştır.',
          'Konuya uygun zengin bir söz varlığı, akıcı ve özenli bir Türkçe ile kullanılmıştır.',
          'Türkçenin söz varlığı, edebi incelikleri ve kavram zenginliği dinleyicide hayranlık uyandıracak yetkinlikte kullanılmıştır.'
        ),
      },
      {
        id: 'crit-tdk-3',
        title: 'Beden dili ve sesle anlam oluşturma',
        category: 'Sözlü Performans',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Monoton bir ses tonuyla konuşulmuş, göz teması ve beden dili kullanılmamıştır.',
          'Ses tonu duyulabilir düzeydedir ancak vurgu, tonlama ve jest-mimikler anlamı yeterince desteklememektedir.',
          'Vurgu, tonlama, duraklama ve beden dili konuşmanın anlamını güçlendirecek şekilde kullanılmıştır.',
          'Sesin coşkusu, diksiyon, göz teması ve doğal beden dili anlatılan duygu ve düşünceyle tam uyum içinde bütünleşmiştir.'
        ),
      },
      {
        id: 'crit-tdk-4',
        title: 'Zamanı ve mekânı konuşmaya uygun şekilde yönetme',
        category: 'Sunum Yönetimi',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Verilen süre çok aşılmış veya çok kısa tutulmuş; konuşma alanı etkili kullanılmamıştır.',
          'Süre kullanımında dengesizlikler yaşanmış, kürsü/sahne kullanımı sabit kalmıştır.',
          'Konuşma verilen süre içinde giriş-gelişme-sonuç dengesiyle tamamlanmış ve mekân uygun kullanılmıştır.',
          'Zamanlama kusursuz planlanmış ve konuşma mekânı dinleyicilerin tamamını kapsayacak şekilde ustalıkla yönetilmiştir.'
        ),
      },
      {
        id: 'crit-tdk-5',
        title: 'Seyircinin ilgisini çekme',
        category: 'Etkileşim',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Dinleyicilerin ilgisini çekecek bir giriş veya hitap yapılmamış, etkileşim kurulamamıştır.',
          'Girişte ilgi çekilmeye çalışılmış ancak konuşmanın devamında dinleyici dikkati dağılmıştır.',
          'Etkili sorular, örnekler ve canlı anlatımla dinleyicilerin ilgisi konuşma boyunca canlı tutulmuştur.',
          'Çarpıcı başlangıç, güçlü hitabet ve kapanış mesajıyla seyircinin dikkati baştan sona en üst düzeyde tutulmuştur.'
        ),
      },
    ],
  },

  // 4. Müze İzlenim Yazısı (Toplam: 100 Puan)
  {
    id: 'rub-tde-muze-izlenim-yazisi',
    title: 'Müze İzlenim Yazısı',
    subject: 'Türk Dili ve Edebiyatı',
    gradeLevel: '11. Sınıf',
    description:
      'Müze gezisi ve gözlemlerine dayalı izlenim yazılarının dil, özgünlük, öznel-nesnel anlatım, görsel kullanımı ve yazım-noktalama ölçütlerine göre değerlendirilmesi (100 Puan).',
    maxLevelPoints: 4,
    createdAt: '2026-10-24',
    version: 3,
    criteria: [
      {
        id: 'crit-miy-1',
        title: 'Dil ve üslup',
        category: 'Anlatım',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Anlatım kopuk ve sıradandır; izlenim yazısı üslubundan uzaktır.',
          'Betimlemelere yer verilmiş ancak anlatımda akıcılık ve üslup bütünlüğü kısmen sağlanmıştır.',
          'Gözlemleri canlandıran, akıcı, duru ve izlenim yazısı türüne uygun bir üslup kullanılmıştır.',
          'Okuyucuyu müze atmosferinin içine çeken, zengin betimlemeli ve edebi niteliği yüksek bir üslup sergilenmiştir.'
        ),
      },
      {
        id: 'crit-miy-2',
        title: 'Özgünlük',
        category: 'Yaratıcılık',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Broşür veya internet bilgilerinin doğrudan aktarımıyla yetinilmiştir.',
          'Genel bilgiler ağırlıktadır; öğrencinin kişisel gözlemleri sınırlı yer tutmaktadır.',
          'Müzedeki eser ve mekânlar öğrencinin kendi gözlem ve duyarlılığıyla özgün biçimde aktarılmıştır.',
          'Seçilen detaylar, kurulan çağrışımlar ve özgün bakış açısıyla tamamen kendine has, etkileyici bir metin üretilmiştir.'
        ),
      },
      {
        id: 'crit-miy-3',
        title: 'Öznel ve nesnel ifadelere yer verme',
        category: 'İçerik',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Yalnızca kuru bilgi sıralanmış ya da hiçbir somut veriye dayanmayan soyut ifadeler kullanılmıştır.',
          'Nesnel bilgiler ile kişisel izlenimler arasındaki denge yeterince kurulamamıştır.',
          'Müzeye ve eserlere dair nesnel bilgiler ile kişisel duygu ve izlenimler dengeli biçimde sunulmuştur.',
          'Tarihsel/sanatsal nesnel veriler ile derinlikli öznel izlenimler organik bir bütünlük içinde kaynaştırılmıştır.'
        ),
      },
      {
        id: 'crit-miy-4',
        title: 'Görsellerden yararlanma',
        category: 'Görsel Destek',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Yazıda hiçbir görsele yer verilmemiş veya metinle ilgisiz görseller eklenmiştir.',
          'Görsel eklenmiş ancak metin içinde görsellerle bağlantı kurulmamıştır.',
          'Anlatılan eser ve mekânları destekleyen uygun görseller seçilmiş ve metinle ilişkilendirilmiştir.',
          'Özenle seçilmiş görseller, açıklama alt yazıları ve metin içi göndermelerle anlatımı zenginleştirecek biçimde bütünleştirilmiştir.'
        ),
      },
      {
        id: 'crit-miy-5',
        title: 'Yazım ve noktalama',
        category: 'Yazım Kuralları',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Tarih, özel ad ve noktalama kullanımlarında çok sayıda hata bulunmaktadır.',
          'Temel yazım ve noktalama kurallarında dikkat çeken yanlışlar vardır.',
          'Özel adların, tarihlerin yazımı ve noktalama işaretleri genel olarak doğrudur.',
          'Metnin tamamında TDK yazım ve noktalama kurallarına eksiksiz ve titizlikle uyulmuştur.'
        ),
      },
    ],
  },

  // 5. Kemal Tahir Mülakat (Toplam: 100 Puan)
  {
    id: 'rub-tde-kemal-tahir-mulakat',
    title: 'Kemal Tahir Mülakat',
    subject: 'Türk Dili ve Edebiyatı',
    gradeLevel: '11. Sınıf',
    description:
      'Kemal Tahir üzerine gerçekleştirilen mülakat çalışmalarının düşünceyi geliştirme yolları, anlatım ilkeleri, diksiyon, beden dili ve zaman/mekân yönetimi açısından değerlendirilmesi (100 Puan).',
    maxLevelPoints: 4,
    createdAt: '2026-10-24',
    version: 3,
    criteria: [
      {
        id: 'crit-ktm-1',
        title: 'Düşünceyi geliştirme yollarından yararlanma',
        category: 'İçerik ve Kurgulama',
        weight: 12,
        maxPoints: 12,
        required: true,
        levels: createCriterionLevels(
          'Sorular ve yanıtlar yüzeyseldir; örneklendirme, tanık gösterme veya karşılaştırmaya başvurulmamıştır.',
          'Düşünceyi geliştirme yollarından çok sınırlı yararlanılmıştır.',
          'Kemal Tahir’in edebi kişiliği ve eserleri örneklendirme, karşılaştırma ve alıntılarla desteklenmiştir.',
          'Tanık gösterme, örneklendirme ve karşılaştırma gibi düşünceyi geliştirme yolları mülakatın derinliğini artıracak şekilde ustalıkla kullanılmıştır.'
        ),
      },
      {
        id: 'crit-ktm-2',
        title: 'Anlatım ilkelerine (akıcılık, duruluk vb.) uygunluk',
        category: 'Anlatım',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Anlatımda gereksiz sözcükler, belirsizlikler ve akışı bozan kopukluklar yoğunluktadır.',
          'Sorular ve cevaplar anlaşılır olsa da akıcılık ve açıklık ilkelerinde aksamalar vardır.',
          'Mülakat; açıklık, akıcılık, yalınlık ve duruluk ilkelerine uygun bir anlatımla gerçekleştirilmiştir.',
          'Soru-cevap geçişleri ve anlatım örgüsü tüm anlatım ilkelerine örnek düzeyde uygunluk göstermektedir.'
        ),
      },
      {
        id: 'crit-ktm-3',
        title: 'Beden dilinin kullanımı',
        category: 'Sözlü Performans',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Duruş, göz teması ve jest-mimikler mülakat ciddiyetiyle bağdaşmamaktadır.',
          'Beden dili kısıtlı ve gergindir; yalnız notlara bakılarak konuşulmuştur.',
          'Göz teması, baş hareketleri ve jest-mimikler mülakat ortamına uygun ve doğal kullanılmıştır.',
          'Hem mülakatı yapan hem de yanıtlayan rolünde beden dili, etkin dinleme ve iletişim nezaketini tam olarak yansıtmıştır.'
        ),
      },
      {
        id: 'crit-ktm-4',
        title: 'Ses ve diksiyon',
        category: 'Sözlü Performans',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Kelimeler yanlış telaffuz edilmiş, ses tonu monoton ve duyulması güç kalmıştır.',
          'Telaffuz anlaşılır düzeydedir ancak vurgu ve tonlamada tekdüzelik vardır.',
          'Kelimeler doğru telaffuz edilmiş; soru ve yanıt tonlamaları anlaşılır biçimde yapılmıştır.',
          'Diksiyon, boğumlama, vurgu ve ses tonu profesyonel bir mülakat atmosferi oluşturacak yetkinliktedir.'
        ),
      },
      {
        id: 'crit-ktm-5',
        title: 'Zaman yönetimi',
        category: 'Sunum Yönetimi',
        weight: 12,
        maxPoints: 12,
        required: true,
        levels: createCriterionLevels(
          'Süre planlaması yapılmamış, mülakat yarıda kalmış veya çok kısa sürmüştür.',
          'Soru süreleri dengesiz dağılmış, ayrılan zaman verimli kullanılamamıştır.',
          'Giriş, sorular ve kapanış bölümleri verilen süreye uygun biçimde tamamlanmıştır.',
          'Her soruya ayrılan süre ve mülakatın temposu zaman sınırları içinde kusursuz yönetilmiştir.'
        ),
      },
      {
        id: 'crit-ktm-6',
        title: 'Mekânı etkili kullanma',
        category: 'Sunum Yönetimi',
        weight: 12,
        maxPoints: 12,
        required: true,
        levels: createCriterionLevels(
          'Oturma/durma düzeni mülakat iletişimine ve izleyicilerin görüş açısına uygun değildir.',
          'Mekân düzenlenmiş ancak sahne/alan yerleşiminde eksiklikler vardır.',
          'Mülakat alanı hem konuşmacılar arasındaki iletişimi hem de izleyicilerin takibini kolaylaştıracak şekilde kullanılmıştır.',
          'Mekân düzeni, oturma açısı ve sahne kullanımı mülakatın gerçekçiliğini güçlendirecek şekilde özenle kurgulanmıştır.'
        ),
      },
      {
        id: 'crit-ktm-7',
        title: 'Türkçenin doğru kullanımı',
        category: 'Dil Bilgisi',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Cümle düşüklükleri ve yanlış sözcük seçimleri anlatımı zedelemektedir.',
          'Zaman zaman cümle yapı bozuklukları ve doldurma sözcükler duyulmaktadır.',
          'Mülakat boyunca Türkçe dil bilgisi kurallarına uygun ve özenli bir dil kullanılmıştır.',
          'Edebi mülakat diline yakışan, zengin, kurallı ve kusursuz bir Türkçe kullanımı sergilenmiştir.'
        ),
      },
    ],
  },

  // 6. Diyalog Dönüştürme (Toplam: 100 Puan)
  {
    id: 'rub-tde-diyalog-donusturme',
    title: 'Diyalog Dönüştürme',
    subject: 'Türk Dili ve Edebiyatı',
    gradeLevel: '11. Sınıf',
    description:
      'Anlatmaya dayalı veya bilgilendirici metinlerin diyalog/karşılıklı konuşma biçimine dönüştürülmesi çalışmalarının değerlendirilmesi (100 Puan).',
    maxLevelPoints: 4,
    createdAt: '2026-10-24',
    version: 3,
    criteria: [
      {
        id: 'crit-dd-1',
        title: 'Dil ve üslup',
        category: 'Anlatım',
        weight: 18,
        maxPoints: 18,
        required: true,
        levels: createCriterionLevels(
          'Konuşmalar yapaydır ve kişilerin özellikleriyle uyuşmamaktadır.',
          'Diyalog dili kısmen doğal olsa da söz geçişlerinde kopukluklar vardır.',
          'Karakterlerin özelliklerine ve bağlama uygun, doğal ve akıcı bir konuşma dili kullanılmıştır.',
          'Karşılıklı konuşmalar canlı, karakterlerin ruh hâlini ve üslubunu yansıtan etkileyici bir dille kurgulanmıştır.'
        ),
      },
      {
        id: 'crit-dd-2',
        title: 'Başlık kullanımı',
        category: 'Biçim',
        weight: 18,
        maxPoints: 18,
        required: true,
        levels: createCriterionLevels(
          'Metne başlık konulmamış veya içerikle tamamen ilgisiz bir başlık seçilmiştir.',
          'Başlık kullanılmış ancak diyaloğun ana düşüncesini yeterince yansıtmamaktadır.',
          'Diyaloğun konusu ve ana düşüncesiyle uyumlu, anlamlı bir başlık kullanılmıştır.',
          'İçeriği güçlü biçimde özetleyen, merak uyandırıcı ve özgün bir başlık tercih edilmiştir.'
        ),
      },
      {
        id: 'crit-dd-3',
        title: 'Özgünlük',
        category: 'Yaratıcılık',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Kaynak metin cümleleri neredeyse hiç değiştirilmeden alt alta yazılmıştır.',
          'Dönüştürme işleminde küçük değişiklikler yapılmış, özgün katkı sınırlı kalmıştır.',
          'Metin, öğrencinin kendi kurgusu ve özgün diyalog ifadeleriyle yeniden biçimlendirilmiştir.',
          'Dönüştürülen metin yaratıcı replikler ve özgün sahne/durum ayrıntılarıyla zenginleştirilmiştir.'
        ),
      },
      {
        id: 'crit-dd-4',
        title: 'Konunun uygunluğu',
        category: 'İçerik',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Diyalog, verilen temadan veya kaynak metnin özünden uzaklaşmıştır.',
          'Konu kısmen korunmuş ancak önemli olay veya düşünceler diyalogda eksik bırakılmıştır.',
          'Diyalog, hedeflenen konuya ve metnin ana iletisine tam uygunluk göstermektedir.',
          'Konunun tüm boyutları diyalog akışı içinde eksiksiz ve etkileyici bir bütünlükle işlenmiştir.'
        ),
      },
      {
        id: 'crit-dd-5',
        title: 'Yazım ve noktalama',
        category: 'Yazım Kuralları',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Konuşma çizgisi, iki nokta ve temel yazım kuralları hatalı veya eksiktir.',
          'Diyalog noktalama işaretlerinde ve yazım kurallarında kısmi yanlışlar vardır.',
          'Konuşma çizgisi, tırnak ve diğer noktalama işaretleri ile yazım kuralları doğru kullanılmıştır.',
          'Diyalog metinlerine özgü tüm noktalama işaretleri ve yazım kuralları kusursuz uygulanmıştır.'
        ),
      },
      {
        id: 'crit-dd-6',
        title: 'Öznel ve nesnel ifadelere yer verme',
        category: 'İçerik',
        weight: 16,
        maxPoints: 16,
        required: true,
        levels: createCriterionLevels(
          'Konuşmalarda durumun gerektirdiği nesnel bilgi veya öznel duygu/düşüncelere yer verilmemiştir.',
          'Öznel ve nesnel ifadeler diyalog akışına yeterince yedirilmemiştir.',
          'Kişilerin konuşmalarında hem nesnel durum tespitlerine hem de öznel yorumlara yerinde yer verilmiştir.',
          'Öznel duygu/yorumlar ile nesnel gerçeklikler diyalogdaki karakterlerin bakış açılarını güçlendirecek şekilde dengelenmiştir.'
        ),
      },
    ],
  },

  // 7. Tiyatro Canlandırma (Toplam: 100 Puan)
  {
    id: 'rub-tde-tiyatro-canlandirma',
    title: 'Tiyatro Canlandırma',
    subject: 'Türk Dili ve Edebiyatı',
    gradeLevel: '11. Sınıf',
    description:
      'Tiyatro metni sahneleme ve rol canlandırma çalışmalarının içerik, grup uyumu, özgünlük, oyunculuk ve dil/beden dili kullanımı açısından değerlendirilmesi (100 Puan).',
    maxLevelPoints: 4,
    createdAt: '2026-10-24',
    version: 3,
    criteria: [
      {
        id: 'crit-tc-1',
        title: 'İçeriğe uygunluk',
        category: 'İçerik',
        weight: 15,
        maxPoints: 15,
        required: true,
        levels: createCriterionLevels(
          'Sahnelenen oyun, metnin temasına ve dönem/karakter özelliklerine uygun değildir.',
          'Metnin ana hatlarına bağlı kalınmış ancak karakter ve olay yorumunda uyumsuzluklar vardır.',
          'Canlandırma, tiyatro metninin içeriğine, iletisine ve karakter özelliklerine uygun biçimde yapılmıştır.',
          'Metnin dramatik yapısı, dönemi ve karakter derinliği sahneye eksiksiz ve tam uyumla taşınmıştır.'
        ),
      },
      {
        id: 'crit-tc-2',
        title: 'Grupla uyum içinde çalışma',
        category: 'İş Birliği',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Oyuncular arasında replik takibi ve sahne uyumu yoktur.',
          'Replik geçişlerinde zaman zaman aksamalar ve kopukluklar yaşanmıştır.',
          'Grup üyeleri replik sırasına, sahne trafiğine ve ortak oyun temposuna uyum sağlamıştır.',
          'Oyuncular birbirlerinin performansını yükselterek tam bir topluluk uyumu ve sahne disiplini sergilemiştir.'
        ),
      },
      {
        id: 'crit-tc-3',
        title: 'Özgünlük',
        category: 'Yaratıcılık',
        weight: 15,
        maxPoints: 15,
        required: true,
        levels: createCriterionLevels(
          'Role ve sahnelemeye hiçbir özgün yorum katılmamıştır.',
          'Standart bir canlandırma yapılmış, yaratıcı sahne/rol detayları sınırlı kalmıştır.',
          'Karakter yorumunda ve sahne kullanımında özgün ve yaratıcı dokunuşlar sergilenmiştir.',
          'Kostüm, aksesuar, sahne trafiği ve rol yorumuyla iz bırakan özgün bir tiyatro performansı sunulmuştur.'
        ),
      },
      {
        id: 'crit-tc-4',
        title: 'Canlandırma becerisi',
        category: 'Oyunculuk',
        weight: 15,
        maxPoints: 15,
        required: true,
        levels: createCriterionLevels(
          'Rol ezberlenmemiş veya duygu katılmadan mekanik biçimde okunmuştur.',
          'Ezber kısmen yapılmış ancak karakterin duygusu sahneye yeterince yansıtılamamıştır.',
          'Karakterin duygu ve düşünceleri sahnede doğal ve inandırıcı bir oyunculukla canlandırılmıştır.',
          'Karakterle bütünleşen, sahne hakimiyeti yüksek ve seyirciyi etkileyen üst düzey bir oyunculuk sergilenmiştir.'
        ),
      },
      {
        id: 'crit-tc-5',
        title: 'Türkçenin doğru kullanımı',
        category: 'Dil Bilgisi',
        weight: 15,
        maxPoints: 15,
        required: true,
        levels: createCriterionLevels(
          'Telaffuz ve boğumlama hataları nedeniyle replikler anlaşılmamaktadır.',
          'Bazı kelimelerin telaffuzunda ve cümle vurgularında hatalar yapılmıştır.',
          'Replikler doğru telaffuz, açık boğumlama ve kurallı bir Türkçe ile seslendirilmiştir.',
          'Türkçenin ses özellikleri, sahne diksiyonu ve metin üslubu kusursuz biçimde yansıtılmıştır.'
        ),
      },
      {
        id: 'crit-tc-6',
        title: 'Sözü ve beden dilini etkili kullanma',
        category: 'Sözlü ve Sözsüz İletişim',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Ses sahneden duyulmamakta, jest ve mimikler роle eşlik etmemektedir.',
          'Ses tonu ve beden dili kullanılmış ancak karakterin değişen duygularına göre çeşitlenmemiştir.',
          'Sesin şiddeti, tonlaması ile jest, mimik ve sahne hareketleri rolün anlamını desteklemiştir.',
          'Söz ve beden dili tam bir senkronizasyonla kullanılarak dramatik etki en üst düzeye çıkarılmıştır.'
        ),
      },
    ],
  },

  // 8. Afiş (Toplam: 100 Puan)
  {
    id: 'rub-tde-afis',
    title: 'Afiş',
    subject: 'Türk Dili ve Edebiyatı',
    gradeLevel: '11. Sınıf',
    description:
      'Edebiyat ve kültür temalı afiş tasarım çalışmalarının konuya uygunluk, yaratıcılık, özgünlük, görsel seçim, Türkçe kullanımı ve etkileyicilik açısından değerlendirilmesi (100 Puan).',
    maxLevelPoints: 4,
    createdAt: '2026-10-24',
    version: 3,
    criteria: [
      {
        id: 'crit-af-1',
        title: 'Konuya uygunluk',
        category: 'İçerik',
        weight: 15,
        maxPoints: 15,
        required: true,
        levels: createCriterionLevels(
          'Afiş içeriği belirlenen konu ve amaçla örtüşmemektedir.',
          'Konuya değinilmiş ancak afişin ana mesajı belirsiz kalmıştır.',
          'Afişteki metin ve görsel unsurlar belirlenen konuya ve hedefe uygundur.',
          'Konu ve ana ileti, afişin tüm bileşenlerinde tam bir odak ve bütünlükle yansıtılmıştır.'
        ),
      },
      {
        id: 'crit-af-2',
        title: 'Yaratıcılık',
        category: 'Tasarım',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Tasarım sıradandır; görsel ve metinsel düzenlemede estetik çaba görülmemektedir.',
          'Temel bir yerleşim yapılmış ancak yaratıcı fikir ve tasarım unsurları sınırlıdır.',
          'Renk, tipografi, slogan ve görsel kurguda yaratıcı bir tasarım anlayışı sergilenmiştir.',
          'Metaforik anlatım, estetik kompozisyon ve çarpıcı tasarım fikirleriyle üst düzey yaratıcılık gösterilmiştir.'
        ),
      },
      {
        id: 'crit-af-3',
        title: 'Özgünlük',
        category: 'Yaratıcılık',
        weight: 15,
        maxPoints: 15,
        required: true,
        levels: createCriterionLevels(
          'Hazır bir şablon veya mevcut bir afiş doğrudan kopyalanmıştır.',
          'Mevcut örneklerden yoğun biçimde esinlenilmiş, özgün katkı az kalmıştır.',
          'Afişin sloganı, düzeni ve kurgusu öğrencinin kendi emeğini ve özgün fikrini yansıtmaktadır.',
          'Tamamen özgün konsept, slogan ve görsel kompozisyonla benzersiz bir çalışma ortaya konulmuştur.'
        ),
      },
      {
        id: 'crit-af-4',
        title: 'Görsel/işitsel ögelerin seçimi',
        category: 'Görsel Tasarım',
        weight: 15,
        maxPoints: 15,
        required: true,
        levels: createCriterionLevels(
          'Seçilen görseller konuyla uyumsuz, düşük çözünürlüklü veya karmaşıktır.',
          'Görseller konuyla ilişkili olsa da metin-görsel dengesi yeterince sağlanamamıştır.',
          'Konuyu destekleyen, net ve mesajı güçlendiren görsel/işitsel ögeler dengeli biçimde seçilmiştir.',
          'Görsel hiyerarşi, renk uyumu ve sembolik ögeler mesajı ilk bakışta iletecek ustalıkla seçilmiştir.'
        ),
      },
      {
        id: 'crit-af-5',
        title: 'Türkçenin doğru kullanımı',
        category: 'Dil ve Yazım',
        weight: 15,
        maxPoints: 15,
        required: true,
        levels: createCriterionLevels(
          'Afiş metinlerinde yazım, noktalama ve anlatım yanlışları bulunmaktadır.',
          'Kısa metinlerde dikkat çeken birkaç yazım veya ifade hatası vardır.',
          'Başlık, slogan ve bilgilendirme metinlerinde Türkçe doğru ve kurallara uygun kullanılmıştır.',
          'Özlü, vurucu, yazım ve noktalama açısından kusursuz bir Türkçe kullanımı sergilenmiştir.'
        ),
      },
      {
        id: 'crit-af-6',
        title: 'Etkileyicilik',
        category: 'İletişim Etkisi',
        weight: 20,
        maxPoints: 20,
        required: true,
        levels: createCriterionLevels(
          'Afiş dikkat çekici değildir ve izleyenlerde merak uyandırmamaktadır.',
          'İlk bakışta fark edilse de mesajın akılda kalıcılığı zayıftır.',
          'Görsel düzeni ve sloganıyla izleyicinin dikkatini çeken, mesajını etkili biçimde ileten bir afiştir.',
          'Estetik gücü, çarpıcı sloganı ve bütünsel tasarımıyla izleyicide güçlü ve kalıcı bir etki bırakmaktadır.'
        ),
      },
    ],
  },
  // Sınıf düzeyi bağımsız kitap okuma ve sunum rubrikleri (Türk Dili ve Edebiyatı — 9, 10, 11 ve 12. Sınıflar)
  LITERARY_BOOK_PRESENTATION_RUBRIC,
  INFORMATIVE_BOOK_PRESENTATION_RUBRIC,
];

export const INITIAL_SESSIONS: EvaluationSession[] = [];

export const QUICK_OBSERVATION_TAGS: string[] = [
  'Aktif Katılım',
  'Dikkatli Gözlem',
  'Tam Hazırlık',
  'Grup İçi Liderlik',
  'Çözüm Odaklı',
  'Yapay Zeka İçeriği',
  'Düzenli Veri Kaydı',
  'Ek Rehberlik Gerekli',
  'Sorgulayıcı Yaklaşım',
];
