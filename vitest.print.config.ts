import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The printed-page geometry check drives a real browser, so it is kept out of the default `npm test`
// loop and given its own `npm run test:print` entry point. `npm run check` runs both.
export default defineConfig({
  base: '/todo-print-editor/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/print-geometry/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
})
