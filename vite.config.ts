import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * H-6. Vite reads NODE_ENV out of `.env`, and `.env.example` ships
 * `NODE_ENV=development` — so the documented setup (`cp .env.example .env`)
 * followed by `npm run build` produced a **development** React bundle: 840 KB
 * instead of 597 KB, with dev warnings shipped to every visitor.
 *
 * A build is a production build. Forced here rather than in the npm script so
 * it holds however the build is invoked, and on Windows too, where an inline
 * `NODE_ENV=` prefix does not work.
 */
if (process.env.NODE_ENV !== 'production' && process.argv.includes('build')) {
  process.env.NODE_ENV = 'production'
}

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
