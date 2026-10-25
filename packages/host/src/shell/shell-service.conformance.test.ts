/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
// @vitest-environment node
/*
 * The shell service's conformance rows (testing contract, `host:test:shell-conformance`; A03–A05, A08, A09 at the
 * service layer). They extend the provider rows C01–C09 in `native-process-core`, never repeat them: each row drives
 * the real service over the real sandbox provider and the machine's own Bash, starts with a positive control, and
 * judges every negative by the bytes outside the sandbox, not by the command's own report.
 *
 * Off unless `TAU_SHELL_CONFORMANCE=1`, which only the noncacheable Nx target sets. `TAU_SHELL_CONFORMANCE_ROW` names
 * the row, `TAU_SHELL_CONFORMANCE_RECEIPT` where the JSON receipt goes and, on Linux, `TAU_SHELL_CONFORMANCE_BWRAP`
 * the installed, profiled bubblewrap.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSandboxShellProvider } from '@taucad/native-process-core/shell';

import type { ShellInput, ShellOutput } from '#shell/shell-contract.js';
import { probeHostShell } from '#shell/shell-service.js';
import type { HostShell, ShellCheckout } from '#shell/shell-service.js';

const enabled = process.env['TAU_SHELL_CONFORMANCE'] === '1';
const row = process.env['TAU_SHELL_CONFORMANCE_ROW'] ?? 'unnamed';
const bwrapPath = process.env['TAU_SHELL_CONFORMANCE_BWRAP'] ?? '/usr/bin/bwrap';

type RowResult = Readonly<{ id: string; title: string; status: 'pass' | 'fail'; detail?: string }>;
const results: RowResult[] = [];

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

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

let root = '';
let project = '';
let other = '';
let appData = '';
let supplier = '';
let unrelated = '';
let home = '';
let sessions = '';
let shell: HostShell;
let ready = false;
const checkouts = new Map<string, ShellCheckout>();
let mode: 'ask' | 'bypass' = 'ask';

const run = async (input: ShellInput, signal = new AbortController().signal): Promise<ShellOutput> =>
  shell.run({ toolCallId: `call-${String(results.length + 1)}`, runId: 'run-conformance', signal, input });

const completed = (output: ShellOutput): Extract<ShellOutput, { status: 'completed' }> => {
  if (output.status !== 'completed') {
    throw new Error(`expected a completed call, got ${JSON.stringify(output)}`);
  }
  return output;
};

describe.runIf(enabled)('shell service conformance', () => {
  beforeAll(async () => {
    if (process.platform !== 'linux' && process.platform !== 'darwin') {
      throw new Error(`${process.platform} is not a row of this suite yet.`);
    }
    if (process.platform === 'linux' && !existsSync(bwrapPath)) {
      throw new Error(`no bubblewrap at ${bwrapPath}; a conformance row never falls back to another one.`);
    }
    root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-shell-service-conformance-')));
    project = join(root, 'projects', 'bracket');
    other = join(root, 'projects', 'other');
    appData = join(root, 'app-data');
    supplier = join(root, 'supplier');
    unrelated = join(root, 'unrelated');
    home = join(root, 'home');
    sessions = join(root, 'sessions');
    for (const directory of [
      join(project, 'models'),
      join(project, '.git'),
      join(project, '.tau', 'chats'),
      join(project, '.tau', 'parameters'),
      other,
      appData,
      supplier,
      unrelated,
      join(home, '.ssh'),
      sessions,
    ]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(join(project, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(other, 'canary.txt'), 'OTHER-PROJECT\n');
    writeFileSync(join(appData, 'granted-roots.json'), 'APP-DATA\n');
    writeFileSync(join(supplier, 'part.step'), 'SUPPLIER\n');
    writeFileSync(join(unrelated, 'canary.txt'), 'UNRELATED\n');
    checkouts.set('run-conformance', { cwd: project, admission: 'admission-conformance' });
    const probe = await probeHostShell({
      provider: createSandboxShellProvider({ bwrapPath, home }),
      checkouts,
      permissionModeOf: async () => mode,
      appDataRoots: [appData],
      projectRoots: () => [project, other],
      home,
      sessionDirectory: sessions,
      environment: {
        ...process.env,
        ANTHROPIC_API_KEY: 'SEEDED-SECRET',
        TAU_AUTH_TOKEN: 'SEEDED-SECRET',
        SSH_AUTH_SOCK: join(home, 'agent.sock'),
      },
    });
    if (probe.status !== 'available') {
      throw new Error(`the probe refused the shell: ${JSON.stringify(probe)}`);
    }
    shell = probe.shell;
    ready = true;
  });

  afterAll(() => {
    const path = process.env['TAU_SHELL_CONFORMANCE_RECEIPT'];
    if (path !== undefined && ready) {
      const server = process.env['GITHUB_SERVER_URL'];
      const repository = process.env['GITHUB_REPOSITORY'];
      const runId = process.env['GITHUB_RUN_ID'];
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        `${JSON.stringify(
          {
            schema: 'tau.shell-service-conformance.receipt/1',
            row,
            recordedAt: new Date().toISOString(),
            source: {
              sha: process.env['GITHUB_SHA'] ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
              run: server && repository && runId ? `${server}/${repository}/actions/runs/${runId}` : 'local',
            },
            identity: shell.identity,
            results,
          },
          undefined,
          2,
        )}\n`,
      );
    }
    if (root !== '') {
      rmSync(root, { recursive: true, force: true });
    }
  });

  conformance('H01', 'runs in the exact checkout folder with a private HOME and no seeded secret', async () => {
    const output = completed(await run({ command: 'pwd; printf WROTE > out.txt; env', cwd: 'models' }));

    expect(output.exitCode, output.stderr.text).toBe(0);
    const [cwd, ...environment] = output.stdout.text.trim().split('\n');
    expect(cwd).toBe(join(project, 'models'));
    expect(readFileSync(join(project, 'models', 'out.txt'), 'utf8')).toBe('WROTE');
    expect(output.stdout.text).not.toContain('SEEDED-SECRET');
    expect(environment.some((line) => line.startsWith('SSH_AUTH_SOCK='))).toBe(false);
    expect(
      environment
        .find((line) => line.startsWith('HOME='))
        ?.slice('HOME='.length)
        .startsWith(sessions),
    ).toBe(true);
  });

  conformance(
    'H02',
    'authored controls are writable; records, control data, other projects and app data are not',
    async () => {
      const positive = completed(await run({ command: 'printf \'{"a":1}\' > .tau/parameters/main.json' }));

      expect(positive.exitCode, positive.stderr.text).toBe(0);
      expect(readFileSync(join(project, '.tau', 'parameters', 'main.json'), 'utf8')).toBe('{"a":1}');

      const probes = [
        'cat .git/HEAD',
        `cat ${join(other, 'canary.txt')}`,
        `cat ${join(appData, 'granted-roots.json')}`,
        'printf FORGED > .git/HEAD',
        'printf FORGED > .tau/chats/forged.json',
      ];
      for (const command of probes) {
        // oxlint-disable-next-line no-await-in-loop -- one probe at a time, each judged alone.
        const output = await run({ command });
        expect(output.status === 'completed' ? output.stdout.text : '', command).not.toMatch(
          /refs\/heads|OTHER-PROJECT|APP-DATA/u,
        );
      }
      expect(readFileSync(join(project, '.git', 'HEAD'), 'utf8')).toBe('ref: refs/heads/main\n');
      expect(existsSync(join(project, '.tau', 'chats', 'forged.json'))).toBe(false);
    },
  );

  conformance('H03', 'large output stays bounded and the full log lands in the records row', async () => {
    const output = completed(await run({ command: "head -c 300000 /dev/zero | tr '\\0' a; printf END" }));

    expect(output.stdout).toMatchObject({ bytes: 300_003, truncated: true });
    expect(output.stdout.text.endsWith('END')).toBe(true);
    expect(output.log).toMatchObject({ status: 'saved', bytes: 300_003, discardedBytes: 0 });
    const path = output.log?.status === 'saved' ? output.log.path : '';
    expect(statSync(join(project, ...path.split('/'))).size).toBe(300_003);
  });

  conformance('H04', 'a timeout stops the command and its background writer before the call settles', async () => {
    const started = Date.now();
    const output = await run({
      command: '(while :; do date >> beat.txt; sleep 0.1; done) & sleep 300',
      // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- the Bash tool's wire field (blueprint API).
      timeoutMs: 1500,
    });

    expect(output.status).toBe('timed-out');
    expect(Date.now() - started).toBeLessThan(15_000);
    const { size } = statSync(join(project, 'beat.txt'));
    await delay(1000);
    expect(statSync(join(project, 'beat.txt')).size).toBe(size);
  });

  conformance('H05', 'cancellation ends a running command once', async () => {
    const controller = new AbortController();
    const running = run({ command: 'sleep 300' }, controller.signal);
    await delay(500);
    const started = Date.now();
    controller.abort();
    await expect(running).resolves.toMatchObject({ status: 'cancelled' });
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  conformance('H06', 'an approved folder is readable and an unrelated one stays denied', async () => {
    mode = 'bypass';
    try {
      const positive = completed(
        await run({
          command: `cat ${join(supplier, 'part.step')}`,
          access: { reason: 'Read the part', read: [supplier] },
        }),
      );
      expect(positive.exitCode, positive.stderr.text).toBe(0);
      expect(positive.stdout.text).toBe('SUPPLIER\n');
      expect(positive.approval).toEqual({ approvedBy: 'bypass', mode: 'bypass' });

      const negative = await run({
        command: `cat ${join(unrelated, 'canary.txt')}`,
        access: { reason: 'Read the part', read: [supplier] },
      });
      expect(negative.status === 'completed' ? negative.stdout.text : '').not.toContain('UNRELATED');
    } finally {
      mode = 'ask';
    }
  });
});
