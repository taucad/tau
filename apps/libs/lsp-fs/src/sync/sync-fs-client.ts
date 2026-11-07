import { joinPath } from '@taucad/utils/path';
import { createSyncRequestClient } from '@taucad/fs-bridge/sync';

import type { SyncFsOp, TauSyncFsWireMessage } from '#sync/sync-fs-protocol.js';
import { slotIndex, slotInt32Length, syncError } from '#sync/sync-fs-protocol.js';
import { languageFileUriToWorkspaceRelative } from '#uri.js';
import { createIndexMirror, indexMirrorCovers, tauIndexMirrorMessageSchema } from '#sync/index-mirror.js';
import type { IndexEntry } from '@taucad/filesystem';

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
  /** Whether the worker's index mirror has its first whole index, so presence probes stay in the worker. */
  mirrorReady(): boolean;
  dispose(): void;
}>;

/**
 * Lifecycle event emitted by {@link createSyncFsClient} for diagnostic
 * tracing of path translation, slot routing, and slot error codes.
 *
 * @public
 */
export type SyncFsProbe = Readonly<{
  op: SyncFsOp;
  /** Raw input as received from the TS worker host (e.g. a `file://` URI). */
  fileName: string;
  /**
   * Workspace-relative path after {@link languageFileUriToWorkspaceRelative}.
   * `undefined` when path translation threw (non-`file:` URI, etc.).
   */
  relativePath: string | undefined;
  /**
   * Absolute path on the host filesystem (`joinPath(root, relativePath)`).
   * `undefined` when path translation threw.
   */
  absolutePath: string | undefined;
  /**
   * - `mirror`      answered by the worker's index mirror, with no round trip (D13).
   * - `slot`        sent over the SAB slot to the FM worker.
   * - `translation` failed before any tier ran (URI scheme mismatch, etc.).
   */
  tier: 'mirror' | 'slot' | 'translation';
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
  workspaceRootAbsolute: string;
  /** Optional cap for a single `readFile` / `listDirectories` payload; default full arena. */
  arenaBytes?: number;
  textDecoder?: TextDecoder;
  /** Optional diagnostic sink invoked once per operation. Bound and bounded by the consumer. */
  onProbe?: (probe: SyncFsProbe) => void;
  /**
   * Whether the root's index would hold a root-relative path (default
   * {@link indexMirrorCovers}): a path it never holds — under `node_modules`,
   * say — is always asked over the slot, since a miss in the mirror says nothing.
   */
  indexCovers?: (relativePath: string) => boolean;
}>;

type ResolvedTarget = Readonly<
  | { relativePath: string; absolutePath: string; translationError: undefined }
  | { relativePath: undefined; absolutePath: undefined; translationError: string }
>;

/**
 * Worker-side sync client: every read is a slot round-trip to the FM worker.
 *
 * @public
 */
