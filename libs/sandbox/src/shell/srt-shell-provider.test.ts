/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
// @vitest-environment node
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { z } from 'zod';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { processTable, terminationDeadline } from '#shell/process-tree.js';
import { seatbeltDecision, seatbeltProfileOf } from '#shell/seatbelt.fixture.js';
import type { ProfileFilesystem } from '#shell/seatbelt.fixture.js';
import { createShellCustody } from '#shell/shell-custody.js';
import { holdProtectedStandIns } from '#shell/shell-stand-ins.js';
import type { ShellLaunch, ShellLaunchOutcome, ShellPipesProcess, ShellProcess } from '#shell/shell-provider.js';
import {
  bindOwnPty,
  createSandboxShellProvider,
  seatbeltReadDenies,
  shellSandboxCommand,
  shellSandboxProfile,
} from '#shell/srt-shell-provider.js';
import type { SandboxShellProviderOptions } from '#shell/srt-shell-provider.js';

/*
 * Orchestration tests (testing contract, layering rule 2): the supervisor fixture answers with an unsandboxed vector,
 * so these prove the provider's admission, plumbing, settlement and termination, never containment. Containment is
 * the native `test:shell-conformance` suite's job.
 */
const supervisor = {
  executablePath: process.execPath,
  arguments: [fileURLToPath(new URL('supervisor.fixture.ts', import.meta.url))],
};
const posix = process.platform === 'linux' || process.platform === 'darwin';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const fixtureRoot = (): string => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-shell-provider-')));
  roots.push(root);
  return root;
};

const launchOf = (overrides: Partial<ShellLaunch> & Pick<ShellLaunch, 'arguments'>): ShellLaunch => {
  const root = fixtureRoot();
  return {
    executionId: '',
    executablePath: '/bin/bash',
    workingDirectory: root,
    commandId: 'test#1',
    filesystem: { readable: [], writable: [root], denied: [] },
    network: { domains: [] },
    environment: { PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root, LANG: 'C.UTF-8' },
    stdio: { kind: 'pipes' },
    signal: new AbortController().signal,
    ...overrides,
  };
};

const text = async (chunks: AsyncIterable<Uint8Array<ArrayBuffer>>): Promise<string> => {
  const decoder = new TextDecoder();
  let result = '';
  for await (const chunk of chunks) {
    result += decoder.decode(chunk, { stream: true });
  }
  return result + decoder.decode();
};

const started = async (launch: ShellLaunch): Promise<ShellProcess> => {
  const outcome = await custodial().launch(launch);
  if (outcome.status !== 'started') {
    throw new Error(`expected a started launch, got ${JSON.stringify(outcome)}`);
  }
  return outcome.process;
};

const pipesOf = (shell: ShellProcess): ShellPipesProcess => {
  if (shell.kind !== 'pipes') {
    throw new Error('expected a pipes launch');
  }
  return shell;
};

const alive = async (pid: number): Promise<boolean> => {
  const table = await processTable();
  return table.some((row) => row.pid === pid && !row.zombie);
};

describe('createSandboxShellProvider admission', () => {
  it('should refuse a startup hook in the environment before starting anything', async () => {
    const outcome = await createSandboxShellProvider({ supervisor }).launch(
      launchOf({ arguments: ['-c', 'true'], environment: { PATH: '/usr/bin:/bin', BASH_ENV: '/tmp/x' } }),
    );

    expect(outcome).toStrictEqual({
      status: 'unsupported',
      requirement: 'environment',
      message: 'the shell may not receive BASH_ENV.',
    });
  });

  it('should admit GIT_CONFIG_NOSYSTEM=1 past the environment floor and refuse any other GIT_CONFIG name', async () => {
    const provider = createSandboxShellProvider({ supervisor });
    const injected = await provider.launch(
      launchOf({
        arguments: ['-c', 'true'],
        environment: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_COUNT: '1' },
      }),
    );

    expect(injected).toStrictEqual({
      status: 'unsupported',
      requirement: 'environment',
      message: 'the shell may not receive GIT_CONFIG_COUNT.',
    });
  });

  it('should refuse Zsh startup files on a pipe launch or any shell but the macOS Terminal Zsh', async () => {
    const provider = createSandboxShellProvider({ supervisor });
    const pipes = await provider.launch(
      launchOf({ executablePath: '/bin/zsh', arguments: ['-c', 'true'], startupFiles: 'zsh' }),
    );
    const bash = await provider.launch(launchOf({ arguments: ['-c', 'true'], startupFiles: 'zsh' }));

    for (const outcome of [pipes, bash]) {
      expect(outcome).toStrictEqual({
        status: 'unsupported',
        requirement: 'filesystem-mask',
        message: 'only the macOS Terminal running /bin/zsh may read Zsh startup files.',
      });
    }
  });

  it('should refuse toolchain folders for the startup files on a launch without them', async () => {
    const provider = createSandboxShellProvider({ supervisor });
    const outcome = await provider.launch(launchOf({ arguments: ['-c', 'true'], toolchainBins: ['/opt/tau/git/bin'] }));

    expect(outcome).toStrictEqual({
      status: 'unsupported',
      requirement: 'environment',
      message: 'only the Terminal Zsh with its startup files takes toolchain folders.',
    });
  });

  it('should refuse a relative path', async () => {
    const outcome = await createSandboxShellProvider({ supervisor }).launch(
      launchOf({ arguments: ['-c', 'true'], workingDirectory: 'project' }),
    );

    expect(outcome).toMatchObject({ status: 'unsupported', requirement: 'filesystem-mask' });
  });

  it('should refuse a writable root inside a denied path', async () => {
    const outcome = await createSandboxShellProvider({ supervisor }).launch(
      launchOf({
        arguments: ['-c', 'true'],
        filesystem: { readable: [], writable: ['/srv/data/home'], denied: ['/srv/data'] },
      }),
    );

    expect(outcome).toMatchObject({ status: 'unsupported', requirement: 'filesystem-mask' });
  });

  it('should refuse a writable root inside a read-only path', async () => {
    const outcome = await createSandboxShellProvider({ supervisor }).launch(
      launchOf({
        arguments: ['-c', 'true'],
        filesystem: {
          readable: [],
          writable: ['/srv/project/exports/scratch'],
          readOnly: ['/srv/project/exports'],
          denied: [],
        },
      }),
    );

    expect(outcome).toMatchObject({ status: 'unsupported', requirement: 'filesystem-mask' });
  });

  it('should refuse a network grant that is not an exact lowercase host name', async () => {
    const outcome = await createSandboxShellProvider({ supervisor }).launch(
      launchOf({ arguments: ['-c', 'true'], network: { domains: ['*.example.com'] } }),
    );

    expect(outcome).toMatchObject({ status: 'unsupported', requirement: 'network-isolation' });
  });

  it('should reject an already aborted launch with the abort reason', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled before start'));

    await expect(
      createSandboxShellProvider({ supervisor }).launch(
        launchOf({ arguments: ['-c', 'true'], signal: controller.signal }),
      ),
    ).rejects.toThrow('cancelled before start');
  });
});

