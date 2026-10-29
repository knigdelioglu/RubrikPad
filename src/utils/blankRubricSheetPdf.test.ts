import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_RUBRICS } from '../data/seedData.ts';
import { INFORMATIVE_BOOK_PRESENTATION_RUBRIC } from '../data/bookPresentationRubric.ts';
import { decodePdfTextWithToUnicode, generateBlankRubricSheetPdfBytes, normalizePdfTextLine } from './pdfGenerator.ts';
import type { Classroom, Student } from '../types.ts';

const classroom: Classroom = { id: 'class-a', gradeLevel: '11. Sınıf', name: 'A', subject: 'Türk Dili ve Edebiyatı', academicYear: '2026-2027' };
const roster: Student[] = [
  { id: '2', studentNumber: '20', fullName: 'Çağla Öğrenci', classId: 'class-a' },
  { id: '1', studentNumber: '3', fullName: 'İpek Öğrenci', classId: 'class-a' },
  { id: '3', studentNumber: '4', fullName: 'Arşivdeki Öğrenci', classId: 'class-a', archived: true },
  { id: '4', studentNumber: '5', fullName: 'Başka Sınıftaki Öğrenci', classId: 'class-b' },
];

test('blank class sheet includes selected students and criterion labels, without other students', () => {
  const rubric = INITIAL_RUBRICS.find(item => item.id === 'rub-tde-iletisim-engelleri')!;
  const bytes = generateBlankRubricSheetPdfBytes(rubric, classroom, roster);
  const text = decodePdfTextWithToUnicode(bytes).replace(/\s+/g, ' ');
  assert.equal(new TextDecoder('ascii').decode(bytes.slice(0, 8)), '%PDF-1.4');
  assert.ok(text.includes('11/A Sınıfı'));
  assert.ok(text.includes(normalizePdfTextLine(rubric.title)));
  for (const criterion of rubric.criteria) assert.ok(text.includes(normalizePdfTextLine(criterion.title)));
  assert.ok(text.includes('İpek Öğrenci') && text.includes('Çağla Öğrenci'));
  assert.ok(text.indexOf('İpek Öğrenci') < text.indexOf('Çağla Öğrenci'));
  assert.ok(!text.includes('Arşivdeki Öğrenci') && !text.includes('Başka Sınıftaki Öğrenci'));
  assert.match(new TextDecoder('latin1').decode(bytes), / re S Q/);
  assert.throws(() => generateBlankRubricSheetPdfBytes(rubric, classroom, []), /aktif öğrenci/);
});

test('dual rubric has separate grids with the actual book and speaking criterion maxima', () => {
  const text = decodePdfTextWithToUnicode(generateBlankRubricSheetPdfBytes(INFORMATIVE_BOOK_PRESENTATION_RUBRIC, classroom, roster)).replace(/\s+/g, ' ');
  assert.ok(text.includes('Kitap Sunumu') && text.includes('Konuşma Sınavı'));
  assert.ok(text.includes('K5 (10)'));
  assert.ok(text.includes('K5 (15)'));
  assert.ok(text.includes('K10 (5)'));
});

test('large rosters and many criteria continue across pages without dropping students or criteria', () => {
  const rubric = structuredClone(INITIAL_RUBRICS[0]);
  rubric.criteria = Array.from({ length: 12 }, (_, i) => ({ ...rubric.criteria[0], id: `criterion-${i}`, title: `Ölçüt Başlığı ${i + 1}` }));
  const students = Array.from({ length: 60 }, (_, i) => ({ id: `${i}`, studentNumber: `${i}`, fullName: `Öğrenci ${i}`, classId: classroom.id }));
  const bytes = generateBlankRubricSheetPdfBytes(rubric, classroom, students);
  const text = decodePdfTextWithToUnicode(bytes).replace(/\s+/g, ' ');
  for (let i = 0; i < 60; i++) assert.ok(text.includes(`Öğrenci ${i}`));
  for (let i = 1; i <= 12; i++) assert.ok(text.includes(`Ölçüt Başlığı ${i}`));
  assert.ok((new TextDecoder('latin1').decode(bytes).match(/\/Type \/Page\b/g) || []).length > 2);
});
