import path from 'path'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Frontend Vitest setup.
//
// Two pools:
//  - `unit`: the existing source/unit tests under src. They import
//    `node:fs`, `?raw` sources and vi.stubGlobal-stubbed documents, so they
//    cannot run in a real browser — they keep the default forks pool.
//  - `browser`: mounted behavioral tests (`*.behavior.test.tsx`) executed in
//    a real headless Chromium via vitest-browser-react, with the production
//    Tailwind v4 pipeline so Radix dialogs render with real styles.
//
// Production build is untouched: `vite build` reads vite.config.ts, not this
// file. Run with `npm test` (vitest run --browser.headless still works; the
// flag is a no-op because the browser project enables browser mode itself).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['**/*.behavior.test.{ts,tsx}', '**/node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.behavior.test.{ts,tsx}'],
          browser: {
            enabled: true,
            provider: playwright({
              launchOptions: {
                // This sandbox ships a Chromium build under a revision
                // directory that does not match the installed Playwright's
                // expected one, so point at the headless shell explicitly.
                // Override with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH where
                // the layout differs.
                executablePath:
                  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
                  '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell',
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
