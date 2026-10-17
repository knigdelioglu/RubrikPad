import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  Clock,
  Users,
  User,
  Plus,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  CheckCheck,
  FileText,
  Sparkles,
  Trash2,
  Check,
  LayoutGrid,
  Zap,
  Table,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import type {
  Classroom,
  Student,
  Rubric,
  EvaluationSession,
  StudentEvaluation,
  StudentGroup,
} from '../types.ts';
import {
  calculateWeightedScore,
  applyGroupScoresToMembers,
  applyCriterionScoreToStudents,
  getNextUnscoredCriterion,
  getNextPendingStudent,
} from '../utils/rubricLogic.ts';
import { QUICK_OBSERVATION_TAGS } from '../data/seedData.ts';

interface EvaluationWorkspaceProps {
  classrooms: Classroom[];
  students: Student[];
  rubrics: Rubric[];
  sessions: EvaluationSession[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onUpdateSession: (updated: EvaluationSession) => void;
  onCreateSession: (newSession: EvaluationSession) => void;
  onNavigateToReports: () => void;
}

export const EvaluationWorkspace: React.FC<EvaluationWorkspaceProps> = ({
  classrooms,
  students,
  rubrics,
  sessions,
  activeSessionId,
  onSelectSession,
  onUpdateSession,
  onCreateSession,
  onNavigateToReports,
}) => {
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  const activeClassroom = useMemo(
    () => classrooms.find((c) => c.id === activeSession?.classId) || classrooms[0],
    [classrooms, activeSession]
  );

  const activeRubric = useMemo(
    () => rubrics.find((r) => r.id === activeSession?.rubricId) || rubrics[0],
    [rubrics, activeSession]
  );

  const classStudents = useMemo(
    () => students.filter((s) => s.classId === activeSession?.classId),
    [students, activeSession]
  );

  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    () => classStudents[0]?.id || ''
  );
  const [studentFilter, setStudentFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    () => activeSession?.groups[0]?.id || ''
  );
  const [gridInputType, setGridInputType] = useState<'buttons' | 'dropdown'>('buttons');

