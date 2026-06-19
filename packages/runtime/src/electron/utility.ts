/**
 * Electron utility-process helper for serving a Tau runtime.
 *
 * @public
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public Electron utility subpath */

import type { RuntimeFileSystem } from '#filesystem/index.js';
import { createRuntimeHost } from '#host/index.js';
import type { RuntimeHostHandle } from '#host/index.js';
import { createRuntimeWorker } from '#worker/index.js';
import type { AnyRuntimeDefinition } from '#worker/index.js';

import { electronUtilityHost } from '#electron/electron-utility-host.js';
import type { ElectronUtilityHostOptions } from '#electron/electron-utility-transport.schemas.js';

export { electronUtilityHost } from '#electron/electron-utility-host.js';
export type { ElectronUtilityHostOptions } from '#electron/electron-utility-transport.schemas.js';

export type ServeElectronRuntimeOptions = {
  readonly fileSystem: RuntimeFileSystem;
  readonly installProcessTeardown?: boolean;
  readonly runtime: AnyRuntimeDefinition;
};

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
    process.once('SIGTERM', () => {
      teardown();
      process.exit(0);
    });
  }

  return host;
};
