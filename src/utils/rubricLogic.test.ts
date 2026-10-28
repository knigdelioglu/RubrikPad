import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  isScoreAssigned,
  calculateWeightedScore,
  getStudentEvaluationBreakdown,
  applyIndividualCriterionEdit,
  applyCriterionScoreToStudents,
  freezeRubricSnapshot,
  getEffectiveSessionRubric,
  validateRubric,
  canApplyGroupScoresToMembers,
  applyGroupScoresToMembers,
  evaluateGroupAndTransferToMembers,
  transferAllCompletedGroupsToMembers,
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
  getNextPendingGroup,
  shouldTriggerAutoAdvance,
  getGroupLifecycleStatus,
  getStudentProgressHistory,
  getStudentConsecutiveLowScoreReminder,
  sanitizeCsvFormulaInjection,
  generateSessionCsv,
  MAX_STUDENT_AUDIT_LOG_ENTRIES,
  MAX_UNDO_HISTORY_ENTRIES,
  createUniqueEntityId,
  appendStudentAuditLog,
  sanitizeObservationText,
  sanitizeExportFilename,
  validateClassroomRecord,
  checkClassroomDeletionImpact,
  hasStudentObservationData,
  upsertStudentQuickObservation,
  resolveFocusedCriterionIndex,
  getNextFocusedCriterionIndexAfterScore,
  getFocusModeStepSummary,
  archiveEvaluationSession,
  deleteEvaluationSession,
  partitionSessionsByArchiveStatus,
} from './rubricLogic.ts';
import {
  STORAGE_KEY,
  LEGACY_V3_ROLLBACK_KEY,
  STORAGE_CONFLICT_BACKUP_KEY,
  PRE_RESET_ROLLBACK_KEY,
  INDEXEDDB_QUARANTINE_KEY,
  MAX_BACKUP_JSON_BYTES,
  sha256Hex,
  computePayloadChecksum,
  computeLegacyRpkChecksum,
  computeInitialV3RpkChecksum,
  createVerifiedBackupBundle,
  verifyAndParseBackupBundle,
  importLegacyBackupBundle,
  validateFullAppDataStructure,
  parseJsonSafelyWithoutPrototypePollution,
  migrateV2ToV3,
  loadVerifiedInitialState,
  loadVerifiedInitialStateWithMeta,
  loadInitialStateWithRecovery,
  saveTransactionalState,
  savePreResetRollbackBackup,
  getPreResetRollbackBackup,
  getV3RollbackBackup,
  getStorageConflictBackup,
  getQuarantinedIndexedDbBackup,
  isStorageWriteLocked,
  unlockStorageWriteLock,
  __clearMemoryIndexedDbForTests,
  __setMemoryIndexedDbSnapshotForTests,
  __getMemoryIndexedDbSnapshotForTests,
  __setSimulateIndexedDbFailureForTests,
  stripSyntheticSeedEntities,
  purgeSyntheticSeedDataSync,
  loadInstitutionSettings,
  saveInstitutionSettings,
  __clearInstitutionSettingsForTests,
} from './storageLayer.ts';
import {
  INITIAL_CLASSROOMS,
  INITIAL_STUDENTS,
  INITIAL_RUBRICS,
  INITIAL_SESSIONS,
} from '../data/seedData.ts';
import {
  LITERARY_BOOK_PRESENTATION_RUBRIC,
  INFORMATIVE_BOOK_PRESENTATION_RUBRIC,
  LEGACY_BOOK_PRESENTATION_RUBRIC,
  LEGACY_BOOK_PRESENTATION_RUBRIC_ID,
  LEGACY_V3_LITERARY_BOOK_RUBRIC,
} from '../data/bookPresentationRubric.ts';
import {
  generatePaginatedSessionPdfBytes,
  generateStudentPortfolioPdfBytes,
  generateClassroomOverviewPdfBytes,
  decodePdfTextWithToUnicode,
  normalizePdfTextLine,
} from './pdfGenerator.ts';
import { validateUploadedImageMagicBytes } from './ocr/imagePreprocessor.ts';
import type {
  Classroom,
  Rubric,
  Student,
  EvaluationSession,
  StudentGroup,
} from '../types.ts';

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

test('Audit #14: Smart auto-advance triggers only on last missing criterion, and Group Evaluation follows Puanlanıyor -> Tamamlandı -> Üyelere Uygulandı lifecycle', () => {
  // 1. Smart Auto-Advance: triggers ONLY when transitioning from incomplete to complete
  assert.equal(shouldTriggerAutoAdvance(false, true, true), true);
  // Editing an already completed student (wasCompleteBefore === true) MUST NOT trigger auto-advance!
  assert.equal(shouldTriggerAutoAdvance(true, true, true), false);
  // Partial completion or disabled toggle MUST NOT trigger auto-advance!
  assert.equal(shouldTriggerAutoAdvance(false, false, true), false);
  assert.equal(shouldTriggerAutoAdvance(false, true, false), false);

  // 2. Group Evaluation 3-Stage Lifecycle: Puanlanıyor -> Tamamlandı -> Üyelere Uygulandı
  const grpA: StudentGroup = {
    id: 'grp-a',
    name: 'Grup A: Güneş Enerjisi',
    studentIds: ['s1', 's2'],
    criterionScores: { c1: 4 }, // 1/2 criteria scored
    groupNote: 'İlk gözlem',
  };
  const grpB: StudentGroup = {
    id: 'grp-b',
    name: 'Grup B: Rüzgar Türbini',
    studentIds: ['s3'],
    criterionScores: {},
    groupNote: '',
  };

  let evaluations = {};

  // Stage 1: Puanlanıyor (1/2 criteria -> incomplete, finalScoreOutOf100 MUST be null)
  const statusStage1 = getGroupLifecycleStatus(
    sampleRubric,
    grpA,
    evaluations
  );
  assert.equal(statusStage1.state, 'in_progress');
  assert.equal(statusStage1.shortLabel, 'Puanlanıyor');
  assert.equal(statusStage1.finalScoreOutOf100, null);
  assert.equal(statusStage1.completedCriteriaCount, 1);
  assert.equal(statusStage1.totalCriteriaCount, 2);

  // Stage 2: Tamamlandı (2/2 criteria scored, but NOT yet applied to members -> step 3 is never skipped!)
  const grpACompleted: StudentGroup = {
    ...grpA,
    criterionScores: { c1: 4, c2: 3 },
  };
  const statusStage2 = getGroupLifecycleStatus(
    sampleRubric,
    grpACompleted,
    evaluations
  );
  assert.equal(statusStage2.state, 'completed_unapplied');
  assert.equal(statusStage2.shortLabel, 'Tamamlandı');
  assert.equal(statusStage2.isComplete, true);
  assert.equal(statusStage2.finalScoreOutOf100, 88);
  assert.equal(statusStage2.appliedMemberCount, 0);

  // Stage 3: Üyelere Uygulandı (explicitly applying group scores to members)
  evaluations = applyGroupScoresToMembers(
    evaluations,
    grpACompleted,
    '2026-10-18T12:00:00Z'
  );
  const statusStage3 = getGroupLifecycleStatus(
    sampleRubric,
    grpACompleted,
    evaluations
  );
  assert.equal(statusStage3.state, 'applied');
  assert.equal(statusStage3.shortLabel, 'Üyelere Uygulandı');
  assert.equal(statusStage3.appliedMemberCount, 2);
  assert.equal(statusStage3.totalMemberCount, 2);

  // Next pending group after Group A is applied is Group B
  const nextGrp = getNextPendingGroup(
    [grpACompleted, grpB],
    evaluations,
    sampleRubric,
    'grp-a'
  );
  assert.equal(nextGrp?.id, 'grp-b');

  // Modifying a score on an already applied group transitions it back to 'completed_unapplied' with hasStaleMemberScores = true
  const grpAModified: StudentGroup = {
    ...grpACompleted,
    criterionScores: { c1: 4, c2: 4 },
  };
  const statusAfterEdit = getGroupLifecycleStatus(
    sampleRubric,
    grpAModified,
    evaluations
  );
  assert.equal(statusAfterEdit.state, 'completed_unapplied');
  assert.equal(statusAfterEdit.hasStaleMemberScores, true);
  assert.equal(statusAfterEdit.finalScoreOutOf100, 100);
});

test('Audit #15: Incomplete group scores are strictly blocked from being applied to group members across all entry points', () => {
  const incompleteGroup: StudentGroup = {
    id: 'grp-inc',
    name: 'Grup Eksik',
    studentIds: ['s1', 's2'],
    criterionScores: { c1: 4 }, // c2 is missing!
    groupNote: 'Henüz tamamlanmadı',
  };

  // 1. canApplyGroupScoresToMembers returns allowed: false when any required criterion is missing
  assert.equal(
    canApplyGroupScoresToMembers(incompleteGroup, sampleRubric).allowed,
    false
  );

  // 2. applyGroupScoresToMembers refuses to propagate incomplete group scores when rubric is provided
  const initialEvals = {};
  const afterBlockedApply = applyGroupScoresToMembers(
    initialEvals,
    incompleteGroup,
    '2026-10-19T09:00:00Z',
    sampleRubric
  );
  assert.deepEqual(afterBlockedApply, {});
  assert.equal(afterBlockedApply['s1'], undefined);
  assert.equal(afterBlockedApply['s2'], undefined);

  // 3. Even if no rubric argument is passed to applyGroupScoresToMembers, if the group has partial null/unscored criteria or no scores, it blocks propagation
  const partialNullGroup: StudentGroup = {
    ...incompleteGroup,
    criterionScores: { c1: 4, c2: null },
  };
  const afterPartialNullApply = applyGroupScoresToMembers(
    initialEvals,
    partialNullGroup,
    '2026-10-19T09:00:00Z'
  );
  assert.deepEqual(afterPartialNullApply, {});

  // 4. toggleGroupMemberAndReconcile does NOT auto-apply an incomplete group's scores to a newly added member
  const sessionWithIncompleteGroup: EvaluationSession = {
    id: 'ses-inc-grp',
    title: 'Grup Oturumu',
    classId: 'cls-1',
    classIds: ['cls-1'],
    rubricId: sampleRubric.id,
    rubricSnapshot: freezeRubricSnapshot(sampleRubric),
    date: '2026-10-19',
    status: 'in_progress',
    mode: 'group',
    generalSessionNote: '',
    groups: [
      {
        id: 'grp-inc',
        name: 'Grup Eksik',
        studentIds: ['s1'],
        criterionScores: { c1: 4 }, // incomplete (1/2)
        groupNote: 'Kısmi not',
      },
    ],
    evaluations: {},
  };

  const afterAddingS2ToIncomplete = toggleGroupMemberAndReconcile(
    sessionWithIncompleteGroup,
    'grp-inc',
    's2',
    '2026-10-19T09:05:00Z'
  );
  assert.equal(
    afterAddingS2ToIncomplete.evaluations['s2'],
    undefined,
    'Incomplete group scores must never be synced to newly added member s2'
  );

  // 5. Once all required criteria (c1 and c2) are scored, canApplyGroupScoresToMembers is true and applyGroupScoresToMembers succeeds
  const completedGroup: StudentGroup = {
    ...incompleteGroup,
    criterionScores: { c1: 4, c2: 3 },
  };
  assert.equal(
    canApplyGroupScoresToMembers(completedGroup, sampleRubric).allowed,
    true
  );
  const afterValidApply = applyGroupScoresToMembers(
    initialEvals,
    completedGroup,
    '2026-10-19T09:10:00Z',
    sampleRubric
  );
  assert.deepEqual(afterValidApply['s1']?.groupCriterionScores, { c1: 4, c2: 3 });
  assert.deepEqual(afterValidApply['s2']?.groupCriterionScores, { c1: 4, c2: 3 });
});

