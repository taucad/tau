/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
// @vitest-environment node
/*
 * The native shell conformance suite (testing contract: `native-process-core:test:shell-conformance`, T02 and the
 * E rows a provider owns). It runs the real sandbox provider and the machine's own Bash, never a fixture or a mock:
 * every row starts with a positive control that must succeed inside the same sandbox, then the negatives, and every
 * network negative is judged by a canary listener outside the sandbox, not by the sandboxed command's own report.
 *
 * Off unless `TAU_SHELL_CONFORMANCE=1`, which only the noncacheable Nx target sets. `TAU_SHELL_CONFORMANCE_ROW` names
 * the row (LNX-U, LNX-D, MAC-A, MAC-X), `TAU_SHELL_CONFORMANCE_RECEIPT` where the JSON receipt goes, and on Linux
 * `TAU_SHELL_CONFORMANCE_BWRAP` the installed, profiled bubblewrap. macOS terminal rows are recorded
 * `operator-validation-pending` and never run here (ruling 2026-10-24T05:39Z).
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { lookup } from 'node:dns/promises';
import { createServer as createHttpServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:net';
import type { AddressInfo, Server } from 'node:net';
import { arch, networkInterfaces, platform, release, tmpdir, version } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveShellExecutable, shellCommandArguments, shellVersionCommand } from '#shell/shell-identity.js';
import type { ShellExecutable } from '#shell/shell-identity.js';
import type { ShellLaunch, ShellProcess, ShellProvider } from '#shell/shell-provider.js';
import { createSandboxShellProvider } from '#shell/srt-shell-provider.js';

const enabled = process.env['TAU_SHELL_CONFORMANCE'] === '1';
const row = process.env['TAU_SHELL_CONFORMANCE_ROW'] ?? 'unnamed';
const linux = process.platform === 'linux';
const bwrapPath = process.env['TAU_SHELL_CONFORMANCE_BWRAP'] ?? '/usr/bin/bwrap';
const resolveFromHere = createRequire(import.meta.url);

type RowResult = Readonly<{
  id: string;
  title: string;
  status: 'pass' | 'fail' | 'operator-validation-pending' | 'residual-disclosed';
  detail?: string;
}>;

const results: RowResult[] = [];

/** A conformance row: the outcome lands in the receipt whether it passes or fails. */
const conformance = (id: string, title: string, body: () => Promise<void>): void => {
  it(`${id}: ${title}`, { timeout: 60_000 }, async () => {
    try {
      await body();
      results.push({ id, title, status: 'pass' });
    } catch (error) {
      results.push({ id, title, status: 'fail', detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });
};

const digestOf = (path: string): string => `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;

const commandOutput = (file: string, arguments_: readonly string[]): string => {
  try {
    return execFileSync(file, arguments_, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message.split('\n')[0]! : String(error)}`;
  }
};

const text = async (chunks: AsyncIterable<Uint8Array<ArrayBuffer>>): Promise<string> => {
  const decoder = new TextDecoder();
  let result = '';
  for await (const chunk of chunks) {
    result += decoder.decode(chunk, { stream: true });
  }
  return result + decoder.decode();
};

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

let root = '';
let work = '';
let readonly = '';
let secret = '';
let outside = '';
let home = '';
let shell: ShellExecutable;
let provider: ShellProvider;
let shellVersion = '';
let ready = false;

const launchOf = (command: string, overrides: Partial<ShellLaunch> = {}): ShellLaunch => ({
  /* Prepared in `start`; a launch refused at admission never reaches custody. */
  executionId: '',
  executablePath: shell.path,
  arguments: shellCommandArguments('bash', command),
  workingDirectory: work,
  commandId: `conformance#${String(results.length + 1)}`,
  filesystem: { readable: [readonly, home], writable: [work], denied: [secret] },
  network: { domains: [] },
  environment: { PATH: '/usr/bin:/bin', HOME: work, TMPDIR: work, LANG: 'C' },
  stdio: { kind: 'pipes' },
  signal: new AbortController().signal,
  ...overrides,
});

const start = async (launch: ShellLaunch, through: ShellProvider = provider): Promise<ShellProcess> => {
  const privateRoot = mkdtempSync(join(tmpdir(), 'tau-shell-'));
  const { executionId } = await through.prepare({ privateRoot, resource: undefined });
  const outcome = await through.launch({ ...launch, executionId });
  if (outcome.status !== 'started') {
    throw new Error(`the provider did not start the launch: ${JSON.stringify(outcome)}`);
  }
  return outcome.process;
};

/** Run one command to completion in the sandbox and collect what it printed. */
const run = async (
  command: string,
  overrides: Partial<ShellLaunch> = {},
  through: ShellProvider = provider,
): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> => {
  const process_ = await start(launchOf(command, overrides), through);
  if (process_.kind !== 'pipes') {
    throw new Error('expected a pipes launch');
  }
  const [stdout, stderr, exit] = await Promise.all([text(process_.stdout), text(process_.stderr), process_.exited]);
  return { stdout, stderr, exitCode: 'exitCode' in exit ? exit.exitCode : undefined };
};

/** A loopback-and-interface TCP listener outside the sandbox that counts every connection it ever sees. */
const canary = async (): Promise<{ server: Server; port: number; connections: () => number }> => {
  let connections = 0;
  const server = createServer((socket) => {
    connections += 1;
    socket.end('HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '0.0.0.0', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { server, port, connections: () => connections };
};

type EndpointRequest = Readonly<{ url: string; host: string; authorization: boolean }>;

/**
 * A controlled granted endpoint outside the sandbox (W7, replacing C04's public origin): an HTTP server on loopback
 * that records every request, and the real supervisor preloaded with `controlled-endpoint.fixture.ts`, which resolves
 * the given names to a public stand-in address and connects that address here.
 */
const controlledEndpoint = async (
  names: readonly string[],
): Promise<{
  server: HttpServer;
  port: number;
  requests: EndpointRequest[];
  supervisor: Readonly<{ executablePath: string; arguments: readonly string[] }>;
}> => {
  const requests: EndpointRequest[] = [];
  const server = createHttpServer((request, response) => {
    requests.push({
      /* A proxied request arrives in absolute form; the path is what the test asked for. */
      url: new URL(request.url ?? '', 'http://endpoint.invalid').pathname,
      host: (request.headers.host ?? '').replace(/:\d+$/u, ''),
      authorization:
        request.headers.authorization !== undefined || request.headers['proxy-authorization'] !== undefined,
    });
    response.writeHead(200, { 'content-type': 'text/plain', connection: 'close' }).end('CONTROLLED-ENDPOINT');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  const preload = new URL('controlled-endpoint.fixture.ts', import.meta.url);
  preload.search = new URLSearchParams({ port: String(port), names: names.join(',') }).toString();
  return {
    server,
    port,
    requests,
    supervisor: {
      executablePath: process.execPath,
      arguments: ['--import', preload.href, fileURLToPath(new URL('srt-supervisor.ts', import.meta.url))],
    },
  };
};

const interfaceAddress = (): string | undefined =>
  Object.values(networkInterfaces())
    .flat()
    .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;

const nodePtyBinary = (): string | undefined => {
  const base = dirname(resolveFromHere.resolve('node-pty/package.json'));
  return [
    join(base, 'build', 'Release', 'pty.node'),
    join(base, 'prebuilds', `${process.platform}-${process.arch}`, 'pty.node'),
  ].find((path) => existsSync(path));
};

const operatingSystem = (): Record<string, string> => {
  if (process.platform === 'darwin') {
    return {
      productVersion: commandOutput('/usr/bin/sw_vers', ['-productVersion']),
      buildVersion: commandOutput('/usr/bin/sw_vers', ['-buildVersion']),
    };
  }
  const osRelease = existsSync('/etc/os-release') ? readFileSync('/etc/os-release', 'utf8') : '';
  const field = (name: string): string => new RegExp(`^${name}="?([^"\\n]*)"?$`, 'mu').exec(osRelease)?.[1] ?? '';
  return { id: field('ID'), versionId: field('VERSION_ID'), prettyName: field('PRETTY_NAME') };
};

const linuxSecurity = (): Record<string, string> | undefined => {
  if (!linux) {
    return undefined;
  }
  const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8').trim() : 'absent');
  return {
    apparmorEnabled: read('/sys/module/apparmor/parameters/enabled'),
    restrictUnprivilegedUserns: read('/proc/sys/kernel/apparmor_restrict_unprivileged_userns'),
    unprivilegedUsernsClone: read('/proc/sys/kernel/unprivileged_userns_clone'),
  };
};

const receipt = (): Record<string, unknown> => {
  const runtimeRoot = dirname(resolveFromHere.resolve('@anthropic-ai/sandbox-runtime/package.json'));
  const runtime = JSON.parse(readFileSync(join(runtimeRoot, 'package.json'), 'utf8')) as { version: string };
  const pty = JSON.parse(readFileSync(resolveFromHere.resolve('node-pty/package.json'), 'utf8')) as { version: string };
  const ptyBinary = nodePtyBinary();
  const seccomp = join(runtimeRoot, 'vendor', 'seccomp', process.arch === 'arm64' ? 'arm64' : 'x64', 'apply-seccomp');
  const server = process.env['GITHUB_SERVER_URL'];
  const repository = process.env['GITHUB_REPOSITORY'];
  const runId = process.env['GITHUB_RUN_ID'];
  return {
    schema: 'tau.shell-conformance.receipt/1',
    row,
    recordedAt: new Date().toISOString(),
    source: {
      sha: process.env['GITHUB_SHA'] ?? commandOutput('git', ['rev-parse', 'HEAD']),
      run: server && repository && runId ? `${server}/${repository}/actions/runs/${runId}` : 'local',
    },
    host: {
      platform: platform(),
      arch: arch(),
      kernel: release(),
      kernelVersion: version(),
      os: operatingSystem(),
      filesystemType: `0x${statfsSync(root).type.toString(16)}`,
      linuxSecurity: linuxSecurity(),
    },
    node: { version: process.versions.node, abi: process.versions.modules, electron: process.versions['electron'] },
    provider: {
      name: provider.name,
      sandboxRuntime: runtime.version,
      seccompHelper: linux && existsSync(seccomp) ? { path: seccomp, digest: digestOf(seccomp) } : undefined,
      bwrap: linux
        ? {
            path: bwrapPath,
            realPath: realpathSync(bwrapPath),
            digest: digestOf(bwrapPath),
            version: commandOutput(bwrapPath, ['--version']),
          }
        : undefined,
      seatbelt:
        process.platform === 'darwin'
          ? { path: '/usr/bin/sandbox-exec', digest: digestOf('/usr/bin/sandbox-exec') }
          : undefined,
    },
    shell: { ...shell, version: shellVersion },
    nodePty: {
      version: pty.version,
      binary: ptyBinary,
      digest: ptyBinary === undefined ? undefined : digestOf(ptyBinary),
    },
    results,
  };
};

describe.runIf(enabled)('shell conformance', () => {
  beforeAll(async () => {
    if (process.platform !== 'linux' && process.platform !== 'darwin') {
      throw new Error(`${process.platform} is not a row of this suite yet.`);
    }
    if (linux && !existsSync(bwrapPath)) {
      throw new Error(`no bubblewrap at ${bwrapPath}; a conformance row never falls back to another one.`);
    }
    const resolved = await resolveShellExecutable({ platform: process.platform, environment: process.env });
    if ('status' in resolved) {
      throw new Error(resolved.message);
    }
    shell = resolved;
    root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-shell-conformance-')));
    work = join(root, 'work');
    readonly = join(root, 'readonly');
    secret = join(root, 'secret');
    outside = join(root, 'outside');
    home = join(root, 'home');
    for (const directory of [work, readonly, secret, outside, join(home, '.ssh')]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(join(readonly, 'granted.txt'), 'GRANTED-READ\n');
    writeFileSync(join(secret, 'canary.txt'), 'SECRET-CANARY\n');
    writeFileSync(join(outside, 'canary.txt'), 'OUTSIDE-CANARY\n');
    writeFileSync(join(home, 'notes.txt'), 'HOME-NOTES\n');
    writeFileSync(join(home, '.ssh', 'id_canary'), 'SSH-CANARY\n');
    provider = createSandboxShellProvider({ bwrapPath, home });
    ready = true;
  });

  afterAll(() => {
    const path = process.env['TAU_SHELL_CONFORMANCE_RECEIPT'];
    if (path !== undefined && ready) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(receipt(), undefined, 2)}\n`);
    }
    if (root !== '') {
      rmSync(root, { recursive: true, force: true });
    }
  });

  conformance('C01', 'the fixed-path Bash runs in the sandbox and reports its version', async () => {
    const result = await run(shellVersionCommand('bash'));

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+/u);
    shellVersion = result.stdout;
  });

  conformance('C02', 'granted roots read and write; denied, ungranted and baseline paths do not', async () => {
    const positive = await run('cat ../readonly/granted.txt ../home/notes.txt && printf WROTE > out.txt');

    expect(positive.exitCode, positive.stderr).toBe(0);
    expect(positive.stdout).toBe('GRANTED-READ\nHOME-NOTES\n');
    expect(readFileSync(join(work, 'out.txt'), 'utf8')).toBe('WROTE');

    const before = [join(secret, 'canary.txt'), join(outside, 'canary.txt'), join(home, '.ssh', 'id_canary')].map(
      (path) => digestOf(path),
    );
    /* Reads and writes the mount table refuses must fail inside the sandbox. */
    const refused = [
      `cat ${secret}/canary.txt`,
      `cat ${outside}/canary.txt`,
      `cat ${home}/.ssh/id_canary`,
      `printf X > ${readonly}/written.txt`,
      `printf X > ${outside}/written.txt`,
    ];
    /*
     * A denied path inside a granted root may be masked by a private empty mount (bubblewrap's tmpfs) rather than
     * refused, so a write there can succeed into the mask. Only the bytes outside the sandbox judge it.
     */
    const masked = [`printf X > ${secret}/canary.txt`, `printf X > ${home}/.ssh/id_canary`];
    const outcomes = await Promise.all([...refused, ...masked].map(async (probe) => run(probe)));

    expect(outcomes.slice(0, refused.length).map((outcome) => outcome.exitCode !== 0)).toStrictEqual(
      refused.map(() => true),
    );
    expect(outcomes.map((outcome) => outcome.stdout).join('')).not.toMatch(/CANARY/u);
    expect(existsSync(join(readonly, 'written.txt')) || existsSync(join(outside, 'written.txt'))).toBe(false);
    expect(
      [join(secret, 'canary.txt'), join(outside, 'canary.txt'), join(home, '.ssh', 'id_canary')].map((path) =>
        digestOf(path),
      ),
    ).toStrictEqual(before);
  });

  conformance(
    'C10',
    'a read-only path inside a writable root reads but cannot be written, moved or replaced',
    async () => {
      const records = join(work, 'records');
      const record = join(records, 'chat.json');
      mkdirSync(records, { recursive: true });
      writeFileSync(record, 'RECORD-ORIGINAL\n');
      const filesystem = { readable: [readonly, home], writable: [work], readOnly: [records], denied: [secret] };
      const positive = await run('cat records/chat.json && printf WROTE > beside.txt', { filesystem });

      expect(positive.exitCode, positive.stderr).toBe(0);
      expect(positive.stdout).toBe('RECORD-ORIGINAL\n');
      expect(readFileSync(join(work, 'beside.txt'), 'utf8')).toBe('WROTE');

      const before = digestOf(record);
      const refused = [
        'printf X > records/chat.json',
        'printf X > records/new.json',
        'rm records/chat.json',
        'mv records/chat.json moved.json',
        'mv records records-moved',
        'rm -rf records',
      ];
      const outcomes = await Promise.all(refused.map(async (probe) => run(probe, { filesystem })));

      expect(outcomes.map((outcome) => outcome.exitCode !== 0)).toStrictEqual(refused.map(() => true));
      expect(digestOf(record)).toBe(before);
      /* A move out of a read-only mount falls back to copy-then-unlink: the copy a read allows may land, the unlink
       * never does, so the record stays where it was. */
      expect(existsSync(join(records, 'new.json'))).toBe(false);
      expect(existsSync(join(work, 'records-moved'))).toBe(false);
    },
  );

  conformance(
    'C13',
    'reserved containers keep future names off the host while authored and record access stays exact',
    async () => {
      const reserved = join(work, '.tau');
      const authored = join(reserved, 'parameters');
      const records = join(reserved, 'chats');
      const agents = join(reserved, 'AGENTS.md');
      for (const directory of [authored, records]) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(agents, 'AUTHORED');
      writeFileSync(join(records, 'record.json'), 'RECORD');
      writeFileSync(join(reserved, 'hidden'), 'HIDDEN-CANARY');
      writeFileSync(join(authored, 'private'), 'NESTED-CANARY');
      // Prove the test owner can create the future name before testing containment.
      writeFileSync(join(reserved, 'future'), 'OWNER-CONTROL');
      rmSync(join(reserved, 'future'));
      const filesystem = {
        readable: [readonly, home],
        writable: [work, authored, agents],
        readOnly: [records],
        denied: [secret, join(reserved, 'hidden'), join(authored, 'private')],
        masked: [reserved],
      };
      const positive = await run(
        'printf UPDATED > .tau/AGENTS.md && printf CHILD > .tau/parameters/value && cat .tau/chats/record.json',
        { filesystem },
      );
      expect(positive.exitCode, positive.stderr).toBe(0);
      expect(positive.stdout).toBe('RECORD');
      expect(readFileSync(agents, 'utf8')).toBe('UPDATED');
      expect(readFileSync(join(authored, 'value'), 'utf8')).toBe('CHILD');
      const before = digestOf(join(records, 'record.json'));
      const probes = [
        'printf UNKNOWN > .tau/future',
        'mkdir .tau/future-dir',
        'printf CHANGED > .tau/chats/record.json',
        'cat .tau/hidden',
        'cat .tau/parameters/private',
        'printf CHANGED > .tau/parameters/private',
      ];
      const outcomes = await Promise.all(probes.map(async (command) => run(command, { filesystem })));
      expect(outcomes.map((outcome) => outcome.stdout).join('')).not.toMatch(/HIDDEN-CANARY|NESTED-CANARY/u);
      expect(readFileSync(join(authored, 'private'), 'utf8')).toBe('NESTED-CANARY');
      expect(existsSync(join(reserved, 'future'))).toBe(false);
      expect(existsSync(join(reserved, 'future-dir'))).toBe(false);
      expect(digestOf(join(records, 'record.json'))).toBe(before);
      expect(readFileSync(join(reserved, 'hidden'), 'utf8')).toBe('HIDDEN-CANARY');
      if (linux) {
        const fileOperations = [
          'rm .tau/AGENTS.md',
          'printf REPLACEMENT > replacement && mv replacement .tau/AGENTS.md',
        ];
        const limited = await Promise.all(fileOperations.map(async (command) => run(command, { filesystem })));
        expect(limited.every((outcome) => outcome.exitCode !== 0)).toBe(true);
        expect(readFileSync(agents, 'utf8')).toBe('UPDATED');
      }
    },
  );

  conformance('C14', 'future folded reserved containers cannot receive hidden host writes', async () => {
    const project = join(work, 'folded-containers');
    mkdirSync(project, { recursive: true });
    const aliases = ['.TAU', '.tau.', '.tau:alias'];
    // Prove every spelling is writable by the owner, then remove it before sandbox admission.
    for (const name of aliases) {
      const path = join(project, name);
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'unknown'), 'OWNER-CONTROL');
      expect(readFileSync(join(path, 'unknown'), 'utf8')).toBe('OWNER-CONTROL');
      rmSync(path, { recursive: true });
    }
    const reserved = join(project, '.tau');
    mkdirSync(reserved);
    const filesystem = { readable: [readonly, home], writable: [project], denied: [secret], masked: [reserved] };
    const positive = await run('printf AUTHORED > authored.txt', { filesystem, workingDirectory: project });
    expect(positive.exitCode, positive.stderr).toBe(0);
    expect(readFileSync(join(project, 'authored.txt'), 'utf8')).toBe('AUTHORED');
    await Promise.all(
      aliases.map(async (name) =>
        run(`mkdir -p '${name}' && printf HIDDEN > '${name}/unknown'`, { filesystem, workingDirectory: project }),
      ),
    );
    expect(aliases.map((name) => ({ name, persisted: existsSync(join(project, name, 'unknown')) }))).toEqual(
      aliases.map((name) => ({ name, persisted: false })),
    );
  });

  conformance('C15', 'an absent masked container does not prevent ordinary project work', async () => {
    const project = join(work, 'absent-container');
    mkdirSync(project);
    const reserved = join(project, '.tau');
    const filesystem = {
      readable: [readonly, home],
      writable: [project],
      readOnly: [join(reserved, 'chats')],
      denied: [secret, join(reserved, 'host')],
      masked: [reserved],
    };
    expect(existsSync(reserved)).toBe(false);
    const positive = await run('printf AUTHORED > authored.txt && cat authored.txt', {
      filesystem,
      workingDirectory: project,
    });
    expect(positive.exitCode, positive.stderr).toBe(0);
    expect(positive.stdout).toBe('AUTHORED');
    expect(readFileSync(join(project, 'authored.txt'), 'utf8')).toBe('AUTHORED');
    await run('mkdir -p .tau; printf HIDDEN > .tau/unknown', { filesystem, workingDirectory: project });
    expect(existsSync(join(reserved, 'unknown'))).toBe(false);
    expect(existsSync(reserved)).toBe(false);
  });

  conformance(
    'C16',
    'entries hidden only by a reserved container stay unreadable, unlisted and unlinkable',
    async () => {
      const project = join(work, 'region-probes');
      const reserved = join(project, '.tau');
      const authored = join(reserved, 'parameters');
      const agents = join(reserved, 'AGENTS.md');
      const regionOnly = join(reserved, 'region-only');
      const hiddenDirectory = join(reserved, 'hidden-dir');
      // A child opened two levels down: its parent must stay traversable without listing hidden siblings.
      const nested = join(reserved, 'a', 'b');
      mkdirSync(authored, { recursive: true });
      mkdirSync(hiddenDirectory);
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(reserved, 'a', 'hidden-sibling'), 'SIBLING-CANARY');
      writeFileSync(agents, 'AUTHORED');
      writeFileSync(regionOnly, 'REGION-CANARY');
      writeFileSync(join(hiddenDirectory, 'inner'), 'HIDDEN-DIR-CANARY');
      const filesystem = {
        readable: [readonly, home],
        writable: [project, authored, agents, nested],
        denied: [secret],
        masked: [reserved],
      };
      const positive = await run(
        'cat .tau/AGENTS.md && ls .tau/parameters && cd .tau/parameters && printf CHILD > value && cd ../.. && realpath .tau/parameters && printf NESTED > .tau/a/b/value && ls .tau/a/b && (cd .tau/a/b && pwd -P) && realpath .tau/a/b',
        { filesystem, workingDirectory: project },
      );
      expect(positive.exitCode, positive.stderr).toBe(0);
      expect(positive.stdout).toContain('AUTHORED');
      expect(readFileSync(join(authored, 'value'), 'utf8')).toBe('CHILD');
      expect(readFileSync(join(nested, 'value'), 'utf8')).toBe('NESTED');
      if (process.platform === 'darwin') {
        // Positive control for the upper-cased probe below: an authored child is reachable through the same
        // spelling, so a refusal of the hidden entry there is the mask's doing, not an unresolvable path.
        const upper = await run('U=$(pwd | tr a-z A-Z); cat "$U/.tau/AGENTS.md"', {
          filesystem,
          workingDirectory: project,
        });
        expect(upper.exitCode, upper.stderr).toBe(0);
        expect(upper.stdout).toBe('AUTHORED');
      }
      // Each probe names a different way to observe an entry the mask alone hides; the macOS one spells the
      // checkout in upper case, which a case-insensitive volume resolves to the same directory.
      const probes = [
        'ls -a .tau/a',
        'cat .tau/region-only',
        'ls -a .tau',
        'ln .tau/region-only linked && cat linked',
        'ls -ld .tau/hidden-dir',
        'ls .tau/hidden-dir; cat .tau/hidden-dir/inner',
        '[ -e .tau/region-only ] && echo VISIBLE-FILE; [ -e .tau/hidden-dir ] && echo VISIBLE-DIR; true',
        'U=$(pwd | tr a-z A-Z); printf UNKNOWN > "$U/.tau/future"; cat "$U/.tau/region-only"; ls -a "$U/.tau"; ls -ld "$U/.tau/hidden-dir"',
      ];
      const outcomes = await Promise.all(
        probes.map(async (command) => ({
          command,
          ...(await run(command, { filesystem, workingDirectory: project })),
        })),
      );
      const leaks = outcomes
        .filter(({ stdout }) =>
          /REGION-CANARY|HIDDEN-DIR-CANARY|SIBLING-CANARY|region-only|hidden-dir|hidden-sibling|VISIBLE/u.test(stdout),
        )
        .map(({ command, stdout }) => ({ command, stdout }));
      expect(leaks).toEqual([]);
      expect(existsSync(join(project, 'linked'))).toBe(false);
      expect(existsSync(join(reserved, 'future'))).toBe(false);
      expect(readFileSync(regionOnly, 'utf8')).toBe('REGION-CANARY');
      // Compare the error for a hidden entry with the error for an absent name. Linux shows neither, so both
      // are ENOENT. Seatbelt can only refuse, so macOS reports EPERM for an existing hidden name: a guessed
      // name can be confirmed, never read. The disclosure on ShellFilesystem.masked states this.
      const errorFor = async (name: string): Promise<string> => {
        const { stderr } = await run(`stat .tau/${name}`, { filesystem, workingDirectory: project });
        return stderr.replaceAll(name, 'NAME');
      };
      const [hiddenError, absentError] = await Promise.all([errorFor('region-only'), errorFor('absent-name')]);
      expect(absentError).toMatch(/No such file/u);
      if (process.platform === 'darwin') {
        expect(hiddenError).toMatch(/Operation not permitted/u);
      } else {
        expect(hiddenError).toBe(absentError);
      }
    },
  );

  conformance(
    'C17',
    'an absent reserved path shared by overlapping launches stays covered until the last of them ends',
    async () => {
      const project = join(work, 'shared-absent');
      const sync = join(work, 'shared-sync');
      mkdirSync(project);
      mkdirSync(sync);
      const reserved = join(project, '.tau');
      const control = join(project, '.git');
      const filesystem = {
        readable: [readonly, home],
        writable: [project, sync],
        readOnly: [join(reserved, 'chats')],
        denied: [secret, join(reserved, 'binding.json'), control],
        masked: [reserved],
      };
      const signal = (name: string): string => join(sync, name);
      const waitFor = (name: string): string => `while [ ! -f ${signal(name)} ]; do sleep 0.02; done`;
      const until = async (name: string): Promise<void> => {
        for (let attempt = 0; attempt < 1500 && !existsSync(signal(name)); attempt++) {
          // oxlint-disable-next-line no-await-in-loop -- a bounded wait for the sandbox's own signal file.
          await delay(20);
        }
        expect(existsSync(signal(name)), name).toBe(true);
      };
      // The first launch stays up while the second is configured, then ends before the second writes.
      const first = run(`printf ready > ${signal('first-ready')}; ${waitFor('first-release')}; printf FIRST`, {
        filesystem,
        workingDirectory: project,
        commandId: 'conformance#c17-first',
      });
      await until('first-ready');
      const second = run(
        [
          `printf ready > ${signal('second-ready')}`,
          waitFor('second-write'),
          'mkdir -p .tau 2>/dev/null && printf LEAK > .tau/leak 2>/dev/null',
          'printf LEAK > .tau/binding.json 2>/dev/null',
          'printf LEAK > .git 2>/dev/null',
          'printf SECOND',
        ].join('; '),
        { filesystem, workingDirectory: project, commandId: 'conformance#c17-second' },
      );
      await until('second-ready');
      writeFileSync(signal('first-release'), '');
      const ended = await first;
      expect(ended.exitCode, ended.stderr).toBe(0);
      expect(ended.stdout).toBe('FIRST');
      writeFileSync(signal('second-write'), '');
      const written = await second;
      expect(written.exitCode, written.stderr).toBe(0);
      expect(written.stdout).toBe('SECOND');
      expect(existsSync(join(reserved, 'leak'))).toBe(false);
      expect(existsSync(join(reserved, 'binding.json'))).toBe(false);
      expect(existsSync(control) ? readFileSync(control, 'utf8') : 'absent').not.toContain('LEAK');
      // Nothing either launch relied on is left behind on the host.
      expect(existsSync(reserved)).toBe(false);
      expect(existsSync(control)).toBe(false);
    },
  );

  conformance(
    'C18',
    'an absent protected directory row is never a file on the host while a launch is live',
    async () => {
      const project = join(work, 'runs-row');
      const sync = join(work, 'runs-sync');
      mkdirSync(join(project, '.tau', 'parameters'), { recursive: true });
      mkdirSync(sync);
      const runs = join(project, '.tau', 'runs');
      const filesystem = {
        readable: [readonly, home],
        writable: [project, join(project, '.tau', 'parameters'), sync],
        readOnly: [runs],
        denied: [secret],
        masked: [join(project, '.tau')],
        directories: [runs],
      };
      const live = run(
        [
          `printf ready > ${join(sync, 'ready')}`,
          `while [ ! -f ${join(sync, 'release')} ]; do sleep 0.02; done`,
          '(printf FORGED > .tau/runs/forged.json) 2>/dev/null || printf REFUSED',
        ].join('; '),
        { filesystem, workingDirectory: project, commandId: 'conformance#c18-live' },
      );
      for (let attempt = 0; attempt < 1500 && !existsSync(join(sync, 'ready')); attempt++) {
        // oxlint-disable-next-line no-await-in-loop -- a bounded wait for the sandbox's own signal file.
        await delay(20);
      }
      expect(existsSync(join(sync, 'ready'))).toBe(true);
      // What the revisions engine does with its records while the session is live: test, list, then write.
      const during = lstatSync(runs, { throwIfNoEntry: false });
      expect(during === undefined || during.isDirectory(), 'a file stands where a directory row belongs').toBe(true);
      if (during !== undefined) {
        expect(readdirSync(runs)).toStrictEqual([]);
      }
      mkdirSync(runs, { recursive: true });
      writeFileSync(join(runs, 'lease.json'), '{"lease":"HOST"}\n');
      writeFileSync(join(sync, 'release'), '');
      const ended = await live;
      expect(ended.exitCode, ended.stderr).toBe(0);
      expect(ended.stdout).toBe('REFUSED');
      expect(existsSync(join(runs, 'forged.json'))).toBe(false);
      // The host's own record survives the launch's release.
      expect(readFileSync(join(runs, 'lease.json'), 'utf8')).toBe('{"lease":"HOST"}\n');
    },
  );

  conformance('C03', 'startup hooks are refused and the shell sees only the environment it was given', async () => {
    const positive = await run('printf %s "$GIVEN"', {
      environment: { PATH: '/usr/bin:/bin', HOME: work, LANG: 'C', GIVEN: 'GIVEN-VALUE' },
    });

    expect(positive.stdout).toBe('GIVEN-VALUE');

    const hooked = await provider.launch(
      launchOf('true', { environment: { PATH: '/usr/bin:/bin', BASH_ENV: join(outside, 'canary.txt') } }),
    );
    const environment = await run('env');

    expect(hooked.status).toBe('unsupported');
    expect(environment.stdout).not.toMatch(
      /^(?:SSH_AUTH_SOCK|DBUS_SESSION_BUS_ADDRESS|XDG_RUNTIME_DIR|GITHUB_TOKEN)=/mu,
    );
  });

  conformance('C04', 'a granted name is reachable through the launch proxy, and only that name', async () => {
    /* A controlled endpoint (W7): the granted name lands on this test's own server, so no public origin is a fixture. */
    const endpoint = await controlledEndpoint(['granted.tau-qualification.test', 'other.tau-qualification.test']);
    try {
      const control = await fetch(`http://127.0.0.1:${String(endpoint.port)}/control`);

      expect(control.status).toBe(200);
      const granted = createSandboxShellProvider({ bwrapPath, home, supervisor: endpoint.supervisor });
      const reached = await run(
        'curl -sS --max-time 20 http://granted.tau-qualification.test/granted',
        {
          network: { domains: ['granted.tau-qualification.test'] },
        },
        granted,
      );

      expect(reached.stdout, reached.stderr).toBe('CONTROLLED-ENDPOINT');
      const refused = await run(
        'curl -fsS --max-time 10 http://other.tau-qualification.test/other',
        {
          network: { domains: ['granted.tau-qualification.test'] },
        },
        granted,
      );

      expect(refused.exitCode).not.toBe(0);
      /* The endpoint is the judge: the control and the granted request, nothing for the ungranted name, and no proxy
       * credential forwarded to the destination. */
      expect(endpoint.requests.map(({ url }) => url)).toStrictEqual(['/control', '/granted']);
      expect(endpoint.requests[1]?.host).toBe('granted.tau-qualification.test');
      expect(endpoint.requests.some(({ authorization }) => authorization)).toBe(false);
    } finally {
      endpoint.server.close();
    }
  });

  conformance(
    'C05',
    'no grant, a rebinding name and direct sockets never reach a canary outside the sandbox',
    async () => {
      const listener = await canary();
      try {
        const control = await fetch(`http://127.0.0.1:${String(listener.port)}/`);

        expect(control.status).toBe(204);
        expect(listener.connections()).toBe(1);

        const rebinding = await lookup('localtest.me', { all: true });

        expect(rebinding.map(({ address }) => address)).toContain('127.0.0.1');
        const address = interfaceAddress();
        const port = String(listener.port);
        const probes = [
          { command: `curl -fsS --max-time 5 http://127.0.0.1:${port}/`, domains: [] },
          { command: `curl -fsS --max-time 5 http://localtest.me:${port}/`, domains: ['localtest.me'] },
          { command: `curl -fsS --max-time 5 --noproxy '*' http://127.0.0.1:${port}/`, domains: [] },
          { command: `exec 3<>/dev/tcp/127.0.0.1/${port}`, domains: [] },
          ...(address === undefined
            ? []
            : [
                { command: `curl -fsS --max-time 5 --noproxy '*' http://${address}:${port}/`, domains: [] },
                { command: `exec 3<>/dev/tcp/${address}/${port}`, domains: [] },
              ]),
        ];
        const outcomes = await Promise.all(
          probes.map(async ({ command, domains }) => run(command, { network: { domains } })),
        );
        await delay(500);

        /* The canary is the judge; a refusal may be a proxy error status, which `--fail` turns into a failed exit. */
        expect(listener.connections()).toBe(1);
        expect(
          outcomes.map((outcome) => outcome.exitCode !== 0),
          outcomes.map((outcome) => outcome.stderr.trim()).join('\n'),
        ).toStrictEqual(probes.map(() => true));
      } finally {
        listener.server.close();
      }
    },
  );

  conformance('C06', 'background and detached descendants stop before the launch settles', async () => {
    const beat = join(work, 'beat');
    const detached = join(work, 'detached');
    const writer = (path: string): string => `while :; do printf b >> ${path}; sleep 0.1; done`;
    const command = [
      `( ${writer(beat)} ) &`,
      ...(linux ? [`setsid sh -c '${writer(detached)}' &`] : []),
      'sleep 1',
      'exit 0',
    ].join('\n');
    const result = await run(command);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(statSync(beat).size).toBeGreaterThan(0);
    const sizes = [beat, ...(linux ? [detached] : [])].map((path) => statSync(path).size);
    await delay(1500);

    expect([beat, ...(linux ? [detached] : [])].map((path) => statSync(path).size)).toStrictEqual(sizes);
  });

  if (!linux) {
    it('C06b: a setsid or double-forked daemon started before termination (macOS residual)', () => {
      results.push({
        id: 'C06b',
        title: 'setsid/double-fork escape from the macOS process tracker',
        status: 'residual-disclosed',
        detail: 'Seatbelt has no PID namespace; the tracker kills remembered descendants and the group (A24).',
      });
    });
  }

  conformance('C07', 'abort stops a running command and settles once', async () => {
    const controller = new AbortController();
    const process_ = await start(launchOf('sleep 300', { signal: controller.signal }));
    const startedAt = Date.now();
    controller.abort();
    const exit = await process_.exited;

    expect(exit).toStrictEqual({ signal: 'SIGKILL' });
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  });

  conformance(
    'C11',
    "a protected path's ancestors cannot be renamed or removed, so the path never moves (E04)",
    async () => {
      const project = join(work, 'c11');
      const chats = join(project, '.tau', 'chats');
      mkdirSync(chats, { recursive: true });
      mkdirSync(join(project, '.tau', 'parameters'), { recursive: true });
      writeFileSync(join(chats, 'chat-1.json'), 'RECORD\n');
      const before = digestOf(join(chats, 'chat-1.json'));
      const filesystem = { readable: [], writable: [work], readOnly: [chats], denied: [] };
      const positive = await run("printf '{}' > c11/.tau/parameters/main.json", { filesystem });

      expect(positive.exitCode, positive.stderr).toBe(0);
      expect(readFileSync(join(project, '.tau', 'parameters', 'main.json'), 'utf8')).toBe('{}');
      for (const command of [
        'mv c11/.tau c11/.tau-moved',
        'mv c11 c11-moved',
        'rm -rf c11/.tau',
        'mv c11/.tau/chats c11/stolen',
      ]) {
        // oxlint-disable-next-line no-await-in-loop -- one escape at a time, each judged outside.
        await run(command, { filesystem });

        expect(digestOf(join(chats, 'chat-1.json')), command).toBe(before);
      }
      expect(existsSync(join(project, '.tau-moved')) || existsSync(join(work, 'c11-moved'))).toBe(false);
    },
  );

  conformance('C12', 'a host killed mid-command takes its whole sandbox with it (E11)', async () => {
    const marker = `tau-c12-${String(process.pid)}`;
    const folder = join(work, 'c12');
    mkdirSync(folder, { recursive: true });
    const host = spawn(process.execPath, [fileURLToPath(new URL('host-death.fixture.ts', import.meta.url))], {
      cwd: dirname(fileURLToPath(import.meta.url)),
      env: {
        ...process.env,
        TAU_HOST_DEATH_BWRAP: bwrapPath,
        TAU_HOST_DEATH_WORK: folder,
        TAU_HOST_DEATH_MARKER: marker,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let output = '';
    host.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
    });
    const beat = join(folder, 'beat.txt');
    for (const deadline = Date.now() + 30_000; !(existsSync(beat) && statSync(beat).size > 0); ) {
      if (Date.now() > deadline) {
        host.kill('SIGKILL');
        throw new Error(`the fixture never started: ${output}`);
      }
      // oxlint-disable-next-line no-await-in-loop -- polls until the writer beats.
      await delay(50);
    }

    expect(output).toBe('started\n');
    if (!linux) {
      const shellPid = Number(readFileSync(join(folder, 'shell.pid'), 'utf8').trim());
      const writerPid = Number(readFileSync(join(folder, 'writer.pid'), 'utf8').trim());
      const groupOf = (pid: number): number =>
        Number(execFileSync('/bin/ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim());

      expect(groupOf(writerPid)).not.toBe(groupOf(shellPid));
    }
    host.kill('SIGKILL');
    await new Promise((resolve) => {
      host.once('exit', resolve);
    });
    const survivors = (): string[] =>
      execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' })
        .split('\n')
        .filter((line) => line.includes(marker) && !line.includes('ps -axww'));
    for (const deadline = Date.now() + 10_000; survivors().length > 0 && Date.now() < deadline; ) {
      // oxlint-disable-next-line no-await-in-loop -- polls the process table until the sandbox is gone.
      await delay(100);
    }

    expect(survivors()).toStrictEqual([]);
    const { size } = statSync(beat);
    await delay(1000);

    expect(statSync(beat).size).toBe(size);
  });

  if (linux) {
    conformance('C08', 'the Terminal shell owns its tty with job control, resize and Ctrl-C', async () => {
      const process_ = await start(
        launchOf('', {
          arguments: ['--noprofile', '--norc', '--noediting', '-i'],
          environment: { PATH: '/usr/bin:/bin', HOME: work, LANG: 'C', PS1: '', TERM: 'dumb' },
          stdio: { kind: 'terminal', size: { columns: 80, rows: 24 } },
        }),
      );
      if (process_.kind !== 'terminal') {
        throw new Error('expected a terminal launch');
      }
      let transcript = '';
      const reading = (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of process_.output) {
          transcript += decoder.decode(chunk, { stream: true });
        }
      })();
      const waitFor = async (marker: string): Promise<void> => {
        for (const deadline = Date.now() + 15_000; !transcript.includes(marker); ) {
          if (Date.now() > deadline) {
            throw new Error(`no ${marker} in ${JSON.stringify(transcript)}`);
          }
          // oxlint-disable-next-line no-await-in-loop -- polls the transcript until the marker arrives.
          await delay(20);
        }
      };
      const type = (line: string): void => {
        process_.write(new TextEncoder().encode(line));
      };

      type('test -t 0 && echo TTY-$((40+2)); case $- in *m*) echo JOBS-$((2+3)) ;; esac\n');
      await waitFor('TTY-42');
      await waitFor('JOBS-5');
      process_.resize({ columns: 137, rows: 43 });
      type('echo SIZE-$(stty size | tr " " x)\n');
      await waitFor('SIZE-43x137');
      type('sleep 30\n');
      await delay(300);
      type('\u0003');
      type('echo AFTER-$((1+1))\n');
      await waitFor('AFTER-2');
      type('exit 3\n');

      expect(await process_.exited).toStrictEqual({ exitCode: 3 });
      await reading;
    });
  } else {
    conformance('C08', 'the Terminal stays refused until the own-pty validation run', async () => {
      const outcome = await provider.launch(
        launchOf('', { stdio: { kind: 'terminal', size: { columns: 80, rows: 24 } } }),
      );

      expect(outcome.status).toBe('unsupported');
    });

    it('C09: macOS own-pty Terminal containment', () => {
      results.push({
        id: 'C09',
        title: 'macOS own-pty Terminal containment',
        status: 'operator-validation-pending',
        detail: 'Not run by agents; the operator runs the own-pty validation (ruling 2026-10-24T05:39Z).',
      });
    });
  }
});
