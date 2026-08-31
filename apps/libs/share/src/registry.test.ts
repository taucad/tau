import { describe, expect, it, vi } from 'vitest';
import { createShareProviderRegistry } from '#registry.js';

const descriptor = { id: 'test', label: 'Test', capabilities: ['project.resolve'] } as const;

describe('share provider registry', () => {
  it('loads providers lazily and rejects unknown or inconsistent registrations', async () => {
    const resolve = vi.fn();
    const load = vi.fn(async () => ({ descriptor, resolve }));
    const registry = createShareProviderRegistry([{ descriptor, load }]);
    expect(load).not.toHaveBeenCalled();
    expect(await registry.load('test')).toMatchObject({ resolve });
    expect(load).toHaveBeenCalledOnce();
    await expect(registry.load('missing')).rejects.toMatchObject({ code: 'SHARE_PROVIDER_UNKNOWN' });
    expect(() =>
      createShareProviderRegistry([
        { descriptor, load },
        { descriptor, load },
      ]),
    ).toThrow('Duplicate');

    const inconsistent = createShareProviderRegistry([
      { descriptor, load: async () => ({ descriptor, resolve, publish: vi.fn() }) },
    ]);
    await expect(inconsistent.load('test')).rejects.toThrow('undeclared capability');
  });
});
