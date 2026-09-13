import { SharedPool } from '@taucad/memory';
import { joinPath } from '@taucad/utils/path';

import type { SyncFsOp, TauSyncFsWireMessage } from '#sync/sync-fs-protocol.js';
import { slotIndex, slotInt32Length, syncError, syncState } from '#sync/sync-fs-protocol.js';
import { monacoFileUriToWorkspaceRelative } from '#uri.js';

/**
 * Synchronous filesystem shim used from a worker that blocks on {@link Atomics.wait}.
 *
 * @public
 */
export type SyncFsClient = Readonly<{
  /** @returns File text, or `undefined` when missing / unreadable. */
  readFileText(fileName: string): string | undefined;
  fileExists(fileName: string): boolean;
  directoryExists(fileName: string): boolean;
  getDirectories(directoryName: string): string[];
  /** @returns String suitable for {@link ts.LanguageServiceHost.getScriptVersion}. */
  getScriptVersionForPath(fileName: string): string | undefined;
  dispose(): void;
}>;

/**
 * Lifecycle event emitted by {@link createSyncFsClient} for diagnostic
 * tracing of path translation, tier routing (pool vs slot), and slot error codes.
 *
 * @public
 */
export type SyncFsProbe = Readonly<{
  op: SyncFsOp;
  /** Raw input as received from the TS worker host (e.g. a `file://` URI). */
  fileName: string;
  /**
   * Workspace-relative path after {@link monacoFileUriToWorkspaceRelative}.
   * `undefined` when path translation threw (non-`file:` URI, etc.).
   */
  relativePath: string | undefined;
  /**
   * Absolute path on the host filesystem (`joinPath(root, relativePath)`).
   * `undefined` when path translation threw.
   */
  absolutePath: string | undefined;
  /**
   * - `pool`        served from the {@link SharedPool} Tier-0 cache.
   * - `slot`        sent over the SAB slot to the FM worker.
   * - `translation` failed before any tier ran (URI scheme mismatch, etc.).
   */
  tier: 'pool' | 'slot' | 'translation';
  /**
   * - `ok`         success.
   * - `notFound`   slot returned `syncError.notFound`.
   * - `absent`    slot returned `syncError.absent`.
   * - `empty`      slot returned `syncError.ok` with `payloadLength <= 0`.
   * - `error`      slot returned a non-`ok`, non-`notFound`, non-`absent` error code.
   * - `exception`  thrown by `perform` (disposed, stale request, etc.) or path translation.
   */
  outcome: 'ok' | 'notFound' | 'absent' | 'empty' | 'error' | 'exception';
  /** Error code (`syncError.*`) read from the slot for slot-tier outcomes. */
  errorCode?: number;
  /** Bytes returned via the SAB arena (slot tier only). */
  payloadBytes?: number;
  /** Failure detail (`exception` outcome only). */
  detail?: string;
}>;

/**
 * @public
 */
export type CreateSyncFsClientOptions = Readonly<{
  port: MessagePort;
  slotSab: SharedArrayBuffer;
  arenaSab: SharedArrayBuffer;
  filePoolBuffer?: SharedArrayBuffer;
  workspaceRootAbsolute: string;
  /** Optional cap for a single `readFile` / `readdir` payload; default full arena. */
  arenaBytes?: number;
  textDecoder?: TextDecoder;
  /** Optional diagnostic sink invoked once per operation. Bound and bounded by the consumer. */
  onProbe?: (probe: SyncFsProbe) => void;
}>;

type ResolvedTarget = Readonly<{
  relativePath: string | undefined;
  absolutePath: string | undefined;
  translationError: string | undefined;
}>;

/**
 * Worker-side sync client: Tier 0 `SharedPool.resolveCopy` then Tier 2 slot round-trip.
 *
 * @public
 */