/*
 * I7 custody: every launch here is prepared first in its own custody namespace, so a test owns exactly the records it
 * makes. `launch` prepares a fresh private root and execution, then launches it.
 */
const custodial = (overrides: Omit<SandboxShellProviderOptions, 'custody'> = {}) => {
  const base = fixtureRoot();
  const custody = { directory: join(base, 'custody'), sessionDirectory: base };
  const provider = createSandboxShellProvider({ supervisor, custody, ...overrides });
  const executions: string[] = [];
  const privateRoots: string[] = [];
  return {
    provider,
    custody,
    executions,
    privateRoots,
    launch: async (launch: ShellLaunch): Promise<ShellLaunchOutcome> => {
      const privateRoot = mkdtempSync(join(base, 'tau-shell-'));
      const { executionId } = await provider.prepare({ privateRoot, resource: undefined });
      executions.push(executionId);
      privateRoots.push(privateRoot);
      return provider.launch({ ...launch, executionId });
    },
  };
};

describe.runIf(process.platform === 'linux')('createSandboxShellProvider custody', () => {
  it('should refuse a launch it did not prepare before starting anything', async () => {
    const { provider } = custodial();
    const outcome = await provider.launch({
      ...launchOf({ arguments: ['--noprofile', '--norc', '-c', 'true'] }),
      executionId: '22222222-2222-4222-8222-222222222222',
    });

    expect(outcome).toMatchObject({ status: 'sandbox-unavailable' });
    expect(outcome.status === 'sandbox-unavailable' ? outcome.message : '').toContain('not prepared');
  });

  it('should hand custody to the supervisor while the launch runs and claim it as soon as exited settles', async () => {
    const fixture = custodial();
    const outcome = await fixture.launch(launchOf({ arguments: ['--noprofile', '--norc', '-c', 'sleep 300'] }));
    if (outcome.status !== 'started') {
      throw new Error(`expected a started launch, got ${JSON.stringify(outcome)}`);
    }
    const [executionId] = fixture.executions;
    const other = createShellCustody(fixture.custody);
    try {
      expect(await other.recover({ executionIds: [executionId!] })).toMatchObject([{ status: 'blocked' }]);
      await outcome.process.terminate();

      // Post-exit claim: the supervisor has exited, so nothing still holds the lock.
      expect(await fixture.provider.recover({ executionIds: [executionId!] })).toMatchObject([
        { executionId, status: 'stopped' },
      ]);
      expect(await other.recover({ executionIds: [executionId!] })).toMatchObject([{ status: 'blocked' }]);
      rmSync(fixture.privateRoots[0]!, { recursive: true });
      await fixture.provider.release({ executionId: executionId! });
      expect(await other.inventory()).toEqual([]);
    } finally {
      await other.close();
    }
  }, 20_000);

  it('should give exactly one of two racing claimants the stopped claim after exit', async () => {
    const fixture = custodial();
    const outcome = await fixture.launch(launchOf({ arguments: ['--noprofile', '--norc', '-c', 'exit 0'] }));
    if (outcome.status !== 'started') {
      throw new Error(`expected a started launch, got ${JSON.stringify(outcome)}`);
    }
    const [executionId] = fixture.executions;
    await outcome.process.exited;
    const other = createShellCustody(fixture.custody);
    try {
      const answers = await Promise.all([
        fixture.provider.recover({ executionIds: [executionId!] }),
        other.recover({ executionIds: [executionId!] }),
      ]);

      expect(
        answers.map(([answer]) => answer?.status ?? 'missing').toSorted((left, right) => left.localeCompare(right)),
      ).toEqual(['blocked', 'stopped']);
    } finally {
      await other.close();
    }
  }, 20_000);

  it('should let the owner stop a launch the supervisor refused', async () => {
    const fixture = custodial();
    const outcome = await fixture.launch(
      launchOf({ arguments: ['--noprofile', '--norc', '-c', 'echo TAU_FIXTURE_UNAVAILABLE'] }),
    );

    expect(outcome).toMatchObject({ status: 'sandbox-unavailable' });
    expect(await fixture.provider.recover({ executionIds: fixture.executions })).toMatchObject([{ status: 'stopped' }]);
  });

  it('should report a sandbox that failed to set up as not started, never as the workload exiting 1', async () => {
    const fixture = custodial();
    const sentinel = join(fixtureRoot(), 'ran');
    const outcome = await fixture.launch(
      launchOf({ arguments: ['--noprofile', '--norc', '-c', `touch ${sentinel} # TAU_FIXTURE_SETUP_FAILS`] }),
    );

    expect(outcome).toStrictEqual({
      status: 'sandbox-unavailable',
      message: 'the sandbox could not be set up, so nothing ran.',
      diagnostic: "bwrap: Can't find source path /srv/project/thumbnail.webp: No such file or directory",
      retryable: true,
    });
    expect(existsSync(sentinel)).toBe(false);
    // The launch settled before it answered: its supervisor is gone, so the owner's claim is immediate.
    expect(await fixture.provider.recover({ executionIds: fixture.executions })).toMatchObject([{ status: 'stopped' }]);
  });

  it('should report a terminal whose sandbox failed to set up as not started', async () => {
    const fixture = custodial();
    const outcome = await fixture.launch(
      launchOf({
        arguments: ['--noprofile', '--norc', '-i', '-c', 'true # TAU_FIXTURE_SETUP_FAILS'],
        environment: { PATH: '/usr/bin:/bin', TERM: 'dumb' },
        stdio: { kind: 'terminal', size: { columns: 80, rows: 24 } },
      }),
    );

    expect(outcome).toMatchObject({ status: 'sandbox-unavailable', retryable: true });
    expect(outcome.status === 'sandbox-unavailable' ? outcome.diagnostic : '').toContain(
      "bwrap: Can't find source path",
    );
  }, 20_000);

  it('should report the exit of a workload that prints a bwrap error and a forged marker, never a retry', async () => {
    const forged = String.raw`printf '\033]7771;tau-launch;00000000000000000000000000000000\007' >&2`;
    const bwrap = `echo "bwrap: Can't find source path /srv/project/thumbnail.webp: No such file or directory" >&2`;
    const shell = pipesOf(
      await started(launchOf({ arguments: ['--noprofile', '--norc', '-c', `${forged}; ${bwrap}; exit 1`] })),
    );

    const [stderr, exit] = await Promise.all([text(shell.stderr), shell.exited]);

    expect({ stderr, exit }).toStrictEqual({
      stderr:
        "\u001B]7771;tau-launch;00000000000000000000000000000000\u0007bwrap: Can't find source path /srv/project/thumbnail.webp: No such file or directory\n",
      exit: { exitCode: 1 },
    });
  });

  it('should never pass the custody lock to the workload', async () => {
    const shell = pipesOf(await started(launchOf({ arguments: ['--noprofile', '--norc', '-c', 'ls -l /proc/$$/fd'] })));
    const listing = await text(shell.stdout);
    await shell.exited;

    expect(listing).not.toContain('.lock');
  });
});

