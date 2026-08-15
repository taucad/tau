import { reactRouter } from '@react-router/dev/vite';
import { tauRuntime } from '@taucad/runtime/vite';
import { defineConfig } from 'vite';

const deployment = process.env['TAU_REACT_E2E_DEPLOYMENT'] ?? 'isolated';
if (deployment !== 'isolated' && deployment !== 'non-isolated') {
  throw new Error(`TAU_REACT_E2E_DEPLOYMENT must be "isolated" or "non-isolated", received ${deployment}`);
}

const port = deployment === 'isolated' ? 3102 : 3104;

export default defineConfig({
  root: import.meta.dirname,
  plugins: [tauRuntime({ crossOriginIsolation: deployment === 'isolated' }), reactRouter()],
  build: {
    target: 'es2022',
  },
  server: {
    allowedHosts: true,
    host: '127.0.0.1',
    port,
  },
  preview: {
    host: '127.0.0.1',
    port,
  },
});
