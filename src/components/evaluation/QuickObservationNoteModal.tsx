import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Check,
  MessageSquare,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  Student,
  StudentEvaluation,
} from '../../types.ts';
import { QUICK_OBSERVATION_TAGS } from '../../data/seedData.ts';
import {
  MAX_NOTE_LENGTH,
  sanitizeObservationText,
  type ConsecutiveLowScoreReminder,
} from '../../utils/rubricLogic.ts';

interface QuickObservationNoteModalProps {
  student: Student;
  sessionTitle: string;
  sessionDate: string;
  evaluation?: StudentEvaluation;
  lowScoreReminder?: ConsecutiveLowScoreReminder;
  onSave: (studentId: string, note: string, tags: string[]) => void;
  onClose: () => void;
}

export const QuickObservationNoteModal: React.FC<
  QuickObservationNoteModalProps
> = ({
  student,
  sessionTitle,
  sessionDate,
  evaluation,
  lowScoreReminder,
  onSave,
  onClose,
}) => {
  const [noteText, setNoteText] = useState<string>(evaluation?.note || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(
    (evaluation?.tags || []).map((tag) => tag === 'Yaratıcı Çözüm' ? 'Çözüm Odaklı' : tag)
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setNoteText(evaluation?.note || '');
    setSelectedTags((evaluation?.tags || []).map((tag) => tag === 'Yaratıcı Çözüm' ? 'Çözüm Odaklı' : tag));
  }, [student.id, evaluation]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [student.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleClear = () => {
    setNoteText('');
    setSelectedTags([]);
    textareaRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = sanitizeObservationText(noteText, MAX_NOTE_LENGTH);
    onSave(student.id, cleaned, selectedTags);
    onClose();
  };

  const hasContent = noteText.trim().length > 0 || selectedTags.length > 0;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
      data-testid="quick-observation-note-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-observation-modal-title"
        data-testid="quick-observation-note-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white border border-slate-300 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Compact Modal Header */}
        <div className="px-4 py-3 bg-slate-900 text-white flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-900 text-white border border-blue-700 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4" />
              </span>
              <div>
                <h3
                  id="quick-observation-modal-title"
                  className="text-sm font-bold leading-tight text-white"
                >
                  Hızlı Gözlem Notu
                </h3>
                <p className="text-[11px] text-slate-300 truncate">
                  Oturum: {sessionTitle} ({sessionDate})
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Hızlı gözlem notu penceresini kapat"
            data-testid="close-quick-observation-modal-btn"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          {/* Student Identity Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-100 border border-slate-300">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded-md bg-blue-900 text-white">
                #{student.studentNumber}
              </span>
              <span
                className="text-sm font-bold text-slate-900 truncate"
                data-testid="quick-observation-modal-student-name"
              >
                {student.fullName}
              </span>
            </div>
          </div>

          {/* Low-score Consecutive Reminder Callout if applicable */}
          {lowScoreReminder?.shouldRemind && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">
                  Üst üste {lowScoreReminder.consecutiveCount} değerlendirmede
                  düşük puan (1–2):
                </span>{' '}
                Öğrencinin gelişimini desteklemek için kısa bir gözlem notu
                eklemeniz önerilir.
              </div>
            </div>
          )}

          {/* Read-only Group Note context if student also has a group note */}
          {evaluation?.groupNote && (
            <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-[11px] text-slate-800 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-slate-700 shrink-0" />
              <span className="truncate">
                <strong>Grup Notu:</strong> &ldquo;{evaluation.groupNote}&rdquo;
              </span>
            </div>
          )}

          {/* Quick Observation Tags */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3 h-3 text-slate-700" />
              Hızlı Gözlem Etiketleri
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_OBSERVATION_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    data-testid={`quick-modal-tag-${tag}`}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-900 text-white border-blue-950 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-white hover:border-blue-900'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note Textarea */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="quick-obs-modal-textarea"
                className="text-xs font-bold text-slate-800 flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5 text-slate-700" />
                Öğretmen Gözlem Notu
              </label>
              <span className="font-mono-num text-[11px] text-slate-500">
                {noteText.length} / {MAX_NOTE_LENGTH}
              </span>
            </div>

            <textarea
              id="quick-obs-modal-textarea"
              ref={textareaRef}
              rows={3}
              maxLength={MAX_NOTE_LENGTH}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  const cleaned = sanitizeObservationText(
                    noteText,
                    MAX_NOTE_LENGTH
                  );
                  onSave(student.id, cleaned, selectedTags);
                  onClose();
                }
              }}
              data-testid="quick-observation-note-textarea"
              placeholder={`${student.fullName} için gözlem notu yazın...`}
              className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-900"
            />
          </div>

          {/* Compact Footer Actions */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
            <div>
              {hasContent && (
                <button
                  type="button"
                  onClick={handleClear}
                  data-testid="clear-quick-observation-note-btn"
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Temizle
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                data-testid="cancel-quick-observation-note-btn"
                className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                data-testid="save-quick-observation-note-btn"
                className="px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                Notu Kaydet
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
