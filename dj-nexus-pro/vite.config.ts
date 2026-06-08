// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — Vite configuration (renderer process)
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isElectron = env.VITE_TARGET === 'electron';

  return {
    // ── React plugin ──────────────────────────────────────────────────────────
    plugins: [
      react({
        // Use the new automatic JSX transform (React 18)
        jsxRuntime: 'automatic',
        // Babel plugins for dev tooling
        babel: {
          plugins: [
            // 'babel-plugin-macros',  // uncomment if you use macros
          ],
        },
      }),
    ],

    // ── Path aliases ─────────────────────────────────────────────────────────
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@store':      path.resolve(__dirname, 'src/store'),
        '@types':      path.resolve(__dirname, 'src/types'),
        '@audio':      path.resolve(__dirname, 'src/audio'),
        '@midi':       path.resolve(__dirname, 'src/midi'),
        '@plugins':    path.resolve(__dirname, 'src/plugins'),
        '@ai':         path.resolve(__dirname, 'src/ai'),
        '@utils':      path.resolve(__dirname, 'src/utils'),
      },
    },

    // ── Build output ──────────────────────────────────────────────────────────
    build: {
      outDir: 'dist/renderer',
      emptyOutDir: true,
      sourcemap: mode === 'development',
      target: isElectron ? 'chrome120' : 'es2022',
      // Increase chunk size warning limit for large Wasm / workers
      chunkSizeWarningLimit: 2_000,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
        output: {
          // Manual chunks — keep vendor code stable across deploys
          manualChunks: {
            react:   ['react', 'react-dom'],
            zustand: ['zustand', 'immer'],
          },
        },
      },
    },

    // ── Dev server ────────────────────────────────────────────────────────────
    server: {
      port: 5173,
      strictPort: true,
      // Allow Electron to connect from the custom protocol
      cors: true,
      hmr: {
        protocol: 'ws',
        host:     'localhost',
        port:     5173,
      },
    },

    // ── Preview server ────────────────────────────────────────────────────────
    preview: {
      port: 4173,
      strictPort: true,
    },

    // ── Test (Vitest) ─────────────────────────────────────────────────────────
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/tests/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['node_modules', 'dist', 'audio-engine'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/tests/**',
          'src/**/*.d.ts',
          'src/index.tsx',
        ],
        thresholds: {
          statements: 60,
          branches:   55,
          functions:  60,
          lines:      60,
        },
      },
    },

    // ── CSS ────────────────────────────────────────────────────────────────────
    css: {
      modules: {
        localsConvention: 'camelCase',
      },
    },

    // ── Optimise deps ─────────────────────────────────────────────────────────
    optimizeDeps: {
      include: ['react', 'react-dom', 'zustand', 'immer', 'uuid'],
      exclude: [
        // Native modules — Electron handles these
        'better-sqlite3',
        'onnxruntime-node',
        'electron',
      ],
    },

    // ── Worker support ────────────────────────────────────────────────────────
    worker: {
      format: 'es',
    },

    // ── Define compile-time constants ─────────────────────────────────────────
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
      __IS_ELECTRON__: JSON.stringify(isElectron),
      __DEV__:         JSON.stringify(mode === 'development'),
    },

    // ── Environment variable prefix ────────────────────────────────────────────
    envPrefix: 'VITE_',
  };
});
