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
 * worker does. Critically it resolves **`desktopOpenrscadKernel`**, the very
 * binding the served recipe registers, not a fresh `openrscadNativeKernel()`:
 * a second instantiation would report `+native` even after the recipe was
 * swapped back to WebAssembly, which is a witness that cannot fail. The two
 * engines' resolved versions genuinely differ (`…-beta.1+native` vs
 * `…-beta.1`), so with one shared binding the assertion flips with the recipe.
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
    createDiagnosticsLog({ directory }).log(
      'info',
      kernelEngineEvent,
      kernelEngineRecord({
        kernelId: desktopOpenrscadKernel.id,
        version: definition.version,
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