  // Fast Flow (Seri Kriter Puanlama Akışı) state
  const [fastFlowSubMode, setFastFlowSubMode] = useState<'flow' | 'matrix'>('flow');
  const [fastFlowCriterionIndex, setFastFlowCriterionIndex] = useState(0);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true);
  const [autoTransitionNextStudentId, setAutoTransitionNextStudentId] = useState<string | null>(
    null
  );
  const autoTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousNonGridModeRef = useRef<'individual' | 'group'>('individual');

  useEffect(() => {
    if (activeSession?.mode === 'individual' || activeSession?.mode === 'group') {
      previousNonGridModeRef.current = activeSession.mode;
    }
  }, [activeSession?.mode]);

  const cancelAutoTransition = () => {
    if (autoTransitionTimerRef.current) {
      clearTimeout(autoTransitionTimerRef.current);
      autoTransitionTimerRef.current = null;
    }
    setAutoTransitionNextStudentId(null);
  };

  const handleExitFastEvaluation = () => {
    cancelAutoTransition();
    if (!activeSession) return;
    onUpdateSession({
      ...activeSession,
      mode: previousNonGridModeRef.current || 'individual',
    });
  };

  useEffect(() => {
    return () => {
      if (autoTransitionTimerRef.current) {
        clearTimeout(autoTransitionTimerRef.current);
      }
    };
  }, []);

  // New Session Modal state
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionClassId, setNewSessionClassId] = useState(classrooms[0]?.id || '');
  const [newSessionRubricId, setNewSessionRubricId] = useState(rubrics[0]?.id || '');
  const [newSessionError, setNewSessionError] = useState('');

  // New Group Form state
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupStudentIds, setNewGroupStudentIds] = useState<string[]>([]);
  const [groupBannerMessage, setGroupBannerMessage] = useState<string | null>(null);

  // Ensure selectedStudentId belongs to current classStudents
  const currentStudent = useMemo(() => {
    const found = classStudents.find((s) => s.id === selectedStudentId);
    return found || classStudents[0] || null;
  }, [classStudents, selectedStudentId]);

  const currentGroup = useMemo(() => {
    const found = activeSession?.groups.find((g) => g.id === selectedGroupId);
    return found || activeSession?.groups[0] || null;
  }, [activeSession, selectedGroupId]);

  // Current criterion in Fast Flow
  const currentCriterion = useMemo(() => {
    if (!activeRubric?.criteria?.length) return null;
    const safeIdx = Math.min(
      Math.max(0, fastFlowCriterionIndex),
      activeRubric.criteria.length - 1
    );
    return activeRubric.criteria[safeIdx];
  }, [activeRubric, fastFlowCriterionIndex]);

  // When active student changes in fast flow, find their first unscored criterion
  useEffect(() => {
    if (!currentStudent || !activeRubric) return;
    const ev = activeSession.evaluations[currentStudent.id];
    const scores = ev?.criterionScores || {};
    const nextUnscored = getNextUnscoredCriterion(activeRubric.criteria, scores);
    if (nextUnscored) {
      setFastFlowCriterionIndex(nextUnscored.index);
    } else {
      setFastFlowCriterionIndex(0);
    }
  }, [selectedStudentId, activeRubric.id]);

  // Compute completion stats for the session
  const sessionStats = useMemo(() => {
    if (!activeSession || !activeRubric) {
      return { completedCount: 0, totalCount: 0, avgScore: 0 };
    }
    let completedCount = 0;
    let scoreSum = 0;
    let scoredStudentCount = 0;

    for (const stu of classStudents) {
      const ev = activeSession.evaluations[stu.id];
      const calc = calculateWeightedScore(activeRubric, ev?.criterionScores || {});
      if (calc.isComplete) {
        completedCount += 1;
      }
      if (calc.completedCriteriaCount > 0) {
        scoreSum += calc.scoreOutOf100;
        scoredStudentCount += 1;
      }
    }

    return {
      completedCount,
      totalCount: classStudents.length,
      avgScore: scoredStudentCount > 0 ? Math.round(scoreSum / scoredStudentCount) : 0,
    };
  }, [activeSession, activeRubric, classStudents]);

  const filteredStudents = useMemo(() => {
    if (!activeSession || !activeRubric) return classStudents;
    return classStudents.filter((stu) => {
      const ev = activeSession.evaluations[stu.id];
      const calc = calculateWeightedScore(activeRubric, ev?.criterionScores || {});
      if (studentFilter === 'completed') return calc.isComplete;
      if (studentFilter === 'pending') return !calc.isComplete;
      return true;
    });
  }, [classStudents, activeSession, activeRubric, studentFilter]);

  if (!activeSession || !activeRubric || !activeClassroom) {
    return null;
  }

  const currentEvaluation: StudentEvaluation = currentStudent
    ? activeSession.evaluations[currentStudent.id] || {
        studentId: currentStudent.id,
        criterionScores: {},
        note: '',
        tags: [],
        updatedAt: new Date().toISOString(),
      }
    : {
        studentId: '',
        criterionScores: {},
        note: '',
        tags: [],
        updatedAt: '',
      };

  const currentStudentCalc = calculateWeightedScore(
    activeRubric,
    currentEvaluation.criterionScores
  );

  // Handlers for individual evaluation
  const handleSelectCriterionLevel = (criterionId: string, points: number) => {
    if (!currentStudent) return;
    const nextScores = {
      ...currentEvaluation.criterionScores,
      [criterionId]: points,
    };
    const nextEval: StudentEvaluation = {
      ...currentEvaluation,
      studentId: currentStudent.id,
      criterionScores: nextScores,
      updatedAt: new Date().toISOString(),
    };
    onUpdateSession({
      ...activeSession,
      evaluations: {
        ...activeSession.evaluations,
        [currentStudent.id]: nextEval,
      },
    });
  };

  const handleAssignFullScoreToStudent = () => {
    if (!currentStudent) return;
    const fullScores: Record<string, number> = {};
    for (const crit of activeRubric.criteria) {
      const maxPts = Math.max(...crit.levels.map((l) => l.points), 4);
      fullScores[crit.id] = maxPts;
    }
    onUpdateSession({
      ...activeSession,
      evaluations: {
        ...activeSession.evaluations,
        [currentStudent.id]: {
          ...currentEvaluation,
          studentId: currentStudent.id,
          criterionScores: fullScores,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  };

  const handleResetStudentScores = () => {
    if (!currentStudent) return;
    onUpdateSession({
      ...activeSession,
      evaluations: {
        ...activeSession.evaluations,
        [currentStudent.id]: {
          ...currentEvaluation,
          studentId: currentStudent.id,
          criterionScores: {},
          updatedAt: new Date().toISOString(),
        },
      },
    });
  };

  const handleStudentNoteChange = (note: string) => {
    if (!currentStudent) return;
    onUpdateSession({
      ...activeSession,
      evaluations: {
        ...activeSession.evaluations,
        [currentStudent.id]: {
          ...currentEvaluation,
          studentId: currentStudent.id,
          note,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  };

  const handleToggleStudentTag = (tag: string) => {
    if (!currentStudent) return;
    const exists = currentEvaluation.tags.includes(tag);
    const nextTags = exists
      ? currentEvaluation.tags.filter((t) => t !== tag)
      : [...currentEvaluation.tags, tag];
    onUpdateSession({
      ...activeSession,
      evaluations: {
        ...activeSession.evaluations,
        [currentStudent.id]: {
          ...currentEvaluation,
          studentId: currentStudent.id,
          tags: nextTags,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  };

  const handleGoToNextPendingStudent = () => {
    const pending = classStudents.find((stu) => {
      if (stu.id === currentStudent?.id) return false;
      const ev = activeSession.evaluations[stu.id];
      const calc = calculateWeightedScore(activeRubric, ev?.criterionScores || {});
      return !calc.isComplete;
    });
    if (pending) {
      setSelectedStudentId(pending.id);
    } else {
      // Otherwise cycle to next student in list
      const idx = classStudents.findIndex((s) => s.id === currentStudent?.id);
      if (idx >= 0 && classStudents.length > 1) {
        const nextIdx = (idx + 1) % classStudents.length;
        setSelectedStudentId(classStudents[nextIdx].id);
      }
    }
  };

  // Handlers for Fast Evaluation Grid (Hızlı Değerlendirme Grid)
  const handleGridSelectScore = (
    studentId: string,
    criterionId: string,
    points: number
  ) => {
    const existing = activeSession.evaluations[studentId] || {
      studentId,
      criterionScores: {},
      note: '',
      tags: [],
      updatedAt: new Date().toISOString(),
    };
    const currentPts = existing.criterionScores[criterionId];
    const nextScores = { ...existing.criterionScores };
    if (currentPts === points) {
      delete nextScores[criterionId];
    } else {
      nextScores[criterionId] = points;
    }

    onUpdateSession({
      ...activeSession,
      evaluations: {
        ...activeSession.evaluations,
        [studentId]: {
          ...existing,
          studentId,
          criterionScores: nextScores,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  };

  const handleGridStudentNoteChange = (studentId: string, note: string) => {
    const existing = activeSession.evaluations[studentId] || {
      studentId,
      criterionScores: {},
      note: '',
      tags: [],
      updatedAt: new Date().toISOString(),
    };
    onUpdateSession({
      ...activeSession,
      evaluations: {
        ...activeSession.evaluations,
        [studentId]: {
          ...existing,
          studentId,
          note,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  };

  const handleGridAssignFullRowScore = (studentId: string) => {
    const existing = activeSession.evaluations[studentId] || {
      studentId,
      criterionScores: {},
      note: '',
      tags: [],
      updatedAt: new Date().toISOString(),
    };
    const fullScores: Record<string, number> = {};
    for (const crit of activeRubric.criteria) {
      const maxPts = Math.max(...crit.levels.map((l) => l.points), 4);
      fullScores[crit.id] = maxPts;
    }
    onUpdateSession({
      ...activeSession,
      evaluations: {
        ...activeSession.evaluations,
        [studentId]: {
          ...existing,
          studentId,
          criterionScores: fullScores,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  };

  const handleGridResetRowScore = (studentId: string) => {
    const existing = activeSession.evaluations[studentId];
    if (!existing) return;
    onUpdateSession({
      ...activeSession,
      evaluations: {
        ...activeSession.evaluations,
        [studentId]: {
          ...existing,
          criterionScores: {},
          updatedAt: new Date().toISOString(),
        },
      },
    });
  };

  const handleGridBulkCriterionFill = (
    criterionId: string,
    points: number,
    onlyUnscored: boolean
  ) => {
    const targetIds = filteredStudents.map((s) => s.id);
    const updatedEvaluations = applyCriterionScoreToStudents(
      activeSession.evaluations,
      targetIds,
      criterionId,
      points,
      new Date().toISOString(),
      onlyUnscored
    );
    onUpdateSession({
      ...activeSession,
      evaluations: updatedEvaluations,
    });
  };

  const handleTransitionToStudent = (
    targetStudentId: string,
    evaluationsMap = activeSession.evaluations
  ) => {
    cancelAutoTransition();
    setSelectedStudentId(targetStudentId);
    const pScores = evaluationsMap[targetStudentId]?.criterionScores || {};
    const pUnscored = getNextUnscoredCriterion(activeRubric.criteria, pScores);
    setFastFlowCriterionIndex(pUnscored ? pUnscored.index : 0);
  };

  // Handlers for Fast Flow (Seri Kriter Puanlama Akışı)
  const handleFastFlowAnswer = (points: number, explicitCriterionId?: string) => {
    if (!currentStudent) return;
    const studentId = currentStudent.id;
    const critId = explicitCriterionId || currentCriterion?.id;
    if (!critId) return;

    const existing = activeSession.evaluations[studentId] || {
      studentId,
      criterionScores: {},
      note: '',
      tags: [],
      updatedAt: new Date().toISOString(),
    };

    const nextScores = {
      ...existing.criterionScores,
      [critId]: points,
    };

    const nextEval: StudentEvaluation = {
      ...existing,
      studentId,
      criterionScores: nextScores,
      updatedAt: new Date().toISOString(),
    };

    const updatedEvaluations = {
      ...activeSession.evaluations,
      [studentId]: nextEval,
    };

    onUpdateSession({
      ...activeSession,
      evaluations: updatedEvaluations,
    });

    // Check if current student has any remaining unscored criteria
    const remainingUnscored = activeRubric.criteria.find(
      (c) => c.id !== critId && typeof nextScores[c.id] !== 'number'
    );

    if (remainingUnscored) {
      cancelAutoTransition();
      const nextIdx = activeRubric.criteria.findIndex((c) => c.id === remainingUnscored.id);
      if (nextIdx >= 0) {
        setFastFlowCriterionIndex(nextIdx);
      }
    } else {
      // Find next pending student
      const nextPending = getNextPendingStudent(
        classStudents,
        updatedEvaluations,
        activeRubric,
        studentId
      );

      if (nextPending && autoAdvanceEnabled) {
        cancelAutoTransition();
        setAutoTransitionNextStudentId(nextPending.id);
        autoTransitionTimerRef.current = setTimeout(() => {
          handleTransitionToStudent(nextPending.id, updatedEvaluations);
        }, 1200);
      } else {
        cancelAutoTransition();
      }
    }
  };

  const handleFastFlowNextCriterion = () => {
    if (!activeRubric?.criteria?.length) return;
    cancelAutoTransition();
    if (fastFlowCriterionIndex < activeRubric.criteria.length - 1) {
      setFastFlowCriterionIndex((prev) => prev + 1);
    } else {
      // If current student is complete and there's a next pending student, prefer next pending or next in list
      const currIdx = classStudents.findIndex((s) => s.id === currentStudent?.id);
      if (currIdx < classStudents.length - 1) {
        handleTransitionToStudent(classStudents[currIdx + 1].id);
      } else if (classStudents.length > 0) {
        handleTransitionToStudent(classStudents[0].id);
      }
    }
  };

  const handleFastFlowPrevCriterion = () => {
    if (!activeRubric?.criteria?.length) return;
    cancelAutoTransition();
    if (fastFlowCriterionIndex > 0) {
      setFastFlowCriterionIndex((prev) => prev - 1);
    } else {
      // Loop to prev student's last criterion
      const currIdx = classStudents.findIndex((s) => s.id === currentStudent?.id);
      if (currIdx > 0) {
        setSelectedStudentId(classStudents[currIdx - 1].id);
        setFastFlowCriterionIndex(activeRubric.criteria.length - 1);
      }
    }
  };

  const handleFastFlowNextStudent = () => {
    cancelAutoTransition();
    const currIdx = classStudents.findIndex((s) => s.id === currentStudent?.id);
    if (currIdx < classStudents.length - 1) {
      handleTransitionToStudent(classStudents[currIdx + 1].id);
    } else if (classStudents.length > 0) {
      handleTransitionToStudent(classStudents[0].id);
    }
  };

  const handleFastFlowPrevStudent = () => {
    cancelAutoTransition();
    const currIdx = classStudents.findIndex((s) => s.id === currentStudent?.id);
    if (currIdx > 0) {
      handleTransitionToStudent(classStudents[currIdx - 1].id);
    } else if (classStudents.length > 0) {
      handleTransitionToStudent(classStudents[classStudents.length - 1].id);
    }
  };

  // Keyboard shortcut listener for fast flow (1, 2, 3, 4, ArrowLeft, ArrowRight, Escape)
  useEffect(() => {
    if (activeSession.mode !== 'grid') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        handleExitFastEvaluation();
        return;
      }

      if (fastFlowSubMode !== 'flow') return;

      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const pts = parseInt(e.key, 10);
        handleFastFlowAnswer(pts);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleFastFlowNextCriterion();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleFastFlowPrevCriterion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeSession.mode,
    fastFlowSubMode,
    currentStudent,
    currentCriterion,
    fastFlowCriterionIndex,
    autoAdvanceEnabled,
    classStudents,
    activeSession.evaluations,
  ]);

  // Handlers for Group Evaluation
  const handleSelectGroupCriterionLevel = (criterionId: string, points: number) => {
    if (!currentGroup) return;
    const updatedGroups = activeSession.groups.map((grp) =>
      grp.id === currentGroup.id
        ? {
            ...grp,
            criterionScores: {
              ...grp.criterionScores,
              [criterionId]: points,
            },
          }
        : grp
    );
    onUpdateSession({
      ...activeSession,
      groups: updatedGroups,
    });
  };

  const handleGroupNoteChange = (groupNote: string) => {
    if (!currentGroup) return;
    const updatedGroups = activeSession.groups.map((grp) =>
      grp.id === currentGroup.id ? { ...grp, groupNote } : grp
    );
    onUpdateSession({
      ...activeSession,
      groups: updatedGroups,
    });
  };

  const handlePropagateGroupToMembers = () => {
    if (!currentGroup) return;
    const nowIso = new Date().toISOString();
    const updatedEvaluations = applyGroupScoresToMembers(
      activeSession.evaluations,
      currentGroup,
      nowIso
    );
    const updatedGroups = activeSession.groups.map((grp) =>
      grp.id === currentGroup.id ? { ...grp, lastAppliedAt: nowIso } : grp
    );
    onUpdateSession({
      ...activeSession,
      evaluations: updatedEvaluations,
      groups: updatedGroups,
    });
    setGroupBannerMessage(
      `"${currentGroup.name}" puanları ve gözlem notu ${currentGroup.studentIds.length} grup üyesine başarıyla aktarıldı.`
    );
    setTimeout(() => setGroupBannerMessage(null), 4000);
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || newGroupStudentIds.length === 0) return;
    const newGrp: StudentGroup = {
      id: `grp-${Date.now()}`,
      name: newGroupName.trim(),
      studentIds: newGroupStudentIds,
      criterionScores: {},
      groupNote: '',
    };
    const nextGroups = [...activeSession.groups, newGrp];
    onUpdateSession({
      ...activeSession,
      groups: nextGroups,
    });
    setSelectedGroupId(newGrp.id);
    setNewGroupName('');
    setNewGroupStudentIds([]);
    setIsAddingGroup(false);
  };

  const handleDeleteGroup = (groupId: string) => {
    const nextGroups = activeSession.groups.filter((g) => g.id !== groupId);
    onUpdateSession({
      ...activeSession,
      groups: nextGroups,
    });
    if (selectedGroupId === groupId) {
      setSelectedGroupId(nextGroups[0]?.id || '');
    }
  };

  const handleCreateNewSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionTitle.trim()) {
      setNewSessionError('Lütfen değerlendirme oturumu için bir başlık girin.');
      return;
    }
    const created: EvaluationSession = {
      id: `ses-${Date.now()}`,
      title: newSessionTitle.trim(),
      classId: newSessionClassId,
      rubricId: newSessionRubricId,
      date: new Date().toISOString().slice(0, 10),
      status: 'in_progress',
      mode: 'individual',
      evaluations: {},
      groups: [],
      generalSessionNote: '',
    };
    onCreateSession(created);
    setNewSessionTitle('');
    setNewSessionError('');
    setIsNewSessionModalOpen(false);
  };

  const handleToggleSessionStatus = () => {
    onUpdateSession({
      ...activeSession,
      status: activeSession.status === 'completed' ? 'in_progress' : 'completed',
    });
  };

  const currentGroupCalc = currentGroup
    ? calculateWeightedScore(activeRubric, currentGroup.criterionScores)
    : null;

  const nextPendingStudentForCurrent = useMemo(() => {
    if (!currentStudent || !activeSession || !activeRubric) return null;
    return getNextPendingStudent(
      classStudents,
      activeSession.evaluations,
      activeRubric,
      currentStudent.id
    );
  }, [classStudents, activeSession, activeRubric, currentStudent]);

  const autoTransitionTargetStudent = useMemo(() => {
    if (!autoTransitionNextStudentId) return null;
    return classStudents.find((s) => s.id === autoTransitionNextStudentId) || null;
  }, [classStudents, autoTransitionNextStudentId]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 md:overflow-hidden">
      {/* Top Session Bar: Hidden in Full-Screen Fast Evaluation Mode */}
      {activeSession.mode !== 'grid' && (
        <section
          aria-label="Değerlendirme Oturumu Kontrol Paneli"
          className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-2xs space-y-2 shrink-0"
        >
          {/* Row 1: Session Selector (Left) & Session Actions (Right) — strictly aligned h-8 controls */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
              <label
                htmlFor="session-select"
                className="text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap shrink-0"
              >
                Aktif Oturum
              </label>
              <select
                id="session-select"
                aria-label="Aktif Değerlendirme Oturumu (Yarım Kalan veya Tamamlananlar)"
                value={activeSession.id}
                onChange={(e) => onSelectSession(e.target.value)}
                className="h-8 w-full sm:flex-1 min-w-0 max-w-2xl px-3 text-xs sm:text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600 cursor-pointer truncate"
              >
                {sessions.map((ses) => {
                  const cls = classrooms.find((c) => c.id === ses.classId);
                  const statusText =
                    ses.status === 'in_progress' ? 'Devam Ediyor' : 'Tamamlandı';
                  return (
                    <option key={ses.id} value={ses.id}>
                      {cls?.name} — {ses.title} ({ses.date} · {statusText})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsNewSessionModalOpen(true)}
                className="h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>Yeni Oturum Başlat</span>
              </button>

              <button
                type="button"
                onClick={handleToggleSessionStatus}
                className={`h-8 px-3 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSession.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                }`}
              >
                {activeSession.status === 'completed' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Oturum Tamamlandı</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Devam Ediyor (Tamamla)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onNavigateToReports}
                className="h-8 px-3 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Rapor ve Grafikler</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>

          {/* Row 2: Mode Switcher (Left) & Session Progress Summary (Right) — strictly aligned single row */}
          <div className="pt-2 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
            {/* Segmented Mode Switcher */}
            <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={() => onUpdateSession({ ...activeSession, mode: 'individual' })}
                className={`h-7 px-2.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSession.mode === 'individual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5 shrink-0" />
                <span>Bireysel Değerlendirme</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSession({ ...activeSession, mode: 'grid' })}
                className="h-7 px-2.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer text-slate-600 hover:text-slate-900"
              >
                <Zap className="w-3.5 h-3.5 shrink-0 text-amber-500 fill-amber-500" />
                <span>Hızlı Değerlendirme</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSession({ ...activeSession, mode: 'group' })}
                className={`h-7 px-2.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSession.mode === 'group'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>Grup Değerlendirmesi ({activeSession.groups.length})</span>
              </button>
            </div>

            {/* Session Metadata & Live Stats — aligned single-row metrics */}
            <div className="flex flex-wrap lg:flex-nowrap items-center gap-1.5 text-xs text-slate-600 min-w-0">
              <span className="h-7 px-2.5 inline-flex items-center rounded-md bg-slate-100 font-bold text-slate-900 whitespace-nowrap shrink-0">
                {activeClassroom.name}
              </span>
              <span
                className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md bg-slate-50 border border-slate-200/80 text-slate-700 min-w-0 max-w-[200px] xl:max-w-[360px]"
                title={`Rubrik: ${activeRubric.title} (${activeSession.date})`}
              >
                <span className="text-slate-500 shrink-0">Rubrik:</span>
                <strong className="font-semibold text-slate-900 truncate">{activeRubric.title}</strong>
              </span>
              <span className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md bg-slate-50 border border-slate-200/80 text-slate-700 whitespace-nowrap shrink-0">
                <span className="text-slate-500">İlerleme:</span>
                <strong className="font-mono-num text-slate-900">
                  {sessionStats.completedCount}/{sessionStats.totalCount}
                </strong>
              </span>
              <span className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md bg-sky-50 text-sky-900 border border-sky-200/80 whitespace-nowrap shrink-0">
                <span>Ortalama:</span>
                <strong className="font-mono-num text-sky-700">{sessionStats.avgScore}/100</strong>
              </span>
            </div>
          </div>
        </section>
      )}

      {/* INDIVIDUAL EVALUATION MODE — SINGLE-SCREEN 2x2 RUBRIC LAYOUT */}
      {activeSession.mode === 'individual' ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-stretch md:overflow-hidden">
          {/* Left Column: Student Roster Queue (3 cols on desktop/landscape) */}
          <aside
            aria-label="Sınıf Öğrenci Listesi"
            className="md:col-span-4 lg:col-span-3 bg-white border border-slate-200 rounded-xl p-3 flex flex-col min-h-0 gap-2"
          >
            <div className="flex items-center justify-between gap-1.5 shrink-0">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 whitespace-nowrap">
                Öğrenciler ({classStudents.length})
              </h2>
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setStudentFilter('all')}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    studentFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tümü
                </button>
                <button
                  type="button"
                  onClick={() => setStudentFilter('pending')}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    studentFilter === 'pending'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bekleyen
                </button>
                <button
                  type="button"
                  onClick={() => setStudentFilter('completed')}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    studentFilter === 'completed'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Biten
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto pr-0.5">
              {filteredStudents.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Bu filtreye uygun öğrenci bulunamadı.
                </div>
              ) : (
                filteredStudents.map((stu) => {
                  const ev = activeSession.evaluations[stu.id];
                  const calc = calculateWeightedScore(
                    activeRubric,
                    ev?.criterionScores || {}
                  );
                  const isSelected = currentStudent?.id === stu.id;

                  return (
                    <button
                      key={stu.id}
                      type="button"
                      onClick={() => setSelectedStudentId(stu.id)}
                      className={`w-full text-left px-2.5 py-2 flex items-center justify-between gap-2 transition-colors rounded-lg border cursor-pointer ${
                        isSelected
                          ? 'bg-sky-700 text-white border-sky-700 shadow-2xs'
                          : calc.isComplete
                          ? 'bg-white text-slate-900 border-emerald-200 hover:bg-emerald-50/50'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/80'
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-1.5">
                        <span
                          className={`font-mono-num text-[11px] font-semibold shrink-0 ${
                            isSelected ? 'text-sky-200' : 'text-slate-400'
                          }`}
                        >
                          #{stu.studentNumber}
                        </span>
                        <span className="text-xs sm:text-sm font-semibold truncate">
                          {stu.fullName}
                        </span>
                      </div>

                      <div className="text-right shrink-0 font-mono-num text-xs font-bold">
                        {calc.isComplete ? (
                          <span
                            className={`inline-flex items-center gap-0.5 ${
                              isSelected ? 'text-white' : 'text-emerald-700'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            {calc.scoreOutOf100}
                          </span>
                        ) : calc.completedCriteriaCount > 0 ? (
                          <span
                            className={`text-[11px] ${
                              isSelected ? 'text-sky-100' : 'text-amber-700'
                            }`}
                          >
                            {calc.completedCriteriaCount}/{calc.totalCriteriaCount}
                          </span>
                        ) : (
                          <span
                            className={`text-[11px] font-normal ${
                              isSelected ? 'text-sky-200' : 'text-slate-300'
                            }`}
                          >
                            —
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right Column: Active Student Compact Criteria & Observation Dock */}
          <div className="md:col-span-8 lg:col-span-9 flex flex-col min-h-0">
            {currentStudent ? (
              <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex flex-col justify-between gap-3 md:overflow-hidden">
                {/* Active Student Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200 shrink-0">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-mono-num text-xs font-bold text-slate-500">
                      #{currentStudent.studentNumber}
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                      {currentStudent.fullName}
                    </h2>
                    {currentStudentCalc.isComplete ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono-num">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Tamamlandı · {currentStudentCalc.scoreOutOf100} Puan (
                        {currentStudentCalc.performanceLabel})
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 font-mono-num">
                        · {currentStudentCalc.completedCriteriaCount}/
                        {currentStudentCalc.totalCriteriaCount} kriter
                        {currentStudentCalc.completedCriteriaCount > 0
                          ? ` · ${currentStudentCalc.scoreOutOf100} Puan`
                          : ''}
                      </span>
                    )}
                    {currentEvaluation.evaluatedViaGroup && (
                      <span className="text-xs text-sky-700 font-medium">
                        · {currentEvaluation.evaluatedViaGroup}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleAssignFullScoreToStudent}
                      title="Tüm ölçütlere tam puan ver"
                      className="h-7 px-2.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Tam Puan
                    </button>
                    {currentStudentCalc.completedCriteriaCount > 0 && (
                      <button
                        type="button"
                        onClick={handleResetStudentScores}
                        title="Öğrencinin bu oturumdaki puanlarını sıfırla"
                        className="h-7 px-2 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Sıfırla
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleGoToNextPendingStudent}
                      className="h-7 px-2.5 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Sonraki Öğrenci</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Compact Rubric Criteria Rows */}
                <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
                  {activeRubric.criteria.map((criterion, idx) => {
                    const selectedPoints =
                      currentEvaluation.criterionScores[criterion.id] || 0;

                    return (
                      <div
                        key={criterion.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5"
                      >
                        <div className="xl:w-64 2xl:w-72 shrink-0 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-mono-num text-xs font-bold text-slate-400 shrink-0">
                              {idx + 1}.
                            </span>
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                              {criterion.title}
                            </h4>
                          </div>
                          <div className="text-[11px] text-slate-500 pl-4 mt-0.5">
                            %{criterion.weight} ağırlık · {criterion.category}
                          </div>
                        </div>

                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                          {criterion.levels.map((lvl) => {
                            const isSelected = selectedPoints === lvl.points;
                            return (
                              <button
                                key={lvl.level}
                                type="button"
                                onClick={() =>
                                  handleSelectCriterionLevel(criterion.id, lvl.points)
                                }
                                aria-pressed={isSelected}
                                className={`px-2.5 py-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-start gap-0.5 ${
                                  isSelected
                                    ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                                    : 'bg-white text-slate-800 border-slate-200 hover:border-sky-400 hover:bg-sky-50/30'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={`text-xs font-bold truncate ${
                                      isSelected ? 'text-white' : 'text-slate-900'
                                    }`}
                                  >
                                    {lvl.points} · {lvl.label}
                                  </span>
                                  {isSelected && (
                                    <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5] text-white" />
                                  )}
                                </div>
                                <p
                                  className={`text-[11px] leading-snug line-clamp-2 ${
                                    isSelected ? 'text-sky-100' : 'text-slate-500'
                                  }`}
                                >
                                  {lvl.description}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Compact Observation Notes & Quick Pedagogical Tags Dock */}
                <div className="pt-2 border-t border-slate-200 flex flex-wrap lg:flex-nowrap items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 shrink-0">
                    {QUICK_OBSERVATION_TAGS.slice(0, 4).map((tag) => {
                      const active = currentEvaluation.tags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleStudentTag(tag)}
                          className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {active && <Check className="w-2.5 h-2.5" />}
                          <span>{active ? tag : `+ ${tag}`}</span>
                        </button>
                      );
                    })}
                  </div>

                  <input
                    id="student-observation-note"
                    type="text"
                    value={currentEvaluation.note}
                    onChange={(e) => handleStudentNoteChange(e.target.value)}
                    placeholder={`${currentStudent.fullName} için gözlem notu...`}
                    className="flex-1 min-w-[180px] h-8 px-3 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
                Bu sınıfta henüz öğrenci bulunmuyor. Sınıflar sekmesinden öğrenci ekleyebilirsiniz.
              </div>
            )}
          </div>
        </div>
      ) : activeSession.mode === 'grid' ? (
        /* FAST EVALUATION: SIMPLIFIED SPLIT VIEW (STUDENTS LEFT, COMPACT CRITERIA RIGHT) */
        <section
          aria-label="Hızlı Değerlendirme Paneli"
          className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl p-2.5 sm:p-3 flex flex-col gap-2 md:overflow-hidden"
        >
          {/* Single-Row Simplified Header */}
          <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 pb-2 border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={handleExitFastEvaluation}
                data-testid="fast-eval-back-btn"
                title="Hızlı değerlendirme ekranından çık (Esc)"
                className="h-8 px-3 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 touch-manipulation"
              >
                <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Geri</span>
              </button>

              <h2 className="text-sm sm:text-base font-bold text-slate-900 whitespace-nowrap shrink-0">
                Hızlı Değerlendirme
              </h2>

              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                ·
              </span>

              <span className="text-xs text-slate-600 truncate hidden sm:inline">
                {activeClassroom.name} · {activeRubric.title}
              </span>

              <span className="text-slate-300 hidden md:inline" aria-hidden="true">
                ·
              </span>

              <span className="text-xs font-semibold text-slate-700 font-mono-num whitespace-nowrap shrink-0">
                {sessionStats.completedCount}/{sessionStats.totalCount} Öğrenci
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setAutoAdvanceEnabled((prev) => !prev)}
                className={`h-7 px-2.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  autoAdvanceEnabled
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-slate-100 text-slate-600 border-slate-300'
                }`}
                title="Öğrencinin tüm kriterleri puanlandığında sıradaki öğrenciye otomatik geç"
              >
                <Zap
                  className={`w-3.5 h-3.5 ${
                    autoAdvanceEnabled ? 'fill-emerald-600 text-emerald-600' : 'text-slate-400'
                  }`}
                />
                <span>Otomatik Geçiş: {autoAdvanceEnabled ? 'Açık' : 'Kapalı'}</span>
              </button>

              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setFastFlowSubMode('flow')}
                  className={`h-6 px-2.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                    fastFlowSubMode === 'flow'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                  Hızlı Puanlama
                </button>
                <button
                  type="button"
                  onClick={() => setFastFlowSubMode('matrix')}
                  className={`h-6 px-2.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                    fastFlowSubMode === 'matrix'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Table className="w-3 h-3 text-slate-600" />
                  Matris Tablosu
                </button>
              </div>
            </div>
          </div>

          {fastFlowSubMode === 'flow' ? (
            /* SOLDA ÖĞRENCİ LİSTESİ · SAĞDA KOMPAKT KRİTER PUANLAMA SATIRLARI */
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-2.5 md:overflow-hidden">
              {/* Left Column: Student Roster */}
              <aside
                aria-label="Hızlı Değerlendirme Öğrenci Listesi"
                className="md:col-span-4 lg:col-span-3 bg-slate-50/70 border border-slate-200 rounded-xl p-2 flex flex-col min-h-0 gap-1.5"
              >
                {/* Filter Tabs */}
                <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-200/70 rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setStudentFilter('all')}
                    className={`py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      studentFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tümü ({classStudents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentFilter('pending')}
                    className={`py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      studentFilter === 'pending'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bekleyen ({classStudents.length - sessionStats.completedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentFilter('completed')}
                    className={`py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      studentFilter === 'completed'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Biten ({sessionStats.completedCount})
                  </button>
                </div>

                {/* Student List */}
                <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto pr-0.5">
                  {filteredStudents.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      Öğrenci bulunamadı.
                    </div>
                  ) : (
                    filteredStudents.map((stu) => {
                      const ev = activeSession.evaluations[stu.id];
                      const sCalc = calculateWeightedScore(
                        activeRubric,
                        ev?.criterionScores || {}
                      );
                      const isCurrent = currentStudent?.id === stu.id;

                      return (
                        <button
                          key={stu.id}
                          type="button"
                          onClick={() => handleTransitionToStudent(stu.id)}
                          className={`w-full px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer flex items-center justify-between gap-2 border ${
                            isCurrent
                              ? 'bg-sky-700 text-white border-sky-700 shadow-2xs'
                              : sCalc.isComplete
                              ? 'bg-white text-slate-900 border-emerald-200 hover:bg-emerald-50/50'
                              : 'bg-white text-slate-800 border-slate-200/80 hover:bg-slate-100'
                          }`}
                        >
                          <div className="min-w-0 flex items-center gap-1.5">
                            <span
                              className={`font-mono-num text-[11px] font-semibold shrink-0 ${
                                isCurrent ? 'text-sky-200' : 'text-slate-400'
                              }`}
                            >
                              #{stu.studentNumber}
                            </span>
                            <span className="text-xs sm:text-sm font-semibold truncate">
                              {stu.fullName}
                            </span>
                          </div>

                          <div className="shrink-0 font-mono-num text-xs font-bold flex items-center gap-1">
                            {sCalc.isComplete ? (
                              <span
                                className={`inline-flex items-center gap-0.5 ${
                                  isCurrent ? 'text-white' : 'text-emerald-700'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                {sCalc.scoreOutOf100}
                              </span>
                            ) : sCalc.completedCriteriaCount > 0 ? (
                              <span
                                className={`text-[11px] ${
                                  isCurrent ? 'text-sky-100' : 'text-amber-700'
                                }`}
                              >
                                {sCalc.completedCriteriaCount}/{sCalc.totalCriteriaCount}
                              </span>
                            ) : (
                              <span
                                className={`text-[11px] font-normal ${
                                  isCurrent ? 'text-sky-200' : 'text-slate-300'
                                }`}
                              >
                                —
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Prev / Next Student Buttons */}
                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-200/80 shrink-0">
                  <button
                    type="button"
                    onClick={handleFastFlowPrevStudent}
                    className="h-8 px-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Önceki</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFastFlowNextStudent}
                    className="h-8 px-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>Sonraki</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </aside>

              {/* Right Column: Selected Student Criteria & Fast Grading */}
              {currentStudent ? (
                <article
                  aria-label={`${currentStudent.fullName} Kriter Puanlama Alanı`}
                  className="md:col-span-8 lg:col-span-9 bg-white border border-slate-200 rounded-xl p-2.5 sm:p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden"
                >
                  {/* Top Student Summary Bar (Single clean row, no repetition) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 shrink-0">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-mono-num text-xs font-bold text-slate-500">
                        #{currentStudent.studentNumber}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                        {currentStudent.fullName}
                      </h3>

                      {currentStudentCalc.isComplete ? (
                        <span
                          data-testid="student-completed-badge"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono-num"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Tamamlandı · {currentStudentCalc.scoreOutOf100} Puan (
                          {currentStudentCalc.performanceLabel})
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 font-mono-num">
                          · {currentStudentCalc.completedCriteriaCount}/
                          {currentStudentCalc.totalCriteriaCount} kriter
                          {currentStudentCalc.completedCriteriaCount > 0
                            ? ` · ${currentStudentCalc.scoreOutOf100} Puan`
                            : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {currentStudentCalc.isComplete && (
                        <div
                          data-testid="student-completion-confirmation"
                          className="flex items-center gap-1.5"
                        >
                          {autoTransitionTargetStudent ? (
                            <>
                              <button
                                type="button"
                                onClick={cancelAutoTransition}
                                className="h-7 px-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                              >
                                Durdur
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleTransitionToStudent(autoTransitionTargetStudent.id)
                                }
                                className="h-7 px-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <span>
                                  Sonraki: #{autoTransitionTargetStudent.studentNumber}{' '}
                                  {autoTransitionTargetStudent.fullName}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : nextPendingStudentForCurrent ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleTransitionToStudent(nextPendingStudentForCurrent.id)
                              }
                              className="h-7 px-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <span>
                                Sıradaki: #{nextPendingStudentForCurrent.studentNumber}{' '}
                                {nextPendingStudentForCurrent.fullName}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={onNavigateToReports}
                              className="h-7 px-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <span>Raporlara Git</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleAssignFullScoreToStudent}
                        title="Tüm kriterlere tam puan ver"
                        className="h-7 px-2.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Tam Puan</span>
                      </button>

                      {currentStudentCalc.completedCriteriaCount > 0 && (
                        <button
                          type="button"
                          onClick={handleResetStudentScores}
                          title="Puanları sıfırla"
                          className="h-7 px-2 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Sıfırla</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Compact Criterion Rows: Title on Left, 4 Compact Score Buttons on Right */}
                  <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
                    {activeRubric.criteria.map((crit, cIdx) => {
                      const selectedPts = currentEvaluation.criterionScores[crit.id];
                      const isFocusedRow = fastFlowCriterionIndex === cIdx;

                      return (
                        <div
                          key={crit.id}
                          onClick={() => setFastFlowCriterionIndex(cIdx)}
                          className={`rounded-xl border px-3 py-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 transition-colors ${
                            isFocusedRow
                              ? 'bg-sky-50/40 border-sky-300'
                              : 'bg-slate-50/40 border-slate-200'
                          }`}
                        >
                          {/* Criterion Title & Weight */}
                          <div className="xl:w-64 2xl:w-72 shrink-0 min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="font-mono-num text-xs font-bold text-slate-400 shrink-0">
                                {cIdx + 1}.
                              </span>
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                                {crit.title}
                              </h4>
                            </div>
                            <div className="text-[11px] text-slate-500 pl-4 mt-0.5">
                              %{crit.weight} ağırlık · {crit.category}
                            </div>
                          </div>

                          {/* 4 Compact Level Buttons */}
                          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                            {crit.levels.map((lvl) => {
                              const isSelected = selectedPts === lvl.points;
                              return (
                                <button
                                  key={lvl.level}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFastFlowCriterionIndex(cIdx);
                                    handleFastFlowAnswer(lvl.points, crit.id);
                                  }}
                                  aria-pressed={isSelected}
                                  className={`px-2.5 py-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-start gap-0.5 touch-manipulation active:scale-[0.99] ${
                                    isSelected
                                      ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                                      : 'bg-white text-slate-800 border-slate-200 hover:border-sky-400 hover:bg-sky-50/40'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span
                                      className={`text-xs font-bold truncate ${
                                        isSelected ? 'text-white' : 'text-slate-900'
                                      }`}
                                    >
                                      {lvl.points} · {lvl.label}
                                    </span>
                                    {isSelected && (
                                      <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5] text-white" />
                                    )}
                                  </div>
                                  <p
                                    className={`text-[11px] leading-snug line-clamp-2 ${
                                      isSelected ? 'text-sky-100' : 'text-slate-500'
                                    }`}
                                  >
                                    {lvl.description}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Compact Bottom Observation Note */}
                  <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 pt-1.5 border-t border-slate-100 shrink-0">
                    <div className="flex items-center gap-1 shrink-0">
                      {QUICK_OBSERVATION_TAGS.slice(0, 4).map((tag) => {
                        const active = currentEvaluation.tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleToggleStudentTag(tag)}
                            className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                              active
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {active && <Check className="w-2.5 h-2.5 stroke-[2.5]" />}
                            <span>{active ? tag : `+ ${tag}`}</span>
                          </button>
                        );
                      })}
                    </div>

                    <input
                      id="match-card-note"
                      type="text"
                      value={currentEvaluation.note}
                      onChange={(e) => handleStudentNoteChange(e.target.value)}
                      placeholder={`${currentStudent.fullName} için gözlem notu...`}
                      className="flex-1 min-w-[180px] h-8 px-3 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>
                </article>
              ) : (
                <div className="md:col-span-8 lg:col-span-9 py-12 text-center text-slate-500 bg-white border border-slate-200 rounded-xl">
                  Bu sınıfta değerlendirilecek öğrenci bulunmuyor.
                </div>
              )}
            </div>
          ) : (
            /* MATRİS TABLOSU GÖRÜNÜMÜ — YATAYDA VE DİKEYDE TEK EKRANA SIĞAN KOMPAKT TABLO */
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Puanlama Biçimi:</span>
                  <div className="flex items-center gap-1 p-0.5 bg-slate-200 rounded-md">
                    <button
                      type="button"
                      onClick={() => setGridInputType('buttons')}
                      className={`px-2.5 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                        gridInputType === 'buttons'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Buton Grubu (1-4)
                    </button>
                    <button
                      type="button"
                      onClick={() => setGridInputType('dropdown')}
                      className={`px-2.5 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                        gridInputType === 'dropdown'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Açılır Liste (Dropdown)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1 p-0.5 bg-slate-200 rounded-md">
                  <button
                    type="button"
                    onClick={() => setStudentFilter('all')}
                    className={`px-2.5 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                      studentFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tümü ({classStudents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentFilter('pending')}
                    className={`px-2.5 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                      studentFilter === 'pending'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bekleyen ({classStudents.length - sessionStats.completedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentFilter('completed')}
                    className={`px-2.5 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                      studentFilter === 'completed'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Biten ({sessionStats.completedCount})
                  </button>
                </div>
              </div>

              {/* Matrix Table — Full-width zero-horizontal-scroll table */}
              <div className="flex-1 min-h-0 border border-slate-200 rounded-xl overflow-auto">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead className="sticky top-0 z-20 bg-slate-50">
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-700 align-top">
                      <th className="py-2 px-3 w-[17%] font-bold bg-slate-50 border-r border-slate-200">
                        Öğrenci (No · Ad Soyad)
                      </th>
                      {activeRubric.criteria.map((criterion, idx) => {
                        const maxPts = Math.max(...criterion.levels.map((l) => l.points), 4);
                        return (
                          <th key={criterion.id} className="py-2 px-2 w-[15%]">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] font-semibold text-slate-500 font-mono-num">
                                0{idx + 1} · %{criterion.weight}
                              </span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleGridBulkCriterionFill(criterion.id, 3, true)
                                  }
                                  title="Bu ölçütte henüz puanlanmamış öğrencilere 3 (Yetkin) puan ata"
                                  className="px-1 py-0.5 text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                                >
                                  Boşlara 3P
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleGridBulkCriterionFill(criterion.id, maxPts, false)
                                  }
                                  title={`Bu ölçütte listedeki tüm öğrencilere ${maxPts} (Tam) puan ata`}
                                  className="px-1 py-0.5 text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 cursor-pointer whitespace-nowrap"
                                >
                                  Tümüne {maxPts}P
                                </button>
                              </div>
                            </div>
                            <div
                              className="font-bold text-slate-900 text-[11px] mt-0.5 truncate"
                              title={criterion.title}
                            >
                              {criterion.title}
                            </div>
                          </th>
                        );
                      })}
                      <th className="py-2 px-2 w-[7%] text-right font-bold">
                        Toplam
                      </th>
                      <th className="py-2 px-2.5 w-[16%] font-bold">
                        Gözlem Notu & İşlem
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={activeRubric.criteria.length + 3}
                          className="py-8 text-center text-xs text-slate-500"
                        >
                          Bu filtreye uygun öğrenci bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((stu) => {
                        const ev = activeSession.evaluations[stu.id];
                        const scores = ev?.criterionScores || {};
                        const calc = calculateWeightedScore(activeRubric, scores);

                        return (
                          <tr
                            key={stu.id}
                            className="hover:bg-slate-50/80 transition-colors align-middle"
                          >
                            {/* Student Identity Cell */}
                            <td className="py-1.5 px-3 bg-white border-r border-slate-200">
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedStudentId(stu.id);
                                    setFastFlowSubMode('flow');
                                  }}
                                  title="Seri akışta bu öğrenciyi değerlendir"
                                  className="text-left font-bold text-slate-900 hover:text-sky-700 transition-colors cursor-pointer block truncate w-full"
                                >
                                  <span className="font-mono-num text-slate-500 mr-1">
                                    #{stu.studentNumber}
                                  </span>
                                  {stu.fullName}
                                </button>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                  <span className="font-mono-num">
                                    {calc.completedCriteriaCount}/{calc.totalCriteriaCount} ölçüt
                                  </span>
                                  {ev?.evaluatedViaGroup && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-sky-700 truncate">
                                        {ev.evaluatedViaGroup}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Criterion Cells */}
                            {activeRubric.criteria.map((criterion) => {
                              const selectedPts = scores[criterion.id] || 0;
                              return (
                                <td key={criterion.id} className="py-1.5 px-2">
                                  {gridInputType === 'buttons' ? (
                                    <div
                                      role="group"
                                      aria-label={`${stu.fullName} - ${criterion.title}`}
                                      className="grid grid-cols-4 gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80"
                                    >
                                      {criterion.levels.map((lvl) => {
                                        const isSelected = selectedPts === lvl.points;
                                        return (
                                          <button
                                            key={lvl.level}
                                            type="button"
                                            onClick={() =>
                                              handleGridSelectScore(
                                                stu.id,
                                                criterion.id,
                                                lvl.points
                                              )
                                            }
                                            aria-pressed={isSelected}
                                            aria-label={`${stu.fullName} ${criterion.title} ${lvl.points} Puan`}
                                            title={`${lvl.label} (${lvl.points} Puan): ${lvl.description}`}
                                            className={`h-7 rounded font-mono-num text-xs font-bold transition-colors cursor-pointer flex items-center justify-center ${
                                              isSelected
                                                ? 'bg-sky-700 text-white shadow-2xs'
                                                : 'bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-800'
                                            }`}
                                          >
                                            <span>{lvl.points}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <select
                                      aria-label={`${stu.fullName} ${criterion.title} puanı`}
                                      value={selectedPts > 0 ? String(selectedPts) : ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') {
                                          const existing = activeSession.evaluations[stu.id] || {
                                            studentId: stu.id,
                                            criterionScores: {},
                                            note: '',
                                            tags: [],
                                            updatedAt: new Date().toISOString(),
                                          };
                                          const nextScores = { ...existing.criterionScores };
                                          delete nextScores[criterion.id];
                                          onUpdateSession({
                                            ...activeSession,
                                            evaluations: {
                                              ...activeSession.evaluations,
                                              [stu.id]: {
                                                ...existing,
                                                criterionScores: nextScores,
                                                updatedAt: new Date().toISOString(),
                                              },
                                            },
                                          });
                                        } else {
                                          handleGridSelectScore(
                                            stu.id,
                                            criterion.id,
                                            Number(val)
                                          );
                                        }
                                      }}
                                      className={`w-full h-7 px-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-600 ${
                                        selectedPts > 0
                                          ? 'bg-sky-50 text-sky-900 border-sky-300 font-bold'
                                          : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                                      }`}
                                    >
                                      <option value="">— Seç —</option>
                                      {criterion.levels.map((lvl) => (
                                        <option key={lvl.level} value={lvl.points}>
                                          {lvl.points}P — {lvl.label}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                              );
                            })}

                            {/* Total Score Cell */}
                            <td className="py-1.5 px-2 text-right">
                              {calc.completedCriteriaCount > 0 ? (
                                <div>
                                  <span
                                    className={`font-mono-num text-sm font-bold ${
                                      calc.scoreOutOf100 >= 85
                                        ? 'text-emerald-700'
                                        : calc.scoreOutOf100 >= 70
                                        ? 'text-sky-700'
                                        : calc.scoreOutOf100 >= 50
                                        ? 'text-amber-700'
                                        : 'text-red-700'
                                    }`}
                                  >
                                    {calc.scoreOutOf100}
                                  </span>
                                  <span className="block text-[10px] text-slate-500 truncate">
                                    {calc.performanceLabel}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">Bekliyor</span>
                              )}
                            </td>

                            {/* Actions & Note */}
                            <td className="py-1.5 px-2.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  aria-label={`${stu.fullName} gözlem notu`}
                                  value={ev?.note || ''}
                                  onChange={(e) =>
                                    handleGridStudentNoteChange(stu.id, e.target.value)
                                  }
                                  placeholder="Not..."
                                  className="w-full min-w-0 h-7 px-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-600"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleGridAssignFullRowScore(stu.id)}
                                  title={`${stu.fullName} için tüm ölçütlere tam puan ver`}
                                  aria-label={`${stu.fullName} tam puan ver`}
                                  className="h-7 w-7 flex items-center justify-center text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 cursor-pointer shrink-0"
                                >
                                  <CheckCheck className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleGridResetRowScore(stu.id)}
                                  title={`${stu.fullName} puanlarını sıfırla`}
                                  aria-label={`${stu.fullName} puanlarını sıfırla`}
                                  className="h-7 w-7 flex items-center justify-center text-slate-500 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 cursor-pointer shrink-0"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : (
        /* GROUP EVALUATION MODE — SINGLE-SCREEN 2x2 RUBRIC LAYOUT */
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-stretch md:overflow-hidden">
          {/* Left Column: Group List & Create Group Form */}
          <aside
            aria-label="Öğrenci Grupları"
            className="md:col-span-4 lg:col-span-3 bg-white border border-slate-200 rounded-xl p-3 flex flex-col min-h-0 gap-2 overflow-y-auto"
          >
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                Çalışma Grupları ({activeSession.groups.length})
              </h2>
              <button
                type="button"
                onClick={() => setIsAddingGroup((prev) => !prev)}
                className="px-2.5 py-1 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Yeni Grup Oluştur
              </button>
            </div>

            {isAddingGroup && (
              <form
                onSubmit={handleCreateGroup}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 shrink-0"
              >
                <div>
                  <label
                    htmlFor="new-group-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Grup Adı
                  </label>
                  <input
                    id="new-group-name"
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Örn: Grup 4: Mikroskop Ekibi"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-1">
                    Grup Üyelerini Seçin ({newGroupStudentIds.length} seçili)
                  </span>
                  <div className="max-h-32 overflow-y-auto space-y-1 bg-white p-1.5 border border-slate-200 rounded-md">
                    {classStudents.map((stu) => {
                      const checked = newGroupStudentIds.includes(stu.id);
                      return (
                        <label
                          key={stu.id}
                          className="flex items-center gap-2 text-xs text-slate-800 py-0.5 px-1.5 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setNewGroupStudentIds((prev) =>
                                checked
                                  ? prev.filter((id) => id !== stu.id)
                                  : [...prev, stu.id]
                              );
                            }}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                          />
                          <span className="font-mono-num text-slate-500">
                            #{stu.studentNumber}
                          </span>
                          <span className="font-medium truncate">{stu.fullName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingGroup(false)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-sky-700 rounded-md hover:bg-sky-800 cursor-pointer"
                  >
                    Grubu Kaydet
                  </button>
                </div>
              </form>
            )}

            <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
              {activeSession.groups.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Bu oturum için henüz grup oluşturulmadı. &ldquo;Yeni Grup Oluştur&rdquo; düğmesiyle öğrencileri gruplayabilirsiniz.
                </div>
              ) : (
                activeSession.groups.map((grp) => {
                  const calc = calculateWeightedScore(activeRubric, grp.criterionScores);
                  const isSelected = currentGroup?.id === grp.id;
                  const memberNames = grp.studentIds
                    .map((id) => classStudents.find((s) => s.id === id)?.fullName)
                    .filter(Boolean)
                    .join(', ');

                  return (
                    <div
                      key={grp.id}
                      onClick={() => setSelectedGroupId(grp.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedGroupId(grp.id);
                      }}
                      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-sky-50/90 border-sky-600'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {grp.name}
                        </span>
                        <span className="font-mono-num text-xs sm:text-sm font-bold text-sky-700 shrink-0">
                          {calc.completedCriteriaCount > 0 ? `${calc.scoreOutOf100}/100` : '—'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">
                        Üyeler ({grp.studentIds.length}): {memberNames || 'Üye yok'}
                      </p>
                      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          {grp.lastAppliedAt && <Check className="w-3 h-3 text-emerald-600" />}
                          {grp.lastAppliedAt
                            ? 'Üyelere aktarıldı'
                            : 'Henüz üyelere aktarılmadı'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteGroup(grp.id);
                          }}
                          aria-label={`${grp.name} grubunu sil`}
                          className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right Column: Group 2x2 Scoring & Compact Note Dock */}
          <div className="md:col-span-8 lg:col-span-9 flex flex-col min-h-0">
            {currentGroup && currentGroupCalc ? (
              <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between gap-2.5 md:overflow-hidden">
                {groupBannerMessage && (
                  <div
                    role="status"
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between shrink-0"
                  >
                    <span>{groupBannerMessage}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200 shrink-0">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500">
                      Grup Değerlendirmesi · {currentGroup.studentIds.length} Öğrenci
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                      {currentGroup.name}
                    </h2>
                    <p className="text-[11px] text-slate-600 truncate">
                      Üyeler:{' '}
                      {currentGroup.studentIds
                        .map((id) => {
                          const s = classStudents.find((stu) => stu.id === id);
                          return s ? `${s.fullName} (#${s.studentNumber})` : '';
                        })
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Grup Puanı
                      </div>
                      <div className="font-mono-num text-xl sm:text-2xl font-bold text-slate-900">
                        {currentGroupCalc.scoreOutOf100}
                        <span className="text-xs font-normal text-slate-500"> / 100</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handlePropagateGroupToMembers}
                      className="h-9 px-3.5 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Grup Puanlarını Üyelere Aktar
                    </button>
                  </div>
                </div>

                {/* Group Rubric 2x2 Matrix */}
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-stretch overflow-y-auto md:overflow-hidden">
                  {activeRubric.criteria.map((criterion, idx) => {
                    const selectedPoints =
                      currentGroup.criterionScores[criterion.id] || 0;

                    return (
                      <div
                        key={criterion.id}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between gap-2 min-h-0"
                      >
                        <div className="flex items-center justify-between shrink-0">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            0{idx + 1}. {criterion.title}
                          </h4>
                          <span className="text-[11px] font-mono-num text-slate-600 shrink-0">
                            Ağırlık: %{criterion.weight}
                          </span>
                        </div>
                        <div className="flex-1 min-h-0 grid grid-cols-4 gap-1.5 items-stretch">
                          {criterion.levels.map((lvl) => {
                            const isSelected = selectedPoints === lvl.points;
                            return (
                              <button
                                key={lvl.level}
                                type="button"
                                onClick={() =>
                                  handleSelectGroupCriterionLevel(criterion.id, lvl.points)
                                }
                                className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between min-h-0 ${
                                  isSelected
                                    ? 'bg-sky-700 text-white border-sky-800'
                                    : 'bg-white text-slate-800 border-slate-200 hover:border-sky-400'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="text-[11px] font-bold truncate">{lvl.label}</span>
                                  <span className="font-mono-num text-[11px] font-bold shrink-0">
                                    {lvl.points}P
                                  </span>
                                </div>
                                <p
                                  className={`text-[11px] leading-snug line-clamp-2 xl:line-clamp-3 ${
                                    isSelected ? 'text-sky-50' : 'text-slate-600'
                                  }`}
                                >
                                  {lvl.description}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Compact Group Observation Note Dock */}
                <div className="pt-2.5 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                  <label
                    htmlFor="group-note-textarea"
                    className="text-xs font-bold text-slate-900 whitespace-nowrap shrink-0"
                  >
                    Grup Gözlem Notu:
                  </label>
                  <input
                    id="group-note-textarea"
                    type="text"
                    value={currentGroup.groupNote}
                    onChange={(e) => handleGroupNoteChange(e.target.value)}
                    placeholder="Grubun işbirliği, görev paylaşımı ve ortak çıktısı hakkında gözlem notu..."
                    className="flex-1 h-9 px-3 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                  <button
                    type="button"
                    onClick={handlePropagateGroupToMembers}
                    className="h-9 px-4 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Grup Puanlarını ve Notunu {currentGroup.studentIds.length} Üyeye Aktar
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
                Değerlendirmek için sol taraftan bir çalışma grubu seçin veya yeni grup oluşturun.
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Session Creation Modal */}
      {isNewSessionModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-session-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 id="new-session-modal-title" className="text-lg font-bold text-slate-900">
              Yeni Değerlendirme Oturumu Başlat
            </h3>
            <form onSubmit={handleCreateNewSessionSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="new-session-title-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Değerlendirme Başlığı
                </label>
                <input
                  id="new-session-title-input"
                  type="text"
                  value={newSessionTitle}
                  onChange={(e) => {
                    setNewSessionTitle(e.target.value);
                    setNewSessionError('');
                  }}
                  placeholder="Örn: 4. Ünite Saf Maddeler Sunum Değerlendirmesi"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
                {newSessionError && (
                  <p className="text-xs text-red-600 mt-1">{newSessionError}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="new-session-class-select"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Sınıf Seçin
                </label>
                <select
                  id="new-session-class-select"
                  value={newSessionClassId}
                  onChange={(e) => setNewSessionClassId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                >
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.subject})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="new-session-rubric-select"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Değerlendirme Rubriği Seçin
                </label>
                <select
                  id="new-session-rubric-select"
                  value={newSessionRubricId}
                  onChange={(e) => setNewSessionRubricId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                >
                  {rubrics.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({r.criteria.length} Ölçüt)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewSessionModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 cursor-pointer"
                >
                  Oturumu Oluştur ve Başla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
