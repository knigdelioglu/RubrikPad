import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ClipboardCheck,
  Users,
  BookOpen,
  BarChart3,
  ShieldCheck,
  Download,
  Upload,
  Check,
  AlertCircle,
  AlertTriangle,
  Settings,
  Archive,
} from 'lucide-react';
import type {
  Classroom,
  Student,
  Rubric,
  EvaluationSession,
  InstitutionSettings,
} from './types.ts';
import {
  INITIAL_CLASSROOMS,
  INITIAL_STUDENTS,
  INITIAL_RUBRICS,
  INITIAL_SESSIONS,
} from './data/seedData.ts';
import {
  STORAGE_KEY,
  MAX_BACKUP_JSON_BYTES,
  loadVerifiedInitialStateWithMeta,
  loadInitialStateWithRecovery,
  saveTransactionalState,
  createVerifiedBackupBundle,
  verifyAndParseBackupBundle,
  unlockStorageWriteLock,
  computePayloadChecksum,
  purgeSyntheticSeedDataSync,
  purgeSyntheticSeedDataAsync,
  loadInstitutionSettings,
  saveInstitutionSettings,
  type AppDataState,
} from './utils/storageLayer.ts';
import {
  detectNativeAndroidEnvironment,
  parseAndVerifyRestoredBackupText,
  restoreBackupViaAndroidSaf,
  saveVerifiedBackupFile,
} from './utils/backupFileService.ts';
import {
  appendStudentAuditLog,
  checkClassroomDeletionImpact,
  checkStudentDeletionImpact,
  freezeRubricSnapshot,
  partitionSessionsByArchiveStatus,
} from './utils/rubricLogic.ts';
import { RubrikService } from './services/RubrikService.ts';
import { EvaluationWorkspace } from './components/EvaluationWorkspace.tsx';
import { ClassroomManager } from './components/ClassroomManager.tsx';
import { RubricBuilder } from './components/RubricBuilder.tsx';
import { ProgressAndReports } from './components/ProgressAndReports.tsx';
import { SettingsPanel } from './components/SettingsPanel.tsx';
import { ArchivePanel } from './components/ArchivePanel.tsx';

type ActiveTab = 'evaluate' | 'classes' | 'rubrics' | 'reports' | 'archive' | 'settings';

