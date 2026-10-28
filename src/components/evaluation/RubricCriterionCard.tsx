import React from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Focus,
  LayoutGrid,
  List,
  RotateCcw,
} from 'lucide-react';
import type { RubricCriterion } from '../../types.ts';
import {
  isScoreAssigned,
  type CriterionFocusDisplayMode,
  type FocusModeCriterionStep,
} from '../../utils/rubricLogic.ts';

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
      className="inline-flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 shrink-0"
      role="group"
      aria-label="Rubrik Kartı Görünüm Modu"
    >
      <button
        type="button"
        onClick={() => onChangeViewMode('detailed')}
        aria-pressed={viewMode === 'detailed'}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[34px] ${
          viewMode === 'detailed'
            ? 'bg-slate-900 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-950 hover:bg-white/70'
        }`}
      >
        <LayoutGrid
          className={`w-3.5 h-3.5 ${
            viewMode === 'detailed' ? 'text-white' : 'text-slate-500'
          }`}
        />
        Açıklamalı Görünüm
      </button>
      <button
        type="button"
        onClick={() => onChangeViewMode('compact')}
        aria-pressed={viewMode === 'compact'}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[34px] ${
          viewMode === 'compact'
            ? 'bg-slate-900 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-950 hover:bg-white/70'
        }`}
      >
        <List
          className={`w-3.5 h-3.5 ${
            viewMode === 'compact' ? 'text-white' : 'text-slate-500'
          }`}
        />
        Hızlı Görünüm
      </button>
    </div>
  );
};

interface CriterionFocusToolbarProps {
  focusModeEnabled: boolean;
  onToggleFocusMode: () => void;
  focusDisplayMode: CriterionFocusDisplayMode;
  onChangeFocusDisplayMode: (mode: CriterionFocusDisplayMode) => void;
}

