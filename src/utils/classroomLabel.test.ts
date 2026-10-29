import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClassroomLabel } from './classroomLabel.ts';
import type { Classroom } from '../types.ts';

const classroom: Classroom = { id: 'a', gradeLevel: '11. Sınıf', name: 'A', subject: 'Türk Dili ve Edebiyatı', academicYear: '2026-2027' };

test('classroom labels combine grade and branch without duplicating complete names', () => {
  assert.equal(formatClassroomLabel(classroom), '11/A');
  assert.equal(formatClassroomLabel({ ...classroom, name: '11/A' }), '11/A');
  assert.equal(formatClassroomLabel({ ...classroom, name: '11-A Sınıfı' }), '11-A Sınıfı');
  assert.equal(formatClassroomLabel({ ...classroom, gradeLevel: '', name: 'A' }), 'A');
  assert.equal(formatClassroomLabel({ ...classroom, name: '' }), '11. Sınıf');
});
