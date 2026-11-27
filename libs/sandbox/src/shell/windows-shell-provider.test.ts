/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
// @vitest-environment node
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import type {
  ShellExit,
  ShellLaunch,
  ShellLaunchOutcome,
  ShellPipesProcess,
  ShellProcess,
  ShellProvider,
  ShellTerminalProcess,
} from '#shell/shell-provider.js';
import { createWindowsShellProvider, readWindowsSandboxStatus } from '#shell/windows-shell-provider.js';
import type { WindowsSandboxHelperSpawn, WindowsShellProviderOptions } from '#shell/windows-shell-provider.js';

/*
 * Orchestration tests (testing contract, layering rule 2): the helper fixture speaks the launch protocol but contains
 * nothing and runs no shell, so these prove the provider's admission, ordering, settlement, termination and recovery,
 * never containment. Containment is the WIN-X64 conformance row's job on real Windows.
 */
const fixture = fileURLToPath(new URL('windows-sandbox-helper.fixture.ts', import.meta.url));

const pwsh = String.raw`C:\Program Files\PowerShell\7\pwsh.exe`;
const hostEnvironment = {
  ProgramFiles: String.raw`C:\Program Files`,
  SystemRoot: String.raw`C:\Windows`,
  APPDATA: String.raw`C:\Users\person\AppData\Roaming`,
  LOCALAPPDATA: String.raw`C:\Users\person\AppData\Local`,
};

const roots: string[] = [];
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    // oxlint-disable-next-line no-await-in-loop -- each launch is torn down before its folders go.
    await cleanup();
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

type Harness = Readonly<{
  provider: ShellProvider;
  custody: string;
  session: string;
  log: string;
  gate: string;
  spawned: string[][];
  events: () => Array<Record<string, unknown>>;
  setScenario: (scenario: string) => void;
}>;

const harness = (
  scenario: string,
  options: Partial<Omit<WindowsShellProviderOptions, 'helperPath' | 'spawnHelper' | 'custody'>> & {
    custody?: string;
  } = {},
): Harness => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-windows-provider-')));
  roots.push(root);
  const custody = options.custody ?? join(root, 'custody');
  const session = join(root, 'session');
  mkdirSync(session);
  const log = join(root, 'helper.log');
  const gate = join(root, 'gate');
  const spawned: string[][] = [];
  const current = { scenario };
  const spawnHelper: WindowsSandboxHelperSpawn = (arguments_) => {
    spawned.push([...arguments_]);
    return spawn(process.execPath, [fixture, ...arguments_], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TAU_FIXTURE_SCENARIO: current.scenario,
        TAU_FIXTURE_LOG: log,
        TAU_FIXTURE_GATE: gate,
      },
    });
  };
  const { custody: _custody, ...rest } = options;
  const provider = createWindowsShellProvider({
    helperPath: String.raw`C:\Program Files\Tau\resources\sandbox\tau-windows-sandbox.exe`,
    custody: { directory: custody, sessionDirectory: session },
    spawnHelper,
    home: String.raw`C:\Users\person`,
    environment: hostEnvironment,
    ...rest,
  });
  return {
    provider,
    custody,
    session,
    log,
    gate,
    spawned,
    events: () =>
      existsSync(log)
        ? readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line) as Record<string, unknown>)
        : [],
    setScenario: (next) => {
      current.scenario = next;
    },
  };
};

const prepare = async (h: Harness): Promise<Readonly<{ executionId: string; privateRoot: string }>> => {
  const privateRoot = mkdtempSync(join(h.session, 'tau-shell-'));
  const { executionId } = await h.provider.prepare({
    privateRoot,
    resource: undefined,
  });
  return { executionId, privateRoot };
};

