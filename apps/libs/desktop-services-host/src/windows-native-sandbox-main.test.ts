import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDesktopWindowsNativeSandbox } from '#windows-native-sandbox-main.js';

let root: string;
let helper: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tau-windows-native-'));
  helper = join(root, 'tau-windows-sandbox.exe');
  writeFileSync(helper, '');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolveDesktopWindowsNativeSandbox', () => {
  const resolve = (
    environment: Record<string, string>,
    platform: NodeJS.Platform = 'win32',
  ): ReturnType<typeof resolveDesktopWindowsNativeSandbox> =>
    resolveDesktopWindowsNativeSandbox({
      platform,
      sandboxEnvironment: environment,
      userDataPath: join(root, 'userData'),
    });

  it('should compose the helper and a journal directory in user data when the sandbox is enabled and bundled', () => {
    expect(resolve({ TAU_WINDOWS_SHELL_SANDBOX: '1', TAU_WINDOWS_SANDBOX_HELPER: helper })).toEqual({
      helperPath: helper,
      journalDirectory: join(root, 'userData', 'native-sandbox-journals'),
    });
  });

  it('should compose nothing off Windows, without the gate, or without the helper on disk', () => {
    expect(resolve({ TAU_WINDOWS_SHELL_SANDBOX: '1', TAU_WINDOWS_SANDBOX_HELPER: helper }, 'linux')).toBeUndefined();
    expect(resolve({ TAU_WINDOWS_SANDBOX_HELPER: helper })).toBeUndefined();
    expect(
      resolve({ TAU_WINDOWS_SHELL_SANDBOX: '1', TAU_WINDOWS_SANDBOX_HELPER: join(root, 'absent.exe') }),
    ).toBeUndefined();
    expect(resolve({ TAU_WINDOWS_SHELL_SANDBOX: '1' })).toBeUndefined();
  });
});
