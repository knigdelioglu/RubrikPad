import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isScoreAssigned,
  calculateWeightedScore,
  getStudentEvaluationBreakdown,
  freezeRubricSnapshot,
  getEffectiveSessionRubric,
  validateRubric,
  applyGroupScoresToMembers,
  generateBalancedRandomGroups,
  findDuplicateGroupMemberships,
  getGroupProgressHistory,
  recordSessionUndoEntry,
  parseStudentRosterText,
  validateStudentRecord,
  checkStudentDeletionImpact,
  checkRubricDeletionImpact,
  getSessionProgressStats,
  getNextPendingStudent,
  getStudentProgressHistory,
  sanitizeCsvFormulaInjection,
  generateSessionCsv,
} from './rubricLogic.ts';
import {
  computePayloadChecksum,
  createVerifiedBackupBundle,
  verifyAndParseBackupBundle,
} from './storageLayer.ts';
import { generatePaginatedSessionPdfBytes } from './pdfGenerator.ts';
import type { Rubric, Student, EvaluationSession, StudentGroup } from '../types.ts';

const sampleRubric: Rubric = {
  id: 'rub-test',
  title: 'Test Rubriği',
  subject: 'Fen Bilimleri',
  description: 'Test açıklama',
  maxLevelPoints: 4,
  createdAt: '2026-10-01',
  version: 1,
  criteria: [
    {
      id: 'c1',
      title: 'Kriter 1',
      category: 'Hazırlık',
      weight: 50,
      maxPoints: 50,
      required: true,
      levels: [
        { level: 0, label: 'Gözlenmedi', points: 0, description: 'Hiç yapılmadı' },
        { level: 1, label: 'Geliştirilmeli', points: 1, description: 'D1' },
        { level: 2, label: 'Kabul Edilebilir', points: 2, description: 'D2' },
        { level: 3, label: 'Yetkin', points: 3, description: 'D3' },
        { level: 4, label: 'Örnek Düzey', points: 4, description: 'D4' },
      ],
    },
    {
      id: 'c2',
      title: 'Kriter 2',
      category: 'Uygulama',
      weight: 50,
      maxPoints: 50,
      required: true,
      levels: [
        { level: 0, label: 'Gözlenmedi', points: 0, description: 'Hiç yapılmadı' },
        { level: 1, label: 'Geliştirilmeli', points: 1, description: 'D1' },
        { level: 2, label: 'Kabul Edilebilir', points: 2, description: 'D2' },
        { level: 3, label: 'Yetkin', points: 3, description: 'D3' },
        { level: 4, label: 'Örnek Düzey', points: 4, description: 'D4' },
      ],
    },
  ],
};

test('P0 #1: 0 points is treated as a valid assigned score, while null/undefined is unscored', () => {
  assert.equal(isScoreAssigned(0), true);
  assert.equal(isScoreAssigned(3), true);
  assert.equal(isScoreAssigned(null), false);
  assert.equal(isScoreAssigned(undefined), false);

  // Student scores 0 on c1 and 4 on c2 -> both criteria are completed!
  const resWithZero = calculateWeightedScore(sampleRubric, { c1: 0, c2: 4 });
  assert.equal(resWithZero.completedCriteriaCount, 2);
  assert.equal(resWithZero.isComplete, true);
  assert.equal(resWithZero.finalScoreOutOf100, 50); // 0% of 50 + 100% of 50 = 50
  assert.equal(resWithZero.scoreOutOf100, 50);

  // Student scores 0 on both c1 and c2 -> complete with finalScoreOutOf100 = 0
  const resAllZero = calculateWeightedScore(sampleRubric, { c1: 0, c2: 0 });
  assert.equal(resAllZero.isComplete, true);
  assert.equal(resAllZero.finalScoreOutOf100, 0);
  assert.equal(resAllZero.performanceLabel, 'Destek Gerekli');
});