test('Audit #16: Initial and intermediate v3 checksum compatibility across all rpk- (16-hex & 8-hex) and sha256- projections with strict tamper rejection', () => {
  const baseState = migrateV2ToV3({
    classrooms: [
      {
        id: 'cls-1',
        name: '7/A',
        gradeLevel: '7',
        subject: 'Fen Bilimleri',
        academicYear: '2025-2026',
      },
    ],
    students: [
      {
        id: 's1',
        studentNumber: '245',
        firstName: 'AYŞE NUR',
        lastName: 'ÇELİK',
        fullName: 'AYŞE NUR ÇELİK',
        classId: 'cls-1',
      },
    ],
    rubrics: [sampleRubric],
    sessions: [
      {
        id: 'ses-v3-compat',
        title: 'İlk v3 Uyumluluk Testi',
        classId: 'cls-1',
        classIds: ['cls-1'],
        rubricId: sampleRubric.id,
        rubricSnapshot: freezeRubricSnapshot(sampleRubric),
        date: '2026-10-19',
        status: 'in_progress',
        mode: 'group',
        generalSessionNote: '',
        groups: [
          {
            id: 'g1',
            name: 'Grup 1',
            studentIds: ['s1'],
            criterionScores: { c1: 4, c2: 3 },
            groupNote: 'Tamamlandı',
          },
        ],
        evaluations: {
          s1: {
            studentId: 's1',
            criterionScores: { c1: 4, c2: 3 },
            groupCriterionScores: { c1: 4, c2: 3 },
            groupNote: 'Tamamlandı',
            groupId: 'g1',
            activeScoreSource: 'group',
            note: 'Bireysel not',
            tags: [],
            updatedAt: '2026-10-19T08:00:00Z',
          },
        },
      },
    ],
  });

  const legacyVariants: Array<{
    label: string;
    checksum: string;
  }> = [
    {
      label: 'Initial v3 minimal schema + cyrb53_16',
      checksum: computeLegacyRpkChecksum(baseState, {
        studentFields: 'only_full_name',
        groupFields: 'v3_initial_minimal',
        evaluationFields: 'v3_initial_minimal',
        includeSessionExtras: false,
        includeAuditAndUndo: false,
        hashAlgorithm: 'cyrb53_16',
      }),
    },
    {
      label: 'Initial v3 omit_full_name + v3_without_last_applied + cyrb53_16',
      checksum: computeLegacyRpkChecksum(baseState, {
        studentFields: 'omit_full_name',
        groupFields: 'v3_without_last_applied',
        evaluationFields: 'v3_without_group_id',
        includeSessionExtras: true,
        includeAuditAndUndo: false,
        hashAlgorithm: 'cyrb53_16',
      }),
    },
    {
      label: 'Initial v3 rawPayloadDirect + non-canonicalized + cyrb53_16',
      checksum: computeLegacyRpkChecksum(baseState, {
        rawPayloadDirect: true,
        canonicalize: false,
        hashAlgorithm: 'cyrb53_16',
      }),
    },
    {
      label: 'Initial v3 8-hex FNV-1a (rpk-<8_hex>) minimal projection',
      checksum: computeLegacyRpkChecksum(baseState, {
        studentFields: 'only_full_name',
        groupFields: 'v3_initial_minimal',
        evaluationFields: 'raw_record',
        includeSessionExtras: false,
        hashAlgorithm: 'fnv1a_8',
      }),
    },
    {
      label: 'Initial v3 8-hex DJB2 (rpk-<8_hex>) projection',
      checksum: computeLegacyRpkChecksum(baseState, {
        studentFields: 'with_full_name',
        groupFields: 'v3_without_last_applied',
        evaluationFields: 'v3_without_group_direct',
        hashAlgorithm: 'djb2_8',
      }),
    },
    {
      label: 'Initial v3 8-hex Cyrb53-32 (rpk-<8_hex>) projection',
      checksum: computeLegacyRpkChecksum(baseState, {
        rawPayloadDirect: true,
        canonicalize: true,
        hashAlgorithm: 'cyrb53_8',
      }),
    },
    {
      label: 'Earlier v3 SHA-256 over raw payload directly',
      checksum: `sha256-${sha256Hex(
        JSON.stringify({
          classrooms: baseState.classrooms,
          students: baseState.students,
          rubrics: baseState.rubrics,
          sessions: baseState.sessions,
        })
      )}`,
    },
  ];

  for (const variant of legacyVariants) {
    const bundleJson = JSON.stringify({
      schemaVersion: 3,
      exportedAt: '2026-10-19T08:00:00Z',
      checksum: variant.checksum,
      payload: baseState,
    });

    const parsed = verifyAndParseBackupBundle(bundleJson);
    assert.equal(
      parsed.isValid,
      true,
      `Expected valid verification for ${variant.label} (${variant.checksum}), got error: ${parsed.error}`
    );
    assert.equal(
      parsed.upgradedFromRpkChecksum,
      true,
      `Expected upgradedFromRpkChecksum=true for ${variant.label}`
    );

    // Tampering with a score in payload MUST fail verification for every single variant!
    const tamperedState = JSON.parse(JSON.stringify(baseState));
    tamperedState.sessions[0].evaluations['s1'].criterionScores['c1'] = 1;
    const tamperedBundleJson = JSON.stringify({
      schemaVersion: 3,
      exportedAt: '2026-10-19T08:00:00Z',
      checksum: variant.checksum,
      payload: tamperedState,
    });
    const tamperedResult = verifyAndParseBackupBundle(tamperedBundleJson);
    assert.equal(
      tamperedResult.isValid,
      false,
      `Tampered payload MUST be rejected for ${variant.label}`
    );
  }
});

// ============================================================================
// AUDIT #17: Group Evaluation & Seamless Transfer to Group Member Students
// ============================================================================
test('Audit #17: evaluateGroupAndTransferToMembers and transferAllCompletedGroupsToMembers evaluate a group as a unit and transfer evaluation to all member students', () => {
  const baseSession: EvaluationSession = {
    id: 'sess-grp-transfer',
    title: 'Proje Grup Değerlendirmesi',
    classId: 'cls-1',
    rubricId: sampleRubric.id,
    rubricSnapshot: freezeRubricSnapshot(sampleRubric),
    mode: 'group',
    status: 'in_progress',
    generalSessionNote: '',
    date: '2026-10-19',
    evaluations: {
      // s1 has an older individual evaluation that should be preserved in history while group score becomes active
      s1: {
        studentId: 's1',
        criterionScores: { c1: 2, c2: 2 },
        activeScoreSource: 'individual',
        note: 'Önceki bireysel not',
        tags: [],
        updatedAt: '2026-10-18T10:00:00Z',
      },
    },
    groups: [
      {
        id: 'g1',
        name: 'Grup Alfa',
        studentIds: ['s1', 's2', 's3'],
        criterionScores: { c1: 4 }, // 1 of 2 criteria scored initially
        groupNote: 'Grup Alfa ortak sunum ve araştırma raporu',
      },
      {
        id: 'g2',
        name: 'Grup Beta',
        studentIds: ['s4', 's5'],
        criterionScores: { c1: 3, c2: 4 }, // Complete!
        groupNote: 'Grup Beta poster çalışması',
      },
    ],
  };

  // 1. Score the second criterion of Grup Alfa using evaluateGroupAndTransferToMembers with autoTransferToMembers=true
  const g1Result = evaluateGroupAndTransferToMembers(
    baseSession,
    'g1',
    (grp) => ({
      ...grp,
      criterionScores: { ...grp.criterionScores, c2: 3 },
    }),
    {
      rubric: sampleRubric,
      autoTransferToMembers: true,
      undoDescription: 'Grup Alfa Kriter 2 puanlandı',
      criterionId: 'c2',
    }
  );

  assert.equal(g1Result.wasCompleteBefore, false);
  assert.equal(g1Result.isCompleteAfter, true);
  assert.equal(g1Result.transferredToMembers, true);
  assert.equal(g1Result.transferredMemberCount, 3);

  const afterG1Completed = g1Result.updatedSession;
  const g1After = afterG1Completed.groups!.find((g) => g.id === 'g1')!;
  assert.ok(g1After.lastAppliedAt, 'Completed group should have lastAppliedAt stamped automatically');

  // Verify all 3 members of Grup Alfa (s1, s2, s3) received the group evaluation as their active evaluation
  for (const memberId of ['s1', 's2', 's3']) {
    const memberEval = afterG1Completed.evaluations[memberId];
    assert.ok(memberEval, `Member ${memberId} must have an evaluation record`);
    assert.equal(memberEval.groupId, 'g1');
    assert.equal(memberEval.activeScoreSource, 'group', `Member ${memberId} activeScoreSource must be 'group'`);
    assert.deepEqual(memberEval.groupCriterionScores, { c1: 4, c2: 3 });

    const breakdown = getStudentEvaluationBreakdown(sampleRubric, memberEval);
    assert.equal(breakdown.activeSource, 'group');
    assert.equal(breakdown.effectiveCalc.isComplete, true);
    assert.equal(breakdown.effectiveCalc.scoreOutOf100, 88); // c1(50%): 4/4=50, c2(50%): 3/4=37.5 -> 87.5 rounded to 88
  }

  // Verify s1's prior individual evaluation was preserved so teacher can still switch between 'group' and 'individual'
  assert.deepEqual(afterG1Completed.evaluations['s1'].criterionScores, { c1: 2, c2: 2 });
  assert.equal(afterG1Completed.evaluations['s1'].note, 'Önceki bireysel not');
  // And s2/s3received the group note
  assert.equal(afterG1Completed.evaluations['s2'].groupNote, 'Grup Alfa ortak sunum ve araştırma raporu');

  // 2. Test bulk transfer of all completed groups (Grup Alfa + Grup Beta)
  const bulkResult = transferAllCompletedGroupsToMembers(afterG1Completed, sampleRubric);
  assert.equal(bulkResult.transferredGroupCount, 2);
  assert.equal(bulkResult.transferredStudentCount, 5);

  for (const betaMemberId of ['s4', 's5']) {
    const betaEval = bulkResult.updatedSession.evaluations[betaMemberId];
    assert.ok(betaEval);
    assert.equal(betaEval.groupId, 'g2');
    assert.equal(betaEval.activeScoreSource, 'group');
    assert.deepEqual(betaEval.groupCriterionScores, { c1: 3, c2: 4 });
    assert.equal(betaEval.groupNote, 'Grup Beta poster çalışması');
  }
});

// ============================================================================
// AUDIT #18: Original Initial-v3 rpk- Checksum, Precision Score Group Transition,
// Android Backup Privacy, and Gemini Cleanup
// ============================================================================
test('Audit #18.1 (P0): Original initial-v3 rpk- checksum algorithm (Turn 1 summary & Audit #2 projections across FNV-1a, DJB2, Java31, SDBM, Cyrb53, Base36) is verified and auto-upgraded', () => {
  const initialV3Payload = {
    classrooms: [
      {
        id: 'cls-1',
        name: '6-A',
        gradeLevel: '6. Sınıf',
        subject: 'Fen Bilimleri',
        academicYear: '2026-2027',
      },
    ],
    students: [
      {
        id: 'stu-1',
        studentNumber: '101',
        firstName: 'Elif',
        lastName: 'Yılmaz',
        fullName: 'Elif Yılmaz',
        classId: 'cls-1',
      },
    ],
    rubrics: [sampleRubric],
    sessions: [
      {
        id: 'sess-v3-orig',
        title: 'İlk v3 Kaydı',
        classId: 'cls-1',
        rubricId: sampleRubric.id,
        mode: 'group' as const,
        date: '2026-10-19',
        status: 'completed' as const,
        generalSessionNote: '',
        evaluations: {
          'stu-1': {
            studentId: 'stu-1',
            criterionScores: { c1: 4, c2: 3 },
            note: 'Tamamlandı',
            tags: ['Aktif Katılım'],
            updatedAt: '2026-10-19T08:00:00Z',
          },
        },
        groups: [
          {
            id: 'grp-1',
            name: 'Grup 1',
            studentIds: ['stu-1'],
            criterionScores: { c1: 4, c2: 3 },
            groupNote: '',
          },
        ],
      },
    ],
  };

  const initialV3Checksums = [
    computeInitialV3RpkChecksum(initialV3Payload, 'fnv1a_8'),
    computeInitialV3RpkChecksum(initialV3Payload, 'djb2_8'),
    computeInitialV3RpkChecksum(initialV3Payload, 'java31_8'),
    computeInitialV3RpkChecksum(initialV3Payload, 'sdbm_8'),
    computeInitialV3RpkChecksum(initialV3Payload, 'cyrb53_16'),
    computeInitialV3RpkChecksum(initialV3Payload, 'fnv1a_base36'),
    computeLegacyRpkChecksum(initialV3Payload, {
      evaluationFields: 'v3_turn1_original',
      groupFields: 'v3_turn1_original',
      rubricFields: 'v3_turn1_minimal',
      sessionFields: 'v3_turn1_no_general_note',
      hashAlgorithm: 'fnv1a_8',
    }),
    computeLegacyRpkChecksum(initialV3Payload, {
      studentFields: 'omit_full_name',
      evaluationFields: 'v3_audit2_exact',
      groupFields: 'v3_initial_minimal',
      hashAlgorithm: 'fnv1a_8',
    }),
  ];

  const fallbackSeed: typeof initialV3Payload = {
    classrooms: [],
    students: [],
    rubrics: [],
    sessions: [],
  };

  for (const rpkChecksum of initialV3Checksums) {
    assert.ok(rpkChecksum.startsWith('rpk-'));

    // 1. Verify backup bundle with this initial-v3 rpk- checksum
    const bundleJson = JSON.stringify({
      schemaVersion: 3,
      exportedAt: '2026-10-19T08:00:00Z',
      checksum: rpkChecksum,
      payload: initialV3Payload,
    });
    const parsedBundle = verifyAndParseBackupBundle(bundleJson);
    assert.equal(
      parsedBundle.isValid,
      true,
      `Expected valid backup bundle verification for ${rpkChecksum}, got: ${parsedBundle.error}`
    );
    assert.equal(parsedBundle.upgradedFromRpkChecksum, true);

    // 2. Verify localStorage state with this initial-v3 rpk- checksum via loadVerifiedInitialStateWithMeta
    const rawEnvelope = JSON.stringify({
      schemaVersion: 3,
      updatedAt: '2026-10-19T08:00:00Z',
      checksum: rpkChecksum,
      payload: initialV3Payload,
    });

    const store: Record<string, string> = {
      [STORAGE_KEY]: rawEnvelope,
    };
    const prevLs = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    };

    try {
      const metaRes = loadVerifiedInitialStateWithMeta(fallbackSeed);
      assert.equal(
        metaRes.source,
        'localStorage_v3',
        `Should load from localStorage_v3 and NOT fall back to seed for initial-v3 checksum ${rpkChecksum}`
      );
      assert.equal(metaRes.localStorageCorrupted, false);
      assert.equal(metaRes.upgradedFromRpkChecksum, true);
      assert.equal(metaRes.state.students[0].fullName, 'Elif Yılmaz');
      const upgradedEnvelope = JSON.parse(store[STORAGE_KEY]);
      assert.match(String(upgradedEnvelope.checksum), /^sha256-[0-9a-f]{64}$/);
    } finally {
      (globalThis as Record<string, unknown>).localStorage = prevLs;
    }
  }
});