describe.runIf(posix)('createSandboxShellProvider plumbing', () => {
  it('should answer sandbox-unavailable when the supervisor cannot prepare the sandbox', async () => {
    const outcome = await custodial().launch(
      launchOf({ arguments: ['--noprofile', '--norc', '-c', 'echo TAU_FIXTURE_UNAVAILABLE'] }),
    );

    expect(outcome).toStrictEqual({ status: 'sandbox-unavailable', message: 'fixture prerequisite missing' });
  });

  it('should stream both outputs and report the exit status', async () => {
    const shell = await started(
      launchOf({ arguments: ['--noprofile', '--norc', '-c', 'printf "out é"; printf err >&2; exit 7'] }),
    );

    const [stdout, stderr, exit] = await Promise.all([
      text(pipesOf(shell).stdout),
      text(pipesOf(shell).stderr),
      shell.exited,
    ]);

    expect({ stdout, stderr, exit }).toStrictEqual({ stdout: 'out é', stderr: 'err', exit: { exitCode: 7 } });
  });

  it('should record the supervisor process lifetime RSS on exit through the private preload', async () => {
    const directory = fixtureRoot();
    const preload = new URL('qualification-resource.fixture.ts', import.meta.url);
    preload.searchParams.set('directory', directory);
    const outcome = await custodial({
      supervisor: { ...supervisor, arguments: ['--import', preload.href, ...supervisor.arguments] },
    }).launch(launchOf({ arguments: ['--noprofile', '--norc', '-c', 'printf measured'] }));
    if (outcome.status !== 'started') {
      throw new Error(`expected a started launch, got ${JSON.stringify(outcome)}`);
    }
    await using shell = outcome.process;
    expect(await text(pipesOf(shell).stdout)).toBe('measured');
    expect(await text(pipesOf(shell).stderr)).toBe('');
    expect(await shell.exited).toEqual({ exitCode: 0 });
    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const resource = z
      .object({
        pid: z.number().int().positive(),
        exitCode: z.literal(0),
        baselineRssBytes: z.number().int().positive(),
        peakRssBytes: z.number().int().positive(),
      })
      .parse(JSON.parse(readFileSync(join(directory, files[0]!), 'utf8')));
    expect(files[0]).toBe(`${String(resource.pid)}.json`);
    expect(resource.pid).not.toBe(process.pid);
    expect(resource.peakRssBytes).toBeGreaterThanOrEqual(resource.baselineRssBytes);
  });

  it('should report exact queue occupancy and resume a stalled consumer without losing bytes', async () => {
    const schema = z.object({
      commandId: z.string(),
      queueId: z.uuid(),
      stream: z.string(),
      queuedBytes: z.number(),
      queuedChunks: z.number(),
      peakBytes: z.number(),
      peakChunks: z.number(),
      pauses: z.number(),
      resumes: z.number(),
    });
    const diagnostics = 'taucad.native-process.shell.byte-queue';
    let latest: z.infer<typeof schema> | undefined;
    let invalid = false;
    const queueIds = new Set<string>();
    const observe = (message: unknown): void => {
      const parsed = schema.safeParse(message);
      if (!parsed.success) {
        invalid = true;
      } else if (parsed.data.commandId === 'queue-accounting' && parsed.data.stream === 'stdout') {
        latest = parsed.data;
        queueIds.add(parsed.data.queueId);
      }
    };
    subscribe(diagnostics, observe);
    try {
      const bytes = 8 * 1024 * 1024 + 163;
      await using shell = await started(
        launchOf({
          commandId: 'queue-accounting',
          arguments: ['--noprofile', '--norc', '-c', `head -c ${String(bytes)} /dev/zero`],
        }),
      );
      // Do not pull until the actual queue applies backpressure; no timing-based readiness assumption.
      await expect.poll(() => latest?.pauses).toBe(1);
      expect(latest).toMatchObject({ queuedChunks: 64, peakChunks: 64, resumes: 0 });
      expect(latest!.queuedBytes).toBe(latest!.peakBytes);
      expect(latest!.queuedBytes).toBeGreaterThan(0);
      let received = 0;
      for await (const chunk of pipesOf(shell).stdout) {
        received += chunk.byteLength;
      }
      expect(await text(pipesOf(shell).stderr)).toBe('');
      expect(await shell.exited).toEqual({ exitCode: 0 });
      expect(received).toBe(bytes);
      expect(latest).toMatchObject({ queuedBytes: 0, queuedChunks: 0, peakChunks: 64 });
      expect(latest!.resumes).toBeGreaterThan(0);
      expect(latest!.resumes).toBe(latest!.pauses);
      expect(queueIds.size).toBe(1);
      expect(invalid).toBe(false);
    } finally {
      unsubscribe(diagnostics, observe);
    }
  });

  it('should pass the launch environment over the wrapper environment', async () => {
    const shell = await started(
      launchOf({
        arguments: ['--noprofile', '--norc', '-c', 'printf "%s|%s" "$PATH" "$LAUNCH_VALUE"'],
        environment: { PATH: '/bin:/usr/bin', LAUNCH_VALUE: "it's $HOME" },
      }),
    );

    expect(await text(pipesOf(shell).stdout)).toBe("/bin:/usr/bin|it's $HOME");
  });

  it('should stop a background child before settling', async () => {
    const shell = await started(launchOf({ arguments: ['--noprofile', '--norc', '-c', 'sleep 300 & echo $!'] }));
    const output = text(pipesOf(shell).stdout);

    await shell.exited;
    const printed = await output;
    const child = Number(printed.trim());

    expect(await alive(child)).toBe(false);
  });

  it('should terminate the tree and settle with a signal when the launch is aborted', async () => {
    const controller = new AbortController();
    const shell = await started(
      launchOf({ arguments: ['--noprofile', '--norc', '-c', 'echo ready; sleep 300'], signal: controller.signal }),
    );
    const iterator = pipesOf(shell).stdout[Symbol.asyncIterator]();
    await iterator.next();

    controller.abort();

    expect(await shell.exited).toStrictEqual({ signal: 'SIGKILL' });
  });

  it('should settle the same exit from terminate and disposal', async () => {
    const shell = await started(launchOf({ arguments: ['--noprofile', '--norc', '-c', 'sleep 300'] }));

    const exit = await shell.terminate();
    await shell[Symbol.asyncDispose]();

    expect(exit).toStrictEqual(await shell.exited);
  });
});

