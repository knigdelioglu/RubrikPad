import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_CLASSROOMS,
  INITIAL_RUBRICS,
  INITIAL_SESSIONS,
  INITIAL_STUDENTS,
} from '../data/seedData.ts';
import type {
  Classroom,
  EvaluationSession,
  Rubric,
  Student,
} from '../types.ts';
import {
  computePayloadChecksum,
  type AppDataState,
} from './storageLayer.ts';
import {
  buildSuggestedBackupFileName,
  parseAndVerifyRestoredBackupText,
  prepareVerifiedBackupPayload,
  restoreBackupViaAndroidSaf,
  saveVerifiedBackupFile,
  type SafBackupPluginContract,
} from './backupFileService.ts';

function buildRichSampleState(): AppDataState {
  const classrooms: Classroom[] = [
    ...INITIAL_CLASSROOMS,
    {
      id: 'cls-11a',
      name: '11/A',
      gradeLevel: '11. Sınıf',
      subject: 'Türk Dili ve Edebiyatı',
      academicYear: '2025-2026',
    },
  ];

  const students: Student[] = [
    ...INITIAL_STUDENTS,
    {
      id: 'stu-11a-1',
      studentNumber: '412',
      firstName: 'Zeynep',
      lastName: 'Kaya',
      fullName: 'Zeynep Kaya',
      classId: 'cls-11a',
      archived: false,
      updatedAt: '2026-10-25T10:15:00.000Z',
      auditLog: [
        {
          timestamp: '2026-10-25T10:15:00.000Z',
          action: 'created',
          details: 'Öğrenci 11/A sınıfına eklendi',
        },
      ],
    },
  ];

  const rubrics: Rubric[] = [...INITIAL_RUBRICS];
  const targetRubric = rubrics[0];

  const sessions: EvaluationSession[] = [
    ...INITIAL_SESSIONS,
    {
      id: 'ses-11a-1',
      title: '1. Dönem Sözlü Sunum Değerlendirmesi',
      classId: 'cls-11a',
      classIds: ['cls-11a'],
      rubricId: targetRubric.id,
      date: '2026-10-25',
      status: 'completed',
      mode: 'individual',
      generalSessionNote: 'Sınıf genelinde hazırlık düzeyi yüksek.',
      groups: [],
      evaluations: {
        'stu-11a-1': {
          studentId: 'stu-11a-1',
          criterionScores: Object.fromEntries(
            targetRubric.criteria.map((c) => [c.id, 4])
          ),
          directCriterionScores: Object.fromEntries(
            targetRubric.criteria.map((c) => [c.id, c.maxPoints ?? c.weight])
          ),
          note: 'Akıcı ve diksiyon kurallarına uygun sunum yaptı.',
          tags: ['Akıcı İfade', 'Hazırlıklı'],
          updatedAt: '2026-10-25T10:30:00.000Z',
        },
      },
      undoHistory: [],
    },
  ];

  return { classrooms, students, rubrics, sessions };
}

test('buildSuggestedBackupFileName formats deterministic YYYY-MM-DD JSON filename', () => {
  const d = new Date('2026-10-26T14:20:00.000Z');
  assert.equal(
    buildSuggestedBackupFileName(d),
    'rubrikpad_yedek_2026-10-26.json'
  );
});

test('Android SAF saveJsonDocument succeeds only when file is written and byte length matches', async () => {
  const state = buildRichSampleState();
  const prepared = prepareVerifiedBackupPayload(state);
  assert.equal(prepared.isValid, true);

  let capturedFileName = '';
  let capturedContent = '';

  const mockSafBridge: SafBackupPluginContract = {
    async saveJsonDocument({ fileName, content }) {
      capturedFileName = fileName;
      capturedContent = content;
      const writtenBytes = new TextEncoder().encode(content).byteLength;
      return {
        saved: true,
        cancelled: false,
        uri: 'content://com.android.externalstorage.documents/document/primary%3ADownload%2Frubrikpad_yedek_secilen.json',
        fileName: 'rubrikpad_yedek_secilen.json',
        bytesWritten: writtenBytes,
      };
    },
    async openJsonDocument() {
      return { opened: false, cancelled: true };
    },
  };

  const result = await saveVerifiedBackupFile(state, {
    now: new Date('2026-10-26T12:00:00.000Z'),
    isNativeAndroid: true,
    safBridge: mockSafBridge,
  });

  assert.equal(result.status, 'saved');
  assert.equal(result.method, 'android-saf');
  assert.equal(capturedFileName, 'rubrikpad_yedek_2026-10-26.json');
  assert.equal(result.fileName, 'rubrikpad_yedek_secilen.json');
  assert.equal(result.bytesWritten, prepared.utf8ByteLength);
  assert.ok(result.uri?.startsWith('content://'));
  assert.ok(result.checksum.startsWith('sha256-'));
  assert.ok(capturedContent.includes('"stu-11a-1"'));
  assert.ok(result.message.includes('rubrikpad_yedek_secilen.json'));
});

