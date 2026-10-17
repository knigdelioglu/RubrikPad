import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWeightedScore,
  applyGroupScoresToMembers,
  applyCriterionScoreToStudents,
  getNextUnscoredCriterion,
  getNextPendingStudent,
  parseStudentRosterText,
  getStudentProgressHistory,
  generateSessionCsv,
} from './rubricLogic.ts';
import type { Rubric, StudentGroup, StudentEvaluation, EvaluationSession, Student } from '../types.ts';

const sampleRubric: Rubric = {
  id: 'rub-1',
  title: 'Fen Bilimleri Deney Rubriği',
  subject: 'Fen Bilimleri',
  description: 'Laboratuvar becerileri değerlendirmesi',
  maxLevelPoints: 4,
  createdAt: '2026-10-01',
  criteria: [
    {
      id: 'c1',
      title: 'Hipotez Kurma',
      category: 'Bilimsel Süreç',
      weight: 40,
      levels: [
        { level: 1, label: 'Geliştirilmeli', points: 1, description: 'Eksik' },
        { level: 2, label: 'Kabul Edilebilir', points: 2, description: 'Kısmen' },
        { level: 3, label: 'Yetkin', points: 3, description: 'Tam' },
        { level: 4, label: 'Örnek Düzey', points: 4, description: 'Özgün' },
      ],
    },
    {
      id: 'c2',
      title: 'Veri Kaydı ve Analiz',
      category: 'Uygulama',
      weight: 60,
      levels: [
        { level: 1, label: 'Geliştirilmeli', points: 1, description: 'Eksik' },
        { level: 2, label: 'Kabul Edilebilir', points: 2, description: 'Kısmen' },
        { level: 3, label: 'Yetkin', points: 3, description: 'Tam' },
        { level: 4, label: 'Örnek Düzey', points: 4, description: 'Özgün' },
      ],
    },
  ],
};

test('calculateWeightedScore computes accurate weighted score out of 100', () => {
  // c1 = 4/4 (100% of 40 = 40), c2 = 2/4 (50% of 60 = 30) -> total = 70
  const result = calculateWeightedScore(sampleRubric, { c1: 4, c2: 2 });
  assert.equal(result.scoreOutOf100, 70);
  assert.equal(result.rawPoints, 6);
  assert.equal(result.maxRawPoints, 8);
  assert.equal(result.isComplete, true);
  assert.equal(result.performanceBand, 'Yetkin');
});

test('calculateWeightedScore handles unstarted evaluations cleanly', () => {
  const result = calculateWeightedScore(sampleRubric, {});
  assert.equal(result.scoreOutOf100, 0);
  assert.equal(result.completedCriteriaCount, 0);
  assert.equal(result.isComplete, false);
  assert.equal(result.performanceBand, 'Baslanmadi');
});

test('applyGroupScoresToMembers copies group scores and appends group observation notes to all members', () => {
  const initialEvals: Record<string, StudentEvaluation> = {
    'stu-1': {
      studentId: 'stu-1',
      criterionScores: { c1: 2 },
      note: 'Bireysel ön hazırlığı tam.',
      tags: ['Aktif Katılım'],
      updatedAt: '2026-10-10T10:00:00Z',
    },
  };

  const group: StudentGroup = {
    id: 'grp-1',
    name: 'Grup Alfa',
    studentIds: ['stu-1', 'stu-2'],
    criterionScores: { c1: 4, c2: 3 },
    groupNote: 'Deney düzeneğini birlikte hatasız kurdular.',
  };

  const updated = applyGroupScoresToMembers(initialEvals, group, '2026-10-16T12:00:00Z');

  assert.equal(updated['stu-1'].criterionScores.c1, 4);
  assert.equal(updated['stu-1'].criterionScores.c2, 3);
  assert.ok(updated['stu-1'].note.includes('Bireysel ön hazırlığı tam.'));
  assert.ok(updated['stu-1'].note.includes('[Grup Alfa]: Deney düzeneğini birlikte hatasız kurdular.'));
  assert.equal(updated['stu-2'].criterionScores.c1, 4);
  assert.equal(updated['stu-2'].evaluatedViaGroup, 'Grup Alfa');
});

