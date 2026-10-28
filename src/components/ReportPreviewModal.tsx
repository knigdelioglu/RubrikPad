import React, { useState, useEffect } from 'react';
import {
  FileDown,
  Printer,
  X,
  Calendar,
  BookOpen,
  Eye,
  SlidersHorizontal,
  Check,
} from 'lucide-react';
import type {
  Classroom,
  Student,
  Rubric,
  EvaluationSession,
  InstitutionSettings,
} from '../types.ts';
import {
  getCriterionEarnedPoints,
  getCriterionSection,
  getStudentEvaluationBreakdown,
  getStudentProgressHistory,
  isScoreAssigned,
  isDualBookSpeakingRubric,
} from '../utils/rubricLogic.ts';
import {
  resolvePdfColumnOptions,
  type PdfColumnOptions,
  type PdfColumnPreset,
  type DualReportMode,
} from '../utils/pdfGenerator.ts';
import { loadInstitutionSettings } from '../utils/storageLayer.ts';

type StudentProgressItem = ReturnType<typeof getStudentProgressHistory>[number];

export type ReportPreviewMode =
  | 'student_portfolio'
  | 'session_table'
  | 'classroom_overview';

interface ReportPreviewModalProps {
  isOpen: boolean;
  downloadError?: string | null;
  isDownloading?: boolean;
  previewMode: ReportPreviewMode;
  onChangePreviewMode: (mode: ReportPreviewMode) => void;
  onClose: () => void;
  onConfirmDownloadPdf: (
    mode: ReportPreviewMode,
    columnOptions: PdfColumnOptions
  ) => void;
  activeClassroom?: Classroom;
  activeStudent?: Student;
  studentHistory: StudentProgressItem[];
  studentSummaryMetrics: {
    avgScore: number;
    delta: number;
    latestScore: number;
    count: number;
  };
  activeReportSession?: EvaluationSession;
  activeReportRubric?: Rubric | null;
  classStudents: Student[];
  rubrics: Rubric[];
  reportDateFormatted: string;
  selectedAcademicTermLabel?: string;
  institutionSettings?: InstitutionSettings;
  initialDualReportMode?: DualReportMode;
  onChangeDualReportMode?: (mode: DualReportMode) => void;
}

const PRESET_DEFINITIONS: {
  id: PdfColumnPreset;
  label: string;
  description: string;
}[] = [
  {
    id: 'names_only',
    label: 'Sadece İsimler',
    description: 'Puan ve notları gizler, yalnızca isim ve başlıkları gösterir',
  },
  {
    id: 'with_scores',
    label: 'Puanlar ile',
    description: 'İsimler, ölçüt puanları ve kesin puanı içerir',
  },
  {
    id: 'with_notes',
    label: 'Gözlem Notları ile',
    description: 'Puanların yanı sıra öğretmen gözlem ve açıklama notlarını ekler',
  },
];

