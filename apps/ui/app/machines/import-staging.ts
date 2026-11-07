/**
 * The import channel between the page and the file-manager worker (charter D12).
 *
 * The page hands the worker its source by reference — a dropped zip `File`, a
 * folder's `File`s with their paths, a picked or dropped handle — and never
 * reads a byte of it. The worker plans the import (the zip's central
 * directory by range, the folder's listing, the path policy and the limits),
 * answers the review screen with paths and sizes, and on confirm stages the
 * entries on the creation root: each one decoded and digested on the compute
 * worker, written once, recorded in the staging ledger. The project is then
 * committed from that staging by the ordinary pending-create journal, which
 * carries the staging locator, not the bytes.
 *
 * A staging belongs to the session that made it until the page hands it off
 * to a create. The worker holds a lock named for it meanwhile, so a sweep in
 * any tab can tell a live staging from an abandoned one, and when the session
 * closes (the route unmounts, the review is cancelled) it removes every
 * staging it still owns. What a crash leaves, {@link ImportSession.sweep}
 * removes.
 *
 * @module
 */

import {
  directoryHandleImportSource,
  discardStagedImport,
  fileListImportSource,
  handleListImportSource,
  importStagingLeaseName,
  isImportRefusal,
  planImport,
  readImportEntry,
  stageImport,
  sweepStagedImports,
  zipImportSource,
} from '@taucad/filesystem/importer';
import type {
  ImportDecoder,
  ImportPlan,
  ImportRefusalReason,
  ImportSource,
  ImportStagingPort,
  ImportStagingProgress,
} from '@taucad/filesystem/importer';
import type { PathPolicy, StorageRootConfig } from '@taucad/filesystem';

/** The message type the file-manager worker answers with an import channel. */
export const importConnectMessageType = 'importConnect';

/**
 * A source as the page hands it over: references only.
 *
 * @public
 */
export type ImportSourceDescriptor =
  | Readonly<{ kind: 'zip'; file: File }>
  | Readonly<{ kind: 'files'; files: ReadonlyArray<Readonly<{ file: File; path: string }>>; name?: string }>
  | Readonly<{ kind: 'directory'; handle: FileSystemDirectoryHandle }>
  | Readonly<{ kind: 'handles'; handles: readonly FileSystemHandle[] }>;

/**
 * What the review screen shows: a name, every kept path with its size, and
 * what was left behind. No bytes.
 *
 * @public
 */
export type ImportListing = Readonly<{
  name: string;
  files: ReadonlyArray<Readonly<{ path: string; size: number }>>;
  bytes: number;
  skipped: ImportPlan['skipped'];
}>;

/**
 * What a staging run produced: its size, and whether the entries were written
 * straight into the project directory (where a move would copy them).
 *
 * @public
 */
export type ImportStaged = Readonly<{ files: number; bytes: number; inPlace: boolean }>;

/**
 * The page's half of one import.
 *
 * @public
 */
export type ImportSession = Readonly<{
  /** Plan a source. Replaces any earlier plan of this session. */
  plan: (source: ImportSourceDescriptor) => Promise<ImportListing>;
  /**
   * Stage the planned source on a durable storage root, resuming a staging of
   * the same source. `target` is the project directory the create will
   * commit, written into directly where the root's rename copies.
   */
  stage: (
    operationId: string,
    scope: StorageRootConfig,
    options: Readonly<{ target: string; onProgress?: (progress: ImportStagingProgress) => void }>,
  ) => Promise<ImportStaged>;
  /** Hand a staging to the create that will journal it: the session no longer removes it when it closes. */
  handOff: (operationId: string) => Promise<void>;
  /** The bytes of some planned files, in the order asked, for the review's preview, up to a byte budget. */
  preview: (
    paths: readonly string[],
    maximumBytes: number,
  ) => Promise<Record<string, { content: Uint8Array<ArrayBuffer> }>>;
  /** Remove a staging that will not be committed. */
  discard: (operationId: string, scope: StorageRootConfig) => Promise<void>;
  /** Remove every staging on a root that no journal row (`owned`) and no live session owns, once it is still. */
  sweep: (scope: StorageRootConfig, owned: readonly string[]) => Promise<readonly string[]>;
  /** Stop whatever runs, remove every staging this session still owns, and close the channel. */
  close: () => void;
}>;

