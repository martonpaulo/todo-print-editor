import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Build configuration for the performance harness (issue #5).
 *
 * It is deliberately separate from `vite.config.ts` so the deployed
 * application keeps exactly one route and never ships harness code. React DOM
 * resolves to its profiling build so `<Profiler>` reports commit durations in
 * an otherwise production build.
 */
export default defineConfig({
  root: fileURLToPath(new URL('./profile', import.meta.url)),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      'react-dom/client': 'react-dom/profiling',
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./.profile-dist', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
})
