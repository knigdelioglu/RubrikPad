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
import {
  LEGACY_BOOK_PRESENTATION_RUBRIC,
  LEGACY_BOOK_PRESENTATION_RUBRIC_ID,
  LEGACY_V3_LITERARY_BOOK_RUBRIC,
  LEGACY_V3_INFORMATIVE_BOOK_RUBRIC,
  LITERARY_BOOK_PRESENTATION_RUBRIC_ID,
  INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID,
  BOOK_PRESENTATION_RUBRIC_IDS,
} from '../data/bookPresentationRubric.ts';

export const CURRENT_SCHEMA_VERSION = 3;
export const STORAGE_KEY = 'rubrikpad_state_v3';
export const LEGACY_V3_ROLLBACK_KEY = 'rubrikpad_state_v3_rollback_backup';
export const STORAGE_CONFLICT_BACKUP_KEY = 'rubrikpad_state_v3_conflict_backup';
export const PRE_RESET_ROLLBACK_KEY = 'rubrikpad_state_v3_pre_reset_backup';
export const LOCALSTORAGE_QUARANTINE_KEY = 'rubrikpad_quarantine_v3_backup';
export const INDEXEDDB_QUARANTINE_KEY = 'rubrikpad_quarantine_idb_backup';
export const LEGACY_V2_BUNDLE_KEY = 'rubrikpad_state_v2';
export const MAX_BACKUP_JSON_BYTES = 15 * 1024 * 1024; // 15 MB upper bound against OOM / DoS
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
let memoryV3RollbackSnapshot: string | null = null;
let memoryConflictBackupSnapshot: string | null = null;
let memoryPreResetBackupSnapshot: string | null = null;
let memoryIndexedDbQuarantineSnapshot: string | null = null;
let storageWriteLockedDueToCorruption = false;
let simulateIndexedDbFailure = false;

export function __setSimulateIndexedDbFailureForTests(fail: boolean): void {
  simulateIndexedDbFailure = fail;
}

export function __clearMemoryIndexedDbForTests(): void {
  memoryIndexedDbSnapshot = null;
  memoryV3RollbackSnapshot = null;
  memoryConflictBackupSnapshot = null;
  memoryPreResetBackupSnapshot = null;
  memoryIndexedDbQuarantineSnapshot = null;
  storageWriteLockedDueToCorruption = false;
}

export function __setMemoryIndexedDbSnapshotForTests(raw: string | null): void {
  memoryIndexedDbSnapshot = raw;
}

export function __getMemoryIndexedDbSnapshotForTests(): string | null {
  return memoryIndexedDbSnapshot;
}

export function isStorageWriteLocked(): boolean {
  return storageWriteLockedDueToCorruption;
}

export function unlockStorageWriteLock(): void {
  storageWriteLockedDueToCorruption = false;
}

export function getV3RollbackBackup(): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      const fromLs = localStorage.getItem(LEGACY_V3_ROLLBACK_KEY);
      if (fromLs) return fromLs;
    } catch {
      // ignore
    }
  }
  return memoryV3RollbackSnapshot;
}

export function getStorageConflictBackup(): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      const fromLs = localStorage.getItem(STORAGE_CONFLICT_BACKUP_KEY);
      if (fromLs) return fromLs;
    } catch {
      // ignore
    }
  }
  return memoryConflictBackupSnapshot;
}

export function getPreResetRollbackBackup(): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      const fromLs = localStorage.getItem(PRE_RESET_ROLLBACK_KEY);
      if (fromLs) return fromLs;
    } catch {
      // ignore
    }
  }
  return memoryPreResetBackupSnapshot;
}

export function getQuarantinedIndexedDbBackup(): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      const fromLs = localStorage.getItem(INDEXEDDB_QUARANTINE_KEY);
      if (fromLs) return fromLs;
    } catch {
      // ignore
    }
  }
  return memoryIndexedDbQuarantineSnapshot;
}

/**
 * Safely parses JSON while stripping dangerous prototype-pollution keys (`__proto__`, `constructor`, `prototype`).
 */
export function parseJsonSafelyWithoutPrototypePollution<T = unknown>(
  jsonString: string
): T {
  return JSON.parse(jsonString, (key, value) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return undefined;
    }
    return value;
  }) as T;
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
  conflictDetected?: boolean;
  conflictBackupKey?: string;
  quotaHealedByEviction?: boolean;
  errors: string[];
  errorMessage: string | null;
}

