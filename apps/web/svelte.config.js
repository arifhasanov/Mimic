import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // Single-page mode: every route falls back to index.html, which NestJS serves.
    adapter: adapter({ fallback: 'index.html', strict: false }),
  },
};
