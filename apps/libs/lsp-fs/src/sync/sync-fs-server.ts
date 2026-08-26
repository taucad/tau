import { getErrno } from '@taucad/utils/error';
import { completeSyncResponse } from '@taucad/fs-bridge/sync';
import type { TauSyncFsWireMessage } from '#sync/sync-fs-protocol.js';
import { slotIndex, slotInt32Length, syncError, tauSyncFsWireMessageSchema } from '#sync/sync-fs-protocol.js';

const textEncoder = new TextEncoder();

/**
 * Minimal workspace reader for Tier-2 sync FS (implemented by the FM worker).
 *
 * @public
 */
export type SyncFsWorkspaceAdapter = Readonly<{
  readFileBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
  stat(path: string): Promise<{ mtimeMs: number; isDirectory: boolean }>;
  listDirectories(path: string): Promise<string[]>;
}>;

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

  return {
    dispose(): void {
      config.port.removeEventListener('message', listener);
    },
  };
}
