import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Users,
  Grid,
  UserCheck,
  Plus,
  Download,
  FileDown,
  Undo2,
  ShieldCheck,
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
  getStudentEvaluationBreakdown,
  getEffectiveSessionRubric,
  freezeRubricSnapshot,
  applyGroupScoresToMembers,
  applyCriterionScoreToStudents,
  getSessionProgressStats,
  getNextPendingStudent,
  recordSessionUndoEntry,
  generateSessionCsv,
} from '../utils/rubricLogic.ts';
import { downloadSessionPdfFile } from '../utils/pdfGenerator.ts';
import { FastEvaluationView } from './evaluation/FastEvaluationView.tsx';
import { MatrixEvaluationView } from './evaluation/MatrixEvaluationView.tsx';
import { IndividualEvaluationView } from './evaluation/IndividualEvaluationView.tsx';
import { GroupEvaluationView } from './evaluation/GroupEvaluationView.tsx';

interface EvaluationWorkspaceProps {
  classrooms: Classroom[];
  students: Student[];
  rubrics: Rubric[];
  sessions: EvaluationSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onUpdateSession: (updatedSession: EvaluationSession) => void;
  onCreateSession: (newSession: EvaluationSession) => void;
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
}) => {
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  const rubricsById = useMemo(() => {
    const map: Record<string, Rubric> = {};
    for (const r of rubrics) map[r.id] = r;
    return map;
  }, [rubrics]);

  // P0 #3: Use the session's frozen rubric snapshot so editing templates never alters past session grades
  const activeRubric = useMemo(
    () =>
      getEffectiveSessionRubric(activeSession, rubricsById) || rubrics[0],
    [activeSession, rubricsById, rubrics]
  );

  // P1 #9: Multi-classroom session support (classIds array)
  const sessionClassIds = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.classIds && activeSession.classIds.length > 0
      ? activeSession.classIds
      : [activeSession.classId];
  }, [activeSession]);

  const activeClassroom = useMemo(
    () =>
      classrooms.find((c) => c.id === activeSession?.classId) || classrooms[0],
    [classrooms, activeSession]
  );

  const classStudents = useMemo(() => {
    const allowed = new Set(sessionClassIds);
    return students
      .filter((s) => allowed.has(s.classId) && !s.archived)
      .sort((a, b) =>
        a.studentNumber.localeCompare(b.studentNumber, undefined, {
          numeric: true,
        })
      );
  }, [students, sessionClassIds]);

  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    return classStudents[0]?.id || '';
  });
  const [studentFilter, setStudentFilter] = useState<
    'all' | 'pending' | 'completed'
  >('all');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    return activeSession?.groups[0]?.id || '';
  });

  // New Session Modal State (with Multi-classroom support P1 #9)
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionClassIds, setNewSessionClassIds] = useState<string[]>([
    classrooms[0]?.id || '',
  ]);
  const [newSessionRubricId, setNewSessionRubricId] = useState(
    rubrics[0]?.id || ''
  );

  // Fast Mode & Precision Scoring State
  const [activeCriterionIndex, setActiveCriterionIndex] = useState<number>(0);
  const [autoAdvanceStudent, setAutoAdvanceStudent] = useState<boolean>(false);
  const [precisionScoringMode, setPrecisionScoringMode] =
    useState<boolean>(false);
  const [fastFlowSubMode, setFastFlowSubMode] = useState<'serial' | 'matrix'>(
    'serial'
  );
  const [statusAnnouncement, setStatusAnnouncement] = useState<string>('');
  const [fastCompletionBanner, setFastCompletionBanner] = useState<{
    completedStudentName: string;
    scoreOutOf100: number;
    nextStudentId: string | null;
    nextStudentName: string | null;
  } | null>(null);

  const [justCompletedBanner, setJustCompletedBanner] = useState<{
    completedStudentId: string;
    completedStudentName: string;
    scoreOutOf100: number;
    performanceLabel: string;
    nextStudentId: string | null;
    nextStudentName: string | null;
  } | null>(null);

  const [groupAppliedFeedback, setGroupAppliedFeedback] = useState<
    string | null
  >(null);

  // Sync selected student when session/class changes
  useEffect(() => {
    if (
      classStudents.length > 0 &&
      !classStudents.some((s) => s.id === selectedStudentId)
    ) {
      setSelectedStudentId(classStudents[0].id);
      setActiveCriterionIndex(0);
    }
  }, [classStudents, selectedStudentId]);

  useEffect(() => {
    if (activeSession?.groups && activeSession.groups.length > 0) {
      if (!activeSession.groups.some((g) => g.id === selectedGroupId)) {
        setSelectedGroupId(activeSession.groups[0].id);
      }
    } else {
      setSelectedGroupId('');
    }
  }, [activeSession, selectedGroupId]);

  const progressStats = useMemo(() => {
    if (!activeSession || !activeRubric) {
      return {
        totalStudents: 0,
        fullyEvaluatedCount: 0,
        partialCount: 0,
        unstartedCount: 0,
        completionPercent: 0,
      };
    }
    return getSessionProgressStats(
      classStudents,
      activeSession.evaluations,
      activeRubric
    );
  }, [classStudents, activeSession, activeRubric]);

  const filteredStudents = useMemo(() => {
    if (!activeSession || !activeRubric) return classStudents;
    return classStudents.filter((stu) => {
      const ev = activeSession.evaluations[stu.id];
      const calc = getStudentEvaluationBreakdown(
        activeRubric,
        ev
      ).effectiveCalc;
      if (studentFilter === 'completed') return calc.isComplete;
      if (studentFilter === 'pending') return !calc.isComplete;
      return true;
    });
  }, [classStudents, activeSession, activeRubric, studentFilter]);

  const selectedStudent = useMemo(
    () =>
      classStudents.find((s) => s.id === selectedStudentId) ||
      classStudents[0],
    [classStudents, selectedStudentId]
  );

  // Undo handler (P1 #7)
  const handleUndoLastAction = useCallback(() => {
    if (
      !activeSession ||
      !activeSession.undoHistory ||
      activeSession.undoHistory.length === 0
    ) {
      return;
    }
    const [latestUndo, ...remainingHistory] = activeSession.undoHistory;
    onUpdateSession({
      ...activeSession,
      evaluations: latestUndo.previousEvaluations,
      groups: latestUndo.previousGroups ?? activeSession.groups,
      undoHistory: remainingHistory,
    });
    setStatusAnnouncement(`Geri alındı: ${latestUndo.description}`);
  }, [activeSession, onUpdateSession]);

  // Select Criterion Level (0..4) for a student
  const handleSelectCriterionLevel = useCallback(
    (
      criterionId: string,
      points: number,
      options?: { advanceStudentOnComplete?: boolean }
    ) => {
      if (!activeSession || !selectedStudent || !activeRubric) return;

      const existing = activeSession.evaluations[selectedStudent.id];
      const prevCalc = calculateWeightedScore(
        activeRubric,
        existing?.criterionScores || {},
        existing?.directCriterionScores
      );

      const nextScores = {
        ...(existing?.criterionScores || {}),
        [criterionId]: points,
      };
      const nextDirect = { ...(existing?.directCriterionScores || {}) };
      delete nextDirect[criterionId];

      const updatedEval: StudentEvaluation = {
        ...existing,
        studentId: selectedStudent.id,
        criterionScores: nextScores,
        directCriterionScores: nextDirect,
        activeScoreSource: 'individual',
        note: existing?.note || '',
        tags: existing?.tags || [],
        updatedAt: new Date().toISOString(),
      };

      const nextEvaluations = {
        ...activeSession.evaluations,
        [selectedStudent.id]: updatedEval,
      };

      const undoHistory = recordSessionUndoEntry(activeSession, {
        scope: 'criterion',
        studentId: selectedStudent.id,
        criterionId,
        description: `${selectedStudent.fullName} — ölçüt puanı (${points}P)`,
        previousEvaluations: activeSession.evaluations,
      });

      onUpdateSession({
        ...activeSession,
        evaluations: nextEvaluations,
        undoHistory,
      });

      const newCalc = calculateWeightedScore(
        activeRubric,
        nextScores,
        nextDirect
      );
      setStatusAnnouncement(
        `${selectedStudent.fullName}: ${points} puan verildi (${newCalc.completedCriteriaCount}/${newCalc.totalCriteriaCount} ölçüt)`
      );

      if (newCalc.isComplete && newCalc.finalScoreOutOf100 !== null) {
        const nextPending = getNextPendingStudent(
          classStudents,
          nextEvaluations,
          activeRubric,
          selectedStudent.id
        );

        if (!prevCalc.isComplete) {
          setJustCompletedBanner({
            completedStudentId: selectedStudent.id,
            completedStudentName: selectedStudent.fullName,
            scoreOutOf100: newCalc.finalScoreOutOf100,
            performanceLabel: newCalc.performanceLabel,
            nextStudentId: nextPending?.id || null,
            nextStudentName: nextPending?.fullName || null,
          });
        }

        if (options?.advanceStudentOnComplete && nextPending) {
          setFastCompletionBanner({
            completedStudentName: selectedStudent.fullName,
            scoreOutOf100: newCalc.finalScoreOutOf100,
            nextStudentId: nextPending.id,
            nextStudentName: nextPending.fullName,
          });
          setSelectedStudentId(nextPending.id);
          setActiveCriterionIndex(0);
        } else if (activeSession.mode === 'grid') {
          setFastCompletionBanner({
            completedStudentName: selectedStudent.fullName,
            scoreOutOf100: newCalc.finalScoreOutOf100,
            nextStudentId: nextPending?.id || null,
            nextStudentName: nextPending?.fullName || null,
          });
        }
      } else {
        setJustCompletedBanner(null);
      }
    },
    [
      activeSession,
      selectedStudent,
      activeRubric,
      classStudents,
      onUpdateSession,
    ]
  );

  // Set Direct Integer Criterion Score (0..maxPoints) (P1 #2)
  const handleSetDirectCriterionScore = useCallback(
    (criterionId: string, directPoints: number | null) => {
      if (!activeSession || !selectedStudent) return;
      const existing = activeSession.evaluations[selectedStudent.id];
      const nextDirect = { ...(existing?.directCriterionScores || {}) };
      if (directPoints === null) {
        delete nextDirect[criterionId];
      } else {
        nextDirect[criterionId] = directPoints;
      }

      const undoHistory = recordSessionUndoEntry(activeSession, {
        scope: 'criterion',
        studentId: selectedStudent.id,
        criterionId,
        description: `${selectedStudent.fullName} — hassas tam sayı puanı`,
        previousEvaluations: activeSession.evaluations,
      });

      onUpdateSession({
        ...activeSession,
        evaluations: {
          ...activeSession.evaluations,
          [selectedStudent.id]: {
            ...existing,
            studentId: selectedStudent.id,
            criterionScores: existing?.criterionScores || {},
            directCriterionScores: nextDirect,
            activeScoreSource: 'individual',
            note: existing?.note || '',
            tags: existing?.tags || [],
            updatedAt: new Date().toISOString(),
          },
        },
        undoHistory,
      });
    },
    [activeSession, selectedStudent, onUpdateSession]
  );

  // Clear single criterion score to null (unscored) (P0 #1)
  const handleClearCriterionScore = useCallback(
    (criterionId: string) => {
      if (!activeSession || !selectedStudent) return;
      const existing = activeSession.evaluations[selectedStudent.id];
      if (!existing) return;

      const nextScores = { ...(existing.criterionScores || {}) };
      delete nextScores[criterionId];
      const nextDirect = { ...(existing.directCriterionScores || {}) };
      delete nextDirect[criterionId];

      const undoHistory = recordSessionUndoEntry(activeSession, {
        scope: 'criterion',
        studentId: selectedStudent.id,
        criterionId,
        description: `${selectedStudent.fullName} — ölçüt puanı temizlendi`,
        previousEvaluations: activeSession.evaluations,
      });

      onUpdateSession({
        ...activeSession,
        evaluations: {
          ...activeSession.evaluations,
          [selectedStudent.id]: {
            ...existing,
            criterionScores: nextScores,
            directCriterionScores: nextDirect,
            updatedAt: new Date().toISOString(),
          },
        },
        undoHistory,
      });
    },
    [activeSession, selectedStudent, onUpdateSession]
  );

  const handleResetStudentScores = useCallback(
    (studentId: string) => {
      if (!activeSession) return;
      const existing = activeSession.evaluations[studentId];
      if (!existing) return;

      const undoHistory = recordSessionUndoEntry(activeSession, {
        scope: 'student',
        studentId,
        description: 'Öğrenci bireysel puanları sıfırlandı',
        previousEvaluations: activeSession.evaluations,
      });

      onUpdateSession({
        ...activeSession,
        evaluations: {
          ...activeSession.evaluations,
          [studentId]: {
            ...existing,
            criterionScores: {},
            directCriterionScores: {},
            updatedAt: new Date().toISOString(),
          },
        },
        undoHistory,
      });
      setJustCompletedBanner(null);
      setFastCompletionBanner(null);
    },
    [activeSession, onUpdateSession]
  );

  // Change session rubric (and freeze new rubricSnapshot)
  const handleChangeSessionRubric = (rubricId: string) => {
    if (!activeSession) return;
    const targetRubric = rubricsById[rubricId];
    if (!targetRubric) return;
    onUpdateSession({
      ...activeSession,
      rubricId,
      rubricSnapshot: freezeRubricSnapshot(targetRubric),
    });
  };

  const handleCreateNewSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionTitle.trim() || newSessionClassIds.length === 0) return;
    const selectedRubric = rubricsById[newSessionRubricId] || rubrics[0];
    const newSession: EvaluationSession = {
      id: `ses-${Date.now()}`,
      title: newSessionTitle.trim(),
      classId: newSessionClassIds[0],
      classIds: newSessionClassIds,
      rubricId: selectedRubric.id,
      rubricSnapshot: freezeRubricSnapshot(selectedRubric),
      date: new Date().toISOString().slice(0, 10),
      status: 'in_progress',
      mode: 'individual',
      generalSessionNote: '',
      groups: [
        {
          id: `grp-${Date.now()}-1`,
          name: 'Grup 1: Çalışma Ekibi',
          studentIds: [],
          criterionScores: {},
          groupNote: '',
        },
      ],
      evaluations: {},
      undoHistory: [],
    };
    onCreateSession(newSession);
    onSelectSession(newSession.id);
    setNewSessionTitle('');
    setShowNewSessionModal(false);
  };

  const handleExportCsv = () => {
    if (!activeSession || !activeRubric) return;
    const csvContent = generateSessionCsv(
      activeSession,
      activeRubric,
      students
    );
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeTitle = activeSession.title
      .toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]/gi, '_');
    link.setAttribute('download', `degerlendirme_${safeTitle}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    if (!activeSession || !activeRubric || !activeClassroom) return;
    downloadSessionPdfFile(
      activeSession,
      activeRubric,
      activeClassroom,
      students
    );
  };

  if (!activeSession || !activeRubric) {
    return (
      <div className="p-8 text-center text-slate-600">
        Aktif bir değerlendirme oturumu bulunamadı.
      </div>
    );
  }

  // Dedicated Single-Screen Views for Hızlı Değerlendirme (Serial Card & Matrix)
  if (activeSession.mode === 'grid') {
    if (fastFlowSubMode === 'matrix') {
      return (
        <MatrixEvaluationView
          activeSession={activeSession}
          activeRubric={activeRubric}
          classStudents={classStudents}
          selectedStudentId={selectedStudent?.id || ''}
          activeCriterionIndex={activeCriterionIndex}
          onSelectCell={(stuId, critIdx) => {
            setSelectedStudentId(stuId);
            setActiveCriterionIndex(critIdx);
          }}
          onBackToFastCards={() => setFastFlowSubMode('serial')}
          onSetStudentCriterionScore={(studentId, criterionId, points) => {
            const existing = activeSession.evaluations[studentId];
            const undoHistory = recordSessionUndoEntry(activeSession, {
              scope: 'criterion',
              studentId,
              criterionId,
              description: `Matris puanlama (${points}P)`,
              previousEvaluations: activeSession.evaluations,
            });
            onUpdateSession({
              ...activeSession,
              evaluations: {
                ...activeSession.evaluations,
                [studentId]: {
                  ...existing,
                  studentId,
                  criterionScores: {
                    ...(existing?.criterionScores || {}),
                    [criterionId]: points,
                  },
                  activeScoreSource: 'individual',
                  note: existing?.note || '',
                  tags: existing?.tags || [],
                  updatedAt: new Date().toISOString(),
                },
              },
              undoHistory,
            });
          }}
          onBulkAssignCriterion={(criterionId, points, onlyUnscored) => {
            const undoHistory = recordSessionUndoEntry(activeSession, {
              scope: 'session',
              criterionId,
              description: `Toplu ölçüt puanı atama (${points}P)`,
              previousEvaluations: activeSession.evaluations,
            });
            const updatedEvaluations = applyCriterionScoreToStudents(
              activeSession.evaluations,
              classStudents.map((s) => s.id),
              criterionId,
              points,
              new Date().toISOString(),
              onlyUnscored
            );
            onUpdateSession({
              ...activeSession,
              evaluations: updatedEvaluations,
              undoHistory,
            });
          }}
          onUndoLastAction={handleUndoLastAction}
        />
      );
    }

    return (
      <FastEvaluationView
        activeSession={activeSession}
        activeRubric={activeRubric}
        allRubrics={rubrics}
        classrooms={classrooms}
        classStudents={classStudents}
        selectedStudent={selectedStudent}
        selectedStudentId={selectedStudent?.id || ''}
        onSelectStudent={setSelectedStudentId}
        onChangeSessionRubric={handleChangeSessionRubric}
        onExitFastMode={() =>
          onUpdateSession({ ...activeSession, mode: 'individual' })
        }
        onOpenMatrixView={() => setFastFlowSubMode('matrix')}
        onSelectCriterionLevel={handleSelectCriterionLevel}
        onSetDirectCriterionScore={handleSetDirectCriterionScore}
        onClearCriterionScore={handleClearCriterionScore}
        onResetStudentScores={handleResetStudentScores}
        onUndoLastAction={handleUndoLastAction}
        autoAdvanceStudent={autoAdvanceStudent}
        onToggleAutoAdvance={() => setAutoAdvanceStudent(!autoAdvanceStudent)}
        precisionScoringMode={precisionScoringMode}
        onTogglePrecisionScoring={() =>
          setPrecisionScoringMode(!precisionScoringMode)
        }
        fastCompletionBanner={fastCompletionBanner}
        onDismissBanner={() => setFastCompletionBanner(null)}
        statusAnnouncement={statusAnnouncement}
      />
    );
  }

  const undoCount = activeSession.undoHistory?.length || 0;
  const sessionClassNames = classrooms
    .filter((c) => sessionClassIds.includes(c.id))
    .map((c) => c.name)
    .join(' + ');

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 space-y-4">
      <div className="sr-only" role="status" aria-live="polite">
        {statusAnnouncement}
      </div>

      {/* Top Session Control Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="session-select" className="sr-only">
              Değerlendirme Oturumu Seçin
            </label>
            <select
              id="session-select"
              value={activeSession.id}
              onChange={(e) => onSelectSession(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {sessions.map((ses) => {
                const clsNames = classrooms
                  .filter((c) =>
                    (ses.classIds && ses.classIds.length > 0
                      ? ses.classIds
                      : [ses.classId]
                    ).includes(c.id)
                  )
                  .map((c) => c.name)
                  .join('+');
                return (
                  <option key={ses.id} value={ses.id}>
                    [{clsNames}] {ses.title} ({ses.date})
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              onClick={() => setShowNewSessionModal(true)}
              className="px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Yeni Oturum (Çoklu Şube Destekli)
            </button>
          </div>

          {/* Right Mode Switcher + Undo + PDF/CSV Export */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200"
              role="group"
              aria-label="Değerlendirme Modu"
            >
              <button
                type="button"
                onClick={() =>
                  onUpdateSession({ ...activeSession, mode: 'individual' })
                }
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeSession.mode === 'individual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Bireysel Değerlendirme
              </button>
              <button
                type="button"
                onClick={() => {
                  setFastFlowSubMode('serial');
                  onUpdateSession({ ...activeSession, mode: 'grid' });
                }}
                className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <Grid className="w-3.5 h-3.5" />
                Hızlı Değerlendirme
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateSession({ ...activeSession, mode: 'group' })
                }
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeSession.mode === 'group'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Grup Değerlendirmesi
              </button>
            </div>

            <button
              type="button"
              disabled={undoCount === 0}
              onClick={handleUndoLastAction}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
              title="Son puanlama veya grup işlemini geri al"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Geri Al {undoCount > 0 ? `(${undoCount})` : ''}
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              className="px-3 py-1.5 text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 flex items-center gap-1.5 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              PDF İndir
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              CSV İndir
            </button>
          </div>
        </div>

        {/* Session Info & Progress Bar */}
        <div className="pt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-teal-900 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                {sessionClassNames}
              </span>
              <span>·</span>
              <label htmlFor="session-rubric-select" className="sr-only">
                Oturum Rubriği
              </label>
              <select
                id="session-rubric-select"
                value={activeRubric.id}
                onChange={(e) => handleChangeSessionRubric(e.target.value)}
                className="font-medium text-slate-800 bg-slate-100 border border-slate-200 rounded px-2 py-0.5 text-xs cursor-pointer"
              >
                {rubrics.map((r) => (
                  <option key={r.id} value={r.id}>
                    Rubrik: {r.title} ({r.criteria.length} Ölçüt)
                  </option>
                ))}
              </select>
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                title="Bu oturumun rubrik ölçütleri ve ağırlıkları oturum bazında dondurulmuştur"
              >
                <ShieldCheck className="w-3 h-3" />
                Oturum Rubriği Donduruldu
              </span>
            </div>
            <h1 className="text-lg font-bold text-slate-900">
              {activeSession.title}
            </h1>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 px-3.5 py-2 rounded-lg border border-slate-200">
            <div>
              <div className="text-[11px] font-medium text-slate-500">
                Tamamlanan Öğrenci
              </div>
              <div className="font-mono-num text-sm font-bold text-slate-900">
                {progressStats.fullyEvaluatedCount} /{' '}
                {progressStats.totalStudents} (%{progressStats.completionPercent}
                )
              </div>
            </div>
            <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-700 transition-all duration-300"
                style={{ width: `${progressStats.completionPercent}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateSession({
                  ...activeSession,
                  status:
                    activeSession.status === 'completed'
                      ? 'in_progress'
                      : 'completed',
                })
              }
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeSession.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {activeSession.status === 'completed'
                ? 'Tamamlandı'
                : 'Oturumu Tamamla'}
            </button>
          </div>
        </div>
      </div>

      {/* New Session Modal (Multi-Classroom Support P1 #9) */}
      {showNewSessionModal && (
        <div className="bg-white border-2 border-teal-700 rounded-xl p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-base font-bold text-slate-900">
              Yeni Değerlendirme Oturumu Başlat (Tek veya Çoklu Şube)
            </h2>
            <button
              type="button"
              onClick={() => setShowNewSessionModal(false)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Kapat
            </button>
          </div>
          <form
            onSubmit={handleCreateNewSessionSubmit}
            className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
          >
            <div className="md:col-span-4">
              <label
                htmlFor="new-session-title"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Etkinlik / Performans Başlığı
              </label>
              <input
                id="new-session-title"
                type="text"
                required
                placeholder="Örn: 4. Ünite: Elektrik Devreleri Deneyi"
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Uygulanacak Şubeler (Çoklu Sınıf Seçilebilir)
              </label>
              <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-50 border border-slate-300 rounded-lg">
                {classrooms.map((c) => {
                  const checked = newSessionClassIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setNewSessionClassIds((prev) =>
                          prev.includes(c.id)
                            ? prev.length > 1
                              ? prev.filter((id) => id !== c.id)
                              : prev
                            : [...prev, c.id]
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                        checked
                          ? 'bg-teal-700 text-white'
                          : 'bg-white text-slate-700 border border-slate-300'
                      }`}
                    >
                      {checked ? '✓ ' : ''}
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-4 flex items-center gap-2">
              <div className="flex-1">
                <label
                  htmlFor="new-session-rubric"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Değerlendirme Rubriği
                </label>
                <select
                  id="new-session-rubric"
                  value={newSessionRubricId}
                  onChange={(e) => setNewSessionRubricId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {rubrics.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 cursor-pointer shrink-0"
              >
                Başlat
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mode 1: Individual Evaluation */}
      {activeSession.mode === 'individual' && (
        <IndividualEvaluationView
          activeSession={activeSession}
          activeRubric={activeRubric}
          classStudents={classStudents}
          selectedStudent={selectedStudent}
          selectedStudentId={selectedStudent?.id || ''}
          onSelectStudent={setSelectedStudentId}
          studentFilter={studentFilter}
          onChangeStudentFilter={setStudentFilter}
          filteredStudents={filteredStudents}
          onSelectCriterionLevel={handleSelectCriterionLevel}
          onSetDirectCriterionScore={handleSetDirectCriterionScore}
          onClearCriterionScore={handleClearCriterionScore}
          onResetStudentScores={handleResetStudentScores}
          onSwitchActiveScoreSource={(studentId, source) => {
            const existing = activeSession.evaluations[studentId];
            if (!existing) return;
            onUpdateSession({
              ...activeSession,
              evaluations: {
                ...activeSession.evaluations,
                [studentId]: {
                  ...existing,
                  activeScoreSource: source,
                },
              },
            });
          }}
          onUpdateStudentNote={(note) => {
            if (!selectedStudent) return;
            const existing = activeSession.evaluations[selectedStudent.id];
            onUpdateSession({
              ...activeSession,
              evaluations: {
                ...activeSession.evaluations,
                [selectedStudent.id]: {
                  ...existing,
                  studentId: selectedStudent.id,
                  criterionScores: existing?.criterionScores || {},
                  note,
                  tags: existing?.tags || [],
                  updatedAt: new Date().toISOString(),
                },
              },
            });
          }}
          onToggleStudentTag={(tag) => {
            if (!selectedStudent) return;
            const existing = activeSession.evaluations[selectedStudent.id];
            const currentTags = existing?.tags || [];
            const nextTags = currentTags.includes(tag)
              ? currentTags.filter((t) => t !== tag)
              : [...currentTags, tag];
            onUpdateSession({
              ...activeSession,
              evaluations: {
                ...activeSession.evaluations,
                [selectedStudent.id]: {
                  ...existing,
                  studentId: selectedStudent.id,
                  criterionScores: existing?.criterionScores || {},
                  note: existing?.note || '',
                  tags: nextTags,
                  updatedAt: new Date().toISOString(),
                },
              },
            });
          }}
          precisionScoringMode={precisionScoringMode}
          onTogglePrecisionScoring={() =>
            setPrecisionScoringMode(!precisionScoringMode)
          }
          justCompletedBanner={justCompletedBanner}
          onDismissBanner={() => setJustCompletedBanner(null)}
        />
      )}

      {/* Mode 3: Group Evaluation */}
      {activeSession.mode === 'group' && (
        <GroupEvaluationView
          activeSession={activeSession}
          activeRubric={activeRubric}
          allSessions={sessions}
          rubricsById={rubricsById}
          classStudents={classStudents}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
          onAddGroup={(newGroup) => {
            onUpdateSession({
              ...activeSession,
              groups: [...activeSession.groups, newGroup],
            });
          }}
          onReplaceAllGroups={(groups) => {
            const undoHistory = recordSessionUndoEntry(activeSession, {
              scope: 'group',
              description: 'Dengeli rastgele gruplar oluşturuldu',
              previousEvaluations: activeSession.evaluations,
              previousGroups: activeSession.groups,
            });
            onUpdateSession({
              ...activeSession,
              groups,
              undoHistory,
            });
          }}
          onDeleteGroup={(groupId) => {
            onUpdateSession({
              ...activeSession,
              groups: activeSession.groups.filter((g) => g.id !== groupId),
            });
          }}
          onToggleGroupMember={(groupId, studentId) => {
            const updatedGroups = activeSession.groups.map((g) => {
              if (g.id !== groupId) return g;
              const exists = g.studentIds.includes(studentId);
              return {
                ...g,
                studentIds: exists
                  ? g.studentIds.filter((id) => id !== studentId)
                  : [...g.studentIds, studentId],
              };
            });
            onUpdateSession({ ...activeSession, groups: updatedGroups });
          }}
          onSelectGroupCriterionLevel={(criterionId, points) => {
            const updatedGroups = activeSession.groups.map((g) =>
              g.id === selectedGroupId
                ? {
                    ...g,
                    criterionScores: {
                      ...g.criterionScores,
                      [criterionId]: points,
                    },
                  }
                : g
            );
            onUpdateSession({ ...activeSession, groups: updatedGroups });
          }}
          onUpdateGroupNote={(note) => {
            const updatedGroups = activeSession.groups.map((g) =>
              g.id === selectedGroupId ? { ...g, groupNote: note } : g
            );
            onUpdateSession({ ...activeSession, groups: updatedGroups });
          }}
          onApplyGroupScoresToMembers={(group) => {
            const nowIso = new Date().toISOString();
            const undoHistory = recordSessionUndoEntry(activeSession, {
              scope: 'group',
              description: `${group.name} puanları üyelere yansıtıldı`,
              previousEvaluations: activeSession.evaluations,
              previousGroups: activeSession.groups,
            });
            const updatedEvaluations = applyGroupScoresToMembers(
              activeSession.evaluations,
              group,
              nowIso
            );
            const updatedGroups = activeSession.groups.map((g) =>
              g.id === group.id ? { ...g, lastAppliedAt: nowIso } : g
            );
            onUpdateSession({
              ...activeSession,
              evaluations: updatedEvaluations,
              groups: updatedGroups,
              undoHistory,
            });
            setGroupAppliedFeedback(
              `${group.name} puanları ${group.studentIds.length} öğrencinin ayrı grup hanesine kaydedildi (bireysel puanlar korundu).`
            );
            setTimeout(() => setGroupAppliedFeedback(null), 4000);
          }}
          groupAppliedFeedback={groupAppliedFeedback}
        />
      )}
    </div>
  );
};
