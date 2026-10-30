import React, { useState, useEffect } from 'react';
import {
  Building2,
  UserCheck,
  Award,
  Check,
  RotateCcw,
  Moon,
  Sun,
  Monitor,
} from 'lucide-react';
import type { InstitutionSettings, ThemeMode } from '../types.ts';
import {
  sanitizeInstitutionSettings,
  loadThemeMode,
  saveThemeMode,
  getSystemPrefersDark,
  resolveEffectiveTheme,
} from '../utils/storageLayer.ts';

interface SettingsPanelProps {
  institutionSettings: InstitutionSettings;
  onUpdateSettings: (nextSettings: InstitutionSettings) => void;
  themeMode?: ThemeMode;
  onUpdateThemeMode?: (nextMode: ThemeMode) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  institutionSettings,
  onUpdateSettings,
  themeMode: controlledThemeMode,
  onUpdateThemeMode,
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
  const [localThemeMode, setLocalThemeMode] = useState<ThemeMode>(() =>
    loadThemeMode()
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    getSystemPrefersDark()
  );
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const activeThemeMode: ThemeMode = controlledThemeMode ?? localThemeMode;
  const effectiveTheme = resolveEffectiveTheme(
    activeThemeMode,
    systemPrefersDark
  );
  const isDarkMode = effectiveTheme === 'dark';
  const isSystemMode = activeThemeMode === 'system';

  useEffect(() => {
    setSchoolName(institutionSettings.schoolName);
    setTeacherName(institutionSettings.teacherName);
    setPrincipalName(institutionSettings.principalName);
  }, [
    institutionSettings.schoolName,
    institutionSettings.teacherName,
    institutionSettings.principalName,
  ]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    setSystemPrefersDark(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange);
      return () => mediaQuery.removeEventListener('change', handleMediaChange);
    }
    return undefined;
  }, []);

  const handleSetThemeMode = (nextMode: ThemeMode) => {
    const saved = saveThemeMode(nextMode);
    setLocalThemeMode(saved);
    if (typeof document !== 'undefined') {
      const nextEffective = resolveEffectiveTheme(saved, systemPrefersDark);
      document.documentElement.classList.toggle(
        'dark',
        nextEffective === 'dark'
      );
      document.documentElement.dataset.theme = nextEffective;
      document.documentElement.dataset.themeMode = saved;
    }
    if (onUpdateThemeMode) {
      onUpdateThemeMode(saved);
    }
  };

  const handleToggleDarkMode = () => {
    handleSetThemeMode(isDarkMode ? 'light' : 'dark');
  };

  const handleToggleSystemMode = () => {
    if (isSystemMode) {
      handleSetThemeMode(isDarkMode ? 'dark' : 'light');
    } else {
      handleSetThemeMode('system');
    }
  };

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
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">
          Görünüm, Kurum ve Rapor İmza Ayarları
        </h1>
        <p className="text-xs text-slate-600 mt-0.5">
          Uygulama görünüm temasını (Gece Modu / Cihaz Ayarı) ve raporların
          başlık ile imza alanlarında yer alacak kurum bilgilerini buradan
          yönetin.
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

      {/* Görünüm ve Gece Modu Ayarları Kartı */}
      <section
        aria-label="Görünüm ve Gece Modu Ayarları"
        data-testid="settings-theme-card"
        className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            {isSystemMode ? (
              <Monitor className="w-4 h-4 text-blue-700" />
            ) : isDarkMode ? (
              <Moon className="w-4 h-4 text-blue-400" />
            ) : (
              <Sun className="w-4 h-4 text-amber-600" />
            )}
            <h2 className="text-sm font-bold text-slate-900">
              Görünüm ve Gece Modu
            </h2>
          </div>

          <span
            data-testid="settings-active-theme-badge"
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-300"
          >
            {isSystemMode
              ? `Aktif: Cihaz Ayarı (${isDarkMode ? 'Gece Modu' : 'Açık Mod'})`
              : isDarkMode
              ? 'Aktif: Gece Modu'
              : 'Aktif: Açık Mod'}
          </span>
        </div>

        <div className="divide-y divide-slate-200">
          {/* Gece Modu Anahtarı */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-900">
                Gece Modu (Koyu Tema)
              </div>
              <p className="text-[11px] text-slate-600">
                Düşük ışıklı ortamlarda göz yorgunluğunu azaltmak için yüksek
                kontrastlı koyu çalışma yüzeyini etkinleştirin. A4 PDF ve yazıcı
                çıktıları her zaman standart beyaz belge düzeninde oluşturulur.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isDarkMode}
              aria-label="Gece Modu"
              data-testid="settings-dark-mode-toggle"
              onClick={handleToggleDarkMode}
              className={`relative inline-flex h-8 w-15 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                isDarkMode
                  ? 'bg-blue-600 border-blue-400'
                  : 'bg-slate-200 border-slate-300'
              }`}
            >
              <span
                className={`theme-switch-thumb inline-flex h-6 w-6 transform items-center justify-center rounded-full bg-white text-slate-900 shadow-xs transition-transform ${
                  isDarkMode ? 'translate-x-7.5' : 'translate-x-1'
                }`}
              >
                {isDarkMode ? (
                  <Moon className="w-3.5 h-3.5 text-blue-700" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-600" />
                )}
              </span>
            </button>
          </div>

          {/* Cihaz Ayarı Anahtarı */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-slate-600" />
                <span>Cihaz Ayarı (Otomatik)</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Etkinleştirildiğinde uygulama görünümü tabletinizin veya
                bilgisayarınızın sistem gece/gündüz ayarını otomatik olarak
                takip eder.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isSystemMode}
              aria-label="Cihaz Ayarı"
              data-testid="settings-system-theme-toggle"
              onClick={handleToggleSystemMode}
              className={`relative inline-flex h-8 w-15 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                isSystemMode
                  ? 'bg-blue-600 border-blue-400'
                  : 'bg-slate-200 border-slate-300'
              }`}
            >
              <span
                className={`theme-switch-thumb inline-flex h-6 w-6 transform items-center justify-center rounded-full bg-white text-slate-900 shadow-xs transition-transform ${
                  isSystemMode ? 'translate-x-7.5' : 'translate-x-1'
                }`}
              >
                <Monitor
                  className={`w-3.5 h-3.5 ${
                    isSystemMode ? 'text-blue-700' : 'text-slate-600'
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Okul ve İmza Yetkilileri Bilgileri Formu */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
    </div>
  );
};

