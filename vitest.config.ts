import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    // Must mirror the aliases in vite.config.ts and tsconfig paths, otherwise
    // any test that touches a module importing "@contracts/*" / "@db/*" fails
    // to resolve at collect time.
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@db': path.resolve(__dirname, './db'),
      '@contracts': path.resolve(__dirname, './contracts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    // Seeds the env every module under api/ reads at import time, and points
    // integration suites at TEST_DATABASE_URL when one is configured.
    setupFiles: ['./test/setup.ts'],
    // Suites share one MySQL database and truncate between tests, so files must
    // not run concurrently against it.
    fileParallelism: false,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**'],
  },
})
