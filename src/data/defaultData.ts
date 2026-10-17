import { Rubric, Student, StudentEvaluation } from '../types';

export function createDefaultLevels(maxPoints: number) {
  const p0 = 0;
  const p1 = Math.round(maxPoints * 0.4);
  const p2 = Math.round(maxPoints * 0.75);
  const p3 = maxPoints;
  return [
    { id: 'lvl-1', label: 'Geliştirilmeli', points: p0 },
    { id: 'lvl-2', label: 'Orta', points: p1 },
    { id: 'lvl-3', label: 'İyi', points: p2 },
    { id: 'lvl-4', label: 'Mükemmel', points: p3 },
  ];
}

export const INITIAL_RUBRICS: Rubric[] = [
  {
    id: 'rubric-8-criteria',
    title: 'Bitirme Projesi ve Sunum Değerlendirme',
    course: 'Mühendislik Tasarımı',
    totalPoints: 100,
    createdAt: '2026-10-15',
    criteria: [
      {
        id: 'c-1',
        title: 'Problem Tanımı ve Kapsam',
        maxPoints: 10,
        levels: [
          { id: 'l-1-1', label: 'Yetersiz', points: 0 },
          { id: 'l-1-2', label: 'Geliştirilmeli', points: 4 },
          { id: 'l-1-3', label: 'İyi', points: 7 },
          { id: 'l-1-4', label: 'Tam Puan', points: 10 },
        ],
      },
      {
        id: 'c-2',
        title: 'Literatür Taraması ve Özgünlük',
        maxPoints: 10,
        levels: [
          { id: 'l-2-1', label: 'Yetersiz', points: 0 },
          { id: 'l-2-2', label: 'Geliştirilmeli', points: 4 },
          { id: 'l-2-3', label: 'İyi', points: 7 },
          { id: 'l-2-4', label: 'Tam Puan', points: 10 },
        ],
      },
      {
        id: 'c-3',
        title: 'Yöntem ve Sistem Mimarisi',
        maxPoints: 15,
        levels: [
          { id: 'l-3-1', label: 'Yetersiz', points: 0 },
          { id: 'l-3-2', label: 'Geliştirilmeli', points: 6 },
          { id: 'l-3-3', label: 'İyi', points: 11 },
          { id: 'l-3-4', label: 'Tam Puan', points: 15 },
        ],
      },
      {
        id: 'c-4',
        title: 'Uygulama ve Çalışan Prototip',
        maxPoints: 20,
        levels: [
          { id: 'l-4-1', label: 'Yetersiz', points: 0 },
          { id: 'l-4-2', label: 'Geliştirilmeli', points: 8 },
          { id: 'l-4-3', label: 'İyi', points: 15 },
          { id: 'l-4-4', label: 'Tam Puan', points: 20 },
        ],
      },
      {
        id: 'c-5',
        title: 'Test, Doğrulama ve Veri Analizi',
        maxPoints: 15,
        levels: [
          { id: 'l-5-1', label: 'Yetersiz', points: 0 },
          { id: 'l-5-2', label: 'Geliştirilmeli', points: 6 },
          { id: 'l-5-3', label: 'İyi', points: 11 },
          { id: 'l-5-4', label: 'Tam Puan', points: 15 },
        ],
      },
      {
        id: 'c-6',
        title: 'Sunum Materyali ve Görsel Düzen',
        maxPoints: 10,
        levels: [
          { id: 'l-6-1', label: 'Yetersiz', points: 0 },
          { id: 'l-6-2', label: 'Geliştirilmeli', points: 4 },
          { id: 'l-6-3', label: 'İyi', points: 7 },
          { id: 'l-6-4', label: 'Tam Puan', points: 10 },
        ],
      },
      {
        id: 'c-7',
        title: 'Süre Yönetimi ve Akıcılık',
        maxPoints: 10,
        levels: [
          { id: 'l-7-1', label: 'Yetersiz', points: 0 },
          { id: 'l-7-2', label: 'Geliştirilmeli', points: 4 },
          { id: 'l-7-3', label: 'İyi', points: 7 },
          { id: 'l-7-4', label: 'Tam Puan', points: 10 },
        ],
      },
      {
        id: 'c-8',
        title: 'Soru-Cevap ve Teknik Savunma',
        maxPoints: 10,
        levels: [
          { id: 'l-8-1', label: 'Yetersiz', points: 0 },
          { id: 'l-8-2', label: 'Geliştirilmeli', points: 4 },
          { id: 'l-8-3', label: 'İyi', points: 7 },
          { id: 'l-8-4', label: 'Tam Puan', points: 10 },
        ],
      },
    ],
  },
  {
    id: 'rubric-7-criteria',
    title: 'Laboratuvar Deney Raporu Rubriği',
    course: 'Fizik Laboratuvarı',
    totalPoints: 100,
    createdAt: '2026-10-12',
    criteria: [
      {
        id: 'lab-1',
        title: 'Amaç ve Hipotez Kurulumu',
        maxPoints: 15,
        levels: createDefaultLevels(15),
      },
      {
        id: 'lab-2',
        title: 'Deney Düzeneği ve Yöntem',
        maxPoints: 15,
        levels: createDefaultLevels(15),
      },
      {
        id: 'lab-3',
        title: 'Ölçüm Tabloları ve Veri Kaydı',
        maxPoints: 15,
        levels: createDefaultLevels(15),
      },
      {
        id: 'lab-4',
        title: 'Hesaplamalar ve Birim Doğruluğu',
        maxPoints: 20,
        levels: createDefaultLevels(20),
      },
      {
        id: 'lab-5',
        title: 'Grafik Çizimi ve Eğim Analizi',
        maxPoints: 15,
        levels: createDefaultLevels(15),
      },
      {
        id: 'lab-6',
        title: 'Hata Analizi ve Tartışma',
        maxPoints: 10,
        levels: createDefaultLevels(10),
      },
      {
        id: 'lab-7',
        title: 'Rapor Düzeni ve Kaynakça',
        maxPoints: 10,
        levels: createDefaultLevels(10),
      },
    ],
  },
  {
    id: 'rubric-4-criteria',
    title: 'Akademik Makale İnceleme Rubriği',
    course: 'Araştırma Yöntemleri',
    totalPoints: 100,
    createdAt: '2026-10-10',
    criteria: [
      {
        id: 'mak-1',
        title: 'Ana Tez ve Kavramsal Çerçeve',
        maxPoints: 25,
        levels: createDefaultLevels(25),
      },
      {
        id: 'mak-2',
        title: 'Kanıt Analizi ve Eleştirel Yaklaşım',
        maxPoints: 30,
        levels: createDefaultLevels(30),
      },
      {
        id: 'mak-3',
        title: 'Metin Organizasyonu ve Tutarlılık',
        maxPoints: 25,
        levels: createDefaultLevels(25),
      },
      {
        id: 'mak-4',
        title: 'Akademik Dil ve APA Atıf Kuralları',
        maxPoints: 20,
        levels: createDefaultLevels(20),
      },
    ],
  },
];

