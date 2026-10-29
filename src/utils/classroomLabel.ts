import type { Classroom } from '../types.ts';

/** Display a stored grade and branch together without duplicating a complete class name. */
export function formatClassroomLabel(classroom: Classroom): string {
  const name = classroom.name.trim();
  const grade = classroom.gradeLevel?.match(/^\s*(\d{1,2})(?:\D|$)/)?.[1];
  if (grade && /^[A-ZÇĞİÖŞÜ]{1,10}$/iu.test(name)) return `${grade}/${name}`;
  return name || classroom.gradeLevel?.trim() || 'Sınıf belirtilmedi';
}
