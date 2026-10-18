import React, { useState, useMemo } from 'react';
import {
  Check,
  History,
  Plus,
  Shuffle,
  Trash2,
  Users,
  AlertCircle,
} from 'lucide-react';
import type {
  EvaluationSession,
  Rubric,
  Student,
  StudentGroup,
} from '../../types.ts';
import {
  calculateWeightedScore,
  findDuplicateGroupMemberships,
  generateBalancedRandomGroups,
  getGroupProgressHistory,
  isScoreAssigned,
} from '../../utils/rubricLogic.ts';

interface GroupEvaluationViewProps {
  activeSession: EvaluationSession;
  activeRubric: Rubric;
  allSessions: EvaluationSession[];
  rubricsById: Record<string, Rubric>;
  classStudents: Student[];
  selectedGroupId: string;
  onSelectGroup: (groupId: string) => void;
  onAddGroup: (group: StudentGroup) => void;
  onReplaceAllGroups: (groups: StudentGroup[]) => void;
  onDeleteGroup: (groupId: string) => void;
  onToggleGroupMember: (groupId: string, studentId: string) => void;
  onSelectGroupCriterionLevel: (criterionId: string, points: number) => void;
  onUpdateGroupNote: (note: string) => void;
  onApplyGroupScoresToMembers: (group: StudentGroup) => void;
  groupAppliedFeedback: string | null;
}

