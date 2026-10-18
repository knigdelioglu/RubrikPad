import React, { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Camera,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  School,
  Edit3,
  History,
  Archive,
  RotateCcw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import type {
  Classroom,
  Student,
  EvaluationSession,
  ParsedRosterRow,
} from '../types.ts';
import {
  parseStudentRosterText,
  validateStudentRecord,
  checkStudentDeletionImpact,
  splitTurkishFullName,
} from '../utils/rubricLogic.ts';

interface ClassroomManagerProps {
  classrooms: Classroom[];
  students: Student[];
  sessions?: EvaluationSession[];
  activeClassId: string;
  onSelectClass: (id: string) => void;
  onAddClassroom: (cls: Classroom) => void;
  onAddStudents: (newStudents: Student[]) => void;
  onUpdateStudent?: (updated: Student) => void;
  onDeleteStudent: (studentId: string) => void;
}

export const ClassroomManager: React.FC<ClassroomManagerProps> = ({
  classrooms,
  students,
  sessions = [],
  activeClassId,
  onSelectClass,
  onAddClassroom,
  onAddStudents,
  onUpdateStudent,
  onDeleteStudent,
}) => {
  const activeClassroom = useMemo(
    () => classrooms.find((c) => c.id === activeClassId) || classrooms[0],
    [classrooms, activeClassId]
  );

  const [showArchived, setShowArchived] = useState(false);

  const classStudents = useMemo(
    () =>
      students
        .filter(
          (s) =>
            s.classId === activeClassroom?.id &&
            (showArchived ? true : !s.archived)
        )
        .sort((a, b) =>
          a.studentNumber.localeCompare(b.studentNumber, undefined, {
            numeric: true,
          })
        ),
    [students, activeClassroom, showArchived]
  );

  const archivedCount = useMemo(
    () =>
      students.filter((s) => s.classId === activeClassroom?.id && s.archived)
        .length,
    [students, activeClassroom]
  );

  // New Classroom Form State
  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('7. Sınıf');
  const [newClassSubject, setNewClassSubject] = useState('Fen Bilimleri');

  // Single Student Add Form (Separate Ad & Soyad, P1 #3 & #4)
  const [singleStudentNum, setSingleStudentNum] = useState('');
  const [singleFirstName, setSingleFirstName] = useState('');
  const [singleLastName, setSingleLastName] = useState('');
  const [singleStudentError, setSingleStudentError] = useState<string | null>(
    null
  );

  // Editing existing student state (P1 #4)
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editNum, setEditNum] = useState('');
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Audit history modal state (P1 #4)
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);

  // Import Mode: 'local_text' (Offline safe) | 'cloud_ocr' (Controlled API with privacy consent)
  const [importTab, setImportTab] = useState<'local_text' | 'cloud_ocr'>(
    'local_text'
  );
  const [bulkText, setBulkText] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [remainingOcrQuota, setRemainingOcrQuota] = useState<number | null>(
    null
  );

  // Editable Verification Table for OCR / Bulk Import (P1 #3 & P0 #5)
  const [verificationRows, setVerificationRows] = useState<ParsedRosterRow[]>(
    []
  );
  const [importSuccessBanner, setImportSuccessBanner] = useState<string | null>(
    null
  );

  const existingNumbersSet = useMemo(
    () =>
      new Set(
        students
          .filter((s) => s.classId === activeClassroom?.id && !s.archived)
          .map((s) => s.studentNumber)
      ),
    [students, activeClassroom]
  );

  const revalidateRows = (rows: ParsedRosterRow[]): ParsedRosterRow[] => {
    const seen = new Set<string>();
    return rows.map((r) => {
      const num = r.studentNumber.trim();
      const first = r.firstName.trim();
      const last = r.lastName.trim();
      const errs: string[] = [];

      if (!num) {
        errs.push('Okul numarası eksik');
      } else if (!/^\d+$/.test(num)) {
        errs.push('Okul numarası rakam olmalı');
      } else if (existingNumbersSet.has(num) || seen.has(num)) {
        errs.push('Mükerrer okul numarası');
      }

      if (first.length < 2) {
        errs.push('Ad en az 2 harf olmalı');
      }
      if (last.length < 2) {
        errs.push('Soyad en az 2 harf olmalı');
      }

      if (num) seen.add(num);

      return {
        studentNumber: num,
        firstName: first,
        lastName: last,
        fullName: `${first} ${last}`.trim(),
        isValid: errs.length === 0,
        validationErrors: errs,
      };
    });
  };

  const handleCreateClassroom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const newCls: Classroom = {
      id: `cls-${Date.now()}`,
      name: newClassName.trim(),
      gradeLevel: newClassGrade.trim() || 'Genel',
      subject: newClassSubject.trim() || 'Genel Ders',
      academicYear: '2026-2027',
    };
    onAddClassroom(newCls);
    onSelectClass(newCls.id);
    setNewClassName('');
    setShowNewClassForm(false);
  };

  const handleAddSingleStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClassroom) return;
    setSingleStudentError(null);

    const validation = validateStudentRecord(
      {
        studentNumber: singleStudentNum,
        firstName: singleFirstName,
        lastName: singleLastName,
      },
      students.filter((s) => s.classId === activeClassroom.id)
    );

    if (!validation.isValid) {
      setSingleStudentError(validation.error || 'Geçersiz öğrenci bilgisi.');
      return;
    }

    const nowIso = new Date().toISOString();
    const first = singleFirstName.trim();
    const last = singleLastName.trim();
    const newStu: Student = {
      id: `stu-${Date.now()}`,
      studentNumber: singleStudentNum.trim(),
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`,
      classId: activeClassroom.id,
      createdAt: nowIso,
      updatedAt: nowIso,
      auditLog: [
        {
          timestamp: nowIso,
          action: 'created',
          details: `Öğrenci kaydı oluşturuldu (#${singleStudentNum.trim()} ${first} ${last}).`,
        },
      ],
    };
    onAddStudents([newStu]);
    setSingleStudentNum('');
    setSingleFirstName('');
    setSingleLastName('');
  };

  const handleStartEditStudent = (stu: Student) => {
    const split = splitTurkishFullName(stu.fullName);
    setEditingStudentId(stu.id);
    setEditNum(stu.studentNumber);
    setEditFirst(stu.firstName || split.firstName);
    setEditLast(stu.lastName || split.lastName);
    setEditError(null);
  };

  const handleSaveEditStudent = (stu: Student) => {
    if (!activeClassroom || !onUpdateStudent) return;
    const validation = validateStudentRecord(
      {
        studentNumber: editNum,
        firstName: editFirst,
        lastName: editLast,
      },
      students.filter((s) => s.classId === activeClassroom.id),
      stu.id
    );

    if (!validation.isValid) {
      setEditError(validation.error || 'Geçersiz bilgi.');
      return;
    }

    const nowIso = new Date().toISOString();
    const first = editFirst.trim();
    const last = editLast.trim();
    const full = `${first} ${last}`;
    const updated: Student = {
      ...stu,
      studentNumber: editNum.trim(),
      firstName: first,
      lastName: last,
      fullName: full,
      updatedAt: nowIso,
      auditLog: [
        {
          timestamp: nowIso,
          action: 'updated',
          details: `Kayıt güncellendi: #${stu.studentNumber} ${stu.fullName} -> #${editNum.trim()} ${full}`,
        },
        ...(stu.auditLog || []),
      ],
    };
    onUpdateStudent(updated);
    setEditingStudentId(null);
    setEditError(null);
  };

  const handleParseLocalRoster = () => {
    setOcrError(null);
    const parsed = parseStudentRosterText(bulkText, existingNumbersSet);
    if (parsed.length === 0) {
      setOcrError(
        'Ayrıştırılacak öğrenci satırı bulunamadı. Lütfen her satıra "OkulNo Ad Soyad" formatında giriş yapın.'
      );
      return;
    }
    setVerificationRows(parsed);
  };

  const handleOcrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrError(null);

    // P0 #8: Require explicit privacy consent before external upload
    if (!privacyConsent) {
      setOcrError(
        'Görseli harici OCR servisine göndermeden önce lütfen KVKK / Veri Gizliliği onay kutusunu işaretleyin veya Yerel (Çevrimdışı) Metin Aktarımını kullanın.'
      );
      e.target.value = '';
      return;
    }

    setOcrLoading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1] || '';
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch('/api/ocr-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Image: base64,
          mimeType: file.type || 'image/jpeg',
          privacyConsentConfirmed: true,
        }),
      });

      const data = await response.json();
      if (typeof data.remainingQuota === 'number') {
        setRemainingOcrQuota(data.remainingQuota);
      }

      if (!response.ok) {
        // P0 #5: NEVER populate fake/sample students when OCR fails!
        setVerificationRows([]);
        setOcrError(
          data.error ||
            'OCR taraması başarısız oldu. Sahte veya örnek kayıt eklenmedi; lütfen görseli kontrol edin veya Yerel Metin Aktarımını kullanın.'
        );
        return;
      }

      if (Array.isArray(data.students) && data.students.length > 0) {
        const rawRows: ParsedRosterRow[] = data.students.map(
          (item: {
            studentNumber?: string;
            firstName?: string;
            lastName?: string;
            fullName?: string;
          }) => {
            const split = splitTurkishFullName(item.fullName || '');
            const first = (item.firstName || split.firstName || '').trim();
            const last = (item.lastName || split.lastName || '').trim();
            return {
              studentNumber: String(item.studentNumber || '').trim(),
              firstName: first,
              lastName: last,
              fullName: `${first} ${last}`.trim(),
              isValid: true,
              validationErrors: [],
            };
          }
        );
        setVerificationRows(revalidateRows(rawRows));
      } else {
        setVerificationRows([]);
        setOcrError(
          'Görselde geçerli öğrenci satırı tespit edilemedi. Sahte kayıt üretilmedi.'
        );
      }
    } catch {
      // P0 #5: Never fall back to fake sample students
      setVerificationRows([]);
      setOcrError(
        'Sunucu bağlantısı kurulamadı. Çevrimdışı (Yerel) Metin/Tablo Aktarım modunu kullanarak internet olmadan öğrenci ekleyebilirsiniz.'
      );
    } finally {
      setOcrLoading(false);
      e.target.value = '';
    }
  };

  const handleCommitVerifiedRoster = () => {
    if (!activeClassroom || verificationRows.length === 0) return;
    const validRows = verificationRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setOcrError(
        'Aktarılacak geçerli öğrenci satırı bulunmuyor. Lütfen eksik okul numarası veya soyadı hatalarını tabloda düzeltin.'
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const created: Student[] = validRows.map((item, idx) => ({
      id: `stu-${Date.now()}-${idx}`,
      studentNumber: item.studentNumber.trim(),
      firstName: item.firstName.trim(),
      lastName: item.lastName.trim(),
      fullName: `${item.firstName.trim()} ${item.lastName.trim()}`,
      classId: activeClassroom.id,
      createdAt: nowIso,
      updatedAt: nowIso,
      auditLog: [
        {
          timestamp: nowIso,
          action: 'created',
          details: `Doğrulanmış tablo/OCR aktarımı ile eklendi (#${item.studentNumber.trim()}).`,
        },
      ],
    }));

    onAddStudents(created);
    setVerificationRows([]);
    setBulkText('');
    setImportSuccessBanner(
      `${created.length} öğrenci doğrulamadan geçerek ${activeClassroom.name} listesine eklendi.`
    );
    setTimeout(() => setImportSuccessBanner(null), 4000);
  };

  const invalidRowCount = verificationRows.filter((r) => !r.isValid).length;
  const validRowCount = verificationRows.filter((r) => r.isValid).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Sınıflar ve Öğrenci Listesi Yönetimi
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Ad-Soyad-Okul No doğrulamalı öğrenci yönetimi, kayıt geçmişi, ilişkili kayıt koruma ve çevrimdışı/kontrollü OCR aktarımı.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewClassForm(!showNewClassForm)}
          className="px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Yeni Sınıf Ekle
        </button>
      </div>

      {/* New Classroom Drawer */}
      {showNewClassForm && (
        <form
          onSubmit={handleCreateClassroom}
          className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end"
        >
          <div>
            <label
              htmlFor="new-cls-name"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Sınıf / Şube Adı
            </label>
            <input
              id="new-cls-name"
              type="text"
              required
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Örn: 7-B Sınıfı"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <div>
            <label
              htmlFor="new-cls-grade"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Kademe / Seviye
            </label>
            <input
              id="new-cls-grade"
              type="text"
              value={newClassGrade}
              onChange={(e) => setNewClassGrade(e.target.value)}
              placeholder="Örn: 7. Sınıf"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <div>
            <label
              htmlFor="new-cls-subject"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Ders / Branş
            </label>
            <input
              id="new-cls-subject"
              type="text"
              value={newClassSubject}
              onChange={(e) => setNewClassSubject(e.target.value)}
              placeholder="Örn: Fen Bilimleri"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 cursor-pointer"
            >
              Kaydet
            </button>
            <button
              type="button"
              onClick={() => setShowNewClassForm(false)}
              className="px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
            >
              İptal
            </button>
          </div>
        </form>
      )}

      {/* Classroom Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {classrooms.map((cls) => {
          const isSelected = activeClassroom?.id === cls.id;
          const count = students.filter(
            (s) => s.classId === cls.id && !s.archived
          ).length;
          return (
            <button
              key={cls.id}
              type="button"
              onClick={() => onSelectClass(cls.id)}
              className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-teal-50/90 border-teal-700 ring-1 ring-teal-700'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800">
                  <School className="w-3.5 h-3.5" />
                  {cls.gradeLevel}
                </span>
                <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {count} Öğrenci
                </span>
              </div>
              <div className="text-lg font-bold text-slate-900">{cls.name}</div>
              <div className="text-xs text-slate-600 mt-0.5">
                {cls.subject} · {cls.academicYear}
              </div>
            </button>
          );
        })}
      </div>

      {importSuccessBanner && (
        <div
          role="status"
          aria-live="polite"
          className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2"
        >
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          {importSuccessBanner}
        </div>
      )}

      {/* Main Two-Column Area: Current Roster & Smart Import */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Existing Students List + Single Add + Edit + Audit Log */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-700" />
                {activeClassroom?.name} Öğrenci Listesi ({classStudents.length})
              </h2>
              <p className="text-xs text-slate-500">
                Mükerrer numara korumalı, düzenlenebilir ve değerlendirme geçmişi korumalı liste
              </p>
            </div>
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived(!showArchived)}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5" />
                {showArchived
                  ? 'Arşivlenenleri Gizle'
                  : `Arşivlenenler (${archivedCount})`}
              </button>
            )}
          </div>

          {/* Quick Single Student Form (Separate No, Ad, Soyad) */}
          <form
            onSubmit={handleAddSingleStudent}
            className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                aria-label="Öğrenci Okul Numarası"
                value={singleStudentNum}
                onChange={(e) => setSingleStudentNum(e.target.value)}
                placeholder="Okul No (Örn: 115)"
                className="sm:col-span-3 px-3 py-2 text-xs font-mono-num bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <input
                type="text"
                aria-label="Öğrenci Adı"
                value={singleFirstName}
                onChange={(e) => setSingleFirstName(e.target.value)}
                placeholder="Ad (Örn: Zeynep)"
                className="sm:col-span-4 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <input
                type="text"
                aria-label="Öğrenci Soyadı"
                value={singleLastName}
                onChange={(e) => setSingleLastName(e.target.value)}
                placeholder="Soyad (Örn: Kaya)"
                className="sm:col-span-3 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="submit"
                className="sm:col-span-2 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Öğrenci Ekle
              </button>
            </div>
            {singleStudentError && (
              <div
                role="alert"
                className="text-xs text-red-700 font-medium flex items-center gap-1.5"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {singleStudentError}
              </div>
            )}
          </form>

          {/* Student Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[520px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                  <th className="py-2.5 px-3 w-20">Okul No</th>
                  <th className="py-2.5 px-3">Ad</th>
                  <th className="py-2.5 px-3">Soyad</th>
                  <th className="py-2.5 px-3 w-28">Geçmiş Kayıt</th>
                  <th className="py-2.5 px-3 w-28 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {classStudents.map((stu) => {
                  const split = splitTurkishFullName(stu.fullName);
                  const firstName = stu.firstName || split.firstName;
                  const lastName = stu.lastName || split.lastName;
                  const impact = checkStudentDeletionImpact(stu.id, sessions);
                  const isEditingThis = editingStudentId === stu.id;

                  return (
                    <tr
                      key={stu.id}
                      className={`${
                        stu.archived
                          ? 'bg-slate-100/80 text-slate-400'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {isEditingThis ? (
                        <td colSpan={5} className="p-3 bg-teal-50/50 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <input
                              type="text"
                              aria-label="Düzenlenen Okul No"
                              value={editNum}
                              onChange={(e) => setEditNum(e.target.value)}
                              className="sm:col-span-2 px-2.5 py-1.5 text-xs font-mono-num bg-white border border-teal-400 rounded"
                            />
                            <input
                              type="text"
                              aria-label="Düzenlenen Ad"
                              value={editFirst}
                              onChange={(e) => setEditFirst(e.target.value)}
                              className="sm:col-span-4 px-2.5 py-1.5 text-xs bg-white border border-teal-400 rounded"
                            />
                            <input
                              type="text"
                              aria-label="Düzenlenen Soyad"
                              value={editLast}
                              onChange={(e) => setEditLast(e.target.value)}
                              className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-white border border-teal-400 rounded"
                            />
                            <div className="sm:col-span-3 flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveEditStudent(stu)}
                                className="px-2.5 py-1.5 text-xs font-bold text-white bg-teal-700 rounded cursor-pointer"
                              >
                                Kaydet
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStudentId(null);
                                  setEditError(null);
                                }}
                                className="px-2 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded cursor-pointer"
                              >
                                İptal
                              </button>
                            </div>
                          </div>
                          {editError && (
                            <div className="text-xs text-red-700 font-semibold">
                              {editError}
                            </div>
                          )}
                        </td>
                      ) : (
                        <>
                          <td className="py-2.5 px-3 font-mono-num text-xs font-bold text-slate-700">
                            #{stu.studentNumber}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {firstName}
                            {stu.archived && (
                              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                                Arşivde
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {lastName}
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => setHistoryStudent(stu)}
                              className="inline-flex items-center gap-1 text-[11px] font-mono-num font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-0.5 rounded border border-teal-200 cursor-pointer"
                            >
                              <History className="w-3 h-3" />
                              {impact.sessionCount} Oturum
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              {!stu.archived && onUpdateStudent && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditStudent(stu)}
                                  aria-label={`${stu.fullName} bilgilerini düzenle`}
                                  className="p-1.5 text-slate-500 hover:text-teal-700 cursor-pointer"
                                  title="Öğrenci bilgilerini düzenle"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {stu.archived && onUpdateStudent ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nowIso = new Date().toISOString();
                                    onUpdateStudent({
                                      ...stu,
                                      archived: false,
                                      updatedAt: nowIso,
                                      auditLog: [
                                        {
                                          timestamp: nowIso,
                                          action: 'restored',
                                          details: 'Öğrenci arşivden geri yüklendi.',
                                        },
                                        ...(stu.auditLog || []),
                                      ],
                                    });
                                  }}
                                  aria-label={`${stu.fullName} kaydını arşivden çıkar`}
                                  className="p-1.5 text-teal-700 hover:text-teal-900 cursor-pointer"
                                  title="Arşivden Geri Yükle"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onDeleteStudent(stu.id)}
                                  aria-label={
                                    impact.hasHistory
                                      ? `${stu.fullName} öğrencisini arşivle`
                                      : `${stu.fullName} öğrencisini sil`
                                  }
                                  title={
                                    impact.hasHistory
                                      ? 'Değerlendirme geçmişi olduğu için güvenli arşivlenir (geçmiş notlar korunur)'
                                      : 'Kaydı sil'
                                  }
                                  className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                                >
                                  {impact.hasHistory ? (
                                    <Archive className="w-3.5 h-3.5 text-amber-700" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {classStudents.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-sm text-slate-500"
                    >
                      Bu sınıfta henüz öğrenci bulunmuyor. Sağdaki panelden toplu
                      liste veya OCR ile ekleyebilirsiniz.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Controlled OCR & Offline Roster Import + Separate Field Verification */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Camera className="w-4 h-4 text-teal-700" />
              Sınıf Listesi Aktarımı ve Doğrulama (Yerel &amp; OCR)
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Öğrenci numarası, ad ve soyad sütunları ayrı ayrı doğrulanır. Eksik
              okul numarası için asla rastgele numara üretilmez.
            </p>
          </div>

          {/* Mode Switcher: Offline Local vs Cloud OCR */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setImportTab('local_text');
                setOcrError(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                importTab === 'local_text'
                  ? 'bg-white text-teal-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <WifiOff className="w-3.5 h-3.5 text-teal-700" />
              Yerel / Çevrimdışı Aktarım
            </button>
            <button
              type="button"
              onClick={() => {
                setImportTab('cloud_ocr');
                setOcrError(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                importTab === 'cloud_ocr'
                  ? 'bg-white text-teal-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5 text-teal-700" />
              Kontrollü Fotoğraf OCR
            </button>
          </div>

          {importTab === 'local_text' ? (
            <div className="space-y-3">
              <div className="bg-teal-50/70 border border-teal-200 rounded-lg p-3 text-xs text-teal-950 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <strong>%100 Çevrimdışı ve Veri Gizliliği Korumalı:</strong>{' '}
                  Verileriniz cihaz dışına çıkmadan yerel olarak ayrıştırılır.
                  e-Okul veya Excel listesinden kopyaladığınız satırları
                  yapıştırın.
                </div>
              </div>

              <div>
                <label
                  htmlFor="bulk-roster-textarea"
                  className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  Okul No + Ad + Soyad Listesi (Her satıra bir öğrenci)
                </label>
                <textarea
                  id="bulk-roster-textarea"
                  rows={5}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={'109 - Beren Su Karahan\n110 - Kuzey Alp Tekin\n111 - Duru Erdem'}
                  className="w-full p-3 text-xs font-mono-num bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <button
                type="button"
                onClick={handleParseLocalRoster}
                disabled={!bulkText.trim()}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-40 rounded-lg cursor-pointer"
              >
                Satırları Ayrıştır ve Doğrulama Tablosunda İncele
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* P0 #8: Privacy Consent & Quota Control */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2 text-xs text-amber-950">
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-800" />
                    KVKK ve Harici Servis Veri Gizliliği Kontrolü
                  </span>
                  {remainingOcrQuota !== null && (
                    <span className="font-mono-num text-[11px] bg-white px-2 py-0.5 rounded border border-amber-300">
                      Kalan Kota: {remainingOcrQuota}/10
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  Yüklenen sınıf listesi görseli yalnızca metin ayrıştırma
                  amacıyla şifreli bağlantı üzerinden OCR servisine iletilir ve
                  saklanmaz. Öğrenci yüz fotoğrafı içeren görselleri
                  yüklemeyiniz.
                </p>
                <label className="flex items-center gap-2 font-semibold text-slate-900 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={privacyConsent}
                    onChange={(e) => setPrivacyConsent(e.target.checked)}
                    className="rounded border-amber-400 text-teal-700 focus:ring-teal-600"
                  />
                  <span>
                    Görselin yalnızca sınıf listesi metni içerdiğini ve harici
                    OCR servisine gönderilmesini onaylıyorum.
                  </span>
                </label>
              </div>

              <label
                className={`block border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                  privacyConsent
                    ? 'border-slate-300 hover:border-teal-600 cursor-pointer bg-slate-50/60'
                    : 'border-slate-200 bg-slate-100 opacity-70 cursor-not-allowed'
                }`}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleOcrFileUpload}
                  className="hidden"
                  disabled={ocrLoading || !privacyConsent}
                />
                <div className="flex flex-col items-center gap-1.5">
                  {ocrLoading ? (
                    <Loader2 className="w-6 h-6 text-teal-700 animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-slate-600" />
                  )}
                  <span className="text-xs font-bold text-slate-800">
                    {ocrLoading
                      ? 'Görseldeki Sütunlar Okunuyor...'
                      : 'Sınıf Listesi Görseli Seç (JPEG / PNG)'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Okul No, Ad ve Soyad ayrı sütunlar olarak doğrulanır (Maks 4.5MB)
                  </span>
                </div>
              </label>
            </div>
          )}

          {ocrError && (
            <div
              role="alert"
              className="flex items-start gap-2 text-xs text-red-900 bg-red-50 border border-red-200 rounded-lg p-3"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
              <span>{ocrError}</span>
            </div>
          )}

          {/* P1 #3: Separate Field Verification Table (Okul No, Ad, Soyad) */}
          {verificationRows.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">
                  Aktarım Öncesi Sütun Doğrulama ({validRowCount} Geçerli
                  {invalidRowCount > 0 ? `, ${invalidRowCount} Hatalı` : ''})
                </span>
                <button
                  type="button"
                  onClick={() => setVerificationRows([])}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Tabloyu Temizle
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-700 uppercase">
                      <th className="p-2 w-20">Okul No</th>
                      <th className="p-2">Ad</th>
                      <th className="p-2">Soyad</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {verificationRows.map((row, rIdx) => (
                      <React.Fragment key={rIdx}>
                        <tr
                          className={
                            row.isValid ? 'bg-white' : 'bg-red-50/70'
                          }
                        >
                          <td className="p-1.5">
                            <input
                              type="text"
                              aria-label={`${rIdx + 1}. Satır Okul Numarası`}
                              value={row.studentNumber}
                              placeholder="Zorunlu"
                              onChange={(e) => {
                                const updated = verificationRows.map(
                                  (item, i) =>
                                    i === rIdx
                                      ? {
                                          ...item,
                                          studentNumber: e.target.value,
                                        }
                                      : item
                                );
                                setVerificationRows(revalidateRows(updated));
                              }}
                              className={`w-full px-2 py-1 text-xs font-mono-num rounded border ${
                                !row.studentNumber
                                  ? 'border-red-400 bg-red-50'
                                  : 'border-slate-300 bg-white'
                              }`}
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              aria-label={`${rIdx + 1}. Satır Öğrenci Adı`}
                              value={row.firstName}
                              placeholder="Ad"
                              onChange={(e) => {
                                const updated = verificationRows.map(
                                  (item, i) =>
                                    i === rIdx
                                      ? { ...item, firstName: e.target.value }
                                      : item
                                );
                                setVerificationRows(revalidateRows(updated));
                              }}
                              className="w-full px-2 py-1 text-xs rounded border border-slate-300 bg-white"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              aria-label={`${rIdx + 1}. Satır Öğrenci Soyadı`}
                              value={row.lastName}
                              placeholder="Soyad"
                              onChange={(e) => {
                                const updated = verificationRows.map(
                                  (item, i) =>
                                    i === rIdx
                                      ? { ...item, lastName: e.target.value }
                                      : item
                                );
                                setVerificationRows(revalidateRows(updated));
                              }}
                              className={`w-full px-2 py-1 text-xs rounded border ${
                                !row.lastName
                                  ? 'border-red-400 bg-red-50'
                                  : 'border-slate-300 bg-white'
                              }`}
                            />
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const filtered = verificationRows.filter(
                                  (_, i) => i !== rIdx
                                );
                                setVerificationRows(revalidateRows(filtered));
                              }}
                              aria-label={`${rIdx + 1}. satırı kaldır`}
                              className="text-slate-400 hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                        {!row.isValid && (
                          <tr className="bg-red-50/90">
                            <td
                              colSpan={4}
                              className="px-2 py-1 text-[11px] font-semibold text-red-800"
                            >
                              ⚠ {row.validationErrors.join(' · ')}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                disabled={validRowCount === 0}
                onClick={handleCommitVerifiedRoster}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-40 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Doğrulanan {validRowCount} Öğrenciyi Sınıfa Kaydet
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Student Audit History Modal (P1 #4) */}
      {historyStudent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${historyStudent.fullName} Kayıt Geçmişi`}
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="font-mono-num text-xs font-bold text-teal-800">
                  #{historyStudent.studentNumber}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {historyStudent.fullName} — Kayıt ve Değerlendirme Geçmişi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryStudent(null)}
                className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="font-bold text-slate-800 mb-1">
                  İlişkili Değerlendirme Oturumları
                </div>
                {(() => {
                  const impact = checkStudentDeletionImpact(
                    historyStudent.id,
                    sessions
                  );
                  return (
                    <p className="text-slate-600">
                      Bu öğrenci toplam{' '}
                      <strong className="text-slate-900">
                        {impact.sessionCount}
                      </strong>{' '}
                      bireysel/grup oturumunda değerlendirilmiş ve{' '}
                      <strong className="text-slate-900">
                        {impact.groupCount}
                      </strong>{' '}
                      çalışma grubunda yer almıştır.
                    </p>
                  );
                })()}
              </div>

              <div className="space-y-1.5">
                <div className="font-bold text-slate-800">
                  Denetim Günlüğü (Audit Log)
                </div>
                {historyStudent.auditLog && historyStudent.auditLog.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-lg">
                    {historyStudent.auditLog.map((entry, idx) => (
                      <div key={idx} className="p-2.5 bg-white">
                        <div className="font-mono-num text-[10px] text-slate-500">
                          {entry.timestamp.slice(0, 19).replace('T', ' ')} ·{' '}
                          <span className="uppercase font-bold text-teal-800">
                            {entry.action}
                          </span>
                        </div>
                        <div className="text-slate-800 font-medium mt-0.5">
                          {entry.details}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 italic">
                    Başlangıç sınıf listesi kaydı (henüz değişiklik yapılmadı).
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
