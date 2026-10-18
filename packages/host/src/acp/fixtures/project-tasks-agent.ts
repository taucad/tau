/** Independent scripted ACP peer for task integration; never evidence of a real model turn. */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { connectMcpOverFetch } from '#acp/fixtures/mcp-fetch-client.js';
import type { McpFetchClient } from '#acp/fixtures/mcp-fetch-client.js';

type Frame = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
};
type Session = {
  cwd: string;
  client: Promise<McpFetchClient>;
  cancelled: boolean;
  cancel: () => void;
  cancellation: Promise<void>;
};
const replies = new Map<string, (value: unknown) => void>();
const sessions = new Map<string, Session>();
const send = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
};
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected an object.');
  }
  return value as Record<string, unknown>;
};
const update = (sessionId: string, value: Record<string, unknown>): void => {
  send({
    jsonrpc: '2.0',
    method: 'session/update',
    params: { sessionId, update: value },
  });
};
const call = async (input: {
  sessionId: string;
  tool: string;
  args: Record<string, unknown>;
}): Promise<Record<string, unknown>> => {
  const session = sessions.get(input.sessionId);
  if (!session || session.cancelled) {
    throw new Error('Session cancelled.');
  }
  const toolCallId = randomUUID();
  update(input.sessionId, {
    sessionUpdate: 'tool_call',
    toolCallId,
    title: `mcp.tau.${input.tool}`,
    kind: 'other',
    status: 'pending',
    rawInput: { server: 'tau', tool: input.tool, arguments: input.args },
  });
  const client = await session.client;
  const result = await client.callTool(input.tool, input.args);
  update(input.sessionId, {
    sessionUpdate: 'tool_call_update',
    toolCallId,
    status: result.isError ? 'failed' : 'completed',
    rawOutput: { result },
  });
  if (result.isError) {
    throw new TypeError(JSON.stringify(result.content));
  }
  const text = result.content?.find((content) => content.type === 'text')?.text;
  return object(result.structuredContent ?? (text ? (JSON.parse(text) as unknown) : {}));
};
const taskResult = (result: Record<string, unknown>): Record<string, unknown> => object(result['task'] ?? result);
const waitFor = async (input: { sessionId: string; taskId: string; text: string }): Promise<void> => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- observe durable mailbox changes in order.
    const snapshot = await call({
      sessionId: input.sessionId,
      tool: 'task_read',
      args: { taskId: input.taskId },
    });
    const { messages } = snapshot;
    if (Array.isArray(messages) && messages.some((message: unknown) => object(message)['text'] === input.text)) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- bounded cooperative poll; no reservation is acquired.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  throw new Error(`Mailbox never received ${input.text}.`);
};
const run = async (sessionId: string, prompt: string): Promise<void> => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session is missing.');
  }
  if (prompt.includes('PROJECT_TASK_FIXTURE:permission')) {
    await writeFile(join(session.cwd, 'partial-work.txt'), 'preserved-before-permission\n');
    const id = randomUUID();
    const toolCallId = randomUUID();
    update(sessionId, {
      sessionUpdate: 'tool_call',
      toolCallId,
      title: 'Permission-gated edit',
      kind: 'edit',
      status: 'pending',
    });
    const response = new Promise<unknown>((resolve) => {
      replies.set(id, resolve);
    });
    send({
      jsonrpc: '2.0',
      id,
      method: 'session/request_permission',
      params: {
        sessionId,
        toolCall: {
          toolCallId,
          title: 'Permission-gated edit',
          kind: 'edit',
          status: 'pending',
        },
        options: [
          { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'deny', name: 'Reject once', kind: 'reject_once' },
        ],
      },
    });
    await Promise.race([response, session.cancellation]);
    replies.delete(id);
    return;
  }
  if (prompt.includes('PROJECT_TASK_FIXTURE:context')) {
    const source = await readFile(join(session.cwd, 'main.scad'), 'utf8');
    const proof = {
      source,
      currentInstruction: prompt.includes('CURRENT_INSTRUCTION_NONCE'),
      staleInstruction: prompt.includes('INHERITED_CONTEXT_NONCE'),
    };
    update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: JSON.stringify(proof) } });
    return;
  }
  if (prompt.includes('PROJECT_TASK_FIXTURE:hold')) {
    await session.cancellation;
    return;
  }
  if (prompt.includes('PROJECT_TASK_FIXTURE:spawn-hold')) {
    await call({
      sessionId,
      tool: 'task_spawn',
      args: {
        requestId: 'spawn-held-child',
        title: 'Held child',
        prompt: 'PROJECT_TASK_FIXTURE:hold',
        provider: { id: 'codex' },
      },
    });
    return;
  }
  if (prompt.includes('PROJECT_TASK_FIXTURE:tau-root')) {
    const snapshot = await call({ sessionId, tool: 'task_read', args: {} });
    const taskList = snapshot['tasks'];
    if (!Array.isArray(taskList)) {
      throw new TypeError('Root task missing.');
    }
    const root = taskList.map((task: unknown) => object(task)).find((task) => task['depth'] === 0);
    if (!root) {
      throw new Error('Root task missing.');
    }
    await call({
      sessionId,
      tool: 'task_spawn',
      args: {
        requestId: 'spawn-tau-cad',
        title: 'Tau CAD child',
        prompt:
          'Create part.scad as cube(12), evaluate it with the actual CAD runtime, and send CAD_READY_NONCE to your parent.',
        provider: { id: 'tau' },
      },
    });
    await waitFor({ sessionId, taskId: String(root['id']), text: 'CAD_READY_NONCE' });
    update(sessionId, {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Observed actual Tau CAD result CAD_READY_NONCE.' },
    });
    return;
  }
  if (!prompt.includes('INHERITED_CONTEXT_NONCE')) {
    throw new Error('Project instructions were not present in the actual ACP prompt.');
  }
  const role = /PROJECT_TASK_FIXTURE:(root|child|grandchild)/u.exec(prompt)?.[1];
  const snapshot = await call({ sessionId, tool: 'task_read', args: {} });
  const { tasks } = snapshot;
  if (!Array.isArray(tasks)) {
    throw new TypeError('Task projection is missing.');
  }
  const own = tasks
    .map((task: unknown) => object(task))
    .find((task) =>
      role === 'root'
        ? task['depth'] === 0 && String(task['prompt']).includes('PROJECT_TASK_FIXTURE:root')
        : task['title'] === `Fixture ${role}`,
    );
  if (!own || typeof own['id'] !== 'string') {
    throw new Error(`Task identity missing for ${role}.`);
  }
  const ownId = own['id'];
  await writeFile(join(session.cwd, `${role}.txt`), `isolated-${role}\n`);
  switch (role) {
    case 'root': {
      const child = taskResult(
        await call({
          sessionId,
          tool: 'task_spawn',
          args: {
            requestId: 'fixture-child',
            title: 'Fixture child',
            prompt: 'PROJECT_TASK_FIXTURE:child',
            provider: { id: 'codex' },
          },
        }),
      );
      const childId = String(child['id']);
      await waitFor({ sessionId, taskId: ownId, text: 'CHILD_READY_NONCE' });
      await call({
        sessionId,
        tool: 'task_send',
        args: {
          requestId: 'fixture-parent-reply',
          taskId: childId,
          text: 'PARENT_REPLY_NONCE',
        },
      });
      await waitFor({
        sessionId,
        taskId: ownId,
        text: 'GRANDCHILD_TOOL_NONCE',
      });

      break;
    }
    case 'child': {
      const parentId = String(own['parentTaskId']);
      await call({
        sessionId,
        tool: 'task_send',
        args: {
          requestId: 'fixture-child-ready',
          taskId: parentId,
          text: 'CHILD_READY_NONCE',
        },
      });
      await waitFor({ sessionId, taskId: ownId, text: 'PARENT_REPLY_NONCE' });
      await call({
        sessionId,
        tool: 'task_spawn',
        args: {
          requestId: 'fixture-grandchild',
          title: 'Fixture grandchild',
          prompt: 'PROJECT_TASK_FIXTURE:grandchild',
          provider: { id: 'codex' },
        },
      });
      await waitFor({
        sessionId,
        taskId: ownId,
        text: 'GRANDCHILD_TOOL_NONCE',
      });
      await call({
        sessionId,
        tool: 'task_send',
        args: {
          requestId: 'fixture-child-result',
          taskId: parentId,
          text: 'GRANDCHILD_TOOL_NONCE',
        },
      });

      break;
    }
    case 'grandchild': {
      await call({
        sessionId,
        tool: 'task_send',
        args: {
          requestId: 'fixture-grandchild-result',
          taskId: String(own['parentTaskId']),
          text: 'GRANDCHILD_TOOL_NONCE',
        },
      });

      break;
    }
    default: {
      throw new Error('Fixture role is missing.');
    }
  }
  update(sessionId, {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: `Completed ${role} with real task tools.` },
  });
};
const handle = async (frame: Frame): Promise<void> => {
  if (!frame.method && frame.id !== undefined) {
    replies.get(String(frame.id))?.(frame);
    return;
  }
  const params = frame.params ?? {};
  let result: unknown = {};
  switch (frame.method) {
    case 'initialize': {
      result = {
        protocolVersion: 1,
        agentInfo: { name: 'project-tasks-fixture', version: '0.0.0' },
        agentCapabilities: {
          mcpCapabilities: { http: true },
          sessionCapabilities: { close: {} },
        },
      };
      break;
    }
    case 'session/new': {
      const sessionId = randomUUID();
      const servers = params['mcpServers'];
      if (!Array.isArray(servers)) {
        throw new TypeError('MCP servers missing.');
      }
      const server = servers.map((entry: unknown) => object(entry)).find((entry) => entry['name'] === 'tau');
      if (!server) {
        throw new Error('Tau MCP server missing.');
      }
      const headers = Array.isArray(server['headers'])
        ? Object.fromEntries(
            server['headers'].map((header: unknown) => {
              const entry = object(header);
              return [String(entry['name']), String(entry['value'])];
            }),
          )
        : {};
      const cancellation = Promise.withResolvers<void>();
      sessions.set(sessionId, {
        cwd: String(params['cwd']),
        cancelled: false,
        cancel: () => {
          cancellation.resolve();
        },
        cancellation: cancellation.promise,
        client: connectMcpOverFetch({ url: String(server['url']), headers }),
      });
      result = { sessionId };
      break;
    }
    case 'session/prompt': {
      const blocks = params['prompt'];
      const prompt = Array.isArray(blocks)
        ? blocks
            .map((block: unknown) => {
              const entry = object(block);
              const { text } = entry;
              if (typeof text === 'string') {
                return text;
              }
              const { resource } = entry;
              if (typeof resource !== 'object' || resource === null) {
                return '';
              }
              const content = object(resource)['text'];
              return typeof content === 'string' ? content : '';
            })
            .join('\n')
        : '';
      await run(String(params['sessionId']), prompt);
      result = {
        stopReason: sessions.get(String(params['sessionId']))?.cancelled ? 'cancelled' : 'end_turn',
      };
      break;
    }
    case 'session/cancel': {
      const session = sessions.get(String(params['sessionId']));
      if (session) {
        session.cancelled = true;
        session.cancel();
      }
      break;
    }
    case 'session/close': {
      sessions.delete(String(params['sessionId']));
      break;
    }
    default: {
      throw new Error(`Unsupported fixture method ${frame.method}.`);
    }
  }
  if (frame.id !== undefined) {
    send({ jsonrpc: '2.0', id: frame.id, result });
  }
};
createInterface({ input: process.stdin }).on('line', (line) => {
  const frame = JSON.parse(line) as Frame;
  const answer = async (): Promise<void> => {
    try {
      await handle(frame);
    } catch (error) {
      if (frame.id !== undefined) {
        send({
          jsonrpc: '2.0',
          id: frame.id,
          error: {
            code: -32_603,
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  };
  // async-iife: bootstrap -- independent JSON-RPC requests may remain pending concurrently.
  void answer();
});
