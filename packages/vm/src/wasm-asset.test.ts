import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('esbuild wasm asset', () => {
  it('should exist next to the VM module that resolves it with import.meta.url', async () => {
    const wasmUrl = new URL('wasm/esbuild.wasm', import.meta.url);
    const fileStat = await stat(wasmUrl);

    expect(fileStat.isFile()).toBe(true);
    expect(fileStat.size).toBeGreaterThan(0);
    expect(fileStat.size).toBeLessThanOrEqual(15 * 1024 * 1024);
  });
});
