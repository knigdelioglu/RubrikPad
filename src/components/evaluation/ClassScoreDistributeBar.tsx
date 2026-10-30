import React, { useState } from 'react';
import { Shuffle, RotateCcw, CheckCircle2, X } from 'lucide-react';

interface ClassScoreDistributeBarProps {
  classStudentsCount: number;
  pendingStudentsCount: number;
  classroomName?: string;
  onDistributeScore: (targetScore: number, onlyUnscored: boolean) => void;
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
  onDistributeScore,
  canUndo = false,
  onUndo,
  feedbackMessage,
  onDismissFeedback,
  compact = false,
}) => {
  const [scoreInput, setScoreInput] = useState<string>('90');
  const [scope, setScope] = useState<'all' | 'unscored'>('all');
  const [validationError, setValidationError] = useState<string | null>(null);

  const parsedScore = scoreInput.trim() === '' ? NaN : Number(scoreInput);
  const isValidScore =
    Number.isFinite(parsedScore) && parsedScore >= 0 && parsedScore <= 100;

  const targetCount =
    scope === 'unscored' ? pendingStudentsCount : classStudentsCount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidScore) {
      setValidationError('Lütfen 0 ile 100 arasında bir puan girin.');
      return;
    }
    if (targetCount === 0) {
      setValidationError(
        scope === 'unscored'
          ? 'Bu şubede puanlanmamış öğrenci kalmadı.'
          : 'Bu şubede dağıtım yapılacak öğrenci bulunmuyor.'
      );
      return;
    }
    setValidationError(null);
    onDistributeScore(Math.round(parsedScore), scope === 'unscored');
  };

  if (compact) {
    return (
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
          onChange={(e) => setScope(e.target.value as 'all' | 'unscored')}
          className="px-2 py-0.5 text-[11px] font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
        >
          <option value="all">Tüm Sınıf ({classStudentsCount})</option>
          <option value="unscored">Bekleyenler ({pendingStudentsCount})</option>
        </select>
        <button
          type="submit"
          data-testid="distribute-class-score-btn"
          disabled={classStudentsCount === 0}
          className="px-2.5 py-1 rounded-lg bg-blue-900 hover:bg-blue-950 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
          title="Girilen puanı ölçütlere tam/yarım karışık dağıtarak tüm sınıfa uygula"
        >
          <Shuffle className="w-3 h-3" />
          Tüm Sınıfa Dağıt
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
            onChange={(e) => {
              setScope(e.target.value as 'all' | 'unscored');
              if (validationError) setValidationError(null);
            }}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
          >
            <option value="all">Tüm Öğrenciler ({classStudentsCount})</option>
            <option value="unscored">
              Sadece Bekleyenler ({pendingStudentsCount})
            </option>
          </select>

          <button
            type="submit"
            data-testid="distribute-class-score-btn"
            disabled={classStudentsCount === 0}
            className="px-3.5 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-950 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Tüm Sınıfa Dağıt</span>
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
    </div>
  );
};