test('P0 #2: Partial evaluation does not produce a definitive final score out of 100', () => {
  const partialRes = calculateWeightedScore(sampleRubric, { c1: 4, c2: null });
  assert.equal(partialRes.completedCriteriaCount, 1);
  assert.equal(partialRes.isComplete, false);
  assert.equal(partialRes.finalScoreOutOf100, null);
  assert.ok(partialRes.provisionalScoreOutOf100 > 0);
  assert.match(partialRes.performanceLabel, /Eksik Ölçüt/);
});

test('P0 #3: Frozen rubric snapshot protects past session scores when template rubric is edited', () => {
  const frozenSnapshot = freezeRubricSnapshot(sampleRubric);
  const session: EvaluationSession = {
    id: 'ses-1',
    title: 'Deney 1',
    classId: 'cls-7a',
    rubricId: 'rub-test',
    rubricSnapshot: frozenSnapshot,
    date: '2026-10-01',
    status: 'completed',
    mode: 'individual',
    generalSessionNote: '',
    groups: [],
    evaluations: {
      s1: {
        studentId: 's1',
        criterionScores: { c1: 4, c2: 2 }, // 50 + 25 = 75
        note: '',
        tags: [],
        updatedAt: '2026-10-01',
      },
    },
  };

  // Mutate the live rubric template weights drastically (e.g. 90% and 10%)
  const modifiedLiveRubric: Rubric = {
    ...sampleRubric,
    criteria: [
      { ...sampleRubric.criteria[0], weight: 90, maxPoints: 90 },
      { ...sampleRubric.criteria[1], weight: 10, maxPoints: 10 },
    ],
  };

  const effective = getEffectiveSessionRubric(session, { 'rub-test': modifiedLiveRubric });
  assert.ok(effective);
  const score = calculateWeightedScore(effective, session.evaluations['s1'].criterionScores);
  // Because session uses frozen snapshot (50/50 weights), score remains 75, NOT 95!
  assert.equal(score.finalScoreOutOf100, 75);
});

test('P0 #4: Group evaluation stores group scores separately without overwriting individual scores', () => {
  const existingEvaluations = {
    s1: {
      studentId: 's1',
      criterionScores: { c1: 2, c2: 2 }, // Individual score = 50
      note: 'Bireysel gözlem notu',
      tags: ['Dikkatli Gözlem'],
      updatedAt: '2026-10-10T10:00:00Z',
    },
  };

  const group: StudentGroup = {
    id: 'g1',
    name: 'Grup Alfa',
    studentIds: ['s1', 's2'],
    criterionScores: { c1: 4, c2: 4 }, // Group score = 100
    groupNote: 'Grup ortak raporu kusursuz',
  };

  const updated = applyGroupScoresToStudentsOrMembers(existingEvaluations, group);

  function applyGroupScoresToStudentsOrMembers(
    evals: typeof existingEvaluations,
    grp: StudentGroup
  ) {
    return applyGroupScoresToMembers(evals, grp, '2026-10-10T11:00:00Z');
  }

  // Individual scores on s1 MUST remain untouched ({ c1: 2, c2: 2 })
  assert.deepEqual(updated['s1'].criterionScores, { c1: 2, c2: 2 });
  assert.equal(updated['s1'].note, 'Bireysel gözlem notu');
  // Group scores are stored in groupCriterionScores
  assert.deepEqual(updated['s1'].groupCriterionScores, { c1: 4, c2: 4 });
  assert.equal(updated['s1'].groupNote, 'Grup ortak raporu kusursuz');

  const breakdownS1 = getStudentEvaluationBreakdown(sampleRubric, updated['s1']);
  assert.equal(breakdownS1.individualCalc.finalScoreOutOf100, 50);
  assert.equal(breakdownS1.groupCalc.finalScoreOutOf100, 100);
});