test('Audit #18.2 (P1): applyIndividualCriterionEdit behaves identically for normal level selection and precision direct score entry when transitioning from group score to individual evaluation', () => {
  // Student s1 currently has a completed group evaluation (c1: 4, c2: 3) as activeScoreSource: 'group'
  // and no prior individual criterionScores.
  const studentWithGroupScore = {
    studentId: 's1',
    criterionScores: {},
    groupId: 'g1',
    groupCriterionScores: { c1: 4, c2: 3 },
    groupNote: 'Grup ortak değerlendirmesi',
    activeScoreSource: 'group' as const,
    note: '',
    tags: [],
    updatedAt: '2026-10-19T09:00:00Z',
  };

  // Case A: Teacher selects normal level 3 on c1 for student s1
  const resNormal = applyIndividualCriterionEdit(
    sampleRubric,
    studentWithGroupScore,
    's1',
    {
      type: 'level',
      criterionId: 'c1',
      points: 3,
    }
  );

  const breakdownNormal = getStudentEvaluationBreakdown(
    sampleRubric,
    resNormal.updatedEvaluation
  );
  assert.equal(resNormal.transitionedFromGroup, true);
  assert.equal(resNormal.updatedEvaluation.activeScoreSource, 'individual');
  assert.equal(breakdownNormal.activeSource, 'individual');
  assert.equal(
    breakdownNormal.effectiveCalc.isComplete,
    true,
    'Normal level edit after group score must keep evaluation complete (c2 seeded from group)'
  );
  assert.equal(resNormal.updatedEvaluation.criterionScores['c1'], 3);
  assert.equal(resNormal.updatedEvaluation.criterionScores['c2'], 3);

  // Case B: Teacher enters precision direct score 35 on c1 (maxPoints=50) for student s1
  const resPrecision = applyIndividualCriterionEdit(
    sampleRubric,
    studentWithGroupScore,
    's1',
    {
      type: 'direct',
      criterionId: 'c1',
      directPoints: 35,
    }
  );

  const breakdownPrecision = getStudentEvaluationBreakdown(
    sampleRubric,
    resPrecision.updatedEvaluation
  );
  assert.equal(resPrecision.transitionedFromGroup, true);
  assert.equal(resPrecision.updatedEvaluation.activeScoreSource, 'individual');
  assert.equal(breakdownPrecision.activeSource, 'individual');
  assert.equal(
    breakdownPrecision.effectiveCalc.isComplete,
    true,
    'Precision direct score edit after group score must also keep evaluation complete (c2 seeded from group)'
  );
  assert.equal(resPrecision.updatedEvaluation.directCriterionScores?.['c1'], 35);
  assert.equal(resPrecision.updatedEvaluation.criterionScores['c2'], 3);
  // Weighted score: c1 (50% weight, maxPoints 50): 35/50 = 35, c2 (50% weight, level 3/4): 37.5 => 72.5 -> 73
  assert.equal(breakdownPrecision.effectiveCalc.scoreOutOf100, 73);

  // Case C: Group itself had precision direct scores (groupDirectScores) and teacher edits c2 via precision direct score
  const studentWithGroupPrecision = {
    studentId: 's2',
    criterionScores: {},
    groupId: 'g1',
    groupCriterionScores: { c1: 4, c2: 3 },
    groupDirectScores: { c1: 42 },
    activeScoreSource: 'group' as const,
    note: '',
    tags: [],
    updatedAt: '2026-10-19T09:00:00Z',
  };

  const resEditingC2Direct = applyIndividualCriterionEdit(
    sampleRubric,
    studentWithGroupPrecision,
    's2',
    {
      type: 'direct',
      criterionId: 'c2',
      directPoints: 38,
    }
  );
  const breakdownC2Direct = getStudentEvaluationBreakdown(
    sampleRubric,
    resEditingC2Direct.updatedEvaluation
  );
  assert.equal(breakdownC2Direct.effectiveCalc.isComplete, true);
  assert.equal(resEditingC2Direct.updatedEvaluation.directCriterionScores?.['c1'], 42);
  assert.equal(resEditingC2Direct.updatedEvaluation.directCriterionScores?.['c2'], 38);
  assert.equal(breakdownC2Direct.effectiveCalc.scoreOutOf100, 80);
});

test('Audit #18.3 (P1 & P2): AndroidManifest disables auto-backup for KVKK student privacy and Gemini remnants are removed', () => {
  const manifestXml = fs.readFileSync(
    'android/app/src/main/AndroidManifest.xml',
    'utf-8'
  );
  assert.ok(
    manifestXml.includes('android:allowBackup="false"'),
    'AndroidManifest.xml must set android:allowBackup="false"'
  );
  assert.ok(
    !manifestXml.includes('android:allowBackup="true"'),
    'AndroidManifest.xml must not allow automatic cloud backups of student data'
  );
  assert.ok(
    manifestXml.includes('android:dataExtractionRules="@xml/data_extraction_rules"'),
    'AndroidManifest.xml must reference @xml/data_extraction_rules'
  );

  const extractionRulesXml = fs.readFileSync(
    'android/app/src/main/res/xml/data_extraction_rules.xml',
    'utf-8'
  );
  assert.ok(extractionRulesXml.includes('<cloud-backup>'));
  assert.ok(extractionRulesXml.includes('<device-transfer>'));

  const pkgJson = fs.readFileSync('package.json', 'utf-8');
  assert.ok(
    !pkgJson.includes('@google/genai'),
    'package.json must not contain unused @google/genai dependency'
  );

  const viteCfg = fs.readFileSync('vite.config.ts', 'utf-8');
  assert.ok(
    !viteCfg.includes('GEMINI_API_KEY'),
    'vite.config.ts must not expose GEMINI_API_KEY'
  );
});

test('Audit #19: getStudentConsecutiveLowScoreReminder triggers "Gözlem notu ekle" after 3 consecutive low scores (1 or 2) across criteria or sessions', () => {
  const fourCriteriaRubric: Rubric = {
    ...sampleRubric,
    id: 'rub-4c',
    criteria: [
      { ...sampleRubric.criteria[0], id: 'c1', weight: 25 },
      { ...sampleRubric.criteria[1], id: 'c2', weight: 25 },
      { ...sampleRubric.criteria[0], id: 'c3', weight: 25 },
      { ...sampleRubric.criteria[1], id: 'c4', weight: 25 },
    ],
  };

  const sessionWith3LowCriteria: EvaluationSession = {
    id: 'ses-low-crit',
    title: 'Deney Değerlendirmesi',
    date: '2026-10-20',
    classId: 'cls-1',
    rubricId: 'rub-4c',
    rubricSnapshot: fourCriteriaRubric,
    mode: 'individual',
    status: 'in_progress',
    generalSessionNote: '',
    groups: [],
    evaluations: {
      'stu-1': {
        studentId: 'stu-1',
        criterionScores: { c1: 2, c2: 1, c3: 2, c4: 4 },
        note: '',
        tags: [],
        updatedAt: '2026-10-20T10:00:00Z',
      },
      'stu-2': {
        studentId: 'stu-2',
        criterionScores: { c1: 2, c2: 3, c3: 1, c4: 2 },
        note: '',
        tags: [],
        updatedAt: '2026-10-20T10:00:00Z',
      },
    },
  };

  // stu-1 has 3 consecutive low criteria (2, 1, 2) -> shouldRemind = true
  const reminderStu1 = getStudentConsecutiveLowScoreReminder(
    'stu-1',
    sessionWith3LowCriteria,
    [sessionWith3LowCriteria],
    { 'rub-4c': fourCriteriaRubric }
  );
  assert.equal(reminderStu1.shouldRemind, true);
  assert.equal(reminderStu1.reminderLabel, 'Gözlem notu ekle');
  assert.equal(reminderStu1.consecutiveCount, 3);
  assert.equal(reminderStu1.triggerType, 'consecutive_criteria');

  // stu-2 has low scores broken by level 3 (2, 3, 1, 2 -> max streak 2) -> shouldRemind = false
  const reminderStu2 = getStudentConsecutiveLowScoreReminder(
    'stu-2',
    sessionWith3LowCriteria,
    [sessionWith3LowCriteria],
    { 'rub-4c': fourCriteriaRubric }
  );
  assert.equal(reminderStu2.shouldRemind, false);

  // Test 3 consecutive sessions with low scores (1 or 2)
  const makeSession = (
    id: string,
    date: string,
    scores: Record<string, number>
  ): EvaluationSession => ({
    id,
    title: `Oturum ${id}`,
    date,
    classId: 'cls-1',
    rubricId: sampleRubric.id,
    rubricSnapshot: sampleRubric,
    mode: 'individual',
    status: 'completed',
    generalSessionNote: '',
    groups: [],
    evaluations: {
      'stu-3': {
        studentId: 'stu-3',
        criterionScores: scores,
        note: '',
        tags: [],
        updatedAt: `${date}T10:00:00Z`,
      },
    },
  });

  const s1 = makeSession('s1', '2026-10-01', { c1: 1, c2: 2 });
  const s2 = makeSession('s2', '2026-10-08', { c1: 2, c2: 2 });
  const s3 = makeSession('s3', '2026-10-15', { c1: 1, c2: 1 });

  const reminderStu3 = getStudentConsecutiveLowScoreReminder(
    'stu-3',
    s3,
    [s1, s2, s3],
    { [sampleRubric.id]: sampleRubric }
  );
  assert.equal(reminderStu3.shouldRemind, true);
  assert.equal(reminderStu3.reminderLabel, 'Gözlem notu ekle');
  assert.equal(reminderStu3.consecutiveCount, 3);
  assert.equal(reminderStu3.triggerType, 'consecutive_sessions');

  // Once an observation note is entered for stu-1 or stu-3, shouldRemind becomes false
  const sessionWithNoteForStu1: EvaluationSession = {
    ...sessionWith3LowCriteria,
    evaluations: {
      ...sessionWith3LowCriteria.evaluations,
      'stu-1': {
        ...sessionWith3LowCriteria.evaluations['stu-1'],
        note: 'Ek tekrar çalışması planlandı.',
      },
    },
  };
  const reminderAfterNoteStu1 = getStudentConsecutiveLowScoreReminder(
    'stu-1',
    sessionWithNoteForStu1,
    [sessionWithNoteForStu1],
    { 'rub-4c': fourCriteriaRubric }
  );
  assert.equal(reminderAfterNoteStu1.hasObservationNote, true);
  assert.equal(reminderAfterNoteStu1.shouldRemind, false);
});