export const INITIAL_STUDENTS: Student[] = [
  { id: 'st-1', studentNumber: '2026101', name: 'Zeynep Kaya', className: '11-A Fen' },
  { id: 'st-2', studentNumber: '2026102', name: 'Kerem Demir', className: '11-A Fen' },
  { id: 'st-3', studentNumber: '2026103', name: 'Elif Yılmaz', className: '11-A Fen' },
  { id: 'st-4', studentNumber: '2026104', name: 'Mert Çelik', className: '11-A Fen' },
  { id: 'st-5', studentNumber: '2026105', name: 'Defne Şahin', className: '11-A Fen' },
  { id: 'st-6', studentNumber: '2026106', name: 'Canberk Aydın', className: '11-B Anadolu' },
  { id: 'st-7', studentNumber: '2026107', name: 'Selin Özkan', className: '11-B Anadolu' },
  { id: 'st-8', studentNumber: '2026108', name: 'Emirhan Koç', className: '11-B Anadolu' },
];

export const INITIAL_EVALUATIONS: StudentEvaluation[] = [
  {
    id: 'eval-1',
    rubricId: 'rubric-8-criteria',
    studentId: 'st-1',
    scores: {
      'c-1': 10,
      'c-2': 7,
      'c-3': 15,
      'c-4': 20,
      'c-5': 11,
      'c-6': 10,
      'c-7': 7,
      'c-8': 10,
    },
    selectedLevels: {
      'c-1': 'l-1-4',
      'c-2': 'l-2-3',
      'c-3': 'l-3-4',
      'c-4': 'l-4-4',
      'c-5': 'l-5-3',
      'c-6': 'l-6-4',
      'c-7': 'l-7-3',
      'c-8': 'l-8-4',
    },
    totalScore: 90,
    maxPossibleScore: 100,
    note: 'Prototip sunumu ve savunma oldukça başarılıydı.',
    updatedAt: '2026-10-16 14:20',
  },
];
