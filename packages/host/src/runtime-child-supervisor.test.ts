import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { startRuntimeChild } from '#runtime-child-supervisor.js';
import type { RuntimeChildWorker, RuntimeChildWorkerLaunch } from '#runtime-child-supervisor.js';

const proofSchema = z.object({
  filesystem: z.literal(true),
  childProcess: z.literal(true),
  worker: z.literal(true),
  workerExecArgvEscalation: z.literal(true),
  workerNodeOptionsEscalation: z.literal(true),
  addon: z.literal(true),
  wasi: z.literal(true),
  inspector: z.literal(true),
  temporaryDirectoryReadable: z.literal(true),
  temporaryDirectory: z.string(),
  environmentSecretAbsent: z.literal(true),
  network: z.literal(true),
  arbitraryNetworkAllowed: z.literal(true),
});

let temporaryDirectory: string | undefined;

afterEach(async () => {
  delete process.env['TAU_HOST_TEST_SECRET'];
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true });
    temporaryDirectory = undefined;
  }
});

describe('runtime child permission boundary', () => {
  it('denies host capabilities and every worker, strips secrets, reads back its own temp files, and pins unrestricted network egress', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-permissions-'));
    const proofPath = join(temporaryDirectory, 'proof.json');
    const server = createServer((_request, response) => {
      response.end('ok');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP permission-test server.');
    }
    process.env['TAU_HOST_TEST_SECRET'] = 'must-not-reach-child';
    const modulePath = fileURLToPath(new URL('fixtures/permission-proof-child.mjs', import.meta.url));

    const child = await startRuntimeChild({
      modulePath,
      args: [proofPath, `http://127.0.0.1:${String(address.port)}`],
    });
    const { temporaryDirectory: childTemporaryDirectory, ...proof } = proofSchema.parse(
      JSON.parse(await readFile(proofPath, 'utf8')),
    );

    expect(proof).toEqual({
      filesystem: true,
      childProcess: true,
      worker: true,
      workerExecArgvEscalation: true,
      workerNodeOptionsEscalation: true,
      addon: true,
      wasi: true,
      inspector: true,
      temporaryDirectoryReadable: true,
      environmentSecretAbsent: true,
      network: true,
      arbitraryNetworkAllowed: true,
    });
    expect(childTemporaryDirectory.startsWith(join(await realpath(tmpdir()), 'tau-runtime-child-'))).toBe(true);
    await child.close();
    await child.closed;
    await expect(access(childTemporaryDirectory)).rejects.toThrow(/ENOENT/u);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
});

describe('runtime child control frames', () => {
  it('delivers frames posted after the child is ready', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-post-'));
    const outputPath = join(temporaryDirectory, 'messages.jsonl');
    const modulePath = fileURLToPath(new URL('fixtures/message-echo-child.mjs', import.meta.url));
    const child = await startRuntimeChild({ modulePath, args: [outputPath] });

    child.post({ type: 'zoo-proxy-credential', url: 'wss://api.example.test/v1/kernels/zoo', token: 'zt1.a.b' });
    child.post({ type: 'zoo-proxy-credential', url: 'wss://api.example.test/v1/kernels/zoo' });
    const readLines = async (): Promise<string[]> => {
      const text = await readFile(outputPath, 'utf8').catch(() => '');
      return text.trim().split('\n');
    };
    await expect.poll(async () => readLines()).toHaveLength(2);

    const lines = await readLines();
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { type: 'zoo-proxy-credential', url: 'wss://api.example.test/v1/kernels/zoo', token: 'zt1.a.b' },
      { type: 'zoo-proxy-credential', url: 'wss://api.example.test/v1/kernels/zoo' },
    ]);
    await child.close();
  });

  it('settles close only after closed, once the child has exited and its private directory is removed', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-close-'));
    const modulePath = fileURLToPath(new URL('fixtures/message-echo-child.mjs', import.meta.url));
    const child = await startRuntimeChild({ modulePath, args: [join(temporaryDirectory, 'messages.jsonl')] });

    await child.close();

    /* No timer: an already-settled `closed` wins the race, and one still removing the directory loses it. */
    expect(await Promise.race([child.closed, Promise.resolve('pending')])).toEqual({ exitCode: 0 });
  });

  it('closes twice, without an uncaught error, a child whose channel disconnected before it exited', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-disconnect-'));
    const modulePath = fileURLToPath(new URL('fixtures/message-echo-child.mjs', import.meta.url));
    const child = await startRuntimeChild({ modulePath, args: [join(temporaryDirectory, 'messages.jsonl')] });
    const uncaught: unknown[] = [];
    const onUncaught = (error: unknown): void => {
      uncaught.push(error);
    };
    process.on('uncaughtException', onUncaught);
    try {
      child.post({ type: 'disconnect' });
      /* The child exits 500 ms after disconnecting; both closes land in between. */
      await delay(200);

      await Promise.all([child.close(), child.close()]);
      await delay(0);

      expect(uncaught).toEqual([]);
    } finally {
      process.off('uncaughtException', onUncaught);
    }
  });
});

