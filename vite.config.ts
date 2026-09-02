import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/todo-print-editor/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Vitest's 5 s default is below what the @testing-library/react cases in src/App.test.tsx need:
    // they render the whole application, and on a machine running other work in parallel a single
    // one exceeds 5 s while that file finishes in under 14 s when it runs alone. 30 s absorbs that
    // contention and still fails a genuinely hung test long before a CI job limit; hookTimeout gets
    // the same value because setup runs under the same contention.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The printed-page geometry check needs a real browser; it runs under vitest.print.config.ts.
    exclude: [...configDefaults.exclude, 'tests/print-geometry/**'],
  },
})
