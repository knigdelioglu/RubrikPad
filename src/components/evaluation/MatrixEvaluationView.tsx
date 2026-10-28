import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileDown,
  MessageSquare,
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
  isDualBookSpeakingRubric,
} from '../../utils/rubricLogic.ts';
import { getScoreLevelVisualTheme } from './RubricCriterionCard.tsx';

interface MatrixEvaluationViewProps {
  activeSession: EvaluationSession;
  activeRubric: Rubric;
  classStudents: Student[];
  sessionClassrooms?: Classroom[];
  activeClassroom?: Classroom;
  onSelectClassroom?: (classId: string) => void;
  selectedStudentId: string;
  activeCriterionIndex: number;
  onSelectCell: (studentId: string, criterionIndex: number) => void;
  onBackToFastCards: () => void;
  onSetStudentCriterionScore: (
    studentId: string,
    criterionId: string,
    points: number
  ) => void;
  onBulkAssignCriterion: (
    criterionId: string,
    points: number,
    onlyUnscored: boolean
  ) => void;
  onUndoLastAction: () => void;
  onExportPdf?: () => void;
  onOpenQuickNoteModal?: (studentId: string) => void;
  allSessions?: EvaluationSession[];
  rubricsById?: Record<string, Rubric>;
}

export const MatrixEvaluationView: React.FC<MatrixEvaluationViewProps> = ({
  activeSession,
  activeRubric,
  classStudents,
  sessionClassrooms = [],
  activeClassroom,
  onSelectClassroom,
  selectedStudentId,
  activeCriterionIndex,
  onSelectCell,
  onBackToFastCards,
  onSetStudentCriterionScore,
  onBulkAssignCriterion,
  onUndoLastAction,
  onExportPdf,
  onOpenQuickNoteModal,
  allSessions,
  rubricsById,
}) => {
  const effectiveSessions =
    allSessions && allSessions.length > 0 ? allSessions : [activeSession];
  const effectiveRubricsMap =
    rubricsById && Object.keys(rubricsById).length > 0
      ? rubricsById
      : { [activeRubric.id]: activeRubric };
  const safeCriterionIdx = Math.min(
    activeCriterionIndex,
    Math.max(0, activeRubric.criteria.length - 1)
  );
  const currentCriterion = activeRubric.criteria[safeCriterionIdx];
  const undoCount = activeSession.undoHistory?.length || 0;

  return (
    <div className="w-full px-3 sm:px-5 py-2">
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden flex flex-col h-[calc(100vh-76px)] min-h-[500px] shadow-xs">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onBackToFastCards}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-900 text-white hover:bg-blue-950 flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Değerlendirme Kartlarına Dön
            </button>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Tam Ekran Sınıf Matrisi
                {activeClassroom ? ` (${activeClassroom.name})` : ''} —{' '}
                {activeRubric.title}
              </h2>
            </div>
            {sessionClassrooms.length > 1 && onSelectClassroom && (
              <div
                data-testid="matrix-view-class-switcher"
                className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5"
              >
                {sessionClassrooms.map((cls) => {
                  const isSelectedCls = activeClassroom?.id === cls.id;
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      data-testid={`matrix-class-tab-${cls.id}`}
                      onClick={() => onSelectClassroom(cls.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                        isSelectedCls
                          ? 'bg-blue-900 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {cls.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentCriterion && (
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1">
                <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1 mr-1">
                  <Zap className="w-3.5 h-3.5 text-blue-900" />
                  Boş Olanlara ({currentCriterion.title.slice(0, 18)}):
                </span>
                {currentCriterion.levels.map((lvl) => {
                  const maxPts = Math.max(
                    ...currentCriterion.levels.map((l) => l.points),
                    1
                  );
                  const isThreeLevel =
                    currentCriterion.levels.length === 3 && maxPts === 2;
                  const theme = getScoreLevelVisualTheme(lvl.points, maxPts);
                  return (
                    <button
                      key={lvl.level}
                      type="button"
                      onClick={() =>
                        onBulkAssignCriterion(
                          currentCriterion.id,
                          lvl.points,
                          true
                        )
                      }
                      className={`px-2 py-0.5 text-[11px] font-mono-num font-bold rounded border transition-colors cursor-pointer ${theme.compactUnselected}`}
                    >
                      {isThreeLevel
                        ? `${lvl.label} (%${Math.round((lvl.points / maxPts) * 100)} · ${Math.ceil((lvl.points / maxPts) * (currentCriterion.maxPoints ?? currentCriterion.weight))}P)`
                        : `${lvl.points}P`}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              disabled={undoCount === 0}
              onClick={onUndoLastAction}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Geri Al {undoCount > 0 ? `(${undoCount})` : ''}
            </button>

            {onExportPdf && (
              <button
                type="button"
                onClick={onExportPdf}
                data-testid="download-active-session-pdf-btn"
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5 text-blue-900" />
                PDF İndir
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-700">
              <tr>
                <th className="py-2.5 px-3 w-52 sticky left-0 bg-slate-100 z-20 border-r border-slate-200">
                  Öğrenci
                </th>
                {activeRubric.criteria.map((c, idx) => (
                  <th
                    key={c.id}
                    onClick={() => onSelectCell(selectedStudentId, idx)}
                    className={`py-2 px-2.5 border-r border-slate-200 cursor-pointer transition-colors ${
                      idx === safeCriterionIdx
                        ? 'bg-blue-50 text-blue-950 border-b-2 border-b-blue-900'
                        : 'hover:bg-slate-200/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[10px] font-mono-num text-slate-500">
                      <span>ÖLÇÜT {String(idx + 1).padStart(2, '0')}</span>
                      <span className="font-bold text-slate-800">
                        {c.maxPoints ?? c.weight}P
                      </span>
                    </div>
                    <div className="text-slate-900 font-bold text-xs line-clamp-1">
                      {c.title}
                    </div>
                  </th>
                ))}
                {isDualBookSpeakingRubric(activeRubric) ? (
                  <>
                    <th className="py-2.5 px-3 w-32 text-right bg-slate-100 border-r border-slate-200">
                      Kitap Sunumu (100)
                    </th>
                    <th className="py-2.5 px-3 w-32 text-right bg-slate-100">
                      Konuşma Sınavı (100)
                    </th>
                  </>
                ) : (
                  <th className="py-2.5 px-3 w-32 text-right bg-slate-100">
                    Kesin Not (100)
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {classStudents.map((stu) => {
                const ev = activeSession.evaluations[stu.id];
                const breakdown = getStudentEvaluationBreakdown(
                  activeRubric,
                  ev
                );
                const calc = breakdown.effectiveCalc;
                const activeSource = breakdown.activeSource;
                const isActiveRow = stu.id === selectedStudentId;

                return (
                  <tr
                    key={stu.id}
                    className={`transition-colors ${
                      isActiveRow
                        ? 'bg-blue-50/40'
                        : calc.isComplete
                        ? 'bg-slate-50/60 hover:bg-slate-100/60'
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td
                      onClick={() => onSelectCell(stu.id, safeCriterionIdx)}
                      className={`py-2 px-3 sticky left-0 z-10 border-r border-slate-200 cursor-pointer ${
                        isActiveRow ? 'bg-blue-50/80' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="truncate">
                          <span className="font-mono-num text-[11px] font-bold text-slate-400 mr-1">
                            #{stu.studentNumber}
                          </span>
                          <span className="font-semibold text-slate-900">
                            {stu.fullName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {getStudentConsecutiveLowScoreReminder(
                            stu.id,
                            activeSession,
                            effectiveSessions,
                            effectiveRubricsMap
                          ).shouldRemind && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenQuickNoteModal) {
                                  onOpenQuickNoteModal(stu.id);
                                } else {
                                  onSelectCell(stu.id, safeCriterionIdx);
                                  onBackToFastCards();
                                }
                              }}
                              data-testid="low-score-observation-reminder"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-950 border border-amber-300 cursor-pointer"
                              title="Üst üste 3 değerlendirmede düşük puan (1 veya 2) — Gözlem notu ekle"
                            >
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                              Gözlem notu ekle
                            </span>
                          )}
                          {activeSource === 'group' &&
                            calc.completedCriteriaCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                                Grup
                              </span>
                            )}
                          {calc.isComplete && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-white">
                              <Check className="w-2.5 h-2.5" />
                            </span>
                          )}
                          {onOpenQuickNoteModal && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenQuickNoteModal(stu.id);
                              }}
                              data-testid={`matrix-quick-note-icon-${stu.id}`}
                              aria-label={`${stu.fullName} için Hızlı Gözlem Notu`}
                              title={
                                hasStudentObservationData(ev)
                                  ? `Hızlı Gözlem Notunu Düzenle (${stu.fullName})${
                                      ev?.note ? `: "${ev.note}"` : ''
                                    }`
                                  : `${stu.fullName} için Hızlı Gözlem Notu Ekle`
                              }
                              className={`p-1 rounded border transition-colors cursor-pointer relative ${
                                hasStudentObservationData(ev)
                                  ? 'bg-slate-800 text-white border-slate-900 hover:bg-slate-900'
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-blue-900 hover:text-blue-900'
                              }`}
                            >
                              <MessageSquare className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    {activeRubric.criteria.map((c, colIdx) => {
                      const selectedPts =
                        activeSource === 'group'
                          ? ev?.groupCriterionScores?.[c.id]
                          : ev?.criterionScores?.[c.id];
                      const isTargetCell =
                        isActiveRow && colIdx === safeCriterionIdx;
                      const maxLvlPts = Math.max(
                        ...c.levels.map((l) => l.points),
                        1
                      );
                      const isThreeLevel =
                        c.levels.length === 3 && maxLvlPts === 2;

                      return (
                        <td
                          key={c.id}
                          onClick={() => onSelectCell(stu.id, colIdx)}
                          className={`py-1.5 px-2 border-r border-slate-100 ${
                            isTargetCell
                              ? 'ring-2 ring-inset ring-blue-900 bg-blue-50/40'
                              : selectedPts != null ? 'bg-emerald-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            {c.levels.map((lvl) => {
                              const active = selectedPts === lvl.points;
                              const lvlTheme = getScoreLevelVisualTheme(
                                lvl.points,
                                maxLvlPts
                              );
                              const pct = Math.round(
                                (lvl.points / maxLvlPts) * 100
                              );
                              return (
                                <button
                                  key={lvl.level}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectCell(stu.id, colIdx);
                                    onSetStudentCriterionScore(
                                      stu.id,
                                      c.id,
                                      lvl.points
                                    );
                                  }}
                                  title={
                                    isThreeLevel
                                      ? `${lvl.label} (%${pct} · ${Math.ceil((lvl.points / maxLvlPts) * (c.maxPoints ?? c.weight))}P)`
                                      : `${lvl.label} (${lvl.points} Puan)`
                                  }
                                  className={`flex-1 py-1 px-1 rounded font-mono-num text-[11px] font-bold transition-all cursor-pointer min-h-[28px] border ${
                                    active
                                      ? 'bg-emerald-700 text-white font-bold shadow-xs'
                                      : lvlTheme.compactUnselected
                                  }`}
                                >
                                  {isThreeLevel ? lvl.label : lvl.points}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}

                    {calc.dualResult ? (
                      <>
                        <td className="py-2 px-3 text-right font-mono-num border-r border-slate-100">
                          {calc.dualResult.isBookPresentationComplete &&
                          calc.dualResult.finalBookPresentationScoreOutOf100 !==
                            null ? (
                            <span className="font-bold text-white bg-blue-900 border border-blue-950 px-2 py-0.5 rounded">
                              {
                                calc.dualResult
                                  .finalBookPresentationScoreOutOf100
                              }
                            </span>
                          ) : calc.completedCriteriaCount > 0 ? (
                            <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded">
                              Eksik ({calc.completedCriteriaCount}/
                              {calc.totalCriteriaCount})
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num">
                          {calc.dualResult.isSpeakingComplete &&
                          calc.dualResult.finalSpeakingScoreOutOf100 !==
                            null ? (
                            <span className="font-bold text-white bg-slate-900 border border-slate-950 px-2 py-0.5 rounded">
                              {calc.dualResult.finalSpeakingScoreOutOf100}
                            </span>
                          ) : calc.dualResult.completedSpeakingCount > 0 ? (
                            <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded">
                              Eksik ({calc.dualResult.completedSpeakingCount}/
                              {calc.dualResult.totalSpeakingCount})
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </>
                    ) : (
                      <td className="py-2 px-3 text-right font-mono-num">
                        {calc.isComplete &&
                        calc.finalScoreOutOf100 !== null ? (
                          <span className="font-bold text-white bg-blue-900 border border-blue-950 px-2 py-0.5 rounded">
                            {calc.finalScoreOutOf100}
                          </span>
                        ) : calc.completedCriteriaCount > 0 ? (
                          <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded">
                            Eksik ({calc.completedCriteriaCount}/
                            {calc.totalCriteriaCount})
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
