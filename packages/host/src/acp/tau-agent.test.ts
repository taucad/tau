import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseLogEvent } from '@taucad/agent-host';
import type { ModelStreamEvent, TauTurnTransportInput } from '@taucad/agent-host';
import { createTauAgentAcpTransport } from '#acp/tau-agent.js';
import type { AcpWireFrame } from '#acp/spawn.js';
import { createNodeLauncher } from '#node-launcher.fixture.js';

describe('Tau agent-side ACP transport', () => {
  it('runs a real admitted Pi tool turn once, with one transcript and actual ACP frames', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-agent-acp-'));
    const frames: AcpWireFrame[] = [];
    const invoke = vi.fn(async () => {
      await writeFile(join(root, 'part.scad'), 'cube(10);');
      return { content: 'Wrote Part', isError: false };
    });
    let calls = 0;
    const launcher = createNodeLauncher({
      workspaceRoot: root,
      systemPrompt: 'Create a CAD part.',
      model: { id: 'scripted', contextWindow: 200_000 },
      toolRegistry: {
        list: () => [{ name: 'write_file', description: 'Write a part', inputSchema: { type: 'object' } }],
        invoke,
      },
      tauTurnTransport: createTauAgentAcpTransport({ onFrame: (frame) => frames.push(frame) }),
      modelTransport: {
        funding: { type: 'unfunded' },
        async *stream(): AsyncGenerator<ModelStreamEvent> {
          calls++;
          if (calls === 1) {
            yield { type: 'tool-input', toolCallId: 'cad-write', toolName: 'write_file', input: {} };
            yield { type: 'completed', stopReason: 'toolUse' };
            return;
          }
          yield { type: 'text-delta', text: 'Created Part' };
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
    });
    try {
      const answer = await launcher.execute({
        type: 'start',
        commandId: 'start-part',
        payload: {
          chatId: 'cad',
          runId: 'cad-run',
          trigger: 'submit',
          message: { id: 'cad-message', role: 'user', content: 'Create a cube.' },
        },
      });
      expect(answer.status).toBe('applied');
      await vi.waitFor(async () => {
        const ledger = await launcher.host.ledger('cad');
        expect(ledger.runs['cad-run']?.lifecycle).toBe('completed');
      });
      expect(await readFile(join(root, 'part.scad'), 'utf8')).toBe('cube(10);');
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(calls).toBe(2);
      const transcript = await readFile(join(root, '.tau/chats/cad/events.jsonl'), 'utf8');
      const rows = transcript
        .trim()
        .split('\n')
        .map((line) => parseLogEvent(JSON.parse(line)));
      expect(rows.filter((row) => row.type === 'message.appended' && row.message.role === 'tool-input')).toHaveLength(
        1,
      );
      expect(rows.filter((row) => row.type === 'message.appended' && row.message.role === 'tool-output')).toHaveLength(
        1,
      );
      expect(rows.filter((row) => row.type === 'run.lifecycle' && row.state === 'admitted')).toHaveLength(1);
      expect(rows.filter((row) => row.type === 'turn.finalized')).toHaveLength(1);
      const methods = frames.map(
        ({ frame }) => JSON.parse(frame) as { method?: string; params?: { update?: { sessionUpdate: string } } },
      );
      expect(methods.filter((frame) => frame.method === 'initialize')).toHaveLength(1);
      expect(methods.filter((frame) => frame.method === 'session/new')).toHaveLength(1);
      expect(methods.filter((frame) => frame.method === 'session/prompt')).toHaveLength(1);
      expect(
        methods
          .filter((frame) => frame.method === 'session/update')
          .map((frame) => frame.params?.update?.sessionUpdate),
      ).toEqual(expect.arrayContaining(['tool_call', 'tool_call_update', 'agent_message_chunk']));
    } finally {
      await launcher.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('sends session/cancel to the same execution and closes the duplex', async () => {
    const frames: AcpWireFrame[] = [];
    const started = Promise.withResolvers<void>();
    const ended = Promise.withResolvers<void>();
    const controller = new AbortController();
    const abort = vi.fn(() => {
      ended.resolve();
    });
    const execute = vi.fn<TauTurnTransportInput['execute']>(async () => {
      started.resolve();
      await ended.promise;
      return { outcome: 'aborted' };
    });
    const pending = createTauAgentAcpTransport({ onFrame: (frame) => frames.push(frame) }).run({
      chatId: 'child',
      runId: 'child-run',
      attempt: 1,
      root: '/candidate',
      signal: controller.signal,
      execute,
      abort,
    });
    await started.promise;
    controller.abort();
    await expect(pending).resolves.toEqual({ outcome: 'aborted' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(frames.some((frame) => frame.frame.includes('session/cancel'))).toBe(true);
  });

  it('projects native needs-input without acquiring a second approval authority', async () => {
    const frames: AcpWireFrame[] = [];
    await createTauAgentAcpTransport({ onFrame: (frame) => frames.push(frame) }).run({
      chatId: 'permission',
      runId: 'permission-run',
      attempt: 1,
      signal: new AbortController().signal,
      abort: () => undefined,
      execute: async (projection) => {
        await projection.needsInput?.({ toolCallId: 'print', toolName: 'print_model', prompt: 'Print Part?' });
        return { outcome: 'aborted' };
      },
    });
    expect(frames.some((frame) => frame.frame.includes('session/request_permission'))).toBe(true);
    expect(frames.some((frame) => frame.frame.includes('"outcome":"cancelled"'))).toBe(true);
  });

  it('keeps native permission pause and cancellation in the canonical run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-agent-permission-'));
    const frames: AcpWireFrame[] = [];
    const effect = vi.fn();
    const launcher = createNodeLauncher({
      workspaceRoot: root,
      systemPrompt: 'Ask before printing.',
      model: { id: 'scripted', contextWindow: 200_000 },
      tauTurnTransport: createTauAgentAcpTransport({ onFrame: (frame) => frames.push(frame) }),
      toolRegistry: {
        list: () => [{ name: 'print_model', description: 'Print Part', inputSchema: { type: 'object' } }],
        invoke: async ({ approve }) => {
          if (approve === undefined) {
            throw new Error('An admitted tool requires the native approval owner.');
          }
          const resolution = await approve({
            key: 'print-part',
            prompt: 'Print Part?',
            payload: { kind: 'print-request' },
          });
          if (resolution.outcome === 'approved') {
            effect();
          }
          return { content: resolution.outcome, isError: false };
        },
      },
      modelTransport: {
        funding: { type: 'unfunded' },
        async *stream(): AsyncGenerator<ModelStreamEvent> {
          yield { type: 'tool-input', toolCallId: 'print-part', toolName: 'print_model', input: {} };
          yield { type: 'completed', stopReason: 'toolUse' };
        },
      },
    });
    try {
      await launcher.execute({
        type: 'start',
        commandId: 'print-start',
        payload: {
          chatId: 'print',
          runId: 'print-run',
          trigger: 'submit',
          message: { id: 'print-message', role: 'user', content: 'Print Part' },
        },
      });
      await vi.waitFor(async () => {
        const snapshot = await launcher.host.snapshot('print');
        expect(snapshot.state).toBe('paused');
      });
      expect(await launcher.host.pendingInterrupts('print-run')).toHaveLength(1);
      await launcher.execute({
        type: 'cancel',
        commandId: 'print-cancel',
        payload: { chatId: 'print', runId: 'print-run' },
      });
      expect(await launcher.host.pendingInterrupts('print-run')).toHaveLength(0);
      expect(effect).not.toHaveBeenCalled();
      expect(frames.some((frame) => frame.frame.includes('session/request_permission'))).toBe(true);
      expect(frames.some((frame) => frame.frame.includes('session/cancel'))).toBe(true);
      const transcript = await readFile(join(root, '.tau/chats/print/events.jsonl'), 'utf8');
      const rows = transcript
        .trim()
        .split('\n')
        .map((line) => parseLogEvent(JSON.parse(line)));
      expect(rows.filter((row) => row.type === 'run.lifecycle' && row.state === 'admitted')).toHaveLength(1);
      expect(rows.filter((row) => row.type === 'interrupt.recorded').map((row) => row.phase)).toEqual([
        'requested',
        'resolved',
      ]);
    } finally {
      await launcher.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
