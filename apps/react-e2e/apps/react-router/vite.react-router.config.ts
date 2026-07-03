import { runtime } from '@taucad/runtime/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [...runtime()],
  worker: { format: 'es' },
  build: { target: 'es2022' },
  server: {
    allowedHosts: true,
    host: '127.0.0.1',
    port: 3102,
  },
  preview: {
    host: '127.0.0.1',
    port: 3102,
  },
});
