import type { Config } from '@react-router/dev/config';

const deployment = process.env['TAU_REACT_E2E_DEPLOYMENT'] ?? 'isolated';
if (deployment !== 'isolated' && deployment !== 'non-isolated') {
  throw new Error(`TAU_REACT_E2E_DEPLOYMENT must be "isolated" or "non-isolated", received ${deployment}`);
}

export default {
  buildDirectory: deployment === 'isolated' ? 'build-isolated' : 'build-non-isolated',
  ssr: false,
} satisfies Config;
