export interface Student {
  id: string;
  studentNumber: string;
  fullName: string;
  classId: string;
  avatarInitials?: string;
}

export interface Classroom {
  id: string;
  name: string;
  gradeLevel: string;
  subject: string;
  academicYear: string;
}

export interface RubricLevel {
  level: number; // e.g., 1, 2, 3, 4
  label: string; // e.g., "Geliştirilmeli", "Kabul Edilebilir", "Yetkin", "Örnek Düzey"
  points: number; // e.g., 1, 2, 3, 4
  description: string;
}

export interface RubricCriterion {
  id: string;
  title: string;
  category: string;
  weight: number; // percentage weight, e.g., 25 (sum of weights in a rubric = 100)
  maxPoints?: number; // criterion point value out of total rubric points, e.g., 25, 15, 10
  levels: RubricLevel[];
}

export interface Rubric {
  id: string;
  title: string;
  subject: string;
  description: string;
  maxLevelPoints: number;
  criteria: RubricCriterion[];
  createdAt: string;
}

export interface StudentGroup {
  id: string;
  name: string;
  studentIds: string[];
  criterionScores: Record<string, number>; // criterionId -> level points
  groupNote: string;
  lastAppliedAt?: string;
}

export interface StudentEvaluation {
  studentId: string;
  criterionScores: Record<string, number>; // criterionId -> level points
  note: string;
  tags: string[];
  updatedAt: string;
  evaluatedViaGroup?: string; // group name if propagated from group evaluation
}

export interface EvaluationSession {
  id: string;
  title: string;
  classId: string;
  rubricId: string;
  date: string;
  status: 'in_progress' | 'completed';
  mode: 'individual' | 'grid' | 'group';
  evaluations: Record<string, StudentEvaluation>; // studentId -> StudentEvaluation
  groups: StudentGroup[];
  generalSessionNote: string;
}
