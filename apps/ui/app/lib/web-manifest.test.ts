import { afterEach, describe, expect, it, vi } from 'vitest';

/** The module reads the target once, at evaluation, so each case needs a fresh import. */
const loadWebManifestLinks = async (): Promise<unknown> => {
  vi.resetModules();
  const module_ = await import('#lib/web-manifest.js');
  return module_.webManifestLinks;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('webManifestLinks', () => {
  it('links the manifest on the web build', async () => {
    await expect(loadWebManifestLinks()).resolves.toStrictEqual([{ rel: 'manifest', href: '/manifest.webmanifest' }]);
  });

  it('links nothing on desktop, where the manifest route is excluded from the SPA', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');

    await expect(loadWebManifestLinks()).resolves.toStrictEqual([]);
  });
});
