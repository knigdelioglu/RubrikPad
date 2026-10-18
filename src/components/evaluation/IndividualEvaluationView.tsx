import React from 'react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  MessageSquare,
  RotateCcw,
  Sliders,
  Tag,
  Users,
} from 'lucide-react';
import type {
  EvaluationSession,
  Rubric,
  Student,
} from '../../types.ts';
import { QUICK_OBSERVATION_TAGS } from '../../data/seedData.ts';
import {
  getStudentEvaluationBreakdown,
  isScoreAssigned,
} from '../../utils/rubricLogic.ts';

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
  } | null;
  onDismissBanner: () => void;
}

export const IndividualEvaluationView: React.FC<
  IndividualEvaluationViewProps
> = ({
  activeSession,
  activeRubric,
  classStudents,
  selectedStudent,
  selectedStudentId,
  onSelectStudent,
  studentFilter,
  onChangeStudentFilter,
  filteredStudents,
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
}) => {
  const currentStudentEval = selectedStudent
    ? activeSession.evaluations[selectedStudent.id]
    : undefined;

  const breakdown = getStudentEvaluationBreakdown(
    activeRubric,
    currentStudentEval
  );
  const { individualCalc, groupCalc, effectiveCalc, activeSource } = breakdown;
  const hasGroupData =
    groupCalc.completedCriteriaCount > 0 ||
    Boolean(currentStudentEval?.groupNote);

  const isDenseRubric = activeRubric.criteria.length >= 6;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* Left Roster Panel (4 cols) */}
      <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-3 border-b border-slate-200 bg-slate-50/70 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Sınıf Öğrenci Listesi
            </h2>
            <span className="text-xs font-mono-num text-slate-500">
              {filteredStudents.length} / {classStudents.length} öğrenci
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => onChangeStudentFilter('all')}
              className={`py-1 rounded-md transition-colors cursor-pointer ${
                studentFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tümü ({classStudents.length})
            </button>
            <button
              type="button"
              onClick={() => onChangeStudentFilter('pending')}
              className={`py-1 rounded-md transition-colors cursor-pointer ${
                studentFilter === 'pending'
                  ? 'bg-white text-amber-800 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bekleyen
            </button>
            <button
              type="button"
              onClick={() => onChangeStudentFilter('completed')}
              className={`py-1 rounded-md transition-colors cursor-pointer ${
                studentFilter === 'completed'
                  ? 'bg-white text-emerald-800 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tamamlanan
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
          {filteredStudents.map((stu) => {
            const ev = activeSession.evaluations[stu.id];
            const stuBreakdown = getStudentEvaluationBreakdown(
              activeRubric,
              ev
            );
            const calc = stuBreakdown.effectiveCalc;
            const isSelected = stu.id === selectedStudent?.id;

            return (
              <button
                key={stu.id}
                type="button"
                onClick={() => {
                  onSelectStudent(stu.id);
                  onDismissBanner();
                }}
                className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-teal-50/90 border-l-4 border-l-teal-700'
                    : calc.isComplete
                    ? 'bg-emerald-50/25 hover:bg-emerald-50/50 border-l-4 border-l-emerald-500'
                    : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono-num text-xs font-semibold text-slate-500">
                      #{stu.studentNumber}
                    </span>
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {stu.fullName}
                    </span>
                    {calc.isComplete && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                        Tamam
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                    <span>
                      {calc.completedCriteriaCount}/{calc.totalCriteriaCount}{' '}
                      ölçüt
                    </span>
                    {stuBreakdown.individualCalc.completedCriteriaCount > 0 &&
                      stuBreakdown.groupCalc.completedCriteriaCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded">
                          <Users className="w-2.5 h-2.5" />
                          Bireysel + Grup
                        </span>
                      )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {calc.isComplete && calc.finalScoreOutOf100 !== null ? (
                    <span
                      className={`font-mono-num text-xs font-bold px-2 py-0.5 rounded border ${
                        calc.finalScoreOutOf100 >= 85
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : calc.finalScoreOutOf100 >= 70
                          ? 'bg-teal-50 text-teal-800 border-teal-200'
                          : calc.finalScoreOutOf100 >= 50
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-red-50 text-red-800 border-red-200'
                      }`}
                    >
                      {calc.finalScoreOutOf100}
                    </span>
                  ) : calc.completedCriteriaCount > 0 ? (
                    <span className="font-mono-num text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                      Taslak ({calc.completedCriteriaCount}/
                      {calc.totalCriteriaCount})
                    </span>
                  ) : (
                    <Clock className="w-4 h-4 text-slate-300" />
                  )}
                  <ChevronRight
                    className={`w-4 h-4 ${
                      isSelected ? 'text-teal-700' : 'text-slate-300'
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right Active Student Rubric Deck (8 cols) */}
      <div className="lg:col-span-8 space-y-3">
        {selectedStudent ? (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
            {/* Student Header & Separate Individual vs Group Score Controls (P0 #2 & P0 #4) */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    No: {selectedStudent.studentNumber}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    {selectedStudent.fullName}
                  </h2>
                  {effectiveCalc.isComplete ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      Tamamlandı
                    </span>
                  ) : effectiveCalc.completedCriteriaCount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      Kısmi Değerlendirme ({effectiveCalc.completedCriteriaCount}/
                      {effectiveCalc.totalCriteriaCount})
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Right Score Summary & Precision Mode Toggle */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onTogglePrecisionScoring}
                  aria-pressed={precisionScoringMode}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border cursor-pointer ${
                    precisionScoringMode
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Hassas Tam Sayı Puanı
                </button>

                <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-right">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">
                    {effectiveCalc.isComplete
                      ? 'Kesin Toplam (100)'
                      : 'Durum (Zorunlu Ölçütler Bekleniyor)'}
                  </div>
                  <div className="font-mono-num text-sm font-bold text-slate-900">
                    {effectiveCalc.isComplete &&
                    effectiveCalc.finalScoreOutOf100 !== null
                      ? `${effectiveCalc.finalScoreOutOf100} / 100 · ${effectiveCalc.performanceLabel}`
                      : `Taslak (${effectiveCalc.completedCriteriaCount}/${effectiveCalc.totalCriteriaCount} Ölçüt)`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onResetStudentScores(selectedStudent.id)}
                  title="Bireysel Puanları Sıfırla"
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* P0 #4: Separate Individual vs Group Results Banner */}
            {hasGroupData && (
              <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-teal-950 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-teal-700" />
                    Bireysel ve Grup Sonuçları Ayrı Saklanmaktadır (
                    {currentStudentEval?.evaluatedViaGroup || 'Grup'})
                  </div>
                  <div className="text-teal-900 font-mono-num">
                    Bireysel Puan:{' '}
                    <strong>
                      {individualCalc.finalScoreOutOf100 !== null
                        ? `${individualCalc.finalScoreOutOf100}/100`
                        : `Eksik (${individualCalc.completedCriteriaCount}/${individualCalc.totalCriteriaCount})`}
                    </strong>{' '}
                    · Grup Puanı:{' '}
                    <strong>
                      {groupCalc.finalScoreOutOf100 !== null
                        ? `${groupCalc.finalScoreOutOf100}/100`
                        : `Eksik (${groupCalc.completedCriteriaCount}/${groupCalc.totalCriteriaCount})`}
                    </strong>
                    {currentStudentEval?.groupNote
                      ? ` · Grup Notu: "${currentStudentEval.groupNote}"`
                      : ''}
                  </div>
                </div>

                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-teal-200 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onSwitchActiveScoreSource(
                        selectedStudent.id,
                        'individual'
                      )
                    }
                    className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                      activeSource === 'individual'
                        ? 'bg-teal-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bireysel Puanı Yansıt
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSwitchActiveScoreSource(selectedStudent.id, 'group')
                    }
                    className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                      activeSource === 'group'
                        ? 'bg-teal-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Grup Puanını Yansıt
                  </button>
                </div>
              </div>
            )}

            {/* Visual Completion Banner */}
            {justCompletedBanner &&
              justCompletedBanner.completedStudentId === selectedStudent.id && (
                <div
                  role="status"
                  aria-live="polite"
                  className="bg-emerald-900 text-white rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">
                        {justCompletedBanner.completedStudentName} tamamlandı ·
                        Kesin Not: {justCompletedBanner.scoreOutOf100}/100 (
                        {justCompletedBanner.performanceLabel})
                      </div>
                    </div>
                  </div>
                  {justCompletedBanner.nextStudentId && (
                    <button
                      type="button"
                      onClick={() => {
                        if (justCompletedBanner.nextStudentId) {
                          onSelectStudent(justCompletedBanner.nextStudentId);
                          onDismissBanner();
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white text-emerald-950 text-xs font-bold hover:bg-emerald-50 flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      Sıradaki: {justCompletedBanner.nextStudentName}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

            {/* Rubric Criteria Compact Rows */}
            <div className="space-y-1.5">
              {activeRubric.criteria.map((criterion, cIdx) => {
                const selectedPts =
                  currentStudentEval?.criterionScores?.[criterion.id];
                const directPts =
                  currentStudentEval?.directCriterionScores?.[criterion.id];
                const groupPts =
                  currentStudentEval?.groupCriterionScores?.[criterion.id];
                const isAnswered =
                  isScoreAssigned(selectedPts) || isScoreAssigned(directPts);
                const critMaxPts = criterion.maxPoints ?? criterion.weight;

                return (
                  <div
                    key={criterion.id}
                    className={`rounded-lg border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      isDenseRubric ? 'px-3 py-1.5' : 'px-3.5 py-2.5'
                    } ${
                      isAnswered
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 sm:w-5/12 min-w-0">
                      <span
                        className={`font-mono-num text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          isAnswered
                            ? 'bg-emerald-700 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        0{cIdx + 1}
                      </span>
                      <span
                        className="text-xs sm:text-sm font-bold text-slate-900 truncate"
                        title={criterion.title}
                      >
                        {criterion.title}
                      </span>
                      <span className="font-mono-num text-[11px] font-bold text-teal-900 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded shrink-0">
                        {critMaxPts}P
                      </span>
                      {isScoreAssigned(groupPts) && (
                        <span
                          className="font-mono-num text-[10px] font-semibold text-slate-600 bg-slate-200/80 px-1.5 py-0.5 rounded shrink-0"
                          title="Bu ölçüt için kaydedilen ayrı Grup Puanı"
                        >
                          Grup:{groupPts}P
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 sm:w-7/12">
                      <div
                        className="grid flex-1 gap-1.5"
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
                                onSelectCriterionLevel(criterion.id, lvl.points)
                              }
                              className={`py-1.5 px-2 rounded-md border text-center transition-all cursor-pointer flex items-center justify-center gap-1 min-h-[34px] ${
                                isSelected
                                  ? lvl.points === 0
                                    ? 'bg-rose-700 border-rose-800 text-white font-bold shadow-xs'
                                    : 'bg-teal-700 border-teal-800 text-white font-bold shadow-xs'
                                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                              }`}
                            >
                              <span className="font-mono-num text-xs font-bold">
                                {lvl.points}P
                              </span>
                              <span className="text-[11px] font-medium truncate hidden xl:inline">
                                {lvl.label.replace(/\s*\(0\)/, '')}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {precisionScoringMode && (
                        <div className="flex items-center gap-1 shrink-0 bg-white border border-teal-300 rounded-md px-1.5 py-1">
                          <input
                            type="number"
                            min={0}
                            max={critMaxPts}
                            step={1}
                            aria-label={`${criterion.title} doğrudan puan (0-${critMaxPts})`}
                            placeholder={`0-${critMaxPts}`}
                            value={isScoreAssigned(directPts) ? directPts : ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') {
                                onSetDirectCriterionScore(criterion.id, null);
                                return;
                              }
                              const num = Math.max(
                                0,
                                Math.min(critMaxPts, Math.round(Number(raw)))
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

                      {isAnswered && (
                        <button
                          type="button"
                          onClick={() => onClearCriterionScore(criterion.id)}
                          aria-label={`${criterion.title} puanını temizle`}
                          className="px-1.5 py-1 text-xs font-bold text-slate-400 hover:text-red-600 rounded cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Observation Note & Tags */}
            <div className="pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-slate-500" />
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
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                          active
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
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
                <label
                  htmlFor="student-obs-note"
                  className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                  Bireysel Öğretmen Gözlem Notu (Grup notundan bağımsız korunur)
                </label>
                <textarea
                  id="student-obs-note"
                  rows={2}
                  value={currentStudentEval?.note || ''}
                  onChange={(e) => onUpdateStudentNote(e.target.value)}
                  placeholder="Öğrencinin bireysel süreç becerisi ve gelişim notu..."
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