const launchOf = (executionId: string, overrides: Partial<ShellLaunch> = {}): ShellLaunch => ({
  executionId,
  executablePath: pwsh,
  arguments: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Write-Output hello'],
  workingDirectory: String.raw`C:\Projects\gear`,
  commandId: 'shell:test',
  filesystem: {
    readable: [],
    writable: [String.raw`C:\Projects\gear`, String.raw`C:\Temp\tau-shell-1\home`],
    denied: [String.raw`C:\Users\person\AppData\Roaming\Tau`],
  },
  network: { domains: [] },
  environment: { PATH: String.raw`C:\Windows\System32` },
  stdio: { kind: 'pipes' },
  signal: new AbortController().signal,
  ...overrides,
});

const startedProcess = (outcome: ShellLaunchOutcome): ShellProcess => {
  if (outcome.status !== 'started') {
    throw new Error(`expected a started launch, got ${JSON.stringify(outcome)}`);
  }
  cleanups.push(async () => {
    await outcome.process.terminate().catch(() => undefined);
  });
  return outcome.process;
};

const pipesOf = (outcome: ShellLaunchOutcome): ShellPipesProcess => {
  const process_ = startedProcess(outcome);
  if (process_.kind !== 'pipes') {
    throw new Error('expected pipes');
  }
  return process_;
};

const terminalOf = (outcome: ShellLaunchOutcome): ShellTerminalProcess => {
  const process_ = startedProcess(outcome);
  if (process_.kind !== 'terminal') {
    throw new Error('expected a terminal');
  }
  return process_;
};

const drain = async (chunks: AsyncIterable<Uint8Array<ArrayBuffer>>): Promise<string> => {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of chunks) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text;
};

const pending = Symbol('pending');
const settledWithin = async <Value>(promise: Promise<Value>, milliseconds: number): Promise<Value | typeof pending> =>
  Promise.race([
    promise,
    new Promise<typeof pending>((resolve) => {
      setTimeout(() => {
        resolve(pending);
      }, milliseconds);
    }),
  ]);

/** Recover and release an execution after its private root is gone, as the shell service does. */
const finish = async (h: Harness, execution: Readonly<{ executionId: string; privateRoot: string }>) => {
  const [recovery] = await h.provider.recover({
    executionIds: [execution.executionId],
  });
  if (recovery?.status === 'stopped') {
    rmSync(execution.privateRoot, { recursive: true, force: true });
    await h.provider.release({ executionId: execution.executionId });
  }
  return recovery;
};

const journalOf = (h: Harness, executionId: string): string => join(realpathSync(h.custody), `${executionId}.acl.json`);

