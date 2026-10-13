/* oxlint-disable tau-lint/no-direct-indexeddb -- Browser-local channel lifecycle evidence must survive failure of the filesystem channel it diagnoses. Separate bounded store; no portable project content. */
import { metaConfig } from '#constants/meta.constants.js';

/** Metadata only: never pass errors, command payloads, prompts or credentials here. */
export type ChannelDiagnostic = {
  event:
    | 'placement.closed'
    | 'placement.replaced'
    | 'placement.disposed'
    | 'placement.recovery-failed'
    | 'worker.opened'
    | 'worker.closed'
    | 'page.visibility'
    | 'page.hidden'
    | 'page.shown'
    | 'host.opened'
    | 'host.released'
    | 'host.closed';
  tabId: string;
  hostId?: string;
  projectId?: string;
  workerId?: string;
  generation?: number;
  previousGeneration?: number;
  visible?: boolean;
  origin?: 'local' | 'remote' | 'timeout';
  code?: string;
  reason?: string;
};

export type SavedChannelDiagnostic = ChannelDiagnostic & { recordedAt: number; build: string };
const databaseName = `${metaConfig.databasePrefix}channel-diagnostics`;
const storeName = 'events';
const maximumRecords = 200;
/** Milliseconds; diagnostic retention is seven days, with pruning on writes. */
const retentionAge = 7 * 24 * 60 * 60 * 1000;
const knownReasons = new Set([
  'liveness-timeout',
  'hello-timeout',
  'close-timeout',
  'placement session replaced',
  'project host closed',
  'project host released',
  'replacement bridges failed',
]);
const knownCodes = new Set(['CHANNEL_CLOSED', 'PEER_CLOSED', 'PEER_GONE', 'PEER_UNRESPONSIVE']);

// Persist only explicitly selected fields. Unknown remote reasons may contain customer data.
const recordOf = (event: ChannelDiagnostic): SavedChannelDiagnostic => ({
  event: event.event,
  recordedAt: Date.now(),
  build: String(typeof tauBuildId === 'number' ? tauBuildId : 0),
  tabId: event.tabId.slice(0, 128),
  hostId: event.hostId?.slice(0, 128),
  projectId: event.projectId?.slice(0, 128),
  workerId: event.workerId?.slice(0, 128),
  generation: event.generation,
  previousGeneration: event.previousGeneration,
  visible: event.visible,
  origin: event.origin,
  code: event.code === undefined ? undefined : knownCodes.has(event.code) ? event.code : 'other',
  reason: event.reason === undefined ? undefined : knownReasons.has(event.reason) ? event.reason : 'other',
});

const openDatabase = async (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    let blocked = false;
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(storeName, { autoIncrement: true });
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Channel diagnostics request failed.'));
    });
    request.addEventListener('blocked', () => {
      blocked = true;
      reject(new Error('Channel diagnostics storage is blocked.'));
    });
    request.addEventListener('success', () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.addEventListener('versionchange', () => {
        db.close();
      });
      resolve(db);
    });
  });

/** Commit and trim in one transaction, including across page/worker writers. Failure never affects recovery. */
export const saveChannelDiagnostic = async (event: ChannelDiagnostic): Promise<boolean> => {
  const record = recordOf(event);
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const transaction = db.transaction(storeName, 'readwrite');
    const committed = new Promise<boolean>((resolve) => {
      transaction.addEventListener('complete', () => {
        resolve(true);
      });
      transaction.addEventListener('abort', () => {
        resolve(false);
      });
      transaction.addEventListener('error', () => {
        resolve(false);
      });
    });
    const store = transaction.objectStore(storeName);
    store.add(record);
    const keys = store.getAllKeys();
    keys.addEventListener('success', () => {
      for (const key of keys.result.slice(0, -maximumRecords)) {
        store.delete(key);
      }
    });
    const cursor = store.openCursor();
    cursor.addEventListener('success', () => {
      const entry = cursor.result;
      if (entry === null) {
        return;
      }
      const value = entry.value as SavedChannelDiagnostic;
      if (value.recordedAt < record.recordedAt - retentionAge) {
        entry.delete();
      }
      entry.continue();
    });
    return await committed;
  } catch {
    return false;
  } finally {
    db?.close();
  }
};

/** Read bounded local evidence for diagnostics/export; this never contacts a server. */
export const readChannelDiagnostics = async (): Promise<SavedChannelDiagnostic[]> => {
  const db = await openDatabase();
  try {
    return await new Promise<SavedChannelDiagnostic[]>((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.addEventListener('success', () => {
        resolve(request.result as SavedChannelDiagnostic[]);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('Channel diagnostics request failed.'));
      });
    });
  } finally {
    db.close();
  }
};

let warnedUnavailable = false;

/** Non-blocking observation: storage errors must never retry, refuse or hold a paid attempt. */
export const recordChannelDiagnostic = (event: ChannelDiagnostic): void => {
  // async-iife: bootstrap -- a lifecycle callback has no awaiting caller; persistence is independent of recovery.
  void (async () => {
    const saved = await saveChannelDiagnostic(event);
    if (!saved && !warnedUnavailable) {
      warnedUnavailable = true;
      console.warn('[channel-diagnostics] Local lifecycle evidence could not be saved.');
    }
  })();
};
