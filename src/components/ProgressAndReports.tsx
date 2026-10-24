import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Download,
  FileDown,
  Printer,
  Award,
  Calendar,
  FileSpreadsheet,
  Users,
  Check,
  BookOpen,
} from 'lucide-react';
import type {
  Classroom,
  Student,
  Rubric,
  EvaluationSession,
} from '../types.ts';
import {
  getEffectiveSessionRubric,
  getStudentEvaluationBreakdown,
  getStudentProgressHistory,
  getGroupProgressHistory,
  generateSessionCsv,
  isScoreAssigned,
  sanitizeExportFilename,
} from '../utils/rubricLogic.ts';
import {
  downloadSessionPdfFile,
  downloadStudentPortfolioPdfFile,
  downloadClassroomOverviewPdfFile,
  type PdfColumnOptions,
} from '../utils/pdfGenerator.ts';
import {
  ReportPreviewModal,
  type ReportPreviewMode,
} from './ReportPreviewModal.tsx';
import {
  ALL_ACADEMIC_TERMS,
  getAcademicTermOptions,
  filterSessionsByAcademicTerm,
  computeTermComparisonAnalytics,
} from '../utils/academicTermLogic.ts';

interface ProgressAndReportsProps {
  classrooms: Classroom[];
  students: Student[];
  rubrics: Rubric[];
  sessions: EvaluationSession[];
  activeClassId: string;
  onSelectClass: (id: string) => void;
}