export const CriterionFocusToolbar: React.FC<CriterionFocusToolbarProps> = ({
  focusModeEnabled,
  onToggleFocusMode,
  focusDisplayMode,
  onChangeFocusDisplayMode,
}) => {
  return (
    <div
      className="inline-flex items-center gap-1.5 shrink-0"
      role="group"
      aria-label="Odak Modu Kontrolleri"
    >
      <button
        type="button"
        onClick={onToggleFocusMode}
        aria-pressed={focusModeEnabled}
        data-testid="toggle-criterion-focus-mode"
        title="Odak Modu: Tek seferde yalnızca tek bir ölçüte odaklanmanızı sağlar; diğer ölçütleri gizler veya karartır"
        className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer min-h-[34px] flex items-center gap-1.5 ${
          focusModeEnabled
            ? 'bg-slate-900 text-white border-slate-950 shadow-xs'
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
        }`}
      >
        <Focus className="w-3.5 h-3.5" />
        <span>Odak Modu: {focusModeEnabled ? 'Açık' : 'Kapalı'}</span>
      </button>

      {focusModeEnabled && (
        <div
          className="inline-flex items-center rounded-xl bg-slate-100 p-0.5 border border-slate-200"
          role="group"
          aria-label="Odak Modu Diğer Ölçüt Görünümü"
        >
          <button
            type="button"
            onClick={() => onChangeFocusDisplayMode('hide_others')}
            aria-pressed={focusDisplayMode === 'hide_others'}
            data-testid="focus-mode-hide-others-btn"
            title="Diğer ölçütleri tamamen gizle, ekranda yalnızca seçili ölçütü geniş alanda göster"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer min-h-[30px] ${
              focusDisplayMode === 'hide_others'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-transparent text-slate-700 hover:text-slate-950 hover:bg-white/70'
            }`}
          >
            <EyeOff className="w-3 h-3" />
            Diğerlerini Gizle
          </button>
          <button
            type="button"
            onClick={() => onChangeFocusDisplayMode('dim_others')}
            aria-pressed={focusDisplayMode === 'dim_others'}
            data-testid="focus-mode-dim-others-btn"
            title="Seçili ölçütü geniş alanda gösterirken diğer ölçütleri görsel olarak karart"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer min-h-[30px] ${
              focusDisplayMode === 'dim_others'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-transparent text-slate-700 hover:text-slate-950 hover:bg-white/70'
            }`}
          >
            <Eye className="w-3 h-3" />
            Diğerlerini Karart
          </button>
        </div>
      )}
    </div>
  );
};

interface FocusModeStepperBarProps {
  steps: FocusModeCriterionStep[];
  activeIndex: number;
  totalCount: number;
  completedCount: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  focusDisplayMode: CriterionFocusDisplayMode;
  onSelectStep: (index: number) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  onExitFocusMode: () => void;
}

export const FocusModeStepperBar: React.FC<FocusModeStepperBarProps> = ({
  steps,
  activeIndex,
  totalCount,
  completedCount,
  canGoPrev,
  canGoNext,
  onSelectStep,
  onPrevStep,
  onNextStep,
  onExitFocusMode,
}) => {
  const activeStep = steps[activeIndex];
  const tablistRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = tablistRef.current;
    if (!container) return;
    const activeEl = container.querySelector(
      `[data-testid="focus-step-pill-${activeIndex}"]`
    ) as HTMLElement | null;
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [activeIndex]);

  return (
    <div
      data-testid="focus-mode-stepper-bar"
      className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 sm:p-3 space-y-2 shadow-2xs"
    >
      <div className="flex items-center justify-between gap-2 min-h-[28px]">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold shrink-0">
            <Focus className="w-3 h-3" />
            ODAK MODU
          </span>
          <span className="font-mono-num text-xs font-bold text-slate-900 shrink-0">
            Ölçüt {activeIndex + 1} / {totalCount}
          </span>
          {activeStep && (
            <span
              className="text-xs font-semibold text-slate-700 truncate min-w-0"
              title={activeStep.title}
            >
              — {activeStep.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono-num text-[11px] font-bold text-slate-800 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
            Tamamlanan: {completedCount}/{totalCount}
          </span>
          <button
            type="button"
            onClick={onExitFocusMode}
            className="px-2.5 py-0.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
          >
            Tüm Ölçütleri Göster
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 min-h-[38px]">
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={onPrevStep}
          data-testid="focus-prev-criterion-btn"
          className="h-[36px] px-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 cursor-pointer shrink-0 shadow-2xs"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Önceki Ölçüt
        </button>

        <div
          ref={tablistRef}
          className="flex items-center gap-1.5 flex-1 min-w-0 justify-start overflow-x-auto py-0.5"
          role="tablist"
          aria-label="Ölçüt Adımları"
        >
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              role="tab"
              aria-selected={step.isActive}
              data-testid={`focus-step-pill-${step.index}`}
              onClick={() => onSelectStep(step.index)}
              title={step.title}
              className={`h-[34px] w-[132px] xl:w-[144px] px-2.5 rounded-xl text-xs font-bold border cursor-pointer flex items-center justify-between gap-1.5 shrink-0 ${
                step.isActive
                  ? 'bg-slate-900 text-white border-slate-950 shadow-2xs'
                  : step.isScored
                  ? 'bg-white text-slate-800 border-slate-200 hover:border-slate-900'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
                <span className="font-mono-num shrink-0">
                  {step.numberLabel}.
                </span>
                <span className="truncate">{step.title}</span>
              </span>
              {step.isScored && step.scoreLabel ? (
                <span
                  className={`font-mono-num text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 ${
                    step.isActive
                      ? 'bg-slate-800 text-slate-100'
                      : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                  {step.scoreLabel}
                </span>
              ) : (
                <span className="font-mono-num text-[10px] px-1.5 py-0.5 rounded opacity-50 shrink-0">
                  —
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!canGoNext}
          onClick={onNextStep}
          data-testid="focus-next-criterion-btn"
          className="h-[36px] px-3 rounded-xl bg-slate-900 border border-slate-950 text-xs font-bold text-white hover:bg-slate-950 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 cursor-pointer shrink-0 shadow-2xs"
        >
          Sonraki Ölçüt
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export function getScoreLevelVisualTheme(
  points: number,
  maxLevelPoints: number
): {
  levelName: string;
  unselectedCard: string;
  unselectedBadge: string;
  selectedCard: string;
  selectedBadge: string;
  compactUnselected: string;
  compactSelected: string;
  summaryPill: string;
} {
  const calmUnselectedCard =
    'bg-slate-50/90 border-slate-200 hover:border-slate-900/60 hover:bg-white text-slate-800';
  const calmUnselectedBadge =
    'bg-white text-slate-800 border border-slate-300';
  const calmCompactUnselected =
    'bg-transparent text-slate-500 hover:text-slate-900 hover:bg-white/70 font-medium';

  if (points <= 0) {
    return {
      levelName: maxLevelPoints === 2 ? 'Hayır (%0)' : 'Gözlenmedi',
      unselectedCard: calmUnselectedCard,
      unselectedBadge: calmUnselectedBadge,
      selectedCard:
        'bg-slate-100 border-2 border-slate-800 text-slate-950 shadow-xs ring-2 ring-slate-800/15',
      selectedBadge: 'bg-slate-800 text-white',
      compactUnselected: calmCompactUnselected,
      compactSelected: 'bg-slate-900 text-white font-bold shadow-xs',
      summaryPill: 'bg-slate-200 text-slate-900 border-slate-400',
    };
  }

  const ratio = maxLevelPoints > 0 ? points / maxLevelPoints : 0;

  if (points >= maxLevelPoints || ratio >= 0.99) {
    return {
      levelName: maxLevelPoints === 2 ? 'Evet (%100)' : 'Örnek Düzey',
      unselectedCard: calmUnselectedCard,
      unselectedBadge: calmUnselectedBadge,
      selectedCard:
        'bg-slate-50 border-2 border-slate-900 text-slate-950 shadow-xs ring-2 ring-slate-900/15',
      selectedBadge: 'bg-slate-900 text-white',
      compactUnselected: calmCompactUnselected,
      compactSelected: 'bg-slate-900 text-white font-bold shadow-xs',
      summaryPill: 'bg-slate-900 text-white border-slate-950',
    };
  }

  if (ratio <= 0.3 || (maxLevelPoints >= 4 && points === 1)) {
    return {
      levelName: 'Destek Gerekli',
      unselectedCard: calmUnselectedCard,
      unselectedBadge: calmUnselectedBadge,
      selectedCard:
        'bg-slate-100 border-2 border-slate-700 text-slate-950 shadow-xs ring-2 ring-slate-700/15',
      selectedBadge: 'bg-slate-700 text-white',
      compactUnselected: calmCompactUnselected,
      compactSelected: 'bg-slate-900 text-white font-bold shadow-xs',
      summaryPill: 'bg-slate-100 text-slate-900 border-slate-300',
    };
  }

  if (ratio <= 0.6 || (maxLevelPoints >= 4 && points === 2)) {
    return {
      levelName: maxLevelPoints === 2 ? 'Kısmen (%50)' : 'Gelişmekte',
      unselectedCard: calmUnselectedCard,
      unselectedBadge: calmUnselectedBadge,
      selectedCard:
        'bg-slate-50 border-2 border-slate-800 text-slate-950 shadow-xs ring-2 ring-slate-800/15',
      selectedBadge: 'bg-slate-800 text-white',
      compactUnselected: calmCompactUnselected,
      compactSelected: 'bg-slate-900 text-white font-bold shadow-xs',
      summaryPill: 'bg-slate-100 text-slate-900 border-slate-300',
    };
  }

  return {
    levelName: 'Yetkin',
    unselectedCard: calmUnselectedCard,
    unselectedBadge: calmUnselectedBadge,
    selectedCard:
      'bg-slate-50 border-2 border-slate-900 text-slate-950 shadow-xs ring-2 ring-slate-900/15',
    selectedBadge: 'bg-slate-900 text-white',
    compactUnselected: calmCompactUnselected,
    compactSelected: 'bg-slate-900 text-white font-bold shadow-xs',
    summaryPill: 'bg-slate-100 text-slate-900 border-slate-300',
  };
}

export interface RubricCriterionCardProps {
  criterion: RubricCriterion;
  criterionIndex: number;
  selectedPoints: number | null | undefined;
  directPoints?: number | null | undefined;
  reflectedGroupPoints?: number | null | undefined;
  viewMode: RubricCardViewMode;
  precisionScoringMode?: boolean;
  isNextUnscored?: boolean;
  adhdFocusMode?: boolean;
  isFocusedStage?: boolean;
  isDimmedByFocus?: boolean;
  onFocusSelect?: () => void;
  focusStageNav?: {
    currentStep: number;
    totalSteps: number;
    canGoPrev: boolean;
    canGoNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
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
  isFocusedStage = false,
  isDimmedByFocus = false,
  onFocusSelect,
  focusStageNav,
  onSelectLevel,
  onSetDirectScore,
  onClearScore,
}) => {
  const hasDirect = isScoreAssigned(directPoints);
  const hasLevel = isScoreAssigned(selectedPoints);
  const isAnswered = hasDirect || hasLevel;
  const critMaxPts = criterion.maxPoints ?? criterion.weight;
  const maxLevelPoints = Math.max(...criterion.levels.map((l) => l.points), 1);
  const isThreeLevelScale =
    criterion.levels.length === 3 && maxLevelPoints === 2;
  const formatLevelPercentage = (pts: number) =>
    Math.round((pts / maxLevelPoints) * 100);
  const formatLevelEarnedPts = (pts: number) =>
    Math.ceil((pts / maxLevelPoints) * critMaxPts);

  const selectedLevelObj = !hasDirect
    ? criterion.levels.find((l) => l.points === selectedPoints)
    : undefined;

  const earnedPoints = hasDirect
    ? Number(directPoints)
    : selectedLevelObj
    ? formatLevelEarnedPts(selectedLevelObj.points)
    : null;

  const topLevelObj = React.useMemo(() => {
    if (criterion.levels.length === 0) return undefined;
    return criterion.levels.reduce((best, cur) =>
      cur.points > best.points ? cur : best
    );
  }, [criterion.levels]);

  const criterionSubtitle = topLevelObj?.description || '';

  if (isDimmedByFocus) {
    return (
      <div
        data-testid={`dimmed-criterion-card-${criterionIndex}`}
        data-criterion-id={criterion.id}
        onClick={() => onFocusSelect?.()}
        className="px-5 sm:px-6 py-4 bg-slate-50/70 opacity-45 hover:opacity-90 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono-num text-sm font-semibold text-slate-400 shrink-0">
            {String(criterionIndex + 1).padStart(2, '0')}
          </span>
          <span className="text-sm font-bold text-slate-800 truncate">
            {criterion.title}
          </span>
          <span className="font-mono-num text-xs font-semibold text-slate-400 shrink-0">
            (%{critMaxPts})
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono-num text-sm font-bold text-slate-900">
            {earnedPoints !== null ? `${earnedPoints} P` : '— P'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFocusSelect?.();
            }}
            className="px-3 py-1 rounded-lg bg-white border border-slate-200 hover:border-slate-900 text-xs font-bold text-slate-800 cursor-pointer"
          >
            Odaklan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={
        isFocusedStage
          ? 'active-focused-criterion-stage'
          : `criterion-card-${criterionIndex}`
      }
      data-criterion-id={criterion.id}
      className={`px-5 sm:px-6 py-5 transition-colors ${
        isFocusedStage
          ? 'bg-slate-50/60 ring-2 ring-slate-900/10'
          : 'bg-white hover:bg-slate-50/35'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-6">
        {/* Left Column: DEĞERLENDİRME KRİTERİ */}
        <div className="flex-1 min-w-[260px] space-y-1 pr-2">
          <div className="text-sm sm:text-base leading-snug">
            <span className="font-mono-num text-sm font-semibold text-slate-400 mr-2">
              {String(criterionIndex + 1).padStart(2, '0')}
            </span>
            <span className="font-bold text-slate-900">
              {criterion.title}
            </span>
            <span className="font-mono-num text-xs font-semibold text-slate-400 ml-2">
              (%{critMaxPts})
            </span>
            {isScoreAssigned(reflectedGroupPoints) && (
              <span
                className="font-mono-num text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md ml-2"
                title="Bu ölçüt için kaydedilen ayrı Grup Puanı"
              >
                Grup: {reflectedGroupPoints}P
              </span>
            )}
          </div>

          {criterionSubtitle && (
            <p className="text-xs sm:text-[13px] text-slate-500 leading-relaxed">
              {criterionSubtitle}
            </p>
          )}
        </div>

        {/* Right Columns: SEVİYE SEÇİMİ (Segmented Pill) + PUAN */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-3 sm:gap-5 shrink-0">
          {/* Segmented Level Pill Container */}
          <div className="inline-flex flex-wrap sm:flex-nowrap items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 gap-0.5">
            {criterion.levels.map((lvl) => {
              const isSelected = !hasDirect && selectedPoints === lvl.points;
              const pct = formatLevelPercentage(lvl.points);
              const cleanLabel = lvl.label.replace(/\s*\(0\)/, '');
              const isManyLevels = criterion.levels.length > 3;

              return (
                <button
                  key={lvl.level}
                  type="button"
                  onClick={() => {
                    if (isSelected && onClearScore) {
                      onClearScore(criterion.id);
                    } else {
                      onSelectLevel(criterion.id, lvl.points);
                    }
                  }}
                  aria-pressed={isSelected}
                  title={
                    lvl.description
                      ? `${cleanLabel}: ${lvl.description}`
                      : cleanLabel
                  }
                  className={`${
                    isManyLevels
                      ? 'px-2.5 py-1.5 text-[11px] min-h-[32px] gap-1'
                      : 'px-3.5 py-2 text-xs min-h-[36px] gap-1.5'
                  } rounded-lg transition-all cursor-pointer flex items-center justify-center whitespace-nowrap ${
                    isSelected
                      ? 'bg-slate-900 text-white font-bold shadow-xs'
                      : 'bg-transparent text-slate-500 hover:text-slate-900 hover:bg-white/70 font-medium'
                  }`}
                >
                  {isThreeLevelScale ? (
                    <>
                      <span>{cleanLabel}</span>
                      <span
                        className={`font-mono-num text-[11px] ${
                          isSelected ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        (%{pct})
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className={`font-mono-num font-bold ${
                          isSelected ? 'text-white' : 'text-slate-700'
                        }`}
                      >
                        {lvl.points}
                      </span>
                      <span>{cleanLabel}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {precisionScoringMode && onSetDirectScore && (
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 h-[38px]">
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
                className="w-12 text-xs font-mono-num font-bold text-slate-900 bg-white border border-slate-200 rounded px-1 py-0.5 text-right focus:outline-none"
              />
              <span className="text-[11px] font-mono-num text-slate-500">
                /{critMaxPts}
              </span>
            </div>
          )}

          {/* PUAN Column */}
          <div className="flex items-center justify-end gap-1.5 min-w-[64px] text-right">
            <span
              className={`font-mono-num text-sm sm:text-base font-extrabold ${
                earnedPoints !== null ? 'text-slate-900' : 'text-slate-300'
              }`}
            >
              {earnedPoints !== null ? `${earnedPoints} P` : '— P'}
            </span>
            {onClearScore && isAnswered && (
              <button
                type="button"
                onClick={() => onClearScore(criterion.id)}
                aria-label={`${criterion.title} puanını temizle`}
                title="Bu ölçüt puanını temizle"
                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer Step Controls when inside Focus Stage */}
      {isFocusedStage && focusStageNav && (
        <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between gap-3 text-xs">
          <button
            type="button"
            disabled={!focusStageNav.canGoPrev}
            onClick={focusStageNav.onPrev}
            className="h-[34px] px-3.5 rounded-xl bg-slate-100 border border-slate-200 font-bold text-slate-800 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Önceki Ölçüt
          </button>

          <span className="font-mono-num font-semibold text-slate-600">
            {focusStageNav.currentStep} / {focusStageNav.totalSteps}
          </span>

          <button
            type="button"
            disabled={!focusStageNav.canGoNext}
            onClick={focusStageNav.onNext}
            className="h-[34px] px-3.5 rounded-xl bg-slate-900 border border-slate-950 font-bold text-white hover:bg-slate-950 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            Sonraki Ölçüt
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
