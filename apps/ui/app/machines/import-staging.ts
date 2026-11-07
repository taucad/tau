/**
 * The import channel between the page and the file-manager worker (charter D12).
 *
 * The page hands the worker its source by reference — a dropped zip `File`, a
 * folder's `File`s with their paths, a picked or dropped handle — and never
 * reads a byte of it. The worker plans the import (the zip's central
 * directory by range, the folder's listing, the path policy and the limits),
 * answers the review screen with paths and sizes, and on confirm stages the
 * entries on the creation root: each one decoded and CRC-checked on the
 * compute worker, written once, read back and hashed once on the compute
 * worker (EQ6), recorded in the staging ledger. The project is then
 * committed from that staging by the ordinary pending-create journal, which
 * carries the staging locator, not the bytes.
 *
 * A staging belongs to the session that made it until the page hands it off
 * to a create. The worker holds a lock named for it from the first write until
 * the create has journaled it (or it is removed), so a sweep in any tab can
 * tell a live staging from an abandoned one; on a host without Web Locks it
 * writes a heartbeat beside the staging instead, which the sweep reads. When
 * the session closes (the route unmounts, the review is cancelled) it removes
 * every staging it still owns and has not handed off. What a crash leaves,
 * {@link ImportSession.sweep} removes.
 *
 * @module
 */

