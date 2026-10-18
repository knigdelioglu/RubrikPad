import type {
  Classroom,
  Student,
  Rubric,
  RubricCriterion,
  RubricLevel,
  EvaluationSession,
  StudentEvaluation,
  StudentGroup,
  VerifiedBackupBundle,
} from '../types.ts';
import {
  freezeRubricSnapshot,
  isScoreAssigned,
  splitTurkishFullName,
} from './rubricLogic.ts';

export const CURRENT_SCHEMA_VERSION = 3;
export const STORAGE_KEY = 'rubrikpad_state_v3';
export const LEGACY_V2_BUNDLE_KEY = 'rubrikpad_state_v2';
export const LEGACY_V2_KEYS = {
  classrooms: ['rubrikpad_classrooms_v2', 'rubrikpad_classrooms_v1', 'rubrikpad_classrooms'],
  students: ['rubrikpad_students_v2', 'rubrikpad_students_v1', 'rubrikpad_students'],
  rubrics: ['rubrikpad_rubrics_v2', 'rubrikpad_rubrics_v1', 'rubrikpad_rubrics'],
  sessions: ['rubrikpad_sessions_v2', 'rubrikpad_sessions_v1', 'rubrikpad_sessions'],
} as const;

const IDB_NAME = 'RubrikPadTransactionalDB';
const IDB_STORE = 'app_state_tx';

// Fallback transactional store for environments without native window.indexedDB (e.g. Node unit tests)
let memoryIndexedDbSnapshot: string | null = null;
let simulateIndexedDbFailure = false;

export function __setSimulateIndexedDbFailureForTests(fail: boolean): void {
  simulateIndexedDbFailure = fail;
}

export function __clearMemoryIndexedDbForTests(): void {
  memoryIndexedDbSnapshot = null;
}

export interface AppDataState {
  classrooms: Classroom[];
  students: Student[];
  rubrics: Rubric[];
  sessions: EvaluationSession[];
}

export interface TransactionalSaveResult {
  ok: boolean;
  localStorageSaved: boolean;
  indexedDbSaved: boolean;
  checksum: string;
  errors: string[];
  errorMessage: string | null;
}

/**
 * Recursively canonicalizes any value with alphabetically sorted object keys
 * so that checksum computation is 100% deterministic across all nested scores and notes.
 */
function canonicalizeForChecksum(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeForChecksum(item));
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const result: Record<string, unknown> = {};
    for (const k of sortedKeys) {
      if (record[k] !== undefined) {
        result[k] = canonicalizeForChecksum(record[k]);
      }
    }
    return result;
  }
  return value;
}

/**
 * Computes a deterministic 64-bit hex integrity checksum covering EVERY classroom, student,
 * rubric criterion/level/weight/maxPoints, session, group score/note, and student individual/group
 * criterion score, direct score, observation note, and tag (P0 #6).
 */
export function computePayloadChecksum(payload: AppDataState): string {
  const fullDataToHash = {
    classrooms: (payload.classrooms || []).map((c) => ({
      id: c.id,
      name: c.name,
      gradeLevel: c.gradeLevel,
      subject: c.subject,
      academicYear: c.academicYear,
    })),
    students: (payload.students || []).map((s) => ({
      id: s.id,
      studentNumber: s.studentNumber,
      firstName: s.firstName || '',
      lastName: s.lastName || '',
      fullName: s.fullName,
      classId: s.classId,
      archived: Boolean(s.archived),
    })),
    rubrics: (payload.rubrics || []).map((r) => ({
      id: r.id,
      title: r.title,
      subject: r.subject,
      description: r.description,
      maxLevelPoints: r.maxLevelPoints,
      criteria: (r.criteria || []).map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        weight: c.weight,
        maxPoints: c.maxPoints ?? c.weight,
        required: c.required !== false,
        levels: (c.levels || []).map((l) => ({
          level: l.level,
          label: l.label,
          points: l.points,
          description: l.description,
        })),
      })),
    })),
    sessions: (payload.sessions || []).map((ses) => ({
      id: ses.id,
      title: ses.title,
      classId: ses.classId,
      classIds:
        Array.isArray(ses.classIds) && ses.classIds.length > 0
          ? ses.classIds
          : [ses.classId],
      rubricId: ses.rubricId,
      rubricSnapshot: ses.rubricSnapshot || null,
      date: ses.date,
      status: ses.status,
      mode: ses.mode,
      generalSessionNote: ses.generalSessionNote || '',
      groups: (ses.groups || []).map((g) => ({
        id: g.id,
        name: g.name,
        studentIds: g.studentIds || [],
        criterionScores: g.criterionScores || {},
        directCriterionScores: g.directCriterionScores || {},
        groupNote: g.groupNote || '',
        lastAppliedAt: g.lastAppliedAt || null,
      })),
      evaluations: Object.keys(ses.evaluations || {})
        .sort()
        .map((stuId) => {
          const ev = ses.evaluations[stuId];
          return {
            studentId: ev.studentId || stuId,
            criterionScores: ev.criterionScores || {},
            directCriterionScores: ev.directCriterionScores || {},
            groupCriterionScores: ev.groupCriterionScores || {},
            groupDirectScores: ev.groupDirectScores || {},
            groupNote: ev.groupNote || '',
            groupId: ev.groupId || null,
            activeScoreSource: ev.activeScoreSource || 'individual',
            note: ev.note || '',
            tags: ev.tags || [],
            evaluatedViaGroup: ev.evaluatedViaGroup || null,
          };
        }),
    })),
  };

  const canonical = JSON.stringify(canonicalizeForChecksum(fullDataToHash));

  let h1 = 0xdeadbeef ^ canonical.length;
  let h2 = 0x41c6ce57 ^ canonical.length;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `rpk-${hex1}${hex2}`;
}

