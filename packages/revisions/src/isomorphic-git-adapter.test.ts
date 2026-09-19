import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { FileSystemProvider } from '@taucad/filesystem';

import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { RevisionHttpClient, RevisionHttpRequest, RevisionHttpResponse } from '#http-client.js';

const encoder = new TextEncoder();
const author = { name: 'Tau', email: 'noreply@tau.new' };
const provenance = { source: 'user', actorId: 'tag-lock-test', createdAt: 1_756_742_400_000 } as const;
const providers: MemoryProvider[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const provider of providers.splice(0)) {
    provider.dispose();
  }
});

const tree = (content: string): ImmutableRevisionTree =>
  new ImmutableRevisionTree([['part.scad', encoder.encode(content)]]);

/**
 * One HTTP client that answers every git request with the same refusal.
 *
 * The advertisement is the first request every remote verb makes, so answering
 * it is enough to exercise all three classifier seams (N1).
 *
 * @param statusCode - What the remote answers.
 * @param body - Its JSON envelope, or the empty string for no body at all.
 * @returns The client, and the URLs it was asked for.
 */
const refusingClient = (
  statusCode: number,
  body: string,
): Readonly<{ http: RevisionHttpClient; requested: readonly string[] }> => {
  const requested: string[] = [];
  const chunks = async function* (): AsyncIterableIterator<Uint8Array<ArrayBuffer>> {
    await Promise.resolve();
    if (body !== '') {
      yield encoder.encode(body);
    }
  };
  return {
    requested,
    http: {
      request: async (request: RevisionHttpRequest): Promise<RevisionHttpResponse> => {
        requested.push(request.url);
        await Promise.resolve();
        return {
          url: request.url,
          method: request.method ?? 'GET',
          headers: { 'content-type': 'application/json' },
          body: chunks(),
          statusCode,
          statusMessage: 'Refused',
        };
      },
    },
  };
};

/**
 * A store with one revision on `main` and one remote, ready to be refused.
 *
 * @param http - The client whose answers this port will classify.
 * @param remote - The remote's name, which decides whose credential a 401 refused.
 * @returns The port.
 */
const storeWithRemote = async (
  http: RevisionHttpClient,
  remote: string,
): Promise<ReturnType<typeof createIsomorphicGitRevisionPort>> => {
  const filesystem = new MemoryProvider();
  providers.push(filesystem);
  const port = createIsomorphicGitRevisionPort({ filesystem, http });
  await port.init({ author });
  const receipt = await port.writeRevision({
    parents: [],
    tree: tree('cube(1);\n'),
    provenance,
    summary: { generated: 'First' },
  });
  await port.updateRef({ name: 'refs/heads/main', expectedHead: undefined, head: revisionId(receipt.commitId) });
  await port.setRemote({ name: remote, url: 'https://api.tau.new/v1/git/p1.git' });
  return port;
};

describe('isomorphic-git remote refusals (N1)', () => {
  const push = async (port: ReturnType<typeof createIsomorphicGitRevisionPort>, remote: string): Promise<unknown> =>
    port.push({ remote, refs: [{ name: 'refs/heads/main' }] });

  it.each([
    {
      label: 'a free-tier push',
      status: 403,
      body: '{"code":"GIT_SYNC_NOT_ENTITLED","message":"Syncing files to Tau Cloud is a paid plan feature."}',
      code: 'REMOTE_NOT_ENTITLED',
      message: 'Syncing files to Tau Cloud is a paid plan feature.',
    },
    {
      label: 'an expired session',
      status: 401,
      body: '{"code":"UNAUTHORIZED","message":"Authentication required"}',
      code: 'REMOTE_UNAUTHORIZED',
      message: 'Authentication required',
    },
    {
      label: 'a project that is not this account’s',
      status: 404,
      body: '{"code":"GIT_REPOSITORY_NOT_FOUND","message":"No project with this id"}',
      code: 'REMOTE_NOT_FOUND',
      message: 'No project with this id',
    },
    {
      label: 'a full store',
      status: 413,
      body: '{"code":"GIT_QUOTA_EXCEEDED","message":"This project is over its storage plan."}',
      code: 'REMOTE_QUOTA_EXCEEDED',
      message: 'This project is over its storage plan.',
    },
    {
      label: 'a busy server',
      status: 503,
      body: '',
      code: 'REMOTE_UNAVAILABLE',
      message: 'This remote is busy; this project will try again.',
    },
  ])('names $label as itself rather than an unreachable remote', async ({ status, body, code, message }) => {
    const { http } = refusingClient(status, body);
    const port = await storeWithRemote(http, 'tau');

    await expect(push(port, 'tau')).rejects.toMatchObject({ code, message });
    await expect(port.listRemoteRefs('tau')).rejects.toMatchObject({ code, message });
    await expect(port.fetch({ remote: 'tau', refs: ['refs/heads/main'] })).rejects.toMatchObject({ code });
  });

  it('routes a refused third-party credential to Reconnect rather than Sign in', async () => {
    const { http } = refusingClient(401, '{"code":"UNAUTHORIZED","message":"Bad credentials"}');
    const port = await storeWithRemote(http, 'github-22');

    await expect(push(port, 'github-22')).rejects.toMatchObject({ code: 'REMOTE_REAUTHORIZATION_REQUIRED' });
  });

  it('keeps `could not be reached` for the one failure that really is unreachable', async () => {
    const http: RevisionHttpClient = {
      request: async () => {
        await Promise.resolve();
        throw new TypeError('Failed to fetch');
      },
    };
    const port = await storeWithRemote(http, 'tau');

    await expect(push(port, 'tau')).rejects.toMatchObject({
      code: 'ENGINE_FAILED',
      message: 'The remote could not be reached.',
    });
  });

  it('never leaks the library’s own HTTP sentence into a rendered message', async () => {
    const { http } = refusingClient(403, '');
    const port = await storeWithRemote(http, 'tau');

    const refusal: unknown = await port.listRemoteRefs('tau').catch((error: unknown) => error);

    expect((refusal as Error).message).not.toMatch(/HTTP Error/u);
    expect((refusal as Error).message).not.toMatch(/could not be reached/u);
  });
});

