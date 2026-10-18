import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  isScoreAssigned,
  calculateWeightedScore,
  getStudentEvaluationBreakdown,
  freezeRubricSnapshot,
  getEffectiveSessionRubric,
  validateRubric,
  applyGroupScoresToMembers,
  reconcileGroupEvaluationsWithMemberships,
  deleteGroupAndReconcile,
  toggleGroupMemberAndReconcile,
  generateBalancedRandomGroups,
  redistributeGroupsSafely,
  hasGroupEvaluationData,
  hasSessionEvaluations,
  canChangeSessionRubric,
  changeSessionRubricSafely,
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
  STORAGE_KEY,
  LEGACY_V3_ROLLBACK_KEY,
  STORAGE_CONFLICT_BACKUP_KEY,
  INDEXEDDB_QUARANTINE_KEY,
  sha256Hex,
  computePayloadChecksum,
  computeLegacyRpkChecksum,
  createVerifiedBackupBundle,
  verifyAndParseBackupBundle,
  importLegacyBackupBundle,
  migrateV2ToV3,
  loadVerifiedInitialState,
  loadVerifiedInitialStateWithMeta,
  loadInitialStateWithRecovery,
  saveTransactionalState,
  getV3RollbackBackup,
  getStorageConflictBackup,
  getQuarantinedIndexedDbBackup,
  isStorageWriteLocked,
  unlockStorageWriteLock,
  __clearMemoryIndexedDbForTests,
  __setMemoryIndexedDbSnapshotForTests,
  __getMemoryIndexedDbSnapshotForTests,
  __setSimulateIndexedDbFailureForTests,
} from './storageLayer.ts';
import {
  generatePaginatedSessionPdfBytes,
  decodePdfTextWithToUnicode,
} from './pdfGenerator.ts';
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

test('Audit #1: v2 -> v3 data migration upgrades students, rubrics (0-point level & maxPoints), frozen snapshots, and separates group scores', () => {
  const v2Raw = {
    classrooms: [
      { id: 'cls-7a', name: '7-A Sınıfı', gradeLevel: '7. Sınıf', subject: 'Fen', academicYear: '2026' },
    ],
    students: [
      // v2 student without firstName/lastName
      { id: 'stu-1', studentNumber: '101', fullName: 'Zeynep Çelik', classId: 'cls-7a' },
    ],
    rubrics: [
      {
        id: 'rub-v2',
        title: 'V2 Rubrik',
        subject: 'Fen',
        description: 'V2 açıklama',
        maxLevelPoints: 4,
        createdAt: '2026-09-01',
        criteria: [
          // v2 criterion without maxPoints and without level 0
          {
            id: 'crit-1',
            title: 'Hipotez Kurma',
            category: 'Bilim',
            weight: 100,
            levels: [
              { level: 1, label: 'Destek Gerekli', points: 1, description: 'D1' },
              { level: 4, label: 'Örnek Düzey', points: 4, description: 'D4' },
            ],
          },
        ],
      },
    ],
    sessions: [
      {
        id: 'ses-v2',
        title: 'V2 Oturumu',
        classId: 'cls-7a',
        rubricId: 'rub-v2',
        date: '2026-09-15',
        status: 'in_progress' as const,
        mode: 'group' as const,
        generalSessionNote: 'V2 not',
        groups: [
          {
            id: 'grp-v2',
            name: 'Grup 1',
            studentIds: ['stu-1'],
            criterionScores: { 'crit-1': 4 },
            groupNote: 'Grup gözlemi',
          },
        ],
        evaluations: {
          'stu-1': {
            studentId: 'stu-1',
            criterionScores: { 'crit-1': 3 },
            note: 'Bireysel gözlem',
            tags: [],
            updatedAt: '2026-09-15',
            evaluatedViaGroup: 'Grup 1',
          },
        },
      },
    ],
  };

  const migrated = migrateV2ToV3(v2Raw);
  // 1. Student firstName & lastName split
  assert.equal(migrated.students[0].firstName, 'Zeynep');
  assert.equal(migrated.students[0].lastName, 'Çelik');

  // 2. Rubric criterion has maxPoints and 0-point level added
  assert.equal(migrated.rubrics[0].criteria[0].maxPoints, 100);
  assert.equal(migrated.rubrics[0].criteria[0].levels[0].points, 0);
  assert.equal(migrated.rubrics[0].version, 3);

  // 3. Session has frozen rubricSnapshot & classIds
  assert.ok(migrated.sessions[0].rubricSnapshot);
  assert.deepEqual(migrated.sessions[0].classIds, ['cls-7a']);

  // 4. Group scores separated from individual scores
  const stuEval = migrated.sessions[0].evaluations['stu-1'];
  assert.equal(stuEval.criterionScores['crit-1'], 3);
  assert.equal(stuEval.groupCriterionScores?.['crit-1'], 4);
  assert.equal(stuEval.groupNote, 'Grup gözlemi');
});

