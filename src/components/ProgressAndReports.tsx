import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  FileDown,
  Printer,
  Award,
  Calendar,
  FileSpreadsheet,
  Users,
  Check,
  BookOpen,
  Plus,
  Trash2,
  Settings2,
  RotateCcw,
  Archive,
  ArchiveRestore,
  AlertTriangle,
} from 'lucide-react';
import type {
  Classroom,
  Student,
  Rubric,
  EvaluationSession,
  InstitutionSettings,
} from '../types.ts';
import { loadInstitutionSettings } from '../utils/storageLayer.ts';
import {
  getCriterionEarnedPoints,
  getCriterionSection,
  getEffectiveSessionRubric,
  getStudentEvaluationBreakdown,
  getStudentProgressHistory,
  getGroupProgressHistory,
  generateSessionCsv,
  isScoreAssigned,
  sanitizeExportFilename,
  isDualBookSpeakingRubric,
} from '../utils/rubricLogic.ts';
import {
  downloadSessionPdfFile,
  downloadStudentPortfolioPdfFile,
  downloadClassroomOverviewPdfFile,
  type DualReportMode,
  type PdfColumnOptions,
} from '../utils/pdfGenerator.ts';
import {
  ReportPreviewModal,
  type ReportPreviewMode,
} from './ReportPreviewModal.tsx';
import {
  ALL_ACADEMIC_TERMS,
  DEFAULT_ACADEMIC_TERM_OPTIONS,
  MANAGED_ACADEMIC_TERMS_STORAGE_KEY,
  getAcademicTermOptions,
  filterSessionsByAcademicTerm,
  computeTermComparisonAnalytics,
  computeStudentTermPercentageComparison,
  addAcademicTerm,
  deleteAcademicTerm,
  resolveSessionAcademicTerm,
  compareAcademicTerms,
  getCurrentAcademicTerm,
  ensureAutoAcademicTerms,
} from '../utils/academicTermLogic.ts';

interface ProgressAndReportsProps {
  classrooms: Classroom[];
  students: Student[];
  rubrics: Rubric[];
  sessions: EvaluationSession[];
  activeClassId: string;
  onSelectClass: (id: string) => void;
  onUpdateSession?: (session: EvaluationSession) => void;
  onDeleteSession?: (sessionId: string) => void;
  onArchiveSession?: (sessionId: string, archived: boolean) => void;
  institutionSettings?: InstitutionSettings;
}

