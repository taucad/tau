import { createSyncFsClient } from '@taucad/lsp-fs/sync';
import type { SyncFsProbe, TauSyncFsInitMessage } from '@taucad/lsp-fs/sync';
import { initialize, TypeScriptWorker } from 'monaco-editor/esm/vs/language/typescript/ts.worker.js';

import { LspDiagnostic } from '#monaco-ts-worker/lsp-diagnostic.js';
import { TauSyncTsWorker } from '#monaco-ts-worker/tau-sync-ts-worker.js';

/**
 * Importing the upstream `ts.worker.js` registers a `self.onmessage` handler
 * that eagerly calls `initialize(defaultFactory)` on the FIRST inbound message
 * (see `monaco-editor/esm/vs/base/common/worker/webWorkerBootstrap.js`). That
 * race conflicts with our own boot sequence in two ways:
 *
 * 1. The upstream handler runs alongside our `addEventListener` listener, so on
 *    `tau:init` the worker is initialized with the default factory before we
 *    can bind the sync FS — losing Tier-2 reads for closed files.
 * 2. On the trailing `'ignore'` boot message (sent by the Monaco TS mode after
 *    the worker handshake), our listener calls `initialize` a second time and
 *    the bootstrap throws `WebWorker already initialized!`, which Monaco
 *    surfaces as `Could not create web worker(s)` and falls back to running
 *    the worker code on the main thread (where the same race throws again).
 *
 * Clobbering `globalThis.onmessage` here forces every inbound message through
 * our listener until we explicitly call `initialize`, after which the
 * bootstrap reinstalls its own dispatcher.
 */
// oxlint-disable-next-line prefer-add-event-listener -- intentionally clobbering the upstream `self.onmessage` registered by ts.worker.js.
globalThis.onmessage = null;

let syncFs: ReturnType<typeof createSyncFsClient> | undefined;
let booted = false;
// Prefix `sync-fs-host` keeps the TS host short-circuits (`static`, `mirror`,
// `sync`, `miss`) discoverable from the same `[sync-fs` DevTools filter that
// catches the slot-level probes emitted by `recordSyncProbe` below.
// Logging is off by default; enable from the worker console with
// `__tauLspDiag.setEnabled(true)` (see `lsp-diagnostic.ts`).
const diagnostic = new LspDiagnostic({ prefix: 'sync-fs-host' });

// Expose runtime hooks on the worker globalThis so the worker DevTools console
// can dump the recorder, reset it, or toggle logging on the fly.
type WorkerGlobalDiagnosticHooks = {
  __tauLspDiag?: LspDiagnostic;
  __tauLspDump?: () => unknown;
};
const globalHooks = globalThis as unknown as WorkerGlobalDiagnosticHooks;
globalHooks.__tauLspDiag = diagnostic;
globalHooks.__tauLspDump = (): unknown => diagnostic.dump();

const recordSyncProbe = (probe: SyncFsProbe): void => {
  if (!diagnostic.isEnabled()) {
    return;
  }
  // Surface raw -> relative -> absolute path translation alongside the slot
  // outcome so we can spot path-doubling, scheme mismatches, and notFound
  // patterns from the worker DevTools console.
  // oxlint-disable-next-line no-console -- gated by LspDiagnostic; off by default
  console.debug(`[sync-fs:${probe.op}:${probe.tier}:${probe.outcome}]`, {
    fileName: probe.fileName,
    relativePath: probe.relativePath,
    absolutePath: probe.absolutePath,
    errorCode: probe.errorCode,
    payloadBytes: probe.payloadBytes,
    detail: probe.detail,
  });
};

function isTauInitMessage(data: unknown): data is TauSyncFsInitMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  return (data as Record<string, unknown>)['type'] === 'tau:init';
}

globalThis.addEventListener('message', (event: MessageEvent<unknown>): void => {
  const { data } = event;
  if (syncFs === undefined && isTauInitMessage(data)) {
    syncFs = createSyncFsClient({
      port: data.port,
      slotSab: data.slotSab,
      arenaSab: data.arenaSab,
      filePoolBuffer: data.filePoolBuffer,
      workspaceRootAbsolute: data.workspaceRootAbsolute,
      onProbe: recordSyncProbe,
    });
    if (diagnostic.isEnabled()) {
      // oxlint-disable-next-line no-console -- gated by LspDiagnostic; off by default
      console.debug('[lsp:diagnostic] sync FS bound', {
        workspaceRootAbsolute: data.workspaceRootAbsolute,
        hasFilePool: data.filePoolBuffer !== undefined,
      });
    }
    return;
  }

  if (data === 'ignore' && !booted) {
    booted = true;
    initialize((context, createData) => {
      if (syncFs) {
        return new TauSyncTsWorker(context, createData, { syncFsClient: syncFs, diagnostic });
      }
      return new TypeScriptWorker(context, createData);
    });
  }
});