test('Android SAF user cancellation returns status=cancelled and never reports success', async () => {
  const state = buildRichSampleState();
  let webFallbackCalled = false;

  const mockSafBridge: SafBackupPluginContract = {
    async saveJsonDocument() {
      return {
        saved: false,
        cancelled: true,
      };
    },
    async openJsonDocument() {
      return { opened: false, cancelled: true };
    },
  };

  const result = await saveVerifiedBackupFile(state, {
    isNativeAndroid: true,
    safBridge: mockSafBridge,
    webBlobFallback: () => {
      webFallbackCalled = true;
    },
  });

  assert.equal(result.status, 'cancelled');
  assert.equal(result.method, 'android-saf');
  assert.equal(webFallbackCalled, false);
  assert.ok(result.message.includes('iptal edildi'));
});

test('Android SAF partial/zero write or IOException returns status=error and never falls back to Blob download', async () => {
  const state = buildRichSampleState();
  let webFallbackCalled = false;

  // Case A: Partial byte write (truncation) must be rejected
  const partialSafBridge: SafBackupPluginContract = {
    async saveJsonDocument() {
      return {
        saved: true,
        cancelled: false,
        uri: 'content://downloads/partial.json',
        fileName: 'partial.json',
        bytesWritten: 12, // truncated!
      };
    },
    async openJsonDocument() {
      return { opened: false };
    },
  };

  const partialResult = await saveVerifiedBackupFile(state, {
    isNativeAndroid: true,
    safBridge: partialSafBridge,
    webBlobFallback: () => {
      webFallbackCalled = true;
    },
  });

  assert.equal(partialResult.status, 'error');
  assert.equal(partialResult.method, 'android-saf');
  assert.equal(webFallbackCalled, false);

  // Case B: Native write exception must return error without Blob fallback
  const failingSafBridge: SafBackupPluginContract = {
    async saveJsonDocument() {
      return {
        saved: false,
        cancelled: false,
        error: 'Dosya seçilen konuma yazılamadı: Disk dolu.',
      };
    },
    async openJsonDocument() {
      return { opened: false };
    },
  };

  const failedResult = await saveVerifiedBackupFile(state, {
    isNativeAndroid: true,
    safBridge: failingSafBridge,
    webBlobFallback: () => {
      webFallbackCalled = true;
    },
  });

  assert.equal(failedResult.status, 'error');
  assert.equal(failedResult.method, 'android-saf');
  assert.equal(webFallbackCalled, false);
  assert.ok(failedResult.error?.includes('Disk dolu'));
});

test('Desktop File System Access API (showSaveFilePicker) writes stream, verifies size, and handles AbortError', async () => {
  const state = buildRichSampleState();
  let writtenChunks: Uint8Array[] = [];
  let streamClosed = false;

  const saveRes = await saveVerifiedBackupFile(state, {
    isNativeAndroid: false,
    isAndroidWebView: false,
    showSaveFilePicker: async (opts) => ({
      name: opts?.suggestedName || 'yedek.json',
      async createWritable() {
        return {
          async write(data) {
            if (typeof data === 'string') {
              writtenChunks.push(new TextEncoder().encode(data));
            } else {
              writtenChunks.push(data);
            }
          },
          async close() {
            streamClosed = true;
          },
        };
      },
      async getFile() {
        const total = writtenChunks.reduce((acc, c) => acc + c.byteLength, 0);
        return { size: total };
      },
    }),
  });

  assert.equal(saveRes.status, 'saved');
  assert.equal(saveRes.method, 'file-system-access');
  assert.equal(streamClosed, true);
  assert.ok((saveRes.bytesWritten ?? 0) > 100);

  // Now test user cancelling the desktop file picker (AbortError)
  const cancelRes = await saveVerifiedBackupFile(state, {
    isNativeAndroid: false,
    isAndroidWebView: false,
    showSaveFilePicker: async () => {
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';
      throw abortErr;
    },
  });

  assert.equal(cancelRes.status, 'cancelled');
  assert.equal(cancelRes.method, 'file-system-access');
});

