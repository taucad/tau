import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareError } from '@taucad/share/provider';

const implementationLoaded = vi.hoisted(() => vi.fn());

vi.mock('#lib/builtin-share-provider.js', () => {
  implementationLoaded();
  const descriptor = { id: 'builtin', label: 'Tau catalog', capabilities: ['project.resolve'] } as const;
  return {
    builtinShareProviderDescriptor: descriptor,
    builtinShareProvider: { descriptor, resolve: vi.fn() },
  };
});

describe('share provider entry boundary', () => {
  afterEach(() => {
    vi.doUnmock('#lib/builtin-share-provider.js');
    vi.resetModules();
  });
  it('should expose catalog metadata without loading its implementation until selected', async () => {
    const { shareProviderRegistry } = await import('#lib/share-providers.js');
    expect(shareProviderRegistry.descriptors).toContainEqual({
      id: 'builtin',
      label: 'Tau catalog',
      capabilities: ['project.resolve'],
    });
    expect(implementationLoaded).not.toHaveBeenCalled();

    const provider = await shareProviderRegistry.load('builtin');
    expect(implementationLoaded).toHaveBeenCalledOnce();
    expect(provider.descriptor.id).toBe('builtin');
    expect(provider.resolve).toBeTypeOf('function');
  });

  it('should report an unavailable provider when the catalog chunk fails', async () => {
    vi.doMock('#lib/builtin-share-provider.js', () => {
      throw new TypeError('Failed to fetch module');
    });
    const { shareProviderRegistry } = await import('#lib/share-providers.js');
    await expect(shareProviderRegistry.load('builtin')).rejects.toMatchObject({
      name: new ShareError('SHARE_PROVIDER_UNAVAILABLE', '').name,
      code: 'SHARE_PROVIDER_UNAVAILABLE',
      message: 'The catalog could not be loaded. Try again.',
    });
    await expect(shareProviderRegistry.load('unknown')).rejects.toMatchObject({ code: 'SHARE_PROVIDER_UNKNOWN' });
  });

  it('should preserve cancellation from the catalog loader', async () => {
    const aborted = new Error('Cancelled');
    aborted.name = 'AbortError';
    vi.doMock('#lib/builtin-share-provider.js', () => ({
      get builtinShareProvider() {
        throw aborted;
      },
    }));
    const { shareProviderRegistry } = await import('#lib/share-providers.js');
    await expect(shareProviderRegistry.load('builtin')).rejects.toBe(aborted);
  });
});
