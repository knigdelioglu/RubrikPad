import { Capacitor, registerPlugin } from '@capacitor/core';
import type { VerifiedBackupBundle } from '../types.ts';
import {
  MAX_BACKUP_JSON_BYTES,
  computePayloadChecksum,
  createVerifiedBackupBundle,
  importLegacyBackupBundle,
  verifyAndParseBackupBundle,
  type AppDataState,
} from './storageLayer.ts';

export interface SafSaveDocumentResponse {
  saved: boolean;
  cancelled?: boolean;
  uri?: string;
  fileName?: string;
  bytesWritten?: number;
  error?: string;
}

export interface SafOpenDocumentResponse {
  opened: boolean;
  cancelled?: boolean;
  uri?: string;
  fileName?: string;
  byteLength?: number;
  content?: string;
  error?: string;
}

export interface SafBackupPluginContract {
  saveJsonDocument(options: {
    fileName: string;
    content: string;
  }): Promise<SafSaveDocumentResponse>;
  openJsonDocument(): Promise<SafOpenDocumentResponse>;
}

export const SafBackupBridge =
  registerPlugin<SafBackupPluginContract>('SafBackup');

export interface FileSystemWritableStreamLike {
  write(data: Uint8Array | string): Promise<void>;
  close(): Promise<void>;
}

export interface FileSystemFileHandleLike {
  name?: string;
  createWritable(): Promise<FileSystemWritableStreamLike>;
  getFile?(): Promise<{ size: number; text?: () => Promise<string> }>;
}

export type ShowSaveFilePickerFn = (options?: {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<FileSystemFileHandleLike>;

export interface SaveBackupFileOptions {
  now?: Date;
  suggestedFileName?: string;
  isNativeAndroid?: boolean;
  isAndroidWebView?: boolean;
  safBridge?: SafBackupPluginContract;
  showSaveFilePicker?: ShowSaveFilePickerFn | null;
  webBlobFallback?: ((fileName: string, content: string) => Promise<void> | void) | null;
}

export type SaveBackupMethod =
  | 'android-saf'
  | 'file-system-access'
  | 'web-download';

export interface SaveBackupFileResult {
  status: 'saved' | 'cancelled' | 'error';
  method: SaveBackupMethod;
  checksum: string;
  fileName: string;
  uri?: string;
  bytesWritten?: number;
  bundle?: VerifiedBackupBundle;
  message: string;
  error?: string;
}

export interface RestoreBackupResult {
  status: 'restored' | 'cancelled' | 'error';
  mode: 'verified' | 'legacy';
  state?: AppDataState;
  checksum?: string;
  fileName?: string;
  upgradedFromRpkChecksum?: boolean;
  migratedFromV2?: boolean;
  message: string;
  error?: string;
}

export function buildSuggestedBackupFileName(now: Date = new Date()): string {
  const isoDate = now.toISOString().slice(0, 10);
  return `rubrikpad_yedek_${isoDate}.json`;
}

export function detectNativeAndroidEnvironment(
  options?: Pick<SaveBackupFileOptions, 'isNativeAndroid' | 'safBridge'>
): boolean {
  if (typeof options?.isNativeAndroid === 'boolean') {
    return options.isNativeAndroid;
  }
  if (options?.safBridge) {
    return true;
  }
  try {
    return (
      typeof Capacitor !== 'undefined' &&
      typeof Capacitor.isNativePlatform === 'function' &&
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === 'android'
    );
  } catch {
    return false;
  }
}

export function detectAndroidWebViewEnvironment(
  options?: Pick<
    SaveBackupFileOptions,
    'isNativeAndroid' | 'isAndroidWebView' | 'safBridge'
  >
): boolean {
  if (typeof options?.isAndroidWebView === 'boolean') {
    return options.isAndroidWebView;
  }
  if (detectNativeAndroidEnvironment(options)) {
    return true;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua) && /;\s*wv\)|Version\/\d+\.\d+\s+Chrome\//i.test(ua)) {
      return true;
    }
  }
  return false;
}

/**
 * Serializes and pre-verifies a backup bundle before any disk/SAF write occurs.
 */