test('Audit #2: Checksum covers ALL scores (individual, direct, group) and ALL notes (student, group, session)', () => {
  const baseState = migrateV2ToV3({
    classrooms: [{ id: 'c1', name: '7-A', gradeLevel: '7', subject: 'Fen', academicYear: '2026' }],
    students: [{ id: 's1', studentNumber: '101', firstName: 'Elif', lastName: 'Yılmaz', fullName: 'Elif Yılmaz', classId: 'c1' }],
    rubrics: [sampleRubric],
    sessions: [
      {
        id: 'ses-1',
        title: 'Deney',
        classId: 'c1',
        rubricId: 'rub-test',
        date: '2026-10-18',
        status: 'in_progress',
        mode: 'individual',
        generalSessionNote: 'Oturum notu 1',
        groups: [
          {
            id: 'g1',
            name: 'Grup 1',
            studentIds: ['s1'],
            criterionScores: { c1: 3, c2: 3 },
            groupNote: 'Grup notu 1',
          },
        ],
        evaluations: {
          s1: {
            studentId: 's1',
            criterionScores: { c1: 3, c2: 4 },
            directCriterionScores: { c1: 40 },
            groupCriterionScores: { c1: 3, c2: 3 },
            note: 'Öğrenci bireysel notu 1',
            groupNote: 'Grup notu 1',
            tags: ['Aktif'],
            updatedAt: '2026-10-18',
          },
        },
      },
    ],
  });

  const baseChecksum = computePayloadChecksum(baseState);

  // Changing a single criterion score changes checksum
  const stateChangedScore = JSON.parse(JSON.stringify(baseState));
  stateChangedScore.sessions[0].evaluations.s1.criterionScores.c1 = 2;
  assert.notEqual(computePayloadChecksum(stateChangedScore), baseChecksum);

  // Changing a direct integer score changes checksum
  const stateChangedDirect = JSON.parse(JSON.stringify(baseState));
  stateChangedDirect.sessions[0].evaluations.s1.directCriterionScores.c1 = 45;
  assert.notEqual(computePayloadChecksum(stateChangedDirect), baseChecksum);

  // Changing a student note changes checksum
  const stateChangedNote = JSON.parse(JSON.stringify(baseState));
  stateChangedNote.sessions[0].evaluations.s1.note = 'Öğrenci bireysel notu DEĞİŞTİ';
  assert.notEqual(computePayloadChecksum(stateChangedNote), baseChecksum);

  // Changing a group note or group score changes checksum
  const stateChangedGroup = JSON.parse(JSON.stringify(baseState));
  stateChangedGroup.sessions[0].groups[0].groupNote = 'Farklı grup notu';
  assert.notEqual(computePayloadChecksum(stateChangedGroup), baseChecksum);

  // Tampering with a score inside a backup bundle causes verifyAndParseBackupBundle to fail
  const bundle = createVerifiedBackupBundle(baseState);
  bundle.payload.sessions[0].evaluations.s1.note = 'Yetkisiz değişiklik';
  const verifyTampered = verifyAndParseBackupBundle(JSON.stringify(bundle));
  assert.equal(verifyTampered.isValid, false);
  assert.match(verifyTampered.error || '', /Checksum/);
});

test('Audit #3 & #4: IndexedDB automatic recovery and user-facing save error notification', async () => {
  __clearMemoryIndexedDbForTests();
  __setSimulateIndexedDbFailureForTests(false);

  const store: Record<string, string> = {};
  let throwQuotaOnSet = false;

  const mockLocalStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      if (throwQuotaOnSet) {
        throw new Error('QuotaExceededError: localStorage full');
      }
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };

  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = mockLocalStorage;

  try {
    const validState = migrateV2ToV3({
      classrooms: [{ id: 'c1', name: '7-A', gradeLevel: '7', subject: 'Fen', academicYear: '2026' }],
      students: [{ id: 's1', studentNumber: '101', fullName: 'Elif Yılmaz', classId: 'c1' }],
      rubrics: [sampleRubric],
      sessions: [
        {
          id: 'ses-idb',
          title: 'IndexedDB Kurtarma Oturumu',
          classId: 'c1',
          rubricId: 'rub-test',
          date: '2026-10-18',
          status: 'in_progress',
          mode: 'individual',
          generalSessionNote: 'Önemli oturum verisi',
          groups: [],
          evaluations: {
            s1: {
              studentId: 's1',
              criterionScores: { c1: 4, c2: 4 },
              note: 'Kurtarılacak öğrenci notu',
              tags: [],
              updatedAt: '2026-10-18',
            },
          },
        },
      ],
    });

    // 1. Save transactionally
    const saveRes = await saveTransactionalState(validState);
    assert.equal(saveRes.ok, true);
    assert.equal(saveRes.localStorageSaved, true);
    assert.equal(saveRes.indexedDbSaved, true);

    // 2. Corrupt or delete localStorage and verify automatic IndexedDB recovery!
    store[STORAGE_KEY] = '{corrupted_json';
    const fallbackSeed = migrateV2ToV3({
      classrooms: [{ id: 'c-seed', name: 'Seed', gradeLevel: '7', subject: 'Fen', academicYear: '2026' }],
      students: [],
      rubrics: [sampleRubric],
      sessions: [],
    });

    const recovered = await loadInitialStateWithRecovery(fallbackSeed);
    assert.equal(recovered.source, 'indexeddb_recovered');
    assert.equal(recovered.state.sessions[0].id, 'ses-idb');
    assert.equal(
      recovered.state.sessions[0].evaluations['s1'].note,
      'Kurtarılacak öğrenci notu'
    );
    // Also verify localStorage was healed automatically
    const healedLocal = loadVerifiedInitialState(fallbackSeed);
    assert.equal(healedLocal.sessions[0].id, 'ses-idb');

    // 3. Verify save error notification when localStorage throws QuotaExceededError
    throwQuotaOnSet = true;
    let notifiedError = '';
    const failedSave = await saveTransactionalState(validState, {
      onSaveError: (msg: string) => {
        notifiedError = msg;
      },
    });
    assert.equal(failedSave.ok, false);
    assert.equal(failedSave.localStorageSaved, false);
    assert.ok(failedSave.errors.length > 0);
    assert.ok(notifiedError.includes('localStorage'));
  } finally {
    (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
    __setSimulateIndexedDbFailureForTests(false);
  }
});

