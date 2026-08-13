import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '부산 하천 탐험대',
        short_name: '하천탐험대',
        description: '부산의 하천을 걸으며 생물을 찾고 도감을 채우는 현장학습 앱',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        background_color: '#F5F7F4',
        theme_color: '#2F6D4F',
        icons: [],
      },
      workbox: {
        // 하천변 통신 불안정 대비 — 정적 자산 선캐싱
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            // 도감 일러스트는 오래 캐싱
            urlPattern: /\/illustrations\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dex-illustrations',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
