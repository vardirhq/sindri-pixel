import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build config for the standalone AI Pixel-Art Downscaler (`web/`), deployed
// as a static site to GitHub Pages. The desktop/editor build stays in
// `vite.config.ts` — this one only pulls in `src/lib/pixelReconstruction` and
// the shared design tokens.
//
// Project Pages are served from a subpath (`/sindri-pixel/`), so `base` must
// match the repo name. Set VITE_WEB_BASE=/ when serving from a custom domain
// or a user/org Pages repo.
export default defineConfig({
  root: 'web',
  base: process.env.VITE_WEB_BASE ?? '/sindri-pixel/',
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
  },
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
    target: ['es2021', 'chrome100', 'safari13'],
  },
});
