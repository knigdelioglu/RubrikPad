import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Plus,
  RotateCcw,
  Send,
  Shuffle,
  Sliders,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  Classroom,
  EvaluationSession,
  Rubric,
  Student,
  StudentGroup,
} from '../../types.ts';
import {
  canApplyGroupScoresToMembers,
  findDuplicateGroupMemberships,
  getFocusModeStepSummary,
  getGroupLifecycleStatus,
  getGroupProgressHistory,
  getNextFocusedCriterionIndexAfterScore,
  getNextPendingGroup,
  getSessionGroupsForClassroom,
  getSessionStudentsForClassroom,
  getStudentEvaluationBreakdown,
  hasGroupEvaluationData,
  isScoreAssigned,
  redistributeGroupsSafely,
  resolveFocusedCriterionIndex,
  type CriterionFocusDisplayMode,
} from '../../utils/rubricLogic.ts';
import {
  CriterionFocusToolbar,
  FocusModeStepperBar,
  RubricCriterionCard,
  RubricViewModeToggle,
  type RubricCardViewMode,
} from './RubricCriterionCard.tsx';

interface GroupEvaluationViewProps {
  activeSession: EvaluationSession;
  activeRubric: Rubric;
  allSessions: EvaluationSession[];
  rubricsById: Record<string, Rubric>;
  classStudents: Student[];
  classGroups?: StudentGroup[];
  sessionClassrooms?: Classroom[];
  activeClassroom?: Classroom;
  onSelectClassroom?: (classId: string) => void;
  allStudents?: Student[];
  selectedGroupId: string;
  onSelectGroup: (groupId: string) => void;
  cardViewMode: RubricCardViewMode;
  onChangeCardViewMode: (mode: RubricCardViewMode) => void;
  precisionScoringMode: boolean;
  onTogglePrecisionScoring: () => void;
  onAddGroup: (group: StudentGroup) => void;
  onReplaceAllGroups: (groups: StudentGroup[]) => void;
  onDeleteGroup: (groupId: string) => void;
  onToggleGroupMember: (groupId: string, studentId: string) => void;
  onSelectGroupCriterionLevel: (criterionId: string, points: number) => void;
  onSetGroupDirectCriterionScore: (
    criterionId: string,
    directPoints: number | null
  ) => void;
  onClearGroupCriterionScore: (criterionId: string) => void;
  onResetGroupScores: (groupId: string) => void;
  onUpdateGroupNote: (note: string) => void;
  onApplyGroupScoresToMembers: (
    group: StudentGroup,
    options?: { advanceToNextGroup?: boolean }
  ) => void;
  onTransferAllCompletedGroups?: () => void;
  autoTransferToMembers?: boolean;
  onToggleAutoTransferToMembers?: () => void;
  onInspectStudentInIndividualMode?: (studentId: string) => void;
  groupAppliedFeedback: string | null;
  lastAppliedGroupBanner?: {
    previousGroupId: string;
    previousGroupName: string;
    appliedScoreOutOf100: number | null;
    memberCount: number;
    nextGroupName: string | null;
  } | null;
  onDismissGroupBanner?: () => void;
}

