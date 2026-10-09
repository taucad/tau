/**
 * Node leadership (W6 RH-S3, RH-A3): one process leads every chat it opens, through W3's writer. A restart claims a
 * chat by reading the log and appending; a writer whose view predates that claim is fenced.
 */

import { spawnSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeLauncher } from '#launchers/node-launcher.fixture.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
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
  let cursor = 0;
  let sourceGeneration: string | undefined;
  for (let attempt = 0; attempt < 50; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- each read follows the last one's cursor.
    const answer = await launcher.read({
      chatId,
      cursor,
      ...(sourceGeneration === undefined ? {} : { sourceGeneration }),
      limit: 16,
      maxBytes: 1_048_576,
      signal: AbortSignal.timeout(200),
    });
    if (answer.status !== 'batch') {
      if (answer.reason === 'identity-mismatch') {
        cursor = 0;
        sourceGeneration = undefined;
        continue;
      }
      return undefined;
    }
    const events = answer.events as readonly AgentLogEvent[];
    const terminal = events.find((event) => event.type === 'run.lifecycle' && event.state === 'failed');
    if (terminal) {
      return terminal;
    }
    cursor = answer.nextCursor;
    sourceGeneration = answer.sourceGeneration;
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
