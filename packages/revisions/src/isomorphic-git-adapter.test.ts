import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { FileSystemProvider } from '@taucad/filesystem';

import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { LfsFetchReport } from '#isomorphic-git-adapter.js';
import { lfsObjectPath, lfsPointerFor } from '#lfs.js';
import {
  generatedGitattributesContent,
  generatedGitattributesPath,
  generatedIgnoreContent,
  generatedIgnorePath,
} from '#workspace-config.js';
import type { RevisionHttpClient, RevisionHttpRequest, RevisionHttpResponse } from '#http-client.js';
import { recordedBy } from '#test/identity.js';

const encoder = new TextEncoder();
const author = { name: 'Tau', email: 'noreply@tau.new' };
const provenance = { source: 'user', ...recordedBy('tag-lock-test'), createdAt: 1_756_742_400_000 } as const;
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
  headers: Readonly<Record<string, string>> = {},
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
          headers: { 'content-type': 'application/json', ...headers },
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

/*
 * G0-9: the generated block used to be written on every open, whatever it said,
 * so a project created before a row changed kept the stale block until somebody
 * wrote the file by hand — and a current project's working copy was rewritten
 * every time the authority opened it. `init` is the open seam
 * (`revision-effects.ensureStore` calls it once per authority), so the merge is
 * the migration and the comparison is what stops it repeating.
 */
describe('the generated block on open', () => {
  /** A provider that records every file `init` writes under the project root, outside the store's own `.git/`. */
  const counting = (): Readonly<{ filesystem: FileSystemProvider; written: string[] }> => {
    const provider = new MemoryProvider();
    providers.push(provider);
    const written: string[] = [];
    return {
      written,
      filesystem: Object.assign(provider, {
        writeFile: async (path: string, ...rest: never[]) => {
          if (!path.startsWith('.git/')) {
            written.push(path);
          }
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the spy forwards the provider's own overloads.
          return (MemoryProvider.prototype.writeFile as (...args: unknown[]) => Promise<void>).call(
            provider,
            path,
            ...rest,
          );
        },
      }),
    };
  };

  const stale = `# mine
*.log
# BEGIN Tau generated — derived content is never versioned
/.git/
/.jj/
/.tau/binding.json
node_modules/
# END Tau generated
`;

  it('should leave an existing ignore file as written and keep its ignores in the store (D16)', async () => {
    const { filesystem, written } = counting();
    await filesystem.writeFile(generatedIgnorePath, stale);
    written.length = 0;
    const port = createIsomorphicGitRevisionPort({ filesystem });

    await port.init({ author });

    expect(await filesystem.readFile(generatedIgnorePath, 'utf8')).toBe(stale);
    /* The attributes file arrives with the first revision that records something (A4), never at open. */
    expect(written).toStrictEqual([]);
    expect(await filesystem.exists(generatedGitattributesPath)).toBe(false);
    expect(await filesystem.readFile('.git/info/exclude', 'utf8')).toBe(generatedIgnoreContent(undefined));
  });

  it('should create only the ignore file for a brand-new project (A4)', async () => {
    const { filesystem, written } = counting();
    const port = createIsomorphicGitRevisionPort({ filesystem });

    await port.init({ author });

    expect(written).toStrictEqual([generatedIgnorePath]);
    expect(await filesystem.exists(generatedGitattributesPath)).toBe(false);
    expect(await filesystem.readFile(generatedIgnorePath, 'utf8')).toBe(generatedIgnoreContent(undefined));
  });

  it('should write no file under the project root when it opens a project an older build created (I4, DEF-W22-1)', async () => {
    const { filesystem, written } = counting();
    const port = createIsomorphicGitRevisionPort({ filesystem });
    await port.init({ author, createSetupFiles: false });
    await filesystem.writeFile(generatedIgnorePath, stale);
    written.length = 0;

    await port.init({ author });

    expect(written).toStrictEqual([]);
    expect(await filesystem.exists(generatedGitattributesPath)).toBe(false);
    expect(await filesystem.readFile(generatedIgnorePath, 'utf8')).toBe(stale);
  });

  it('should write neither file into a store whose files carry no Tau block', async () => {
    const { filesystem, written } = counting();
    const port = createIsomorphicGitRevisionPort({ filesystem });
    await port.init({ author, createSetupFiles: false });
    await filesystem.writeFile(generatedIgnorePath, '# mine\n*.log\n');
    written.length = 0;

    await port.init({ author });

    expect(written).toStrictEqual([]);
    expect(await filesystem.exists(generatedGitattributesPath)).toBe(false);
  });

  it('should write nothing when the project is already current', async () => {
    const { filesystem, written } = counting();
    const port = createIsomorphicGitRevisionPort({ filesystem });
    await port.init({ author });
    written.length = 0;

    await port.init({ author });

    expect(written).toStrictEqual([]);
  });
});