/**
 * Pure TypeScript synchronous SHA-256 implementation (FIPS 180-4) operating on UTF-8 bytes.
 * Works identically in browser and Node environments without async overhead.
 */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000);
  const bitLenLo = (bytes.length * 8) >>> 0;

  // Padding: append 0x80, then 0x00 until length % 64 === 56, then 8-byte big-endian bit length
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLenHi, false);
  view.setUint32(paddedLength - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const v15 = w[i - 15];
      const s0 =
        ((v15 >>> 7) | (v15 << 25)) ^
        ((v15 >>> 18) | (v15 << 14)) ^
        (v15 >>> 3);
      const v2 = w[i - 2];
      const s1 =
        ((v2 >>> 17) | (v2 << 15)) ^
        ((v2 >>> 19) | (v2 << 13)) ^
        (v2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 =
        ((e >>> 6) | (e << 26)) ^
        ((e >>> 11) | (e << 21)) ^
        ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 =
        ((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

/**
 * Recursively canonicalizes any value with alphabetically sorted object keys
 * so that SHA-256 checksum computation is 100% deterministic across all nested scores,
 * notes, auditLog entries, and undoHistory snapshots.
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
 * Computes a deterministic SHA-256 integrity checksum (`sha256-<64_hex>`) covering the ENTIRE
 * application state: every classroom, student (including `auditLog` and `updatedAt`),
 * rubric (including `version`, criteria, weights, maxPoints, levels), and session
 * (including `rubricSnapshot`, `groups`, `evaluations`, and full `undoHistory`).
 */
export function computePayloadChecksum(payload: AppDataState): string {
  const fullDataToHash = {
    classrooms: (payload.classrooms || []).map((c) => ({
      ...c,
      id: c.id,
      name: c.name,
      gradeLevel: c.gradeLevel,
      subject: c.subject,
      academicYear: c.academicYear,
    })),
    students: (payload.students || []).map((s) => ({
      ...s,
      id: s.id,
      studentNumber: s.studentNumber,
      firstName: s.firstName || '',
      lastName: s.lastName || '',
      fullName: s.fullName,
      classId: s.classId,
      archived: Boolean(s.archived),
      updatedAt: s.updatedAt || null,
      auditLog: (s.auditLog || []).map((entry) => ({
        timestamp: entry.timestamp,
        action: entry.action,
        details: entry.details,
      })),
    })),
    rubrics: (payload.rubrics || []).map((r) => ({
      ...r,
      id: r.id,
      title: r.title,
      subject: r.subject,
      description: r.description,
      maxLevelPoints: r.maxLevelPoints,
      createdAt: r.createdAt || '',
      version: r.version ?? 3,
      criteria: (r.criteria || []).map((c) => ({
        ...c,
        id: c.id,
        title: c.title,
        category: c.category,
        weight: c.weight,
        maxPoints: c.maxPoints ?? c.weight,
        required: c.required !== false,
        levels: (c.levels || []).map((l) => ({
          ...l,
          level: l.level,
          label: l.label,
          points: l.points,
          description: l.description,
        })),
      })),
    })),
    sessions: (payload.sessions || []).map((ses) => ({
      ...ses,
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
        ...g,
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
            ...ev,
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
            updatedAt: ev.updatedAt || '',
          };
        }),
      undoHistory: (ses.undoHistory || []).map((u) => ({
        ...u,
        id: u.id,
        timestamp: u.timestamp,
        scope: u.scope,
        studentId: u.studentId || null,
        criterionId: u.criterionId || null,
        groupId: u.groupId || null,
        description: u.description,
        previousEvaluations: u.previousEvaluations || {},
        previousGroups: u.previousGroups || null,
        previousRubricId: u.previousRubricId || null,
        previousRubricSnapshot: u.previousRubricSnapshot || null,
      })),
    })),
  };

  const canonical = JSON.stringify(canonicalizeForChecksum(fullDataToHash));
  return `sha256-${sha256Hex(canonical)}`;
}

export type LegacyRpkHashAlgorithm =
  | 'cyrb53_16'
  | 'cyrb53_no_len_16'
  | 'dual_fnv1a_djb2_16'
  | 'fnv1a_8'
  | 'fnv1a_float_8'
  | 'fnv1_8'
  | 'djb2_8'
  | 'djb2_add_8'
  | 'java31_8'
  | 'sdbm_8'
  | 'cyrb53_8'
  | 'fnv1a_base36'
  | 'djb2_base36'
  | 'fnv1a_len_hex';

export interface LegacyRpkChecksumOptions {
  omitFullName?: boolean;
  studentFields?:
    | 'with_full_name'
    | 'omit_full_name'
    | 'only_full_name'
    | 'v3_turn1_no_archived'
    | 'v3_turn1_only_full_name_no_archived';
  rubricFields?:
    | 'v3_latest'
    | 'v3_with_version_created'
    | 'v3_without_maxpoints_required'
    | 'v3_turn1_minimal';
  groupFields?:
    | 'v3_latest'
    | 'v3_without_last_applied'
    | 'v3_initial_minimal'
    | 'v3_turn1_original';
  evaluationFields?:
    | 'v3_latest'
    | 'v3_with_updated_at'
    | 'v3_without_group_id'
    | 'v3_without_group_direct'
    | 'v3_audit2_exact'
    | 'v3_initial_minimal'
    | 'v3_turn1_original'
    | 'raw_record';
  sessionFields?:
    | 'v3_with_extras'
    | 'v3_standard'
    | 'v3_turn1_no_general_note';
  includeSessionExtras?: boolean;
  includeAuditAndUndo?: boolean;
  rawPayloadDirect?: boolean;
  canonicalize?: boolean;
  sortScoreMaps?: boolean;
  hashAlgorithm?: LegacyRpkHashAlgorithm;
}

export function computeRpkHashFromSerialized(
  serialized: string,
  algorithm: LegacyRpkHashAlgorithm = 'cyrb53_16'
): string {
  if (
    algorithm === 'fnv1a_8' ||
    algorithm === 'fnv1a_base36' ||
    algorithm === 'fnv1a_len_hex'
  ) {
    let h = 0x811c9dc5;
    for (let i = 0; i < serialized.length; i++) {
      h ^= serialized.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    const u = h >>> 0;
    if (algorithm === 'fnv1a_base36') {
      return `rpk-${u.toString(36)}`;
    }
    if (algorithm === 'fnv1a_len_hex') {
      return `rpk-${u.toString(16).padStart(8, '0')}-${serialized.length.toString(16)}`;
    }
    return `rpk-${u.toString(16).padStart(8, '0')}`;
  }

  if (algorithm === 'fnv1a_float_8') {
    let h = 0x811c9dc5;
    for (let i = 0; i < serialized.length; i++) {
      h ^= serialized.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return `rpk-${(h >>> 0).toString(16).padStart(8, '0')}`;
  }

  if (algorithm === 'fnv1_8') {
    let h = 0x811c9dc5;
    for (let i = 0; i < serialized.length; i++) {
      h = Math.imul(h, 0x01000193);
      h ^= serialized.charCodeAt(i);
    }
    return `rpk-${(h >>> 0).toString(16).padStart(8, '0')}`;
  }

  if (algorithm === 'djb2_8' || algorithm === 'djb2_base36') {
    let h = 5381;
    for (let i = 0; i < serialized.length; i++) {
      h = (Math.imul(h, 33) ^ serialized.charCodeAt(i)) >>> 0;
    }
    const u = h >>> 0;
    if (algorithm === 'djb2_base36') {
      return `rpk-${u.toString(36)}`;
    }
    return `rpk-${u.toString(16).padStart(8, '0')}`;
  }

  if (algorithm === 'djb2_add_8') {
    let h = 5381;
    for (let i = 0; i < serialized.length; i++) {
      h = (((h << 5) + h) + serialized.charCodeAt(i)) >>> 0;
    }
    return `rpk-${(h >>> 0).toString(16).padStart(8, '0')}`;
  }

  if (algorithm === 'java31_8') {
    let h = 0;
    for (let i = 0; i < serialized.length; i++) {
      h = ((h << 5) - h + serialized.charCodeAt(i)) | 0;
    }
    return `rpk-${(h >>> 0).toString(16).padStart(8, '0')}`;
  }

  if (algorithm === 'sdbm_8') {
    let h = 0;
    for (let i = 0; i < serialized.length; i++) {
      h = (serialized.charCodeAt(i) + (h << 6) + (h << 16) - h) >>> 0;
    }
    return `rpk-${(h >>> 0).toString(16).padStart(8, '0')}`;
  }

  if (algorithm === 'dual_fnv1a_djb2_16') {
    let h1 = 0x811c9dc5;
    let h2 = 5381;
    for (let i = 0; i < serialized.length; i++) {
      const ch = serialized.charCodeAt(i);
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193);
      h2 = (Math.imul(h2, 33) ^ ch) >>> 0;
    }
    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return `rpk-${hex1}${hex2}`;
  }

  let h1 =
    algorithm === 'cyrb53_no_len_16'
      ? 0xdeadbeef
      : 0xdeadbeef ^ serialized.length;
  let h2 =
    algorithm === 'cyrb53_no_len_16'
      ? 0x41c6ce57
      : 0x41c6ce57 ^ serialized.length;
  for (let i = 0; i < serialized.length; i++) {
    const ch = serialized.charCodeAt(i);
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
  if (algorithm === 'cyrb53_8') {
    return `rpk-${hex1}`;
  }
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `rpk-${hex1}${hex2}`;
}

function buildLegacyV3DataProjection(
  payload: AppDataState,
  options?: LegacyRpkChecksumOptions
): unknown {
  if (options?.rawPayloadDirect) {
    return {
      classrooms: payload.classrooms || [],
      students: payload.students || [],
      rubrics: payload.rubrics || [],
      sessions: payload.sessions || [],
    };
  }

  const formatMap = (
    map: Record<string, number | null> | undefined
  ): Record<string, number | null> => {
    const src = map || {};
    if (!options?.sortScoreMaps) return src;
    const out: Record<string, number | null> = {};
    for (const k of Object.keys(src).sort()) {
      out[k] = src[k];
    }
    return out;
  };

  const stuMode =
    options?.studentFields ??
    (options?.omitFullName ? 'omit_full_name' : 'with_full_name');
  const rubMode = options?.rubricFields ?? 'v3_latest';
  const grpMode = options?.groupFields ?? 'v3_latest';
  const evalMode = options?.evaluationFields ?? 'v3_latest';
  const sesMode =
    options?.sessionFields ??
    (options?.includeSessionExtras === false
      ? 'v3_standard'
      : 'v3_with_extras');
  const includeAuditAndUndo = Boolean(options?.includeAuditAndUndo);

  return {
    classrooms: (payload.classrooms || []).map((c) => ({
      id: c.id,
      name: c.name,
      gradeLevel: c.gradeLevel,
      subject: c.subject,
      academicYear: c.academicYear,
    })),
    students: (payload.students || []).map((s) => {
      const base =
        stuMode === 'omit_full_name'
          ? {
              id: s.id,
              studentNumber: s.studentNumber,
              firstName: s.firstName || '',
              lastName: s.lastName || '',
              classId: s.classId,
              archived: Boolean(s.archived),
            }
          : stuMode === 'only_full_name'
          ? {
              id: s.id,
              studentNumber: s.studentNumber,
              fullName: s.fullName,
              classId: s.classId,
              archived: Boolean(s.archived),
            }
          : stuMode === 'v3_turn1_no_archived'
          ? {
              id: s.id,
              studentNumber: s.studentNumber,
              firstName: s.firstName || '',
              lastName: s.lastName || '',
              fullName: s.fullName,
              classId: s.classId,
            }
          : stuMode === 'v3_turn1_only_full_name_no_archived'
          ? {
              id: s.id,
              studentNumber: s.studentNumber,
              fullName: s.fullName,
              classId: s.classId,
            }
          : {
              id: s.id,
              studentNumber: s.studentNumber,
              firstName: s.firstName || '',
              lastName: s.lastName || '',
              fullName: s.fullName,
              classId: s.classId,
              archived: Boolean(s.archived),
            };

      if (!includeAuditAndUndo) return base;
      return {
        ...base,
        updatedAt: s.updatedAt || null,
        auditLog: (s.auditLog || []).map((entry) => ({
          timestamp: entry.timestamp,
          action: entry.action,
          details: entry.details,
        })),
      };
    }),
    rubrics: (payload.rubrics || []).map((r) => {
      if (rubMode === 'v3_turn1_minimal') {
        return {
          id: r.id,
          title: r.title,
          subject: r.subject,
          description: r.description,
          maxLevelPoints: r.maxLevelPoints,
          criteria: (r.criteria || []).map((c) => ({
            id: c.id,
            title: c.title,
            weight: c.weight,
            maxPoints: c.maxPoints ?? c.weight,
          })),
        };
      }
      if (rubMode === 'v3_without_maxpoints_required') {
        return {
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
            levels: (c.levels || []).map((l) => ({
              level: l.level,
              label: l.label,
              points: l.points,
              description: l.description,
            })),
          })),
        };
      }
      if (rubMode === 'v3_with_version_created') {
        return {
          id: r.id,
          title: r.title,
          subject: r.subject,
          description: r.description,
          maxLevelPoints: r.maxLevelPoints,
          createdAt: r.createdAt || '',
          version: r.version ?? 3,
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
        };
      }
      return {
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
      };
    }),
    sessions: (payload.sessions || []).map((ses) => {
      const mappedGroups = (ses.groups || []).map((g) => {
        if (grpMode === 'v3_turn1_original') {
          return {
            id: g.id,
            name: g.name,
            studentIds: g.studentIds || [],
            criterionScores: formatMap(g.criterionScores),
          };
        }
        if (grpMode === 'v3_initial_minimal') {
          return {
            id: g.id,
            name: g.name,
            studentIds: g.studentIds || [],
            criterionScores: formatMap(g.criterionScores),
            groupNote: g.groupNote || '',
          };
        }
        if (grpMode === 'v3_without_last_applied') {
          return {
            id: g.id,
            name: g.name,
            studentIds: g.studentIds || [],
            criterionScores: formatMap(g.criterionScores),
            directCriterionScores: formatMap(g.directCriterionScores),
            groupNote: g.groupNote || '',
          };
        }
        return {
          id: g.id,
          name: g.name,
          studentIds: g.studentIds || [],
          criterionScores: formatMap(g.criterionScores),
          directCriterionScores: formatMap(g.directCriterionScores),
          groupNote: g.groupNote || '',
          lastAppliedAt: g.lastAppliedAt || null,
        };
      });

      const mappedEvaluations =
        evalMode === 'raw_record'
          ? ses.evaluations || {}
          : Object.keys(ses.evaluations || {})
              .sort()
              .map((stuId) => {
                const ev = ses.evaluations[stuId];
                if (evalMode === 'v3_turn1_original') {
                  return {
                    studentId: ev.studentId || stuId,
                    criterionScores: formatMap(ev.criterionScores),
                    note: ev.note || '',
                    tags: ev.tags || [],
                  };
                }
                if (evalMode === 'v3_audit2_exact') {
                  return {
                    studentId: ev.studentId || stuId,
                    criterionScores: formatMap(ev.criterionScores),
                    directCriterionScores: formatMap(ev.directCriterionScores),
                    groupCriterionScores: formatMap(ev.groupCriterionScores),
                    note: ev.note || '',
                    groupNote: ev.groupNote || '',
                    tags: ev.tags || [],
                    updatedAt: ev.updatedAt || '',
                  };
                }
                if (evalMode === 'v3_initial_minimal') {
                  return {
                    studentId: ev.studentId || stuId,
                    criterionScores: formatMap(ev.criterionScores),
                    groupCriterionScores: formatMap(ev.groupCriterionScores),
                    groupNote: ev.groupNote || '',
                    activeScoreSource: ev.activeScoreSource || 'individual',
                    note: ev.note || '',
                    tags: ev.tags || [],
                    evaluatedViaGroup: ev.evaluatedViaGroup || null,
                  };
                }
                if (evalMode === 'v3_without_group_direct') {
                  return {
                    studentId: ev.studentId || stuId,
                    criterionScores: formatMap(ev.criterionScores),
                    directCriterionScores: formatMap(ev.directCriterionScores),
                    groupCriterionScores: formatMap(ev.groupCriterionScores),
                    groupNote: ev.groupNote || '',
                    activeScoreSource: ev.activeScoreSource || 'individual',
                    note: ev.note || '',
                    tags: ev.tags || [],
                    evaluatedViaGroup: ev.evaluatedViaGroup || null,
                  };
                }
                if (evalMode === 'v3_without_group_id') {
                  return {
                    studentId: ev.studentId || stuId,
                    criterionScores: formatMap(ev.criterionScores),
                    directCriterionScores: formatMap(ev.directCriterionScores),
                    groupCriterionScores: formatMap(ev.groupCriterionScores),
                    groupDirectScores: formatMap(ev.groupDirectScores),
                    groupNote: ev.groupNote || '',
                    activeScoreSource: ev.activeScoreSource || 'individual',
                    note: ev.note || '',
                    tags: ev.tags || [],
                    evaluatedViaGroup: ev.evaluatedViaGroup || null,
                  };
                }
                if (evalMode === 'v3_with_updated_at') {
                  return {
                    studentId: ev.studentId || stuId,
                    criterionScores: formatMap(ev.criterionScores),
                    directCriterionScores: formatMap(ev.directCriterionScores),
                    groupCriterionScores: formatMap(ev.groupCriterionScores),
                    groupDirectScores: formatMap(ev.groupDirectScores),
                    groupNote: ev.groupNote || '',
                    groupId: ev.groupId || null,
                    activeScoreSource: ev.activeScoreSource || 'individual',
                    note: ev.note || '',
                    tags: ev.tags || [],
                    evaluatedViaGroup: ev.evaluatedViaGroup || null,
                    updatedAt: ev.updatedAt || '',
                  };
                }
                return {
                  studentId: ev.studentId || stuId,
                  criterionScores: formatMap(ev.criterionScores),
                  directCriterionScores: formatMap(ev.directCriterionScores),
                  groupCriterionScores: formatMap(ev.groupCriterionScores),
                  groupDirectScores: formatMap(ev.groupDirectScores),
                  groupNote: ev.groupNote || '',
                  groupId: ev.groupId || null,
                  activeScoreSource: ev.activeScoreSource || 'individual',
                  note: ev.note || '',
                  tags: ev.tags || [],
                  evaluatedViaGroup: ev.evaluatedViaGroup || null,
                };
              });

      const baseSession =
        sesMode === 'v3_turn1_no_general_note'
          ? {
              id: ses.id,
              title: ses.title,
              classId: ses.classId,
              rubricId: ses.rubricId,
              date: ses.date,
              status: ses.status,
              mode: ses.mode,
              groups: mappedGroups,
              evaluations: mappedEvaluations,
            }
          : sesMode === 'v3_with_extras'
          ? {
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
              groups: mappedGroups,
              evaluations: mappedEvaluations,
            }
          : {
              id: ses.id,
              title: ses.title,
              classId: ses.classId,
              rubricId: ses.rubricId,
              date: ses.date,
              status: ses.status,
              mode: ses.mode,
              generalSessionNote: ses.generalSessionNote || '',
              groups: mappedGroups,
              evaluations: mappedEvaluations,
            };

      if (!includeAuditAndUndo) return baseSession;
      return {
        ...baseSession,
        undoHistory: (ses.undoHistory || []).map((u) => ({
          id: u.id,
          timestamp: u.timestamp,
          scope: u.scope,
          studentId: u.studentId || null,
          criterionId: u.criterionId || null,
          groupId: u.groupId || null,
          description: u.description,
          previousEvaluations: u.previousEvaluations || {},
          previousGroups: u.previousGroups || null,
          previousRubricId: u.previousRubricId || null,
          previousRubricSnapshot: u.previousRubricSnapshot || null,
        })),
      };
    }),
  };
}

