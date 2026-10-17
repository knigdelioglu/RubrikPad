import React, { useState, useMemo, useEffect } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Clock,
  LayoutGrid,
  List,
  Plus,
} from 'lucide-react';
import { Rubric, Student, StudentEvaluation } from '../types';

interface QuickEvaluateViewProps {
  rubrics: Rubric[];
  students: Student[];
  evaluations: StudentEvaluation[];
  selectedRubricId: string;
  onSelectRubric: (id: string) => void;
  onSaveEvaluation: (evaluation: StudentEvaluation) => void;
  onOpenNewRubric: () => void;
}

export const QuickEvaluateView: React.FC<QuickEvaluateViewProps> = ({
  rubrics,
  students,
  evaluations,
  selectedRubricId,
  onSelectRubric,
  onSaveEvaluation,
  onOpenNewRubric,
}) => {
  const activeRubric = useMemo(
    () => rubrics.find((r) => r.id === selectedRubricId) || rubrics[0],
    [rubrics, selectedRubricId]
  );

  const classes = useMemo(() => {
    const set = new Set(students.map((s) => s.className));
    return ['Tüm Sınıflar', ...Array.from(set)];
  }, [students]);

  const [selectedClass, setSelectedClass] = useState<string>('Tüm Sınıflar');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'rows'>('grid');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const filteredStudents = useMemo(() => {
    if (selectedClass === 'Tüm Sınıflar') return students;
    return students.filter((s) => s.className === selectedClass);
  }, [students, selectedClass]);

  const [activeStudentId, setActiveStudentId] = useState<string>(
    filteredStudents[0]?.id || ''
  );

  useEffect(() => {
    if (
      filteredStudents.length > 0 &&
      !filteredStudents.some((s) => s.id === activeStudentId)
    ) {
      setActiveStudentId(filteredStudents[0].id);
    }
  }, [filteredStudents, activeStudentId]);

  const activeStudent = useMemo(
    () => filteredStudents.find((s) => s.id === activeStudentId) || filteredStudents[0],
    [filteredStudents, activeStudentId]
  );

  const existingEvaluation = useMemo(() => {
    if (!activeRubric || !activeStudent) return undefined;
    return evaluations.find(
      (e) => e.rubricId === activeRubric.id && e.studentId === activeStudent.id
    );
  }, [evaluations, activeRubric, activeStudent]);

  const [scores, setScores] = useState<Record<string, number>>({});
  const [selectedLevels, setSelectedLevels] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string>('');

  // Sync local grading state when student or rubric changes
  useEffect(() => {
    if (!activeRubric) return;
    if (existingEvaluation) {
      setScores(existingEvaluation.scores);
      setSelectedLevels(existingEvaluation.selectedLevels);
      setNote(existingEvaluation.note || '');
    } else {
      const initialScores: Record<string, number> = {};
      const initialLevels: Record<string, string> = {};
      setScores(initialScores);
      setSelectedLevels(initialLevels);
      setNote('');
    }
  }, [activeRubric, activeStudent?.id, existingEvaluation]);

  if (!activeRubric) {
    return (
      <div className="p-8 text-center bg-white border border-slate-200 rounded-xl">
        <p className="text-slate-600 mb-4">Henüz tanımlı bir rubrik bulunmuyor.</p>
        <button
          onClick={onOpenNewRubric}
          className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
        >
          Yeni Rubrik Ekle
        </button>
      </div>
    );
  }

  const maxPossibleScore = useMemo(
    () => activeRubric.criteria.reduce((acc, c) => acc + c.maxPoints, 0),
    [activeRubric]
  );

  const currentTotalScore = useMemo(
    () =>
      activeRubric.criteria.reduce(
        (acc, c) => acc + (typeof scores[c.id] === 'number' ? scores[c.id] : 0),
        0
      ),
    [activeRubric, scores]
  );

  const gradedCriteriaCount = useMemo(
    () =>
      activeRubric.criteria.filter((c) => typeof scores[c.id] === 'number').length,
    [activeRubric, scores]
  );

  const handleSelectLevel = (
    criterionId: string,
    levelId: string,
    points: number
  ) => {
    setScores((prev) => ({ ...prev, [criterionId]: points }));
    setSelectedLevels((prev) => ({ ...prev, [criterionId]: levelId }));
  };

  const handleCustomPointChange = (
    criterionId: string,
    maxPoints: number,
    rawValue: string
  ) => {
    if (rawValue === '') {
      const nextScores = { ...scores };
      delete nextScores[criterionId];
      setScores(nextScores);
      return;
    }
    const parsed = Math.max(0, Math.min(maxPoints, Number(rawValue)));
    if (Number.isNaN(parsed)) return;

    const criterion = activeRubric.criteria.find((c) => c.id === criterionId);
    const matchingLevel = criterion?.levels.find((l) => l.points === parsed);

    setScores((prev) => ({ ...prev, [criterionId]: parsed }));
    setSelectedLevels((prev) => ({
      ...prev,
      [criterionId]: matchingLevel ? matchingLevel.id : 'custom',
    }));
  };

  const handleFillFullPoints = () => {
    const nextScores: Record<string, number> = {};
    const nextLevels: Record<string, string> = {};
    activeRubric.criteria.forEach((c) => {
      const highestLevel = [...c.levels].sort((a, b) => b.points - a.points)[0];
      nextScores[c.id] = c.maxPoints;
      if (highestLevel) {
        nextLevels[c.id] = highestLevel.id;
      }
    });
    setScores(nextScores);
    setSelectedLevels(nextLevels);
  };

  const handleReset = () => {
    setScores({});
    setSelectedLevels({});
    setNote('');
  };

  const saveCurrentEvaluation = (advanceToNext: boolean) => {
    if (!activeStudent) return;
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(
      now.getHours()
    ).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const evaluation: StudentEvaluation = {
      id: existingEvaluation?.id || `eval-${Date.now()}`,
      rubricId: activeRubric.id,
      studentId: activeStudent.id,
      scores,
      selectedLevels,
      totalScore: currentTotalScore,
      maxPossibleScore,
      note: note.trim(),
      updatedAt: formattedDate,
    };

    onSaveEvaluation(evaluation);
    setSaveFeedback(`${activeStudent.name} kaydedildi (${currentTotalScore} Puan)`);
    setTimeout(() => setSaveFeedback(null), 2200);

    if (advanceToNext && filteredStudents.length > 1) {
      const idx = filteredStudents.findIndex((s) => s.id === activeStudent.id);
      const nextIdx = (idx + 1) % filteredStudents.length;
      setActiveStudentId(filteredStudents[nextIdx].id);
    }
  };

  const currentStudentIndex = filteredStudents.findIndex(
    (s) => s.id === activeStudent?.id
  );

  const goPrevStudent = () => {
    if (filteredStudents.length === 0) return;
    const prevIdx =
      (currentStudentIndex - 1 + filteredStudents.length) %
      filteredStudents.length;
    setActiveStudentId(filteredStudents[prevIdx].id);
  };

  const goNextStudent = () => {
    if (filteredStudents.length === 0) return;
    const nextIdx = (currentStudentIndex + 1) % filteredStudents.length;
    setActiveStudentId(filteredStudents[nextIdx].id);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Compact Control Header */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Rubric Selector */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="rubric-select"
              className="text-xs font-medium text-slate-500 whitespace-nowrap"
            >
              Rubrik:
            </label>
            <select
              id="rubric-select"
              value={activeRubric.id}
              onChange={(e) => onSelectRubric(e.target.value)}
              className="text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600"
            >
              {rubrics.map((r) => {
                const sum = r.criteria.reduce((a, c) => a + c.maxPoints, 0);
                return (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.criteria.length} Kriter · {sum} Puan)
                  </option>
                );
              })}
            </select>
          </div>

          <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
            |
          </span>

          {/* Class Filter */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="class-select"
              className="text-xs font-medium text-slate-500 whitespace-nowrap"
            >
              Sınıf:
            </label>
            <select
              id="class-select"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-600"
            >
              {classes.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>

          {/* Student Quick Navigation */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
            <button
              type="button"
              onClick={goPrevStudent}
              title="Önceki Öğrenci"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <select
              aria-label="Öğrenci Seçimi"
              value={activeStudent?.id || ''}
              onChange={(e) => setActiveStudentId(e.target.value)}
              className="text-xs font-semibold text-slate-900 bg-transparent px-2 py-1 focus:outline-none"
            >
              {filteredStudents.map((st, idx) => {
                const ev = evaluations.find(
                  (e) => e.rubricId === activeRubric.id && e.studentId === st.id
                );
                return (
                  <option key={st.id} value={st.id}>
                    {idx + 1}. {st.name} ({st.studentNumber})
                    {ev ? ` — ${ev.totalScore}p` : ''}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={goNextStudent}
              title="Sonraki Öğrenci"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Side Score Summary & Quick Actions */}
        <div className="flex items-center gap-2.5">
          {/* Layout Mode Switcher */}
          <div className="hidden md:flex items-center bg-slate-100 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setLayoutMode('grid')}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                layoutMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="2 Sütunlu Kompakt Kart Görünümü (7-8+ Kriter Tek Ekranda)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>2 Sütun</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('rows')}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                layoutMode === 'rows'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Tek Satır Liste Görünümü"
            >
              <List className="w-3.5 h-3.5" />
              <span>Satır</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleFillFullPoints}
            className="px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tam Puan Doldur</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Sıfırla</span>
          </button>

          {/* Live Total Score Readout */}
          <div className="flex items-baseline gap-1.5 bg-slate-900 text-white px-3.5 py-1.5 rounded-lg">
            <span className="text-xs text-slate-300 font-medium">Toplam:</span>
            <span className="text-lg font-bold font-mono tabular-nums text-emerald-400">
              {currentTotalScore}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              / {maxPossibleScore} Puan
            </span>
          </div>
        </div>
      </div>

      {/* Main Split Workspace: Left Compact Roster + Right High-Density Criteria Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Left Student Roster (Compact 3 cols) */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-semibold text-slate-700">
              Öğrenci Listesi ({filteredStudents.length})
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {
                filteredStudents.filter((s) =>
                  evaluations.some(
                    (e) => e.rubricId === activeRubric.id && e.studentId === s.id
                  )
                ).length
              }{' '}
              / {filteredStudents.length} Tamamlandı
            </span>
          </div>

          <div className="flex flex-col gap-1 max-h-[calc(100vh-230px)] overflow-y-auto pr-0.5">
            {filteredStudents.map((st, idx) => {
              const ev = evaluations.find(
                (e) => e.rubricId === activeRubric.id && e.studentId === st.id
              );
              const isSelected = st.id === activeStudent?.id;

              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setActiveStudentId(st.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-slate-900 text-white font-medium'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`font-mono tabular-nums text-[11px] ${
                        isSelected ? 'text-slate-400' : 'text-slate-400'
                      }`}
                    >
                      {String(idx + 1).padStart(2, '0')}.
                    </span>
                    <div className="truncate">
                      <span className="block truncate">{st.name}</span>
                      <span
                        className={`text-[10px] font-mono ${
                          isSelected ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {st.studentNumber} · {st.className}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1">
                    {ev ? (
                      <span
                        className={`font-mono tabular-nums font-semibold text-xs ${
                          isSelected ? 'text-emerald-300' : 'text-emerald-700'
                        }`}
                      >
                        {ev.totalScore}p
                      </span>
                    ) : (
                      <Clock
                        className={`w-3.5 h-3.5 ${
                          isSelected ? 'text-slate-400' : 'text-slate-300'
                        }`}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right High-Density Rubric Criteria Stage (9 cols) */}
        {/* Descriptions removed inside cards so 7-8+ criteria fit cleanly on a single screen */}
        <section className="lg:col-span-9 flex flex-col gap-2.5">
          {/* Status Strip for Active Student */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-900 text-sm">
                {activeStudent?.name}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{activeStudent?.studentNumber}</span>
              <span aria-hidden="true">·</span>
              <span>{activeStudent?.className}</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-500">
                İşaretlenen Kriter:{' '}
                <strong className="font-mono tabular-nums text-slate-800">
                  {gradedCriteriaCount}/{activeRubric.criteria.length}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs">
              {saveFeedback ? (
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {saveFeedback}
                </span>
              ) : existingEvaluation ? (
                <span className="text-slate-500">
                  Son kayıt: <span className="font-mono">{existingEvaluation.updatedAt}</span>
                </span>
              ) : (
                <span className="text-amber-700 font-medium">
                  Henüz kaydedilmedi
                </span>
              )}
            </div>
          </div>

          {/* Criteria Cards Grid — ZERO description text inside cards so 7-8+ criteria fit effortlessly */}
          <div
            className={
              layoutMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 gap-2.5'
                : 'flex flex-col gap-2'
            }
          >
            {activeRubric.criteria.map((criterion, index) => {
              const currentScore = scores[criterion.id];
              const isScored = typeof currentScore === 'number';
              const selectedLevelId = selectedLevels[criterion.id];

              return (
                <div
                  key={criterion.id}
                  className={`bg-white border rounded-xl px-3.5 py-2.5 transition-colors flex flex-col justify-between gap-2 ${
                    isScored
                      ? 'border-sky-500/60 bg-sky-50/10'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Top Row: Criterion Number + Title & Direct Point Input / Max Points */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono tabular-nums font-semibold text-slate-400 shrink-0">
                        {String(index + 1).padStart(2, '0')}.
                      </span>
                      <h3
                        className="text-sm font-semibold text-slate-900 truncate"
                        title={criterion.title}
                      >
                        {criterion.title}
                      </h3>
                    </div>

                    {/* Direct Point Input + Max Points */}
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={criterion.maxPoints}
                        aria-label={`${criterion.title} puanı`}
                        value={isScored ? currentScore : ''}
                        placeholder="-"
                        onChange={(e) =>
                          handleCustomPointChange(
                            criterion.id,
                            criterion.maxPoints,
                            e.target.value
                          )
                        }
                        className="w-12 text-right font-mono tabular-nums text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-1 focus:outline-none focus:border-sky-600 focus:bg-white"
                      />
                      <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        / {criterion.maxPoints}p
                      </span>
                    </div>
                  </div>

                  {/* Bottom Row: Compact Level Buttons (Label + Points ONLY, no descriptions) */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {criterion.levels.map((level) => {
                      const isActive =
                        selectedLevelId === level.id ||
                        (isScored &&
                          selectedLevelId === 'custom' &&
                          currentScore === level.points);

                      return (
                        <button
                          key={level.id}
                          type="button"
                          onClick={() =>
                            handleSelectLevel(
                              criterion.id,
                              level.id,
                              level.points
                            )
                          }
                          className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between gap-1 border whitespace-nowrap overflow-hidden ${
                            isActive
                              ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/80'
                          }`}
                        >
                          <span className="truncate text-[11px]">
                            {level.label}
                          </span>
                          <span
                            className={`font-mono tabular-nums text-[11px] font-semibold shrink-0 ${
                              isActive ? 'text-sky-100' : 'text-slate-900'
                            }`}
                          >
                            {level.points}p
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compact Bottom Bar: Quick Note + Save Buttons */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex-1 flex items-center gap-2">
              <label
                htmlFor="eval-note"
                className="text-xs font-medium text-slate-500 whitespace-nowrap"
              >
                Kısa Not:
              </label>
              <input
                id="eval-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Öğrenci için isteğe bağlı değerlendirme notu..."
                className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-600 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => saveCurrentEvaluation(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Kaydet</span>
              </button>
              <button
                type="button"
                onClick={() => saveCurrentEvaluation(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Kaydet ve Sonraki Öğrenciye Geç</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
