// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';
import {
  createInlineImportDecoder,
  discardStagedImport,
  importControlDirectory,
  importStagingDirectory,
  readStagedImport,
} from '@taucad/filesystem/importer';
import type { ImportStagingPort } from '@taucad/filesystem/importer';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { BatchEntry } from '@taucad/filesystem';
import { ImmutableRevisionTree, revisionId } from '@taucad/revisions/algorithms';
import { RevisionPortError } from '@taucad/revisions';
import type { bootstrapRemoteRevisionStore } from '@taucad/revisions';
import { linkedImportPin, linkedImportPort, stageLinkedImport } from '#machines/import-linked.js';
import type { LinkedImportRequest } from '#machines/import-linked.js';
import {
  ImportChannelError,
  importConnectMessageType,
  openImportSession,
  serveImportChannel,
} from '#machines/import-staging.js';

const author = { name: 'octo', email: '1+octo@users.noreply.github.com' };
const operationId = 'req_linked';

const request: LinkedImportRequest = {
  name: 'octo/design',
  apiBaseUrl: 'https://api.tau.test',
  origin: 'https://github.com',
  repositoryUrl: 'https://github.com/octo/design.git',
  authorization: 'Basic eDp0',
  remote: { name: 'github-3', url: 'https://github.com/octo/design.git', provider: 'github', repositoryId: '3' },
  sourceRef: 'refs/heads/main',
  sourceHead: 'a'.repeat(40),
  targetBranch: 'main',
  author,
  setup: {
    files: [],
    provenance: {
      source: 'import',
      actor: { kind: 'user', id: 'tau-user-1' },
      capture: 'save',
      via: 'browser',
      createdAt: Date.UTC(2026, 10, 8),
    },
    summary: { generated: 'Set up this repository as a Tau project' },
  },
};

const removeTree = async (provider: MemoryProvider, path: string): Promise<void> => {
  const stat = await provider.stat(path);
  if (stat.type === 'dir') {
    for (const name of await provider.readdir(path)) {
      // oxlint-disable-next-line no-await-in-loop -- a test tree is removed depth first.
      await removeTree(provider, `${path}/${name}`);
    }
    await provider.rmdir(path);
    return;
  }
  await provider.unlink(path);
};

const portOf = (provider: MemoryProvider): ImportStagingPort => ({
  provider,
  apply: async (entries: readonly BatchEntry[]): Promise<Array<{ outcome: 'applied' }>> => {
    for (const entry of entries) {
      if (entry.op === 'write') {
        // oxlint-disable-next-line no-await-in-loop -- a test port writes in order.
        await provider.writeFile(entry.path, entry.data as Uint8Array<ArrayBuffer>);
      } else if (entry.op === 'delete') {
        // oxlint-disable-next-line no-await-in-loop -- a test port removes in order.
        await removeTree(provider, entry.path);
      }
    }
    return entries.map(() => ({ outcome: 'applied' }));
  },
});

const fetched = new ImmutableRevisionTree([
  ['main.scad', 'cube(1);'],
  ['bin/run.sh', '#!/bin/sh\n', '100755'],
  ['tau.json', '{}'],
  ['.tau/workbench/layout.json', '{"panes":[]}'],
]);

/*
 * What a fetch leaves in the store, without a network: the revisions port
 * the import fetches through records the reviewed tree and points the target
 * branch at it, as `bootstrapRemoteRevisionStore` does after its fetch.
 */
const offlineBootstrap = vi.fn(
  async (
    input: Parameters<typeof bootstrapRemoteRevisionStore>[0],
  ): ReturnType<typeof bootstrapRemoteRevisionStore> => {
    await input.port.init({ author: input.author, createSetupFiles: false });
    await input.port.setRemote(input.remote);
    const receipt = await input.port.writeRevision({
      parents: [],
      tree: fetched,
      provenance: input.setup!.provenance,
      summary: input.setup!.summary,
    });
    const head = revisionId(receipt.commitId);
    await input.port.updateRef({ name: input.targetBranch, expectedHead: undefined, head });
    await input.port.setHead(input.targetBranch);
    return { head, tree: fetched };
  },
);

const gitBlobOid = (content: string): string =>
  createHash('sha1')
    .update(`blob ${String(Buffer.byteLength(content))}\0`)
    .update(content)
    .digest('hex');

const stage = async (provider: MemoryProvider) => {
  const port = portOf(provider);
  const opened: Array<ReturnType<typeof linkedImportPort>> = [];
  const staged = await stageLinkedImport({
    port,
    operationId,
    request,
    target: 'design',
    decode: createInlineImportDecoder(),
    policy: tauPathPolicy,
    revisions: (gitDirectory) => {
      const revisions = linkedImportPort({ provider, gitDirectory, request });
      opened.push(revisions);
      return revisions;
    },
    bootstrap: offlineBootstrap,
  });
  return { staged, revisions: opened[0]! };
};

