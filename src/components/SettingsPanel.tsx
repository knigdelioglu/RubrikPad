import React, { useState, useEffect } from 'react';
import {
  Building2,
  UserCheck,
  Award,
  Check,
  RotateCcw,
  FileText,
} from 'lucide-react';
import type { InstitutionSettings } from '../types.ts';
import { sanitizeInstitutionSettings } from '../utils/storageLayer.ts';

interface SettingsPanelProps {
  institutionSettings: InstitutionSettings;
  onUpdateSettings: (nextSettings: InstitutionSettings) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  institutionSettings,
  onUpdateSettings,
}) => {
  const [schoolName, setSchoolName] = useState<string>(
    institutionSettings.schoolName
  );
  const [teacherName, setTeacherName] = useState<string>(
    institutionSettings.teacherName
  );
  const [principalName, setPrincipalName] = useState<string>(
    institutionSettings.principalName
  );
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    setSchoolName(institutionSettings.schoolName);
    setTeacherName(institutionSettings.teacherName);
    setPrincipalName(institutionSettings.principalName);
  }, [
    institutionSettings.schoolName,
    institutionSettings.teacherName,
    institutionSettings.principalName,
  ]);

  const handleFieldChange = (
    field: keyof InstitutionSettings,
    rawValue: string
  ) => {
    if (field === 'schoolName') setSchoolName(rawValue);
    if (field === 'teacherName') setTeacherName(rawValue);
    if (field === 'principalName') setPrincipalName(rawValue);

    const next = sanitizeInstitutionSettings({
      schoolName: field === 'schoolName' ? rawValue : schoolName,
      teacherName: field === 'teacherName' ? rawValue : teacherName,
      principalName: field === 'principalName' ? rawValue : principalName,
    });
    onUpdateSettings(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = sanitizeInstitutionSettings({
      schoolName,
      teacherName,
      principalName,
    });
    setSchoolName(cleaned.schoolName);
    setTeacherName(cleaned.teacherName);
    setPrincipalName(cleaned.principalName);
    onUpdateSettings(cleaned);
    setSaveNotice(
      'Kurum, öğretmen ve okul müdürü bilgileri kaydedildi. Tüm raporlarda ve PDF çıktılarında otomatik olarak yer alacaktır.'
    );
    setTimeout(() => {
      setSaveNotice((prev) =>
        prev ===
        'Kurum, öğretmen ve okul müdürü bilgileri kaydedildi. Tüm raporlarda ve PDF çıktılarında otomatik olarak yer alacaktır.'
          ? null
          : prev
      );
    }, 4000);
  };

  const handleReset = () => {
    setSchoolName('');
    setTeacherName('');
    setPrincipalName('');
    onUpdateSettings({
      schoolName: '',
      teacherName: '',
      principalName: '',
    });
    setSaveNotice('Kurum ve imza alanları temizlendi.');
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">
          Kurum ve Rapor İmza Ayarları
        </h1>
        <p className="text-xs text-slate-600 mt-0.5">
          Rapor başlıklarında yer alacak okul adını ve raporların altındaki imza
          alanlarında görünecek Ders Öğretmeni ile Okul Müdürü bilgilerini
          buradan tanımlayın.
        </p>
      </div>

      {saveNotice && (
        <div
          role="status"
          aria-live="polite"
          data-testid="settings-save-notice"
          className="bg-emerald-50 border border-emerald-200 text-emerald-950 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{saveNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveNotice(null)}
            className="text-emerald-900 font-bold hover:underline cursor-pointer"
          >
            Kapat
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <Building2 className="w-4 h-4 text-blue-900" />
            <h2 className="text-sm font-bold text-slate-900">
              Okul ve İmza Yetkilileri Bilgileri
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="settings-school-name"
                className="block text-xs font-bold text-slate-800 mb-1.5"
              >
                Okul Adı
              </label>
              <div className="relative">
                <input
                  id="settings-school-name"
                  data-testid="settings-school-name-input"
                  type="text"
                  maxLength={160}
                  value={schoolName}
                  onChange={(e) =>
                    handleFieldChange('schoolName', e.target.value)
                  }
                  placeholder="Örn: Atatürk Anadolu Lisesi"
                  className="w-full px-3.5 py-2.5 text-sm font-medium bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Tüm değerlendirme çizelgelerinde, bireysel gelişim raporlarında
                ve A4 PDF çıktılarında üst başlıkta yer alır.
              </p>
            </div>

            <div>
              <label
                htmlFor="settings-teacher-name"
                className="block text-xs font-bold text-slate-800 mb-1.5"
              >
                Ders Öğretmeni Adı Soyadı
              </label>
              <div className="relative flex items-center">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  id="settings-teacher-name"
                  data-testid="settings-teacher-name-input"
                  type="text"
                  maxLength={120}
                  value={teacherName}
                  onChange={(e) =>
                    handleFieldChange('teacherName', e.target.value)
                  }
                  placeholder="Örn: Ayşe Yılmaz"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm font-medium bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Raporların sol altındaki <strong>Ders Öğretmeni</strong> imza
                bloğunda otomatik olarak gösterilir.
              </p>
            </div>

            <div>
              <label
                htmlFor="settings-principal-name"
                className="block text-xs font-bold text-slate-800 mb-1.5"
              >
                Okul Müdürü Adı Soyadı
              </label>
              <div className="relative flex items-center">
                <Award className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  id="settings-principal-name"
                  data-testid="settings-principal-name-input"
                  type="text"
                  maxLength={120}
                  value={principalName}
                  onChange={(e) =>
                    handleFieldChange('principalName', e.target.value)
                  }
                  placeholder="Örn: Mehmet Demir"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm font-medium bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Raporların sağ altındaki <strong>Okul Müdürü</strong> imza
                bloğunda otomatik olarak gösterilir.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              data-testid="settings-reset-button"
              onClick={handleReset}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Alanları Temizle</span>
            </button>

            <button
              type="submit"
              data-testid="settings-save-button"
              className="px-5 py-2.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>Ayarları Kaydet</span>
            </button>
          </div>
        </form>

        {/* Live Report Header & Signature Preview Card */}
        <div
          data-testid="settings-report-preview"
          className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-900" />
              <h2 className="text-sm font-bold text-slate-900">
                Canlı Rapor Başlığı ve İmza Önizlemesi
              </h2>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              A4 Çıktı &amp; PDF Görünümü
            </span>
          </div>

          <div className="pdf-report-sheet p-5 space-y-6">
            <div className="pdf-report-banner rounded-xl p-4 space-y-1">
              {schoolName.trim() ? (
                <div
                  data-testid="settings-preview-school-name"
                  className="text-xs font-bold uppercase tracking-wider text-amber-200"
                >
                  {schoolName.trim()}
                </div>
              ) : (
                <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-200/80">
                  Okul adı girildiğinde burada görüntülenecektir
                </div>
              )}
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                Ölçüt Temelli Performans Değerlendirme Çizelgesi
              </div>
              <div className="text-base font-bold text-white">
                Örnek Sınıf — Kitap Okuma ve Sunum Değerlendirmesi
              </div>
            </div>

            <div className="py-4 px-3 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
              [ Rapor Tablosu ve Öğrenci Puan Çizelgesi Alanı ]
            </div>

            <div className="pdf-signature-grid grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-700">
              <div className="pdf-signature-box">
                <div className="font-bold text-slate-900">Ders Öğretmeni</div>
                {teacherName.trim() ? (
                  <>
                    <div
                      data-testid="settings-preview-teacher-name"
                      className="font-semibold text-slate-800 mt-0.5"
                    >
                      {teacherName.trim()}
                    </div>
                    <div className="text-slate-500 mt-0.5">İmza</div>
                  </>
                ) : (
                  <div className="text-slate-500 mt-0.5">
                    Adı Soyadı ve İmza
                  </div>
                )}
              </div>

              <div className="pdf-signature-box">
                <div className="font-bold text-slate-900">Okul Müdürü</div>
                {principalName.trim() ? (
                  <>
                    <div
                      data-testid="settings-preview-principal-name"
                      className="font-semibold text-slate-800 mt-0.5"
                    >
                      {principalName.trim()}
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      İmza ve Mühür
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500 mt-0.5">
                    Adı Soyadı, İmza ve Mühür
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