/* I7 lifecycle: an uncertain cleanup is a visible failure that keeps custody, never a returned exit. */
describe.runIf(posix)('createSandboxShellProvider uncertain cleanup', () => {
  const launchWith = async (
    table: NonNullable<Parameters<typeof createSandboxShellProvider>[0]>['processTable'],
    command: string,
  ): Promise<ShellPipesProcess> => {
    const outcome = await custodial({ processTable: table }).launch(
      launchOf({ arguments: ['--noprofile', '--norc', '-c', command] }),
    );
    if (outcome.status !== 'started') {
      throw new Error(`expected a started launch, got ${JSON.stringify(outcome)}`);
    }
    return pipesOf(outcome.process);
  };

  it('should reject settlement and still end its output when the process table cannot be read', async () => {
    const shell = await launchWith(async () => {
      throw new Error('table unavailable');
    }, 'echo done');
    const output = text(shell.stdout);

    await expect(shell.exited).rejects.toThrow('could not confirm');
    expect(await output).toBe('done\n');
  });

  it(
    'should reject settlement when an owned process survives termination',
    async () => {
      const root = { pid: 0 };
      const lying = await custodial({
        processTable: async () => {
          const rows = await processTable();
          return [
            ...rows.filter((row) => row.pid !== root.pid),
            { pid: root.pid, ppid: 1, pgid: root.pid, zombie: false },
          ];
        },
      }).launch(launchOf({ arguments: ['--noprofile', '--norc', '-c', 'echo $$; exit 0'] }));
      if (lying.status !== 'started') {
        throw new Error('expected a started launch');
      }
      const pipes = pipesOf(lying.process);
      const printed = await text(pipes.stdout);
      root.pid = Number(printed.trim());

      await expect(pipes.exited).rejects.toThrow(/survived|could not confirm/u);
      /* A survivor is reported only once the whole termination deadline has passed. */
    },
    terminationDeadline + 15_000,
  );
});

describe.runIf(process.platform === 'linux')('createSandboxShellProvider terminal', () => {
  it('should give the shell its own controlling terminal with job control, resize and Ctrl-C', async () => {
    const shell = await started(
      launchOf({
        arguments: ['--noprofile', '--norc', '--noediting', '-i'],
        environment: { PATH: '/usr/bin:/bin', PS1: '', TERM: 'dumb' },
        stdio: { kind: 'terminal', size: { columns: 80, rows: 24 } },
      }),
    );
    if (shell.kind !== 'terminal') {
      throw new Error('expected a terminal');
    }
    const decoder = new TextDecoder();
    let transcript = '';
    const reading = (async () => {
      for await (const chunk of shell.output) {
        transcript += decoder.decode(chunk, { stream: true });
      }
    })();
    const waitFor = async (marker: string): Promise<void> => {
      const deadline = Date.now() + 10_000;
      while (!transcript.includes(marker) && Date.now() < deadline) {
        // oxlint-disable-next-line no-await-in-loop -- polls the transcript until the marker arrives.
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
      }
    };
    const type = (line: string): void => {
      shell.write(new TextEncoder().encode(line));
    };

    type('test -t 0 && echo TTY-$((40+2)); case $- in *m*) echo JOBS-$((2+3)) ;; esac\n');
    await waitFor('TTY-42');
    shell.resize({ columns: 137, rows: 43 });
    type('echo SIZE-$(stty size | tr " " x)\n');
    await waitFor('SIZE-43x137');
    type('sleep 30\n');
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    type('\u0003');
    type('echo AFTER-$((1+1))\n');
    await waitFor('AFTER-2');
    type('exit 3\n');

    expect(await shell.exited).toStrictEqual({ exitCode: 3 });
    await reading;
    expect(transcript).toMatch(/TTY-42[\s\S]*JOBS-5[\s\S]*SIZE-43x137[\s\S]*\^C[\s\S]*AFTER-2/u);
  }, 30_000);
});

