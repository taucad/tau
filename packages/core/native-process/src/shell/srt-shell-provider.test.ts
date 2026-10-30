/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { processTable } from '#shell/process-tree.js';
import { createShellCustody } from '#shell/shell-custody.js';
import { holdProtectedStandIns } from '#shell/shell-stand-ins.js';
import type { ShellLaunch, ShellLaunchOutcome, ShellPipesProcess, ShellProcess } from '#shell/shell-provider.js';
import {
  bindOwnPty,
  createSandboxShellProvider,
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
const custodial = (overrides: Omit<SandboxShellProviderOptions, 'supervisor' | 'custody'> = {}) => {
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

  it('should reject settlement when an owned process survives termination', async () => {
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
  }, 20_000);
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
  it('should keep absent Linux containers uncreatable without applying macOS literal read denies', () => {
    const root = fixtureRoot();
    const missing = join(root, '.tau');
    const profile = shellSandboxProfile({
      filesystem: { readable: [], writable: [root], denied: [], masked: [missing] },
      network: { domains: [] },
    });
    const filesystem = profile['filesystem'] as { denyRead: string[]; denyWrite: string[] };
    if (process.platform === 'linux') {
      expect(filesystem.denyRead).toContain(missing);
      expect(filesystem.denyWrite).not.toContain(missing);
      expect(filesystem.denyWrite).toContain(join(missing, '.tau-mask-boundary'));
    } else {
      expect(filesystem.denyRead).not.toContain(missing);
      expect(filesystem.denyWrite).not.toContain(missing);
    }
  });

  it.runIf(process.platform === 'linux')('should pin authored descendants without rebinding a masked container', () => {
    const root = fixtureRoot();
    const masked = join(root, '.tau');
    const authored = join(masked, 'parameters');
    const nested = join(authored, 'nested');
    mkdirSync(nested, { recursive: true });
    const denied = join(nested, 'private');
    const profile = shellSandboxProfile({
      filesystem: {
        readable: [],
        writable: [root, authored],
        readOnly: [join(masked, 'chats')],
        denied: [denied],
        masked: [masked],
      },
      network: { domains: [] },
    });
    const filesystem = profile['filesystem'] as { allowWrite: string[]; denyRead: string[]; denyWrite: string[] };
    expect(filesystem.allowWrite).not.toContain(masked);
    expect(filesystem.allowWrite).toEqual(expect.arrayContaining([root, authored, nested]));
    expect(filesystem.denyRead).toEqual(expect.arrayContaining([masked, denied]));
    expect(filesystem.denyWrite).toContain(denied);
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
    // second checkout's reserved container is masked and absent.
    const launch = {
      filesystem: {
        readable: [],
        writable: [root],
        readOnly: [join(project, '.tau', 'runs')],
        denied: [join(project, '.git'), join(project, '.tau', 'binding.json'), join(second, '.tau', 'binding.json')],
        directories: [join(project, '.tau', 'runs'), join(project, '.git')],
        masked: [join(second, '.tau')],
      },
      network: { domains: [] },
    };
    type Lists = { filesystem: { denyWrite: string[]; allowWrite: string[] } };
    const hold = (profile: Lists) =>
      holdProtectedStandIns({
        ...profile.filesystem,
        directories: launch.filesystem.directories,
        masked: launch.filesystem.masked,
        writable: launch.filesystem.writable,
      });
    // As a launch does: hold from the first profile, compute the profile again once the stand-ins exist, hold from it.
    const releaseFirst = hold(shellSandboxProfile(launch, { home }) as Lists);
    const profile = shellSandboxProfile(launch, { home }) as Lists;
    const releaseSecond = hold(profile);
    const mounted = profile.filesystem.denyWrite.filter(
      (path) =>
        profile.filesystem.allowWrite.some((writable) => path !== writable && path.startsWith(`${writable}/`)) &&
        // A masked container's children lie under the runtime's own mask, never on the host.
        !path.startsWith(`${join(second, '.tau')}/`),
    );
    try {
      expect(mounted).toStrictEqual(expect.arrayContaining([join(home, '.ssh'), join(project, '.git')]));
      expect(existsSync(join(second, '.tau'))).toBe(true);
      // Every entry of the runtime's own deny list inside a writable root is now present: no runtime mount point.
      expect(mounted.filter((path) => !existsSync(path))).toStrictEqual([]);
      expect(existsSync(join(second, '.tau', 'binding.json'))).toBe(false);
    } finally {
      releaseSecond();
      releaseFirst();
    }
    expect(mounted.filter((path) => existsSync(path))).toStrictEqual([]);
    expect(existsSync(join(second, '.tau'))).toBe(false);
  });
});
