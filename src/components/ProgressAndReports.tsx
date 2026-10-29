import React, { useMemo, useState, useEffect } from 'react';
import { Archive, Download, FileSpreadsheet, Users } from 'lucide-react';
import type { Classroom, Student, Rubric, EvaluationSession, InstitutionSettings } from '../types.ts';
import { getEffectiveSessionRubric, getGroupProgressHistory, getSessionProgressStats, getStudentEvaluationBreakdown, getStudentProgressHistory, generateSessionCsv, sanitizeExportFilename, isDualBookSpeakingRubric } from '../utils/rubricLogic.ts';
import { downloadClassroomOverviewPdfFile, downloadSessionPdfFile, downloadStudentPortfolioPdfFile, type DualReportMode, type PdfColumnPreset } from '../utils/pdfGenerator.ts';
import { ALL_ACADEMIC_TERMS, DEFAULT_ACADEMIC_TERM_OPTIONS, MANAGED_ACADEMIC_TERMS_STORAGE_KEY, addAcademicTerm, deleteAcademicTerm, ensureAutoAcademicTerms, filterSessionsByAcademicTerm, getAcademicTermOptions, computeStudentTermPercentageComparison } from '../utils/academicTermLogic.ts';

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

type View = 'sessions' | 'students' | 'groups';
const inputStyle = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800';
const buttonStyle = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