describe('shellSandboxProfile', () => {
  it('should reopen only the Zsh startup files, read-only, for the human Terminal Zsh', () => {
    const home = '/Users/person';
    const startup = ['.zshenv', '.zprofile', '.zshrc', '.zlogin'].map((name) => join(home, name));
    const launch = { filesystem: { readable: [], writable: [], denied: [] }, network: { domains: [] } };
    const clean = shellSandboxProfile(launch, { home }) as { filesystem: Record<string, string[]> };
    const zsh = shellSandboxProfile({ ...launch, startupFiles: 'zsh' }, { home }) as {
      filesystem: Record<string, string[]>;
    };

    expect(clean.filesystem['denyRead']).toStrictEqual(expect.arrayContaining(startup));
    expect(startup.filter((path) => zsh.filesystem['denyRead']!.includes(path))).toStrictEqual([]);
    expect(zsh.filesystem['allowRead']).toStrictEqual(expect.arrayContaining(startup));
    expect(zsh.filesystem['denyWrite']).toStrictEqual(expect.arrayContaining(startup));
    expect(zsh.filesystem['allowWrite']).toStrictEqual(clean.filesystem['allowWrite']);
    expect(zsh.filesystem['denyRead']).toStrictEqual(
      expect.arrayContaining([join(home, '.ssh'), join(home, '.bashrc'), join(home, '.config/git')]),
    );
  });

  it('should allow exactly the granted names and deny every other destination', () => {
    const profile = shellSandboxProfile({
      filesystem: { readable: [], writable: [], denied: [] },
      network: { domains: ['registry.npmjs.org'] },
    });

    expect(profile['network']).toStrictEqual({
      allowedDomains: ['registry.npmjs.org'],
      deniedDomains: [],
      strictAllowlist: true,
    });
  });

  it('should deny every destination when nothing is granted', () => {
    const profile = shellSandboxProfile({
      filesystem: { readable: [], writable: [], denied: [] },
      network: { domains: [] },
    });

    expect(profile['network']).toStrictEqual({ allowedDomains: [], deniedDomains: ['*'], strictAllowlist: true });
  });

  it.runIf(process.platform === 'linux')('should mask a denied symbolic link through its target only', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'target'));
    symlinkSync(join(root, 'target'), join(root, 'link'));
    const profile = shellSandboxProfile({
      filesystem: { readable: [], writable: [], denied: [join(root, 'link')] },
      network: { domains: [] },
    }) as { filesystem: Record<string, string[]> };

    expect(profile.filesystem['denyRead']).toContain(join(root, 'target'));
    expect(profile.filesystem['denyRead']).not.toContain(join(root, 'link'));
  });

  it.runIf(process.platform === 'linux')(
    'should mask a denied or read-only path under a symbolic-link ancestor through its physical spelling only',
    () => {
      /* `/var/run/docker.sock` on Ubuntu: the leaf is a file, its parent `/var/run` links to `/run`. */
      const root = fixtureRoot();
      mkdirSync(join(root, 'run'));
      symlinkSync(join(root, 'run'), join(root, 'var-run'));
      writeFileSync(join(root, 'run', 'docker.sock'), '');
      writeFileSync(join(root, 'run', 'pinned'), '');
      const profile = shellSandboxProfile({
        filesystem: {
          readable: [],
          writable: [],
          readOnly: [join(root, 'var-run', 'pinned')],
          denied: [join(root, 'var-run', 'docker.sock')],
        },
        network: { domains: [] },
      }) as { filesystem: Record<string, string[]> };

      for (const facet of ['denyRead', 'denyWrite']) {
        expect(profile.filesystem[facet]).toContain(join(root, 'run', 'docker.sock'));
        expect(profile.filesystem[facet]).not.toContain(join(root, 'var-run', 'docker.sock'));
      }
      expect(profile.filesystem['denyWrite']).toContain(join(root, 'run', 'pinned'));
      expect(profile.filesystem['denyWrite']).not.toContain(join(root, 'var-run', 'pinned'));
    },
  );

  it.runIf(process.platform === 'linux')(
    'should keep a denied path that does not exist under its literal spelling',
    () => {
      const root = fixtureRoot();
      mkdirSync(join(root, 'run'));
      symlinkSync(join(root, 'run'), join(root, 'var-run'));
      const profile = shellSandboxProfile({
        filesystem: { readable: [], writable: [], denied: [join(root, 'var-run', 'absent.sock')] },
        network: { domains: [] },
      }) as { filesystem: Record<string, string[]> };

      expect(profile.filesystem['denyRead']).toContain(join(root, 'var-run', 'absent.sock'));
    },
  );

  it('should let the sandbox read the supervisor runtime directory but not write it', () => {
    const profile = shellSandboxProfile(
      { filesystem: { readable: [], writable: [], denied: [] }, network: { domains: ['example.com'] } },
      {},
      '/tmp/tau-shell-runtime-test',
    ) as { filesystem: Record<string, string[]> };

    expect(profile.filesystem['allowRead']).toContain('/tmp/tau-shell-runtime-test');
    expect(profile.filesystem['allowWrite']).not.toContain('/tmp/tau-shell-runtime-test');
  });

  it('should deny reads and writes of denied paths and the baseline set inside granted roots', () => {
    const profile = shellSandboxProfile(
      {
        filesystem: { readable: ['/srv/project'], writable: ['/srv/session'], denied: ['/srv/project/.git'] },
        network: { domains: [] },
      },
      { home: '/home/person' },
    ) as { filesystem: Record<string, string[]> };

    expect(profile.filesystem['allowRead']).toStrictEqual(expect.arrayContaining(['/srv/project', '/srv/session']));
    expect(profile.filesystem['allowWrite']).toStrictEqual(['/srv/session']);
    for (const facet of ['denyRead', 'denyWrite']) {
      expect(profile.filesystem[facet]).toStrictEqual(
        expect.arrayContaining(['/srv/project/.git', '/home/person/.ssh']),
      );
    }
  });
});

describe('shellSandboxProfile read-only roots', () => {
  it('should allow reads but deny writes of read-only paths inside a writable root', () => {
    const profile = shellSandboxProfile(
      {
        filesystem: {
          readable: [],
          writable: ['/srv/project'],
          readOnly: ['/srv/project/.tau/chats', '/srv/project/exports'],
          denied: ['/srv/project/.git'],
        },
        network: { domains: [] },
      },
      { home: '/home/person' },
    ) as { filesystem: Record<string, string[]> };

    expect(profile.filesystem['allowRead']).toStrictEqual(
      expect.arrayContaining(['/srv/project', '/srv/project/.tau/chats', '/srv/project/exports']),
    );
    /* On Linux the ancestors between the writable root and a protected path are bound onto themselves (E04). */
    expect(profile.filesystem['allowWrite']).toStrictEqual(
      process.platform === 'linux' ? ['/srv/project', '/srv/project/.tau'] : ['/srv/project'],
    );
    expect(profile.filesystem['denyWrite']).toStrictEqual(
      expect.arrayContaining(['/srv/project/.tau/chats', '/srv/project/exports', '/srv/project/.git']),
    );
    expect(profile.filesystem['denyRead']).not.toContain('/srv/project/.tau/chats');
    expect(profile.filesystem['denyRead']).not.toContain('/srv/project/exports');
  });
});

