/**
 * Kernel utility entry (work item E5).
 *
 * One process per renderer client, forked by `registerElectronRuntimeMain`.
 * The utility owns the executable runtime and consumes the rooted filesystem
 * capability main transfers from the services utility — which is the only
 * thing that tells it which directory it works in. Nothing here names a
 * project: main validated the root, and a process that knows no root can be
 * forked before anyone has asked for one and handed to whoever asks first
 * (W-L03-4).
 */

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { serveElectronRuntime } from '@taucad/runtime/electron/utility';

import { createDiagnosticsLog } from '#main/diagnostics.js';
import { kernelEngineEvent, kernelEngineRecord } from '#tau/kernel-diagnostics.js';
import { debugRuntime, runtime } from '#tau/desktop-runtime.definition.js';
import { desktopOpenrscadKernel } from '#tau/desktop-runtime.factory.js';

const ephemeral = process.env['TAU_RUNTIME_EPHEMERAL'] === '1';
/* Serve first, diagnose second. `serveElectronRuntime` must attach its
 * `parentPort` listener synchronously during module evaluation — main posts the
 * wire port immediately after forking, and an `await` placed above this line
 * would race it. */
serveElectronRuntime({
  ...(ephemeral ? { fileSystem: fromMemoryFs() } : {}),
  runtime: process.env['TAU_RUNTIME_DEBUG'] === '1' ? debugRuntime : runtime,
});

/**
 * Record which engine this utility actually loaded (N5 + N6).
 *
 * Resolution goes through `@taucad/runtime/plugin`'s public
 * `resolveRuntimePluginDefinition`, so nothing about the runtime's surface is
 * widened to make the version observable — the shell asks the same question the
 * worker does. It resolves **`desktopOpenrscadKernel`**, the very binding the
 * served recipe registers, so the logged identity cannot describe a kernel this
 * process does not serve.
 *
 * *Which* payload bound is a separate question, and only the engine can answer
 * it: one release ships the addon and the WebAssembly build under one version.
 * The `backend` export is read from the same module instance the kernel loaded
 * (Node's module cache), so this is an observation, not a second probe.
 *
 * @returns Nothing. Diagnostics must never take the kernel down with them.
 */
const recordEngineIdentity = async (): Promise<void> => {
  const directory = process.env['TAU_DESKTOP_LOG_DIR'];
  if (!directory) {
    return;
  }
  try {
    const definition = await resolveRuntimePluginDefinition('kernel', desktopOpenrscadKernel);
    const { backend } = await import('@taulabs/openrscad-engine');
    createDiagnosticsLog({ directory, producer: 'kernel' }).log(
      'info',
      kernelEngineEvent,
      kernelEngineRecord({
        kernelId: desktopOpenrscadKernel.id,
        version: definition.version,
        backend,
        versions: process.versions,
      }),
    );
  } catch (error) {
    // oxlint-disable-next-line no-console -- the diagnostics sink is what failed
    console.error('[kernel] engine diagnostics failed', error);
  }
};

// async-iife: bootstrap — the entry cannot be async (see the serve-first note
// above) and nothing downstream consumes this record but the log file.
// oxlint-disable-next-line unicorn/prefer-top-level-await -- awaiting here would delay serving the wire port
void recordEngineIdentity();