/**
 * Computes the original initial-v3 (`v3_turn1_original`) `rpk-` checksum algorithm
 * from the very first v3 release so that early v3 records in localStorage/IndexedDB or backups
 * are verified and upgraded without rejection.
 */
export function computeInitialV3RpkChecksum(
  payload: AppDataState,
  hashAlgorithm: LegacyRpkHashAlgorithm = 'fnv1a_8'
): string {
  const proj = buildLegacyV3DataProjection(payload, {
    studentFields: 'v3_turn1_no_archived',
    rubricFields: 'v3_turn1_minimal',
    groupFields: 'v3_turn1_original',
    evaluationFields: 'v3_turn1_original',
    sessionFields: 'v3_turn1_no_general_note',
    includeAuditAndUndo: false,
    sortScoreMaps: true,
  });
  return computeRpkHashFromSerialized(JSON.stringify(proj), hashAlgorithm);
}

/**
 * Computes the legacy v3 `rpk-` checksum (supporting initial v3 and intermediate v3 schemas/algorithms)
 * so that existing `rubrikpad_state_v3` data in localStorage/IndexedDB or v3 backups
 * can be verified for integrity and seamlessly upgraded to `sha256-` without data loss.
 */
export function computeLegacyRpkChecksum(
  payload: AppDataState,
  options?: LegacyRpkChecksumOptions
): string {
  const fullDataToHash = buildLegacyV3DataProjection(payload, options);
  const shouldCanonicalize = options?.canonicalize ?? true;
  const serialized = shouldCanonicalize
    ? JSON.stringify(canonicalizeForChecksum(fullDataToHash))
    : JSON.stringify(fullDataToHash);

  return computeRpkHashFromSerialized(
    serialized,
    options?.hashAlgorithm ?? 'cyrb53_16'
  );
}

/**
 * Generates all candidate serialized payload strings across initial v3 and intermediate v3 projections.
 */
function getCandidateV3SerializedProjections(rawPayload: AppDataState): string[] {
  const seen = new Set<string>();
  const addObj = (obj: unknown, canonicalize: boolean) => {
    const str = canonicalize
      ? JSON.stringify(canonicalizeForChecksum(obj))
      : JSON.stringify(obj);
    seen.add(str);
  };

  // Only allow omit_full_name projection if no student has a contradicted fullName vs firstName+lastName
  const allFullNamesConsistent = (rawPayload.students || []).every((s) => {
    if (!s.fullName) return true;
    if (!s.firstName && !s.lastName) return true;
    const expectedFull = `${s.firstName?.trim() || ''} ${s.lastName?.trim() || ''}`.trim();
    return s.fullName.trim() === expectedFull;
  });

  const payloadCandidates: AppDataState[] = [rawPayload];

  for (const candidatePayload of payloadCandidates) {
    // 1. Direct raw payload and normalized payload
    addObj(candidatePayload, true);
    addObj(candidatePayload, false);
    addObj(
      {
        classrooms: candidatePayload.classrooms || [],
        students: candidatePayload.students || [],
        rubrics: candidatePayload.rubrics || [],
        sessions: candidatePayload.sessions || [],
      },
      true
    );
    addObj(
      {
        classrooms: candidatePayload.classrooms || [],
        students: candidatePayload.students || [],
        rubrics: candidatePayload.rubrics || [],
        sessions: candidatePayload.sessions || [],
      },
      false
    );

    // 2. Targeted Initial v3 (Turn 1) and Audit #2 projections
    const rubricModes: NonNullable<LegacyRpkChecksumOptions['rubricFields']>[] = [
      'v3_latest',
      'v3_with_version_created',
      'v3_without_maxpoints_required',
      'v3_turn1_minimal',
    ];
    const studentModes: NonNullable<LegacyRpkChecksumOptions['studentFields']>[] =
      allFullNamesConsistent
        ? [
            'with_full_name',
            'omit_full_name',
            'only_full_name',
            'v3_turn1_no_archived',
            'v3_turn1_only_full_name_no_archived',
          ]
        : [
            'with_full_name',
            'only_full_name',
            'v3_turn1_no_archived',
            'v3_turn1_only_full_name_no_archived',
          ];
    const groupModes: NonNullable<LegacyRpkChecksumOptions['groupFields']>[] = [
      'v3_latest',
      'v3_without_last_applied',
      'v3_initial_minimal',
      'v3_turn1_original',
    ];
    const evalModes: NonNullable<LegacyRpkChecksumOptions['evaluationFields']>[] = [
      'v3_latest',
      'v3_with_updated_at',
      'v3_without_group_id',
      'v3_without_group_direct',
      'v3_audit2_exact',
      'v3_initial_minimal',
      'v3_turn1_original',
      'raw_record',
    ];
    const sessionModes: NonNullable<LegacyRpkChecksumOptions['sessionFields']>[] = [
      'v3_with_extras',
      'v3_standard',
      'v3_turn1_no_general_note',
    ];

    // Core initial v3 / Turn 1 combinations across all rubric modes
    for (const rubricFields of rubricModes) {
      for (const studentFields of studentModes) {
        for (const sessionFields of sessionModes) {
          for (const sortScoreMaps of [false, true]) {
            const turn1Proj = buildLegacyV3DataProjection(candidatePayload, {
              studentFields,
              rubricFields,
              groupFields: 'v3_turn1_original',
              evaluationFields: 'v3_turn1_original',
              sessionFields,
              includeAuditAndUndo: false,
              sortScoreMaps,
            });
            addObj(turn1Proj, sortScoreMaps);

            const audit2Proj = buildLegacyV3DataProjection(candidatePayload, {
              studentFields,
              rubricFields,
              groupFields: 'v3_initial_minimal',
              evaluationFields: 'v3_audit2_exact',
              sessionFields,
              includeAuditAndUndo: false,
              sortScoreMaps,
            });
            addObj(audit2Proj, sortScoreMaps);
          }
        }
      }
    }

    // Matrix of intermediate v3 structural projections
    for (const studentFields of studentModes) {
      for (const rubricFields of [
        'v3_latest',
        'v3_with_version_created',
      ] as const) {
        for (const groupFields of groupModes) {
          for (const evaluationFields of evalModes) {
            for (const sessionFields of sessionModes) {
              for (const includeAuditAndUndo of [false, true]) {
                for (const sortScoreMaps of [false, true]) {
                  const proj = buildLegacyV3DataProjection(candidatePayload, {
                    studentFields,
                    rubricFields,
                    groupFields,
                    evaluationFields,
                    sessionFields,
                    includeAuditAndUndo,
                    sortScoreMaps,
                  });
                  addObj(proj, sortScoreMaps);
                }
              }
            }
          }
        }
      }
    }
  }

  return Array.from(seen);
}

const ALL_LEGACY_RPK_ALGORITHMS: LegacyRpkHashAlgorithm[] = [
  'cyrb53_16',
  'cyrb53_no_len_16',
  'dual_fnv1a_djb2_16',
  'fnv1a_8',
  'fnv1a_float_8',
  'fnv1_8',
  'djb2_8',
  'djb2_add_8',
  'java31_8',
  'sdbm_8',
  'cyrb53_8',
  'fnv1a_base36',
  'djb2_base36',
  'fnv1a_len_hex',
];

function verifyLegacyRpkV3Checksum(
  rawPayload: AppDataState,
  checksum: string
): boolean {
  const normalizedChecksum = checksum.trim().toLowerCase();
  if (!/^rpk-[0-9a-z-]{5,28}$/.test(normalizedChecksum)) {
    return false;
  }

  const candidateSerializations = getCandidateV3SerializedProjections(rawPayload);

  for (const serialized of candidateSerializations) {
    for (const algo of ALL_LEGACY_RPK_ALGORITHMS) {
      if (
        normalizedChecksum === computeRpkHashFromSerialized(serialized, algo)
      ) {
        return true;
      }
    }
  }

  return false;
}

function verifySha256V3Checksum(
  rawPayload: AppDataState,
  checksum: string
): { valid: boolean; upgradedFromEarlierSha256: boolean } {
  const normalizedChecksum = checksum.trim().toLowerCase();
  if (!/^sha256-[0-9a-f]{64}$/.test(normalizedChecksum)) {
    return { valid: false, upgradedFromEarlierSha256: false };
  }

  const currentExpected = computePayloadChecksum(rawPayload).toLowerCase();
  if (normalizedChecksum === currentExpected) {
    return { valid: true, upgradedFromEarlierSha256: false };
  }

  // Also check earlier v3 SHA-256 projections (e.g. before lastAppliedAt / groupId / spread fields were added)
  const candidateSerializations = getCandidateV3SerializedProjections(rawPayload);
  for (const serialized of candidateSerializations) {
    if (normalizedChecksum === `sha256-${sha256Hex(serialized)}`) {
      return { valid: true, upgradedFromEarlierSha256: true };
    }
  }

  return { valid: false, upgradedFromEarlierSha256: false };
}

/**
 * Validates the complete structural integrity of an AppDataState object,
 * including nested criteria/levels, student auditLog entries, and session evaluations/groups/undoHistory.
 */
