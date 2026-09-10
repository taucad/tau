import { describe, expect, it, vi } from 'vitest';

import type * as RuntimeTranscoder from '@taucad/runtime/transcoder';

import { renderSvgPng } from '#svg.transcoder.js';

// `vi.mock` is hoisted above these imports, so the stub is installed before
// `#svg.transcoder.js` resolves its own dependency.
vi.mock('@taucad/runtime/transcoder', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeTranscoder>()),
  compileWasmStreaming: vi.fn().mockRejectedValue(new Error('resvg wasm unavailable')),
}));

describe('SVG backend failure classification', () => {
  it('reports backend initialization failures as backend failures', async () => {
    await expect(
      renderSvgPng('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
    ).rejects.toMatchObject({ code: 'backend', message: 'resvg wasm unavailable' });
  });
});
