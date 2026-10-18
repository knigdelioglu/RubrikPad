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

/**
 * Computes the legacy v3 `rpk-<16_hex>` checksum used in earlier v3 builds
 * so that existing `rubrikpad_state_v3` data in localStorage/IndexedDB or v3 backups
 * can be verified for integrity and seamlessly upgraded to `sha256-` without data loss.
 */
export function computeLegacyRpkChecksum(
  payload: AppDataState,
  options?: {
    omitFullName?: boolean;
    canonicalize?: boolean;
    sortScoreMaps?: boolean;
  }
): string {
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

  const fullDataToHash = {
    classrooms: (payload.classrooms || []).map((c) => ({
      id: c.id,
      name: c.name,
      gradeLevel: c.gradeLevel,
      subject: c.subject,
      academicYear: c.academicYear,
    })),
    students: (payload.students || []).map((s) =>
      options?.omitFullName
        ? {
            id: s.id,
            studentNumber: s.studentNumber,
            firstName: s.firstName || '',
            lastName: s.lastName || '',
            classId: s.classId,
            archived: Boolean(s.archived),
          }
        : {
            id: s.id,
            studentNumber: s.studentNumber,
            firstName: s.firstName || '',
            lastName: s.lastName || '',
            fullName: s.fullName,
            classId: s.classId,
            archived: Boolean(s.archived),
          }
    ),
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
        criterionScores: formatMap(g.criterionScores),
        directCriterionScores: formatMap(g.directCriterionScores),
        groupNote: g.groupNote || '',
        lastAppliedAt: g.lastAppliedAt || null,
      })),
      evaluations: Object.keys(ses.evaluations || {})
        .sort()
        .map((stuId) => {
          const ev = ses.evaluations[stuId];
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
        }),
    })),
  };

  const shouldCanonicalize = options?.canonicalize ?? true;
  const serialized = shouldCanonicalize
    ? JSON.stringify(canonicalizeForChecksum(fullDataToHash))
    : JSON.stringify(fullDataToHash);

  let h1 = 0xdeadbeef ^ serialized.length;
  let h2 = 0x41c6ce57 ^ serialized.length;
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
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `rpk-${hex1}${hex2}`;
}

