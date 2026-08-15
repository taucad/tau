import { resolve } from 'node:path';
import { withTauRuntime } from '@taucad/runtime/nextjs/config';
import type { NextConfig } from 'next';

const deployment = process.env['TAU_REACT_E2E_DEPLOYMENT'] ?? 'isolated';
if (deployment !== 'isolated' && deployment !== 'non-isolated') {
  throw new Error(`TAU_REACT_E2E_DEPLOYMENT must be "isolated" or "non-isolated", received ${deployment}`);
}

const workspaceRoot = resolve(import.meta.dirname, '../../../..');

export default withTauRuntime(
  {
    distDir: deployment === 'isolated' ? '.next-isolated' : '.next-non-isolated',
    outputFileTracingRoot: workspaceRoot,
    turbopack: { root: workspaceRoot },
  } satisfies NextConfig,
  deployment === 'isolated' ? {} : { document: [] },
);
