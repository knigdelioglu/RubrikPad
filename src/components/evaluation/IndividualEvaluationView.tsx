import React, { useState, useMemo } from 'react';
import {
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
  EvaluationSession,
  Rubric,
  Student,
} from '../../types.ts';
import { QUICK_OBSERVATION_TAGS } from '../../data/seedData.ts';
import { getStudentEvaluationBreakdown } from '../../utils/rubricLogic.ts';
import {
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
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showPortraitRosterDrawer, setShowPortraitRosterDrawer] =
    useState(false);

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
          className="flex-1 min-h-[42px] px-3 py-1.5 rounded-lg bg-teal-50/80 border border-teal-200 text-left flex items-center justify-between gap-2 cursor-pointer"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-teal-800">
              Öğrenci Seçici ({currentStudentIndex + 1}/{classStudents.length})
            </div>
            <div className="text-xs font-bold text-slate-900 truncate">
              {selectedStudent
                ? `#${selectedStudent.studentNumber} ${selectedStudent.fullName}`
                : 'Öğrenci Seçin'}
            </div>
          </div>
          <span className="text-xs font-bold text-teal-900 bg-white px-2.5 py-1 rounded-md border border-teal-200 shrink-0">
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
          } lg:block lg:col-span-4 xl:col-span-3 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs lg:sticky lg:top-4`}
        >
          <div className="p-3.5 border-b border-slate-200 bg-slate-50/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Öğrenci Listesi
              </h2>
              <span className="text-xs font-mono-num font-semibold text-teal-900 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
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
                className="w-full pl-8 pr-7 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600"
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
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => onChangeStudentFilter('all')}
                className={`py-1.5 rounded-lg transition-colors cursor-pointer ${
                  studentFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tümü ({classStudents.length})
              </button>
              <button
                type="button"
                onClick={() => onChangeStudentFilter('pending')}
                className={`py-1.5 rounded-lg transition-colors cursor-pointer ${
                  studentFilter === 'pending'
                    ? 'bg-white text-amber-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bekleyen ({pendingStudentsCount})
              </button>
              <button
                type="button"
                onClick={() => onChangeStudentFilter('completed')}
                className={`py-1.5 rounded-lg transition-colors cursor-pointer ${
                  studentFilter === 'completed'
                    ? 'bg-white text-emerald-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tamam ({completedStudentsCount})
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
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

                return (
                  <button
                    key={stu.id}
                    type="button"
                    onClick={() => {
                      onSelectStudent(stu.id);
                      onDismissBanner();
                      setShowPortraitRosterDrawer(false);
                    }}
                    className={`w-full text-left px-3.5 py-3 flex items-center justify-between gap-2.5 transition-colors cursor-pointer min-h-[54px] ${
                      isSelected
                        ? 'bg-teal-50/95 border-l-4 border-l-teal-700'
                        : calc.isComplete
                        ? 'bg-emerald-50/25 hover:bg-emerald-50/50 border-l-4 border-l-emerald-500'
                        : calc.completedCriteriaCount > 0
                        ? 'bg-amber-50/20 hover:bg-amber-50/40 border-l-4 border-l-amber-400'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isSelected
                            ? 'bg-teal-700 text-white'
                            : calc.isComplete
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {getInitials(stu.fullName)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono-num text-xs font-bold text-slate-500">
                            #{stu.studentNumber}
                          </span>
                          <span className="text-sm font-bold text-slate-900 truncate">
                            {stu.fullName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                          <span>
                            {calc.completedCriteriaCount}/
                            {calc.totalCriteriaCount} ölçüt
                          </span>
                          {stuBreakdown.individualCalc.completedCriteriaCount >
                            0 &&
                            stuBreakdown.groupCalc.completedCriteriaCount >
                              0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded">
                                <Users className="w-2.5 h-2.5" />
                                Bireysel + Grup
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
                            calc.finalScoreOutOf100 >= 85
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                              : calc.finalScoreOutOf100 >= 70
                              ? 'bg-teal-50 text-teal-900 border-teal-200'
                              : calc.finalScoreOutOf100 >= 50
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-rose-50 text-rose-900 border-rose-200'
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-[2.5]" />
                          {calc.finalScoreOutOf100}
                        </span>
                      ) : calc.completedCriteriaCount > 0 ? (
                        <span className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200">
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
              className="bg-emerald-950 text-white rounded-2xl p-3.5 shadow-sm border border-emerald-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm font-bold">
                    {justCompletedBanner.completedStudentName} tamamlandı ·
                    Kesin Not: {justCompletedBanner.scoreOutOf100} / 100 (
                    {justCompletedBanner.performanceLabel})
                  </div>
                  <div className="text-[11px] text-emerald-200">
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
                    className="px-3.5 py-2 rounded-xl bg-white text-emerald-950 text-xs font-bold hover:bg-emerald-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
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
                      className="px-3.5 py-2 rounded-xl bg-white text-emerald-950 text-xs font-bold hover:bg-emerald-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
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
                    className="px-3 py-2 rounded-xl bg-emerald-900/90 hover:bg-emerald-800 text-emerald-100 border border-emerald-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Son Puanı Geri Al
                  </button>
                )}

                <button
                  type="button"
                  onClick={onDismissBanner}
                  aria-label="Bildirimi kapat"
                  className="p-1.5 text-emerald-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {selectedStudent ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
              {/* Sticky Student HUD Header & View Mode Controls */}
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pb-3.5 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-teal-700 text-white font-bold text-sm flex items-center justify-center shrink-0">
                    {getInitials(selectedStudent.fullName)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        #{selectedStudent.studentNumber}
                      </span>
                      <h2 className="text-lg font-bold text-slate-900">
                        {selectedStudent.fullName}
                      </h2>

                      {/* Definitive Score vs Incomplete Draft Badge */}
                      {effectiveCalc.isComplete &&
                      effectiveCalc.finalScoreOutOf100 !== null ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-300 font-mono-num">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          Kesin Not: {effectiveCalc.finalScoreOutOf100} / 100 ·{' '}
                          {effectiveCalc.performanceLabel}
                        </span>
                      ) : effectiveCalc.completedCriteriaCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-amber-100 text-amber-950 border border-amber-300 font-mono-num">
                          Taslak ({effectiveCalc.completedCriteriaCount}/
                          {effectiveCalc.totalCriteriaCount} Ölçüt) · Kesin not
                          için tüm ölçütleri tamamlayın
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600">
                          Henüz Puanlanmadı (0/{effectiveCalc.totalCriteriaCount}{' '}
                          Ölçüt)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Controls: Detailed/Compact View Toggle + Auto-Advance + Precision + Reset */}
                <div className="flex flex-wrap items-center gap-2">
                  <RubricViewModeToggle
                    viewMode={cardViewMode}
                    onChangeViewMode={onChangeCardViewMode}
                  />

                  <button
                    type="button"
                    onClick={onToggleAutoAdvance}
                    aria-pressed={autoAdvanceStudent}
                    title="Yalnızca son eksik ölçüt tamamlandığında sıradaki bekleyen öğrenciye otomatik geçer; mevcut puanı düzeltirken tetiklenmez"
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors min-h-[38px] flex items-center gap-1.5 ${
                      autoAdvanceStudent
                        ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Otomatik Geçiş: {autoAdvanceStudent ? 'Açık' : 'Kapalı'}
                  </button>

                  <button
                    type="button"
                    onClick={onTogglePrecisionScoring}
                    aria-pressed={precisionScoringMode}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer min-h-[38px] ${
                      precisionScoringMode
                        ? 'bg-teal-700 text-white border-teal-700'
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
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 flex items-center gap-1 cursor-pointer min-h-[38px]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Sıfırla
                  </button>
                </div>
              </div>

              {/* Separate Individual vs Group Results Banner */}
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
                          : `Taslak (${individualCalc.completedCriteriaCount}/${individualCalc.totalCriteriaCount})`}
                      </strong>{' '}
                      · Grup Puanı:{' '}
                      <strong>
                        {groupCalc.finalScoreOutOf100 !== null
                          ? `${groupCalc.finalScoreOutOf100}/100`
                          : `Taslak (${groupCalc.completedCriteriaCount}/${groupCalc.totalCriteriaCount})`}
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

              {/* Shared Rubric Criterion Cards List */}
              <div
                className={
                  cardViewMode === 'compact' ? 'space-y-2' : 'space-y-3.5'
                }
              >
                {activeRubric.criteria.map((criterion, cIdx) => {
                  const selectedPts =
                    activeSource === 'group'
                      ? currentStudentEval?.groupCriterionScores?.[criterion.id]
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
                      viewMode={cardViewMode}
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

              {/* Observation Note & Quick Tags */}
              <div className="pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
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
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer min-h-[36px] ${
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
                    className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                    Bireysel Öğretmen Gözlem Notu (Grup notundan bağımsız
                    korunur)
                  </label>
                  <textarea
                    id="student-obs-note"
                    rows={2}
                    value={currentStudentEval?.note || ''}
                    onChange={(e) => onUpdateStudentNote(e.target.value)}
                    placeholder="Öğrencinin bireysel süreç becerisi ve gelişim notu..."
                    className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
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
