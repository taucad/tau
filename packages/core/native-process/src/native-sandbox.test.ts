// @vitest-environment node
import { realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { getDefaultWritePaths } from '@anthropic-ai/sandbox-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { launchInNativeSandbox, NativeRuntimeUnavailableError, nativeSandboxPolicy } from '#index.js';

/** A fresh module registry per file keeps the launcher's one-time initialization observable. */
const sandbox = vi.hoisted(() => ({
  supported: true,
  dependencyErrors: [] as string[],
  initialize: vi.fn(async () => undefined),
  wrap: vi.fn<(command: string, ...rest: unknown[]) => void>(),
  wrapFailure: undefined as unknown,
}));
vi.mock('@anthropic-ai/sandbox-runtime', async (importActual) => ({
  // The default write roots stay real: the profile's deny list is derived from them.
  ...(await importActual<{ getDefaultWritePaths: typeof getDefaultWritePaths }>()),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the runtime's exported class.
  SandboxManager: {
    isSupportedPlatform: () => sandbox.supported,
    checkDependenciesAsync: async () => ({ errors: sandbox.dependencyErrors, warnings: [] }),
    initialize: sandbox.initialize,
    wrapWithSandboxArgv: async (command: string, ...rest: unknown[]) => {
      sandbox.wrap(command, ...rest);
      if (sandbox.wrapFailure !== undefined) {
        // oxlint-disable-next-line typescript/only-throw-error -- launchers can reject with bare strings.
        throw sandbox.wrapFailure;
      }
      return { argv: ['/bin/sh', '-c', command], env: process.env };
    },
  },
}));

const launch = {
  executablePath: "/opt/it's here/python",
  arguments: ['--flag', 'a b'],
  readablePaths: ['/opt/runtime', '/private/workspace'],
  writablePath: '/private/artifacts',
  workingDirectory: '/private/workspace',
  commandId: 'probe#1',
};

const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;

afterEach(() => {
  sandbox.supported = true;
  sandbox.dependencyErrors = [];
  sandbox.wrapFailure = undefined;
  sandbox.wrap.mockClear();
});

describe('launchInNativeSandbox', () => {
  it('should fail closed before initialization succeeds, then initialize once', async () => {
    // Concurrent launches share one attempt: both observe its failure, the memo is reset once, and
    // the second observer must not clobber whatever a later launch has already started.
    sandbox.initialize.mockRejectedValueOnce(new Error('proxy bind failed'));
    const shared = await Promise.allSettled([launchInNativeSandbox(launch), launchInNativeSandbox(launch)]);
    expect(shared.map(({ status }) => status)).toEqual(['rejected', 'rejected']);
    expect(sandbox.initialize).toHaveBeenCalledTimes(1);

    const failures = [
      {
        arrange: () => {
          Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'win32' });
        },
        message: /Windows is not yet a supported native runtime platform/,
      },
      {
        arrange: () => {
          sandbox.supported = false;
        },
        message: /has no supported sandbox backend/,
      },
      {
        arrange: () => {
          sandbox.dependencyErrors = ['bubblewrap not found', 'socat not found'];
        },
        message: /bubblewrap not found; socat not found/,
      },
      {
        arrange: () => {
          sandbox.initialize.mockRejectedValueOnce(new Error('proxy bind failed'));
        },
        message: /proxy bind failed/,
      },
      {
        arrange: () => {
          sandbox.wrapFailure = new Error('profile rejected');
        },
        message: /profile rejected/,
      },
      {
        arrange: () => {
          sandbox.wrapFailure = 'launcher exited';
        },
        message: /launcher exited/,
      },
    ];
    for (const { arrange, message } of failures) {
      arrange();
      // oxlint-disable-next-line no-await-in-loop -- each failure mode is arranged sequentially.
      const error: unknown = await launchInNativeSandbox(launch).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(error).toBeInstanceOf(NativeRuntimeUnavailableError);
      expect((error as NativeRuntimeUnavailableError).code).toBe('NATIVE_RUNTIME_UNAVAILABLE');
      expect((error as NativeRuntimeUnavailableError).message).toMatch(message);
      Object.defineProperty(process, 'platform', platformDescriptor);
      sandbox.supported = true;
      sandbox.dependencyErrors = [];
      sandbox.wrapFailure = undefined;
    }
    // Each rejected initialization was retried by the next launch; the success is then reused.
    expect(sandbox.initialize).toHaveBeenCalledTimes(3);
    expect(sandbox.initialize).toHaveBeenLastCalledWith(nativeSandboxPolicy());
    await launchInNativeSandbox(launch);
    expect(sandbox.initialize).toHaveBeenCalledTimes(3);
  });

  it('should quote only the host-owned vector and pass the fixed per-launch profile', async () => {
    await expect(launchInNativeSandbox(launch)).resolves.toEqual([
      '/bin/sh',
      '-c',
      String.raw`TMPDIR='/private/artifacts' TEMP='/private/artifacts' TMP='/private/artifacts' exec '/opt/it'\''s here/python' '--flag' 'a b'`,
    ]);
    const [, shell, policy, signal, workingDirectory, attribution] = sandbox.wrap.mock.calls[0]!;
    expect(shell).toBe('/bin/sh');
    expect(signal).toBeUndefined();
    expect(workingDirectory).toBe('/private/workspace');
    expect(attribution).toEqual({ commandId: 'probe#1' });
    expect(policy).toEqual(nativeSandboxPolicy(launch));
  });
});

describe('nativeSandboxPolicy', () => {
  it('should deny every user, volume, and temporary root and re-allow only the launch paths', () => {
    const policy = nativeSandboxPolicy(launch);
    expect(policy.network).toEqual({ allowedDomains: [], deniedDomains: ['*'], strictAllowlist: true });
    expect(policy.filesystem.denyRead).toEqual(
      expect.arrayContaining([homedir(), '/Users', '/home', '/root', '/Volumes', '/mnt', '/media', '/tmp', tmpdir()]),
    );
    expect(policy.filesystem.denyRead).toContain(realpathSync(tmpdir()));
    expect(policy.filesystem.allowRead).toEqual(['/opt/runtime', '/private/workspace', '/private/artifacts']);
    expect(policy.filesystem.allowWrite).toEqual(['/private/artifacts']);
    // The runtime grants these to every command by default; a CAD worker must not inherit them.
    // Its `/dev` devices stay writable because the worker's stdio needs them.
    expect(policy.filesystem.denyWrite).toEqual([
      '/tmp/claude',
      '/private/tmp/claude',
      join(homedir(), '.npm/_logs'),
      join(homedir(), '.claude/debug'),
    ]);
    expect(policy.filesystem.denyWrite.filter((path) => path.startsWith('/dev/'))).toEqual([]);
    expect(nativeSandboxPolicy().filesystem).toEqual({
      denyRead: policy.filesystem.denyRead,
      allowRead: [],
      allowWrite: [],
      denyWrite: policy.filesystem.denyWrite,
    });
  });
});
