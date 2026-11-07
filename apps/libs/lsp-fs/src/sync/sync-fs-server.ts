import { getErrno } from '@taucad/utils/error';
import { completeSyncResponse } from '@taucad/fs-bridge/sync';
import type { FileStatEntry, IndexChanges } from '@taucad/filesystem';
import type { TauSyncFsWireMessage } from '#sync/sync-fs-protocol.js';
import { toIndexMirrorWireEntry } from '#sync/index-mirror.js';
import type { IndexMirrorWireEntry, TauIndexMirrorMessage } from '#sync/index-mirror.js';
import { slotIndex, slotInt32Length, syncError, tauSyncFsWireMessageSchema } from '#sync/sync-fs-protocol.js';

const textEncoder = new TextEncoder();

/**
 * Minimal workspace reader for Tier-2 sync FS (implemented by the FM worker).
 *
 * @public
 */
export type SyncFsWorkspaceAdapter = Readonly<{
  /**
   * The root's Project Index, when the workspace keeps one (charter D13): the
   * server sends it whole, then its changes after each change set, so the
   * worker's `createIndexMirror` answers presence and versions itself.
   */
  index?: SyncFsIndexSource;
  readFileBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
  stat(path: string): Promise<{ mtimeMs: number; isDirectory: boolean }>;
  listDirectories(path: string): Promise<string[]>;
}>;

/**
 * What the server reads a root's index through: the rooted surface's own
 * `changedSince`, and a watch that fires once per committed change set.
 *
 * @public
 */
export type SyncFsIndexSource = Readonly<{
  /** Every file of the root, from the index: what a `reset` sends. */
  statTree(path: string): Promise<readonly FileStatEntry[]>;
  changedSince(since: number, options?: { epoch?: string }): Promise<IndexChanges>;
  /** Call `onChange` after each change set; returns the unsubscribe. */
  watch(onChange: () => void): () => void;
  /**
   * Root-relative subtrees the index never holds beyond the policy's
   * unwatched rows: its reserved paths and each nested mount below the root.
   * Read again for every message, so a mount added later reaches the mirror
   * with the next one.
   */
  excluded?(): readonly string[];
}>;

/** Milliseconds before the first retry after a failed ask; each further failure doubles it, up to {@link indexMirrorRetryCeiling}. */
const indexMirrorRetryBackoff = 250;
/** Milliseconds: the longest wait between retries. */
const indexMirrorRetryCeiling = 8000;

/**
 * The whole index as one `reset`: every row, and each directory above a file.
 * Rows carry no generation of their own, so each takes the generation the
 * index reported just before the listing; any later change is newer, which is
 * all a mirror version needs. An empty directory is sent where the listing
 * names it.
 */
const resetMessage = (generation: number, rows: readonly FileStatEntry[]): TauIndexMirrorMessage => {
  const directories = new Set<string>();
  const entries: IndexMirrorWireEntry[] = [];
  for (const row of rows) {
    if (row.type === 'dir') {
      directories.add(row.path);
      continue;
    }
    entries.push([row.path, 'f', row.size, row.mtimeMs, generation]);
    for (let at = row.path.indexOf('/'); at !== -1; at = row.path.indexOf('/', at + 1)) {
      directories.add(row.path.slice(0, at));
    }
  }
  for (const directory of directories) {
    entries.push([directory, 'd', 0, 0, generation]);
  }
  return { tau: 'index-mirror', kind: 'reset', generation, entries, removed: [] };
};

/**
 * Keep one worker's index mirror current: the whole index first, then each
 * change the index records, one `changedSince` at a time. A change set that
 * arrives while one is in flight is folded into the next ask, and an answer
 * that cannot say (`rescan`) sends the index whole again. An ask that fails
 * sends `stale`, so the worker's slot answers until a later ask sends the
 * index whole: the feed retries with a doubling backoff, and a change set
 * retries at once. {@link attachSyncFsServer} runs it for a workspace that
 * has an index.
 *
 * @param port - The port the mirror's owner listens on the other end of.
 * @param index - The root's index.
 * @returns Stops the feed.
 * @public
 */
