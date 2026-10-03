import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Use shared sources directly so client dev never waits on a shared build.
    alias: { '@museum/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
