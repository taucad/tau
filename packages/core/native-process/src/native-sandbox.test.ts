// @vitest-environment node
import { realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { getDefaultWritePaths } from '@anthropic-ai/sandbox-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { launchInNativeSandbox, NativeRuntimeUnavailableError, nativeSandboxPolicy } from '#index.js';
import {
  nativeSandboxBwrap,
  nativeSandboxBwrapVariable,
  sandboxRuntimeJavaAgent,
  sandboxRuntimeSeccomp,
} from '#native-sandbox.js';

/** A fresh module registry per file keeps the launcher's one-time initialization observable. */
const sandbox = vi.hoisted(() => ({
  supported: true,
  dependencyErrors: [] as string[],
  initialize: vi.fn(async () => undefined),
  reset: vi.fn(async () => undefined),
  wrap: vi.fn<(command: string, ...rest: unknown[]) => void>(),
  wrapFailure: undefined as unknown,
  /* What the double's wrapped command looks like; `undefined` is the runtime's own shape for this platform. */
  wrapped: undefined as ((command: string) => string) | undefined,
}));
const shellQuote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;
vi.mock('@anthropic-ai/sandbox-runtime', async (importActual) => ({
  // The default write roots stay real: the profile's deny list is derived from them.
  ...(await importActual<{ getDefaultWritePaths: typeof getDefaultWritePaths }>()),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the runtime's exported class.
  SandboxManager: {
    isSupportedPlatform: () => sandbox.supported,
    checkDependenciesAsync: async () => ({ errors: sandbox.dependencyErrors, warnings: [] }),
    initialize: sandbox.initialize,
    reset: sandbox.reset,
    wrapWithSandboxArgv: async (command: string, ...rest: unknown[]) => {
      sandbox.wrap(command, ...rest);
      if (sandbox.wrapFailure !== undefined) {
        // oxlint-disable-next-line typescript/only-throw-error -- launchers can reject with bare strings.
        throw sandbox.wrapFailure;
      }
      const wrapped =
        sandbox.wrapped?.(command) ??
        (process.platform === 'darwin'
          ? `env /usr/bin/sandbox-exec -p ${shellQuote('(version 1)\n(deny default)')} /bin/sh -c ${shellQuote(command)}`
          : `bwrap --unshare-net -- /bin/sh -c ${shellQuote(command)}`);
      return { argv: ['/bin/sh', '-c', wrapped], env: process.env };
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
  sandbox.wrapped = undefined;
  sandbox.wrap.mockClear();
  sandbox.reset.mockClear();
  vi.useRealTimers();
  Object.defineProperty(process, 'platform', platformDescriptor);
  vi.unstubAllEnvs();
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
    await launchInNativeSandbox(launch);
    const [command, shell, policy, signal, workingDirectory, attribution] = sandbox.wrap.mock.calls[0]!;
    expect(command).toBe(
      String.raw`TMPDIR='/private/artifacts' TEMP='/private/artifacts' TMP='/private/artifacts' exec '/opt/it'\''s here/python' '--flag' 'a b'`,
    );
    expect(shell).toBe('/bin/sh');
    expect(signal).toBeUndefined();
    expect(workingDirectory).toBe('/private/workspace');
    expect(attribution).toEqual({ commandId: 'probe#1' });
    expect(policy).toEqual(nativeSandboxPolicy(launch));
  });
});

describe('a Linux network bridge that starts too slowly', () => {
  const bridgeFailure = (): Error => new Error('Failed to create bridge sockets after 5 attempts');
  /* A fresh module per case, so the launcher's process-wide initialization starts from nothing. */
  const freshLauncher = async (): Promise<typeof launchInNativeSandbox> => {
    vi.resetModules();
    const fresh = await import('#native-sandbox.js');
    return fresh.launchInNativeSandbox;
  };

  it('should reset the runtime and start it again, so the first launch still succeeds', async () => {
    vi.useFakeTimers();
    sandbox.initialize.mockClear();
    sandbox.initialize.mockRejectedValueOnce(bridgeFailure()).mockRejectedValueOnce(bridgeFailure());
    const launchFresh = await freshLauncher();

    const launched = launchFresh(launch);
    await vi.runAllTimersAsync();

    await expect(launched).resolves.toBeDefined();
    expect(sandbox.initialize).toHaveBeenCalledTimes(3);
    expect(sandbox.reset).toHaveBeenCalledTimes(2);
    // Each reset finished before the next start began.
    for (const [index, order] of sandbox.reset.mock.invocationCallOrder.entries()) {
      expect(order).toBeGreaterThan(sandbox.initialize.mock.invocationCallOrder[index]!);
      expect(order).toBeLessThan(sandbox.initialize.mock.invocationCallOrder[index + 1]!);
    }
  });

  it('should give up after a bounded number of starts, and let a later launch try again', async () => {
    vi.useFakeTimers();
    sandbox.initialize.mockClear();
    sandbox.initialize
      .mockRejectedValueOnce(bridgeFailure())
      .mockRejectedValueOnce(bridgeFailure())
      .mockRejectedValueOnce(bridgeFailure());
    const launchFresh = await freshLauncher();

    const failed = expect(launchFresh(launch)).rejects.toThrow(
      /sandbox could not start: Failed to create bridge sockets after 5 attempts/,
    );
    await vi.runAllTimersAsync();
    await failed;
    expect(sandbox.initialize).toHaveBeenCalledTimes(3);

    await expect(launchFresh(launch)).resolves.toBeDefined();
    expect(sandbox.initialize).toHaveBeenCalledTimes(4);
  });

  it('should not retry a failure that is not the bridge', async () => {
    sandbox.initialize.mockClear();
    sandbox.initialize.mockRejectedValueOnce(new Error('proxy bind failed'));
    const launchFresh = await freshLauncher();

    await expect(launchFresh(launch)).rejects.toThrow(/proxy bind failed/);
    expect(sandbox.initialize).toHaveBeenCalledOnce();
    expect(sandbox.reset).not.toHaveBeenCalled();
  });
});

describe('the link refusal every launch carries', () => {
  const asPlatform = (platform: NodeJS.Platform): void => {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: platform });
  };

  it('should hand bwrap the seccomp program on descriptor 3 on Linux, and refuse a vector that does not start bwrap', async () => {
    asPlatform('linux');
    sandbox.wrapped = (command) => `bwrap --unshare-net -- /bin/sh -c ${shellQuote(command)}`;
    const [shell, flag, wrapped] = await launchInNativeSandbox(launch);
    expect([shell, flag]).toEqual(['/bin/sh', '-c']);
    expect(wrapped).toMatch(/^bwrap --seccomp 3 --unshare-net -- \/bin\/sh -c '/u);

    sandbox.wrapped = (command) => `/usr/local/bin/bwrap --unshare-net -- /bin/sh -c ${shellQuote(command)}`;
    await expect(launchInNativeSandbox(launch)).rejects.toThrow(
      /the sandbox runtime did not start bwrap, so links cannot be refused/u,
    );
  });

  it('should start the bubblewrap the environment names on Linux, and refuse a vector that starts any other', async () => {
    // Stock Ubuntu 26.04 strips the nested-userns capabilities `apply-seccomp` needs from `/usr/bin/bwrap`, so a
    // packaged app runs every worker through its own AppArmor-profiled copy (qualification 41865985263 ubuntu2604-*).
    asPlatform('linux');
    const owned = '/opt/tau-staging/sandbox/bwrap';
    vi.stubEnv(nativeSandboxBwrapVariable, owned);
    sandbox.wrapped = (command) => `${owned} --unshare-net -- /bin/sh -c ${shellQuote(command)}`;
    const vector = await launchInNativeSandbox(launch);
    const wrapped = vector.at(2);
    expect(wrapped).toMatch(/^\/opt\/tau-staging\/sandbox\/bwrap --seccomp 3 --unshare-net -- \/bin\/sh -c '/u);
    const policy = sandbox.wrap.mock.calls.at(-1)![2] as { bwrapPath?: string };
    expect(policy.bwrapPath).toBe(owned);

    sandbox.wrapped = (command) => `bwrap --unshare-net -- /bin/sh -c ${shellQuote(command)}`;
    await expect(launchInNativeSandbox(launch)).rejects.toThrow(
      /the sandbox runtime did not start bwrap, so links cannot be refused/u,
    );
  });

  it('should append the Seatbelt rules inside the one profile on macOS, past every quote it holds', async () => {
    asPlatform('darwin');
    const profile = '(version 1)\n(deny default)\n(allow file-read* (subpath "/Users/o\'brien"))';
    sandbox.wrapped = (command) =>
      `env /usr/bin/sandbox-exec -p ${shellQuote(profile)} /bin/sh -c ${shellQuote(command)}`;
    const vector = await launchInNativeSandbox(launch);
    const wrapped = vector.at(2);
    const rules = '\n; Tau: no symbolic or hard link\n(deny file-write-create (vnode-type SYMLINK))\n(deny file-link)';
    expect(wrapped).toBe(
      `env /usr/bin/sandbox-exec -p ${shellQuote(`${profile}${rules}`)} /bin/sh -c ${shellQuote(sandbox.wrap.mock.calls[0]![0])}`,
    );

    sandbox.wrapped = (command) => `/bin/sh -c ${shellQuote(command)}`;
    await expect(launchInNativeSandbox(launch)).rejects.toThrow(/did not pass one Seatbelt profile/u);
  });
});

describe('nativeSandboxBwrap', () => {
  it('should name the configured bubblewrap on Linux only, and refuse a path it cannot splice unquoted', () => {
    const owned = { [nativeSandboxBwrapVariable]: '/opt/tau-staging-appimage/sandbox/bwrap' };
    expect(nativeSandboxBwrap(owned, 'linux')).toBe('/opt/tau-staging-appimage/sandbox/bwrap');
    expect(nativeSandboxBwrap(owned, 'darwin')).toBeUndefined();
    expect(nativeSandboxBwrap({}, 'linux')).toBeUndefined();
    expect(nativeSandboxBwrap({ [nativeSandboxBwrapVariable]: '' }, 'linux')).toBeUndefined();
    for (const path of ['bwrap', '/opt/x y/bwrap', '/opt/$(id)/bwrap', '/opt/../usr/bin/bwrap']) {
      expect(() => nativeSandboxBwrap({ [nativeSandboxBwrapVariable]: path }, 'linux')).toThrow(
        NativeRuntimeUnavailableError,
      );
    }
  });

  it('should carry the configured bubblewrap in the profile on Linux, and leave the runtime default otherwise', () => {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'linux' });
    expect(nativeSandboxPolicy(launch)).not.toHaveProperty('bwrapPath');
    vi.stubEnv(nativeSandboxBwrapVariable, '/opt/tau/sandbox/bwrap');
    expect(nativeSandboxPolicy(launch).bwrapPath).toBe('/opt/tau/sandbox/bwrap');
    expect(nativeSandboxPolicy().bwrapPath).toBe('/opt/tau/sandbox/bwrap');
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
    // Linux grants only the two physical vendor helper directories under otherwise denied roots.
    expect(policy.filesystem.allowRead.slice(0, 3)).toEqual([
      '/opt/runtime',
      '/private/workspace',
      '/private/artifacts',
    ]);
    expect(
      policy.filesystem.allowRead.slice(3).every((path) => /[/\\]vendor[/\\](seccomp|java-proxy-agent)$/u.test(path)),
    ).toBe(true);
    expect(new Set(policy.filesystem.allowRead.slice(3).map((path) => path.split(/[/\\]/u).at(-1)))).toEqual(
      new Set(process.platform === 'linux' ? ['seccomp', 'java-proxy-agent'] : []),
    );
    expect(policy.filesystem.allowRead.length > 3).toBe(process.platform === 'linux');
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

describe('packaged sandbox helper', () => {
  it('resolves the Linux Java agent outside ASAR and preserves ordinary installations', () => {
    expect(sandboxRuntimeJavaAgent('/tmp/app.asar/node_modules/srt/dist/index.js', 'linux')).toBe(
      join('/tmp/app.asar.unpacked/node_modules/srt/vendor/java-proxy-agent/srt-proxy-agent.jar'),
    );
    expect(sandboxRuntimeJavaAgent('/opt/srt/dist/index.js', 'linux')).toBe(
      join('/opt/srt/vendor/java-proxy-agent/srt-proxy-agent.jar'),
    );
    expect(sandboxRuntimeJavaAgent('/Applications/app.asar/srt/dist/index.js', 'darwin')).toBeUndefined();
  });
  it('uses the unpacked executable for Linux ASAR packages and leaves ordinary installations intact', () => {
    expect(
      sandboxRuntimeSeccomp(
        '/tmp/.mount_Tau/resources/app.asar/node_modules/@anthropic-ai/sandbox-runtime/dist/index.js',
        'linux',
        'x64',
      ),
    ).toEqual({
      applyPath: join(
        '/tmp/.mount_Tau/resources/app.asar.unpacked/node_modules/@anthropic-ai/sandbox-runtime/vendor/seccomp/x64/apply-seccomp',
      ),
    });
    expect(
      sandboxRuntimeSeccomp('/opt/node_modules/@anthropic-ai/sandbox-runtime/dist/index.js', 'linux', 'arm64'),
    ).toEqual({
      applyPath: join('/opt/node_modules/@anthropic-ai/sandbox-runtime/vendor/seccomp/arm64/apply-seccomp'),
    });
    expect(
      sandboxRuntimeSeccomp(
        '/Applications/Tau.app/Contents/Resources/app.asar/node_modules/@anthropic-ai/sandbox-runtime/dist/index.js',
        'darwin',
        'arm64',
      ),
    ).toBeUndefined();
  });
});
