import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@db': path.resolve(__dirname, './db'),
      '@contracts': path.resolve(__dirname, './contracts'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist/public',
    // S-16. The manifest is what `scripts/check-bundle-size.mjs` reads to work
    // out which chunks are actually on the critical path, rather than guessing
    // from file names.
    manifest: true,
    rollupOptions: {
      output: {
        // React and the router are on every route and change rarely, so they
        // get their own chunk: a release that touches only app code leaves it
        // cached. The rest is split by route via React.lazy in App.tsx.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
        },
      },
    },
  },
})