export function validateFullAppDataStructure(payload: unknown): {
  isValid: boolean;
  error?: string;
} {
  if (!payload || typeof payload !== 'object') {
    return { isValid: false, error: 'Veri yapısı geçersiz bir nesne.' };
  }

  const p = payload as Record<string, unknown>;
  if (
    !Array.isArray(p.classrooms) ||
    !Array.isArray(p.students) ||
    !Array.isArray(p.rubrics) ||
    !Array.isArray(p.sessions)
  ) {
    return {
      isValid: false,
      error: 'Yedek dosyası eksik: Sınıflar, öğrenciler, rubrikler veya oturumlar dizi formatında değil.',
    };
  }

  if (
    p.classrooms.length > 500 ||
    p.students.length > 20000 ||
    p.rubrics.length > 1000 ||
    p.sessions.length > 5000
  ) {
    return {
      isValid: false,
      error: 'Yedek dosyasındaki kayıt sayısı güvenli sınırları aşıyor.',
    };
  }

  const isValidScoreMap = (map: unknown): boolean => {
    if (map === undefined || map === null) return true;
    if (typeof map !== 'object' || Array.isArray(map)) return false;
    for (const val of Object.values(map as Record<string, unknown>)) {
      if (val === null || val === undefined) continue;
      if (
        typeof val !== 'number' ||
        !Number.isFinite(val) ||
        val < 0 ||
        val > 1000
      ) {
        return false;
      }
    }
    return true;
  };

  for (const cls of p.classrooms) {
    if (
      !cls ||
      typeof cls !== 'object' ||
      typeof (cls as Classroom).id !== 'string' ||
      typeof (cls as Classroom).name !== 'string' ||
      (cls as Classroom).name.length > 500
    ) {
      return { isValid: false, error: 'Sınıf kayıtlarından biri geçersiz veya eksik alan içeriyor.' };
    }
  }

  for (const stu of p.students) {
    if (
      !stu ||
      typeof stu !== 'object' ||
      typeof (stu as Student).id !== 'string' ||
      typeof (stu as Student).studentNumber !== 'string' ||
      typeof (stu as Student).fullName !== 'string' ||
      typeof (stu as Student).classId !== 'string' ||
      (stu as Student).fullName.length > 500 ||
      (stu as Student).studentNumber.length > 64
    ) {
      return { isValid: false, error: 'Öğrenci kayıtlarından biri geçersiz veya zorunlu alanları eksik.' };
    }
    const auditLog = (stu as Student).auditLog;
    if (auditLog !== undefined) {
      if (!Array.isArray(auditLog) || auditLog.length > 500) {
        return { isValid: false, error: 'Öğrenci denetim geçmişi (auditLog) dizi formatında olmalıdır ve sınırları aşmamalıdır.' };
      }
      for (const entry of auditLog) {
        if (
          !entry ||
          typeof entry !== 'object' ||
          typeof entry.timestamp !== 'string' ||
          typeof entry.action !== 'string' ||
          typeof entry.details !== 'string' ||
          entry.details.length > 2000
        ) {
          return { isValid: false, error: 'Öğrenci denetim geçmişi (auditLog) kaydı bozuk.' };
        }
      }
    }
  }

  for (const rub of p.rubrics) {
    if (
      !rub ||
      typeof rub !== 'object' ||
      typeof (rub as Rubric).id !== 'string' ||
      typeof (rub as Rubric).title !== 'string' ||
      (rub as Rubric).title.length > 500 ||
      !Array.isArray((rub as Rubric).criteria) ||
      (rub as Rubric).criteria.length === 0 ||
      (rub as Rubric).criteria.length > 100
    ) {
      return { isValid: false, error: 'Rubrik kayıtlarından biri geçersiz veya ölçütleri eksik.' };
    }
    for (const crit of (rub as Rubric).criteria) {
      if (
        !crit ||
        typeof crit !== 'object' ||
        typeof crit.id !== 'string' ||
        typeof crit.title !== 'string' ||
        crit.title.length > 500 ||
        typeof crit.weight !== 'number' ||
        !Number.isFinite(crit.weight) ||
        crit.weight < 0 ||
        crit.weight > 1000 ||
        (crit.maxPoints !== undefined &&
          (typeof crit.maxPoints !== 'number' ||
            !Number.isFinite(crit.maxPoints) ||
            crit.maxPoints <= 0 ||
            crit.maxPoints > 1000)) ||
        !Array.isArray(crit.levels)
      ) {
        return { isValid: false, error: 'Rubrik ölçüt yapısı veya ağırlık/puan sınırları geçersiz.' };
      }
      for (const lvl of crit.levels) {
        if (
          !lvl ||
          typeof lvl !== 'object' ||
          typeof lvl.points !== 'number' ||
          !Number.isFinite(lvl.points) ||
          lvl.points < 0 ||
          lvl.points > 1000
        ) {
          return { isValid: false, error: 'Rubrik seviye puanı geçersiz veya negatif.' };
        }
      }
    }
  }

  for (const ses of p.sessions) {
    if (
      !ses ||
      typeof ses !== 'object' ||
      typeof (ses as EvaluationSession).id !== 'string' ||
      typeof (ses as EvaluationSession).title !== 'string' ||
      (ses as EvaluationSession).title.length > 500 ||
      typeof (ses as EvaluationSession).classId !== 'string' ||
      typeof (ses as EvaluationSession).rubricId !== 'string' ||
      !Array.isArray((ses as EvaluationSession).groups) ||
      typeof (ses as EvaluationSession).evaluations !== 'object' ||
      (ses as EvaluationSession).evaluations === null
    ) {
      return { isValid: false, error: 'Değerlendirme oturumu kayıtlarından biri bozuk veya eksik.' };
    }
    if (
      typeof (ses as EvaluationSession).generalSessionNote === 'string' &&
      (ses as EvaluationSession).generalSessionNote.length > 5000
    ) {
      return { isValid: false, error: 'Oturum genel gözlem notu uzunluk sınırını aşıyor.' };
    }
    for (const grp of (ses as EvaluationSession).groups) {
      if (
        !grp ||
        typeof grp !== 'object' ||
        typeof grp.id !== 'string' ||
        typeof grp.name !== 'string' ||
        grp.name.length > 500 ||
        !Array.isArray(grp.studentIds) ||
        !isValidScoreMap(grp.criterionScores) ||
        !isValidScoreMap(grp.directCriterionScores)
      ) {
        return { isValid: false, error: 'Oturum grup kaydı veya grup puan değerleri geçersiz.' };
      }
    }
    for (const ev of Object.values((ses as EvaluationSession).evaluations)) {
      if (!ev || typeof ev !== 'object') {
        return { isValid: false, error: 'Öğrenci değerlendirme kaydı geçersiz.' };
      }
      if (typeof ev.note === 'string' && ev.note.length > 5000) {
        return { isValid: false, error: 'Öğrenci gözlem notu uzunluk sınırını aşıyor.' };
      }
      if (
        !isValidScoreMap(ev.criterionScores) ||
        !isValidScoreMap(ev.directCriterionScores) ||
        !isValidScoreMap(ev.groupCriterionScores) ||
        !isValidScoreMap(ev.groupDirectScores)
      ) {
        return {
          isValid: false,
          error: 'Değerlendirme puan haritasında geçersiz (NaN, negatif veya sınır dışı) puan tespit edildi.',
        };
      }
    }
    const undoHistory = (ses as EvaluationSession).undoHistory;
    if (undoHistory !== undefined) {
      if (!Array.isArray(undoHistory) || undoHistory.length > 200) {
        return { isValid: false, error: 'Oturum geri alma geçmişi (undoHistory) dizi formatında olmalıdır ve sınırları aşmamalıdır.' };
      }
      for (const u of undoHistory) {
        if (
          !u ||
          typeof u !== 'object' ||
          typeof u.id !== 'string' ||
          typeof u.timestamp !== 'string' ||
          typeof u.description !== 'string' ||
          u.description.length > 1000 ||
          typeof u.previousEvaluations !== 'object' ||
          u.previousEvaluations === null
        ) {
          return { isValid: false, error: 'Oturum geri alma geçmişi (undoHistory) kaydı bozuk.' };
        }
        for (const prevEv of Object.values(u.previousEvaluations)) {
          if (
            !prevEv ||
            typeof prevEv !== 'object' ||
            !isValidScoreMap(prevEv.criterionScores) ||
            !isValidScoreMap(prevEv.directCriterionScores) ||
            !isValidScoreMap(prevEv.groupCriterionScores) ||
            !isValidScoreMap(prevEv.groupDirectScores)
          ) {
            return {
              isValid: false,
              error: 'Geri alma geçmişinde (undoHistory) geçersiz puan haritası tespit edildi.',
            };
          }
        }
      }
    }
  }

  return { isValid: true };
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
    } else if (ses.rubricId === LEGACY_BOOK_PRESENTATION_RUBRIC_ID) {
      snapshot = freezeRubricSnapshot(LEGACY_BOOK_PRESENTATION_RUBRIC);
    } else if (ses.rubricId === LITERARY_BOOK_PRESENTATION_RUBRIC_ID) {
      snapshot = freezeRubricSnapshot(LEGACY_V3_LITERARY_BOOK_RUBRIC);
    } else if (ses.rubricId === INFORMATIVE_BOOK_PRESENTATION_RUBRIC_ID) {
      snapshot = freezeRubricSnapshot(LEGACY_V3_INFORMATIVE_BOOK_RUBRIC);
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

      const nextIndividualScores = { ...(rawEv.criterionScores || {}) };
      let nextGroupScores = hasExplicitGroupScores
        ? { ...rawEv.groupCriterionScores }
        : undefined;
      let nextGroupNote = rawEv.groupNote;
      const nextGroupId = rawEv.groupId || memberGroup?.id;
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
 * Creates a verifiable v3 backup bundle with schema version, timestamp, and mandatory SHA-256 checksum (P0 #6 & P1).
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
 * Strictly validates a v3 backup JSON string:
 * - Checksum is MANDATORY (`sha256-...` or verified legacy v3 `rpk-...`). Any file missing `checksum` or using unverified format is rejected.
 * - Full data structure (`classrooms`, `students`, `auditLog`, `rubrics`, `sessions`, `undoHistory`) is validated.
 * - Checksum is verified against the raw payload BEFORE any normalization so tampering with ANY field is caught.
 * - Valid legacy `rpk-` v3 bundles are verified and flagged with `upgradedFromRpkChecksum: true` so callers can seamlessly re-sign with SHA-256.
 */
export function verifyAndParseBackupBundle(jsonString: string): {
  isValid: boolean;
  error?: string;
  state?: AppDataState;
  requiresLegacyImport?: boolean;
  upgradedFromRpkChecksum?: boolean;
} {
  if (typeof jsonString !== 'string' || !jsonString.trim()) {
    return {
      isValid: false,
      error: 'Yedek dosyası boş veya geçersiz.',
    };
  }

  if (jsonString.length > MAX_BACKUP_JSON_BYTES) {
    return {
      isValid: false,
      error: `Yedek dosyası boyutu güvenli sınırı (${Math.round(
        MAX_BACKUP_JSON_BYTES / (1024 * 1024)
      )} MB) aşıyor.`,
    };
  }

  try {
    const parsed = parseJsonSafelyWithoutPrototypePollution<
      Partial<VerifiedBackupBundle> & Partial<AppDataState>
    >(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return {
        isValid: false,
        error: 'Geçersiz yedek dosyası formatı.',
      };
    }

    const isWrapped = Boolean(
      parsed.payload && typeof parsed.payload === 'object'
    );
    const isLegacySchema =
      !isWrapped ||
      (typeof parsed.schemaVersion === 'number' &&
        parsed.schemaVersion < CURRENT_SCHEMA_VERSION);

    if (isLegacySchema) {
      return {
        isValid: false,
        requiresLegacyImport: true,
        error:
          'Bu dosya eski sürüm (v1/v2) veya sarmalanmamış bir yedektir. Doğrulanabilir v3 yedeklerde bütünlük imzası (checksum) zorunludur; eski yedekler için "Eski Sürüm (Checksumsız) Yedek Aktar" seçeneğini kullanın.',
      };
    }

    if (
      typeof parsed.checksum !== 'string' ||
      !parsed.checksum.trim() ||
      (!parsed.checksum.startsWith('sha256-') &&
        !parsed.checksum.startsWith('rpk-'))
    ) {
      return {
        isValid: false,
        requiresLegacyImport: true,
        error:
          'Yedek dosyasında zorunlu bütünlük imzası (checksum) bulunamadı veya geçersiz. Checksumsız dosyalar güvenlik nedeniyle reddedildi.',
      };
    }

    const rawPayload = parsed.payload as AppDataState;
    const structureCheck = validateFullAppDataStructure(rawPayload);
    if (!structureCheck.isValid) {
      return {
        isValid: false,
        error: structureCheck.error || 'Yedek veri yapısı doğrulaması başarısız.',
      };
    }

    if (parsed.checksum.startsWith('sha256-')) {
      const shaCheck = verifySha256V3Checksum(rawPayload, parsed.checksum);
      if (!shaCheck.valid) {
        return {
          isValid: false,
          error:
            'Yedek bütünlük doğrulaması (SHA-256 Checksum) başarısız: Puanlar, notlar, işlem geçmişi (undoHistory) veya denetim kayıtları (auditLog) değiştirilmiş ya da bozulmuş.',
        };
      }
      const normalized = migrateV2ToV3(rawPayload);
      return {
        isValid: true,
        state: normalized,
        upgradedFromRpkChecksum: shaCheck.upgradedFromEarlierSha256,
      };
    }

    // Legacy v3 `rpk-` checksum verification (backward compatibility for existing rubrikpad_state_v3 records)
    if (!verifyLegacyRpkV3Checksum(rawPayload, parsed.checksum)) {
      return {
        isValid: false,
        error:
          'Yedek bütünlük doğrulaması (rpk Checksum) başarısız: Puanlar, notlar veya kayıtlar değiştirilmiş ya da bozulmuş.',
      };
    }

    const normalized = migrateV2ToV3(rawPayload);
    return {
      isValid: true,
      state: normalized,
      upgradedFromRpkChecksum: true,
    };
  } catch {
    return {
      isValid: false,
      error: 'Yedek dosyası JSON olarak okunamadı.',
    };
  }
}

/**
 * Dedicated legacy import action for older (v1/v2) or checksumless backup files.
 * Keeps strict `verifyAndParseBackupBundle` completely separate from legacy unverified migration.
 */
export function importLegacyBackupBundle(jsonString: string): {
  isValid: boolean;
  error?: string;
  state?: AppDataState;
  migratedFromV2: boolean;
  newChecksum?: string;
} {
  if (typeof jsonString !== 'string' || !jsonString.trim()) {
    return {
      isValid: false,
      migratedFromV2: false,
      error: 'Eski sürüm yedek dosyası boş veya geçersiz.',
    };
  }

  if (jsonString.length > MAX_BACKUP_JSON_BYTES) {
    return {
      isValid: false,
      migratedFromV2: false,
      error: `Yedek dosyası boyutu güvenli sınırı (${Math.round(
        MAX_BACKUP_JSON_BYTES / (1024 * 1024)
      )} MB) aşıyor.`,
    };
  }

  try {
    const parsed = parseJsonSafelyWithoutPrototypePollution<
      Partial<VerifiedBackupBundle> & Partial<AppDataState>
    >(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return {
        isValid: false,
        migratedFromV2: false,
        error: 'Geçersiz eski sürüm yedek dosyası formatı.',
      };
    }

    const isWrapped = Boolean(
      parsed.payload && typeof parsed.payload === 'object'
    );
    const rawPayload = isWrapped
      ? parsed.payload!
      : {
          classrooms: parsed.classrooms,
          students: parsed.students,
          rubrics: parsed.rubrics,
          sessions: parsed.sessions,
        };

    // P1: If the legacy file carries ANY checksum (sha256- or rpk-), strictly verify it against the payload!
    if (
      parsed.checksum !== undefined &&
      parsed.checksum !== null &&
      String(parsed.checksum).trim() !== ''
    ) {
      if (typeof parsed.checksum !== 'string') {
        return {
          isValid: false,
          migratedFromV2: false,
          error: 'Dosyadaki bütünlük imzası (Checksum) geçersiz tipte.',
        };
      }
      const trimmedChecksum = parsed.checksum.trim();
      const preStructureCheck = validateFullAppDataStructure(rawPayload);
      if (!preStructureCheck.isValid) {
        return {
          isValid: false,
          migratedFromV2: false,
          error:
            preStructureCheck.error ||
            'Dosya veri yapısı doğrulaması başarısız.',
        };
      }

      if (trimmedChecksum.startsWith('sha256-')) {
        const computed = computePayloadChecksum(rawPayload as AppDataState);
        if (trimmedChecksum !== computed) {
          return {
            isValid: false,
            migratedFromV2: false,
            error:
              'Dosyadaki SHA-256 bütünlük imzası (Checksum) veri içeriğiyle eşleşmiyor.',
          };
        }
      } else if (trimmedChecksum.startsWith('rpk-')) {
        if (!verifyLegacyRpkV3Checksum(rawPayload as AppDataState, trimmedChecksum)) {
          return {
            isValid: false,
            migratedFromV2: false,
            error:
              'Dosyadaki eski sürüm (rpk-) bütünlük imzası veri içeriğiyle eşleşmiyor. Veri değiştirilmiş veya bozulmuş.',
          };
        }
      } else {
        return {
          isValid: false,
          migratedFromV2: false,
          error:
            'Dosyadaki bütünlük imzası (Checksum) formatı tanınmıyor veya geçersiz.',
        };
      }
    }

    const migrated = migrateV2ToV3(rawPayload);
    const structureCheck = validateFullAppDataStructure(migrated);
    if (!structureCheck.isValid) {
      return {
        isValid: false,
        migratedFromV2: false,
        error:
          structureCheck.error ||
          'Eski sürüm yedek dosyası v3 şemasına dönüştürülürken eksik veri tespit edildi.',
      };
    }

    return {
      isValid: true,
      state: migrated,
      migratedFromV2: true,
      newChecksum: computePayloadChecksum(migrated),
    };
  } catch {
    return {
      isValid: false,
      migratedFromV2: false,
      error: 'Eski sürüm yedek dosyası JSON olarak okunamadı.',
    };
  }
}

/**
 * Creates a verifiable pre-upgrade rollback copy of an existing v3 record (e.g., before upgrading `rpk-` -> `sha256-`)
 * so the original unmodified v3 payload & checksum are preserved for recovery.
 */
function saveOriginalV3RollbackCopy(rawOriginalJson: string): boolean {
  memoryV3RollbackSnapshot = rawOriginalJson;
  let savedToLocal = false;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LEGACY_V3_ROLLBACK_KEY, rawOriginalJson);
      savedToLocal = true;
    } catch {
      savedToLocal = false;
    }
  } else {
    savedToLocal = true;
  }

  if (typeof indexedDB !== 'undefined' && !simulateIndexedDbFailure) {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (db.objectStoreNames.contains(IDB_STORE)) {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(rawOriginalJson, 'v3_rollback_backup');
          tx.oncomplete = () => db.close();
          tx.onerror = () => db.close();
        } else {
          db.close();
        }
      };
    } catch {
      // ignore async IDB rollback copy error
    }
  }

  return savedToLocal;
}

