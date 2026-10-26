package com.knigdelioglu.rubrikpad;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Native Android Storage Access Framework (SAF) plugin for RubrikPad JSON backups.
 * Uses Intent.ACTION_CREATE_DOCUMENT so the user selects the target folder & filename,
 * writes UTF-8 bytes with descriptor sync, and verifies the written content via read-back
 * before resolving success to the WebView.
 */
@CapacitorPlugin(name = "SafBackup")
public class SafBackupPlugin extends Plugin {

    private static final int MAX_BACKUP_BYTES = 15 * 1024 * 1024; // 15 MB upper bound

    @PluginMethod
    public void saveJsonDocument(PluginCall call) {
        String content = call.getString("content");
        String suggestedFileName = call.getString("fileName", "rubrikpad_yedek.json");

        if (content == null || content.trim().isEmpty()) {
            JSObject res = new JSObject();
            res.put("saved", false);
            res.put("cancelled", false);
            res.put("error", "Yedek içeriği boş olduğu için dosya oluşturulamadı.");
            call.resolve(res);
            return;
        }

        byte[] utf8Bytes = content.getBytes(StandardCharsets.UTF_8);
        if (utf8Bytes.length > MAX_BACKUP_BYTES) {
            JSObject res = new JSObject();
            res.put("saved", false);
            res.put("cancelled", false);
            res.put("error", "Yedek dosyası boyutu güvenli sınırı (15 MB) aşıyor.");
            call.resolve(res);
            return;
        }

        String safeFileName = sanitizeFileName(suggestedFileName);

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, safeFileName);