describe('isomorphic-git remote refusals (N1)', () => {
  it('refuses an invalid fetch budget before transport and an oversized advertisement before storing refs', async () => {
    const { http, requested } = refusingClient(200, 'oversized advertisement', { 'content-length': '23' });
    const port = await storeWithRemote(http, 'tau');
    await expect(
      port.fetch({ remote: 'tau', refs: ['refs/heads/main'], maximumTransferBytes: 0 }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(requested).toHaveLength(0);
    await expect(
      port.fetch({ remote: 'tau', refs: ['refs/heads/main'], maximumTransferBytes: 2 }),
    ).rejects.toMatchObject({
      code: 'FETCH_LIMIT_EXCEEDED',
    });
    expect(requested).toHaveLength(1);
    expect(await port.readRef('refs/remotes/tau/main')).toBeUndefined();
  });

  it('counts actual response chunks when Content-Length understates the body and cancels the iterator', async () => {
    let cancelled = false;
    const body = async function* (): AsyncIterableIterator<Uint8Array<ArrayBuffer>> {
      try {
        yield encoder.encode('001');
        yield encoder.encode('002');
      } finally {
        cancelled = true;
      }
    };
    const http: RevisionHttpClient = {
      request: async (request) => ({
        url: request.url,
        method: request.method ?? 'GET',
        headers: { 'content-length': '1' },
        body: body(),
        statusCode: 200,
        statusMessage: 'OK',
      }),
    };
    const port = await storeWithRemote(http, 'tau');
    await expect(
      port.fetch({ remote: 'tau', refs: ['refs/heads/main'], maximumTransferBytes: 5 }),
    ).rejects.toMatchObject({ code: 'FETCH_LIMIT_EXCEEDED' });
    expect(cancelled).toBe(true);
    expect(await port.readRef('refs/remotes/tau/main')).toBeUndefined();
  });

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

  /* W13d: the library's own `HttpError` drops the headers, so the leg keeps the wait itself. */
  it('carries a 429’s Retry-After on every remote verb', async () => {
    const { http } = refusingClient(429, '{"code":"GIT_RATE_LIMITED","message":"Too many requests; retry shortly."}', {
      'retry-after': '17',
    });
    const port = await storeWithRemote(http, 'tau');
    const limited = { code: 'REMOTE_UNAVAILABLE', retryAfterMilliseconds: 17_000 };

    await expect(push(port, 'tau')).rejects.toMatchObject(limited);
    await expect(port.listRemoteRefs('tau')).rejects.toMatchObject(limited);
    await expect(port.fetch({ remote: 'tau', refs: ['refs/heads/main'] })).rejects.toMatchObject(limited);
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
        if (delayTagWrite && path.endsWith('refs/tags/v2')) {
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
    const madeBy = { kind: 'user', id: 'user-fetched', name: 'Fetched Person' } as const;
    const base = await materializer.tag({
      name: 'Base',
      revisionId: firstRevision,
      note: 'Local move',
      actor: madeBy,
      createdAt: 1_790_000_000_000,
    });
    const baseTag = await materializer.readRef('refs/tags/v2');
    /* The fetched version: V2 renamed elsewhere, still an annotated tag with the same id. */
    await materializer.tag({ number: 2, name: 'Fetched name', revisionId: firstRevision });
    const fetchedTag = await materializer.readRef('refs/tags/v2');
    await storage.writeFile('.git/refs/tags/v2', encoder.encode(`${baseTag!}\n`));

    /* A fetch materializing the fetched tag holds the ref's lock while it writes, as the adapter's fetch does. */
    delayTagWrite = true;
    const materializing = navigator.locks.request(
      `tau:revision-ref:${storage.id}:.git:refs/tags/v2`,
      { mode: 'exclusive' },
      async () => filesystem.writeFile('.git/refs/tags/v2', encoder.encode(`${fetchedTag!}\n`)),
    );
    await materializationReached.promise;
    /* No note, time or actor in: whatever the rename keeps comes from the version it finds. */
    const moving = mover.tag({ number: 2, name: 'Local rename', revisionId: firstRevision });
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
    expect(await mover.listTags()).toStrictEqual([
      {
        id: base.id,
        number: 2,
        name: 'Local rename',
        revisionId: firstRevision,
        note: 'Local move',
        actor: madeBy,
        createdAt: 1_790_000_000_000,
      },
    ]);
    expect(new Set(requestedLocks.filter((name) => name.endsWith('refs/tags/v2')))).toEqual(
      new Set([`tau:revision-ref:${storage.id}:.git:refs/tags/v2`]),
    );
  });
});

describe('removing a linked checkout', () => {
  it('should stop at the first file it cannot delete, leaving nothing in flight and the checkout registered', async () => {
    const filesystem = new MemoryProvider();
    const checkoutRoot = new MemoryProvider();
    providers.push(filesystem, checkoutRoot);
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      checkouts: { projectId: 'project-1', root: () => checkoutRoot },
    });
    await port.init({ author });
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([
        ['a.scad', encoder.encode('a\n')],
        ['b.scad', encoder.encode('b\n')],
        ['nested/c.scad', encoder.encode('c\n')],
      ]),
      provenance,
      summary: { generated: 'First' },
    });
    await port.updateRef({ name: 'refs/heads/main', expectedHead: undefined, head: revisionId(receipt.commitId) });
    const linked = await port.addCheckout!({ branch: 'side', from: revisionId(receipt.commitId) });
    /* One file refuses at once; every other deletion takes a while to land, so a
     * removal that refused while its siblings were still running is caught. */
    let refusing = true;
    const unlink = checkoutRoot.unlink.bind(checkoutRoot);
    vi.spyOn(checkoutRoot, 'unlink').mockImplementation(async (path) => {
      if (refusing && path === 'b.scad') {
        throw Object.assign(new Error(`EBUSY: ${path}`), { code: 'EBUSY' });
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      return unlink(path);
    });
    const remaining = async (): Promise<boolean[]> =>
      Promise.all(['a.scad', 'b.scad', 'nested/c.scad'].map(async (path) => checkoutRoot.exists(path)));

    await expect(port.removeCheckout!(linked.id)).rejects.toThrow('EBUSY: b.scad');
    const atRefusal = await remaining();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(await remaining()).toEqual(atRefusal);
    expect(atRefusal[1]).toBe(true);
    const afterRefusal = await port.listCheckouts!();
    expect(afterRefusal.map((checkout) => checkout.id)).toContain(linked.id);

    refusing = false;
    await port.removeCheckout!(linked.id);

    expect(await checkoutRoot.readdir('')).toEqual([]);
    const afterRetry = await port.listCheckouts!();
    expect(afterRetry.map((checkout) => checkout.id)).not.toContain(linked.id);
  });
});

