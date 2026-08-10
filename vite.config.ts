import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// base: './' — сборка кладётся в подпапку (itch.io, GitHub Pages) без правок путей.
export default defineConfig({
  base: './',
  server: { port: 5180 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        assets: resolve(__dirname, 'assets.html'),
      },
    },
  },
});