test('parseStudentRosterText extracts student numbers and Turkish names from noisy OCR lines', () => {
  const rawOcr = `
    101 - Ayşe Yılmaz
    No: 102 Kerem Demir
    103. Zeynep Çelik
    Mert Kaya
  `;
  const parsed = parseStudentRosterText(rawOcr, 300);
  assert.equal(parsed.length, 4);
  assert.deepEqual(parsed[0], { studentNumber: '101', fullName: 'Ayşe Yılmaz' });
  assert.deepEqual(parsed[1], { studentNumber: '102', fullName: 'Kerem Demir' });
  assert.deepEqual(parsed[2], { studentNumber: '103', fullName: 'Zeynep Çelik' });
  assert.deepEqual(parsed[3], { studentNumber: '300', fullName: 'Mert Kaya' });
});

test('getStudentProgressHistory returns chronological scores and generateSessionCsv outputs valid CSV', () => {
  const students: Student[] = [
    { id: 'stu-1', studentNumber: '101', fullName: 'Ayşe Yılmaz', classId: 'cls-1' },
  ];
  const sessions: EvaluationSession[] = [
    {
      id: 'ses-2',
      title: '2. Deney Değerlendirmesi',
      classId: 'cls-1',
      rubricId: 'rub-1',
      date: '2026-10-15',
      status: 'completed',
      mode: 'individual',
      evaluations: {
        'stu-1': {
          studentId: 'stu-1',
          criterionScores: { c1: 4, c2: 4 },
          note: 'Harika gelişim.',
          tags: ['Örnek'],
          updatedAt: '2026-10-15',
        },
      },
      groups: [],
      generalSessionNote: '',
    },
    {
      id: 'ses-1',
      title: '1. Deney Değerlendirmesi',
      classId: 'cls-1',
      rubricId: 'rub-1',
      date: '2026-10-01',
      status: 'completed',
      mode: 'individual',
      evaluations: {
        'stu-1': {
          studentId: 'stu-1',
          criterionScores: { c1: 2, c2: 2 },
          note: 'Başlangıç düzeyi.',
          tags: [],
          updatedAt: '2026-10-01',
        },
      },
      groups: [],
      generalSessionNote: '',
    },
  ];

  const history = getStudentProgressHistory('stu-1', sessions, { 'rub-1': sampleRubric });
  assert.equal(history.length, 2);
  assert.equal(history[0].scoreOutOf100, 50);
  assert.equal(history[1].scoreOutOf100, 100);

  const csv = generateSessionCsv(sessions[0], sampleRubric, students);
  assert.ok(csv.includes('Ayşe Yılmaz'));
  assert.ok(csv.includes('100'));
});

test('applyCriterionScoreToStudents assigns criterion points in bulk and respects onlyUnscored flag', () => {
  const initial: Record<string, StudentEvaluation> = {
    'stu-1': {
      studentId: 'stu-1',
      criterionScores: { c1: 4 },
      note: 'Mevcut not',
      tags: [],
      updatedAt: '2026-10-16T09:00:00Z',
    },
  };

  // Fill only unscored students for c1 with 3 points
  const afterUnscoredFill = applyCriterionScoreToStudents(
    initial,
    ['stu-1', 'stu-2'],
    'c1',
    3,
    '2026-10-16T10:00:00Z',
    true
  );
  assert.equal(afterUnscoredFill['stu-1'].criterionScores.c1, 4); // preserved
  assert.equal(afterUnscoredFill['stu-2'].criterionScores.c1, 3); // filled

  // Overwrite all students for c2 with 4 points
  const afterAllFill = applyCriterionScoreToStudents(
    afterUnscoredFill,
    ['stu-1', 'stu-2'],
    'c2',
    4,
    '2026-10-16T10:05:00Z',
    false
  );
  assert.equal(afterAllFill['stu-1'].criterionScores.c2, 4);
  assert.equal(afterAllFill['stu-2'].criterionScores.c2, 4);
});

