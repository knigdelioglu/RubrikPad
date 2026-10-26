import test from 'node:test';
import assert from 'node:assert/strict';
import type { EvaluationSession, Rubric, Student } from '../types.ts';
import {
  ALL_ACADEMIC_TERMS,
  addAcademicTerm,
  calculateScorePercentageChange,
  computeStudentTermPercentageComparison,
  computeTermComparisonAnalytics,
  deleteAcademicTerm,
  deriveAcademicTermFromDate,
  getCurrentAcademicTerm,
  ensureAutoAcademicTerms,
  getAcademicTermOptions,
  getPreviousAcademicTerm,
} from './academicTermLogic.ts';

const rubric: Rubric = {
  id: 'rubric', title: 'Test', subject: 'Test', description: '',
  maxLevelPoints: 4, createdAt: '2024-01-01',
  criteria: [{
    id: 'criterion', title: 'Test', category: '', weight: 100, maxPoints: 100,
    levels: [{ level: 4, label: 'Test', points: 4, description: '' }],
  }],
};

function session(date: string, score: number): EvaluationSession {
  return {
    id: date, title: date, date, classId: 'class', rubricId: rubric.id,
    status: 'completed', mode: 'individual', groups: [], generalSessionNote: '',
    evaluations: {
      student: {
        studentId: 'student', criterionScores: {},
        directCriterionScores: { criterion: score },
        note: '', tags: [], updatedAt: date,
      },
    },
  };
}

test('all-term progress compares earliest and latest semesters regardless of input or preset order', () => {
  const sessions = [session('2028-03-01', 90), session('2023-10-01', 20), session('2024-10-01', 60)];
  for (const studentId of [undefined, 'student']) {
    const result = computeTermComparisonAnalytics(sessions, { rubric }, ALL_ACADEMIC_TERMS, undefined, studentId);
    assert.equal(result.comparisonSnapshot?.term, '2023-2024 Güz');
    assert.equal(result.scoreDelta, 70);
    assert.deepEqual(
      result.termBreakdown.filter((term) => term.sessionCount > 0).map((term) => term.term),
      ['2023-2024 Güz', '2024-2025 Güz', '2027-2028 Bahar']
    );
  }
});

test('semesters sort by year and then autumn before spring in options and comparisons', () => {
  const sessions = [session('2028-03-01', 90), session('2027-10-01', 20)];
  const options = getAcademicTermOptions(sessions);
  assert.deepEqual(options.slice(-2).map((term) => term.value), ['2027-2028 Güz', '2027-2028 Bahar']);
  const result = computeTermComparisonAnalytics(sessions, { rubric }, ALL_ACADEMIC_TERMS);
  assert.equal(result.scoreDelta, 70);
});

test('invalid calendar dates use the academic-year fallback instead of inventing a semester', () => {
  for (const date of ['2026-00-15', '2026-13-01', '2026-02-29', '2026-04-31', '2026-10-00', '2026-10-25garbage']) {
    assert.equal(deriveAcademicTermFromDate(date, '2030-2031'), '2030-2031 Güz', date);
  }
  assert.equal(deriveAcademicTermFromDate('2024-02-29'), '2023-2024 Bahar');
  assert.equal(deriveAcademicTermFromDate('2026-01-01'), '2025-2026 Güz');
  assert.equal(deriveAcademicTermFromDate('2026-09'), '2026-2027 Güz');
  // 15 Şubat öncesi Güz (1. dönem sonu), 15 Şubat ve sonrası Bahar
  assert.equal(deriveAcademicTermFromDate('2026-02-01T12:00:00Z'), '2025-2026 Güz');
  assert.equal(deriveAcademicTermFromDate('2027-02-14'), '2026-2027 Güz');
  assert.equal(deriveAcademicTermFromDate('2027-02-15'), '2026-2027 Bahar');
  assert.equal(deriveAcademicTermFromDate('2027-02-16'), '2026-2027 Bahar');
});

test('auto-opening academic terms: February 15 and onwards automatically opens Bahar term', () => {
  // Before Feb 15 (e.g. 2027-02-10) -> 2026-2027 Güz
  const beforeFeb15 = new Date('2027-02-10T10:00:00Z');
  assert.equal(getCurrentAcademicTerm(beforeFeb15), '2026-2027 Güz');
  const termsBefore = ensureAutoAcademicTerms(['2026-2027 Güz'], [], null, beforeFeb15);
  assert.deepEqual(termsBefore, ['2026-2027 Güz']);

  // On or after Feb 15 (e.g. 2027-02-15) -> 2026-2027 Bahar automatically opens
  const onFeb15 = new Date('2027-02-15T10:00:00Z');
  assert.equal(getCurrentAcademicTerm(onFeb15), '2026-2027 Bahar');
  const termsAfter = ensureAutoAcademicTerms(['2026-2027 Güz'], [], null, onFeb15);
  assert.deepEqual(termsAfter, ['2026-2027 Güz', '2026-2027 Bahar']);
});

