import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { esbuildWasmUrl } from '#vm/esbuild-wasm-url.js';

describe('esbuild wasm asset', () => {
  it('should exist next to the VM module that resolves it with import.meta.url', async () => {
    const fileStat = await stat(new URL(esbuildWasmUrl));

    expect(fileStat.isFile()).toBe(true);
    expect(fileStat.size).toBeGreaterThan(0);
    expect(fileStat.size).toBeLessThanOrEqual(15 * 1024 * 1024);
  });
});