describe('seatbeltReadDenies', () => {
  it('should spell a denied directory that holds a readable path as the glob of its own name', () => {
    expect(
      seatbeltReadDenies(
        ['/srv/project/.git', '/srv/project/.tau/binding.json', '/home/person/.ssh'],
        ['/srv/project', '/srv/project/.git/objects'],
      ),
    ).toStrictEqual(['/srv/project/.gi[t]', '/srv/project/.tau/binding.json', '/home/person/.ssh']);
  });

  it('should keep the literal spelling when the path already reads as a glob or ends in a character no bracket holds', () => {
    expect(
      seatbeltReadDenies(['/srv/[x]/.git', '/srv/p/odd-'], ['/srv/[x]/.git/objects', '/srv/p/odd-/inner']),
    ).toStrictEqual(['/srv/[x]/.git', '/srv/p/odd-']);
  });
});

/*
 * The macOS profile at the generation level (blueprint E1, review finding 2): the provider's lists for a checkout
 * whose `.git/objects` is read-only inside the denied `.git`, through the runtime's own Seatbelt generator, judged by
 * last-match-wins. Proven here on every platform; the kernel's enforcement is observed only on a Mac.
 */
describe('shellSandboxProfile on macOS', () => {
  const darwinProfile = (launch: Parameters<typeof shellSandboxProfile>[0]): ProfileFilesystem => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' });
    try {
      return (shellSandboxProfile(launch, { home: '/Users/person' }) as { filesystem: ProfileFilesystem }).filesystem;
    } finally {
      Object.defineProperty(process, 'platform', platform);
    }
  };

  const checkoutLaunch = (root: string): Parameters<typeof shellSandboxProfile>[0] => {
    for (const directory of ['.git/objects/ab', '.git/refs/tau/chats', '.tau/chats', 'src']) {
      mkdirSync(join(root, 'project', directory), { recursive: true });
    }
    mkdirSync(join(root, 'view'));
    mkdirSync(join(root, 'home'));
    const project = join(root, 'project');
    return {
      filesystem: {
        readable: [],
        writable: [project, join(root, 'home')],
        readOnly: [join(project, '.tau', 'chats'), join(project, '.git', 'objects'), join(root, 'view')],
        denied: [join(project, '.git'), join(project, '.tau', 'binding.json')],
      },
      network: { domains: [] },
    };
  };

  it('should let a launch read but never write the objects inside the denied .git, and keep the rest of .git denied', () => {
    const root = fixtureRoot();
    const project = join(root, 'project');
    const profile = seatbeltProfileOf(darwinProfile(checkoutLaunch(root)));
    const decide = (operation: string, path: string): string => seatbeltDecision(profile, { operation, path });

    expect(decide('file-read-data', join(project, 'src', 'main.scad'))).toBe('allow');
    expect(decide('file-read-data', join(project, '.git', 'objects', 'ab', 'cdef'))).toBe('allow');
    expect(decide('file-read-data', join(project, '.git', 'objects', 'pack', 'pack-1.pack'))).toBe('allow');
    expect(decide('file-read-data', join(root, 'view', 'HEAD'))).toBe('allow');
    for (const hidden of ['config', 'HEAD', 'packed-refs', 'refs/tau/chats/c1', 'lfs/objects/x', 'credentials', '']) {
      expect(decide('file-read-data', join(project, '.git', hidden)), hidden).toBe('deny');
    }
    /* A name a long session creates later is denied too: the deny is the directory, not a list of its children. */
    expect(decide('file-read-data', join(project, '.git', 'created-later'))).toBe('deny');
    expect(decide('file-read-data', join(project, '.tau', 'binding.json'))).toBe('deny');
    for (const operation of ['file-write-data', 'file-write-create', 'file-write-unlink']) {
      expect(decide(operation, join(project, '.git', 'objects', 'ab', 'cdef')), operation).toBe('deny');
      expect(decide(operation, join(project, '.git', 'objects', 'new')), operation).toBe('deny');
      expect(decide(operation, join(project, '.git', 'config')), operation).toBe('deny');
      expect(decide(operation, join(project, '.git')), operation).toBe('deny');
      expect(decide(operation, join(root, 'view', 'HEAD')), operation).toBe('deny');
    }
    expect(decide('file-write-data', join(project, 'src', 'main.scad'))).toBe('allow');
  });

  it('should leave the objects denied with the literal deny the runtime would re-emit, the failure this fixes', () => {
    const root = fixtureRoot();
    const project = join(root, 'project');
    const filesystem = darwinProfile(checkoutLaunch(root));
    const literal = seatbeltProfileOf({
      ...filesystem,
      denyRead: filesystem.denyRead.map((path) => path.replace('.gi[t]', '.git')),
    });

    expect(
      seatbeltDecision(literal, { operation: 'file-read-data', path: join(project, '.git', 'objects', 'x') }),
    ).toBe('deny');
  });

  /*
   * The person's Terminal reads the real store (operator ruling 2026-11-12): `.git` is read-only and not denied. A
   * read-only root is carved out of a denied one only when it lies strictly inside it, so naming `.git` in both lists
   * would leave every read denied on macOS, while Linux binds it back readable: the two must never be combined.
   */
  const terminalLaunch = (
    root: string,
    lists: Readonly<{ readOnly: readonly string[]; denied: readonly string[] }>,
  ): Parameters<typeof shellSandboxProfile>[0] => {
    const project = join(root, 'project');
    for (const directory of ['.git/objects/ab', '.git/refs/heads', '.git/hooks', '.git/lfs', 'src']) {
      mkdirSync(join(project, directory), { recursive: true });
    }
    mkdirSync(join(root, 'home'));
    return {
      filesystem: { readable: [], writable: [project, join(root, 'home')], ...lists },
      network: { domains: [] },
    };
  };

  it('should let the Terminal read every file of a read-only .git and write, create or remove none of it', () => {
    const root = fixtureRoot();
    const project = join(root, 'project');
    const store = join(project, '.git');
    const profile = seatbeltProfileOf(
      darwinProfile(terminalLaunch(root, { readOnly: [store], denied: [join(project, '.tau', 'binding.json')] })),
    );
    const decide = (operation: string, path: string): string => seatbeltDecision(profile, { operation, path });

    for (const path of ['', 'HEAD', 'index', 'config', 'refs/heads/main', 'objects/ab/cdef', 'lfs/objects/x']) {
      expect(decide('file-read-data', join(store, path)), path).toBe('allow');
    }
    for (const operation of ['file-write-data', 'file-write-create', 'file-write-unlink']) {
      for (const path of ['', 'HEAD', 'index.lock', 'config', 'hooks/post-commit', 'objects/ab/new', 'lfs/tmp/x']) {
        expect(decide(operation, join(store, path)), `${operation} ${path}`).toBe('deny');
      }
    }
    expect(decide('file-read-data', join(project, '.tau', 'binding.json'))).toBe('deny');
    expect(decide('file-write-data', join(project, 'src', 'main.scad'))).toBe('allow');
  });

  /*
   * A Terminal whose store is writable: `.git` is in no list, so the checkout's write root covers it, and only the names
   * through which git runs a program are read-only, each under its canonical spelling and as the caseless glob the
   * shell service writes for it (a case-folding volume reads `.git/COMMONDIR` as `commondir`).
   */
  const executableNames = ['config', 'hooks', 'commondir', 'config.worktree', 'worktrees', 'modules'];
  const caseless = (name: string): string =>
    [...name]
      .map((character) => (/[a-z]/u.test(character) ? `[${character}${character.toUpperCase()}]` : character))
      .join('');

  it('should let the Terminal write a store all but the names that run a program, under any spelling', () => {
    const root = fixtureRoot();
    const project = join(root, 'project');
    const store = join(project, '.git');
    const readOnly = executableNames.flatMap((name) => [join(store, name), join(store, caseless(name))]);
    const profile = seatbeltProfileOf(
      darwinProfile(terminalLaunch(root, { readOnly, denied: [join(project, '.tau', 'binding.json')] })),
    );
    const decide = (operation: string, path: string): string => seatbeltDecision(profile, { operation, path });

    for (const path of ['', 'HEAD', 'index', 'config', 'hooks/pre-commit', 'objects/ab/cdef', 'lfs/objects/x']) {
      expect(decide('file-read-data', join(store, path)), path).toBe('allow');
    }
    /* What add, commit, switch -c, stash and merge write, and the lock git renames into place. */
    const written = [
      'index.lock',
      'index',
      'HEAD.lock',
      'HEAD',
      'ORIG_HEAD',
      'MERGE_HEAD',
      'MERGE_MSG',
      'AUTO_MERGE',
      'COMMIT_EDITMSG',
      'packed-refs.lock',
      'objects/ab/new',
      'objects/pack/pack-1.pack',
      'refs/heads/side.lock',
      'refs/stash',
      'logs/HEAD',
      'logs/refs/stash',
      'lfs/objects/ab/cd/x',
      'lfs/tmp/x',
      'config.lock',
    ];
    for (const operation of ['file-write-data', 'file-write-create', 'file-write-unlink']) {
      for (const path of written) {
        expect(decide(operation, join(store, path)), `${operation} ${path}`).toBe('allow');
      }
    }
    /*
     * Every write to a protected name fails, including the rename of `config.lock` over `config`, a new top-level name
     * created in any case, and a move of `.git` itself.
     */
    const refused = [
      'config',
      'CONFIG',
      'hooks',
      'hooks/post-commit',
      'Hooks/post-commit',
      'commondir',
      'COMMONDIR',
      'CommonDir',
      'config.worktree',
      'Config.Worktree',
      'worktrees/linked/commondir',
      'WorkTrees/linked/commondir',
      'modules/vendor/config',
      'modules/vendor/hooks/post-checkout',
    ];
    for (const operation of ['file-write-data', 'file-write-create', 'file-write-unlink']) {
      for (const path of refused) {
        expect(decide(operation, join(store, path)), `${operation} ${path}`).toBe('deny');
      }
    }
    /* `.git` itself can be neither renamed away nor replaced. */
    for (const operation of ['file-write-create', 'file-write-unlink']) {
      expect(decide(operation, store), `${operation} .git`).toBe('deny');
    }
    expect(decide('file-read-data', join(project, '.tau', 'binding.json'))).toBe('deny');
    expect(decide('file-write-data', join(project, 'src', 'main.scad'))).toBe('allow');
  });

  it('should leave an absent name creatable under another case with the canonical spelling alone, the gap the glob closes', () => {
    const root = fixtureRoot();
    const store = join(root, 'project', '.git');
    const readOnly = executableNames.map((name) => join(store, name));
    const profile = seatbeltProfileOf(darwinProfile(terminalLaunch(root, { readOnly, denied: [] })));

    expect(seatbeltDecision(profile, { operation: 'file-write-create', path: join(store, 'commondir') })).toBe('deny');
    expect(seatbeltDecision(profile, { operation: 'file-write-create', path: join(store, 'COMMONDIR') })).toBe('allow');
  });

  it('should deny every read of a .git named both read-only and denied, the shape that must not return', () => {
    const root = fixtureRoot();
    const store = join(root, 'project', '.git');
    const profile = seatbeltProfileOf(darwinProfile(terminalLaunch(root, { readOnly: [store], denied: [store] })));

    for (const path of ['', 'HEAD', 'index', 'refs/heads/main', 'objects/ab/cdef']) {
      expect(seatbeltDecision(profile, { operation: 'file-read-data', path: join(store, path) }), path).toBe('deny');
    }
  });
});