test('Data Security Audit Fix: Backup size cap, prototype pollution guard, and strict score/entity validation', () => {
  // 1. Prototype pollution keys (__proto__, constructor, prototype) are stripped during JSON parsing
  const pollutedRaw =
    '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"polluted":true}},"safeKey":"ok"}';
  const parsedSafe = parseJsonSafelyWithoutPrototypePollution<Record<string, unknown>>(
    pollutedRaw
  );
  assert.equal(parsedSafe.safeKey, 'ok');
  assert.equal(({} as Record<string, unknown>).isAdmin, undefined);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);

  // 2. Oversized backup strings (> MAX_BACKUP_JSON_BYTES) are rejected before JSON.parse
  const oversizedStr = 'x'.repeat(MAX_BACKUP_JSON_BYTES + 128);
  const v3OversizedRes = verifyAndParseBackupBundle(oversizedStr);
  assert.equal(v3OversizedRes.isValid, false);
  assert.ok(v3OversizedRes.error?.includes('güvenli sınırı'));

  const legacyOversizedRes = importLegacyBackupBundle(oversizedStr);
  assert.equal(legacyOversizedRes.isValid, false);
  assert.ok(legacyOversizedRes.error?.includes('güvenli sınırı'));

  // 3. Negative or out-of-range scores in evaluations or criteria are rejected by validateFullAppDataStructure
  const baseState = {
    classrooms: [
      {
        id: 'cls-1',
        name: '7/A',
        gradeLevel: '7. Sınıf',
        subject: 'Fen',
        academicYear: '2026-2027',
      },
    ],
    students: [
      {
        id: 'stu-1',
        studentNumber: '101',
        firstName: 'Ayşe',
        lastName: 'Yılmaz',
        fullName: 'Ayşe Yılmaz',
        classId: 'cls-1',
      },
    ],
    rubrics: [sampleRubric],
    sessions: [
      {
        id: 'ses-1',
        title: 'Deney 1',
        date: '2026-10-20',
        classId: 'cls-1',
        rubricId: sampleRubric.id,
        mode: 'individual' as const,
        status: 'in_progress' as const,
        groups: [],
        evaluations: {
          'stu-1': {
            studentId: 'stu-1',
            criterionScores: { c1: -50 }, // invalid negative score!
            note: '',
            tags: [],
            updatedAt: '2026-10-20T10:00:00Z',
          },
        },
      },
    ],
  };

  const invalidScoreCheck = validateFullAppDataStructure(baseState);
  assert.equal(invalidScoreCheck.isValid, false);
  assert.ok(invalidScoreCheck.error?.includes('geçersiz'));
});

test('Data Security Audit Fix: Multi-tab optimistic concurrency lock, pre-reset backup, and quota auto-healing', async () => {
  __clearMemoryIndexedDbForTests();
  const mockStore = new Map<string, string>();
  let failSetItemUntilAuxiliaryEvicted = false;

  const originalLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => mockStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (
        failSetItemUntilAuxiliaryEvicted &&
        k === STORAGE_KEY &&
        (mockStore.has(LEGACY_V3_ROLLBACK_KEY) ||
          mockStore.has(STORAGE_CONFLICT_BACKUP_KEY) ||
          mockStore.has(PRE_RESET_ROLLBACK_KEY))
      ) {
        throw new Error('QuotaExceededError');
      }
      mockStore.set(k, v);
    },
    removeItem: (k: string) => {
      mockStore.delete(k);
    },
    clear: () => mockStore.clear(),
  };

  try {
    const tabAState = {
      classrooms: [
        {
          id: 'cls-7a',
          name: '7/A',
          gradeLevel: '7. Sınıf',
          subject: 'Fen',
          academicYear: '2026-2027',
        },
      ],
      students: [
        {
          id: 'stu-1',
          studentNumber: '101',
          firstName: 'Elif',
          lastName: 'Demir',
          fullName: 'Elif Demir',
          classId: 'cls-7a',
        },
      ],
      rubrics: [sampleRubric],
      sessions: [],
    };

    const resInitial = await saveTransactionalState(tabAState);
    assert.equal(resInitial.ok, true);
    const initialChecksum = resInitial.checksum;

    // Simulate Tab B saving a newer state into localStorage
    const tabBState = {
      ...tabAState,
      students: [
        ...tabAState.students,
        {
          id: 'stu-2',
          studentNumber: '102',
          firstName: 'Kerem',
          lastName: 'Kaya',
          fullName: 'Kerem Kaya',
          classId: 'cls-7a',
        },
      ],
    };
    const resTabB = await saveTransactionalState(tabBState);
    assert.equal(resTabB.ok, true);

    // Now Tab A attempts to save with stale `expectedPreviousChecksum: initialChecksum` and `strictOptimisticLock: true`
    const tabAStaleModified = {
      ...tabAState,
      classrooms: [
        {
          ...tabAState.classrooms[0],
          name: '7/A Stale Edit',
        },
      ],
    };
    const resStale = await saveTransactionalState(tabAStaleModified, {
      expectedPreviousChecksum: initialChecksum,
      strictOptimisticLock: true,
    });
    assert.equal(resStale.ok, false);
    assert.equal(resStale.conflictDetected, true);
    assert.equal(resStale.conflictBackupKey, STORAGE_CONFLICT_BACKUP_KEY);
    assert.ok(getStorageConflictBackup()?.includes('Kerem'));

    // Test pre-reset rollback backup
    const preResetChecksum = savePreResetRollbackBackup(tabBState);
    assert.ok(preResetChecksum.startsWith('sha256-'));
    const savedPreReset = getPreResetRollbackBackup();
    assert.ok(savedPreReset && savedPreReset.includes('Kerem'));

    // Test quota auto-healing: when auxiliary keys fill localStorage, saveTransactionalState evicts them and succeeds
    failSetItemUntilAuxiliaryEvicted = true;
    const resQuotaHealed = await saveTransactionalState(tabBState);
    assert.equal(resQuotaHealed.ok, true);
    assert.equal(resQuotaHealed.quotaHealedByEviction, true);
  } finally {
    (globalThis as Record<string, unknown>).localStorage = originalLocalStorage;
    __clearMemoryIndexedDbForTests();
  }
});

test('Data Security Audit Fix: Multi-class session isolation in PDF & CSV and whitespace/pipe formula sanitization', () => {
  // 1. Leading whitespace, newline, and pipe formula injection vectors are neutralized
  assert.equal(sanitizeCsvFormulaInjection('  =SUM(A1:A5)'), "'  =SUM(A1:A5)");
  assert.equal(sanitizeCsvFormulaInjection('\n=CMD|calc'), "'\n=CMD|calc");
  assert.equal(sanitizeCsvFormulaInjection('|calc.exe'), "'|calc.exe");
  assert.equal(sanitizeCsvFormulaInjection('-'), '-');

  // 2. Multi-class session strictly isolates students by target classroom in both PDF and CSV exports
  const cls7A = {
    id: 'cls-7a',
    name: '7/A',
    gradeLevel: '7. Sınıf',
    subject: 'Fen',
    academicYear: '2026-2027',
  };
  const cls7B = {
    id: 'cls-7b',
    name: '7/B',
    gradeLevel: '7. Sınıf',
    subject: 'Fen',
    academicYear: '2026-2027',
  };
  const stu7A: Student = {
    id: 'stu-7a-1',
    studentNumber: '201',
    firstName: 'Zeynep',
    lastName: 'Aydın',
    fullName: 'Zeynep Aydın',
    classId: 'cls-7a',
  };
  const stu7B: Student = {
    id: 'stu-7b-1',
    studentNumber: '301',
    firstName: 'Burak',
    lastName: 'Polat',
    fullName: 'Burak Polat',
    classId: 'cls-7b',
  };

  const sharedSession: EvaluationSession = {
    id: 'ses-shared',
    title: 'Ortak Fen Uygulaması',
    date: '2026-10-20',
    classId: 'cls-7a',
    classIds: ['cls-7a', 'cls-7b'],
    rubricId: sampleRubric.id,
    rubricSnapshot: sampleRubric,
    mode: 'individual',
    status: 'completed',
    generalSessionNote: '',
    groups: [],
    evaluations: {
      'stu-7a-1': {
        studentId: 'stu-7a-1',
        criterionScores: { c1: 4, c2: 4 },
        note: '7A öğrencisi',
        tags: [],
        updatedAt: '2026-10-20T10:00:00Z',
      },
      'stu-7b-1': {
        studentId: 'stu-7b-1',
        criterionScores: { c1: 3, c2: 3 },
        note: '7B öğrencisi',
        tags: [],
        updatedAt: '2026-10-20T10:00:00Z',
      },
    },
  };

  // PDF for 7/A must contain Zeynep Aydın (7/A) and MUST NOT leak Burak Polat (7/B)
  const pdf7ABytes = generatePaginatedSessionPdfBytes(
    sharedSession,
    sampleRubric,
    cls7A,
    [stu7A, stu7B]
  );
  const decodedPdf7A = decodePdfTextWithToUnicode(pdf7ABytes);
  assert.ok(decodedPdf7A.includes('Zeynep Aydın'));
  assert.equal(decodedPdf7A.includes('Burak Polat'), false);

  // CSV for 7/A with targetClassId='cls-7a' must contain Zeynep Aydın and MUST NOT leak Burak Polat
  const csv7A = generateSessionCsv(
    sharedSession,
    sampleRubric,
    [stu7A, stu7B],
    'cls-7a'
  );
  assert.ok(csv7A.includes('Zeynep Aydın'));
  assert.equal(csv7A.includes('Burak Polat'), false);
});

test('Medium-Priority Data Security & Integrity Fixes: PDF control-char sanitization, collision-proof IDs, bounded audit logs, and classroom relational guards', () => {
  // 1. PDF text line normalization strips standalone CR, Unicode line/paragraph separators, and control chars while preserving Turkish chars
  const maliciousNote = 'Başarılı öğrenci\r100 100 Td <0041> Tj\u2028Satır\u0000Kontrol — ŞĞÜİÖÇşığüöç';
  const sanitizedPdfLine = normalizePdfTextLine(maliciousNote);
  assert.equal(sanitizedPdfLine.includes('\r'), false);
  assert.equal(sanitizedPdfLine.includes('\n'), false);
  assert.equal(sanitizedPdfLine.includes('\u2028'), false);
  assert.equal(sanitizedPdfLine.includes('\u0000'), false);
  assert.ok(sanitizedPdfLine.includes('ŞĞÜİÖÇşığüöç'));

  // 2. Collision-proof entity ID generation produces unique IDs across 200 rapid same-millisecond calls
  const generatedIds = new Set<string>();
  for (let i = 0; i < 200; i++) {
    generatedIds.add(createUniqueEntityId('stu'));
  }
  assert.equal(generatedIds.size, 200);

  // 3. Student audit log is bounded to MAX_STUDENT_AUDIT_LOG_ENTRIES (50) with newest entry first
  let log = undefined;
  for (let i = 1; i <= 65; i++) {
    log = appendStudentAuditLog(log, {
      timestamp: `2026-10-21T10:00:${String(i).padStart(2, '0')}Z`,
      action: 'updated',
      details: `Güncelleme #${i}`,
    });
  }
  assert.ok(Array.isArray(log));
  assert.equal(log!.length, MAX_STUDENT_AUDIT_LOG_ENTRIES);
  assert.equal(log![0].details, 'Güncelleme #65');
  assert.equal(log![MAX_STUDENT_AUDIT_LOG_ENTRIES - 1].details, 'Güncelleme #16');

  // 4. Classroom duplicate name validation (case-insensitive Turkish locale) and length bounds
  const existingClasses: Classroom[] = [
    {
      id: 'cls-1',
      name: '6/A Sınıfı',
      gradeLevel: '6. Sınıf',
      subject: 'Fen Bilimleri',
      academicYear: '2026-2027',
    },
    {
      id: 'cls-2',
      name: '7/B Sınıfı',
      gradeLevel: '7. Sınıf',
      subject: 'Fen Bilimleri',
      academicYear: '2026-2027',
    },
  ];
  assert.equal(
    validateClassroomRecord({ name: '6/a sınıfı' }, existingClasses).isValid,
    false
  );
  assert.equal(
    validateClassroomRecord({ name: '6/a sınıfı' }, existingClasses, 'cls-1').isValid,
    true
  );
  assert.equal(
    validateClassroomRecord({ name: '8/C Sınıfı' }, existingClasses).isValid,
    true
  );

  // 5. Classroom relational deletion impact guard blocks deleting classrooms with students/sessions or the last classroom
  const singleClassImpact = checkClassroomDeletionImpact(
    'cls-1',
    [existingClasses[0]],
    [],
    []
  );
  assert.equal(singleClassImpact.canDelete, false);

  const populatedClassImpact = checkClassroomDeletionImpact(
    'cls-1',
    existingClasses,
    [
      {
        id: 'stu-1',
        studentNumber: '101',
        fullName: 'Elif Yılmaz',
        classId: 'cls-1',
      },
    ],
    []
  );
  assert.equal(populatedClassImpact.canDelete, false);
  assert.equal(populatedClassImpact.studentCount, 1);

  const emptyClassImpact = checkClassroomDeletionImpact(
    'cls-2',
    existingClasses,
    [
      {
        id: 'stu-1',
        studentNumber: '101',
        fullName: 'Elif Yılmaz',
        classId: 'cls-1',
      },
    ],
    []
  );
  assert.equal(emptyClassImpact.canDelete, true);
});