export function createSyncFsClient(options: CreateSyncFsClientOptions): SyncFsClient {
  const int32 = new Int32Array(options.slotSab, 0, slotInt32Length);
  const arenaBytes = options.arenaBytes ?? options.arenaSab.byteLength;
  const arena = new Uint8Array(options.arenaSab, 0, arenaBytes);
  const decoder = options.textDecoder ?? new TextDecoder();
  const root = options.workspaceRootAbsolute;
  const { onProbe } = options;

  /** Browser `TextDecoder` rejects SAB-backed views; copying into a fresh `Uint8Array` yields a non-shared buffer (VS Code sync-api-common idiom). */
  const decodeArena = (length: number): string => decoder.decode(new Uint8Array(arena.subarray(0, length)));
  const syncClient = createSyncRequestClient({
    port: options.port,
    slotSab: options.slotSab,
  });

  const resolveTarget = (fileName: string): ResolvedTarget => {
    try {
      const relativePath = languageFileUriToWorkspaceRelative(fileName);
      return { relativePath, absolutePath: joinPath(root, relativePath), translationError: undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { relativePath: undefined, absolutePath: undefined, translationError: message };
    }
  };

  const perform = (op: SyncFsOp, rootedPath: string): void => {
    syncClient.perform((requestId) => {
      const message: TauSyncFsWireMessage = { tau: 'sync-fs', op, requestId, path: rootedPath };
      return message;
    });
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

  /* The FM worker sends the root's index, then its changes, on this port (D13); until the first arrives the slot answers. */
  const mirror = createIndexMirror();
  const covers = options.indexCovers ?? indexMirrorCovers;
  const receiveMirror = (event: MessageEvent): void => {
    const message = tauIndexMirrorMessageSchema.safeParse(event.data);
    if (message.success) {
      mirror.receive(message.data);
    }
  };
  options.port.addEventListener('message', receiveMirror);
  /**
   * What the mirror says about a path: its entry, `null` when the index would
   * hold it and does not, or `undefined` when the mirror cannot answer.
   */
  // oxlint-disable-next-line typescript/no-restricted-types -- null is the mirror's definite absence, apart from "cannot answer".
  const fromMirror = (relativePath: string): IndexEntry | null | undefined => {
    if (!mirror.ready() || !covers(relativePath) || !mirror.covers(relativePath)) {
      return undefined;
    }
    if (relativePath === '') {
      return { path: '', kind: 'dir', size: 0, mtimeMs: 0, generation: 0 };
    }
    return mirror.entry(relativePath) ?? null;
  };
  const emitMirror = ({
    op,
    fileName,
    target,
    found,
  }: Readonly<{
    op: SyncFsOp;
    fileName: string;
    target: Extract<ResolvedTarget, { translationError: undefined }>;
    found: boolean;
  }>): void => {
    onProbe?.({
      op,
      fileName,
      relativePath: target.relativePath,
      absolutePath: target.absolutePath,
      tier: 'mirror',
      outcome: found ? 'ok' : 'absent',
    });
  };

  options.port.start();

  return {
    mirrorReady: () => mirror.ready(),
    readFileText(fileName: string): string | undefined {
      const target = resolveTarget(fileName);
      if (target.absolutePath === undefined) {
        emitTranslationFailure('readFile', fileName, target.translationError);
        return undefined;
      }

      try {
        perform('readFile', target.relativePath);
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
      }
    },

    fileExists(fileName: string): boolean {
      const target = resolveTarget(fileName);
      if (target.absolutePath === undefined) {
        emitTranslationFailure('fileExists', fileName, target.translationError);
        return false;
      }
      const mirrored = fromMirror(target.relativePath);
      if (mirrored !== undefined) {
        const exists = mirrored?.kind === 'file';
        emitMirror({ op: 'fileExists', fileName, target, found: exists });
        return exists;
      }

      try {
        perform('fileExists', target.relativePath);
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
      }
    },

    directoryExists(fileName: string): boolean {
      const target = resolveTarget(fileName);
      if (target.absolutePath === undefined) {
        emitTranslationFailure('directoryExists', fileName, target.translationError);
        return false;
      }
      const mirrored = fromMirror(target.relativePath);
      if (mirrored !== undefined) {
        const exists = mirrored?.kind === 'dir';
        emitMirror({ op: 'directoryExists', fileName, target, found: exists });
        return exists;
      }

      try {
        perform('directoryExists', target.relativePath);
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
      }
    },

    getDirectories(directoryName: string): string[] {
      const target = resolveTarget(directoryName);
      if (target.absolutePath === undefined) {
        emitTranslationFailure('listDirectories', directoryName, target.translationError);
        return [];
      }

      try {
        perform('listDirectories', target.relativePath);
        const errorCode = Atomics.load(int32, slotIndex.errorCode);
        const payloadByteLength = Atomics.load(int32, slotIndex.payloadLength);
        if (errorCode !== syncError.ok) {
          onProbe?.({
            op: 'listDirectories',
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
            op: 'listDirectories',
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
            op: 'listDirectories',
            fileName: directoryName,
            relativePath: target.relativePath,
            absolutePath: target.absolutePath,
            tier: 'slot',
            outcome: 'error',
            errorCode,
            payloadBytes: payloadByteLength,
            detail: 'invalid listDirectories payload',
          });
          return [];
        }
        onProbe?.({
          op: 'listDirectories',
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
          op: 'listDirectories',
          fileName: directoryName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome: 'exception',
          detail,
        });
        return [];
      }
    },

    getScriptVersionForPath(fileName: string): string | undefined {
      const target = resolveTarget(fileName);
      if (target.absolutePath === undefined) {
        emitTranslationFailure('statMtimeVersion', fileName, target.translationError);
        return undefined;
      }
      const mirrored = fromMirror(target.relativePath);
      if (mirrored !== undefined) {
        const version = mirrored?.kind === 'file' ? mirror.version(target.relativePath) : undefined;
        emitMirror({ op: 'statMtimeVersion', fileName, target, found: version !== undefined });
        return version;
      }

      try {
        perform('statMtimeVersion', target.relativePath);
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
      }
    },

    dispose(): void {
      options.port.removeEventListener('message', receiveMirror);
      syncClient.dispose();
    },
  };
}
