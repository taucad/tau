/**
 * Orchestration tests for the Windows native adapter: a stand-in helper speaks the launch protocol but contains
 * nothing, so these prove ordering, settlement and recovery. Containment is proven by the helper's own Windows
 * conformance rows and by the packaged Windows Build123d suite.
 */
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureWindowsNativeSandbox,
  ensureWindowsNativeSandbox,
  isWindowsSandboxedChild,
  nativeSandboxRefusal,
  recoverWindowsNativeJournals,
  spawnWindowsNative,
  windowsNativeLaunchVector,
} from '#native-sandbox-windows.js';
import type { WindowsNativeSandboxOptions } from '#native-sandbox-windows.js';

const fixture = fileURLToPath(new URL('native-sandbox-windows.fixture.ts', import.meta.url));
const digest = 'ab'.repeat(32);

let root: string;
let journalDirectory: string;
let logPath: string;

const helper =
  (scenario: string) =>
  (arguments_: readonly string[]): ChildProcessWithoutNullStreams =>
    spawn(process.execPath, [fixture, ...arguments_], {
      env: { ...process.env, TAU_FIXTURE_SCENARIO: scenario, TAU_FIXTURE_LOG: logPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

const options = (scenario = 'echo', extra: Partial<WindowsNativeSandboxOptions> = {}): WindowsNativeSandboxOptions => ({
  helperPath: join(root, 'tau-windows-sandbox.exe'),
  journalDirectory,
  installed: async () => true,
  spawnHelper: helper(scenario),
  ...extra,
});

const events = (): Array<Record<string, unknown>> =>
  existsSync(logPath)
    ? readFileSync(logPath, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>)
    : [];

/* Real folders: the adapter passes every path as its long, resolved one. */
const request = {
  get executablePath(): string {
    return join(root, 'closure', 'python', 'python.exe');
  },
  executableSha256: digest,
  arguments: ['-I', '-B', '-u', 'worker.py'],
  get readablePaths(): string[] {
    return [join(root, 'closure'), join(root, 'mirror')];
  },
  get writablePath(): string {
    return join(root, 'artifacts');
  },
  get workingDirectory(): string {
    return join(root, 'mirror');
  },
};

const settled = async (
  child: ChildProcessWithoutNullStreams,
): Promise<{
  readonly code?: number;
  readonly error?: Error;
  readonly stdout: string;
  readonly stderr: string;
}> => {
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  return new Promise((resolve) => {
    child.once('error', (error) => {
      resolve({ error, stdout, stderr });
    });
    child.once('close', (code) => {
      resolve({ code: code ?? undefined, stdout, stderr });
    });
  });
};

const launched = async (scenario = 'echo'): Promise<ChildProcessWithoutNullStreams> => {
  configureWindowsNativeSandbox(options(scenario));
  return spawnWindowsNative(await windowsNativeLaunchVector(request), {
    cwd: request.workingDirectory,
    env: { SystemRoot: String.raw`C:\Windows`, TEMP: request.writablePath, EMPTY: undefined },
  });
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tau-native-windows-'));
  journalDirectory = join(root, 'journals');
  logPath = join(root, 'helper.log');
  mkdirSync(join(root, 'closure', 'python'), { recursive: true });
  mkdirSync(join(root, 'mirror'));
  mkdirSync(join(root, 'artifacts'));
  writeFileSync(request.executablePath, '');
});

afterEach(() => {
  configureWindowsNativeSandbox(undefined);
  rmSync(root, { recursive: true, force: true });
});

describe('the Windows native sandbox adapter', () => {
  it('should hand the helper a spec with the resolved executable, its verified digest, the grants and no network, then relay the worker', async () => {
    const child = await launched();
    expect(isWindowsSandboxedChild(child)).toBe(true);
    child.stdin.write('hello ');
    child.stdin.end('worker\n');

    const result = await settled(child);

    expect(result).toEqual({ code: 0, stdout: 'hello worker\n', stderr: 'stdin closed\n' });
    const spec = events().find((event) => event['event'] === 'spec')!['spec'] as Record<string, unknown>;
    expect(spec).toEqual({
      version: 1,
      executable: realpathSync(request.executablePath),
      executableDigest: `sha256:${digest}`,
      arguments: request.arguments,
      workingDirectory: realpathSync(request.workingDirectory),
      environment: { SystemRoot: String.raw`C:\Windows`, TEMP: request.writablePath },
      stdio: { kind: 'pipes', input: true },
      filesystem: {
        readable: request.readablePaths.map((path) => realpathSync(path)),
        writable: [realpathSync(request.writablePath)],
        readOnly: [],
        denied: [],
      },
      journal: expect.stringMatching(/[\da-f-]{36}\.acl\.json$/u) as unknown,
    });
    // Input waits for `started`; the frames go spec, start, input…, close-input.
    const frames = events()
      .filter((event) => event['event'] === 'frame')
      .map((event) => event['type']);
    expect(frames[0]).toBe(0x01);
    expect(frames[1]).toBe(0x02);
    expect(frames.at(-1)).toBe(0x06);
    expect(readdirSync(journalDirectory)).toEqual([]);
  });

  it('should end the worker through the helper’s terminate, so the helper still restores', async () => {
    const child = await launched();
    child.stdout.once('data', () => {
      child.kill();
    });
    child.stdin.write('first\n');

    const result = await settled(child);

    expect(result.code).toBe(1);
    expect(events().some((event) => event['event'] === 'frame' && event['type'] === 0x05)).toBe(true);
    expect(readdirSync(journalDirectory)).toEqual([]);
  });

  it('should report a refusal before anything ran as an error and leave no receipt', async () => {
    const result = await settled(await launched('refuse'));

    expect(result.error?.message).toBe(
      'The Windows sandbox refused the native launch: the executable digest does not match',
    );
    expect(readdirSync(journalDirectory)).toEqual([]);
  });

  it('should restore the journal itself when the helper dies before reporting the worker’s exit', async () => {
    const result = await settled(await launched('crash'));

    expect(result.error?.message).toMatch(/^The Windows sandbox helper ended before the native worker did/u);
    expect(events().filter((event) => event['event'] === 'restore')).toEqual([
      { event: 'restore', flag: '--journal', journal: expect.stringMatching(/\.acl\.json$/u) as unknown },
    ]);
    expect(readdirSync(journalDirectory)).toEqual([]);
  });

  it('should end the launch through the helper on a frame it does not understand, and report why', async () => {
    const result = await settled(await launched('garbage'));

    expect(result.error?.message).toBe(
      'The Windows sandbox launch failed: The helper sent an unknown frame type 0x7f.',
    );
    expect(events().some((event) => event['event'] === 'frame' && event['type'] === 0x05)).toBe(true);
    expect(readdirSync(journalDirectory)).toEqual([]);
  });

  it('should ask again while another sandboxed launch holds the computer, then run', async () => {
    const child = await launched('busy-once');
    child.stdin.end('after the other\n');

    const result = await settled(child);

    expect(result).toEqual({ code: 0, stdout: 'after the other\n', stderr: 'stdin closed\n' });
    expect(events().filter((event) => event['event'] === 'spec')).toHaveLength(2);
    expect(readdirSync(journalDirectory)).toEqual([]);
  });

  it('should report the busy refusal once the wait is spent, and leave no receipt', async () => {
    configureWindowsNativeSandbox(options('busy', { busyWait: 300 }));
    const child = spawnWindowsNative(await windowsNativeLaunchVector(request), {
      cwd: request.workingDirectory,
      env: {},
    });

    const result = await settled(child);

    expect(result.error?.message).toMatch(
      /^The Windows sandbox refused the native launch: another sandboxed launch is running on this computer/u,
    );
    expect(events().filter((event) => event['event'] === 'spec').length).toBeGreaterThan(1);
    expect(readdirSync(journalDirectory)).toEqual([]);
  });

  it('should restore through the helper when it reports that its cleanup failed', async () => {
    const child = await launched('cleanup-failed');
    const result = await settled(child);

    expect(result.error?.message).toBe(
      "The Windows sandbox could not confirm the native worker's cleanup: the job still has a process",
    );
    expect(events().some((event) => event['event'] === 'restore')).toBe(true);
    expect(readdirSync(journalDirectory)).toEqual([]);
  });
});

describe('ensureWindowsNativeSandbox', () => {
  it('should be unavailable until configured, and on a computer without the setup unless it may run it', async () => {
    await expect(ensureWindowsNativeSandbox()).rejects.toThrow('the Windows sandbox is not enabled in this Tau build');
    configureWindowsNativeSandbox(options('echo', { installed: async () => false }));
    await expect(ensureWindowsNativeSandbox()).rejects.toThrow(
      'the Windows sandbox has not been set up on this computer',
    );
  });

  it('should run the one-time setup once, and again after a declined prompt', async () => {
    let installed = false;
    const setup = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('The person declined the setup prompt.'))
      .mockImplementation(async () => {
        installed = true;
      });
    configureWindowsNativeSandbox(options('echo', { installed: async () => installed, setup }));

    await expect(ensureWindowsNativeSandbox()).rejects.toThrow('The person declined the setup prompt.');
    await ensureWindowsNativeSandbox();
    await ensureWindowsNativeSandbox();

    expect(setup).toHaveBeenCalledTimes(2);
  });

  it('should refuse a launch without a well-formed verified digest', async () => {
    configureWindowsNativeSandbox(options());
    await expect(windowsNativeLaunchVector({ ...request, executableSha256: 'ABC' })).rejects.toThrow(
      'a native launch on Windows needs its executable’s verified sha256 digest',
    );
  });
});

describe('nativeSandboxRefusal', () => {
  it('should refuse a Windows host until it configures the helper, and never another OS', () => {
    expect(nativeSandboxRefusal({ os: 'win32' }, '@taucad/build123d')).toBe(
      'Native kernels do not run on Windows in this Tau: it has no Windows sandbox, and no native worker runs unsandboxed. Use macOS or Linux (glibc) for @taucad/build123d.',
    );
    expect(nativeSandboxRefusal({ os: 'linux' }, '@taucad/build123d')).toBeUndefined();
    configureWindowsNativeSandbox(options());
    expect(nativeSandboxRefusal({ os: 'win32' }, '@taucad/build123d')).toBeUndefined();
  });
});

describe('recoverWindowsNativeJournals', () => {
  it('should restore what a dead launch left and leave a live launch alone', async () => {
    const dead = '11111111-1111-4111-8111-111111111111';
    const live = '22222222-2222-4222-8222-222222222222';
    configureWindowsNativeSandbox(undefined);
    const sandbox = options('echo', { processAlive: (pid) => pid === 4242 });
    await recoverWindowsNativeJournals(sandbox);
    writeFileSync(
      join(journalDirectory, `${dead}.native.json`),
      JSON.stringify({ version: 1, executionId: dead, owner: { pid: 4141 }, launcherPid: 4143, runnerPid: 4144 }),
    );
    writeFileSync(join(journalDirectory, `${dead}.acl.json`), '{}');
    writeFileSync(
      join(journalDirectory, `${live}.native.json`),
      JSON.stringify({ version: 1, executionId: live, owner: { pid: 4242 } }),
    );
    writeFileSync(join(journalDirectory, `${live}.acl.json`), '{}');

    await recoverWindowsNativeJournals(sandbox);

    expect(readdirSync(journalDirectory).toSorted()).toEqual([`${live}.acl.json`, `${live}.native.json`]);
    expect(events()).toEqual([
      { event: 'restore', flag: '--journal', journal: expect.stringContaining(`${dead}.acl.json`) as unknown },
    ]);
  });
});