export const feedIndexMirror = (port: Pick<MessagePort, 'postMessage'>, index: SyncFsIndexSource): (() => void) => {
  let since = 0;
  let epoch: string | undefined;
  let running = false;
  let again = false;
  let stopped = false;
  /** Milliseconds before the next retry. */
  let retryBackoff = indexMirrorRetryBackoff;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const post = (message: TauIndexMirrorMessage): void => {
    const excluded = index.excluded?.();
    port.postMessage(excluded === undefined ? message : { ...message, excluded });
  };
  const step = async (): Promise<TauIndexMirrorMessage | undefined> => {
    const changes = epoch === undefined ? undefined : await index.changedSince(since, { epoch });
    if (changes === undefined || changes.rescan === true) {
      /* Where the next ask continues from, taken before the listing so nothing after it is missed. */
      const head = await index.changedSince(0);
      since = head.generation;
      epoch = head.epoch;
      /* An index this session built answers since 0 whole; one loaded from a snapshot cannot, and is listed. */
      return head.rescan === true
        ? resetMessage(head.generation, await index.statTree(''))
        : {
            tau: 'index-mirror',
            kind: 'reset',
            generation: head.generation,
            entries: head.entries.map((entry) => toIndexMirrorWireEntry(entry)),
            removed: [],
          };
    }
    since = changes.generation;
    epoch = changes.epoch;
    return changes.entries.length === 0 && changes.removed.length === 0
      ? undefined
      : {
          tau: 'index-mirror',
          kind: 'changes',
          generation: changes.generation,
          entries: changes.entries.map((entry) => toIndexMirrorWireEntry(entry)),
          removed: changes.removed.map((removal) => removal.path),
        };
  };
  /* Read through a call: a change set sets it while an ask is awaited, which narrowing cannot see. */
  const owed = (): boolean => again;
  const pump = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    if (retry !== undefined) {
      clearTimeout(retry);
      retry = undefined;
    }
    running = true;
    let failed = false;
    try {
      do {
        again = false;
        // oxlint-disable-next-line no-await-in-loop -- one ask at a time; a change set during it asks once more.
        const message = await step();
        if (stopped) {
          return;
        }
        if (message !== undefined) {
          post(message);
        }
      } while (owed());
      retryBackoff = indexMirrorRetryBackoff;
    } catch {
      /* The mirror no longer follows the index: it forgets what it holds and
       * the worker's slot answers every probe until the next ask sends the
       * index whole. */
      failed = true;
      epoch = undefined;
      if (!stopped) {
        post({ tau: 'index-mirror', kind: 'stale', generation: since, entries: [], removed: [] });
      }
    } finally {
      running = false;
    }
    if (stopped) {
      return;
    }
    if (owed()) {
      /* A change set that arrived during a failed ask is still owed one. */
      void pump();
    } else if (failed) {
      const retryDelay = retryBackoff;
      retryBackoff = Math.min(retryBackoff * 2, indexMirrorRetryCeiling);
      retry = setTimeout(() => {
        retry = undefined;
        void pump();
      }, retryDelay);
    }
  };
  const unsubscribe = index.watch(() => {
    void pump();
  });
  void pump();
  return () => {
    stopped = true;
    if (retry !== undefined) {
      clearTimeout(retry);
      retry = undefined;
    }
    unsubscribe();
  };
};

type FinishPathPresenceContext = Readonly<{
  workspace: SyncFsWorkspaceAdapter;
  path: string;
  mode: 'file' | 'directory';
  finish(errorCode: number, payload?: Uint8Array<ArrayBuffer>): void;
}>;