test('Audit #5: Safe group redistribution preserves scored/annotated groups and only redistributes remaining students', () => {
  const students: Student[] = [
    { id: 's1', studentNumber: '101', fullName: 'Elif Yılmaz', classId: 'c1' },
    { id: 's2', studentNumber: '102', fullName: 'Kerem Demir', classId: 'c1' },
    { id: 's3', studentNumber: '103', fullName: 'Zeynep Kaya', classId: 'c1' },
    { id: 's4', studentNumber: '104', fullName: 'Mert Çelik', classId: 'c1' },
    { id: 's5', studentNumber: '105', fullName: 'Defne Şahin', classId: 'c1' },
    { id: 's6', studentNumber: '106', fullName: 'Caner Aydın', classId: 'c1' },
  ];

  const existingGroups: StudentGroup[] = [
    {
      id: 'grp-scored',
      name: 'Grup 1: Puanlanmış Ekip',
      studentIds: ['s1', 's2'],
      criterionScores: { c1: 4, c2: 3 },
      groupNote: 'Deneyi tamamladılar',
    },
    {
      id: 'grp-empty',
      name: 'Grup 2: Boş Ekip',
      studentIds: ['s3', 's4'],
      criterionScores: {},
      groupNote: '',
    },
  ];

  assert.equal(hasGroupEvaluationData(existingGroups[0]), true);
  assert.equal(hasGroupEvaluationData(existingGroups[1]), false);

  // 1. Default safe redistribution preserves grp-scored (s1, s2) and distributes s3, s4, s5, s6 into 2-person groups
  const safeRes = redistributeGroupsSafely(existingGroups, students, {
    targetGroupSize: 2,
    seed: 12345,
  });
  assert.equal(safeRes.blocked, false);
  assert.equal(safeRes.preservedGroupCount, 1);
  assert.equal(safeRes.redistributedStudentCount, 4);
  assert.equal(safeRes.groups[0].id, 'grp-scored');
  assert.deepEqual(safeRes.groups[0].criterionScores, { c1: 4, c2: 3 });

  const allAssigned = safeRes.groups.flatMap((g) => g.studentIds);
  assert.equal(allAssigned.length, 6);
  assert.equal(new Set(allAssigned).size, 6);

  // 2. Attempting to overwrite scored groups without allowOverwriteEvaluated is blocked
  const blockedRes = redistributeGroupsSafely(existingGroups, students, {
    targetGroupSize: 3,
    preserveEvaluatedGroups: false,
    allowOverwriteEvaluated: false,
  });
  assert.equal(blockedRes.blocked, true);
  assert.ok(blockedRes.warning);
});

test('Audit #6: Scored-session rubric change protection blocks silent overwrites and supports safe reset with undo', () => {
  const secondRubric: Rubric = {
    ...sampleRubric,
    id: 'rub-second',
    title: 'İkinci Rubrik (Yeni)',
  };

  const scoredSession: EvaluationSession = {
    id: 'ses-scored',
    title: 'Puanlanmış Oturum',
    classId: 'cls-7a',
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
        criterionScores: { c1: 4, c2: 3 },
        note: 'Kaydedilmiş not',
        tags: [],
        updatedAt: '2026-10-18',
      },
    },
  };

  // 1. Check blocks direct rubric change when session has evaluations
  const check = canChangeSessionRubric(scoredSession, 'rub-second');
  assert.equal(check.allowed, false);
  assert.equal(check.evaluatedStudentCount, 1);

  const blockedChange = changeSessionRubricSafely(scoredSession, secondRubric);
  assert.equal(blockedChange.allowed, false);
  assert.equal(blockedChange.updatedSession.rubricId, 'rub-test');
  assert.deepEqual(
    blockedChange.updatedSession.evaluations['s1'].criterionScores,
    { c1: 4, c2: 3 }
  );

  // 2. Explicit confirmResetExistingScores backs up evaluations + previousRubricId into undoHistory
  const confirmedChange = changeSessionRubricSafely(scoredSession, secondRubric, {
    confirmResetExistingScores: true,
  });
  assert.equal(confirmedChange.allowed, true);
  assert.equal(confirmedChange.updatedSession.rubricId, 'rub-second');
  assert.equal(
    confirmedChange.updatedSession.undoHistory?.[0]?.previousRubricId,
    'rub-test'
  );
  assert.deepEqual(
    confirmedChange.updatedSession.undoHistory?.[0]?.previousEvaluations['s1']
      .criterionScores,
    { c1: 4, c2: 3 }
  );
});

