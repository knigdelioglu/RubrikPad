import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Check,
  Scale,
  Edit3,
  Copy,
} from 'lucide-react';
import type { Rubric, RubricCriterion } from '../types.ts';

interface RubricBuilderProps {
  rubrics: Rubric[];
  onSaveRubric: (rubric: Rubric) => void;
  onDeleteRubric: (rubricId: string) => void;
}

const DEFAULT_LEVELS = [
  {
    level: 1,
    label: 'Destek Gerekli',
    points: 1,
    description: 'Temel adımlarda yoğun öğretmen rehberliğine ihtiyaç duyar.',
  },
  {
    level: 2,
    label: 'Gelişmekte',
    points: 2,
    description: 'Beklenen beceriyi kısmen sergiler, küçük hatırlatmalarla ilerler.',
  },
  {
    level: 3,
    label: 'Yetkin',
    points: 3,
    description: 'Hedef kazanımı bağımsız ve doğru biçimde yerine getirir.',
  },
  {
    level: 4,
    label: 'Örnek Düzey',
    points: 4,
    description: 'Beceriyi üst düzeyde, özgün ve arkadaşlarına rehberlik ederek sergiler.',
  },
];

export const RubricBuilder: React.FC<RubricBuilderProps> = ({
  rubrics,
  onSaveRubric,
  onDeleteRubric,
}) => {
  const [selectedRubricId, setSelectedRubricId] = useState<string>(
    () => rubrics[0]?.id || ''
  );
  const [isEditing, setIsEditing] = useState(false);

  const activeRubric = useMemo(
    () => rubrics.find((r) => r.id === selectedRubricId) || rubrics[0],
    [rubrics, selectedRubricId]
  );

  // Draft state for editing or creating a rubric
  const [draftRubric, setDraftRubric] = useState<Rubric | null>(null);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleStartEdit = (rubric: Rubric) => {
    setDraftRubric(JSON.parse(JSON.stringify(rubric)));
    setFormError(null);
    setIsEditing(true);
  };

  const handleStartCreateNew = () => {
    const newRubric: Rubric = {
      id: `rub-${Date.now()}`,
      title: 'Yeni Değerlendirme Rubriği',
      subject: 'Genel Değerlendirme',
      description: 'Öğrencilerin süreç ve ürün performanslarını ölçüt temelli değerlendirir.',
      maxLevelPoints: 4,
      createdAt: new Date().toISOString().slice(0, 10),
      criteria: [
        {
          id: `crit-${Date.now()}-1`,
          title: 'Hazırlık ve Planlama',
          category: 'Süreç',
          weight: 50,
          maxPoints: 50,
          levels: JSON.parse(JSON.stringify(DEFAULT_LEVELS)),
        },
        {
          id: `crit-${Date.now()}-2`,
          title: 'Uygulama ve Sonuç Üretimi',
          category: 'Uygulama',
          weight: 50,
          maxPoints: 50,
          levels: JSON.parse(JSON.stringify(DEFAULT_LEVELS)),
        },
      ],
    };
    setDraftRubric(newRubric);
    setFormError(null);
    setIsEditing(true);
  };

  const handleDuplicateRubric = (rubric: Rubric) => {
    const cloned: Rubric = {
      ...JSON.parse(JSON.stringify(rubric)),
      id: `rub-${Date.now()}`,
      title: `${rubric.title} (Kopya)`,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    onSaveRubric(cloned);
    setSelectedRubricId(cloned.id);
    setSaveNotification('Rubrik kopyalandı.');
    setTimeout(() => setSaveNotification(null), 3000);
  };

  const handleAddCriterionToDraft = () => {
    if (!draftRubric) return;
    const newCrit: RubricCriterion = {
      id: `crit-${Date.now()}`,
      title: `Yeni Ölçüt ${draftRubric.criteria.length + 1}`,
      category: 'Değerlendirme Boyutu',
      weight: 20,
      maxPoints: 20,
      levels: JSON.parse(JSON.stringify(DEFAULT_LEVELS)),
    };
    setDraftRubric({
      ...draftRubric,
      criteria: [...draftRubric.criteria, newCrit],
    });
  };

  const handleBalanceWeights = () => {
    if (!draftRubric || draftRubric.criteria.length === 0) return;
    const count = draftRubric.criteria.length;
    const baseWeight = Math.floor(100 / count);
    const remainder = 100 - baseWeight * count;
    const balanced = draftRubric.criteria.map((c, idx) => {
      const val = idx === 0 ? baseWeight + remainder : baseWeight;
      return {
        ...c,
        weight: val,
        maxPoints: val,
      };
    });
    setDraftRubric({
      ...draftRubric,
      criteria: balanced,
    });
  };

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftRubric) return;
    if (!draftRubric.title.trim()) {
      setFormError('Lütfen rubrik başlığını girin.');
      return;
    }
    if (draftRubric.criteria.length === 0) {
      setFormError('En az bir değerlendirme ölçütü eklemelisiniz.');
      return;
    }
    onSaveRubric(draftRubric);
    setSelectedRubricId(draftRubric.id);
    setIsEditing(false);
    setDraftRubric(null);
    setSaveNotification('Rubrik başarıyla kaydedildi.');
    setTimeout(() => setSaveNotification(null), 3000);
  };

  const totalDraftWeight = draftRubric
    ? draftRubric.criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0)
    : 100;

  const totalDraftPoints = draftRubric
    ? draftRubric.criteria.reduce(
        (sum, c) => sum + Number(c.maxPoints ?? c.weight ?? 0),
        0
      )
    : 100;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Dereceli Puanlama Anahtarı (Rubrik) Tasarımcısı
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Değerlendirme ölçütlerini, kriter puanlarını, ağırlık yüzdelerini ve 4 kademeli performans düzeylerini tanımlayın.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStartCreateNew}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Yeni Rubrik Oluştur
          </button>
        </div>
      </section>

      {saveNotification && (
        <div
          role="status"
          className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold"
        >
          {saveNotification}
        </div>
      )}

      {isEditing && draftRubric ? (
        /* RUBRIC EDITOR FORM */
        <form
          onSubmit={handleSaveDraft}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">
              Rubrik Düzenleyici: {draftRubric.title}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setDraftRubric(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                İptal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Rubriği Kaydet
              </button>
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label
                htmlFor="rubric-title-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Rubrik Başlığı
              </label>
              <input
                id="rubric-title-input"
                type="text"
                value={draftRubric.title}
                onChange={(e) =>
                  setDraftRubric({ ...draftRubric, title: e.target.value })
                }
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="rubric-subject-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Ders / Alan
              </label>
              <input
                id="rubric-subject-input"
                type="text"
                value={draftRubric.subject}
                onChange={(e) =>
                  setDraftRubric({ ...draftRubric, subject: e.target.value })
                }
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="md:col-span-3">
              <label
                htmlFor="rubric-desc-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Açıklama / Kullanım Amacı
              </label>
              <input
                id="rubric-desc-input"
                type="text"
                value={draftRubric.description}
                onChange={(e) =>
                  setDraftRubric({ ...draftRubric, description: e.target.value })
                }
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Criteria Header & Points/Weight Balancer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                Değerlendirme Ölçütleri ({draftRubric.criteria.length})
              </h3>
              <span
                className={`text-xs font-mono-num font-bold ${
                  totalDraftPoints === 100 ? 'text-emerald-700' : 'text-sky-700'
                }`}
              >
                Toplam Puan: {totalDraftPoints} Puan
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span
                className={`text-xs font-mono-num font-semibold ${
                  totalDraftWeight === 100 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                Toplam Ağırlık: %{totalDraftWeight}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBalanceWeights}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5" />
                Puan ve Ağırlıkları Eşitle (100)
              </button>
              <button
                type="button"
                onClick={handleAddCriterionToDraft}
                className="px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Ölçüt Ekle
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {draftRubric.criteria.map((crit, cIdx) => (
              <div
                key={crit.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-4">
                    <label
                      htmlFor={`crit-title-${cIdx}`}
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      {cIdx + 1}. Ölçüt Başlığı
                    </label>
                    <input
                      id={`crit-title-${cIdx}`}
                      type="text"
                      value={crit.title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftRubric({
                          ...draftRubric,
                          criteria: draftRubric.criteria.map((item, i) =>
                            i === cIdx ? { ...item, title: val } : item
                          ),
                        });
                      }}
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor={`crit-cat-${cIdx}`}
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Alt Boyut / Kategori
                    </label>
                    <input
                      id={`crit-cat-${cIdx}`}
                      type="text"
                      value={crit.category}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftRubric({
                          ...draftRubric,
                          criteria: draftRubric.criteria.map((item, i) =>
                            i === cIdx ? { ...item, category: val } : item
                          ),
                        });
                      }}
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor={`crit-points-${cIdx}`}
                      className="block text-xs font-semibold text-sky-800 mb-1"
                    >
                      Kriter Puanı
                    </label>
                    <input
                      id={`crit-points-${cIdx}`}
                      type="number"
                      min={1}
                      max={100}
                      value={crit.maxPoints ?? crit.weight}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setDraftRubric({
                          ...draftRubric,
                          criteria: draftRubric.criteria.map((item, i) =>
                            i === cIdx
                              ? { ...item, maxPoints: val, weight: val }
                              : item
                          ),
                        });
                      }}
                      className="w-full px-3 py-1.5 text-sm font-mono-num font-bold text-sky-900 bg-sky-50/50 border border-sky-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor={`crit-weight-${cIdx}`}
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Ağırlık (%)
                    </label>
                    <input
                      id={`crit-weight-${cIdx}`}
                      type="number"
                      min={1}
                      max={100}
                      value={crit.weight}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setDraftRubric({
                          ...draftRubric,
                          criteria: draftRubric.criteria.map((item, i) =>
                            i === cIdx ? { ...item, weight: val } : item
                          ),
                        });
                      }}
                      className="w-full px-3 py-1.5 text-sm font-mono-num bg-white border border-slate-300 rounded-md"
                    />
                  </div>

                  <div className="sm:col-span-1 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftRubric({
                          ...draftRubric,
                          criteria: draftRubric.criteria.filter((_, i) => i !== cIdx),
                        })
                      }
                      disabled={draftRubric.criteria.length <= 1}
                      aria-label={`${crit.title} ölçütünü sil`}
                      className="p-2 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 4 Levels Editor with Editable Level Points */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2">
                  {crit.levels.map((lvl, lIdx) => (
                    <div
                      key={lvl.level}
                      className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1 text-xs font-bold text-slate-800">
                        <span className="truncate">{lvl.label}</span>
                        <label className="flex items-center gap-1 shrink-0 font-mono-num text-sky-700">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            aria-label={`${crit.title} - ${lvl.label} puanı`}
                            value={lvl.points}
                            onChange={(e) => {
                              const pts = Number(e.target.value);
                              setDraftRubric({
                                ...draftRubric,
                                criteria: draftRubric.criteria.map((item, i) =>
                                  i === cIdx
                                    ? {
                                        ...item,
                                        levels: item.levels.map((l, j) =>
                                          j === lIdx ? { ...l, points: pts } : l
                                        ),
                                      }
                                    : item
                                ),
                              });
                            }}
                            className="w-12 px-1.5 py-0.5 text-xs font-mono-num font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-sky-600"
                          />
                          <span>Puan</span>
                        </label>
                      </div>
                      <textarea
                        rows={2}
                        aria-label={`${crit.title} - ${lvl.label} açıklaması`}
                        value={lvl.description}
                        onChange={(e) => {
                          const desc = e.target.value;
                          setDraftRubric({
                            ...draftRubric,
                            criteria: draftRubric.criteria.map((item, i) =>
                              i === cIdx
                                ? {
                                    ...item,
                                    levels: item.levels.map((l, j) =>
                                      j === lIdx ? { ...l, description: desc } : l
                                    ),
                                  }
                                : item
                            ),
                          });
                        }}
                        className="w-full text-xs text-slate-700 border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-sky-600"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </form>
      ) : (
        /* RUBRIC VIEWER & LIST */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Rubric List */}
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              Kayıtlı Rubrikler ({rubrics.length})
            </h2>
            <div className="space-y-2">
              {rubrics.map((rub) => {
                const isSelected = activeRubric?.id === rub.id;
                const totalRubricPts = rub.criteria.reduce(
                  (s, c) => s + Number(c.maxPoints ?? c.weight ?? 0),
                  0
                );
                return (
                  <button
                    key={rub.id}
                    type="button"
                    onClick={() => setSelectedRubricId(rub.id)}
                    className={`w-full text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50/90 border-sky-600 text-slate-900'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-xs text-slate-500 mb-0.5 font-mono-num">
                      {rub.subject} · {rub.criteria.length} Ölçüt · {totalRubricPts} Puan
                    </div>
                    <div className="text-sm font-bold text-slate-900">{rub.title}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Right: Active Rubric Matrix Table */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            {activeRubric ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-slate-200">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">
                      {activeRubric.subject} · Oluşturulma: <span className="font-mono-num">{activeRubric.createdAt}</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {activeRubric.title}
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                      {activeRubric.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(activeRubric)}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Rubriği Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateRubric(activeRubric)}
                      className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Çoğalt
                    </button>
                    {rubrics.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteRubric(activeRubric.id)}
                        aria-label={`${activeRubric.title} rubriğini sil`}
                        className="p-2 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Rubric Matrix Table */}
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[680px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
                        <th className="py-3 px-4 w-52">Ölçüt · Puan & Ağırlık</th>
                        <th className="py-3 px-3">1. Düzey — Destek Gerekli</th>
                        <th className="py-3 px-3">2. Düzey — Gelişmekte</th>
                        <th className="py-3 px-3">3. Düzey — Yetkin</th>
                        <th className="py-3 px-3">4. Düzey — Örnek Düzey</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {activeRubric.criteria.map((crit, idx) => (
                        <tr key={crit.id} className="align-top">
                          <td className="py-3 px-4 bg-slate-50/40">
                            <span className="text-[11px] text-slate-500 block">
                              0{idx + 1}. {crit.category}
                            </span>
                            <span className="font-bold text-slate-900 text-sm block mt-0.5">
                              {crit.title}
                            </span>
                            <span className="font-mono-num text-xs font-bold text-sky-700 mt-1 block">
                              {crit.maxPoints ?? crit.weight} Puan · %{crit.weight}
                            </span>
                          </td>
                          {crit.levels.map((lvl) => (
                            <td key={lvl.level} className="py-3 px-3 text-slate-600 leading-relaxed">
                              <div className="font-mono-num text-[11px] font-bold text-slate-800 mb-0.5">
                                {lvl.points} Puan
                              </div>
                              <div>{lvl.description}</div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