async function finishPathPresenceFromStat(context: FinishPathPresenceContext): Promise<void> {
  const { workspace, path, mode, finish } = context;
  try {
    const stat = await workspace.stat(path);
    const positive = mode === 'file' ? !stat.isDirectory : stat.isDirectory;
    if (!positive) {
      finish(syncError.absent);
      return;
    }
    finish(syncError.ok, textEncoder.encode('1'));
  } catch (error) {
    if (getErrno(error) === 'ENOENT') {
      finish(syncError.absent);
    } else {
      finish(syncError.ioError);
    }
  }
}

/**
 * FM-worker / test helper: handle {@link TauSyncFsWireMessage} asynchronously then signal {@link Atomics}.
 *
 * @public
 */
export function createSyncFsServerHandler(params: {
  workspace: SyncFsWorkspaceAdapter;
  int32: Int32Array;
  arena: Uint8Array<ArrayBuffer>;
}): (message: TauSyncFsWireMessage) => Promise<void> {
  const { workspace, int32, arena } = params;

  return async (message: TauSyncFsWireMessage): Promise<void> => {
    const { op, requestId, path } = message;
    const finish = (errorCode: number, payload?: Uint8Array<ArrayBuffer>): void => {
      completeSyncResponse({ slot: int32, arena, requestId, errorCode, payload });
    };

    if (Atomics.load(int32, slotIndex.requestId) !== requestId) {
      return;
    }

    try {
      switch (op) {
        case 'readFile': {
          const data = await workspace.readFileBytes(path);
          finish(syncError.ok, data);
          return;
        }
        case 'fileExists': {
          await finishPathPresenceFromStat({ workspace, path, mode: 'file', finish });
          return;
        }
        case 'directoryExists': {
          await finishPathPresenceFromStat({ workspace, path, mode: 'directory', finish });
          return;
        }
        case 'listDirectories': {
          const names = await workspace.listDirectories(path);
          const encoded = textEncoder.encode(JSON.stringify(names));
          finish(syncError.ok, encoded);
          return;
        }
        case 'statMtimeVersion': {
          try {
            const stat = await workspace.stat(path);
            if (stat.isDirectory) {
              finish(syncError.isDirectory);
              return;
            }
            const version = String(stat.mtimeMs);
            const encoded = textEncoder.encode(version);
            finish(syncError.ok, encoded);
          } catch (error) {
            if (getErrno(error) === 'ENOENT') {
              finish(syncError.notFound);
            } else {
              finish(syncError.ioError);
            }
          }
          return;
        }
        default: {
          finish(syncError.invalidRequest);
        }
      }
    } catch (error) {
      if (getErrno(error) === 'ENOENT') {
        finish(syncError.notFound);
        return;
      }
      finish(syncError.ioError);
    }
  };
}

/**
 * Subscribe to `port` for Tier-2 sync requests (run on FM worker thread).
 *
 * @public
 */
export function attachSyncFsServer(config: {
  port: MessagePort;
  slotSab: SharedArrayBuffer;
  arenaSab: SharedArrayBuffer;
  workspace: SyncFsWorkspaceAdapter;
  arenaBytes?: number;
}): { dispose(): void } {
  const int32 = new Int32Array(config.slotSab, 0, slotInt32Length);
  const arenaBytes = config.arenaBytes ?? config.arenaSab.byteLength;
  const arena = new Uint8Array(config.arenaSab, 0, arenaBytes) as unknown as Uint8Array<ArrayBuffer>;
  const run = createSyncFsServerHandler({ workspace: config.workspace, int32, arena });

  const listener = (event: MessageEvent): void => {
    const wire = tauSyncFsWireMessageSchema.safeParse(event.data);
    if (!wire.success) {
      return;
    }
    void run(wire.data);
  };
  config.port.addEventListener('message', listener);
  config.port.start();
  const stopMirror =
    config.workspace.index === undefined ? undefined : feedIndexMirror(config.port, config.workspace.index);

  return {
    dispose(): void {
      stopMirror?.();
      config.port.removeEventListener('message', listener);
    },
  };
}