test('Audit #7: PDF generator includes ALL criteria (10+ criteria without truncation) and preserves Turkish characters', () => {
  const tenCriteriaRubric: Rubric = {
    id: 'rub-10',
    title: 'Kapsamlı 10 Ölçütlü Değerlendirme Rubriği',
    subject: 'Fen Bilimleri',
    description: '10 ölçütlü rubrik',
    maxLevelPoints: 4,
    createdAt: '2026-10-18',
    criteria: Array.from({ length: 10 }, (_, idx) => ({
      id: `crit-${idx + 1}`,
      title: `Ölçüt ${idx + 1} — Çağdaş Bilimsel Gözlem ve Çözümleme`,
      category: 'Uygulama',
      weight: 10,
      maxPoints: 10,
      required: true,
      levels: [
        { level: 0, label: 'Gözlenmedi', points: 0, description: 'D0' },
        { level: 4, label: 'Örnek Düzey', points: 4, description: 'D4' },
      ],
    })),
  };

  const session10: EvaluationSession = {
    id: 'ses-10',
    title: '3. Ünite: Yoğunluk ve Karışımların Ayrıştırılması',
    classId: 'cls-7a',
    rubricId: 'rub-10',
    rubricSnapshot: tenCriteriaRubric,
    date: '2026-10-18',
    status: 'completed',
    mode: 'individual',
    generalSessionNote: '',
    groups: [],
    evaluations: {
      'stu-tr': {
        studentId: 'stu-tr',
        criterionScores: {
          'crit-1': 4,
          'crit-2': 4,
          'crit-3': 4,
          'crit-4': 4,
          'crit-5': 4,
          'crit-6': 4,
          'crit-7': 4,
          'crit-8': 4,
          'crit-9': 4,
          'crit-10': 4,
        },
        note: 'Öğrenci ğüşiöç ĞÜŞİÖÇ karakterli gözlem notu.',
        tags: [],
        updatedAt: '2026-10-18',
      },
    },
  };

  const students: Student[] = [
    {
      id: 'stu-tr',
      studentNumber: '108',
      firstName: 'Çağrı',
      lastName: 'Öztürk',
      fullName: 'Çağrı Öztürk',
      classId: 'cls-7a',
    },
    {
      id: 'stu-tr-2',
      studentNumber: '109',
      firstName: 'İdil',
      lastName: 'Şahin',
      fullName: 'İdil Şahin',
      classId: 'cls-7a',
    },
    {
      id: 'stu-tr-3',
      studentNumber: '110',
      firstName: 'Işıl',
      lastName: 'Gümüş',
      fullName: 'Işıl Gümüş',
      classId: 'cls-7a',
    },
  ];

  const pdfBytes = generatePaginatedSessionPdfBytes(
    session10,
    tenCriteriaRubric,
    {
      id: 'cls-7a',
      name: '7-A Sınıfı',
      gradeLevel: '7. Sınıf',
      subject: 'Fen Bilimleri',
      academicYear: '2026-2027',
    },
    students
  );

  // 1. Verify embedded TrueType Type0 / CIDFontType2 / Identity-H and /ToUnicode CMap structure
  const pdfRawAscii = new TextDecoder('latin1').decode(pdfBytes);
  assert.ok(pdfRawAscii.includes('/Subtype /Type0'));
  assert.ok(pdfRawAscii.includes('/Subtype /CIDFontType2'));
  assert.ok(pdfRawAscii.includes('/Encoding /Identity-H'));
  assert.ok(pdfRawAscii.includes('/FontFile2'));
  assert.ok(pdfRawAscii.includes('/ToUnicode'));

  // 2. Decode <GGGG> Tj glyph operators using the embedded /ToUnicode CMap
  const decodedViaToUnicode = decodePdfTextWithToUnicode(pdfBytes);
  assert.ok(
    decodedViaToUnicode.includes(
      'ÖLÇÜT TEMELLİ DEĞERLENDİRME RAPORU - 7-A Sınıfı'
    )
  );
  assert.ok(decodedViaToUnicode.includes('Çağrı Öztürk'));
  assert.ok(decodedViaToUnicode.includes('İdil Şahin'));
  assert.ok(decodedViaToUnicode.includes('Işıl Gümüş'));
  assert.ok(decodedViaToUnicode.includes('ğüşiöç ĞÜŞİÖÇ'));

  for (let i = 1; i <= 10; i++) {
    assert.ok(
      decodedViaToUnicode.includes(
        `K${i}: Ölçüt ${i} - Çağdaş Bilimsel Gözlem ve Çözümleme`
      ),
      `Missing criterion ${i} in ToUnicode decoded PDF text`
    );
    assert.ok(
      decodedViaToUnicode.includes(`K${i}:4`),
      `Missing student score for criterion K${i} in ToUnicode decoded PDF row`
    );
  }

  // 3. Verify with real Ghostscript PDF engine (text extraction + PNG rasterization)
  const tmpPdfPath = '/tmp/rubrikpad_test_tr_report.pdf';
  const tmpPngPath = '/tmp/rubrikpad_test_tr_report.png';
  fs.writeFileSync(tmpPdfPath, pdfBytes);
  const gsExtracted = execSync(
    `gs -q -dNOPAUSE -dBATCH -sDEVICE=txtwrite -sOutputFile=- ${tmpPdfPath}`
  ).toString('utf8');

  assert.ok(
    gsExtracted.includes('ÖLÇÜT TEMELLİ DEĞERLENDİRME RAPORU - 7-A Sınıfı')
  );
  assert.ok(gsExtracted.includes('Çağrı Öztürk'));
  assert.ok(gsExtracted.includes('İdil Şahin'));
  assert.ok(gsExtracted.includes('Işıl Gümüş'));
  assert.ok(gsExtracted.includes('ğüşiöç ĞÜŞİÖÇ'));

  execSync(
    `gs -q -dNOPAUSE -dBATCH -sDEVICE=png16m -r150 -sOutputFile=${tmpPngPath} ${tmpPdfPath}`
  );
  assert.ok(fs.statSync(tmpPngPath).size > 15000);
});

