/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
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
import { EvaluationWorkspace } from './components/EvaluationWorkspace.tsx';
import { ClassroomManager } from './components/ClassroomManager.tsx';
import { RubricBuilder } from './components/RubricBuilder.tsx';
import { ProgressAndReports } from './components/ProgressAndReports.tsx';
import { generateSessionCsv } from './utils/rubricLogic.ts';

type NavTab = 'evaluate' | 'classrooms' | 'rubrics' | 'reports';

const STORAGE_KEY = 'rubrikpad_state_v2';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('evaluate');

  const [classrooms, setClassrooms] = useState<Classroom[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.classrooms) && parsed.classrooms.length > 0) {
          return parsed.classrooms;
        }
      }
    } catch {
      // ignore storage error
    }
    return INITIAL_CLASSROOMS;
  });

  const [students, setStudents] = useState<Student[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.students) && parsed.students.length > 0) {
          return parsed.students;
        }
      }
    } catch {
      // ignore storage error
    }
    return INITIAL_STUDENTS;
  });

  const [rubrics, setRubrics] = useState<Rubric[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.rubrics) && parsed.rubrics.length > 0) {
          return parsed.rubrics;
        }
      }
    } catch {
      // ignore storage error
    }
    return INITIAL_RUBRICS;
  });

  const [sessions, setSessions] = useState<EvaluationSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
          return parsed.sessions;
        }
      }
    } catch {
      // ignore storage error
    }
    return INITIAL_SESSIONS;
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const inProgress = INITIAL_SESSIONS.find((s) => s.status === 'in_progress');
    return inProgress?.id || INITIAL_SESSIONS[0].id;
  });

  const [reportTargetStudentId, setReportTargetStudentId] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ classrooms, students, rubrics, sessions })
      );
    } catch {
      // ignore quota error
    }
  }, [classrooms, students, rubrics, sessions]);

  const handleUpdateSession = (updated: EvaluationSession) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
  };

  const handleCreateSession = (newSession: EvaluationSession) => {
    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newSession.id);
    setActiveTab('evaluate');
  };

  const handleAddClassroom = (cls: Classroom) => {
    setClassrooms((prev) => [...prev, cls]);
  };

  const handleAddStudents = (newStudents: Student[]) => {
    setStudents((prev) => [...prev, ...newStudents]);
  };

  const handleRemoveStudent = (studentId: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
  };

  const handleSaveRubric = (rubric: Rubric) => {
    setRubrics((prev) => {
      const exists = prev.some((r) => r.id === rubric.id);
      if (exists) {
        return prev.map((r) => (r.id === rubric.id ? rubric : r));
      }
      return [...prev, rubric];
    });
  };

  const handleDeleteRubric = (rubricId: string) => {
    setRubrics((prev) => prev.filter((r) => r.id !== rubricId));
  };

  const handleQuickExportActiveSessionCsv = () => {
    const currentSes =
      sessions.find((s) => s.id === activeSessionId) || sessions[0];
    if (!currentSes) return;
    const rubric =
      rubrics.find((r) => r.id === currentSes.rubricId) || rubrics[0];
    const clsStudents = students.filter((s) => s.classId === currentSes.classId);
    if (!rubric) return;

    const csv = generateSessionCsv(currentSes, rubric, clsStudents);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `rubrikpad_${currentSes.date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleResetDemoData = () => {
    localStorage.removeItem(STORAGE_KEY);
    setClassrooms(INITIAL_CLASSROOMS);
    setStudents(INITIAL_STUDENTS);
    setRubrics(INITIAL_RUBRICS);
    setSessions(INITIAL_SESSIONS);
    setActiveSessionId('ses-active-3');
  };

  const currentActiveSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const isFastEvaluationFullScreen =
    activeTab === 'evaluate' && currentActiveSession?.mode === 'grid';

  return (
    <div className="min-h-dvh md:h-dvh md:overflow-hidden flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Hidden in Full-Screen Fast Evaluation Mode */}
      {!isFastEvaluationFullScreen && (
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-2 gap-x-8 shrink-0 no-print">
          {/* Zone 1: Brand Title */}
          <a
            href="#evaluate"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('evaluate');
            }}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
          >
            RubrikPad
          </a>

          {/* Zone 2: 4 Single-line Navigation Links */}
          <nav
            aria-label="Ana Gezinme"
            className="order-3 sm:order-2 w-full sm:w-auto flex items-center justify-between sm:justify-center gap-3 sm:gap-6 text-xs sm:text-sm font-medium text-slate-600 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-100"
          >
            <button
              type="button"
              onClick={() => setActiveTab('evaluate')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === 'evaluate'
                  ? 'border-sky-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Değerlendirme
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('classrooms')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === 'classrooms'
                  ? 'border-sky-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Sınıflar & OCR
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rubrics')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === 'rubrics'
                  ? 'border-sky-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Rubrikler
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === 'reports'
                  ? 'border-sky-700 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Gelişim & Raporlar
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="order-2 sm:order-3 flex items-center shrink-0">
            <button
              type="button"
              onClick={handleQuickExportActiveSessionCsv}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              CSV Dışa Aktar
            </button>
          </div>
        </header>
      )}

      {/* Main Content Container */}
      <main
        className={`flex-1 min-h-0 max-w-[1920px] w-full mx-auto px-3 sm:px-5 py-2 flex flex-col ${
          activeTab === 'evaluate' ? 'md:overflow-hidden' : 'overflow-y-auto'
        }`}
      >
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
            onNavigateToReports={() => setActiveTab('reports')}
          />
        )}

        {activeTab === 'classrooms' && (
          <ClassroomManager
            classrooms={classrooms}
            students={students}
            sessions={sessions}
            rubrics={rubrics}
            onAddClassroom={handleAddClassroom}
            onAddStudents={handleAddStudents}
            onRemoveStudent={handleRemoveStudent}
            onSelectStudentForProgress={(stuId) => {
              setReportTargetStudentId(stuId);
              setActiveTab('reports');
            }}
          />
        )}

        {activeTab === 'rubrics' && (
          <RubricBuilder
            rubrics={rubrics}
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
            initialSelectedStudentId={reportTargetStudentId}
          />
        )}
      </main>

      {/* Quiet Footer: Hidden in Full-Screen Fast Evaluation Mode */}
      {!isFastEvaluationFullScreen && (
        <footer className="border-t border-slate-200 bg-white px-4 sm:px-6 py-1.5 text-[11px] text-slate-500 shrink-0 no-print">
          <div className="max-w-[1920px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-1">
            <span className="truncate">
              RubrikPad — Ölçüt Temelli Bireysel ve Grup Değerlendirme Sistemi · Veriler tablet hafızasında otomatik saklanır
            </span>
            <button
              type="button"
              onClick={handleResetDemoData}
              className="text-slate-500 hover:text-slate-900 underline underline-offset-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              Örnek Verileri Sıfırla
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
