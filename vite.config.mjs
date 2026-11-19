import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import i18nextLoader from 'vite-plugin-i18next-loader'

export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  resolve: {
    alias: {
      'electron-log/renderer': resolve('src/renderer/src/platform/noopElectronLog.js'),
      '@renderer': resolve('src/renderer/src'),
      '@': resolve('src/renderer/src'),
    },
  },
  plugins: [
    react({
      babel: { plugins: [['babel-plugin-react-compiler', { target: '19' }]] },
    }),
    tailwindcss(),
    i18nextLoader({
      paths: ['./src/renderer/src/locales'],
      namespaceResolution: 'basename',
    }),
  ],
  build: { outDir: resolve('dist'), emptyOutDir: true },
})