test('Audit #8: Mandatory SHA-256 backup checksums cover undoHistory and auditLog, reject checksumless v3 files, and support separate legacy import', () => {
  // Verify standard NIST SHA-256 vector ("abc")
  assert.equal(
    sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );

  const stateWithHistory = migrateV2ToV3({
    classrooms: [
      {
        id: 'c1',
        name: '7-A',
        gradeLevel: '7',
        subject: 'Fen',
        academicYear: '2026',
      },
    ],
    students: [
      {
        id: 's1',
        studentNumber: '101',
        firstName: 'Elif',
        lastName: 'Yılmaz',
        fullName: 'Elif Yılmaz',
        classId: 'c1',
        auditLog: [
          {
            timestamp: '2026-10-18T08:00:00Z',
            action: 'created',
            details: 'Öğrenci eklendi',
          },
        ],
      },
    ],
    rubrics: [sampleRubric],
    sessions: [
      {
        id: 'ses-1',
        title: 'Deney Oturumu',
        classId: 'c1',
        rubricId: 'rub-test',
        date: '2026-10-18',
        status: 'in_progress',
        mode: 'individual',
        generalSessionNote: '',
        groups: [],
        evaluations: {},
        undoHistory: [
          {
            id: 'undo-1',
            timestamp: '2026-10-18T08:05:00Z',
            scope: 'criterion',
            studentId: 's1',
            criterionId: 'c1',
            description: 'Önceki puan: 3P',
            previousEvaluations: {},
          },
        ],
      },
    ],
  });

  const bundle = createVerifiedBackupBundle(stateWithHistory);
  assert.match(bundle.checksum, /^sha256-[0-9a-f]{64}$/);

  // 1. Tampering with student auditLog invalidates SHA-256 checksum
  const tamperedAuditLog = JSON.parse(JSON.stringify(bundle));
  tamperedAuditLog.payload.students[0].auditLog[0].details =
    'Yetkisiz denetim kaydı değişikliği';
  const resAudit = verifyAndParseBackupBundle(JSON.stringify(tamperedAuditLog));
  assert.equal(resAudit.isValid, false);
  assert.match(resAudit.error || '', /SHA-256 Checksum/);

  // 2. Tampering with session undoHistory invalidates SHA-256 checksum
  const tamperedUndo = JSON.parse(JSON.stringify(bundle));
  tamperedUndo.payload.sessions[0].undoHistory[0].description =
    'Değiştirilmiş geçmiş';
  const resUndo = verifyAndParseBackupBundle(JSON.stringify(tamperedUndo));
  assert.equal(resUndo.isValid, false);
  assert.match(resUndo.error || '', /SHA-256 Checksum/);

  // 3. Removing checksum field from v3 backup is strictly REJECTED by verifyAndParseBackupBundle
  const missingChecksumBundle = JSON.parse(JSON.stringify(bundle));
  delete missingChecksumBundle.checksum;
  const resMissingChecksum = verifyAndParseBackupBundle(
    JSON.stringify(missingChecksumBundle)
  );
  assert.equal(resMissingChecksum.isValid, false);
  assert.equal(resMissingChecksum.requiresLegacyImport, true);

  // 4. Legacy v2 unverified backup is rejected by strict verifyAndParseBackupBundle,
  //    but cleanly imported and migrated by importLegacyBackupBundle
  const rawLegacyV2 = {
    classrooms: stateWithHistory.classrooms,
    students: stateWithHistory.students,
    rubrics: stateWithHistory.rubrics,
    sessions: stateWithHistory.sessions,
  };
  const strictOnLegacy = verifyAndParseBackupBundle(
    JSON.stringify(rawLegacyV2)
  );
  assert.equal(strictOnLegacy.isValid, false);
  assert.equal(strictOnLegacy.requiresLegacyImport, true);

  const legacyImportRes = importLegacyBackupBundle(JSON.stringify(rawLegacyV2));
  assert.equal(legacyImportRes.isValid, true);
  assert.equal(legacyImportRes.migratedFromV2, true);
  assert.match(legacyImportRes.newChecksum || '', /^sha256-[0-9a-f]{64}$/);
});

test('Audit #9: Group membership changes and group deletion automatically reconcile reflected student group scores', () => {
  const group1: StudentGroup = {
    id: 'grp-1',
    name: 'Grup 1: Robotik Takımı',
    studentIds: ['s1', 's2'],
    criterionScores: { c1: 4, c2: 4 },
    groupNote: 'Grup 1 ortak gözlemi',
    lastAppliedAt: '2026-10-18T09:00:00Z',
  };

  let session: EvaluationSession = {
    id: 'ses-grp-sync',
    title: 'Grup Uzlaştırma Testi',
    classId: 'c1',
    rubricId: 'rub-test',
    rubricSnapshot: sampleRubric,
    date: '2026-10-18',
    status: 'in_progress',
    mode: 'group',
    generalSessionNote: '',
    groups: [group1],
    evaluations: {
      s1: {
        studentId: 's1',
        criterionScores: { c1: 2, c2: 2 },
        note: 'Elif bireysel notu',
        tags: [],
        updatedAt: '2026-10-18T08:50:00Z',
      },
    },
    undoHistory: [],
  };

  // Apply group1 scores to s1 and s2
  session = {
    ...session,
    evaluations: applyGroupScoresToMembers(
      session.evaluations,
      group1,
      '2026-10-18T09:00:00Z'
    ),
  };

  assert.deepEqual(session.evaluations['s1'].groupCriterionScores, {
    c1: 4,
    c2: 4,
  });
  assert.equal(session.evaluations['s1'].groupId, 'grp-1');
  assert.deepEqual(session.evaluations['s2'].groupCriterionScores, {
    c1: 4,
    c2: 4,
  });
  assert.equal(session.evaluations['s2'].groupId, 'grp-1');
  assert.equal(session.evaluations['s2'].activeScoreSource, 'group');

  // 1. Remove s2 from grp-1 via toggleGroupMemberAndReconcile:
  //    s2's reflected groupCriterionScores, groupNote, groupId, and evaluatedViaGroup MUST be cleared!
  session = toggleGroupMemberAndReconcile(
    session,
    'grp-1',
    's2',
    '2026-10-18T09:05:00Z'
  );
  assert.deepEqual(session.groups[0].studentIds, ['s1']);
  assert.deepEqual(session.evaluations['s2'].groupCriterionScores, {});
  assert.equal(session.evaluations['s2'].groupId, undefined);
  assert.equal(session.evaluations['s2'].evaluatedViaGroup, undefined);
  assert.equal(session.evaluations['s2'].groupNote, '');
  assert.equal(session.evaluations['s2'].activeScoreSource, 'individual');
  assert.equal(
    session.evaluations['s2'].tags.includes('Grup Çalışması'),
    false
  );
  // Meanwhile s1 (still in grp-1) keeps group scores
  assert.deepEqual(session.evaluations['s1'].groupCriterionScores, {
    c1: 4,
    c2: 4,
  });
  assert.equal(session.evaluations['s1'].groupId, 'grp-1');

  // 2. Add s3 to grp-1 (which already has applied scores): s3 automatically receives grp-1's reflected scores
  session = toggleGroupMemberAndReconcile(
    session,
    'grp-1',
    's3',
    '2026-10-18T09:06:00Z'
  );
  assert.deepEqual(session.evaluations['s3'].groupCriterionScores, {
    c1: 4,
    c2: 4,
  });
  assert.equal(session.evaluations['s3'].groupId, 'grp-1');
  assert.equal(session.evaluations['s3'].evaluatedViaGroup, 'Grup 1: Robotik Takımı');

  // 3. Delete grp-1 via deleteGroupAndReconcile:
  //    s1 and s3 have their reflected group scores cleared, while s1's individual scores (c1: 2, c2: 2) and individual note remain intact!
  session = deleteGroupAndReconcile(
    session,
    'grp-1',
    '2026-10-18T09:10:00Z'
  );
  assert.equal(session.groups.length, 0);
  assert.deepEqual(session.evaluations['s1'].groupCriterionScores, {});
  assert.equal(session.evaluations['s1'].groupId, undefined);
  assert.equal(session.evaluations['s1'].evaluatedViaGroup, undefined);
  assert.deepEqual(session.evaluations['s1'].criterionScores, {
    c1: 2,
    c2: 2,
  });
  assert.equal(session.evaluations['s1'].note, 'Elif bireysel notu');
  assert.deepEqual(session.evaluations['s3'].groupCriterionScores, {});
  assert.equal(session.evaluations['s3'].groupId, undefined);
});