/**
 * Migrates a v1/v2 data structure into the v3 schema:
 * 1. Splits student fullName into firstName and lastName (P1 #3).
 * 2. Adds 0-point "Gözlenmedi (0)" level to v2 rubrics that only had 1..4 levels (P0 #1),
 *    and populates criterion `maxPoints` and `required` (P1 #1).
 * 3. Freezes `rubricSnapshot` on every session (P0 #3).
 * 4. Separates legacy group evaluations (`evaluatedViaGroup` / group member scores) into
 *    `groupCriterionScores` and `groupNote` so individual scores are not mixed (P0 #4).
 */
export function migrateV2ToV3(raw: Partial<AppDataState>): AppDataState {
  const rawClassrooms = Array.isArray(raw.classrooms) ? raw.classrooms : [];
  const rawStudents = Array.isArray(raw.students) ? raw.students : [];
  const rawRubrics = Array.isArray(raw.rubrics) ? raw.rubrics : [];
  const rawSessions = Array.isArray(raw.sessions) ? raw.sessions : [];

  const classrooms: Classroom[] = rawClassrooms.map((c) => ({
    id: c.id,
    name: c.name,
    gradeLevel: c.gradeLevel || 'Belirtilmedi',
    subject: c.subject || 'Genel',
    academicYear: c.academicYear || '2026-2027',
  }));

  const students: Student[] = rawStudents.map((s) => {
    const split = splitTurkishFullName(s.fullName || '');
    const firstName = s.firstName?.trim() || split.firstName;
    const lastName = s.lastName?.trim() || split.lastName;
    const fullName =
      firstName && lastName
        ? `${firstName} ${lastName}`
        : s.fullName?.trim() || firstName || lastName;
    return {
      ...s,
      firstName,
      lastName,
      fullName,
      archived: Boolean(s.archived),
      auditLog: Array.isArray(s.auditLog) ? s.auditLog : [],
    };
  });

  const normalizeCriterion = (c: RubricCriterion): RubricCriterion => {
    const existingLevels: RubricLevel[] = Array.isArray(c.levels)
      ? c.levels.map((l) => ({ ...l }))
      : [];
    const hasZeroLevel = existingLevels.some((l) => l.points === 0);
    const levelsWithZero = hasZeroLevel
      ? existingLevels
      : [
          {
            level: 0,
            label: 'Gözlenmedi (0)',
            points: 0,
            description: 'Bu ölçüt için gözlemlenebilir performans sergilenmedi.',
          },
          ...existingLevels,
        ];
    levelsWithZero.sort((a, b) => a.points - b.points);

    return {
      ...c,
      maxPoints:
        typeof c.maxPoints === 'number' && c.maxPoints > 0
          ? c.maxPoints
          : c.weight,
      required: c.required !== false,
      levels: levelsWithZero,
    };
  };

  const rubrics: Rubric[] = rawRubrics.map((r) => ({
    ...r,
    version: typeof r.version === 'number' ? Math.max(r.version, 3) : 3,
    criteria: (r.criteria || []).map(normalizeCriterion),
  }));

  const rubricsById: Record<string, Rubric> = {};
  for (const r of rubrics) {
    rubricsById[r.id] = r;
  }

  const sessions: EvaluationSession[] = rawSessions.map((ses) => {
    const matchingRubric = rubricsById[ses.rubricId];
    let snapshot: Rubric | undefined;
    if (ses.rubricSnapshot && ses.rubricSnapshot.id === ses.rubricId) {
      snapshot = {
        ...ses.rubricSnapshot,
        criteria: (ses.rubricSnapshot.criteria || []).map(normalizeCriterion),
      };
    } else if (matchingRubric) {
      snapshot = freezeRubricSnapshot(matchingRubric);
    }

    const classIds =
      Array.isArray(ses.classIds) && ses.classIds.length > 0
        ? ses.classIds
        : [ses.classId];

    const groups: StudentGroup[] = (ses.groups || []).map((g) => ({
      ...g,
      studentIds: Array.isArray(g.studentIds) ? g.studentIds : [],
      criterionScores: g.criterionScores || {},
      groupNote: g.groupNote || '',
    }));

    // Map studentId -> group for v2 group evaluation separation
    const groupByStudentId: Record<string, StudentGroup> = {};
    for (const grp of groups) {
      for (const sid of grp.studentIds) {
        groupByStudentId[sid] = grp;
      }
    }

    const migratedEvaluations: Record<string, StudentEvaluation> = {};
    for (const [stuId, rawEv] of Object.entries(ses.evaluations || {})) {
      if (!rawEv) continue;
      const memberGroup = groupByStudentId[stuId];
      const hasExplicitGroupScores =
        rawEv.groupCriterionScores &&
        Object.keys(rawEv.groupCriterionScores).length > 0;

      let nextIndividualScores = { ...(rawEv.criterionScores || {}) };
      let nextGroupScores = hasExplicitGroupScores
        ? { ...rawEv.groupCriterionScores }
        : undefined;
      let nextGroupNote = rawEv.groupNote;
      let nextGroupId = rawEv.groupId || memberGroup?.id;
      let nextActiveSource = rawEv.activeScoreSource;

      // In v2, applying a group score wrote into `criterionScores` and set `evaluatedViaGroup`
      // without `groupCriterionScores`. Migrate those cleanly into `groupCriterionScores`!
      if (!hasExplicitGroupScores && (rawEv.evaluatedViaGroup || memberGroup)) {
        const grpScores = memberGroup?.criterionScores || {};
        const groupHasScored = Object.values(grpScores).some((v) =>
          isScoreAssigned(v)
        );
        if (groupHasScored) {
          nextGroupScores = { ...grpScores };
          nextGroupNote = nextGroupNote || memberGroup?.groupNote || '';
        } else if (rawEv.evaluatedViaGroup) {
          nextGroupScores = { ...(rawEv.criterionScores || {}) };
        }

        // If v2 overwrote criterionScores purely from the group (noted by `[Grup ...]` in note or evaluatedViaGroup),
        // clean the `[Grup ...]:` suffix out of individual `note` if needed and keep both separated.
        if (rawEv.evaluatedViaGroup && !nextActiveSource) {
          nextActiveSource = 'group';
        }
      }

      migratedEvaluations[stuId] = {
        ...rawEv,
        studentId: rawEv.studentId || stuId,
        criterionScores: nextIndividualScores,
        groupCriterionScores: nextGroupScores,
        groupNote: nextGroupNote,
        groupId: nextGroupId,
        activeScoreSource: nextActiveSource || 'individual',
        note: rawEv.note || '',
        tags: Array.isArray(rawEv.tags) ? rawEv.tags : [],
        updatedAt: rawEv.updatedAt || new Date().toISOString(),
      };
    }

    return {
      ...ses,
      classIds,
      rubricSnapshot: snapshot,
      groups,
      evaluations: migratedEvaluations,
      undoHistory: Array.isArray(ses.undoHistory) ? ses.undoHistory : [],
    };
  });

  return {
    classrooms,
    students,
    rubrics,
    sessions,
  };
}