type Request =
  | Readonly<{ id: number; type: 'plan'; source: ImportSourceDescriptor }>
  | Readonly<{ id: number; type: 'stage'; operationId: string; scope: StorageRootConfig; target: string }>
  | Readonly<{ id: number; type: 'handOff'; operationId: string }>
  | Readonly<{ id: number; type: 'preview'; paths: readonly string[]; maximumBytes: number }>
  | Readonly<{ id: number; type: 'discard'; operationId: string; scope: StorageRootConfig }>
  | Readonly<{ id: number; type: 'sweep'; scope: StorageRootConfig; owned: readonly string[] }>
  | Readonly<{ id: number; type: 'cancel'; close?: boolean }>;

type Answer = Readonly<{
  id: number;
  progress?: ImportStagingProgress;
  result?: unknown;
  error?: Readonly<{ message: string; reason?: ImportRefusalReason }>;
}>;

/**
 * An import the worker refused, with the policy's reason when it had one.
 *
 * @public
 */
export class ImportChannelError extends Error {
  public override readonly name = 'ImportChannelError';

  /** The policy's reason, when the limits or path policy refused. */
  public readonly reason: ImportRefusalReason | undefined;

  /**
   * Carry a worker's refusal to the page.
   *
   * @param message - The worker's sentence.
   * @param reason - The policy's reason, when there is one.
   */
  public constructor(message: string, reason?: ImportRefusalReason) {
    super(message);
    this.reason = reason;
  }
}

const sourceOf = (descriptor: ImportSourceDescriptor): ImportSource => {
  switch (descriptor.kind) {
    case 'zip': {
      return zipImportSource(descriptor.file);
    }
    case 'files': {
      return fileListImportSource(descriptor.files, descriptor.name === undefined ? {} : { name: descriptor.name });
    }
    case 'directory': {
      return directoryHandleImportSource(descriptor.handle);
    }
    case 'handles': {
      return handleListImportSource(descriptor.handles);
    }
  }
};

/* Stagings some session in this worker is running or holds, for a host with no Web Locks. */
const liveInThisWorker = new Set<string>();

/* The lock a live staging holds until it is handed off or removed: what tells a sweep in another tab it is alive. */
const holdLease = async (operationId: string): Promise<() => void> => {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  liveInThisWorker.add(operationId);
  const done = (): void => {
    liveInThisWorker.delete(operationId);
  };
  if (locks === undefined) {
    return done;
  }
  const acquired = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  // async-iife: bootstrap -- the lock is held until `released`; a refusal to grant it rejects `acquired`.
  void (async (): Promise<void> => {
    try {
      await locks.request(importStagingLeaseName(operationId), async () => {
        acquired.resolve();
        await released.promise;
      });
    } catch (error) {
      acquired.reject(error);
    }
  })();
  await acquired.promise;
  return () => {
    done();
    released.resolve();
  };
};

/* Every staging a live session holds, in any tab: the held leases, and this worker's own. */
const liveOperations = async (): Promise<ReadonlySet<string>> => {
  const live = new Set(liveInThisWorker);
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks !== undefined) {
    const prefix = importStagingLeaseName('');
    const { held = [], pending = [] } = await locks.query();
    for (const { name } of [...held, ...pending]) {
      if (name?.startsWith(prefix) === true) {
        live.add(name.slice(prefix.length));
      }
    }
  }
  return live;
};

/**
 * Serve one import channel in the file-manager worker.
 *
 * @param port - The page's channel.
 * @param dependencies - The staging port of a storage root, the compute
 *   worker's decode, and the path policy the project classifies with.
 * @public
 */
