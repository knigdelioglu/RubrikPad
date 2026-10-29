import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_RUBRICS } from '../data/seedData.ts';
import { INFORMATIVE_BOOK_PRESENTATION_RUBRIC } from '../data/bookPresentationRubric.ts';
import { generateRubricCatalogPdfBytes, decodePdfTextWithToUnicode, normalizePdfTextLine } from './pdfGenerator.ts';

test('catalog PDF contains every rubric, criterion and untruncated level descriptions', () => {
  const pdf = generateRubricCatalogPdfBytes(INITIAL_RUBRICS);
  assert.equal(new TextDecoder('ascii').decode(pdf.slice(0, 8)), '%PDF-1.4');
  const text = decodePdfTextWithToUnicode(pdf).replace(/\s+/g, ' ');
  for (const rubric of INITIAL_RUBRICS) {
    assert.ok(text.includes(normalizePdfTextLine(rubric.title)), `Missing rubric: ${rubric.title}`);
    for (const criterion of rubric.criteria) {
      assert.ok(text.includes(normalizePdfTextLine(criterion.title)), `Missing criterion: ${criterion.title}`);
      for (const level of criterion.levels) {
        assert.ok(text.includes(normalizePdfTextLine(level.description).slice(0, 30)), `Missing description: ${rubric.title} / ${criterion.title} / ${level.label}`);
      }
    }
  }
  assert.ok(text.includes('Kitap: 10 Puan Konuşma: 15 Puan'));
  assert.ok(text.includes('Konuşma: 5 Puan'));
  assert.ok(text.includes('Ölçüt | Puan & Ağırlık'));
  assert.ok(text.includes('1. Düzey - Destek Gerekli'));
  assert.match(new TextDecoder('latin1').decode(pdf), / re S Q/);
});

test('selected rubric PDF keeps its own content and rejects an empty list', () => {
  const text = decodePdfTextWithToUnicode(generateRubricCatalogPdfBytes([INFORMATIVE_BOOK_PRESENTATION_RUBRIC]));
  assert.ok(text.includes(INFORMATIVE_BOOK_PRESENTATION_RUBRIC.title));
  assert.ok(!text.includes('Dinleme/İzleme Sınavı'));
  assert.throws(() => generateRubricCatalogPdfBytes([]), /rubrik bulunamadı/);
});

test('table PDF preserves long cell content and includes all levels across page breaks', () => {
  const base = structuredClone(INITIAL_RUBRICS[0]);
  base.title = 'Uzun açıklamalı test rubriği';
  base.description = '';
  base.criteria = [base.criteria[0]];
  const description = `BAŞLANGIÇ ${'açıklama '.repeat(1200)} SONBÖLÜM`;
  base.criteria[0].levels = Array.from({ length: 6 }, (_, index) => ({
    level: index, points: index, label: `Seviye ${index}`, description: index === 0 ? description : `Özgün açıklama ${index}`,
  }));
  const bytes = generateRubricCatalogPdfBytes([base]);
  const text = decodePdfTextWithToUnicode(bytes).replace(/\s+/g, ' ');
  assert.ok(text.includes('BAŞLANGIÇ'));
  assert.ok(text.includes('SONBÖLÜM'));
  assert.equal((text.match(/açıklama\b/g) || []).length, 1205);
  assert.ok(text.includes('5. Düzey - Seviye 5'));
  assert.ok(text.includes('Özgün açıklama 5'));
  assert.ok((new TextDecoder('latin1').decode(bytes).match(/\/Type \/Page\b/g) || []).length > 2);
});