const rootThat = (movesInPlace: boolean): MemoryProvider => {
  const provider = new MemoryProvider();
  Object.defineProperty(provider, 'capabilities', { value: { ...provider.capabilities, movesInPlace } });
  return provider;
};
/* A root where a rename is a metadata operation (OPFS, Node): an import stages to move there. */
const movingRoot = (): MemoryProvider => rootThat(true);
/* A root where a rename copies (a picked folder, IndexedDB): an import writes in place there. */
const copyingRoot = (): MemoryProvider => rootThat(false);

describe('a linked import in the worker (D12, I6)', () => {
  it("should write the repository's store into the staging's control directory, never the project or the page", async () => {
    const provider = movingRoot();

    const { revisions } = await stage(provider);

    const control = importControlDirectory(operationId);
    expect(new TextDecoder().decode(await provider.readFile(`${control}/HEAD`))).toBe('ref: refs/heads/main\n');
    expect(await provider.exists(`${control}/objects`)).toBe(true);
    expect(await provider.exists('.git')).toBe(false);
    expect(await provider.exists('design/.git')).toBe(false);
    /* The fetched revision is readable from the staged store. */
    const head = await revisions.readRef('main');
    expect(head).toBeDefined();
    const read = await revisions.readTree(head!);
    expect(read?.entries().map(({ path }) => path)).toEqual(fetched.entries().map(({ path }) => path));
  });

  it('should stage the fetched tree with its modes and facts measured from the read-back, leaving tau.json to the commit', async () => {
    const provider = movingRoot();

    const { staged } = await stage(provider);

    expect(staged.pin).toStrictEqual(linkedImportPin(request));
    expect(staged.entries.map(({ path }) => path).toSorted()).toEqual([
      '.tau/workbench/layout.json',
      'bin/run.sh',
      'main.scad',
    ]);
    const main = staged.entries.find(({ path }) => path === 'main.scad');
    /* The read-back's blob id is the id the fetched revision records for the file. */
    expect(main?.facts.blobOid).toBe(gitBlobOid('cube(1);'));
    expect(staged.entries.find(({ path }) => path === 'bin/run.sh')?.mode).toBe('100755');
    expect(new TextDecoder().decode(await provider.readFile(`${staged.tree}/main.scad`))).toBe('cube(1);');
    /* The control directory survives the tree's own staging run. */
    expect(await provider.exists(`${importControlDirectory(operationId)}/HEAD`)).toBe(true);
    const recorded = await readStagedImport(provider, operationId);
    expect(recorded?.entries).toHaveLength(3);
  });

  it("should fetch straight into the in-place folder's .git where a rename would copy, so no pack is copied", async () => {
    const provider = copyingRoot();

    const { staged, revisions } = await stage(provider);

    expect(staged.inPlace).toBe('design');
    expect(new TextDecoder().decode(await provider.readFile('design/.git/HEAD'))).toBe('ref: refs/heads/main\n');
    expect(await provider.exists(importControlDirectory(operationId))).toBe(false);
    expect(await revisions.readRef('main')).toBeDefined();
    /* The folder's files are the import's, beside the store, and the ledger does not name `.git`. */
    expect(new TextDecoder().decode(await provider.readFile('design/main.scad'))).toBe('cube(1);');
    expect(staged.entries.some(({ path }) => path.startsWith('.git'))).toBe(false);
  });

  it('should take an in-place .git with the folder when the staging is discarded', async () => {
    const provider = copyingRoot();
    await stage(provider);

    await discardStagedImport(portOf(provider), operationId);

    expect(await provider.exists('design')).toBe(false);
    expect(await provider.exists(importStagingDirectory(operationId))).toBe(false);
  });

  it('should claim the staging under the pin before the fetch writes into it', async () => {
    const provider = new MemoryProvider();
    const seen: boolean[] = [];
    offlineBootstrap.mockImplementationOnce(async () => {
      seen.push(await provider.exists(`${importStagingDirectory(operationId)}/intent.json`));
      throw new RevisionPortError('REMOTE_REF_CONFLICT', 'The selected GitHub branch changed.');
    });

    await expect(stage(provider)).rejects.toThrow('The selected GitHub branch changed.');

    expect(seen).toEqual([true]);
    const claimed = await readStagedImport(provider, operationId);
    expect(claimed?.pin).toStrictEqual(linkedImportPin(request));
  });
});