export function App() {
  const [initialMeta] = useState(() => {
    purgeSyntheticSeedDataSync(INITIAL_RUBRICS);
    return loadVerifiedInitialStateWithMeta({
      classrooms: INITIAL_CLASSROOMS,
      students: INITIAL_STUDENTS,
      rubrics: INITIAL_RUBRICS,
      sessions: INITIAL_SESSIONS,
    });
  });

  const [classrooms, setClassrooms] = useState<Classroom[]>(
    initialMeta.state.classrooms
  );
  const [students, setStudents] = useState<Student[]>(
    initialMeta.state.students
  );
  const [rubrics, setRubrics] = useState<Rubric[]>(initialMeta.state.rubrics);
  const [sessions, setSessions] = useState<EvaluationSession[]>(
    initialMeta.state.sessions
  );

  // Wait for loadInitialStateWithRecovery to verify both localStorage and IndexedDB
  // (and resolve any conflicts or corruption locks) before enabling automatic saves!
  const [isStorageHydrated, setIsStorageHydrated] = useState<boolean>(false);

  const [recoveryBanner, setRecoveryBanner] = useState<string | null>(() => {
    if (initialMeta.source === 'migrated_v2') {
      return 'Önceki sürüm (v2) verileriniz otomatik olarak v3 veri yapısına yükseltildi ve korundu.';
    }
    if (initialMeta.upgradedFromRpkChecksum) {
      return 'Mevcut v3 verileriniz (rpk- imzalı) doğrulandı, orijinal geri dönüş kopyası oluşturuldu ve yeni SHA-256 bütünlük imzasına yükseltildi.';
    }
    return null;
  });
  const [storageSaveError, setStorageSaveError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('evaluate');
  const [institutionSettings, setInstitutionSettings] =
    useState<InstitutionSettings>(() => loadInstitutionSettings());

  const handleUpdateInstitutionSettings = useCallback(
    (nextSettings: InstitutionSettings) => {
      const saved = saveInstitutionSettings(nextSettings);
      setInstitutionSettings(saved);
    },
    []
  );

  const [activeClassId, setActiveClassId] = useState<string>(
    () => classrooms[0]?.id || ''
  );
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<string>(
    () => classrooms[0]?.gradeLevel || RubrikService.DEFAULT_GRADE_LEVEL
  );
  const [selectedSubject, setSelectedSubject] = useState<string>(
    () => classrooms[0]?.subject || RubrikService.DEFAULT_SUBJECT
  );
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => sessions[sessions.length - 1]?.id || ''
  );

  // Sınıf ve ders bazlı rubrik filtreleme (Seçili sınıf/ders dışında kalan rubrikleri gizler)
  const filteredRubricsForBuilder = useMemo(
    () =>
      RubrikService.filterRubricsForSelection(
        rubrics,
        selectedGradeLevel,
        selectedSubject
      ),
    [rubrics, selectedGradeLevel, selectedSubject]
  );

  const rubricCatalogSummaries = useMemo(
    () => RubrikService.summarizeRubricCatalogByGradeAndSubject(rubrics),
    [rubrics]
  );

  // Transactional Backup & Restore Modal State (P0 #6)
  const [showDataModal, setShowDataModal] = useState(false);
  const [isSavingBackup, setIsSavingBackup] = useState(false);
  const [backupBanner, setBackupBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const lastSyncedChecksumRef = useRef<string>('');

  // Cross-layer verification, conflict resolution, and IndexedDB recovery on startup
  useEffect(() => {
    let cancelled = false;
    purgeSyntheticSeedDataAsync(INITIAL_RUBRICS)
      .then(() =>
        loadInitialStateWithRecovery({
          classrooms: INITIAL_CLASSROOMS,
          students: INITIAL_STUDENTS,
          rubrics: INITIAL_RUBRICS,
          sessions: INITIAL_SESSIONS,
        })
      )
      .then((result) => {
        if (cancelled) return;
        if (
          result.source === 'indexeddb_recovered' ||
          result.source === 'conflict_resolved_indexeddb' ||
          result.source === 'conflict_resolved_localstorage' ||
          result.source === 'migrated_v2' ||
          result.source === 'localStorage_v3'
        ) {
          lastSyncedChecksumRef.current = computePayloadChecksum(result.state);
          setClassrooms(result.state.classrooms);
          setStudents(result.state.students);
          setRubrics(result.state.rubrics);
          setSessions(result.state.sessions);
          if (result.state.classrooms[0]?.id) {
            setActiveClassId(result.state.classrooms[0].id);
            setSelectedGradeLevel(result.state.classrooms[0].gradeLevel);
            setSelectedSubject(result.state.classrooms[0].subject);
          }
          if (result.state.sessions.length > 0) {
            setActiveSessionId(
              result.state.sessions[result.state.sessions.length - 1].id
            );
          }
          if (result.recoveryNotice) {
            setRecoveryBanner(result.recoveryNotice);
          }
          setIsStorageHydrated(true);
        } else if (
          result.writeLocked ||
          result.localStorageCorrupted ||
          result.indexedDbCorrupted ||
          initialMeta.localStorageCorrupted
        ) {
          // Do NOT set isStorageHydrated(true) when localStorage or IndexedDB had corrupted data and no valid backup existed,
          // so seed data NEVER overwrites rubrikpad_state_v3 or IndexedDB without explicit user action!
          setStorageSaveError(
            result.indexedDbCorrupted && !result.localStorageCorrupted
              ? 'IndexedDB deposundaki kayıtlar bozulmuş ve doğrulanamadı. Bozuk IndexedDB verisinin üzerine örnek verilerin yazılmaması için otomatik kayıt duraklatıldı (ham veri rubrikpad_quarantine_idb_backup anahtarına karantinaya alındı).'
              : 'Yerel depolamadaki (localStorage / IndexedDB) kayıtlar doğrulanamadı ve geçerli yedek bulunamadı. Mevcut verilerinizin üzerine örnek verilerin yazılmaması için otomatik kayıt duraklatıldı.'
          );
        } else {
          lastSyncedChecksumRef.current = computePayloadChecksum(result.state);
          setIsStorageHydrated(true);
        }
      })
      .catch(() => {
        if (!cancelled && !initialMeta.localStorageCorrupted) {
          setIsStorageHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialMeta.localStorageCorrupted]);

  // Listen for any global save-error events and cross-tab storage synchronization events
  useEffect(() => {
    const handleSaveErrorEvent = (e: Event) => {
      const custom = e as CustomEvent<{ errorMessage?: string }>;
      if (custom.detail?.errorMessage) {
        setStorageSaveError(custom.detail.errorMessage);
      }
    };

    const handleCrossTabStorageEvent = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      const verified = verifyAndParseBackupBundle(e.newValue);
      if (!verified.isValid || !verified.state) return;
      const incomingChecksum = computePayloadChecksum(verified.state);
      if (incomingChecksum === lastSyncedChecksumRef.current) return;

      lastSyncedChecksumRef.current = incomingChecksum;
      setClassrooms(verified.state.classrooms);
      setStudents(verified.state.students);
      setRubrics(verified.state.rubrics);
      setSessions(verified.state.sessions);
      setRecoveryBanner(
        'Başka bir sekmede yapılan değişiklikler doğrulandı ve bu sekmeye senkronize edildi.'
      );
    };

    window.addEventListener('rubrikpad:save-error', handleSaveErrorEvent);
    window.addEventListener('storage', handleCrossTabStorageEvent);
    return () => {
      window.removeEventListener('rubrikpad:save-error', handleSaveErrorEvent);
      window.removeEventListener('storage', handleCrossTabStorageEvent);
    };
  }, []);

  // Persist state transactionally to IndexedDB + verified localStorage snapshot (P0 #6)
  // Reports any save errors directly to the user instead of failing silently!
  const performTransactionalSave = useCallback(async () => {
    const res = await saveTransactionalState(
      {
        classrooms,
        students,
        rubrics,
        sessions,
      },
      {
        expectedPreviousChecksum: lastSyncedChecksumRef.current || undefined,
        onSaveError: (errMsg) => {
          setStorageSaveError(errMsg);
        },
      }
    );
    if (res.ok) {
      lastSyncedChecksumRef.current = res.checksum;
    }
    if (!res.ok || res.errors.length > 0) {
      setStorageSaveError(res.errorMessage || res.errors.join(' '));
    } else {
      setStorageSaveError(null);
    }
  }, [classrooms, students, rubrics, sessions]);

  useEffect(() => {
    if (!isStorageHydrated) return;
    void performTransactionalSave();
  }, [isStorageHydrated, performTransactionalSave]);

  const handleUpdateSession = (updated: EvaluationSession) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
  };

  const handleCreateSession = (newSession: EvaluationSession) => {
    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newSession.id);
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId);
      if (activeSessionId === sessionId) {
        const nextActive = remaining.find((s) => !s.archived);
        setActiveSessionId(nextActive ? nextActive.id : '');
      }
      return remaining;
    });
  };

  const handleArchiveSession = (sessionId: string, archived: boolean) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              archived,
              archivedAt: archived ? new Date().toISOString() : undefined,
            }
          : s
      )
    );
  };

  const activeSessions = useMemo(() => partitionSessionsByArchiveStatus(sessions).activeSessions, [sessions]);

  const handleSelectClassroom = (classId: string) => {
    setActiveClassId(classId);
    const cls = classrooms.find((c) => c.id === classId);
    if (cls) {
      setSelectedGradeLevel(cls.gradeLevel);
      setSelectedSubject(cls.subject);
    }
  };

  const handleAddClassroom = (newCls: Classroom) => {
    setClassrooms((prev) => [...prev, newCls]);
    setActiveClassId(newCls.id);
    setSelectedGradeLevel(newCls.gradeLevel);
    setSelectedSubject(newCls.subject);
  };

  const handleUpdateClassroom = (updatedCls: Classroom) => {
    setClassrooms((prev) =>
      prev.map((c) => (c.id === updatedCls.id ? updatedCls : c))
    );
    if (activeClassId === updatedCls.id) {
      setSelectedGradeLevel(updatedCls.gradeLevel);
      setSelectedSubject(updatedCls.subject);
    }
  };

  const handleDeleteClassroom = (classroomId: string) => {
    const impact = checkClassroomDeletionImpact(
      classroomId,
      classrooms,
      students,
      sessions
    );
    if (impact.studentCount > 0 || impact.sessionCount > 0) return;
    const remaining = classrooms.filter((c) => c.id !== classroomId);
    setClassrooms(remaining);
    if (activeClassId === classroomId) {
      const nextCls = remaining[0];
      setActiveClassId(nextCls?.id || '');
      setSelectedGradeLevel(
        nextCls?.gradeLevel || RubrikService.DEFAULT_GRADE_LEVEL
      );
      setSelectedSubject(nextCls?.subject || RubrikService.DEFAULT_SUBJECT);
    }
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
      const nowIso = new Date().toISOString();
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                archived: true,
                updatedAt: nowIso,
                auditLog: appendStudentAuditLog(s.auditLog, {
                  timestamp: nowIso,
                  action: 'archived',
                  details: `Öğrencinin ${impact.sessionCount} oturumda değerlendirme geçmişi bulunduğu için silinmek yerine güvenli arşivlendi.`,
                }),
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
    const normalizedRubric = RubrikService.assignCourseToRubric(
      savedRubric,
      savedRubric.gradeLevel,
      savedRubric.subject
    );
    const previousRubric = rubrics.find((r) => r.id === normalizedRubric.id);
    if (previousRubric) {
      setSessions((prev) =>
        prev.map((ses) => {
          if (ses.rubricId === normalizedRubric.id && !ses.rubricSnapshot) {
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
      const exists = prev.some((r) => r.id === normalizedRubric.id);
      if (exists) {
        return prev.map((r) =>
          r.id === normalizedRubric.id ? normalizedRubric : r
        );
      }
      return [...prev, normalizedRubric];
    });
  };

  // P0 #7: Freeze rubric snapshot in any session using a rubric before removing the template
  const handleDeleteRubric = (rubricId: string) => {
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

  const applyRestoredBackupState = useCallback(
    (restoredState: AppDataState, successMessage: string) => {
      unlockStorageWriteLock();
      lastSyncedChecksumRef.current = computePayloadChecksum(restoredState);
      setClassrooms(restoredState.classrooms);
      setStudents(restoredState.students);
      setRubrics(restoredState.rubrics);
      setSessions(restoredState.sessions);
      const firstClassroom = restoredState.classrooms[0];
      setActiveClassId(firstClassroom?.id || '');
      if (firstClassroom?.gradeLevel) {
        setSelectedGradeLevel(firstClassroom.gradeLevel);
      }
      if (firstClassroom?.subject) {
        setSelectedSubject(firstClassroom.subject);
      }
      setActiveSessionId(
        restoredState.sessions[restoredState.sessions.length - 1]?.id || ''
      );
      setStorageSaveError(null);
      setIsStorageHydrated(true);
      void saveTransactionalState(restoredState, {
        forceUnlockCorruptionLock: true,
      });
      setBackupBanner({
        type: 'success',
        message: successMessage,
      });
    },
    []
  );

  const handleExportVerifiedBackup = async () => {
    if (isSavingBackup) return;
    setIsSavingBackup(true);
    setBackupBanner(null);
    try {
      const result = await saveVerifiedBackupFile({
        classrooms,
        students,
        rubrics,
        sessions,
      });

      if (result.status === 'saved') {
        setBackupBanner({
          type: 'success',
          message: result.message,
        });
      } else if (result.status === 'cancelled') {
        setBackupBanner({
          type: 'info',
          message: result.message,
        });
      } else {
        setBackupBanner({
          type: 'error',
          message: result.message,
        });
      }
    } catch {
      setBackupBanner({
        type: 'error',
        message: 'Yedek dosyası kaydedilirken beklenmeyen bir hata oluştu.',
      });
    } finally {
      setIsSavingBackup(false);
    }
  };

  const handleNativeSafRestore = async (mode: 'verified' | 'legacy') => {
    setBackupBanner(null);
    const result = await restoreBackupViaAndroidSaf({ mode });
    if (result.status === 'restored' && result.state) {
      applyRestoredBackupState(result.state, result.message);
    } else if (result.status === 'cancelled') {
      setBackupBanner({
        type: 'info',
        message: result.message,
      });
    } else {
      setBackupBanner({
        type: 'error',
        message: result.message,
      });
    }
  };

  const handleImportVerifiedBackup = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BACKUP_JSON_BYTES) {
      setBackupBanner({
        type: 'error',
        message: `Yedek dosyası boyutu güvenli sınırı (${Math.round(
          MAX_BACKUP_JSON_BYTES / (1024 * 1024)
        )} MB) aşıyor.`,
      });
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const verified = parseAndVerifyRestoredBackupText(
        text,
        'verified',
        file.name
      );
      if (verified.status !== 'restored' || !verified.state) {
        setBackupBanner({
          type: 'error',
          message: verified.message || 'Yedek doğrulaması başarısız oldu.',
        });
        return;
      }

      applyRestoredBackupState(verified.state, verified.message);
    } catch {
      setBackupBanner({
        type: 'error',
        message: 'Yedek dosyası okunurken bir hata oluştu.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleImportLegacyBackup = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BACKUP_JSON_BYTES) {
      setBackupBanner({
        type: 'error',
        message: `Yedek dosyası boyutu güvenli sınırı (${Math.round(
          MAX_BACKUP_JSON_BYTES / (1024 * 1024)
        )} MB) aşıyor.`,
      });
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const imported = parseAndVerifyRestoredBackupText(
        text,
        'legacy',
        file.name
      );
      if (imported.status !== 'restored' || !imported.state) {
        setBackupBanner({
          type: 'error',
          message:
            imported.message ||
            'Eski sürüm yedek aktarma işlemi başarısız oldu.',
        });
        return;
      }

      applyRestoredBackupState(imported.state, imported.message);
    } catch {
      setBackupBanner({
        type: 'error',
        message: 'Eski sürüm yedek dosyası okunurken bir hata oluştu.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const currentChecksum = createVerifiedBackupBundle({
    classrooms,
    students,
    rubrics,
    sessions,
  }).checksum;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900">
      {/* Top Navigation Bar — DEHB Dostu Nötr & Yüksek Kontrastlı Gezinme */}
      <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-300 shadow-2xs">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-15 flex items-center justify-between gap-3">
          {/* Brand Identity */}
          <div className="flex items-center gap-2.5">
            <img
              src="/icon.png"
              alt="RubrikPad Logosu"
              className="w-8 h-8 rounded-lg shadow-xs object-cover border border-slate-200"
            />
            <div>
              <span className="font-bold text-slate-900 text-sm tracking-tight">
                RubrikPad
              </span>
            </div>
          </div>

          {/* Primary Navigation — Low Visual Noise, High Contrast Active State */}
          <nav
            className="flex items-center gap-1.5 overflow-x-auto"
            aria-label="Ana Gezinme Menüsü"
          >
            <button
              type="button"
              onClick={() => setActiveTab('evaluate')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                activeTab === 'evaluate'
                  ? 'bg-blue-900 text-white border-blue-950 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              <ClipboardCheck
                className={`w-3.5 h-3.5 ${
                  activeTab === 'evaluate' ? 'text-white' : 'text-slate-600'
                }`}
              />
              <span>1. Değerlendirme Ekranı</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('classes')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                activeTab === 'classes'
                  ? 'bg-blue-900 text-white border-blue-950 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              <Users
                className={`w-3.5 h-3.5 ${
                  activeTab === 'classes' ? 'text-white' : 'text-slate-600'
                }`}
              />
              <span>2. Sınıflar &amp; OCR</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rubrics')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                activeTab === 'rubrics'
                  ? 'bg-blue-900 text-white border-blue-950 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              <BookOpen
                className={`w-3.5 h-3.5 ${
                  activeTab === 'rubrics' ? 'text-white' : 'text-slate-600'
                }`}
              />
              <span>3. Rubrik Kütüphanesi</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                activeTab === 'reports'
                  ? 'bg-blue-900 text-white border-blue-950 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              <BarChart3
                className={`w-3.5 h-3.5 ${
                  activeTab === 'reports' ? 'text-white' : 'text-slate-600'
                }`}
              />
              <span>4. Gelişim &amp; Raporlar</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('archive')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer border ${activeTab === 'archive' ? 'bg-blue-900 text-white border-blue-950 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'}`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>5. Arşiv</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              data-testid="nav-tab-settings"
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                activeTab === 'settings'
                  ? 'bg-blue-900 text-white border-blue-950 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              <Settings
                className={`w-3.5 h-3.5 ${
                  activeTab === 'settings' ? 'text-white' : 'text-slate-600'
                }`}
              />
              <span>6. Ayarlar</span>
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
              className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
              title="Doğrulanabilir Yedekleme ve Geri Yükleme (IndexedDB + Checksum)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-900" />
              <span className="hidden md:inline">Yedekle / Geri Yükle</span>
            </button>
          </div>
        </div>
      </header>

      {/* Storage Save Error Alert Banner (Issue #4) */}
      {storageSaveError && (
        <div
          role="alert"
          className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-xs text-red-900"
        >
          <div className="w-full px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
              <span>Veri Kaydetme Uyarısı: {storageSaveError}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExportVerifiedBackup()}
                disabled={isSavingBackup}
                className="px-2.5 py-1 rounded bg-red-700 text-white font-bold hover:bg-red-800 disabled:opacity-60 cursor-pointer"
              >
                {isSavingBackup ? 'Kaydediliyor...' : 'Acil Yedek İndir (.json)'}
              </button>
              <button
                type="button"
                onClick={() => void performTransactionalSave()}
                className="px-2.5 py-1 rounded bg-white border border-red-300 text-red-900 font-semibold hover:bg-red-100 cursor-pointer"
              >
                Tekrar Kaydet
              </button>
              <button
                type="button"
                onClick={() => setStorageSaveError(null)}
                className="px-2 py-1 text-red-700 hover:underline cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automatic IndexedDB Recovery / v2->v3 Migration Notice Banner (Issues #1 & #3) */}
      {recoveryBanner && (
        <div
          role="status"
          aria-live="polite"
          className="bg-slate-200/80 border-b border-slate-300 px-4 py-2 text-xs text-slate-900"
        >
          <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <Check className="w-4 h-4 text-blue-900 shrink-0" />
              <span>{recoveryBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setRecoveryBanner(null)}
              className="text-blue-900 font-bold hover:underline cursor-pointer"
            >
              Tamam
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'evaluate' && (
          <EvaluationWorkspace
            classrooms={classrooms}
            students={students}
            rubrics={rubrics}
            sessions={activeSessions}
            activeSessionId={activeSessionId}
            selectedGradeLevel={selectedGradeLevel}
            selectedSubject={selectedSubject}
            onChangeGradeLevel={setSelectedGradeLevel}
            onChangeSubject={setSelectedSubject}
            onSelectSession={setActiveSessionId}
            onUpdateSession={handleUpdateSession}
            onCreateSession={handleCreateSession}
            onDeleteSession={handleDeleteSession}
            onArchiveSession={handleArchiveSession}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'classes' && (
          <ClassroomManager
            classrooms={classrooms}
            students={students}
            rubrics={rubrics}
            sessions={sessions}
            activeClassId={activeClassId}
            onSelectClass={handleSelectClassroom}
            onAddClassroom={handleAddClassroom}
            onUpdateClassroom={handleUpdateClassroom}
            onDeleteClassroom={handleDeleteClassroom}
            onAddStudents={handleAddStudents}
            onUpdateStudent={handleUpdateStudent}
            onDeleteStudent={handleDeleteStudent}
          />
        )}

        {activeTab === 'rubrics' && (
          <RubricBuilder
            rubrics={filteredRubricsForBuilder}
            allRubrics={rubrics}
            catalogSummaries={rubricCatalogSummaries}
            sessions={sessions}
            classrooms={classrooms}
            selectedGradeLevel={selectedGradeLevel}
            selectedSubject={selectedSubject}
            onChangeGradeLevel={setSelectedGradeLevel}
            onChangeSubject={setSelectedSubject}
            onSaveRubric={handleSaveRubric}
            onDeleteRubric={handleDeleteRubric}
          />
        )}

        {activeTab === 'reports' && (
          <ProgressAndReports
            classrooms={classrooms}
            students={students}
            rubrics={rubrics}
            sessions={activeSessions}
            activeClassId={activeClassId}
            onSelectClass={setActiveClassId}
            onUpdateSession={handleUpdateSession}
            onDeleteSession={handleDeleteSession}
            onArchiveSession={handleArchiveSession}
            institutionSettings={institutionSettings}
          />
        )}

        {activeTab === 'archive' && (
          <ArchivePanel classrooms={classrooms} students={students} rubrics={rubrics} sessions={sessions}
            onRestore={(id) => handleArchiveSession(id, false)} onDelete={handleDeleteSession} />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            institutionSettings={institutionSettings}
            onUpdateSettings={handleUpdateInstitutionSettings}
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
                <ShieldCheck className="w-5 h-5 text-blue-900" />
                <h2 className="text-base font-bold text-slate-900">
                  Yedekle ve Geri Yükle
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

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-700 shrink-0">
                  Bütünlük Özeti (SHA-256):
                </span>
                <span
                  className="font-mono-num font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300 truncate max-w-[240px]"
                  title={currentChecksum}
                >
                  {currentChecksum}
                </span>
              </div>
            </div>

            {backupBanner && (
              <div
                role="alert"
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  backupBanner.type === 'success'
                    ? 'bg-slate-100 text-slate-900 border border-slate-300'
                    : backupBanner.type === 'info'
                    ? 'bg-amber-50 text-amber-950 border border-amber-200'
                    : 'bg-red-50 text-red-900 border border-red-200'
                }`}
              >
                {backupBanner.type === 'success' ? (
                  <Check className="w-4 h-4 text-blue-900 shrink-0" />
                ) : backupBanner.type === 'info' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
                )}
                <span className="min-w-0 break-all">{backupBanner.message}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleExportVerifiedBackup()}
                disabled={isSavingBackup}
                className="p-3.5 rounded-xl bg-blue-900 hover:bg-blue-950 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>
                  {isSavingBackup
                    ? 'Konum Seçiliyor...'
                    : 'Yedek İndir (.json)'}
                </span>
              </button>

              {detectNativeAndroidEnvironment() ? (
                <button
                  type="button"
                  onClick={() => void handleNativeSafRestore('verified')}
                  className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer text-center"
                >
                  <Upload className="w-4 h-4" />
                  <span>Yedek Geri Yükle</span>
                </button>
              ) : (
                <label className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer text-center">
                  <Upload className="w-4 h-4" />
                  <span>Yedek Geri Yükle</span>
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={handleImportVerifiedBackup}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-amber-950">
                Eski Sürüm (v1/v2) Yedek:
              </span>
              {detectNativeAndroidEnvironment() ? (
                <button
                  type="button"
                  onClick={() => void handleNativeSafRestore('legacy')}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Eski Yedek Aktar</span>
                </button>
              ) : (
                <label className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold flex items-center gap-1.5 cursor-pointer shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Eski Yedek Aktar</span>
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={handleImportLegacyBackup}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