/**
 * Normalizes and migrates loaded state so every session has a frozen rubricSnapshot (P0 #3)
 * and every student has firstName and lastName populated (P1 #3).
 */
export function normalizeAndMigrateState(raw: AppDataState): AppDataState {
  return migrateV2ToV3(raw);
}

/**
 * Attempts to read legacy v1/v2 keys from localStorage and migrate them to v3.
 */
export function loadLegacyV2FromLocalStorage(
  fallbackSeed?: AppDataState
): AppDataState | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    // 1. Check single-key v2 bundle (`rubrikpad_state_v2`)
    const v2BundleRaw = localStorage.getItem(LEGACY_V2_BUNDLE_KEY);
    if (v2BundleRaw) {
      const parsed = JSON.parse(v2BundleRaw);
      const payload = parsed?.payload || parsed;
      if (
        payload &&
        (Array.isArray(payload.classrooms) ||
          Array.isArray(payload.students) ||
          Array.isArray(payload.rubrics) ||
          Array.isArray(payload.sessions))
      ) {
        return migrateV2ToV3({
          classrooms: payload.classrooms || fallbackSeed?.classrooms || [],
          students: payload.students || fallbackSeed?.students || [],
          rubrics: payload.rubrics || fallbackSeed?.rubrics || [],
          sessions: payload.sessions || fallbackSeed?.sessions || [],
        });
      }
    }

    // 2. Check separate v2 / v1 localStorage keys (`rubrikpad_classrooms_v2`, etc.)
    const readFirstMatchingKey = <T>(keys: readonly string[]): T[] | null => {
      for (const k of keys) {
        const val = localStorage.getItem(k);
        if (val) {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed as T[];
        }
      }
      return null;
    };

    const v2Classrooms = readFirstMatchingKey<Classroom>(LEGACY_V2_KEYS.classrooms);
    const v2Students = readFirstMatchingKey<Student>(LEGACY_V2_KEYS.students);
    const v2Rubrics = readFirstMatchingKey<Rubric>(LEGACY_V2_KEYS.rubrics);
    const v2Sessions = readFirstMatchingKey<EvaluationSession>(LEGACY_V2_KEYS.sessions);

    if (v2Classrooms || v2Students || v2Rubrics || v2Sessions) {
      return migrateV2ToV3({
        classrooms: v2Classrooms || fallbackSeed?.classrooms || [],
        students: v2Students || fallbackSeed?.students || [],
        rubrics: v2Rubrics || fallbackSeed?.rubrics || [],
        sessions: v2Sessions || fallbackSeed?.sessions || [],
      });
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Creates a verifiable backup bundle with schema version, timestamp, and integrity checksum (P0 #6).
 */
export function createVerifiedBackupBundle(
  state: AppDataState
): VerifiedBackupBundle {
  const normalized = normalizeAndMigrateState(state);
  const checksum = computePayloadChecksum(normalized);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    checksum,
    payload: normalized,
  };
}

/**
 * Validates a backup JSON string, checking schema structure, referential integrity, and full checksum (P0 #6).
 * Also supports migrating v2 backup bundles cleanly when schemaVersion < 3.
 */
export function verifyAndParseBackupBundle(jsonString: string): {
  isValid: boolean;
  error?: string;
  state?: AppDataState;
  migratedFromV2?: boolean;
} {
  try {
    const parsed = JSON.parse(jsonString) as Partial<VerifiedBackupBundle> &
      Partial<AppDataState>;
    if (!parsed || typeof parsed !== 'object') {
      return {
        isValid: false,
        error: 'Geçersiz yedek dosyası formatı.',
      };
    }

    // Support both v3 wrapped `{ payload, checksum, schemaVersion }` and legacy v2 raw `{ classrooms, students, rubrics, sessions }`
    const isWrapped = Boolean(parsed.payload && typeof parsed.payload === 'object');
    const rawPayload = isWrapped
      ? parsed.payload!
      : {
          classrooms: parsed.classrooms,
          students: parsed.students,
          rubrics: parsed.rubrics,
          sessions: parsed.sessions,
        };

    const { classrooms, students, rubrics, sessions } = rawPayload;
    if (
      !Array.isArray(classrooms) ||
      !Array.isArray(students) ||
      !Array.isArray(rubrics) ||
      !Array.isArray(sessions)
    ) {
      return {
        isValid: false,
        error:
          'Yedek dosyası eksik: Sınıflar, öğrenciler, rubrikler veya oturumlar bozuk.',
      };
    }

    if (classrooms.length === 0 || rubrics.length === 0) {
      return {
        isValid: false,
        error: 'Yedek dosyasında en az bir sınıf ve bir rubrik bulunmalıdır.',
      };
    }

    const isLegacyV2 =
      !isWrapped ||
      (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion < 3);

    const checkedPayload: AppDataState = {
      classrooms,
      students,
      rubrics,
      sessions,
    };

    if (parsed.checksum) {
      const rawChecksum = computePayloadChecksum(checkedPayload);
      if (parsed.checksum !== rawChecksum) {
        return {
          isValid: false,
          error:
            'Yedek bütünlük doğrulaması (Checksum) başarısız: Puanlar, notlar veya kayıtlar değiştirilmiş ya da bozulmuş.',
        };
      }
    }

    const normalized = migrateV2ToV3(checkedPayload);

    return {
      isValid: true,
      state: normalized,
      migratedFromV2: isLegacyV2,
    };
  } catch {
    return {
      isValid: false,
      error: 'Yedek dosyası JSON olarak okunamadı.',
    };
  }
}

/**
 * Saves state transactionally into IndexedDB + verified localStorage snapshot.
 * Never swallows errors silently: returns structured `TransactionalSaveResult` and invokes `onSaveError` if any storage layer fails.
 */
export async function saveTransactionalState(
  state: AppDataState,
  options?: { onSaveError?: (errorMessage: string, errors: string[]) => void }
): Promise<TransactionalSaveResult> {
  const bundle = createVerifiedBackupBundle(state);
  const serialized = JSON.stringify(bundle);
  const errors: string[] = [];
  let localStorageSaved = false;
  let indexedDbSaved = false;

  // 1. Save to localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorageSaved = true;
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Kota veya erişim hatası';
      errors.push(
        `Yerel depolama (localStorage) kaydı başarısız oldu (${detail}).`
      );
    }
  } else {
    errors.push('Tarayıcı yerel depolama alanı (localStorage) kullanılamıyor.');
  }

  // 2. Save transactionally to IndexedDB (or transactional memory store in headless/test runtime)
  if (simulateIndexedDbFailure) {
    errors.push('İşlemsel IndexedDB veritabanına yazma işlemi başarısız oldu.');
  } else if (typeof indexedDB !== 'undefined') {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(bundle, 'latest');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error || new Error('IndexedDB transaction error'));
          };
        };
        req.onerror = () =>
          reject(req.error || new Error('IndexedDB open error'));
      });
      memoryIndexedDbSnapshot = serialized;
      indexedDbSaved = true;
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Veritabanı hatası';
      errors.push(
        `İşlemsel IndexedDB veritabanı kaydı başarısız oldu (${detail}).`
      );
    }
  } else {
    // Node / environment without native IndexedDB uses in-memory transactional store
    memoryIndexedDbSnapshot = serialized;
    indexedDbSaved = true;
  }

  const ok = errors.length === 0 && localStorageSaved && indexedDbSaved;
  const errorMessage = errors.length > 0 ? errors.join(' ') : null;

  if (errorMessage) {
    if (options?.onSaveError) {
      options.onSaveError(errorMessage, errors);
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(
          new CustomEvent('rubrikpad:save-error', {
            detail: { errors, errorMessage },
          })
        );
      } catch {
        // ignore custom event dispatch error
      }
    }
  }

  return {
    ok,
    localStorageSaved,
    indexedDbSaved,
    checksum: bundle.checksum,
    errors,
    errorMessage,
  };
}

