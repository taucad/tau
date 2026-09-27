import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createTauAgentHost } from '@taucad/agent-host';
import type {
  InterruptApprovalPort,
  JsonValue,
  ModelStreamEvent,
  ModelStreamRequest,
  ModelTransport,
} from '@taucad/agent-host';
import { createNodeEventLog } from '@taucad/agent-host/node';
import type { RpcFileSystem } from '@taucad/chat/rpc';
import { serializeTodoList, todoListPath } from '@taucad/chat';

import { createChatToolRegistry } from '#registry/tool-registry.js';

/**
 * The scripted model (V08): a turn with three steps that keeps the person's
 * list current — creates it, moves on, finishes — and then answers.
 *
 * ponytail: the host package's `scripted-model.fixture.ts` is not on its export
 * map, so the same shape lives here; lift it if a third package needs it.
 */
type ScriptedResponse = {
  readonly text?: string | undefined;
  readonly toolCalls?:
    | ReadonlyArray<{ readonly id: string; readonly name: string; readonly input: JsonValue }>
    | undefined;
};

const scriptedTransport = (
  responses: readonly ScriptedResponse[],
): ModelTransport & { readonly requests: ModelStreamRequest[] } => {
  const requests: ModelStreamRequest[] = [];
  let cursor = 0;
  return {
    requests,
    async *stream(request): AsyncGenerator<ModelStreamEvent> {
      requests.push(request);
      const response = responses[cursor];
      cursor += 1;
      if (!response) {
        throw new Error(`Scripted model exhausted after ${String(cursor - 1)} calls.`);
      }
      if (response.text !== undefined) {
        yield { type: 'text-delta', text: response.text };
      }
      for (const call of response.toolCalls ?? []) {
        yield { type: 'tool-input', toolCallId: call.id, toolName: call.name, input: call.input };
      }
      yield {
        type: 'usage',
        usage: {
          input: 100,
          output: 10,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 110,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      yield { type: 'completed', stopReason: response.toolCalls?.length ? 'toolUse' : 'stop' };
    },
  };
};

const resolvedInterruptPort: InterruptApprovalPort = {
  pause: async (request) => ({ interruptId: request.interruptId, outcome: 'approved' }),
  pending: async () => [],
  resume: async () => undefined,
};

/** A project filesystem that remembers what the tools write. */
const memoryFileSystem = (files: Map<string, string>): RpcFileSystem => ({
  readFile: async (path) => {
    const content = files.get(path);
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    }
    return content;
  },
  writeFile: async (path, content) => {
    files.set(path, content);
  },
  writeBinaryFile: async () => undefined,
  deleteFile: async (path) => {
    files.delete(path);
  },
  readdir: async () => [],
  exists: async (path) => files.has(path),
  appendFile: async () => undefined,
  editFile: async () => {
    throw new Error('edit_file is not part of this fixture.');
  },
  stat: async () => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  },
});

const chatId = 'chat_todo';
const started = [
  { id: 'model-pyramid', title: 'Model the pyramid', status: 'in_progress' },
  { id: 'slice-pyramid', title: 'Slice the pyramid', status: 'pending' },
  { id: 'request-print', title: 'Request the print', status: 'pending' },
] as const;
const advanced = [
  { id: 'model-pyramid', title: 'Model the pyramid', status: 'done' },
  { id: 'slice-pyramid', title: 'Slice the pyramid', status: 'in_progress', note: '0.2 mm layers' },
  { id: 'request-print', title: 'Request the print', status: 'pending' },
] as const;

const createIds = (prefix: string) => {
  let next = 0;
  return () => `${prefix}-${String(next++)}`;
};

describe('update_todos through createTauAgentHost', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it('should leave the final YAML in the project and record both tool calls as successes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-update-todos-'));
    const logPath = join(directory, 'events.jsonl');
    const files = new Map<string, string>();
    const transport = scriptedTransport([
      {
        text: 'Starting with the model.',
        toolCalls: [{ id: 'call-todos-1', name: 'update_todos', input: { chatId, items: [...started] } }],
      },
      {
        toolCalls: [{ id: 'call-todos-2', name: 'update_todos', input: { chatId, items: [...advanced] } }],
      },
      { text: 'The pyramid is modelled and slicing is under way.' },
    ]);
    let tick = 0;
    const host = createTauAgentHost({
      systemPrompt: 'You are the task-list fixture.',
      model: { id: 'scripted-todo-model', contextWindow: 200_000 },
      modelTransport: transport,
      toolRegistry: createChatToolRegistry({
        fileSystemFor: () => memoryFileSystem(files),
        testingEnabled: false,
      }),
      openEventLog: async () => createNodeEventLog({ filePath: logPath }),
      interruptPort: resolvedInterruptPort,
      createId: createIds('message'),
      createLeaderEpoch: createIds('epoch'),
      now: () => new Date(Date.UTC(2026, 8, 24, 0, 0, tick++)),
    });

    try {
      await host.admit({
        chatId,
        runId: 'run-todo',
        trigger: 'submit',
        message: { id: 'turn-todo', role: 'user', content: 'Model the pyramid, slice it and request the print.' },
      });

      expect(files.get(todoListPath(chatId))).toBe(serializeTodoList({ version: 1, items: [...advanced] }));
      expect(files.get(todoListPath(chatId))).toBe(
        [
          'version: 1',
          'items:',
          '  - id: model-pyramid',
          '    title: Model the pyramid',
          '    status: done',
          '  - id: slice-pyramid',
          '    title: Slice the pyramid',
          '    status: in_progress',
          '    note: 0.2 mm layers',
          '  - id: request-print',
          '    title: Request the print',
          '    status: pending',
          '',
        ].join('\n'),
      );

      const snapshot = await host.snapshot(chatId);
      expect(snapshot.state).toBe('completed');
      const toolOutputs = snapshot.messages.filter((message) => message.role === 'tool-output');
      expect(toolOutputs).toMatchObject([
        {
          toolCallId: 'call-todos-1',
          toolName: 'update_todos',
          isError: false,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
          content: { success: true, path: todoListPath(chatId), counts: { pending: 2, in_progress: 1, done: 0 } },
        },
        {
          toolCallId: 'call-todos-2',
          toolName: 'update_todos',
          isError: false,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
          content: { success: true, path: todoListPath(chatId), counts: { pending: 1, in_progress: 1, done: 1 } },
        },
      ]);
      expect(
        snapshot.messages.filter((message) => message.role === 'tool-input').map((message) => message.toolCallId),
      ).toEqual(['call-todos-1', 'call-todos-2']);
      expect(transport.requests).toHaveLength(3);
      expect(transport.requests[0]?.tools.map((tool) => tool.name)).toContain('update_todos');
    } finally {
      await host.close();
    }
  });
});
