import { describe, expect, it, vi } from 'vitest';

vi.mock('@taucad/runtime/transcoder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@taucad/runtime/transcoder')>()),
  compileWasmStreaming: vi.fn().mockRejectedValue(new Error('resvg wasm unavailable')),
}));

import { renderSvgPng } from '#svg.transcoder.js';

describe('SVG backend failure classification', () => {
  it('reports backend initialization failures as backend failures', async () => {
    await expect(
      renderSvgPng('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
    ).rejects.toMatchObject({ code: 'backend', message: 'resvg wasm unavailable' });
  });
});