/**
 * Saves an automatic pre-reset rollback backup of the current state before resetting to demo seed data.
 */
export function savePreResetRollbackBackup(state: AppDataState): string {
  const bundle = createVerifiedBackupBundle(state);
  const rawJson = JSON.stringify(bundle);
  memoryPreResetBackupSnapshot = rawJson;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PRE_RESET_ROLLBACK_KEY, rawJson);
    } catch {
      // ignore quota error; memory & IndexedDB copies still protect the backup
    }
  }

  if (typeof indexedDB !== 'undefined' && !simulateIndexedDbFailure) {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (db.objectStoreNames.contains(IDB_STORE)) {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(rawJson, 'pre_reset_backup');
          tx.oncomplete = () => db.close();
          tx.onerror = () => db.close();
        } else {
          db.close();
        }
      };
    } catch {
      // ignore
    }
  }

  return bundle.checksum;
}

/**
 * Archives the non-winning bundle during a localStorage <-> IndexedDB or multi-tab version conflict
 * so neither version is ever lost.
 */
function saveConflictBackupCopy(rawLoserJson: string): void {
  memoryConflictBackupSnapshot = rawLoserJson;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_CONFLICT_BACKUP_KEY, rawLoserJson);
    } catch {
      // ignore quota error
    }
  }
  if (typeof indexedDB !== 'undefined' && !simulateIndexedDbFailure) {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (db.objectStoreNames.contains(IDB_STORE)) {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(rawLoserJson, 'conflict_backup');
          tx.oncomplete = () => db.close();
          tx.onerror = () => db.close();
        } else {
          db.close();
        }
      };
    } catch {
      // ignore
    }
  }
}

/**
 * Quarantines a corrupted IndexedDB record without overwriting the original IndexedDB record.
 */
function quarantineCorruptedIndexedDbRecord(rawCorruptedJson: string): void {
  memoryIndexedDbQuarantineSnapshot = rawCorruptedJson;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(INDEXEDDB_QUARANTINE_KEY, rawCorruptedJson);
    } catch {
      // ignore
    }
  }
  if (typeof indexedDB !== 'undefined' && !simulateIndexedDbFailure) {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (db.objectStoreNames.contains(IDB_STORE)) {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(rawCorruptedJson, 'quarantine_corrupted_v3');
          tx.oncomplete = () => db.close();
          tx.onerror = () => db.close();
        } else {
          db.close();
        }
      };
    } catch {
      // ignore
    }
  }
}

/**
 * Saves state transactionally into IndexedDB + verified localStorage snapshot.
 * - P0: Refuses to overwrite corrupted localStorage/IndexedDB records with fallback seed data
 *   while `storageWriteLockedDueToCorruption` is active, unless `forceUnlockCorruptionLock: true` is passed.
 * - Multi-tab / Concurrent Write Guard: If `expectedPreviousChecksum` is provided and `localStorage`
 *   contains a valid v3 state with a different checksum, archives the external state to `STORAGE_CONFLICT_BACKUP_KEY`
 *   and (when `strictOptimisticLock: true`) aborts the overwrite so concurrent tab changes are never lost.
 * - Quota Auto-Healing: If `localStorage.setItem` fails due to quota limits, evicts auxiliary backup keys
 *   from `localStorage` (while keeping them in IndexedDB/memory) and retries saving the primary state.
 */
export async function saveTransactionalState(
  state: AppDataState,
  options?: {
    onSaveError?: (errorMessage: string, errors: string[]) => void;
    forceUnlockCorruptionLock?: boolean;
    expectedPreviousChecksum?: string;
    strictOptimisticLock?: boolean;
  }
): Promise<TransactionalSaveResult> {
  if (options?.forceUnlockCorruptionLock) {
    storageWriteLockedDueToCorruption = false;
  }

  const bundle = createVerifiedBackupBundle(state);

  if (storageWriteLockedDueToCorruption) {
    const lockMsg =
      'Depolama alanında (localStorage veya IndexedDB) doğrulanamayan/bozuk veri tespit edildiği için mevcut kayıtların üzerine örnek veri yazılması engellendi.';
    const errors = [lockMsg];
    if (options?.onSaveError) {
      options.onSaveError(lockMsg, errors);
    }
    return {
      ok: false,
      localStorageSaved: false,
      indexedDbSaved: false,
      checksum: bundle.checksum,
      errors,
      errorMessage: lockMsg,
    };
  }

  let conflictDetected = false;
  let conflictBackupKey: string | undefined;

  // Multi-tab / optimistic concurrency check before overwriting localStorage
  if (
    options?.expectedPreviousChecksum &&
    typeof localStorage !== 'undefined'
  ) {
    try {
      const currentRaw = localStorage.getItem(STORAGE_KEY);
      if (currentRaw) {
        const parsedCurrent = parseJsonSafelyWithoutPrototypePollution<{
          checksum?: string;
        }>(currentRaw);
        const diskChecksum =
          typeof parsedCurrent?.checksum === 'string'
            ? parsedCurrent.checksum.trim()
            : '';
        if (
          diskChecksum &&
          diskChecksum !== options.expectedPreviousChecksum &&
          diskChecksum !== bundle.checksum
        ) {
          const verifiedDisk = verifyAndParseBackupBundle(currentRaw);
          if (verifiedDisk.isValid) {
            conflictDetected = true;
            conflictBackupKey = STORAGE_CONFLICT_BACKUP_KEY;
            saveConflictBackupCopy(currentRaw);
            if (options.strictOptimisticLock) {
              const conflictMsg =
                'Başka bir sekmede veya pencerede daha yeni bir değişiklik algılandı. Veri kaybını önlemek için önceki sürüm çakışma yedeğine (rubrikpad_state_v3_conflict_backup) alındı ve üzerine yazma engellendi.';
              const errors = [conflictMsg];
              if (options.onSaveError) {
                options.onSaveError(conflictMsg, errors);
              }
              return {
                ok: false,
                localStorageSaved: false,
                indexedDbSaved: false,
                checksum: bundle.checksum,
                conflictDetected: true,
                conflictBackupKey,
                errors,
                errorMessage: conflictMsg,
              };
            }
          }
        }
      }
    } catch {
      // ignore read errors during optimistic check
    }
  }

  const serialized = JSON.stringify(bundle);
  const errors: string[] = [];
  let localStorageSaved = false;
  let indexedDbSaved = false;
  let quotaHealedByEviction = false;

  // 1. Save to localStorage (with automatic auxiliary-key eviction retry on QuotaExceededError)
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorageSaved = true;
    } catch (err) {
      // Attempt to free localStorage quota by evicting non-primary backup keys (preserved in memory/IndexedDB)
      try {
        localStorage.removeItem(LEGACY_V3_ROLLBACK_KEY);
        localStorage.removeItem(STORAGE_CONFLICT_BACKUP_KEY);
        localStorage.removeItem(PRE_RESET_ROLLBACK_KEY);
        localStorage.setItem(STORAGE_KEY, serialized);
        localStorageSaved = true;
        quotaHealedByEviction = true;
      } catch (retryErr) {
        const detail =
          retryErr instanceof Error
            ? retryErr.message
            : err instanceof Error
            ? err.message
            : 'Kota veya erişim hatası';
        errors.push(
          `Yerel depolama (localStorage) kaydı başarısız oldu (${detail}).`
        );
      }
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
    conflictDetected,
    conflictBackupKey,
    quotaHealedByEviction,
    errors,
    errorMessage,
  };
}

