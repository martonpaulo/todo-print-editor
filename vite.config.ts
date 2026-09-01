import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/todo-print-editor/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // The printed-page geometry check needs a real browser; it runs under vitest.print.config.ts.
    exclude: [...configDefaults.exclude, 'tests/print-geometry/**'],
  },
})
