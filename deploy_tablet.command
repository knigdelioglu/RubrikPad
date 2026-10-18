#!/bin/bash
# ==============================================================================
# RubrikPad - Android 16 Tablet Wi-Fi APK Derleme & Otomatik Dağıtım Aracı
# ==============================================================================
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "=================================================="
echo "📱 RubrikPad - Android 16 Native APK Dağıtımı"
echo "=================================================="

# 1. Web üretim derlemesi ve Capacitor senkronizasyonu
echo "🔨 1/3 Web kodları derleniyor ve Android projesine aktarılıyor..."
bun run build
bunx cap sync android

# 2. Android APK derleme (minSdk: 36 - Android 16)
echo "📦 2/3 Android APK (assembleDebug) derleniyor..."
cd "$DIR/android"
./gradlew assembleDebug

APK_PATH="$DIR/android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK_PATH" ]; then
  echo "❌ Hata: APK dosyası üretilemedi: $APK_PATH"
  exit 1
fi
echo "✅ APK başarıyla üretildi: $APK_PATH"

# 3. Wi-Fi ADB cihazına yükleme ve çalıştırma
echo "🚀 3/3 Kablosuz ADB ile tablete yükleniyor..."
export ADB_MDNS_OPENSCREEN=1
export ADB_MDNS_AUTO_CONNECT=1

TABLET_DEV=$(adb devices -l | awk 'NR>1 && $2=="device" {print $1}' | head -n 1)

if [ -z "$TABLET_DEV" ]; then
  echo "🔍 Bağlı cihaz aranıyor, ADB yeniden başlatılıyor..."
  adb start-server >/dev/null 2>&1 || true
  sleep 2
  TABLET_DEV=$(adb devices -l | awk 'NR>1 && $2=="device" {print $1}' | head -n 1)
fi

if [ -n "$TABLET_DEV" ]; then
  echo "📲 Cihaza yükleniyor: $TABLET_DEV"
  adb -s "$TABLET_DEV" install -r "$APK_PATH"
  echo "▶️ RubrikPad tablete açılıyor..."
  adb -s "$TABLET_DEV" shell am start -n com.knigdelioglu.rubrikpad/.MainActivity
  echo "🎉 Başarılı! RubrikPad tabletinizde yerel uygulama (APK) olarak çalışıyor."
else
  echo "⚠️ Bağlı kablosuz ADB cihazı bulunamadı. Lütfen tabletinizin 'Kablosuz Hata Ayıklama' özelliğinin açık olduğundan emin olun."
fi