        startActivityForResult(call, intent, "handleSaveDocumentResult");
    }

    @ActivityCallback
    private void handleSaveDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        try {
            if (result == null || result.getResultCode() == Activity.RESULT_CANCELED) {
                JSObject res = new JSObject();
                res.put("saved", false);
                res.put("cancelled", true);
                res.put("error", "Yedek kaydetme işlemi kullanıcı tarafından iptal edildi.");
                call.resolve(res);
                return;
            }

            Intent data = result.getData();
            Uri uri = (data != null) ? data.getData() : null;
            if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
                JSObject res = new JSObject();
                res.put("saved", false);
                res.put("cancelled", false);
                res.put("error", "Hedef dosya konumu seçilemedi.");
                call.resolve(res);
                return;
            }

            String content = call.getString("content");
            String fallbackName = sanitizeFileName(call.getString("fileName", "rubrikpad_yedek.json"));
            if (content == null || content.trim().isEmpty()) {
                JSObject res = new JSObject();
                res.put("saved", false);
                res.put("cancelled", false);
                res.put("error", "Yedek verisi bulunamadı.");
                call.resolve(res);
                return;
            }

            byte[] expectedBytes = content.getBytes(StandardCharsets.UTF_8);
            ContentResolver resolver = getContext().getContentResolver();

            try {
                writeBytesToUriWithSync(resolver, uri, expectedBytes);
                int verifiedBytes = verifyWrittenBytesAtUri(resolver, uri, expectedBytes.length);
                String displayName = resolveDisplayName(resolver, uri, fallbackName);

                JSObject res = new JSObject();
                res.put("saved", true);
                res.put("cancelled", false);
                res.put("uri", uri.toString());
                res.put("fileName", displayName);
                res.put("bytesWritten", verifiedBytes);
                call.resolve(res);
            } catch (Exception writeEx) {
                try {
                    DocumentsContract.deleteDocument(resolver, uri);
                } catch (Exception ignored) {
                    // Best-effort cleanup of incomplete document
                }
                JSObject res = new JSObject();
                res.put("saved", false);
                res.put("cancelled", false);
                res.put("error", "Dosya seçilen konuma yazılamadı: " + writeEx.getMessage());
                call.resolve(res);
            }
        } finally {
            if (bridge != null) {
                bridge.releaseCall(call);
            }
        }
    }

    @PluginMethod
    public void openJsonDocument(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(
            Intent.EXTRA_MIME_TYPES,
            new String[] {
                "application/json",
                "text/json",
                "text/plain",
                "application/octet-stream"
            }
        );

        startActivityForResult(call, intent, "handleOpenDocumentResult");
    }

    @ActivityCallback
    private void handleOpenDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        try {
            if (result == null || result.getResultCode() == Activity.RESULT_CANCELED) {
                JSObject res = new JSObject();
                res.put("opened", false);
                res.put("cancelled", true);
                res.put("error", "Dosya seçimi iptal edildi.");
                call.resolve(res);
                return;
            }

            Intent data = result.getData();
            Uri uri = (data != null) ? data.getData() : null;
            if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
                JSObject res = new JSObject();
                res.put("opened", false);
                res.put("cancelled", false);
                res.put("error", "Yedek dosyası seçilemedi.");
                call.resolve(res);
                return;
            }

            ContentResolver resolver = getContext().getContentResolver();
            String displayName = resolveDisplayName(resolver, uri, "rubrikpad_yedek.json");

            try (InputStream is = resolver.openInputStream(uri)) {
                if (is == null) {
                    throw new IOException("Dosya okuma akışı açılamadı.");
                }
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[16384];
                int totalRead = 0;
                int nRead;
                while ((nRead = is.read(chunk, 0, chunk.length)) != -1) {
                    totalRead += nRead;
                    if (totalRead > MAX_BACKUP_BYTES) {
                        throw new IOException("Yedek dosyası boyutu güvenli sınırı (15 MB) aşıyor.");
                    }
                    buffer.write(chunk, 0, nRead);
                }

                byte[] rawBytes = buffer.toByteArray();
                String content = new String(rawBytes, StandardCharsets.UTF_8);

                JSObject res = new JSObject();
                res.put("opened", true);
                res.put("cancelled", false);
                res.put("uri", uri.toString());
                res.put("fileName", displayName);
                res.put("byteLength", rawBytes.length);
                res.put("content", content);
                call.resolve(res);
            } catch (Exception readEx) {
                JSObject res = new JSObject();
                res.put("opened", false);
                res.put("cancelled", false);
                res.put("error", "Yedek dosyası okunamadı: " + readEx.getMessage());
                call.resolve(res);
            }
        } finally {
            if (bridge != null) {
                bridge.releaseCall(call);
            }
        }
    }

    private void writeBytesToUriWithSync(ContentResolver resolver, Uri uri, byte[] bytes) throws IOException {
        ParcelFileDescriptor pfd = null;
        try {
            try {
                pfd = resolver.openFileDescriptor(uri, "wt");
            } catch (Exception modeEx) {
                pfd = resolver.openFileDescriptor(uri, "w");
            }

            if (pfd != null) {
                FileDescriptor fd = pfd.getFileDescriptor();
                try (FileOutputStream fos = new FileOutputStream(fd)) {
                    fos.write(bytes);
                    fos.flush();
                    try {
                        fd.sync();
                    } catch (Exception ignored) {
                        // Virtual cloud document providers may not support raw fsync
                    }
                }
                return;
            }
        } finally {
            if (pfd != null) {
                try {
                    pfd.close();
                } catch (IOException ignored) {
                }
            }
        }

        try (OutputStream os = resolver.openOutputStream(uri, "wt")) {
            if (os == null) {
                throw new IOException("Dosya yazma akışı (OutputStream) açılamadı.");
            }
            os.write(bytes);
            os.flush();
        }
    }

    private int verifyWrittenBytesAtUri(ContentResolver resolver, Uri uri, int expectedLength) throws IOException {
        try (InputStream is = resolver.openInputStream(uri)) {
            if (is == null) {
                throw new IOException("Yazılan dosya doğrulama için tekrar açılamadı.");
            }
            byte[] buffer = new byte[16384];
            int totalRead = 0;
            int nRead;
            while ((nRead = is.read(buffer)) != -1) {
                totalRead += nRead;
            }
            if (totalRead <= 0 || totalRead != expectedLength) {
                throw new IOException(
                    "Yazılan dosya boyutu doğrulanamadı (beklenen: " + expectedLength + " bayt, okunan: " + totalRead + " bayt)."
                );
            }
            return totalRead;
        }
    }

    private String resolveDisplayName(ContentResolver resolver, Uri uri, String fallbackName) {
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = cursor.getString(idx);
                    if (name != null && !name.trim().isEmpty()) {
                        return name.trim();
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return fallbackName;
    }

    private String sanitizeFileName(String rawName) {
        String trimmed = (rawName == null) ? "" : rawName.trim();
        if (trimmed.isEmpty()) {
            trimmed = "rubrikpad_yedek.json";
        }
        trimmed = trimmed.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (!trimmed.toLowerCase().endsWith(".json")) {
            trimmed = trimmed + ".json";
        }
        return trimmed;
    }
}
