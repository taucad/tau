// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoaderFunctionArgs } from 'react-router';

const loadPublication = vi.hoisted(() =>
  vi.fn(async (_arguments: LoaderFunctionArgs) => ({ publication: { id: 'pub' } })),
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

const { loader, meta } = await import('#routes/s.$slug/route.js');

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
    await expect(loader(loaderArgs(slug))).resolves.toEqual({ kind: 'portable' });
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
        builtin: { title: 'Birdhouse', description: 'A portable example', thumbnail: 'https://tau.new/bird.webp' },
      },
    } as Parameters<typeof meta>[0]);
    expect(tags).toEqual(expect.arrayContaining([{ title: 'Birdhouse · Tau' }]));
    expect(tags).not.toEqual(expect.arrayContaining([{ name: 'robots', content: 'noindex, nofollow' }]));
  });
});
