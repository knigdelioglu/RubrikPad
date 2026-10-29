import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageSquare,
  RotateCcw,
  Search,
  Sliders,
  Tag,
  Users,
  X,
} from 'lucide-react';
import type {
  Classroom,
  EvaluationSession,
  Rubric,
  Student,
} from '../../types.ts';
import { QUICK_OBSERVATION_TAGS } from '../../data/seedData.ts';
import {
  getCriterionSection,
  getFocusModeStepSummary,
  getNextFocusedCriterionIndexAfterScore,
  getSessionProgressStats,
  getSessionStudentsForClassroom,
  getStudentConsecutiveLowScoreReminder,
  getStudentEvaluationBreakdown,
  hasStudentObservationData,
  isDualBookSpeakingRubric,
  resolveFocusedCriterionIndex,
  type CriterionFocusDisplayMode,
} from '../../utils/rubricLogic.ts';
import {
  CriterionFocusToolbar,
  FocusModeStepperBar,
  RubricCriterionCard,
  type RubricCardViewMode,
} from './RubricCriterionCard.tsx';

interface IndividualEvaluationViewProps {
  activeSession: EvaluationSession;
  activeRubric: Rubric;
  classStudents: Student[];
  selectedStudent: Student | undefined;
  selectedStudentId: string;
  onSelectStudent: (id: string) => void;
  studentFilter: 'all' | 'pending' | 'completed';
  onChangeStudentFilter: (filter: 'all' | 'pending' | 'completed') => void;
  filteredStudents: Student[];
  cardViewMode: RubricCardViewMode;
  onChangeCardViewMode: (mode: RubricCardViewMode) => void;
  autoAdvanceStudent: boolean;
  onToggleAutoAdvance: () => void;
  onSelectCriterionLevel: (
    criterionId: string,
    points: number,
    options?: { advanceStudentOnComplete?: boolean }
  ) => void;
  onSetDirectCriterionScore: (
    criterionId: string,
    directPoints: number | null,
    options?: { advanceStudentOnComplete?: boolean }
  ) => void;
  onClearCriterionScore: (criterionId: string) => void;
  onResetStudentScores: (studentId: string) => void;
  onSwitchActiveScoreSource: (
    studentId: string,
    source: 'individual' | 'group'
  ) => void;
  onUpdateStudentNote: (note: string) => void;
  onToggleStudentTag: (tag: string) => void;
  precisionScoringMode: boolean;
  onTogglePrecisionScoring: () => void;
  justCompletedBanner: {
    completedStudentId: string;
    completedStudentName: string;
    scoreOutOf100: number;
    performanceLabel: string;
    nextStudentId: string | null;
    nextStudentName: string | null;
    autoAdvanced?: boolean;
  } | null;
  onDismissBanner: () => void;
  onOpenQuickNoteModal?: (studentId: string) => void;
  allSessions?: EvaluationSession[];
  rubricsById?: Record<string, Rubric>;
  sessionClassrooms?: Classroom[];
  activeClassroom?: Classroom;
  onSelectClassroom?: (classId: string) => void;
  allStudents?: Student[];
}

export const IndividualEvaluationView: React.FC<
  IndividualEvaluationViewProps