test('Audit #10: Existing rubrikpad_state_v3 data signed with legacy rpk- checksum is verified, never falls back to seed data, and upgrades in-place to SHA-256', () => {
  const store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };

  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = mockLocalStorage;

  try {
    const realUserV3State = migrateV2ToV3({
      classrooms: [
        {
          id: 'cls-real',
          name: '8-C Gerçek Sınıf',
          gradeLevel: '8. Sınıf',
          subject: 'Fen Bilimleri',
          academicYear: '2026-2027',
        },
      ],
      students: [
        {
          id: 'stu-real-1',
          studentNumber: '991',
          firstName: 'Ayşe',
          lastName: 'Korkmaz',
          fullName: 'Ayşe Korkmaz',
          classId: 'cls-real',
        },
      ],
      rubrics: [sampleRubric],
      sessions: [
        {
          id: 'ses-real-1',
          title: 'Gerçek Öğrenci Değerlendirme Oturumu',
          classId: 'cls-real',
          rubricId: 'rub-test',
          date: '2026-10-18',
          status: 'in_progress',
          mode: 'individual',
          generalSessionNote: 'Silinmemesi gereken gerçek oturum notu',
          groups: [],
          evaluations: {
            'stu-real-1': {
              studentId: 'stu-real-1',
              criterionScores: { c1: 4, c2: 3 },
              note: 'Ayşe gerçek gözlem kaydı',
              tags: [],
              updatedAt: '2026-10-18T10:00:00Z',
            },
          },
        },
      ],
    });

    const fallbackSeed = migrateV2ToV3({
      classrooms: [
        {
          id: 'cls-seed',
          name: '7-A Örnek Sınıf',
          gradeLevel: '7. Sınıf',
          subject: 'Fen Bilimleri',
          academicYear: '2026-2027',
        },
      ],
      students: [],
      rubrics: [sampleRubric],
      sessions: [],
    });

    // 1. Simulate existing rubrikpad_state_v3 saved with non-canonicalized (property declaration order) rpk- checksum
    const rpkChecksumNonCanonical = computeLegacyRpkChecksum(realUserV3State, {
      canonicalize: false,
      sortScoreMaps: false,
    });
    assert.match(rpkChecksumNonCanonical, /^rpk-[0-9a-f]{16}$/);

    const legacyV3Bundle = {
      schemaVersion: 3,
      exportedAt: '2026-10-17T12:00:00Z',
      checksum: rpkChecksumNonCanonical,
      payload: realUserV3State,
    };
    store[STORAGE_KEY] = JSON.stringify(legacyV3Bundle);

    // 2. Startup load must accept the rpk- v3 bundle, preserve real students/evaluations, and NOT fall back to seed data
    const loadedMeta = loadVerifiedInitialStateWithMeta(fallbackSeed);
    assert.equal(loadedMeta.source, 'localStorage_v3');
    assert.equal(loadedMeta.localStorageCorrupted, false);
    assert.equal(loadedMeta.upgradedFromRpkChecksum, true);
    assert.equal(loadedMeta.state.classrooms[0].id, 'cls-real');
    assert.equal(loadedMeta.state.students[0].fullName, 'Ayşe Korkmaz');
    assert.equal(
      loadedMeta.state.sessions[0].evaluations['stu-real-1'].note,
      'Ayşe gerçek gözlem kaydı'
    );

    // 3. Verify that an original rollback copy was created BEFORE upgrading rubrikpad_state_v3 in-place (P1)
    assert.equal(loadedMeta.rollbackBackupKey, LEGACY_V3_ROLLBACK_KEY);
    assert.equal(store[LEGACY_V3_ROLLBACK_KEY], JSON.stringify(legacyV3Bundle));
    assert.equal(getV3RollbackBackup(), JSON.stringify(legacyV3Bundle));

    const upgradedRaw = JSON.parse(store[STORAGE_KEY]);
    assert.match(upgradedRaw.checksum, /^sha256-[0-9a-f]{64}$/);

    // 4. Tampering with a score in an rpk- bundle is still caught and rejected
    const tamperedRpkBundle = JSON.parse(JSON.stringify(legacyV3Bundle));
    tamperedRpkBundle.payload.sessions[0].evaluations[
      'stu-real-1'
    ].criterionScores.c1 = 1;
    const tamperedCheck = verifyAndParseBackupBundle(
      JSON.stringify(tamperedRpkBundle)
    );
    assert.equal(tamperedCheck.isValid, false);
    assert.match(tamperedCheck.error || '', /rpk Checksum/);
  } finally {
    (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
    __clearMemoryIndexedDbForTests();
  }
});

