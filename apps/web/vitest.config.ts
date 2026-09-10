import { defineConfig } from 'vitest/config';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [
    // Components are plain CSS, so the style pass is skipped: under Vitest it tries to spin
    // up a partial Vite environment and throws. Only the TypeScript pass is needed.
    svelte({
      // configFile: false so svelte.config.js's own vitePreprocess() (which includes the
      // style pass) is not picked up instead of the one configured here.
      configFile: false,
      preprocess: vitePreprocess({ script: true, style: false }),
      compilerOptions: { hmr: false },
    }),
  ],
  resolve: {
    conditions: ['browser'],
    alias: {
      $lib: r('./src/lib'),
      '$app/environment': r('./src/test/app-environment.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