describe('advertisement cancellation', () => {
  it('should forward cancellation to the advertisement request and refuse an already stopped request', async () => {
    const entered = Promise.withResolvers<AbortSignal | undefined>();
    const http: RevisionHttpClient = {
      request: async ({ signal }) => {
        if (!(signal instanceof AbortSignal)) {
          throw new Error('Discovery did not forward an AbortSignal.');
        }
        entered.resolve(signal);
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(signal.reason instanceof Error ? signal.reason : new Error('Discovery stopped.'));
            },
            { once: true },
          );
        });
      },
    };
    const port = await storeWithRemote(http, 'tau');
    const controller = new AbortController();
    const pending = port.listRemoteRefs('tau', { signal: controller.signal });
    const rejected = expect(pending).rejects.toThrow();
    expect(await entered.promise).toBe(controller.signal);
    controller.abort();
    await rejected;
    await expect(port.listRemoteRefs('tau', { signal: AbortSignal.abort() })).rejects.toThrow();
  });
});

/* R6 review: a server that answers protocol v2 to a v1 request lists no refs in its advertisement. */
describe('a protocol-v2-only advertisement', () => {
  it('lists through ls-refs rather than reading an empty repository, and keeps nothing for a fetch', async () => {
    const pkt = (line: string): string => `${(line.length + 4).toString(16).padStart(4, '0')}${line}`;
    const oid = 'a'.repeat(40);
    const requests: string[] = [];
    const answer = (request: RevisionHttpRequest, text: string, type: string): RevisionHttpResponse => ({
      url: request.url,
      method: request.method ?? 'GET',
      headers: { 'content-type': type },
      body: (async function* () {
        await Promise.resolve();
        yield encoder.encode(text);
      })(),
      statusCode: 200,
      statusMessage: 'OK',
    });
    const http: RevisionHttpClient = {
      request: async (request) => {
        requests.push(`${request.method ?? 'GET'} ${new URL(request.url).pathname}`);
        if ((request.method ?? 'GET') === 'GET') {
          return answer(
            request,
            `${pkt('# service=git-upload-pack\n')}0000${pkt('version 2\n')}${pkt('ls-refs\n')}${pkt('fetch\n')}0000`,
            'application/x-git-upload-pack-advertisement',
          );
        }
        return answer(
          request,
          `${pkt(`${oid} HEAD symref-target:refs/heads/main\n`)}${pkt(`${oid} refs/heads/main\n`)}0000`,
          'application/x-git-upload-pack-result',
        );
      },
    };
    const port = await storeWithRemote(http, 'tau');

    const listed = await port.listRemoteRefs('tau');
    expect(listed).toStrictEqual([{ name: 'refs/heads/main', head: oid }]);
    expect(requests.filter((entry) => entry.startsWith('POST'))).toHaveLength(1);

    /* The v2 answer is not an advertisement a fetch can reuse: it asks for its own. */
    const before = requests.length;
    await port.fetch({ remote: 'tau', refs: ['refs/heads/main'], advertised: listed });
    expect(requests.slice(before)).toStrictEqual(['GET /v1/git/p1.git/info/refs']);
  });
});