describe.runIf(process.platform === 'linux')('shellSandboxProfile read-only path inside a denied one on Linux', () => {
  it('should never bind the denied directory writable to pin a read-only path inside it', () => {
    const profile = shellSandboxProfile(
      {
        filesystem: {
          readable: [],
          writable: ['/srv/project'],
          readOnly: ['/srv/project/.git/objects', '/srv/project/.tau/chats'],
          denied: ['/srv/project/.git'],
        },
        network: { domains: [] },
      },
      { home: '/home/person' },
    ) as { filesystem: Record<string, string[]> };

    expect(profile.filesystem['allowWrite']).toStrictEqual(['/srv/project', '/srv/project/.tau']);
    expect(profile.filesystem['allowRead']).toContain('/srv/project/.git/objects');
    expect(profile.filesystem['denyRead']).toContain('/srv/project/.git');
    expect(profile.filesystem['denyWrite']).toStrictEqual(
      expect.arrayContaining(['/srv/project/.git', '/srv/project/.git/objects']),
    );
  });
});

describe('shellSandboxCommand', () => {
  it('should quote the vector and environment so nothing is reinterpreted', () => {
    const command = shellSandboxCommand({
      executablePath: '/bin/bash',
      arguments: ['--noprofile', '--norc', '-c', "echo 'a' $(b) `c`"],
      environment: { HOME: "/srv/it's" },
      stdio: { kind: 'pipes' },
    });

    expect(command).toBe(
      String.raw`HOME='/srv/it'\''s' exec '/bin/bash' '--noprofile' '--norc' '-c' 'echo '\''a'\'' $(b) ` + "`c`'",
    );
  });

  it('should run the workload only once its announcement succeeded', () => {
    const command = shellSandboxCommand(
      {
        executablePath: '/bin/bash',
        arguments: ['-c', 'true'],
        environment: { HOME: '/srv' },
        stdio: { kind: 'pipes' },
      },
      String.raw`printf '\033]7771;tau-launch;n\007' >&2`,
    );

    expect(command).toBe(
      String.raw`printf '\033]7771;tau-launch;n\007' >&2 && HOME='/srv' exec '/bin/bash' '-c' 'true'`,
    );
  });
});