test('Audit #11: 8-char rpk- bypass is removed and manual legacy backup import strictly verifies rpk- and sha256- signatures', () => {
  const validPayload = migrateV2ToV3({
    classrooms: [
      {
        id: 'c1',
        name: '7-A',
        gradeLevel: '7',
        subject: 'Fen',
        academicYear: '2026',
      },
    ],
    students: [
      {
        id: 's1',
        studentNumber: '101',
        firstName: 'Elif',
        lastName: 'Yılmaz',
        fullName: 'Elif Yılmaz',
        classId: 'c1',
      },
    ],
    rubrics: [sampleRubric],
    sessions: [],
  });

  // 1. P0: Arbitrary 8-character rpk- checksum (e.g. rpk-deadbeef or rpk-12345678) MUST be rejected!
  const fake8CharBundle = {
    schemaVersion: 3,
    exportedAt: '2026-10-18T10:00:00Z',
    checksum: 'rpk-deadbeef',
    payload: validPayload,
  };
  const verifyFake8 = verifyAndParseBackupBundle(JSON.stringify(fake8CharBundle));
  assert.equal(verifyFake8.isValid, false);
  assert.match(verifyFake8.error || '', /rpk Checksum/);

  // 2. P1: Manual legacy import (importLegacyBackupBundle) also rejects 8-char rpk- and tampered 16-char rpk-
  const legacyImportFake8 = importLegacyBackupBundle(
    JSON.stringify(fake8CharBundle)
  );
  assert.equal(legacyImportFake8.isValid, false);
  assert.match(legacyImportFake8.error || '', /rpk-/);

  const realRpkChecksum = computeLegacyRpkChecksum(validPayload);
  const validRpkBundle = {
    schemaVersion: 3,
    exportedAt: '2026-10-18T10:00:00Z',
    checksum: realRpkChecksum,
    payload: validPayload,
  };

  // Valid 16-hex rpk- is accepted by importLegacyBackupBundle
  const legacyImportValidRpk = importLegacyBackupBundle(
    JSON.stringify(validRpkBundle)
  );
  assert.equal(legacyImportValidRpk.isValid, true);
  assert.match(legacyImportValidRpk.newChecksum || '', /^sha256-[0-9a-f]{64}$/);

  // Tampered payload with 16-hex rpk- is rejected by importLegacyBackupBundle
  const tamperedRpkForLegacy = JSON.parse(JSON.stringify(validRpkBundle));
  tamperedRpkForLegacy.payload.students[0].fullName = 'Yetkisiz İsim';
  const legacyImportTamperedRpk = importLegacyBackupBundle(
    JSON.stringify(tamperedRpkForLegacy)
  );
  assert.equal(legacyImportTamperedRpk.isValid, false);
  assert.match(legacyImportTamperedRpk.error || '', /rpk-/);

  // Unknown checksum prefix is rejected by importLegacyBackupBundle
  const unknownChecksumBundle = {
    ...validRpkBundle,
    checksum: 'md5-1234567890abcdef',
  };
  const legacyImportUnknown = importLegacyBackupBundle(
    JSON.stringify(unknownChecksumBundle)
  );
  assert.equal(legacyImportUnknown.isValid, false);
});