describe('createWindowsShellProvider', () => {
  it('should be named for the restricted-token helper and its protocol version', () => {
    expect(harness('echo').provider.name).toBe('tau-windows-restricted-token-1');
  });

  describe('launch ordering', () => {
    it('should send start only after ready, once the custody record names the helper', async () => {
      const h = harness('echo');
      const execution = await prepare(h);

      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId)));
      const [stdout, stderr, exit] = await Promise.all([drain(child.stdout), drain(child.stderr), child.exited]);

      expect({ stdout, stderr, exit }).toStrictEqual({
        stdout: 'hello\n',
        stderr: 'warn\n',
        exit: { exitCode: 0 },
      });
      const events = h.events();
      expect(events.filter((event) => event['event'] === 'frame').map((event) => event['type'])).toStrictEqual([
        0x01, 0x02,
      ]);
      const start = events.find((event) => event['event'] === 'start');
      expect(start?.['custody']).toMatchObject({
        executionId: execution.executionId,
        phase: 'armed',
        journal: journalOf(h, execution.executionId),
        launcherPid: expect.any(Number) as unknown,
        runnerPid: expect.any(Number) as unknown,
      });
      expect(h.spawned).toStrictEqual([['launch']]);
      expect(await finish(h, execution)).toMatchObject({ status: 'stopped' });
    });

    it('should hand the helper the launch with the journal and the Windows baseline denied set', async () => {
      const h = harness('echo');
      const execution = await prepare(h);

      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId)));
      await child.exited;

      const spec = h.events().find((event) => event['event'] === 'spec')?.['spec'] as Record<string, unknown>;
      expect(spec).toMatchObject({
        version: 1,
        executable: pwsh,
        arguments: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Write-Output hello'],
        workingDirectory: String.raw`C:\Projects\gear`,
        stdio: { kind: 'pipes' },
        journal: journalOf(h, execution.executionId),
      });
      expect((spec['filesystem'] as { denied: string[] }).denied).toEqual(
        expect.arrayContaining([
          String.raw`C:\Users\person\AppData\Roaming\Tau`,
          String.raw`C:\Users\person\.ssh`,
          String.raw`C:\Users\person\AppData\Roaming\Microsoft\Credentials`,
        ]),
      );
    });
  });

  describe('refusals after start', () => {
    it('should report started only once the helper reports the shell started', async () => {
      const h = harness('hang');
      const execution = await prepare(h);

      const outcome = await h.provider.launch(launchOf(execution.executionId));

      expect(outcome.status).toBe('started');
      expect(h.events().some((event) => event['event'] === 'start')).toBe(true);
      await pipesOf(outcome).terminate();
    });

    it('should turn a refusal between start and started into a clean refusal with the runner diagnostic', async () => {
      const lines: string[] = [];
      const h = harness('refuse-after-start', { onHelperDiagnostic: (line) => lines.push(line) });
      const execution = await prepare(h);

      const outcome = await h.provider.launch(launchOf(execution.executionId));

      expect(outcome).toStrictEqual({
        status: 'sandbox-unavailable',
        message: 'the shell could not be started',
        diagnostic: 'spawn: CreateProcessAsUserW (error 87)',
      });
      await expect
        .poll(() => lines)
        .toStrictEqual(['tau-windows-sandbox runner error: spawn: CreateProcessAsUserW (error 87)']);
      expect(await finish(h, execution)).toMatchObject({ status: 'stopped' });
    });

    it('should treat output before started as a protocol violation and start nothing', async () => {
      const h = harness('output-before-started');
      const execution = await prepare(h);

      const outcome = await h.provider.launch(launchOf(execution.executionId));

      expect(outcome).toMatchObject({
        status: 'sandbox-unavailable',
        message: expect.stringContaining('it sent stdout before started') as unknown,
      });
    });
  });

  describe('refusals before start', () => {
    it('should map an unsupported refusal to its requirement without starting anything', async () => {
      const h = harness('refuse-unsupported');
      const execution = await prepare(h);

      const outcome = await h.provider.launch(launchOf(execution.executionId));

      expect(outcome).toStrictEqual({
        status: 'unsupported',
        requirement: 'filesystem-mask',
        message: 'a denied path cannot be masked',
      });
      expect(h.events().some((event) => event['event'] === 'start')).toBe(false);
      expect(await finish(h, execution)).toMatchObject({ status: 'stopped' });
    });

    it('should map an unavailable refusal with its diagnostic', async () => {
      const h = harness('refuse-unavailable');
      const execution = await prepare(h);

      const outcome = await h.provider.launch(launchOf(execution.executionId));

      expect(outcome).toStrictEqual({
        status: 'sandbox-unavailable',
        message: 'the sandbox account is not set up',
        diagnostic: 'install.json missing',
      });
    });

    it('should answer sandbox-unavailable with the helper log when the helper dies before ready', async () => {
      const h = harness('die-before-ready');
      const execution = await prepare(h);

      const outcome = await h.provider.launch(launchOf(execution.executionId));

      expect(outcome).toMatchObject({
        status: 'sandbox-unavailable',
        message: expect.stringContaining('stopped before it reported') as unknown,
        diagnostic: 'boom: the runner could not be created',
      });
    });

    it('should hand each helper diagnostic line to the host, the unterminated last one included', async () => {
      const lines: string[] = [];
      const h = harness('die-before-ready', { onHelperDiagnostic: (line) => lines.push(line) });
      const execution = await prepare(h);

      await h.provider.launch(launchOf(execution.executionId));

      await expect.poll(() => lines).toStrictEqual(['boom: the runner could not be created']);
    });

    it('should answer sandbox-unavailable when the helper never gets ready', async () => {
      const h = harness('never-ready', { startupMilliseconds: 200 });
      const execution = await prepare(h);

      const outcome = await h.provider.launch(launchOf(execution.executionId));

      expect(outcome).toStrictEqual({
        status: 'sandbox-unavailable',
        message: 'the sandbox helper did not get ready in time.',
      });
      expect(await finish(h, execution)).toMatchObject({ status: 'stopped' });
    });

    it('should refuse a helper that sends output before ready', async () => {
      const h = harness('early-output');
      const execution = await prepare(h);

      const outcome = await h.provider.launch(launchOf(execution.executionId));

      expect(outcome).toMatchObject({
        status: 'sandbox-unavailable',
        message: expect.stringContaining('broke the launch protocol: it sent stdout before ready') as unknown,
      });
    });

    it('should refuse a helper that journals somewhere other than the named journal', async () => {
      const h = harness('wrong-journal');
      const execution = await prepare(h);

      const outcome = await h.provider.launch(launchOf(execution.executionId));

      expect(outcome).toStrictEqual({
        status: 'sandbox-unavailable',
        message: 'the sandbox helper journaled this launch somewhere Tau did not name, so nothing ran.',
      });
      expect(h.events().some((event) => event['event'] === 'start')).toBe(false);
    });

    it('should reject a launch aborted before ready and stop its helper', async () => {
      const h = harness('never-ready');
      const execution = await prepare(h);
      const controller = new AbortController();

      const launching = h.provider.launch(launchOf(execution.executionId, { signal: controller.signal }));
      setTimeout(() => {
        controller.abort(new Error('cancelled by the person'));
      }, 100);

      await expect(launching).rejects.toThrow('cancelled by the person');
      expect(h.events().some((event) => event['event'] === 'terminate')).toBe(true);
      expect(h.events().some((event) => event['event'] === 'start')).toBe(false);
      expect(await finish(h, execution)).toMatchObject({ status: 'stopped' });
    });

    it('should refuse an execution it did not prepare without spawning the helper', async () => {
      const h = harness('echo');

      const outcome = await h.provider.launch(launchOf('00000000-0000-4000-8000-000000000000'));

      expect(outcome).toStrictEqual({
        status: 'sandbox-unavailable',
        message: 'This launch was not prepared, so nothing started.',
      });
      expect(h.spawned).toStrictEqual([]);
    });
  });

  describe('admission', () => {
    it.each<[string, Partial<ShellLaunch>, Extract<ShellLaunchOutcome, { status: 'unsupported' }>['requirement']]>([
      ['a network grant', { network: { domains: ['registry.npmjs.org'] } }, 'network-isolation'],
      [
        'guarded stores',
        {
          stdio: { kind: 'terminal', size: { columns: 80, rows: 24 } },
          filesystem: {
            readable: [],
            writable: [String.raw`C:\Projects\gear`],
            denied: [],
            guardedStores: {
              stores: [String.raw`C:\Projects\gear\.git`],
              protect: ['hooks'],
            },
          },
        },
        'filesystem-mask',
      ],
      ['Zsh startup files', { startupFiles: 'zsh' }, 'filesystem-mask'],
      ['toolchain folders', { toolchainBins: [String.raw`C:\Git\bin`] }, 'environment'],
      ['a refused environment', { environment: { NODE_OPTIONS: '--require x' } }, 'environment'],
      ['a credential-named variable', { environment: { MY_API_KEY: 'x' } }, 'environment'],
      ['a PowerShell outside the fixed paths', { executablePath: String.raw`C:\Users\person\pwsh.exe` }, 'platform'],
      ['a POSIX shell', { executablePath: '/bin/bash' }, 'platform'],
      ['a drive-relative working directory', { workingDirectory: String.raw`C:Projects` }, 'filesystem-mask'],
      [
        'a writable root inside a denied path',
        {
          filesystem: {
            readable: [],
            writable: [String.raw`C:\Projects\gear\.git\x`],
            denied: [String.raw`C:\Projects\gear\.git`],
          },
        },
        'filesystem-mask',
      ],
      ['a zero-sized terminal', { stdio: { kind: 'terminal', size: { columns: 0, rows: 24 } } }, 'terminal'],
    ])('should refuse %s up front', async (_name, overrides, requirement) => {
      const h = harness('echo');
      const execution = await prepare(h);

      const outcome = await h.provider.launch(launchOf(execution.executionId, overrides));

      expect(outcome).toMatchObject({ status: 'unsupported', requirement });
      expect(h.spawned).toStrictEqual([]);
    });

    it('should admit Windows PowerShell 5.1 from System32 whatever its case', async () => {
      const h = harness('echo');
      const execution = await prepare(h);

      const child = pipesOf(
        await h.provider.launch(
          launchOf(execution.executionId, {
            executablePath: String.raw`c:\windows\system32\WindowsPowerShell\v1.0\powershell.exe`,
          }),
        ),
      );

      await expect(child.exited).resolves.toStrictEqual({ exitCode: 0 });
    });
  });

  describe('settlement', () => {
    it('should settle exited only on the exit frame', async () => {
      const h = harness('gate');
      const execution = await prepare(h);
      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId)));
      const stdout = child.stdout[Symbol.asyncIterator]();

      const first = await stdout.next();

      expect(first.done === true ? '' : new TextDecoder().decode(first.value)).toBe('waiting\n');
      expect(await settledWithin(child.exited, 150)).toBe(pending);
      writeFileSync(h.gate, '');
      await expect(child.exited).resolves.toStrictEqual({ exitCode: 3 });
      await expect(stdout.next()).resolves.toStrictEqual({
        done: true,
        value: undefined,
      });
    });

    it('should reject exited on cleanup-failed and keep the journal until recovery restores it', async () => {
      const h = harness('cleanup-failed');
      const execution = await prepare(h);
      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId)));

      await expect(child.exited).rejects.toThrow(
        'could not confirm that the shell stopped and its folder permissions were restored: the job still has a process',
      );
      expect(existsSync(journalOf(h, execution.executionId))).toBe(true);

      const [recovery] = await h.provider.recover({
        executionIds: [execution.executionId],
      });

      expect(recovery).toMatchObject({
        executionId: execution.executionId,
        status: 'stopped',
      });
      expect(h.events().filter((event) => event['event'] === 'restore')).toStrictEqual([
        {
          event: 'restore',
          flag: '--journal',
          journal: journalOf(h, execution.executionId),
        },
      ]);
      expect(existsSync(journalOf(h, execution.executionId))).toBe(false);
    });

    it('should reject exited when the helper dies without reporting exit', async () => {
      const h = harness('crash');
      const execution = await prepare(h);
      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId)));

      await expect(child.exited).rejects.toThrow("stopped before it reported the shell's exit (exit 9)");
      await expect(drain(child.stdout)).resolves.toBe('');
    });

    it('should reject exited and terminate on a protocol violation after start', async () => {
      const h = harness('garbage');
      const execution = await prepare(h);
      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId)));

      await expect(child.exited).rejects.toThrow(
        'broke the launch protocol: The helper sent an unknown frame type 0x7f.',
      );
      expect(h.events().some((event) => event['event'] === 'terminate')).toBe(true);
    });

    it('should block recovery while the helper of a failed launch keeps its journal unrestored', async () => {
      const h = harness('cleanup-failed');
      const execution = await prepare(h);
      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId)));
      await child.exited.catch(() => undefined);
      h.setScenario('restore-fails');

      const [recovery] = await h.provider.recover({
        executionIds: [execution.executionId],
      });

      expect(recovery).toMatchObject({
        status: 'blocked',
        message: expect.stringContaining('could not write the descriptor back') as unknown,
      });
    });
  });

  describe('termination', () => {
    it('should send terminate and settle with the reported signal', async () => {
      const h = harness('hang');
      const execution = await prepare(h);
      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId)));

      const exit = await child.terminate();

      expect(exit).toStrictEqual({ signal: 'SIGKILL' } satisfies ShellExit);
      expect(h.events().some((event) => event['event'] === 'terminate')).toBe(true);
      expect(await finish(h, execution)).toMatchObject({ status: 'stopped' });
    });

    it('should terminate on abort', async () => {
      const h = harness('hang');
      const execution = await prepare(h);
      const controller = new AbortController();
      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId, { signal: controller.signal })));

      controller.abort();

      await expect(child.exited).resolves.toStrictEqual({ signal: 'SIGKILL' });
    });

    it('should terminate on disposal', async () => {
      const h = harness('hang');
      const execution = await prepare(h);
      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId)));

      await child[Symbol.asyncDispose]();

      await expect(child.exited).resolves.toStrictEqual({ signal: 'SIGKILL' });
    });

    it('should kill a helper that ignores terminate and reject exited', async () => {
      const h = harness('ignore-terminate', { terminationMilliseconds: 200 });
      const execution = await prepare(h);
      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId)));

      await expect(child.terminate()).rejects.toThrow('stopped before it reported');
      const [recovery] = await h.provider.recover({
        executionIds: [execution.executionId],
      });
      expect(recovery).toMatchObject({ status: 'stopped' });
      expect(h.events().filter((event) => event['event'] === 'restore')).toHaveLength(1);
    });
  });

  describe('terminal', () => {
    it('should relay input, resize and output through frames', async () => {
      const h = harness('terminal');
      const execution = await prepare(h);
      const terminal = terminalOf(
        await h.provider.launch(
          launchOf(execution.executionId, {
            arguments: ['-NoLogo', '-NoProfile'],
            stdio: { kind: 'terminal', size: { columns: 80, rows: 24 } },
          }),
        ),
      );
      const output = drain(terminal.output);

      terminal.resize({ columns: 100, rows: 40 });
      terminal.write(new TextEncoder().encode('Get-Date\r'));
      terminal.write(new TextEncoder().encode('exit\r'));

      await expect(terminal.exited).resolves.toStrictEqual({ exitCode: 0 });
      await expect(output).resolves.toBe('PS> resized 100x40Get-Date\rexit\r');
      const spec = h.events().find((event) => event['event'] === 'spec')?.['spec'];
      expect(spec).toMatchObject({
        stdio: { kind: 'terminal', columns: 80, rows: 24 },
      });
    });
  });

  describe('concurrency', () => {
    it('should run a second launch while one is live', async () => {
      const h = harness('hang');
      const first = await prepare(h);
      const second = await prepare(h);
      const child = pipesOf(await h.provider.launch(launchOf(first.executionId)));
      h.setScenario('echo');

      const again = pipesOf(await h.provider.launch(launchOf(second.executionId)));

      await expect(again.exited).resolves.toStrictEqual({ exitCode: 0 });
      await child.terminate();
      expect(await finish(h, first)).toMatchObject({ status: 'stopped' });
    });

    it('should launch beside an earlier launch journal that is unrestored, which recovery still restores', async () => {
      const h = harness('cleanup-failed');
      const first = await prepare(h);
      const child = pipesOf(await h.provider.launch(launchOf(first.executionId)));
      await child.exited.catch(() => undefined);
      const second = await prepare(h);
      h.setScenario('echo');

      const again = pipesOf(await h.provider.launch(launchOf(second.executionId)));

      await expect(again.exited).resolves.toStrictEqual({ exitCode: 0 });
      expect(await finish(h, first)).toMatchObject({ status: 'stopped' });
    });

    it('should answer the helper exclusive-launch refusal sandbox-unavailable with nothing started', async () => {
      const h = harness('busy');
      const first = await prepare(h);

      const refused = await h.provider.launch(launchOf(first.executionId));

      expect(refused).toMatchObject({
        status: 'sandbox-unavailable',
        message: expect.stringContaining('locked for over 120 seconds') as unknown,
      });
    });
  });

  describe('custody', () => {
    /** A receipt an earlier, crashed host left behind: armed, with its journal still on disk. */
    const crashedReceipt = (h: Harness, pids: Readonly<{ owner: number; helper: number }>) => {
      const executionId = '6f1d2c4e-1b2a-4c3d-8e9f-0a1b2c3d4e5f';
      const privateRoot = mkdtempSync(join(h.session, 'tau-shell-'));
      mkdirSync(h.custody, { recursive: true });
      const journal = join(realpathSync(h.custody), `${executionId}.acl.json`);
      writeFileSync(journal, JSON.stringify({ entries: [] }));
      writeFileSync(
        join(h.custody, `${executionId}.json`),
        JSON.stringify({
          version: 1,
          executionId,
          phase: 'armed',
          privateRoot,
          owner: {
            pid: pids.owner,
            token: '0f8fad5b-d9cb-469f-a165-70867728950e',
          },
          journal,
          launcherPid: pids.helper,
          runnerPid: pids.helper,
        }),
      );
      return { executionId, privateRoot, journal };
    };

    it('should list prepared executions in its inventory', async () => {
      const h = harness('echo');
      const execution = await prepare(h);

      await expect(h.provider.inventory()).resolves.toStrictEqual([
        {
          executionId: execution.executionId,
          privateRoot: realpathSync(execution.privateRoot),
          resource: undefined,
        },
      ]);
    });

    it('should restore the journal of a crashed host whose helper is gone, then answer stopped', async () => {
      const h = harness('echo', { processAlive: () => false });
      const receipt = crashedReceipt(h, {
        owner: 4_000_001,
        helper: 4_000_002,
      });

      const [recovery] = await h.provider.recover({
        executionIds: [receipt.executionId],
      });

      expect(recovery).toStrictEqual({
        executionId: receipt.executionId,
        privateRoot: receipt.privateRoot,
        resource: undefined,
        status: 'stopped',
      });
      expect(h.events()).toStrictEqual([{ event: 'restore', flag: '--journal', journal: receipt.journal }]);
      await expect(h.provider.release({ executionId: receipt.executionId })).rejects.toThrow(
        'private root must be deleted before release',
      );
      rmSync(receipt.privateRoot, { recursive: true });
      await h.provider.release({ executionId: receipt.executionId });
      await expect(h.provider.inventory()).resolves.toStrictEqual([]);
    });

    it('should block a receipt whose helper is still alive and not take it over', async () => {
      const h = harness('echo', { processAlive: (pid) => pid === 4_000_002 });
      const receipt = crashedReceipt(h, {
        owner: 4_000_001,
        helper: 4_000_002,
      });

      const [recovery] = await h.provider.recover({
        executionIds: [receipt.executionId],
      });

      expect(recovery).toMatchObject({
        status: 'blocked',
        message: 'The sandbox helper of this execution is still running: 4000002, 4000002.',
      });
      expect(existsSync(receipt.journal)).toBe(true);
      expect(h.events()).toStrictEqual([]);
    });

    it('should block a receipt another running Tau process owns', async () => {
      const h = harness('echo', { processAlive: (pid) => pid === 4_000_001 });
      const receipt = crashedReceipt(h, {
        owner: 4_000_001,
        helper: 4_000_002,
      });

      const [recovery] = await h.provider.recover({
        executionIds: [receipt.executionId],
      });

      expect(recovery).toMatchObject({
        status: 'blocked',
        message: 'Another running Tau process owns this shell execution.',
      });
    });

    it('should block a live launch of its own until it ends', async () => {
      const h = harness('hang');
      const execution = await prepare(h);
      const child = pipesOf(await h.provider.launch(launchOf(execution.executionId)));

      const [live] = await h.provider.recover({
        executionIds: [execution.executionId],
      });

      expect(live).toMatchObject({
        status: 'blocked',
        message: 'The sandboxed shell is still running.',
      });
      await child.terminate();
      expect(await finish(h, execution)).toMatchObject({ status: 'stopped' });
    });

    it('should refuse to release an execution that was never recovered', async () => {
      const h = harness('echo');
      const execution = await prepare(h);

      await expect(h.provider.release({ executionId: execution.executionId })).rejects.toThrow(
        'Shell execution has no confirmed stopped receipt.',
      );
    });

    it('should refuse a private root outside the session parent', async () => {
      const h = harness('echo');
      const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'tau-shell-')));
      roots.push(elsewhere);

      await expect(h.provider.prepare({ privateRoot: elsewhere, resource: undefined })).rejects.toThrow(
        'outside the configured session parent',
      );
    });
  });
});

