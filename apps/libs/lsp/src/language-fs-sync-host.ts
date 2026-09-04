import { defaultArenaBytes, slotInt32Length } from '@taucad/lsp-fs/sync';
import type { TauSyncFsInitMessage } from '@taucad/lsp-fs/sync';
import { normalizePath } from '@taucad/utils/path';

const languageHostSlotBytes = slotInt32Length * Int32Array.BYTES_PER_ELEMENT;

/** @public */
export type TauLanguageHostInit = Readonly<
  Pick<TauSyncFsInitMessage, 'port' | 'slotSab' | 'arenaSab' | 'filePoolBuffer' | 'workspaceRootAbsolute'>
>;

/**
 * Snapshot shape required to open a Tier-2 sync host (compatible with the project file-manager actor).
 *
 * @public
 */
export type TauLanguageFileManagerSnapshotContext = Readonly<{
  worker: Worker | undefined;
  rootDirectory: string;
  filePoolBuffer?: SharedArrayBuffer;
}>;

/** @public */
export type TauLanguageFileManagerSnapshot = Readonly<{
  context: TauLanguageFileManagerSnapshotContext;
  matches(state: string): boolean;
}>;

/** @public */
export type TauLanguageFileManagerRef = Readonly<{
  getSnapshot(): TauLanguageFileManagerSnapshot;
}>;

let portFactory: (() => TauLanguageHostInit | undefined) | undefined;

/**
 * Register how the Monaco TS worker obtains Tier-2 sync FS ports (called when FM is ready).
 *
 * @public
 */
export function setTauLanguageHostPortFactory(factory: () => TauLanguageHostInit | undefined): void {
  portFactory = factory;
}

/** @public */
export function clearTauLanguageHostPortFactory(): void {
  portFactory = undefined;
}

/**
 * Allocate a fresh sync {@link MessageChannel} + SABs and attach the server port to the FM worker.
 *
 * Returns `undefined` — the stock-worker fallback in `MonacoEnvironment.getWorker`
 * — when the FM is not ready or shared memory is unreachable.
 *
 * @public
 */
export function openTauLanguageHostPort(fileManagerRef: TauLanguageFileManagerRef): TauLanguageHostInit | undefined {
  const snap = fileManagerRef.getSnapshot();
  if (!snap.matches('ready') || !snap.context.worker) {
    return undefined;
  }
  /* Finding 10 of `docs/research/host-agnostic-transport-substrate-blueprint.md`:
   * unguarded, the allocation below throws on any non-isolated document and the
   * callers never catch it, so the stock-worker fallback was unreachable.
   * Read off `globalThis` the way `@taucad/runtime`'s `getIsolationStatus` does:
   * the DOM lib types the flag as `boolean`, so `=== false` only means something
   * against a view that admits it being absent (Node defines neither). */
  if (
    typeof SharedArrayBuffer === 'undefined' ||
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === false
  ) {
    return undefined;
  }

  const channel = new MessageChannel();
  const slotSab = new SharedArrayBuffer(languageHostSlotBytes);
  const arenaSab = new SharedArrayBuffer(defaultArenaBytes);
  const workspaceRootAbsolute = normalizePath(snap.context.rootDirectory);

  snap.context.worker.postMessage(
    {
      type: 'languageFsSyncAttach',
      port: channel.port2,
      slotSab,
      arenaSab,
      rootDirectory: workspaceRootAbsolute,
    },
    [channel.port2],
  );

  return {
    port: channel.port1,
    slotSab,
    arenaSab,
    filePoolBuffer: snap.context.filePoolBuffer,
    workspaceRootAbsolute,
  };
}

/**
 * Called from `MonacoEnvironment.getWorker` (once per TS/JS worker instance).
 *
 * @public
 */
export function createTauLanguageHostInit(): TauLanguageHostInit | undefined {
  return portFactory?.();
}