export function prepareVerifiedBackupPayload(state: AppDataState): {
  isValid: boolean;
  bundle: VerifiedBackupBundle;
  jsonContent: string;
  utf8ByteLength: number;
  error?: string;
} {
  const bundle = createVerifiedBackupBundle(state);
  const jsonContent = JSON.stringify(bundle, null, 2);
  const utf8Bytes = new TextEncoder().encode(jsonContent);

  if (utf8Bytes.byteLength === 0) {
    return {
      isValid: false,
      bundle,
      jsonContent,
      utf8ByteLength: 0,
      error: 'Oluşturulan yedek verisi boş.',
    };
  }

  if (utf8Bytes.byteLength > MAX_BACKUP_JSON_BYTES) {
    return {
      isValid: false,
      bundle,
      jsonContent,
      utf8ByteLength: utf8Bytes.byteLength,
      error: `Yedek dosyası boyutu güvenli sınırı (${Math.round(
        MAX_BACKUP_JSON_BYTES / (1024 * 1024)
      )} MB) aşıyor.`,
    };
  }

  const selfCheck = verifyAndParseBackupBundle(jsonContent);
  if (!selfCheck.isValid || !selfCheck.state) {
    return {
      isValid: false,
      bundle,
      jsonContent,
      utf8ByteLength: utf8Bytes.byteLength,
      error:
        selfCheck.error ||
        'Yedek paketi oluşturulurken bütünlük doğrulaması başarısız oldu.',
    };
  }

  return {
    isValid: true,
    bundle,
    jsonContent,
    utf8ByteLength: utf8Bytes.byteLength,
  };
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybeErr = err as { name?: string; message?: string };
  if (maybeErr.name === 'AbortError') return true;
  if (
    typeof maybeErr.message === 'string' &&
    /abort|cancel|iptal/i.test(maybeErr.message)
  ) {
    return true;
  }
  return false;
}

/**
 * Saves the verified JSON backup using:
 * 1. Android Native Storage Access Framework (`Intent.ACTION_CREATE_DOCUMENT`) via `SafBackup` Capacitor plugin.
 *    Waits for user location selection, physical stream write, descriptor sync, and byte-length verification.
 * 2. Modern Desktop File System Access API (`window.showSaveFilePicker`) when available.
 * 3. Non-Android Web fallback only on desktop/web browsers without `showSaveFilePicker` (explicitly blocked on Android WebView).
 *
 * Guarantees that `status === 'saved'` is ONLY returned after the file is actually written and verified.
 */