test('P0 #5 & P1: OCR / Roster parser requires real student numbers and validates separate First & Last name', () => {
  const rawInput = `
101 - Elif Yılmaz
Kerem Demir
103\tZeynep
104 - Mert Çelik
`;
  const rows = parseStudentRosterText(rawInput);
  assert.equal(rows.length, 4);

  // Row 1: Valid ("101", "Elif", "Yılmaz")
  assert.equal(rows[0].isValid, true);
  assert.equal(rows[0].studentNumber, '101');
  assert.equal(rows[0].firstName, 'Elif');
  assert.equal(rows[0].lastName, 'Yılmaz');

  // Row 2: Missing student number -> NOT fabricated, marked invalid!
  assert.equal(rows[1].isValid, false);
  assert.equal(rows[1].studentNumber, '');
  assert.ok(rows[1].validationErrors.some((e) => e.includes('Okul numarası eksik')));

  // Row 3: Missing last name -> marked invalid!
  assert.equal(rows[2].isValid, false);
  assert.ok(rows[2].validationErrors.some((e) => e.includes('Öğrenci soyadı eksik')));

  // Row 4: Valid ("104", "Mert", "Çelik")
  assert.equal(rows[3].isValid, true);
  assert.equal(rows[3].firstName, 'Mert');
  assert.equal(rows[3].lastName, 'Çelik');
});

test('P0 #6: Transactional storage backup checksum verification rejects tampered backups', () => {
  const payload = {
    classrooms: [{ id: 'c1', name: '7-A', gradeLevel: '7. Sınıf', subject: 'Fen', academicYear: '2026-2027' }],
    students: [{ id: 's1', studentNumber: '101', firstName: 'Elif', lastName: 'Yılmaz', fullName: 'Elif Yılmaz', classId: 'c1' }],
    rubrics: [sampleRubric],
    sessions: [],
  };

  const bundle = createVerifiedBackupBundle(payload);
  assert.ok(bundle.checksum);
  assert.equal(bundle.checksum, computePayloadChecksum(bundle.payload));

  const validCheck = verifyAndParseBackupBundle(JSON.stringify(bundle));
  assert.equal(validCheck.isValid, true);

  // Tamper with a student name inside the JSON without updating checksum
  const tampered = JSON.parse(JSON.stringify(bundle));
  tampered.payload.students[0].fullName = 'Sahte Öğrenci';
  const invalidCheck = verifyAndParseBackupBundle(JSON.stringify(tampered));
  assert.equal(invalidCheck.isValid, false);
  assert.match(invalidCheck.error || '', /Checksum/i);
});

test('P0 #7: Referential integrity rules for duplicate students, student deletion, and rubric deletion', () => {
  const existingStudents: Student[] = [
    { id: 's1', studentNumber: '101', firstName: 'Elif', lastName: 'Yılmaz', fullName: 'Elif Yılmaz', classId: 'cls-7a' },
  ];

  const dupNum = validateStudentRecord(
    { studentNumber: '101', firstName: 'Başka', lastName: 'İsim' },
    existingStudents
  );
  assert.equal(dupNum.isValid, false);

  const sessions: EvaluationSession[] = [
    {
      id: 'ses-1',
      title: 'Oturum 1',
      classId: 'cls-7a',
      rubricId: 'rub-test',
      date: '2026-10-01',
      status: 'in_progress',
      mode: 'individual',
      generalSessionNote: '',
      groups: [],
      evaluations: {
        s1: { studentId: 's1', criterionScores: { c1: 3 }, note: '', tags: [], updatedAt: '' },
      },
    },
  ];

  const studentImpact = checkStudentDeletionImpact('s1', sessions);
  assert.equal(studentImpact.sessionCount, 1);
  assert.equal(studentImpact.hasHistory, true);

  const rubricImpact = checkRubricDeletionImpact('rub-test', [sampleRubric, { ...sampleRubric, id: 'rub-2' }], sessions);
  assert.equal(rubricImpact.canDelete, true);
  assert.equal(rubricImpact.usedInSessionsCount, 1);
});