/**
 * Reads and verifies the latest transactional backup from IndexedDB, automatically healing localStorage if valid.
 */
export async function recoverStateFromIndexedDB(): Promise<{
  recovered: boolean;
  state?: AppDataState;
  checksum?: string;
  error?: string;
}> {
  let rawBundleJson: string | null = null;

  if (typeof indexedDB !== 'undefined') {
    try {
      const idbRecord = await new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.close();
            resolve(null);
            return;
          }
          const tx = db.transaction(IDB_STORE, 'readonly');
          const getReq = tx.objectStore(IDB_STORE).get('latest');
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result ?? null);
          };
          getReq.onerror = () => {
            db.close();
            reject(getReq.error);
          };
        };
        req.onerror = () => reject(req.error);
      });

      if (idbRecord) {
        rawBundleJson =
          typeof idbRecord === 'string' ? idbRecord : JSON.stringify(idbRecord);
      }
    } catch {
      // Fall back to memoryIndexedDbSnapshot if available
    }
  }

  if (!rawBundleJson && memoryIndexedDbSnapshot) {
    rawBundleJson = memoryIndexedDbSnapshot;
  }

  if (!rawBundleJson) {
    return {
      recovered: false,
      error: 'IndexedDB deposunda kurtarılacak kayıt bulunamadı.',
    };
  }

  const verified = verifyAndParseBackupBundle(rawBundleJson);
  if (!verified.isValid || !verified.state) {
    return {
      recovered: false,
      error: verified.error || 'IndexedDB kaydı doğrulanamadı.',
    };
  }

  // Heal localStorage with the verified IndexedDB bundle
  const healedBundle = createVerifiedBackupBundle(verified.state);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(healedBundle));
    } catch {
      // ignore if localStorage is still full
    }
  }

  return {
    recovered: true,
    state: verified.state,
    checksum: healedBundle.checksum,
  };
}