export const ProgressAndReports: React.FC<ProgressAndReportsProps> = ({ classrooms, students, rubrics, sessions, activeClassId, onSelectClass, onUpdateSession, onArchiveSession, institutionSettings }) => {
  const [view, setView] = useState<View>('sessions');
  const [selectedTerm, setSelectedTerm] = useState(ALL_ACADEMIC_TERMS);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [termManagerOpen, setTermManagerOpen] = useState(false);
  const [termYear, setTermYear] = useState('2026-2027');
  const [semester, setSemester] = useState<'Güz' | 'Bahar'>('Güz');
  const [termError, setTermError] = useState('');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [reportMode, setReportMode] = useState<DualReportMode>('both');
  const [preset, setPreset] = useState<PdfColumnPreset>('with_scores');
  const [managedTerms, setManagedTerms] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(MANAGED_ACADEMIC_TERMS_STORAGE_KEY) || localStorage.getItem('rubrikpad_managed_academic_terms_v1');
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) return ensureAutoAcademicTerms(parsed);
    } catch { /* use defaults */ }
    return ensureAutoAcademicTerms(DEFAULT_ACADEMIC_TERM_OPTIONS);
  });
  useEffect(() => { try { localStorage.setItem(MANAGED_ACADEMIC_TERMS_STORAGE_KEY, JSON.stringify(managedTerms)); } catch { /* existing terms remain usable for this session */ } }, [managedTerms]);

  const classroom = classrooms.find(c => c.id === activeClassId) || classrooms[0];
  const classStudents = useMemo(() => students.filter(s => !s.archived && s.classId === classroom?.id).sort((a, b) => a.studentNumber.localeCompare(b.studentNumber, undefined, { numeric: true })), [students, classroom?.id]);
  const allClassSessions = useMemo(() => sessions.filter(s => !s.archived && classroom && (s.classIds?.length ? s.classIds : [s.classId]).includes(classroom.id)), [sessions, classroom]);
  const classSessions = useMemo(() => filterSessionsByAcademicTerm(allClassSessions, selectedTerm, classroom), [allClassSessions, selectedTerm, classroom]);
  const rubricMap = useMemo(() => Object.fromEntries(rubrics.map(r => [r.id, r])), [rubrics]);
  const terms = useMemo(() => getAcademicTermOptions(allClassSessions, classroom, ensureAutoAcademicTerms(managedTerms, allClassSessions, classroom)), [allClassSessions, classroom, managedTerms]);
  const selectedSession = classSessions.find(s => s.id === selectedSessionId);
  const selectedRubric = getEffectiveSessionRubric(selectedSession, rubricMap);
  const student = classStudents.find(s => s.id === selectedStudentId) || classStudents[0];
  const history = student ? getStudentProgressHistory(student.id, classSessions, rubricMap) : [];
  const comparison = computeStudentTermPercentageComparison(classStudents, allClassSessions, rubricMap, selectedTerm, classroom, managedTerms);
  const groups = getGroupProgressHistory(classSessions, rubricMap, classroom?.id, students);
  const sortedSessions = [...classSessions].sort((a, b) => b.date.localeCompare(a.date));
  const pdfOptions = { preset, dualReportMode: reportMode, ...institutionSettings };

  const downloadPdf = async (kind: 'session' | 'student' | 'class', session?: EvaluationSession) => {
    setError(''); setDownloading(true);
    try {
      if (kind === 'session' && session && classroom) {
        const rubric = getEffectiveSessionRubric(session, rubricMap);
        if (!rubric) throw new Error('Bu değerlendirmeye ait rubrik bulunamadı.');
        await downloadSessionPdfFile(session, rubric, classroom, students, pdfOptions);
      } else if (kind === 'student' && student) {
        await downloadStudentPortfolioPdfFile(student, classroom, classSessions, rubricMap, pdfOptions);
      } else if (kind === 'class' && classroom) {
        await downloadClassroomOverviewPdfFile(classroom, classStudents, classSessions, rubrics, pdfOptions);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'PDF oluşturulamadı.'); }
    finally { setDownloading(false); }
  };
  const downloadCsv = (session: EvaluationSession) => {
    setError('');
    try {
      const rubric = getEffectiveSessionRubric(session, rubricMap);
      if (!rubric || !classroom) throw new Error('Bu değerlendirmeye ait rubrik veya sınıf bulunamadı.');
      const csv = generateSessionCsv(session, rubric, students, classroom.id, reportMode);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a'); link.href = url; link.download = `rapor_${sanitizeExportFilename(session.title, 'oturum')}.csv`; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'CSV oluşturulamadı.'); }
  };
  const archive = (session: EvaluationSession) => {
    if (onArchiveSession) onArchiveSession(session.id, true);
    else onUpdateSession?.({ ...session, archived: true, archivedAt: new Date().toISOString() });
    if (selectedSessionId === session.id) setSelectedSessionId('');
  };
  const addTerm = (event: React.FormEvent) => {
    event.preventDefault();
    const result = addAcademicTerm(managedTerms, termYear, semester);
    if (result.error || !result.addedTerm) { setTermError(result.error || 'Dönem eklenemedi.'); return; }
    setManagedTerms(result.terms); setSelectedTerm(result.addedTerm); setTermError('');
  };
  const removeTerm = (term: string) => {
    const result = deleteAcademicTerm(managedTerms, term, selectedTerm);
    if (result.error || !result.deletedTerm) { setTermError(result.error || 'Dönem silinemedi.'); return; }
    setManagedTerms(result.terms); setSelectedTerm(result.nextSelectedTerm); setTermError('');
  };

  return <div className="w-full space-y-5 px-4 py-6 sm:px-6 lg:px-8">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
      <h1 className="text-2xl font-bold text-slate-900">Gelişim Takibi ve Raporlar</h1>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">Sınıf<select aria-label="Sınıf" className={`${inputStyle} mt-1 block`} value={classroom?.id || ''} disabled={!classroom} onChange={e => { onSelectClass(e.target.value); setSelectedSessionId(''); setSelectedStudentId(''); }}>
          {!classroom && <option value="">Sınıf yok</option>}{classrooms.map(c => <option key={c.id} value={c.id}>{c.name} — {c.gradeLevel} · {c.subject}</option>)}
        </select></label>
        <label className="text-xs font-semibold text-slate-600">Dönem<select aria-label="Dönem" className={`${inputStyle} mt-1 block`} value={selectedTerm} onChange={e => { setSelectedTerm(e.target.value); setSelectedSessionId(''); }}>
          {terms.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select></label>
        <button className={buttonStyle} type="button" onClick={() => setTermManagerOpen(!termManagerOpen)} aria-expanded={termManagerOpen}>Dönemleri yönet</button>
      </div>
    </div>
    {termManagerOpen && <section aria-label="Dönem yönetimi" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <form onSubmit={addTerm} className="flex flex-wrap items-end gap-3"><label className="text-xs font-semibold">Eğitim yılı<input className={`${inputStyle} mt-1 block w-36`} value={termYear} onChange={e => setTermYear(e.target.value)} placeholder="2026-2027" /></label><label className="text-xs font-semibold">Dönem<select className={`${inputStyle} mt-1 block`} value={semester} onChange={e => setSemester(e.target.value === 'Bahar' ? 'Bahar' : 'Güz')}><option>Güz</option><option>Bahar</option></select></label><button className={buttonStyle} type="submit">Dönem ekle</button><button className={buttonStyle} type="button" onClick={() => { setManagedTerms(ensureAutoAcademicTerms(DEFAULT_ACADEMIC_TERM_OPTIONS, allClassSessions, classroom)); setTermError(''); }}>Varsayılan dönemleri yükle</button></form>
      {termError && <p role="alert" className="text-sm text-rose-700">{termError}</p>}
      <div className="flex flex-wrap gap-2">{managedTerms.map(term => <span key={term} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-sm">{term}<button type="button" aria-label={`${term} dönemini sil`} className="font-bold text-rose-700" onClick={() => removeTerm(term)}>×</button></span>)}</div>
    </section>}
    <nav aria-label="Rapor görünümleri" className="flex flex-wrap gap-2">{([['sessions', 'Değerlendirmeler'], ['students', 'Öğrenci gelişimi'], ['groups', 'Grup geçmişi']] as const).map(([key, label]) => <button key={key} type="button" aria-current={view === key ? 'page' : undefined} onClick={() => { setView(key); setError(''); }} className={`${buttonStyle} ${view === key ? '!border-blue-900 !bg-blue-900 !text-white' : ''}`}>{label}</button>)}</nav>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <details className="rounded-xl border border-slate-200 bg-white px-4 py-3"><summary className="cursor-pointer text-sm font-semibold text-slate-700">İndirme seçenekleri</summary><div className="mt-3 flex flex-wrap gap-4"><label className="text-xs font-semibold text-slate-600">PDF içeriği<select className={`${inputStyle} ml-2`} value={preset} onChange={e => setPreset(e.target.value as PdfColumnPreset)}><option value="with_scores">Puanlarla</option><option value="with_notes">Puan ve notlarla</option><option value="names_only">Yalnızca isimler</option></select></label><label className="text-xs font-semibold text-slate-600">İkili değerlendirme<select className={`${inputStyle} ml-2`} value={reportMode} onChange={e => setReportMode(e.target.value as DualReportMode)}><option value="both">Kitap ve konuşma</option><option value="book">Yalnızca kitap</option><option value="speaking">Yalnızca konuşma</option></select></label></div></details>
    {view === 'sessions' && <section className="space-y-3" aria-label="Değerlendirmeler">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-slate-900">Değerlendirmeler <span className="text-sm font-normal text-slate-500">({classSessions.length})</span></h2><button className={buttonStyle} disabled={!classroom || downloading} onClick={() => void downloadPdf('class')}><Download className="h-4 w-4" />Sınıf özeti PDF</button></div>
      {sortedSessions.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Seçilen sınıf ve dönemde değerlendirme bulunmuyor.</p> : <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">{sortedSessions.map(session => {
        const rubric = getEffectiveSessionRubric(session, rubricMap);
        const stats = rubric ? getSessionProgressStats(classStudents, session.evaluations, rubric) : null;
        return <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><h3 className="font-bold text-slate-900">{session.title}</h3><p className="mt-1 text-sm text-slate-600">{session.date} · {rubric?.title || 'Rubrik bulunamadı'} · {session.status === 'completed' ? 'Tamamlandı' : 'Devam ediyor'}{stats && ` · ${stats.fullyEvaluatedCount}/${stats.totalStudents} öğrenci tamamlandı`}</p></div><div className="flex flex-wrap gap-2"><button className={buttonStyle} aria-expanded={selectedSessionId === session.id} onClick={() => setSelectedSessionId(selectedSessionId === session.id ? '' : session.id)}>Puanlar</button><button className={buttonStyle} disabled={!rubric || downloading} onClick={() => void downloadPdf('session', session)}><Download className="h-4 w-4" />PDF</button><button className={buttonStyle} disabled={!rubric} onClick={() => downloadCsv(session)}><FileSpreadsheet className="h-4 w-4" />CSV</button>{(onArchiveSession || onUpdateSession) && <button className={buttonStyle} onClick={() => archive(session)}><Archive className="h-4 w-4" />Arşivle</button>}</div></div>;
      })}</div>}
      {selectedSession && <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Değerlendirme puanları"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-bold text-slate-900">{selectedSession.title} — Puanlar</h3><button className={buttonStyle} onClick={() => setSelectedSessionId('')}>Kapat</button></div>{!selectedRubric ? <p className="text-sm text-rose-700">Bu değerlendirmeye ait rubrik bulunamadı.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-slate-600"><tr><th className="p-2">Öğrenci</th><th className="p-2">Durum</th><th className="p-2">{isDualBookSpeakingRubric(selectedRubric) ? 'Kitap sunumu' : 'Kesin not'}</th>{isDualBookSpeakingRubric(selectedRubric) && <th className="p-2">Konuşma sınavı</th>}</tr></thead><tbody>{classStudents.map(s => { const { effectiveCalc } = getStudentEvaluationBreakdown(selectedRubric, selectedSession.evaluations[s.id]); return <tr key={s.id} className="border-b border-slate-100"><td className="p-2">#{s.studentNumber} {s.fullName}</td><td className="p-2">{effectiveCalc.isComplete ? 'Tamamlandı' : effectiveCalc.completedCriteriaCount ? `Eksik (${effectiveCalc.completedCriteriaCount}/${effectiveCalc.totalCriteriaCount})` : 'Başlanmadı'}</td><td className="p-2">{effectiveCalc.finalScoreOutOf100 ?? '—'}</td>{isDualBookSpeakingRubric(selectedRubric) && <td className="p-2">{effectiveCalc.dualResult?.finalSpeakingScoreOutOf100 ?? '—'}</td>}</tr>; })}</tbody></table>{!classStudents.length && <p className="p-3 text-sm text-slate-600">Bu sınıfta öğrenci bulunmuyor.</p>}</div>}</section>}
    </section>}
    {view === 'students' && <section className="space-y-4" aria-label="Öğrenci gelişimi"><div className="flex flex-wrap items-end justify-between gap-3"><label className="text-xs font-semibold text-slate-600">Öğrenci<select className={`${inputStyle} mt-1 block`} value={student?.id || ''} disabled={!student} onChange={e => setSelectedStudentId(e.target.value)}>{!student && <option value="">Öğrenci yok</option>}{classStudents.map(s => <option key={s.id} value={s.id}>#{s.studentNumber} {s.fullName}</option>)}</select></label><button className={buttonStyle} disabled={!student || downloading} onClick={() => void downloadPdf('student')}><Download className="h-4 w-4" />Öğrenci raporu PDF</button></div>
      {student && <><div className="flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm"><span>Tamamlanan değerlendirme: <strong>{history.length}</strong></span><span>Ortalama: <strong>{history.length ? Math.round(history.reduce((sum, item) => sum + item.scoreOutOf100, 0) / history.length) : '—'}</strong></span><span>Son puan: <strong>{history.at(-1)?.scoreOutOf100 ?? '—'}</strong></span></div><div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 p-4 font-bold">Değerlendirme geçmişi</div>{history.length ? [...history].reverse().map(item => <details key={item.sessionId} className="border-b border-slate-100 p-4"><summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm"><span><strong>{item.sessionTitle}</strong><span className="ml-2 text-slate-500">{item.date}</span></span><span className="font-semibold text-blue-900">{item.isDualEvaluation ? `Kitap: ${item.bookPresentationScoreOutOf100 ?? '—'} · Konuşma: ${item.speakingExamScoreOutOf100 ?? '—'}` : `${item.finalScoreOutOf100} / 100`}</span></summary><div className="mt-3 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">{item.criterionBreakdown.map((c, i) => <div key={i} className="flex justify-between gap-2"><span>{c.criterionTitle}</span><span className="shrink-0 font-semibold">{c.selectedPoints}/{c.maxPoints}</span></div>)}</div>{item.note && <p className="mt-3 text-sm">Not: {item.note}</p>}{item.groupNote && <p className="mt-2 text-sm">Grup notu: {item.groupNote}</p>}</details>) : <p className="p-4 text-sm text-slate-600">Tamamlanmış değerlendirme bulunmuyor.</p>}</div></>}
      <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold">Dönem karşılaştırması</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200"><tr><th className="p-2">Öğrenci</th><th className="p-2">{comparison.previousTerm}</th><th className="p-2">{comparison.currentTerm}</th><th className="p-2">Fark</th><th className="p-2">Değişim</th></tr></thead><tbody>{comparison.rows.map(row => <tr key={row.studentId} className="border-b border-slate-100"><td className="p-2">#{row.studentNumber} {row.fullName}</td><td className="p-2">{row.previousAverage ?? '—'}</td><td className="p-2">{row.currentAverage ?? '—'}</td><td className="p-2">{row.pointDelta ?? '—'}</td><td className="p-2">{row.percentageChange === null ? '—' : `%${row.percentageChange}`}</td></tr>)}</tbody></table></div></details>
    </section>}
    {view === 'groups' && <section className="space-y-3" aria-label="Grup geçmişi"><h2 className="flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5" />Grup geçmişi</h2>{groups.length ? <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">{[...groups].reverse().map((g, i) => <div key={`${g.sessionId}-${g.groupId}-${i}`} className="p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{g.groupName} · {g.sessionTitle}</strong><span>{g.isComplete ? `${g.scoreOutOf100} / 100` : `Taslak (${g.provisionalScoreOutOf100})`}</span></div><p className="mt-1 text-slate-600">{g.date} · {g.memberIds.map(id => students.find(s => s.id === id)?.fullName).filter(Boolean).join(', ') || 'Öğrenci yok'}</p>{g.groupNote && <p className="mt-2">{g.groupNote}</p>}</div>)}</div> : <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Grup değerlendirmesi bulunmuyor.</p>}</section>}
  </div>;
};