test('P1: Rubric validation enforces total weight = 100, total points = 100, and valid levels', () => {
  const validCheck = validateRubric(sampleRubric);
  assert.equal(validCheck.isValid, true);
  assert.equal(validCheck.errors.length, 0);

  const invalidRubric: Rubric = {
    ...sampleRubric,
    criteria: [
      { ...sampleRubric.criteria[0], weight: 40, maxPoints: 40 },
      { ...sampleRubric.criteria[1], weight: 40, maxPoints: 40 },
    ],
  };
  const invalidCheck = validateRubric(invalidRubric);
  assert.equal(invalidCheck.isValid, false);
  assert.ok(invalidCheck.errors.some((e) => e.includes('100 olmalıdır')));
});

test('P1: Direct integer scoring within criterion boundaries (0..maxPoints)', () => {
  // Criterion 1 maxPoints = 50, Criterion 2 maxPoints = 50
  // Give direct scores: c1 = 37 / 50, c2 = 44 / 50 -> total = 81 / 100
  const calc = calculateWeightedScore(sampleRubric, {}, { c1: 37, c2: 44 });
  assert.equal(calc.isComplete, true);
  assert.equal(calc.finalScoreOutOf100, 81);
});

test('P1: Balanced random group generation, membership validation, and longitudinal group history', () => {
  const students: Student[] = [
    { id: 's1', studentNumber: '1', fullName: 'A', classId: 'c1' },
    { id: 's2', studentNumber: '2', fullName: 'B', classId: 'c1' },
    { id: 's3', studentNumber: '3', fullName: 'C', classId: 'c1' },
    { id: 's4', studentNumber: '4', fullName: 'D', classId: 'c1' },
    { id: 's5', studentNumber: '5', fullName: 'E', classId: 'c1' },
  ];

  const groups = generateBalancedRandomGroups(students, { groupCount: 2, seed: 42 });
  assert.equal(groups.length, 2);
  // 5 students into 2 groups -> sizes 3 and 2
  assert.equal(groups[0].studentIds.length + groups[1].studentIds.length, 5);
  assert.ok(Math.abs(groups[0].studentIds.length - groups[1].studentIds.length) <= 1);

  const conflicts = findDuplicateGroupMemberships(groups, [groups[0].studentIds[0]], groups[1].id);
  assert.equal(conflicts.length, 1);

  // Longitudinal group history
  const sessions: EvaluationSession[] = [
    {
      id: 'ses-1',
      title: '1. Deney',
      classId: 'c1',
      rubricId: 'rub-test',
      date: '2026-09-15',
      status: 'completed',
      mode: 'group',
      generalSessionNote: '',
      evaluations: {},
      groups: [
        {
          id: 'g1',
          name: 'Grup 1: Alfa',
          studentIds: ['s1', 's2'],
          criterionScores: { c1: 3, c2: 3 },
          groupNote: 'İyi başlangıç',
        },
      ],
    },
    {
      id: 'ses-2',
      title: '2. Deney',
      classId: 'c1',
      rubricId: 'rub-test',
      date: '2026-10-15',
      status: 'completed',
      mode: 'group',
      generalSessionNote: '',
      evaluations: {},
      groups: [
        {
          id: 'g2',
          name: 'Grup 1: Alfa',
          studentIds: ['s1', 's2'],
          criterionScores: { c1: 4, c2: 4 },
          groupNote: 'Harika gelişim',
        },
      ],
    },
  ];

  const groupHistory = getGroupProgressHistory(sessions, { 'rub-test': sampleRubric }, 'c1');
  assert.equal(groupHistory.length, 2);
  assert.equal(groupHistory[0].scoreOutOf100, 75);
  assert.equal(groupHistory[1].scoreOutOf100, 100);
});