export function createSyncFsClient(options: CreateSyncFsClientOptions): SyncFsClient {
  const int32 = new Int32Array(options.slotSab, 0, slotInt32Length);
  const arenaBytes = options.arenaBytes ?? options.arenaSab.byteLength;
  const arena = new Uint8Array(options.arenaSab, 0, arenaBytes);
  const pool = options.filePoolBuffer ? new SharedPool(options.filePoolBuffer) : undefined;
  const decoder = options.textDecoder ?? new TextDecoder();
  const root = options.workspaceRootAbsolute;
  const { onProbe } = options;

  /** Browser `TextDecoder` rejects SAB-backed views; copying into a fresh `Uint8Array` yields a non-shared buffer (VS Code sync-api-common idiom). */
  const decodeArena = (length: number): string => decoder.decode(new Uint8Array(arena.subarray(0, length)));
  let requestId = 0;
  let disposed = false;

  const resolveTarget = (fileName: string): ResolvedTarget => {
    try {
      const relativePath = monacoFileUriToWorkspaceRelative(fileName);
      return { relativePath, absolutePath: joinPath(root, relativePath), translationError: undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { relativePath: undefined, absolutePath: undefined, translationError: message };
    }
  };

  const perform = (op: SyncFsOp, absolutePath: string): void => {
    if (disposed) {
      throw new Error('sync-fs: client disposed');
    }
    const myRequest = ++requestId;
    Atomics.store(int32, slotIndex.state, syncState.pending);
    Atomics.store(int32, slotIndex.requestId, myRequest);
    Atomics.store(int32, slotIndex.errorCode, syncError.ok);
    Atomics.store(int32, slotIndex.payloadLength, 0);

    const message: TauSyncFsWireMessage = { tau: 'sync-fs', op, requestId: myRequest, path: absolutePath };
    options.port.postMessage(message);

    while (Atomics.load(int32, slotIndex.state) === syncState.pending) {
      Atomics.wait(int32, slotIndex.state, syncState.pending);
    }

    if (Atomics.load(int32, slotIndex.requestId) !== myRequest) {
      throw new Error('sync-fs: stale request completion');
    }
  };

  const emitTranslationFailure = (op: SyncFsOp, fileName: string, detail: string): void => {
    onProbe?.({
      op,
      fileName,
      relativePath: undefined,
      absolutePath: undefined,
      tier: 'translation',
      outcome: 'exception',
      detail,
    });
  };

  const slotOutcomeFor = (errorCode: number, payloadByteLength: number): SyncFsProbe['outcome'] => {
    if (errorCode === syncError.notFound) {
      return 'notFound';
    }
    if (errorCode === syncError.absent) {
      return 'absent';
    }
    if (errorCode !== syncError.ok) {
      return 'error';
    }
    return payloadByteLength > 0 ? 'ok' : 'empty';
  };

  options.port.start();

  return {
    readFileText(fileName: string): string | undefined {
      const target = resolveTarget(fileName);
      if (target.absolutePath === undefined) {
        emitTranslationFailure('readFile', fileName, target.translationError ?? 'translation failed');
        return undefined;
      }

      const fromPool = pool?.resolveCopy(target.absolutePath);
      if (fromPool) {
        const decoded = decoder.decode(fromPool);
        onProbe?.({
          op: 'readFile',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'pool',
          outcome: 'ok',
          payloadBytes: fromPool.byteLength,
        });
        return decoded;
      }

      try {
        perform('readFile', target.absolutePath);
        const errorCode = Atomics.load(int32, slotIndex.errorCode);
        const payloadByteLength = Atomics.load(int32, slotIndex.payloadLength);
        const outcome = slotOutcomeFor(errorCode, payloadByteLength);
        onProbe?.({
          op: 'readFile',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome,
          errorCode,
          payloadBytes: payloadByteLength,
        });
        if (outcome === 'notFound' || outcome === 'error' || outcome === 'absent') {
          return undefined;
        }
        if (outcome === 'empty') {
          return '';
        }
        return decodeArena(payloadByteLength);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        onProbe?.({
          op: 'readFile',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome: 'exception',
          detail,
        });
        return undefined;
      } finally {
        Atomics.store(int32, slotIndex.state, syncState.idle);
      }
    },

    fileExists(fileName: string): boolean {
      const target = resolveTarget(fileName);
      if (target.absolutePath === undefined) {
        emitTranslationFailure('fileExists', fileName, target.translationError ?? 'translation failed');
        return false;
      }

      if (pool?.resolveCopy(target.absolutePath)) {
        onProbe?.({
          op: 'fileExists',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'pool',
          outcome: 'ok',
        });
        return true;
      }

      try {
        perform('fileExists', target.absolutePath);
        const errorCode = Atomics.load(int32, slotIndex.errorCode);
        const payloadByteLength = Atomics.load(int32, slotIndex.payloadLength);
        const exists = errorCode === syncError.ok && payloadByteLength > 0;
        const slotOutcome: SyncFsProbe['outcome'] = exists
          ? 'ok'
          : errorCode === syncError.absent
            ? 'absent'
            : errorCode === syncError.notFound
              ? 'notFound'
              : 'error';
        onProbe?.({
          op: 'fileExists',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome: slotOutcome,
          errorCode,
          payloadBytes: payloadByteLength,
        });
        return exists;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        onProbe?.({
          op: 'fileExists',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome: 'exception',
          detail,
        });
        return false;
      } finally {
        Atomics.store(int32, slotIndex.state, syncState.idle);
      }
    },

    directoryExists(fileName: string): boolean {
      const target = resolveTarget(fileName);
      if (target.absolutePath === undefined) {
        emitTranslationFailure('directoryExists', fileName, target.translationError ?? 'translation failed');
        return false;
      }

      try {
        perform('directoryExists', target.absolutePath);
        const errorCode = Atomics.load(int32, slotIndex.errorCode);
        const payloadByteLength = Atomics.load(int32, slotIndex.payloadLength);
        const exists = errorCode === syncError.ok && payloadByteLength > 0;
        const slotOutcome: SyncFsProbe['outcome'] = exists
          ? 'ok'
          : errorCode === syncError.absent
            ? 'absent'
            : errorCode === syncError.notFound
              ? 'notFound'
              : 'error';
        onProbe?.({
          op: 'directoryExists',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome: slotOutcome,
          errorCode,
          payloadBytes: payloadByteLength,
        });
        return exists;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        onProbe?.({
          op: 'directoryExists',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome: 'exception',
          detail,
        });
        return false;
      } finally {
        Atomics.store(int32, slotIndex.state, syncState.idle);
      }
    },

    getDirectories(directoryName: string): string[] {
      const target = resolveTarget(directoryName);
      if (target.absolutePath === undefined) {
        emitTranslationFailure('readdir', directoryName, target.translationError ?? 'translation failed');
        return [];
      }

      try {
        perform('readdir', target.absolutePath);
        const errorCode = Atomics.load(int32, slotIndex.errorCode);
        const payloadByteLength = Atomics.load(int32, slotIndex.payloadLength);
        if (errorCode !== syncError.ok) {
          onProbe?.({
            op: 'readdir',
            fileName: directoryName,
            relativePath: target.relativePath,
            absolutePath: target.absolutePath,
            tier: 'slot',
            outcome: errorCode === syncError.notFound ? 'notFound' : 'error',
            errorCode,
            payloadBytes: payloadByteLength,
          });
          return [];
        }
        if (payloadByteLength <= 0) {
          onProbe?.({
            op: 'readdir',
            fileName: directoryName,
            relativePath: target.relativePath,
            absolutePath: target.absolutePath,
            tier: 'slot',
            outcome: 'empty',
            errorCode,
            payloadBytes: payloadByteLength,
          });
          return [];
        }
        const text = decodeArena(payloadByteLength);
        const parsed: unknown = JSON.parse(text);
        if (!Array.isArray(parsed) || !parsed.every((x): x is string => typeof x === 'string')) {
          onProbe?.({
            op: 'readdir',
            fileName: directoryName,
            relativePath: target.relativePath,
            absolutePath: target.absolutePath,
            tier: 'slot',
            outcome: 'error',
            errorCode,
            payloadBytes: payloadByteLength,
            detail: 'invalid readdir payload',
          });
          return [];
        }
        onProbe?.({
          op: 'readdir',
          fileName: directoryName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome: 'ok',
          errorCode,
          payloadBytes: payloadByteLength,
          detail: `${parsed.length} entries`,
        });
        return parsed;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        onProbe?.({
          op: 'readdir',
          fileName: directoryName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome: 'exception',
          detail,
        });
        return [];
      } finally {
        Atomics.store(int32, slotIndex.state, syncState.idle);
      }
    },

    getScriptVersionForPath(fileName: string): string | undefined {
      const target = resolveTarget(fileName);
      if (target.absolutePath === undefined) {
        emitTranslationFailure('statMtimeVersion', fileName, target.translationError ?? 'translation failed');
        return undefined;
      }

      try {
        perform('statMtimeVersion', target.absolutePath);
        const errorCode = Atomics.load(int32, slotIndex.errorCode);
        const payloadByteLength = Atomics.load(int32, slotIndex.payloadLength);
        if (errorCode !== syncError.ok) {
          onProbe?.({
            op: 'statMtimeVersion',
            fileName,
            relativePath: target.relativePath,
            absolutePath: target.absolutePath,
            tier: 'slot',
            outcome: errorCode === syncError.notFound ? 'notFound' : 'error',
            errorCode,
            payloadBytes: payloadByteLength,
          });
          return undefined;
        }
        if (payloadByteLength <= 0) {
          onProbe?.({
            op: 'statMtimeVersion',
            fileName,
            relativePath: target.relativePath,
            absolutePath: target.absolutePath,
            tier: 'slot',
            outcome: 'empty',
            errorCode,
            payloadBytes: payloadByteLength,
          });
          return '0';
        }
        const version = decodeArena(payloadByteLength);
        onProbe?.({
          op: 'statMtimeVersion',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome: 'ok',
          errorCode,
          payloadBytes: payloadByteLength,
          detail: version,
        });
        return version;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        onProbe?.({
          op: 'statMtimeVersion',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome: 'exception',
          detail,
        });
        return undefined;
      } finally {
        Atomics.store(int32, slotIndex.state, syncState.idle);
      }
    },

    dispose(): void {
      disposed = true;
    },
  };
}
