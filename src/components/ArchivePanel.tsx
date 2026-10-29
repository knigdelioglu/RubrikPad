import React, { useMemo, useState } from 'react';
import type { Classroom, Student, Rubric, EvaluationSession } from '../types.ts';
import { resolveSessionAcademicTerm } from '../utils/academicTermLogic.ts';
import { generateSessionCsv, getCriterionEarnedPoints, getEffectiveSessionRubric, getStudentEvaluationBreakdown, sanitizeExportFilename } from '../utils/rubricLogic.ts';
import { downloadSessionPdfFile } from '../utils/pdfGenerator.ts';

interface Props {
  classrooms: Classroom[];
  students: Student[];
  rubrics: Rubric[];
  sessions: EvaluationSession[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ArchivePanel({ classrooms, students, rubrics, sessions, onRestore, onDelete }: Props) {
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [termFilter, setTermFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [tableClassId, setTableClassId] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const [error, setError] = useState('');
  const archived = useMemo(() => sessions.filter(s => s.archived), [sessions]);
  const rubricsById = useMemo(() => Object.fromEntries(rubrics.map(r => [r.id, r])), [rubrics]);
  const classIds = (s: EvaluationSession) => s.classIds?.length ? s.classIds : [s.classId];
  const sessionClasses = (s: EvaluationSession) => classrooms.filter(c => classIds(s).includes(c.id));
  const subjects = Array.from(new Set(archived.flatMap(s => sessionClasses(s).map(c => c.subject)))).sort();
  const terms = Array.from(new Set(archived.flatMap(s => sessionClasses(s).map(c => resolveSessionAcademicTerm(s, c))))).sort().reverse();
  const filtered = archived.filter(s => {
    const classes = sessionClasses(s);
    const matchesClass = classes.some(c => (!classFilter || c.id === classFilter) && (!subjectFilter || c.subject === subjectFilter) && (!termFilter || resolveSessionAcademicTerm(s, c) === termFilter));
    const search = [s.title, s.date, getEffectiveSessionRubric(s, rubricsById)?.title, ...classes.flatMap(c => [c.name, c.subject])].join(' ').toLocaleLowerCase('tr');
    return (matchesClass || (!classes.length && !classFilter && !subjectFilter && !termFilter)) && search.includes(query.trim().toLocaleLowerCase('tr'));
  }).sort((a, b) => (b.archivedAt || b.date).localeCompare(a.archivedAt || a.date));
  const selected = filtered.find(s => s.id === selectedId);
  const classes = selected ? sessionClasses(selected) : [];
  const classroom = classes.find(c => c.id === tableClassId) || classes.find(c => c.id === classFilter) || classes[0];
  const rubric = selected ? getEffectiveSessionRubric(selected, rubricsById) : null;
  const classStudents = students.filter(s => !s.archived && s.classId === classroom?.id).sort((a, b) => a.studentNumber.localeCompare(b.studentNumber, 'tr', { numeric: true }));
  const exportCsv = () => {
    if (!selected || !rubric || !classroom) return;
    try {
      const csv = generateSessionCsv(selected, rubric, students, classroom.id);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `degerlendirme_${sanitizeExportFilename(selected.title, 'oturum')}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'CSV oluşturulamadı.'); }
  };
  const exportPdf = async () => {
    if (!selected || !rubric || !classroom) return;
    try { await downloadSessionPdfFile(selected, rubric, classroom, students); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'PDF oluşturulamadı.'); }
  };
  const control = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800';
  const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50';
  return <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-4">
    <div><h1 className="text-xl font-bold text-slate-900">Arşiv</h1><p className="mt-1 text-sm text-slate-600">Arşivlenen değerlendirmeler aktif listelerde ve ortalamalarda yer almaz.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-semibold text-slate-700">Ara<input className={`${control} mt-1 w-full`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Değerlendirme, sınıf veya ders" /></label>
      <label className="text-sm font-semibold text-slate-700">Sınıf<select className={`${control} mt-1 w-full`} value={classFilter} onChange={e => setClassFilter(e.target.value)}><option value="">Tüm sınıflar</option>{classrooms.map(c => <option key={c.id} value={c.id}>{c.name} — {c.subject}</option>)}</select></label>
      <label className="text-sm font-semibold text-slate-700">Ders<select className={`${control} mt-1 w-full`} value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}><option value="">Tüm dersler</option>{subjects.map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="text-sm font-semibold text-slate-700">Dönem<select className={`${control} mt-1 w-full`} value={termFilter} onChange={e => setTermFilter(e.target.value)}><option value="">Tüm dönemler</option>{terms.map(t => <option key={t}>{t}</option>)}</select></label>
    </div>
    {filtered.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{archived.length ? 'Filtrelere uygun arşiv kaydı bulunamadı.' : 'Henüz arşivlenmiş değerlendirme yok.'}</p> :
      <div className="space-y-2">{filtered.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div><div className="font-bold text-slate-900">{s.title}</div><div className="text-sm text-slate-600">{sessionClasses(s).map(c => `${c.name} · ${c.subject}`).join(', ') || 'Sınıf bulunamadı'} · {s.date}</div></div>
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => { setSelectedId(s.id); setTableClassId(''); setError(''); }}>Puan çizelgesi</button><button className={button} onClick={() => { onRestore(s.id); setSelectedId(''); }}>Arşivden çıkar</button><button className={`${button} text-rose-700`} onClick={() => setDeleteId(s.id)}>Kalıcı sil</button></div>
      </div>)}</div>}
    {selected && <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" aria-label="Arşiv puan çizelgesi">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-slate-900">{selected.title} — Puan çizelgesi</h2><div className="flex flex-wrap gap-2">{classes.length > 1 && <label className="text-sm">Sınıf <select className={control} value={classroom?.id || ''} onChange={e => setTableClassId(e.target.value)}>{classes.map(c => <option key={c.id} value={c.id}>{c.name} — {c.subject}</option>)}</select></label>}<button className={button} disabled={!rubric || !classroom} onClick={exportCsv}>CSV indir</button><button className={button} disabled={!rubric || !classroom} onClick={() => void exportPdf()}>PDF indir</button><button className={button} onClick={() => setSelectedId('')}>Kapat</button></div></div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {!rubric || !classroom ? <p className="text-sm text-rose-700">Bu değerlendirmeye ait rubrik veya sınıf bulunamadı; çizelge oluşturulamıyor.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-300"><th className="p-2">No</th><th className="p-2">Öğrenci</th>{rubric.criteria.map(c => <th key={c.id} className="p-2">{c.title}</th>)}<th className="p-2">Kesin not</th>{rubric.scoringMode === 'dual_book_and_speaking' && <th className="p-2">Konuşma sınavı</th>}<th className="p-2">Not</th></tr></thead><tbody>{classStudents.map(student => {
        const ev = selected.evaluations[student.id]; const { effectiveCalc, activeSource } = getStudentEvaluationBreakdown(rubric, ev);
        const scores = activeSource === 'group' ? ev?.groupCriterionScores : ev?.criterionScores;
        const direct = activeSource === 'group' ? ev?.groupDirectScores : ev?.directCriterionScores;
        return <tr key={student.id} className="border-b border-slate-100"><td className="p-2">{student.studentNumber}</td><td className="p-2">{student.fullName}</td>{rubric.criteria.map(c => <td key={c.id} className="p-2">{getCriterionEarnedPoints(c, scores?.[c.id], direct?.[c.id]) ?? '—'}</td>)}<td className="p-2">{effectiveCalc.finalScoreOutOf100 ?? '—'}</td>{rubric.scoringMode === 'dual_book_and_speaking' && <td className="p-2">{effectiveCalc.dualResult?.finalSpeakingScoreOutOf100 ?? '—'}</td>}<td className="p-2">{ev?.note || '—'}</td></tr>;
      })}</tbody></table>{!classStudents.length && <p className="p-3 text-sm text-slate-600">Bu sınıfta gösterilecek aktif öğrenci yok.</p>}</div>}
    </section>}
    {deleteId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="archive-delete-title"><div className="w-full max-w-md rounded-xl bg-white p-5 space-y-4"><h2 id="archive-delete-title" className="font-bold text-slate-900">Değerlendirmeyi kalıcı sil</h2><p className="text-sm text-slate-700">“{archived.find(s => s.id === deleteId)?.title}” değerlendirmesi ve tüm puanları, grup kayıtları ve notları kalıcı olarak silinecek.</p><div className="flex justify-end gap-2"><button className={button} onClick={() => setDeleteId('')}>Vazgeç</button><button className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-bold text-white hover:bg-rose-800" onClick={() => { onDelete(deleteId); setDeleteId(''); if (selectedId === deleteId) setSelectedId(''); }}>Kalıcı sil</button></div></div></div>}
  </div>;
}
