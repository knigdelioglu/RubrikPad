import React, { useState, useMemo, useEffect } from 'react';
import {
  Shuffle,
  RotateCcw,
  CheckCircle2,
  X,
  Users,
  CheckSquare,
  Square,
  Search,
} from 'lucide-react';
import type { Student, StudentEvaluation, Rubric } from '../../types.ts';
import { getStudentEvaluationBreakdown } from '../../utils/rubricLogic.ts';

export type DistributeScopeMode = 'all' | 'unscored' | 'selected';

interface ClassScoreDistributeBarProps {
  classStudentsCount: number;
  pendingStudentsCount: number;
  classroomName?: string;
  classStudents?: Student[];
  evaluations?: Record<string, StudentEvaluation>;
  activeRubric?: Rubric;
  onDistributeScore: (
    targetScore: number,
    onlyUnscored: boolean,
    targetStudentIds?: string[]
  ) => void;
  canUndo?: boolean;
  onUndo?: () => void;
  feedbackMessage?: string | null;
  onDismissFeedback?: () => void;
  compact?: boolean;
}

export const ClassScoreDistributeBar: React.FC<ClassScoreDistributeBarProps> = ({
  classStudentsCount,
  pendingStudentsCount,
  classroomName,
  classStudents = [],
  evaluations = {},
  activeRubric,
  onDistributeScore,
  canUndo = false,
  onUndo,
  feedbackMessage,
  onDismissFeedback,
  compact = false,
}) => {
  const [scoreInput, setScoreInput] = useState<string>('90');
  const [scope, setScope] = useState<DistributeScopeMode>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isStudentPickerOpen, setIsStudentPickerOpen] = useState<boolean>(false);
  const [pickerSearchQuery, setPickerSearchQuery] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Keep selectedStudentIds valid when classStudents changes
  useEffect(() => {
    const validIds = new Set(classStudents.map((s) => s.id));
    setSelectedStudentIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [classStudents]);

  const studentStatusMap = useMemo(() => {
    const map = new Map<
      string,
      { isComplete: boolean; scoreOutOf100: number | null }
    >();
    if (!activeRubric) return map;
    for (const stu of classStudents) {
      const existing = evaluations[stu.id];
      const { effectiveCalc } = getStudentEvaluationBreakdown(
        activeRubric,
        existing
      );
      map.set(stu.id, {
        isComplete: effectiveCalc.isComplete,
        scoreOutOf100: effectiveCalc.finalScoreOutOf100,
      });
    }
    return map;
  }, [classStudents, evaluations, activeRubric]);

  const filteredPickerStudents = useMemo(() => {
    const q = pickerSearchQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return classStudents;
    return classStudents.filter(
      (stu) =>
        stu.fullName.toLocaleLowerCase('tr-TR').includes(q) ||
        stu.studentNumber.toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [classStudents, pickerSearchQuery]);

  const parsedScore = scoreInput.trim() === '' ? NaN : Number(scoreInput);
  const isValidScore =
    Number.isFinite(parsedScore) && parsedScore >= 0 && parsedScore <= 100;

  const targetCount =
    scope === 'selected'
      ? selectedStudentIds.length
      : scope === 'unscored'
      ? pendingStudentsCount
      : classStudentsCount;

  const handleScopeChange = (nextScope: DistributeScopeMode) => {
    setScope(nextScope);
    if (validationError) setValidationError(null);
    if (nextScope === 'selected') {
      setIsStudentPickerOpen(true);
    }
  };

  const handleToggleStudentId = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
    if (validationError) setValidationError(null);
  };

  const handleSelectAllStudents = () => {
    setSelectedStudentIds(classStudents.map((s) => s.id));
    if (validationError) setValidationError(null);
  };

  const handleSelectUnscoredStudents = () => {
    const unscoredIds = classStudents
      .filter((s) => !studentStatusMap.get(s.id)?.isComplete)
      .map((s) => s.id);
    setSelectedStudentIds(unscoredIds);
    if (validationError) setValidationError(null);
  };

  const handleClearSelectedStudents = () => {
    setSelectedStudentIds([]);
  };

  const executeDistribute = (overrideScope?: DistributeScopeMode) => {
    const effectiveScope = overrideScope || scope;
    if (!isValidScore) {
      setValidationError('Lütfen 0 ile 100 arasında bir puan girin.');
      return false;
    }
    if (effectiveScope === 'selected') {
      if (selectedStudentIds.length === 0) {
        setValidationError(
          'Lütfen sınıf listesinden en az 1 öğrenci seçin (tik atın).'
        );
        setIsStudentPickerOpen(true);
        return false;
      }
      setValidationError(null);
      onDistributeScore(Math.round(parsedScore), false, selectedStudentIds);
      return true;
    }

    const effectiveCount =
      effectiveScope === 'unscored' ? pendingStudentsCount : classStudentsCount;
    if (effectiveCount === 0) {
      setValidationError(
        effectiveScope === 'unscored'
          ? 'Bu şubede puanlanmamış öğrenci kalmadı.'
          : 'Bu şubede dağıtım yapılacak öğrenci bulunmuyor.'
      );
      return false;
    }
    setValidationError(null);
    onDistributeScore(
      Math.round(parsedScore),
      effectiveScope === 'unscored',
      undefined
    );
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeDistribute();
  };

  const studentPickerModal = isStudentPickerOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="distribute-student-picker-title"
      data-testid="distribute-student-picker-modal"
    >
      <div className="bg-white border border-slate-300 rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-900 text-white flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="distribute-student-picker-title"
                className="text-sm font-bold text-slate-900 flex items-center gap-2"
              >
                <span>Sınıf Listesinden Öğrenci Seç</span>
                {classroomName && (
                  <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-900">
                    {classroomName}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-600">
                Hedef puanın karışık ölçütlerle dağıtılacağı öğrencileri listeden tik atarak seçin.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsStudentPickerOpen(false)}
            aria-label="Öğrenci seçim penceresini kapat"
            data-testid="distribute-picker-close-btn"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Quick Actions Bar */}
        <div className="p-3 border-b border-slate-200 space-y-2.5 bg-white">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={pickerSearchQuery}
              onChange={(e) => setPickerSearchQuery(e.target.value)}
              placeholder="Okul no veya öğrenci adı ara..."
              aria-label="Sınıf listesinde öğrenci ara"
              data-testid="distribute-picker-search-input"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectAllStudents}
                data-testid="distribute-picker-select-all"
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-[11px] font-bold cursor-pointer"
              >
                Tümünü Seç ({classStudents.length})
              </button>
              <button
                type="button"
                onClick={handleSelectUnscoredStudents}
                data-testid="distribute-picker-select-unscored"
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-[11px] font-bold cursor-pointer"
              >
                Bekleyenleri Seç ({pendingStudentsCount})
              </button>
              <button
                type="button"
                onClick={handleClearSelectedStudents}
                data-testid="distribute-picker-clear-all"
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 text-[11px] font-semibold cursor-pointer"
              >
                Seçimi Temizle
              </button>
            </div>
            <span className="text-[11px] font-bold text-blue-900">
              {selectedStudentIds.length} / {classStudents.length} seçili
            </span>
          </div>
        </div>

        {/* Scrollable Student Checkbox List */}
        <div
          className="flex-1 overflow-y-auto divide-y divide-slate-200 max-h-72 bg-white"
          data-testid="distribute-picker-list"
        >
          {filteredPickerStudents.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Arama kriterine uygun öğrenci bulunamadı.
            </div>
          ) : (
            filteredPickerStudents.map((stu) => {
              const isChecked = selectedStudentIds.includes(stu.id);
              const status = studentStatusMap.get(stu.id);
              return (
                <button
                  key={stu.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isChecked}
                  onClick={() => handleToggleStudentId(stu.id)}
                  data-testid={`distribute-picker-student-${stu.id}`}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors select-none ${
                    isChecked
                      ? 'bg-blue-50/70 hover:bg-blue-50'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-blue-900 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className="text-xs font-mono-num font-bold text-slate-500 shrink-0">
                      #{stu.studentNumber}
                    </span>
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {stu.fullName}
                    </span>
                  </div>

                  <div className="shrink-0">
                    {status?.isComplete && status.scoreOutOf100 !== null ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-mono-num font-bold">
                        ✓ {status.scoreOutOf100} P
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-semibold">
                        Bekliyor
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label
              htmlFor="distribute-picker-score-input"
              className="text-xs font-bold text-slate-700"
            >
              Hedef Puan:
            </label>
            <input
              id="distribute-picker-score-input"
              data-testid="distribute-picker-score-input"
              type="number"
              min={0}
              max={100}
              step={1}
              value={scoreInput}
              onChange={(e) => {
                setScoreInput(e.target.value);
                if (validationError) setValidationError(null);
              }}
              className="w-18 px-2 py-1 text-xs font-mono-num font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsStudentPickerOpen(false)}
              data-testid="distribute-picker-confirm-btn"
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold cursor-pointer"
            >
              Seçimi Onayla ({selectedStudentIds.length})
            </button>
            <button
              type="button"
              disabled={selectedStudentIds.length === 0 || !isValidScore}
              onClick={() => {
                if (executeDistribute('selected')) {
                  setIsStudentPickerOpen(false);
                }
              }}
              data-testid="distribute-picker-apply-btn"
              className="px-3.5 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-950 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Seçili Öğrencilere Dağıt ({selectedStudentIds.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <>
        <form
          onSubmit={handleSubmit}
          data-testid="distribute-class-score-bar-compact"
          className="inline-flex flex-wrap items-center gap-1.5 bg-slate-100 border border-slate-300 rounded-xl px-2.5 py-1"
        >
          <label
            htmlFor="distribute-class-score-input-compact"
            className="text-[11px] font-bold text-slate-800 flex items-center gap-1"
          >
            <Shuffle className="w-3.5 h-3.5 text-blue-900 shrink-0" />
            <span>Hedef Puan:</span>
          </label>
          <input
            id="distribute-class-score-input-compact"
            data-testid="distribute-class-score-input"
            type="number"
            min={0}
            max={100}
            step={1}
            aria-label="Tüm sınıfa dağıtılacak hedef puan (0-100)"
            value={scoreInput}
            onChange={(e) => {
              setScoreInput(e.target.value);
              if (validationError) setValidationError(null);
            }}
            className="w-16 px-2 py-0.5 text-xs font-mono-num font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
          />
          <select
            aria-label="Dağıtım kapsamı"
            data-testid="distribute-class-score-scope"
            value={scope}
            onChange={(e) =>
              handleScopeChange(e.target.value as DistributeScopeMode)
            }
            className="px-2 py-0.5 text-[11px] font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
          >
            <option value="all">Tüm Öğrenciler ({classStudentsCount})</option>
            <option value="unscored">
              Sadece Bekleyenler ({pendingStudentsCount})
            </option>
            <option value="selected">
              Sınıf Listesinden Seç ({selectedStudentIds.length} Seçili)
            </option>
          </select>
          {scope === 'selected' && (
            <button
              type="button"
              onClick={() => setIsStudentPickerOpen(true)}
              data-testid="distribute-open-student-picker-btn"
              className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-50 text-blue-900 border border-blue-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              title="Sınıf listesinden öğrenci seç"
            >
              <CheckSquare className="w-3 h-3" />
              <span>
                Listeden Seç ({selectedStudentIds.length}/{classStudentsCount})
              </span>
            </button>
          )}
          <button
            type="submit"
            data-testid="distribute-class-score-btn"
            disabled={classStudentsCount === 0}
            className="px-2.5 py-1 rounded-lg bg-blue-900 hover:bg-blue-950 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            title="Girilen puanı ölçütlere tam/yarım karışık dağıtarak uygula"
          >
            <Shuffle className="w-3 h-3" />
            {scope === 'selected'
              ? `Seçiliye Dağıt (${selectedStudentIds.length})`
              : 'Tüm Sınıfa Dağıt'}
          </button>
          {canUndo && onUndo && (
            <button
              type="button"
              onClick={onUndo}
              data-testid="distribute-class-undo-btn"
              className="px-2 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              title="Son puan dağıtımını geri al"
            >
              <RotateCcw className="w-3 h-3" />
              Geri Al
            </button>
          )}
        </form>
        {studentPickerModal}
      </>
    );
  }

  return (
    <div
      data-testid="distribute-class-score-bar"
      className="mt-3 pt-3 border-t border-slate-200 space-y-2"
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5"
      >
        <div className="flex items-start sm:items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-900/10 border border-blue-900/20 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
            <Shuffle className="w-4 h-4 text-blue-900" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
              <span>Tüm Sınıfa Puan Dağıt (Karışık Ölçüt Dağıtımı)</span>
              {classroomName && (
                <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-900">
                  {classroomName}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600">
              Hedef puanı (örn. 90) yazıp dağıttığınızda her öğrenciye tam ve yarım/kısmi ölçüt puanları karışık kombinasyonlarla atanır.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="distribute-class-score-input"
              className="text-xs font-bold text-slate-700 whitespace-nowrap"
            >
              Hedef Puan:
            </label>
            <input
              id="distribute-class-score-input"
              data-testid="distribute-class-score-input"
              type="number"
              min={0}
              max={100}
              step={1}
              aria-label="Tüm sınıfa dağıtılacak hedef puan (0-100)"
              placeholder="90"
              value={scoreInput}
              onChange={(e) => {
                setScoreInput(e.target.value);
                if (validationError) setValidationError(null);
              }}
              className="w-20 px-2.5 py-1.5 text-xs font-mono-num font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
            />
          </div>

          <label htmlFor="distribute-class-score-scope" className="sr-only">
            Dağıtım Kapsamı
          </label>
          <select
            id="distribute-class-score-scope"
            aria-label="Dağıtım kapsamı"
            data-testid="distribute-class-score-scope"
            value={scope}
            onChange={(e) =>
              handleScopeChange(e.target.value as DistributeScopeMode)
            }
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
          >
            <option value="all">Tüm Öğrenciler ({classStudentsCount})</option>
            <option value="unscored">
              Sadece Bekleyenler ({pendingStudentsCount})
            </option>
            <option value="selected">
              Sınıf Listesinden Seç ({selectedStudentIds.length} Seçili)
            </option>
          </select>

          {scope === 'selected' && (
            <button
              type="button"
              onClick={() => setIsStudentPickerOpen(true)}
              data-testid="distribute-open-student-picker-btn"
              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-blue-900 border border-blue-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              title="Sınıf listesinden öğrencileri tik atarak seçin"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>
                Listeden Seç ({selectedStudentIds.length}/{classStudentsCount})
              </span>
            </button>
          )}

          <button
            type="submit"
            data-testid="distribute-class-score-btn"
            disabled={classStudentsCount === 0}
            className="px-3.5 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-950 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>
              {scope === 'selected'
                ? `Seçili Öğrencilere Dağıt (${targetCount})`
                : 'Tüm Sınıfa Dağıt'}
            </span>
          </button>

          {canUndo && onUndo && (
            <button
              type="button"
              onClick={onUndo}
              data-testid="distribute-class-undo-btn"
              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              title="Son işlemi geri al"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Geri Al</span>
            </button>
          )}
        </div>
      </form>

      {validationError && (
        <div
          role="alert"
          data-testid="distribute-class-score-error"
          className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5"
        >
          {validationError}
        </div>
      )}

      {feedbackMessage && (
        <div
          role="status"
          aria-live="polite"
          data-testid="distribute-class-score-feedback"
          className="bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
          {onDismissFeedback && (
            <button
              type="button"
              onClick={onDismissFeedback}
              aria-label="Bildirimi kapat"
              className="p-1 text-emerald-800 hover:text-emerald-950 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {studentPickerModal}
    </div>
  );
};
