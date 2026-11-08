/**
 * One of RM-A22's two workers: an isomorphic-git revision port over this worker's own OPFS
 * provider, under a directory the test names. Each request is one step the test orders across
 * the two workers; the reply is its result or its error message.
 */

import { createActor } from 'xstate';
import type { AnyActorLogic } from 'xstate';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { OPFSProvider } from '@taucad/filesystem/backend';
import {
  createIsomorphicGitRevisionPort,
  generatedGitattributesContent,
  generatedGitattributesPath,
} from '@taucad/revisions';
import type { RevisionPort } from '@taucad/revisions';
import { ImmutableRevisionTree, revisionId } from '@taucad/revisions/algorithms';
import { createRevisionActors } from '@taucad/revisions/revision-effects';
import type { RevisionFileSystem } from '@taucad/revisions/revision-effects';

export type OpfsRequest =
  | Readonly<{ op: 'init'; directory: string }>
  | Readonly<{ op: 'writeRevision'; directory: string; parent: string | undefined; content: string }>
  | Readonly<{ op: 'updateRef'; directory: string; expectedHead: string | undefined; head: string }>
  | Readonly<{ op: 'readRef'; directory: string }>
  | Readonly<{ op: 'writeLease'; directory: string; runId: string }>
  | Readonly<{ op: 'readLeases'; directory: string }>
  | Readonly<{ op: 'applyPointerTree'; directory: string; files: number; surface: PointerTreeSurface }>;

/**
 * What the revision effects apply through: the bare provider, as the revision tests hand one;
 * the worker's rooted view without its batch move, so every file publishes through its own
 * locked rename; or the rooted view as the worker hands it, which publishes every new file in
 * one batch move.
 */
export type PointerTreeSurface = 'provider' | 'rooted-per-file' | 'rooted-bulk';

/** What one cold apply of a pointer-sized tree cost, and what it left. */
export type PointerTreeApplied = Readonly<{
  milliseconds: number;
  files: number;
  matching: number;
  /** Staging or backup siblings the apply left in any directory it wrote. */
  litter: readonly string[];
}>;

/** Any `.tau-staged` or `.tau-backup` sibling, whatever its id. */
const temporarySibling = /\.tau-(?:staged|backup)\./u;

const encoder = new TextEncoder();
const provider = new OPFSProvider();
const ready = provider.initialize();

const portOf = (directory: string): RevisionPort =>
  createIsomorphicGitRevisionPort({ filesystem: provider, gitDirectory: `${directory}/.git` });

/* The records row `writeLease` and `readLeases` use (`revision-effects.ts`), under the test's directory. */
const runsOf = (directory: string): string => `${directory}/.tau/runs`;

/** An OPFS provider whose root is one subdirectory of the origin's, so a checkout can sit at its root. */
class ScopedOpfsProvider extends OPFSProvider {
  private readonly _directory: string;

  public constructor(directory: string) {
    super();
    this._directory = directory;
  }

  public override async initialize(): Promise<void> {
    await super.initialize();
    this._rootHandle = await this._rootHandle.getDirectoryHandle(this._directory, { create: true });
    await this.refresh();
  }
}

/** A large-object pointer's size and shape, unique per index; not a real pointer, so no fill runs. */
const pointerSized = (index: number): string =>
  `version https://example.test/spec/v1\noid sha256:${index.toString(16).padStart(64, '0')}\nsize ${1000 + index}\n`;

/** Run one injected promise actor the way its machine would. */
const runActor = async <Output>(logic: AnyActorLogic, input: unknown): Promise<Output> =>
  new Promise<Output>((resolve, reject) => {
    const running = createActor(logic, { input });
    running.subscribe({
      next: (snapshot: { status: string; output?: unknown; error?: unknown }) => {
        if (snapshot.status === 'done') {
          resolve(snapshot.output as Output);
        } else if (snapshot.status === 'error') {
          reject(snapshot.error instanceof Error ? snapshot.error : new Error(String(snapshot.error)));
        }
      },
      error: (failure: unknown) => {
        reject(failure instanceof Error ? failure : new Error(String(failure)));
      },
    });
    running.start();
  });

/**
 * A cold open's apply: an empty checkout takes a stored tree of `files` pointer-sized files
 * through the revision effects' own `materializeTree`. Only the apply is timed.
 */
