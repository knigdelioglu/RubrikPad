import {createRoot} from 'react-dom/client';
import {Capacitor} from '@capacitor/core';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __rubrikpadNativeAssetsReady?: Promise<boolean>;
  }
}

async function startApp() {
  if (Capacitor.isNativePlatform()) {
    // Android injects this from the APK, even when an old worker serves the HTML.
    if ((await window.__rubrikpadNativeAssetsReady) === false) return;
  } else {
    registerSW({immediate: true});
  }

  createRoot(document.getElementById('root')!).render(<App />);
}

void startApp();