import {
  directoryHandleImportSource,
  discardStagedImport,
  fileListImportSource,
  handleListImportSource,
  importStagingLeaseName,
  ImportRefusedError,
  isImportRefusal,
  planImport,
  readImportEntry,
  spoolImportArchive,
  stageImport,
  sweepStagedImports,
  touchStagedImport,
  zipImportSource,
} from '@taucad/filesystem/importer';
import type {
  ImportDecoder,
  ImportMeasurer,
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
  | Readonly<{ kind: 'handles'; handles: readonly FileSystemHandle[] }>
  /**
   * A repository archive the worker downloads itself, so the page never holds
   * it: the Tau API's archive gateway, which GitHub's own archive hosts need
   * because they answer no cross-origin read. No credential travels with it.
   */
  | Readonly<{
      kind: 'archive';
      url: string;
      name: string;
      headers?: Readonly<Record<string, string>>;
      /** The host the archive comes from: a GitHub archive is pinned at its top folder's sha when the gateway names no commit. */
      provider?: 'github';
    }>;

/** How much of an archive download has arrived. @public */
export type ImportDownloadProgress = Readonly<{ loaded: number; total: number }>;

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
 * What a staging run produced: its size, whether the entries were written
 * straight into the project directory (where a move would copy them), and the
 * project directory the create must commit: the one asked for, or the first
 * free name after it (`name-2`…) when something already holds it.
 *
 * @public
 */
export type ImportStaged = Readonly<{ files: number; bytes: number; inPlace: boolean; target: string }>;

/**
 * The page's half of one import.
 *
 * @public
 */
export type ImportSession = Readonly<{
  /**
   * Plan a source. Replaces any earlier plan of this session: a plan still
   * running when a newer one is asked stops, and never becomes the plan.
   * `root` imports only a folder inside it, as the project root; an archive
   * reports its download as it arrives. Aborting `signal` stops the plan in
   * the worker (its download with it) and rejects at once.
   */
  plan: (
    source: ImportSourceDescriptor,
    options?: Readonly<{
      root?: string;
      onDownload?: (progress: ImportDownloadProgress) => void;
      signal?: AbortSignal;
    }>,
  ) => Promise<ImportListing>;
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
  /**
   * Hand a staging to the create that will journal it: the session no longer
   * removes it when it closes, but still holds its lease until {@link release}.
   */
  handOff: (operationId: string) => Promise<void>;
  /** Drop a handed-off staging's lease, once the create's journal row owns it (or nothing will). */
  release: (operationId: string) => Promise<void>;
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
  | Readonly<{ id: number; type: 'plan'; source: ImportSourceDescriptor; root?: string }>
  | Readonly<{ id: number; type: 'stage'; operationId: string; scope: StorageRootConfig; target: string }>
  | Readonly<{ id: number; type: 'handOff'; operationId: string }>
  | Readonly<{ id: number; type: 'release'; operationId: string }>
  | Readonly<{ id: number; type: 'preview'; paths: readonly string[]; maximumBytes: number }>
  | Readonly<{ id: number; type: 'discard'; operationId: string; scope: StorageRootConfig }>
  | Readonly<{ id: number; type: 'sweep'; scope: StorageRootConfig; owned: readonly string[] }>
  | Readonly<{ id: number; type: 'cancel'; close?: boolean; plan?: number }>;

type Answer = Readonly<{
  id: number;
  progress?: ImportStagingProgress;
  downloaded?: ImportDownloadProgress;
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

/**
 * The sentence a refused archive download carries, so the import says why (E14).
 * The archive gateway answers in plain text; API refusals answer `{ error, code }`.
 *
 * @param response - The refused archive response.
 * @returns The server's sentence, or the status when it gave none.
 * @public
 */
export const downloadRefusal = async (response: Response): Promise<string> => {
  const text = await response.text();
  const body = text.trim();
  try {
    const { error } = JSON.parse(body) as { error?: unknown };
    if (typeof error === 'string' && error !== '') {
      return error;
    }
  } catch {
    /* A plain-text sentence from the archive gateway. */
  }
  return body === '' ? `Download failed: ${String(response.status)} ${response.statusText}` : body;
};

/*
 * Download an archive into a Blob in the worker, under the import's archive
 * limit as it arrives: never on the page, never whole in the heap (the
 * browser keeps a large Blob out of it), and sent with no cookie or token.
 */
const downloadArchive = async (
  descriptor: Extract<ImportSourceDescriptor, { kind: 'archive' }>,
  control: Readonly<{ signal: AbortSignal; onDownload: (progress: ImportDownloadProgress) => void }>,
): Promise<Readonly<{ archive: Blob; commit?: string }>> => {
  const url = new URL(descriptor.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError(`An archive downloads over HTTP only: ${url.protocol}`);
  }
  const response = await fetch(url, {
    signal: control.signal,
    credentials: 'omit',
    redirect: 'follow',
    ...(descriptor.headers === undefined ? {} : { headers: { ...descriptor.headers } }),
  });
  if (response.status === 413) {
    await response.body?.cancel();
    throw new ImportRefusedError('archiveTooLarge', {
      message: 'The repository download is larger than the gateway admits.',
    });
  }
  if (!response.ok) {
    throw new Error(await downloadRefusal(response));
  }
  if (response.body === null) {
    throw new Error('The archive download has no body.');
  }
  /* An encoded body's length is not the archive's, so only an unencoded one is held to. */
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  const declaredSize =
    Number.isSafeInteger(declared) && declared > 0 && !response.headers.has('content-encoding') ? declared : undefined;
  const total = declaredSize ?? 0;
  let last = 0;
  let archive: Blob;
  try {
    archive = await spoolImportArchive(response.body, {
      ...(declaredSize === undefined ? {} : { declaredSize }),
      signal: control.signal,
      onProgress: (loaded) => {
        const now = Date.now();
        if (now - last >= 100) {
          last = now;
          control.onDownload({ loaded, total });
        }
      },
    });
  } catch (error) {
    /* A transfer that failed partway (the gateway ends one that spends its hourly allowance with an error) is not damage. */
    if (error instanceof ImportRefusedError || control.signal.aborted) {
      throw error;
    }
    throw new Error(downloadInterrupted, { cause: error });
  }
  control.onDownload({ loaded: archive.size, total: archive.size });
  /* The gateway names the commit it resolved the ref to; anything but 40 hex is no commit. */
  const commit = response.headers.get(importCommitHeader)?.trim().toLowerCase();
  return { archive, ...(commit !== undefined && commitPattern.test(commit) ? { commit } : {}) };
};

/** What an archive download that failed partway says: it may be the gateway's rate limit, not damage. @public */
export const downloadInterrupted =
  'The repository download stopped partway. Tau may be limiting downloads from your network for now: try again later.';

/** The header the archive gateway names the resolved commit in. @public */
export const importCommitHeader = 'X-Tau-Commit';

const commitPattern = /^[0-9a-f]{40}$/u;

/* A GitHub archive's one top folder is `<owner>-<repo>-<short sha>/`. */
const topFolderRevision = (path: string): string | undefined => /^[^/]+-([0-9a-f]{7,40})\//u.exec(path)?.[1];

/*
 * An archive pinned at the commit the gateway named or, when it named none,
 * at the short sha of its top folder, read from the first entry as it lists.
 */
const pinnedArchive = (base: ImportSource, commit: string | undefined, github: boolean): ImportSource => {
  if (commit !== undefined) {
    return { ...base, revision: commit };
  }
  /* Only GitHub names its top folder after the commit. */
  if (!github) {
    return base;
  }
  let revision: string | undefined;
  let seen = false;
  return {
    ...base,
    get revision() {
      return revision;
    },
    async *list(control) {
      for await (const entry of base.list(control)) {
        if (!seen) {
          seen = true;
          revision = topFolderRevision(entry.source);
        }
        yield entry;
      }
    },
  };
};

const sourceOf = async (
  descriptor: ImportSourceDescriptor,
  control: Readonly<{ signal: AbortSignal; onDownload: (progress: ImportDownloadProgress) => void }>,
): Promise<ImportSource> => {
  switch (descriptor.kind) {
    case 'archive': {
      const { archive, commit } = await downloadArchive(descriptor, control);
      return pinnedArchive(
        zipImportSource(archive, { name: descriptor.name, kind: 'archive' }),
        commit,
        descriptor.provider === 'github',
      );
    }
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

/* Stagings some session in this worker is running or holds: live even before, or without, a lock. */
const liveInThisWorker = new Set<string>();

/** Milliseconds between heartbeats, well inside the sweep's still period. */
const heartbeatEvery = 60 * 1000;

/**
 * Hold a live staging's lease until it is released: the lock a sweep in
 * another tab asks about, or, on a host without Web Locks, a heartbeat
 * written beside the staging that a sweep in any worker reads. Releasing
 * stops the heartbeat and waits for one in flight, so none lands after a
 * discard.
 *
 * @param operationId - The staging.
 * @param touch - Write the staging's heartbeat.
 * @returns The release.
 */
export const holdLease = async (operationId: string, touch: () => Promise<void>): Promise<() => Promise<void>> => {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  liveInThisWorker.add(operationId);
  const done = (): void => {
    liveInThisWorker.delete(operationId);
  };
  if (locks === undefined) {
    let beating: Promise<void> = Promise.resolve();
    const beat = async (): Promise<void> => {
      try {
        await touch();
      } catch {
        /* A missed beat is retried by the next one, well inside the still period. */
      }
    };
    const timer = setInterval(() => {
      beating = beat();
    }, heartbeatEvery);
    return async () => {
      clearInterval(timer);
      await beating;
      done();
    };
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
  try {
    await acquired.promise;
  } catch (error) {
    /* No lease, so no live staging: the sweep must not keep treating it as one. */
    done();
    throw error;
  }
  return async () => {
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
    /** The read-back measure: the compute worker's, or inline WebCrypto where there is none. */
    measure?: ImportMeasurer;
    policy: PathPolicy;
  }>,
): void => {
  let plan: ImportPlan | undefined;
  const measuring = dependencies.measure === undefined ? {} : { measure: dependencies.measure };
  /* The newest plan request: only it may become the plan, so a slower earlier one never replaces it. */
  let latestPlan: number | undefined;
  const planning = new Map<number, AbortController>();
  let abort = new AbortController();
  /* What this session staged and still leases; `kept` once handed off, so closing leaves it for its create. */
  const owned = new Map<string, { scope: StorageRootConfig; release: () => Promise<void>; kept: boolean }>();
  const running = new Set<Promise<unknown>>();
  const answer = (message: Answer, transfer: Transferable[] = []): void => {
    port.postMessage(message, transfer);
  };
  const release = async (operationId: string): Promise<void> => {
    const held = owned.get(operationId);
    owned.delete(operationId);
    await held?.release();
  };
  /* A request leaves the running set once it settled (it never rejects: every failure is answered). */
  const forget = async (work: Promise<void>): Promise<void> => {
    await work;
    running.delete(work);
  };
  const planOf = async (request: Extract<Request, { type: 'plan' }>, signal: AbortSignal): Promise<ImportPlan> => {
    const source = await sourceOf(request.source, {
      signal,
      onDownload: (downloaded) => {
        answer({ id: request.id, downloaded });
      },
    });
    return planImport(source, {
      policy: dependencies.policy,
      signal,
      ...(request.root === undefined || request.root === '' ? {} : { root: request.root }),
    });
  };
  /* A plan stops every earlier one still running, and becomes the plan only while no newer one or cancel came. */
  const newestPlan = async (request: Extract<Request, { type: 'plan' }>): Promise<ImportPlan> => {
    latestPlan = request.id;
    for (const earlier of planning.values()) {
      earlier.abort(new Error('A newer import replaced this one.'));
    }
    const own = new AbortController();
    planning.set(request.id, own);
    let planned: ImportPlan;
    try {
      planned = await planOf(request, AbortSignal.any([abort.signal, own.signal]));
    } finally {
      planning.delete(request.id);
    }
    if (latestPlan !== request.id) {
      throw new Error('A newer import replaced this one.');
    }
    return planned;
  };
  /* One plan stops: its download aborts, and it never becomes the plan. */
  const cancelPlan = (id: number): void => {
    planning.get(id)?.abort(new Error('The import was cancelled.'));
    if (latestPlan === id) {
      latestPlan = undefined;
    }
  };
  const run = async (request: Request): Promise<void> => {
    switch (request.type) {
      case 'plan': {
        plan = await newestPlan(request);
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
        const staging = await dependencies.importStaging(request.scope);
        if (!owned.has(request.operationId)) {
          const { operationId } = request;
          const lease = await holdLease(operationId, async () => touchStagedImport(staging, operationId));
          owned.set(operationId, { scope: request.scope, release: lease, kept: false });
        }
        const staged = await stageImport({
          port: staging,
          operationId: request.operationId,
          plan,
          decode: dependencies.decode,
          ...measuring,
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
            target: staged.target ?? request.target,
          } satisfies ImportStaged,
        });
        return;
      }
      case 'handOff': {
        const held = owned.get(request.operationId);
        if (held !== undefined) {
          held.kept = true;
        }
        answer({ id: request.id, result: undefined });
        return;
      }
      case 'release': {
        await release(request.operationId);
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
        /* The heartbeat stops first, so none recreates the staging after it is gone. */
        const lease = owned.get(request.operationId);
        owned.delete(request.operationId);
        await lease?.release();
        await discardStagedImport(await dependencies.importStaging(request.scope), request.operationId);
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
        if (request.plan !== undefined) {
          cancelPlan(request.plan);
          answer({ id: request.id, result: undefined });
          return;
        }
        latestPlan = undefined;
        abort.abort(new Error('The import was cancelled.'));
        abort = new AbortController();
        if (request.close === true) {
          /* Whatever was running stops first, so nothing writes into a staging after it is removed. */
          await Promise.allSettled(running);
          for (const [operationId, { scope, kept }] of owned) {
            // oxlint-disable-next-line no-await-in-loop -- a closing session lets go of its few stagings in turn.
            await release(operationId);
            if (!kept) {
              // oxlint-disable-next-line no-await-in-loop -- one staging is removed at a time.
              await discardStagedImport(await dependencies.importStaging(scope), operationId).catch(() => undefined);
            }
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
      }
    })();
    if (tracked) {
      running.add(work);
      void forget(work);
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
 * create into the folder the staging chose. A create that failed after
 * journaling its staging keeps it for the journal's recovery; any other
 * failure discards it. The staging's lease is held until the create is done,
 * so no sweep removes it before its journal row exists.
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
    create: (staging: Readonly<{ operationId: string; providerBasePath: string }>) => Promise<Created>;
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
    return await input.create({ operationId, providerBasePath: staged.target });
  } catch (error) {
    /* A journal row that names the staging recovers from it later; with none, nothing will commit it. */
    if (!(await input.owns(operationId).catch(() => true))) {
      await session.discard(operationId, target.scope).catch(() => undefined);
    }
    throw error;
  } finally {
    await session.release(operationId).catch(() => undefined);
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
  type Listeners = Readonly<{
    onProgress?: (progress: ImportStagingProgress) => void;
    onDownload?: (progress: ImportDownloadProgress) => void;
  }>;
  const waiting = new Map<number, Readonly<{ call: PromiseWithResolvers<unknown>; listeners: Listeners }>>();
  port.addEventListener('message', (event: MessageEvent<Answer>) => {
    const { id, progress, downloaded, result, error } = event.data;
    const held = waiting.get(id);
    if (held === undefined) {
      return;
    }
    if (progress !== undefined) {
      held.listeners.onProgress?.(progress);
      return;
    }
    if (downloaded !== undefined) {
      held.listeners.onDownload?.(downloaded);
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
  let closed = false;
  const ask = async <Result>(
    request: Request extends infer Each ? (Each extends { id: number } ? Omit<Each, 'id'> : never) : never,
    listeners: Listeners = {},
  ): Promise<Result> => {
    /* A closed port never answers: what is asked after close is refused at once (the close removed the stagings). */
    if (closed) {
      throw new ImportChannelError('The import was closed.');
    }
    const id = next;
    next += 1;
    const call = Promise.withResolvers<unknown>();
    waiting.set(id, { call, listeners });
    port.postMessage({ ...request, id });
    return call.promise as Promise<Result>;
  };
  return Object.freeze({
    plan: async (source, options = {}) => {
      const { signal } = options;
      if (signal?.aborted === true) {
        throw new ImportChannelError('The import was cancelled.');
      }
      const id = next;
      const planned = ask<ImportListing>(
        { type: 'plan', source, ...(options.root === undefined ? {} : { root: options.root }) },
        options.onDownload === undefined ? {} : { onDownload: options.onDownload },
      );
      if (signal === undefined) {
        return planned;
      }
      const cancel = (): void => {
        const held = waiting.get(id);
        if (held === undefined || closed) {
          return;
        }
        waiting.delete(id);
        /* The worker stops the plan and its download; no answer is awaited. */
        port.postMessage({ type: 'cancel', plan: id, id: -1 });
        held.call.reject(new ImportChannelError('The import was cancelled.'));
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        return await planned;
      } finally {
        signal.removeEventListener('abort', cancel);
      }
    },
    stage: async (operationId, scope, { target, onProgress }) =>
      ask<ImportStaged>({ type: 'stage', operationId, scope, target }, onProgress === undefined ? {} : { onProgress }),
    handOff: async (operationId) => ask<undefined>({ type: 'handOff', operationId }),
    release: async (operationId) => ask<undefined>({ type: 'release', operationId }),
    preview: async (paths, maximumBytes) =>
      ask<Record<string, { content: Uint8Array<ArrayBuffer> }>>({ type: 'preview', paths, maximumBytes }),
    discard: async (operationId, scope) => ask<undefined>({ type: 'discard', operationId, scope }),
    sweep: async (scope, owned) => ask<readonly string[]>({ type: 'sweep', scope, owned }),
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
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
