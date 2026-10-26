/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
/**
 * I7 cleanup custody in the shell service, driven through the deterministic fake provider (testing contract, layering
 * rule 2): a launch whose cleanup cannot be confirmed is `interrupted`, keeps its private roots, and blocks further
 * commands and Terminal sessions on its checkout. Nothing here proves native termination.
 */
import { mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeShellProvider } from '@taucad/native-process-core/shell';
import type { FakeShellScript, ShellExecutable, ShellLaunch } from '@taucad/native-process-core/shell';

import { createShellService, probeHostShell } from '#shell/shell-service.js';
import type { ShellCheckout } from '#shell/shell-service.js';

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

const serviceOf = (script: (launch: ShellLaunch) => FakeShellScript) => {
  const provider = createFakeShellProvider(script);
  const checkouts = new Map<string, ShellCheckout>([
    ['run-1', { cwd: project, admission: 'admission-1' }],
    ['run-2', { cwd: project, admission: 'admission-1' }],
  ]);
  const service = createShellService({
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