test('addAcademicTerm and deleteAcademicTerm manage academic years and terms accurately', () => {
  const initialTerms = ['2024-2025 Güz', '2024-2025 Bahar'];

  // Add earlier academic term and check chronological order
  const added = addAcademicTerm(initialTerms, '2023-2024', 'Güz');
  assert.equal(added.addedTerm, '2023-2024 Güz');
  assert.equal(added.error, undefined);
  assert.deepEqual(added.terms, ['2023-2024 Güz', '2024-2025 Güz', '2024-2025 Bahar']);

  // Duplicate check
  const duplicate = addAcademicTerm(added.terms, '2024-2025', 'Güz');
  assert.ok(duplicate.error);
  assert.equal(duplicate.terms.length, 3);

  // Non-consecutive year validation
  const invalidYear = addAcademicTerm(added.terms, '2024-2026', 'Bahar');
  assert.ok(invalidYear.error);

  // Delete active term resets selectedTerm to ALL_ACADEMIC_TERMS
  const deleted = deleteAcademicTerm(added.terms, '2024-2025 Güz', '2024-2025 Güz');
  assert.equal(deleted.deletedTerm, '2024-2025 Güz');
  assert.equal(deleted.nextSelectedTerm, ALL_ACADEMIC_TERMS);
  assert.deepEqual(deleted.terms, ['2023-2024 Güz', '2024-2025 Bahar']);

  // Options respect managedTerms when provided
  const options = getAcademicTermOptions([], null, deleted.terms);
  assert.deepEqual(
    options.map((o) => o.value),
    [ALL_ACADEMIC_TERMS, '2023-2024 Güz', '2024-2025 Bahar']
  );
});

test('computeStudentTermPercentageComparison calculates percentage change between selected and previous term', () => {
  assert.equal(getPreviousAcademicTerm('2024-2025 Bahar'), '2024-2025 Güz');
  assert.equal(getPreviousAcademicTerm('2024-2025 Güz'), '2023-2024 Bahar');

  const pctUp = calculateScorePercentageChange(60, 75);
  assert.equal(pctUp.pointDelta, 15);
  assert.equal(pctUp.percentageChange, 25);
  assert.equal(pctUp.trend, 'up');

  const pctDown = calculateScorePercentageChange(80, 60);
  assert.equal(pctDown.pointDelta, -20);
  assert.equal(pctDown.percentageChange, -25);
  assert.equal(pctDown.trend, 'down');

  const students: Student[] = [
    { id: 'student', studentNumber: '101', fullName: 'Ayşe Yılmaz', classId: 'class' },
  ];
  const sessions = [
    session('2024-10-15', 60), // 2024-2025 Güz -> 60
    session('2025-03-20', 90), // 2024-2025 Bahar -> 90 (+50%)
  ];

  const comparison = computeStudentTermPercentageComparison(
    students,
    sessions,
    { rubric },
    '2024-2025 Bahar'
  );

  assert.equal(comparison.previousTerm, '2024-2025 Güz');
  assert.equal(comparison.currentTerm, '2024-2025 Bahar');
  assert.equal(comparison.rows.length, 1);
  assert.equal(comparison.rows[0].previousAverage, 60);
  assert.equal(comparison.rows[0].currentAverage, 90);
  assert.equal(comparison.rows[0].pointDelta, 30);
  assert.equal(comparison.rows[0].percentageChange, 50);
  assert.equal(comparison.rows[0].trend, 'up');
  assert.equal(comparison.classPercentageChange, 50);
});

import {
  normalizeClassroomBranchInput,
  validateClassroomRecord,
} from './rubricLogic.ts';

test('normalizeClassroomBranchInput strips numbers/symbols and converts Turkish letters to uppercase without Caps Lock', () => {
  assert.equal(normalizeClassroomBranchInput('a'), 'A');
  assert.equal(normalizeClassroomBranchInput('b'), 'B');
  assert.equal(normalizeClassroomBranchInput('11-a'), 'A');
  assert.equal(normalizeClassroomBranchInput('9/b '), 'B');
  assert.equal(normalizeClassroomBranchInput('iıçşğüö'), 'İIÇŞĞÜÖ');

  const validBranchA = validateClassroomRecord(
    { name: 'A', gradeLevel: '11. Sınıf', branchOnly: true },
    []
  );
  assert.equal(validBranchA.isValid, true);

  // Same branch letter in a different grade level is allowed
  const validSameBranchDifferentGrade = validateClassroomRecord(
    { name: 'A', gradeLevel: '10. Sınıf', branchOnly: true },
    [{ id: 'c1', name: 'A', gradeLevel: '11. Sınıf', subject: 'Türk Dili ve Edebiyatı', academicYear: '2026-2027' }]
  );
  assert.equal(validSameBranchDifferentGrade.isValid, true);

  // Same branch letter in the same grade level is rejected as duplicate
  const duplicateSameGrade = validateClassroomRecord(
    { name: 'A', gradeLevel: '11. Sınıf', branchOnly: true },
    [{ id: 'c1', name: 'A', gradeLevel: '11. Sınıf', subject: 'Türk Dili ve Edebiyatı', academicYear: '2026-2027' }]
  );
  assert.equal(duplicateSameGrade.isValid, false);
});


