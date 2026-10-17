import React, { useState, useMemo } from 'react';
import {
  Download,
  Printer,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  BarChart3,
  X,
} from 'lucide-react';
import type {
  Classroom,
  Student,
  Rubric,
  EvaluationSession,
} from '../types.ts';
import {
  calculateWeightedScore,
  getStudentProgressHistory,
  generateSessionCsv,
} from '../utils/rubricLogic.ts';

interface ProgressAndReportsProps {
  classrooms: Classroom[];
  students: Student[];
  rubrics: Rubric[];
  sessions: EvaluationSession[];
  initialSelectedStudentId?: string;
}

export const ProgressAndReports: React.FC<ProgressAndReportsProps> = ({
  classrooms,
  students,
  rubrics,
  sessions,
  initialSelectedStudentId,
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (initialSelectedStudentId) {
      const st = students.find((s) => s.id === initialSelectedStudentId);
      if (st) return st.classId;
    }
    return classrooms[0]?.id || '';
  });

  const classStudents = useMemo(
    () =>
      students.filter((s) => s.classId === selectedClassId),
    [students, selectedClassId]
  );

  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    () => initialSelectedStudentId || classStudents[0]?.id || ''
  );

  const classSessions = useMemo(
    () => sessions.filter((s) => s.classId === selectedClassId),
    [sessions, selectedClassId]
  );

  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    () => classSessions[classSessions.length - 1]?.id || sessions[0]?.id || ''
  );

  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const rubricsById = useMemo(() => {
    const map: Record<string, Rubric> = {};
    for (const r of rubrics) map[r.id] = r;
    return map;
  }, [rubrics]);

  const activeStudent = useMemo(
    () =>
      classStudents.find((s) => s.id === selectedStudentId) ||
      classStudents[0] ||
      null,
    [classStudents, selectedStudentId]
  );

  const activeSession = useMemo(
    () =>
      classSessions.find((s) => s.id === selectedSessionId) ||
      classSessions[classSessions.length - 1] ||
      sessions[0],
    [classSessions, selectedSessionId, sessions]
  );

  const activeRubric = useMemo(
    () => (activeSession ? rubricsById[activeSession.rubricId] || rubrics[0] : rubrics[0]),
    [activeSession, rubricsById, rubrics]
  );

  const activeClassroom = useMemo(
    () => classrooms.find((c) => c.id === selectedClassId) || classrooms[0],
    [classrooms, selectedClassId]
  );

  // Longitudinal history for the selected student
  const studentHistory = useMemo(() => {
    if (!activeStudent) return [];
    return getStudentProgressHistory(activeStudent.id, classSessions, rubricsById);
  }, [activeStudent, classSessions, rubricsById]);

  const progressDelta = useMemo(() => {
    if (studentHistory.length < 2) return 0;
    const first = studentHistory[0].scoreOutOf100;
    const last = studentHistory[studentHistory.length - 1].scoreOutOf100;
    return last - first;
  }, [studentHistory]);

  // Criterion mastery averages across all sessions for the active student
  const criterionMastery = useMemo(() => {
    if (studentHistory.length === 0) return [];
    const map: Record<string, { sum: number; count: number }> = {};
    for (const item of studentHistory) {
      for (const cb of item.criterionBreakdown) {
        if (!map[cb.criterionTitle]) {
          map[cb.criterionTitle] = { sum: 0, count: 0 };
        }
        map[cb.criterionTitle].sum += cb.scorePercent;
        map[cb.criterionTitle].count += 1;
      }
    }
    return Object.entries(map).map(([title, data]) => ({
      title,
      avgPercent: Math.round(data.sum / data.count),
    }));
  }, [studentHistory]);

  // Export CSV Handler
  const handleDownloadCsv = () => {
    if (!activeSession || !activeRubric) return;
    const csvContent = generateSessionCsv(activeSession, activeRubric, classStudents);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeTitle = activeSession.title
      .toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]/gi, '_');
    link.setAttribute('download', `degerlendirme_raporu_${safeTitle}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportFeedback(
      `"${activeSession.title}" sonuçları CSV (Excel uyumlu) biçiminde indirildi.`
    );
    setTimeout(() => setExportFeedback(null), 4000);
  };

  // Trigger Print / Save as PDF
  const handlePrintPdf = () => {
    setIsPdfPreviewOpen(true);
    setExportFeedback(
      'PDF Raporu hazırlandı. Yazdır penceresinden "PDF Olarak Kaydet" seçeneğini kullanabilirsiniz.'
    );
    setTimeout(() => {
      try {
        window.print();
      } catch {
        // Ignore if blocked in headless test
      }
    }, 200);
  };

  // SVG Chart Geometry Calculation
  const chartWidth = 640;
  const chartHeight = 220;
  const padLeft = 44;
  const padRight = 32;
  const padTop = 24;
  const padBottom = 38;
  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;

  const chartPoints = studentHistory.map((item, idx) => {
    const count = studentHistory.length;
    const x =
      count === 1
        ? padLeft + plotW / 2
        : padLeft + (idx / (count - 1)) * plotW;
    const y = padTop + plotH - (item.scoreOutOf100 / 100) * plotH;
    return { x, y, ...item };
  });

  const polylinePoints = chartPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPoints =
    chartPoints.length > 1
      ? `${chartPoints[0].x},${padTop + plotH} ${polylinePoints} ${
          chartPoints[chartPoints.length - 1].x
        },${padTop + plotH}`
      : '';

  return (
    <div className="space-y-6">
      {/* Header & Class Switcher */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Öğrenci Gelişim Grafikleri ve Raporlama Merkezi
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Öğrencilerin oturumlar arası gelişim eğrilerini inceleyin, değerlendirme sonuçlarını PDF ve CSV olarak dışa aktarın.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {classrooms.map((cls) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => {
                  setSelectedClassId(cls.id);
                  const firstStu = students.find((s) => s.classId === cls.id);
                  if (firstStu) setSelectedStudentId(firstStu.id);
                  const firstSes = sessions.find((s) => s.classId === cls.id);
                  if (firstSes) setSelectedSessionId(firstSes.id);
                }}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  cls.id === selectedClassId
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cls.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {exportFeedback && (
        <div
          role="status"
          className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between no-print"
        >
          <span>{exportFeedback}</span>
          <button
            type="button"
            onClick={() => setExportFeedback(null)}
            aria-label="Bildirimi kapat"
            className="text-emerald-800 hover:text-emerald-950 font-bold cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: Longitudinal Student Growth Chart & Criterion Mastery */}
      <section
        aria-label="Öğrenci Gelişim Grafiği"
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 no-print"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-5 h-5 text-sky-700" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Bireysel Öğrenci Gelişim Süreci Takibi
              </h2>
              <p className="text-xs text-slate-500">
                Farklı değerlendirme oturumlarındaki puan değişimi ve ölçüt bazlı yetkinlik düzeyi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label
              htmlFor="progress-student-select"
              className="text-xs font-semibold text-slate-600 whitespace-nowrap"
            >
              Öğrenci Seçin:
            </label>
            <select
              id="progress-student-select"
              value={activeStudent?.id || ''}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="px-3.5 py-2 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
            >
              {classStudents.map((stu) => (
                <option key={stu.id} value={stu.id}>
                  #{stu.studentNumber} — {stu.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeStudent && studentHistory.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Cols: SVG Longitudinal Line & Area Chart */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs text-slate-500">Öğrenci</span>
                  <h3 className="text-base font-bold text-slate-900">
                    {activeStudent.fullName} (#{activeStudent.studentNumber})
                  </h3>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Son Puan: </span>
                    <strong className="font-mono-num text-sm text-slate-900">
                      {studentHistory[studentHistory.length - 1].scoreOutOf100}/100
                    </strong>
                  </div>
                  <span aria-hidden="true">·</span>
                  <div>
                    <span className="text-slate-500">Gelişim Farkı: </span>
                    <strong
                      className={`font-mono-num text-sm ${
                        progressDelta >= 0 ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {progressDelta >= 0 ? `+${progressDelta}` : progressDelta} Puan
                    </strong>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-auto overflow-visible"
                  role="img"
                  aria-label={`${activeStudent.fullName} gelişim grafiği`}
                >
                  <defs>
                    <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0284C7" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#0284C7" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal reference grid lines (25, 50, 75, 100) */}
                  {[0, 25, 50, 75, 100].map((val) => {
                    const y = padTop + plotH - (val / 100) * plotH;
                    return (
                      <g key={val}>
                        <line
                          x1={padLeft}
                          y1={y}
                          x2={chartWidth - padRight}
                          y2={y}
                          stroke="#E2E8F0"
                          strokeDasharray={val === 0 || val === 100 ? 'none' : '4 4'}
                          strokeWidth="1"
                        />
                        <text
                          x={padLeft - 8}
                          y={y + 4}
                          textAnchor="end"
                          className="text-[11px] fill-slate-400 font-mono"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {/* Area under curve */}
                  {areaPoints && (
                    <polygon points={areaPoints} fill="url(#scoreAreaGrad)" />
                  )}

                  {/* Connecting line */}
                  {chartPoints.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#0284C7"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={polylinePoints}
                    />
                  )}

                  {/* Data nodes & labels */}
                  {chartPoints.map((pt, idx) => (
                    <g key={pt.sessionId}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="6"
                        fill="#FFFFFF"
                        stroke="#0284C7"
                        strokeWidth="3"
                      />
                      <text
                        x={pt.x}
                        y={pt.y - 12}
                        textAnchor="middle"
                        className="text-xs font-bold fill-slate-900 font-mono"
                      >
                        {pt.scoreOutOf100}
                      </text>
                      <text
                        x={pt.x}
                        y={padTop + plotH + 18}
                        textAnchor="middle"
                        className="text-[11px] fill-slate-600 font-medium"
                      >
                        {idx + 1}. Oturum ({pt.date.slice(5)})
                      </text>
                    </g>
                  ))}
                </svg>
              </div>

              {/* Chronological Session History Notes */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700">
                  Oturum Geçmişi ve Öğretmen Gözlem Notları
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {studentHistory.map((h) => (
                    <div key={h.sessionId} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          {h.sessionTitle}
                        </span>
                        <span className="font-mono-num font-bold text-sky-700">
                          {h.scoreOutOf100}/100 ({h.performanceLabel})
                        </span>
                      </div>
                      <div className="text-slate-500">
                        Tarih: <span className="font-mono-num">{h.date}</span> · Rubrik: {h.rubricTitle}
                      </div>
                      {h.note && (
                        <p className="text-slate-700 bg-slate-50 p-2 rounded mt-1">
                          Gözlem: &ldquo;{h.note}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 5 Cols: Criterion Mastery Bars */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-sky-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Ölçüt Bazlı Ortalama Yetkinlik Düzeyi
                </h3>
              </div>
              <p className="text-xs text-slate-600">
                {activeStudent.fullName} adlı öğrencinin tüm değerlendirme oturumlarındaki ölçüt başarı ortalamaları:
              </p>

              <div className="space-y-3.5">
                {criterionMastery.map((cm) => (
                  <div key={cm.title} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{cm.title}</span>
                      <span className="font-mono-num font-bold text-slate-900">
                        %{cm.avgPercent}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          cm.avgPercent >= 85
                            ? 'bg-emerald-600'
                            : cm.avgPercent >= 70
                            ? 'bg-sky-600'
                            : 'bg-amber-600'
                        }`}
                        style={{ width: `${cm.avgPercent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500">
            Seçili öğrenci için henüz tamamlanmış değerlendirme verisi bulunmuyor.
          </div>
        )}
      </section>

      {/* SECTION 2: Session Evaluation Table & Export (PDF / CSV) */}
      <section
        aria-label="Oturum Raporlama ve Dışa Aktarma"
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 no-print">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
            <div>
              <label
                htmlFor="report-session-select"
                className="block text-xs font-semibold text-slate-500 mb-1"
              >
                Raporlanacak Değerlendirme Oturumu
              </label>
              <select
                id="report-session-select"
                value={activeSession?.id || ''}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="px-3.5 py-2 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                {classSessions.map((ses) => (
                  <option key={ses.id} value={ses.id}>
                    {ses.title} ({ses.date})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              CSV İndir (Excel / e-Okul)
            </button>

            <button
              type="button"
              onClick={() => setIsPdfPreviewOpen((prev) => !prev)}
              className="px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileText className="w-4 h-4 text-sky-700" />
              {isPdfPreviewOpen ? 'PDF Önizlemeyi Kapat' : 'PDF Raporu Önizle'}
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              PDF Raporu Yazdır / Kaydet
            </button>
          </div>
        </div>

        {/* Printable Official Report Header (Always visible in print or when PDF preview is active) */}
        {activeSession && activeRubric && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-500">
                  ÖLÇÜT TEMELLİ DEĞERLENDİRME SONUÇ ÇİZELGESİ
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {activeClassroom.name} — {activeSession.title}
                </h3>
                <p className="text-xs text-slate-600">
                  Kullanılan Rubrik: {activeRubric.title} · Tarih:{' '}
                  <span className="font-mono-num">{activeSession.date}</span>
                </p>
              </div>
              <div className="text-xs text-slate-600 sm:text-right">
                <div>Ders: {activeClassroom.subject}</div>
                <div>Akademik Yıl: {activeClassroom.academicYear}</div>
              </div>
            </div>

            {/* Full Results Table */}
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
                    <th className="py-3 px-3 w-20">No</th>
                    <th className="py-3 px-3">Öğrenci Adı Soyadı</th>
                    {activeRubric.criteria.map((c) => (
                      <th key={c.id} className="py-3 px-2.5 text-right">
                        <span className="block truncate max-w-[130px]" title={c.title}>
                          {c.title}
                        </span>
                        <span className="font-mono-num text-[11px] font-normal text-slate-500">
                          (%{c.weight})
                        </span>
                      </th>
                    ))}
                    <th className="py-3 px-3 text-right">Toplam (100)</th>
                    <th className="py-3 px-3">Düzey & Yöntem</th>
                    <th className="py-3 px-3">Gözlem Notu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {classStudents.map((stu) => {
                    const ev = activeSession.evaluations[stu.id];
                    const scores = ev?.criterionScores || {};
                    const calc = calculateWeightedScore(activeRubric, scores);

                    return (
                      <tr key={stu.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-3 font-mono-num font-semibold text-slate-700">
                          {stu.studentNumber}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-900">
                          {stu.fullName}
                        </td>
                        {activeRubric.criteria.map((c) => {
                          const pts = scores[c.id];
                          return (
                            <td
                              key={c.id}
                              className="py-3 px-2.5 text-right font-mono-num text-slate-700"
                            >
                              {typeof pts === 'number' ? `${pts}/${activeRubric.maxLevelPoints}` : '—'}
                            </td>
                          );
                        })}
                        <td className="py-3 px-3 text-right font-mono-num font-bold text-slate-900">
                          {calc.completedCriteriaCount > 0 ? calc.scoreOutOf100 : '—'}
                        </td>
                        <td className="py-3 px-3 text-slate-700">
                          <span className="font-semibold">{calc.performanceLabel}</span>
                          {ev?.evaluatedViaGroup && (
                            <span className="block text-[11px] text-sky-700">
                              Grup: {ev.evaluatedViaGroup}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 max-w-xs">
                          {ev?.note || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {isPdfPreviewOpen && (
              <div className="p-5 rounded-xl border border-slate-300 bg-slate-50 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">
                    Resmî Belgelendirme & İmza Bloğu (PDF Çıktısı İçin Hazır)
                  </h4>
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="text-xs font-semibold text-sky-700 hover:underline flex items-center gap-1 cursor-pointer no-print"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV Yedeğini İndir
                  </button>
                </div>
                <p className="text-xs text-slate-600">
                  Oturum Genel Gözlem Notu:{' '}
                  {activeSession.generalSessionNote ||
                    'Sınıf içi ölçüt temelli değerlendirme rubrik yönergesine uygun olarak tamamlanmıştır.'}
                </p>
                <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200 text-xs text-slate-700">
                  <div>
                    <div className="font-bold">Ders Öğretmeni</div>
                    <div className="mt-6 text-slate-400">İmza / Tarih: {activeSession.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">Okul Müdürlüğü / Zümre Başkanı</div>
                    <div className="mt-6 text-slate-400">Onay / Mühür</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