export const ProgressAndReports: React.FC<ProgressAndReportsProps> = ({
  classrooms,
  students,
  rubrics,
  sessions,
  activeClassId,
  onSelectClass,
  onUpdateSession,
  onDeleteSession,
  onArchiveSession,
  institutionSettings,
}) => {
  const effectiveInstitution =
    institutionSettings || loadInstitutionSettings();
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

  const [managedTerms, setManagedTerms] = useState<string[]>(() => {
    try {
      const rawV2 = localStorage.getItem(MANAGED_ACADEMIC_TERMS_STORAGE_KEY);
      const raw =
        rawV2 || localStorage.getItem('rubrikpad_managed_academic_terms_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          Array.isArray(parsed) &&
          parsed.every((item) => typeof item === 'string')
        ) {
          // 2026-2027 Güz öncesindeki eski dönemleri filtrele
          const filtered = parsed.filter(
            (t) => compareAcademicTerms(t, '2026-2027 Güz') >= 0
          );
          const autoTerms = ensureAutoAcademicTerms(
            filtered.length > 0 ? filtered : DEFAULT_ACADEMIC_TERM_OPTIONS
          );
          return autoTerms;
        }
      }
    } catch {
      // Varsayılan dönem listesine dön
    }
    return ensureAutoAcademicTerms(DEFAULT_ACADEMIC_TERM_OPTIONS);
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        MANAGED_ACADEMIC_TERMS_STORAGE_KEY,
        JSON.stringify(managedTerms)
      );
    } catch {
      // localStorage yazma hatasını yoksay
    }
  }, [managedTerms]);

  const [selectedTerm, setSelectedTerm] =
    useState<string>(ALL_ACADEMIC_TERMS);
  const [isTermManagerOpen, setIsTermManagerOpen] = useState<boolean>(false);
  const [newTermYearInput, setNewTermYearInput] = useState<string>('2026-2027');
  const [newTermSemesterInput, setNewTermSemesterInput] = useState<
    'Güz' | 'Bahar'
  >('Güz');
  const [termManagerError, setTermManagerError] = useState<string | null>(null);
  const [dualSessionReportMode, setDualSessionReportMode] =
    useState<DualReportMode>('both');

  const academicTermOptions = useMemo(() => {
    const autoManaged = ensureAutoAcademicTerms(
      managedTerms,
      allClassSessions,
      activeClassroom
    );
    return getAcademicTermOptions(allClassSessions, activeClassroom, autoManaged);
  }, [allClassSessions, activeClassroom, managedTerms]);

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
        activeStudent?.id,
        managedTerms
      ),
    [
      allClassSessions,
      rubricsById,
      selectedTerm,
      activeClassroom,
      activeStudent,
      managedTerms,
    ]
  );

  const studentTermComparison = useMemo(
    () =>
      computeStudentTermPercentageComparison(
        classStudents,
        allClassSessions,
        rubricsById,
        selectedTerm,
        activeClassroom,
        managedTerms
      ),
    [
      classStudents,
      allClassSessions,
      rubricsById,
      selectedTerm,
      activeClassroom,
      managedTerms,
    ]
  );

  const activeReportSession = useMemo(
    () =>
      classSessions.find((s) => s.id === selectedReportSessionId) ||
      classSessions[classSessions.length - 1],
    [classSessions, selectedReportSessionId]
  );

  const [showDeleteSessionConfirmModal, setShowDeleteSessionConfirmModal] =
    useState(false);

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

  const handleAddAcademicTerm = (e: React.FormEvent) => {
    e.preventDefault();
    setTermManagerError(null);
    const result = addAcademicTerm(
      managedTerms,
      newTermYearInput,
      newTermSemesterInput
    );
    if (result.error || !result.addedTerm) {
      setTermManagerError(result.error || 'Dönem eklenemedi.');
      return;
    }
    setManagedTerms(result.terms);
    setSelectedTerm(result.addedTerm);
    showTemporaryNotice(
      `"${result.addedTerm}" eğitim dönemi eklendi ve aktif dönem olarak seçildi.`
    );
  };

  const handleDeleteAcademicTerm = (termToDelete: string) => {
    setTermManagerError(null);
    const result = deleteAcademicTerm(
      managedTerms,
      termToDelete,
      selectedTerm
    );
    if (result.error || !result.deletedTerm) {
      setTermManagerError(result.error || 'Dönem silinemedi.');
      return;
    }
    setManagedTerms(result.terms);
    setSelectedTerm(result.nextSelectedTerm);
    showTemporaryNotice(`"${result.deletedTerm}" eğitim dönemi listeden silindi.`);
  };

  const handleResetDefaultTerms = () => {
    setTermManagerError(null);
    const merged = ensureAutoAcademicTerms(
      DEFAULT_ACADEMIC_TERM_OPTIONS,
      allClassSessions,
      activeClassroom
    );
    setManagedTerms(merged);
    showTemporaryNotice('Varsayılan eğitim dönemi (2026-2027 Güz) geri yüklendi.');
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
        activeClassroom?.id,
        dualSessionReportMode
      );
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = sanitizeExportFilename(
        activeReportSession.title,
        'oturum'
      );
      const modePrefix =
        dualSessionReportMode === 'book'
          ? 'kitap_raporu'
          : dualSessionReportMode === 'speaking'
          ? 'konusma_raporu'
          : 'rapor';
      const filename = `${modePrefix}_${safeName}.csv`;
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
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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

          {/* Eğitim Dönemi Seçici + Yeni Dönem Ekleme ve Silme Kontrolleri */}
          <div className="inline-flex flex-wrap items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs">
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

            <span className="h-3.5 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

            <button
              type="button"
              onClick={() => {
                setTermManagerError(null);
                setIsTermManagerOpen((prev) => !prev);
              }}
              aria-expanded={isTermManagerOpen}
              aria-label="Dönem Ekle veya Yönet"
              className={`px-2 py-0.5 rounded text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                isTermManagerOpen
                  ? 'bg-blue-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Plus className="w-3 h-3" />
              <span>Dönem Ekle / Yönet</span>
            </button>

            {selectedTerm !== ALL_ACADEMIC_TERMS && (
              <button
                type="button"
                onClick={() => handleDeleteAcademicTerm(selectedTerm)}
                aria-label={`Seçili ${selectedTerm} dönemini sil`}
                title={`Seçili ${selectedTerm} dönemini sil`}
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Dönemi Sil</span>
              </button>
            )}
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

      {/* Akademik Eğitim Dönemi Ekleme ve Silme Yönetim Paneli */}
      {isTermManagerOpen && (
        <section
          aria-label="Akademik Eğitim Dönemi Yönetimi"
          className="no-print bg-white border border-slate-300 rounded-xl p-4 shadow-xs space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-blue-900" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Akademik Yıl ve Eğitim Dönemi Yönetimi
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetDefaultTerms}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Varsayılan Dönemleri Yükle</span>
              </button>
              <button
                type="button"
                onClick={() => setIsTermManagerOpen(false)}
                className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
            💡 <strong>Otomatik Dönem Açılışı:</strong> Yeni eğitim dönemleri takvim tarihine göre otomatik olarak açılır (Örn. 15 Şubat&apos;tan itibaren Bahar dönemi kendiliğinden devreye girer). İsteğe bağlı olarak geçmiş veya özel dönemleri buradan ekleyebilirsiniz.
          </p>

          <form
            onSubmit={handleAddAcademicTerm}
            className="flex flex-wrap items-end gap-3"
          >
            <div>
              <label
                htmlFor="new-term-year-input"
                className="block text-[11px] font-bold text-slate-700 mb-1"
              >
                Akademik Yıl (Örn: 2026-2027)
              </label>
              <input
                id="new-term-year-input"
                type="text"
                value={newTermYearInput}
                onChange={(e) => setNewTermYearInput(e.target.value)}
                placeholder="2026-2027"
                className="px-3 py-1.5 text-xs font-mono-num font-semibold bg-white border border-slate-300 rounded-lg text-slate-900 w-36 focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
            </div>

            <div>
              <label
                htmlFor="new-term-semester-select"
                className="block text-[11px] font-bold text-slate-700 mb-1"
              >
                Yarıyıl / Dönem
              </label>
              <select
                id="new-term-semester-select"
                value={newTermSemesterInput}
                onChange={(e) =>
                  setNewTermSemesterInput(
                    e.target.value === 'Bahar' ? 'Bahar' : 'Güz'
                  )
                }
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900"
              >
                <option value="Güz">Güz Dönemi</option>
                <option value="Bahar">Bahar Dönemi</option>
              </select>
            </div>

            <button
              type="submit"
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-lg inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Dönem Ekle</span>
            </button>
          </form>

          {termManagerError && (
            <div
              role="alert"
              className="text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              {termManagerError}
            </div>
          )}

          <div>
            <div className="text-[11px] font-bold text-slate-600 mb-1.5">
              Kayıtlı Eğitim Dönemleri ({managedTerms.length} Dönem):
            </div>
            {managedTerms.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                Listede kayıtlı dönem kalmadı. Yukarıdan yeni bir dönem ekleyebilir veya varsayılan dönemleri yükleyebilirsiniz.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {managedTerms.map((term) => {
                  const isActive = selectedTerm === term;
                  return (
                    <div
                      key={term}
                      className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-semibold border ${
                        isActive
                          ? 'bg-blue-50 border-blue-900 text-blue-950'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedTerm(term)}
                        className="cursor-pointer hover:underline"
                      >
                        {term}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAcademicTerm(term)}
                        aria-label={`${term} dönemini sil`}
                        title={`${term} dönemini sil`}
                        className="p-0.5 rounded text-slate-500 hover:text-red-700 hover:bg-red-50 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Dönemsel Karşılaştırmalı Gelişim Analizi Özeti ve Yüzde-Değişim Tablosu */}
      <section
        aria-label="Dönemsel Karşılaştırmalı Gelişim Analizi"
        className="no-print bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4"
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
            {academicTermOptions.slice(0, 6).map((opt) => {
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

        {/* Seçilen Dönem ile Bir Önceki Dönemi Kıyaslayan Yüzde-Değişim Tablosu */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-3.5 py-2.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-900">
                Öğrenci Gelişim Trendleri — Dönemsel Yüzde-Değişim Tablosu
              </h3>
              <p className="text-[11px] text-slate-600">
                Seçilen dönem ({studentTermComparison.currentTerm}) ile bir önceki dönem ({studentTermComparison.previousTerm}) ortalama puanlarının yüzdesel gelişim kıyaslaması
              </p>
            </div>
            <span className="text-[11px] font-mono-num font-semibold px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-800 self-start sm:self-auto">
              {studentTermComparison.previousTerm} → {studentTermComparison.currentTerm}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table
              aria-label="Dönemsel Yüzde Değişim Tablosu"
              className="w-full text-left border-collapse text-xs"
            >
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Öğrenci</th>
                  <th className="py-2.5 px-3 text-right">
                    Önceki Dönem ({studentTermComparison.previousTerm})
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    Seçili Dönem ({studentTermComparison.currentTerm})
                  </th>
                  <th className="py-2.5 px-3 text-right">Puan Farkı</th>
                  <th className="py-2.5 px-3 text-right">Yüzde Değişim (%)</th>
                  <th className="py-2.5 px-3">Gelişim Trendi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {studentTermComparison.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 px-4 text-center text-xs text-slate-500"
                    >
                      Bu sınıfta henüz kayıtlı öğrenci veya dönemsel değerlendirme verisi bulunmuyor. Öğrenci ve değerlendirme oturumu eklendiğinde{' '}
                      <strong className="font-semibold text-slate-700">
                        {studentTermComparison.previousTerm}
                      </strong>{' '}
                      ile{' '}
                      <strong className="font-semibold text-slate-700">
                        {studentTermComparison.currentTerm}
                      </strong>{' '}
                      arasındaki yüzde-değişim trendleri burada otomatik olarak listelenir.
                    </td>
                  </tr>
                ) : (
                  studentTermComparison.rows.map((row) => {
                    const barWidth =
                      row.percentageChange !== null
                        ? Math.min(100, Math.max(8, Math.abs(row.percentageChange)))
                        : 0;
                    return (
                      <tr
                        key={row.studentId}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          <span className="font-mono-num text-slate-500 mr-1.5">
                            #{row.studentNumber}
                          </span>
                          {row.fullName}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-num text-slate-700">
                          {row.previousAverage !== null ? (
                            <span>
                              <strong className="text-slate-900">
                                {row.previousAverage}
                              </strong>{' '}
                              / 100
                              <span className="text-[10px] text-slate-500 ml-1">
                                ({row.previousSessionCount} ot.)
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-num text-slate-700">
                          {row.currentAverage !== null ? (
                            <span>
                              <strong className="text-slate-900">
                                {row.currentAverage}
                              </strong>{' '}
                              / 100
                              <span className="text-[10px] text-slate-500 ml-1">
                                ({row.currentSessionCount} ot.)
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-num font-bold">
                          {row.pointDelta !== null ? (
                            <span
                              className={
                                row.pointDelta > 0
                                  ? 'text-emerald-800'
                                  : row.pointDelta < 0
                                  ? 'text-amber-800'
                                  : 'text-slate-700'
                              }
                            >
                              {row.pointDelta > 0
                                ? `+${row.pointDelta}`
                                : row.pointDelta}{' '}
                              Puan
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-num font-bold">
                          {row.percentageChange !== null ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${
                                row.percentageChange > 0
                                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                                  : row.percentageChange < 0
                                  ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {row.percentageChange > 0
                                ? `+%${row.percentageChange}`
                                : row.percentageChange < 0
                                ? `-%${Math.abs(row.percentageChange)}`
                                : '%0'}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {row.trend === 'up' && (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 whitespace-nowrap">
                                <TrendingUp className="w-3.5 h-3.5" />
                                Yükselişte
                              </span>
                              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                <div
                                  className="h-full bg-emerald-600 rounded-full"
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {row.trend === 'down' && (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 whitespace-nowrap">
                                <TrendingDown className="w-3.5 h-3.5" />
                                Düşüşte
                              </span>
                              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                <div
                                  className="h-full bg-amber-600 rounded-full"
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {row.trend === 'stable' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                              <Minus className="w-3.5 h-3.5" />
                              Dengeli / Sabit
                            </span>
                          )}
                          {row.trend === 'insufficient_data' && (
                            <span className="text-[11px] text-slate-500">
                              Karşılaştırma verisi bekleniyor
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {studentTermComparison.rows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                    <td className="py-2.5 px-3">
                      Sınıf Genel Ortalaması ({studentTermComparison.rows.length} Öğrenci)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num">
                      {studentTermComparison.classPreviousAverage !== null
                        ? `${studentTermComparison.classPreviousAverage} / 100`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num">
                      {studentTermComparison.classCurrentAverage !== null
                        ? `${studentTermComparison.classCurrentAverage} / 100`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num">
                      {studentTermComparison.classPointDelta !== null
                        ? `${
                            studentTermComparison.classPointDelta > 0
                              ? `+${studentTermComparison.classPointDelta}`
                              : studentTermComparison.classPointDelta
                          } Puan`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num">
                      {studentTermComparison.classPercentageChange !== null
                        ? studentTermComparison.classPercentageChange > 0
                          ? `+%${studentTermComparison.classPercentageChange}`
                          : studentTermComparison.classPercentageChange < 0
                          ? `-%${Math.abs(
                              studentTermComparison.classPercentageChange
                            )}`
                          : '%0'
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-[11px]">
                      {studentTermComparison.classTrend === 'up'
                        ? 'Sınıf Ortalaması Yükselişte'
                        : studentTermComparison.classTrend === 'down'
                        ? 'Sınıf Ortalaması Düşüşte'
                        : studentTermComparison.classTrend === 'stable'
                        ? 'Sınıf Ortalaması Dengeli'
                        : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
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
                        {latest.isDualEvaluation
                          ? `Kitap: ${latest.bookPresentationScoreOutOf100 ?? latest.scoreOutOf100} · Konuşma: ${latest.speakingExamScoreOutOf100 ?? '—'}`
                          : `Son: ${latest.scoreOutOf100}`}
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
                    {effectiveInstitution.schoolName && (
                      <div
                        data-testid="report-school-name-header"
                        className="text-xs font-bold uppercase tracking-wider text-amber-200"
                      >
                        {effectiveInstitution.schoolName}
                      </div>
                    )}
                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                      Öğrenci Gelişim ve Performans Raporu
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
                            {item.isDualEvaluation ? (
                              <>
                                <span
                                  data-testid={`report-dual-book-score-${item.sessionId}`}
                                  className="font-mono-num text-xs font-bold px-2.5 py-1 rounded bg-blue-900 text-white"
                                >
                                  Kitap Sunumu: {item.bookPresentationScoreOutOf100 ?? item.scoreOutOf100} / 100
                                  {item.contentScoreOutOf70 !== null &&
                                    item.speakingContributionOutOf30 !== null && (
                                      <span className="font-normal text-blue-200 ml-1">
                                        (İçerik: {item.contentScoreOutOf70}/70 + %30 Konuşma: {item.speakingContributionOutOf30}/30)
                                      </span>
                                    )}
                                </span>
                                {item.speakingExamScoreOutOf100 !== null && (
                                  <span
                                    data-testid={`report-dual-speaking-score-${item.sessionId}`}
                                    className="font-mono-num text-xs font-bold px-2.5 py-1 rounded bg-emerald-800 text-white"
                                  >
                                    Konuşma Sınavı: {item.speakingExamScoreOutOf100} / 100
                                  </span>
                                )}
                                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700 flex items-center gap-1">
                                  <Award className="w-3.5 h-3.5 text-blue-900" />
                                  {item.performanceLabel}
                                </span>
                              </>
                            ) : (
                              <>
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
                              </>
                            )}
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

                {/* Official Teacher & Principal Signature Footer */}
                <div
                  data-testid="report-signature-grid"
                  className="pdf-signature-grid grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-700"
                >
                  <div className="pdf-signature-box">
                    <div className="font-bold text-slate-900">
                      Ders Öğretmeni
                    </div>
                    {effectiveInstitution.teacherName ? (
                      <>
                        <div
                          data-testid="report-signature-teacher-name"
                          className="font-semibold text-slate-800 mt-0.5"
                        >
                          {effectiveInstitution.teacherName}
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
                    {effectiveInstitution.principalName ? (
                      <>
                        <div
                          data-testid="report-signature-principal-name"
                          className="font-semibold text-slate-800 mt-0.5"
                        >
                          {effectiveInstitution.principalName}
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
              </div>
            ) : (
              /* Printable & Downloadable Rubric/Classroom PDF Report Sheet when no student exists yet */
              <div className="pdf-report-sheet p-6 space-y-5">
                <div className="pdf-report-banner rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    {effectiveInstitution.schoolName && (
                      <div
                        data-testid="report-school-name-header"
                        className="text-xs font-bold uppercase tracking-wider text-amber-200"
                      >
                        {effectiveInstitution.schoolName}
                      </div>
                    )}
                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                      Resmi PDF Çıktı ve Değerlendirme Şablonu
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
                            {String(idx + 1).padStart(2, '0')}. {rub.title}
                          </span>
                          <span className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded bg-blue-900 text-white shrink-0">
                            {rub.scoringMode === 'dual_book_and_speaking'
                              ? '100P + 100P (2 Not)'
                              : '100 Puan'}
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

                <div
                  data-testid="report-signature-grid"
                  className="pdf-signature-grid grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-700"
                >
                  <div className="pdf-signature-box">
                    <div className="font-bold text-slate-900">
                      Ders Öğretmeni
                    </div>
                    {effectiveInstitution.teacherName ? (
                      <>
                        <div
                          data-testid="report-signature-teacher-name"
                          className="font-semibold text-slate-800 mt-0.5"
                        >
                          {effectiveInstitution.teacherName}
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
                    {effectiveInstitution.principalName ? (
                      <>
                        <div
                          data-testid="report-signature-principal-name"
                          className="font-semibold text-slate-800 mt-0.5"
                        >
                          {effectiveInstitution.principalName}
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
                      {s.archived ? '[Arşiv] ' : ''}{s.title} ({s.date})
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

                {/* Arşivle / Arşivden Çıkar */}
                {(onArchiveSession || onUpdateSession) && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextArchived = !activeReportSession.archived;
                      if (onArchiveSession) {
                        onArchiveSession(activeReportSession.id, nextArchived);
                      } else if (onUpdateSession) {
                        onUpdateSession({
                          ...activeReportSession,
                          archived: nextArchived,
                          archivedAt: nextArchived
                            ? new Date().toISOString()
                            : undefined,
                        });
                      }
                    }}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer border ${
                      activeReportSession.archived
                        ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                    }`}
                    title={
                      activeReportSession.archived
                        ? 'Oturumu arşivden çıkar'
                        : 'Oturumu arşivle'
                    }
                  >
                    {activeReportSession.archived ? (
                      <>
                        <ArchiveRestore className="w-3.5 h-3.5 text-amber-800" />
                        <span>Arşivden Çıkar</span>
                      </>
                    ) : (
                      <>
                        <Archive className="w-3.5 h-3.5 text-slate-600" />
                        <span>Arşivle</span>
                      </>
                    )}
                  </button>
                )}

                {/* Sil */}
                {onDeleteSession && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteSessionConfirmModal(true)}
                    className="px-3 py-2 text-xs font-semibold text-rose-700 bg-white border border-rose-300 hover:bg-rose-50 rounded-lg flex items-center gap-1.5 cursor-pointer"
                    title="Bu oturumu kalıcı olarak sil"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Sil</span>
                  </button>
                )}
              </div>
            </div>

            {isDualBookSpeakingRubric(activeReportRubric) && (
              <div
                data-testid="session-dual-report-switcher"
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
                      data-testid={`session-dual-mode-${opt.id}`}
                      onClick={() => setDualSessionReportMode(opt.id)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                        dualSessionReportMode === opt.id
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
              dualSessionReportMode === 'both' ||
              dualSessionReportMode === 'book') && (
              <div
                data-testid="session-book-report-section"
                className="space-y-3"
              >
                <div className="pb-1">
                  {effectiveInstitution.schoolName && (
                    <div
                      data-testid="session-report-school-name"
                      className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-0.5"
                    >
                      {effectiveInstitution.schoolName}
                    </div>
                  )}
                  <div className="text-xs font-semibold text-blue-900 uppercase tracking-wider">
                    {isDualBookSpeakingRubric(activeReportRubric)
                      ? '1. Kitap Sunumu Performans Değerlendirme Çizelgesi (100 Puan)'
                      : 'Ölçüt Temelli Performans Değerlendirme Çizelgesi'}
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-0.5 flex items-center gap-2">
                    <span>
                      {activeClassroom?.name} — {activeReportSession.title}
                    </span>
                    {activeReportSession.archived && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                        <Archive className="w-3 h-3 text-amber-800" />
                        Arşivde
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Rubrik: <strong>{activeReportRubric.title}</strong> · Tarih:{' '}
                    <span className="font-mono-num">
                      {activeReportSession.date}
                    </span>
                    {isDualBookSpeakingRubric(activeReportRubric) && (
                      <span className="ml-2 text-blue-900 font-medium">
                        (Kitap İçeriği: 70 Puan + Ortak Konuşma %30: 30 Puan =
                        100 Puan)
                      </span>
                    )}
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
                        {isDualBookSpeakingRubric(activeReportRubric) ? (
                          <>
                            <th className="py-3 px-2.5 text-center w-24">
                              Kitap İçeriği (70)
                            </th>
                            <th className="py-3 px-2.5 text-center w-24">
                              Sunum (%30 · 30)
                            </th>
                            <th className="py-3 px-2.5 text-center w-28">
                              Kitap Sunumu Notu (100)
                            </th>
                          </>
                        ) : (
                          <>
                            <th className="py-3 px-2.5 text-center w-24">
                              Bireysel (100)
                            </th>
                            <th className="py-3 px-2.5 text-center w-24">
                              Grup (100)
                            </th>
                            <th className="py-3 px-2.5 text-center w-28">
                              Kesin Not (100)
                            </th>
                          </>
                        )}
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
                        } = getStudentEvaluationBreakdown(
                          activeReportRubric,
                          ev
                        );
                        const isDual =
                          isDualBookSpeakingRubric(activeReportRubric);
                        const dual = effectiveCalc.dualResult;

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
                              const earnedPts = getCriterionEarnedPoints(
                                c,
                                pts,
                                directVal
                              );
                              return (
                                <td
                                  key={c.id}
                                  className="py-2.5 px-2.5 text-center font-mono-num font-semibold text-slate-800"
                                >
                                  {earnedPts !== null ? earnedPts : '—'}
                                </td>
                              );
                            })}
                            {isDual && dual ? (
                              <>
                                <td className="py-2.5 px-2.5 text-center font-mono-num text-slate-800">
                                  {dual.completedContentCount > 0
                                    ? `${dual.contentScoreOutOf70}/70`
                                    : '—'}
                                </td>
                                <td className="py-2.5 px-2.5 text-center font-mono-num text-slate-800">
                                  {dual.completedSpeakingCount > 0
                                    ? `${dual.speakingContributionOutOf30}/30`
                                    : '—'}
                                </td>
                                <td
                                  data-testid={`session-table-book-score-${stu.id}`}
                                  className="py-2.5 px-2.5 text-center font-mono-num font-bold text-slate-900"
                                >
                                  {dual.isBookPresentationComplete &&
                                  dual.finalBookPresentationScoreOutOf100 !==
                                    null ? (
                                    <span className="px-2 py-0.5 rounded bg-blue-900 text-white">
                                      {dual.finalBookPresentationScoreOutOf100}
                                    </span>
                                  ) : effectiveCalc.completedCriteriaCount >
                                    0 ? (
                                    <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                                      Eksik (
                                      {effectiveCalc.completedCriteriaCount}/
                                      {effectiveCalc.totalCriteriaCount})
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </>
                            ) : (
                              <>
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
                                  ) : effectiveCalc.completedCriteriaCount >
                                    0 ? (
                                    <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                                      Eksik (
                                      {effectiveCalc.completedCriteriaCount}/
                                      {effectiveCalc.totalCriteriaCount})
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </>
                            )}
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
              </div>
            )}

            {/* DEDICATED SPEAKING EXAM REPORT TABLE (100 PUAN) */}
            {isDualBookSpeakingRubric(activeReportRubric) &&
              (dualSessionReportMode === 'both' ||
                dualSessionReportMode === 'speaking') && (
                <div
                  data-testid="session-speaking-report-section"
                  className="space-y-3 pt-4 border-t border-slate-200"
                >
                  <div className="pb-1">
                    {effectiveInstitution.schoolName && (
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-0.5">
                        {effectiveInstitution.schoolName}
                      </div>
                    )}
                    <div className="text-xs font-semibold text-emerald-900 uppercase tracking-wider">
                      2. Konuşma Sınavı Performans Değerlendirme Çizelgesi (100
                      Puan)
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                      {activeClassroom?.name} — {activeReportSession.title}{' '}
                      (Konuşma Sınavı Raporu)
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Ortak Konuşma Değerlendirmesi (6 Ölçüt · 100 Puan) ·
                      Tarih:{' '}
                      <span className="font-mono-num">
                        {activeReportSession.date}
                      </span>
                    </p>
                  </div>

                  <div className="border border-emerald-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[780px]">
                      <thead>
                        <tr className="bg-emerald-50 border-b border-emerald-200 text-xs font-bold text-emerald-950">
                          <th className="py-3 px-3 w-16">No</th>
                          <th className="py-3 px-3 w-44">
                            Öğrenci Adı Soyadı
                          </th>
                          {activeReportRubric.criteria
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
                                className="py-3 px-2.5 text-center"
                              >
                                <div>{c.title}</div>
                                <div className="font-mono-num text-[10px] font-normal text-emerald-800">
                                  ({c.maxPoints ?? c.weight}P)
                                </div>
                              </th>
                            ))}
                          <th className="py-3 px-2.5 text-center w-28">
                            Konuşma Sınavı Notu (100)
                          </th>
                          <th className="py-3 px-3 w-32">Konuşma Düzeyi</th>
                          <th className="py-3 px-3">Gözlem Notları</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {classStudents.map((stu) => {
                          const ev = activeReportSession.evaluations[stu.id];
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
                            <tr key={stu.id} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3 font-mono-num font-bold text-slate-600">
                                {stu.studentNumber}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">
                                {stu.fullName}
                              </td>
                              {speakingCriteria.map((c) => {
                                const earnedPts = getCriterionEarnedPoints(
                                  c,
                                  activeScores[c.id],
                                  activeDirect[c.id]
                                );
                                return (
                                  <td
                                    key={c.id}
                                    className="py-2.5 px-2.5 text-center font-mono-num font-semibold text-slate-800"
                                  >
                                    {earnedPts !== null ? earnedPts : '—'}
                                  </td>
                                );
                              })}
                              <td
                                data-testid={`session-table-speaking-score-${stu.id}`}
                                className="py-2.5 px-2.5 text-center font-mono-num font-bold text-slate-900"
                              >
                                {dual &&
                                dual.isSpeakingComplete &&
                                dual.finalSpeakingScoreOutOf100 !== null ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-800 text-white">
                                    {dual.finalSpeakingScoreOutOf100}
                                  </span>
                                ) : dual && dual.completedSpeakingCount > 0 ? (
                                  <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                                    Eksik ({dual.completedSpeakingCount}/
                                    {dual.totalSpeakingCount})
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-700">
                                {dual
                                  ? dual.speakingPerformanceLabel
                                  : effectiveCalc.performanceLabel}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                                {[
                                  ev?.note,
                                  ev?.groupNote
                                    ? `[Grup]: ${ev.groupNote}`
                                    : '',
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
                </div>
              )}

            <div
              data-testid="session-signature-grid"
              className="pdf-signature-grid grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-700"
            >
              <div className="pdf-signature-box">
                <div className="font-bold text-slate-900">Ders Öğretmeni</div>
                {effectiveInstitution.teacherName ? (
                  <>
                    <div
                      data-testid="session-signature-teacher-name"
                      className="font-semibold text-slate-800 mt-0.5"
                    >
                      {effectiveInstitution.teacherName}
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
                {effectiveInstitution.principalName ? (
                  <>
                    <div
                      data-testid="session-signature-principal-name"
                      className="font-semibold text-slate-800 mt-0.5"
                    >
                      {effectiveInstitution.principalName}
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

      {/* Delete Session Confirmation Modal in Reports */}
      {showDeleteSessionConfirmModal && activeReportSession && onDeleteSession && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-report-session-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-slate-300 space-y-4">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h2
                  id="delete-report-session-modal-title"
                  className="text-base font-bold text-slate-900"
                >
                  Değerlendirme Oturumunu Sil
                </h2>
                <p className="text-xs text-slate-500">
                  {activeReportSession.title} ({activeReportSession.date})
                </p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-950 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                Kalıcı Silme Uyarısı
              </div>
              <p>
                Bu oturumu sildiğinizde; oturuma ait tüm öğrenci puanları, grup değerlendirmeleri ve gözlem notları kalıcı olarak silinecektir.
              </p>
            </div>

            <p className="text-xs text-slate-600">
              Notları silmeden kaldırmak istiyorsanız <strong>Arşivle</strong> seçeneğini tercih edebilirsiniz.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDeleteSessionConfirmModal(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Vazgeç
              </button>

              {!activeReportSession.archived && (onArchiveSession || onUpdateSession) && (
                <button
                  type="button"
                  onClick={() => {
                    if (onArchiveSession) {
                      onArchiveSession(activeReportSession.id, true);
                    } else if (onUpdateSession) {
                      onUpdateSession({
                        ...activeReportSession,
                        archived: true,
                        archivedAt: new Date().toISOString(),
                      });
                    }
                    setShowDeleteSessionConfirmModal(false);
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Archive className="w-3.5 h-3.5 text-amber-800" />
                  Bunun Yerine Arşivle
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onDeleteSession(activeReportSession.id);
                  setShowDeleteSessionConfirmModal(false);
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Kalıcı Olarak Sil
              </button>
            </div>
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
        institutionSettings={effectiveInstitution}
        initialDualReportMode={dualSessionReportMode}
        onChangeDualReportMode={setDualSessionReportMode}
      />
    </div>
  );
};
