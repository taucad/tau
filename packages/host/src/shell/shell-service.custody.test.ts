/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
/**
 * I7 cleanup custody in the shell service, driven through the deterministic fake provider (testing contract, layering
 * rule 2): a launch whose cleanup cannot be confirmed is `interrupted`, keeps its private roots, and blocks further
 * commands and Terminal sessions on its checkout. Nothing here proves native termination.
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeShellProvider } from '@taucad/native-process-core/shell';
import type {
  FakeShellOptions,
  FakeShellScript,
  ShellExecutable,
  ShellLaunch,
} from '@taucad/native-process-core/shell';

import { createShellService, probeHostShell } from '#shell/shell-service.js';
import type { ShellCheckout, ShellExecutionHolds, ShellProjectExecutions } from '#shell/shell-service.js';

const executable: ShellExecutable = { kind: 'bash', path: '/bin/bash', realPath: '/bin/bash', digest: 'sha256:00' };
const identity = {
  platform: 'linux',
  kind: 'bash',
  shellVersion: '5.2.21(1)-release',
  shellDigest: 'sha256:00',
  provider: 'fake',
} as const;

let base = '';
let project = '';
let sessions = '';

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tau-shell-custody-')));
  project = join(base, 'projects', 'bracket');
  sessions = join(base, 'sessions');
  await mkdir(join(project, '.tau'), { recursive: true });
  await mkdir(sessions, { recursive: true });
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

/** A run's revision holds, recording every call in order. */
const holdsOf = (log: string[], refuse = false): ShellExecutionHolds => ({
  hold: async (executionId) => {
    log.push(`hold:${executionId}`);
    return refuse ? { status: 'refused', message: 'The turn is closing.' } : { status: 'applied' };
  },
  release: async (executionId) => {
    log.push(`release:${executionId}`);
    return { status: 'applied' };
  },
});

const serviceOf = (
  script: (launch: ShellLaunch) => FakeShellScript,
  extra: Readonly<{
    holds?: ShellExecutionHolds;
    fake?: FakeShellOptions;
    projects?: () => readonly ShellProjectExecutions[];
  }> = {},
) => {
  const provider = createFakeShellProvider(script, extra.fake);
  const checkouts = new Map<string, ShellCheckout>([
    [
      'run-1',
      { cwd: project, admission: 'admission-1', ...(extra.holds === undefined ? {} : { executions: extra.holds }) },
    ],
    ['run-2', { cwd: project, admission: 'admission-1' }],
  ]);
  const service = createShellService({
    ...(extra.projects === undefined ? {} : { projectExecutions: extra.projects }),
    provider,
    executable,
    identity,
    checkouts,
    appDataRoots: [join(base, 'app-data')],
    projectRoots: () => [project],
    platform: 'linux',
    home: join(base, 'home'),
    environment: { PATH: '/usr/bin', LANG: 'C.UTF-8' },
    sessionDirectory: sessions,
  });
  return { service, provider };
};

const sessionRoots = async (): Promise<readonly string[]> => {
  const names = await readdir(sessions);
  return names.filter((name) => name.startsWith('tau-shell-'));
};

const call = (runId: string, command: string) => ({
  toolCallId: `call-${runId}`,
  runId,
  signal: new AbortController().signal,
  approve: undefined,
  input: { command },
});

