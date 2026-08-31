// @vitest-environment node
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectManifestSchemaUrl } from '@taucad/types';
import { openShareArchive, shareArtifactLimits } from '@taucad/share/artifact';
import { formatRepositoryTarget } from '@taucad/share/repository-target';

vi.mock('#environment.config.js', () => ({
  getEnvironment: async () => Object.fromEntries([['GITHUB_API_TOKEN', undefined]]),
}));

const { loader } = await import('./route.js');
const commit = 'a'.repeat(40);

const projectZip = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const zip = new JSZip();
  zip.file(
    'repository-root/tau.json',
    JSON.stringify({
      $schema: projectManifestSchemaUrl,
      id: 'proj_123456789012345678901',
      name: 'Birdhouse',
      description: 'Repository example',
      tags: ['test'],
      assets: { main: { entryPath: 'main.ts' } },
    }),
  );
  zip.file('repository-root/main.ts', 'export default 1;');
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
};

const callLoader = async (path: string): Promise<Response> => {
  const arguments_ = {
    request: new Request(`https://tau.new${path}`),
    params: {},
    context: {},
  } as unknown as Parameters<typeof loader>[0];
  return loader(arguments_);
};

const inputUrl = (input: Parameters<typeof globalThis.fetch>[0]): URL =>
  new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

describe('repository archive gateway', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('verifies GitHub identity and returns an immutable normalized project archive', async () => {
    const raw = await projectZip();
    const upstream = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = inputUrl(input);
      if (url.pathname === '/repositories/42') {
        return Response.json(
          Object.fromEntries([
            ['id', 42],
            ['full_name', 'taucad/examples-renamed'],
          ]),
        );
      }
      expect(url.pathname).toBe(`/repos/taucad/examples-renamed/zipball/${commit}`);
      return new Response(raw, { headers: { 'Content-Type': 'application/zip' } });
    });
    vi.stubGlobal('fetch', upstream);
    const target = formatRepositoryTarget('github', {
      v: 1,
      repositoryId: 42,
      fullName: 'taucad/examples',
      commit,
      root: '',
    });
    const response = await callLoader(`/api/import?${new URLSearchParams({ provider: 'github', target })}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('immutable');
    const opened = await openShareArchive(new Uint8Array(await response.arrayBuffer()));
    expect(opened.files.map(({ path }) => path)).toEqual(['main.ts', 'tau.json']);
  });

  it('rejects arbitrary URLs and unsafe redirects', async () => {
    const unused = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', unused);
    expect(await callLoader('/api/import?provider=github&url=https://example.com/archive.zip')).toMatchObject({
      status: 400,
    });
    expect(unused).not.toHaveBeenCalled();

    const redirected = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json(
          Object.fromEntries([
            ['id', 42],
            ['full_name', 'taucad/examples'],
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response(undefined, { status: 302, headers: { location: 'http://127.0.0.1/a.zip' } }));
    vi.stubGlobal('fetch', redirected);
    const target = formatRepositoryTarget('github', {
      v: 1,
      repositoryId: 42,
      fullName: 'taucad/examples',
      commit,
      root: '',
    });
    expect(await callLoader(`/api/import?${new URLSearchParams({ provider: 'github', target })}`)).toMatchObject({
      status: 502,
    });
  });

  it('resolves Bitbucket UUIDs to the current repository name before fetching an archive', async () => {
    const raw = await projectZip();
    const workspaceUuid = '{11111111-1111-1111-1111-111111111111}';
    const repositoryUuid = '{22222222-2222-2222-2222-222222222222}';
    const upstream = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = inputUrl(input);
      if (url.hostname === 'api.bitbucket.org') {
        return Response.json(
          Object.fromEntries([
            ['uuid', repositoryUuid],
            ['workspace', { uuid: workspaceUuid }],
            ['full_name', 'tau/examples-renamed'],
          ]),
        );
      }
      expect(url.pathname).toBe(`/tau/examples-renamed/get/${commit}.zip`);
      return new Response(raw, { headers: { 'Content-Type': 'application/zip' } });
    });
    vi.stubGlobal('fetch', upstream);
    const target = formatRepositoryTarget('bitbucket', {
      v: 1,
      workspaceUuid,
      repositoryUuid,
      commit,
      root: '',
    });
    const response = await callLoader(`/api/import?${new URLSearchParams({ provider: 'bitbucket', target })}`);
    expect(response.status).toBe(200);
    const opened = await openShareArchive(new Uint8Array(await response.arrayBuffer()));
    expect(opened.files).toHaveLength(2);
  });

  it('rejects declared oversized archives before reading their bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([1]), {
            headers: {
              'Content-Type': 'application/zip',
              'Content-Length': String(shareArtifactLimits.maxArchiveBytes + 1),
            },
          }),
      ),
    );
    const target = formatRepositoryTarget('gitlab', { v: 1, projectId: 7, commit, root: '' });
    expect(await callLoader(`/api/import?${new URLSearchParams({ provider: 'gitlab', target })}`)).toMatchObject({
      status: 413,
    });
  });

  it('returns bounded rate-limit metadata without exposing an upstream body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('provider detail', {
            status: 429,
            headers: { 'Retry-After': '60' },
          }),
      ),
    );
    const target = formatRepositoryTarget('gitlab', { v: 1, projectId: 7, commit, root: '' });
    const response = await callLoader(`/api/import?${new URLSearchParams({ provider: 'gitlab', target })}`);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(await response.text()).not.toContain('provider detail');
  });

  it('keeps the existing GitHub importer on a fixed typed target and no-store response', async () => {
    const raw = await projectZip();
    const upstream = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = inputUrl(input);
      return url.pathname.includes('/commits/')
        ? Response.json({ sha: commit })
        : new Response(raw, { headers: { 'Content-Type': 'application/zip' } });
    });
    vi.stubGlobal('fetch', upstream);
    const response = await callLoader('/api/import?provider=github&owner=taucad&repo=tau&ref=main');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(raw);
  });
});
