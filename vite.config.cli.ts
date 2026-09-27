import { defineConfig } from 'vite';

// The command line: one self-contained ES module for Node 20+, sharing the
// app's exporters (src/lib) so both produce identical files.
export default defineConfig({
  build: {
    ssr: 'src/cli/main.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: 'sindri-pixel.mjs',
        banner: '#!/usr/bin/env node',
      },
    },
  },
  ssr: { noExternal: true },
});
