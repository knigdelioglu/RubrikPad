import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  Users,
  BookOpen,
  BarChart3,
  RotateCcw,
  ShieldCheck,
  Download,
  Upload,
  Check,
  AlertCircle,
} from 'lucide-react';
import type {
  Classroom,
  Student,
  Rubric,
  EvaluationSession,
} from './types.ts';
import {
  INITIAL_CLASSROOMS,
  INITIAL_STUDENTS,
  INITIAL_RUBRICS,
  INITIAL_SESSIONS,
} from './data/seedData.ts';
import {
  loadVerifiedInitialState,
  saveTransactionalState,
  createVerifiedBackupBundle,
  verifyAndParseBackupBundle,
} from './utils/storageLayer.ts';
import {
  checkStudentDeletionImpact,
  freezeRubricSnapshot,
} from './utils/rubricLogic.ts';
import { EvaluationWorkspace } from './components/EvaluationWorkspace.tsx';
import { ClassroomManager } from './components/ClassroomManager.tsx';
import { RubricBuilder } from './components/RubricBuilder.tsx';
import { ProgressAndReports } from './components/ProgressAndReports.tsx';

type ActiveTab = 'evaluate' | 'classes' | 'rubrics' | 'reports';

export function App() {
  const [initialData] = useState(() =>
    loadVerifiedInitialState({
      classrooms: INITIAL_CLASSROOMS,
      students: INITIAL_STUDENTS,
      rubrics: INITIAL_RUBRICS,
      sessions: INITIAL_SESSIONS,
    })
  );

  const [classrooms, setClassrooms] = useState<Classroom[]>(
    initialData.classrooms
  );
  const [students, setStudents] = useState<Student[]>(initialData.students);
  const [rubrics, setRubrics] = useState<Rubric[]>(initialData.rubrics);
  const [sessions, setSessions] = useState<EvaluationSession[]>(
    initialData.sessions
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>('evaluate');
  const [activeClassId, setActiveClassId] = useState<string>(
    () => classrooms[0]?.id || 'cls-7a'
  );
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => sessions[sessions.length - 1]?.id || 'ses-active-3'
  );

  // Transactional Backup & Restore Modal State (P0 #6)
  const [showDataModal, setShowDataModal] = useState(false);
  const [backupBanner, setBackupBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Persist state transactionally to IndexedDB + verified localStorage snapshot (P0 #6)
  useEffect(() => {
    void saveTransactionalState({
      classrooms,
      students,
      rubrics,
      sessions,
    });
  }, [classrooms, students, rubrics, sessions]);

  const handleUpdateSession = (updated: EvaluationSession) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
  };

  const handleCreateSession = (newSession: EvaluationSession) => {
    setSessions((prev) => [...prev, newSession]);
  };

  const handleAddClassroom = (newCls: Classroom) => {
    setClassrooms((prev) => [...prev, newCls]);
  };

  const handleAddStudents = (newStudents: Student[]) => {
    setStudents((prev) => [...prev, ...newStudents]);
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === updatedStudent.id ? updatedStudent : s))
    );
  };

  // P0 #7: Protect relational evaluation history when deleting a student
  const handleDeleteStudent = (studentId: string) => {
    const impact = checkStudentDeletionImpact(studentId, sessions);
    if (impact.hasHistory) {
      // Safe archive instead of destructive hard delete
      const nowIso = new Date().toISOString();
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                archived: true,
                updatedAt: nowIso,
                auditLog: [
                  {
                    timestamp: nowIso,
                    action: 'archived',
                    details: `Öğrencinin ${impact.sessionCount} oturumda değerlendirme geçmişi bulunduğu için silinmek yerine güvenli arşivlendi.`,
                  },
                  ...(s.auditLog || []),
                ],
              }
            : s
        )
      );
    } else {
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
    }
  };

  // P0 #3: When saving a rubric template, ensure existing sessions keep their frozen rubricSnapshot intact
  const handleSaveRubric = (savedRubric: Rubric) => {
    const previousRubric = rubrics.find((r) => r.id === savedRubric.id);
    if (previousRubric) {
      setSessions((prev) =>
        prev.map((ses) => {
          if (ses.rubricId === savedRubric.id && !ses.rubricSnapshot) {
            return {
              ...ses,
              rubricSnapshot: freezeRubricSnapshot(previousRubric),
            };
          }
          return ses;
        })
      );
    }

    setRubrics((prev) => {
      const exists = prev.some((r) => r.id === savedRubric.id);
      if (exists) {
        return prev.map((r) => (r.id === savedRubric.id ? savedRubric : r));
      }
      return [...prev, savedRubric];
    });
  };

  // P0 #7: Freeze rubric snapshot in any session using a rubric before removing the template
  const handleDeleteRubric = (rubricId: string) => {
    if (rubrics.length <= 1) return;
    const targetRubric = rubrics.find((r) => r.id === rubricId);
    if (targetRubric) {
      setSessions((prev) =>
        prev.map((ses) =>
          ses.rubricId === rubricId && !ses.rubricSnapshot
            ? { ...ses, rubricSnapshot: freezeRubricSnapshot(targetRubric) }
            : ses
        )
      );
    }
    setRubrics((prev) => prev.filter((r) => r.id !== rubricId));
  };

  const handleExportVerifiedBackup = () => {
    const bundle = createVerifiedBackupBundle({
      classrooms,
      students,
      rubrics,
      sessions,
    });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `rubrikpad_yedek_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setBackupBanner({
      type: 'success',
      message: `Doğrulanabilir yedek dosyası indirildi (Bütünlük kodu: ${bundle.checksum}).`,
    });
  };

  const handleImportVerifiedBackup = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const verified = verifyAndParseBackupBundle(text);
      if (!verified.isValid || !verified.state) {
        setBackupBanner({
          type: 'error',
          message: verified.error || 'Yedek doğrulaması başarısız oldu.',
        });
        return;
      }

      setClassrooms(verified.state.classrooms);
      setStudents(verified.state.students);
      setRubrics(verified.state.rubrics);
      setSessions(verified.state.sessions);
      setActiveClassId(verified.state.classrooms[0]?.id || '');
      setActiveSessionId(
        verified.state.sessions[verified.state.sessions.length - 1]?.id || ''
      );
      setBackupBanner({
        type: 'success',
        message:
          'Yedek dosyası bütünlük kontrolünden (Checksum) geçti ve başarıyla geri yüklendi.',
      });
    } catch {
      setBackupBanner({
        type: 'error',
        message: 'Yedek dosyası okunurken bir hata oluştu.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleResetDemoData = () => {
    setClassrooms(INITIAL_CLASSROOMS);
    setStudents(INITIAL_STUDENTS);
    setRubrics(INITIAL_RUBRICS);
    setSessions(INITIAL_SESSIONS);
    setActiveClassId('cls-7a');
    setActiveSessionId('ses-active-3');
    setBackupBanner({
      type: 'success',
      message: 'Varsayılan örnek veriler sıfırlandı.',
    });
  };

  const currentChecksum = createVerifiedBackupBundle({
    classrooms,
    students,
    rubrics,
    sessions,
  }).checksum;

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] text-slate-900">
      {/* Top Navigation Bar */}
      <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Brand Identity */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold text-base shadow-xs">
              R
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm tracking-tight">
                  RubrikPad
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 hidden sm:inline">
                  Çevrimdışı PWA &amp; İşlemsel Veri Katmanı
                </span>
              </div>
            </div>
          </div>

          {/* Primary Navigation */}
          <nav
            className="flex items-center gap-1"
            aria-label="Ana Gezinme Menüsü"
          >
            <button
              type="button"
              onClick={() => setActiveTab('evaluate')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'evaluate'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Değerlendirme Ekranı</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('classes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'classes'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Sınıflar &amp; OCR</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rubrics')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'rubrics'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Rubrik Kütüphanesi</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Gelişim &amp; Raporlar</span>
            </button>
          </nav>

          {/* Right Data Security / Verified Backup & Restore Action */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setBackupBanner(null);
                setShowDataModal(true);
              }}
              className="px-2.5 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
              title="Doğrulanabilir Yedekleme ve Geri Yükleme (IndexedDB + Checksum)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
              <span className="hidden md:inline">Yedekle / Geri Yükle</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'evaluate' && (
          <EvaluationWorkspace
            classrooms={classrooms}
            students={students}
            rubrics={rubrics}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onUpdateSession={handleUpdateSession}
            onCreateSession={handleCreateSession}
          />
        )}

        {activeTab === 'classes' && (
          <ClassroomManager
            classrooms={classrooms}
            students={students}
            sessions={sessions}
            activeClassId={activeClassId}
            onSelectClass={setActiveClassId}
            onAddClassroom={handleAddClassroom}
            onAddStudents={handleAddStudents}
            onUpdateStudent={handleUpdateStudent}
            onDeleteStudent={handleDeleteStudent}
          />
        )}

        {activeTab === 'rubrics' && (
          <RubricBuilder
            rubrics={rubrics}
            sessions={sessions}
            onSaveRubric={handleSaveRubric}
            onDeleteRubric={handleDeleteRubric}
          />
        )}

        {activeTab === 'reports' && (
          <ProgressAndReports
            classrooms={classrooms}
            students={students}
            rubrics={rubrics}
            sessions={sessions}
            activeClassId={activeClassId}
            onSelectClass={setActiveClassId}
          />
        )}
      </main>

      {/* Verified Transactional Backup & Restore Modal (P0 #6) */}
      {showDataModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Veri Güvenliği, Doğrulanabilir Yedekleme ve Geri Yükleme"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">
                  İşlemsel Veri Katmanı &amp; Doğrulanabilir Yedek
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowDataModal(false)}
                className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">
                  Aktif Veri Bütünlük Özeti (Checksum):
                </span>
                <span className="font-mono-num font-bold text-teal-900 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {currentChecksum}
                </span>
              </div>
              <p className="text-slate-600">
                Verileriniz tarayıcıda hem işlemsel <strong>IndexedDB</strong>{' '}
                deposunda hem de şema sürümlü yerel depoda saklanır. Dışa
                aktarılan JSON yedekleri bütünlük imzası (checksum) ile
                doğrulanır.
              </p>
            </div>

            {backupBanner && (
              <div
                role="alert"
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  backupBanner.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    : 'bg-red-50 text-red-900 border border-red-200'
                }`}
              >
                {backupBanner.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
                )}
                <span>{backupBanner.message}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleExportVerifiedBackup}
                className="p-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Doğrulanabilir Yedek İndir (.json)
              </button>

              <label className="p-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer text-center">
                <Upload className="w-4 h-4" />
                <span>Yedekten Doğrula ve Geri Yükle</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportVerifiedBackup}
                  className="hidden"
                />
              </label>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Başlangıç örnek verilerine dönmek isterseniz:
              </span>
              <button
                type="button"
                onClick={handleResetDemoData}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Örnek Veriyi Sıfırla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