/*
 * Load-path audit fix 1: a tree read collects the pointers its store does not
 * hold, then fetches them together, where it used to make one batch call and
 * one transfer per object, one after another.
 */
describe('reading a tree with large objects', () => {
  const parts = Array.from({ length: 3 }, (_, part) => [
    `models/part-${String(part)}.step`,
    `solid part ${String(part)}`,
  ]);
  const partTree = (): ImmutableRevisionTree =>
    new ImmutableRevisionTree([
      /* Tau's block names the family, so the parts are pointers (D16). */
      [generatedGitattributesPath, encoder.encode(generatedGitattributesContent(undefined))],
      ['main.scad', encoder.encode('cube(1);\n')],
      ...parts.map(([path, content]) => [path!, encoder.encode(content)] as const),
    ]);
  const oidOf = (content: string): string => lfsPointerFor(encoder.encode(content)).pointer.oid;

  /* A Tau remote whose batch endpoint answers whatever it is asked; transfers go to the stubbed global fetch. */
  const lfsStore = async (onLfsFetch?: (report: LfsFetchReport) => void) => {
    const asked: string[][] = [];
    const contentOf = new Map(parts.map(([, content]) => [oidOf(content!), encoder.encode(content)]));
    const http: RevisionHttpClient = {
      request: async (request) => {
        let json = '';
        for await (const chunk of request.body ?? []) {
          json += new TextDecoder().decode(chunk);
        }
        const { objects } = JSON.parse(json) as { objects: Array<{ oid: string; size: number }> };
        asked.push(objects.map((object) => object.oid));
        const answer = encoder.encode(
          JSON.stringify({
            objects: objects.map((object) => ({
              ...object,
              actions: { download: { href: `https://objects.test/${object.oid}` } },
            })),
          }),
        );
        return {
          url: request.url,
          method: 'POST',
          headers: {},
          body: (async function* () {
            await Promise.resolve();
            yield answer;
          })(),
          statusCode: 200,
          statusMessage: 'OK',
        };
      },
    };
    const transfer = vi.fn<typeof fetch>(
      async (url) =>
        new Response(
          contentOf.get(
            (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).slice(
              'https://objects.test/'.length,
            ),
          ),
        ),
    );
    vi.stubGlobal('fetch', transfer);
    const filesystem = new MemoryProvider();
    providers.push(filesystem);
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      http,
      ...(onLfsFetch === undefined ? {} : { onLfsFetch }),
    });
    await port.init({ author });
    const receipt = await port.writeRevision({
      parents: [],
      tree: partTree(),
      provenance,
      summary: { generated: 'Parts' },
    });
    await port.setRemote({ name: 'tau', url: 'https://api.tau.new/v1/git/p1.git' });
    /* As a fetch leaves it: the pointers are recorded, the bytes are not here. */
    const evict = async (...contents: readonly string[]): Promise<void> => {
      await Promise.all(contents.map(async (content) => filesystem.unlink(`.git/${lfsObjectPath(oidOf(content))}`)));
    };
    return { port, head: revisionId(receipt.commitId), asked, transfer, evict, filesystem };
  };

  it('fetches only the objects its store lacks, in one batch call, and reports what it cost', async () => {
    const reports: LfsFetchReport[] = [];
    const { port, head, asked, transfer, evict } = await lfsStore((report) => reports.push(report));
    await evict(parts[0]![1]!, parts[2]![1]!);
    const read = await port.readTree(head);
    expect(read?.entries().map(({ path }) => path)).toStrictEqual(
      expect.arrayContaining(
        partTree()
          .entries()
          .map(({ path }) => path),
      ),
    );
    expect(read?.get('main.scad')).toStrictEqual(encoder.encode('cube(1);\n'));
    for (const [path, content] of parts) {
      expect(read?.get(path!)).toStrictEqual(encoder.encode(content));
    }
    expect(asked).toStrictEqual([[oidOf(parts[0]![1]!), oidOf(parts[2]![1]!)]]);
    expect(transfer).toHaveBeenCalledTimes(2);
    expect(reports).toStrictEqual([
      expect.objectContaining({
        networkObjects: 2,
        networkBytes: encoder.encode(parts[0]![1]).byteLength + encoder.encode(parts[2]![1]).byteLength,
        localObjects: 1,
        localBytes: encoder.encode(parts[1]![1]).byteLength,
        /* `objects.test` is neither the files service nor R2 nor the relay (tau.lfs.transport). */
        transport: 'other',
      }),
    ]);

    /* Each object was stored as it arrived, so the next read asks for nothing and reports nothing. */
    await port.readTree(head);
    expect(asked).toHaveLength(1);
    expect(reports).toHaveLength(1);
  });

  /* Two tabs storing one oid: the one that sees a whole copy appear while it writes keeps it. */
  it('keeps a whole copy another writer stored while this one was writing', async () => {
    const { port, head, evict, filesystem } = await lfsStore();
    await evict(parts[0]![1]!);
    const file = `.git/${lfsObjectPath(oidOf(parts[0]![1]!))}`;
    await filesystem.writeFile(file, 'sol');
    const write = filesystem.writeFile.bind(filesystem);
    vi.spyOn(filesystem, 'writeFile').mockImplementation(async (path, data) => {
      await write(path, data);
      if (path.startsWith(`${file}.`) && path.endsWith('.partial')) {
        /* The other tab's store lands, whole, between this one's two looks. */
        await write(file, parts[0]![1]!);
      }
    });
    const unlinks = vi.spyOn(filesystem, 'unlink');

    const read = await port.readTree(head);

    expect(read?.get(parts[0]![0]!)).toStrictEqual(encoder.encode(parts[0]![1]));
    expect(unlinks.mock.calls.map(([path]) => path).filter((path) => !path.endsWith('.partial'))).toStrictEqual([]);
    expect(await filesystem.readdir(file.slice(0, file.lastIndexOf('/')))).toStrictEqual([oidOf(parts[0]![1]!)]);
  });

  it("keeps the other writer's whole copy when it loses the rename", async () => {
    const { port, head, evict, filesystem } = await lfsStore();
    await evict(parts[0]![1]!);
    const file = `.git/${lfsObjectPath(oidOf(parts[0]![1]!))}`;
    const rename = filesystem.rename.bind(filesystem);
    vi.spyOn(filesystem, 'rename').mockImplementation(async (from, to) => {
      if (to === file) {
        await filesystem.writeFile(to, parts[0]![1]!);
        throw Object.assign(new Error('EEXIST: file already exists'), { code: 'EEXIST' });
      }
      return rename(from, to);
    });

    const read = await port.readTree(head);

    expect(read?.get(parts[0]![0]!)).toStrictEqual(encoder.encode(parts[0]![1]));
    expect(await filesystem.readdir(file.slice(0, file.lastIndexOf('/')))).toStrictEqual([oidOf(parts[0]![1]!)]);
  });

  it('shares one download between two readers of the same tree', async () => {
    const { port, head, asked, transfer, evict } = await lfsStore();
    await evict(...parts.map(([, content]) => content!));
    const [first, second] = await Promise.all([port.readTree(head), port.readTree(head)]);
    expect(first?.get(parts[1]![0]!)).toStrictEqual(encoder.encode(parts[1]![1]));
    expect(second?.get(parts[1]![0]!)).toStrictEqual(encoder.encode(parts[1]![1]));
    expect(asked).toHaveLength(1);
    expect(transfer).toHaveBeenCalledTimes(parts.length);
  });

  /* I10, S4: a read-through that joins the fill's download hears its bytes arrive, and the object downloads once. */
  it('tells a reader that joined a download as its bytes arrive, downloading the object once', async () => {
    const { port, head, transfer, evict } = await lfsStore();
    await evict(...parts.map(([, content]) => content!));
    const { pointer } = lfsPointerFor(encoder.encode(parts[0]![1]));
    const progress = vi.fn();
    const [tree, fetched] = await Promise.all([
      port.readTree(head),
      port.fetchLargeObjects!([pointer], { onTransferProgress: progress }),
    ]);
    expect(fetched.get(pointer.oid)).toStrictEqual(encoder.encode(parts[0]![1]));
    expect(tree?.get(parts[0]![0]!)).toStrictEqual(encoder.encode(parts[0]![1]));
    expect(transfer).toHaveBeenCalledTimes(parts.length);
    expect(progress).toHaveBeenCalledWith(pointer.oid);
  });

  it("fetches for itself what another reader's failed download did not deliver", async () => {
    const { port, head, transfer, evict } = await lfsStore();
    await evict(...parts.map(([, content]) => content!));
    const failing = oidOf(parts[0]![1]!);
    let refusals = 0;
    const deliver = transfer.getMockImplementation()!;
    transfer.mockImplementation(async (url, init) => {
      if ((typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).endsWith(failing) && refusals < 2) {
        refusals += 1;
        return new Response('', { status: 404 });
      }
      return deliver(url, init);
    });
    const settled = await Promise.allSettled([port.readTree(head), port.readTree(head)]);
    /* Which reader starts the shared transfer depends on how their local scans interleave, so either may be the one that fails. */
    const failed = settled.filter((result) => result.status === 'rejected');
    const read = settled.find(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof port.readTree>>> =>
        result.status === 'fulfilled',
    );
    expect(failed).toHaveLength(1);
    expect(read?.value?.get(parts[0]![0]!)).toStrictEqual(encoder.encode(parts[0]![1]));
  });

  it('fails closed, with no pointer in the tree, when there is no remote to ask', async () => {
    const filesystem = new MemoryProvider();
    providers.push(filesystem);
    const port = createIsomorphicGitRevisionPort({ filesystem });
    await port.init({ author });
    const receipt = await port.writeRevision({
      parents: [],
      tree: partTree(),
      provenance,
      summary: { generated: 'Parts' },
    });
    await filesystem.unlink(`.git/${lfsObjectPath(oidOf(parts[0]![1]!))}`);
    await expect(port.readTree(revisionId(receipt.commitId))).rejects.toMatchObject({ code: 'MISSING_LARGE_OBJECT' });
  });

  /* Open first, model waits: the checkout is written from this store alone, and the rest are filled as they land. */
  it('answers a local read from this store alone, leaving a missing object its pointer', async () => {
    const { port, head, asked, transfer, evict } = await lfsStore();
    await evict(parts[0]![1]!);
    const read = await port.readTree(head, { largeObjects: 'local' });
    expect(read?.get(parts[0]![0]!)).toStrictEqual(lfsPointerFor(encoder.encode(parts[0]![1])).bytes);
    expect(read?.get(parts[1]![0]!)).toStrictEqual(encoder.encode(parts[1]![1]));
    expect(read?.get('main.scad')).toStrictEqual(encoder.encode('cube(1);\n'));
    expect(asked).toStrictEqual([]);
    expect(transfer).not.toHaveBeenCalled();
  });

  /* R5: a reader that wants one file reads one file, not every blob and every large object. */
  it('reads only the named paths, and leaves out what is missing or a directory', async () => {
    const { port, head, asked, transfer, evict } = await lfsStore();
    await evict(parts[0]![1]!, parts[1]![1]!);
    const read = await port.readTree(head, {
      largeObjects: 'local',
      paths: ['main.scad', parts[2]![0]!, parts[0]![0]!, 'models', 'missing.json', 'main.scad/inner'],
    });
    expect(read?.entries().map(({ path }) => path)).toStrictEqual(
      [parts[0]![0]!, parts[2]![0]!, 'main.scad'].toSorted(),
    );
    expect(read?.get('main.scad')).toStrictEqual(encoder.encode('cube(1);\n'));
    expect(read?.get(parts[2]![0]!)).toStrictEqual(encoder.encode(parts[2]![1]));
    expect(read?.get(parts[0]![0]!)).toStrictEqual(lfsPointerFor(encoder.encode(parts[0]![1])).bytes);
    expect(asked).toStrictEqual([]);
    expect(transfer).not.toHaveBeenCalled();
    /* A fetching read of a subset fetches only that subset's large objects. */
    const fetched = await port.readTree(head, { paths: [parts[0]![0]!] });
    expect(fetched?.get(parts[0]![0]!)).toStrictEqual(encoder.encode(parts[0]![1]));
    expect(asked).toStrictEqual([[oidOf(parts[0]![1]!)]]);
  });

  it('tells a fetching read about each object as it lands', async () => {
    const { port, head, evict } = await lfsStore();
    await evict(parts[0]![1]!, parts[2]![1]!);
    const landed: Array<[string, string]> = [];
    await port.readTree(head, {
      onLargeObject: (oid, content) => landed.push([oid, new TextDecoder().decode(content)]),
    });
    expect(landed).toHaveLength(2);
    expect(landed).toStrictEqual(
      expect.arrayContaining([
        [oidOf(parts[0]![1]!), parts[0]![1]],
        [oidOf(parts[2]![1]!), parts[2]![1]],
      ]),
    );
  });

  /* D10: the fill names an opened path's object, and the read asks for it before the rest. */
  it('asks for the objects a fetching read names first before the others', async () => {
    const { port, head, asked, evict } = await lfsStore();
    await evict(parts[0]![1]!, parts[2]![1]!);
    const first = new Set([oidOf(parts[2]![1]!)]);
    await port.readTree(head, { firstLargeObjects: () => first });
    expect(asked).toStrictEqual([[oidOf(parts[2]![1]!)], [oidOf(parts[0]![1]!)]]);
  });

  it('tells a second reader about an object the first reader is fetching', async () => {
    const { port, head, asked, transfer, evict } = await lfsStore();
    await evict(parts[1]![1]!);
    /* The transfer is held until both readers have scanned, so the second finds it in flight rather than stored. */
    const deliver = transfer.getMockImplementation()!;
    transfer.mockImplementation(async (url, init) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      return deliver(url, init);
    });
    const landed: string[] = [];
    await Promise.all([port.readTree(head), port.readTree(head, { onLargeObject: (oid) => landed.push(oid) })]);
    expect(asked).toHaveLength(1);
    expect(landed).toStrictEqual([oidOf(parts[1]![1]!)]);
  });

  it('treats a stored object cut short as missing, and stores the fetched one whole', async () => {
    const { port, head, asked, filesystem } = await lfsStore();
    const [path, content] = parts[0]! as [string, string];
    const file = `.git/${lfsObjectPath(oidOf(content))}`;
    await filesystem.writeFile(file, encoder.encode(content).slice(0, 3));
    const local = await port.readTree(head, { largeObjects: 'local' });
    expect(local?.get(path)).toStrictEqual(lfsPointerFor(encoder.encode(content)).bytes);
    const read = await port.readTree(head);
    expect(read?.get(path)).toStrictEqual(encoder.encode(content));
    expect(asked).toStrictEqual([[oidOf(content)]]);
    expect(await filesystem.readFile(file)).toStrictEqual(encoder.encode(content));
    const directory = file.slice(0, file.lastIndexOf('/'));
    const names = await filesystem.readdir(directory);
    expect(names.filter((name) => String(name).includes('.partial'))).toStrictEqual([]);
  });

  it('stops a fetching read when its signal aborts', async () => {
    const { port, head, transfer, evict } = await lfsStore();
    await evict(parts[0]![1]!);
    const deliver = transfer.getMockImplementation()!;
    transfer.mockImplementation(async (url, init) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      init?.signal?.throwIfAborted();
      return deliver(url, init);
    });
    const controller = new AbortController();
    const read = port.readTree(head, { signal: controller.signal });
    controller.abort(new Error('Closing stopped the large-object fill.'));
    await expect(read).rejects.toThrow();
  });
});
