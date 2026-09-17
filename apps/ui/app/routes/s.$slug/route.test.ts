// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoaderFunctionArgs } from 'react-router';
import { parameterEntryPath, projectToManifest } from '@taucad/types';
import type { ShareOpenedArtifact } from '@taucad/share/artifact';

const loadPublication = vi.hoisted(() =>
  vi.fn(async (_arguments: LoaderFunctionArgs) => ({
    publication: { id: 'pub' },
  })),
);
const publicationMeta = vi.hoisted(() => vi.fn(() => [{ title: 'Persisted project' }]));

/* eslint-disable @typescript-eslint/naming-convention -- mocked React module exports keep their public names. */
vi.mock('#components/share/tau-publication.js', () => ({
  default: () => null,
  PublicationInteractiveSurface: () => null,
  ErrorBoundary: () => null,
  loadPublication,
  publicationMeta,
}));
/* eslint-enable @typescript-eslint/naming-convention -- end mocked exports. */

const { loader, meta, resolvePortableArtifact } = await import('#routes/s.$slug/route.js');

const encoder = new TextEncoder();
const manifest = projectToManifest({
  id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  name: 'Portable fixture',
  description: 'Record classification fixture',
  tags: [],
  assets: { main: { entryPath: 'main.ts' } },
});
const portableArtifact = (parameterRecord: unknown): ShareOpenedArtifact => ({
  archive: new Uint8Array(),
  files: [
    { path: 'tau.json', content: encoder.encode(JSON.stringify(manifest)) },
    { path: 'main.ts', content: encoder.encode('export default null') },
    {
      path: parameterEntryPath('main.ts'),
      content: encoder.encode(typeof parameterRecord === 'string' ? parameterRecord : JSON.stringify(parameterRecord)),
    },
  ],
});

const loaderArgs = (slug: string): LoaderFunctionArgs => {
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- route test fixture omits unstable router internals.
  return {
    context: {},
    params: { slug },
    request: new Request(`https://tau.new/s/${slug}`),
  } as unknown as LoaderFunctionArgs;
};

describe('/s provider dispatch', () => {
  beforeEach(() => {
    loadPublication.mockClear();
  });

  it.each([
    'direct',
    'github-gist~0123456789abcdef',
    `github-gist~0123456789abcdef.${'a'.repeat(40)}`,
    'github~opaque',
    'gitlab~opaque',
    'bitbucket~opaque',
  ])('keeps %s client-only and never invokes the Tau publication loader', async (slug) => {
    await expect(loader(loaderArgs(slug))).resolves.toEqual({
      kind: 'portable',
    });
    expect(loadPublication).not.toHaveBeenCalled();
  });

  it('returns trusted server metadata for the builtin birdhouse without opening its files', async () => {
    await expect(loader(loaderArgs('builtin~replicad.birdhouse'))).resolves.toMatchObject({
      kind: 'portable',
      builtin: { title: 'Birdhouse' },
    });
    expect(loadPublication).not.toHaveBeenCalled();
    await expect(loader(loaderArgs('builtin~replicad.missing'))).rejects.toMatchObject({ status: 404 });
  });

  it('resolves provider-qualified Tau references through the Tau loader', async () => {
    const slug = 'tau~pub_123';
    await loader(loaderArgs(slug));
    expect(loadPublication.mock.calls.at(-1)?.[0].params['id']).toBe('pub_123');
  });

  it('rejects bare references instead of guessing a provider', async () => {
    await expect(loader(loaderArgs('pub_bare'))).rejects.toThrow('must identify its provider');
    expect(loadPublication).not.toHaveBeenCalled();
  });

  it('marks portable shares as no-index and no-referrer', () => {
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- React Router's generic MetaArgs fixture is partial by design.
    const tags = meta({ loaderData: { kind: 'portable' } } as Parameters<typeof meta>[0]);
    expect(tags).toEqual(
      expect.arrayContaining([
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'referrer', content: 'no-referrer' },
      ]),
    );
  });

  it('makes trusted builtin metadata indexable', () => {
    const tags = meta({
      loaderData: {
        kind: 'portable',
        builtin: {
          title: 'Birdhouse',
          description: 'A portable example',
          thumbnail: 'https://tau.new/bird.webp',
        },
      },
    } as Parameters<typeof meta>[0]);
    expect(tags).toEqual(expect.arrayContaining([{ title: 'Birdhouse · Tau' }]));
    expect(tags).not.toEqual(expect.arrayContaining([{ name: 'robots', content: 'noindex, nofollow' }]));
  });
});

describe('portable parameter records', () => {
  it('reads a current record without rewriting the archived bytes', () => {
    const artifact = portableArtifact({
      profile: 'tau-json-structure-units-03-v1',
      activeGroup: 'default',
      groups: { default: { values: { width: 12 } } },
    });

    const resolved = resolvePortableArtifact(artifact);

    expect(resolved?.parameters).toEqual({ width: 12 });
    expect(resolved?.parameterDiagnostic).toBeUndefined();
    expect(resolved?.files[parameterEntryPath('main.ts')]?.content).toBe(artifact.files[2]?.content);
  });

  it.each([
    [{ recordVersion: 2, profile: 'future', groups: {} }, 'unsupported record version'],
    [{ activeGroup: 'default', groups: { default: { values: { width: 12 } } } }, 'not a valid record'],
    ['{', 'not a valid record'],
  ])('preserves %s record bytes and reports the read-only diagnostic', (record, label) => {
    const artifact = portableArtifact(record);

    const resolved = resolvePortableArtifact(artifact);

    expect(resolved?.parameters).toEqual({});
    expect(resolved?.parameterDiagnostic).toContain(label);
    expect(resolved?.files[parameterEntryPath('main.ts')]?.content).toBe(artifact.files[2]?.content);
  });
});