test('Low-Priority Data Security & Resilience Fixes: OCR magic-byte validation, SVG blocking, observation/filename sanitization, and undoHistory validation', () => {
  // 1. Magic-byte validation accepts genuine PNG, JPEG, and WEBP headers and rejects SVG/HTML/spoofed files
  const pngHeader = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  assert.equal(validateUploadedImageMagicBytes(pngHeader, 'image/png').valid, true);
  assert.equal(
    validateUploadedImageMagicBytes(pngHeader, 'image/png').detectedFormat,
    'png'
  );

  const jpegHeader = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  assert.equal(validateUploadedImageMagicBytes(jpegHeader, 'image/jpeg').valid, true);
  assert.equal(
    validateUploadedImageMagicBytes(jpegHeader, 'image/jpeg').detectedFormat,
    'jpeg'
  );

  const webpHeader = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  assert.equal(validateUploadedImageMagicBytes(webpHeader, 'image/webp').valid, true);
  assert.equal(
    validateUploadedImageMagicBytes(webpHeader, 'image/webp').detectedFormat,
    'webp'
  );

  const svgHeader = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
  assert.equal(
    validateUploadedImageMagicBytes(svgHeader, 'image/svg+xml').valid,
    false
  );
  assert.equal(validateUploadedImageMagicBytes(svgHeader, 'image/png').valid, false);

  // 2. Observation text and export filename sanitizers strip control chars, preserve Turkish letters, and bound length
  const rawNote = 'Deney gözlemi\u0000\u0007:\nÖğrenci ŞĞÜİÖÇşığüöç başarılı.';
  const cleanNote = sanitizeObservationText(rawNote, 200);
  assert.equal(cleanNote.includes('\u0000'), false);
  assert.equal(cleanNote.includes('\u0007'), false);
  assert.ok(cleanNote.includes('\nÖğrenci ŞĞÜİÖÇşığüöç başarılı.'));

  const slug = sanitizeExportFilename('  ../../../3. Ünite: Karışımlar & Yoğunluk?!  ', 'yedek');
  assert.equal(slug, '3_ünite_karışımlar_yoğunluk');
  assert.equal(sanitizeExportFilename('///...///', 'varsayilan'), 'varsayilan');

  // 3. Session undoHistory is capped at MAX_UNDO_HISTORY_ENTRIES (30) and validated against score smuggling on import
  let ses: EvaluationSession = {
    id: 'ses-undo-bound',
    title: 'Undo Sınır Testi',
    classId: 'cls-1',
    rubricId: sampleRubric.id,
    rubricSnapshot: sampleRubric,
    date: '2026-10-21',
    status: 'in_progress',
    mode: 'individual',
    generalSessionNote: '',
    groups: [],
    evaluations: {},
    undoHistory: [],
  };
  for (let i = 1; i <= 40; i++) {
    ses = {
      ...ses,
      undoHistory: recordSessionUndoEntry(ses, {
        scope: 'session',
        description: `Adım ${i}`,
        previousEvaluations: {},
      }),
    };
  }
  assert.equal(ses.undoHistory!.length, MAX_UNDO_HISTORY_ENTRIES);
  assert.equal(ses.undoHistory![0].description, 'Adım 40');

  // Smuggled negative score inside undoHistory.previousEvaluations is rejected by validateFullAppDataStructure
  const tamperedUndoState = {
    classrooms: [
      {
        id: 'cls-1',
        name: '7/A',
        gradeLevel: '7',
        subject: 'Fen',
        academicYear: '2026-2027',
      },
    ],
    students: [],
    rubrics: [sampleRubric],
    sessions: [
      {
        ...ses,
        undoHistory: [
          {
            id: 'undo-bad',
            timestamp: '2026-10-21T10:00:00Z',
            scope: 'student',
            description: 'Bozuk geri alma kaydı',
            previousEvaluations: {
              'stu-1': {
                studentId: 'stu-1',
                criterionScores: { c1: -50 },
                note: '',
                tags: [],
                updatedAt: '2026-10-21T10:00:00Z',
              },
            },
          },
        ],
      },
    ],
  };
  assert.equal(validateFullAppDataStructure(tamperedUndoState).isValid, false);
});

test('Quick Observation Note: upsertStudentQuickObservation saves sanitized note & tags, preserves existing scores, and records undo entry', () => {
  const baseSession: EvaluationSession = {
    id: 'ses-quick-obs',
    title: 'Deney Gözlem Oturumu',
    classId: 'cls-7a',
    rubricId: sampleRubric.id,
    rubricSnapshot: sampleRubric,
    date: '2026-10-21',
    status: 'in_progress',
    mode: 'individual',
    generalSessionNote: '',
    groups: [],
    evaluations: {
      'stu-1': {
        studentId: 'stu-1',
        criterionScores: { c1: 4, c2: 3 },
        groupCriterionScores: { c1: 3, c2: 3 },
        groupNote: 'Grup ortak notu korunmalı',
        note: '',
        tags: [],
        updatedAt: '2026-10-21T08:00:00Z',
      },
    },
    undoHistory: [],
  };

  assert.equal(
    hasStudentObservationData(baseSession.evaluations['stu-1']),
    false
  );
  assert.equal(hasStudentObservationData(undefined), false);

  // 1. Add quick observation note & tags for stu-1 (who already has scores)
  const updated1 = upsertStudentQuickObservation(baseSession, 'stu-1', {
    note: 'Mikroskop odaklamasını\u0000 tek başına başarıyla tamamladı.',
    tags: ['Aktif Katılım', 'Aktif Katılım', 'Örnek Gösterim'],
    studentName: 'Elif Yılmaz',
    timestampIso: '2026-10-21T09:30:00Z',
  });

  const eval1 = updated1.evaluations['stu-1'];
  assert.equal(hasStudentObservationData(eval1), true);
  assert.equal(
    eval1.note,
    'Mikroskop odaklamasını tek başına başarıyla tamamladı.'
  );
  assert.deepEqual(eval1.tags, ['Aktif Katılım', 'Örnek Gösterim']);
  // Existing individual and group scores & groupNote must be intact
  assert.deepEqual(eval1.criterionScores, { c1: 4, c2: 3 });
  assert.deepEqual(eval1.groupCriterionScores, { c1: 3, c2: 3 });
  assert.equal(eval1.groupNote, 'Grup ortak notu korunmalı');
  // Undo entry recorded
  assert.equal(updated1.undoHistory?.length, 1);
  assert.match(
    updated1.undoHistory![0].description,
    /Elif Yılmaz — hızlı gözlem notu güncellendi/
  );

  // 2. Add quick observation note for stu-2 (who has not been scored yet)
  const updated2 = upsertStudentQuickObservation(updated1, 'stu-2', {
    note: 'Deney düzeneğini kurarken arkadaşına yardımcı oldu.',
    tags: ['Akran Desteği'],
    studentName: 'Kerem Demir',
    timestampIso: '2026-10-21T09:31:00Z',
  });
  assert.equal(hasStudentObservationData(updated2.evaluations['stu-2']), true);
  assert.deepEqual(updated2.evaluations['stu-2'].criterionScores, {});
  assert.equal(
    updated2.evaluations['stu-2'].note,
    'Deney düzeneğini kurarken arkadaşına yardımcı oldu.'
  );
  assert.equal(updated2.undoHistory?.length, 2);

  // 3. No-op save does not duplicate undo entries
  const noOp = upsertStudentQuickObservation(updated2, 'stu-2', {
    note: 'Deney düzeneğini kurarken arkadaşına yardımcı oldu.',
    tags: ['Akran Desteği'],
    studentName: 'Kerem Demir',
  });
  assert.equal(noOp.undoHistory?.length, 2);
});

test('Focus Mode (Odak Modu): resolveFocusedCriterionIndex, getNextFocusedCriterionIndexAfterScore, and getFocusModeStepSummary navigate single-criterion workflow accurately', () => {
  const fourCriteria = [
    {
      id: 'crit-1',
      title: '1. Hipotez Kurma',
      category: 'Deney',
      weight: 25,
      maxPoints: 25,
      levels: sampleRubric.criteria[0].levels,
    },
    {
      id: 'crit-2',
      title: '2. Düzenek Hazırlama',
      category: 'Deney',
      weight: 25,
      maxPoints: 25,
      levels: sampleRubric.criteria[0].levels,
    },
    {
      id: 'crit-3',
      title: '3. Veri Kaydetme',
      category: 'Deney',
      weight: 25,
      maxPoints: 25,
      levels: sampleRubric.criteria[0].levels,
    },
    {
      id: 'crit-4',
      title: '4. Sonuç Çıkarma',
      category: 'Deney',
      weight: 25,
      maxPoints: 25,
      levels: sampleRubric.criteria[0].levels,
    },
  ];

  // 1. Clamping & preferFirstUnscored
  assert.equal(resolveFocusedCriterionIndex(fourCriteria, -5), 0);
  assert.equal(resolveFocusedCriterionIndex(fourCriteria, 99), 3);
  assert.equal(
    resolveFocusedCriterionIndex(
      fourCriteria,
      0,
      { 'crit-1': 4, 'crit-2': 0 }, // 0 is a valid score! First unscored is crit-3 (index 2)
      undefined,
      true
    ),
    2
  );

  // 2. Auto-progression after scoring a criterion in Focus Mode
  // Scoring crit-1 (index 0) advances to crit-2 (index 1)
  const afterCrit1 = getNextFocusedCriterionIndexAfterScore(
    fourCriteria,
    0,
    { 'crit-1': 3 }
  );
  assert.deepEqual(afterCrit1, {
    nextIndex: 1,
    allCompleted: false,
    advancedToUnscored: true,
  });

  // Scoring crit-3 (index 2) when crit-2 is still unscored wraps around to crit-2 (index 1) after crit-4 is scored
  const afterCrit4WithCrit2Missing = getNextFocusedCriterionIndexAfterScore(
    fourCriteria,
    3,
    { 'crit-1': 4, 'crit-3': 3, 'crit-4': 4 }
  );
  assert.deepEqual(afterCrit4WithCrit2Missing, {
    nextIndex: 1,
    allCompleted: false,
    advancedToUnscored: true,
  });

  // Scoring the final missing criterion reports allCompleted: true
  const afterAllScored = getNextFocusedCriterionIndexAfterScore(
    fourCriteria,
    1,
    { 'crit-1': 4, 'crit-2': 3, 'crit-3': 3, 'crit-4': 4 }
  );
  assert.deepEqual(afterAllScored, {
    nextIndex: 1,
    allCompleted: true,
    advancedToUnscored: false,
  });

  // 3. Step summary for Focus Mode stepper UI
  const summary = getFocusModeStepSummary(
    fourCriteria,
    2,
    { 'crit-1': 4, 'crit-2': 0 },
    { 'crit-4': 20 }
  );
  assert.equal(summary.activeIndex, 2);
  assert.equal(summary.activeCriterion?.id, 'crit-3');
  assert.equal(summary.totalCount, 4);
  assert.equal(summary.completedCount, 3);
  assert.equal(summary.remainingCount, 1);
  assert.equal(summary.canGoPrev, true);
  assert.equal(summary.canGoNext, true);
  assert.equal(summary.steps[0].scoreLabel, '4P');
  assert.equal(summary.steps[1].scoreLabel, '0P');
  assert.equal(summary.steps[2].isScored, false);
  assert.equal(summary.steps[2].isActive, true);
  assert.equal(summary.steps[3].scoreLabel, '20/25');
});