/**
 * Internal helper that reads and inspects the raw IndexedDB snapshot without mutating localStorage.
 */
async function inspectIndexedDbState(): Promise<{
  hasRecord: boolean;
  isValid: boolean;
  corrupted: boolean;
  rawJson: string | null;
  exportedAt?: string;
  state?: AppDataState;
  upgradedFromRpkChecksum?: boolean;
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

      if (idbRecord !== null && idbRecord !== undefined) {
        rawBundleJson =
          typeof idbRecord === 'string' ? idbRecord : JSON.stringify(idbRecord);
      }
    } catch {
      // Fall back to memoryIndexedDbSnapshot if available
    }
  }

  if (rawBundleJson === null && memoryIndexedDbSnapshot !== null) {
    rawBundleJson = memoryIndexedDbSnapshot;
  }

  if (rawBundleJson === null) {
    return {
      hasRecord: false,
      isValid: false,
      corrupted: false,
      rawJson: null,
      error: 'IndexedDB deposunda kurtarılacak kayıt bulunamadı.',
    };
  }

  const verified = verifyAndParseBackupBundle(rawBundleJson);
  if (!verified.isValid || !verified.state) {
    quarantineCorruptedIndexedDbRecord(rawBundleJson);
    return {
      hasRecord: true,
      isValid: false,
      corrupted: true,
      rawJson: rawBundleJson,
      error: verified.error || 'IndexedDB kaydı bozuk veya doğrulanamadı.',
    };
  }

  let exportedAt: string | undefined;
  try {
    const parsedMeta = JSON.parse(rawBundleJson) as { exportedAt?: string };
    if (typeof parsedMeta.exportedAt === 'string') {
      exportedAt = parsedMeta.exportedAt;
    }
  } catch {
    // ignore
  }

  return {
    hasRecord: true,
    isValid: true,
    corrupted: false,
    rawJson: rawBundleJson,
    exportedAt,
    state: verified.state,
    upgradedFromRpkChecksum: Boolean(verified.upgradedFromRpkChecksum),
  };
}

/**
 * Reads and verifies the latest transactional backup from IndexedDB, automatically healing localStorage if valid.
 * If IndexedDB contains corrupted data, quarantines it and locks storage writes so seed data cannot overwrite it.
 */
export async function recoverStateFromIndexedDB(): Promise<{
  recovered: boolean;
  indexedDbCorrupted?: boolean;
  state?: AppDataState;
  checksum?: string;
  upgradedFromRpkChecksum?: boolean;
  rollbackBackupKey?: string;
  error?: string;
}> {
  const inspected = await inspectIndexedDbState();
  if (!inspected.hasRecord) {
    return {
      recovered: false,
      indexedDbCorrupted: false,
      error: inspected.error,
    };
  }

  if (!inspected.isValid || !inspected.state) {
    storageWriteLockedDueToCorruption = true;
    return {
      recovered: false,
      indexedDbCorrupted: true,
      error: inspected.error || 'IndexedDB kaydı doğrulanamadı.',
    };
  }

  let rollbackBackupKey: string | undefined;
  if (inspected.upgradedFromRpkChecksum && inspected.rawJson) {
    saveOriginalV3RollbackCopy(inspected.rawJson);
    rollbackBackupKey = LEGACY_V3_ROLLBACK_KEY;
  }

  storageWriteLockedDueToCorruption = false;

  // Heal localStorage with the verified IndexedDB bundle
  const healedBundle = createVerifiedBackupBundle(inspected.state);
  const healedSerialized = JSON.stringify(healedBundle);
  memoryIndexedDbSnapshot = healedSerialized;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, healedSerialized);
    } catch {
      // ignore if localStorage is still full
    }
  }

  return {
    recovered: true,
    indexedDbCorrupted: false,
    state: inspected.state,
    checksum: healedBundle.checksum,
    upgradedFromRpkChecksum: inspected.upgradedFromRpkChecksum,
    rollbackBackupKey,
  };
}

/**
 * Extracts the latest valid timestamp (ms since epoch) from a bundle and its nested evaluations/auditLogs/undoHistory
 * for deterministic conflict resolution between localStorage and IndexedDB.
 */
function getLatestStateActivityMs(
  exportedAtIso: string | undefined,
  state: AppDataState
): number {
  let maxMs = 0;
  const considerIso = (iso?: string | null) => {
    if (!iso || typeof iso !== 'string') return;
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && t > maxMs) {
      maxMs = t;
    }
  };

  considerIso(exportedAtIso);
  for (const stu of state.students || []) {
    considerIso(stu.updatedAt);
    for (const log of stu.auditLog || []) {
      considerIso(log.timestamp);
    }
  }
  for (const ses of state.sessions || []) {
    for (const grp of ses.groups || []) {
      considerIso(grp.lastAppliedAt);
    }
    for (const ev of Object.values(ses.evaluations || {})) {
      considerIso(ev.updatedAt);
    }
    for (const u of ses.undoHistory || []) {
      considerIso(u.timestamp);
    }
  }
  return maxMs;
}

/**
 * Secondary tie-breaker for conflict resolution when timestamps are identical:
 * counts total assigned scores, notes, sessions, and students.
 */
function getStateCompletenessScore(state: AppDataState): number {
  let score = 0;
  score += (state.classrooms || []).length * 2;
  score += (state.students || []).length * 5;
  score += (state.sessions || []).length * 10;
  for (const ses of state.sessions || []) {
    if (ses.generalSessionNote?.trim()) score += 3;
    for (const grp of ses.groups || []) {
      score += Object.values(grp.criterionScores || {}).filter(isScoreAssigned).length * 4;
      if (grp.groupNote?.trim()) score += 2;
    }
    for (const ev of Object.values(ses.evaluations || {})) {
      score += Object.values(ev.criterionScores || {}).filter(isScoreAssigned).length * 4;
      score += Object.values(ev.directCriterionScores || {}).filter(isScoreAssigned).length * 4;
      score += Object.values(ev.groupCriterionScores || {}).filter(isScoreAssigned).length * 2;
      if (ev.note?.trim()) score += 3;
      if (ev.groupNote?.trim()) score += 2;
    }
    score += (ses.undoHistory || []).length;
  }
  return score;
}

/**
 * Synchronously loads and verifies state from localStorage (v3 SHA-256, legacy v3 rpk-, or migrated v2).
 * P1: Before upgrading a valid legacy `rpk-` v3 bundle to `sha256-` in-place, creates an untouched rollback copy
 * under `rubrikpad_state_v3_rollback_backup` (`LEGACY_V3_ROLLBACK_KEY`).
 */