test('getNextUnscoredCriterion detects next pending criterion or returns null if all completed', () => {
  // Empty scores -> returns first criterion c1
  const first = getNextUnscoredCriterion(sampleRubric.criteria, {});
  assert.equal(first?.criterion.id, 'c1');
  assert.equal(first?.index, 0);

  // c1 scored -> returns c2
  const second = getNextUnscoredCriterion(sampleRubric.criteria, { c1: 3 });
  assert.equal(second?.criterion.id, 'c2');
  assert.equal(second?.index, 1);

  // Both c1 and c2 scored -> returns null
  const finished = getNextUnscoredCriterion(sampleRubric.criteria, { c1: 3, c2: 4 });
  assert.equal(finished, null);
});

test('getNextPendingStudent skips completed students and loops to next pending student', () => {
  const students: Student[] = [
    { id: 's1', studentNumber: '101', fullName: 'Ali', classId: 'cls-1' },
    { id: 's2', studentNumber: '102', fullName: 'Ayşe', classId: 'cls-1' },
    { id: 's3', studentNumber: '103', fullName: 'Burak', classId: 'cls-1' },
  ];

  const evaluations: Record<string, StudentEvaluation> = {
    // s1 completed
    s1: {
      studentId: 's1',
      criterionScores: { c1: 4, c2: 4 },
      note: '',
      tags: [],
      updatedAt: '2026-10-16T10:00:00Z',
    },
    // s2 partial
    s2: {
      studentId: 's2',
      criterionScores: { c1: 3 },
      note: '',
      tags: [],
      updatedAt: '2026-10-16T10:00:00Z',
    },
    // s3 unstarted
    s3: {
      studentId: 's3',
      criterionScores: {},
      note: '',
      tags: [],
      updatedAt: '2026-10-16T10:00:00Z',
    },
  };

  // From s1, next pending should be s2
  const nextFromS1 = getNextPendingStudent(students, evaluations, sampleRubric, 's1');
  assert.equal(nextFromS1?.id, 's2');

  // From s2, next pending should be s3
  const nextFromS2 = getNextPendingStudent(students, evaluations, sampleRubric, 's2');
  assert.equal(nextFromS2?.id, 's3');
});

test('calculateWeightedScore supports criterion maxPoints and 8-criterion rubrics accurately', () => {
  const eightCriteriaRubric: Rubric = {
    id: 'rub-8',
    title: '8 Kriterli Deney Rubriği',
    subject: 'Fen Bilimleri',
    description: '8 kriterli değerlendirme',
    maxLevelPoints: 4,
    createdAt: '2026-10-17',
    criteria: Array.from({ length: 8 }, (_, idx) => ({
      id: `c-${idx + 1}`,
      title: `Kriter ${idx + 1}`,
      category: 'Süreç',
      weight: 12.5,
      maxPoints: idx < 4 ? 15 : 10, // 4*15 + 4*10 = 100 points total
      levels: [
        { level: 1, label: 'Destek Gerekli', points: 1, description: '' },
        { level: 2, label: 'Gelişmekte', points: 2, description: '' },
        { level: 3, label: 'Yetkin', points: 3, description: '' },
        { level: 4, label: 'Örnek Düzey', points: 4, description: '' },
      ],
    })),
  };

  // All 8 criteria at full level (4) -> 100 points
  const fullScores: Record<string, number> = {};
  for (let i = 1; i <= 8; i++) fullScores[`c-${i}`] = 4;

  const resFull = calculateWeightedScore(eightCriteriaRubric, fullScores);
  assert.equal(resFull.scoreOutOf100, 100);
  assert.equal(resFull.completedCriteriaCount, 8);
  assert.equal(resFull.totalCriteriaCount, 8);
  assert.equal(resFull.isComplete, true);
});


