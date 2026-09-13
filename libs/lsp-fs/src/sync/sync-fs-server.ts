import { getErrno } from '@taucad/utils/error';
import type { TauSyncFsWireMessage } from '#sync/sync-fs-protocol.js';
import {
  slotIndex,
  slotInt32Length,
  syncError,
  syncState,
  tauSyncFsWireMessageSchema,
} from '#sync/sync-fs-protocol.js';

const textEncoder = new TextEncoder();

/**
 * Minimal workspace reader for Tier-2 sync FS (implemented by the FM worker).
 *
 * @public
 */
export type SyncFsWorkspaceAdapter = Readonly<{
  readFileBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
  stat(path: string): Promise<{ mtimeMs: number; isDirectory: boolean }>;
  readdir(path: string): Promise<string[]>;
}>;

function finish(int32: Int32Array, errorCode: number, payloadLength: number): void {
  Atomics.store(int32, slotIndex.errorCode, errorCode);
  Atomics.store(int32, slotIndex.payloadLength, payloadLength);
  Atomics.store(int32, slotIndex.state, syncState.ready);
  Atomics.notify(int32, slotIndex.state, 1);
}

type FinishPathPresenceContext = Readonly<{
  workspace: SyncFsWorkspaceAdapter;
  path: string;
  int32: Int32Array;
  arena: Uint8Array<ArrayBuffer>;
  mode: 'file' | 'directory';
}>;

async function finishPathPresenceFromStat(context: FinishPathPresenceContext): Promise<void> {
  const { workspace, path, int32, arena, mode } = context;
  try {
    const stat = await workspace.stat(path);
    const positive = mode === 'file' ? !stat.isDirectory : stat.isDirectory;
    if (!positive) {
      finish(int32, syncError.absent, 0);
      return;
    }
    arena.set(textEncoder.encode('1'), 0);
    finish(int32, syncError.ok, 1);
  } catch (error) {
    if (getErrno(error) === 'ENOENT') {
      finish(int32, syncError.absent, 0);
    } else {
      finish(int32, syncError.ioError, 0);
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

    if (Atomics.load(int32, slotIndex.requestId) !== requestId) {
      finish(int32, syncError.invalidRequest, 0);
      return;
    }

    try {
      switch (op) {
        case 'readFile': {
          const data = await workspace.readFileBytes(path);
          if (data.byteLength > arena.byteLength) {
            finish(int32, syncError.tooLarge, 0);
            return;
          }
          arena.set(data);
          finish(int32, syncError.ok, data.byteLength);
          return;
        }
        case 'fileExists': {
          await finishPathPresenceFromStat({ workspace, path, int32, arena, mode: 'file' });
          return;
        }
        case 'directoryExists': {
          await finishPathPresenceFromStat({ workspace, path, int32, arena, mode: 'directory' });
          return;
        }
        case 'readdir': {
          const names = await workspace.readdir(path);
          const encoded = textEncoder.encode(JSON.stringify(names));
          if (encoded.byteLength > arena.byteLength) {
            finish(int32, syncError.tooLarge, 0);
            return;
          }
          arena.set(encoded);
          finish(int32, syncError.ok, encoded.byteLength);
          return;
        }
        case 'statMtimeVersion': {
          try {
            const stat = await workspace.stat(path);
            if (stat.isDirectory) {
              finish(int32, syncError.isDirectory, 0);
              return;
            }
            const version = String(stat.mtimeMs);
            const encoded = textEncoder.encode(version);
            arena.set(encoded);
            finish(int32, syncError.ok, encoded.byteLength);
          } catch (error) {
            if (getErrno(error) === 'ENOENT') {
              finish(int32, syncError.notFound, 0);
            } else {
              finish(int32, syncError.ioError, 0);
            }
          }
          return;
        }
        default: {
          finish(int32, syncError.invalidRequest, 0);
        }
      }
    } catch (error) {
      if (getErrno(error) === 'ENOENT') {
        finish(int32, syncError.notFound, 0);
        return;
      }
      finish(int32, syncError.ioError, 0);
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
