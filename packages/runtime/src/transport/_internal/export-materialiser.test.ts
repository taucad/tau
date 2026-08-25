import { describe, expect, it, vi } from 'vitest';
import { SharedPool } from '@taucad/memory';
import { materialiseExportResult } from '#transport/_internal/export-materialiser.js';

describe('materialiseExportResult', () => {
  it('materialises pooled and inline files in order and acknowledges only pooled keys', () => {
    const pool = new SharedPool(new SharedArrayBuffer(256 * 1024), { maxEntries: 8 });
    pool.store('pooled-file', new Uint8Array([1, 2, 3]));
    const acknowledge = vi.fn();

    const result = materialiseExportResult(
      {
        success: true,
        data: [
          { name: 'model.glb', mimeType: 'model/gltf-binary', bytes: { delivery: 'pooled', key: 'pooled-file' } },
          {
            name: 'metadata.json',
            mimeType: 'application/octet-stream',
            bytes: { delivery: 'inline', bytes: new Uint8Array([4, 5]) },
          },
        ],
        issues: [],
      },
      pool,
      acknowledge,
    );

    expect(result).toMatchObject({ success: true });
    if (!result.success) {
      return;
    }
    expect(result.data.map(({ name, mimeType }) => ({ name, mimeType }))).toEqual([
      { name: 'model.glb', mimeType: 'model/gltf-binary' },
      { name: 'metadata.json', mimeType: 'application/octet-stream' },
    ]);
    expect(result.data[0]?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.data[1]?.bytes).toEqual(new Uint8Array([4, 5]));
    expect(acknowledge).toHaveBeenCalledOnce();
    expect(acknowledge).toHaveBeenCalledWith('pooled-file');
  });
});