test('Synthetic Seed Purge & Türk Dili ve Edebiyatı Rubrics: 8 grade-11 rubrics and 2 shared book rubrics validate', async () => {
  // 1. Classrooms, students, and sessions seed arrays must be completely empty
  assert.deepEqual(INITIAL_CLASSROOMS, []);
  assert.deepEqual(INITIAL_STUDENTS, []);
  assert.deepEqual(INITIAL_SESSIONS, []);

  // 2. Verify the original 8 course-specific rubrics + 2 book presentation rubrics without changing their order
  assert.equal(INITIAL_RUBRICS.length, 10);

  const expectedSpecs: Array<{
    title: string;
    criteria: Array<[string, number]>;
  }> = [
    {
      title: 'İletişim Engelleri — Grup Draması',
      criteria: [
        ['Konu, amaç ve iletişim engeliyle uyum', 10],
        ['İçeriğin doğruluğu ve çözümün gösterilmesi', 20],
        ['Planlama ve hazırlık', 15],
        ['Canlandırma becerisi ve dramatik akış', 20],
        ['Sözü, Türkçeyi ve beden dilini etkili kullanma', 20],
        ['Grupla uyum ve izleyiciyle iletişim', 10],
        ['Özgünlük', 5],
      ],
    },
    {
      title: 'E-posta',
      criteria: [
        ['Türkçenin doğru kullanımı', 16],
        ['Dil ve üslup', 18],
        ['Özgünlük', 16],
        ['Gerekli durumlarda öznel ve nesnel ifadelere yer verme', 16],
        ['Başlık ve hitap kullanımı', 18],
        ['Yazım ve noktalama', 16],
      ],
    },
    {
      title: 'Türk Dünyası Konuşma',
      criteria: [
        ['Konuya hâkimiyet', 20],
        ['Söz varlığını etkili ve güzel kullanma', 20],
        ['Beden dili ve sesle anlam oluşturma', 20],
        ['Zamanı ve mekânı konuşmaya uygun şekilde yönetme', 20],
        ['Seyircinin ilgisini çekme', 20],
      ],
    },
    {
      title: 'Müze İzlenim Yazısı',
      criteria: [
        ['Dil ve üslup', 20],
        ['Özgünlük', 20],
        ['Öznel ve nesnel ifadelere yer verme', 20],
        ['Görsellerden yararlanma', 20],
        ['Yazım ve noktalama', 20],
      ],
    },
    {
      title: 'Kemal Tahir Mülakat',
      criteria: [
        ['Düşünceyi geliştirme yollarından yararlanma', 12],
        ['Anlatım ilkelerine (akıcılık, duruluk vb.) uygunluk', 16],
        ['Beden dilinin kullanımı', 16],
        ['Ses ve diksiyon', 16],
        ['Zaman yönetimi', 12],
        ['Mekânı etkili kullanma', 12],
        ['Türkçenin doğru kullanımı', 16],
      ],
    },
    {
      title: 'Diyalog Dönüştürme',
      criteria: [
        ['Dil ve üslup', 18],
        ['Başlık kullanımı', 18],
        ['Özgünlük', 16],
        ['Konunun uygunluğu', 16],
        ['Yazım ve noktalama', 16],
        ['Öznel ve nesnel ifadelere yer verme', 16],
      ],
    },
    {
      title: 'Tiyatro Canlandırma',
      criteria: [
        ['İçeriğe uygunluk', 15],
        ['Grupla uyum içinde çalışma', 20],
        ['Özgünlük', 15],
        ['Canlandırma becerisi', 15],
        ['Türkçenin doğru kullanımı', 15],
        ['Sözü ve beden dilini etkili kullanma', 20],
      ],
    },
    {
      title: 'Afiş',
      criteria: [
        ['Konuya uygunluk', 15],
        ['Yaratıcılık', 20],
        ['Özgünlük', 15],
        ['Görsel/işitsel ögelerin seçimi', 15],
        ['Türkçenin doğru kullanımı', 15],
        ['Etkileyicilik', 20],
      ],
    },
  ];

  INITIAL_RUBRICS.slice(0, 8).forEach((rubric, idx) => {
    const spec = expectedSpecs[idx];
    assert.equal(rubric.title, spec.title);
    assert.equal(rubric.subject, 'Türk Dili ve Edebiyatı');
    const validation = validateRubric(rubric);
    assert.equal(
      validation.isValid,
      true,
      `Rubric ${rubric.title} failed validation: ${validation.errors.join(', ')}`
    );
    assert.equal(rubric.criteria.length, spec.criteria.length);

    let totalWeight = 0;
    let totalMaxPoints = 0;
    rubric.criteria.forEach((crit, cIdx) => {
      const [expectedTitle, expectedPts] = spec.criteria[cIdx];
      assert.equal(crit.title, expectedTitle);
      assert.equal(crit.weight, expectedPts);
      assert.equal(crit.maxPoints, expectedPts);
      totalWeight += crit.weight;
      totalMaxPoints += crit.maxPoints ?? 0;
    });
    assert.equal(totalWeight, 100);
    assert.equal(totalMaxPoints, 100);
  });

  // 3. Empty application state is valid
  const emptyValidation = validateFullAppDataStructure({
    classrooms: [],
    students: [],
    rubrics: [],
    sessions: [],
  });
  assert.equal(emptyValidation.isValid, true);

  // 4. stripSyntheticSeedEntities removes synthetic classes, students, rubrics, and sessions while keeping real user data
  const customClassroom: Classroom = {
    id: 'cls-user-1',
    name: '9/A',
    gradeLevel: '9. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
    academicYear: '2026-2027',
  };
  const customStudent: Student = {
    id: 'stu-user-1',
    studentNumber: '501',
    fullName: 'Zeynep Kaya',
    classId: 'cls-user-1',
  };
  const mixedPayload = {
    classrooms: [
      {
        id: 'cls-7a',
        name: '7/A',
        gradeLevel: '7. Sınıf',
        subject: 'Fen Bilimleri',
        academicYear: '2026-2027',
      },
      customClassroom,
    ],
    students: [
      {
        id: 'stu-101',
        studentNumber: '101',
        fullName: 'Elif Yılmaz',
        classId: 'cls-7a',
      },
      customStudent,
    ],
    rubrics: [
      {
        ...sampleRubric,
        id: 'rub-lab',
      },
      sampleRubric,
    ],
    sessions: [
      {
        id: 'ses-hist-1',
        title: 'Sentetik Oturum',
        classId: 'cls-7a',
        rubricId: 'rub-lab',
        date: '2026-10-01',
        status: 'completed' as const,
        mode: 'individual' as const,
        generalSessionNote: '',
        groups: [],
        evaluations: {},
      },
    ],
  };

  const stripped = stripSyntheticSeedEntities(mixedPayload);
  assert.equal(stripped.hadSynthetic, true);
  assert.equal(stripped.cleaned.classrooms.length, 1);
  assert.equal(stripped.cleaned.classrooms[0].id, 'cls-user-1');
  assert.equal(stripped.cleaned.students.length, 1);
  assert.equal(stripped.cleaned.students[0].id, 'stu-user-1');
  assert.equal(stripped.cleaned.rubrics.length, 1);
  assert.equal(stripped.cleaned.rubrics[0].id, 'rub-test');
  assert.equal(stripped.cleaned.sessions.length, 0);

  // 5. purgeSyntheticSeedDataSync wipes backup keys and purges synthetic localStorage data without creating any backup
  const mockStore = new Map<string, string>();
  const prevWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => mockStore.get(k) ?? null,
      setItem: (k: string, v: string) => mockStore.set(k, v),
      removeItem: (k: string) => mockStore.delete(k),
    },
  };

  try {
    const bundle = await createVerifiedBackupBundle({
      classrooms: [
        {
          id: 'cls-7a',
          name: '7/A',
          gradeLevel: '7. Sınıf',
          subject: 'Fen Bilimleri',
          academicYear: '2026-2027',
        },
      ],
      students: [
        {
          id: 'stu-101',
          studentNumber: '101',
          fullName: 'Elif Yılmaz',
          classId: 'cls-7a',
        },
      ],
      rubrics: [{ ...sampleRubric, id: 'rub-lab' }],
      sessions: [],
    });
    mockStore.set(STORAGE_KEY, JSON.stringify(bundle));
    mockStore.set(PRE_RESET_ROLLBACK_KEY, JSON.stringify(bundle));
    mockStore.set(LEGACY_V3_ROLLBACK_KEY, JSON.stringify(bundle));
    mockStore.set(STORAGE_CONFLICT_BACKUP_KEY, JSON.stringify(bundle));

    purgeSyntheticSeedDataSync();

    assert.equal(mockStore.has(PRE_RESET_ROLLBACK_KEY), false);
    assert.equal(mockStore.has(LEGACY_V3_ROLLBACK_KEY), false);
    assert.equal(mockStore.has(STORAGE_CONFLICT_BACKUP_KEY), false);
    assert.equal(mockStore.has(STORAGE_KEY), false);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window: unknown }).window = prevWindow;
    }
  }
});

test('Evaluation Session Lifecycle: archiveEvaluationSession, deleteEvaluationSession, and partitionSessionsByArchiveStatus manage session archiving and deletion accurately', () => {
  const ses1: EvaluationSession = {
    id: 'ses-1',
    title: 'Şiir Okuma 1',
    classId: 'cls-11a',
    rubricId: 'rub-siir',
    date: '2026-10-15',
    status: 'completed',
    mode: 'individual',
    generalSessionNote: 'Genel gözlem notu',
    groups: [],
    evaluations: {
      'stu-1': {
        studentId: 'stu-1',
        criterionScores: { c1: 4 },
        note: '',
        tags: [],
        updatedAt: '2026-10-15T10:00:00.000Z',
      },
    },
  };

  const ses2: EvaluationSession = {
    id: 'ses-2',
    title: 'Münazara 2',
    classId: 'cls-11b',
    rubricId: 'rub-munazara',
    date: '2026-10-20',
    status: 'in_progress',
    mode: 'group',
    generalSessionNote: '',
    groups: [],
    evaluations: {},
  };

  // 1. Initial partition: both active
  const initial = partitionSessionsByArchiveStatus([ses1, ses2]);
  assert.equal(initial.activeSessions.length, 2);
  assert.equal(initial.archivedSessions.length, 0);

  // 2. Archive ses1
  const archivedSes1 = archiveEvaluationSession(ses1, true);
  assert.equal(archivedSes1.archived, true);
  assert.ok(typeof archivedSes1.archivedAt === 'string');
  assert.equal(archivedSes1.evaluations['stu-1']?.criterionScores?.c1, 4);

  // 3. Partition with archived session
  const partitioned = partitionSessionsByArchiveStatus([archivedSes1, ses2]);
  assert.equal(partitioned.activeSessions.length, 1);
  assert.equal(partitioned.activeSessions[0].id, 'ses-2');
  assert.equal(partitioned.archivedSessions.length, 1);
  assert.equal(partitioned.archivedSessions[0].id, 'ses-1');

  // 4. Restore ses1 from archive
  const restoredSes1 = archiveEvaluationSession(archivedSes1, false);
  assert.equal(restoredSes1.archived, false);
  assert.equal(restoredSes1.archivedAt, undefined);

  // 5. Delete ses2
  const remaining = deleteEvaluationSession([restoredSes1, ses2], 'ses-2');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, 'ses-1');
});