/**
 * Synchronously loads and verifies state from localStorage (v3 or migrated v2),
 * returning metadata about whether IndexedDB recovery should be triggered.
 */
export function loadVerifiedInitialStateWithMeta(fallbackSeed: AppDataState): {
  state: AppDataState;
  source: 'localStorage_v3' | 'migrated_v2' | 'seed_fallback';
  localStorageCorrupted: boolean;
  error?: string;
} {
  let localStorageCorrupted = false;
  let corruptionError: string | undefined;

  if (typeof localStorage !== 'undefined') {
    try {
      const savedV3 = localStorage.getItem(STORAGE_KEY);
      if (savedV3) {
        const verified = verifyAndParseBackupBundle(savedV3);
        if (verified.isValid && verified.state) {
          return {
            state: verified.state,
            source: 'localStorage_v3',
            localStorageCorrupted: false,
          };
        } else {
          localStorageCorrupted = true;
          corruptionError = verified.error;
        }
      }

      // Check for legacy v2 / v1 data in localStorage and migrate automatically
      const migratedV2 = loadLegacyV2FromLocalStorage(fallbackSeed);
      if (migratedV2) {
        const v3Bundle = createVerifiedBackupBundle(migratedV2);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(v3Bundle));
        } catch {
          // ignore
        }
        return {
          state: migratedV2,
          source: 'migrated_v2',
          localStorageCorrupted: false,
        };
      }
    } catch {
      localStorageCorrupted = true;
    }
  }

  return {
    state: normalizeAndMigrateState(fallbackSeed),
    source: 'seed_fallback',
    localStorageCorrupted,
    error: corruptionError,
  };
}

