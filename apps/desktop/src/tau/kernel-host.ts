/**
 * Kernel utility entry (work item E5).
 *
 * One process per renderer client, forked by `registerElectronRuntimeMain`
 * with the project root the E6 resolver validated. The utility owns the
 * executable runtime and a rooted node filesystem; main only hands it a
 * `MessagePortMain`. Nothing here trusts `TAU_PROJECT_ROOT` — main already did
 * the trusting, and refuses the fork outright when it cannot.
 */

import { mkdirSync } from 'node:fs';

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { serveElectronRuntime } from '@taucad/runtime/electron/utility';

import { createDiagnosticsLog } from '#main/diagnostics.js';
import { kernelEngineEvent, kernelEngineRecord } from '#tau/kernel-diagnostics.js';
import { debugRuntime, desktopOpenrscadKernel, runtime } from '#tau/desktop-runtime.definition.js';

const projectRoot = process.env['TAU_PROJECT_ROOT'];
if (!projectRoot) {
  throw new Error('The Tau kernel utility requires TAU_PROJECT_ROOT; main resolves it per request.');
}
mkdirSync(projectRoot, { recursive: true });

/* Serve first, diagnose second. `serveElectronRuntime` must attach its
 * `parentPort` listener synchronously during module evaluation — main posts the
 * wire port immediately after forking, and an `await` placed above this line
 * would race it. */
serveElectronRuntime({
  fileSystem: fromNodeFs(projectRoot),
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
    createDiagnosticsLog({ directory }).log(
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
    console.error('[tau-desktop:kernel] engine diagnostics failed', error);
  }
};

// async-iife: bootstrap — the entry cannot be async (see the serve-first note
// above) and nothing downstream consumes this record but the log file.
// oxlint-disable-next-line unicorn/prefer-top-level-await -- awaiting here would delay serving the wire port
void recordEngineIdentity();
