import React from 'react';
import { Check, LayoutGrid, List, RotateCcw } from 'lucide-react';
import type { RubricCriterion } from '../../types.ts';
import { isScoreAssigned } from '../../utils/rubricLogic.ts';

export type RubricCardViewMode = 'detailed' | 'compact';

interface RubricViewModeToggleProps {
  viewMode: RubricCardViewMode;
  onChangeViewMode: (mode: RubricCardViewMode) => void;
}

export const RubricViewModeToggle: React.FC<RubricViewModeToggleProps> = ({
  viewMode,
  onChangeViewMode,
}) => {
  return (
    <div
      className="inline-flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200"
      role="group"
      aria-label="Rubrik Kartı Görünüm Modu"
    >
      <button
        type="button"
        onClick={() => onChangeViewMode('detailed')}
        aria-pressed={viewMode === 'detailed'}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[36px] ${
          viewMode === 'detailed'
            ? 'bg-white text-teal-950 shadow-xs border border-slate-200/80'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5 text-teal-700" />
        Açıklamalı Görünüm
      </button>
      <button
        type="button"
        onClick={() => onChangeViewMode('compact')}
        aria-pressed={viewMode === 'compact'}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[36px] ${
          viewMode === 'compact'
            ? 'bg-white text-teal-950 shadow-xs border border-slate-200/80'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <List className="w-3.5 h-3.5 text-teal-700" />
        Hızlı Görünüm
      </button>
    </div>
  );
};

export interface RubricCriterionCardProps {
  criterion: RubricCriterion;
  criterionIndex: number;
  selectedPoints: number | null | undefined;
  directPoints?: number | null | undefined;
  reflectedGroupPoints?: number | null | undefined;
  viewMode: RubricCardViewMode;
  precisionScoringMode?: boolean;
  onSelectLevel: (criterionId: string, points: number) => void;
  onSetDirectScore?: (criterionId: string, directPoints: number | null) => void;
  onClearScore?: (criterionId: string) => void;
}

export const RubricCriterionCard: React.FC<RubricCriterionCardProps> = ({
  criterion,
  criterionIndex,
  selectedPoints,
  directPoints,
  reflectedGroupPoints,
  viewMode,
  precisionScoringMode = false,
  onSelectLevel,
  onSetDirectScore,
  onClearScore,
}) => {
  const hasDirect = isScoreAssigned(directPoints);
  const hasLevel = isScoreAssigned(selectedPoints);
  const isAnswered = hasDirect || hasLevel;
  const critMaxPts = criterion.maxPoints ?? criterion.weight;
  const maxLevelPoints = Math.max(...criterion.levels.map((l) => l.points), 1);

  const selectedLevelObj = !hasDirect
    ? criterion.levels.find((l) => l.points === selectedPoints)
    : undefined;

  // Compact / Fast View: single row on tablet/desktop with touch-friendly score buttons
  if (viewMode === 'compact') {
    return (
      <div
        className={`rounded-xl border transition-all px-3.5 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 ${
          isAnswered
            ? 'bg-emerald-50/40 border-emerald-300 border-l-4 border-l-emerald-600'
            : 'bg-white border-slate-200 hover:border-slate-300'
        }`}
      >
        {/* Left: Criterion Index, Title & Max Points */}
        <div className="flex items-center gap-2.5 md:w-5/12 min-w-0">
          <span
            className={`font-mono-num text-xs font-bold px-2 py-1 rounded-lg shrink-0 flex items-center gap-1 ${
              isAnswered
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {isAnswered && <Check className="w-3 h-3 stroke-[2.5]" />}
            0{criterionIndex + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-bold text-slate-900 leading-snug break-words">
                {criterion.title}
              </span>
              {criterion.category && (
                <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  {criterion.category}
                </span>
              )}
            </div>
          </div>
          <span className="font-mono-num text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md shrink-0">
            {critMaxPts}P
          </span>
          {isScoreAssigned(reflectedGroupPoints) && (
            <span
              className="font-mono-num text-[11px] font-semibold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded-md shrink-0"
              title="Bu ölçüt için kaydedilen ayrı Grup Puanı"
            >
              Grup: {reflectedGroupPoints}P
            </span>
          )}
        </div>

        {/* Right: Compact Touch Level Selector Boxes */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 md:w-7/12">
          <div
            className="grid flex-1 gap-1.5 w-full"
            style={{
              gridTemplateColumns: `repeat(${criterion.levels.length}, minmax(0, 1fr))`,
            }}
          >
            {criterion.levels.map((lvl) => {
              const isSelected = !hasDirect && selectedPoints === lvl.points;
              const isZero = lvl.points === 0;
              return (
                <button
                  key={lvl.level}
                  type="button"
                  onClick={() => onSelectLevel(criterion.id, lvl.points)}
                  aria-pressed={isSelected}
                  className={`min-h-[46px] px-2 py-1.5 rounded-xl border text-center transition-all active:scale-[0.98] cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 ${
                    isSelected
                      ? isZero
                        ? 'bg-rose-700 border-rose-800 text-white font-bold shadow-xs'
                        : 'bg-teal-700 border-teal-800 text-white font-bold shadow-xs'
                      : 'bg-slate-50/80 border-slate-200 hover:border-teal-400 hover:bg-white text-slate-800'
                  }`}
                >
                  <span className="font-mono-num text-sm font-bold">
                    {lvl.points}P
                  </span>
                  <span
                    className={`text-[11px] font-semibold truncate max-w-full ${
                      isSelected ? 'text-white/95' : 'text-slate-600'
                    }`}
                  >
                    {lvl.label.replace(/\s*\(0\)/, '')}
                  </span>
                </button>
              );
            })}
          </div>

          {precisionScoringMode && onSetDirectScore && (
            <div className="flex items-center gap-1 shrink-0 bg-white border border-teal-300 rounded-xl px-2 py-1.5 min-h-[46px]">
              <input
                type="number"
                min={0}
                max={critMaxPts}
                step={1}
                aria-label={`${criterion.title} doğrudan puan (0-${critMaxPts})`}
                placeholder={`0-${critMaxPts}`}
                value={hasDirect ? directPoints : ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    onSetDirectScore(criterion.id, null);
                    return;
                  }
                  const num = Math.max(
                    0,
                    Math.min(critMaxPts, Math.round(Number(raw)))
                  );
                  onSetDirectScore(criterion.id, num);
                }}
                className="w-12 text-xs font-mono-num font-bold text-teal-950 text-right focus:outline-none"
              />
              <span className="text-[11px] font-mono-num text-slate-500">
                /{critMaxPts}
              </span>
            </div>
          )}

          {isAnswered && onClearScore && (
            <button
              type="button"
              onClick={() => onClearScore(criterion.id)}
              aria-label={`${criterion.title} puanını temizle`}
              title="Bu ölçüt puanını temizle"
              className="min-h-[42px] px-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Detailed Tablet Card View: Large touch cards showing full level descriptions without clipping
  const gridColsClass =
    criterion.levels.length >= 5
      ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-5'
      : criterion.levels.length === 4
      ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
      : 'grid-cols-1 sm:grid-cols-3';

  return (
    <div
      className={`rounded-2xl border transition-all p-4 space-y-3 ${
        isAnswered
          ? 'bg-white border-emerald-300 border-l-4 border-l-emerald-600 shadow-xs'
          : 'bg-white border-slate-200 shadow-2xs'
      }`}
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`font-mono-num text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 flex items-center gap-1 ${
              isAnswered
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {isAnswered && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
            Ölçüt 0{criterionIndex + 1}
          </span>

          <h3 className="text-base font-bold text-slate-900 leading-snug">
            {criterion.title}
          </h3>

          {criterion.category && (
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
              {criterion.category}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="font-mono-num text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">
            Ağırlık: {critMaxPts} Puan
          </span>

          {isScoreAssigned(reflectedGroupPoints) && (
            <span
              className="font-mono-num text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg"
              title="Bu ölçüt için kaydedilen ayrı Grup Puanı"
            >
              Ayrı Grup Puanı: {reflectedGroupPoints}P
            </span>
          )}

          {selectedLevelObj && (
            <span className="font-mono-num text-xs font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              Seçilen: {selectedLevelObj.points}P ({selectedLevelObj.label})
            </span>
          )}

          {hasDirect && (
            <span className="font-mono-num text-xs font-bold text-teal-950 bg-teal-100 border border-teal-300 px-2.5 py-1 rounded-lg">
              Doğrudan Puan: {directPoints} / {critMaxPts}
            </span>
          )}

          {precisionScoringMode && onSetDirectScore && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-teal-300 rounded-lg px-2.5 py-1">
              <span className="text-[11px] font-semibold text-teal-900">
                Tam Sayı:
              </span>
              <input
                type="number"
                min={0}
                max={critMaxPts}
                step={1}
                aria-label={`${criterion.title} doğrudan puan (0-${critMaxPts})`}
                placeholder={`0-${critMaxPts}`}
                value={hasDirect ? directPoints : ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    onSetDirectScore(criterion.id, null);
                    return;
                  }
                  const num = Math.max(
                    0,
                    Math.min(critMaxPts, Math.round(Number(raw)))
                  );
                  onSetDirectScore(criterion.id, num);
                }}
                className="w-14 text-xs font-mono-num font-bold text-teal-950 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <span className="text-xs font-mono-num text-slate-500">
                /{critMaxPts}
              </span>
            </div>
          )}

          {isAnswered && onClearScore && (
            <button
              type="button"
              onClick={() => onClearScore(criterion.id)}
              aria-label={`${criterion.title} puanını temizle`}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Temizle
            </button>
          )}
        </div>
      </div>

      {/* Large Touch Level Boxes with Full Descriptions */}
      <div className={`grid ${gridColsClass} gap-2.5 items-stretch`}>
        {criterion.levels.map((lvl) => {
          const isSelected = !hasDirect && selectedPoints === lvl.points;
          const isZero = lvl.points === 0;
          const isTopLevel = lvl.points === maxLevelPoints && lvl.points > 0;

          let cardColorClasses =
            'bg-slate-50/70 border-slate-200 hover:border-teal-500 hover:bg-white text-slate-800';
          let badgeColorClasses =
            'bg-white text-slate-800 border border-slate-200';

          if (isSelected) {
            if (isZero) {
              cardColorClasses =
                'bg-rose-50/90 border-2 border-rose-600 text-rose-950 shadow-xs';
              badgeColorClasses = 'bg-rose-700 text-white';
            } else if (isTopLevel) {
              cardColorClasses =
                'bg-emerald-50/90 border-2 border-emerald-600 text-emerald-950 shadow-xs';
              badgeColorClasses = 'bg-emerald-700 text-white';
            } else {
              cardColorClasses =
                'bg-teal-50/90 border-2 border-teal-700 text-teal-950 shadow-xs';
              badgeColorClasses = 'bg-teal-700 text-white';
            }
          }

          return (
            <button
              key={lvl.level}
              type="button"
              onClick={() => onSelectLevel(criterion.id, lvl.points)}
              aria-pressed={isSelected}
              className={`min-h-[92px] p-3 rounded-xl border text-left transition-all active:scale-[0.99] cursor-pointer flex flex-col justify-between gap-2 h-full ${cardColorClasses}`}
            >
              <div className="flex items-start justify-between gap-2 w-full">
                <span className="text-xs sm:text-sm font-bold leading-tight">
                  {lvl.label.replace(/\s*\(0\)/, '')}
                </span>
                <span
                  className={`font-mono-num text-xs sm:text-sm font-bold px-2 py-0.5 rounded-lg shrink-0 flex items-center gap-1 ${badgeColorClasses}`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                  {lvl.points}P
                </span>
              </div>

              {lvl.description ? (
                <p
                  className={`text-xs leading-relaxed break-words ${
                    isSelected
                      ? 'text-slate-900 font-medium'
                      : 'text-slate-600'
                  }`}
                >
                  {lvl.description}
                </p>
              ) : (
                <p className="text-[11px] italic text-slate-400">
                  Seviye açıklaması belirtilmemiş
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
