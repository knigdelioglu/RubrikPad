export interface CriterionLevel {
  id: string;
  label: string;
  points: number;
}

export interface RubricCriterion {
  id: string;
  title: string;
  maxPoints: number;
  levels: CriterionLevel[];
}

export interface Rubric {
  id: string;
  title: string;
  course: string;
  totalPoints: number;
  criteria: RubricCriterion[];
  createdAt: string;
}

export interface Student {
  id: string;
  studentNumber: string;
  name: string;
  className: string;
}

export interface StudentEvaluation {
  id: string;
  rubricId: string;
  studentId: string;
  /** Map of criterionId -> awarded points */
  scores: Record<string, number>;
  /** Map of criterionId -> selected levelId (optional if custom point entered) */
  selectedLevels: Record<string, string>;
  totalScore: number;
  maxPossibleScore: number;
  note: string;
  updatedAt: string;
}