describe('readWindowsSandboxStatus', () => {
  const statusSpawn =
    (scenario: string): WindowsSandboxHelperSpawn =>
    (arguments_) =>
      spawn(process.execPath, [fixture, ...arguments_], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TAU_FIXTURE_SCENARIO: scenario },
      });

  it('should read an install record as installed, asking only the quick question', async () => {
    const asked: string[][] = [];
    const spawnHelper: WindowsSandboxHelperSpawn = (arguments_) => {
      asked.push([...arguments_]);
      return statusSpawn('installed')(arguments_);
    };

    await expect(readWindowsSandboxStatus('helper.exe', { spawnHelper })).resolves.toStrictEqual({ installed: true });
    expect(asked).toStrictEqual([['status', '--quick']]);
  });

  it('should read an absent install record as not installed', async () => {
    await expect(
      readWindowsSandboxStatus('helper.exe', {
        spawnHelper: statusSpawn('absent'),
      }),
    ).resolves.toStrictEqual({
      installed: false,
    });
  });

  it('should read a helper that cannot run as not installed, and say why', async () => {
    const status = await readWindowsSandboxStatus(join(tmpdir(), 'tau-no-such-helper.exe'), {
      environment: {},
    });

    expect(status.installed).toBe(false);
    expect(status.diagnostic).toMatch(/^the helper could not be started: .*ENOENT/u);
  });

  it.skipIf(process.platform === 'win32')(
    "should give the helper the Windows directory's drive as SystemDrive when the host passes none",
    async () => {
      /* A stand-in helper that reads as installed only when it was given the drive and nothing else of the host's. */
      const directory = realpathSync(mkdtempSync(join(tmpdir(), 'tau-status-')));
      const helper = join(directory, 'helper');
      writeFileSync(
        helper,
        `#!/bin/sh\nif [ "$SystemDrive" = "D:" ] && [ -z "$ProgramData" ]; then printf '%s' '{"accountSid":"S-1-5-21-1"}'; else printf '%s' "{\\"installed\\":false}"; fi\n`,
      );
      chmodSync(helper, 0o755);
      try {
        await expect(
          readWindowsSandboxStatus(helper, { environment: { SystemRoot: String.raw`d:\Windows`, HOME: '/nowhere' } }),
        ).resolves.toStrictEqual({ installed: true });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it('should carry the helper stderr when it cannot read its install record', async () => {
    await expect(
      readWindowsSandboxStatus('helper.exe', { spawnHelper: statusSpawn('status-unreadable') }),
    ).resolves.toStrictEqual({
      installed: false,
      diagnostic: 'stderr: tau-windows-sandbox status: Access is denied. (os error 5)',
    });
  });

  it('should carry the exit code, the output and stderr of a helper that failed', async () => {
    await expect(
      readWindowsSandboxStatus('helper.exe', { spawnHelper: statusSpawn('status-crash') }),
    ).resolves.toStrictEqual({
      installed: false,
      diagnostic: 'exit 3; its output is not JSON: "{\\"accountSid\\":"; stderr: thread main panicked',
    });
  });
});
