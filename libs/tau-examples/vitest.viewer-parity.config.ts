import { defineConfig } from 'vitest/config';

/*
 * Viewer parity gate (Tau Brain `research/nanoraster-viewer-parity-charter.md`, W6): nanoraster against the viewer
 * references `viewer:capture:viewer-parity` writes. Inputs are documented in scripts/viewer-parity.gate.test.ts.
 */
export default defineConfig({
  cacheDir: '../../node_modules/.cache/tau-examples-viewer-parity',
  test: {
    environment: 'node',
    include: ['scripts/viewer-parity.gate.test.ts'],
    testTimeout: 300_000,
    fileParallelism: false,
    reporters: ['verbose'],
  },
});