function verifyLegacyRpkV3Checksum(
  rawPayload: AppDataState,
  checksum: string
): boolean {
  const candidates: AppDataState[] = [rawPayload, migrateV2ToV3(rawPayload)];
  const optionSets: Array<{
    omitFullName?: boolean;
    canonicalize?: boolean;
    sortScoreMaps?: boolean;
  }> = [
    { canonicalize: true, omitFullName: false },
    { canonicalize: false, omitFullName: false, sortScoreMaps: false },
    { canonicalize: false, omitFullName: false, sortScoreMaps: true },
    { canonicalize: true, omitFullName: true },
    { canonicalize: false, omitFullName: true, sortScoreMaps: false },
    { canonicalize: false, omitFullName: true, sortScoreMaps: true },
  ];

  for (const candidate of candidates) {
    for (const opts of optionSets) {
      if (checksum === computeLegacyRpkChecksum(candidate, opts)) {
        return true;
      }
    }
  }

  // Support earliest 8-hex rpk- format if payload passes full structural validation
  if (/^rpk-[0-9a-f]{8}$/i.test(checksum)) {
    return validateFullAppDataStructure(rawPayload).isValid;
  }
  return false;
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

  if (p.classrooms.length === 0 || p.rubrics.length === 0) {
    return {
      isValid: false,
      error: 'Yedek dosyasında en az bir sınıf ve bir rubrik bulunmalıdır.',
    };
  }

  for (const cls of p.classrooms) {
    if (!cls || typeof cls !== 'object' || typeof (cls as Classroom).id !== 'string' || typeof (cls as Classroom).name !== 'string') {
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
      typeof (stu as Student).classId !== 'string'
    ) {
      return { isValid: false, error: 'Öğrenci kayıtlarından biri geçersiz veya zorunlu alanları eksik.' };
    }
    const auditLog = (stu as Student).auditLog;
    if (auditLog !== undefined) {
      if (!Array.isArray(auditLog)) {
        return { isValid: false, error: 'Öğrenci denetim geçmişi (auditLog) dizi formatında olmalıdır.' };
      }
      for (const entry of auditLog) {
        if (
          !entry ||
          typeof entry !== 'object' ||
          typeof entry.timestamp !== 'string' ||
          typeof entry.action !== 'string' ||
          typeof entry.details !== 'string'
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
      !Array.isArray((rub as Rubric).criteria) ||
      (rub as Rubric).criteria.length === 0
    ) {
      return { isValid: false, error: 'Rubrik kayıtlarından biri geçersiz veya ölçütleri eksik.' };
    }
    for (const crit of (rub as Rubric).criteria) {
      if (
        !crit ||
        typeof crit !== 'object' ||
        typeof crit.id !== 'string' ||
        typeof crit.title !== 'string' ||
        typeof crit.weight !== 'number' ||
        !Array.isArray(crit.levels)
      ) {
        return { isValid: false, error: 'Rubrik ölçüt yapısı geçersiz.' };
      }
    }
  }

  for (const ses of p.sessions) {
    if (
      !ses ||
      typeof ses !== 'object' ||
      typeof (ses as EvaluationSession).id !== 'string' ||
      typeof (ses as EvaluationSession).title !== 'string' ||
      typeof (ses as EvaluationSession).classId !== 'string' ||
      typeof (ses as EvaluationSession).rubricId !== 'string' ||
      !Array.isArray((ses as EvaluationSession).groups) ||
      typeof (ses as EvaluationSession).evaluations !== 'object' ||
      (ses as EvaluationSession).evaluations === null
    ) {
      return { isValid: false, error: 'Değerlendirme oturumu kayıtlarından biri bozuk veya eksik.' };
    }
    const undoHistory = (ses as EvaluationSession).undoHistory;
    if (undoHistory !== undefined) {
      if (!Array.isArray(undoHistory)) {
        return { isValid: false, error: 'Oturum geri alma geçmişi (undoHistory) dizi formatında olmalıdır.' };
      }
      for (const u of undoHistory) {
        if (
          !u ||
          typeof u !== 'object' ||
          typeof u.id !== 'string' ||
          typeof u.timestamp !== 'string' ||
          typeof u.description !== 'string' ||
          typeof u.previousEvaluations !== 'object' ||
          u.previousEvaluations === null
        ) {
          return { isValid: false, error: 'Oturum geri alma geçmişi (undoHistory) kaydı bozuk.' };
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
  try {
    const parsed = JSON.parse(jsonString) as Partial<VerifiedBackupBundle> &
      Partial<AppDataState>;
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
      const expectedChecksum = computePayloadChecksum(rawPayload);
      if (parsed.checksum !== expectedChecksum) {
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
        upgradedFromRpkChecksum: false,
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
  try {
    const parsed = JSON.parse(jsonString) as Partial<VerifiedBackupBundle> &
      Partial<AppDataState>;
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

    // If the legacy file happens to carry a checksum, verify it if it's sha256
    if (
      typeof parsed.checksum === 'string' &&
      parsed.checksum.startsWith('sha256-') &&
      rawPayload &&
      Array.isArray(rawPayload.classrooms) &&
      Array.isArray(rawPayload.students) &&
      Array.isArray(rawPayload.rubrics) &&
      Array.isArray(rawPayload.sessions)
    ) {
      const computed = computePayloadChecksum(rawPayload as AppDataState);
      if (parsed.checksum !== computed) {
        return {
          isValid: false,
          migratedFromV2: false,
          error:
            'Dosyadaki SHA-256 bütünlük imzası (Checksum) veri içeriğiyle eşleşmiyor.',
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
 * Synchronously loads and verifies state from localStorage (v3 SHA-256, legacy v3 rpk-, or migrated v2),
 * automatically upgrading valid legacy `rpk-` v3 bundles to `sha256-` in-place so existing user records
 * are NEVER rejected or overwritten by seed data.
 */
export function loadVerifiedInitialStateWithMeta(fallbackSeed: AppDataState): {
  state: AppDataState;
  source: 'localStorage_v3' | 'migrated_v2' | 'seed_fallback';
  localStorageCorrupted: boolean;
  upgradedFromRpkChecksum?: boolean;
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
          if (verified.upgradedFromRpkChecksum) {
            const upgradedBundle = createVerifiedBackupBundle(verified.state);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(upgradedBundle));
            } catch {
              // ignore quota error during in-place checksum upgrade
            }
          }
          return {
            state: verified.state,
            source: 'localStorage_v3',
            localStorageCorrupted: false,
            upgradedFromRpkChecksum: Boolean(verified.upgradedFromRpkChecksum),
          };
        } else {
          // Quarantine the raw unverified localStorage string so it is never lost
          try {
            localStorage.setItem('rubrikpad_quarantine_v3_backup', savedV3);
          } catch {
            // ignore
          }
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
