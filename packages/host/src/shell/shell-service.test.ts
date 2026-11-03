/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
/**
 * The shell service's admission, approval, bounds and outcomes, driven through the deterministic fake provider
 * (testing contract, layering rule 2). Nothing here proves containment: the conformance rows run the real provider.
 */
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HostToolApproval, HostToolApprovalRecord, InterruptResolution } from '@taucad/agent-host';
import { createFakeShellProvider } from '@taucad/native-process-core/shell';
import type { FakeShellScript, ShellExecutable, ShellLaunch } from '@taucad/native-process-core/shell';

import { isShellError, shellLimits } from '#shell/shell-contract.js';
import type { PermissionMode, ShellApprovalPayload, ShellInput, ShellOutput } from '#shell/shell-contract.js';
import { createShellService, probeHostShell, shellApprovalKey } from '#shell/shell-service.js';
import type { ShellCheckout, ShellServiceOptions } from '#shell/shell-service.js';

const executable: ShellExecutable = { kind: 'bash', path: '/bin/bash', realPath: '/bin/bash', digest: 'sha256:00' };
const identity = {
  platform: 'linux',
  kind: 'bash',
  shellVersion: '5.2.21(1)-release',
  shellDigest: 'sha256:00',
  provider: 'fake',
} as const;

let base = '';
let home = '';
let project = '';
let other = '';
let appData = '';
let outside = '';
let sessions = '';

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tau-shell-service-')));
  home = join(base, 'home');
  project = join(base, 'projects', 'bracket');
  other = join(base, 'projects', 'other');
  appData = join(base, 'app-data');
  outside = join(base, 'supplier');
  sessions = join(base, 'sessions');
  for (const directory of [
    join(home, '.ssh'),
    join(project, 'models'),
    join(project, '.git'),
    join(project, '.tau', 'chats'),
    join(project, '.tau', 'parameters'),
    join(project, 'vendor', 'lib', '.git'),
    join(other, '.tau'),
    appData,
    join(outside, '.git'),
    sessions,
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- fixture setup.
    await mkdir(directory, { recursive: true });
  }
  await writeFile(join(project, 'main.ts'), 'export {}');
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const resolved = (outcome: InterruptResolution['outcome'], interruptId = 'interrupt-1'): InterruptResolution => ({
  interruptId,
  outcome,
});

type Harness = Readonly<{
  service: ReturnType<typeof createShellService>;
  provider: ReturnType<typeof createFakeShellProvider>;
  checkouts: Map<string, ShellCheckout>;
}>;

const harness = (
  script: (launch: ShellLaunch) => FakeShellScript = () => ({
    status: 'started',
    stdout: 'ok\n',
    exit: { exitCode: 0 },
  }),
  overrides: Partial<ShellServiceOptions> = {},
): Harness => {
  const provider = createFakeShellProvider(script);
  const checkouts = new Map<string, ShellCheckout>([['run-1', { cwd: project, admission: 'admission-1' }]]);
  const service = createShellService({
    provider,
    executable,
    identity,
    checkouts,
    appDataRoots: [appData],
    projectRoots: () => [project, other],
    platform: 'linux',
    home,
    environment: {
      PATH: '/home/me/.local/bin:/usr/bin',
      LANG: 'en_US.UTF-8',
      USER: 'me',
      ANTHROPIC_API_KEY: 'secret',
      SSH_AUTH_SOCK: '/run/user/1000/ssh',
      TAU_AUTH_TOKEN: 'secret',
    },
    sessionDirectory: sessions,
    ...overrides,
  });
  return { service, provider, checkouts };
};

const call = (
  input: ShellInput,
  extra: Readonly<{ approve?: HostToolApproval; signal?: AbortSignal; runId?: string }> = {},
) => ({
  toolCallId: 'call-1',
  runId: extra.runId ?? 'run-1',
  signal: extra.signal ?? new AbortController().signal,
  approve: extra.approve,
  input,
});

/** An approval port that answers each ask with `outcome` and records the order of every step. */
const approval = (
  steps: string[],
  answers: Readonly<{ recalled?: HostToolApprovalRecord; asked?: InterruptResolution['outcome'] }>,
): HostToolApproval =>
  Object.assign(
    vi.fn(async () => {
      steps.push('ask');
      return resolved(answers.asked ?? 'approved');
    }),
    {
      recall: vi.fn(async () => {
        steps.push('recall');
        return answers.recalled;
      }),
    },
  );

describe('admission (A03, F5)', () => {
  it('refuses a run with no admitted checkout and never falls back to another root', async () => {
    const { service, provider } = harness();
    await expect(service.run(call({ command: 'pwd' }, { runId: 'run-unknown' }))).resolves.toMatchObject({
      status: 'not-started',
      code: 'checkout-unavailable',
    });
    expect(provider.launches).toEqual([]);
  });

  it.each([
    ['../x'],
    ['/etc'],
    ['models/../..'],
    ['./models'],
    [String.raw`a\b`],
    ['missing'],
    ['.git'],
    ['.tau/chats'],
  ])('refuses the working directory %s', async (cwd) => {
    const { service, provider } = harness();
    await expect(service.run(call({ command: 'pwd', cwd }))).resolves.toMatchObject({
      status: 'not-started',
      code: 'invalid-cwd',
    });
    expect(provider.launches).toEqual([]);
  });

  it('refuses a working directory that is a link out of the checkout', async () => {
    await symlink(outside, join(project, 'escape'));
    const { service } = harness();
    await expect(service.run(call({ command: 'pwd', cwd: 'escape' }))).resolves.toMatchObject({
      code: 'invalid-cwd',
    });
  });

  it('refuses a checkout replaced between approval and launch (root-changed)', async () => {
    const { service, provider, checkouts } = harness();
    const approve = Object.assign(
      async () => {
        checkouts.set('run-1', { cwd: project, admission: 'admission-2' });
        return resolved('approved');
      },
      { recall: async () => undefined },
    );
    await expect(
      service.run(call({ command: 'ls', access: { reason: 'Read the supplier', read: [outside] } }, { approve })),
    ).resolves.toMatchObject({ status: 'not-started', code: 'root-changed' });
    expect(provider.launches).toEqual([]);
  });
});

describe('the launch Tau compiles (D4, D20, D26, A05)', () => {
  it('should open the whole checkout and keep records read-only and control rows denied', async () => {
    await writeFile(join(project, '.tau', 'AGENTS.md'), 'instructions');
    const { service, provider } = harness();
    await service.run(call({ command: 'true' }));
    const { filesystem } = provider.launches[0]!;
    expect(filesystem).not.toHaveProperty('masked');
    expect(filesystem.writable).toContain(project);
    expect(filesystem.writable).not.toContain(join(project, '.tau'));
    expect(filesystem.readOnly).toContain(join(project, '.tau', 'chats'));
    expect(filesystem.denied).toEqual(
      expect.arrayContaining([join(project, '.tau', 'binding.json'), join(project, '.tau', 'project.json')]),
    );
    expect([...(filesystem.readOnly ?? []), ...filesystem.denied]).not.toContain(join(project, '.tau', 'AGENTS.md'));
  });

  it('should protect the records of an existing reserved case alias', async () => {
    const alias = join(project, '.TAU');
    await mkdir(join(alias, 'chats'), { recursive: true });
    await mkdir(join(alias, 'future'), { recursive: true });
    const { service, provider } = harness();
    await service.run(call({ command: 'true' }));
    const { filesystem } = provider.launches[0]!;
    expect(filesystem.readOnly).toContain(join(await realpath(alias), 'chats'));
    expect([...(filesystem.readOnly ?? []), ...filesystem.denied]).not.toContain(join(await realpath(alias), 'future'));
  });

  it('runs one fresh contained process in the checkout with closed stdin and an allowlisted environment', async () => {
    const { service, provider } = harness();
    const output = await service.run(call({ command: 'printf \'%s\' "$HOME"', cwd: 'models' }));

    expect(output).toMatchObject({ status: 'completed', exitCode: 0, stdout: { text: 'ok\n', bytes: 3 } });
    expect(isShellError(output)).toBe(false);
    const [launch] = provider.launches;
    expect(launch).toMatchObject({
      executablePath: '/bin/bash',
      arguments: ['--noprofile', '--norc', '-c', 'printf \'%s\' "$HOME"'],
      workingDirectory: join(project, 'models'),
      stdio: { kind: 'pipes' },
      network: { domains: [] },
    });
    expect(launch!.filesystem.writable).toContain(project);
    expect(launch!.filesystem.denied).toEqual(
      expect.arrayContaining([
        join(project, '.git'),
        join(project, '.tau', 'project.json'),
        join(project, 'vendor', 'lib', '.git'),
        other,
        join(other, '.tau'),
        appData,
      ]),
    );
    expect(launch!.filesystem.readOnly).toEqual(
      expect.arrayContaining([
        join(project, '.tau', 'chats'),
        join(project, '.tau', 'offloaded-tool-results'),
        join(project, 'exports'),
      ]),
    );
    expect(launch!.filesystem.denied).not.toContain(join(project, '.tau', 'chats'));
    expect(launch!.filesystem.denied).not.toContain(join(project, '.tau', 'parameters'));
    expect(launch!.filesystem.readOnly).not.toContain(join(project, '.tau', 'parameters'));
    expect(Object.keys(launch!.environment).toSorted()).toEqual([
      'HOME',
      'LANG',
      'PATH',
      'SHELL',
      'TERM',
      'TMPDIR',
      'USER',
    ]);
    expect(launch!.environment['PATH']).toBe('/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin');
    expect(launch!.environment['HOME']!.startsWith(sessions)).toBe(true);
    expect(launch!.filesystem.writable).toContain(launch!.environment['HOME']);
  });

  it('removes the private HOME and temporary roots once the call settles', async () => {
    const { service, provider } = harness();
    await service.run(call({ command: 'true' }));
    const homeRoot = provider.launches[0]!.environment['HOME']!;
    await expect(stat(join(homeRoot, '..'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports a nonzero exit as a completed error, never a success', async () => {
    const { service } = harness(() => ({ status: 'started', stderr: 'nope\n', exit: { exitCode: 3 } }));
    const output = await service.run(call({ command: 'false' }));
    expect(output).toMatchObject({ status: 'completed', exitCode: 3, stderr: { text: 'nope\n' } });
    expect(isShellError(output)).toBe(true);
  });

  it('reports a signal Tau did not send as signalled', async () => {
    const { service } = harness(() => ({ status: 'started', exit: { signal: 'SIGSEGV' } }));
    await expect(service.run(call({ command: 'crash' }))).resolves.toMatchObject({
      status: 'signalled',
      signal: 'SIGSEGV',
    });
  });

  it('stops a command at its timeout and says so', async () => {
    const { service } = harness(() => ({ status: 'started', stdout: 'tick\n' }));
    // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- the Bash tool's model-facing wire field (API index).
    const output = await service.run(call({ command: 'sleep 300', timeoutMs: shellLimits.minTimeout }));
    // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- the same wire field, echoed in the output.
    expect(output).toMatchObject({ status: 'timed-out', timeoutMs: 1000, stdout: { text: 'tick\n' } });
  });

  it('stops a command when the call is cancelled', async () => {
    const { service } = harness(() => ({ status: 'started' }));
    const controller = new AbortController();
    const running = service.run(call({ command: 'sleep 300' }, { signal: controller.signal }));
    setTimeout(() => {
      controller.abort();
    }, 20);
    await expect(running).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('reports a cancellation that lands inside the launch as cancelled, not as a refusal', async () => {
    const controller = new AbortController();
    const { service } = harness(() => {
      /* The caller aborts while the provider is staging: the sandbox never came up, so the provider refuses. The
       * caller's cancellation outranks that refusal, because from the caller's side the command was cancelled. */
      controller.abort();
      return { status: 'sandbox-unavailable', message: 'the start barrier closed' };
    });
    await expect(service.run(call({ command: 'sleep 300' }, { signal: controller.signal }))).resolves.toMatchObject({
      status: 'cancelled',
    });
  });

  it('maps a provider refusal to shell-unavailable and a thrown launch to launch-failed', async () => {
    const refused = harness(() => ({ status: 'sandbox-unavailable', message: 'socat is missing' }));
    await expect(refused.service.run(call({ command: 'ls' }))).resolves.toMatchObject({
      status: 'not-started',
      code: 'shell-unavailable',
      message: expect.stringContaining('socat is missing') as unknown as string,
    });
    const thrown = harness(() => {
      throw new Error('spawn EACCES');
    });
    await expect(thrown.service.run(call({ command: 'ls' }))).resolves.toMatchObject({
      status: 'not-started',
      code: 'launch-failed',
    });
  });

  it('keeps output bounded and saves the full log in the records row only once it is written (A08)', async () => {
    const big = `${'a'.repeat(100_000)}END`;
    const { service } = harness(() => ({ status: 'started', stdout: big, stderr: 'warn\n', exit: { exitCode: 0 } }));
    const output = await service.run(call({ command: 'yes' }));
    if (output.status !== 'completed') {
      throw new Error(`expected completed, got ${output.status}`);
    }
    expect(output.stdout).toMatchObject({ bytes: 100_003, truncated: true });
    expect(output.stdout.text.endsWith('END')).toBe(true);
    expect(output.stderr).toMatchObject({ text: 'warn\n', truncated: false });
    expect(Buffer.byteLength(output.stdout.text) + Buffer.byteLength(output.stderr.text)).toBe(
      shellLimits.inlineOutputBytes,
    );
    expect(output.log).toMatchObject({ status: 'saved', bytes: 100_008, discardedBytes: 0 });
    const path = output.log?.status === 'saved' ? output.log.path : '';
    expect(path.startsWith('.tau/offloaded-tool-results/shell/')).toBe(true);
    const saved = await readFile(join(project, ...path.split('/')), 'utf8');
    expect(saved).toBe(`${big}warn\n`);
  });

  it('runs at most the admission limit at once; a queued call that is cancelled never launches', async () => {
    const { service, provider } = harness(() => ({ status: 'started' }), { maxExecutions: 2 });
    const controllers = Array.from({ length: 4 }, () => new AbortController());
    const runs = controllers.map(async (controller, index) =>
      service.run({
        ...call({ command: 'sleep 300' }, { signal: controller.signal }),
        toolCallId: `call-${String(index)}`,
      }),
    );
    await vi.waitFor(() => {
      expect(provider.launches).toHaveLength(2);
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(provider.launches).toHaveLength(2);
    for (const controller of controllers.toReversed()) {
      controller.abort();
    }
    const outputs = await Promise.all(runs);
    expect(outputs.map((output) => output.status)).toEqual(['cancelled', 'cancelled', 'cancelled', 'cancelled']);
    expect(provider.launches).toHaveLength(2);
  });
});

describe('access requests (D5, D20, A26)', () => {
  it.each([
    ['a credential store', () => join(home, '.ssh')],
    ['the whole home folder', () => home],
    ['a system root', () => '/'],
    ["another project's .tau", () => join(other, '.tau')],
    ["Tau's app data", () => appData],
    ['a version-control directory', () => join(outside, '.git')],
    ["the checkout's own control data", () => join(project, '.git')],
    ['a folder that does not exist', () => join(base, 'missing')],
    ['a relative folder', () => 'supplier'],
  ])('refuses %s as access-unsupported before asking or launching', async (_label, folder) => {
    const steps: string[] = [];
    const { service, provider } = harness();
    const output = await service.run(
      call(
        { command: 'cat x', access: { reason: 'Read it', read: [folder()] } },
        { approve: approval(steps, { asked: 'approved' }) },
      ),
    );
    expect(output).toMatchObject({ status: 'not-started', code: 'access-unsupported' });
    expect(steps).toEqual([]);
    expect(provider.launches).toEqual([]);
  });

  it.each([['*.npmjs.org'], ['localhost'], ['127.0.0.1'], ['printer.local'], ['metadata.google.internal']])(
    'refuses the host name %s',
    async (domain) => {
      const { service } = harness();
      await expect(
        service.run(call({ command: 'curl x', access: { reason: 'Fetch it', domains: [domain] } })),
      ).resolves.toMatchObject({ code: 'access-unsupported' });
    },
  );

  it('grants an approved exact folder and host name, and denies version control inside a writable grant', async () => {
    const steps: string[] = [];
    const { service, provider } = harness();
    const output = await service.run(
      call(
        {
          command: 'npm install',
          access: { reason: 'Install packages', write: [outside], domains: ['Registry.NPMjs.org'] },
        },
        { approve: approval(steps, { asked: 'approved' }) },
      ),
    );
    expect(output).toMatchObject({ status: 'completed', approval: { approvedBy: 'person', mode: 'ask' } });
    const [launch] = provider.launches;
    expect(launch!.filesystem.writable).toContain(outside);
    expect(launch!.filesystem.denied).toContain(join(outside, '.git'));
    expect(launch!.network.domains).toEqual(['registry.npmjs.org']);
  });

  it('carves an exact grant out of another project and keeps that project denied around it', async () => {
    await mkdir(join(other, 'parts'), { recursive: true });
    await mkdir(join(other, 'secret'), { recursive: true });
    const { service, provider } = harness(undefined, { permissionModeOf: async () => 'bypass' });
    await service.run(call({ command: 'ls', access: { reason: 'Read parts', read: [join(other, 'parts')] } }));
    const [launch] = provider.launches;
    expect(launch!.filesystem.readable).toContain(join(other, 'parts'));
    expect(launch!.filesystem.denied).not.toContain(other);
    expect(launch!.filesystem.denied).toEqual(expect.arrayContaining([join(other, 'secret'), join(other, '.tau')]));
  });
});

describe('approval lifecycle (D19, D23, D25, A12, A25)', () => {
  const widening: ShellInput = {
    command: 'npm install',
    access: { reason: 'It is safe', domains: ['registry.npmjs.org'] },
  };

  it('recalls a waiting answer before it reads the mode, in both modes', async () => {
    for (const mode of ['ask', 'bypass'] as const) {
      const steps: string[] = [];
      const permissionModeOf = vi.fn(async (): Promise<PermissionMode> => {
        steps.push('mode');
        return mode;
      });
      const { service } = harness(undefined, { permissionModeOf });
      // oxlint-disable-next-line no-await-in-loop -- one mode at a time.
      const output = await service.run(
        call(widening, {
          approve: approval(steps, { recalled: { payload: {}, resolution: resolved('approved') } }),
        }),
      );
      expect(steps).toEqual(['recall', 'mode']);
      expect(output).toMatchObject({ status: 'completed', approval: { approvedBy: 'person', mode } });
    }
  });

  it('grants without asking under Bypass and records it, still exact and contained', async () => {
    const steps: string[] = [];
    const { service, provider } = harness(undefined, { permissionModeOf: async () => 'bypass' });
    const output = await service.run(call(widening, { approve: approval(steps, {}) }));
    expect(steps).toEqual(['recall']);
    expect(output).toMatchObject({ approval: { approvedBy: 'bypass', mode: 'bypass' } });
    expect(provider.launches[0]!.network.domains).toEqual(['registry.npmjs.org']);
  });

  it('asks under Ask, and a host without a mode reader reads Ask', async () => {
    const steps: string[] = [];
    const approve = approval(steps, { asked: 'approved' });
    const { service } = harness();
    await service.run(call(widening, { approve }));
    expect(steps).toEqual(['recall', 'ask']);
    const [request] = vi.mocked(approve).mock.calls[0]!;
    expect(request.key).toMatch(/^shell:[0-9a-f]{64}$/u);
    expect(request.prompt).toContain('Run Bash in the project folder:\nnpm install');
    expect(request.prompt).toContain('Network: registry.npmjs.org');
    expect(request.prompt).toContain('The agent says: It is safe');
    expect(request.payload).toMatchObject({
      kind: 'shell',
      shell: 'bash',
      command: 'npm install',
      checkout: { runId: 'run-1', admission: 'admission-1' },
      access: { domains: ['registry.npmjs.org'], read: [], write: [] },
      lifetime: 'invocation',
    });
  });

  it('runs nothing when the person denies or cancels, or when no one can be asked', async () => {
    for (const [answer, expected] of [
      ['denied', { status: 'not-started', code: 'access-denied' }],
      ['cancelled', { status: 'cancelled' }],
    ] as const) {
      const { service, provider } = harness();
      // oxlint-disable-next-line no-await-in-loop -- one answer at a time.
      await expect(service.run(call(widening, { approve: approval([], { asked: answer }) }))).resolves.toMatchObject(
        expected,
      );
      expect(provider.launches).toEqual([]);
    }
    const { service, provider } = harness();
    await expect(service.run(call(widening))).resolves.toMatchObject({ code: 'approval-unavailable' });
    const unavailable = Object.assign(
      async () => {
        throw Object.assign(new Error('No client could ask.'), { code: 'APPROVAL_UNAVAILABLE' });
      },
      { recall: async () => undefined },
    );
    await expect(service.run(call(widening, { approve: unavailable }))).resolves.toMatchObject({
      code: 'approval-unavailable',
    });
    expect(provider.launches).toEqual([]);
  });

  it('lets a pausing ask end the call, as the Tau host does when it records the interrupt', async () => {
    const pausing = Object.assign(
      async () => {
        throw new Error("The run paused for the person's approval.");
      },
      { recall: async () => undefined },
    );
    const { service, provider } = harness();
    await expect(service.run(call(widening, { approve: pausing }))).rejects.toThrow('paused');
    expect(provider.launches).toEqual([]);
  });

  it('does not ask for a baseline call, in either mode', async () => {
    const steps: string[] = [];
    const { service } = harness();
    const output: ShellOutput = await service.run(call({ command: 'ls' }, { approve: approval(steps, {}) }));
    expect(steps).toEqual([]);
    expect(output).not.toHaveProperty('approval');
  });

  it('keys an approval by the request, not by the call id', () => {
    const payload: ShellApprovalPayload = {
      kind: 'shell',
      shell: 'bash',
      toolCallId: 'call-1',
      command: 'npm install',
      commandDigest: 'sha256:1',
      cwd: '',
      checkout: { runId: 'run-1', admission: 'a', fingerprint: 'f' },
      access: { reason: 'r', read: [], write: [], domains: ['registry.npmjs.org'] },
      lifetime: 'invocation',
    };
    expect(shellApprovalKey({ ...payload, toolCallId: 'call-2' })).toBe(shellApprovalKey(payload));
    expect(shellApprovalKey({ ...payload, command: 'npm ci' })).not.toBe(shellApprovalKey(payload));
    expect(shellApprovalKey({ ...payload, checkout: { ...payload.checkout, admission: 'b' } })).not.toBe(
      shellApprovalKey(payload),
    );
  });
});

describe('human Terminal sessions (D6, D21)', () => {
  const size = { columns: 80, rows: 24 };

  it('refuses a project that is not admitted and a session past the limit', async () => {
    const { service } = harness(() => ({ status: 'started' }), { maxTerminals: 1 });
    await expect(
      service.openTerminal({ projectRoot: outside, size, signal: new AbortController().signal }),
    ).resolves.toMatchObject({ status: 'refused', code: 'project-not-admitted' });
    const first = await service.openTerminal({ projectRoot: project, size, signal: new AbortController().signal });
    expect(first.status).toBe('opened');
    await expect(
      service.openTerminal({ projectRoot: project, size, signal: new AbortController().signal }),
    ).resolves.toMatchObject({ status: 'refused', code: 'session-limit' });
    if (first.status === 'opened') {
      await first.session[Symbol.asyncDispose]();
    }
    await expect(
      service.openTerminal({ projectRoot: project, size, signal: new AbortController().signal }),
    ).resolves.toMatchObject({ status: 'opened' });
  });

  it('opens a PTY on the project with its own immutable grant, and disposal ends it', async () => {
    const { service, provider } = harness(() => ({ status: 'started', stdout: '$ ' }));
    const opened = await service.openTerminal({
      projectRoot: project,
      size,
      access: { read: [outside], write: [], domains: [] },
      signal: new AbortController().signal,
    });
    if (opened.status !== 'opened') {
      throw new Error(`expected opened, got ${opened.code}`);
    }
    expect(provider.launches[0]).toMatchObject({
      arguments: ['--noprofile', '--norc', '-i'],
      workingDirectory: project,
      stdio: { kind: 'terminal', size },
      environment: { TERM: 'xterm-256color' },
    });
    expect(provider.launches[0]!.filesystem.readable).toContain(outside);
    opened.session.write(new TextEncoder().encode('ls\r'));
    opened.session.resize({ columns: 120, rows: 40 });
    expect(provider.written[0]).toHaveLength(1);
    expect(provider.resized[0]).toEqual([{ columns: 120, rows: 40 }]);
    await opened.session[Symbol.asyncDispose]();
    await expect(opened.session.exited).resolves.toEqual({ signal: 'SIGKILL' });
  });

  it('runs the verified macOS Zsh with the startup files for the Terminal only, never for an agent', async () => {
    const terminalZsh = { path: '/bin/zsh', realPath: '/bin/zsh', digest: `sha256:${'b'.repeat(64)}` } as const;
    const { service, provider } = harness(
      (launch) =>
        launch.stdio.kind === 'terminal'
          ? { status: 'started', stdout: '$ ' }
          : { status: 'started', stdout: 'hi\n', exit: { exitCode: 0 } },
      { terminalZsh },
    );
    const opened = await service.openTerminal({ projectRoot: project, size, signal: new AbortController().signal });
    if (opened.status !== 'opened') {
      throw new Error(`expected opened, got ${opened.code}`);
    }
    await service.run(call({ command: 'echo hi' }));

    expect(provider.launches[0]).toMatchObject({
      executablePath: '/bin/zsh',
      arguments: ['-l', '-i'],
      startupFiles: 'zsh',
      environment: { SHELL: '/bin/zsh' },
    });
    expect(provider.launches[0]!.environment).not.toHaveProperty('ZDOTDIR');
    expect(provider.launches[1]).toMatchObject({ executablePath: executable.path });
    expect(provider.launches[1]).not.toHaveProperty('startupFiles');
    expect(provider.launches[1]!.arguments.slice(0, 2)).toStrictEqual(['--noprofile', '--norc']);
    await opened.session[Symbol.asyncDispose]();
  });

  it('maps a provider that cannot give a terminal to pty-unavailable', async () => {
    const { service } = harness(() => ({ status: 'unsupported', requirement: 'terminal', message: 'own-pty pending' }));
    await expect(
      service.openTerminal({ projectRoot: project, size, signal: new AbortController().signal }),
    ).resolves.toMatchObject({ status: 'refused', code: 'pty-unavailable' });
  });
});

describe('probeHostShell (D1, I2)', () => {
  const probeOptions = (script: (launch: ShellLaunch) => FakeShellScript, platform: NodeJS.Platform) => ({
    provider: createFakeShellProvider(script),
    checkouts: new Map<string, ShellCheckout>(),
    appDataRoots: [appData],
    projectRoots: () => [],
    platform,
    sessionDirectory: sessions,
  });

  it('answers sandbox-unavailable on Windows without starting anything', async () => {
    const options = probeOptions(() => ({ status: 'started', exit: { exitCode: 0 } }), 'win32');
    await expect(probeHostShell(options)).resolves.toMatchObject({
      status: 'unavailable',
      code: 'sandbox-unavailable',
    });
    expect(options.provider.launches).toEqual([]);
  });

  it.runIf(process.platform === 'linux' || process.platform === 'darwin')(
    'reads the shell version inside the sandbox and offers the service',
    async () => {
      const options = probeOptions(
        () => ({ status: 'started', stdout: '5.2.21(1)-release', exit: { exitCode: 0 } }),
        process.platform,
      );
      const probe = await probeHostShell(options);
      expect(probe).toMatchObject({
        status: 'available',
        shell: { identity: { kind: 'bash', shellVersion: '5.2.21(1)-release', provider: 'fake' } },
      });
      expect(options.provider.launches[0]).toMatchObject({ network: { domains: [] }, stdio: { kind: 'pipes' } });
    },
  );

  it.runIf(process.platform === 'linux' || process.platform === 'darwin')(
    'reports a broken sandbox as unavailable rather than offering the shell',
    async () => {
      const options = probeOptions(
        () => ({ status: 'sandbox-unavailable', message: 'bwrap failed' }),
        process.platform,
      );
      await expect(probeHostShell(options)).resolves.toMatchObject({
        status: 'unavailable',
        code: 'sandbox-unavailable',
      });
    },
  );
});
