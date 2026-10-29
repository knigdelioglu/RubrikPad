import type { Rubric } from '../types.ts';

// Only exact, previously shipped wording is changed; teacher-written text stays intact.
const replacements = new Map<string, string>([
  ['Yaratıcılık', 'Özgünlük'],
  ['Özgün kurgu, yaratıcı bakış açısı ve akılda kalıcı diyaloglarla fark yaratılmıştır.', 'Özgün kurgu, farklı bakış açısı ve akılda kalıcı diyaloglarla etkili bir çalışma ortaya konulmuştur.'],
  ['Dönüştürülen metin yaratıcı replikler ve özgün sahne/durum ayrıntılarıyla zenginleştirilmiştir.', 'Dönüştürülen metin özgün replikler ve sahne/durum ayrıntılarıyla zenginleştirilmiştir.'],
  ['Standart bir canlandırma yapılmış, yaratıcı sahne/rol detayları sınırlı kalmıştır.', 'Standart bir canlandırma yapılmış, özgün sahne/rol detayları sınırlı kalmıştır.'],
  ['Karakter yorumunda ve sahne kullanımında özgün ve yaratıcı dokunuşlar sergilenmiştir.', 'Karakter yorumunda ve sahne kullanımında özgün dokunuşlar sergilenmiştir.'],
  ['Edebiyat ve kültür temalı afiş tasarım çalışmalarının konuya uygunluk, yaratıcılık, özgünlük, görsel seçim, Türkçe kullanımı ve etkileyicilik açısından değerlendirilmesi (100 Puan).', 'Edebiyat ve kültür temalı afiş tasarım çalışmalarının konuya uygunluk, tasarım yaklaşımı, özgünlük, görsel seçim, Türkçe kullanımı ve etkileyicilik açısından değerlendirilmesi (100 Puan).'],
  ['Temel bir yerleşim yapılmış ancak yaratıcı fikir ve tasarım unsurları sınırlıdır.', 'Temel bir yerleşim yapılmış ancak özgün fikir ve tasarım unsurları sınırlıdır.'],
  ['Renk, tipografi, slogan ve görsel kurguda yaratıcı bir tasarım anlayışı sergilenmiştir.', 'Renk, tipografi, slogan ve görsel kurguda özgün bir tasarım anlayışı sergilenmiştir.'],
  ['Metaforik anlatım, estetik kompozisyon ve çarpıcı tasarım fikirleriyle üst düzey yaratıcılık gösterilmiştir.', 'Metaforik anlatım, estetik kompozisyon ve çarpıcı tasarım fikirleriyle güçlü bir tasarım yaklaşımı sergilenmiştir.'],
]);

const builtInIds = new Set([
  'rub-tde-iletisim-engelleri', 'rub-tde-eposta', 'rub-tde-turk-dunyasi-konusma',
  'rub-tde-muze-izlenim-yazisi', 'rub-tde-kemal-tahir-mulakat',
  'rub-tde-diyalog-donusturme', 'rub-tde-tiyatro-canlandirma', 'rub-tde-afis',
]);

export function updateBuiltInRubricTerminology(rubric: Rubric): Rubric {
  if (!builtInIds.has(rubric.id)) return rubric;
  let changed = false;
  const replace = (value: string) => {
    const next = replacements.get(value) ?? value;
    if (next !== value) changed = true;
    return next;
  };
  const description = replace(rubric.description);
  const criteria = rubric.criteria.map(criterion => {
    let title = criterion.title;
    if (criterion.id === 'crit-af-2' && title === 'Yaratıcılık') {
      title = 'Tasarım yaklaşımı';
      changed = true;
    }
    return {
      ...criterion,
      title,
      category: replace(criterion.category),
      levels: criterion.levels.map(level => ({ ...level, description: replace(level.description) })),
    };
  });
  return changed ? { ...rubric, description, criteria } : rubric;
}