test('Full round-trip SAF backup export and restore preserves all classrooms, students, rubrics, and evaluation scores', async () => {
  const originalState = buildRichSampleState();
  let savedDiskJson = '';

  const mockSafBridge: SafBackupPluginContract = {
    async saveJsonDocument({ content, fileName }) {
      savedDiskJson = content;
      return {
        saved: true,
        cancelled: false,
        uri: `content://com.android.externalstorage.documents/document/primary%3ADownload%2F${fileName}`,
        fileName,
        bytesWritten: new TextEncoder().encode(content).byteLength,
      };
    },
    async openJsonDocument() {
      return {
        opened: true,
        cancelled: false,
        uri: 'content://com.android.externalstorage.documents/document/primary%3ADownload%2Frubrikpad_yedek.json',
        fileName: 'rubrikpad_yedek.json',
        byteLength: new TextEncoder().encode(savedDiskJson).byteLength,
        content: savedDiskJson,
      };
    },
  };

  // 1. Export via Android SAF
  const exportResult = await saveVerifiedBackupFile(originalState, {
    isNativeAndroid: true,
    safBridge: mockSafBridge,
  });
  assert.equal(exportResult.status, 'saved');
  assert.ok(savedDiskJson.length > 0);

  // 2. Restore via Android SAF (Intent.ACTION_OPEN_DOCUMENT)
  const restoreSafResult = await restoreBackupViaAndroidSaf({
    mode: 'verified',
    safBridge: mockSafBridge,
  });
  assert.equal(restoreSafResult.status, 'restored');
  assert.ok(restoreSafResult.state);

  // 3. Also verify standard file input restore path (parseAndVerifyRestoredBackupText)
  const restoreInputResult = parseAndVerifyRestoredBackupText(
    savedDiskJson,
    'verified',
    'rubrikpad_yedek.json'
  );
  assert.equal(restoreInputResult.status, 'restored');
  assert.ok(restoreInputResult.state);

  const restored = restoreSafResult.state!;
  assert.equal(computePayloadChecksum(restored), exportResult.checksum);
  assert.equal(restoreSafResult.checksum, exportResult.checksum);
  assert.equal(restoreInputResult.checksum, exportResult.checksum);
  assert.equal(restored.classrooms.length, originalState.classrooms.length);
  assert.equal(restored.students.length, originalState.students.length);
  assert.equal(restored.rubrics.length, originalState.rubrics.length);
  assert.equal(restored.sessions.length, originalState.sessions.length);

  const restoredClassroom = restored.classrooms.find((c) => c.id === 'cls-11a');
  assert.ok(restoredClassroom);
  assert.equal(restoredClassroom.name, '11/A');
  assert.equal(restoredClassroom.gradeLevel, '11. Sınıf');
  assert.equal(restoredClassroom.subject, 'Türk Dili ve Edebiyatı');

  const restoredStudent = restored.students.find((s) => s.id === 'stu-11a-1');
  assert.ok(restoredStudent);
  assert.equal(restoredStudent.fullName, 'Zeynep Kaya');
  assert.equal(restoredStudent.studentNumber, '412');
  assert.equal(restoredStudent.auditLog?.length, 1);

  const restoredSession = restored.sessions.find((s) => s.id === 'ses-11a-1');
  assert.ok(restoredSession);
  const restoredEval = restoredSession.evaluations['stu-11a-1'];
  assert.ok(restoredEval);
  assert.equal(
    restoredEval.note,
    'Akıcı ve diksiyon kurallarına uygun sunum yaptı.'
  );
  assert.deepEqual(
    restoredEval.criterionScores,
    originalState.sessions.find((s) => s.id === 'ses-11a-1')!.evaluations[
      'stu-11a-1'
    ].criterionScores
  );
});

test('Legacy v1/v2 backup import converts and preserves classroom, student, rubric, and evaluation data', () => {
  const state = buildRichSampleState();
  const rawLegacyJson = JSON.stringify({
    classrooms: state.classrooms,
    students: state.students,
    rubrics: state.rubrics,
    sessions: state.sessions,
  });

  const legacyResult = parseAndVerifyRestoredBackupText(
    rawLegacyJson,
    'legacy',
    'eski_yedek.json'
  );
  assert.equal(legacyResult.status, 'restored');
  assert.equal(legacyResult.migratedFromV2, true);
  assert.ok(legacyResult.state);
  assert.equal(legacyResult.state.classrooms.length, state.classrooms.length);
  assert.equal(legacyResult.state.students.length, state.students.length);
  assert.equal(legacyResult.state.rubrics.length, state.rubrics.length);
  assert.equal(legacyResult.state.sessions.length, state.sessions.length);
});
