import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    // The client always talks to window.location.origin, so dev and production are identical.
    proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } },
  },
});
