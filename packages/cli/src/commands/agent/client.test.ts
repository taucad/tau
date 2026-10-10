/**
 * The plain-output line one durable event prints.
 *
 * A tool row used to print its whole record as JSON, which made an external
 * agent's turn unreadable in `tau agent tail` and in the TUI, which renders the
 * same line. It now prints one titled line per call, with the status on a
 * leading glyph — so `NO_COLOR` and a piped stdout lose no meaning at all.
 */

import type { AddressInfo } from 'node:net';

import { runCommand } from 'citty';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { WebSocketServer } from 'ws';

import type { AgentLogEvent } from '@taucad/agent-host';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';
import { serveAgentChannel } from '@taucad/agent-host/launcher';
import type { AgentLauncher } from '@taucad/agent-host/launcher';
import type { CommandAnswer, HostCommand, ReadAnswer, ReadInput } from '@taucad/agent-host/wire';

import { agentCommand } from '#commands/agent.js';
import { eventLine, replayChat, sendCommand } from '#commands/agent/client.js';

describe('sendCommand settling admission', () => {
  const command: HostCommand = {
    type: 'start',
    commandId: 'one-gesture',
    payload: {
      chatId: 'chat-1',
      runId: 'run-1',
      trigger: 'submit',
      message: { id: 'message-1', role: 'user', content: 'make a plate' },
    },
  };
  const settling: CommandAnswer = {
    commandId: command.commandId,
    generation: 1,
    status: 'refused',
    effect: 'not-applied',
    code: 'CHAT_RUN_LIVE',
    message: 'The previous run is settling.',
    details: { state: 'settling' },
  };

  it('should admit once with the original key after a settling refusal', async () => {
    const client = mock<AgentChannelClient>();
    client.execute.mockResolvedValueOnce(settling).mockResolvedValueOnce({
      commandId: command.commandId,
      generation: 1,
      status: 'applied',
      effect: 'durable',
      cursor: 12,
    });

    await expect(sendCommand(client, command, AbortSignal.timeout(1000))).resolves.toMatchObject({
      status: 'applied',
      cursor: 12,
    });
    expect(client.execute).toHaveBeenCalledTimes(2);
    expect(client.execute.mock.calls.map(([sent]) => sent.commandId)).toEqual(['one-gesture', 'one-gesture']);
    expect(client.execute.mock.calls.map(([sent]) => sent.payload)).toEqual([command.payload, command.payload]);
  });

  it('should retry a settling approval with its original key', async () => {
    const client = mock<AgentChannelClient>();
    const approval: HostCommand = {
      type: 'resolve-interrupt',
      commandId: 'one-approval',
      payload: { chatId: 'chat-1', runId: 'run-1', interruptId: 'interrupt-1', outcome: 'approved' },
    };
    client.execute.mockResolvedValueOnce({ ...settling, commandId: approval.commandId }).mockResolvedValueOnce({
      commandId: approval.commandId,
      generation: 1,
      status: 'applied',
      effect: 'durable',
      cursor: 13,
    });

    await expect(sendCommand(client, approval, AbortSignal.timeout(1000))).resolves.toMatchObject({ cursor: 13 });
    expect(client.execute.mock.calls.map(([sent]) => sent.commandId)).toEqual(['one-approval', 'one-approval']);
  });

  it('should leave scripted commands on their one-answer path', async () => {
    const client = mock<AgentChannelClient>();
    client.execute.mockResolvedValue(settling);

    await expect(sendCommand(client, command)).rejects.toMatchObject({ code: 'CHAT_RUN_LIVE' });
    expect(client.execute).toHaveBeenCalledOnce();
  });

  it('should refuse a non-settling or unknown outcome without resending', async () => {
    const answers: CommandAnswer[] = [
      { ...settling, details: { state: 'running' } },
      { ...settling, effect: 'unknown' },
    ];
    for (const answer of answers) {
      const client = mock<AgentChannelClient>();
      client.execute.mockResolvedValue(answer);
      // oxlint-disable-next-line no-await-in-loop -- each refusal is an independent command outcome.
      await expect(sendCommand(client, command, AbortSignal.timeout(1000))).rejects.toMatchObject({
        code: 'CHAT_RUN_LIVE',
      });
      expect(client.execute).toHaveBeenCalledOnce();
    }
  });

  it('should stop a settling retry when its caller detaches', async () => {
    const client = mock<AgentChannelClient>();
    const stop = new AbortController();
    client.execute.mockImplementation(async () => {
      stop.abort();
      return settling;
    });

    await expect(sendCommand(client, command, stop.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.execute).toHaveBeenCalledOnce();
  });

  it('should keep an unanswered command under the channel outbox after retry cancellation', async () => {
    const client = mock<AgentChannelClient>();
    const answer = Promise.withResolvers<CommandAnswer>();
    const stop = new AbortController();
    client.execute.mockReturnValue(answer.promise);

    const sent = sendCommand(client, command, stop.signal);
    stop.abort();
    answer.resolve({ commandId: command.commandId, generation: 1, status: 'applied', effect: 'durable', cursor: 14 });

    await expect(sent).resolves.toMatchObject({ status: 'applied', cursor: 14 });
    expect(client.execute).toHaveBeenCalledOnce();
  });
});

const base = {
  version: 1,
  leaderEpoch: 'leader-1',
  sequence: 7,
  recordedAt: '2026-09-08T00:00:00.000Z',
  runId: 'run-1',
} as const;

const lineFor = (message: unknown): string =>
  eventLine({ ...base, type: 'message.appended', message } as AgentLogEvent);

describe('eventLine', () => {
  it("prints one titled line per external call, not the agent's raw record", () => {
    const line = lineFor({
      id: 'm1',
      role: 'tool-input',
      toolCallId: 'call-1',
      toolName: 'listFiles',
      call: { toolCallId: 'list-1', kind: 'read', title: 'List files', status: 'in_progress' },
      content: { path: '.' },
    });

    expect(line).toBe('7\tmessage.appended\t● List files');
  });

  it('marks a completed call, and a failed one, on the glyph alone', () => {
    const completed = lineFor({
      id: 'm2',
      role: 'tool-output',
      toolCallId: 'call-1',
      toolName: 'listFiles',
      call: { toolCallId: 'list-1', title: 'List files' },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Codex's own `rawOutput` field name.
      content: { formatted_output: 'tau.json' },
      isError: false,
    });
    const failed = lineFor({
      id: 'm3',
      role: 'tool-output',
      toolCallId: 'call-2',
      toolName: 'shell',
      call: { toolCallId: 'shell-1', title: 'openscad main.scad' },
      content: 'exit 1',
      isError: true,
    });

    expect(completed).toBe('7\tmessage.appended\t✓ List files');
    expect(failed).toBe('7\tmessage.appended\t✗ openscad main.scad');
    // Piped output carries no escape sequences at all, whatever NO_COLOR says.
    // oxlint-disable-next-line no-control-regex -- the absence of this exact byte is the assertion.
    expect(completed).not.toMatch(/\u001B/u);
  });

  it("falls back to Tau's own tool name when no emitter wrote a title", () => {
    expect(
      lineFor({ id: 'm4', role: 'tool-input', toolCallId: 'call-3', toolName: 'read_file', content: { path: 'a' } }),
    ).toBe('7\tmessage.appended\t○ read_file');
  });

  it('folds an agent-authored title onto one inert line', () => {
    const line = lineFor({
      id: 'm5',
      role: 'tool-input',
      toolCallId: 'call-4',
      toolName: 'shell',
      call: { toolCallId: 'shell-2', title: 'rm -rf \u001B[2J/tmp\nx', status: 'pending' },
      content: {},
    });

    expect(line).toBe('7\tmessage.appended\t○ rm -rf /tmp x');
  });

  it('prints the replacement a compaction or an external turn wrote, not a blank row', () => {
    /* `message.envelope-replaced` carries the whole message, so the tail has
     * everything it needs; it used to fall through to an empty summary and
     * print a bare `7\tmessage.envelope-replaced\t`. */
    const line = eventLine({
      ...base,
      type: 'message.envelope-replaced',
      messageId: 'm6',
      replacement: {
        id: 'm6',
        role: 'assistant',
        content: 'Filleted the top edge.',
        metadata: { tauInternal: { kind: 'external-agent', agentId: 'codex', model: 'gpt-5.3-codex' } },
      },
    } as AgentLogEvent);

    expect(line).toBe('7\tmessage.envelope-replaced\tassistant Filleted the top edge. [codex gpt-5.3-codex]');
  });
});

// W3 CL-R13 and SC-R12: a read never clamps; it refuses, and the reader refolds from cursor 0. SC-A12: a follow is one
// long-poll read at a time, and a command keeps its key across a redial.
describe('replayChat', () => {
  const row = (sequence: number, state: 'admitted' | 'running' | 'completed'): AgentLogEvent => ({
    ...base,
    sequence,
    type: 'run.lifecycle',
    state,
  });
  const attached = (endCursor: number): CommandAnswer => ({
    commandId: 'attach-1',
    generation: 0,
    status: 'applied',
    effect: 'not-applied',
    details: { takeover: false, endCursor },
  });
  const batch = (cursor: number, events: readonly AgentLogEvent[], endCursor: number): ReadAnswer => ({
    status: 'batch',
    sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
    chatId: 'chat-1',
    cursor,
    nextCursor: cursor + events.length,
    endCursor,
    events: [...events],
  });
  const clientOf = (endCursor: number, answers: readonly ReadAnswer[]): AgentChannelClient => {
    let answer = 0;
    return {
      execute: vi.fn(async () => attached(endCursor)),
      read: vi.fn(async () => answers[answer++]),
    } as unknown as AgentChannelClient;
  };

  it('should refold from cursor 0 when the host refuses a cursor past its end', async () => {
    const client = clientOf(2, [
      { status: 'refused', chatId: 'chat-1', reason: 'cursor-ahead', expected: { endCursor: 2 } },
      batch(0, [row(0, 'admitted'), row(1, 'completed')], 2),
    ]);

    await expect(
      replayChat({ client, chatId: 'chat-1', from: 9, follow: true, onEvent: async () => undefined }),
    ).resolves.toMatchObject({ cursor: 2, state: 'completed' });
    expect(client.read).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 0 }));
  });

  it('should answer the current run state from the chat ledger', async () => {
    const client = clientOf(3, [batch(0, [row(0, 'admitted'), row(1, 'running'), row(2, 'completed')], 3)]);

    await expect(
      replayChat({ client, chatId: 'chat-1', from: 0, follow: false, onEvent: async () => undefined }),
    ).resolves.toMatchObject({ cursor: 3, state: 'completed' });
  });

  it('should follow with one outstanding read', async () => {
    const rows = [row(0, 'admitted'), row(1, 'running'), row(2, 'completed')];
    let appended = 2;
    let inFlight = 0;
    let most = 0;
    const parked = Promise.withResolvers<void>();
    const secondRead = Promise.withResolvers<void>();
    // A long poll: answered at once when rows exist after the cursor, otherwise when the next row is appended.
    const read = vi.fn(async (input: ReadInput): Promise<ReadAnswer> => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      if (read.mock.calls.length === 2) {
        secondRead.resolve();
      }
      if (input.cursor >= appended) {
        await parked.promise;
      }
      inFlight -= 1;
      return batch(input.cursor, rows.slice(input.cursor, appended), appended);
    });
    const client = { execute: vi.fn(async () => attached(2)), read } as unknown as AgentChannelClient;
    const timers = vi.spyOn(globalThis, 'setTimeout');

    try {
      const replay = replayChat({ client, chatId: 'chat-1', from: 0, follow: true, onEvent: async () => undefined });
      await secondRead.promise;
      expect(timers).not.toHaveBeenCalled();
      appended = 3;
      parked.resolve();

      await expect(replay).resolves.toMatchObject({ cursor: 3, state: 'completed' });
      expect(read.mock.calls[1]?.[0].sourceHealth).toEqual({
        historyIntact: true,
        newerHistory: false,
        quarantined: false,
      });
      expect(read).toHaveBeenCalledTimes(2);
      expect(read).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 2, last: { leaderEpoch: 'leader-1', sequence: 1 } }),
      );
      expect(most).toBe(1);
    } finally {
      timers.mockRestore();
    }
  });

  it('should keep the command id on a re-send', async () => {
    const received: HostCommand[] = [];
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((resolve) => {
      server.once('listening', resolve);
    });
    server.on('connection', (socket) => {
      const launcher = {
        execute: async (command: HostCommand): Promise<CommandAnswer> => {
          received.push(command);
          if (received.length === 1) {
            // The connection drops before the owner answers: the effect is unknown to the client.
            socket.terminate();
            return new Promise<never>(() => {
              // Never answered: this connection is gone.
            });
          }
          return { commandId: command.commandId, generation: 0, status: 'applied', effect: 'durable', cursor: 4 };
        },
      } as unknown as AgentLauncher;
      serveAgentChannel(socket, launcher, { build: 'test' });
    });
    const address = server.address() as AddressInfo;
    const environment = { url: process.env['TAU_HOST_URL'], token: process.env['TAU_HOST_AGENT_TOKEN'] };
    process.env['TAU_HOST_URL'] = `http://127.0.0.1:${String(address.port)}`;
    process.env['TAU_HOST_AGENT_TOKEN'] = 'client-test-token';
    let printed = '';
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk, ...rest) => {
      printed += String(chunk);
      const done = rest.find((argument) => typeof argument === 'function');
      done?.();
      return true;
    });

    try {
      await runCommand(agentCommand, { rawArgs: ['steer', 'chat-1', 'run-1', 'Make the wall 3 mm thick'] });

      expect(received).toHaveLength(2);
      expect(received[1]?.commandId).toBe(received[0]?.commandId);
      expect(received[1]).toStrictEqual(received[0]);
      expect(printed).toBe('operation\tsteer\nrun\trun-1\nstatus\tapplied\ncursor\t4\n');
    } finally {
      stdout.mockRestore();
      process.env['TAU_HOST_URL'] = environment.url;
      process.env['TAU_HOST_AGENT_TOKEN'] = environment.token;
      if (environment.url === undefined) {
        delete process.env['TAU_HOST_URL'];
      }
      if (environment.token === undefined) {
        delete process.env['TAU_HOST_AGENT_TOKEN'];
      }
      server.close();
    }
  });
});