const applyPointerTree = async (
  directory: string,
  files: number,
  surface: PointerTreeSurface,
): Promise<PointerTreeApplied> => {
  const checkout = new ScopedOpfsProvider(directory);
  await checkout.initialize();
  const mountTable = new MountTable();
  mountTable.mount('/projects/cold-open', checkout, {
    class: 'authored',
    backend: 'opfs',
    storageRootKey: `opfs:${directory}`,
  });
  const rooted = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  }).createRootedFileSystem('/projects/cold-open', undefined, { placeholders: 'raw' });
  /* The bare-provider row reads its objects through the provider too, as it always has. */
  const port = createIsomorphicGitRevisionPort({ filesystem: surface === 'provider' ? checkout : rooted });
  await port.init({ author: { name: 'Tau', email: 'tau@example.test' }, createSetupFiles: false });
  const paths = Array.from({ length: files }, (_, index) => `models/part-${Math.floor(index / 40)}/${index}.step`);
  const receipt = await port.writeRevision({
    parents: [],
    /* Tau's block names the family, so every part is a large object, as in a Tau-created project (D16). */
    tree: new ImmutableRevisionTree([
      [generatedGitattributesPath, encoder.encode(generatedGitattributesContent(undefined))],
      ...paths.map((path, index) => [path, encoder.encode(pointerSized(index))] as const),
    ]),
    provenance: { source: 'user', actorId: 'cold-open', createdAt: Date.UTC(2026, 10, 4) },
    summary: { generated: 'pointer tree' },
  });
  await port.updateRef({ name: 'stored', expectedHead: undefined, head: revisionId(receipt.commitId) });
  const { bulkMove: _bulkMove, ...perFile } = rooted;
  const surfaces: Record<PointerTreeSurface, RevisionFileSystem> = {
    /* A bare provider: the apply reads and writes only its port methods. */
    provider: Object.create(checkout) as RevisionFileSystem,
    'rooted-per-file': perFile,
    'rooted-bulk': rooted,
  };
  const actors = createRevisionActors({
    port,
    projectId: 'cold-open',
    filesystem: async () => surfaces[surface],
  });

  const started = performance.now();
  await runActor(actors.branch.applySwitch, { projectId: 'cold-open', branch: 'stored', checkoutId: undefined });
  const milliseconds = performance.now() - started;

  const contents = await Promise.all(paths.map(async (path) => checkout.readFile(path, 'utf8')));
  const directories = new Set(['', 'models', ...paths.map((path) => path.slice(0, path.lastIndexOf('/')))]);
  const listings = await Promise.all([...directories].map(async (path) => checkout.readdir(path)));
  return {
    milliseconds,
    files: contents.length,
    matching: contents.filter((content, index) => content === pointerSized(index)).length,
    litter: listings.flat().filter((name) => temporarySibling.test(name)),
  };
};

const handle = async (request: OpfsRequest): Promise<unknown> => {
  await ready;
  switch (request.op) {
    case 'init': {
      await portOf(request.directory).init({
        author: { name: 'Tau', email: 'tau@example.test' },
        createSetupFiles: false,
      });
      return undefined;
    }
    case 'writeRevision': {
      const receipt = await portOf(request.directory).writeRevision({
        parents: request.parent === undefined ? [] : [revisionId(request.parent)],
        tree: new ImmutableRevisionTree([['a.txt', encoder.encode(request.content)]]),
        provenance: { source: 'user', actorId: 'rm-a22', createdAt: Date.UTC(2026, 8, 26) },
        summary: { generated: request.content },
      });
      return receipt.commitId;
    }
    case 'updateRef': {
      const result = await portOf(request.directory).updateRef({
        name: 'main',
        expectedHead: request.expectedHead === undefined ? undefined : revisionId(request.expectedHead),
        head: revisionId(request.head),
      });
      return result.status;
    }
    case 'readRef': {
      return portOf(request.directory).readRef('main');
    }
    case 'writeLease': {
      await provider.mkdir(runsOf(request.directory), { recursive: true });
      await provider.writeFile(
        `${runsOf(request.directory)}/${request.runId}.json`,
        `${JSON.stringify({ runId: request.runId, attempt: 0 })}\n`,
      );
      return undefined;
    }
    case 'applyPointerTree': {
      return applyPointerTree(request.directory, request.files, request.surface);
    }
    case 'readLeases': {
      const runs = runsOf(request.directory);
      if (!(await provider.exists(runs))) {
        return [];
      }
      const entries = await provider.readdir(runs);
      const names = entries.filter((name) => name.endsWith('.json')).toSorted();
      return Promise.all(
        names.map(
          async (name) => (JSON.parse(await provider.readFile(`${runs}/${name}`, 'utf8')) as { runId: string }).runId,
        ),
      );
    }
  }
};

self.addEventListener('message', async (event: MessageEvent<{ id: number; request: OpfsRequest }>) => {
  const { id, request } = event.data;
  try {
    self.postMessage({ id, result: await handle(request) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
