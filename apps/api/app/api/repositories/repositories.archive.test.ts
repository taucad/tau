// @vitest-environment node
import JSZip from 'jszip';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openShareArchive, shareArtifactLimits } from '@taucad/share/artifact';
import { formatRepositoryTarget } from '@taucad/share/repository-target';
import { projectManifestSchemaUrl } from '@taucad/types';
import type { Environment } from '#config/environment.config.js';
import type { RedisService } from '#redis/redis.service.js';
import { RepositoriesService } from '#api/repositories/repositories.service.js';

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

const createService = ({ githubToken, rateCount = 1 }: { githubToken?: string; rateCount?: number } = {}) => {
  const configService = {
    get: vi.fn(() => githubToken),
  } as unknown as ConfigService<Environment, true>;
  const evalRedis = vi.fn().mockResolvedValue(rateCount);
  const redisService = { client: { eval: evalRedis } } as unknown as RedisService;
  return { service: new RepositoriesService(configService, redisService), evalRedis };
};

const callArchive = async (path: string): Promise<Response> => {
  const url = new URL(path, 'https://api.tau.test');
  const { service } = createService();
  return service.getArchive(Object.fromEntries(url.searchParams), '203.0.113.7', new AbortController().signal);
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
    const response = await callArchive(
      `/v1/repositories/archive?${new URLSearchParams({ provider: 'github', target })}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('immutable');
    const opened = await openShareArchive(new Uint8Array(await response.arrayBuffer()));
    expect(opened.files.map(({ path }) => path)).toEqual(['main.ts', 'tau.json']);
  });

  it('rejects arbitrary URLs and unsafe redirects', async () => {
    const unused = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', unused);
    expect(
      await callArchive('/v1/repositories/archive?provider=github&url=https://example.com/archive.zip'),
    ).toMatchObject({
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
            ['visibility', 'public'],
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
    expect(
      await callArchive(`/v1/repositories/archive?${new URLSearchParams({ provider: 'github', target })}`),
    ).toMatchObject({ status: 502 });
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
    const response = await callArchive(
      `/v1/repositories/archive?${new URLSearchParams({ provider: 'bitbucket', target })}`,
    );
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
    expect(
      await callArchive(`/v1/repositories/archive?${new URLSearchParams({ provider: 'gitlab', target })}`),
    ).toMatchObject({ status: 413 });
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
    const response = await callArchive(
      `/v1/repositories/archive?${new URLSearchParams({ provider: 'gitlab', target })}`,
    );
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
    const response = await callArchive('/v1/repositories/archive?provider=github&owner=taucad&repo=tau&ref=main');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(raw);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('sends the GitHub token only to api.github.com across redirects', async () => {
    const raw = await projectZip();
    const upstream = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = inputUrl(input);
      const authorization = new Headers(init?.headers).get('authorization');
      if (url.pathname === '/repositories/42') {
        expect(authorization).toBe('Bearer github-token');
        return Response.json(
          Object.fromEntries([
            ['id', 42],
            ['full_name', 'taucad/examples'],
            ['visibility', 'public'],
          ]),
        );
      }
      if (url.hostname === 'api.github.com') {
        expect(authorization).toBe('Bearer github-token');
        return new Response(undefined, {
          status: 302,
          headers: { location: `https://codeload.github.com/taucad/examples/legacy.zip/${commit}` },
        });
      }
      expect(url.hostname).toBe('codeload.github.com');
      expect(authorization).toBeNull();
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
    const { service } = createService({ githubToken: 'github-token' });

    const response = await service.getArchive(
      { provider: 'github', target },
      '203.0.113.7',
      new AbortController().signal,
    );

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(3);
  });

  it('hides a private GitHub share target without fetching its archive', async () => {
    const raw = await projectZip();
    const upstream = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = inputUrl(input);
      if (url.pathname === '/repositories/42') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer github-token');
        return Response.json(
          Object.fromEntries([
            ['id', 42],
            ['full_name', 'taucad/private-example'],
            ['visibility', 'private'],
          ]),
        );
      }
      return new Response(raw, { headers: { 'Content-Type': 'application/zip' } });
    });
    vi.stubGlobal('fetch', upstream);
    const target = formatRepositoryTarget('github', {
      v: 1,
      repositoryId: 42,
      fullName: 'taucad/private-example',
      commit,
      root: '',
    });
    const { service } = createService({ githubToken: 'github-token' });

    const response = await service.getArchive(
      { provider: 'github', target },
      '203.0.113.7',
      new AbortController().signal,
    );

    expect(response.status).toBe(404);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('hides a private GitHub import target before fetching its commit or archive', async () => {
    const raw = await projectZip();
    const upstream = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = inputUrl(input);
      if (url.pathname === '/repos/taucad/private-example') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer github-token');
        return Response.json({ visibility: 'private' });
      }
      if (url.pathname.endsWith('/commits/main')) {
        return Response.json({ sha: commit });
      }
      return new Response(raw, { headers: { 'Content-Type': 'application/zip' } });
    });
    vi.stubGlobal('fetch', upstream);
    const { service } = createService({ githubToken: 'github-token' });

    const response = await service.getArchive(
      { provider: 'github', owner: 'taucad', repo: 'private-example', ref: 'main' },
      '203.0.113.7',
      new AbortController().signal,
    );

    expect(response.status).toBe(404);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('rejects the 61st archive request from one IP in an hour', async () => {
    const { service, evalRedis } = createService({ rateCount: 61 });
    const upstream = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', upstream);

    await expect(
      service.getArchive(
        { provider: 'github', owner: 'taucad', repo: 'tau', ref: 'main' },
        '203.0.113.7',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(evalRedis).toHaveBeenCalledWith(expect.any(String), 1, expect.stringContaining('203.0.113.7'), '3600');
    expect(upstream).not.toHaveBeenCalled();
  });
});
