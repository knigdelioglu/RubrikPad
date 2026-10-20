import React from 'react';
import { AlertTriangle, ArrowLeft, Check, FileDown, Undo2, Zap } from 'lucide-react';
import type { EvaluationSession, Rubric, Student } from '../../types.ts';
import {
  getStudentConsecutiveLowScoreReminder,
  getStudentEvaluationBreakdown,
  isScoreAssigned,
} from '../../utils/rubricLogic.ts';

interface MatrixEvaluationViewProps {
  activeSession: EvaluationSession;
  activeRubric: Rubric;
  classStudents: Student[];
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
  allSessions?: EvaluationSession[];
  rubricsById?: Record<string, Rubric>;
}

export const MatrixEvaluationView: React.FC<MatrixEvaluationViewProps> = ({
  activeSession,
  activeRubric,
  classStudents,
  selectedStudentId,
  activeCriterionIndex,
  onSelectCell,
  onBackToFastCards,
  onSetStudentCriterionScore,
  onBulkAssignCriterion,
  onUndoLastAction,
  onExportPdf,
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
    <div className="max-w-[1880px] mx-auto px-3 sm:px-5 py-2">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-[calc(100vh-76px)] min-h-[500px] shadow-xs">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBackToFastCards}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Değerlendirme Kartlarına Dön
            </button>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Tam Ekran Sınıf Matrisi — {activeRubric.title}
              </h2>
              <p className="text-[11px] text-slate-500">
                0 geçerli puandır, &ldquo;-&rdquo; henüz puanlanmadı anlamına gelir.
                Tüm ölçütler bitmeden kesin 100&apos;lük not üretilmez.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentCriterion && (
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
                <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 mr-1">
                  <Zap className="w-3.5 h-3.5 text-teal-700" />
                  Boş Olanlara ({currentCriterion.title.slice(0, 18)}):
                </span>
                {currentCriterion.levels.map((lvl) => (
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
                    className="px-2 py-0.5 text-[11px] font-mono-num font-bold rounded bg-slate-100 hover:bg-teal-700 hover:text-white text-slate-700 transition-colors cursor-pointer"
                  >
                    {lvl.points}P
                  </button>
                ))}
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
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 flex items-center gap-1 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
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
                        ? 'bg-teal-100/90 text-teal-950'
                        : 'hover:bg-slate-200/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[10px] font-mono-num text-slate-500">
                      <span>ÖLÇÜT 0{idx + 1}</span>
                      <span className="font-bold text-teal-800">
                        {c.maxPoints ?? c.weight}P
                      </span>
                    </div>
                    <div className="text-slate-900 font-bold text-xs line-clamp-1">
                      {c.title}
                    </div>
                  </th>
                ))}
                <th className="py-2.5 px-3 w-32 text-right bg-slate-100">
                  Kesin Not (100)
                </th>
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
                        ? 'bg-teal-50/50'
                        : calc.isComplete
                        ? 'bg-emerald-50/20 hover:bg-slate-50'
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td
                      onClick={() => onSelectCell(stu.id, safeCriterionIdx)}
                      className={`py-2 px-3 sticky left-0 z-10 border-r border-slate-200 cursor-pointer ${
                        isActiveRow ? 'bg-teal-50' : 'bg-white'
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
                                onSelectCell(stu.id, safeCriterionIdx);
                                onBackToFastCards();
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
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                                Grup
                              </span>
                            )}
                          {calc.isComplete && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <Check className="w-2.5 h-2.5" />
                            </span>
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

                      return (
                        <td
                          key={c.id}
                          onClick={() => onSelectCell(stu.id, colIdx)}
                          className={`py-1.5 px-2 border-r border-slate-100 ${
                            isTargetCell
                              ? 'ring-2 ring-inset ring-teal-600 bg-teal-50/60'
                              : ''
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            {c.levels.map((lvl) => {
                              const active = selectedPts === lvl.points;
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
                                  title={`${lvl.label} (${lvl.points} Puan)`}
                                  className={`flex-1 py-1 rounded font-mono-num text-[11px] font-bold transition-all cursor-pointer min-h-[28px] ${
                                    active
                                      ? lvl.points === 0
                                        ? 'bg-rose-700 text-white shadow-xs'
                                        : 'bg-teal-700 text-white shadow-xs'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  {lvl.points}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}

                    <td className="py-2 px-3 text-right font-mono-num">
                      {calc.isComplete && calc.finalScoreOutOf100 !== null ? (
                        <span className="font-bold text-slate-900 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          {calc.finalScoreOutOf100}
                        </span>
                      ) : calc.completedCriteriaCount > 0 ? (
                        <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                          Eksik ({calc.completedCriteriaCount}/
                          {calc.totalCriteriaCount})
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
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