describe('native workers brokered for a runtime child (D37, North Star S2)', () => {
  const daemonTemporary = process.env['TMPDIR'];
  afterEach(() => {
    if (daemonTemporary === undefined) {
      delete process.env['TMPDIR'];
    } else {
      process.env['TMPDIR'] = daemonTemporary;
    }
  });

  /**
   * A scratch tree laid out like a daemon's: its temp directory (which the child may write) and, beside it, the
   * directory where it keeps each child's directory, plus a store of sealed closures.
   */
  const daemonLayout = async (prefix: string) => {
    temporaryDirectory = await realpath(await mkdtemp(join(tmpdir(), prefix)));
    const daemonTemporaryDirectory = join(temporaryDirectory, 'tmp');
    await mkdir(daemonTemporaryDirectory);
    process.env['TMPDIR'] = daemonTemporaryDirectory;
    return { scratch: temporaryDirectory, daemonTemporaryDirectory, directory: join(temporaryDirectory, 'children') };
  };

  /** What `startNativeWorker` returns, minus the sandbox: this suite proves the brokering, not the containment. */
  const spawnUncontained = async (launch: RuntimeChildWorkerLaunch): Promise<RuntimeChildWorker> => {
    const process = spawn(launch.executablePath, [...launch.arguments], { stdio: 'pipe' });
    const ended = new Promise<Awaited<RuntimeChildWorker['ended']>>((resolve) => {
      process.once('exit', (code, signal) => {
        resolve({ ...(code === null ? {} : { exitCode: code }), ...(signal === null ? {} : { signal }) });
      });
    });
    return {
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      ended,
      terminate: async () => {
        process.kill();
        await ended;
      },
    };
  };

  /** A closure sealed in a store under `root`, holding a worker that echoes its stdin. */
  const sealedClosure = async (root: string, name = 'a'.repeat(64)) => {
    const closure = join(root, 'store', 'closures', 'sha256', name);
    const worker = '#!/bin/sh\necho worker ready\ncat\n';
    await mkdir(closure, { recursive: true });
    await writeFile(join(closure, 'worker.sh'), worker);
    await chmod(join(closure, 'worker.sh'), 0o755);
    return {
      closure,
      launchFrom: (overrides: Partial<RuntimeChildWorkerLaunch> = {}) => ({
        executablePath: join(closure, 'worker.sh'),
        executableSha256: createHash('sha256').update(worker).digest('hex'),
        executableName: 'Fixture worker',
        arguments: [],
        runtimePath: closure,
        resources: [],
        workspacePath: '<private>/workspace',
        artifactPath: '<private>/artifacts',
        commandId: 'Fixture#1',
        ...overrides,
      }),
    };
  };

  /** The flags `permissionArguments` gives a built child; native kernels add none. */
  const permissionFlags = (modulePath: string, childTemporaryDirectory: string): string[] => [
    '--permission',
    `--allow-fs-read=${process.cwd()}`,
    `--allow-fs-read=${dirname(modulePath)}`,
    `--allow-fs-read=${childTemporaryDirectory}`,
    `--allow-fs-write=${tmpdir()}`,
    `--allow-fs-write=${childTemporaryDirectory}`,
    ...(Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10) >= 26 ? ['--allow-net'] : []),
  ];

  const outcomeSchema = z.union([
    z.object({
      started: z.literal(true),
      stdout: z.string(),
      end: z.object({ exitCode: z.number().optional(), signal: z.string().optional() }),
    }),
    z.object({ started: z.literal(false), refusal: z.string() }),
  ]);
  const brokerProofSchema = z.object({
    execArgv: z.array(z.string()),
    childPermission: z.boolean(),
    ownSpawn: z.string(),
    native: z.unknown().optional(),
    outcomes: z.record(z.string(), outcomeSchema),
  });

  it('keeps the child flags and its spawn refusal, and starts a worker only from a sealed closure into the private directory of the child', async () => {
    const { scratch, daemonTemporaryDirectory, directory } = await daemonLayout('tau-host-broker-');
    /* The proof lands where the child may write: the daemon's temp directory. */
    const proofPath = join(daemonTemporaryDirectory, 'proof.json');
    /* A sealed closure in the store, and an unsealed tree beside it holding the same worker. */
    const { closure: sealed, launchFrom } = await sealedClosure(scratch);
    const { closure: unsealed } = await sealedClosure(join(scratch, 'unsealed'), 'b'.repeat(64));
    const requests = [
      { name: 'sealed', launch: launchFrom() },
      { name: 'unsealed', launch: launchFrom({ runtimePath: unsealed, executablePath: join(unsealed, 'worker.sh') }) },
      { name: 'escapedExecutable', launch: launchFrom({ executablePath: '/bin/sh' }) },
      { name: 'foreignWorkspace', launch: launchFrom({ workspacePath: scratch }) },
    ];
    const start = vi.fn(async (launch: RuntimeChildWorkerLaunch & { readonly sandboxRoot: string }) =>
      spawnUncontained(launch),
    );
    const modulePath = fileURLToPath(new URL('fixtures/native-broker-child.mjs', import.meta.url));

    const child = await startRuntimeChild({
      modulePath,
      args: [proofPath, JSON.stringify(requests)],
      native: {
        directory,
        compose: async () => ({ unavailable: [], closureRoots: [sealed] }),
        closureRoots: async () => [sealed],
        start,
      },
    });
    const proof = brokerProofSchema.parse(JSON.parse(await readFile(proofPath, 'utf8')));
    const childTemporaryDirectory = proof.execArgv.at(3)?.slice('--allow-fs-read='.length) ?? '';
    await child.close();

    expect(proof.execArgv).toEqual(permissionFlags(modulePath, childTemporaryDirectory));
    /* The child's temp directory sits in one the daemon created outside its own temp directory. */
    expect(childTemporaryDirectory).toMatch(new RegExp(`^${directory}/tau-runtime-child-[^/]+/tmp$`, 'u'));
    expect({ childPermission: proof.childPermission, ownSpawn: proof.ownSpawn }).toEqual({
      childPermission: false,
      ownSpawn: 'ERR_ACCESS_DENIED',
    });
    expect(proof.native).toEqual({ unavailable: [], closureRoots: [sealed] });
    expect(proof.outcomes['sealed']).toEqual({
      started: true,
      stdout: 'worker ready\nechoed through the daemon\n',
      end: { exitCode: 0 },
    });
    expect(proof.outcomes['unsealed']).toEqual({
      started: false,
      refusal: `Tau Host refused a native worker launch: ${unsealed} is not a closure sealed in the payload store.`,
    });
    expect(proof.outcomes['escapedExecutable']).toEqual({
      started: false,
      refusal: 'Tau Host refused a native worker launch: /bin/sh is outside the sealed closure.',
    });
    expect(proof.outcomes['foreignWorkspace']).toEqual({
      started: false,
      refusal: `Tau Host refused a native worker launch: ${scratch} is not inside the runtime child's private directory.`,
    });
    expect(start).toHaveBeenCalledOnce();
    const [started] = start.mock.calls[0] ?? [];
    expect(started?.runtimePath).toBe(sealed);
    expect(started?.workspacePath).toMatch(/\/tau-runtime-child-[^/]+\/tmp\/mirror-[^/]+\/workspace$/u);
    expect(started?.sandboxRoot).toBe(dirname(childTemporaryDirectory));
  });

  it('grants a worker only the directory the daemon created, even when a checked path is redirected to elsewhere', async () => {
    const { scratch, daemonTemporaryDirectory, directory } = await daemonLayout('tau-host-broker-swap-');
    const proofPath = join(daemonTemporaryDirectory, 'proof.json');
    const elsewhere = join(scratch, 'elsewhere');
    await mkdir(elsewhere);
    const { closure, launchFrom } = await sealedClosure(scratch);
    /* Between the broker's check and the spawn, the checked artifact directory becomes a link to elsewhere: what a
     * worker that shares the child's directory can plant. */
    const start = vi.fn(async (launch: RuntimeChildWorkerLaunch & { readonly sandboxRoot: string }) => {
      await rm(launch.artifactPath, { recursive: true });
      await symlink(elsewhere, launch.artifactPath);
      return spawnUncontained(launch);
    });
    const child = await startRuntimeChild({
      modulePath: fileURLToPath(new URL('fixtures/native-broker-child.mjs', import.meta.url)),
      args: [proofPath, JSON.stringify([{ name: 'swapped', launch: launchFrom() }])],
      native: { directory, compose: async () => ({ unavailable: [] }), closureRoots: async () => [closure], start },
    });
    const proof = brokerProofSchema.parse(JSON.parse(await readFile(proofPath, 'utf8')));
    const [launched] = start.mock.calls[0] ?? [];
    const redirected = launched === undefined ? undefined : await realpath(launched.artifactPath);
    const granted = launched?.sandboxRoot ?? '';
    const grantedNow = await realpath(granted);
    await child.close();

    expect(proof.outcomes['swapped']).toMatchObject({ started: true });
    expect(redirected).toBe(elsewhere);
    /* The sandbox grants the daemon's directory, which still resolves to itself and does not hold elsewhere. */
    expect(grantedNow).toBe(granted);
    expect(granted.startsWith(`${directory}/tau-runtime-child-`)).toBe(true);
    expect(elsewhere.startsWith(`${granted}/`)).toBe(false);
    expect(granted.startsWith(`${daemonTemporaryDirectory}/`)).toBe(false);
  });

  it('reclaims the child directories a gone daemon left in its native directory, and keeps those of a running one', async () => {
    const { daemonTemporaryDirectory, directory } = await daemonLayout('tau-host-broker-sweep-');
    const proofPath = join(daemonTemporaryDirectory, 'proof.json');
    /* A process that has exited: its id names no running daemon. */
    const gone = spawn(process.execPath, ['-e', '']);
    const gonePid = gone.pid!;
    await once(gone, 'exit');
    const leftBehind = {
      gone: { pid: gonePid, keep: false },
      running: { pid: process.ppid, keep: true },
      unmarkedOld: { pid: undefined, keep: false },
      unmarkedFresh: { pid: undefined, keep: true },
    };
    await mkdir(directory, { recursive: true });
    for (const [name, { pid }] of Object.entries(leftBehind)) {
      const path = join(directory, `tau-runtime-child-${name}`);
      // oxlint-disable-next-line no-await-in-loop -- four fixtures, laid out in order.
      await mkdir(join(path, 'tmp'), { recursive: true });
      if (pid !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- four fixtures, laid out in order.
        await writeFile(`${path}.pid`, `${String(pid)}\n`);
      }
    }
    const anHourAgo = new Date(Date.now() - 60 * 60_000);
    await utimes(join(directory, 'tau-runtime-child-unmarkedOld'), anHourAgo, anHourAgo);

    const child = await startRuntimeChild({
      modulePath: fileURLToPath(new URL('fixtures/native-broker-child.mjs', import.meta.url)),
      args: [proofPath, '[]'],
      native: { directory, compose: async () => ({ unavailable: [] }), closureRoots: async () => [], start: vi.fn() },
    });
    const whileRunning = await readdir(directory);
    await child.close();
    const afterClose = await readdir(directory);

    for (const [name, { keep }] of Object.entries(leftBehind)) {
      expect(whileRunning.includes(`tau-runtime-child-${name}`), name).toBe(keep);
    }
    expect(whileRunning).not.toContain(`tau-runtime-child-gone.pid`);
    /* The running child's own directory carries this daemon's marker, and both go when it exits. */
    const own = whileRunning.filter(
      (name) =>
        name.startsWith('tau-runtime-child-') && !Object.keys(leftBehind).some((fixture) => name.includes(fixture)),
    );
    expect(own).toHaveLength(2);
    expect(afterClose.filter((name) => own.includes(name))).toEqual([]);
  });

  it('refuses every launch when the daemon would keep its directory where the child may write', async () => {
    const { scratch, daemonTemporaryDirectory } = await daemonLayout('tau-host-broker-inside-');
    const proofPath = join(daemonTemporaryDirectory, 'proof.json');
    const { closure, launchFrom } = await sealedClosure(scratch);
    const start = vi.fn(spawnUncontained);
    const directory = join(daemonTemporaryDirectory, 'children');
    const child = await startRuntimeChild({
      modulePath: fileURLToPath(new URL('fixtures/native-broker-child.mjs', import.meta.url)),
      args: [proofPath, JSON.stringify([{ name: 'inside', launch: launchFrom() }])],
      native: { directory, compose: async () => ({ unavailable: [] }), closureRoots: async () => [closure], start },
    });
    const proof = brokerProofSchema.parse(JSON.parse(await readFile(proofPath, 'utf8')));
    await child.close();

    expect(proof.outcomes['inside']).toEqual({
      started: false,
      refusal: `Tau Host refused a native worker launch: ${directory} is inside ${daemonTemporaryDirectory}, which the runtime child may write; keep the native workers' directory outside TMPDIR.`,
    });
    expect(start).not.toHaveBeenCalled();
  });

  it('hands a child no composition when the store cannot be read, and carries a failed start back as its refusal', async () => {
    const { scratch, daemonTemporaryDirectory, directory } = await daemonLayout('tau-host-broker-refused-');
    const { closure: sealed, launchFrom } = await sealedClosure(scratch);
    const launch = launchFrom({ executableSha256: '0'.repeat(64) });
    const modulePath = fileURLToPath(new URL('fixtures/native-broker-child.mjs', import.meta.url));
    const refusedProof = join(daemonTemporaryDirectory, 'refused.json');
    const refused = await startRuntimeChild({
      modulePath,
      args: [refusedProof, JSON.stringify([{ name: 'refused', launch }])],
      native: {
        directory,
        compose: async () => {
          throw new Error('the store cannot be read');
        },
        closureRoots: async () => [sealed],
        start: async () => {
          throw new Error('The native runtime is unavailable because its sandbox could not start: no bwrap.');
        },
      },
    });
    await refused.close();

    const refusedRun = brokerProofSchema.parse(JSON.parse(await readFile(refusedProof, 'utf8')));
    expect(refusedRun.native).toBeUndefined();
    expect(refusedRun.outcomes['refused']).toEqual({
      started: false,
      refusal: 'The native runtime is unavailable because its sandbox could not start: no bwrap.',
    });
  });
});
