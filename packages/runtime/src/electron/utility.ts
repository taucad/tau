/**
 * Electron utility-process helper for serving a Tau runtime.
 *
 * @public
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public Electron utility subpath */

import type { RuntimeFileSystem } from '#filesystem/index.js';
import { createRuntimeHost } from '#host/create-runtime-host.js';
import type { RuntimeHostHandle } from '#host/runtime-host.types.js';
import { createRuntimeWorker } from '#worker/index.js';
import type { AnyRuntimeDefinition } from '#worker/index.js';

import { electronUtilityHost } from '#electron/electron-utility-host.js';
import type { ElectronUtilityHostOptions } from '#electron/electron-utility-transport.schemas.js';

export { electronUtilityHost } from '#electron/electron-utility-host.js';
export type { ElectronUtilityHostOptions } from '#electron/electron-utility-transport.schemas.js';

/**
 * Options for {@link serveElectronRuntime} in an Electron utility entry.
 *
 * @public
 */
export type ServeElectronRuntimeOptions = {
  /** Rooted filesystem authority exposed inside the utility host. */
  readonly fileSystem: RuntimeFileSystem;
  /** Install a process-exit disposer. Defaults to true. */
  readonly installProcessTeardown?: boolean;
  /** Executable runtime definition owned by this utility host. */
  readonly runtime: AnyRuntimeDefinition;
};

/**
 * Serve one worker-owned runtime over the utility process port supplied by main.
 *
 * @param options - Runtime definition, opaque filesystem, and teardown behavior.
 * @returns The utility-process runtime host handle.
 * @public
 *
 * @example <caption>Start a utility-process runtime host</caption>
 * ```typescript
 * import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
 * import { fromMemoryFs } from '@taucad/runtime/filesystem';
 * import { serveElectronRuntime } from '@taucad/runtime/electron/utility';
 *
 * declare const runtime: AnyRuntimeDefinition;
 *
 * serveElectronRuntime({ runtime, fileSystem: fromMemoryFs() });
 * ```
 */
export const serveElectronRuntime = (options: ServeElectronRuntimeOptions): RuntimeHostHandle => {
  const worker = createRuntimeWorker({ runtime: options.runtime });
  const host = createRuntimeHost({
    transport: electronUtilityHost({
      fileSystem: options.fileSystem,
      worker,
    } satisfies ElectronUtilityHostOptions),
  });

  if (options.installProcessTeardown !== false) {
    const teardown = (): void => {
      try {
        host.dispose();
      } catch {
        /* Best-effort */
      }
    };
    process.once('exit', teardown);
  }

  return host;
};