describe('a linked import over the import channel', () => {
  const connect = (provider: MemoryProvider, stageLinked?: Parameters<typeof serveImportChannel>[1]['stageLinked']) =>
    openImportSession({
      postMessage: (message: { type: string; port: MessagePort }) => {
        expect(message.type).toBe(importConnectMessageType);
        serveImportChannel(message.port, {
          importStaging: async () => portOf(provider),
          decode: createInlineImportDecoder(),
          policy: tauPathPolicy,
          ...(stageLinked === undefined ? {} : { stageLinked }),
        });
      },
    } as unknown as Pick<Worker, 'postMessage'>);

  it('should stage a linked repository with no plan, through the worker', async () => {
    const provider = new MemoryProvider();
    const session = connect(provider, async (input) =>
      stageLinkedImport({
        ...input,
        revisions: (gitDirectory) => linkedImportPort({ provider: input.port.provider, gitDirectory, request }),
        bootstrap: offlineBootstrap,
      }),
    );

    const staged = await session.stage(operationId, { backend: 'indexeddb' }, { target: 'design', linked: request });
    session.close();

    expect(staged).toMatchObject({ files: 3, target: 'design' });
  });

  it("should carry a fetch's revisions refusal to the page with its code", async () => {
    const provider = new MemoryProvider();
    const session = connect(provider, async () => {
      throw new RevisionPortError('REMOTE_REF_CONFLICT', 'Remote branch main already names another revision.');
    });

    const failure = await session
      .stage(operationId, { backend: 'indexeddb' }, { target: 'design', linked: request })
      .catch((error: unknown) => error);
    session.close();

    expect(failure).toBeInstanceOf(ImportChannelError);
    expect(failure).toMatchObject({
      message: 'Remote branch main already names another revision.',
      code: 'REMOTE_REF_CONFLICT',
    });
  });

  /* The real fetch path: the worker's revisions port, its HTTP client and remote transport, to a network that answers. */
  const fetchingWith = (fetch: typeof globalThis.fetch): Parameters<typeof serveImportChannel>[1]['stageLinked'] => {
    vi.stubGlobal('fetch', fetch);
    return async (input) =>
      stageLinkedImport({
        ...input,
        revisions: (gitDirectory) =>
          linkedImportPort({ provider: input.port.provider, gitDirectory, request: input.request }),
      });
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each<{ status: number; headers: Record<string, string>; code: string }>([
    { status: 401, headers: {}, code: 'REMOTE_REAUTHORIZATION_REQUIRED' },
    /* A live token refused: the repository's access was withdrawn, which no reconnect restores. */
    { status: 403, headers: {}, code: 'REMOTE_FORBIDDEN' },
    {
      status: 403,
      headers: { 'www-authenticate': 'Bearer error="invalid_token"' },
      code: 'REMOTE_REAUTHORIZATION_REQUIRED',
    },
    { status: 404, headers: {}, code: 'REMOTE_NOT_FOUND' },
  ])('should carry a remote that answered $status $headers to the page as $code', async ({ status, headers, code }) => {
    const provider = movingRoot();
    const fetch = vi.fn(async () => new Response('refused', { status, headers }));
    const session = connect(provider, fetchingWith(fetch));

    const failure = await session
      .stage(operationId, { backend: 'indexeddb' }, { target: 'design', linked: request })
      .catch((error: unknown) => error);
    session.close();

    expect(fetch).toHaveBeenCalled();
    expect(failure).toBeInstanceOf(ImportChannelError);
    expect(failure).toMatchObject({ code });
  });

  it("should stop the worker's fetch when the page aborts the stage, and settle once it has stopped", async () => {
    const provider = movingRoot();
    const fetched = Promise.withResolvers<AbortSignal | undefined>();
    const fetch = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          fetched.resolve(init?.signal ?? undefined);
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('The fetch was aborted.', { cause: init.signal?.reason }));
          });
        }),
    );
    const session = connect(provider, fetchingWith(fetch));
    const aborting = new AbortController();

    const staging = session.stage(
      operationId,
      { backend: 'indexeddb' },
      { target: 'design', linked: request, signal: aborting.signal },
    );
    const signal = await fetched.promise;
    aborting.abort();

    await expect(staging).rejects.toBeInstanceOf(ImportChannelError);
    expect(signal?.aborted).toBe(true);
    /* The session lives on: a stage the page cancels is not the session closing. */
    await session.discard(operationId, { backend: 'indexeddb' });
    expect(await provider.exists(importStagingDirectory(operationId))).toBe(false);
    session.close();
  });

  it('should refuse a linked stage in a worker that cannot fetch one', async () => {
    const session = connect(new MemoryProvider());

    await expect(
      session.stage(operationId, { backend: 'indexeddb' }, { target: 'design', linked: request }),
    ).rejects.toThrow('This worker cannot fetch a linked repository.');
    session.close();
  });
});
