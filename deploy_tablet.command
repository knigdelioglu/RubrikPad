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

# mDNS servislerinden otomatik bağlanmayı dene
adb start-server >/dev/null 2>&1 || true
for ip_port in $(adb mdns services 2>/dev/null | grep -E "(_adb-tls-connect|_adb)\._tcp" | awk '{print $NF}'); do
  adb connect "$ip_port" >/dev/null 2>&1 || true
done

# Öncelikle Galaxy Tab / tablet cihazını hedefle (TV/STB gibi diğer cihazları hariç tut)
TABLET_DEV=$(adb devices -l | grep "model:SM_" | awk '{print $1}' | head -n 1)

if [ -z "$TABLET_DEV" ]; then
  TABLET_DEV=$(adb devices -l | grep "device " | grep -v -E "Google_TV|STB" | awk '{print $1}' | head -n 1)
fi

if [ -z "$TABLET_DEV" ]; then
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