test('Audit #12: Corrupted IndexedDB data is quarantined and write-locked so seed data NEVER overwrites IndexedDB', async () => {
  __clearMemoryIndexedDbForTests();

  const store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };

  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = mockLocalStorage;

  try {
    // Simulate empty localStorage, but IndexedDB contains a corrupted/tampered v3 record
    const corruptedIdbJson = JSON.stringify({
      schemaVersion: 3,
      exportedAt: '2026-10-18T11:00:00Z',
      checksum: 'sha256-0000000000000000000000000000000000000000000000000000000000000000',
      payload: {
        classrooms: [{ id: 'c-user', name: 'Kullanıcı Sınıfı', gradeLevel: '8', subject: 'Fen', academicYear: '2026' }],
        students: [{ id: 's-user', studentNumber: '555', fullName: 'Önemli Öğrenci', classId: 'c-user' }],
        rubrics: [sampleRubric],
        sessions: [],
      },
    });
    __setMemoryIndexedDbSnapshotForTests(corruptedIdbJson);

    const fallbackSeed = migrateV2ToV3({
      classrooms: [{ id: 'c-seed', name: 'Örnek Seed Sınıfı', gradeLevel: '7', subject: 'Fen', academicYear: '2026' }],
      students: [],
      rubrics: [sampleRubric],
      sessions: [],
    });

    // 1. Startup recovery must detect corrupted IndexedDB, quarantine it, and activate write-lock
    const initRes = await loadInitialStateWithRecovery(fallbackSeed);
    assert.equal(initRes.source, 'seed_fallback');
    assert.equal(initRes.indexedDbCorrupted, true);
    assert.equal(initRes.writeLocked, true);
    assert.equal(isStorageWriteLocked(), true);

    // 2. Verify corrupted IndexedDB record was quarantined and NOT overwritten by fallbackSeed
    assert.equal(getQuarantinedIndexedDbBackup(), corruptedIdbJson);
    assert.equal(store[INDEXEDDB_QUARANTINE_KEY], corruptedIdbJson);
    assert.equal(__getMemoryIndexedDbSnapshotForTests(), corruptedIdbJson);
    assert.equal(store[STORAGE_KEY], undefined);

    // 3. Attempting to call saveTransactionalState(fallbackSeed) while write-locked MUST refuse to overwrite IndexedDB or localStorage!
    const blockedSave = await saveTransactionalState(fallbackSeed);
    assert.equal(blockedSave.ok, false);
    assert.equal(blockedSave.localStorageSaved, false);
    assert.equal(blockedSave.indexedDbSaved, false);
    assert.equal(__getMemoryIndexedDbSnapshotForTests(), corruptedIdbJson);
    assert.equal(store[STORAGE_KEY], undefined);

    // 4. Explicit user reset/unlock (`forceUnlockCorruptionLock: true`) unlocks and allows saving
    const unlockedSave = await saveTransactionalState(fallbackSeed, {
      forceUnlockCorruptionLock: true,
    });
    assert.equal(unlockedSave.ok, true);
    assert.equal(isStorageWriteLocked(), false);
  } finally {
    (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
    __clearMemoryIndexedDbForTests();
  }
});

test('Audit #13: Version conflicts between localStorage and IndexedDB are safely resolved and the losing version is archived', async () => {
  __clearMemoryIndexedDbForTests();

  const store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };

  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = mockLocalStorage;

  try {
    const olderLocalState = migrateV2ToV3({
      classrooms: [{ id: 'c1', name: '7-A', gradeLevel: '7', subject: 'Fen', academicYear: '2026' }],
      students: [
        { id: 's1', studentNumber: '101', fullName: 'Elif Yılmaz', classId: 'c1' },
        { id: 's2', studentNumber: '102', fullName: 'Kerem Demir', classId: 'c1' },
      ],
      rubrics: [sampleRubric],
      sessions: [
        {
          id: 'ses-1',
          title: 'Oturum 1',
          classId: 'c1',
          rubricId: 'rub-test',
          date: '2026-10-18',
          status: 'in_progress',
          mode: 'individual',
          generalSessionNote: 'Eski localStorage sürümü (1 öğrenci puanlı)',
          groups: [],
          evaluations: {
            s1: {
              studentId: 's1',
              criterionScores: { c1: 3, c2: 3 },
              note: 'Eski not',
              tags: [],
              updatedAt: '2026-10-18T08:00:00Z',
            },
          },
        },
      ],
    });

    const newerIdbState = migrateV2ToV3({
      ...olderLocalState,
      sessions: [
        {
          ...olderLocalState.sessions[0],
          generalSessionNote: 'Güncel IndexedDB sürümü (2 öğrenci puanlı)',
          evaluations: {
            s1: {
              studentId: 's1',
              criterionScores: { c1: 4, c2: 4 },
              note: 'Güncellenmiş Elif notu',
              tags: [],
              updatedAt: '2026-10-18T11:30:00Z',
            },
            s2: {
              studentId: 's2',
              criterionScores: { c1: 4, c2: 3 },
              note: 'Yeni eklenen Kerem notu',
              tags: [],
              updatedAt: '2026-10-18T11:35:00Z',
            },
          },
        },
      ],
    });

    const localBundle = {
      schemaVersion: 3,
      exportedAt: '2026-10-18T08:00:00Z',
      checksum: computePayloadChecksum(olderLocalState),
      payload: olderLocalState,
    };
    const idbBundle = {
      schemaVersion: 3,
      exportedAt: '2026-10-18T11:35:00Z',
      checksum: computePayloadChecksum(newerIdbState),
      payload: newerIdbState,
    };

    // Put older bundle in localStorage and newer bundle in IndexedDB
    store[STORAGE_KEY] = JSON.stringify(localBundle);
    __setMemoryIndexedDbSnapshotForTests(JSON.stringify(idbBundle));

    const resolved = await loadInitialStateWithRecovery(olderLocalState);
    assert.equal(resolved.conflictDetected, true);
    assert.equal(resolved.conflictWinner, 'indexeddb');
    assert.equal(resolved.source, 'conflict_resolved_indexeddb');
    assert.equal(resolved.conflictBackupKey, STORAGE_CONFLICT_BACKUP_KEY);

    // Winning state has both s1 (updated) and s2 evaluations from IndexedDB
    assert.equal(
      resolved.state.sessions[0].evaluations['s1'].note,
      'Güncellenmiş Elif notu'
    );
    assert.equal(
      resolved.state.sessions[0].evaluations['s2'].note,
      'Yeni eklenen Kerem notu'
    );

    // Losing localStorage bundle was safely archived in STORAGE_CONFLICT_BACKUP_KEY
    const archivedConflictRaw = getStorageConflictBackup();
    assert.ok(archivedConflictRaw);
    const archivedConflictParsed = JSON.parse(archivedConflictRaw!);
    assert.equal(
      archivedConflictParsed.payload.sessions[0].evaluations['s1'].note,
      'Eski not'
    );
    assert.equal(archivedConflictParsed. checksum, localBundle.checksum);
  } finally {
    (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
    __clearMemoryIndexedDbForTests();
  }
});




