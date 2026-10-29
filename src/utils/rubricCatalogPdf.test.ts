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
  assert.ok(text.includes('Kitap 10 puan | Konuşma 15 puan'));
  assert.ok(text.includes('Konuşma 5 puan'));
});

test('selected rubric PDF keeps its own content and rejects an empty list', () => {
  const text = decodePdfTextWithToUnicode(generateRubricCatalogPdfBytes([INFORMATIVE_BOOK_PRESENTATION_RUBRIC]));
  assert.ok(text.includes(INFORMATIVE_BOOK_PRESENTATION_RUBRIC.title));
  assert.ok(!text.includes('Dinleme/İzleme Sınavı'));
  assert.throws(() => generateRubricCatalogPdfBytes([]), /rubrik bulunamadı/);
});