> = ({
  activeSession,
  activeRubric,
  classStudents,
  selectedStudent,
  onSelectStudent,
  studentFilter,
  onChangeStudentFilter,
  filteredStudents,
  cardViewMode,
  autoAdvanceStudent,
  onToggleAutoAdvance,
  onSelectCriterionLevel,
  onSetDirectCriterionScore,
  onClearCriterionScore,
  onResetStudentScores,
  onSwitchActiveScoreSource,
  onUpdateStudentNote,
  onToggleStudentTag,
  precisionScoringMode,
  onTogglePrecisionScoring,
  justCompletedBanner,
  onDismissBanner,
  onOpenQuickNoteModal,
  allSessions,
  rubricsById,
  sessionClassrooms = [],
  activeClassroom,
  onSelectClassroom,
  allStudents = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showPortraitRosterDrawer, setShowPortraitRosterDrawer] =
    useState(false);
  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [focusDisplayMode, setFocusDisplayMode] =
    useState<CriterionFocusDisplayMode>('hide_others');
  const [focusedCriterionIndex, setFocusedCriterionIndex] = useState(0);

  useEffect(() => {
    if (isDualBookSpeakingRubric(activeRubric)) {
      setFocusModeEnabled(false);
    }
  }, [activeRubric.id]);

  const effectiveSessions = useMemo(
    () => (allSessions && allSessions.length > 0 ? allSessions : [activeSession]),
    [allSessions, activeSession]
  );

  const effectiveRubricsMap = useMemo(
    () =>
      rubricsById && Object.keys(rubricsById).length > 0
        ? rubricsById
        : { [activeRubric.id]: activeRubric },
    [rubricsById, activeRubric]
  );

  const currentStudentEval = selectedStudent
    ? activeSession.evaluations[selectedStudent.id]
    : undefined;

  const activeLowScoreReminder = useMemo(
    () =>
      selectedStudent
        ? getStudentConsecutiveLowScoreReminder(
            selectedStudent.id,
            activeSession,
            effectiveSessions,
            effectiveRubricsMap
          )
        : null,
    [selectedStudent, activeSession, effectiveSessions, effectiveRubricsMap]
  );

  const focusObservationNoteInput = () => {
    const el = document.getElementById(
      'student-obs-note'
    ) as HTMLTextAreaElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  };

  const breakdown = getStudentEvaluationBreakdown(
    activeRubric,
    currentStudentEval
  );
  const { individualCalc, groupCalc, effectiveCalc, activeSource } = breakdown;
  const hasGroupData =
    groupCalc.completedCriteriaCount > 0 ||
    Boolean(currentStudentEval?.groupNote);

  const activeScoresMap = useMemo(
    () =>
      activeSource === 'group'
        ? currentStudentEval?.groupCriterionScores
        : currentStudentEval?.criterionScores,
    [activeSource, currentStudentEval]
  );

  const activeDirectScoresMap = useMemo(
    () =>
      activeSource === 'group'
        ? currentStudentEval?.groupDirectScores
        : currentStudentEval?.directCriterionScores,
    [activeSource, currentStudentEval]
  );

  // When switching to a different student or rubric, jump Focus Mode to their first unscored criterion
  useEffect(() => {
    setFocusedCriterionIndex(
      resolveFocusedCriterionIndex(
        activeRubric.criteria,
        0,
        activeScoresMap,
        activeDirectScoresMap,
        true
      )
    );
  }, [selectedStudent?.id, activeRubric.id]);

  const focusStepSummary = useMemo(
    () =>
      getFocusModeStepSummary(
        activeRubric.criteria,
        focusedCriterionIndex,
        activeScoresMap,
        activeDirectScoresMap
      ),
    [
      activeRubric.criteria,
      focusedCriterionIndex,
      activeScoresMap,
      activeDirectScoresMap,
    ]
  );

  // Identify the first unscored criterion for the active student to spotlight it for ADHD users
  const firstUnscoredCriterionId = useMemo(() => {
    for (const crit of activeRubric.criteria) {
      const selectedPts = activeScoresMap?.[crit.id];
      const directPts = activeDirectScoresMap?.[crit.id];
      if (
        (selectedPts === undefined || selectedPts === null) &&
        (directPts === undefined || directPts === null)
      ) {
        return crit.id;
      }
    }
    return null;
  }, [activeRubric.criteria, activeScoresMap, activeDirectScoresMap]);

  const searchedStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredStudents;
    return filteredStudents.filter(
      (stu) =>
        stu.fullName.toLowerCase().includes(q) ||
        stu.studentNumber.toLowerCase().includes(q)
    );
  }, [filteredStudents, searchQuery]);

  const currentStudentIndex = useMemo(
    () => classStudents.findIndex((s) => s.id === selectedStudent?.id),
    [classStudents, selectedStudent]
  );

  const prevStudent =
    currentStudentIndex > 0 ? classStudents[currentStudentIndex - 1] : null;
  const nextStudent =
    currentStudentIndex >= 0 && currentStudentIndex < classStudents.length - 1
      ? classStudents[currentStudentIndex + 1]
      : null;

  const pendingStudentsCount = useMemo(
    () =>
      classStudents.filter((stu) => {
        const ev = activeSession.evaluations[stu.id];
        return !getStudentEvaluationBreakdown(activeRubric, ev).effectiveCalc
          .isComplete;
      }).length,
    [classStudents, activeSession.evaluations, activeRubric]
  );

  const completedStudentsCount = classStudents.length - pendingStudentsCount;

  const getInitials = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  return (
    <div className="space-y-3">
      {/* Portrait Tablet / Mobile Quick Student Switcher Bar (< 1024px) */}
      <div className="lg:hidden bg-white border border-slate-200 rounded-xl p-2.5 shadow-xs flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!prevStudent}
          onClick={() => {
            if (prevStudent) {
              onSelectStudent(prevStudent.id);
              onDismissBanner();
            }
          }}
          className="min-h-[42px] px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 disabled:opacity-40 flex items-center gap-1 cursor-pointer shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
          Önceki
        </button>

        <button
          type="button"
          onClick={() => setShowPortraitRosterDrawer(!showPortraitRosterDrawer)}
          className="flex-1 min-h-[42px] px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-left flex items-center justify-between gap-2 cursor-pointer"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-blue-900">
              Öğrenci Seçici ({currentStudentIndex + 1}/{classStudents.length})
            </div>
            <div className="text-xs font-bold text-slate-900 truncate">
              {selectedStudent
                ? `#${selectedStudent.studentNumber} ${selectedStudent.fullName}`
                : 'Öğrenci Seçin'}
            </div>
          </div>
          <span className="text-xs font-bold text-blue-900 bg-white px-2.5 py-1 rounded-md border border-slate-300 shrink-0">
            {showPortraitRosterDrawer ? 'Listeyi Kapat' : 'Listeyi Aç'}
          </span>
        </button>

        <button
          type="button"
          disabled={!nextStudent}
          onClick={() => {
            if (nextStudent) {
              onSelectStudent(nextStudent.id);
              onDismissBanner();
            }
          }}
          className="min-h-[42px] px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 disabled:opacity-40 flex items-center gap-1 cursor-pointer shrink-0"
        >
          Sıradaki
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Roster Panel: Always visible on Landscape Tablet/Desktop (lg+), toggleable drawer on Portrait Tablet (<lg) */}
        <aside
          className={`${
            showPortraitRosterDrawer ? 'block' : 'hidden'
          } lg:block lg:col-span-4 xl:col-span-3 bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-xs lg:sticky lg:top-4`}
        >
          <div className="p-3.5 border-b border-slate-200 bg-slate-50 space-y-2.5">
            {sessionClassrooms.length > 1 && onSelectClassroom && (
              <div
                data-testid="individual-view-class-switcher"
                className="p-1.5 bg-white border border-slate-300 rounded-xl space-y-1.5"
              >
                <div className="text-[11px] font-bold text-slate-600 px-1 flex items-center justify-between">
                  <span>Sınıf Bazlı Değerlendirme (Şube Seçin)</span>
                  <span className="text-blue-900">
                    {sessionClassrooms.length} Şube
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {sessionClassrooms.map((cls) => {
                    const isSelectedCls = activeClassroom?.id === cls.id;
                    const clsStuList =
                      allStudents.length > 0
                        ? getSessionStudentsForClassroom(
                            allStudents,
                            activeSession,
                            cls.id
                          )
                        : isSelectedCls
                        ? classStudents
                        : [];
                    const clsStats = getSessionProgressStats(
                      clsStuList,
                      activeSession.evaluations,
                      activeRubric
                    );
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        data-testid={`individual-class-tab-${cls.id}`}
                        onClick={() => {
                          onSelectClassroom(cls.id);
                          onDismissBanner();
                        }}
                        className={`flex-1 min-w-[92px] px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-between gap-1.5 ${
                          isSelectedCls
                            ? 'bg-blue-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                        }`}
                      >
                        <span className="truncate">{cls.name}</span>
                        <span
                          className={`font-mono-num text-[10px] px-1.5 py-0.5 rounded ${
                            isSelectedCls
                              ? 'bg-blue-950 text-blue-100'
                              : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {clsStats.fullyEvaluatedCount}/{clsStats.totalStudents}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-sm font-bold text-slate-900 truncate">
                  Öğrenci Listesi
                </h2>
                {activeClassroom && (
                  <span
                    data-testid="individual-active-classroom-badge"
                    className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-900 shrink-0"
                  >
                    {activeClassroom.name}
                  </span>
                )}
              </div>
              <span className="text-xs font-mono-num font-bold text-slate-800 bg-white px-2.5 py-0.5 rounded-md border border-slate-300 shrink-0">
                {completedStudentsCount}/{classStudents.length} Tamam
              </span>
            </div>

            {/* Search Input for Large Classes */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Öğrenci ara (isim veya okul numarası)"
                placeholder="İsim veya okul no ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Aramayı temizle"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/80 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => onChangeStudentFilter('all')}
                className={`py-1.5 rounded-lg transition-colors cursor-pointer ${
                  studentFilter === 'all'
                    ? 'bg-blue-900 text-white shadow-xs font-bold'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Tümü ({classStudents.length})
              </button>
              <button
                type="button"
                onClick={() => onChangeStudentFilter('pending')}
                className={`py-1.5 rounded-lg transition-colors cursor-pointer ${
                  studentFilter === 'pending'
                    ? 'bg-blue-900 text-white shadow-xs font-bold'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Bekleyen ({pendingStudentsCount})
              </button>
              <button
                type="button"
                onClick={() => onChangeStudentFilter('completed')}
                className={`py-1.5 rounded-lg transition-colors cursor-pointer ${
                  studentFilter === 'completed'
                    ? 'bg-blue-900 text-white shadow-xs font-bold'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Tamam ({completedStudentsCount})
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-200/80 max-h-[600px] overflow-y-auto">
            {searchedStudents.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Arama veya filtre ölçütüne uygun öğrenci bulunamadı.
              </div>
            ) : (
              searchedStudents.map((stu) => {
                const ev = activeSession.evaluations[stu.id];
                const stuBreakdown = getStudentEvaluationBreakdown(
                  activeRubric,
                  ev
                );
                const calc = stuBreakdown.effectiveCalc;
                const isSelected = stu.id === selectedStudent?.id;
                const hasObsData = hasStudentObservationData(ev);
                const lowScoreRem = getStudentConsecutiveLowScoreReminder(
                  stu.id,
                  activeSession,
                  effectiveSessions,
                  effectiveRubricsMap
                );

                return (
                  <div
                    key={stu.id}
                    data-testid={`student-card-${stu.id}`}
                    className={`w-full flex items-center justify-between gap-1.5 pr-2.5 transition-all ${
                      isSelected
                        ? 'bg-blue-50/90 ring-2 ring-inset ring-blue-900'
                        : calc.isComplete
                        ? 'bg-slate-50/60 hover:bg-slate-100/70'
                        : calc.completedCriteriaCount > 0
                        ? 'bg-white hover:bg-slate-50'
                        : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStudent(stu.id);
                        onDismissBanner();
                        setShowPortraitRosterDrawer(false);
                      }}
                      className="flex-1 min-w-0 text-left pl-3.5 pr-1.5 py-3 flex items-center justify-between gap-2 cursor-pointer min-h-[54px]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isSelected
                              ? 'bg-blue-900 text-white shadow-2xs'
                              : calc.isComplete
                              ? 'bg-slate-700 text-white'
                              : calc.completedCriteriaCount > 0
                              ? 'bg-slate-200 text-slate-800 border border-slate-300'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {getInitials(stu.fullName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-mono-num text-xs font-bold ${
                                isSelected
                                  ? 'text-blue-900'
                                  : 'text-slate-500'
                              }`}
                            >
                              #{stu.studentNumber}
                            </span>
                            <span
                              className={`text-sm font-bold truncate ${
                                isSelected
                                  ? 'text-slate-950'
                                  : 'text-slate-800'
                              }`}
                            >
                              {stu.fullName}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                            <span>
                              {calc.completedCriteriaCount}/
                              {calc.totalCriteriaCount} ölçüt
                            </span>
                            {stuBreakdown.individualCalc
                              .completedCriteriaCount > 0 &&
                              stuBreakdown.groupCalc.completedCriteriaCount >
                                0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-800 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded">
                                  <Users className="w-2.5 h-2.5 text-slate-700" />
                                  Bireysel + Grup
                                </span>
                              )}
                            {hasObsData && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-800 bg-slate-200/80 border border-slate-300 px-1.5 py-0.5 rounded">
                                <MessageSquare className="w-2.5 h-2.5 text-slate-700" />
                                Not var
                              </span>
                            )}
                            {lowScoreRem.shouldRemind && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-950 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded"
                                title="Üst üste 3 değerlendirmede düşük puan (1 veya 2) — Gözlem notu ekle"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-800" />
                                Gözlem notu ekle
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Definitive score rule: NEVER show a 100-point grade unless required criteria are complete */}
                        {calc.dualResult ? (
                          calc.dualResult.isBookPresentationComplete &&
                          calc.dualResult.finalBookPresentationScoreOutOf100 !==
                            null ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span
                                className={`font-mono-num text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                                  isSelected
                                    ? 'bg-blue-900 text-white border-blue-950'
                                    : 'bg-slate-100 text-slate-900 border-slate-300'
                                }`}
                              >
                                <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                                Kitap:{' '}
                                {
                                  calc.dualResult
                                    .finalBookPresentationScoreOutOf100
                                }
                              </span>
                              <span className="font-mono-num text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-white">
                                Konuşma:{' '}
                                {calc.dualResult.finalSpeakingScoreOutOf100}
                              </span>
                            </div>
                          ) : calc.dualResult.isSpeakingComplete &&
                            calc.dualResult.finalSpeakingScoreOutOf100 !==
                              null ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-mono-num text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                                Kitap Taslak ({calc.completedCriteriaCount}/
                                {calc.totalCriteriaCount})
                              </span>
                              <span className="font-mono-num text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-white">
                                Konuşma:{' '}
                                {calc.dualResult.finalSpeakingScoreOutOf100}
                              </span>
                            </div>
                          ) : calc.completedCriteriaCount > 0 ? (
                            <span className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-300">
                              Taslak ({calc.completedCriteriaCount}/
                              {calc.totalCriteriaCount})
                            </span>
                          ) : (
                            <Clock className="w-4 h-4 text-slate-300" />
                          )
                        ) : calc.isComplete &&
                          calc.finalScoreOutOf100 !== null ? (
                          <span
                            className={`font-mono-num text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                              isSelected
                                ? 'bg-blue-900 text-white border-blue-950'
                                : 'bg-slate-100 text-slate-900 border-slate-300'
                            }`}
                          >
                            <Check className="w-3 h-3 stroke-[2.5]" />
                            {calc.finalScoreOutOf100}
                          </span>
                        ) : calc.completedCriteriaCount > 0 ? (
                          <span className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-300">
                            Taslak ({calc.completedCriteriaCount}/
                            {calc.totalCriteriaCount})
                          </span>
                        ) : (
                          <Clock className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                    </button>

                    {onOpenQuickNoteModal && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenQuickNoteModal(stu.id);
                        }}
                        data-testid={`quick-note-icon-${stu.id}`}
                        aria-label={`${stu.fullName} için Hızlı Gözlem Notu`}
                        title={
                          hasObsData
                            ? `Hızlı Gözlem Notunu Düzenle (${stu.fullName})${
                                ev?.note ? `: "${ev.note}"` : ''
                              }`
                            : `${stu.fullName} için Hızlı Gözlem Notu Ekle`
                        }
                        className={`shrink-0 p-2 rounded-xl border transition-colors cursor-pointer flex items-center justify-center relative min-w-[34px] min-h-[34px] ${
                          hasObsData
                            ? 'bg-slate-800 text-white border-slate-900 hover:bg-slate-900 shadow-2xs'
                            : lowScoreRem.shouldRemind
                            ? 'bg-amber-100 text-amber-950 border-amber-300 hover:bg-amber-200'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-900 hover:text-blue-900 hover:bg-slate-50'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {hasObsData && (
                          <span className="w-2 h-2 rounded-full bg-blue-400 border border-slate-900 absolute -top-0.5 -right-0.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Active Student Rubric Deck (8/9 cols) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {/* Smart Auto-Advance & Easy Return Banner */}
          {justCompletedBanner && (
            <div
              role="status"
              aria-live="polite"
              className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-sm border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-blue-300 shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm font-bold">
                    {justCompletedBanner.completedStudentName} tamamlandı ·
                    Kesin Not: {justCompletedBanner.scoreOutOf100} / 100 (
                    {justCompletedBanner.performanceLabel})
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {justCompletedBanner.autoAdvanced && selectedStudent
                      ? `Otomatik olarak sıradaki öğrenciye geçildi: ${selectedStudent.fullName}`
                      : 'Tüm zorunlu ölçütler tamamlandı.'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {justCompletedBanner.completedStudentId !==
                  selectedStudent?.id && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectStudent(justCompletedBanner.completedStudentId);
                      onDismissBanner();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    {justCompletedBanner.completedStudentName} Kaydına Dön
                  </button>
                )}

                {justCompletedBanner.completedStudentId ===
                  selectedStudent?.id &&
                  justCompletedBanner.nextStudentId && (
                    <button
                      type="button"
                      onClick={() => {
                        if (justCompletedBanner.nextStudentId) {
                          onSelectStudent(justCompletedBanner.nextStudentId);
                          onDismissBanner();
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      Sıradaki: {justCompletedBanner.nextStudentName}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}


                <button
                  type="button"
                  onClick={onDismissBanner}
                  aria-label="Bildirimi kapat"
                  className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {selectedStudent ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-7 space-y-6 shadow-xs">
              {/* Top Header & Progress Bar (Matches Reference Design) */}
              <div className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* Left: Student Name • No: XXX + Session Badge */}
                  <div className="flex flex-wrap items-center gap-3 min-w-0">
                    <h2
                      className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight truncate max-w-[260px] sm:max-w-[380px] md:max-w-[480px]"
                      title={selectedStudent.fullName}
                    >
                      {selectedStudent.fullName}
                    </h2>
                    <span className="font-mono-num text-sm font-medium text-slate-500 shrink-0">
                      • No: {selectedStudent.studentNumber}
                    </span>
                    <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200/80 truncate max-w-[260px]">
                      {activeSession.title || activeRubric.title}
                    </span>

                    {activeLowScoreReminder?.shouldRemind && (
                      <button
                        type="button"
                        onClick={focusObservationNoteInput}
                        data-testid="low-score-observation-reminder"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 transition-colors cursor-pointer shrink-0"
                        title={`${activeLowScoreReminder.message}. Gözlem notu alanına gitmek için tıklayın.`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                        <span>
                          Üst üste {activeLowScoreReminder.consecutiveCount}{' '}
                          düşük puan ·{' '}
                          <span className="underline">Gözlem notu ekle</span>
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Right: Toplam Puan: XX / 100 */}
                  <div className="flex items-baseline gap-2 shrink-0 ml-auto">
                    <span className="text-xs sm:text-sm font-medium text-slate-500">
                      Toplam Puan:
                    </span>
                    <span className="font-mono-num text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                      {effectiveCalc.finalScoreOutOf100 ??
                        effectiveCalc.provisionalScoreOutOf100 ??
                        0}
                    </span>
                    <span className="font-mono-num text-sm font-medium text-slate-400">
                      / 100
                    </span>
                  </div>
                </div>

                {/* Full-Width Slim Dark Progress Bar */}
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-900 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          (effectiveCalc.finalScoreOutOf100 ??
                            effectiveCalc.provisionalScoreOutOf100 ??
                            0) > 0
                            ? effectiveCalc.finalScoreOutOf100 ??
                                effectiveCalc.provisionalScoreOutOf100 ??
                                0
                            : Math.round(
                                (effectiveCalc.completedCriteriaCount /
                                  Math.max(
                                    1,
                                    effectiveCalc.totalCriteriaCount
                                  )) *
                                  100
                              )
                        )
                      )}%`,
                    }}
                  />
                </div>

                {/* Compact Secondary Controls Bar */}
                <div
                  data-testid="evaluation-controls-toolbar"
                  className="flex flex-wrap items-center justify-between gap-2 pt-0.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <CriterionFocusToolbar
                      focusModeEnabled={focusModeEnabled}
                      onToggleFocusMode={() => {
                        const nextEnabled = !focusModeEnabled;
                        setFocusModeEnabled(nextEnabled);
                        if (nextEnabled) {
                          setFocusedCriterionIndex(
                            resolveFocusedCriterionIndex(
                              activeRubric.criteria,
                              focusedCriterionIndex,
                              activeScoresMap,
                              activeDirectScoresMap,
                              true
                            )
                          );
                        }
                      }}
                      focusDisplayMode={focusDisplayMode}
                      onChangeFocusDisplayMode={setFocusDisplayMode}
                    />

                    {hasGroupData && (
                      <div className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
                        <Users className="w-3.5 h-3.5 text-slate-700" />
                        <button
                          type="button"
                          onClick={() =>
                            onSwitchActiveScoreSource(
                              selectedStudent.id,
                              'individual'
                            )
                          }
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer ${
                            activeSource === 'individual'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Bireysel Puanı Yansıt
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onSwitchActiveScoreSource(
                              selectedStudent.id,
                              'group'
                            )
                          }
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer ${
                            activeSource === 'group'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Grup Puanını Yansıt
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                    {onOpenQuickNoteModal && (
                      <button
                        type="button"
                        onClick={() => onOpenQuickNoteModal(selectedStudent.id)}
                        data-testid="active-student-quick-note-btn"
                        aria-label={`${selectedStudent.fullName} için Hızlı Gözlem Notu`}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer min-h-[34px] ${
                          hasStudentObservationData(currentStudentEval)
                            ? 'bg-slate-900 text-white border-slate-950 hover:bg-slate-950'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>
                          {hasStudentObservationData(currentStudentEval)
                            ? 'Hızlı Gözlem Notu (Düzenle)'
                            : 'Hızlı Gözlem Notu'}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={onToggleAutoAdvance}
                      aria-pressed={autoAdvanceStudent}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer min-h-[34px] flex items-center gap-1.5 ${
                        autoAdvanceStudent
                          ? 'bg-slate-900 text-white border-slate-950'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Otomatik Geçiş: {autoAdvanceStudent ? 'Açık' : 'Kapalı'}
                    </button>

                    <button
                      type="button"
                      onClick={onTogglePrecisionScoring}
                      aria-pressed={precisionScoringMode}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer min-h-[34px] ${
                        precisionScoringMode
                          ? 'bg-slate-900 text-white border-slate-950'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      Hassas Puan
                    </button>

                    <button
                      type="button"
                      onClick={() => onResetStudentScores(selectedStudent.id)}
                      title="Bireysel Puanları Sıfırla"
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 flex items-center gap-1 cursor-pointer min-h-[34px]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Sıfırla
                    </button>
                  </div>
                </div>

                {/* Tek Değerlendirme, İki Sonuç — Anlık Çift Sonuç Paneli (Kitap Sunumu Notu & Konuşma Sınavı Notu) */}
                {effectiveCalc.dualResult && (
                  <div
                    data-testid="dual-evaluation-results-strip"
                    className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1"
                  >
                    <div
                      data-testid="dual-book-presentation-score"
                      className={`p-3.5 rounded-xl border flex flex-col justify-between gap-1.5 ${
                        effectiveCalc.dualResult.isBookPresentationComplete &&
                        effectiveCalc.dualResult
                          .finalBookPresentationScoreOutOf100 !== null
                          ? 'bg-slate-50 border-slate-900 text-slate-900'
                          : 'bg-slate-50/70 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          1. Kitap Sunumu Notu (100 Üzerinden)
                        </span>
                        {effectiveCalc.dualResult.isBookPresentationComplete &&
                        effectiveCalc.dualResult
                          .finalBookPresentationScoreOutOf100 !== null ? (
                          <span className="font-mono-num text-xs font-bold px-2.5 py-0.5 rounded-lg bg-slate-900 text-white flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[2.5]" />
                            Kesin:{' '}
                            {
                              effectiveCalc.dualResult
                                .finalBookPresentationScoreOutOf100
                            }{' '}
                            / 100
                          </span>
                        ) : (
                          <span className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-200/80 text-slate-800">
                            Anlık Taslak:{' '}
                            {
                              effectiveCalc.dualResult
                                .provisionalBookPresentationScoreOutOf100
                            }{' '}
                            / 100 ({effectiveCalc.completedCriteriaCount}/
                            {effectiveCalc.totalCriteriaCount} ölçüt)
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono-num">
                        <span>
                          İçerik: {effectiveCalc.dualResult.contentScoreOutOf70}
                          /70 ({effectiveCalc.dualResult.completedContentCount}/
                          {effectiveCalc.dualResult.totalContentCount}) + Sunum:{' '}
                          {effectiveCalc.dualResult.speakingContributionOutOf30}
                          /30
                        </span>
                        <span className="font-sans font-semibold text-slate-700">
                          {
                            effectiveCalc.dualResult
                              .bookPresentationPerformanceLabel
                          }
                        </span>
                      </div>
                    </div>

                    <div
                      data-testid="dual-speaking-exam-score"
                      className={`p-3.5 rounded-xl border flex flex-col justify-between gap-1.5 ${
                        effectiveCalc.dualResult.isSpeakingComplete &&
                        effectiveCalc.dualResult.finalSpeakingScoreOutOf100 !==
                          null
                          ? 'bg-slate-900 border-slate-950 text-white'
                          : 'bg-slate-50/70 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-bold ${
                            effectiveCalc.dualResult.isSpeakingComplete
                              ? 'text-white'
                              : 'text-slate-900'
                          }`}
                        >
                          2. Konuşma Sınavı Notu (100 Üzerinden)
                        </span>
                        {effectiveCalc.dualResult.isSpeakingComplete &&
                        effectiveCalc.dualResult.finalSpeakingScoreOutOf100 !==
                          null ? (
                          <span className="font-mono-num text-xs font-bold px-2.5 py-0.5 rounded-lg bg-white text-slate-950 flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[2.5]" />
                            Kesin:{' '}
                            {
                              effectiveCalc.dualResult
                                .finalSpeakingScoreOutOf100
                            }{' '}
                            / 100
                          </span>
                        ) : (
                          <span className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-200/80 text-slate-800">
                            Anlık Taslak:{' '}
                            {
                              effectiveCalc.dualResult
                                .provisionalSpeakingScoreOutOf100
                            }{' '}
                            / 100 (
                            {effectiveCalc.dualResult.completedSpeakingCount}/
                            {effectiveCalc.dualResult.totalSpeakingCount} ölçüt)
                          </span>
                        )}
                      </div>
                      <div
                        className={`flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-num ${
                          effectiveCalc.dualResult.isSpeakingComplete
                            ? 'text-slate-300'
                            : 'text-slate-500'
                        }`}
                      >
                        <span>
                          Konuşma sınavı ölçütleri (
                          {effectiveCalc.dualResult.completedSpeakingCount}/
                          {effectiveCalc.dualResult.totalSpeakingCount})
                        </span>
                        <span
                          className={`font-sans font-semibold ${
                            effectiveCalc.dualResult.isSpeakingComplete
                              ? 'text-slate-200'
                              : 'text-slate-700'
                          }`}
                        >
                          {effectiveCalc.dualResult.speakingPerformanceLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Single-Criterion Focus Mode Stepper Bar */}
              {focusModeEnabled && (
                <FocusModeStepperBar
                  steps={focusStepSummary.steps}
                  activeIndex={focusStepSummary.activeIndex}
                  totalCount={focusStepSummary.totalCount}
                  completedCount={focusStepSummary.completedCount}
                  canGoPrev={focusStepSummary.canGoPrev}
                  canGoNext={focusStepSummary.canGoNext}
                  focusDisplayMode={focusDisplayMode}
                  onSelectStep={(idx) => setFocusedCriterionIndex(idx)}
                  onPrevStep={() =>
                    setFocusedCriterionIndex(
                      Math.max(0, focusStepSummary.activeIndex - 1)
                    )
                  }
                  onNextStep={() =>
                    setFocusedCriterionIndex(
                      Math.min(
                        focusStepSummary.totalCount - 1,
                        focusStepSummary.activeIndex + 1
                      )
                    )
                  }
                  onExitFocusMode={() => setFocusModeEnabled(false)}
                />
              )}

              {/* Unified Criteria Evaluation Table Card (Matches Reference Design) */}
              <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
                {/* Table Header Row */}
                <div className="bg-slate-50/70 border-b border-slate-200/90 px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
                    DEĞERLENDİRME KRİTERİ
                  </span>
                  <div className="hidden sm:flex items-center gap-6 shrink-0">
                    <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500 text-center min-w-[260px]">
                      SEVİYE SEÇİMİ
                    </span>
                    <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500 text-right min-w-[64px]">
                      PUAN
                    </span>
                  </div>
                </div>

                {/* Criteria Rows */}
                <div className="divide-y divide-slate-200/80">
                  {activeRubric.criteria.map((criterion, cIdx) => {
                    const isFocused = cIdx === focusStepSummary.activeIndex;

                    if (
                      focusModeEnabled &&
                      focusDisplayMode === 'hide_others' &&
                      !isFocused
                    ) {
                      return null;
                    }

                    const selectedPts = activeScoresMap?.[criterion.id];
                    const directPts = activeDirectScoresMap?.[criterion.id];
                    const groupPts =
                      currentStudentEval?.groupCriterionScores?.[criterion.id];
                    const isDual = Boolean(effectiveCalc.dualResult);
                    const currentSection = getCriterionSection(
                      criterion,
                      cIdx,
                      activeRubric
                    );
                    const prevSection =
                      cIdx > 0
                        ? getCriterionSection(
                            activeRubric.criteria[cIdx - 1],
                            cIdx - 1,
                            activeRubric
                          )
                        : null;
                    const showContentHeader =
                      isDual &&
                      currentSection === 'content' &&
                      (cIdx === 0 ||
                        (focusModeEnabled &&
                          focusDisplayMode === 'hide_others' &&
                          isFocused));
                    const showSpeakingHeader =
                      isDual &&
                      currentSection === 'speaking' &&
                      (prevSection !== 'speaking' ||
                        (focusModeEnabled &&
                          focusDisplayMode === 'hide_others' &&
                          isFocused));

                    return (
                      <React.Fragment key={criterion.id}>
                        {showContentHeader && effectiveCalc.dualResult && (
                          <div
                            data-testid="section-header-content"
                            className="bg-slate-50 px-5 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-bold font-mono-num">
                                BÖLÜM 1
                              </span>
                              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                                1. Kitap İçeriği — 70 Puan (Kitap Türüne Özgü 4
                                Ölçüt)
                              </h3>
                            </div>
                          </div>
                        )}

                        {showSpeakingHeader && effectiveCalc.dualResult && (
                          <div
                            data-testid="section-header-speaking"
                            className="bg-slate-50 px-5 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-white text-[11px] font-bold font-mono-num">
                                BÖLÜM 2
                              </span>
                              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                                2. Ortak Konuşma Değerlendirmesi — 100 Puan
                                (Ortak 6 Ölçüt)
                              </h3>
                            </div>
                          </div>
                        )}

                        <RubricCriterionCard
                          criterion={criterion}
                          criterionIndex={cIdx}
                          selectedPoints={selectedPts}
                          directPoints={directPts}
                          reflectedGroupPoints={groupPts}
                          viewMode={cardViewMode}
                          precisionScoringMode={precisionScoringMode}
                          isNextUnscored={
                            !focusModeEnabled &&
                            criterion.id === firstUnscoredCriterionId
                          }
                          adhdFocusMode={!focusModeEnabled}
                          isFocusedStage={focusModeEnabled && isFocused}
                          isDimmedByFocus={
                            focusModeEnabled &&
                            focusDisplayMode === 'dim_others' &&
                            !isFocused
                          }
                          onFocusSelect={() => setFocusedCriterionIndex(cIdx)}
                          focusStageNav={
                            focusModeEnabled && isFocused
                              ? {
                                  currentStep: focusStepSummary.activeIndex + 1,
                                  totalSteps: focusStepSummary.totalCount,
                                  canGoPrev: focusStepSummary.canGoPrev,
                                  canGoNext: focusStepSummary.canGoNext,
                                  onPrev: () =>
                                    setFocusedCriterionIndex(
                                      Math.max(
                                        0,
                                        focusStepSummary.activeIndex - 1
                                      )
                                    ),
                                  onNext: () =>
                                    setFocusedCriterionIndex(
                                      Math.min(
                                        focusStepSummary.totalCount - 1,
                                        focusStepSummary.activeIndex + 1
                                      )
                                    ),
                                }
                              : undefined
                          }
                          onSelectLevel={(critId, pts) => {
                            onSelectCriterionLevel(critId, pts, {
                              advanceStudentOnComplete: autoAdvanceStudent,
                            });
                            if (focusModeEnabled) {
                              const nextScores = {
                                ...(activeScoresMap || {}),
                                [critId]: pts,
                              };
                              const nextDirect = {
                                ...(activeDirectScoresMap || {}),
                              };
                              delete nextDirect[critId];
                              const nextFocus =
                                getNextFocusedCriterionIndexAfterScore(
                                  activeRubric.criteria,
                                  cIdx,
                                  nextScores,
                                  nextDirect
                                );
                              if (!nextFocus.allCompleted) {
                                setFocusedCriterionIndex(nextFocus.nextIndex);
                              }
                            }
                          }}
                          onSetDirectScore={(critId, dPts) => {
                            onSetDirectCriterionScore(critId, dPts, {
                              advanceStudentOnComplete: autoAdvanceStudent,
                            });
                            if (focusModeEnabled && dPts !== null) {
                              const nextDirect = {
                                ...(activeDirectScoresMap || {}),
                                [critId]: dPts,
                              };
                              const nextFocus =
                                getNextFocusedCriterionIndexAfterScore(
                                  activeRubric.criteria,
                                  cIdx,
                                  activeScoresMap || {},
                                  nextDirect
                                );
                              if (!nextFocus.allCompleted) {
                                setFocusedCriterionIndex(nextFocus.nextIndex);
                              }
                            }
                          }}
                          onClearScore={onClearCriterionScore}
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Inline Observation Note Input Bar (Matches Reference Design) */}
              <div className="space-y-2.5">
                <div className="bg-white border border-slate-200/90 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xs">
                  <label htmlFor="student-obs-note" className="sr-only">
                    Gözlem Notu
                  </label>
                  <MessageSquare className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    id="student-obs-note"
                    type="text"
                    value={currentStudentEval?.note || ''}
                    onChange={(e) => onUpdateStudentNote(e.target.value)}
                    placeholder={
                      activeLowScoreReminder?.shouldRemind
                        ? 'Öğrenci üst üste düşük puan aldı. Destekleyici gözlem notu ekleyin...'
                        : 'Gözlem notu ekleyin...'
                    }
                    className={`flex-1 px-3.5 py-2 text-xs sm:text-sm text-slate-800 bg-white rounded-lg focus:outline-none focus:ring-2 ${
                      activeLowScoreReminder?.shouldRemind &&
                      !activeLowScoreReminder.hasObservationNote
                        ? 'border-2 border-amber-400 focus:ring-amber-600'
                        : 'border border-slate-300 focus:ring-slate-900'
                    }`}
                  />
                  <span className="text-xs font-medium text-slate-400 shrink-0">
                    Kaydedildi
                  </span>
                </div>

                {/* Quick Observation Tags Strip */}
                <div className="flex flex-wrap items-center gap-1.5 px-1">
                  <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 mr-1">
                    <Tag className="w-3 h-3" />
                    Etiketler:
                  </span>
                  {QUICK_OBSERVATION_TAGS.map((tag) => {
                    const active = (currentStudentEval?.tags || []).some(
                      (savedTag) => savedTag === tag || (tag === 'Çözüm Odaklı' && savedTag === 'Yaratıcı Çözüm')
                    );
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => onToggleStudentTag(tag)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white border-slate-950'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-white'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Navigation Footer Bar (Matches Reference Design: < Önceki Öğrenci | • Otomatik Kaydedildi | Sonraki Öğrenci ->) */}
              <div className="pt-4 border-t border-slate-200/80 flex items-center justify-between gap-4">
                <button
                  type="button"
                  disabled={!prevStudent}
                  onClick={() => {
                    if (prevStudent) {
                      onSelectStudent(prevStudent.id);
                      onDismissBanner();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer py-2 px-1 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Önceki Öğrenci</span>
                </button>

                <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Otomatik Kaydedildi</span>
                </div>

                <button
                  type="button"
                  disabled={!nextStudent}
                  onClick={() => {
                    if (nextStudent) {
                      onSelectStudent(nextStudent.id);
                      onDismissBanner();
                    }
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-950 text-white text-xs sm:text-sm font-bold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <span>Sonraki Öğrenci</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};


