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

import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { serveElectronRuntime } from '@taucad/runtime/electron/utility';

import { debugRuntime, runtime } from '#tau/desktop-runtime.definition.js';

const ephemeral = process.env['TAU_RUNTIME_EPHEMERAL'] === '1';
/* Attach `parentPort` synchronously: main posts the wire port immediately
 * after forking. Engine identity is recorded only if OpenRSCAD initializes. */
serveElectronRuntime({
  ...(ephemeral ? { fileSystem: fromMemoryFs() } : {}),
  runtime: process.env['TAU_RUNTIME_DEBUG'] === '1' ? debugRuntime : runtime,
});
