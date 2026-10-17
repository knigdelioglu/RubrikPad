import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import { Rubric, Student, StudentEvaluation } from '../types';

interface ResultsAnalyticsViewProps {
  rubrics: Rubric[];
  students: Student[];
  evaluations: StudentEvaluation[];
  selectedRubricId: string;
  onSelectRubric: (id: string) => void;
}

export const ResultsAnalyticsView: React.FC<ResultsAnalyticsViewProps> = ({
  rubrics,
  students,
  evaluations,
  selectedRubricId,
  onSelectRubric,
}) => {
  const activeRubric = useMemo(
    () => rubrics.find((r) => r.id === selectedRubricId) || rubrics[0],
    [rubrics, selectedRubricId]
  );

  const rubricEvaluations = useMemo(() => {
    if (!activeRubric) return [];
    return evaluations.filter((e) => e.rubricId === activeRubric.id);
  }, [evaluations, activeRubric]);

  if (!activeRubric) return null;

  const maxRubricScore = activeRubric.criteria.reduce(
    (acc, c) => acc + c.maxPoints,
    0
  );

  const averageScore =
    rubricEvaluations.length > 0
      ? (
          rubricEvaluations.reduce((acc, e) => acc + e.totalScore, 0) /
          rubricEvaluations.length
        ).toFixed(1)
      : '0.0';

  const handleExportCSV = () => {
    const headers = [
      'Öğrenci No',
      'Ad Soyad',
      'Sınıf',
      ...activeRubric.criteria.map((c) => `${c.title} (${c.maxPoints}p)`),
      `Toplam Puan (${maxRubricScore}p)`,
      'Değerlendirme Notu',
    ];

    const rows = students.map((st) => {
      const ev = rubricEvaluations.find((e) => e.studentId === st.id);
      const critCols = activeRubric.criteria.map((c) =>
        ev && typeof ev.scores[c.id] === 'number' ? String(ev.scores[c.id]) : ''
      );
      return [
        st.studentNumber,
        st.name,
        st.className,
        ...critCols,
        ev ? String(ev.totalScore) : '',
        ev?.note || '',
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeRubric.title.toLowerCase().replace(/\s+/g, '-')}-sonuclar.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label
              htmlFor="analytics-rubric"
              className="block text-xs font-medium text-slate-500 mb-1"
            >
              Analiz Edilen Rubrik
            </label>
            <select
              id="analytics-rubric"
              value={activeRubric.id}
              onChange={(e) => onSelectRubric(e.target.value)}
              className="text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-600"
            >
              {rubrics.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.criteria.length} Kriter)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-6 pl-4 border-l border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">Değerlendirilen</span>
              <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                {rubricEvaluations.length} / {students.length}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Sınıf Ortalaması</span>
              <span className="text-base font-bold font-mono tabular-nums text-sky-700">
                {averageScore} / {maxRubricScore} Puan
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>CSV Olarak İndir</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600">
                <th className="py-3 px-3 font-semibold whitespace-nowrap">
                  Öğrenci
                </th>
                <th className="py-3 px-3 font-semibold whitespace-nowrap">
                  Sınıf
                </th>
                {activeRubric.criteria.map((c, i) => (
                  <th
                    key={c.id}
                    className="py-3 px-2.5 font-semibold text-right whitespace-nowrap"
                    title={c.title}
                  >
                    K{i + 1} ({c.maxPoints}p)
                  </th>
                ))}
                <th className="py-3 px-3 font-bold text-right text-slate-900 whitespace-nowrap">
                  Toplam ({maxRubricScore}p)
                </th>
                <th className="py-3 px-3 font-semibold">Not</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {students.map((st) => {
                const ev = rubricEvaluations.find((e) => e.studentId === st.id);
                return (
                  <tr key={st.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                      {st.name}{' '}
                      <span className="text-slate-400 font-mono font-normal">
                        ({st.studentNumber})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                      {st.className}
                    </td>
                    {activeRubric.criteria.map((c) => {
                      const val = ev?.scores[c.id];
                      return (
                        <td
                          key={c.id}
                          className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700"
                        >
                          {typeof val === 'number' ? `${val}` : '—'}
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                      {ev ? `${ev.totalScore}p` : 'Değerlendirilmedi'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">
                      {ev?.note || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
