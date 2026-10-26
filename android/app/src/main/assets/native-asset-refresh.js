// Injected from the installed APK before any cached application code.
(() => {
  if (window.__rubrikpadNativeAssetsReady) return;

  const wasControlled = Boolean(navigator.serviceWorker?.controller);
  // Prevent an obsolete bundle from mounting or registering its worker again.
  if (wasControlled) window.stop();

  window.__rubrikpadNativeAssetsReady = (async () => {
    if (navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('workbox-precache-'))
          .map((name) => caches.delete(name))
      );
    }

    if (wasControlled) {
      // Unregistering releases the old controller on the next navigation.
      window.location.reload();
      return false;
    }
    return true;
  })().catch((error) => {
    console.error('RubrikPad native asset refresh failed', error);
    if (!wasControlled) return true;

    // Keep obsolete code stopped and offer a retry without changing stored data.
    document.open();
    document.write('<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RubrikPad</title><body><h1>Güncelleme tamamlanamadı</h1><p>Kayıtlı verileriniz korundu. Uygulamayı yüklemeyi yeniden deneyin.</p><button onclick="location.reload()">Yeniden Dene</button></body></html>');
    document.close();
    return false;
  });
})();