export async function saveVerifiedBackupFile(
  state: AppDataState,
  options: SaveBackupFileOptions = {}
): Promise<SaveBackupFileResult> {
  const fileName =
    options.suggestedFileName?.trim() ||
    buildSuggestedBackupFileName(options.now);

  const prepared = prepareVerifiedBackupPayload(state);
  if (!prepared.isValid) {
    const errMsg =
      prepared.error || 'Yedek verisi doğrulanamadığı için dosya kaydedilmedi.';
    return {
      status: 'error',
      method: detectNativeAndroidEnvironment(options)
        ? 'android-saf'
        : 'file-system-access',
      checksum: prepared.bundle.checksum,
      fileName,
      message: errMsg,
      error: errMsg,
    };
  }

  const { bundle, jsonContent, utf8ByteLength } = prepared;
  const isNativeAndroid = detectNativeAndroidEnvironment(options);
  const isAndroidWv = detectAndroidWebViewEnvironment(options);

  // 1. Android Native Storage Access Framework (ACTION_CREATE_DOCUMENT)
  if (isNativeAndroid || isAndroidWv) {
    const bridge = options.safBridge ?? SafBackupBridge;
    try {
      const response = await bridge.saveJsonDocument({
        fileName,
        content: jsonContent,
      });

      if (response?.cancelled) {
        return {
          status: 'cancelled',
          method: 'android-saf',
          checksum: bundle.checksum,
          fileName,
          message:
            'Yedek kaydetme işlemi iptal edildi — herhangi bir dosya oluşturulmadı.',
        };
      }

      const bytesWritten =
        typeof response?.bytesWritten === 'number' ? response.bytesWritten : 0;

      if (
        !response ||
        response.saved !== true ||
        bytesWritten <= 0 ||
        bytesWritten !== utf8ByteLength
      ) {
        const errDetail =
          response?.error ||
          (bytesWritten > 0 && bytesWritten !== utf8ByteLength
            ? `Yazılan dosya boyutu (${bytesWritten} bayt) beklenen yedek boyutuyla (${utf8ByteLength} bayt) eşleşmiyor.`
            : 'Dosya seçilen konuma yazılamadı veya doğrulanamadı.');
        return {
          status: 'error',
          method: 'android-saf',
          checksum: bundle.checksum,
          fileName,
          message: errDetail,
          error: errDetail,
        };
      }

      const savedFileName = response.fileName?.trim() || fileName;
      return {
        status: 'saved',
        method: 'android-saf',
        checksum: bundle.checksum,
        fileName: savedFileName,
        uri: response.uri,
        bytesWritten,
        bundle,
        message: `Doğrulanabilir yedek dosyası seçilen konuma kaydedildi: ${savedFileName} (Bütünlük kodu: ${bundle.checksum}).`,
      };
    } catch (err) {
      if (isAbortError(err)) {
        return {
          status: 'cancelled',
          method: 'android-saf',
          checksum: bundle.checksum,
          fileName,
          message:
            'Yedek kaydetme işlemi iptal edildi — herhangi bir dosya oluşturulmadı.',
        };
      }
      const errDetail =
        err instanceof Error
          ? err.message
          : 'Android dosya kaydetme penceresi (SAF) açılamadı.';
      const fullError = `Android yerel dosya kaydetme hatası: ${errDetail}`;
      return {
        status: 'error',
        method: 'android-saf',
        checksum: bundle.checksum,
        fileName,
        message: fullError,
        error: fullError,
      };
    }
  }

  // 2. Modern Desktop File System Access API (showSaveFilePicker)
  const picker: ShowSaveFilePickerFn | undefined | null =
    options.showSaveFilePicker !== undefined
      ? options.showSaveFilePicker
      : typeof window !== 'undefined' &&
          typeof (window as unknown as { showSaveFilePicker?: ShowSaveFilePickerFn })
            .showSaveFilePicker === 'function'
        ? (
            window as unknown as { showSaveFilePicker: ShowSaveFilePickerFn }
          ).showSaveFilePicker.bind(window)
        : null;

  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [
          {
            description: 'RubrikPad Doğrulanabilir JSON Yedeği',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });

      const utf8Bytes = new TextEncoder().encode(jsonContent);
      const writable = await handle.createWritable();
      await writable.write(utf8Bytes);
      await writable.close();

      if (typeof handle.getFile === 'function') {
        const savedFile = await handle.getFile();
        if (!savedFile || savedFile.size !== utf8ByteLength) {
          const sizeErr =
            'Dosya diske yazıldıktan sonra boyutu doğrulanamadı.';
          return {
            status: 'error',
            method: 'file-system-access',
            checksum: bundle.checksum,
            fileName: handle.name || fileName,
            message: sizeErr,
            error: sizeErr,
          };
        }
      }

      const savedName = handle.name?.trim() || fileName;
      return {
        status: 'saved',
        method: 'file-system-access',
        checksum: bundle.checksum,
        fileName: savedName,
        bytesWritten: utf8ByteLength,
        bundle,
        message: `Doğrulanabilir yedek dosyası seçilen konuma kaydedildi: ${savedName} (Bütünlük kodu: ${bundle.checksum}).`,
      };
    } catch (err) {
      if (isAbortError(err)) {
        return {
          status: 'cancelled',
          method: 'file-system-access',
          checksum: bundle.checksum,
          fileName,
          message:
            'Yedek kaydetme işlemi iptal edildi — herhangi bir dosya oluşturulmadı.',
        };
      }
      const errDetail =
        err instanceof Error ? err.message : 'Dosya yazma işlemi başarısız oldu.';
      return {
        status: 'error',
        method: 'file-system-access',
        checksum: bundle.checksum,
        fileName,
        message: `Yedek dosyası kaydedilemedi: ${errDetail}`,
        error: `Yedek dosyası kaydedilemedi: ${errDetail}`,
      };
    }
  }

  // 3. Non-Android Web Browser Fallback
  const fallbackWriter =
    options.webBlobFallback !== undefined
      ? options.webBlobFallback
      : typeof document !== 'undefined' && typeof URL !== 'undefined'
        ? (targetFileName: string, content: string) => {
            const blob = new Blob([content], { type: 'application/json' });
            if (blob.size !== utf8ByteLength) {
              throw new Error('Oluşturulan yedek nesnesi boyutu doğrulanamadı.');
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', targetFileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
        : null;

  if (!fallbackWriter) {
    const errMsg =
      'Bu ortamda dosya kaydetme arayüzü kullanılamıyor.';
    return {
      status: 'error',
      method: 'web-download',
      checksum: bundle.checksum,
      fileName,
      message: errMsg,
      error: errMsg,
    };
  }

  try {
    await fallbackWriter(fileName, jsonContent);
    return {
      status: 'saved',
      method: 'web-download',
      checksum: bundle.checksum,
      fileName,
      bytesWritten: utf8ByteLength,
      bundle,
      message: `Doğrulanabilir yedek dosyası kaydedildi: ${fileName} (Bütünlük kodu: ${bundle.checksum}).`,
    };
  } catch (err) {
    const errDetail =
      err instanceof Error ? err.message : 'Dosya indirme hatası.';
    return {
      status: 'error',
      method: 'web-download',
      checksum: bundle.checksum,
      fileName,
      message: `Yedek dosyası oluşturulamadı: ${errDetail}`,
      error: `Yedek dosyası oluşturulamadı: ${errDetail}`,
    };
  }
}

/**
 * Validates and parses a JSON backup string in either 'verified' (v3 SHA-256 / rpk-) or 'legacy' (v1/v2) mode,
 * preserving all classrooms, students, rubrics, and evaluation session scores.
 */
export function parseAndVerifyRestoredBackupText(
  jsonText: string,
  mode: 'verified' | 'legacy' = 'verified',
  fileName?: string
): RestoreBackupResult {
  const byteLength = new TextEncoder().encode(jsonText || '').byteLength;
  if (byteLength > MAX_BACKUP_JSON_BYTES) {
    const limitMsg = `Yedek dosyası boyutu güvenli sınırı (${Math.round(
      MAX_BACKUP_JSON_BYTES / (1024 * 1024)
    )} MB) aşıyor.`;
    return {
      status: 'error',
      mode,
      fileName,
      message: limitMsg,
      error: limitMsg,
    };
  }

  if (mode === 'legacy') {
    const imported = importLegacyBackupBundle(jsonText);
    if (!imported.isValid || !imported.state) {
      const errMsg =
        imported.error || 'Eski sürüm yedek aktarma işlemi başarısız oldu.';
      return {
        status: 'error',
        mode: 'legacy',
        fileName,
        message: errMsg,
        error: errMsg,
      };
    }

    const checksum =
      imported.newChecksum || computePayloadChecksum(imported.state);
    return {
      status: 'restored',
      mode: 'legacy',
      state: imported.state,
      checksum,
      fileName,
      migratedFromV2: true,
      message: `Eski sürüm (v1/v2) yedek dosyası v3 şemasına dönüştürülerek aktarıldı ve yeni SHA-256 imzası oluşturuldu (${checksum.slice(
        0,
        22
      )}...).`,
    };
  }

  const verified = verifyAndParseBackupBundle(jsonText);
  if (!verified.isValid || !verified.state) {
    const errMsg = verified.error || 'Yedek doğrulaması başarısız oldu.';
    return {
      status: 'error',
      mode: 'verified',
      fileName,
      message: errMsg,
      error: errMsg,
    };
  }

  const checksum = computePayloadChecksum(verified.state);
  return {
    status: 'restored',
    mode: 'verified',
    state: verified.state,
    checksum,
    fileName,
    upgradedFromRpkChecksum: Boolean(verified.upgradedFromRpkChecksum),
    message: verified.upgradedFromRpkChecksum
      ? 'Önceki v3 (rpk- imzalı) yedek dosyası doğrulandı, yeni SHA-256 imzasına yükseltildi ve geri yüklendi.'
      : 'Yedek dosyası SHA-256 bütünlük kontrolünden (Checksum) geçti ve başarıyla geri yüklendi.',
  };
}

/**
 * Opens and verifies a JSON backup file using Android's native Storage Access Framework (`Intent.ACTION_OPEN_DOCUMENT`).
 */
export async function restoreBackupViaAndroidSaf(options?: {
  mode?: 'verified' | 'legacy';
  safBridge?: SafBackupPluginContract;
}): Promise<RestoreBackupResult> {
  const mode = options?.mode ?? 'verified';
  const bridge = options?.safBridge ?? SafBackupBridge;

  try {
    const response = await bridge.openJsonDocument();
    if (response?.cancelled) {
      return {
        status: 'cancelled',
        mode,
        message: 'Yedek geri yükleme işlemi iptal edildi.',
      };
    }

    if (!response || response.opened !== true || typeof response.content !== 'string') {
      const errMsg =
        response?.error || 'Seçilen yedek dosyası okunamadı.';
      return {
        status: 'error',
        mode,
        fileName: response?.fileName,
        message: errMsg,
        error: errMsg,
      };
    }

    return parseAndVerifyRestoredBackupText(
      response.content,
      mode,
      response.fileName
    );
  } catch (err) {
    if (isAbortError(err)) {
      return {
        status: 'cancelled',
        mode,
        message: 'Yedek geri yükleme işlemi iptal edildi.',
      };
    }
    const errDetail =
      err instanceof Error
        ? err.message
        : 'Android dosya seçici (SAF) açılamadı.';
    return {
      status: 'error',
      mode,
      message: `Yedek dosyası okunurken bir hata oluştu: ${errDetail}`,
      error: errDetail,
    };
  }
}
