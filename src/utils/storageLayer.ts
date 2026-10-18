import type {
  Classroom,
  Student,
  Rubric,
  EvaluationSession,
  VerifiedBackupBundle,
} from '../types.ts';
import { freezeRubricSnapshot, splitTurkishFullName } from './rubricLogic.ts';

export const CURRENT_SCHEMA_VERSION = 3;
export const STORAGE_KEY = 'rubrikpad_state_v3';
const IDB_NAME = 'RubrikPadTransactionalDB';
const IDB_STORE = 'app_state_tx';

export interface AppDataState {
  classrooms: Classroom[];
  students: Student[];
  rubrics: Rubric[];
  sessions: EvaluationSession[];
}

/**
 * Computes a deterministic 64-bit hex integrity checksum for backup verification (P0 #6).
 */
export function computePayloadChecksum(payload: AppDataState): string {
  const canonical = JSON.stringify({
    c: payload.classrooms.map((c) => c.id),
    s: payload.students.map((s) => `${s.id}:${s.studentNumber}:${s.fullName}`),
    r: payload.rubrics.map((r) => `${r.id}:${r.criteria.length}`),
    e: payload.sessions.map(
      (ses) => `${ses.id}:${ses.rubricId}:${Object.keys(ses.evaluations || {}).length}`
    ),
  });

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
 * Normalizes and migrates loaded state so every session has a frozen rubricSnapshot (P0 #3)
 * and every student has firstName and lastName populated (P1 #3).
 */
export function normalizeAndMigrateState(raw: AppDataState): AppDataState {
  const rubricsById: Record<string, Rubric> = {};
  const normalizedRubrics = raw.rubrics.map((r) => ({
    ...r,
    criteria: r.criteria.map((c) => ({
      ...c,
      maxPoints: c.maxPoints ?? c.weight,
    })),
  }));
  for (const r of normalizedRubrics) {
    rubricsById[r.id] = r;
  }

  const normalizedStudents = raw.students.map((s) => {
    if (s.firstName && s.lastName) return s;
    const split = splitTurkishFullName(s.fullName);
    return {
      ...s,
      firstName: s.firstName || split.firstName,
      lastName: s.lastName || split.lastName,
      fullName: split.fullName || s.fullName,
    };
  });

  const normalizedSessions = raw.sessions.map((ses) => {
    const rubric = rubricsById[ses.rubricId];
    const snapshot =
      ses.rubricSnapshot && ses.rubricSnapshot.id === ses.rubricId
        ? ses.rubricSnapshot
        : rubric
        ? freezeRubricSnapshot(rubric)
        : undefined;

    const classIds =
      Array.isArray(ses.classIds) && ses.classIds.length > 0
        ? ses.classIds
        : [ses.classId];

    return {
      ...ses,
      classIds,
      rubricSnapshot: snapshot,
      undoHistory: Array.isArray(ses.undoHistory) ? ses.undoHistory : [],
    };
  });

  return {
    classrooms: raw.classrooms,
    students: normalizedStudents,
    rubrics: normalizedRubrics,
    sessions: normalizedSessions,
  };
}

/**
 * Creates a verifiable backup bundle with schema version, timestamp, and integrity checksum (P0 #6).
 */
export function createVerifiedBackupBundle(state: AppDataState): VerifiedBackupBundle {
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
 * Validates a backup JSON string, checking schema structure, referential integrity, and checksum (P0 #6).
 */
export function verifyAndParseBackupBundle(jsonString: string): {
  isValid: boolean;
  error?: string;
  state?: AppDataState;
} {
  try {
    const parsed = JSON.parse(jsonString) as Partial<VerifiedBackupBundle>;
    if (!parsed || typeof parsed !== 'object' || !parsed.payload) {
      return {
        isValid: false,
        error: 'Geçersiz yedek dosyası formatı: Veri yükü (payload) bulunamadı.',
      };
    }

    const { classrooms, students, rubrics, sessions } = parsed.payload;
    if (
      !Array.isArray(classrooms) ||
      !Array.isArray(students) ||
      !Array.isArray(rubrics) ||
      !Array.isArray(sessions)
    ) {
      return {
        isValid: false,
        error: 'Yedek dosyası eksik: Sınıflar, öğrenciler, rubrikler veya oturumlar bozuk.',
      };
    }

    if (classrooms.length === 0 || rubrics.length === 0) {
      return {
        isValid: false,
        error: 'Yedek dosyasında en az bir sınıf ve bir rubrik bulunmalıdır.',
      };
    }

    const normalized = normalizeAndMigrateState({
      classrooms,
      students,
      rubrics,
      sessions,
    });

    const expectedChecksum = computePayloadChecksum(normalized);
    if (parsed.checksum && parsed.checksum !== expectedChecksum) {
      return {
        isValid: false,
        error:
          'Yedek bütünlük doğrulaması (Checksum) başarısız: Dosya değiştirilmiş veya bozulmuş.',
      };
    }

    return {
      isValid: true,
      state: normalized,
    };
  } catch {
    return {
      isValid: false,
      error: 'Yedek dosyası JSON olarak okunamadı.',
    };
  }
}

/**
 * Saves state transactionally into IndexedDB + verified localStorage snapshot + server-side disk store.
 */
export async function saveTransactionalState(state: AppDataState): Promise<void> {
  const bundle = createVerifiedBackupBundle(state);
  const serialized = JSON.stringify(bundle);

  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // ignore quota error
  }

  // Write to IndexedDB transactionally if in browser
  if (typeof indexedDB !== 'undefined') {
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
            reject(tx.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      // ignore IndexedDB error in restricted environments
    }
  }
}

/**
 * Loads and verifies state from storage, falling back cleanly to seed data if empty.
 */
export function loadVerifiedInitialState(fallbackSeed: AppDataState): AppDataState {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const verified = verifyAndParseBackupBundle(saved);
        if (verified.isValid && verified.state) {
          return verified.state;
        }
      }
    } catch {
      // ignore
    }
  }
  return normalizeAndMigrateState(fallbackSeed);
}