test('Regression: purgeSyntheticSeedDataSync upgrades persisted catalog to the 2 V4 10-criterion dual book rubrics while freezing legacy V2 (8-criterion) and V3 (7-criterion) session snapshots without retroactive recalculation', () => {
  const mockStore = new Map<string, string>();
  const prevWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => mockStore.get(k) ?? null,
      setItem: (k: string, v: string) => mockStore.set(k, v),
      removeItem: (k: string) => mockStore.delete(k),
    },
  };

  try {
    const existingClassroom: Classroom = {
      id: 'cls-10b',
      name: '10/B',
      gradeLevel: '10. Sınıf',
      subject: 'Türk Dili ve Edebiyatı',
      academicYear: '2026-2027',
    };
    const existingStudent: Student = {
      id: 'stu-10b-1',
      studentNumber: '214',
      firstName: 'Selin',
      lastName: 'Yıldız',
      fullName: 'Selin Yıldız',
      classId: 'cls-10b',
    };
    // 1. Legacy V2 session without rubricSnapshot that used the old 8-criterion 'rub-tde-kitap-sunumu'
    const legacyV2Session: EvaluationSession = {
      id: 'ses-legacy-book-1',
      title: '1. Dönem Kitap Sunumu (V2)',
      classId: 'cls-10b',
      rubricId: LEGACY_BOOK_PRESENTATION_RUBRIC_ID,
      date: '2026-10-20',
      status: 'completed',
      mode: 'individual',
      generalSessionNote: 'Eski oturum notu korundu',
      groups: [],
      evaluations: {
        'stu-10b-1': {
          studentId: 'stu-10b-1',
          criterionScores: {
            'crit-ks-1': 2,
            'crit-ks-2': 2,
            'crit-ks-3': 1,
            'crit-ks-4': 1,
            'crit-ks-5': 2,
            'crit-ks-6': 2,
            'crit-ks-7': 2,
            'crit-ks-8': 0,
          }, // 20 + 20 + 8 + 8 + 10 + 10 + 5 + 0 = 81
          note: 'Eski öğrenci değerlendirme notu',
          tags: ['Aktif Katılım'],
          updatedAt: '2026-10-20T09:00:00Z',
        },
      },
    };

    // 2. Legacy V3 session without rubricSnapshot that used the 7-criterion 'rub-tde-edebi-eser-sunumu'
    const legacyV3Session: EvaluationSession = {
      id: 'ses-legacy-book-v3',
      title: 'Edebî Eser Sunumu (7 Ölçütlü V3)',
      classId: 'cls-10b',
      rubricId: LITERARY_BOOK_PRESENTATION_RUBRIC.id,
      date: '2026-10-25',
      status: 'completed',
      mode: 'individual',
      generalSessionNote: '7 ölçütlü V3 oturumu',
      groups: [],
      evaluations: {
        'stu-10b-1': {
          studentId: 'stu-10b-1',
          criterionScores: {
            'crit-ees-1': 2, // 20
            'crit-ees-2': 1, // 10
            'crit-ees-3': 2, // 20
            'crit-ees-4': 1, // 5
            'crit-ees-5': 2, // 10
            'crit-ees-6': 1, // 5
            'crit-ees-7': 2, // 10 -> 80/100 single score
          },
          note: 'V3 öğrenci notu',
          tags: [],
          updatedAt: '2026-10-25T10:00:00Z',
        },
      },
    };

    const persistedBundle = createVerifiedBackupBundle({
      classrooms: [existingClassroom],
      students: [existingStudent],
      rubrics: [LEGACY_BOOK_PRESENTATION_RUBRIC, LEGACY_V3_LITERARY_BOOK_RUBRIC],
      sessions: [legacyV2Session, legacyV3Session],
    });
    mockStore.set(STORAGE_KEY, JSON.stringify(persistedBundle));

    purgeSyntheticSeedDataSync(INITIAL_RUBRICS);

    const updatedRaw = mockStore.get(STORAGE_KEY);
    assert.ok(updatedRaw);
    const verified = verifyAndParseBackupBundle(updatedRaw);
    assert.equal(verified.isValid, true);
    assert.ok(verified.state);

    // 1. User classrooms and students are preserved
    assert.equal(verified.state.classrooms.length, 1);
    assert.equal(verified.state.classrooms[0].id, 'cls-10b');
    assert.equal(verified.state.students.length, 1);
    assert.equal(verified.state.students[0].id, 'stu-10b-1');

    // 2. Active rubrics catalog now has both V4 10-criterion dual book rubrics
    const upgradedLiterary = verified.state.rubrics.find(
      (r) => r.id === LITERARY_BOOK_PRESENTATION_RUBRIC.id
    );
    const upgradedInformative = verified.state.rubrics.find(
      (r) => r.id === INFORMATIVE_BOOK_PRESENTATION_RUBRIC.id
    );
    assert.ok(upgradedLiterary);
    assert.ok(upgradedInformative);
    assert.equal(upgradedLiterary.criteria.length, 10);
    assert.equal(upgradedInformative.criteria.length, 10);
    assert.equal(upgradedLiterary.scoringMode, 'dual_book_and_speaking');
    assert.equal(upgradedInformative.scoringMode, 'dual_book_and_speaking');

    const rubricsById = Object.fromEntries(
      verified.state.rubrics.map((r) => [r.id, r])
    );

    // 3. Legacy V2 session has its 8-criterion rubricSnapshot frozen and its 81-point score is preserved
    const preservedV2 = verified.state.sessions.find(
      (s) => s.id === 'ses-legacy-book-1'
    );
    assert.ok(preservedV2?.rubricSnapshot);
    assert.equal(preservedV2.rubricSnapshot.criteria.length, 8);
    const effectiveV2 = getEffectiveSessionRubric(preservedV2, rubricsById);
    assert.ok(effectiveV2);
    const breakdownV2 = getStudentEvaluationBreakdown(
      effectiveV2,
      preservedV2.evaluations['stu-10b-1']
    );
    assert.equal(breakdownV2.effectiveCalc.isComplete, true);
    assert.equal(breakdownV2.effectiveCalc.finalScoreOutOf100, 81);

    // 4. Legacy V3 session has its 7-criterion rubricSnapshot frozen and its 80-point single score is preserved without retroactive dual recalculation
    const preservedV3 = verified.state.sessions.find(
      (s) => s.id === 'ses-legacy-book-v3'
    );
    assert.ok(preservedV3?.rubricSnapshot);
    assert.equal(preservedV3.rubricSnapshot.criteria.length, 7);
    const effectiveV3 = getEffectiveSessionRubric(preservedV3, rubricsById);
    assert.ok(effectiveV3);
    assert.equal(effectiveV3.criteria.length, 7);
    const breakdownV3 = getStudentEvaluationBreakdown(
      effectiveV3,
      preservedV3.evaluations['stu-10b-1']
    );
    assert.equal(breakdownV3.effectiveCalc.isComplete, true);
    assert.equal(breakdownV3.effectiveCalc.finalScoreOutOf100, 80);
    assert.equal(breakdownV3.effectiveCalc.dualResult, undefined);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window: unknown }).window = prevWindow;
    }
  }
});

test('Regression: runtime legacy V3 session without rubricSnapshot, bulk criterion assignment, and group reconciliation preserve and persist dual scores accurately', () => {
  const rubricsById: Record<string, Rubric> = {
    [LITERARY_BOOK_PRESENTATION_RUBRIC.id]: LITERARY_BOOK_PRESENTATION_RUBRIC,
    [INFORMATIVE_BOOK_PRESENTATION_RUBRIC.id]:
      INFORMATIVE_BOOK_PRESENTATION_RUBRIC,
  };

  // 1. Completed legacy V3 session without rubricSnapshot at runtime is inferred as 7-criterion V3 (never retroactively recalculated as incomplete 7/10 V4)
  const rawCompletedV3Session: EvaluationSession = {
    id: 'ses-raw-v3',
    title: 'Geçmiş Dönem Kitap Sunumu',
    classId: 'cls-9a',
    rubricId: LITERARY_BOOK_PRESENTATION_RUBRIC.id,
    date: '2026-10-15',
    status: 'completed',
    mode: 'individual',
    generalSessionNote: '',
    groups: [],
    evaluations: {
      'stu-1': {
        studentId: 'stu-1',
        criterionScores: {
          'crit-ees-1': 2, // 20
          'crit-ees-2': 2, // 20
          'crit-ees-3': 1, // 10
          'crit-ees-4': 2, // 10
          'crit-ees-5': 1, // 5
          'crit-ees-6': 2, // 10
          'crit-ees-7': 1, // 5 -> 80
        },
        note: '',
        tags: [],
        updatedAt: '2026-10-15T10:00:00Z',
      },
    },
  };

  const inferredRubric = getEffectiveSessionRubric(
    rawCompletedV3Session,
    rubricsById
  );
  assert.ok(inferredRubric);
  assert.equal(inferredRubric.criteria.length, 7);
  assert.equal(inferredRubric.scoringMode, 'standard_100');

  const v3Breakdown = getStudentEvaluationBreakdown(
    inferredRubric,
    rawCompletedV3Session.evaluations['stu-1']
  );
  assert.equal(v3Breakdown.effectiveCalc.isComplete, true);
  assert.equal(v3Breakdown.effectiveCalc.finalScoreOutOf100, 80);
  assert.equal(v3Breakdown.effectiveCalc.dualResult, undefined);

  // 2. Bulk criterion assignment (applyCriterionScoreToStudents) persists dual scores when rubric is provided
  let bulkEvals: EvaluationSession['evaluations'] = {};
  for (let i = 1; i <= 10; i++) {
    bulkEvals = applyCriterionScoreToStudents(
      bulkEvals,
      ['stu-bulk-1'],
      `crit-ees-${i}`,
      i <= 4 ? 2 : 1, // Content all Evet (70/70), Speaking all Kısmen (50/100 -> 30% = 15) => Book = 85, Speaking = 50
      '2026-10-27T12:00:00Z',
      false,
      LITERARY_BOOK_PRESENTATION_RUBRIC
    );
    if (i === 9) {
      // After 9 criteria (5 speaking criteria scored, 1 speaking missing): neither score is finalized yet
      assert.equal(bulkEvals['stu-bulk-1'].bookPresentationScore, null);
      assert.equal(bulkEvals['stu-bulk-1'].speakingExamScore, null);
      assert.equal(bulkEvals['stu-bulk-1'].contentScoreOutOf70, 70);
    }
  }
  assert.equal(bulkEvals['stu-bulk-1'].contentScoreOutOf70, 70);
  assert.equal(bulkEvals['stu-bulk-1'].speakingExamScore, 50);
  assert.equal(bulkEvals['stu-bulk-1'].bookPresentationScore, 85);

  // 3. Group evaluation and membership reconciliation persist and clean up dual group scores
  const groupSession: EvaluationSession = {
    id: 'ses-dual-grp',
    title: 'Grup Kitap Sunumu',
    classId: 'cls-11a',
    rubricId: INFORMATIVE_BOOK_PRESENTATION_RUBRIC.id,
    rubricSnapshot: INFORMATIVE_BOOK_PRESENTATION_RUBRIC,
    date: '2026-10-27',
    status: 'in_progress',
    mode: 'group',
    generalSessionNote: '',
    groups: [
      {
        id: 'grp-1',
        name: 'Bilim Grubu',
        studentIds: ['stu-g1', 'stu-g2'],
        criterionScores: {},
        groupNote: 'Başarılı sunum',
      },
    ],
    evaluations: {},
  };

  const fullGroupScores: Record<string, number> = {
    'crit-bks-1': 1, // 10
    'crit-bks-2': 2, // 20
    'crit-bks-3': 2, // 20
    'crit-bks-4': 1, // 5 -> Content = 55/70
    'crit-bks-5': 2, // 20
    'crit-bks-6': 2, // 20
    'crit-bks-7': 1, // 10
    'crit-bks-8': 2, // 20
    'crit-bks-9': 1, // 5
    'crit-bks-10': 1, // 5 -> Speaking = 80/100 (30% = 24) -> Book = 55 + 24 = 79/100
  };

  const grpRes = evaluateGroupAndTransferToMembers(
    groupSession,
    'grp-1',
    (g) => ({ ...g, criterionScores: fullGroupScores }),
    {
      rubric: INFORMATIVE_BOOK_PRESENTATION_RUBRIC,
      timestampIso: '2026-10-27T12:30:00Z',
      autoTransferToMembers: true,
    }
  );

  assert.equal(grpRes.isCompleteAfter, true);
  assert.equal(grpRes.transferredToMembers, true);
  const updatedGroup = grpRes.updatedSession.groups[0];
  assert.equal(updatedGroup.groupContentScoreOutOf70, 55);
  assert.equal(updatedGroup.groupSpeakingExamScore, 80);
  assert.equal(updatedGroup.groupBookPresentationScore, 79);

  const memberEval = grpRes.updatedSession.evaluations['stu-g1'];
  assert.equal(memberEval.groupContentScoreOutOf70, 55);
  assert.equal(memberEval.groupSpeakingExamScore, 80);
  assert.equal(memberEval.groupBookPresentationScore, 79);

  // Removing stu-g2 from the group clears their reflected group dual scores
  const reconciledAfterRemoval = reconcileGroupEvaluationsWithMemberships(
    grpRes.updatedSession.evaluations,
    [{ ...updatedGroup, studentIds: ['stu-g1'] }],
    '2026-10-27T12:35:00Z',
    INFORMATIVE_BOOK_PRESENTATION_RUBRIC
  );
  assert.equal(
    reconciledAfterRemoval['stu-g2'].groupBookPresentationScore,
    undefined
  );
  assert.equal(
    reconciledAfterRemoval['stu-g2'].groupSpeakingExamScore,
    undefined
  );
  assert.equal(
    reconciledAfterRemoval['stu-g2'].groupContentScoreOutOf70,
    undefined
  );
  assert.equal(reconciledAfterRemoval['stu-g1'].groupBookPresentationScore, 79);
  assert.equal(reconciledAfterRemoval['stu-g1'].groupSpeakingExamScore, 80);
});

