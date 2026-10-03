import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Lodestar Maps (lodestar/) is a project of its own, built into dist/lodestar/ after the site
// (npm run build): this one leaves it alone
export default defineConfig({
  plugins: [svelte()],
  base: './',
  optimizeDeps: { entries: ['index.html'] },
  server: { watch: { ignored: ['**/lodestar/**'] } }
});