describe('shell service cleanup custody', () => {
  it('should answer interrupted, keep the private roots and block the checkout when cleanup is unconfirmed', async () => {
    const { service, provider } = serviceOf((launch) =>
      launch.arguments.at(-1) === 'uncertain'
        ? { status: 'started', stdout: 'partial\n', exit: { exitCode: 0 }, cleanup: 'uncertain' }
        : { status: 'started', stdout: 'ok\n', exit: { exitCode: 0 } },
    );

    const output = await service.run(call('run-1', 'uncertain'));

    expect(output).toMatchObject({ status: 'interrupted' });
    expect(output.status === 'interrupted' ? output.message : '').toContain('did not confirm');
    expect(await sessionRoots()).toHaveLength(1);
    expect(await service.run(call('run-2', 'echo next'))).toMatchObject({
      status: 'not-started',
      code: 'checkout-unavailable',
    });
    expect(provider.launches).toHaveLength(1);
    expect(
      await service.openTerminal({
        projectRoot: project,
        size: { columns: 80, rows: 24 },
        signal: new AbortController().signal,
      }),
    ).toMatchObject({ status: 'refused', code: 'sandbox-unavailable' });
    expect(provider.launches).toHaveLength(1);
  });

  it('should keep a Terminal session’s roots and block its project when its cleanup is unconfirmed', async () => {
    const { service, provider } = serviceOf((launch) =>
      launch.stdio.kind === 'terminal'
        ? { status: 'started', exit: { exitCode: 0 }, cleanup: 'uncertain' }
        : { status: 'started', stdout: 'ok\n', exit: { exitCode: 0 } },
    );
    const opened = await service.openTerminal({
      projectRoot: project,
      size: { columns: 80, rows: 24 },
      signal: new AbortController().signal,
    });
    if (opened.status !== 'opened') {
      throw new Error(`expected an opened session, got ${JSON.stringify(opened)}`);
    }

    await expect(opened.session.exited).rejects.toThrow('survived');

    expect(await sessionRoots()).toHaveLength(1);
    expect(await service.run(call('run-1', 'echo next'))).toMatchObject({
      status: 'not-started',
      code: 'checkout-unavailable',
    });
    expect(provider.launches).toHaveLength(1);
  });

  it('should still delete the private roots after a confirmed stop', async () => {
    const { service } = serviceOf(() => ({ status: 'started', stdout: 'ok\n', exit: { exitCode: 0 } }));

    expect(await service.run(call('run-1', 'echo ok'))).toMatchObject({ status: 'completed', exitCode: 0 });
    expect(await sessionRoots()).toHaveLength(0);
  });

  it.runIf(process.platform === 'linux' || process.platform === 'darwin')(
    'should keep the probe’s private roots when its cleanup is unconfirmed',
    async () => {
      const provider = createFakeShellProvider(() => ({
        status: 'started',
        stdout: '5.2.21(1)-release',
        exit: { exitCode: 0 },
        cleanup: 'uncertain',
      }));

      expect(
        await probeHostShell({
          provider,
          checkouts: new Map<string, ShellCheckout>(),
          appDataRoots: [join(base, 'app-data')],
          projectRoots: () => [],
          sessionDirectory: sessions,
        }),
      ).toMatchObject({ status: 'unavailable', code: 'sandbox-unavailable' });
      expect(await sessionRoots()).toHaveLength(1);
    },
  );
});

