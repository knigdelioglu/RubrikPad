package com.knigdelioglu.rubrikpad;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.WebViewListener;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class MainActivity extends BridgeActivity {
    @Override
    protected void load() {
        WebView webView = findViewById(com.getcapacitor.android.R.id.webview);
        final String refreshScript;
        try (InputStream input = getAssets().open("native-asset-refresh.js")) {
            refreshScript = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            long apkUpdateTime = getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime;
            var preferences = getPreferences(MODE_PRIVATE);
            // versionCode can stay the same during install -r development updates.
            if (preferences.getLong("webAssetsApkUpdateTime", 0) != apkUpdateTime) {
                webView.clearCache(true);
                preferences.edit().putLong("webAssetsApkUpdateTime", apkUpdateTime).apply();
            }
        } catch (IOException | android.content.pm.PackageManager.NameNotFoundException error) {
            throw new IllegalStateException("Unable to prepare installed RubrikPad assets", error);
        }

        CapConfig nativeConfig = config != null ? config : CapConfig.loadDefault(this);
        final String origin = nativeConfig.getAndroidScheme() + "://" + nativeConfig.getHostname();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, refreshScript, Collections.singleton(origin));
        }
        // Also recovers cached HTML on WebViews without document-start injection.
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                String url = view.getUrl();
                if (url != null && (url.equals(origin) || url.startsWith(origin + "/"))) {
                    view.evaluateJavascript(refreshScript, null);
                }
            }
        });
        super.load();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MlKitTextRecognitionPlugin.class);
        registerPlugin(SafBackupPlugin.class);
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.parseColor("#FFFFFF"));
        getWindow().setNavigationBarColor(Color.parseColor("#F1F5F9"));

        WindowInsetsControllerCompat insetsController =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(true);
            insetsController.setAppearanceLightNavigationBars(true);
        }

        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
                v.setPadding(insets.left, insets.top, insets.right, insets.bottom);
                return windowInsets;
            });
        }
    }
}