export const GroupEvaluationView: React.FC<GroupEvaluationViewProps> = ({
  activeSession,
  activeRubric,
  allSessions,
  rubricsById,
  classStudents,
  selectedGroupId,
  onSelectGroup,
  onAddGroup,
  onReplaceAllGroups,
  onDeleteGroup,
  onToggleGroupMember,
  onSelectGroupCriterionLevel,
  onUpdateGroupNote,
  onApplyGroupScoresToMembers,
  groupAppliedFeedback,
}) => {
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [groupFormError, setGroupFormError] = useState<string | null>(null);

  // Balanced Random Group Generator state (P1 #5)
  const [showRandomModal, setShowRandomModal] = useState(false);
  const [randomTargetSize, setRandomTargetSize] = useState(3);

  // Longitudinal Group History toggle (P1 #6)
  const [showGroupHistory, setShowGroupHistory] = useState(false);

  const selectedGroup = useMemo(
    () =>
      activeSession.groups.find((g) => g.id === selectedGroupId) ||
      activeSession.groups[0],
    [activeSession.groups, selectedGroupId]
  );

  const groupHistory = useMemo(
    () =>
      getGroupProgressHistory(allSessions, rubricsById, activeSession.classId),
    [allSessions, rubricsById, activeSession.classId]
  );

  // Map studentId -> groupName for membership conflict prevention (P1 #5)
  const assignedGroupByStudentId = useMemo(() => {
    const map: Record<string, { groupId: string; groupName: string }> = {};
    for (const g of activeSession.groups) {
      for (const sid of g.studentIds) {
        map[sid] = { groupId: g.id, groupName: g.name };
      }
    }
    return map;
  }, [activeSession.groups]);

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    setGroupFormError(null);
    if (!newGroupName.trim()) {
      setGroupFormError('Lütfen grup adını girin.');
      return;
    }

    const conflicts = findDuplicateGroupMemberships(
      activeSession.groups,
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
    const generated = generateBalancedRandomGroups(classStudents, {
      targetGroupSize: randomTargetSize,
    });
    if (generated.length > 0) {
      onReplaceAllGroups(generated);
      onSelectGroup(generated[0].id);
      setShowRandomModal(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Group Action Bar: Balanced Random Groups & Group Session History */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-700" />
            Grup Değerlendirmesi ve Takım Yönetimi
          </h2>
          <p className="text-xs text-slate-600">
            Grup puanları öğrencilerin bireysel puanlarını ezmez; ayrı grup
            sonucu olarak kaydedilir ve raporlanır.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRandomModal(!showRandomModal)}
            className="px-3 py-1.5 text-xs font-bold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5" />
            Dengeli Rastgele Grup Oluştur
          </button>

          <button
            type="button"
            onClick={() => setShowGroupHistory(!showGroupHistory)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center gap-1.5 cursor-pointer ${
              showGroupHistory
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Grup Dönemsel Geçmişi ({groupHistory.length})
          </button>
        </div>
      </div>

      {/* Balanced Random Group Modal/Drawer (P1 #5) */}
      {showRandomModal && (
        <div className="bg-teal-50/80 border border-teal-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-bold text-teal-950">
              Dengeli Rastgele Grup Oluşturucu ({classStudents.length} Aktif
              Öğrenci)
            </div>
            <p className="text-xs text-teal-900">
              Sınıftaki tüm öğrencileri mükerrer üyelik olmadan eşit büyüklükte
              rastgele çalışma gruplarına dağıtır.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label
              htmlFor="rand-group-size"
              className="text-xs font-bold text-teal-950"
            >
              Grup Başına Öğrenci:
            </label>
            <select
              id="rand-group-size"
              value={randomTargetSize}
              onChange={(e) => setRandomTargetSize(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs font-bold bg-white border border-teal-300 rounded-lg"
            >
              <option value={2}>2 Kişilik Eşli Gruplar</option>
              <option value={3}>3 Kişilik Takımlar</option>
              <option value={4}>4 Kişilik Takımlar</option>
              <option value={5}>5 Kişilik Takımlar</option>
            </select>
            <button
              type="button"
              onClick={handleGenerateBalancedRandom}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
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
      )}

      {/* Longitudinal Group Evaluation History (P1 #6) */}
      {showGroupHistory && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-sm font-bold text-slate-900">
              Grupların Dönemsel Değerlendirme Geçmişi
            </h3>
            <span className="text-xs text-slate-500">
              Tüm oturumlardaki grup performans kayıtları
            </span>
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
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1 text-xs"
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
                    <span className="font-mono-num font-bold text-teal-800">
                      {item.isComplete && item.scoreOutOf100 !== null
                        ? `${item.scoreOutOf100} / 100`
                        : `Taslak (${item.provisionalScoreOutOf100}P)`}
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Groups List & Membership Editor (4 cols) */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Çalışma Grupları ({activeSession.groups.length})
              </h3>
              <p className="text-xs text-slate-500">
                Her öğrenci aynı anda tek bir grupta yer alabilir
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewGroupForm(!showNewGroupForm)}
              className="px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Yeni Grup
            </button>
          </div>

          {showNewGroupForm && (
            <form
              onSubmit={handleCreateGroup}
              className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3"
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
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Üyeleri Seçin (Başka grupta olmayanlar)
                </label>
                <div className="max-h-36 overflow-y-auto space-y-1 bg-white p-2 rounded border border-slate-200">
                  {classStudents.map((stu) => {
                    const checked = newGroupMemberIds.includes(stu.id);
                    const existingGroup = assignedGroupByStudentId[stu.id];
                    return (
                      <label
                        key={stu.id}
                        className={`flex items-center justify-between gap-2 text-xs py-1 px-1.5 rounded ${
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
                            className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
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
                  className="flex-1 py-1.5 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 cursor-pointer"
                >
                  Grubu Oluştur
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewGroupForm(false)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                >
                  İptal
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {activeSession.groups.map((grp) => {
              const isSelected = selectedGroup?.id === grp.id;
              const grpScore = calculateWeightedScore(
                activeRubric,
                grp.criterionScores,
                grp.directCriterionScores
              );

              return (
                <div
                  key={grp.id}
                  onClick={() => onSelectGroup(grp.id)}
                  className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-teal-50/90 border-teal-700'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {grp.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {grp.studentIds.length} üye ·{' '}
                        {grpScore.completedCriteriaCount}/
                        {grpScore.totalCriteriaCount} ölçüt
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {grpScore.isComplete &&
                      grpScore.finalScoreOutOf100 !== null ? (
                        <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                          {grpScore.finalScoreOutOf100} Puan
                        </span>
                      ) : grpScore.completedCriteriaCount > 0 ? (
                        <span className="font-mono-num text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                          Taslak ({grpScore.completedCriteriaCount}/
                          {grpScore.totalCriteriaCount})
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteGroup(grp.id);
                        }}
                        aria-label={`${grp.name} grubunu sil`}
                        className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right: Active Group Rubric Evaluation & Separate Propagation (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {selectedGroup ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
                    Grup Performans Değerlendirmesi
                  </span>
                  <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                    {selectedGroup.name}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => onApplyGroupScoresToMembers(selectedGroup)}
                  className="px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  Grup Puanını {selectedGroup.studentIds.length} Üyeye Ayrı
                  Yansıt (Bireysel Puanları Koru)
                </button>
              </div>

              {groupAppliedFeedback && (
                <div
                  role="status"
                  aria-live="polite"
                  className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2"
                >
                  <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                  {groupAppliedFeedback}
                </div>
              )}

              {/* Group Members Pill Selector with Duplicate Protection */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-semibold text-slate-700">
                  Grup Üyeleri (Eklemek veya çıkarmak için tıklayın; başka grupta
                  olanlar kilitlidir):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {classStudents.map((stu) => {
                    const isMember = selectedGroup.studentIds.includes(stu.id);
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
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                          isMember
                            ? 'bg-slate-900 text-white border-slate-900 cursor-pointer'
                            : assignedOther
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 cursor-pointer'
                        }`}
                      >
                        #{stu.studentNumber} {stu.fullName}
                        {assignedOther
                          ? ` (${assignedGroupByStudentId[stu.id].groupName})`
                          : ''}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Group Rubric Criteria */}
              <div className="space-y-2">
                {activeRubric.criteria.map((criterion, cIdx) => {
                  const selectedPts =
                    selectedGroup.criterionScores[criterion.id];
                  const critMaxPts = criterion.maxPoints ?? criterion.weight;
                  return (
                    <div
                      key={criterion.id}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 sm:w-5/12">
                        <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                          0{cIdx + 1}
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {criterion.title}
                        </span>
                        <span className="font-mono-num text-xs font-bold text-teal-800">
                          ({critMaxPts}P)
                        </span>
                      </div>
                      <div
                        className="grid gap-1.5 sm:w-7/12"
                        style={{
                          gridTemplateColumns: `repeat(${criterion.levels.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {criterion.levels.map((lvl) => {
                          const active = selectedPts === lvl.points;
                          return (
                            <button
                              key={lvl.level}
                              type="button"
                              onClick={() =>
                                onSelectGroupCriterionLevel(
                                  criterion.id,
                                  lvl.points
                                )
                              }
                              className={`py-2 px-2 rounded-lg border text-center transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                active
                                  ? lvl.points === 0
                                    ? 'bg-rose-700 text-white border-rose-800 font-bold'
                                    : 'bg-teal-700 text-white border-teal-800 font-bold'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <span className="font-mono-num text-xs font-bold">
                                {lvl.points}P
                              </span>
                              <span className="text-[11px] font-medium truncate hidden xl:inline">
                                {lvl.label.replace(/\s*\(0\)/, '')}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Group Note */}
              <div>
                <label
                  htmlFor="group-obs-note"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Grup Ortak Gözlem Notu (Öğrencilerin bireysel notlarını
                  silmeden grup notu alanına kaydedilir)
                </label>
                <textarea
                  id="group-obs-note"
                  rows={2}
                  value={selectedGroup.groupNote}
                  onChange={(e) => onUpdateGroupNote(e.target.value)}
                  placeholder="Grubun işbirliği, görev paylaşımı ve ortak çıktısına dair gözlem notu..."
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