describe('isomorphic-git tag ref locking', () => {
  it('should serialize a local tag move after another materialization of the same ref', async () => {
    const locks = new Map<string, Promise<void>>();
    const requestedLocks: string[] = [];
    vi.stubGlobal('navigator', {
      locks: {
        request: async <T>(name: string, _options: LockOptions, operation: () => Promise<T>): Promise<T> => {
          if (!name.startsWith('tau:revision-ref:')) {
            return operation();
          }
          requestedLocks.push(name);
          const previous = locks.get(name) ?? Promise.resolve();
          const release = Promise.withResolvers<void>();
          const held = async (): Promise<void> => {
            await previous;
            await release.promise;
          };
          locks.set(name, held());
          await previous;
          try {
            return await operation();
          } finally {
            release.resolve();
          }
        },
      },
    });
    const storage = new MemoryProvider();
    providers.push(storage);
    const materializationReached = Promise.withResolvers<void>();
    const releaseMaterialization = Promise.withResolvers<void>();
    let delayTagWrite = false;
    const filesystem = Object.assign(Object.create(storage) as FileSystemProvider, {
      writeFile: async (path: string, data: Uint8Array<ArrayBuffer>): Promise<void> => {
        if (delayTagWrite && path.endsWith('refs/tags/v1')) {
          delayTagWrite = false;
          materializationReached.resolve();
          await releaseMaterialization.promise;
        }
        await storage.writeFile(path, data);
      },
    });
    const materializer = createIsomorphicGitRevisionPort({ filesystem });
    const mover = createIsomorphicGitRevisionPort({ filesystem: storage });
    await materializer.init({ author });
    const first = await materializer.writeRevision({
      parents: [],
      tree: tree('cube(1);\n'),
      provenance,
      summary: { generated: 'First' },
    });
    const firstRevision = revisionId(first.commitId);
    const second = await materializer.writeRevision({
      parents: [firstRevision],
      tree: tree('cube(2);\n'),
      provenance,
      summary: { generated: 'Second' },
    });
    await materializer.tag({ name: 'v1', revisionId: firstRevision, note: 'Local move', createdAt: 100 });
    await materializer.tag({
      name: 'v1',
      revisionId: revisionId(second.commitId),
      note: 'Fetched version',
      createdAt: 200,
    });
    const previousTag = await materializer.readRef('refs/tags/v1');

    delayTagWrite = true;
    const materializing = materializer.updateRef({
      name: 'refs/tags/v1',
      expectedHead: previousTag,
      head: revisionId(second.commitId),
    });
    await materializationReached.promise;
    const moving = mover.tag({ name: 'v1', revisionId: firstRevision, note: 'Local move', createdAt: 100 });
    const beforeRelease = await Promise.race([
      moving.then(() => 'moved'),
      new Promise<'waiting'>((resolve) => {
        setTimeout(() => {
          resolve('waiting');
        }, 100);
      }),
    ]);
    releaseMaterialization.resolve();
    await Promise.all([materializing, moving]);

    expect(beforeRelease).toBe('waiting');
    expect(await mover.listTags()).toEqual([
      expect.objectContaining({ name: 'v1', revisionId: firstRevision, note: 'Local move' }),
    ]);
    expect(new Set(requestedLocks.filter((name) => name.endsWith('refs/tags/v1')))).toEqual(
      new Set([`tau:revision-ref:${storage.id}:.git:refs/tags/v1`]),
    );
  });
});
