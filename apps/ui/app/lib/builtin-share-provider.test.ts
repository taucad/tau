import { describe, expect, it, vi } from 'vitest';
import { shareArtifactCodec } from '@taucad/share/artifact';
import type { ShareArtifactCodec, ShareOpenedArtifact, SharePlainArtifact } from '@taucad/share/artifact';
import type { ShareProviderContext } from '@taucad/share/provider';
import { builtinShareProvider } from '#lib/builtin-share-provider.js';

const opened: ShareOpenedArtifact = { archive: new Uint8Array([1]), files: [] };
const packed: SharePlainArtifact = {
  archive: new Uint8Array([1]),
  encodedArchive: 'archive',
  metrics: { fileCount: 3, uncompressedBytes: 3, archiveBytes: 1, encodedCharacters: 7 },
};

describe('builtin share provider', () => {
  it('loads birdhouse lazily and normalizes it through the artifact codec', async () => {
    const pack = vi.fn<ShareArtifactCodec['pack']>(async () => packed);
    const openArchive = vi.fn<ShareArtifactCodec['openArchive']>(async () => opened);
    const fetch = vi.fn<typeof globalThis.fetch>();
    const artifactCodec = { ...shareArtifactCodec, pack, openArchive } satisfies ShareArtifactCodec;
    const context = { origin: 'https://tau.new', fetch, artifactCodec } satisfies ShareProviderContext;
    await expect(
      builtinShareProvider.resolve!(
        { locator: { providerId: 'builtin', reference: 'replicad.birdhouse' }, secrets: {} },
        context,
      ),
    ).resolves.toBe(opened);
    expect(pack).toHaveBeenCalledOnce();
    expect(pack.mock.calls[0]?.[0].files.map(({ path }) => path)).toEqual(['main.ts', 'tau.json', 'thumbnail.webp']);
    expect(new TextDecoder().decode(pack.mock.calls[0]?.[0].files[0]?.content)).toContain("from 'replicad'");
    expect(openArchive).toHaveBeenCalledWith(packed.archive, undefined);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects unknown builtin locators without fetching', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(
      builtinShareProvider.resolve!(
        { locator: { providerId: 'builtin', reference: 'replicad.missing' }, secrets: {} },
        { origin: 'https://tau.new', fetch, artifactCodec: shareArtifactCodec },
      ),
    ).rejects.toMatchObject({ code: 'SHARE_PROVIDER_UNAVAILABLE' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
