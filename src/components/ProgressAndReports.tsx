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
  ShieldCheck,
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
} from '../utils/rubricLogic.ts';
import { downloadSessionPdfFile } from '../utils/pdfGenerator.ts';

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

  const classSessions = useMemo(
    () =>
      sessions
        .filter((s) => {
          const allowed =
            s.classIds && s.classIds.length > 0 ? s.classIds : [s.classId];
          return activeClassroom ? allowed.includes(activeClassroom.id) : false;
        })
        .sort((a, b) => a.date.localeCompare(b.date)),
    [sessions, activeClassroom]
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

  const handleDownloadCsv = () => {
    setExportError(null);
    if (!activeReportSession || !activeReportRubric) {
      setExportError(
        'Rapor oluşturulamadı: Seçili oturuma ait geçerli rubrik bulunamadı.'
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
      const safeName = activeReportSession.title
        .toLowerCase()
        .replace(/[^a-z0-9ğüşıöç]/gi, '_');
      link.setAttribute('download', `rapor_${safeName}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'CSV dışa aktarma hatası.'
      );
    }
  };

  const handleDownloadPdf = () => {
    setExportError(null);
    if (!activeReportSession || !activeReportRubric || !activeClassroom) {
      setExportError(
        'PDF oluşturulamadı: Oturum, sınıf veya rubrik doğrulanamadı.'
      );
      return;
    }
    try {
      downloadSessionPdfFile(
        activeReportSession,
        activeReportRubric,
        activeClassroom,
        students
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'PDF oluşturma hatası.'
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
      {/* Header & Class Switcher */}
      <div className="no-print flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Öğrenci &amp; Grup Gelişim Takibi ve Resmi Raporlar
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Kesinleşmiş bireysel ve grup puanları, dönemsel gelişim analizi,
            doğrudan indirilebilir PDF ve formül korumalı CSV çıktıları.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="report-class-select" className="sr-only">
            Sınıf Seçin
          </label>
          <select
            id="report-class-select"
            value={activeClassroom?.id || ''}
            onChange={(e) => onSelectClass(e.target.value)}
            className="px-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            {classrooms.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name} — {cls.subject}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-lg bg-slate-200/80 p-1">
            <button
              type="button"
              onClick={() => setViewTab('longitudinal')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                viewTab === 'longitudinal'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Bireysel Gelişim
            </button>
            <button
              type="button"
              onClick={() => setViewTab('group_history')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                viewTab === 'group_history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Grup Dönemsel Geçmişi
            </button>
            <button
              type="button"
              onClick={() => setViewTab('session_table')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                viewTab === 'session_table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Resmi Rapor Tablosu (PDF / CSV)
            </button>
          </div>
        </div>
      </div>

      {exportError && (
        <div
          role="alert"
          className="bg-red-50 border border-red-300 text-red-900 px-4 py-3 rounded-xl text-xs font-semibold"
        >
          {exportError}
        </div>
      )}

      {/* TAB 1: LONGITUDINAL STUDENT TRACKING */}
      {viewTab === 'longitudinal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <aside className="no-print lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-3.5 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900">
                {activeClassroom?.name} Öğrencileri
              </h2>
              <p className="text-xs text-slate-500">
                Yalnızca tüm ölçütleri tamamlanmış kesin değerlendirmeler
                ortalamaya katılır
              </p>
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
                        ? 'bg-teal-50/90 border-l-4 border-l-teal-700'
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
                      <span className="font-mono-num text-xs font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-800">
                        Son: {latest.scoreOutOf100}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="lg:col-span-8 space-y-5">
            {activeStudent ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        Okul No: {activeStudent.studentNumber}
                      </span>
                      <span className="text-xs text-slate-500">
                        {activeClassroom?.name} · {activeClassroom?.subject}
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mt-1">
                      {activeStudent.fullName} — Dönem İçi Gelişim Portfolyosu
                    </h2>
                  </div>

                  <div className="flex items-center gap-2 no-print">
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="px-3.5 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileDown className="w-4 h-4" />
                      PDF İndir
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">
                      Tamamlanan Oturum
                    </div>
                    <div className="font-mono-num text-2xl font-bold text-slate-900 mt-1">
                      {studentSummaryMetrics.count}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">
                      Dönem Ortalaması
                    </div>
                    <div className="font-mono-num text-2xl font-bold text-slate-900 mt-1">
                      {studentSummaryMetrics.avgScore}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        / 100
                      </span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">
                      Son Kesin Puan
                    </div>
                    <div className="font-mono-num text-2xl font-bold text-teal-800 mt-1">
                      {studentSummaryMetrics.latestScore}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        / 100
                      </span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Gelişim Farkı</div>
                    <div
                      className={`font-mono-num text-2xl font-bold mt-1 ${
                        studentSummaryMetrics.delta >= 0
                          ? 'text-emerald-700'
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

                {studentHistory.length > 0 ? (
                  <div className="space-y-4">
                    {studentHistory.map((item) => (
                      <div
                        key={item.sessionId}
                        className="p-4 rounded-xl border border-slate-200 bg-white space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-100">
                          <div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Calendar className="w-3.5 h-3.5" />
                              <span className="font-mono-num">{item.date}</span>
                              <span>·</span>
                              <span>{item.rubricTitle}</span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                              {item.sessionTitle}
                            </h4>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {item.individualScoreOutOf100 !== null && (
                              <span className="text-xs font-mono-num font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                Bireysel: {item.individualScoreOutOf100}
                              </span>
                            )}
                            {item.groupScoreOutOf100 !== null && (
                              <span className="text-xs font-mono-num font-semibold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                                Grup: {item.groupScoreOutOf100}
                              </span>
                            )}
                            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700 flex items-center gap-1">
                              <Award className="w-3.5 h-3.5 text-teal-700" />
                              {item.performanceLabel}
                            </span>
                            <span className="font-mono-num text-sm font-bold px-3 py-1 rounded bg-slate-900 text-white">
                              {item.scoreOutOf100} / 100
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {item.criterionBreakdown.map((cb) => (
                            <div
                              key={cb.criterionTitle}
                              className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between gap-2"
                            >
                              <span className="text-xs font-medium text-slate-700 truncate">
                                {cb.criterionTitle}
                              </span>
                              <span className="font-mono-num text-xs font-bold text-slate-900 shrink-0">
                                {cb.selectedPoints}/{cb.maxPoints} (%
                                {cb.scorePercent})
                              </span>
                            </div>
                          ))}
                        </div>

                        {item.note && (
                          <div className="text-xs text-slate-700 bg-amber-50/70 border border-amber-200/80 rounded-lg p-2.5">
                            <span className="font-bold text-slate-900">
                              Bireysel Gözlem Notu:{' '}
                            </span>
                            {item.note}
                          </div>
                        )}
                        {item.groupNote && (
                          <div className="text-xs text-teal-950 bg-teal-50/70 border border-teal-200 rounded-lg p-2.5">
                            <span className="font-bold">Grup Gözlem Notu: </span>
                            {item.groupNote}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-slate-500">
                    Bu öğrenci için henüz tüm ölçütleri tamamlanmış kesin
                    değerlendirme kaydı bulunmuyor.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* TAB 2: GROUP LONGITUDINAL HISTORY (P1 #6) */}
      {viewTab === 'group_history' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {activeClassroom?.name} — Dönemsel Grup Değerlendirme Geçmişi
              </h2>
              <p className="text-xs text-slate-500">
                Farklı oturumlarda oluşturulan çalışma gruplarının kronolojik
                performans kayıtları
              </p>
            </div>
            <span className="font-mono-num text-xs font-bold px-2.5 py-1 rounded bg-teal-50 text-teal-900 border border-teal-200">
              {groupHistory.length} Grup Kaydı
            </span>
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
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono-num">
                      <span>{gh.date}</span>
                      <span>{gh.memberCount} Öğrenci</span>
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      {gh.groupName}
                    </div>
                    <div className="text-xs font-medium text-teal-800">
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
                      <span className="font-mono-num text-sm font-bold px-2.5 py-0.5 rounded bg-slate-900 text-white">
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
      {viewTab === 'session_table' && activeReportSession && activeReportRubric && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-xs">
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
                className="px-3 py-2 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {classSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.date})
                  </option>
                ))}
              </select>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                Dondurulmuş Rubrik &amp; CSV Formül Koruması Aktif
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="px-4 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                Sayfalandırılmış PDF İndir
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
            <div className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
              Ölçüt Temelli Performans Değerlendirme Çizelgesi
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">
              {activeClassroom?.name} — {activeReportSession.title}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Rubrik: <strong>{activeReportRubric.title}</strong> · Tarih:{' '}
              <span className="font-mono-num">{activeReportSession.date}</span>
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
                      <td className="py-2.5 px-2.5 text-center font-mono-num text-teal-800">
                        {groupCalc.finalScoreOutOf100 !== null
                          ? groupCalc.finalScoreOutOf100
                          : groupCalc.completedCriteriaCount > 0
                          ? `Eksik (${groupCalc.completedCriteriaCount}/${groupCalc.totalCriteriaCount})`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono-num font-bold text-slate-900">
                        {effectiveCalc.isComplete &&
                        effectiveCalc.finalScoreOutOf100 !== null ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200">
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
        </div>
      )}
    </div>
  );
};