/**
 * Synchronous entry point that loads v3 state, or automatically migrates v2 -> v3, or falls back to seed data.
 */
export function loadVerifiedInitialState(
  fallbackSeed: AppDataState
): AppDataState {
  return loadVerifiedInitialStateWithMeta(fallbackSeed).state;
}

/**
 * Full asynchronous initialization with automatic IndexedDB recovery when localStorage is empty or corrupted.
 */
export async function loadInitialStateWithRecovery(
  fallbackSeed: AppDataState
): Promise<{
  state: AppDataState;
  source:
    | 'localStorage_v3'
    | 'migrated_v2'
    | 'indexeddb_recovered'
    | 'seed_fallback';
  recoveryNotice?: string;
}> {
  const syncResult = loadVerifiedInitialStateWithMeta(fallbackSeed);

  if (syncResult.source === 'localStorage_v3') {
    return {
      state: syncResult.state,
      source: 'localStorage_v3',
    };
  }

  if (syncResult.source === 'migrated_v2') {
    return {
      state: syncResult.state,
      source: 'migrated_v2',
      recoveryNotice:
        'Önceki sürüm (v2) verileriniz otomatik olarak v3 veri yapısına yükseltildi ve korundu.',
    };
  }

  // localStorage was missing or corrupted: attempt automatic recovery from IndexedDB!
  const idbRecovery = await recoverStateFromIndexedDB();
  if (idbRecovery.recovered && idbRecovery.state) {
    return {
      state: idbRecovery.state,
      source: 'indexeddb_recovered',
      recoveryNotice: syncResult.localStorageCorrupted
        ? 'Yerel önbellek (localStorage) bozulmuştu; tüm puan ve notlarınız işlemsel IndexedDB deposundan otomatik olarak kurtarıldı.'
        : 'Yerel önbellek bulunamadı; verileriniz işlemsel IndexedDB deposundan otomatik olarak geri yüklendi.',
    };
  }

  return {
    state: syncResult.state,
    source: 'seed_fallback',
  };
}
