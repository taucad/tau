/**
 * How a desktop process contains its native kernels' workers on Windows: through the sandbox helper the Terminal's
 * shell uses, one AppContainer per launch (`libs/sandbox/src/native-sandbox-windows.ts`).
 *
 * Main resolves the helper once ({@link resolveDesktopWindowsNativeSandbox}, in `windows-native-sandbox-main.ts`),
 * installs it for its own seal step and names it in the native-kernels frame, so every kernel utility installs the
 * same helper and journal directory. Only main may run the one-time elevated setup; a utility whose helper is not set
 * up refuses the launch, which main's preparation (always first) will have set up.
 *
 * @module
 */
import { configureWindowsNativeSandbox } from '@taucad/native-process-core';
import { readWindowsSandboxStatus } from '@taucad/native-process-core/shell';

import type { DesktopWindowsNativeSandbox } from '#native-kernels-frame.js';

/**
 * Contain this process's native launches on Windows through the helper main resolved.
 *
 * @param sandbox - The helper and journal directory, from main.
 * @param options - The environment the helper's `status` runs with, and, in main only, the one-time elevated setup.
 */
export const installDesktopWindowsNativeSandbox = (
  sandbox: DesktopWindowsNativeSandbox,
  options: Readonly<{
    environment?: Readonly<Record<string, string | undefined>> | undefined;
    setup?: (() => Promise<void>) | undefined;
  }> = {},
): void => {
  const environment = options.environment ?? process.env;
  configureWindowsNativeSandbox({
    helperPath: sandbox.helperPath,
    journalDirectory: sandbox.journalDirectory,
    installed: async () => (await readWindowsSandboxStatus(sandbox.helperPath, { environment })).installed,
    setup: options.setup,
  });
};
