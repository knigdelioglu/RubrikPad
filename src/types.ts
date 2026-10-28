export interface StudentAuditEntry {
  timestamp: string;
  action: 'created' | 'updated' | 'archived' | 'restored';
  details: string;
}

export interface Student {
  id: string;
  studentNumber: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  classId: string;
  avatarInitials?: string;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
  auditLog?: StudentAuditEntry[];
}

export interface Classroom {
  id: string;
  name: string;
  gradeLevel: string;
  subject: string;
  academicYear: string;
}

export interface RubricLevel {
  level: number; // e.g., 0, 1, 2, 3, 4
  label: string; // e.g., "Geliştirilmeli", "Kabul Edilebilir", "Yetkin", "Örnek Düzey"
  points: number; // e.g., 0, 1, 2, 3, 4
  description: string;
}

export type RubricCriterionSection = 'content' | 'speaking';

export type RubricScoringMode = 'standard_100' | 'dual_book_and_speaking';

export interface DualEvaluationResult {
  isDualRubric: true;
  /** 1. Kitap içeriği — 70 puan üzerinden kazanılan puan */
  contentEarnedPoints: number;
  contentScoreOutOf70: number;
  contentMaxPoints: number;
  contentCompletedCount: number;
  completedContentCount: number;
  contentTotalCount: number;
  totalContentCount: number;
  isContentComplete: boolean;
  finalContentScoreOutOf70: number | null;
  /** 2. Ortak konuşma değerlendirmesi — 100 puan üzerinden kazanılan puan */
  speakingEarnedPoints: number;
  speakingScoreOutOf100: number;
  speakingMaxPoints: number;
  speakingCompletedCount: number;
  completedSpeakingCount: number;
  speakingTotalCount: number;
  totalSpeakingCount: number;
  isSpeakingComplete: boolean;
  /** Konuşma sınavı notu (100 üzerinden; yalnızca 6 konuşma ölçütü tamamlandığında kesinleşir) */
  finalSpeakingScoreOutOf100: number | null;
  provisionalSpeakingScoreOutOf100: number;
  speakingPerformanceLabel: string;
  /** Konuşma puanının kitap sunumu notuna %30 katkısı (30 üzerinden) */
  speakingContributionOutOf30: number;
  /** Kitap sunumu notu: İçerik puanı (70) + konuşma puanının %30'u (100 üzerinden; 10 ölçüt tamamlandığında kesinleşir) */
  isBookPresentationComplete: boolean;
  finalBookPresentationScoreOutOf100: number | null;
  provisionalBookPresentationScoreOutOf100: number;
  bookPresentationPerformanceLabel: string;
}

export interface RubricCriterion {
  id: string;
  title: string;
  category: string;
  weight: number; // percentage weight, e.g., 25 (sum of weights in a standard rubric = 100; 70 content + 100 speaking in dual rubrics)
  maxPoints?: number; // criterion point value, e.g., 20, 10
  required?: boolean; // default true
  section?: RubricCriterionSection; // 'content' (Kitap İçeriği — 70 Puan) | 'speaking' (Ortak Konuşma Değerlendirmesi — 100 Puan)
  levels: RubricLevel[];
}

export interface Rubric {
  id: string;
  title: string;
  subject: string;
  gradeLevel?: string;
  description: string;
  maxLevelPoints: number;
  criteria: RubricCriterion[];
  createdAt: string;
  version?: number;
  scoringMode?: RubricScoringMode;
}

export interface StudentGroup {
  id: string;
  name: string;
  classId?: string; // classroom ID for class-scoped group evaluation in multi-class sessions
  studentIds: string[];
  criterionScores: Record<string, number | null>; // criterionId -> level points (0 valid, null unscored)
  directCriterionScores?: Record<string, number | null>; // criterionId -> exact integer points (0..maxPoints)
  groupNote: string;
  lastAppliedAt?: string;
  groupBookPresentationScore?: number | null;
  groupSpeakingExamScore?: number | null;
  groupContentScoreOutOf70?: number | null;
}

export interface StudentEvaluation {
  studentId: string;
  criterionScores: Record<string, number | null>; // individual level points (0 valid, null unscored)
  directCriterionScores?: Record<string, number | null>; // individual exact points (0..maxPoints)
  groupCriterionScores?: Record<string, number | null>; // separate group level points (never overwrites individual)
  groupDirectScores?: Record<string, number | null>; // separate group exact points
  groupNote?: string;
  groupId?: string;
  activeScoreSource?: 'individual' | 'group';
  note: string;
  tags: string[];
  updatedAt: string;
  evaluatedViaGroup?: string; // group name if group evaluation was also recorded
  bookPresentationScore?: number | null; // Kitap sunumu notu (100 üzerinden: İçerik 70 + %30 Konuşma)
  speakingExamScore?: number | null; // Konuşma sınavı notu (100 üzerinden: 6 konuşma ölçütü toplamı)
  contentScoreOutOf70?: number | null; // Kitap içeriği puanı (70 üzerinden)
  groupBookPresentationScore?: number | null;
  groupSpeakingExamScore?: number | null;
  groupContentScoreOutOf70?: number | null;
}

export interface EvaluationActionHistoryEntry {
  id: string;
  timestamp: string;
  scope: 'criterion' | 'student' | 'session' | 'group';
  studentId?: string;
  criterionId?: string;
  groupId?: string;
  description: string;
  previousEvaluations: Record<string, StudentEvaluation>;
  previousGroups?: StudentGroup[];
  previousRubricId?: string;
  previousRubricSnapshot?: Rubric;
}

export interface EvaluationSession {
  id: string;
  title: string;
  classId: string;
  classIds?: string[]; // Multi-classroom session support (P1)
  rubricId: string;
  rubricSnapshot?: Rubric; // Frozen rubric snapshot for historical immutability (P0)
  date: string;
  status: 'in_progress' | 'completed';
  archived?: boolean;
  archivedAt?: string;
  mode: 'individual' | 'grid' | 'group';
  evaluations: Record<string, StudentEvaluation>; // studentId -> StudentEvaluation
  groups: StudentGroup[];
  generalSessionNote: string;
  undoHistory?: EvaluationActionHistoryEntry[];
}

export interface ParsedRosterRow {
  studentNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  isValid: boolean;
  validationErrors: string[];
}

export interface VerifiedBackupBundle {
  schemaVersion: number;
  exportedAt: string;
  checksum: string;
  payload: {
    classrooms: Classroom[];
    students: Student[];
    rubrics: Rubric[];
    sessions: EvaluationSession[];
  };
}
