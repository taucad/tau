/**
 * Main's half of the Windows native sandbox: resolve the bundled helper once, and run its one-time elevated setup when
 * a seal or a worker first needs it. Kept apart from `windows-native-sandbox.ts` so the kernel utility carries none of
 * the setup or the shell composition.
 *
 * @module
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { DesktopWindowsNativeSandbox } from '#native-kernels-frame.js';
import { bundledWindowsSandboxHelper, setUpWindowsShellSandbox } from '#services-host-shell.js';

/**
 * The Windows native sandbox main composes, or `undefined` when it is off: only on Windows, with
 * `TAU_WINDOWS_SHELL_SANDBOX=1` (the same gate as the Terminal's shell, Q15) and a bundled helper that exists. Off,
 * a native kernel on Windows refuses to launch rather than run uncontained.
 *
 * @param input - The platform, main's environment, Electron's resources folder and main's user-data folder.
 * @returns The helper and the journal directory.
 */
export const resolveDesktopWindowsNativeSandbox = (
  input: Readonly<{
    platform?: NodeJS.Platform | undefined;
    environment: Readonly<Record<string, string | undefined>>;
    resourcesPath: string | undefined;
    userDataPath: string;
  }>,
): DesktopWindowsNativeSandbox | undefined => {
  if ((input.platform ?? process.platform) !== 'win32' || input.environment['TAU_WINDOWS_SHELL_SANDBOX'] !== '1') {
    return undefined;
  }
  const helperPath = bundledWindowsSandboxHelper({
    environment: input.environment,
    resourcesPath: input.resourcesPath,
    source: false,
  });
  if (helperPath === undefined || !existsSync(helperPath)) {
    return undefined;
  }
  return { helperPath, journalDirectory: join(input.userDataPath, 'native-sandbox-journals') };
};

/**
 * The one-time elevated setup, as the native adapter calls it: one Windows administrator prompt, shared with the
 * Terminal's shell.
 *
 * @param sandbox - The helper main resolved.
 * @param environment - Main's environment, for `SystemRoot`.
 * @returns A setup that rejects with the reason when the person declines the prompt or the setup fails.
 */
export const desktopWindowsSandboxSetup =
  (
    sandbox: DesktopWindowsNativeSandbox,
    environment: Readonly<Record<string, string | undefined>>,
  ): (() => Promise<void>) =>
  async () => {
    const outcome = await setUpWindowsShellSandbox(sandbox.helperPath, { environment });
    if (outcome.status === 'failed') {
      throw new Error(outcome.message);
    }
  };
