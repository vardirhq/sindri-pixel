import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build config for the standalone AI Pixel-Art Downscaler (`web/`), deployed
// as a static site to GitHub Pages. The desktop/editor build stays in
// `vite.config.ts` — this one only pulls in `src/lib/pixelReconstruction` and
// the shared design tokens.
//
// The site is served from the custom domain pixel.vardir.no (see
// `web/public/CNAME`), so assets live at the root. Set
// VITE_WEB_BASE=/sindri-pixel/ to serve it from the default project-Pages
// subpath instead.
export default defineConfig({
  root: 'web',
  base: process.env.VITE_WEB_BASE ?? '/',
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
