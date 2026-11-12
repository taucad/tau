/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
// @vitest-environment node
/*
 * The host's shell conformance rows (testing contract, `host:test:shell-conformance`; H08–H09 end to end: a scripted
 * model drives a real Tau agent host, the host's tool registry and admission, the service and the native shell; A20
 * in H10). They extend the service rows H01–H07 in `shell-service` and the provider rows C01–C09 in `sandbox`, never
 * repeat them: each row drives the real service over the real sandbox provider and the machine's own Bash, starts
 * with a positive control, and judges every negative by the bytes outside the sandbox, not by the command's own report.
 *
 * Off unless `TAU_SHELL_CONFORMANCE=1`, which only the noncacheable Nx target sets. `TAU_SHELL_CONFORMANCE_ROW` names
 * the row, `TAU_SHELL_CONFORMANCE_RECEIPT` where the JSON receipt goes and, on Linux, `TAU_SHELL_CONFORMANCE_BWRAP`
 * the installed, profiled bubblewrap.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTauAgentHost } from '@taucad/agent-host';
import type { JsonValue } from '@taucad/agent-host';
import { createNodeEventLog } from '@taucad/agent-host/node';
import { createSandboxShellProvider } from '@taucad/native-process-core/shell';
import type { ShellProvider } from '@taucad/native-process-core/shell';

import { probeHostShell } from '@taucad/shell-service';
import type { HostShell, ShellCheckout, ShellInput, ShellOutput } from '@taucad/shell-service';

import { createHostToolRegistry } from '#agent-tools.js';
import { placementOver, scriptedTransport } from '#shell/tau-host.fixture.js';
import type { ScriptedResponse } from '#shell/tau-host.fixture.js';

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

describe.runIf(enabled)('host shell conformance', () => {
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
    writeFileSync(join(project, '.tau', 'chats', 'chat-1.json'), '{"record":"CHAT-RECORD"}\n');
    writeFileSync(join(other, 'canary.txt'), 'OTHER-PROJECT\n');
    writeFileSync(join(appData, 'granted-roots.json'), 'APP-DATA\n');
    writeFileSync(join(supplier, 'part.step'), 'SUPPLIER\n');
    writeFileSync(join(unrelated, 'canary.txt'), 'UNRELATED\n');
    checkouts.set('run-conformance', { cwd: project, admission: 'admission-conformance' });
    const probe = await probeHostShell({
      provider: createSandboxShellProvider({
        bwrapPath,
        home,
        custody: { directory: join(appData, 'shell-custody'), sessionDirectory: sessions },
      }),
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
            schema: 'tau.host-shell-conformance.receipt/1',
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

  /**
   * A real Tau agent host over the host registry, offering this machine's shell from its own probe. The provider is the
   * real sandbox provider; it only notes, at each launch, what the run's event log already holds.
   */
  const agentHostOver = async (label: string, responses: readonly ScriptedResponse[]) => {
    const logPath = join(root, `${label}-events.jsonl`);
    const runId = `run-${label}`;
    const chatId = `chat-${label}`;
    const real = createSandboxShellProvider({
      bwrapPath,
      home,
      custody: { directory: join(appData, 'shell-custody'), sessionDirectory: sessions },
    });
    const launches: Array<Readonly<{ readable: readonly string[]; log: string }>> = [];
    const provider: ShellProvider = {
      name: real.name,
      prepare: real.prepare,
      inventory: real.inventory,
      recover: real.recover,
      release: real.release,
      launch: async (launch) => {
        launches.push({
          readable: launch.filesystem.readable,
          log: existsSync(logPath) ? readFileSync(logPath, 'utf8') : '',
        });
        return real.launch(launch);
      },
    };
    const probe = await probeHostShell({
      provider,
      checkouts: new Map([[runId, { cwd: project, admission: `admission-${label}` }]]),
      appDataRoots: [appData],
      projectRoots: () => [project, other],
      home,
      sessionDirectory: sessions,
    });
    if (probe.status !== 'available') {
      throw new Error(`the probe refused the shell: ${JSON.stringify(probe)}`);
    }
    const transport = scriptedTransport(responses);
    const toolRegistry = createHostToolRegistry({ workspaceRoot: project, shell: probe.shell });
    let tick = 0;
    let id = 0;
    const host = createTauAgentHost({
      systemPrompt: 'You are the shell conformance fixture.',
      model: { id: 'scripted-shell-model', contextWindow: 200_000 },
      modelTransport: transport,
      toolRegistry,
      placement: placementOver(toolRegistry),
      openEventLog: async () => createNodeEventLog({ filePath: logPath, access: 'write' }),
      createId: () => `${label}-${String(id++)}`,
      createLeaderEpoch: () => `epoch-${label}`,
      now: () => new Date(Date.UTC(2026, 9, 24, 0, 0, tick++)),
    });
    const admit = async (content: string) =>
      host.admit({ chatId, runId, trigger: 'submit', message: { id: `turn-${label}`, role: 'user', content } });
    const outputOf = async (toolCallId: string) => {
      const snapshot = await host.snapshot(chatId);
      const message = snapshot.messages.find(
        (entry) => entry.role === 'tool-output' && entry.toolCallId === toolCallId,
      );
      return message?.role === 'tool-output' ? message : undefined;
    };
    return { host, transport, toolRegistry, launches, logPath, runId, chatId, admit, outputOf };
  };

  const shellCall = (id: string, input: JsonValue) => ({ toolCalls: [{ id, name: 'shell', input }] });

  conformance('H08', 'a scripted model runs the native shell through the agent host and its registry', async () => {
    const driven = await agentHostOver('h08', [
      shellCall('call-h08', { command: 'pwd; printf E2E > driven.txt' }),
      { text: 'Done.' },
    ]);
    try {
      await driven.admit('Write driven.txt.');

      const offered = driven.transport.requests[0]?.tools.find((tool) => tool.name === 'shell');
      expect(offered?.description).toContain('Write Bash syntax.');
      expect(driven.toolRegistry.list().find((tool) => tool.name === 'shell')?.executionMode).toBe('sequential');
      const message = await driven.outputOf('call-h08');
      expect(message?.isError, JSON.stringify(message)).toBe(false);
      expect(message?.content).toMatchObject({ status: 'completed', exitCode: 0 });
      expect(JSON.stringify(message?.content)).toContain(project);
      expect(readFileSync(join(project, 'driven.txt'), 'utf8')).toBe('E2E');
    } finally {
      await driven.host.close();
    }
  });

  conformance('H09', "the person's answer is spent durably before the approved command spawns (D23)", async () => {
    const input = {
      command: `cat ${join(supplier, 'part.step')}`,
      access: { reason: 'Read the part', read: [supplier] },
    };
    const driven = await agentHostOver('h09', [
      shellCall('call-h09-ask', input),
      shellCall('call-h09-run', input),
      { text: 'Read it.' },
    ]);
    try {
      await driven.admit('Read the supplier part.');
      /* Ask: the run paused on the shell's structured request, and nothing widened ran. */
      const [asked, ...more] = await driven.host.pendingInterrupts(driven.runId);
      expect(more).toEqual([]);
      expect(asked?.kind).toBe('approval');
      expect(asked?.payload).toMatchObject({ kind: 'shell', command: input.command, access: { read: [supplier] } });
      expect(driven.launches.filter((launch) => launch.readable.includes(supplier))).toEqual([]);

      await driven.host.resolveInterrupt({ runId: driven.runId, interruptId: asked!.interruptId, outcome: 'approved' });
      await driven.host.resume(driven.chatId);

      const message = await driven.outputOf('call-h09-run');
      expect(message?.isError, JSON.stringify(message)).toBe(false);
      expect(message?.content).toMatchObject({
        status: 'completed',
        exitCode: 0,
        stdout: { text: 'SUPPLIER\n' },
        approval: { approvedBy: 'person', mode: 'ask' },
      });
      const widened = driven.launches.filter((launch) => launch.readable.includes(supplier));
      expect(widened).toHaveLength(1);
      /* The log as it stood when the sandbox was asked to spawn already held the spend for this call. */
      const spends = widened[0]!.log.split('\n').filter((line) => line.includes('"approval.spent"'));
      expect(spends.some((line) => line.includes('"call-h09-run"') && line.includes('"phase":"spent"'))).toBe(true);
    } finally {
      await driven.host.close();
    }
  });

  conformance('H10', 'the same widening under Ask then Bypass then Ask: the mode is read per call (A20)', async () => {
    const widening = {
      command: `cat ${join(supplier, 'part.step')}`,
      access: { reason: 'Read the part', read: [supplier] },
    };
    try {
      /* Ask with no approval channel: nothing widened runs. */
      const asked = await run(widening);
      expect(asked).toMatchObject({ status: 'not-started', code: 'approval-unavailable' });
      /* The mode changes between calls; the next call reads it, and Bypass approves the same widening. */
      mode = 'bypass';
      const bypassed = completed(await run(widening));
      expect(bypassed.exitCode, bypassed.stderr.text).toBe(0);
      expect(bypassed.stdout.text).toBe('SUPPLIER\n');
      expect(bypassed.approval).toEqual({ approvedBy: 'bypass', mode: 'bypass' });
      /* Back to Ask: Bypass leaves nothing behind to recall. */
      mode = 'ask';
      const again = await run(widening);
      expect(again).toMatchObject({ status: 'not-started', code: 'approval-unavailable' });
    } finally {
      mode = 'ask';
    }
  });
});
