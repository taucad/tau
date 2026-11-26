/**
 * Node leadership (W6 RH-S3, RH-A3): one process leads every chat it opens, through W3's writer. A restart claims a
 * chat by reading the log and appending; a writer whose view predates that claim is fenced.
 */

import { spawn, spawnSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNodeLauncher } from '#launchers/node-launcher.fixture.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import type { LeadershipHost } from '#launchers/chat-store.js';
import { createNodeLeadership } from '#launchers/node/node-leadership.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import { followChat } from '#log/follow-chat.js';
import type { AgentLogEvent } from '#log/event-types.js';
import type { ToolRegistry } from '#waist/ports.js';

const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;
const emptyTools: ToolRegistry = { list: () => [], invoke: async () => ({ content: 'no tools', isError: true }) };

const roots: string[] = [];
const launchers: AgentLauncher[] = [];

afterEach(async () => {
  await Promise.all(launchers.splice(0).map(async (launcher) => launcher.close()));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/** A pid no process holds: a child that has already exited. */
const deadPid = (): number => {
  const child = spawnSync(process.execPath, ['-e', '0']);
  return child.pid;
};

/** A workspace whose chat holds a run a previous process left `running`. */
const seedRunningChat = async (chatId: string): Promise<{ readonly root: string; readonly logPath: string }> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-node-leadership-'));
  roots.push(root);
  const directory = join(root, '.tau', 'chats', chatId);
  await mkdir(directory, { recursive: true });
  const base = { version: 1, leaderEpoch: 'previous-term', recordedAt: new Date().toISOString(), runId: 'run-1' };
  const rows = [
    { ...base, sequence: 0, epoch: 1, type: 'run.lifecycle', state: 'admitted' },
    {
      ...base,
      sequence: 1,
      epoch: 1,
      type: 'turn.history-projection-committed',
      retainedMessageIds: [],
      message: { id: 'user-1', role: 'user', content: 'hello' },
      context: {
        version: 1,
        systemPrompt: 'You are Tau.',
        model,
        toolChoice: 'auto',
        initialMessages: [],
        postCompactionMessages: [],
      },
    },
    { ...base, sequence: 2, epoch: 1, type: 'run.lifecycle', state: 'running' },
  ];
  const logPath = join(directory, 'events.jsonl');
  await writeFile(logPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  return { root, logPath };
};

const launch = (workspaceRoot: string): AgentLauncher => {
  const launcher = createNodeLauncher({ workspaceRoot, model, systemPrompt: 'You are Tau.', toolRegistry: emptyTools });
  launchers.push(launcher);
  return launcher;
};

/** Wait for the chat's log to hold a terminal row, reading as a viewer would. */
const terminalRow = async (launcher: AgentLauncher, chatId: string): Promise<AgentLogEvent | undefined> => {
  for await (const page of followChat(async (input) => launcher.read(input), chatId, {
    signal: AbortSignal.timeout(2000),
  })) {
    const events = page.events as readonly AgentLogEvent[];
    const terminal = events.find((event) => event.type === 'run.lifecycle' && event.state === 'failed');
    if (terminal) {
      return terminal;
    }
  }
  return undefined;
};

describe('Node leadership', () => {
  /* RH-A3 (Node): the holder's process died; its lock marker names a dead pid and the kernel released its lock. */
  it('should take a chat over after its holding process dies', async () => {
    const { root, logPath } = await seedRunningChat('chat-dead');
    await writeFile(`${logPath}.lock`, `${String(deadPid())}\n${logPath}\n`, 'utf8');

    const terminal = await terminalRow(launch(root), 'chat-dead');

    // The claim abandoned the run as its term's first append, one epoch above the dead holder's (I13, D5).
    expect(terminal).toMatchObject({ type: 'run.lifecycle', state: 'failed', runId: 'run-1', epoch: 2 });
    expect(terminal?.leaderEpoch).not.toBe('previous-term');
  });

  /* RH-S3: a writer whose view predates a restart's claim — here an older build that holds no lock — writes nothing. */
  it("should refuse the previous process's append after a restart claims", async () => {
    const { root, logPath } = await seedRunningChat('chat-restart');
    const previous = await createEventLogAppender({
      read: async () => new Uint8Array(await readFile(logPath)),
      append: async (bytes) => appendFile(logPath, bytes),
      truncate: async (size) => truncate(logPath, size),
      size: async () => {
        const stats = await stat(logPath);
        return stats.size;
      },
      exclusive: async (section) => section(),
      close: async () => undefined,
    });

    const claimed = await terminalRow(launch(root), 'chat-restart');
    expect(claimed).toMatchObject({ state: 'failed', epoch: 2 });
    const before = await readFile(logPath, 'utf8');

    await expect(
      previous.append({
        version: 1,
        leaderEpoch: 'previous-term',
        sequence: 3,
        epoch: 1,
        recordedAt: new Date().toISOString(),
        runId: 'run-1',
        type: 'run.lifecycle',
        state: 'completed',
      } as AgentLogEvent),
    ).rejects.toMatchObject({ code: 'LOG_FENCED' });
    expect(await readFile(logPath, 'utf8')).toBe(before);
  });
});

/* HA4 (RC3): a reconciliation's claim is retried while a closing incarnation refuses it, never fired and forgotten. */
describe('Node leadership reconciliation', () => {
  /** A host whose claims answer `codes` in turn, then open. */
  const hostAnswering = (codes: ReadonlyArray<string | undefined>) => {
    const answers = [...codes];
    const claim = vi.fn(async () => answers.shift());
    const host = { claim, writing: () => false } as unknown as LeadershipHost;
    return { host, claim };
  };
  const delays = { claimRetry: 5, claimRefusalRetry: 1000 };
  const pause = async (milliseconds: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });

  it('should claim again while the claim is refused WRITER_LOCKED, until it opens', async () => {
    const { host, claim } = hostAnswering(['WRITER_LOCKED', 'WRITER_LOCKED', undefined]);
    const port = createNodeLeadership(host, delays);
    port.reconcile('chat-1', { wait: true });
    await vi.waitFor(() => {
      expect(claim).toHaveBeenCalledTimes(3);
    });
    await port.close();
    expect(claim).toHaveBeenCalledTimes(3);
  });

  it('should stop claiming at the still-closing bound', async () => {
    const claim = vi.fn(async () => 'WRITER_LOCKED');
    const port = createNodeLeadership({ claim, writing: () => false } as unknown as LeadershipHost, {
      claimRetry: 5,
      claimRefusalRetry: 30,
    });
    port.reconcile('chat-1', { wait: true });
    await vi.waitFor(() => {
      expect(claim.mock.calls.length).toBeGreaterThan(1);
    });
    await pause(80);
    const calls = claim.mock.calls.length;
    await pause(40);
    expect(claim.mock.calls.length).toBe(calls);
    await port.close();
  });

  it('should not retry any other refusal', async () => {
    const { host, claim } = hostAnswering(['LOG_POISONED', undefined]);
    const port = createNodeLeadership(host, delays);
    port.reconcile('chat-1', { wait: true });
    await port.close();
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('should run one reconciliation per chat at a time, and wait for it on close', async () => {
    let open: (code: string | undefined) => void = () => undefined;
    const claim = vi.fn(
      async () =>
        new Promise<string | undefined>((resolve) => {
          open = resolve;
        }),
    );
    const port = createNodeLeadership({ claim, writing: () => false } as unknown as LeadershipHost, delays);
    port.reconcile('chat-1', { wait: true });
    port.reconcile('chat-1', { wait: true });
    expect(claim).toHaveBeenCalledTimes(1);
    const closing = port.close();
    expect(await Promise.race([closing.then(() => 'closed'), pause(20).then(() => 'waiting')])).toBe('waiting');
    open(undefined);
    await closing;
  });

  /* H32: a second process on the project, refused by the live writer that drives the run, reports no takeover. */
  it("should not report a takeover of a run another process's live writer holds", async () => {
    const { root, logPath } = await seedRunningChat('chat-held');
    const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], { stdio: 'ignore' });
    try {
      /* The marker names the log by its real path, as the writer that holds it records it. */
      await writeFile(`${logPath}.lock`, `${String(holder.pid)}\n${await realpath(logPath)}\n`, 'utf8');
      const launcher = launch(root);
      const answer = await launcher.execute({
        type: 'attach',
        commandId: 'attach-1',
        payload: { chatId: 'chat-held' },
      });
      expect(answer).toMatchObject({ status: 'applied', details: { takeover: false } });
      expect(await readFile(logPath, 'utf8')).not.toContain('"state":"failed"');
    } finally {
      holder.kill();
    }
  });
});
