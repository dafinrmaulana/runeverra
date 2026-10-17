import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two builds from one source:
//   default    dist/: the site (and a future app shell). Hashed JS, CSS and fonts in dist/_/, so a
//              deploy only re-downloads what changed and the service worker can cache each file.
//   artifact   one self-contained HTML file (JS and CSS inlined) in dist-artifact/, which
//              build.mjs turns into dist/artifact.html for hosts that take a single page.
// Images stay in public/assets and are referenced by relative path in both.
export default defineConfig(({ mode }) => {
  const single = mode === 'artifact';
  return {
    base: './',
    plugins: single ? [react(), viteSingleFile({ removeViteModuleLoader: true })] : [react()],
    publicDir: single ? false : 'public',
    build: {
      outDir: single ? 'dist-artifact' : 'dist',
      assetsDir: '_',
      emptyOutDir: true,
      target: 'es2020',
      // React and the fonts change far less often than the game: keep them in their own cached files.
      rollupOptions: single
        ? {}
        : { output: { manualChunks: (id: string) => (id.includes('node_modules') ? 'vendor' : undefined) } },
    },
    server: { port: 5173 },
  };
});