export const serveImportChannel = (
  port: MessagePort,
  dependencies: Readonly<{
    importStaging: (scope: StorageRootConfig) => Promise<ImportStagingPort>;
    decode: ImportDecoder;
    policy: PathPolicy;
  }>,
): void => {
  let plan: ImportPlan | undefined;
  let abort = new AbortController();
  /* What this session staged and has not handed off: removed when it closes. */
  const owned = new Map<string, Readonly<{ scope: StorageRootConfig; release: () => void }>>();
  const running = new Set<Promise<unknown>>();
  const answer = (message: Answer, transfer: Transferable[] = []): void => {
    port.postMessage(message, transfer);
  };
  const release = (operationId: string): void => {
    owned.get(operationId)?.release();
    owned.delete(operationId);
  };
  const run = async (request: Request): Promise<void> => {
    switch (request.type) {
      case 'plan': {
        plan = await planImport(sourceOf(request.source), { policy: dependencies.policy, signal: abort.signal });
        answer({
          id: request.id,
          result: {
            name: plan.name,
            files: plan.entries.map(({ path, size }) => ({ path, size })),
            bytes: plan.bytes,
            skipped: plan.skipped,
          } satisfies ImportListing,
        });
        return;
      }
      case 'stage': {
        if (plan === undefined) {
          throw new Error('Nothing is planned to stage.');
        }
        if (!owned.has(request.operationId)) {
          owned.set(request.operationId, { scope: request.scope, release: await holdLease(request.operationId) });
        }
        const staged = await stageImport({
          port: await dependencies.importStaging(request.scope),
          operationId: request.operationId,
          plan,
          decode: dependencies.decode,
          target: request.target,
          signal: abort.signal,
          onProgress: (progress) => {
            answer({ id: request.id, progress });
          },
        });
        answer({
          id: request.id,
          result: {
            files: staged.entries.length,
            bytes: staged.bytes,
            inPlace: staged.inPlace !== undefined,
          } satisfies ImportStaged,
        });
        return;
      }
      case 'handOff': {
        release(request.operationId);
        answer({ id: request.id, result: undefined });
        return;
      }
      case 'preview': {
        /* In the order asked, so the budget reaches what the page wants first; read, never hashed. */
        const byPath = new Map((plan?.entries ?? []).map((entry) => [entry.path, entry]));
        const files: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
        let budget = request.maximumBytes;
        for (const path of new Set(request.paths)) {
          const entry = byPath.get(path);
          if (entry !== undefined && entry.size <= budget) {
            budget -= entry.size;
            // oxlint-disable-next-line no-await-in-loop -- a preview reads its few files one after another.
            files[path] = { content: await readImportEntry(entry.request, { signal: abort.signal }) };
          }
        }
        answer(
          { id: request.id, result: files },
          Object.values(files).map(({ content }) => content.buffer),
        );
        return;
      }
      case 'discard': {
        await discardStagedImport(await dependencies.importStaging(request.scope), request.operationId);
        release(request.operationId);
        answer({ id: request.id, result: undefined });
        return;
      }
      case 'sweep': {
        const { removed } = await sweepStagedImports({
          port: await dependencies.importStaging(request.scope),
          owned: new Set(request.owned),
          held: await liveOperations(),
        });
        answer({ id: request.id, result: removed });
        return;
      }
      case 'cancel': {
        abort.abort(new Error('The import was cancelled.'));
        abort = new AbortController();
        if (request.close === true) {
          /* Whatever was running stops first, so nothing writes into a staging after it is removed. */
          await Promise.allSettled(running);
          for (const [operationId, { scope }] of owned) {
            // oxlint-disable-next-line no-await-in-loop -- a closing session removes its few stagings in turn.
            await discardStagedImport(await dependencies.importStaging(scope), operationId).catch(() => undefined);
            release(operationId);
          }
          port.close();
          return;
        }
        answer({ id: request.id, result: undefined });
      }
    }
  };
  port.addEventListener('message', (event: MessageEvent<Request>) => {
    const request = event.data;
    const tracked = request.type !== 'cancel';
    // async-iife: bootstrap -- every outcome is answered on the port, and a closing session awaits what runs.
    const work: Promise<void> = (async (): Promise<void> => {
      try {
        await run(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const reason = isImportRefusal(error) ? (error as { reason?: ImportRefusalReason }).reason : undefined;
        answer({ id: request.id, error: { message, ...(reason === undefined ? {} : { reason }) } });
      } finally {
        running.delete(work);
      }
    })();
    if (tracked) {
      running.add(work);
    }
  });
  port.start();
};

/**
 * Where an import will be created, as the project manager resolves it.
 *
 * @public
 */
export type ImportCreationTarget<Location> = Readonly<{
  location: Location;
  scope: StorageRootConfig;
  providerBasePath: string;
  owned: readonly string[];
}>;

/**
 * Stage a planned import and create its project from the staging, removing
 * the staging on every path that will not commit it: a sweep of what earlier
 * imports on the root left first, then the staging, the hand-off, and the
 * create. A create that failed after journaling its staging keeps it for the
 * journal's recovery; any other failure discards it.
 *
 * @param input - The session, the resolved target, a fresh operation id, the
 *   create (given the staging locator), whether the journal owns a staging,
 *   and a progress callback.
 * @returns What the create returned.
 * @public
 */
export const createFromStagedImport = async <Location, Created>(
  input: Readonly<{
    session: ImportSession;
    target: ImportCreationTarget<Location>;
    operationId: string;
    create: (staging: Readonly<{ operationId: string; providerBasePath?: string }>) => Promise<Created>;
    owns: (operationId: string) => Promise<boolean>;
    onProgress?: (progress: ImportStagingProgress) => void;
  }>,
): Promise<Created> => {
  const { session, target, operationId } = input;
  await session.sweep(target.scope, target.owned).catch(() => undefined);
  let staged: ImportStaged;
  try {
    staged = await session.stage(operationId, target.scope, {
      target: target.providerBasePath,
      ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
    });
    await session.handOff(operationId);
  } catch (error) {
    await session.discard(operationId, target.scope).catch(() => undefined);
    throw error;
  }
  try {
    return await input.create({
      operationId,
      ...(staged.inPlace ? { providerBasePath: target.providerBasePath } : {}),
    });
  } catch (error) {
    /* A journal row that names the staging recovers from it later; with none, nothing will commit it. */
    if (!(await input.owns(operationId).catch(() => true))) {
      await session.discard(operationId, target.scope).catch(() => undefined);
    }
    throw error;
  }
};

/**
 * Open an import channel to the file-manager worker.
 *
 * @param worker - The file-manager worker.
 * @returns The page's half of the session.
 * @public
 */
export const openImportSession = (worker: Pick<Worker, 'postMessage'>): ImportSession => {
  const channel = new MessageChannel();
  worker.postMessage({ type: importConnectMessageType, port: channel.port1 }, [channel.port1]);
  const { port2: port } = channel;
  let next = 0;
  const waiting = new Map<
    number,
    Readonly<{ call: PromiseWithResolvers<unknown>; onProgress?: (progress: ImportStagingProgress) => void }>
  >();
  port.addEventListener('message', (event: MessageEvent<Answer>) => {
    const { id, progress, result, error } = event.data;
    const held = waiting.get(id);
    if (held === undefined) {
      return;
    }
    if (progress !== undefined) {
      held.onProgress?.(progress);
      return;
    }
    waiting.delete(id);
    if (error === undefined) {
      held.call.resolve(result);
    } else {
      held.call.reject(new ImportChannelError(error.message, error.reason));
    }
  });
  port.start();
  const ask = async <Result>(
    request: Request extends infer Each ? (Each extends { id: number } ? Omit<Each, 'id'> : never) : never,
    onProgress?: (progress: ImportStagingProgress) => void,
  ): Promise<Result> => {
    const id = next;
    next += 1;
    const call = Promise.withResolvers<unknown>();
    waiting.set(id, { call, ...(onProgress === undefined ? {} : { onProgress }) });
    port.postMessage({ ...request, id });
    return call.promise as Promise<Result>;
  };
  return Object.freeze({
    plan: async (source) => ask<ImportListing>({ type: 'plan', source }),
    stage: async (operationId, scope, { target, onProgress }) =>
      ask<ImportStaged>({ type: 'stage', operationId, scope, target }, onProgress),
    handOff: async (operationId) => ask<undefined>({ type: 'handOff', operationId }),
    preview: async (paths, maximumBytes) =>
      ask<Record<string, { content: Uint8Array<ArrayBuffer> }>>({ type: 'preview', paths, maximumBytes }),
    discard: async (operationId, scope) => ask<undefined>({ type: 'discard', operationId, scope }),
    sweep: async (scope, owned) => ask<readonly string[]>({ type: 'sweep', scope, owned }),
    close: () => {
      /* The worker removes what this session still owns once what runs has stopped, then closes its end. */
      port.postMessage({ type: 'cancel', close: true, id: -1 });
      for (const [id, held] of waiting) {
        waiting.delete(id);
        held.call.reject(new ImportChannelError('The import was closed.'));
      }
      port.close();
    },
  });
};
