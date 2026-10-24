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
  Sparkles,
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
      className="inline-flex items-center rounded-xl bg-slate-100 p-1 border border-slate-300"
      role="group"
      aria-label="Rubrik Kartı Görünüm Modu"
    >
      <button
        type="button"
        onClick={() => onChangeViewMode('detailed')}
        aria-pressed={viewMode === 'detailed'}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[36px] ${
          viewMode === 'detailed'
            ? 'bg-blue-900 text-white shadow-xs'
            : 'text-slate-700 hover:text-slate-950 hover:bg-white/70'
        }`}
      >
        <LayoutGrid
          className={`w-3.5 h-3.5 ${
            viewMode === 'detailed' ? 'text-white' : 'text-slate-600'
          }`}
        />
        Açıklamalı Görünüm
      </button>
      <button
        type="button"
        onClick={() => onChangeViewMode('compact')}
        aria-pressed={viewMode === 'compact'}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[36px] ${
          viewMode === 'compact'
            ? 'bg-blue-900 text-white shadow-xs'
            : 'text-slate-700 hover:text-slate-950 hover:bg-white/70'
        }`}
      >
        <List
          className={`w-3.5 h-3.5 ${
            viewMode === 'compact' ? 'text-white' : 'text-slate-600'
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
      className="inline-flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Odak Modu Kontrolleri"
    >
      <button
        type="button"
        onClick={onToggleFocusMode}
        aria-pressed={focusModeEnabled}
        data-testid="toggle-criterion-focus-mode"
        title="Odak Modu: Tek seferde yalnızca tek bir ölçüte odaklanmanızı sağlar; diğer ölçütleri gizler veya karartır"
        className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer min-h-[36px] flex items-center gap-1.5 ${
          focusModeEnabled
            ? 'bg-blue-900 text-white border-blue-950 shadow-xs'
            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
        }`}
      >
        <Focus className="w-3.5 h-3.5" />
        <span>
          Odak Modu: {focusModeEnabled ? 'Açık' : 'Kapalı'}
        </span>
      </button>

      {focusModeEnabled && (
        <div
          className="inline-flex items-center rounded-xl bg-slate-100 p-0.5 border border-slate-300"
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
                ? 'bg-blue-900 text-white shadow-2xs'
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
                ? 'bg-blue-900 text-white shadow-2xs'
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
  focusDisplayMode,
  onSelectStep,
  onPrevStep,
  onNextStep,
  onExitFocusMode,
}) => {
  const activeStep = steps[activeIndex];

  return (
    <div
      data-testid="focus-mode-stepper-bar"
      className="bg-slate-100/90 border border-slate-300 rounded-2xl p-2.5 sm:p-3 space-y-2 shadow-2xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-900 text-white text-[11px] font-bold">
            <Focus className="w-3 h-3" />
            ODAK MODU
          </span>
          <span className="font-mono-num text-xs font-bold text-slate-900">
            Ölçüt {activeIndex + 1} / {totalCount}
          </span>
          {activeStep && (
            <span className="text-xs font-semibold text-slate-700 truncate max-w-[220px] sm:max-w-[340px]">
              — {activeStep.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono-num text-[11px] font-bold text-slate-800 bg-white px-2 py-0.5 rounded-lg border border-slate-300">
            Tamamlanan: {completedCount}/{totalCount}
          </span>
          <button
            type="button"
            onClick={onExitFocusMode}
            className="px-2.5 py-0.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
          >
            Tüm Ölçütleri Göster
          </button>
        </div>
      </div>

      {/* Single-Row Stepper Navigation: Prev Button + Criterion Step Pills + Next Button */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={onPrevStep}
          data-testid="focus-prev-criterion-btn"
          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 cursor-pointer shrink-0 shadow-2xs"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Önceki Ölçüt
        </button>

        <div
          className="flex items-center gap-1.5 flex-1 justify-center overflow-x-auto py-0.5"
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
              className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-bold border cursor-pointer flex items-center gap-1.5 shrink-0 ${
                step.isActive
                  ? 'bg-blue-900 text-white border-blue-950 shadow-2xs'
                  : step.isScored
                  ? 'bg-white text-slate-800 border-slate-300 hover:border-blue-900'
                  : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-white hover:text-slate-900'
              }`}
            >
              <span className="font-mono-num">{step.numberLabel}.</span>
              <span className="truncate max-w-[105px] xl:max-w-[130px]">
                {step.title}
              </span>
              {step.isScored && step.scoreLabel && (
                <span
                  className={`font-mono-num text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                    step.isActive
                      ? 'bg-blue-950 text-blue-100'
                      : 'bg-slate-200 text-slate-900'
                  }`}
                >
                  <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                  {step.scoreLabel}
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
          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-blue-900 border border-blue-950 text-xs font-bold text-white hover:bg-blue-950 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 cursor-pointer shrink-0 shadow-2xs"
        >
          Sonraki Ölçüt
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};


/**
 * DEHB Odaklı Düşük Uyaranlı & Yüksek Kontrastlı Puan Seviyesi Teması:
 * - Seçilmemiş tüm butonlar göz yormayan yumuşak gri/beyaz (slate-50 / slate-200) tonlarındadır;
 *   böylece ekranda aynı anda 20+ renkli kutu parlamaz.
 * - Yalnızca seçilen puan düzeyi yüksek kontrastlı Lacivert (blue-900) veya Koyu Slate (slate-800)
 *   ile net biçimde belirginleşir.
 */
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
    'bg-slate-50/90 border-slate-200 hover:border-blue-900/60 hover:bg-white text-slate-800';
  const calmUnselectedBadge =
    'bg-white text-slate-800 border border-slate-300';
  const calmCompactUnselected =
    'bg-slate-50 border-slate-200 hover:border-blue-900/60 hover:bg-white text-slate-700';

  if (points <= 0) {
    return {
      levelName: 'Gözlenmedi',
      unselectedCard: calmUnselectedCard,
      unselectedBadge: calmUnselectedBadge,
      selectedCard:
        'bg-slate-100 border-2 border-slate-800 text-slate-950 shadow-xs ring-2 ring-slate-800/15',
      selectedBadge: 'bg-slate-800 text-white',
      compactUnselected: calmCompactUnselected,
      compactSelected:
        'bg-slate-800 border-slate-900 text-white font-bold shadow-xs',
      summaryPill: 'bg-slate-200 text-slate-900 border-slate-400',
    };
  }

  const ratio = maxLevelPoints > 0 ? points / maxLevelPoints : 0;

  if (points === 1 || ratio <= 0.3) {
    return {
      levelName: 'Destek Gerekli',
      unselectedCard: calmUnselectedCard,
      unselectedBadge: calmUnselectedBadge,
      selectedCard:
        'bg-slate-100 border-2 border-slate-700 text-slate-950 shadow-xs ring-2 ring-slate-700/15',
      selectedBadge: 'bg-slate-700 text-white',
      compactUnselected: calmCompactUnselected,
      compactSelected:
        'bg-slate-700 border-slate-800 text-white font-bold shadow-xs',
      summaryPill: 'bg-slate-100 text-slate-900 border-slate-300',
    };
  }

  if (points === 2 || ratio <= 0.6) {
    return {
      levelName: 'Gelişmekte',
      unselectedCard: calmUnselectedCard,
      unselectedBadge: calmUnselectedBadge,
      selectedCard:
        'bg-blue-50/70 border-2 border-blue-800 text-slate-950 shadow-xs ring-2 ring-blue-800/15',
      selectedBadge: 'bg-blue-800 text-white',
      compactUnselected: calmCompactUnselected,
      compactSelected:
        'bg-blue-800 border-blue-900 text-white font-bold shadow-xs',
      summaryPill: 'bg-blue-50 text-blue-950 border-blue-300',
    };
  }

  if (points < maxLevelPoints) {
    return {
      levelName: 'Yetkin',
      unselectedCard: calmUnselectedCard,
      unselectedBadge: calmUnselectedBadge,
      selectedCard:
        'bg-blue-50/90 border-2 border-blue-900 text-slate-950 shadow-xs ring-2 ring-blue-900/15',
      selectedBadge: 'bg-blue-900 text-white',
      compactUnselected: calmCompactUnselected,
      compactSelected:
        'bg-blue-900 border-blue-950 text-white font-bold shadow-xs',
      summaryPill: 'bg-blue-100/80 text-blue-950 border-blue-300',
    };
  }

  return {
    levelName: 'Örnek Düzey',
    unselectedCard: calmUnselectedCard,
    unselectedBadge: calmUnselectedBadge,
    selectedCard:
      'bg-blue-50 border-2 border-blue-950 text-slate-950 shadow-xs ring-2 ring-blue-950/20',
    selectedBadge: 'bg-blue-950 text-white',
    compactUnselected: calmCompactUnselected,
    compactSelected:
      'bg-blue-950 border-slate-950 text-white font-bold shadow-xs',
    summaryPill: 'bg-blue-900 text-white border-blue-950',
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
  isNextUnscored = false,
  adhdFocusMode = false,
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

  const selectedLevelObj = !hasDirect
    ? criterion.levels.find((l) => l.points === selectedPoints)
    : undefined;

  const selectedTheme = selectedLevelObj
    ? getScoreLevelVisualTheme(selectedLevelObj.points, maxLevelPoints)
    : null;

  // Dimmed non-selected criterion strip when Odak Modu is set to "Diğerlerini Karart" (dim_others)
  if (isDimmedByFocus) {
    return (
      <div
        data-testid={`dimmed-criterion-card-${criterionIndex}`}
        onClick={() => onFocusSelect?.()}
        className="rounded-xl border border-slate-300/80 bg-slate-100/75 px-4 py-3 opacity-40 hover:opacity-85 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`font-mono-num text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 flex items-center gap-1 ${
              isAnswered
                ? 'bg-slate-700 text-white'
                : 'bg-slate-200 text-slate-700 border border-slate-300'
            }`}
          >
            {isAnswered && <Check className="w-3 h-3 stroke-[2.5]" />}
            Ölçüt 0{criterionIndex + 1}
          </span>
          <span className="text-sm font-semibold text-slate-800 truncate">
            {criterion.title}
          </span>
          <span className="font-mono-num text-xs font-medium text-slate-500 shrink-0">
            (Ağırlık: {critMaxPts}P)
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasDirect ? (
            <span className="font-mono-num text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-200 text-slate-900 border border-slate-300">
              Puanlandı: {directPoints}/{critMaxPts}
            </span>
          ) : selectedLevelObj ? (
            <span className="font-mono-num text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-200 text-slate-900 border border-slate-300 flex items-center gap-1">
              <Check className="w-3 h-3 stroke-[2.5]" />
              {selectedLevelObj.points}P ({selectedLevelObj.label})
            </span>
          ) : (
            <span className="text-xs font-medium text-slate-500 bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200">
              Henüz Puanlanmadı
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFocusSelect?.();
            }}
            className="px-3 py-1 rounded-lg bg-white border border-slate-300 hover:border-blue-900 text-xs font-bold text-blue-900 cursor-pointer"
          >
            Bu Ölçüte Odaklan
          </button>
        </div>
      </div>
    );
  }

  // Compact / Fast View: single row on tablet/desktop with high-contrast Navy selection (only when NOT in Focus Stage)
  if (viewMode === 'compact' && !isFocusedStage) {
    return (
      <div
        className={`rounded-xl border transition-all px-3.5 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 ${
          isNextUnscored
            ? 'bg-white border-2 border-blue-900 ring-2 ring-blue-900/10 shadow-xs'
            : isAnswered
            ? `bg-slate-50/80 border-slate-200 ${
                adhdFocusMode ? 'opacity-80 hover:opacity-100' : ''
              }`
            : 'bg-white border-slate-200 hover:border-slate-300'
        }`}
      >
        {/* Left: Criterion Index, Title & Max Points */}
        <div className="flex items-center gap-2.5 md:w-5/12 min-w-0">
          <span
            className={`font-mono-num text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 flex items-center gap-1 ${
              isNextUnscored
                ? 'bg-blue-900 text-white shadow-2xs'
                : isAnswered
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-700 border border-slate-300'
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
              {isNextUnscored && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-900 text-white">
                  <Sparkles className="w-2.5 h-2.5" />
                  SIRADAKİ ÖLÇÜT
                </span>
              )}
              {criterion.category && (
                <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                  {criterion.category}
                </span>
              )}
            </div>
          </div>
          <span className="font-mono-num text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
            {critMaxPts}P
          </span>
          {isScoreAssigned(reflectedGroupPoints) && (
            <span
              className="font-mono-num text-[11px] font-semibold text-slate-800 bg-slate-200/80 border border-slate-300 px-2 py-0.5 rounded-md shrink-0"
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
              const lvlTheme = getScoreLevelVisualTheme(
                lvl.points,
                maxLevelPoints
              );
              return (
                <button
                  key={lvl.level}
                  type="button"
                  onClick={() => onSelectLevel(criterion.id, lvl.points)}
                  aria-pressed={isSelected}
                  className={`min-h-[46px] px-2 py-1.5 rounded-xl border text-center transition-all active:scale-[0.98] cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 ${
                    isSelected
                      ? lvlTheme.compactSelected
                      : lvlTheme.compactUnselected
                  }`}
                >
                  <span className="font-mono-num text-sm font-bold">
                    {lvl.points}P
                  </span>
                  <span
                    className={`text-[11px] font-semibold truncate max-w-full ${
                      isSelected ? 'text-white' : 'opacity-85'
                    }`}
                  >
                    {lvl.label.replace(/\s*\(0\)/, '')}
                  </span>
                </button>
              );
            })}
          </div>

          {precisionScoringMode && onSetDirectScore && (
            <div className="flex items-center gap-1 shrink-0 bg-white border border-slate-300 rounded-xl px-2 py-1.5 min-h-[46px]">
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
                className="w-12 text-xs font-mono-num font-bold text-slate-900 text-right focus:outline-none"
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
              className="min-h-[42px] px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-600 hover:text-red-700 hover:border-red-300 hover:bg-red-50 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Detailed Tablet Card View & Spacious Focus Stage View: Large touch cards showing full level descriptions
  const gridColsClass =
    criterion.levels.length >= 5
      ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-5'
      : criterion.levels.length === 4
      ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
      : 'grid-cols-1 sm:grid-cols-3';

  return (
    <div
      data-testid={
        isFocusedStage
          ? 'active-focused-criterion-stage'
          : `criterion-card-${criterionIndex}`
      }
      className={`rounded-2xl border transition-all ${
        isFocusedStage
          ? 'bg-white border-2 border-blue-900 ring-4 ring-blue-900/10 p-5 sm:p-7 space-y-5 shadow-md'
          : isNextUnscored
          ? 'bg-white border-2 border-blue-900 ring-2 ring-blue-900/10 p-4 space-y-3 shadow-sm'
          : isAnswered
          ? `bg-slate-50/70 border-slate-200 p-4 space-y-3 shadow-2xs ${
              adhdFocusMode ? 'opacity-85 hover:opacity-100' : ''
            }`
          : 'bg-white border-slate-200 p-4 space-y-3 shadow-2xs'
      }`}
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span
            className={`font-mono-num font-bold rounded-xl shrink-0 flex items-center gap-1.5 ${
              isFocusedStage
                ? 'bg-blue-900 text-white text-sm px-3.5 py-1.5 shadow-xs'
                : isNextUnscored
                ? 'bg-blue-900 text-white text-xs px-2.5 py-1 shadow-2xs'
                : isAnswered
                ? 'bg-slate-700 text-white text-xs px-2.5 py-1'
                : 'bg-slate-100 text-slate-700 border border-slate-300 text-xs px-2.5 py-1'
            }`}
          >
            {isAnswered && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
            Ölçüt 0{criterionIndex + 1}
          </span>

          <h3
            className={`font-bold text-slate-950 leading-snug ${
              isFocusedStage ? 'text-lg sm:text-xl' : 'text-base'
            }`}
          >
            {criterion.title}
          </h3>

          {!isFocusedStage && isNextUnscored && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-lg bg-blue-900 text-white shadow-2xs">
              <Sparkles className="w-3 h-3" />
              Sıradaki
            </span>
          )}

          {criterion.category && (
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
              {criterion.category}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="font-mono-num text-xs font-bold text-slate-800 bg-slate-100 border border-slate-300 px-3 py-1 rounded-lg">
            Ağırlık: {critMaxPts} Puan
          </span>

          {isScoreAssigned(reflectedGroupPoints) && (
            <span
              className="font-mono-num text-xs font-semibold text-slate-800 bg-slate-200/80 border border-slate-300 px-2.5 py-1 rounded-lg"
              title="Bu ölçüt için kaydedilen ayrı Grup Puanı"
            >
              Ayrı Grup Puanı: {reflectedGroupPoints}P
            </span>
          )}

          {selectedLevelObj && selectedTheme && (
            <span
              className={`font-mono-num text-xs font-bold border px-3 py-1 rounded-lg flex items-center gap-1 ${selectedTheme.summaryPill}`}
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              Seçilen: {selectedLevelObj.points}P ({selectedLevelObj.label})
            </span>
          )}

          {hasDirect && (
            <span className="font-mono-num text-xs font-bold text-blue-950 bg-blue-50 border border-blue-300 px-2.5 py-1 rounded-lg">
              Doğrudan Puan: {directPoints} / {critMaxPts}
            </span>
          )}

          {precisionScoringMode && onSetDirectScore && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1">
              <span className="text-[11px] font-semibold text-slate-800">
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
                className="w-14 text-xs font-mono-num font-bold text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-2 focus:ring-blue-900"
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
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:text-red-700 hover:border-red-300 hover:bg-red-50 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Temizle
            </button>
          )}
        </div>
      </div>

      {/* Large Touch Level Boxes — Extra Spacious in Focus Stage, Calm Soft Gray when unselected, High-Contrast Navy when selected */}
      <div
        className={`grid ${gridColsClass} ${
          isFocusedStage ? 'gap-3.5' : 'gap-2.5'
        } items-stretch`}
      >
        {criterion.levels.map((lvl) => {
          const isSelected = !hasDirect && selectedPoints === lvl.points;
          const lvlTheme = getScoreLevelVisualTheme(lvl.points, maxLevelPoints);

          return (
            <button
              key={lvl.level}
              type="button"
              onClick={() => onSelectLevel(criterion.id, lvl.points)}
              aria-pressed={isSelected}
              className={`${
                isFocusedStage
                  ? 'min-h-[136px] sm:min-h-[156px] p-4 sm:p-5 rounded-2xl'
                  : 'min-h-[92px] p-3 rounded-xl'
              } border text-left transition-all active:scale-[0.99] cursor-pointer flex flex-col justify-between gap-2.5 h-full ${
                isSelected ? lvlTheme.selectedCard : lvlTheme.unselectedCard
              }`}
            >
              <div className="flex items-start justify-between gap-2 w-full">
                <span
                  className={`${
                    isFocusedStage ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'
                  } font-bold leading-tight text-slate-900`}
                >
                  {lvl.label.replace(/\s*\(0\)/, '')}
                </span>
                <span
                  className={`font-mono-num ${
                    isFocusedStage
                      ? 'text-sm sm:text-base px-3 py-1'
                      : 'text-xs sm:text-sm px-2.5 py-0.5'
                  } font-bold rounded-lg shrink-0 flex items-center gap-1 ${
                    isSelected
                      ? lvlTheme.selectedBadge
                      : lvlTheme.unselectedBadge
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                  {lvl.points}P
                </span>
              </div>

              {lvl.description ? (
                <p
                  className={`${
                    isFocusedStage ? 'text-xs sm:text-sm' : 'text-xs'
                  } leading-relaxed break-words ${
                    isSelected
                      ? 'text-slate-950 font-semibold'
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

      {/* Optional Footer Step Controls when inside Focus Stage */}
      {isFocusedStage && focusStageNav && (
        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <button
            type="button"
            disabled={!focusStageNav.canGoPrev}
            onClick={focusStageNav.onPrev}
            className="px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-300 font-bold text-slate-800 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
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
            className="px-3.5 py-2 rounded-xl bg-blue-900 border border-blue-950 font-bold text-white hover:bg-blue-950 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
          >
            Sonraki Ölçüt
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};


