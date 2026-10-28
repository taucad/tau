// @vitest-environment node
import { realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { getDefaultWritePaths } from '@anthropic-ai/sandbox-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { launchInNativeSandbox, NativeRuntimeUnavailableError, nativeSandboxPolicy } from '#index.js';
import { sandboxRuntimeJavaAgent, sandboxRuntimeSeccomp } from '#native-sandbox.js';

/** A fresh module registry per file keeps the launcher's one-time initialization observable. */
const sandbox = vi.hoisted(() => ({
  supported: true,
  dependencyErrors: [] as string[],
  initialize: vi.fn(async () => undefined),
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
  Object.defineProperty(process, 'platform', platformDescriptor);
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
