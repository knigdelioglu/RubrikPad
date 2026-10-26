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
  Undo2,
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
  getFocusModeStepSummary,
  getNextFocusedCriterionIndexAfterScore,
  getSessionProgressStats,
  getSessionStudentsForClassroom,
  getStudentConsecutiveLowScoreReminder,
  getStudentEvaluationBreakdown,
  hasStudentObservationData,
  resolveFocusedCriterionIndex,
  type CriterionFocusDisplayMode,
} from '../../utils/rubricLogic.ts';
import {
  CriterionFocusToolbar,
  FocusModeStepperBar,
  RubricCriterionCard,
  RubricViewModeToggle,
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
  onUndoLastAction?: () => void;
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
  onChangeCardViewMode,
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
  onUndoLastAction,
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
  const [focusModeEnabled, setFocusModeEnabled] = useState(true);
  const [focusDisplayMode, setFocusDisplayMode] =
    useState<CriterionFocusDisplayMode>('hide_others');
  const [focusedCriterionIndex, setFocusedCriterionIndex] = useState(0);

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
                        {/* Definitive score rule: NEVER show a 100-point grade unless isComplete === true */}
                        {calc.isComplete && calc.finalScoreOutOf100 !== null ? (
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
        <div className="lg:col-span-8 xl:col-span-9 space-y-3">
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

                {onUndoLastAction && (
                  <button
                    type="button"
                    onClick={() => {
                      onUndoLastAction();
                      onSelectStudent(justCompletedBanner.completedStudentId);
                      onDismissBanner();
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Son Puanı Geri Al
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
            <div className="bg-white border border-slate-300 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xs">
              {/* Sticky Evaluation Controls Toolbar & Student HUD */}
              <div className="flex flex-col gap-2.5 pb-3 border-b border-slate-200">
                {/* Fixed Top Controls Bar: Focus Mode, View Mode, Quick Observation & Actions */}
                <div
                  data-testid="evaluation-controls-toolbar"
                  className="bg-slate-50 border border-slate-200 rounded-xl p-2 sm:p-2.5 flex flex-wrap items-center justify-between gap-2"
                >
                  {/* Left: Focus Mode & View Mode Controls (Guaranteed Stable Anchor) */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
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

                    {!focusModeEnabled && (
                      <RubricViewModeToggle
                        viewMode={cardViewMode}
                        onChangeViewMode={onChangeCardViewMode}
                      />
                    )}
                  </div>

                  {/* Right: Quick Secondary Actions */}
                  <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                    {onOpenQuickNoteModal && (
                      <button
                        type="button"
                        onClick={() => onOpenQuickNoteModal(selectedStudent.id)}
                        data-testid="active-student-quick-note-btn"
                        aria-label={`${selectedStudent.fullName} için Hızlı Gözlem Notu`}
                        title={`${selectedStudent.fullName} için bu oturuma özel hızlı gözlem notu penceresini aç`}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer min-h-[34px] ${
                          hasStudentObservationData(currentStudentEval)
                            ? 'bg-slate-800 text-white border-slate-900 hover:bg-slate-900 shadow-2xs'
                            : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200/80'
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
                      title="Yalnızca son eksik ölçüt tamamlandığında sıradaki bekleyen öğrenciye otomatik geçer; mevcut puanı düzeltirken tetiklenmez"
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer min-h-[34px] flex items-center gap-1.5 ${
                        autoAdvanceStudent
                          ? 'bg-slate-800 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
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
                          ? 'bg-blue-900 text-white border-blue-950'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
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

                {/* Second Row: Student Identity & Evaluation Status Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-900 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                      {getInitials(selectedStudent.fullName)}
                    </div>
                    <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-900 border border-slate-300 shrink-0">
                      #{selectedStudent.studentNumber}
                    </span>
                    <h2
                      className="text-base sm:text-lg font-bold text-slate-900 truncate max-w-[220px] sm:max-w-[340px] md:max-w-[460px] lg:max-w-[560px]"
                      title={selectedStudent.fullName}
                    >
                      {selectedStudent.fullName}
                    </h2>

                    {/* Definitive Score vs Incomplete Draft Badge */}
                    {effectiveCalc.isComplete &&
                    effectiveCalc.finalScoreOutOf100 !== null ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl text-xs font-bold bg-blue-900 text-white border border-blue-950 font-mono-num shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-200" />
                        Kesin Not: {effectiveCalc.finalScoreOutOf100} / 100 ·{' '}
                        {effectiveCalc.performanceLabel}
                      </span>
                    ) : effectiveCalc.completedCriteriaCount > 0 ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 font-mono-num shrink-0">
                        Taslak ({effectiveCalc.completedCriteriaCount}/
                        {effectiveCalc.totalCriteriaCount})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                        Puanlanmadı (0/{effectiveCalc.totalCriteriaCount})
                      </span>
                    )}

                    {activeLowScoreReminder?.shouldRemind && (
                      <button
                        type="button"
                        onClick={focusObservationNoteInput}
                        data-testid="low-score-observation-reminder"
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 transition-colors cursor-pointer shadow-2xs shrink-0"
                        title={`${activeLowScoreReminder.message}. Gözlem notu alanına gitmek için tıklayın.`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                        <span>
                          Üst üste {activeLowScoreReminder.consecutiveCount}{' '}
                          düşük puan (1-2) ·{' '}
                          <span className="underline">Gözlem notu ekle</span>
                        </span>
                      </button>
                    )}
                  </div>

                  {hasGroupData && (
                    <div className="flex flex-wrap items-center gap-2 bg-slate-100 border border-slate-300 rounded-xl px-2.5 py-1 text-xs shrink-0">
                      <span className="font-semibold text-slate-800 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-blue-900" />
                        Bireysel:{' '}
                        <strong className="font-mono-num">
                          {individualCalc.finalScoreOutOf100 !== null
                            ? `${individualCalc.finalScoreOutOf100}`
                            : `${individualCalc.completedCriteriaCount}/${individualCalc.totalCriteriaCount}`}
                        </strong>{' '}
                        · Grup ({currentStudentEval?.evaluatedViaGroup || 'Grup'}):{' '}
                        <strong className="font-mono-num">
                          {groupCalc.finalScoreOutOf100 !== null
                            ? `${groupCalc.finalScoreOutOf100}`
                            : `${groupCalc.completedCriteriaCount}/${groupCalc.totalCriteriaCount}`}
                        </strong>
                      </span>
                      <div className="inline-flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-300">
                        <button
                          type="button"
                          onClick={() =>
                            onSwitchActiveScoreSource(
                              selectedStudent.id,
                              'individual'
                            )
                          }
                          className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                            activeSource === 'individual'
                              ? 'bg-blue-900 text-white'
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
                          className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                            activeSource === 'group'
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Grup Puanını Yansıt
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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

              {/* Shared Rubric Criterion Cards List / Single-Criterion Focus Stage */}
              <div
                className={
                  !focusModeEnabled && cardViewMode === 'compact'
                    ? 'space-y-2'
                    : 'space-y-3.5'
                }
              >
                {activeRubric.criteria.map((criterion, cIdx) => {
                  const isFocused = cIdx === focusStepSummary.activeIndex;

                  // In Focus Mode + "Diğerlerini Gizle", completely hide all non-selected criteria
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

                  return (
                    <RubricCriterionCard
                      key={criterion.id}
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
                                  Math.max(0, focusStepSummary.activeIndex - 1)
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
                  );
                })}
              </div>

              {/* Observation Note & Quick Tags — Calm Slate & Navy Identity */}
              <div className="pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-slate-700" />
                    Hızlı Gözlem Etiketleri
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_OBSERVATION_TAGS.map((tag) => {
                      const active = (currentStudentEval?.tags || []).includes(
                        tag
                      );
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => onToggleStudentTag(tag)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer min-h-[36px] ${
                            active
                              ? 'bg-blue-900 text-white border-blue-950 shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-slate-300 hover:border-blue-900 hover:bg-white'
                          }`}
                        >
                          {active ? '✓ ' : '+ '}
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <label
                      htmlFor="student-obs-note"
                      className="text-xs font-bold text-slate-700 flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-slate-700" />
                      Gözlem Notu
                    </label>
                    {activeLowScoreReminder?.shouldRemind && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
                        <AlertTriangle className="w-3 h-3 text-amber-800" />
                        Gözlem notu ekle (Üst üste{' '}
                        {activeLowScoreReminder.consecutiveCount} düşük puan)
                      </span>
                    )}
                  </div>
                  <textarea
                    id="student-obs-note"
                    rows={2}
                    value={currentStudentEval?.note || ''}
                    onChange={(e) => onUpdateStudentNote(e.target.value)}
                    placeholder={
                      activeLowScoreReminder?.shouldRemind
                        ? 'Öğrenci üst üste 3 değerlendirmede düşük puan (1 veya 2) aldı. Destekleyici gözlem notu ekleyin...'
                        : 'Öğrencinin bireysel süreç becerisi ve gelişim notu...'
                    }
                    className={`w-full p-3 text-xs rounded-xl focus:bg-white focus:outline-none focus:ring-2 ${
                      activeLowScoreReminder?.shouldRemind &&
                      !activeLowScoreReminder.hasObservationNote
                        ? 'bg-amber-50/70 border-2 border-amber-400 focus:ring-amber-600'
                        : 'bg-slate-50 border border-slate-300 focus:ring-blue-900'
                    }`}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