export const GroupEvaluationView: React.FC<GroupEvaluationViewProps> = ({
  activeSession,
  activeRubric,
  allSessions,
  rubricsById,
  classStudents,
  classGroups,
  sessionClassrooms = [],
  activeClassroom,
  onSelectClassroom,
  allStudents = [],
  selectedGroupId,
  onSelectGroup,
  cardViewMode,
  onChangeCardViewMode,
  precisionScoringMode,
  onTogglePrecisionScoring,
  onAddGroup,
  onReplaceAllGroups,
  onDeleteGroup,
  onToggleGroupMember,
  onSelectGroupCriterionLevel,
  onSetGroupDirectCriterionScore,
  onClearGroupCriterionScore,
  onResetGroupScores,
  onUpdateGroupNote,
  onApplyGroupScoresToMembers,
  onTransferAllCompletedGroups,
  autoTransferToMembers = true,
  onToggleAutoTransferToMembers,
  onInspectStudentInIndividualMode,
  groupAppliedFeedback,
  lastAppliedGroupBanner,
  onDismissGroupBanner,
}) => {
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [groupFormError, setGroupFormError] = useState<string | null>(null);

  // Balanced Random Group Generator state with safe redistribution protection (Issue #5)
  const [showRandomModal, setShowRandomModal] = useState(false);
  const [randomTargetSize, setRandomTargetSize] = useState(3);
  const [preserveScoredGroups, setPreserveScoredGroups] = useState(true);
  const [confirmOverwriteScoredGroups, setConfirmOverwriteScoredGroups] =
    useState(false);
  const [randomRedistributeWarning, setRandomRedistributeWarning] = useState<
    string | null
  >(null);

  // Longitudinal Group History toggle (P1 #6)
  const [showGroupHistory, setShowGroupHistory] = useState(false);

  // Member selector drawer & portrait group switcher
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [showPortraitGroupDrawer, setShowPortraitGroupDrawer] = useState(false);
  const [focusModeEnabled, setFocusModeEnabled] = useState(true);
  const [focusDisplayMode, setFocusDisplayMode] =
    useState<CriterionFocusDisplayMode>('hide_others');
  const [focusedCriterionIndex, setFocusedCriterionIndex] = useState(0);

  const effectiveClassId = activeClassroom?.id || activeSession.classId;
  const effectiveGroups = useMemo(
    () => classGroups ?? activeSession.groups,
    [classGroups, activeSession.groups]
  );

  const selectedGroup = useMemo(
    () =>
      effectiveGroups.find((g) => g.id === selectedGroupId) ||
      effectiveGroups[0],
    [effectiveGroups, selectedGroupId]
  );

  useEffect(() => {
    setFocusedCriterionIndex(
      resolveFocusedCriterionIndex(
        activeRubric.criteria,
        0,
        selectedGroup?.criterionScores,
        selectedGroup?.directCriterionScores,
        true
      )
    );
  }, [selectedGroup?.id, activeRubric.id]);

  const focusStepSummary = useMemo(
    () =>
      getFocusModeStepSummary(
        activeRubric.criteria,
        focusedCriterionIndex,
        selectedGroup?.criterionScores,
        selectedGroup?.directCriterionScores
      ),
    [
      activeRubric.criteria,
      focusedCriterionIndex,
      selectedGroup?.criterionScores,
      selectedGroup?.directCriterionScores,
    ]
  );

  const selectedGroupIndex = useMemo(
    () => effectiveGroups.findIndex((g) => g.id === selectedGroup?.id),
    [effectiveGroups, selectedGroup]
  );

  const prevGroup =
    selectedGroupIndex > 0
      ? effectiveGroups[selectedGroupIndex - 1]
      : null;
  const nextGroup =
    selectedGroupIndex >= 0 &&
    selectedGroupIndex < effectiveGroups.length - 1
      ? effectiveGroups[selectedGroupIndex + 1]
      : null;

  const evaluatedGroupsCount = useMemo(
    () =>
      (effectiveGroups || []).filter((g) => hasGroupEvaluationData(g))
        .length,
    [effectiveGroups]
  );

  const completedGroupsCount = useMemo(
    () =>
      (effectiveGroups || []).filter(
        (g) => canApplyGroupScoresToMembers(g, activeRubric).allowed
      ).length,
    [effectiveGroups, activeRubric]
  );

  const unappliedCompletedGroupsCount = useMemo(
    () =>
      (effectiveGroups || []).filter((g) => {
        const st = getGroupLifecycleStatus(
          activeRubric,
          g,
          activeSession.evaluations
        );
        return st.state === 'completed_unapplied' && g.studentIds.length > 0;
      }).length,
    [effectiveGroups, activeRubric, activeSession.evaluations]
  );

  const groupHistory = useMemo(
    () =>
      getGroupProgressHistory(
        allSessions,
        rubricsById,
        effectiveClassId,
        allStudents.length > 0 ? allStudents : classStudents
      ),
    [allSessions, rubricsById, effectiveClassId, allStudents, classStudents]
  );

  const studentsById = useMemo(() => {
    const map: Record<string, Student> = {};
    for (const s of classStudents) map[s.id] = s;
    return map;
  }, [classStudents]);

  // Map studentId -> groupName for membership conflict prevention (P1 #5)
  const assignedGroupByStudentId = useMemo(() => {
    const map: Record<string, { groupId: string; groupName: string }> = {};
    for (const g of effectiveGroups) {
      for (const sid of g.studentIds) {
        map[sid] = { groupId: g.id, groupName: g.name };
      }
    }
    return map;
  }, [effectiveGroups]);

  const activeGroupLifecycle = useMemo(() => {
    if (!selectedGroup) return null;
    return getGroupLifecycleStatus(
      activeRubric,
      selectedGroup,
      activeSession.evaluations
    );
  }, [activeRubric, selectedGroup, activeSession.evaluations]);

  const nextPendingGroup = useMemo(() => {
    if (!selectedGroup) return null;
    return getNextPendingGroup(
      effectiveGroups,
      activeSession.evaluations,
      activeRubric,
      selectedGroup.id
    );
  }, [effectiveGroups, activeSession.evaluations, activeRubric, selectedGroup]);

  const filteredMemberCandidates = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase();
    if (!q) return classStudents;
    return classStudents.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q)
    );
  }, [classStudents, memberSearchQuery]);

  const getInitials = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    setGroupFormError(null);
    if (!newGroupName.trim()) {
      setGroupFormError('Lütfen grup adını girin.');
      return;
    }

    const conflicts = findDuplicateGroupMemberships(
      effectiveGroups,
      newGroupMemberIds
    );
    if (conflicts.length > 0) {
      setGroupFormError(
        `Seçilen öğrencilerden bazıları zaten başka bir grupta yer alıyor (${conflicts[0].existingGroupName}).`
      );
      return;
    }

    const newGroup: StudentGroup = {
      id: `grp-${Date.now()}`,
      name: newGroupName.trim(),
      classId: effectiveClassId,
      studentIds: newGroupMemberIds,
      criterionScores: {},
      groupNote: '',
    };
    onAddGroup(newGroup);
    onSelectGroup(newGroup.id);
    setNewGroupName('');
    setNewGroupMemberIds([]);
    setShowNewGroupForm(false);
  };

  const handleGenerateBalancedRandom = () => {
    setRandomRedistributeWarning(null);
    const result = redistributeGroupsSafely(
      effectiveGroups,
      classStudents,
      {
        targetGroupSize: randomTargetSize,
        preserveEvaluatedGroups: preserveScoredGroups,
        allowOverwriteEvaluated: confirmOverwriteScoredGroups,
        classId: effectiveClassId,
      }
    );

    if (result.blocked) {
      setRandomRedistributeWarning(
        result.warning ||
          'Puanlanmış grupların üzerine yazmak için onay kutusunu işaretleyin.'
      );
      return;
    }

    if (result.groups.length > 0) {
      onReplaceAllGroups(result.groups);
      onSelectGroup(result.groups[result.groups.length - 1].id);
      setShowRandomModal(false);
      setConfirmOverwriteScoredGroups(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Group Action Bar */}
      <div className="bg-white border border-slate-300 rounded-2xl p-3.5 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-900" />
              Grup Değerlendirmesi
            </h2>
            {activeClassroom && (
              <span
                data-testid="group-active-classroom-badge"
                className="px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-bold text-blue-900"
              >
                {activeClassroom.name} ({classStudents.length} Öğrenci ·{' '}
                {effectiveGroups.length} Takım)
              </span>
            )}
          </div>

        <div className="flex flex-wrap items-center gap-2">
          {onToggleAutoTransferToMembers && (
            <button
              type="button"
              onClick={onToggleAutoTransferToMembers}
              aria-pressed={autoTransferToMembers}
              title="Grup değerlendirmesinin tüm ölçütleri tamamlandığında puan ve gözlem notunu gruptaki öğrencilere otomatik aktarır"
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 cursor-pointer min-h-[38px] transition-colors ${
                autoTransferToMembers
                  ? 'bg-slate-800 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${
                  autoTransferToMembers ? 'text-blue-300' : 'text-slate-400'
                }`}
              />
              Otomatik Öğrenciye Aktarım:{' '}
              {autoTransferToMembers ? 'Açık' : 'Kapalı'}
            </button>
          )}

          {onTransferAllCompletedGroups && completedGroupsCount > 0 && (
            <button
              type="button"
              onClick={onTransferAllCompletedGroups}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 cursor-pointer min-h-[38px] transition-colors ${
                unappliedCompletedGroupsCount > 0
                  ? 'bg-blue-900 text-white border-blue-950 hover:bg-blue-950 shadow-xs'
                  : 'bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              {unappliedCompletedGroupsCount > 0
                ? `Tamamlanan ${unappliedCompletedGroupsCount} Grubu Öğrencilere Aktar`
                : `Tüm Tamamlanan Grupları Öğrencilere Eşitle (${completedGroupsCount})`}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setRandomRedistributeWarning(null);
              setShowRandomModal(!showRandomModal);
            }}
            className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl flex items-center gap-1.5 cursor-pointer min-h-[38px]"
          >
            <Shuffle className="w-3.5 h-3.5" />
            Dengeli Rastgele Grup Oluştur
          </button>

          <button
            type="button"
            onClick={() => setShowGroupHistory(!showGroupHistory)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 cursor-pointer min-h-[38px] ${
              showGroupHistory
                ? 'bg-blue-900 text-white border-blue-950'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Grup Dönemsel Geçmişi ({groupHistory.length})
          </button>
        </div>
        </div>

        {/* Multi-Classroom Session Switcher inside Group Mode */}
        {sessionClassrooms.length > 1 && onSelectClassroom && (
          <div
            data-testid="group-view-class-switcher"
            className="pt-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-xs font-bold text-slate-600">
              Sınıf Bazlı Grup Değerlendirmesi (Şube Seçin):
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {sessionClassrooms.map((cls) => {
                const isSelectedCls = activeClassroom?.id === cls.id;
                const clsGroups = getSessionGroupsForClassroom(
                  activeSession.groups,
                  allStudents.length > 0 ? allStudents : classStudents,
                  cls.id,
                  activeSession.classId
                );
                const clsStudents = getSessionStudentsForClassroom(
                  allStudents.length > 0 ? allStudents : classStudents,
                  activeSession,
                  cls.id
                );
                return (
                  <button
                    key={cls.id}
                    type="button"
                    data-testid={`group-class-tab-${cls.id}`}
                    onClick={() => onSelectClassroom(cls.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelectedCls
                        ? 'bg-blue-900 text-white border-blue-950 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>{cls.name}</span>
                    <span
                      className={`text-[10px] font-mono-num px-1.5 py-0.5 rounded-md ${
                        isSelectedCls
                          ? 'bg-blue-800 text-blue-100'
                          : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      {clsGroups.length} grup · {clsStudents.length} öğr.
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Balanced Random Group Modal/Drawer */}
      {showRandomModal && (
        <div className="bg-slate-100 border border-slate-300 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-slate-900">
                Dengeli Rastgele Grup Dağıtımı ({classStudents.length} Öğrenci)
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <label
                htmlFor="rand-group-size"
                className="text-xs font-bold text-slate-900"
              >
                Grup Başına Öğrenci:
              </label>
              <select
                id="rand-group-size"
                value={randomTargetSize}
                onChange={(e) => setRandomTargetSize(Number(e.target.value))}
                className="px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg"
              >
                <option value={2}>2 Kişilik Eşli Gruplar</option>
                <option value={3}>3 Kişilik Takımlar</option>
                <option value={4}>4 Kişilik Takımlar</option>
                <option value={5}>5 Kişilik Takımlar</option>
              </select>
              <button
                type="button"
                onClick={handleGenerateBalancedRandom}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-lg cursor-pointer"
              >
                Grupları Dağıt
              </button>
              <button
                type="button"
                onClick={() => setShowRandomModal(false)}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>

          {evaluatedGroupsCount > 0 && (
            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 font-semibold text-slate-900 cursor-pointer">
                  <input
                    type="radio"
                    name="group-redistribute-mode"
                    checked={preserveScoredGroups}
                    onChange={() => {
                      setPreserveScoredGroups(true);
                      setRandomRedistributeWarning(null);
                    }}
                  />
                  Puanlanmış {evaluatedGroupsCount} Grubu Koru, Kalan Öğrencileri
                  Dağıt (Önerilen)
                </label>

                <label className="flex items-center gap-1.5 font-semibold text-amber-900 cursor-pointer">
                  <input
                    type="radio"
                    name="group-redistribute-mode"
                    checked={!preserveScoredGroups}
                    onChange={() => setPreserveScoredGroups(false)}
                  />
                  Tüm Grupları Baştan Oluştur
                </label>
              </div>

              {!preserveScoredGroups && (
                <label className="flex items-center gap-1.5 font-bold text-red-800 bg-white px-2.5 py-1 rounded border border-red-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmOverwriteScoredGroups}
                    onChange={(e) =>
                      setConfirmOverwriteScoredGroups(e.target.checked)
                    }
                  />
                  Puanlanmış grupların sıfırlanacağını onaylıyorum (Geri Al ile
                  kurtarılabilir)
                </label>
              )}
            </div>
          )}

          {randomRedistributeWarning && (
            <div
              role="alert"
              className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs font-semibold flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
              <span>{randomRedistributeWarning}</span>
            </div>
          )}
        </div>
      )}

      {/* Longitudinal Group Evaluation History (P1 #6) */}
      {showGroupHistory && (
        <div className="bg-white border border-slate-300 rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-sm font-bold text-slate-900">
              Grup Değerlendirme Geçmişi
            </h3>
          </div>
          {groupHistory.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              Bu sınıfa ait geçmiş grup değerlendirme kaydı bulunmuyor.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {groupHistory.map((item, idx) => (
                <div
                  key={`${item.sessionId}-${item.groupId}-${idx}`}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono-num">
                    <span>{item.date}</span>
                    <span>{item.memberCount} Üye</span>
                  </div>
                  <div className="font-bold text-slate-900">
                    {item.groupName}
                  </div>
                  <div className="text-[11px] text-slate-600 truncate">
                    {item.sessionTitle}
                  </div>
                  <div className="pt-1 flex items-center justify-between">
                    <span className="font-mono-num font-bold text-blue-900">
                      {item.isComplete && item.scoreOutOf100 !== null
                        ? `${item.scoreOutOf100} / 100`
                        : 'Taslak (Eksik Ölçüt)'}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                      {item.performanceLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Portrait Tablet Quick Group Switcher (< 1024px) */}
      <div className="lg:hidden bg-white border border-slate-200 rounded-xl p-2.5 shadow-xs flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!prevGroup}
          onClick={() => prevGroup && onSelectGroup(prevGroup.id)}
          className="min-h-[42px] px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 disabled:opacity-40 flex items-center gap-1 cursor-pointer shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
          Önceki
        </button>

        <button
          type="button"
          onClick={() => setShowPortraitGroupDrawer(!showPortraitGroupDrawer)}
          className="flex-1 min-h-[42px] px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-left flex items-center justify-between gap-2 cursor-pointer"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-blue-900">
              Takım Seçici ({effectiveGroups.length > 0 ? selectedGroupIndex + 1 : 0}/
              {effectiveGroups.length})
            </div>
            <div className="text-xs font-bold text-slate-900 truncate">
              {selectedGroup ? selectedGroup.name : 'Grup Seçin'}
            </div>
          </div>
          <span className="text-xs font-bold text-blue-900 bg-white px-2.5 py-1 rounded-md border border-slate-300 shrink-0">
            {showPortraitGroupDrawer ? 'Listeyi Kapat' : 'Takımlar'}
          </span>
        </button>

        <button
          type="button"
          disabled={!nextGroup}
          onClick={() => nextGroup && onSelectGroup(nextGroup.id)}
          className="min-h-[42px] px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 disabled:opacity-40 flex items-center gap-1 cursor-pointer shrink-0"
        >
          Sıradaki
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Visual Team Cards Deck (4 cols on lg) */}
        <aside
          className={`${
            showPortraitGroupDrawer ? 'block' : 'hidden'
          } lg:block lg:col-span-4 bg-white border border-slate-300 rounded-2xl p-4 space-y-4 shadow-xs lg:sticky lg:top-4`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Çalışma Takımları ({effectiveGroups.length})
                {activeClassroom ? ` · ${activeClassroom.name}` : ''}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowNewGroupForm(!showNewGroupForm)}
              className="px-3 py-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-xl flex items-center gap-1 cursor-pointer min-h-[36px]"
            >
              <Plus className="w-3.5 h-3.5" />
              Yeni Grup
            </button>
          </div>

          {showNewGroupForm && (
            <form
              onSubmit={handleCreateGroup}
              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div>
                <label
                  htmlFor="new-group-name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Grup Adı / Proje Başlığı
                </label>
                <input
                  id="new-group-name"
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Örn: Grup 4: Yenilenebilir Enerji"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Üyeleri Seçin (Başka grupta olmayanlar)
                </label>
                <div className="max-h-36 overflow-y-auto space-y-1 bg-white p-2 rounded-lg border border-slate-200">
                  {classStudents.map((stu) => {
                    const checked = newGroupMemberIds.includes(stu.id);
                    const existingGroup = assignedGroupByStudentId[stu.id];
                    return (
                      <label
                        key={stu.id}
                        className={`flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-md ${
                          existingGroup
                            ? 'opacity-50 cursor-not-allowed bg-slate-50'
                            : 'hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            disabled={Boolean(existingGroup)}
                            checked={checked}
                            onChange={() => {
                              setNewGroupMemberIds((prev) =>
                                prev.includes(stu.id)
                                  ? prev.filter((id) => id !== stu.id)
                                  : [...prev, stu.id]
                              );
                            }}
                            className="rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                          />
                          <span className="font-mono-num text-[11px] text-slate-400">
                            #{stu.studentNumber}
                          </span>
                          <span className="text-slate-800 font-medium">
                            {stu.fullName}
                          </span>
                        </span>
                        {existingGroup && (
                          <span className="text-[10px] font-semibold text-slate-500">
                            {existingGroup.groupName}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {groupFormError && (
                <div className="text-xs text-red-700 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {groupFormError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-bold text-white bg-blue-900 rounded-lg hover:bg-blue-950 cursor-pointer"
                >
                  Grubu Oluştur
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewGroupForm(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  İptal
                </button>
              </div>
            </form>
          )}

          {/* Visual Team Cards List */}
          <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-0.5">
            {effectiveGroups.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-center space-y-2">
                <p>
                  {activeClassroom?.name || 'Bu şube'} için henüz çalışma grubu
                  oluşturulmadı.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewGroupForm(true)}
                  className="px-3 py-1.5 rounded-lg bg-blue-900 text-white font-bold hover:bg-blue-950 cursor-pointer"
                >
                  + İlk Grubu Oluştur
                </button>
              </div>
            ) : null}
            {effectiveGroups.map((grp) => {
              const isSelected = selectedGroup?.id === grp.id;
              const lifecycle = getGroupLifecycleStatus(
                activeRubric,
                grp,
                activeSession.evaluations
              );
              const memberStudents = grp.studentIds
                .map((id) => studentsById[id])
                .filter(Boolean);

              return (
                <div
                  key={grp.id}
                  onClick={() => {
                    onSelectGroup(grp.id);
                    setShowPortraitGroupDrawer(false);
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${
                    isSelected
                      ? 'bg-blue-50/90 border-2 border-blue-900 shadow-xs'
                      : lifecycle.state === 'applied'
                      ? 'bg-slate-50 border-slate-300 hover:bg-slate-100'
                      : lifecycle.state === 'completed_unapplied'
                      ? 'bg-white border-blue-800 hover:bg-slate-50'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">
                        {grp.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono-num">
                        {grp.studentIds.length} üye ·{' '}
                        {lifecycle.completedCriteriaCount}/
                        {lifecycle.totalCriteriaCount} ölçüt
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Definitive Score Rule: Only show score when isComplete === true */}
                      {lifecycle.isComplete &&
                      lifecycle.finalScoreOutOf100 !== null ? (
                        <span
                          className={`font-mono-num text-xs font-bold px-2.5 py-0.5 rounded-lg border ${
                            isSelected
                              ? 'bg-blue-900 text-white border-blue-950'
                              : 'bg-slate-100 text-slate-900 border-slate-300'
                          }`}
                        >
                          {lifecycle.finalScoreOutOf100} Puan
                        </span>
                      ) : null}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteGroup(grp.id);
                        }}
                        aria-label={`${grp.name} grubunu sil`}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Member Avatar Chips */}
                  {memberStudents.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {memberStudents.map((stu) => (
                        <span
                          key={stu.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-slate-700"
                        >
                          <span className="w-4 h-4 rounded-full bg-slate-800 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                            {getInitials(stu.fullName)}
                          </span>
                          <span className="truncate max-w-[115px]">
                            {stu.fullName}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] italic text-amber-800 bg-amber-50/80 px-2 py-1 rounded-lg border border-amber-200">
                      Henüz üye atanmadı
                    </div>
                  )}

                  {/* Explicit 3-Stage Lifecycle Status Badge */}
                  <div className="pt-1 border-t border-slate-200/70 flex items-center justify-between gap-2">
                    {lifecycle.state === 'applied' ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-800 bg-slate-200/80 px-2.5 py-1 rounded-lg border border-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-700" />
                        Üyelere Uygulandı ({lifecycle.appliedMemberCount}/
                        {lifecycle.totalMemberCount})
                      </span>
                    ) : lifecycle.state === 'completed_unapplied' ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-blue-900 px-2.5 py-1 rounded-lg border border-blue-950">
                        <Send className="w-3 h-3 text-blue-200" />
                        Tamamlandı · Üyelere Uygulanmayı Bekliyor
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-300">
                        <Clock className="w-3 h-3 text-slate-500" />
                        Puanlanıyor ({lifecycle.completedCriteriaCount}/
                        {lifecycle.totalCriteriaCount} Ölçüt)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right: Active Group Rubric Deck & 3-Stage Lifecycle Controls (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Easy Return Banner after Applying & Advancing to Next Group */}
          {lastAppliedGroupBanner && (
            <div
              role="status"
              aria-live="polite"
              className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-sm border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-blue-300 shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm font-bold">
                    {lastAppliedGroupBanner.previousGroupName} puanları{' '}
                    {lastAppliedGroupBanner.memberCount} üyeye uygulandı
                    {lastAppliedGroupBanner.appliedScoreOutOf100 !== null
                      ? ` (${lastAppliedGroupBanner.appliedScoreOutOf100} / 100)`
                      : ''}
                  </div>
                  {lastAppliedGroupBanner.nextGroupName && (
                    <div className="text-[11px] text-slate-300">
                      Sıradaki gruba geçildi:{' '}
                      {lastAppliedGroupBanner.nextGroupName}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {lastAppliedGroupBanner.previousGroupId !==
                  selectedGroup?.id && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectGroup(lastAppliedGroupBanner.previousGroupId);
                      onDismissGroupBanner?.();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    {lastAppliedGroupBanner.previousGroupName} Grubuna Dön
                  </button>
                )}
                {onDismissGroupBanner && (
                  <button
                    type="button"
                    onClick={onDismissGroupBanner}
                    aria-label="Grup bildirimini kapat"
                    className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {selectedGroup && activeGroupLifecycle ? (
            <div className="bg-white border border-slate-300 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
              {/* Group Header & Shared View Mode Controls */}
              <div className="flex flex-col gap-2.5 pb-3.5 border-b border-slate-200">
                {/* Fixed Top Controls Bar: Focus Mode, View Mode, Precision & Reset */}
                <div
                  data-testid="group-evaluation-controls-toolbar"
                  className="bg-slate-50 border border-slate-200 rounded-xl p-2 sm:p-2.5 flex flex-wrap items-center justify-between gap-2"
                >
                  {/* Left: Focus Mode & View Mode Controls (Guaranteed Stable Anchor) */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <CriterionFocusToolbar
                      focusModeEnabled={focusModeEnabled}
                      onToggleFocusMode={() => {
                        const nextEnabled = !focusModeEnabled;
                        setFocusModeEnabled(nextEnabled);
                        if (nextEnabled) {
                          setFocusedCriterionIndex(
                            resolveFocusedCriterionIndex(
                              activeRubric.criteria,
                              focusedCriterionIndex,
                              selectedGroup.criterionScores,
                              selectedGroup.directCriterionScores,
                              true
                            )
                          );
                        }
                      }}
                      focusDisplayMode={focusDisplayMode}
                      onChangeFocusDisplayMode={setFocusDisplayMode}
                    />

                    {!focusModeEnabled && (
                      <RubricViewModeToggle
                        viewMode={cardViewMode}
                        onChangeViewMode={onChangeCardViewMode}
                      />
                    )}
                  </div>

                  {/* Right: Precision & Reset Controls */}
                  <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                    <button
                      type="button"
                      onClick={onTogglePrecisionScoring}
                      aria-pressed={precisionScoringMode}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer min-h-[36px] ${
                        precisionScoringMode
                          ? 'bg-blue-900 text-white border-blue-950'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      Hassas Puan
                    </button>

                    <button
                      type="button"
                      onClick={() => onResetGroupScores(selectedGroup.id)}
                      title="Grup Puanlarını Sıfırla"
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 flex items-center gap-1 cursor-pointer min-h-[36px]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Sıfırla
                    </button>
                  </div>
                </div>

                {/* Second Row: Group Identity Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-slate-800 bg-slate-100 border border-slate-300 px-2.5 py-0.5 rounded-lg shrink-0">
                      Takım Değerlendirmesi
                    </span>
                    <h2
                      className="text-lg sm:text-xl font-bold text-slate-900 truncate max-w-[240px] sm:max-w-[360px] md:max-w-[480px]"
                      title={selectedGroup.name}
                    >
                      {selectedGroup.name}
                    </h2>

                    {/* Definitive Group Score vs Draft Status */}
                    {activeGroupLifecycle.isComplete &&
                    activeGroupLifecycle.finalScoreOutOf100 !== null ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-blue-900 text-white border border-blue-950 font-mono-num shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-200" />
                        Kesin Grup Notu:{' '}
                        {activeGroupLifecycle.finalScoreOutOf100} / 100 ·{' '}
                        {activeGroupLifecycle.performanceLabel}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 font-mono-num shrink-0">
                        Puanlanıyor (
                        {activeGroupLifecycle.completedCriteriaCount}/
                        {activeGroupLifecycle.totalCriteriaCount})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Explicit 3-Stage Lifecycle Stepper & Action Bar (Puanlanıyor -> Tamamlandı -> Üyelere Uygulandı) */}
              <div
                className={`rounded-2xl border p-3.5 space-y-3 ${
                  activeGroupLifecycle.state === 'applied'
                    ? 'bg-slate-50 border-slate-300'
                    : activeGroupLifecycle.state === 'completed_unapplied'
                    ? 'bg-blue-50/70 border-2 border-blue-900 shadow-xs'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Step 1: Puanlanıyor */}
                  <div
                    className={`px-3 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                      activeGroupLifecycle.state === 'in_progress'
                        ? 'bg-blue-900 border-blue-950 text-white'
                        : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center shrink-0 ${
                        activeGroupLifecycle.state === 'in_progress'
                          ? 'bg-white text-blue-950'
                          : 'bg-slate-700 text-white'
                      }`}
                    >
                      {activeGroupLifecycle.isComplete ? (
                        <Check className="w-3 h-3 stroke-[3]" />
                      ) : (
                        '1'
                      )}
                    </span>
                    <div>
                      <div>1. Puanlanıyor</div>
                      <div className="text-[10px] font-mono-num font-normal opacity-85">
                        {activeGroupLifecycle.completedCriteriaCount}/
                        {activeGroupLifecycle.totalCriteriaCount} ölçüt
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Tamamlandı */}
                  <div
                    className={`px-3 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                      activeGroupLifecycle.state === 'completed_unapplied'
                        ? 'bg-blue-900 border-blue-950 text-white shadow-xs'
                        : activeGroupLifecycle.state === 'applied'
                        ? 'bg-white border-slate-300 text-slate-800'
                        : 'bg-white/60 border-slate-200 text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center shrink-0 ${
                        activeGroupLifecycle.state === 'completed_unapplied'
                          ? 'bg-white text-blue-950'
                          : activeGroupLifecycle.state === 'applied'
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {activeGroupLifecycle.state === 'applied' ? (
                        <Check className="w-3 h-3 stroke-[3]" />
                      ) : (
                        '2'
                      )}
                    </span>
                    <div>
                      <div>2. Tamamlandı</div>
                      <div className="text-[10px] font-mono-num font-normal opacity-90">
                        {activeGroupLifecycle.isComplete &&
                        activeGroupLifecycle.finalScoreOutOf100 !== null
                          ? `Kesin Not: ${activeGroupLifecycle.finalScoreOutOf100}/100`
                          : 'Tüm ölçütleri puanlayın'}
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Üyelere Uygulandı */}
                  <div
                    className={`px-3 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                      activeGroupLifecycle.state === 'applied'
                        ? 'bg-slate-800 border-slate-900 text-white shadow-xs'
                        : 'bg-white/60 border-slate-200 text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center shrink-0 ${
                        activeGroupLifecycle.state === 'applied'
                          ? 'bg-white text-slate-900'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {activeGroupLifecycle.state === 'applied' ? (
                        <Check className="w-3 h-3 stroke-[3]" />
                      ) : (
                        '3'
                      )}
                    </span>
                    <div>
                      <div>3. Öğrencilere Aktarıldı</div>
                      <div className="text-[10px] font-mono-num font-normal opacity-90">
                        {activeGroupLifecycle.state === 'applied'
                          ? `${activeGroupLifecycle.appliedMemberCount} öğrenciye aktarıldı`
                          : 'Gruptaki öğrencilere aktarım'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Row for Applying Scores to Group Members (Never Skipped!) */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 pt-1">
                  <div className="text-xs font-medium text-slate-700">
                    {activeGroupLifecycle.state === 'in_progress' && (
                      <span>
                        Grup değerlendirmesini gruptaki öğrencilere aktarmak
                        için kalan{' '}
                        <strong>
                          {activeGroupLifecycle.totalCriteriaCount -
                            activeGroupLifecycle.completedCriteriaCount}{' '}
                          ölçütü
                        </strong>{' '}
                        daha puanlayın.
                      </span>
                    )}
                    {activeGroupLifecycle.state === 'completed_unapplied' && (
                      <span className="text-slate-900 font-bold">
                        {activeGroupLifecycle.hasStaleMemberScores
                          ? 'Grup değerlendirmesi güncellendi. Güncel grup değerlendirmesini gruptaki öğrencilere aktarın:'
                          : 'Grup değerlendirmesi tamamlandı! Bu değerlendirmeyi gruptaki öğrencilere aktarın:'}
                      </span>
                    )}
                    {activeGroupLifecycle.state === 'applied' && (
                      <span className="text-slate-800 font-semibold">
                        Bu grubun değerlendirmesi (
                        {activeGroupLifecycle.finalScoreOutOf100}
                        /100) gruptaki tüm öğrencilere (
                        {selectedGroup.studentIds.length} öğrenci) başarıyla
                        aktarılmıştır.
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        selectedGroup.studentIds.length === 0 ||
                        !activeGroupLifecycle.isComplete
                      }
                      title={
                        !activeGroupLifecycle.isComplete
                          ? `Grup değerlendirmesini öğrencilere aktarmak için tüm ölçütleri tamamlayın (${activeGroupLifecycle.completedCriteriaCount}/${activeGroupLifecycle.totalCriteriaCount})`
                          : undefined
                      }
                      onClick={() =>
                        onApplyGroupScoresToMembers(selectedGroup, {
                          advanceToNextGroup: false,
                        })
                      }
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all min-h-[42px] disabled:opacity-40 disabled:cursor-not-allowed ${
                        activeGroupLifecycle.state === 'completed_unapplied'
                          ? 'bg-blue-900 hover:bg-blue-950 text-white shadow-sm'
                          : activeGroupLifecycle.state === 'applied'
                          ? 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-100'
                          : 'bg-slate-800 hover:bg-slate-900 text-white'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      {activeGroupLifecycle.state === 'applied'
                        ? `Değerlendirmeyi Öğrencilere Tekrar Aktar (${selectedGroup.studentIds.length} Öğrenci)`
                        : `Grup Değerlendirmesini ${selectedGroup.studentIds.length} Öğrenciye Aktar`}
                    </button>

                    {activeGroupLifecycle.isComplete &&
                      selectedGroup.studentIds.length > 0 &&
                      nextPendingGroup && (
                        <button
                          type="button"
                          onClick={() =>
                            onApplyGroupScoresToMembers(selectedGroup, {
                              advanceToNextGroup: true,
                            })
                          }
                          className="px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm min-h-[42px]"
                        >
                          <Send className="w-3.5 h-3.5 shrink-0" />
                          <span>Öğrencilere Aktar ve Sıradaki Gruba Geç</span>
                          <ChevronRight className="w-4 h-4 shrink-0" />
                        </button>
                      )}
                  </div>
                </div>
              </div>

              {groupAppliedFeedback && (
                <div
                  role="status"
                  aria-live="polite"
                  className="p-3 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 text-xs font-semibold flex items-center gap-2"
                >
                  <Check className="w-4 h-4 text-blue-900 shrink-0" />
                  {groupAppliedFeedback}
                </div>
              )}

              {/* Touch-Friendly Visual Member Strip & Collapsible Member Selector */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Takım Üyeleri ({selectedGroup.studentIds.length} Öğrenci)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMemberPicker(!showMemberPicker)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer min-h-[36px] ${
                      showMemberPicker
                        ? 'bg-blue-900 text-white border-blue-950'
                        : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {showMemberPicker
                      ? 'Üye Seçiciyi Daralt'
                      : 'Üye Ekle / Düzenle'}
                  </button>
                </div>

                {/* Current Members Touch Chips */}
                {selectedGroup.studentIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedGroup.studentIds.map((stuId) => {
                      const stu = studentsById[stuId];
                      if (!stu) return null;
                      return (
                        <button
                          key={stu.id}
                          type="button"
                          onClick={() =>
                            onToggleGroupMember(selectedGroup.id, stu.id)
                          }
                          title="Gruptan çıkarmak için dokunun"
                          className="px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 hover:bg-slate-900 cursor-pointer min-h-[38px]"
                        >
                          <span className="w-5 h-5 rounded-full bg-blue-900 text-white text-[10px] font-bold flex items-center justify-center">
                            {getInitials(stu.fullName)}
                          </span>
                          <span>
                            #{stu.studentNumber} {stu.fullName}
                          </span>
                          <X className="w-3.5 h-3.5 text-slate-300 hover:text-white" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                    Bu grupta henüz öğrenci bulunmuyor. Aşağıdan öğrenci seçerek
                    takıma ekleyin.
                  </div>
                )}

                {/* Collapsible Full Class Touch Member Selector */}
                {(showMemberPicker ||
                  selectedGroup.studentIds.length === 0) && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-600">
                        Sınıf Listesinden Üye Seçin (Başka grupta olanlar
                        kilitlidir):
                      </span>
                      <input
                        type="search"
                        placeholder="Öğrenci ara..."
                        value={memberSearchQuery}
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 w-44"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1">
                      {filteredMemberCandidates.map((stu) => {
                        const isMember = selectedGroup.studentIds.includes(
                          stu.id
                        );
                        const assignedOther =
                          assignedGroupByStudentId[stu.id] &&
                          assignedGroupByStudentId[stu.id].groupId !==
                            selectedGroup.id;

                        return (
                          <button
                            key={stu.id}
                            type="button"
                            disabled={Boolean(assignedOther)}
                            onClick={() =>
                              onToggleGroupMember(selectedGroup.id, stu.id)
                            }
                            title={
                              assignedOther
                                ? `Zaten ${assignedGroupByStudentId[stu.id].groupName} üyesi`
                                : undefined
                            }
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors min-h-[38px] flex items-center gap-1.5 ${
                              isMember
                                ? 'bg-blue-900 text-white border-blue-950 cursor-pointer'
                                : assignedOther
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-blue-900 hover:bg-slate-50 cursor-pointer'
                            }`}
                          >
                            <span>
                              {isMember ? '✓ ' : '+ '}#{stu.studentNumber}{' '}
                              {stu.fullName}
                            </span>
                            {assignedOther && (
                              <span className="text-[10px] opacity-75">
                                ({assignedGroupByStudentId[stu.id].groupName})
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Single-Criterion Focus Mode Stepper Bar */}
              {focusModeEnabled && (
                <FocusModeStepperBar
                  steps={focusStepSummary.steps}
                  activeIndex={focusStepSummary.activeIndex}
                  totalCount={focusStepSummary.totalCount}
                  completedCount={focusStepSummary.completedCount}
                  canGoPrev={focusStepSummary.canGoPrev}
                  canGoNext={focusStepSummary.canGoNext}
                  focusDisplayMode={focusDisplayMode}
                  onSelectStep={(idx) => setFocusedCriterionIndex(idx)}
                  onPrevStep={() =>
                    setFocusedCriterionIndex(
                      Math.max(0, focusStepSummary.activeIndex - 1)
                    )
                  }
                  onNextStep={() =>
                    setFocusedCriterionIndex(
                      Math.min(
                        focusStepSummary.totalCount - 1,
                        focusStepSummary.activeIndex + 1
                      )
                    )
                  }
                  onExitFocusMode={() => setFocusModeEnabled(false)}
                />
              )}

              {/* Shared Rubric Criterion Cards List / Single-Criterion Focus Stage */}
              <div
                className={
                  !focusModeEnabled && cardViewMode === 'compact'
                    ? 'space-y-2'
                    : 'space-y-3.5'
                }
              >
                {(() => {
                  const firstUnscoredCrit = activeRubric.criteria.find(
                    (crit) =>
                      !isScoreAssigned(
                        selectedGroup.directCriterionScores?.[crit.id]
                      ) &&
                      !isScoreAssigned(selectedGroup.criterionScores[crit.id])
                  );
                  return activeRubric.criteria.map((criterion, cIdx) => {
                    const isFocused = cIdx === focusStepSummary.activeIndex;

                    if (
                      focusModeEnabled &&
                      focusDisplayMode === 'hide_others' &&
                      !isFocused
                    ) {
                      return null;
                    }

                    const selectedPts =
                      selectedGroup.criterionScores[criterion.id];
                    const directPts =
                      selectedGroup.directCriterionScores?.[criterion.id];

                    return (
                      <RubricCriterionCard
                        key={criterion.id}
                        criterion={criterion}
                        criterionIndex={cIdx}
                        selectedPoints={selectedPts}
                        directPoints={directPts}
                        viewMode={cardViewMode}
                        precisionScoringMode={precisionScoringMode}
                        isNextUnscored={
                          !focusModeEnabled &&
                          firstUnscoredCrit?.id === criterion.id
                        }
                        adhdFocusMode={!focusModeEnabled}
                        isFocusedStage={focusModeEnabled && isFocused}
                        isDimmedByFocus={
                          focusModeEnabled &&
                          focusDisplayMode === 'dim_others' &&
                          !isFocused
                        }
                        onFocusSelect={() => setFocusedCriterionIndex(cIdx)}
                        focusStageNav={
                          focusModeEnabled && isFocused
                            ? {
                                currentStep: focusStepSummary.activeIndex + 1,
                                totalSteps: focusStepSummary.totalCount,
                                canGoPrev: focusStepSummary.canGoPrev,
                                canGoNext: focusStepSummary.canGoNext,
                                onPrev: () =>
                                  setFocusedCriterionIndex(
                                    Math.max(0, focusStepSummary.activeIndex - 1)
                                  ),
                                onNext: () =>
                                  setFocusedCriterionIndex(
                                    Math.min(
                                      focusStepSummary.totalCount - 1,
                                      focusStepSummary.activeIndex + 1
                                    )
                                  ),
                              }
                            : undefined
                        }
                        onSelectLevel={(critId, pts) => {
                          onSelectGroupCriterionLevel(critId, pts);
                          if (focusModeEnabled) {
                            const nextScores = {
                              ...(selectedGroup.criterionScores || {}),
                              [critId]: pts,
                            };
                            const nextDirect = {
                              ...(selectedGroup.directCriterionScores || {}),
                            };
                            delete nextDirect[critId];
                            const nextFocus =
                              getNextFocusedCriterionIndexAfterScore(
                                activeRubric.criteria,
                                cIdx,
                                nextScores,
                                nextDirect
                              );
                            if (!nextFocus.allCompleted) {
                              setFocusedCriterionIndex(nextFocus.nextIndex);
                            }
                          }
                        }}
                        onSetDirectScore={(critId, dPts) => {
                          onSetGroupDirectCriterionScore(critId, dPts);
                          if (focusModeEnabled && dPts !== null) {
                            const nextDirect = {
                              ...(selectedGroup.directCriterionScores || {}),
                              [critId]: dPts,
                            };
                            const nextFocus =
                              getNextFocusedCriterionIndexAfterScore(
                                activeRubric.criteria,
                                cIdx,
                                selectedGroup.criterionScores || {},
                                nextDirect
                              );
                            if (!nextFocus.allCompleted) {
                              setFocusedCriterionIndex(nextFocus.nextIndex);
                            }
                          }
                        }}
                        onClearScore={onClearGroupCriterionScore}
                      />
                    );
                  });
                })()}
              </div>

              {/* Group Common Observation Note */}
              <div className="pt-2 border-t border-slate-200">
                <label
                  htmlFor="group-obs-note"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Grup Gözlem Notu
                </label>
                <textarea
                  id="group-obs-note"
                  rows={2}
                  value={selectedGroup.groupNote}
                  onChange={(e) => onUpdateGroupNote(e.target.value)}
                  placeholder="Grubun işbirliği, görev paylaşımı ve ortak çıktısına dair gözlem notu..."
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              {/* Group-to-Student Evaluation Transfer Table (Gruptaki Öğrencilere Aktarılan Değerlendirme Tablosu) */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-900" />
                      Gruptaki Öğrencilere Aktarılan Değerlendirme Özeti (
                      {selectedGroup.studentIds.length} Öğrenci)
                    </h3>
                  </div>

                  {activeGroupLifecycle.isComplete &&
                    selectedGroup.studentIds.length > 0 &&
                    activeGroupLifecycle.state !== 'applied' && (
                      <button
                        type="button"
                        onClick={() =>
                          onApplyGroupScoresToMembers(selectedGroup, {
                            advanceToNextGroup: false,
                          })
                        }
                        className="px-3.5 py-2 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Şimdi Öğrencilere Aktar
                      </button>
                    )}
                </div>

                {selectedGroup.studentIds.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    Grup değerlendirmesinin aktarılabilmesi için yukarıdan gruba
                    en az bir öğrenci ekleyin.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="py-2.5 px-3">Gruptaki Öğrenci</th>
                          {activeRubric.criteria.map((c, idx) => (
                            <th
                              key={c.id}
                              className="py-2.5 px-2.5 text-center font-mono-num"
                              title={c.title}
                            >
                              Ö{idx + 1} (%{c.weight})
                            </th>
                          ))}
                          <th className="py-2.5 px-3 text-right">
                            Aktarılan Grup Notu
                          </th>
                          <th className="py-2.5 px-3">Aktarım Durumu</th>
                          {onInspectStudentInIndividualMode && (
                            <th className="py-2.5 px-3 text-right">İşlem</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {selectedGroup.studentIds.map((stuId) => {
                          const stu = studentsById[stuId];
                          if (!stu) return null;
                          const ev = activeSession.evaluations[stu.id];
                          const stuBreakdown = getStudentEvaluationBreakdown(
                            activeRubric,
                            ev
                          );
                          const grpCalc = stuBreakdown.groupCalc;
                          const isTransferred =
                            grpCalc.isComplete &&
                            grpCalc.finalScoreOutOf100 !== null &&
                            (ev?.groupId === selectedGroup.id ||
                              ev?.evaluatedViaGroup === selectedGroup.name);

                          return (
                            <tr
                              key={stu.id}
                              className={
                                isTransferred
                                  ? 'bg-slate-50/70'
                                  : 'hover:bg-slate-50'
                              }
                            >
                              <td className="py-2.5 px-3 font-semibold text-slate-900">
                                <span className="font-mono-num text-slate-400 mr-1.5">
                                  #{stu.studentNumber}
                                </span>
                                {stu.fullName}
                                {ev?.groupNote && isTransferred && (
                                  <div className="text-[11px] font-normal text-slate-500 truncate max-w-[220px]">
                                    Not: &ldquo;{ev.groupNote}&rdquo;
                                  </div>
                                )}
                              </td>

                              {activeRubric.criteria.map((c) => {
                                const directVal =
                                  ev?.groupDirectScores?.[c.id];
                                const lvlVal =
                                  ev?.groupCriterionScores?.[c.id];
                                const shownVal = isScoreAssigned(directVal)
                                  ? `${directVal}/${c.maxPoints ?? c.weight}`
                                  : isScoreAssigned(lvlVal)
                                  ? `${lvlVal}P`
                                  : '—';
                                return (
                                  <td
                                    key={c.id}
                                    className="py-2.5 px-2.5 text-center font-mono-num font-bold text-slate-800"
                                  >
                                    {isTransferred ? shownVal : '—'}
                                  </td>
                                );
                              })}

                              <td className="py-2.5 px-3 text-right font-mono-num">
                                {isTransferred &&
                                grpCalc.finalScoreOutOf100 !== null ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-900 text-white font-bold">
                                    {grpCalc.finalScoreOutOf100} / 100
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>

                              <td className="py-2.5 px-3">
                                {isTransferred ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-300">
                                    <Check className="w-3 h-3 text-blue-900 stroke-[2.5]" />
                                    Öğrenciye Aktarıldı
                                  </span>
                                ) : activeGroupLifecycle.isComplete ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                                    Aktarım Bekliyor
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-300">
                                    Grup Puanlanıyor (
                                    {
                                      activeGroupLifecycle.completedCriteriaCount
                                    }
                                    /{activeGroupLifecycle.totalCriteriaCount})
                                  </span>
                                )}
                              </td>

                              {onInspectStudentInIndividualMode && (
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onInspectStudentInIndividualMode(stu.id)
                                    }
                                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-blue-900 hover:text-blue-900 text-[11px] font-bold text-slate-700 cursor-pointer"
                                  >
                                    Öğrenci Kartı →
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-300 rounded-2xl p-6 text-center space-y-3 shadow-xs">
              <div className="text-sm font-bold text-slate-900">
                {activeClassroom?.name || 'Seçili Şube'} İçin Henüz Grup Bulunmuyor
              </div>
              <p className="text-xs text-slate-600">
                Soldaki &ldquo;Yeni Grup&rdquo; butonunu veya üstteki &ldquo;Dengeli
                Rastgele Grup Oluştur&rdquo; aracını kullanarak bu şube öğrencileri
                için grup oluşturabilirsiniz.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
