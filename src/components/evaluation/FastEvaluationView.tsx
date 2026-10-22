import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileDown,
  MessageSquare,
  RotateCcw,
  Sliders,
  Table,
  Undo2,
  Zap,
} from 'lucide-react';
import type {
  Classroom,
  EvaluationSession,
  Rubric,
  Student,
} from '../../types.ts';
import {
  getStudentConsecutiveLowScoreReminder,
  getStudentEvaluationBreakdown,
  hasStudentObservationData,
} from '../../utils/rubricLogic.ts';
import {
  RubricCriterionCard,
  RubricViewModeToggle,
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
  onUndoLastAction: () => void;
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
  onExportPdf?: () => void;
  onOpenQuickNoteModal?: (studentId: string) => void;
  allSessions?: EvaluationSession[];
  rubricsById?: Record<string, Rubric>;
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
  onUndoLastAction,
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
  onExportPdf,
  onOpenQuickNoteModal,
  allSessions,
  rubricsById,
}) => {
  const [viewMode, setViewMode] = useState<RubricCardViewMode>('compact');
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
  const undoCount = activeSession.undoHistory?.length || 0;

  return (
    <div className="max-w-[1880px] mx-auto px-3 sm:px-5 py-2">
      <div className="sr-only" role="status" aria-live="polite">
        {statusAnnouncement}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col h-[calc(100vh-76px)] min-h-[540px] overflow-hidden shadow-xs">
        {/* Compact Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-200 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onExitFastMode}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Standart Görünüme Dön
            </button>
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-teal-700 shrink-0" />
              <h1 className="text-sm font-bold text-slate-900">
                Hızlı Değerlendirme Modu
              </h1>
            </div>

            <label htmlFor="fast-rubric-select" className="sr-only">
              Değerlendirme Rubriği Seçin
            </label>
            <select
              id="fast-rubric-select"
              aria-label="Değerlendirme Rubriği Seçin"
              value={activeRubric.id}
              onChange={(e) => onChangeSessionRubric(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600 cursor-pointer max-w-[300px] truncate"
            >
              {allRubrics.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.criteria.length} Ölçüt)
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <RubricViewModeToggle
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
            />

            <button
              type="button"
              onClick={onTogglePrecisionScoring}
              aria-pressed={precisionScoringMode}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer transition-colors ${
                precisionScoringMode
                  ? 'bg-teal-700 text-white border-teal-700'
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
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}
            >
              Otomatik Geçiş: {autoAdvanceStudent ? 'Açık' : 'Kapalı'}
            </button>

            <button
              type="button"
              disabled={undoCount === 0}
              onClick={onUndoLastAction}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
              title="Son puanlama işlemini geri al"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Geri Al {undoCount > 0 ? `(${undoCount})` : ''}
            </button>

            <button
              type="button"
              onClick={onOpenMatrixView}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <Table className="w-3.5 h-3.5" />
              Toplu Matris Özeti
            </button>

            {onExportPdf && (
              <button
                type="button"
                onClick={onExportPdf}
                data-testid="download-active-session-pdf-btn"
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 flex items-center gap-1 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                PDF İndir
              </button>
            )}
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
                  className="px-2.5 py-1 rounded bg-teal-700 text-white font-bold hover:bg-teal-800 cursor-pointer"
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
                  Puanları Sıfırlayarak Değiştir (Geri Alınabilir)
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
              <span className="text-[11px] font-mono-num font-semibold text-teal-800">
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
                        ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                        : calc.isComplete
                        ? 'bg-emerald-50/70 border-emerald-200 text-slate-900 hover:bg-emerald-100/60'
                        : calc.completedCriteriaCount > 0
                        ? 'bg-amber-50/70 border-amber-200 text-slate-900 hover:bg-amber-100/60'
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
                            isSelected ? 'text-slate-300' : 'text-slate-400'
                          }`}
                        >
                          #{stu.studentNumber}
                        </span>
                        <span className="text-xs font-bold truncate">
                          {stu.fullName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {calc.isComplete && calc.finalScoreOutOf100 !== null ? (
                          <span
                            className={`font-mono-num text-[11px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                              isSelected
                                ? 'bg-emerald-500 text-white'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            <Check className="w-3 h-3 stroke-[2.5]" />
                            {calc.finalScoreOutOf100}
                          </span>
                        ) : calc.completedCriteriaCount > 0 ? (
                          <span
                            className={`font-mono-num text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isSelected
                                ? 'bg-amber-500 text-white'
                                : 'bg-amber-100 text-amber-900'
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
                              ? 'bg-teal-500 text-white border-teal-400 hover:bg-teal-400'
                              : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                            : hasObsData
                            ? 'bg-teal-600 text-white border-teal-700 hover:bg-teal-700'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-teal-300 hover:text-teal-700'
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        {hasObsData && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-300 absolute -top-0.5 -right-0.5" />
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
                    {currentScoreCalc.isComplete &&
                    currentScoreCalc.finalScoreOutOf100 !== null ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono-num">
                        <Check className="w-3.5 h-3.5 text-emerald-700 stroke-[2.5]" />
                        Kesin Not: {currentScoreCalc.finalScoreOutOf100} / 100 ·{' '}
                        {currentScoreCalc.performanceLabel}
                      </span>
                    ) : currentScoreCalc.completedCriteriaCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 font-mono-num">
                        Taslak ({currentScoreCalc.completedCriteriaCount}/
                        {currentScoreCalc.totalCriteriaCount} Ölçüt) · Kesin not
                        için tüm ölçütleri tamamlayın
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-600">
                        Henüz Puanlanmadı (0/
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
                            ? 'bg-teal-600 text-white border-teal-700 hover:bg-teal-700'
                            : 'bg-teal-50 text-teal-900 border-teal-200 hover:bg-teal-100'
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
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs font-bold hover:bg-emerald-100 flex items-center gap-1 cursor-pointer"
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
                          className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
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
                  {activeRubric.criteria.map((criterion, cIdx) => {
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

                    return (
                      <RubricCriterionCard
                        key={criterion.id}
                        criterion={criterion}
                        criterionIndex={cIdx}
                        selectedPoints={selectedPts}
                        directPoints={directPts}
                        reflectedGroupPoints={groupPts}
                        viewMode={viewMode}
                        precisionScoringMode={precisionScoringMode}
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
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
