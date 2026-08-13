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
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**'],
  },
})
