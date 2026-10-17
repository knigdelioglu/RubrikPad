import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Rubric, Student, StudentEvaluation } from './types';
import {
  INITIAL_RUBRICS,
  INITIAL_STUDENTS,
  INITIAL_EVALUATIONS,
  createDefaultLevels,
} from './data/defaultData';
import { QuickEvaluateView } from './components/QuickEvaluateView';
import { RubricManagerView } from './components/RubricManagerView';
import { StudentManagerView } from './components/StudentManagerView';
import { ResultsAnalyticsView } from './components/ResultsAnalyticsView';

type ActiveTab = 'quick-evaluate' | 'rubrics' | 'students' | 'results';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('quick-evaluate');

  const [rubrics, setRubrics] = useState<Rubric[]>(() => {
    try {
      const saved = localStorage.getItem('rubriklab_rubrics_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return INITIAL_RUBRICS;
  });

  const [students, setStudents] = useState<Student[]>(() => {
    try {
      const saved = localStorage.getItem('rubriklab_students_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return INITIAL_STUDENTS;
  });

  const [evaluations, setEvaluations] = useState<StudentEvaluation[]>(() => {
    try {
      const saved = localStorage.getItem('rubriklab_evaluations_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return INITIAL_EVALUATIONS;
  });

  const [selectedRubricId, setSelectedRubricId] = useState<string>(
    rubrics[0]?.id || 'rubric-8-criteria'
  );
  const [draftNewRubric, setDraftNewRubric] = useState<Rubric | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('rubriklab_rubrics_v2', JSON.stringify(rubrics));
    } catch {
      // ignore
    }
  }, [rubrics]);

  useEffect(() => {
    try {
      localStorage.setItem('rubriklab_students_v2', JSON.stringify(students));
    } catch {
      // ignore
    }
  }, [students]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'rubriklab_evaluations_v2',
        JSON.stringify(evaluations)
      );
    } catch {
      // ignore
    }
  }, [evaluations]);

  const handleSaveEvaluation = (evaluation: StudentEvaluation) => {
    setEvaluations((prev) => {
      const idx = prev.findIndex(
        (e) =>
          e.rubricId === evaluation.rubricId &&
          e.studentId === evaluation.studentId
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = evaluation;
        return updated;
      }
      return [...prev, evaluation];
    });
  };

  const handleSaveRubric = (rubric: Rubric) => {
    setRubrics((prev) => {
      const idx = prev.findIndex((r) => r.id === rubric.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = rubric;
        return updated;
      }
      return [rubric, ...prev];
    });
    setSelectedRubricId(rubric.id);
  };

  const handleDeleteRubric = (id: string) => {
    setRubrics((prev) => {
      const remaining = prev.filter((r) => r.id !== id);
      if (selectedRubricId === id && remaining.length > 0) {
        setSelectedRubricId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleOpenCreateRubric = () => {
    const newRubric: Rubric = {
      id: `rubric-${Date.now()}`,
      title: 'Yeni Değerlendirme Rubriği',
      course: 'Genel Ders',
      totalPoints: 100,
      createdAt: new Date().toISOString().slice(0, 10),
      criteria: [
        {
          id: `crit-${Date.now()}-1`,
          title: '1. Kriter Başlığı',
          maxPoints: 15,
          levels: createDefaultLevels(15),
        },
        {
          id: `crit-${Date.now()}-2`,
          title: '2. Kriter Başlığı',
          maxPoints: 15,
          levels: createDefaultLevels(15),
        },
        {
          id: `crit-${Date.now()}-3`,
          title: '3. Kriter Başlığı',
          maxPoints: 15,
          levels: createDefaultLevels(15),
        },
        {
          id: `crit-${Date.now()}-4`,
          title: '4. Kriter Başlığı',
          maxPoints: 15,
          levels: createDefaultLevels(15),
        },
        {
          id: `crit-${Date.now()}-5`,
          title: '5. Kriter Başlığı',
          maxPoints: 15,
          levels: createDefaultLevels(15),
        },
        {
          id: `crit-${Date.now()}-6`,
          title: '6. Kriter Başlığı',
          maxPoints: 15,
          levels: createDefaultLevels(15),
        },
        {
          id: `crit-${Date.now()}-7`,
          title: '7. Kriter Başlığı',
          maxPoints: 10,
          levels: createDefaultLevels(10),
        },
      ],
    };
    setDraftNewRubric(newRubric);
    setActiveTab('rubrics');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 zones (Brand, 4 Nav Links, 1 Primary Action) */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-8">
        <a
          href="#quick-evaluate"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('quick-evaluate');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          RubrikLab
        </a>

        <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('quick-evaluate')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'quick-evaluate'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Hızlı Değerlendirme
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rubrics')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'rubrics'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Rubrikler
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('students')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'students'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Öğrenciler
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('results')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'results'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Sonuçlar
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleOpenCreateRubric}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Rubrik Ekle</span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-4">
        {activeTab === 'quick-evaluate' && (
          <QuickEvaluateView
            rubrics={rubrics}
            students={students}
            evaluations={evaluations}
            selectedRubricId={selectedRubricId}
            onSelectRubric={setSelectedRubricId}
            onSaveEvaluation={handleSaveEvaluation}
            onOpenNewRubric={handleOpenCreateRubric}
          />
        )}

        {activeTab === 'rubrics' && (
          <RubricManagerView
            rubrics={rubrics}
            selectedRubricId={selectedRubricId}
            onSaveRubric={handleSaveRubric}
            onDeleteRubric={handleDeleteRubric}
            onStartEvaluatingWithRubric={(id) => {
              setSelectedRubricId(id);
              setActiveTab('quick-evaluate');
            }}
            initialEditingRubric={draftNewRubric}
            onClearInitialEditing={() => setDraftNewRubric(null)}
          />
        )}

        {activeTab === 'students' && (
          <StudentManagerView
            students={students}
            onAddStudent={(st) => setStudents((prev) => [...prev, st])}
            onBulkAddStudents={(list) =>
              setStudents((prev) => [...prev, ...list])
            }
            onDeleteStudent={(id) =>
              setStudents((prev) => prev.filter((s) => s.id !== id))
            }
          />
        )}

        {activeTab === 'results' && (
          <ResultsAnalyticsView
            rubrics={rubrics}
            students={students}
            evaluations={evaluations}
            selectedRubricId={selectedRubricId}
            onSelectRubric={setSelectedRubricId}
          />
        )}
      </main>
    </div>
  );
}
