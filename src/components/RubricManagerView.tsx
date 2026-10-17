import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Calculator,
  ArrowUp,
  ArrowDown,
  Copy,
  Play,
} from 'lucide-react';
import { Rubric, RubricCriterion, CriterionLevel } from '../types';
import { createDefaultLevels } from '../data/defaultData';

interface RubricManagerViewProps {
  rubrics: Rubric[];
  selectedRubricId: string;
  onSaveRubric: (rubric: Rubric) => void;
  onDeleteRubric: (id: string) => void;
  onStartEvaluatingWithRubric: (id: string) => void;
  initialEditingRubric?: Rubric | null;
  onClearInitialEditing?: () => void;
}

export const RubricManagerView: React.FC<RubricManagerViewProps> = ({
  rubrics,
  selectedRubricId,
  onSaveRubric,
  onDeleteRubric,
  onStartEvaluatingWithRubric,
  initialEditingRubric,
  onClearInitialEditing,
}) => {
  const [editingRubric, setEditingRubric] = useState<Rubric | null>(
    initialEditingRubric || null
  );
  const [autoScaleLevels, setAutoScaleLevels] = useState<boolean>(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialEditingRubric) {
      setEditingRubric(initialEditingRubric);
      if (onClearInitialEditing) onClearInitialEditing();
    }
  }, [initialEditingRubric, onClearInitialEditing]);

  const startCreateNewRubric = () => {
    const newCriteria: RubricCriterion[] = [
      {
        id: `crit-${Date.now()}-1`,
        title: '1. Kriter Başlığı',
        maxPoints: 15,
        levels: createDefaultLevels(15),
      },
      {
        id: `crit-${Date.now()}-2`,
        title: '2. Kriter Başlığı',
        maxPoints: 15,
        levels: createDefaultLevels(15),
      },
      {
        id: `crit-${Date.now()}-3`,
        title: '3. Kriter Başlığı',
        maxPoints: 15,
        levels: createDefaultLevels(15),
      },
      {
        id: `crit-${Date.now()}-4`,
        title: '4. Kriter Başlığı',
        maxPoints: 15,
        levels: createDefaultLevels(15),
      },
      {
        id: `crit-${Date.now()}-5`,
        title: '5. Kriter Başlığı',
        maxPoints: 15,
        levels: createDefaultLevels(15),
      },
      {
        id: `crit-${Date.now()}-6`,
        title: '6. Kriter Başlığı',
        maxPoints: 15,
        levels: createDefaultLevels(15),
      },
      {
        id: `crit-${Date.now()}-7`,
        title: '7. Kriter Başlığı',
        maxPoints: 10,
        levels: createDefaultLevels(10),
      },
    ];

    setEditingRubric({
      id: `rubric-${Date.now()}`,
      title: 'Yeni Değerlendirme Rubriği',
      course: 'Genel Ders',
      totalPoints: 100,
      createdAt: new Date().toISOString().slice(0, 10),
      criteria: newCriteria,
    });
    setValidationError(null);
  };

  const handleCriterionMaxPointsChange = (
    criterionId: string,
    newMaxPoints: number
  ) => {
    if (!editingRubric) return;
    const clamped = Math.max(1, Math.min(500, Number(newMaxPoints) || 0));

    const updatedCriteria = editingRubric.criteria.map((c) => {
      if (c.id !== criterionId) return c;

      let updatedLevels: CriterionLevel[] = c.levels;
      if (autoScaleLevels && c.levels.length > 0) {
        const count = c.levels.length;
        updatedLevels = c.levels.map((lvl, idx) => {
          if (idx === 0) return { ...lvl, points: 0 };
          if (idx === count - 1) return { ...lvl, points: clamped };
          const ratio = idx / (count - 1);
          return { ...lvl, points: Math.round(clamped * ratio) };
        });
      }

      return {
        ...c,
        maxPoints: clamped,
        levels: updatedLevels,
      };
    });

    const total = updatedCriteria.reduce((acc, c) => acc + c.maxPoints, 0);
    setEditingRubric({
      ...editingRubric,
      criteria: updatedCriteria,
      totalPoints: total,
    });
  };

  const handleLevelPointChange = (
    criterionId: string,
    levelId: string,
    newPoints: number
  ) => {
    if (!editingRubric) return;
    const pts = Math.max(0, Number(newPoints) || 0);

    const updatedCriteria = editingRubric.criteria.map((c) => {
      if (c.id !== criterionId) return c;
      const updatedLevels = c.levels.map((l) =>
        l.id === levelId ? { ...l, points: pts } : l
      );
      const highestLevelPoints = Math.max(
        c.maxPoints,
        ...updatedLevels.map((l) => l.points)
      );
      return {
        ...c,
        maxPoints: highestLevelPoints,
        levels: updatedLevels,
      };
    });

    const total = updatedCriteria.reduce((acc, c) => acc + c.maxPoints, 0);
    setEditingRubric({
      ...editingRubric,
      criteria: updatedCriteria,
      totalPoints: total,
    });
  };

  const handleLevelLabelChange = (
    criterionId: string,
    levelId: string,
    newLabel: string
  ) => {
    if (!editingRubric) return;
    const updatedCriteria = editingRubric.criteria.map((c) => {
      if (c.id !== criterionId) return c;
      return {
        ...c,
        levels: c.levels.map((l) =>
          l.id === levelId ? { ...l, label: newLabel } : l
        ),
      };
    });
    setEditingRubric({ ...editingRubric, criteria: updatedCriteria });
  };

  const handleAddCriterion = () => {
    if (!editingRubric) return;
    const nextIndex = editingRubric.criteria.length + 1;
    const defaultPts = 10;
    const newCrit: RubricCriterion = {
      id: `crit-${Date.now()}-${nextIndex}`,
      title: `${nextIndex}. Yeni Değerlendirme Kriteri`,
      maxPoints: defaultPts,
      levels: createDefaultLevels(defaultPts),
    };
    const updatedCriteria = [...editingRubric.criteria, newCrit];
    const total = updatedCriteria.reduce((acc, c) => acc + c.maxPoints, 0);
    setEditingRubric({
      ...editingRubric,
      criteria: updatedCriteria,
      totalPoints: total,
    });
  };

  const handleDuplicateCriterion = (criterion: RubricCriterion) => {
    if (!editingRubric) return;
    const copy: RubricCriterion = {
      ...criterion,
      id: `crit-${Date.now()}`,
      title: `${criterion.title} (Kopya)`,
      levels: criterion.levels.map((l, i) => ({
        ...l,
        id: `lvl-${Date.now()}-${i}`,
      })),
    };
    const updatedCriteria = [...editingRubric.criteria, copy];
    const total = updatedCriteria.reduce((acc, c) => acc + c.maxPoints, 0);
    setEditingRubric({
      ...editingRubric,
      criteria: updatedCriteria,
      totalPoints: total,
    });
  };

  const handleRemoveCriterion = (criterionId: string) => {
    if (!editingRubric || editingRubric.criteria.length <= 1) return;
    const updatedCriteria = editingRubric.criteria.filter(
      (c) => c.id !== criterionId
    );
    const total = updatedCriteria.reduce((acc, c) => acc + c.maxPoints, 0);
    setEditingRubric({
      ...editingRubric,
      criteria: updatedCriteria,
      totalPoints: total,
    });
  };

  const handleMoveCriterion = (index: number, direction: 'up' | 'down') => {
    if (!editingRubric) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= editingRubric.criteria.length) return;
    const list = [...editingRubric.criteria];
    const [removed] = list.splice(index, 1);
    list.splice(targetIndex, 0, removed);
    setEditingRubric({ ...editingRubric, criteria: list });
  };

  const handleDistributeTo100Points = () => {
    if (!editingRubric || editingRubric.criteria.length === 0) return;
    const count = editingRubric.criteria.length;
    const basePoints = Math.floor(100 / count);
    let remainder = 100 - basePoints * count;

    const updatedCriteria = editingRubric.criteria.map((c) => {
      const pts = basePoints + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      return {
        ...c,
        maxPoints: pts,
        levels: createDefaultLevels(pts),
      };
    });

    setEditingRubric({
      ...editingRubric,
      criteria: updatedCriteria,
      totalPoints: 100,
    });
  };

  const handleSave = () => {
    if (!editingRubric) return;
    if (!editingRubric.title.trim()) {
      setValidationError('Lütfen rubrik adını giriniz.');
      return;
    }
    if (editingRubric.criteria.some((c) => !c.title.trim())) {
      setValidationError('Tüm kriterlerin başlığı dolu olmalıdır.');
      return;
    }
    const sum = editingRubric.criteria.reduce((a, c) => a + c.maxPoints, 0);
    onSaveRubric({
      ...editingRubric,
      totalPoints: sum,
    });
    setEditingRubric(null);
    setValidationError(null);
  };

  if (editingRubric) {
    const totalPointsSum = editingRubric.criteria.reduce(
      (acc, c) => acc + c.maxPoints,
      0
    );

    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        {/* Top Editor Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Rubrik ve Kriter Puanlarını Düzenle
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Her bir kritere doğrudan maksimum puan ve seviye puanları atayın.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-1.5 bg-slate-900 text-white px-3.5 py-2 rounded-lg">
              <span className="text-xs text-slate-300">Toplam Puan:</span>
              <span className="text-base font-bold font-mono tabular-nums text-emerald-400">
                {totalPointsSum}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                ({editingRubric.criteria.length} Kriter)
              </span>
            </div>

            <button
              type="button"
              onClick={handleDistributeTo100Points}
              className="px-3 py-2 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>100 Puana Eşitle</span>
            </button>

            <button
              type="button"
              onClick={() => setEditingRubric(null)}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              <span>İptal</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Rubriği Kaydet</span>
            </button>
          </div>
        </div>

        {validationError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
            {validationError}
          </div>
        )}

        {/* Rubric Metadata Fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Rubrik Başlığı
            </label>
            <input
              type="text"
              value={editingRubric.title}
              onChange={(e) =>
                setEditingRubric({ ...editingRubric, title: e.target.value })
              }
              placeholder="Örn: Proje Sunumu Değerlendirme Rubriği"
              className="w-full text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 focus:outline-none focus:border-sky-600 focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Ders / Kategori
            </label>
            <input
              type="text"
              value={editingRubric.course}
              onChange={(e) =>
                setEditingRubric({ ...editingRubric, course: e.target.value })
              }
              placeholder="Örn: Fen Bilimleri / Yazılım"
              className="w-full text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 focus:outline-none focus:border-sky-600 focus:bg-white"
            />
          </div>
        </div>

        {/* Criteria List with Point Configuration */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Değerlendirme Kriterleri ve Puan Dağılımı ({editingRubric.criteria.length} Kriter)
            </h3>

            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoScaleLevels}
                onChange={(e) => setAutoScaleLevels(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Kriter puanı değiştiğinde alt seviye puanlarını otomatik oranla</span>
            </label>
          </div>

          <div className="space-y-3">
            {editingRubric.criteria.map((criterion, idx) => (
              <div
                key={criterion.id}
                className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Criterion Name */}
                  <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
                    <span className="text-xs font-mono tabular-nums font-bold text-slate-400">
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      value={criterion.title}
                      onChange={(e) => {
                        const updated = editingRubric.criteria.map((c) =>
                          c.id === criterion.id
                            ? { ...c, title: e.target.value }
                            : c
                        );
                        setEditingRubric({ ...editingRubric, criteria: updated });
                      }}
                      placeholder="Kriter adını yazın..."
                      className="flex-1 text-sm font-semibold text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-600"
                    />
                  </div>

                  {/* Criterion Max Points Input + Quick Point Presets */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                      <span className="text-xs font-semibold text-slate-600">
                        Kriter Puanı:
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={criterion.maxPoints}
                        onChange={(e) =>
                          handleCriterionMaxPointsChange(
                            criterion.id,
                            Number(e.target.value)
                          )
                        }
                        className="w-16 text-right font-mono tabular-nums text-sm font-bold text-sky-700 bg-sky-50/60 border border-sky-200 rounded px-2 py-0.5 focus:outline-none focus:border-sky-600"
                      />
                      <span className="text-xs font-mono text-slate-500">
                        Puan
                      </span>
                    </div>

                    {/* Quick Preset Point Buttons */}
                    <div className="hidden sm:flex items-center gap-1">
                      {[5, 10, 15, 20, 25].map((pt) => (
                        <button
                          key={pt}
                          type="button"
                          onClick={() =>
                            handleCriterionMaxPointsChange(criterion.id, pt)
                          }
                          className={`px-2 py-1 text-[11px] font-mono tabular-nums rounded-md border transition-colors ${
                            criterion.maxPoints === pt
                              ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {pt}p
                        </button>
                      ))}
                    </div>

                    {/* Move / Duplicate / Delete Controls */}
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        type="button"
                        onClick={() => handleMoveCriterion(idx, 'up')}
                        disabled={idx === 0}
                        title="Yukarı Taşı"
                        className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 bg-white border border-slate-200 rounded-lg"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveCriterion(idx, 'down')}
                        disabled={idx === editingRubric.criteria.length - 1}
                        title="Aşağı Taşı"
                        className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 bg-white border border-slate-200 rounded-lg"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateCriterion(criterion)}
                        title="Kriteri Çoğalt"
                        className="p-1.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-lg"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveCriterion(criterion.id)}
                        disabled={editingRubric.criteria.length <= 1}
                        title="Kriteri Sil"
                        className="p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30 bg-white border border-slate-200 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Editable Performance Levels (Label + Points) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {criterion.levels.map((lvl) => (
                    <div
                      key={lvl.id}
                      className="flex items-center justify-between gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                    >
                      <input
                        type="text"
                        value={lvl.label}
                        onChange={(e) =>
                          handleLevelLabelChange(
                            criterion.id,
                            lvl.id,
                            e.target.value
                          )
                        }
                        aria-label="Seviye adı"
                        className="w-full text-xs font-medium text-slate-700 bg-transparent focus:outline-none"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={500}
                          value={lvl.points}
                          onChange={(e) =>
                            handleLevelPointChange(
                              criterion.id,
                              lvl.id,
                              Number(e.target.value)
                            )
                          }
                          aria-label="Seviye puanı"
                          className="w-12 text-right font-mono tabular-nums text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-sky-600"
                        />
                        <span className="text-[11px] font-mono text-slate-400">
                          p
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddCriterion}
            className="w-full py-2.5 border-2 border-dashed border-slate-300 hover:border-sky-500 text-slate-700 hover:text-sky-700 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Kriter Ekle (Puanlı)</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Rubrik Kütüphanesi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kriter bazlı puanlamaya sahip rubriklerinizi yönetin veya yeni rubrik ekleyin.
          </p>
        </div>

        <button
          type="button"
          onClick={startCreateNewRubric}
          className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Rubrik Ekle</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rubrics.map((rubric) => {
          const sumPoints = rubric.criteria.reduce(
            (acc, c) => acc + c.maxPoints,
            0
          );
          const isCurrent = rubric.id === selectedRubricId;

          return (
            <div
              key={rubric.id}
              className={`bg-white border rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors ${
                isCurrent ? 'border-sky-600' : 'border-slate-200'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {rubric.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                      <span>{rubric.course}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {rubric.criteria.length} Kriter
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-800">
                        {sumPoints} Puan
                      </span>
                    </div>
                  </div>
                </div>

                {/* Compact Criterion Point Preview List */}
                <div className="border-t border-slate-100 pt-3 space-y-1.5">
                  {rubric.criteria.map((c, idx) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between text-xs text-slate-600"
                    >
                      <span className="truncate pr-2">
                        {idx + 1}. {c.title}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                        {c.maxPoints} Puan
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => onStartEvaluatingWithRubric(rubric.id)}
                  className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Hızlı Değerlendir</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRubric(rubric)}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Düzenle</span>
                </button>
                {rubrics.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteRubric(rubric.id)}
                    title="Rubriği Sil"
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
