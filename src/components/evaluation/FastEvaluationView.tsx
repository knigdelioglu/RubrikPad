import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  MessageSquare,
  RotateCcw,
  Sliders,
  Table,
  Zap,
} from 'lucide-react';
import type {
  Classroom,
  EvaluationSession,
  Rubric,
  Student,
} from '../../types.ts';
import {
  getCriterionSection,
  getStudentConsecutiveLowScoreReminder,
  getStudentEvaluationBreakdown,
  hasStudentObservationData,
  isScoreAssigned,
} from '../../utils/rubricLogic.ts';
import {
  RubricCriterionCard,
  type RubricCardViewMode,
} from './RubricCriterionCard.tsx';

interface FastEvaluationViewProps {
  activeSession: EvaluationSession;
  activeRubric: Rubric;
  allRubrics: Rubric[];
  classrooms: Classroom[];
  classStudents: Student[];
  selectedStudent: Student | undefined;
  selectedStudentId: string;
  onSelectStudent: (id: string) => void;
  onChangeSessionRubric: (rubricId: string) => void;
  onExitFastMode: () => void;
  onOpenMatrixView: () => void;
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
  autoAdvanceStudent: boolean;
  onToggleAutoAdvance: () => void;
  precisionScoringMode: boolean;
  onTogglePrecisionScoring: () => void;
  fastCompletionBanner: {
    completedStudentId?: string;
    completedStudentName: string;
    scoreOutOf100: number;
    nextStudentId: string | null;
    nextStudentName: string | null;
  } | null;
  onDismissBanner: () => void;
  statusAnnouncement: string;
  pendingRubricChange?: {
    targetRubric: Rubric;
    evaluatedStudentCount: number;
    evaluatedGroupCount: number;
    reason: string;
  } | null;
  onCreateNewSessionWithRubric?: (targetRubric: Rubric) => void;
  onConfirmResetAndChangeRubric?: (targetRubric: Rubric) => void;
  onCancelRubricChange?: () => void;
  downloadControl?: React.ReactNode;
  onOpenQuickNoteModal?: (studentId: string) => void;
  allSessions?: EvaluationSession[];
  rubricsById?: Record<string, Rubric>;
  sessionClassrooms?: Classroom[];
  activeClassroom?: Classroom;
  onSelectClassroom?: (classId: string) => void;
}