export const ProgressAndReports: React.FC<ProgressAndReportsProps> = ({
  classrooms,
  students,
  rubrics,
  sessions,
  activeClassId,
  onSelectClass,
}) => {
  const activeClassroom = useMemo(
    () => classrooms.find((c) => c.id === activeClassId) || classrooms[0],
    [classrooms, activeClassId]
  );

  const classStudents = useMemo(
    () =>
      students
        .filter((s) => s.classId === activeClassroom?.id && !s.archived)
        .sort((a, b) =>
          a.studentNumber.localeCompare(b.studentNumber, undefined, {
            numeric: true,
          })
        ),
    [students, activeClassroom]
  );

  const allClassSessions = useMemo(
    () =>
      sessions
        .filter((s) => {
          const allowed =
            s.classIds && s.classIds.length > 0 ? s.classIds : [s.classId];
          return activeClassroom ? allowed.includes(activeClassroom.id) : true;
        })
        .sort((a, b) => a.date.localeCompare(b.date)),
    [sessions, activeClassroom]
  );

  const [selectedTerm, setSelectedTerm] =
    useState<string>(ALL_ACADEMIC_TERMS);

  const academicTermOptions = useMemo(
    () => getAcademicTermOptions(allClassSessions, activeClassroom),
    [allClassSessions, activeClassroom]
  );

  const classSessions = useMemo(
    () =>
      filterSessionsByAcademicTerm(
        allClassSessions,
        selectedTerm,
        activeClassroom
      ),
    [allClassSessions, selectedTerm, activeClassroom]
  );

  const rubricsById = useMemo(() => {
    const map: Record<string, Rubric> = {};
    for (const r of rubrics) map[r.id] = r;
    return map;
  }, [rubrics]);

  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    () => classStudents[0]?.id || ''
  );
  const [selectedReportSessionId, setSelectedReportSessionId] =
    useState<string>(
      () => classSessions[classSessions.length - 1]?.id || ''
    );
  const [viewTab, setViewTab] = useState<
    'longitudinal' | 'group_history' | 'session_table'
  >('longitudinal');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [previewMode, setPreviewMode] =
    useState<ReportPreviewMode>('classroom_overview');

  const activeStudent = useMemo(
    () =>
      classStudents.find((s) => s.id === selectedStudentId) ||
      classStudents[0],
    [classStudents, selectedStudentId]
  );

  const studentHistory = useMemo(() => {
    if (!activeStudent) return [];
    return getStudentProgressHistory(
      activeStudent.id,
      classSessions,
      rubricsById
    );
  }, [activeStudent, classSessions, rubricsById]);

  const groupHistory = useMemo(() => {
    if (!activeClassroom) return [];
    return getGroupProgressHistory(
      classSessions,
      rubricsById,
      activeClassroom.id
    );
  }, [classSessions, rubricsById, activeClassroom]);

  const termComparison = useMemo(
    () =>
      computeTermComparisonAnalytics(
        allClassSessions,
        rubricsById,
        selectedTerm,
        activeClassroom,
        activeStudent?.id
      ),
    [allClassSessions, rubricsById, selectedTerm, activeClassroom, activeStudent]
  );

  const activeReportSession = useMemo(
    () =>
      classSessions.find((s) => s.id === selectedReportSessionId) ||
      classSessions[classSessions.length - 1],
    [classSessions, selectedReportSessionId]
  );

  const activeReportRubric = useMemo(
    () => getEffectiveSessionRubric(activeReportSession, rubricsById),
    [activeReportSession, rubricsById]
  );

  const reportDateFormatted = useMemo(
    () => new Date().toISOString().slice(0, 10),
    []
  );

  const showTemporaryNotice = (msg: string) => {
    setExportError(null);
    setExportNotice(msg);
    setTimeout(() => {
      setExportNotice((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const handleDownloadCsv = () => {
    setExportError(null);
    if (!activeReportSession || !activeReportRubric) {
      setExportError(
        'CSV oluşturulamadı: Seçili oturuma ait geçerli rubrik bulunamadı.'
      );
      return;
    }
    try {
      const csv = generateSessionCsv(
        activeReportSession,
        activeReportRubric,
        students,
        activeClassroom?.id
      );
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = sanitizeExportFilename(
        activeReportSession.title,
        'oturum'
      );
      const filename = `rapor_${safeName}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showTemporaryNotice(`CSV raporu indirildi (${filename}).`);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'CSV dışa aktarma hatası.'
      );
    }
  };

  /**
   * 'Rapor İndir' butonuna basıldığında PDF dosyasını indirmeden önce ekranın merkezinde 'Rapor Önizleme' modalını açar.
   */
  const handleDownloadReportPdf = () => {
    setExportError(null);
    if (viewTab === 'longitudinal' && activeStudent) {
      setPreviewMode('student_portfolio');
    } else if (activeReportSession && activeReportRubric && activeClassroom) {
      setPreviewMode('session_table');
    } else {
      setPreviewMode('classroom_overview');
    }
    setIsPreviewModalOpen(true);
  };

  const handleDownloadSessionPdfExplicit = () => {
    setExportError(null);
    if (activeReportSession && activeReportRubric && activeClassroom) {
      setPreviewMode('session_table');
    } else {
      setPreviewMode('classroom_overview');
    }
    setIsPreviewModalOpen(true);
  };

  /**
   * Rapor Önizleme modalı içinden onaylandığında ilgili PDF dosyasını seçilen sütun ayarlarıyla indirir.
   */
  const handleConfirmDownloadPdf = (
    mode: ReportPreviewMode,
    columnOptions: PdfColumnOptions
  ) => {
    setExportError(null);
    try {
      if (mode === 'student_portfolio' && activeStudent) {
        const filename = downloadStudentPortfolioPdfFile(
          activeStudent,
          activeClassroom,
          classSessions,
          rubricsById,
          columnOptions
        );
        setIsPreviewModalOpen(false);
        showTemporaryNotice(
          `Veli paylaşım ve öğrenci gelişim PDF raporu indirildi (${filename}).`
        );
        return;
      }

      if (
        mode === 'session_table' &&
        activeReportSession &&
        activeReportRubric &&
        activeClassroom
      ) {
        const filename = downloadSessionPdfFile(
          activeReportSession,
          activeReportRubric,
          activeClassroom,
          students,
          columnOptions
        );
        setIsPreviewModalOpen(false);
        showTemporaryNotice(
          `Sınıf oturum değerlendirme PDF raporu indirildi (${filename}).`
        );
        return;
      }

      const filename = downloadClassroomOverviewPdfFile(
        activeClassroom,
        classStudents,
        classSessions,
        rubrics,
        columnOptions
      );
      setIsPreviewModalOpen(false);
      showTemporaryNotice(
        `Sınıf ve rubrik değerlendirme PDF raporu indirildi (${filename}).`
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'PDF rapor oluşturma hatası.'
      );
    }
  };

  const studentSummaryMetrics = useMemo(() => {
    if (studentHistory.length === 0) {
      return { avgScore: 0, delta: 0, latestScore: 0, count: 0 };
    }
    const scores = studentHistory.map((h) => h.scoreOutOf100);
    const sum = scores.reduce((a, b) => a + b, 0);
    const avgScore = Math.round(sum / scores.length);
    const first = scores[0];
    const latest = scores[scores.length - 1];
    const delta = latest - first;
    return {
      avgScore,
      delta,
      latestScore: latest,
      count: studentHistory.length,
    };
  }, [studentHistory]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header, Class Switcher & Primary 'Rapor İndir' Action */}
      <div className="no-print flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Gelişim Takibi ve Raporlar
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Veli paylaşımına ve resmi çıktıya uygun A4 PDF rapor düzeni
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="report-class-select" className="sr-only">
            Sınıf Seçin
          </label>
          <select
            id="report-class-select"
            value={activeClassroom?.id || ''}
            disabled={classrooms.length === 0}
            onChange={(e) => onSelectClass(e.target.value)}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900 disabled:bg-slate-100 disabled:text-slate-500"
          >
            {classrooms.length === 0 ? (
              <option value="">Kayıtlı sınıf yok (Genel Özet)</option>
            ) : (
              classrooms.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} — {cls.gradeLevel} · {cls.subject}
                </option>
              ))
            )}
          </select>

          {/* Eğitim Dönemi Seçici (Örn: 2024-2025 Güz, 2024-2025 Bahar) */}
          <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-blue-900 shrink-0" />
            <label
              htmlFor="report-term-select"
              className="text-xs font-bold text-slate-700 whitespace-nowrap"
            >
              Eğitim Dönemi:
            </label>
            <select
              id="report-term-select"
              aria-label="Eğitim Dönemi Seçici"
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="text-xs font-bold bg-transparent text-blue-900 focus:outline-none cursor-pointer pr-1"
            >
              {academicTermOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="inline-flex rounded-lg bg-slate-200/80 p-1 gap-1">
            <button
              type="button"
              onClick={() => setViewTab('longitudinal')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                viewTab === 'longitudinal'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Bireysel Gelişim
            </button>
            <button
              type="button"
              onClick={() => setViewTab('group_history')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                viewTab === 'group_history'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Grup Dönemsel Geçmişi
            </button>
            <button
              type="button"
              onClick={() => setViewTab('session_table')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                viewTab === 'session_table'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Resmi Rapor Tablosu (PDF / CSV)
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownloadReportPdf}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
          >
            <FileDown className="w-4 h-4" />
            <span>Rapor İndir</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Printer className="w-4 h-4 text-slate-700" />
            <span>Çıktı Al</span>
          </button>
        </div>
      </div>

      {/* Dönemsel Karşılaştırmalı Gelişim Analizi Özeti */}
      <section
        aria-label="Dönemsel Karşılaştırmalı Gelişim Analizi"
        className="no-print bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-900" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Dönemsel Karşılaştırmalı Gelişim Analizi
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-blue-900 border border-slate-200">
              Aktif Dönem: {termComparison.selectedTermLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {academicTermOptions.slice(0, 5).map((opt) => {
              const isSelected = selectedTerm === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedTerm(opt.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                    isSelected
                      ? 'bg-blue-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {opt.value === ALL_ACADEMIC_TERMS
                    ? 'Tüm Dönemler'
                    : opt.value}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-600">
                Seçili Dönem ({termComparison.selectedTermLabel})
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {termComparison.currentSnapshot.sessionCount} Oturum ·{' '}
                {termComparison.currentSnapshot.evaluatedRecordCount}{' '}
                Değerlendirme
              </div>
            </div>
            <div className="font-mono-num text-lg font-bold text-slate-900">
              {termComparison.currentSnapshot.averageScore !== null
                ? `${termComparison.currentSnapshot.averageScore} / 100`
                : '—'}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-600">
                Karşılaştırma Dönemi (
                {termComparison.comparisonSnapshot?.term || 'Güz / Bahar'})
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {termComparison.comparisonSnapshot
                  ? `${termComparison.comparisonSnapshot.sessionCount} Oturum · ${termComparison.comparisonSnapshot.evaluatedRecordCount} Değerlendirme`
                  : 'Karşılaştırma baz dönemi'}
              </div>
            </div>
            <div className="font-mono-num text-lg font-bold text-slate-900">
              {termComparison.comparisonSnapshot?.averageScore !== null &&
              termComparison.comparisonSnapshot?.averageScore !== undefined
                ? `${termComparison.comparisonSnapshot.averageScore} / 100`
                : '—'}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-600">
                Dönemsel Gelişim Farkı (Güz vs Bahar)
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {termComparison.scoreDelta !== null
                  ? 'Dönemler arası net ortalama değişimi'
                  : 'En az 2 dönemde değerlendirme olduğunda hesaplanır'}
              </div>
            </div>
            <div
              className={`font-mono-num text-lg font-bold ${
                termComparison.scoreDelta !== null &&
                termComparison.scoreDelta >= 0
                  ? 'text-blue-900'
                  : 'text-slate-700'
              }`}
            >
              {termComparison.scoreDelta !== null
                ? `${
                    termComparison.scoreDelta > 0
                      ? `+${termComparison.scoreDelta}`
                      : termComparison.scoreDelta
                  } Puan`
                : '—'}
            </div>
          </div>
        </div>
      </section>

      {exportNotice && (
        <div
          role="status"
          aria-live="polite"
          className="no-print bg-slate-100 border border-slate-300 text-slate-900 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-blue-900 shrink-0" />
            <span>{exportNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-blue-900 font-bold hover:underline cursor-pointer"
          >
            Kapat
          </button>
        </div>
      )}

      {exportError && (
        <div
          role="alert"
          className="no-print bg-red-50 border border-red-300 text-red-900 px-4 py-3 rounded-xl text-xs font-semibold"
        >
          {exportError}
        </div>
      )}

      {/* TAB 1: LONGITUDINAL STUDENT TRACKING & PARENT-SHAREABLE PDF SHEET */}
      {viewTab === 'longitudinal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <aside className="no-print lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                {activeClassroom
                  ? `${activeClassroom.name} Öğrencileri`
                  : 'Öğrenci Listesi'}
              </h2>
              <span className="font-mono-num text-xs font-bold text-slate-600">
                {classStudents.length} Öğrenci
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
              {classStudents.map((stu) => {
                const hist = getStudentProgressHistory(
                  stu.id,
                  classSessions,
                  rubricsById
                );
                const latest =
                  hist.length > 0 ? hist[hist.length - 1] : null;
                const isSelected = activeStudent?.id === stu.id;

                return (
                  <button
                    key={stu.id}
                    type="button"
                    onClick={() => setSelectedStudentId(stu.id)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-100 border-l-4 border-l-blue-900'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono-num text-xs font-bold text-slate-400">
                          #{stu.studentNumber}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          {stu.fullName}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {hist.length} tamamlanmış oturum
                      </div>
                    </div>

                    {latest ? (
                      <span
                        className={`font-mono-num text-xs font-bold px-2.5 py-1 rounded ${
                          isSelected
                            ? 'bg-blue-900 text-white'
                            : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}
                      >
                        Son: {latest.scoreOutOf100}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </button>
                );
              })}
              {classStudents.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">
                  Öğrenci kaydı bulunmuyor.
                </div>
              )}
            </div>
          </aside>

          <div className="lg:col-span-8 space-y-5">
            {activeStudent ? (
              <div className="pdf-report-sheet p-6 space-y-6">
                {/* Institutional PDF Banner Header */}
                <div className="pdf-report-banner rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                      Veli Bilgilendirme ve Öğrenci Gelişim Raporu
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white">
                      {activeStudent.fullName}
                    </h2>
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
                      <span className="font-mono-num">
                        Tarih: {reportDateFormatted}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 no-print shrink-0">
                    <button
                      type="button"
                      onClick={handleDownloadReportPdf}
                      className="px-4 py-2 text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <FileDown className="w-4 h-4 text-blue-900" />
                      <span>Rapor İndir (.PDF)</span>
                    </button>
                  </div>
                </div>

                {/* Summary KPI Grid */}
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

                {/* Session-by-Session Breakdown */}
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

                          <div className="flex flex-wrap items-center gap-2">
                            {item.individualScoreOutOf100 !== null && (
                              <span className="text-xs font-mono-num font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
                                Bireysel: {item.individualScoreOutOf100}
                              </span>
                            )}
                            {item.groupScoreOutOf100 !== null && (
                              <span className="text-xs font-mono-num font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
                                Grup: {item.groupScoreOutOf100}
                              </span>
                            )}
                            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700 flex items-center gap-1">
                              <Award className="w-3.5 h-3.5 text-blue-900" />
                              {item.performanceLabel}
                            </span>
                            <span className="font-mono-num text-sm font-bold px-3 py-1 rounded bg-blue-900 text-white">
                              {item.scoreOutOf100} / 100
                            </span>
                          </div>
                        </div>

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

                        {item.note && (
                          <div className="text-xs text-slate-800 bg-slate-100 border border-slate-300 rounded-lg p-2.5">
                            <span className="font-bold text-slate-900">
                              Bireysel Gözlem Notu:{' '}
                            </span>
                            {item.note}
                          </div>
                        )}
                        {item.groupNote && (
                          <div className="text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                            <span className="font-bold text-slate-900">
                              Grup Gözlem Notu:{' '}
                            </span>
                            {item.groupNote}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-slate-500 border border-dashed border-slate-300 rounded-xl">
                    Bu öğrenci için henüz tüm ölçütleri tamamlanmış kesin
                    değerlendirme kaydı bulunmuyor.
                  </div>
                )}

                {/* Official Parent & Teacher Signature Footer */}
                <div className="pdf-signature-grid grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-700">
                  <div className="pdf-signature-box">
                    <div className="font-bold text-slate-900">
                      Ders Öğretmeni
                    </div>
                    <div className="text-slate-500 mt-0.5">Adı Soyadı ve İmza</div>
                  </div>
                  <div className="pdf-signature-box">
                    <div className="font-bold text-slate-900">
                      Öğrenci Velisi
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      Bilgi Edindim · Adı Soyadı ve İmza
                    </div>
                  </div>
                  <div className="pdf-signature-box">
                    <div className="font-bold text-slate-900">
                      Okul Müdürlüğü / İdare
                    </div>
                    <div className="text-slate-500 mt-0.5">Mühür ve Onay</div>
                  </div>
                </div>
              </div>
            ) : (
              /* Printable & Downloadable Rubric/Classroom PDF Report Sheet when no student exists yet */
              <div className="pdf-report-sheet p-6 space-y-5">
                <div className="pdf-report-banner rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                      Resmi PDF Çıktı ve Veli Paylaşım Şablonu
                    </div>
                    <h2 className="text-xl font-bold text-white">
                      {activeClassroom
                        ? `${activeClassroom.name} — ${activeClassroom.subject} Değerlendirme Raporu`
                        : '11. Sınıf Türk Dili ve Edebiyatı — Rubrik ve Gelişim Raporu'}
                    </h2>
                    <div className="text-xs text-slate-200">
                      Tarih: {reportDateFormatted} · Tanımlı Rubrik:{' '}
                      {rubrics.length} Adet (100 Puan Üzerinden)
                    </div>
                  </div>

                  <div className="flex items-center gap-2 no-print shrink-0">
                    <button
                      type="button"
                      onClick={handleDownloadReportPdf}
                      className="px-4 py-2 text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <FileDown className="w-4 h-4 text-blue-900" />
                      <span>Rapor İndir (.PDF)</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-blue-900" />
                      Değerlendirme Ölçütleri ve Rubrik Özeti ({rubrics.length}{' '}
                      Rubrik)
                    </h3>
                    <span className="text-xs font-mono-num font-semibold text-slate-600">
                      Her rubrik 100 tam puan üzerinden yapılandırılmıştır
                    </span>
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
                          <span className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded bg-blue-900 text-white">
                            100 Puan
                          </span>
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
                              {c.title}:{' '}
                              <strong className="font-mono-num text-slate-900">
                                {c.maxPoints ?? c.weight}P
                              </strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pdf-signature-grid grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-700">
                  <div className="pdf-signature-box">
                    <div className="font-bold text-slate-900">
                      Ders Öğretmeni
                    </div>
                    <div className="text-slate-500 mt-0.5">Adı Soyadı ve İmza</div>
                  </div>
                  <div className="pdf-signature-box">
                    <div className="font-bold text-slate-900">
                      Öğrenci Velisi
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      Bilgi Edindim · Adı Soyadı ve İmza
                    </div>
                  </div>
                  <div className="pdf-signature-box">
                    <div className="font-bold text-slate-900">
                      Okul Müdürlüğü / İdare
                    </div>
                    <div className="text-slate-500 mt-0.5">Mühür ve Onay</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: GROUP LONGITUDINAL HISTORY (P1 #6) */}
      {viewTab === 'group_history' && (
        <div className="pdf-report-sheet p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {activeClassroom?.name || 'Sınıf'} — Grup Değerlendirme Geçmişi
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono-num text-xs font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-300">
                {groupHistory.length} Grup Kaydı
              </span>
              <button
                type="button"
                onClick={handleDownloadReportPdf}
                className="no-print px-3.5 py-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                Rapor İndir
              </button>
            </div>
          </div>

          {groupHistory.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Bu sınıfa ait grup değerlendirme geçmişi bulunmuyor.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupHistory.map((gh, idx) => {
                const memberNames = gh.memberIds
                  .map((id) => students.find((s) => s.id === id)?.fullName)
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div
                    key={`${gh.sessionId}-${gh.groupId}-${idx}`}
                    className="pdf-report-card p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono-num">
                      <span>{gh.date}</span>
                      <span>{gh.memberCount} Öğrenci</span>
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      {gh.groupName}
                    </div>
                    <div className="text-xs font-medium text-blue-900">
                      {gh.sessionTitle}
                    </div>
                    <div className="text-xs text-slate-600">
                      <strong>Üyeler:</strong> {memberNames || '—'}
                    </div>
                    {gh.groupNote && (
                      <div className="text-xs text-slate-700 bg-white p-2 rounded border border-slate-200">
                        {gh.groupNote}
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">
                        {gh.performanceLabel}
                      </span>
                      <span className="font-mono-num text-sm font-bold px-2.5 py-0.5 rounded bg-blue-900 text-white">
                        {gh.isComplete && gh.scoreOutOf100 !== null
                          ? `${gh.scoreOutOf100} / 100`
                          : `Taslak (${gh.provisionalScoreOutOf100}P)`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FULL SESSION REPORT TABLE & DIRECT PDF / SAFE CSV EXPORT */}
      {viewTab === 'session_table' &&
        activeReportSession &&
        activeReportRubric && (
          <div className="pdf-report-sheet p-6 space-y-5">
            <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor="session-report-select"
                  className="text-xs font-semibold text-slate-600"
                >
                  Raporlanacak Oturum:
                </label>
                <select
                  id="session-report-select"
                  value={activeReportSession.id}
                  onChange={(e) => setSelectedReportSessionId(e.target.value)}
                  className="px-3 py-2 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900"
                >
                  {classSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.date})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSessionPdfExplicit}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FileDown className="w-4 h-4" />
                  Rapor İndir (PDF)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Güvenli CSV (Excel) İndir
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Yazdır
                </button>
              </div>
            </div>

            <div className="pb-2">
              <div className="text-xs font-semibold text-blue-900 uppercase tracking-wider">
                Ölçüt Temelli Performans Değerlendirme Çizelgesi
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                {activeClassroom?.name} — {activeReportSession.title}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Rubrik: <strong>{activeReportRubric.title}</strong> · Tarih:{' '}
                <span className="font-mono-num">
                  {activeReportSession.date}
                </span>
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[860px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700">
                    <th className="py-3 px-3 w-16">No</th>
                    <th className="py-3 px-3 w-44">Öğrenci Adı Soyadı</th>
                    {activeReportRubric.criteria.map((c) => (
                      <th key={c.id} className="py-3 px-2.5 text-center">
                        <div>{c.title}</div>
                        <div className="font-mono-num text-[10px] font-normal text-slate-500">
                          ({c.maxPoints ?? c.weight}P / %{c.weight})
                        </div>
                      </th>
                    ))}
                    <th className="py-3 px-2.5 text-center w-24">
                      Bireysel (100)
                    </th>
                    <th className="py-3 px-2.5 text-center w-24">Grup (100)</th>
                    <th className="py-3 px-2.5 text-center w-28">
                      Kesin Not (100)
                    </th>
                    <th className="py-3 px-3 w-32">Düzey</th>
                    <th className="py-3 px-3">Gözlem Notları</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {classStudents.map((stu) => {
                    const ev = activeReportSession.evaluations[stu.id];
                    const {
                      individualCalc,
                      groupCalc,
                      effectiveCalc,
                      activeSource,
                    } = getStudentEvaluationBreakdown(activeReportRubric, ev);

                    const activeScores =
                      activeSource === 'group'
                        ? ev?.groupCriterionScores || {}
                        : ev?.criterionScores || {};
                    const activeDirect =
                      activeSource === 'group'
                        ? ev?.groupDirectScores || {}
                        : ev?.directCriterionScores || {};

                    return (
                      <tr key={stu.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-mono-num font-bold text-slate-600">
                          {stu.studentNumber}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {stu.fullName}
                        </td>
                        {activeReportRubric.criteria.map((c) => {
                          const directVal = activeDirect[c.id];
                          const pts = activeScores[c.id];
                          return (
                            <td
                              key={c.id}
                              className="py-2.5 px-2.5 text-center font-mono-num font-semibold text-slate-800"
                            >
                              {isScoreAssigned(directVal)
                                ? `${directVal}P`
                                : isScoreAssigned(pts)
                                ? pts
                                : '—'}
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-2.5 text-center font-mono-num">
                          {individualCalc.finalScoreOutOf100 !== null
                            ? individualCalc.finalScoreOutOf100
                            : individualCalc.completedCriteriaCount > 0
                            ? `Eksik (${individualCalc.completedCriteriaCount}/${individualCalc.totalCriteriaCount})`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono-num text-slate-800">
                          {groupCalc.finalScoreOutOf100 !== null
                            ? groupCalc.finalScoreOutOf100
                            : groupCalc.completedCriteriaCount > 0
                            ? `Eksik (${groupCalc.completedCriteriaCount}/${groupCalc.totalCriteriaCount})`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono-num font-bold text-slate-900">
                          {effectiveCalc.isComplete &&
                          effectiveCalc.finalScoreOutOf100 !== null ? (
                            <span className="px-2 py-0.5 rounded bg-blue-900 text-white">
                              {effectiveCalc.finalScoreOutOf100}
                            </span>
                          ) : effectiveCalc.completedCriteriaCount > 0 ? (
                            <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                              Eksik ({effectiveCalc.completedCriteriaCount}/
                              {effectiveCalc.totalCriteriaCount})
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">
                          {effectiveCalc.performanceLabel}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                          {[
                            ev?.note,
                            ev?.groupNote ? `[Grup]: ${ev.groupNote}` : '',
                          ]
                            .filter(Boolean)
                            .join(' | ') || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pdf-signature-grid grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-700">
              <div className="pdf-signature-box">
                <div className="font-bold text-slate-900">Ders Öğretmeni</div>
                <div className="text-slate-500 mt-0.5">Adı Soyadı ve İmza</div>
              </div>
              <div className="pdf-signature-box">
                <div className="font-bold text-slate-900">Zümre Başkanı</div>
                <div className="text-slate-500 mt-0.5">Adı Soyadı ve İmza</div>
              </div>
              <div className="pdf-signature-box">
                <div className="font-bold text-slate-900">
                  Okul Müdürlüğü Onay
                </div>
                <div className="text-slate-500 mt-0.5">Mühür ve İmza</div>
              </div>
            </div>
          </div>
        )}

      {viewTab === 'session_table' &&
        (!activeReportSession || !activeReportRubric) && (
          <div className="pdf-report-sheet p-8 text-center space-y-3">
            <div className="text-sm font-bold text-slate-900">
              Raporlanacak değerlendirme oturumu bulunmuyor
            </div>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              Değerlendirme oturumu oluşturduğunuzda öğrenci puan çizelgesi burada
              görüntülenir. Mevcut sınıf ve rubrik özet raporunu PDF olarak
              indirmek için aşağıdaki butonu kullanabilirsiniz.
            </p>
            <div className="pt-1 no-print">
              <button
                type="button"
                onClick={handleDownloadReportPdf}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                <span>Rapor İndir (.PDF)</span>
              </button>
            </div>
          </div>
        )}

      {/* Centered Report Preview Modal before PDF Download */}
      <ReportPreviewModal
        isOpen={isPreviewModalOpen}
        previewMode={previewMode}
        onChangePreviewMode={setPreviewMode}
        onClose={() => setIsPreviewModalOpen(false)}
        onConfirmDownloadPdf={handleConfirmDownloadPdf}
        activeClassroom={activeClassroom}
        activeStudent={activeStudent}
        studentHistory={studentHistory}
        studentSummaryMetrics={studentSummaryMetrics}
        activeReportSession={activeReportSession}
        activeReportRubric={activeReportRubric}
        classStudents={classStudents}
        rubrics={rubrics}
        reportDateFormatted={reportDateFormatted}
        selectedAcademicTermLabel={termComparison.selectedTermLabel}
      />
    </div>
  );
};
