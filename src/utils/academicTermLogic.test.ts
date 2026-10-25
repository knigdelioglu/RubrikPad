import test from 'node:test';
import assert from 'node:assert/strict';
import type { EvaluationSession, Rubric } from '../types.ts';
import {
  ALL_ACADEMIC_TERMS,
  computeTermComparisonAnalytics,
  deriveAcademicTermFromDate,
  getAcademicTermOptions,
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
  assert.equal(deriveAcademicTermFromDate('2026-02-01T12:00:00Z'), '2025-2026 Bahar');
});
