import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Check,
  Scale,
  Edit3,
  Copy,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import type { Rubric, RubricCriterion, EvaluationSession } from '../types.ts';
import { validateRubric, checkRubricDeletionImpact } from '../utils/rubricLogic.ts';

interface RubricBuilderProps {
  rubrics: Rubric[];
  sessions?: EvaluationSession[];
  onSaveRubric: (rubric: Rubric) => void;
  onDeleteRubric: (rubricId: string) => void;
}

const DEFAULT_LEVELS = [
  {
    level: 0,
    label: 'Gözlenmedi (0)',
    points: 0,
    description: 'Beklenen ölçüt çalışması hiç sergilenmemiştir.',
  },
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
  sessions = [],
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

  const [draftRubric, setDraftRubric] = useState<Rubric | null>(null);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [confirmDeleteRubricId, setConfirmDeleteRubricId] = useState<string | null>(null);

  const handleStartEdit = (rubric: Rubric) => {
    setDraftRubric(JSON.parse(JSON.stringify(rubric)));
    setValidationErrors([]);
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
      version: 1,
      criteria: [
        {
          id: `crit-${Date.now()}-1`,
          title: 'Hazırlık ve Planlama',
          category: 'Süreç',
          weight: 50,
          maxPoints: 50,
          required: true,
          levels: JSON.parse(JSON.stringify(DEFAULT_LEVELS)),
        },
        {
          id: `crit-${Date.now()}-2`,
          title: 'Uygulama ve Sonuç Üretimi',
          category: 'Uygulama',
          weight: 50,
          maxPoints: 50,
          required: true,
          levels: JSON.parse(JSON.stringify(DEFAULT_LEVELS)),
        },
      ],
    };
    setDraftRubric(newRubric);
    setValidationErrors([]);
    setIsEditing(true);
  };

  const handleDuplicateRubric = (rubric: Rubric) => {
    const cloned: Rubric = {
      ...JSON.parse(JSON.stringify(rubric)),
      id: `rub-${Date.now()}`,
      title: `${rubric.title} (Kopya)`,
      createdAt: new Date().toISOString().slice(0, 10),
      version: 1,
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
      required: true,
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
    const nextDraft = {
      ...draftRubric,
      criteria: balanced,
    };
    setDraftRubric(nextDraft);
    const v = validateRubric(nextDraft);
    setValidationErrors(v.errors);
  };

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftRubric) return;

    // P1 #1: Strict rubric validation (Total Points = 100, Total Weight = 100, non-empty titles & sorted levels)
    const validation = validateRubric(draftRubric);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }

    const nextVersion = (draftRubric.version || 1) + 1;
    onSaveRubric({
      ...draftRubric,
      version: nextVersion,
    });
    setSelectedRubricId(draftRubric.id);
    setIsEditing(false);
    setDraftRubric(null);
    setValidationErrors([]);
    setSaveNotification(
      'Rubrik doğrulandı ve kaydedildi. Geçmiş oturumların notları dondurulmuş rubrik kopyasıyla korundu.'
    );
    setTimeout(() => setSaveNotification(null), 4000);
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

  const deletionImpact = useMemo(() => {
    if (!activeRubric) return null;
    return checkRubricDeletionImpact(activeRubric.id, rubrics, sessions);
  }, [activeRubric, rubrics, sessions]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Rubrik ve Ölçüt Kütüphanesi
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            100 puan doğrulamalı ölçütler, 0–4 düzey tanımları ve oturum bazında dondurulmuş şablon yönetimi.
          </p>
        </div>

        {!isEditing && (
          <button
            type="button"
            onClick={handleStartCreateNew}
            className="px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Yeni Rubrik Oluştur
          </button>
        )}
      </div>

      {saveNotification && (
        <div
          role="status"
          aria-live="polite"
          className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2"
        >
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          {saveNotification}
        </div>
      )}

      {/* EDITOR VIEW */}
      {isEditing && draftRubric ? (
        <form onSubmit={handleSaveDraft} className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Rubrik Şablonu Düzenleyici
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
                  Bu şablonda yapılan değişiklikler geçmiş değerlendirme oturumlarının notlarını etkilemez (oturum anlık görüntüsü korunur).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setDraftRubric(null);
                    setValidationErrors([]);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Doğrula ve Kaydet
                </button>
              </div>
            </div>

            {validationErrors.length > 0 && (
              <div
                role="alert"
                className="bg-red-50 border border-red-300 text-red-900 px-4 py-3 rounded-xl text-xs space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold flex items-center gap-1.5 text-red-800">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Rubrik Doğrulama Hataları ({validationErrors.length}): Kaydetmeden önce düzeltilmelidir
                  </span>
                  {(totalDraftPoints !== 100 || totalDraftWeight !== 100) && (
                    <button
                      type="button"
                      onClick={handleBalanceWeights}
                      className="px-2.5 py-1 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-md cursor-pointer"
                    >
                      Puan ve Ağırlıkları 100&apos;e Eşitle
                    </button>
                  )}
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-red-800">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="rubric-title-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Rubrik Başlığı
                </label>
                <input
                  id="rubric-title-input"
                  type="text"
                  required
                  value={draftRubric.title}
                  onChange={(e) =>
                    setDraftRubric({ ...draftRubric, title: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
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
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="rubric-desc-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Rubrik Açıklaması ve Kullanım Amacı
              </label>
              <input
                id="rubric-desc-input"
                type="text"
                value={draftRubric.description}
                onChange={(e) =>
                  setDraftRubric({ ...draftRubric, description: e.target.value })
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            {/* Points & Weight Summary Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-semibold text-slate-700">
                    Toplam Kriter Puanı:
                  </span>
                  <span
                    className={`font-mono-num text-sm font-bold px-2 py-0.5 rounded ${
                      totalDraftPoints === 100
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {totalDraftPoints} / 100 Puan
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Toplam Ağırlık:
                  </span>
                  <span
                    className={`font-mono-num text-sm font-bold px-2 py-0.5 rounded ${
                      totalDraftWeight === 100
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    %{totalDraftWeight}
                  </span>
                </div>
                {(totalDraftPoints !== 100 || totalDraftWeight !== 100) && (
                  <span className="text-xs font-medium text-amber-800">
                    (Kaydetmek için toplam puan ve ağırlık tam 100 olmalıdır)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBalanceWeights}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Puanları Eşitle (100 Puan)
                </button>
                <button
                  type="button"
                  onClick={handleAddCriterionToDraft}
                  className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ölçüt Ekle ({draftRubric.criteria.length})
                </button>
              </div>
            </div>
          </div>

          {/* Criteria Editor Cards */}
          <div className="space-y-4">
            {draftRubric.criteria.map((crit, cIdx) => (
              <div
                key={crit.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="font-mono-num text-xs font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-800">
                      0{cIdx + 1}
                    </span>
                    <input
                      type="text"
                      aria-label={`${cIdx + 1}. Ölçüt Başlığı`}
                      value={crit.title}
                      onChange={(e) => {
                        const updated = draftRubric.criteria.map((item, i) =>
                          i === cIdx ? { ...item, title: e.target.value } : item
                        );
                        setDraftRubric({ ...draftRubric, criteria: updated });
                      }}
                      placeholder="Ölçüt Başlığı"
                      className="flex-1 px-3 py-1.5 text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                    <input
                      type="text"
                      aria-label={`${cIdx + 1}. Ölçüt Kategorisi`}
                      value={crit.category}
                      onChange={(e) => {
                        const updated = draftRubric.criteria.map((item, i) =>
                          i === cIdx ? { ...item, category: e.target.value } : item
                        );
                        setDraftRubric({ ...draftRubric, criteria: updated });
                      }}
                      placeholder="Kategori"
                      className="w-36 px-3 py-1.5 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label
                      htmlFor={`crit-points-${crit.id}`}
                      className="text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                    >
                      Kriter Puanı:
                      <input
                        id={`crit-points-${crit.id}`}
                        type="number"
                        min={1}
                        max={100}
                        value={crit.maxPoints ?? crit.weight}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value));
                          const updated = draftRubric.criteria.map((item, i) =>
                            i === cIdx
                              ? { ...item, maxPoints: val, weight: val }
                              : item
                          );
                          setDraftRubric({ ...draftRubric, criteria: updated });
                        }}
                        className="w-14 px-2 py-0.5 text-sm font-mono-num font-bold text-teal-950 bg-white border border-teal-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-600 text-right"
                      />
                      <span>Puan</span>
                    </label>

                    <label
                      htmlFor={`crit-weight-${crit.id}`}
                      className="text-xs font-semibold text-slate-600 flex items-center gap-1"
                    >
                      Ağırlık (%):
                      <input
                        id={`crit-weight-${crit.id}`}
                        type="number"
                        min={1}
                        max={100}
                        value={crit.weight}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value));
                          const updated = draftRubric.criteria.map((item, i) =>
                            i === cIdx
                              ? { ...item, weight: val, maxPoints: val }
                              : item
                          );
                          setDraftRubric({ ...draftRubric, criteria: updated });
                        }}
                        className="w-14 px-2 py-1 text-sm font-mono-num font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 text-right"
                      />
                    </label>

                    {draftRubric.criteria.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = draftRubric.criteria.filter(
                            (_, i) => i !== cIdx
                          );
                          setDraftRubric({ ...draftRubric, criteria: updated });
                        }}
                        aria-label={`${crit.title} ölçütünü sil`}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Levels inside Criterion */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {crit.levels.map((lvl, lIdx) => (
                    <div
                      key={lvl.level}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-800">
                        <span className="truncate">
                          {lvl.level}. Düzey ({lvl.label})
                        </span>
                        <label
                          htmlFor={`lvl-pts-${crit.id}-${lvl.level}`}
                          className="flex items-center gap-1 text-[11px] font-mono-num text-teal-800 shrink-0"
                        >
                          <input
                            id={`lvl-pts-${crit.id}-${lvl.level}`}
                            type="number"
                            min={0}
                            max={100}
                            aria-label={`${crit.title} - ${lvl.label} puanı`}
                            value={lvl.points}
                            onChange={(e) => {
                              const pts = Math.max(0, Number(e.target.value));
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
                            className="w-12 px-1.5 py-0.5 text-xs font-mono-num font-bold text-teal-900 bg-teal-50 border border-teal-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-teal-600"
                          />
                          <span>P</span>
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
                        className="w-full text-xs text-slate-700 border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-teal-600"
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
                const vCheck = validateRubric(rub);
                return (
                  <button
                    key={rub.id}
                    type="button"
                    onClick={() => {
                      setSelectedRubricId(rub.id);
                      setConfirmDeleteRubricId(null);
                    }}
                    className={`w-full text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50/90 border-teal-700 text-slate-900'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-0.5 font-mono-num">
                      <span>
                        {rub.subject} · {rub.criteria.length} Ölçüt · {totalRubricPts}P
                      </span>
                      {vCheck.isValid ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          100P Doğrulandı
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                          Düzenlenmeli
                        </span>
                      )}
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
                    <div className="text-xs text-slate-500 mb-1 flex flex-wrap items-center gap-2">
                      <span>
                        {activeRubric.subject} · Oluşturulma:{' '}
                        <span className="font-mono-num">{activeRubric.createdAt}</span>
                      </span>
                      {deletionImpact && deletionImpact.usedInSessionsCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-semibold">
                          <ShieldCheck className="w-3 h-3" />
                          {deletionImpact.usedInSessionsCount} oturumda dondurulmuş kopya ile kullanılıyor
                        </span>
                      )}
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
                        onClick={() => setConfirmDeleteRubricId(activeRubric.id)}
                        aria-label={`${activeRubric.title} rubriğini sil`}
                        className="p-2 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {confirmDeleteRubricId === activeRubric.id && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-amber-950 space-y-0.5">
                      <div className="font-bold">
                        &ldquo;{activeRubric.title}&rdquo; şablonunu silmek istediğinize emin misiniz?
                      </div>
                      <div>
                        {deletionImpact && deletionImpact.usedInSessionsCount > 0
                          ? `Bu rubrik ${deletionImpact.usedInSessionsCount} oturumda kullanılmıştır. Silinse dahi geçmiş oturumların dondurulmuş rubrik anlık görüntüsü (rubricSnapshot) korunur ve geçmiş notlar etkilenmez.`
                          : 'Bu rubrik henüz hiçbir oturumda kullanılmamıştır.'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteRubricId(null)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                      >
                        Vazgeç
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteRubric(activeRubric.id);
                          setConfirmDeleteRubricId(null);
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                      >
                        Şablonu Sil (Geçmişi Koru)
                      </button>
                    </div>
                  </div>
                )}

                {/* Rubric Matrix Table */}
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[720px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
                        <th className="py-3 px-4 w-48">Ölçüt · Puan & Ağırlık</th>
                        {(activeRubric.criteria[0]?.levels || []).map((lvl) => (
                          <th key={lvl.level} className="py-3 px-3">
                            {lvl.level}. Düzey — {lvl.label}
                          </th>
                        ))}
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
                            <span className="font-mono-num text-xs font-bold text-teal-800 mt-1 block">
                              {crit.maxPoints ?? crit.weight} Puan · %{crit.weight}
                            </span>
                          </td>
                          {crit.levels.map((lvl) => (
                            <td
                              key={lvl.level}
                              className="py-3 px-3 text-slate-600 leading-relaxed"
                            >
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