describe('bindOwnPty', () => {
  const wrapped = `env A=1 /usr/bin/sandbox-exec -p '(version 1)\n(deny default)\n(allow file-read* (literal '"'"'/x'"'"'))' /bin/sh -c 'exec bash -i'`;

  it('should pass the session PTY as a profile parameter and allow only that PTY', () => {
    const bound = bindOwnPty(['/bin/sh', '-c', wrapped]);

    expect(bound).toStrictEqual([
      '/bin/sh',
      '-c',
      'TAU_TTY=$(/usr/bin/tty) || exit 125; case "$TAU_TTY" in /dev/ttys[0-9]*) ;; *) exit 125 ;; esac; exec ' +
        `env A=1 /usr/bin/sandbox-exec -D "TAU_TTY=$TAU_TTY" -p '(version 1)\n(deny default)\n(allow file-read* (literal '"'"'/x'"'"'))` +
        `\n; Tau: this session pty only\n(allow file-ioctl file-read-data file-write-data (literal (param "TAU_TTY")))' /bin/sh -c 'exec bash -i'`,
    ]);
  });

  it('should refuse a vector without exactly one Seatbelt profile', () => {
    expect(bindOwnPty(['/bin/sh', '-c', 'bwrap -- /bin/sh'])).toBeUndefined();
  });
});

describe.runIf(process.platform === 'linux')('Linux runtime working directory and stand-ins', () => {
  // Both rows launch through the prepared-launch harness: under I7 custody an unprepared launch is refused before
  // the runtime directory or the writable-root check is reached, so preparation is what lets the landed main
  // behaviour be observed at all.
  it('should start the supervisor in its private runtime directory, never the host working directory', async () => {
    const outcome = await custodial().launch(
      launchOf({ arguments: ['--noprofile', '--norc', '-c', 'echo TAU_FIXTURE_CWD'] }),
    );

    expect(outcome.status).toBe('sandbox-unavailable');
    const message = outcome.status === 'sandbox-unavailable' ? outcome.message : '';
    expect(message).toMatch(/^cwd=.*\/tau-shell-runtime-[^/]+$/u);
    expect(message).not.toBe(`cwd=${process.cwd()}`);
  });

  it('should refuse a launch whose writable root holds the host working directory', async () => {
    const outcome = await custodial().launch(
      launchOf({
        arguments: ['--noprofile', '--norc', '-c', 'true'],
        filesystem: { readable: [], writable: [process.cwd()], denied: [] },
      }),
    );

    expect(outcome.status).toBe('sandbox-unavailable');
    expect(outcome.status === 'sandbox-unavailable' ? outcome.message : '').toContain('writable root');
  });

  it('should leave the runtime no absent protected path inside a writable root to mount for itself', () => {
    const root = fixtureRoot();
    const home = join(root, 'home');
    mkdirSync(home);
    const project = join(root, 'project');
    const second = join(root, 'second');
    // A writable private home puts the baseline denies inside a writable root, next to the checkout's own rows; a
    // second checkout's control row is absent, with its `.tau` absent too.
    const launch = {
      filesystem: {
        readable: [],
        writable: [root],
        readOnly: [join(project, '.tau', 'runs')],
        denied: [join(project, '.git'), join(project, '.tau', 'binding.json'), join(second, '.tau', 'binding.json')],
        directories: [join(project, '.tau', 'runs'), join(project, '.git')],
      },
      network: { domains: [] },
    };
    type Lists = { filesystem: { denyWrite: string[]; allowWrite: string[] } };
    const profile = shellSandboxProfile(launch, { home }) as Lists;
    const release = holdProtectedStandIns({ ...profile.filesystem, directories: launch.filesystem.directories });
    const mounted = profile.filesystem.denyWrite.filter((path) =>
      profile.filesystem.allowWrite.some((writable) => path !== writable && path.startsWith(`${writable}/`)),
    );
    try {
      expect(mounted).toStrictEqual(
        expect.arrayContaining([join(home, '.ssh'), join(project, '.git'), join(second, '.tau', 'binding.json')]),
      );
      // Every entry of the runtime's own deny list inside a writable root is now present: no runtime mount point.
      expect(mounted.filter((path) => !existsSync(path))).toStrictEqual([]);
      expect(lstatSync(join(second, '.tau', 'binding.json')).isFile()).toBe(true);
      expect(lstatSync(join(project, '.tau', 'runs')).isDirectory()).toBe(true);
    } finally {
      release();
    }
    expect(mounted.filter((path) => existsSync(path))).toStrictEqual([]);
    expect(existsSync(join(second, '.tau'))).toBe(false);
  });
});