export function loadVerifiedInitialStateWithMeta(fallbackSeed: AppDataState): {
  state: AppDataState;
  source: 'localStorage_v3' | 'migrated_v2' | 'seed_fallback';
  localStorageCorrupted: boolean;
  upgradedFromRpkChecksum?: boolean;
  rollbackBackupKey?: string;
  originalRawJson?: string;
  originalExportedAt?: string;
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
          let originalExportedAt: string | undefined;
          try {
            const parsedMeta = JSON.parse(savedV3) as { exportedAt?: string };
            if (typeof parsedMeta.exportedAt === 'string') {
              originalExportedAt = parsedMeta.exportedAt;
            }
          } catch {
            // ignore
          }

          let rollbackBackupKey: string | undefined;
          if (verified.upgradedFromRpkChecksum) {
            // P1: Always create an original rollback copy BEFORE updating the v3 record in-place!
            const rollbackSaved = saveOriginalV3RollbackCopy(savedV3);
            if (rollbackSaved) {
              rollbackBackupKey = LEGACY_V3_ROLLBACK_KEY;
              const upgradedBundle: VerifiedBackupBundle = {
                schemaVersion: CURRENT_SCHEMA_VERSION,
                exportedAt: originalExportedAt || new Date().toISOString(),
                checksum: computePayloadChecksum(verified.state),
                payload: verified.state,
              };
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(upgradedBundle));
              } catch {
                // ignore quota error during in-place checksum upgrade
              }
            }
          }
          return {
            state: verified.state,
            source: 'localStorage_v3',
            localStorageCorrupted: false,
            upgradedFromRpkChecksum: Boolean(verified.upgradedFromRpkChecksum),
            rollbackBackupKey,
            originalRawJson: savedV3,
            originalExportedAt,
          };
        } else {
          // Quarantine the raw unverified localStorage string so it is never lost
          try {
            localStorage.setItem(LOCALSTORAGE_QUARANTINE_KEY, savedV3);
          } catch {
            // ignore
          }
          localStorageCorrupted = true;
          storageWriteLockedDueToCorruption = true;
          corruptionError = verified.error;
        }
      }

      // Check for legacy v2 / v1 data in localStorage and migrate automatically (only if v3 wasn't corrupted)
      if (!localStorageCorrupted) {
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
      }
    } catch {
      localStorageCorrupted = true;
      storageWriteLockedDueToCorruption = true;
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
 * Full asynchronous initialization with:
 * 1. Automatic IndexedDB recovery when localStorage is empty or corrupted.
 * 2. Safe version conflict detection & resolution between localStorage and IndexedDB (archiving the losing version in `rubrikpad_state_v3_conflict_backup`).
 * 3. Write-lock protection when IndexedDB or localStorage contains corrupted data so fallback seed data NEVER overwrites user storage.
 */
export async function loadInitialStateWithRecovery(
  fallbackSeed: AppDataState
): Promise<{
  state: AppDataState;
  source:
    | 'localStorage_v3'
    | 'migrated_v2'
    | 'indexeddb_recovered'
    | 'conflict_resolved_indexeddb'
    | 'conflict_resolved_localstorage'
    | 'seed_fallback';
  localStorageCorrupted?: boolean;
  indexedDbCorrupted?: boolean;
  writeLocked?: boolean;
  conflictDetected?: boolean;
  conflictWinner?: 'indexeddb' | 'localStorage';
  conflictBackupKey?: string;
  upgradedFromRpkChecksum?: boolean;
  rollbackBackupKey?: string;
  recoveryNotice?: string;
  error?: string;
}> {
  const syncResult = loadVerifiedInitialStateWithMeta(fallbackSeed);
  const idbInspect = await inspectIndexedDbState();

  // Case 1: Both localStorage and IndexedDB have valid v3 states -> check for version conflict!
  if (
    syncResult.source === 'localStorage_v3' &&
    idbInspect.hasRecord &&
    idbInspect.isValid &&
    idbInspect.state
  ) {
    if (idbInspect.upgradedFromRpkChecksum && idbInspect.rawJson) {
      saveOriginalV3RollbackCopy(idbInspect.rawJson);
    }

    const localChecksum = computePayloadChecksum(syncResult.state);
    const idbChecksum = computePayloadChecksum(idbInspect.state);

    storageWriteLockedDueToCorruption = false;

    if (localChecksum === idbChecksum) {
      // Both stores are in sync; ensure IndexedDB also has the upgraded SHA-256 bundle if needed
      if (syncResult.upgradedFromRpkChecksum || idbInspect.upgradedFromRpkChecksum) {
        await saveTransactionalState(syncResult.state, {
          forceUnlockCorruptionLock: true,
        });
      }
      return {
        state: syncResult.state,
        source: 'localStorage_v3',
        localStorageCorrupted: false,
        indexedDbCorrupted: false,
        writeLocked: false,
        conflictDetected: false,
        upgradedFromRpkChecksum: Boolean(
          syncResult.upgradedFromRpkChecksum || idbInspect.upgradedFromRpkChecksum
        ),
        rollbackBackupKey:
          syncResult.rollbackBackupKey ||
          (idbInspect.upgradedFromRpkChecksum ? LEGACY_V3_ROLLBACK_KEY : undefined),
        recoveryNotice:
          syncResult.upgradedFromRpkChecksum || idbInspect.upgradedFromRpkChecksum
            ? 'Mevcut v3 verileriniz (rpk- imzalı) doğrulandı, orijinal geri dönüş kopyası oluşturuldu ve yeni SHA-256 bütünlük imzasına yükseltildi.'
            : undefined,
      };
    }

    // Conflict detected between localStorage and IndexedDB!
    const localTimeMs = getLatestStateActivityMs(
      syncResult.originalExportedAt,
      syncResult.state
    );
    const idbTimeMs = getLatestStateActivityMs(
      idbInspect.exportedAt,
      idbInspect.state
    );

    let winner: 'indexeddb' | 'localStorage';
    if (idbTimeMs !== localTimeMs) {
      winner = idbTimeMs > localTimeMs ? 'indexeddb' : 'localStorage';
    } else {
      const localCompleteness = getStateCompletenessScore(syncResult.state);
      const idbCompleteness = getStateCompletenessScore(idbInspect.state);
      if (idbCompleteness !== localCompleteness) {
        winner = idbCompleteness > localCompleteness ? 'indexeddb' : 'localStorage';
      } else {
        winner =
          syncResult.upgradedFromRpkChecksum && !idbInspect.upgradedFromRpkChecksum
            ? 'indexeddb'
            : !syncResult.upgradedFromRpkChecksum && idbInspect.upgradedFromRpkChecksum
            ? 'localStorage'
            : 'indexeddb';
      }
    }

    const winningState =
      winner === 'indexeddb' ? idbInspect.state : syncResult.state;
    const losingRawJson =
      winner === 'indexeddb'
        ? syncResult.originalRawJson ||
          JSON.stringify(createVerifiedBackupBundle(syncResult.state))
        : idbInspect.rawJson ||
          JSON.stringify(createVerifiedBackupBundle(idbInspect.state));

    // Archive the losing snapshot BEFORE syncing both stores
    saveConflictBackupCopy(losingRawJson);
    await saveTransactionalState(winningState, {
      forceUnlockCorruptionLock: true,
    });

    return {
      state: winningState,
      source:
        winner === 'indexeddb'
          ? 'conflict_resolved_indexeddb'
          : 'conflict_resolved_localstorage',
      localStorageCorrupted: false,
      indexedDbCorrupted: false,
      writeLocked: false,
      conflictDetected: true,
      conflictWinner: winner,
      conflictBackupKey: STORAGE_CONFLICT_BACKUP_KEY,
      upgradedFromRpkChecksum: Boolean(
        syncResult.upgradedFromRpkChecksum || idbInspect.upgradedFromRpkChecksum
      ),
      recoveryNotice:
        winner === 'indexeddb'
          ? 'localStorage ile IndexedDB arasında sürüm farkı tespit edildi. Daha güncel olan IndexedDB verisi yüklendi; diğer sürüm rubrikpad_state_v3_conflict_backup anahtarına yedeklendi.'
          : 'localStorage ile IndexedDB arasında sürüm farkı tespit edildi. Daha güncel olan localStorage verisi yüklendi; diğer sürüm rubrikpad_state_v3_conflict_backup anahtarına yedeklendi.',
    };
  }

  // Case 2: localStorage has valid v3 data, and IndexedDB is either empty or corrupted
  if (syncResult.source === 'localStorage_v3') {
    storageWriteLockedDueToCorruption = false;
    await saveTransactionalState(syncResult.state, {
      forceUnlockCorruptionLock: true,
    });
    return {
      state: syncResult.state,
      source: 'localStorage_v3',
      localStorageCorrupted: false,
      indexedDbCorrupted: idbInspect.corrupted,
      writeLocked: false,
      upgradedFromRpkChecksum: syncResult.upgradedFromRpkChecksum,
      rollbackBackupKey: syncResult.rollbackBackupKey,
      recoveryNotice: idbInspect.corrupted
        ? 'IndexedDB kaydı bozulmuştu; karantinaya alınarak doğrulanmış localStorage verisiyle onarıldı.'
        : syncResult.upgradedFromRpkChecksum
        ? 'Mevcut v3 verileriniz (rpk- imzalı) doğrulandı, orijinal geri dönüş kopyası oluşturuldu ve yeni SHA-256 bütünlük imzasına yükseltildi.'
        : undefined,
    };
  }

  // Case 3: localStorage had legacy v2 data, but check if IndexedDB actually has a valid v3 state first!
  if (syncResult.source === 'migrated_v2') {
    if (idbInspect.hasRecord && idbInspect.isValid && idbInspect.state) {
      saveConflictBackupCopy(
        JSON.stringify(createVerifiedBackupBundle(syncResult.state))
      );
      storageWriteLockedDueToCorruption = false;
      await saveTransactionalState(idbInspect.state, {
        forceUnlockCorruptionLock: true,
      });
      return {
        state: idbInspect.state,
        source: 'conflict_resolved_indexeddb',
        conflictDetected: true,
        conflictWinner: 'indexeddb',
        conflictBackupKey: STORAGE_CONFLICT_BACKUP_KEY,
        recoveryNotice:
          'IndexedDB üzerinde daha yeni v3 kayıtları bulunduğu için IndexedDB verisi yüklendi; eski v2 verisi çakışma yedeğine alındı.',
      };
    }
    storageWriteLockedDueToCorruption = false;
    await saveTransactionalState(syncResult.state, {
      forceUnlockCorruptionLock: true,
    });
    return {
      state: syncResult.state,
      source: 'migrated_v2',
      localStorageCorrupted: false,
      indexedDbCorrupted: idbInspect.corrupted,
      writeLocked: false,
      recoveryNotice:
        'Önceki sürüm (v2) verileriniz otomatik olarak v3 veri yapısına yükseltildi ve korundu.',
    };
  }

  // Case 4: localStorage was empty or corrupted -> attempt recovery from IndexedDB!
  if (idbInspect.hasRecord && idbInspect.isValid && idbInspect.state) {
    let rollbackBackupKey: string | undefined;
    if (idbInspect.upgradedFromRpkChecksum && idbInspect.rawJson) {
      saveOriginalV3RollbackCopy(idbInspect.rawJson);
      rollbackBackupKey = LEGACY_V3_ROLLBACK_KEY;
    }
    storageWriteLockedDueToCorruption = false;
    await saveTransactionalState(idbInspect.state, {
      forceUnlockCorruptionLock: true,
    });
    return {
      state: idbInspect.state,
      source: 'indexeddb_recovered',
      localStorageCorrupted: syncResult.localStorageCorrupted,
      indexedDbCorrupted: false,
      writeLocked: false,
      upgradedFromRpkChecksum: idbInspect.upgradedFromRpkChecksum,
      rollbackBackupKey,
      recoveryNotice: syncResult.localStorageCorrupted
        ? 'Yerel önbellek (localStorage) bozulmuştu; tüm puan ve notlarınız işlemsel IndexedDB deposundan otomatik olarak kurtarıldı.'
        : 'Yerel önbellek bulunamadı; verileriniz işlemsel IndexedDB deposundan otomatik olarak geri yüklendi.',
    };
  }

  // Case 5: Neither store had valid data. If EITHER localStorage OR IndexedDB had corrupted data,
  // lock storage writes so seed data NEVER overwrites the corrupted records!
  const anyCorrupted = Boolean(
    syncResult.localStorageCorrupted || idbInspect.corrupted
  );
  if (anyCorrupted) {
    storageWriteLockedDueToCorruption = true;
  }

  return {
    state: syncResult.state,
    source: 'seed_fallback',
    localStorageCorrupted: syncResult.localStorageCorrupted,
    indexedDbCorrupted: idbInspect.corrupted,
    writeLocked: anyCorrupted,
    error: idbInspect.error || syncResult.error,
  };
}

const SYNTHETIC_CLASSROOM_IDS = new Set(['cls-7a', 'cls-8b', 'cls-6c']);
const SYNTHETIC_STUDENT_IDS = new Set([
  'stu-101',
  'stu-102',
  'stu-103',
  'stu-104',
  'stu-105',
  'stu-106',
  'stu-107',
  'stu-108',
  'stu-201',
  'stu-202',
  'stu-203',
  'stu-204',
  'stu-205',
  'stu-301',
  'stu-302',
  'stu-303',
  'stu-304',
]);
const SYNTHETIC_RUBRIC_IDS = new Set([
  'rub-lab',
  'rub-pres',
  'rub-group',
  'rub-stem-8',
]);
const SYNTHETIC_SESSION_IDS = new Set([
  'ses-hist-1',
  'ses-hist-2',
  'ses-active-3',
]);

export function stripSyntheticSeedEntities(state: AppDataState): {
  cleaned: AppDataState;
  hadSynthetic: boolean;
} {
  const classrooms = (state.classrooms || []).filter(
    (c) => !SYNTHETIC_CLASSROOM_IDS.has(c.id)
  );
  const students = (state.students || []).filter(
    (s) =>
      !SYNTHETIC_STUDENT_IDS.has(s.id) &&
      !SYNTHETIC_CLASSROOM_IDS.has(s.classId)
  );
  const rubrics = (state.rubrics || []).filter(
    (r) => !SYNTHETIC_RUBRIC_IDS.has(r.id)
  );
  const sessions = (state.sessions || []).filter(
    (ses) =>
      !SYNTHETIC_SESSION_IDS.has(ses.id) &&
      !SYNTHETIC_CLASSROOM_IDS.has(ses.classId) &&
      !SYNTHETIC_RUBRIC_IDS.has(ses.rubricId)
  );

  const hadSynthetic =
    classrooms.length !== (state.classrooms || []).length ||
    students.length !== (state.students || []).length ||
    rubrics.length !== (state.rubrics || []).length ||
    sessions.length !== (state.sessions || []).length;

  return {
    cleaned: { classrooms, students, rubrics, sessions },
    hadSynthetic,
  };
}

/**
 * Synchronously purges synthetic seed data and removes all backup/rollback keys from localStorage without creating a backup.
 * When `seedRubrics` is provided, also clears completely empty persisted states or merges missing built-in rubrics.
 */
export function purgeSyntheticSeedDataSync(seedRubrics: Rubric[] = []): void {
  memoryV3RollbackSnapshot = null;
  memoryConflictBackupSnapshot = null;
  memoryPreResetBackupSnapshot = null;
  memoryIndexedDbQuarantineSnapshot = null;

  const storage =
    typeof localStorage !== 'undefined'
      ? localStorage
      : typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : undefined;
  if (!storage) return;
  try {
    storage.removeItem(LEGACY_V3_ROLLBACK_KEY);
    storage.removeItem(STORAGE_CONFLICT_BACKUP_KEY);
    storage.removeItem(PRE_RESET_ROLLBACK_KEY);
    storage.removeItem(LOCALSTORAGE_QUARANTINE_KEY);
    storage.removeItem(INDEXEDDB_QUARANTINE_KEY);
    storage.removeItem(LEGACY_V2_BUNDLE_KEY);
    for (const keyList of Object.values(LEGACY_V2_KEYS)) {
      for (const k of keyList) {
        storage.removeItem(k);
      }
    }

    const rawV3 = storage.getItem(STORAGE_KEY);
    if (rawV3) {
      const parsed = parseJsonSafelyWithoutPrototypePollution<
        Partial<VerifiedBackupBundle> & Partial<AppDataState>
      >(rawV3);
      const rawPayload = (parsed?.payload || parsed) as AppDataState | undefined;
      if (rawPayload && typeof rawPayload === 'object') {
        const { cleaned, hadSynthetic } = stripSyntheticSeedEntities(rawPayload);
        const isAllEmpty =
          cleaned.classrooms.length === 0 &&
          cleaned.students.length === 0 &&
          cleaned.rubrics.length === 0 &&
          cleaned.sessions.length === 0;

        if (isAllEmpty) {
          storage.removeItem(STORAGE_KEY);
          return;
        }

        const seedById = new Map(seedRubrics.map((sr) => [sr.id, sr]));
        const hasNewBookSeedRubrics = BOOK_PRESENTATION_RUBRIC_IDS.every((id) =>
          seedById.has(id)
        );
        const legacyBookRubricInState = cleaned.rubrics.find(
          (r) => r.id === LEGACY_BOOK_PRESENTATION_RUBRIC_ID
        );
        const existingBookRubricsById = new Map<string, Rubric>();
        for (const r of cleaned.rubrics) {
          if (
            (BOOK_PRESENTATION_RUBRIC_IDS as readonly string[]).includes(r.id)
          ) {
            existingBookRubricsById.set(r.id, r);
          }
        }

        let sessionsUpdated = false;
        const syncedSessions = cleaned.sessions.map((ses) => {
          if (
            ses.rubricId === LEGACY_BOOK_PRESENTATION_RUBRIC_ID &&
            (!ses.rubricSnapshot ||
              ses.rubricSnapshot.id !== LEGACY_BOOK_PRESENTATION_RUBRIC_ID)
          ) {
            sessionsUpdated = true;
            return {
              ...ses,
              rubricSnapshot: freezeRubricSnapshot(
                legacyBookRubricInState || LEGACY_BOOK_PRESENTATION_RUBRIC
              ),
            };
          }
          if (
            (BOOK_PRESENTATION_RUBRIC_IDS as readonly string[]).includes(
              ses.rubricId
            ) &&
            (!ses.rubricSnapshot || ses.rubricSnapshot.id !== ses.rubricId)
          ) {
            const existingRubric = existingBookRubricsById.get(ses.rubricId);
            const fallbackV3 =
              ses.rubricId === LITERARY_BOOK_PRESENTATION_RUBRIC_ID
                ? LEGACY_V3_LITERARY_BOOK_RUBRIC
                : LEGACY_V3_INFORMATIVE_BOOK_RUBRIC;
            sessionsUpdated = true;
            return {
              ...ses,
              rubricSnapshot: freezeRubricSnapshot(existingRubric || fallbackV3),
            };
          }
          return ses;
        });

        let gradeBackfilled = false;
        const filteredRubrics = hasNewBookSeedRubrics
          ? cleaned.rubrics.filter((r) => {
              if (r.id === LEGACY_BOOK_PRESENTATION_RUBRIC_ID) {
                gradeBackfilled = true;
                return false;
              }
              return true;
            })
          : cleaned.rubrics;

        const syncedRubrics = filteredRubrics.map((r) => {
          const seedMatch = seedById.get(r.id);
          if (
            seedMatch &&
            (BOOK_PRESENTATION_RUBRIC_IDS as readonly string[]).includes(r.id) &&
            (r.version ?? 3) < (seedMatch.version ?? 4) &&
            r.criteria.length === 7
          ) {
            gradeBackfilled = true;
            return { ...seedMatch };
          }
          if (seedMatch?.gradeLevel && r.gradeLevel !== seedMatch.gradeLevel) {
            gradeBackfilled = true;
            return { ...r, gradeLevel: seedMatch.gradeLevel };
          }
          return r;
        });

        const existingIds = new Set(syncedRubrics.map((r) => r.id));
        const missingSeedRubrics = seedRubrics.filter(
          (sr) => !existingIds.has(sr.id)
        );

        if (
          hadSynthetic ||
          missingSeedRubrics.length > 0 ||
          gradeBackfilled ||
          sessionsUpdated
        ) {
          const nextState: AppDataState = {
            ...cleaned,
            rubrics: [...syncedRubrics, ...missingSeedRubrics],
            sessions: syncedSessions,
          };
          const newBundle = createVerifiedBackupBundle(nextState);
          storage.setItem(STORAGE_KEY, JSON.stringify(newBundle));
        }
      }
    }
  } catch {
    // ignore storage access errors
  }
}

/**
 * Asynchronously purges synthetic seed data and backup keys from IndexedDB without creating a backup.
 * When `seedRubrics` is provided, also clears completely empty persisted states or merges missing built-in rubrics.
 */
export async function purgeSyntheticSeedDataAsync(
  seedRubrics: Rubric[] = []
): Promise<void> {
  purgeSyntheticSeedDataSync(seedRubrics);

  if (typeof indexedDB === 'undefined' || simulateIndexedDbFailure) return;
  try {
    await new Promise<void>((resolve) => {
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
          resolve();
          return;
        }
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.delete('v3_rollback_backup');
        store.delete('pre_reset_backup');
        store.delete('conflict_backup');
        store.delete('quarantine_corrupted_v3');

        const getReq = store.get('latest');
        getReq.onsuccess = () => {
          const val = getReq.result;
          if (val) {
            try {
              const obj = typeof val === 'string' ? JSON.parse(val) : val;
              const rawPayload = (obj?.payload || obj) as AppDataState | undefined;
              if (rawPayload && typeof rawPayload === 'object') {
                const { cleaned, hadSynthetic } =
                  stripSyntheticSeedEntities(rawPayload);
                const isAllEmpty =
                  cleaned.classrooms.length === 0 &&
                  cleaned.students.length === 0 &&
                  cleaned.rubrics.length === 0 &&
                  cleaned.sessions.length === 0;

                if (isAllEmpty) {
                  store.delete('latest');
                  memoryIndexedDbSnapshot = null;
                  return;
                }

                const seedById = new Map(seedRubrics.map((sr) => [sr.id, sr]));
                const hasNewBookSeedRubrics = BOOK_PRESENTATION_RUBRIC_IDS.every(
                  (id) => seedById.has(id)
                );
                const legacyBookRubricInState = cleaned.rubrics.find(
                  (r) => r.id === LEGACY_BOOK_PRESENTATION_RUBRIC_ID
                );
                const existingBookRubricsById = new Map<string, Rubric>();
                for (const r of cleaned.rubrics) {
                  if (
                    (BOOK_PRESENTATION_RUBRIC_IDS as readonly string[]).includes(
                      r.id
                    )
                  ) {
                    existingBookRubricsById.set(r.id, r);
                  }
                }

                let sessionsUpdated = false;
                const syncedSessions = cleaned.sessions.map((ses) => {
                  if (
                    ses.rubricId === LEGACY_BOOK_PRESENTATION_RUBRIC_ID &&
                    (!ses.rubricSnapshot ||
                      ses.rubricSnapshot.id !==
                        LEGACY_BOOK_PRESENTATION_RUBRIC_ID)
                  ) {
                    sessionsUpdated = true;
                    return {
                      ...ses,
                      rubricSnapshot: freezeRubricSnapshot(
                        legacyBookRubricInState ||
                          LEGACY_BOOK_PRESENTATION_RUBRIC
                      ),
                    };
                  }
                  if (
                    (BOOK_PRESENTATION_RUBRIC_IDS as readonly string[]).includes(
                      ses.rubricId
                    ) &&
                    (!ses.rubricSnapshot ||
                      ses.rubricSnapshot.id !== ses.rubricId)
                  ) {
                    const existingRubric = existingBookRubricsById.get(
                      ses.rubricId
                    );
                    const fallbackV3 =
                      ses.rubricId === LITERARY_BOOK_PRESENTATION_RUBRIC_ID
                        ? LEGACY_V3_LITERARY_BOOK_RUBRIC
                        : LEGACY_V3_INFORMATIVE_BOOK_RUBRIC;
                    sessionsUpdated = true;
                    return {
                      ...ses,
                      rubricSnapshot: freezeRubricSnapshot(
                        existingRubric || fallbackV3
                      ),
                    };
                  }
                  return ses;
                });

                let gradeBackfilled = false;
                const filteredRubrics = hasNewBookSeedRubrics
                  ? cleaned.rubrics.filter((r) => {
                      if (r.id === LEGACY_BOOK_PRESENTATION_RUBRIC_ID) {
                        gradeBackfilled = true;
                        return false;
                      }
                      return true;
                    })
                  : cleaned.rubrics;

                const syncedRubrics = filteredRubrics.map((r) => {
                  const seedMatch = seedById.get(r.id);
                  if (
                    seedMatch &&
                    (BOOK_PRESENTATION_RUBRIC_IDS as readonly string[]).includes(
                      r.id
                    ) &&
                    (r.version ?? 3) < (seedMatch.version ?? 4) &&
                    r.criteria.length === 7
                  ) {
                    gradeBackfilled = true;
                    return { ...seedMatch };
                  }
                  if (
                    seedMatch?.gradeLevel &&
                    r.gradeLevel !== seedMatch.gradeLevel
                  ) {
                    gradeBackfilled = true;
                    return { ...r, gradeLevel: seedMatch.gradeLevel };
                  }
                  return r;
                });

                const existingIds = new Set(syncedRubrics.map((r) => r.id));
                const missingSeedRubrics = seedRubrics.filter(
                  (sr) => !existingIds.has(sr.id)
                );

                if (
                  hadSynthetic ||
                  missingSeedRubrics.length > 0 ||
                  gradeBackfilled ||
                  sessionsUpdated
                ) {
                  const nextState: AppDataState = {
                    ...cleaned,
                    rubrics: [...syncedRubrics, ...missingSeedRubrics],
                    sessions: syncedSessions,
                  };
                  const newBundle = createVerifiedBackupBundle(nextState);
                  store.put(newBundle, 'latest');
                  memoryIndexedDbSnapshot = JSON.stringify(newBundle);
                }
              }
            } catch {
              store.delete('latest');
              memoryIndexedDbSnapshot = null;
            }
          }
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      };
      req.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}



