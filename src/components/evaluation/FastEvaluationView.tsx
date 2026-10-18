import React from 'react';
import {
  ArrowLeft,
  Check,
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
  getStudentEvaluationBreakdown,
  isScoreAssigned,
} from '../../utils/rubricLogic.ts';

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
    directPoints: number | null
  ) => void;
  onClearCriterionScore: (criterionId: string) => void;
  onResetStudentScores: (studentId: string) => void;
  onUndoLastAction: () => void;
  autoAdvanceStudent: boolean;
  onToggleAutoAdvance: () => void;
  precisionScoringMode: boolean;
  onTogglePrecisionScoring: () => void;
  fastCompletionBanner: {
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
}) => {
  const currentStudentEval = selectedStudent
    ? activeSession.evaluations[selectedStudent.id]
    : undefined;

  const breakdown = getStudentEvaluationBreakdown(
    activeRubric,
    currentStudentEval
  );
  const currentScoreCalc = breakdown.individualCalc;

  const isDenseRubric = activeRubric.criteria.length >= 6;
  const undoCount = activeSession.undoHistory?.length || 0;

  return (
    <div className="max-w-[1880px] mx-auto px-3 sm:px-5 py-2">
      {/* Screen-reader live region for accessible status announcements (P2) */}
      <div className="sr-only" role="status" aria-live="polite">
        {statusAnnouncement}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-col h-[calc(100vh-76px)] min-h-[500px] overflow-hidden shadow-xs">
        {/* Compact Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExitFastMode}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Geri
            </button>
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-teal-700 shrink-0" />
              <h1 className="text-sm font-bold text-slate-900">
                Hızlı Değerlendirme
              </h1>
            </div>

            {/* Rubric Switcher with Scored-Session Protection (Issue #6) */}
            <label htmlFor="fast-rubric-select" className="sr-only">
              Değerlendirme Rubriği Seçin
            </label>
            <select
              id="fast-rubric-select"
              aria-label="Değerlendirme Rubriği Seçin"
              value={activeRubric.id}
              onChange={(e) => onChangeSessionRubric(e.target.value)}
              className="px-2.5 py-1 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 cursor-pointer max-w-[300px] truncate"
            >
              {allRubrics.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.criteria.length} Ölçüt)
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Precision Integer Scoring Toggle (P1 #2) */}
            <button
              type="button"
              onClick={onTogglePrecisionScoring}
              aria-pressed={precisionScoringMode}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border cursor-pointer transition-colors ${
                precisionScoringMode
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="Ölçüt sınırları içinde doğrudan tam sayı puan girişi"
            >
              <Sliders className="w-3.5 h-3.5" />
              Hassas Tam Sayı Puanı
            </button>

            {/* Auto-advance Toggle (P2 Ergonomics) */}
            <button
              type="button"
              onClick={onToggleAutoAdvance}
              aria-pressed={autoAdvanceStudent}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                autoAdvanceStudent
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}
            >
              Otomatik Geçiş: {autoAdvanceStudent ? 'Açık' : 'Kapalı'}
            </button>

            {/* Undo Button (P1 #7) */}
            <button
              type="button"
              disabled={undoCount === 0}
              onClick={onUndoLastAction}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
              title="Son puanlama işlemini geri al"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Geri Al {undoCount > 0 ? `(${undoCount})` : ''}
            </button>

            <button
              type="button"
              onClick={onOpenMatrixView}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <Table className="w-3.5 h-3.5" />
              Tam Ekran Matris
            </button>
          </div>
        </div>

        {/* Scored Session Rubric Change Protection Banner (Issue #6) */}
        {pendingRubricChange && (
          <div
            role="alert"
            className="mb-2 p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs"
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

        {/* Split Layout: Left Student Roster | Right Ultra-Compact Criteria List (4 to 8 criteria fit without scroll) */}
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
                      .individualCalc.isComplete;
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
                ).individualCalc;
                const isSelected = stu.id === selectedStudent?.id;

                return (
                  <button
                    key={stu.id}
                    type="button"
                    onClick={() => {
                      onSelectStudent(stu.id);
                      onDismissBanner();
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-all flex items-center justify-between gap-2 cursor-pointer min-h-[38px] ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                        : calc.isComplete
                        ? 'bg-emerald-50/70 border-emerald-200 text-slate-900 hover:bg-emerald-100/60'
                        : calc.completedCriteriaCount > 0
                        ? 'bg-amber-50/70 border-amber-200 text-slate-900 hover:bg-amber-100/60'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
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
                      {/* P0 #2: Only show final score out of 100 when complete; show X/Y when partial */}
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
                          {calc.completedCriteriaCount}/{calc.totalCriteriaCount}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Student Header + Ultra-Compact Criterion Bars (No Descriptions!) */}
          <div className="col-span-8 lg:col-span-9 flex flex-col min-h-0 overflow-hidden">
            {selectedStudent ? (
              <>
                {/* Compact Student Status Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-1.5 border-b border-slate-200 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      #{selectedStudent.studentNumber}
                    </span>
                    <h2 className="text-base font-bold text-slate-900 truncate">
                      {selectedStudent.fullName}
                    </h2>
                    {/* P0 #2: Clear distinction between Partial (Taslak) and Complete (Kesin Not) */}
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
                        Henüz Puanlanmadı (0/{currentScoreCalc.totalCriteriaCount})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {fastCompletionBanner &&
                      fastCompletionBanner.nextStudentId && (
                        <button
                          type="button"
                          onClick={() => {
                            if (fastCompletionBanner.nextStudentId) {
                              onSelectStudent(fastCompletionBanner.nextStudentId);
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

                {/* Criterion Rows Container: Distributed evenly so 4 to 8 criteria fit in 1 screen without descriptions */}
                <div className="flex-1 flex flex-col gap-1.5 min-h-0 overflow-y-auto">
                  {activeRubric.criteria.map((criterion, cIdx) => {
                    const selectedPts =
                      currentStudentEval?.criterionScores?.[criterion.id];
                    const directPts =
                      currentStudentEval?.directCriterionScores?.[criterion.id];
                    const isAnswered =
                      isScoreAssigned(selectedPts) ||
                      isScoreAssigned(directPts);
                    const critMaxPts = criterion.maxPoints ?? criterion.weight;

                    return (
                      <div
                        key={criterion.id}
                        className={`flex-1 min-h-[38px] max-h-[88px] rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          isDenseRubric ? 'px-3 py-1.5' : 'px-3.5 py-2'
                        } ${
                          isAnswered
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : 'bg-slate-50/80 border-slate-200'
                        }`}
                      >
                        {/* Left: Criterion Number, Title & Max Points Badge (NO description!) */}
                        <div className="flex items-center gap-2.5 sm:w-5/12 min-w-0">
                          <span
                            className={`font-mono-num text-xs font-bold px-2 py-1 rounded-md shrink-0 ${
                              isAnswered
                                ? 'bg-emerald-700 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            0{cIdx + 1}
                          </span>
                          <span
                            className={`${
                              isDenseRubric ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
                            } font-bold text-slate-900 truncate`}
                            title={criterion.title}
                          >
                            {criterion.title}
                          </span>
                          <span className="font-mono-num text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md shrink-0">
                            {critMaxPts}P
                          </span>
                        </div>

                        {/* Right: Compact Level Buttons (0..4) + Optional Precision Integer Input */}
                        <div className="flex items-center gap-1.5 sm:w-7/12 h-full">
                          <div
                            className="grid flex-1 gap-1.5 h-full"
                            style={{
                              gridTemplateColumns: `repeat(${criterion.levels.length}, minmax(0, 1fr))`,
                            }}
                          >
                            {criterion.levels.map((lvl) => {
                              const isSelected =
                                !isScoreAssigned(directPts) &&
                                selectedPts === lvl.points;
                              return (
                                <button
                                  key={lvl.level}
                                  type="button"
                                  onClick={() =>
                                    onSelectCriterionLevel(
                                      criterion.id,
                                      lvl.points,
                                      {
                                        advanceStudentOnComplete:
                                          autoAdvanceStudent,
                                      }
                                    )
                                  }
                                  className={`h-full rounded-lg border text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                    isDenseRubric
                                      ? 'py-1.5 px-2 min-h-[34px]'
                                      : 'py-2 px-2.5 min-h-[44px]'
                                  } ${
                                    isSelected
                                      ? lvl.points === 0
                                        ? 'bg-rose-700 border-rose-800 text-white font-bold shadow-xs'
                                        : 'bg-teal-700 border-teal-800 text-white font-bold shadow-xs'
                                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                                  }`}
                                >
                                  <span className="font-mono-num text-xs sm:text-sm font-bold">
                                    {lvl.points}P
                                  </span>
                                  <span className="text-xs font-medium truncate hidden xl:inline">
                                    {lvl.label.replace(/\s*\(0\)/, '')}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Precision Direct Integer Score Input (0..critMaxPts) (P1 #2) */}
                          {precisionScoringMode && (
                            <div className="flex items-center gap-1 shrink-0 bg-white border border-teal-300 rounded-md px-1.5 py-0.5">
                              <input
                                type="number"
                                min={0}
                                max={critMaxPts}
                                step={1}
                                aria-label={`${criterion.title} doğrudan puan (0-${critMaxPts})`}
                                placeholder={`0-${critMaxPts}`}
                                value={
                                  isScoreAssigned(directPts) ? directPts : ''
                                }
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    onSetDirectCriterionScore(
                                      criterion.id,
                                      null
                                    );
                                    return;
                                  }
                                  const num = Math.max(
                                    0,
                                    Math.min(
                                      critMaxPts,
                                      Math.round(Number(raw))
                                    )
                                  );
                                  onSetDirectCriterionScore(criterion.id, num);
                                }}
                                className="w-12 text-xs font-mono-num font-bold text-teal-950 text-right focus:outline-none"
                              />
                              <span className="text-[10px] font-mono-num text-slate-500">
                                /{critMaxPts}
                              </span>
                            </div>
                          )}

                          {/* Clear (Set to null = unscored) button (P0 #1) */}
                          {isAnswered && (
                            <button
                              type="button"
                              onClick={() =>
                                onClearCriterionScore(criterion.id)
                              }
                              aria-label={`${criterion.title} puanını temizle`}
                              title="Puanı temizle (puanlanmadı yap)"
                              className="px-1.5 py-1 text-[10px] font-bold text-slate-400 hover:text-red-600 rounded cursor-pointer shrink-0"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
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
