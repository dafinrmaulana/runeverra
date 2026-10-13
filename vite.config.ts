import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file (JS and CSS inlined); images stay in public/assets and are
// referenced by relative path, so the page also works when published next to them.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  build: { outDir: 'dist', assetsDir: '_', emptyOutDir: true, target: 'es2020' },
  server: { port: 5173 },
});
