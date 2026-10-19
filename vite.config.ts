import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'RubrikPad — Hızlı Sınıf İçi Rubrik & Performans Değerlendirme',
          short_name: 'RubrikPad',
          description: 'Öğretmenler için çevrimdışı çalışabilen hızlı sınıf içi rubrik, grup ve performans değerlendirme uygulaması.',
          theme_color: '#0F766E',
          background_color: '#FBF9F5',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          icons: [
            {
              src: 'icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: '/index.html',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
