/**
 * Purpose: Configure the Windows native sandbox for the Python kernel scripts that prepare a closure: the golden
 * receipt and the worker tests.
 * Why: On Windows every native preparation step runs in the sandbox helper, and preparation refuses without it.
 * Environment: `TAU_WINDOWS_SANDBOX_HELPER` names the helper, whose one-time setup the caller ran (the golden
 * workflow's Windows row does, elevated). Elsewhere, or without it, this does nothing.
 * Usage: `configureScriptWindowsSandbox(store)` before `createPreparationHost({ ..., nativeContainment: nativeSandboxRefusal })`.
 */

import { basename, dirname, join } from 'node:path';
import process from 'node:process';

import { configureWindowsNativeSandbox } from '@taucad/native-process-core';
import { readWindowsSandboxStatus } from '@taucad/native-process-core/shell';

/**
 * On Windows, run native preparation steps in the sandbox helper named by `TAU_WINDOWS_SANDBOX_HELPER`. Without it,
 * Windows preparation refuses, as no native step runs unsandboxed.
 * @param store - The preparation store; its journals sit beside it.
 */
export const configureScriptWindowsSandbox = (store: string): void => {
  const helperPath = process.env['TAU_WINDOWS_SANDBOX_HELPER'];
  if (process.platform !== 'win32' || helperPath === undefined || helperPath === '') {
    return;
  }
  configureWindowsNativeSandbox({
    helperPath,
    journalDirectory: join(dirname(store), `${basename(store)}-journals`),
    installed: async () => {
      const status = await readWindowsSandboxStatus(helperPath);
      return status.installed;
    },
  });
};