test('P1: Undo snapshot creation and P2 CSV formula injection sanitization + PDF generation', () => {
  const session: EvaluationSession = {
    id: 'ses-csv',
    title: 'CSV Test Oturumu',
    classId: 'cls-7a',
    classIds: ['cls-7a', 'cls-8b'], // Multi-classroom session support (P1)
    rubricId: 'rub-test',
    rubricSnapshot: sampleRubric,
    date: '2026-10-18',
    status: 'in_progress',
    mode: 'individual',
    generalSessionNote: '',
    groups: [],
    evaluations: {
      s1: {
        studentId: 's1',
        criterionScores: { c1: 4, c2: 0 }, // 0 is valid!
        note: '=cmd|\'/C calc\'!A0', // Malicious Excel formula payload
        tags: [],
        updatedAt: '2026-10-18',
      },
    },
  };

  // Undo snapshot
  const undoHistory = recordSessionUndoEntry(session, {
    scope: 'criterion',
    studentId: 's1',
    criterionId: 'c1',
    description: 'Kriter puanı değiştirildi',
    previousEvaluations: session.evaluations,
  });
  assert.equal(undoHistory.length, 1);
  assert.deepEqual(undoHistory[0].previousEvaluations['s1'].criterionScores, { c1: 4, c2: 0 });

  // Formula sanitization
  assert.equal(sanitizeCsvFormulaInjection('=SUM(A1:A5)'), "'=SUM(A1:A5)");
  assert.equal(sanitizeCsvFormulaInjection('+12345'), "'+12345");
  assert.equal(sanitizeCsvFormulaInjection('@admin'), "'@admin");
  assert.equal(sanitizeCsvFormulaInjection('-'), '-');

  const students: Student[] = [
    { id: 's1', studentNumber: '101', firstName: 'Elif', lastName: 'Yılmaz', fullName: 'Elif Yılmaz', classId: 'cls-7a' },
    { id: 's2', studentNumber: '201', firstName: 'Arda', lastName: 'Arslan', fullName: 'Arda Arslan', classId: 'cls-8b' },
  ];

  const csv = generateSessionCsv(session, sampleRubric, students);
  assert.ok(csv.includes("'=cmd|"));
  assert.ok(csv.includes('Elif,Yılmaz'));
  assert.ok(csv.includes('Arda,Arslan')); // Multi-classroom student included

  // Wrong rubric ID must throw instead of silently generating wrong fallback report (P2)
  assert.throws(() => {
    const sessionWithoutSnapshot: EvaluationSession = { ...session, rubricSnapshot: undefined };
    generateSessionCsv(sessionWithoutSnapshot, { ...sampleRubric, id: 'wrong-rubric' }, students);
  }, /geçerli rubrik bulunamadı/);

  // Direct PDF generation produces valid %PDF-1.4 binary buffer
  const pdfBytes = generatePaginatedSessionPdfBytes(
    session,
    sampleRubric,
    { id: 'cls-7a', name: '7-A', gradeLevel: '7', subject: 'Fen', academicYear: '2026' },
    students
  );
  const pdfHeader = new TextDecoder().decode(pdfBytes.slice(0, 8));
  assert.equal(pdfHeader, '%PDF-1.4');
});

test('getSessionProgressStats and getNextPendingStudent work with 0-point valid scores', () => {
  const students: Student[] = [
    { id: 's1', studentNumber: '101', fullName: 'Öğrenci 1', classId: 'cls-1' },
    { id: 's2', studentNumber: '102', fullName: 'Öğrenci 2', classId: 'cls-1' },
  ];
  const evaluations = {
    s1: {
      studentId: 's1',
      criterionScores: { c1: 0, c2: 0 }, // Completed with 0 points!
      note: '',
      tags: [],
      updatedAt: '',
    },
  };

  const stats = getSessionProgressStats(students, evaluations, sampleRubric);
  assert.equal(stats.fullyEvaluatedCount, 1);
  assert.equal(stats.unstartedCount, 1);

  const next = getNextPendingStudent(students, evaluations, sampleRubric, 's1');
  assert.equal(next?.id, 's2');

  const history = getStudentProgressHistory(
    's1',
    [
      {
        id: 'ses-1',
        title: 'Deney',
        classId: 'cls-1',
        rubricId: 'rub-test',
        date: '2026-10-18',
        status: 'completed',
        mode: 'individual',
        generalSessionNote: '',
        groups: [],
        evaluations,
      },
    ],
    { 'rub-test': sampleRubric }
  );
  assert.equal(history.length, 1);
  assert.equal(history[0].scoreOutOf100, 0);
});