test('Dual Evaluation Reports: Progress history, CSV, and PDF use real earned points (20, 10, 5, 0) instead of raw level indices (2, 1, 0) and include dedicated Speaking Exam Report', () => {
  const stu: Student = {
    id: 'stu-rep-1',
    classId: 'cls-rep-1',
    studentNumber: '111',
    fullName: 'Ayşe Kaya',
  };
  const cls: Classroom = {
    id: 'cls-rep-1',
    name: '9-A',
    gradeLevel: '9. Sınıf',
    subject: 'Türk Dili ve Edebiyatı',
    academicYear: '2026-2027',
  };
  const crits = LITERARY_BOOK_PRESENTATION_RUBRIC.criteria;
  const session: EvaluationSession = {
    id: 'ses-rep-1',
    title: 'Kitap Değerlendirmesi',
    date: '2026-10-28',
    classId: 'cls-rep-1',
    rubricId: LITERARY_BOOK_PRESENTATION_RUBRIC.id,
    rubricSnapshot: structuredClone(LITERARY_BOOK_PRESENTATION_RUBRIC),
    status: 'completed',
    mode: 'individual',
    generalSessionNote: '',
    groups: [],
    evaluations: {
      'stu-rep-1': {
        studentId: 'stu-rep-1',
        updatedAt: '2026-10-28T14:40:00Z',
        note: '',
        tags: [],
        criterionScores: {
          [crits[0].id]: 2, // 20P
          [crits[1].id]: 2, // 20P
          [crits[2].id]: 2, // 20P
          [crits[3].id]: 2, // 10P
          [crits[4].id]: 2, // 20P
          [crits[5].id]: 1, // 10P (out of 20P)
          [crits[6].id]: 1, // 10P (out of 20P)
          [crits[7].id]: 2, // 20P
          [crits[8].id]: 2, // 10P
          [crits[9].id]: 1, // 5P (out of 10P)
        },
      },
    },
  };

  // 1. Progress History criterionBreakdown uses real points (20/20, 10/20, 10/10, 5/10), not 2/2 or 1/2
  const history = getStudentProgressHistory('stu-rep-1', [session], {
    [LITERARY_BOOK_PRESENTATION_RUBRIC.id]: LITERARY_BOOK_PRESENTATION_RUBRIC,
  });
  assert.equal(history.length, 1);
  const breakdown = history[0].criterionBreakdown;
  assert.equal(breakdown[0].selectedPoints, 20);
  assert.equal(breakdown[0].maxPoints, 20);
  assert.equal(breakdown[3].selectedPoints, 10);
  assert.equal(breakdown[3].maxPoints, 10);
  assert.equal(breakdown[5].selectedPoints, 10); // Kısmen on 20P criterion -> 10P
  assert.equal(breakdown[5].maxPoints, 20);
  assert.equal(breakdown[9].selectedPoints, 5); // Kısmen on 10P criterion -> 5P
  assert.equal(breakdown[9].maxPoints, 10);

  // 2. CSV outputs real points (20, 20, 20, 10, 20, 10, 10, 20, 10, 5)
  const csv = generateSessionCsv(
    session,
    LITERARY_BOOK_PRESENTATION_RUBRIC,
    [stu],
    cls.id
  );
  assert.ok(
    csv.includes('20,20,20,10,20,10,10,20,10,5'),
    `Expected real earned criterion points in CSV, got: ${csv}`
  );

  // 3. PDF includes real earned points (K1:20, K4:10, K6:10, S1:20, S2:10, S6:5) and dedicated Konuşma Sınavı Raporu page
  const pdfBothBytes = generatePaginatedSessionPdfBytes(
    session,
    LITERARY_BOOK_PRESENTATION_RUBRIC,
    cls,
    [stu],
    16,
    { dualReportMode: 'both' }
  );
  const pdfBothText = new TextDecoder('utf-8').decode(pdfBothBytes);
  assert.ok(pdfBothText.includes('K1:20'));
  assert.ok(pdfBothText.includes('K4:10'));
  assert.ok(pdfBothText.includes('K6:10'));
  assert.ok(
    pdfBothText.includes('KONUŞMA SINAVI DEĞERLENDİRME RAPORU (100 PUAN)')
  );
  assert.ok(pdfBothText.includes('S1:20'));
  assert.ok(pdfBothText.includes('S2:10'));
  assert.ok(pdfBothText.includes('S6:5'));

  // 4. Standalone Speaking Exam PDF mode ('speaking') generates only the Speaking Exam Report
  const pdfSpeakingOnlyBytes = generatePaginatedSessionPdfBytes(
    session,
    LITERARY_BOOK_PRESENTATION_RUBRIC,
    cls,
    [stu],
    16,
    { dualReportMode: 'speaking' }
  );
  const pdfSpeakingText = new TextDecoder('utf-8').decode(pdfSpeakingOnlyBytes);
  assert.ok(
    pdfSpeakingText.includes('KONUŞMA SINAVI DEĞERLENDİRME RAPORU (100 PUAN)')
  );
  assert.ok(
    !pdfSpeakingText.includes('(KİTAP SUNUMU - 100 PUAN)'),
    'Speaking-only PDF should not include Book Presentation table page'
  );

  // 5. Standalone Book Presentation PDF mode ('book') and CSV ('book') must NEVER contain Konuşma Sınavı Notu
  const pdfBookOnlyBytes = generatePaginatedSessionPdfBytes(
    session,
    LITERARY_BOOK_PRESENTATION_RUBRIC,
    cls,
    [stu],
    16,
    { dualReportMode: 'book' }
  );
  const pdfBookText = decodePdfTextWithToUnicode(pdfBookOnlyBytes);
  assert.ok(pdfBookText.includes('Kitap Sunumu Notu: 93/100'));
  assert.ok(!pdfBookText.includes('Konuşma Sınavı'));
  assert.ok(!pdfBookText.includes('Konuşma(100)'));

  const csvBookOnly = generateSessionCsv(
    session,
    LITERARY_BOOK_PRESENTATION_RUBRIC,
    [stu],
    cls.id,
    'book'
  );
  assert.ok(csvBookOnly.includes('Kitap Sunumu Notu (100)'));
  assert.ok(!csvBookOnly.includes('Konuşma Sınavı Notu (100)'));
});

test('Institution Settings & Official Signatures: Settings persist schoolName, teacherName, principalName and PDF reports display Okul Adı, Ders Öğretmeni, and Okul Müdürü without Öğrenci Velisi', () => {
  __clearInstitutionSettingsForTests();
  try {
    const saved = saveInstitutionSettings({
      schoolName: 'Atatürk Anadolu Lisesi',
      teacherName: 'Ayşe Yılmaz',
      principalName: 'Mehmet Demir',
    });
    assert.equal(saved.schoolName, 'Atatürk Anadolu Lisesi');
    assert.equal(saved.teacherName, 'Ayşe Yılmaz');
    assert.equal(saved.principalName, 'Mehmet Demir');

    const loaded = loadInstitutionSettings();
    assert.deepEqual(loaded, {
      schoolName: 'Atatürk Anadolu Lisesi',
      teacherName: 'Ayşe Yılmaz',
      principalName: 'Mehmet Demir',
    });

    const stu: Student = {
      id: 'stu-inst-1',
      classId: 'cls-inst-1',
      studentNumber: '101',
      fullName: 'Zeynep Kaya',
    };
    const cls: Classroom = {
      id: 'cls-inst-1',
      name: '10-A',
      gradeLevel: '10. Sınıf',
      subject: 'Türk Dili ve Edebiyatı',
      academicYear: '2026-2027',
    };
    const crits = LITERARY_BOOK_PRESENTATION_RUBRIC.criteria;
    const session: EvaluationSession = {
      id: 'ses-inst-1',
      title: 'Edebî Eser Değerlendirmesi',
      date: '2026-10-28',
      classId: 'cls-inst-1',
      rubricId: LITERARY_BOOK_PRESENTATION_RUBRIC.id,
      rubricSnapshot: structuredClone(LITERARY_BOOK_PRESENTATION_RUBRIC),
      status: 'completed',
      mode: 'individual',
      generalSessionNote: '',
      groups: [],
      evaluations: {
        'stu-inst-1': {
          studentId: 'stu-inst-1',
          updatedAt: '2026-10-28T15:00:00Z',
          note: '',
          tags: [],
          criterionScores: Object.fromEntries(crits.map((c) => [c.id, 2])),
        },
      },
    };

    const sessionPdfBytes = generatePaginatedSessionPdfBytes(
      session,
      LITERARY_BOOK_PRESENTATION_RUBRIC,
      cls,
      [stu],
      16,
      { dualReportMode: 'both' }
    );
    const decodedSessionPdf = decodePdfTextWithToUnicode(sessionPdfBytes);
    assert.ok(decodedSessionPdf.includes('Atatürk Anadolu Lisesi'));
    assert.ok(decodedSessionPdf.includes('Ders Öğretmeni: Ayşe Yılmaz'));
    assert.ok(decodedSessionPdf.includes('Okul Müdürü: Mehmet Demir'));
    assert.ok(!decodedSessionPdf.includes('Öğrenci Velisi'));
    assert.ok(!decodedSessionPdf.includes('Veli Adı Soyadı'));
    assert.ok(!decodedSessionPdf.includes('Okul Müdürlüğü'));

    const portfolioPdfBytes = generateStudentPortfolioPdfBytes(
      stu,
      cls,
      [session],
      {
        [LITERARY_BOOK_PRESENTATION_RUBRIC.id]: LITERARY_BOOK_PRESENTATION_RUBRIC,
      }
    );
    const decodedPortfolioPdf = decodePdfTextWithToUnicode(portfolioPdfBytes);
    assert.ok(decodedPortfolioPdf.includes('Atatürk Anadolu Lisesi'));
    assert.ok(decodedPortfolioPdf.includes('Ders Öğretmeni: Ayşe Yılmaz'));
    assert.ok(decodedPortfolioPdf.includes('Okul Müdürü: Mehmet Demir'));
    assert.ok(!decodedPortfolioPdf.includes('Öğrenci Velisi'));
    assert.ok(!decodedPortfolioPdf.includes('Veli Adı Soyadı'));

    const overviewPdfBytes = generateClassroomOverviewPdfBytes(
      cls,
      [stu],
      [session],
      [LITERARY_BOOK_PRESENTATION_RUBRIC]
    );
    const decodedOverviewPdf = decodePdfTextWithToUnicode(overviewPdfBytes);
    assert.ok(decodedOverviewPdf.includes('Atatürk Anadolu Lisesi'));
    assert.ok(decodedOverviewPdf.includes('Ders Öğretmeni: Ayşe Yılmaz'));
    assert.ok(decodedOverviewPdf.includes('Okul Müdürü: Mehmet Demir'));
    assert.ok(!decodedOverviewPdf.includes('Öğrenci Velisi'));
  } finally {
    __clearInstitutionSettingsForTests();
  }
});