export const FastEvaluationView: React.FC<FastEvaluationViewProps> = ({
  activeSession,
  activeRubric,
  allRubrics,
  classStudents,
  selectedStudent,
  selectedStudentId,
  onSelectStudent,
  onChangeSessionRubric,
  onExitFastMode,
  onOpenMatrixView,
  onSelectCriterionLevel,
  onSetDirectCriterionScore,
  onClearCriterionScore,
  onResetStudentScores,
  autoAdvanceStudent,
  onToggleAutoAdvance,
  precisionScoringMode,
  onTogglePrecisionScoring,
  fastCompletionBanner,
  onDismissBanner,
  statusAnnouncement,
  pendingRubricChange,
  onCreateNewSessionWithRubric,
  onConfirmResetAndChangeRubric,
  onCancelRubricChange,
  downloadControl,
  onOpenQuickNoteModal,
  allSessions,
  rubricsById,
  sessionClassrooms = [],
  activeClassroom,
  onSelectClassroom,
}) => {
  const viewMode: RubricCardViewMode = 'compact';
  const effectiveSessions =
    allSessions && allSessions.length > 0 ? allSessions : [activeSession];
  const effectiveRubricsMap =
    rubricsById && Object.keys(rubricsById).length > 0
      ? rubricsById
      : { [activeRubric.id]: activeRubric };

  const currentStudentEval = selectedStudent
    ? activeSession.evaluations[selectedStudent.id]
    : undefined;

  const breakdown = getStudentEvaluationBreakdown(
    activeRubric,
    currentStudentEval
  );
  const currentScoreCalc = breakdown.effectiveCalc;
  const activeSource = breakdown.activeSource;

  return (
    <div className="w-full px-3 sm:px-5 py-2">
      <div className="sr-only" role="status" aria-live="polite">
        {statusAnnouncement}
      </div>

      <div className="bg-white border border-slate-300 rounded-2xl p-3 flex flex-col h-[calc(100vh-76px)] min-h-[540px] overflow-hidden shadow-xs">
        {/* Compact Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-200 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onExitFastMode}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-900 text-white hover:bg-blue-950 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Standart Görünüme Dön
            </button>
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-blue-900 shrink-0" />
              <h1 className="text-sm font-bold text-slate-900">
                Hızlı Değerlendirme Modu
                {activeClassroom ? ` (${activeClassroom.name})` : ''}
              </h1>
            </div>

            {sessionClassrooms.length > 1 && onSelectClassroom && (
              <div
                data-testid="fast-view-class-switcher"
                className="flex items-center gap-1 bg-slate-100 border border-slate-300 rounded-xl p-0.5"
              >
                {sessionClassrooms.map((cls) => {
                  const isSelectedCls = activeClassroom?.id === cls.id;
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      data-testid={`fast-class-tab-${cls.id}`}
                      onClick={() => onSelectClassroom(cls.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        isSelectedCls
                          ? 'bg-blue-900 text-white'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      {cls.name}
                    </button>
                  );
                })}
              </div>
            )}

            <label htmlFor="fast-rubric-select" className="sr-only">
              Değerlendirme Rubriği Seçin
            </label>
            <select
              id="fast-rubric-select"
              aria-label="Değerlendirme Rubriği Seçin"
              value={activeRubric.id}
              onChange={(e) => onChangeSessionRubric(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer max-w-[300px] truncate"
            >
              {allRubrics.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.criteria.length} Ölçüt)
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onTogglePrecisionScoring}
              aria-pressed={precisionScoringMode}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer transition-colors ${
                precisionScoringMode
                  ? 'bg-blue-900 text-white border-blue-950'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="Ölçüt sınırları içinde doğrudan tam sayı puan girişi"
            >
              <Sliders className="w-3.5 h-3.5" />
              Hassas Tam Sayı Puanı
            </button>

            <button
              type="button"
              onClick={onToggleAutoAdvance}
              aria-pressed={autoAdvanceStudent}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                autoAdvanceStudent
                  ? 'bg-slate-800 text-white border-slate-900'
                  : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}
            >
              Otomatik Geçiş: {autoAdvanceStudent ? 'Açık' : 'Kapalı'}
            </button>


            <button
              type="button"
              onClick={onOpenMatrixView}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <Table className="w-3.5 h-3.5 text-slate-700" />
              Toplu Matris Özeti
            </button>

            {downloadControl}
          </div>
        </div>

        {pendingRubricChange && (
          <div
            role="alert"
            className="mb-2 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs"
          >
            <div className="font-semibold">
              <span>
                Rubrik Değiştirme Koruması: {pendingRubricChange.reason}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {onCreateNewSessionWithRubric && (
                <button
                  type="button"
                  onClick={() =>
                    onCreateNewSessionWithRubric(
                      pendingRubricChange.targetRubric
                    )
                  }
                  className="px-2.5 py-1 rounded bg-blue-900 text-white font-bold hover:bg-blue-950 cursor-pointer"
                >
                  Yeni Oturumda Aç (Mevcut Notları Koru)
                </button>
              )}
              {onConfirmResetAndChangeRubric && (
                <button
                  type="button"
                  onClick={() =>
                    onConfirmResetAndChangeRubric(
                      pendingRubricChange.targetRubric
                    )
                  }
                  className="px-2.5 py-1 rounded bg-white border border-amber-400 text-amber-950 font-semibold hover:bg-amber-100 cursor-pointer"
                >
                  Puanları Sıfırlayarak Değiştir
                </button>
              )}
              {onCancelRubricChange && (
                <button
                  type="button"
                  onClick={onCancelRubricChange}
                  className="px-2 py-1 text-slate-700 font-medium hover:underline cursor-pointer"
                >
                  İptal
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-12 gap-3 flex-1 min-h-0 overflow-hidden">
          {/* Left Column: Student Roster */}
          <div className="col-span-4 lg:col-span-3 flex flex-col min-h-0 border-r border-slate-200 pr-2.5">
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 shrink-0">
              <span className="text-xs font-bold text-slate-700">
                Öğrenciler ({classStudents.length})
              </span>
              <span className="text-[11px] font-mono-num font-semibold text-slate-800">
                {
                  classStudents.filter((s) => {
                    const ev = activeSession.evaluations[s.id];
                    return getStudentEvaluationBreakdown(activeRubric, ev)
                      .effectiveCalc.isComplete;
                  }).length
                }
                /{classStudents.length} Tamam
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
              {classStudents.map((stu) => {
                const ev = activeSession.evaluations[stu.id];
                const calc = getStudentEvaluationBreakdown(
                  activeRubric,
                  ev
                ).effectiveCalc;
                const isSelected = stu.id === selectedStudent?.id;
                const hasObsData = hasStudentObservationData(ev);

                return (
                  <div
                    key={stu.id}
                    data-testid={`fast-student-card-${stu.id}`}
                    className={`w-full rounded-xl border transition-all flex items-center justify-between gap-1 pr-1.5 min-h-[40px] ${
                      isSelected
                        ? 'bg-blue-900 border-blue-950 text-white shadow-xs'
                        : calc.isComplete
                        ? 'bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200/70'
                        : calc.completedCriteriaCount > 0
                        ? 'bg-slate-50 border-slate-300 text-slate-900 hover:bg-slate-100'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStudent(stu.id);
                        onDismissBanner();
                      }}
                      className="flex-1 min-w-0 text-left pl-2.5 pr-1 py-2 flex items-center justify-between gap-1.5 cursor-pointer min-h-[40px]"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`font-mono-num text-[11px] font-bold shrink-0 ${
                            isSelected ? 'text-blue-200' : 'text-slate-400'
                          }`}
                        >
                          #{stu.studentNumber}
                        </span>
                        <span className="text-xs font-bold truncate">
                          {stu.fullName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {calc.dualResult ? (
                          calc.dualResult.isBookPresentationComplete &&
                          calc.dualResult.finalBookPresentationScoreOutOf100 !==
                            null ? (
                            <span
                              className={`font-mono-num text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-white text-blue-950'
                                  : 'bg-slate-700 text-white'
                              }`}
                            >
                              <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                              Kitap:{' '}
                              {
                                calc.dualResult
                                  .finalBookPresentationScoreOutOf100
                              }{' '}
                              · Konuşma:{' '}
                              {calc.dualResult.finalSpeakingScoreOutOf100}
                            </span>
                          ) : calc.dualResult.isSpeakingComplete &&
                            calc.dualResult.finalSpeakingScoreOutOf100 !==
                              null ? (
                            <span
                              className={`font-mono-num text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                isSelected
                                  ? 'bg-blue-800 text-blue-100'
                                  : 'bg-slate-200 text-slate-800'
                              }`}
                            >
                              Konuşma:{' '}
                              {calc.dualResult.finalSpeakingScoreOutOf100} ·
                              Taslak ({calc.completedCriteriaCount}/
                              {calc.totalCriteriaCount})
                            </span>
                          ) : calc.completedCriteriaCount > 0 ? (
                            <span
                              className={`font-mono-num text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                isSelected
                                  ? 'bg-blue-800 text-blue-100'
                                  : 'bg-slate-200 text-slate-800'
                              }`}
                            >
                              Taslak ({calc.completedCriteriaCount}/
                              {calc.totalCriteriaCount})
                            </span>
                          ) : null
                        ) : calc.isComplete &&
                          calc.finalScoreOutOf100 !== null ? (
                          <span
                            className={`font-mono-num text-[11px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                              isSelected
                                ? 'bg-white text-blue-950'
                                : 'bg-slate-700 text-white'
                            }`}
                          >
                            <Check className="w-3 h-3 stroke-[2.5]" />
                            {calc.finalScoreOutOf100}
                          </span>
                        ) : calc.completedCriteriaCount > 0 ? (
                          <span
                            className={`font-mono-num text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isSelected
                                ? 'bg-blue-800 text-blue-100'
                                : 'bg-slate-200 text-slate-800'
                            }`}
                          >
                            Taslak ({calc.completedCriteriaCount}/
                            {calc.totalCriteriaCount})
                          </span>
                        ) : null}
                      </div>
                    </button>

                    {onOpenQuickNoteModal && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenQuickNoteModal(stu.id);
                        }}
                        data-testid={`fast-quick-note-icon-${stu.id}`}
                        aria-label={`${stu.fullName} için Hızlı Gözlem Notu`}
                        title={
                          hasObsData
                            ? `Hızlı Gözlem Notunu Düzenle (${stu.fullName})${
                                ev?.note ? `: "${ev.note}"` : ''
                              }`
                            : `${stu.fullName} için Hızlı Gözlem Notu Ekle`
                        }
                        className={`shrink-0 p-1.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-center relative ${
                          isSelected
                            ? hasObsData
                              ? 'bg-white text-blue-950 border-white hover:bg-slate-100'
                              : 'bg-blue-800 text-blue-100 border-blue-700 hover:bg-blue-950'
                            : hasObsData
                            ? 'bg-slate-800 text-white border-slate-900 hover:bg-slate-900'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-blue-900 hover:text-blue-900'
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        {hasObsData && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 absolute -top-0.5 -right-0.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Student Header + Shared RubricCriterionCard List */}
          <div className="col-span-8 lg:col-span-9 flex flex-col min-h-0 overflow-hidden">
            {selectedStudent ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      #{selectedStudent.studentNumber}
                    </span>
                    <h2 className="text-base font-bold text-slate-900 truncate">
                      {selectedStudent.fullName}
                    </h2>
                    {currentScoreCalc.dualResult ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          data-testid="fast-dual-book-score"
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold font-mono-num border ${
                            currentScoreCalc.dualResult
                              .isBookPresentationComplete &&
                            currentScoreCalc.dualResult
                              .finalBookPresentationScoreOutOf100 !== null
                              ? 'bg-blue-900 text-white border-blue-950'
                              : 'bg-slate-100 text-slate-800 border-slate-300'
                          }`}
                        >
                          {currentScoreCalc.dualResult
                            .isBookPresentationComplete &&
                          currentScoreCalc.dualResult
                            .finalBookPresentationScoreOutOf100 !== null ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-blue-200 stroke-[2.5]" />
                              Kitap Sunumu:{' '}
                              {
                                currentScoreCalc.dualResult
                                  .finalBookPresentationScoreOutOf100
                              }{' '}
                              / 100
                            </>
                          ) : (
                            <>
                              Kitap Sunumu Taslak:{' '}
                              {
                                currentScoreCalc.dualResult
                                  .provisionalBookPresentationScoreOutOf100
                              }{' '}
                              / 100 (İçerik:{' '}
                              {currentScoreCalc.dualResult.contentScoreOutOf70}
                              /70 + Sunum:{' '}
                              {
                                currentScoreCalc.dualResult
                                  .speakingContributionOutOf30
                              }
                              /30)
                            </>
                          )}
                        </span>
                        <span
                          data-testid="fast-dual-speaking-score"
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold font-mono-num border ${
                            currentScoreCalc.dualResult.isSpeakingComplete &&
                            currentScoreCalc.dualResult
                              .finalSpeakingScoreOutOf100 !== null
                              ? 'bg-slate-900 text-white border-slate-950'
                              : 'bg-slate-100 text-slate-800 border-slate-300'
                          }`}
                        >
                          {currentScoreCalc.dualResult.isSpeakingComplete &&
                          currentScoreCalc.dualResult
                            .finalSpeakingScoreOutOf100 !== null ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-blue-200 stroke-[2.5]" />
                              Konuşma Sınavı:{' '}
                              {
                                currentScoreCalc.dualResult
                                  .finalSpeakingScoreOutOf100
                              }{' '}
                              / 100
                            </>
                          ) : (
                            <>
                              Konuşma Sınavı Taslak:{' '}
                              {
                                currentScoreCalc.dualResult
                                  .provisionalSpeakingScoreOutOf100
                              }{' '}
                              / 100 (
                              {
                                currentScoreCalc.dualResult
                                  .completedSpeakingCount
                              }
                              /
                              {currentScoreCalc.dualResult.totalSpeakingCount})
                            </>
                          )}
                        </span>
                      </div>
                    ) : currentScoreCalc.isComplete &&
                      currentScoreCalc.finalScoreOutOf100 !== null ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-900 text-white border border-blue-950 font-mono-num">
                        <Check className="w-3.5 h-3.5 text-blue-200 stroke-[2.5]" />
                        Kesin Not: {currentScoreCalc.finalScoreOutOf100} / 100 ·{' '}
                        {currentScoreCalc.performanceLabel}
                      </span>
                    ) : currentScoreCalc.completedCriteriaCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 font-mono-num">
                        Taslak ({currentScoreCalc.completedCriteriaCount}/
                        {currentScoreCalc.totalCriteriaCount})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-600">
                        Puanlanmadı (0/
                        {currentScoreCalc.totalCriteriaCount})
                      </span>
                    )}

                    {getStudentConsecutiveLowScoreReminder(
                      selectedStudent.id,
                      activeSession,
                      effectiveSessions,
                      effectiveRubricsMap
                    ).shouldRemind && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenQuickNoteModal
                            ? onOpenQuickNoteModal(selectedStudent.id)
                            : onExitFastMode()
                        }
                        data-testid="low-score-observation-reminder"
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 cursor-pointer"
                        title="Üst üste 3 değerlendirmede düşük puan (1 veya 2) — Gözlem notu eklemek için tıklayın"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>Gözlem notu ekle</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onOpenQuickNoteModal && (
                      <button
                        type="button"
                        onClick={() => onOpenQuickNoteModal(selectedStudent.id)}
                        data-testid="fast-active-student-quick-note-btn"
                        aria-label={`${selectedStudent.fullName} için Hızlı Gözlem Notu`}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                          hasStudentObservationData(currentStudentEval)
                            ? 'bg-slate-800 text-white border-slate-900 hover:bg-slate-900'
                            : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Hızlı Gözlem Notu</span>
                      </button>
                    )}

                    {fastCompletionBanner &&
                      fastCompletionBanner.completedStudentId &&
                      fastCompletionBanner.completedStudentId !==
                        selectedStudent.id && (
                        <button
                          type="button"
                          onClick={() => {
                            if (fastCompletionBanner.completedStudentId) {
                              onSelectStudent(
                                fastCompletionBanner.completedStudentId
                              );
                              onDismissBanner();
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-200 flex items-center gap-1 cursor-pointer"
                        >
                          <ArrowLeft className="w-3 h-3" />
                          Önceki: {fastCompletionBanner.completedStudentName} (
                          {fastCompletionBanner.scoreOutOf100}P)
                        </button>
                      )}

                    {fastCompletionBanner &&
                      fastCompletionBanner.nextStudentId &&
                      fastCompletionBanner.completedStudentId ===
                        selectedStudent.id && (
                        <button
                          type="button"
                          onClick={() => {
                            if (fastCompletionBanner.nextStudentId) {
                              onSelectStudent(
                                fastCompletionBanner.nextStudentId
                              );
                              onDismissBanner();
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-900 text-white text-xs font-bold hover:bg-blue-950 cursor-pointer"
                        >
                          Sıradaki: {fastCompletionBanner.nextStudentName} →
                        </button>
                      )}

                    <button
                      type="button"
                      onClick={() => onResetStudentScores(selectedStudentId)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Sıfırla
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-y-auto pr-1">
                  {(() => {
                    const firstUnscoredCrit = activeRubric.criteria.find(
                      (crit) => {
                        const sPts =
                          activeSource === 'group'
                            ? currentStudentEval?.groupCriterionScores?.[crit.id]
                            : currentStudentEval?.criterionScores?.[crit.id];
                        const dPts =
                          activeSource === 'group'
                            ? currentStudentEval?.groupDirectScores?.[crit.id]
                            : currentStudentEval?.directCriterionScores?.[
                                crit.id
                              ];
                        return !isScoreAssigned(dPts) && !isScoreAssigned(sPts);
                      }
                    );

                    return activeRubric.criteria.map((criterion, cIdx) => {
                      const selectedPts =
                        activeSource === 'group'
                          ? currentStudentEval?.groupCriterionScores?.[
                              criterion.id
                            ]
                          : currentStudentEval?.criterionScores?.[criterion.id];
                      const directPts =
                        activeSource === 'group'
                          ? currentStudentEval?.groupDirectScores?.[criterion.id]
                          : currentStudentEval?.directCriterionScores?.[
                              criterion.id
                            ];
                      const groupPts =
                        currentStudentEval?.groupCriterionScores?.[criterion.id];
                      const isDual = Boolean(currentScoreCalc.dualResult);
                      const currentSec = getCriterionSection(
                        criterion,
                        cIdx,
                        activeRubric
                      );
                      const prevSec =
                        cIdx > 0
                          ? getCriterionSection(
                              activeRubric.criteria[cIdx - 1],
                              cIdx - 1,
                              activeRubric
                            )
                          : null;
                      const showContentHeader =
                        isDual && currentSec === 'content' && cIdx === 0;
                      const showSpeakingHeader =
                        isDual &&
                        currentSec === 'speaking' &&
                        prevSec !== 'speaking';

                      return (
                        <React.Fragment key={criterion.id}>
                          {showContentHeader && currentScoreCalc.dualResult && (
                            <div className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs font-bold text-slate-900">
                              <span>
                                1. Kitap İçeriği — 70 Puan (Kitap Türüne Özgü 4
                                Ölçüt)
                              </span>
                            </div>
                          )}
                          {showSpeakingHeader &&
                            currentScoreCalc.dualResult && (
                              <div className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-900">
                                <span>
                                  2. Ortak Konuşma Değerlendirmesi — 100 Puan
                                  (Ortak 6 Ölçüt)
                                </span>
                              </div>
                            )}
                          <RubricCriterionCard
                            criterion={criterion}
                            criterionIndex={cIdx}
                            selectedPoints={selectedPts}
                            directPoints={directPts}
                            reflectedGroupPoints={groupPts}
                            viewMode={viewMode}
                            precisionScoringMode={precisionScoringMode}
                            isNextUnscored={
                              firstUnscoredCrit?.id === criterion.id
                            }
                            onSelectLevel={(critId, pts) =>
                              onSelectCriterionLevel(critId, pts, {
                                advanceStudentOnComplete: autoAdvanceStudent,
                              })
                            }
                            onSetDirectScore={(critId, dPts) =>
                              onSetDirectCriterionScore(critId, dPts, {
                                advanceStudentOnComplete: autoAdvanceStudent,
                              })
                            }
                            onClearScore={onClearCriterionScore}
                          />
                        </React.Fragment>
                      );
                    });
                  })()}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