describe('shell service execution custody', () => {
  it.each(['terminal:earlier', 'resource:earlier'])(
    'should retain the stopped %s receipt until its whole owning project can be read',
    async (key) => {
      const privateRoot = join(sessions, 'tau-shell-bound');
      await mkdir(privateRoot);
      const projects: ShellProjectExecutions[] = [];
      const { service, provider } = serviceOf(() => ({ status: 'started', exit: { exitCode: 0 } }), {
        fake: {
          prior: [{ executionId: 'bound', privateRoot, resource: { key, root: project }, phase: 'exited' }],
        },
        projects: () => projects,
      });

      await service.reconcile?.();
      expect(provider.released).toEqual([]);
      expect(existsSync(privateRoot)).toBe(true);
      expect(await service.run(call('run-1', 'echo blocked'))).toMatchObject({ status: 'not-started' });
      expect(provider.launches).toHaveLength(0);

      projects.push({ owns: async () => false, held: async () => new Map() });
      await service.reconcile?.();
      expect(provider.released).toEqual([]);
      expect(existsSync(privateRoot)).toBe(true);

      projects.push({
        owns: async (root) => root === project,
        held: async () => {
          throw new Error('Project inventory is incomplete.');
        },
      });
      await service.reconcile?.();
      expect(provider.released).toEqual([]);
      expect(existsSync(privateRoot)).toBe(true);

      projects.pop();
      projects.push({ owns: async (root) => root === project, held: async () => new Map() });
      await service.reconcile?.();
      expect(provider.released).toEqual(['bound']);
      expect(existsSync(privateRoot)).toBe(false);
      expect(await service.run(call('run-1', 'echo admitted'))).toMatchObject({ status: 'completed' });
    },
  );

  it('should prepare against the checkout, hold the run before launch, and release only after the roots are gone', async () => {
    const log: string[] = [];
    const { service, provider } = serviceOf(() => ({ status: 'started', stdout: 'ok\n', exit: { exitCode: 0 } }), {
      holds: holdsOf(log),
    });

    expect(await service.run(call('run-1', 'echo ok'))).toMatchObject({ status: 'completed', exitCode: 0 });
    const [launch] = provider.launches;
    const { executionId } = launch!;
    expect(log).toEqual([`hold:${executionId}`, `release:${executionId}`]);
    expect(provider.released).toEqual([executionId]);
    expect(await sessionRoots()).toHaveLength(0);
  });

  it('should launch nothing when the run hold is refused, and still release the preparation', async () => {
    const log: string[] = [];
    const { service, provider } = serviceOf(() => ({ status: 'started', exit: { exitCode: 0 } }), {
      holds: holdsOf(log, true),
    });

    expect(await service.run(call('run-1', 'echo no'))).toMatchObject({
      status: 'not-started',
      code: 'checkout-unavailable',
    });
    expect(provider.launches).toHaveLength(0);
    expect(provider.released).toHaveLength(1);
    expect(log).toHaveLength(1);
    expect(await sessionRoots()).toHaveLength(0);
  });

  it('should launch nothing when the provider cannot prepare custody', async () => {
    const { service, provider } = serviceOf(() => ({ status: 'started', exit: { exitCode: 0 } }), {
      fake: { refusePrepare: true },
    });

    expect(await service.run(call('run-1', 'echo no'))).toMatchObject({ status: 'not-started' });
    expect(provider.launches).toHaveLength(0);
    expect(await sessionRoots()).toHaveLength(0);
  });

  it('should keep the run hold and the receipt when cleanup is unconfirmed', async () => {
    const log: string[] = [];
    const { service, provider } = serviceOf(
      () => ({ status: 'started', exit: { exitCode: 0 }, cleanup: 'uncertain' }),
      { holds: holdsOf(log) },
    );

    expect(await service.run(call('run-1', 'echo maybe'))).toMatchObject({ status: 'interrupted' });
    const { executionId } = provider.launches[0]!;
    expect(log).toEqual([`hold:${executionId}`]);
    expect(provider.released).toEqual([]);
    expect(provider.executions.get(executionId)?.phase).toBe('uncertain');
  });

  it('should release a Terminal session’s custody after it ends', async () => {
    const { service, provider } = serviceOf(() => ({ status: 'started', exit: { exitCode: 0 } }));
    const opened = await service.openTerminal({
      projectRoot: project,
      size: { columns: 80, rows: 24 },
      signal: new AbortController().signal,
    });
    if (opened.status !== 'opened') {
      throw new Error(`expected an opened session, got ${JSON.stringify(opened)}`);
    }
    await opened.session.exited;

    expect(provider.launches[0]).toMatchObject({ stdio: { kind: 'terminal' } });
    expect(provider.released).toEqual([provider.launches[0]!.executionId]);
    expect(await sessionRoots()).toHaveLength(0);
  });

  it('should recover what an earlier host left before it runs anything, and block what it cannot confirm', async () => {
    const probeRoot = join(sessions, 'tau-shell-probe');
    const terminalRoot = join(sessions, 'tau-shell-terminal');
    await mkdir(probeRoot);
    await mkdir(terminalRoot);
    const { service, provider } = serviceOf(() => ({ status: 'started', exit: { exitCode: 0 } }), {
      fake: {
        prior: [
          { executionId: 'probe', privateRoot: probeRoot, resource: undefined, phase: 'exited' },
          {
            executionId: 'terminal',
            privateRoot: terminalRoot,
            resource: { key: 'terminal:earlier', root: project },
            phase: 'running',
          },
        ],
      },
    });

    expect(await service.run(call('run-1', 'echo next'))).toMatchObject({
      status: 'not-started',
      code: 'checkout-unavailable',
    });
    expect(provider.released).toEqual(['probe']);
    expect(existsSync(probeRoot)).toBe(false);
    expect(existsSync(terminalRoot)).toBe(true);
    expect(provider.launches).toHaveLength(0);
  });

  it('should keep an earlier agent execution’s checkout blocked until its project releases the run hold', async () => {
    const agentRoot = join(sessions, 'tau-shell-agent');
    await mkdir(agentRoot);
    const released: string[] = [];
    const projects: ShellProjectExecutions[] = [];
    const { service, provider } = serviceOf(() => ({ status: 'started', stdout: 'ok\n', exit: { exitCode: 0 } }), {
      fake: {
        prior: [
          {
            executionId: 'agent',
            privateRoot: agentRoot,
            resource: { key: 'agent:run-0', root: project },
            phase: 'exited',
          },
        ],
      },
      projects: () => projects,
    });

    expect(await service.run(call('run-1', 'echo early'))).toMatchObject({
      status: 'not-started',
      code: 'checkout-unavailable',
    });
    expect(existsSync(agentRoot)).toBe(true);
    expect(provider.released).toEqual([]);

    projects.push({
      owns: async (root) => root === project,
      held: async () =>
        new Map([
          [
            'agent',
            async () => {
              expect(existsSync(agentRoot)).toBe(false);
              expect(provider.released).toEqual([]);
              released.push('agent');
              return { status: 'applied' } as const;
            },
          ],
        ]),
    });
    await service.reconcile?.();

    expect(released).toEqual(['agent']);
    expect(provider.released).toEqual(['agent']);
    expect(await service.run(call('run-1', 'echo later'))).toMatchObject({ status: 'completed' });
  });

  it('should release an earlier agent receipt its project no longer holds, after reading the whole project', async () => {
    const agentRoot = join(sessions, 'tau-shell-orphan');
    await mkdir(agentRoot);
    const { service, provider } = serviceOf(() => ({ status: 'started', exit: { exitCode: 0 } }), {
      fake: {
        prior: [
          {
            executionId: 'orphan',
            privateRoot: agentRoot,
            resource: { key: 'agent:run-0', root: project },
            phase: 'exited',
          },
        ],
      },
      projects: () => [{ owns: async (root) => root === project, held: async () => new Map() }],
    });
    await service.reconcile?.();

    expect(provider.released).toEqual(['orphan']);
    expect(await service.run(call('run-1', 'echo ok'))).toMatchObject({ status: 'completed' });
  });

  it('should keep an earlier agent receipt when its project cannot be read completely', async () => {
    const agentRoot = join(sessions, 'tau-shell-unread');
    await mkdir(agentRoot);
    const { service, provider } = serviceOf(() => ({ status: 'started', exit: { exitCode: 0 } }), {
      fake: {
        prior: [
          {
            executionId: 'unread',
            privateRoot: agentRoot,
            resource: { key: 'agent:run-0', root: project },
            phase: 'exited',
          },
        ],
      },
      projects: () => [
        {
          owns: async (root) => root === project,
          held: async () => {
            throw new Error('The saved run record cannot be read safely.');
          },
        },
      ],
    });
    await service.reconcile?.();

    expect(provider.released).toEqual([]);
    expect(await service.run(call('run-1', 'echo no'))).toMatchObject({ status: 'not-started' });
  });
});
