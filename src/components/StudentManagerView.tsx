import React, { useState } from 'react';
import { UserPlus, Trash2, Users } from 'lucide-react';
import { Student } from '../types';

interface StudentManagerViewProps {
  students: Student[];
  onAddStudent: (student: Student) => void;
  onBulkAddStudents: (students: Student[]) => void;
  onDeleteStudent: (id: string) => void;
}

export const StudentManagerView: React.FC<StudentManagerViewProps> = ({
  students,
  onAddStudent,
  onBulkAddStudents,
  onDeleteStudent,
}) => {
  const [name, setName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [className, setClassName] = useState('11-A Fen');
  const [bulkText, setBulkText] = useState('');

  const handleSingleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddStudent({
      id: `st-${Date.now()}`,
      name: name.trim(),
      studentNumber: studentNumber.trim() || String(Math.floor(1000 + Math.random() * 9000)),
      className: className.trim() || 'Genel Sınıf',
    });
    setName('');
    setStudentNumber('');
  };

  const handleBulkImport = () => {
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const created: Student[] = lines.map((line, i) => {
      const parts = line.split(/[\t,;,-]+/).map((p) => p.trim());
      if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
        return {
          id: `st-${Date.now()}-${i}`,
          studentNumber: parts[0],
          name: parts[1],
          className: parts[2] || className || 'Genel Sınıf',
        };
      }
      return {
        id: `st-${Date.now()}-${i}`,
        studentNumber: String(2026200 + i),
        name: line,
        className: className || 'Genel Sınıf',
      };
    });

    onBulkAddStudents(created);
    setBulkText('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-4">
        <form
          onSubmit={handleSingleAdd}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-sky-600" />
            <span>Yeni Öğrenci Ekle</span>
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Öğrenci Adı Soyadı
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn: Ayşe Demir"
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Öğrenci No
                </label>
                <input
                  type="text"
                  value={studentNumber}
                  onChange={(e) => setStudentNumber(e.target.value)}
                  placeholder="2026109"
                  className="w-full text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sınıf / Şube
                </label>
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="11-A Fen"
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors"
            >
              Listeye Ekle
            </button>
          </div>
        </form>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            Toplu Öğrenci Aktarımı (Her satıra 1 öğrenci)
          </h3>
          <textarea
            rows={4}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'2026110, Burak Yılmaz, 11-A Fen\n2026111, Duru Kaya, 11-A Fen'}
            className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 focus:outline-none focus:border-sky-600"
          />
          <button
            type="button"
            onClick={handleBulkImport}
            className="w-full py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Toplu Listeyi Ekle
          </button>
        </div>
      </div>

      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-600" />
            <span>Kayıtlı Öğrenciler ({students.length})</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2.5 px-3 font-semibold">No</th>
                <th className="py-2.5 px-3 font-semibold">Ad Soyad</th>
                <th className="py-2.5 px-3 font-semibold">Sınıf</th>
                <th className="py-2.5 px-3 font-semibold text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {students.map((st) => (
                <tr key={st.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600">
                    {st.studentNumber}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                    {st.name}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{st.className}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDeleteStudent(st.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                      title="Öğrenciyi Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