export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  isOpen,
  downloadError,
  isDownloading,
  previewMode,
  onChangePreviewMode,
  onClose,
  onConfirmDownloadPdf,
  activeClassroom,
  activeStudent,
  studentHistory,
  studentSummaryMetrics,
  activeReportSession,
  activeReportRubric,
  classStudents,
  rubrics,
  reportDateFormatted,
  selectedAcademicTermLabel = 'Tüm Eğitim Dönemleri',
  institutionSettings,
  initialDualReportMode = 'both',
  onChangeDualReportMode,
}) => {
  const [columnOptions, setColumnOptions] = useState<PdfColumnOptions>({
    preset: 'with_scores',
    showCriterionScores: true,
    showFinalScoreAndLevel: true,
    showObservationNotes: false,
    showSignatures: true,
    dualReportMode: initialDualReportMode,
  });

  useEffect(() => {
    setColumnOptions((prev) => ({
      ...prev,
      dualReportMode: initialDualReportMode,
    }));
  }, [initialDualReportMode]);

  useEffect(() => {
    if (isOpen) setColumnOptions((prev) => ({ ...prev, preset: 'with_scores', showCriterionScores: true, showFinalScoreAndLevel: true, showObservationNotes: false }));
  }, [isOpen]);

  if (!isOpen) return null;

  const effectiveInstitution = institutionSettings || loadInstitutionSettings();
  const colOpts = resolvePdfColumnOptions({
    ...columnOptions,
    schoolName: effectiveInstitution.schoolName,
    teacherName: effectiveInstitution.teacherName,
    principalName: effectiveInstitution.principalName,
  });

  const handleSelectPreset = (preset: PdfColumnPreset) => {
    const resolved = resolvePdfColumnOptions({
      preset,
      showSignatures: colOpts.showSignatures,
    });
    setColumnOptions(resolved);
  };

  const handleToggleColumn = (
    key:
      | 'showCriterionScores'
      | 'showFinalScoreAndLevel'
      | 'showObservationNotes'
      | 'showSignatures'
  ) => {
    const next = {
      ...colOpts,
      [key]: !colOpts[key],
    };
    let nextPreset: PdfColumnPreset = next.preset;
    if (
      !next.showCriterionScores &&
      !next.showFinalScoreAndLevel &&
      !next.showObservationNotes
    ) {
      nextPreset = 'names_only';
    } else if (next.showObservationNotes) {
      nextPreset = 'with_notes';
    } else {
      nextPreset = 'with_scores';
    }
    setColumnOptions({
      ...next,
      preset: nextPreset,
    });
  };

  const canPreviewStudent = Boolean(activeStudent);
  const canPreviewSession = Boolean(activeReportSession && activeReportRubric);

  const effectiveMode: ReportPreviewMode =
    previewMode === 'student_portfolio' && !canPreviewStudent
      ? canPreviewSession
        ? 'session_table'
        : 'classroom_overview'
      : previewMode === 'session_table' && !canPreviewSession
      ? canPreviewStudent
        ? 'student_portfolio'
        : 'classroom_overview'
      : previewMode;

  const activePresetMeta =
    PRESET_DEFINITIONS.find((p) => p.id === colOpts.preset) ||
    PRESET_DEFINITIONS[2];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rapor Önizleme"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
    >
      <div className="bg-slate-100 border border-slate-300 rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="no-print bg-white border-b border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Rapor Önizleme
              </h2>
              <p className="text-xs text-slate-600">
                PDF dosyasını indirmeden önce sütun seçimlerini ve A4 çıktı
                düzenini özelleştirin
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-slate-100 border border-slate-200 p-0.5 gap-1">
              {canPreviewSession && (
                <button
                  type="button"
                  onClick={() => onChangePreviewMode('session_table')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                    effectiveMode === 'session_table'
                      ? 'bg-blue-900 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Oturum Çizelgesi
                </button>
              )}
              <button
                type="button"
                onClick={() => onChangePreviewMode('classroom_overview')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                  effectiveMode === 'classroom_overview'
                    ? 'bg-blue-900 text-white'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Sınıf &amp; Rubrik Özeti
              </button>
              {canPreviewStudent && (
                <button
                  type="button"
                  onClick={() => onChangePreviewMode('student_portfolio')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                    effectiveMode === 'student_portfolio'
                      ? 'bg-blue-900 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Veli &amp; Öğrenci Raporu
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Önizlemeyi Kapat"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Column & Content Settings Panel (Sadece İsimler / Puanlar ile / Gözlem Notları ile) */}
        <div
          aria-label="Sütun ve İçerik Ayarları Paneli"
          className="no-print bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mr-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-900" />
              <span>Sütun Seçimi:</span>
            </div>

            <div
              role="group"
              aria-label="Hızlı Sütun Şablonları"
              className="inline-flex flex-wrap rounded-lg bg-white border border-slate-300 p-0.5 gap-1 shadow-2xs"
            >
              {PRESET_DEFINITIONS.map((preset) => {
                const isActive = colOpts.preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    aria-pressed={isActive}
                    title={preset.description}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-blue-900 text-white shadow-2xs'
                        : 'bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={colOpts.showCriterionScores}
                onChange={() => handleToggleColumn('showCriterionScores')}
                className="rounded border-slate-300 text-blue-900 focus:ring-blue-900 cursor-pointer"
              />
              <span>Ölçüt Puanları</span>
            </label>

            <label className="inline-flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={colOpts.showFinalScoreAndLevel}
                onChange={() => handleToggleColumn('showFinalScoreAndLevel')}
                className="rounded border-slate-300 text-blue-900 focus:ring-blue-900 cursor-pointer"
              />
              <span>Kesin Puan</span>
            </label>

            <label className="inline-flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={colOpts.showObservationNotes}
                onChange={() => handleToggleColumn('showObservationNotes')}
                className="rounded border-slate-300 text-blue-900 focus:ring-blue-900 cursor-pointer"
              />
              <span>Gözlem Notları</span>
            </label>

            <label className="inline-flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={colOpts.showSignatures}
                onChange={() => handleToggleColumn('showSignatures')}
                className="rounded border-slate-300 text-blue-900 focus:ring-blue-900 cursor-pointer"
              />
              <span>İmza Alanları</span>
            </label>
          </div>
        </div>

        {/* Scrollable A4 Report Preview Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-4xl mx-auto pdf-report-sheet p-6 sm:p-8 space-y-6 bg-white">
            {/* MODE 1: STUDENT PORTFOLIO */}
            {effectiveMode === 'student_portfolio' && activeStudent && (
              <>
                <div className="pdf-report-banner rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    {colOpts.schoolName && (
                      <div
                        data-testid="preview-school-name-header"
                        className="text-xs font-bold uppercase tracking-wider text-amber-200"
                      >
                        {colOpts.schoolName}
                      </div>
                    )}
                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                      Öğrenci Gelişim ve Performans Raporu ·{' '}
                      {activePresetMeta.label}
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white">
                      {activeStudent.fullName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200 pt-0.5">
                      <span className="font-mono-num font-bold bg-white/15 px-2 py-0.5 rounded">
                        Okul No: #{activeStudent.studentNumber}
                      </span>
                      <span>·</span>
                      <span>
                        {activeClassroom?.name} ({activeClassroom?.gradeLevel})
                      </span>
                      <span>·</span>
                      <span>{activeClassroom?.subject}</span>
                      <span>·</span>
                      <span>Dönem: {selectedAcademicTermLabel}</span>
                      <span>·</span>
                      <span className="font-mono-num">
                        Tarih: {reportDateFormatted}
                      </span>
                    </div>
                  </div>
                </div>

                {colOpts.showFinalScoreAndLevel ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pdf-report-card">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-xs font-medium text-slate-600">
                        Tamamlanan Oturum
                      </div>
                      <div className="font-mono-num text-2xl font-bold text-slate-900 mt-1">
                        {studentSummaryMetrics.count}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-xs font-medium text-slate-600">
                        Dönem Ortalaması
                      </div>
                      <div className="font-mono-num text-2xl font-bold text-slate-900 mt-1">
                        {studentSummaryMetrics.avgScore}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          / 100
                        </span>
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-blue-900 text-white border border-blue-950">
                      <div className="text-xs text-blue-100 font-semibold">
                        Son Kesin Puan
                      </div>
                      <div className="font-mono-num text-2xl font-bold text-white mt-1">
                        {studentSummaryMetrics.latestScore}{' '}
                        <span className="text-xs font-normal text-blue-200">
                          / 100
                        </span>
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-xs font-medium text-slate-600">
                        Gelişim Farkı
                      </div>
                      <div
                        className={`font-mono-num text-2xl font-bold mt-1 ${
                          studentSummaryMetrics.delta >= 0
                            ? 'text-blue-900'
                            : 'text-amber-700'
                        }`}
                      >
                        {studentSummaryMetrics.delta > 0
                          ? `+${studentSummaryMetrics.delta}`
                          : studentSummaryMetrics.delta}{' '}
                        Puan
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs text-slate-700">
                    <span>
                      <strong>Görünüm Modu:</strong> {activePresetMeta.label}{' '}
                      (Puan sütunları gizlendi)
                    </span>
                    <span className="font-mono-num font-bold">
                      Toplam Kayıt: {studentSummaryMetrics.count} Oturum
                    </span>
                  </div>
                )}

                {studentHistory.length > 0 ? (
                  <div className="space-y-4">
                    {studentHistory.map((item) => (
                      <div
                        key={item.sessionId}
                        className="pdf-report-card p-4 rounded-xl border border-slate-200 bg-white space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-slate-200">
                          <div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Calendar className="w-3.5 h-3.5 text-blue-900" />
                              <span className="font-mono-num">{item.date}</span>
                              <span>·</span>
                              <span className="font-semibold text-slate-700">
                                {item.rubricTitle}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                              {item.sessionTitle}
                            </h4>
                          </div>

                          {colOpts.showFinalScoreAndLevel && (
                            <div className="flex flex-wrap items-center gap-2">
                              {item.isDualEvaluation ? (
                                <>
                                  <span className="font-mono-num text-xs font-bold px-2.5 py-1 rounded bg-blue-900 text-white">
                                    Kitap Sunumu: {item.bookPresentationScoreOutOf100 ?? item.scoreOutOf100} / 100
                                  </span>
                                  {item.speakingExamScoreOutOf100 !== null && (
                                    <span className="font-mono-num text-xs font-bold px-2.5 py-1 rounded bg-emerald-800 text-white">
                                      Konuşma Sınavı: {item.speakingExamScoreOutOf100} / 100
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="font-mono-num text-sm font-bold px-3 py-1 rounded bg-blue-900 text-white">
                                    {item.scoreOutOf100} / 100
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {colOpts.showCriterionScores && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {item.criterionBreakdown.map((cb) => (
                              <div
                                key={cb.criterionTitle}
                                className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-slate-800 truncate">
                                    {cb.criterionTitle}
                                  </span>
                                  <span className="font-mono-num text-xs font-bold text-blue-900 shrink-0">
                                    {cb.selectedPoints}/{cb.maxPoints} Puan (%
                                    {cb.scorePercent})
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-900 rounded-full"
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        Math.max(0, cb.scorePercent)
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {colOpts.showObservationNotes && (
                          <div className="text-xs text-slate-800 bg-slate-100 border border-slate-300 rounded-lg p-2.5">
                            <span className="font-bold text-slate-900">
                              Gözlem Notu:{' '}
                            </span>
                            {item.note ||
                              item.groupNote ||
                              'Bu oturum için yazılı gözlem notu girilmemiştir.'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded-xl">
                    Bu öğrenci için henüz tamamlanmış değerlendirme kaydı
                    bulunmuyor.
                  </div>
                )}
              </>
            )}

            {/* MODE 2: SESSION EVALUATION TABLE */}
            {effectiveMode === 'session_table' &&
              activeReportSession &&
              activeReportRubric && (
                <>
                  {isDualBookSpeakingRubric(activeReportRubric) && (
                    <div
                      data-testid="preview-dual-report-switcher"
                      className="no-print bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="text-xs font-bold text-slate-800">
                        Tek Değerlendirme, İki Sonuç — Rapor Görünümü:
                      </div>
                      <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5 gap-1">
                        {(
                          [
                            {
                              id: 'both',
                              label: 'Her İki Rapor (Kitap + Konuşma)',
                            },
                            {
                              id: 'book',
                              label: '1. Kitap Sunumu Raporu (100P)',
                            },
                            {
                              id: 'speaking',
                              label: '2. Konuşma Sınavı Raporu (100P)',
                            },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            data-testid={`preview-dual-mode-${opt.id}`}
                            onClick={() => {
                              setColumnOptions((prev) => ({
                                ...prev,
                                dualReportMode: opt.id,
                              }));
                              onChangeDualReportMode?.(opt.id);
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                              colOpts.dualReportMode === opt.id
                                ? 'bg-blue-900 text-white'
                                : 'text-slate-700 hover:text-slate-900'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(!isDualBookSpeakingRubric(activeReportRubric) ||
                    colOpts.dualReportMode === 'both' ||
                    colOpts.dualReportMode === 'book') && (
                    <div
                      data-testid="preview-book-report-section"
                      className="space-y-4"
                    >
                      <div className="pdf-report-banner rounded-xl p-5 space-y-1">
                        {colOpts.schoolName && (
                          <div
                            data-testid="preview-school-name-header"
                            className="text-xs font-bold uppercase tracking-wider text-amber-200"
                          >
                            {colOpts.schoolName}
                          </div>
                        )}
                        <div className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                          {isDualBookSpeakingRubric(activeReportRubric)
                            ? `1. KİTAP SUNUMU DEĞERLENDİRME ÇİZELGESİ (100 PUAN) · ${activePresetMeta.label}`
                            : `Ölçüt Temelli Performans Değerlendirme Çizelgesi · ${activePresetMeta.label}`}
                        </div>
                        <h3 className="text-xl font-bold text-white">
                          {activeClassroom?.name} — {activeReportSession.title}
                        </h3>
                        <div className="text-xs text-slate-200">
                          Rubrik: <strong>{activeReportRubric.title}</strong> ·
                          Tarih:{' '}
                          <span className="font-mono-num">
                            {activeReportSession.date}
                          </span>
                          {isDualBookSpeakingRubric(activeReportRubric) && (
                            <span className="ml-2 text-blue-200">
                              (Kitap İçeriği: 70 Puan + Ortak Konuşma %30: 30
                              Puan = 100 Puan)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700">
                              <th className="py-2.5 px-3 w-14">No</th>
                              <th className="py-2.5 px-3 w-44">
                                Öğrenci Adı Soyadı
                              </th>
                              {colOpts.showCriterionScores &&
                                activeReportRubric.criteria.map((c) => (
                                  <th
                                    key={c.id}
                                    className="py-2.5 px-2 text-center"
                                  >
                                    <div>{c.title}</div>
                                    <div className="font-mono-num text-[10px] font-normal text-slate-500">
                                      ({c.maxPoints ?? c.weight}P)
                                    </div>
                                  </th>
                                ))}
                              {colOpts.showFinalScoreAndLevel && (
                                <>
                                  {isDualBookSpeakingRubric(
                                    activeReportRubric
                                  ) ? (
                                    <>
                                      <th className="py-2.5 px-2 text-center w-24">
                                        İçerik (70)
                                      </th>
                                      <th className="py-2.5 px-2 text-center w-24">
                                        Sunum (%30)
                                      </th>
                                      <th className="py-2.5 px-2 text-center w-24">
                                        Kitap Sunumu (100)
                                      </th>
                                    </>
                                  ) : (
                                    <th className="py-2.5 px-2 text-center w-24">
                                      Kesin (100)
                                    </th>
                                  )}
                                </>
                              )}
                              {colOpts.showObservationNotes && (
                                <th className="py-2.5 px-3">Gözlem Notları</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-xs">
                            {classStudents.map((stu) => {
                              const ev =
                                activeReportSession.evaluations[stu.id];
                              const { effectiveCalc, activeSource } =
                                getStudentEvaluationBreakdown(
                                  activeReportRubric,
                                  ev
                                );
                              const isDual = isDualBookSpeakingRubric(
                                activeReportRubric
                              );
                              const dual = effectiveCalc.dualResult;
                              const activeScores =
                                activeSource === 'group'
                                  ? ev?.groupCriterionScores || {}
                                  : ev?.criterionScores || {};
                              const activeDirect =
                                activeSource === 'group'
                                  ? ev?.groupDirectScores || {}
                                  : ev?.directCriterionScores || {};
                              const combinedNote = [
                                ev?.note,
                                ev?.groupNote
                                  ? `[Grup]: ${ev.groupNote}`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' | ');

                              return (
                                <tr key={stu.id}>
                                  <td className="py-2 px-3 font-mono-num font-bold text-slate-600">
                                    {stu.studentNumber}
                                  </td>
                                  <td className="py-2 px-3 font-semibold text-slate-900">
                                    {stu.fullName}
                                  </td>
                                  {colOpts.showCriterionScores &&
                                    activeReportRubric.criteria.map((c) => {
                                      const directVal = activeDirect[c.id];
                                      const pts = activeScores[c.id];
                                      const earnedPts =
                                        getCriterionEarnedPoints(
                                          c,
                                          pts,
                                          directVal
                                        );
                                      return (
                                        <td
                                          key={c.id}
                                          className="py-2 px-2 text-center font-mono-num font-semibold text-slate-800"
                                        >
                                          {earnedPts !== null
                                            ? earnedPts
                                            : '—'}
                                        </td>
                                      );
                                    })}
                                  {colOpts.showFinalScoreAndLevel && (
                                    <>
                                      {isDual && dual ? (
                                        <>
                                          <td className="py-2 px-2 text-center font-mono-num font-semibold text-slate-700">
                                            {dual.completedContentCount > 0
                                              ? `${dual.contentScoreOutOf70}/70`
                                              : '—'}
                                          </td>
                                          <td className="py-2 px-2 text-center font-mono-num font-semibold text-slate-700">
                                            {dual.completedSpeakingCount > 0
                                              ? `${dual.speakingContributionOutOf30}/30`
                                              : '—'}
                                          </td>
                                          <td className="py-2 px-2 text-center font-mono-num font-bold text-slate-900">
                                            {dual.isBookPresentationComplete &&
                                            dual.finalBookPresentationScoreOutOf100 !==
                                              null
                                              ? dual.finalBookPresentationScoreOutOf100
                                              : '—'}
                                          </td>
                                        </>
                                      ) : (
                                        <td className="py-2 px-2 text-center font-mono-num font-bold text-slate-900">
                                          {effectiveCalc.isComplete &&
                                          effectiveCalc.finalScoreOutOf100 !==
                                            null
                                            ? effectiveCalc.finalScoreOutOf100
                                            : '—'}
                                        </td>
                                      )}
                                    </>
                                  )}
                                  {colOpts.showObservationNotes && (
                                    <td className="py-2 px-3 text-slate-600">
                                      {combinedNote || '—'}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DEDICATED SPEAKING EXAM REPORT TABLE (100 PUAN) */}
                  {isDualBookSpeakingRubric(activeReportRubric) &&
                    (colOpts.dualReportMode === 'both' ||
                      colOpts.dualReportMode === 'speaking') && (
                      <div
                        data-testid="preview-speaking-report-section"
                        className="space-y-4 pt-2"
                      >
                        <div className="bg-emerald-950 text-white rounded-xl p-5 space-y-1">
                          {colOpts.schoolName && (
                            <div className="text-xs font-bold uppercase tracking-wider text-amber-200">
                              {colOpts.schoolName}
                            </div>
                          )}
                          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                            2. KONUŞMA SINAVI DEĞERLENDİRME ÇİZELGESİ (100
                            PUAN) · {activePresetMeta.label}
                          </div>
                          <h3 className="text-xl font-bold text-white">
                            {activeClassroom?.name} —{' '}
                            {activeReportSession.title} (Konuşma Sınavı Raporu)
                          </h3>
                          <div className="text-xs text-emerald-100">
                            Ortak Konuşma Değerlendirmesi (6 Ölçüt · 100 Puan)
                            · Tarih:{' '}
                            <span className="font-mono-num">
                              {activeReportSession.date}
                            </span>
                          </div>
                        </div>

                        <div className="border border-emerald-200 rounded-xl overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-emerald-50 border-b border-emerald-200 text-xs font-bold text-emerald-950">
                                <th className="py-2.5 px-3 w-14">No</th>
                                <th className="py-2.5 px-3 w-44">
                                  Öğrenci Adı Soyadı
                                </th>
                                {colOpts.showCriterionScores &&
                                  activeReportRubric.criteria
                                    .filter(
                                      (c, idx) =>
                                        getCriterionSection(
                                          c,
                                          idx,
                                          activeReportRubric
                                        ) === 'speaking'
                                    )
                                    .map((c) => (
                                      <th
                                        key={c.id}
                                        className="py-2.5 px-2 text-center"
                                      >
                                        <div>{c.title}</div>
                                        <div className="font-mono-num text-[10px] font-normal text-emerald-800">
                                          ({c.maxPoints ?? c.weight}P)
                                        </div>
                                      </th>
                                    ))}
                                {colOpts.showFinalScoreAndLevel && (
                                  <>
                                    <th className="py-2.5 px-2 text-center w-28">
                                      Konuşma Sınavı (100)
                                    </th>
                                  </>
                                )}
                                {colOpts.showObservationNotes && (
                                  <th className="py-2.5 px-3">
                                    Gözlem Notları
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 text-xs">
                              {classStudents.map((stu) => {
                                const ev =
                                  activeReportSession.evaluations[stu.id];
                                const { effectiveCalc, activeSource } =
                                  getStudentEvaluationBreakdown(
                                    activeReportRubric,
                                    ev
                                  );
                                const dual = effectiveCalc.dualResult;
                                const activeScores =
                                  activeSource === 'group'
                                    ? ev?.groupCriterionScores || {}
                                    : ev?.criterionScores || {};
                                const activeDirect =
                                  activeSource === 'group'
                                    ? ev?.groupDirectScores || {}
                                    : ev?.directCriterionScores || {};
                                const combinedNote = [
                                  ev?.note,
                                  ev?.groupNote
                                    ? `[Grup]: ${ev.groupNote}`
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' | ');
                                const speakingCriteria =
                                  activeReportRubric.criteria.filter(
                                    (c, idx) =>
                                      getCriterionSection(
                                        c,
                                        idx,
                                        activeReportRubric
                                      ) === 'speaking'
                                  );

                                return (
                                  <tr key={stu.id}>
                                    <td className="py-2 px-3 font-mono-num font-bold text-slate-600">
                                      {stu.studentNumber}
                                    </td>
                                    <td className="py-2 px-3 font-semibold text-slate-900">
                                      {stu.fullName}
                                    </td>
                                    {colOpts.showCriterionScores &&
                                      speakingCriteria.map((c) => {
                                        const earnedPts =
                                          getCriterionEarnedPoints(
                                            c,
                                            activeScores[c.id],
                                            activeDirect[c.id]
                                          );
                                        return (
                                          <td
                                            key={c.id}
                                            className="py-2 px-2 text-center font-mono-num font-semibold text-slate-800"
                                          >
                                            {earnedPts !== null
                                              ? earnedPts
                                              : '—'}
                                          </td>
                                        );
                                      })}
                                    {colOpts.showFinalScoreAndLevel && (
                                      <>
                                        <td className="py-2 px-2 text-center font-mono-num font-bold text-emerald-900">
                                          {dual &&
                                          dual.isSpeakingComplete &&
                                          dual.finalSpeakingScoreOutOf100 !==
                                            null
                                            ? dual.finalSpeakingScoreOutOf100
                                            : '—'}
                                        </td>
                                      </>
                                    )}
                                    {colOpts.showObservationNotes && (
                                      <td className="py-2 px-3 text-slate-600">
                                        {combinedNote || '—'}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                </>
              )}

            {/* MODE 3: CLASSROOM & RUBRIC OVERVIEW */}
            {effectiveMode === 'classroom_overview' && (
              <>
                <div className="pdf-report-banner rounded-xl p-5 space-y-1">
                  {colOpts.schoolName && (
                    <div
                      data-testid="preview-school-name-header"
                      className="text-xs font-bold uppercase tracking-wider text-amber-200"
                    >
                      {colOpts.schoolName}
                    </div>
                  )}
                  <div className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                    Resmi PDF Çıktı ve Değerlendirme Raporu ·{' '}
                    {activePresetMeta.label}
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    {activeClassroom
                      ? `${activeClassroom.name} — ${activeClassroom.subject} Değerlendirme Raporu`
                      : '11. Sınıf Türk Dili ve Edebiyatı — Rubrik ve Gelişim Raporu'}
                  </h3>
                  <div className="text-xs text-slate-200">
                    Dönem: <strong>{selectedAcademicTermLabel}</strong> · Tarih:{' '}
                    {reportDateFormatted} · Tanımlı Rubrik: {rubrics.length}{' '}
                    Adet · Sütun Düzeni:{' '}
                    <strong>{activePresetMeta.label}</strong>
                  </div>
                </div>

                {classStudents.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-slate-900">
                      Sınıf Öğrenci Listesi ({classStudents.length} Öğrenci)
                    </h4>
                    <div className="border border-slate-200 rounded-xl overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                            <th className="py-2 px-3 w-16">Okul No</th>
                            <th className="py-2 px-3">Öğrenci Adı Soyadı</th>
                            {colOpts.showFinalScoreAndLevel && (
                              <th className="py-2 px-3 text-center w-28">
                                Son Puan (100)
                              </th>
                            )}
                            {colOpts.showObservationNotes && (
                              <th className="py-2 px-3">Gözlem Notları</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {classStudents.map((stu) => (
                            <tr key={stu.id}>
                              <td className="py-2 px-3 font-mono-num font-bold text-slate-600">
                                {stu.studentNumber}
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-900">
                                {stu.fullName}
                              </td>
                              {colOpts.showFinalScoreAndLevel && (
                                <td className="py-2 px-3 text-center font-mono-num font-bold text-slate-800">
                                  —
                                </td>
                              )}
                              {colOpts.showObservationNotes && (
                                <td className="py-2 px-3 text-slate-600">—</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-blue-900" />
                      Değerlendirme Ölçütleri ve Rubrik Özeti ({rubrics.length}{' '}
                      Rubrik)
                    </h4>
                    {colOpts.showFinalScoreAndLevel && (
                      <span className="text-xs font-mono-num font-semibold text-slate-600">
                        Toplam: 100 Puan
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {rubrics.map((rub, idx) => (
                      <div
                        key={rub.id}
                        className="pdf-report-card p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-blue-900">
                            0{idx + 1}. {rub.title}
                          </span>
                          {colOpts.showFinalScoreAndLevel && (
                            <span className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded bg-blue-900 text-white">
                              100 Puan
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {rub.gradeLevel || '11. Sınıf'} · {rub.subject} ·{' '}
                          {rub.criteria.length} Ölçüt
                        </div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {rub.criteria.map((c) => (
                            <span
                              key={c.id}
                              className="text-[11px] bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700"
                            >
                              {c.title}
                              {colOpts.showCriterionScores && (
                                <>
                                  :{' '}
                                  <strong className="font-mono-num text-slate-900">
                                    {c.maxPoints ?? c.weight}P
                                  </strong>
                                </>
                              )}
                            </span>
                          ))}
                        </div>
                        {colOpts.showObservationNotes && rub.description && (
                          <div className="text-[11px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 mt-1">
                            <strong className="text-slate-900">
                              Gözlem / Değerlendirme Notu:{' '}
                            </strong>
                            {rub.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Official Signature Block inside Preview Sheet (Ders Öğretmeni & Okul Müdürü) */}
            {colOpts.showSignatures && (
              <div
                data-testid="preview-signature-grid"
                className="pdf-signature-grid grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-700"
              >
                <div className="pdf-signature-box">
                  <div className="font-bold text-slate-900">Ders Öğretmeni</div>
                  {colOpts.teacherName ? (
                    <>
                      <div
                        data-testid="preview-signature-teacher-name"
                        className="font-semibold text-slate-800 mt-0.5"
                      >
                        {colOpts.teacherName}
                      </div>
                      <div className="text-slate-500 mt-0.5">İmza</div>
                    </>
                  ) : (
                    <div className="text-slate-500 mt-0.5">
                      Adı Soyadı ve İmza
                    </div>
                  )}
                </div>
                <div className="pdf-signature-box">
                  <div className="font-bold text-slate-900">Okul Müdürü</div>
                  {colOpts.principalName ? (
                    <>
                      <div
                        data-testid="preview-signature-principal-name"
                        className="font-semibold text-slate-800 mt-0.5"
                      >
                        {colOpts.principalName}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        İmza ve Mühür
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-500 mt-0.5">
                      Adı Soyadı, İmza ve Mühür
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="no-print bg-white border-t border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 font-medium">
            {downloadError && <div role="alert" className="text-red-700 mb-1">{downloadError}</div>}
            Seçili Şablon: <strong>{activePresetMeta.label}</strong> · Format:{' '}
            <strong>A4 PDF (%PDF-1.4 · Türkçe Font Gömülü)</strong>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-700" />
              <span>Yazdır</span>
            </button>
            <button
              type="button"
              disabled={isDownloading}
              onClick={() => onConfirmDownloadPdf(effectiveMode, colOpts)}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <FileDown className="w-4 h-4" />
              <span>PDF Olarak İndir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
