/* eslint-disable @typescript-eslint/naming-convention -- the adapters' own `rawOutput` and `_meta` keys keep their wire names. */
/**
 * The ACP → durable-log projection, driven by notifications captured from the
 * two shipping adapters.
 *
 * The projection is the only place ACP's vocabulary is translated, so these
 * cases pin the facts a client cannot recover later: the emitter's programmatic
 * tool name (which neither adapter puts in ACP's own `name` field), its
 * `_meta`, a call that arrives already finished, a refinement that only ever
 * appears at `in_progress`, and reasoning.
 */

import { describe, expect, it } from 'vitest';

import type { SessionUpdate } from '@agentclientprotocol/sdk';
import type { ExternalAgentLogEvent } from '@taucad/agent-host/node-launcher';
import type { ProviderMessage } from '@taucad/agent-host';

import { createTurnProjection } from '#acp/session.js';
import type { AcpPromptTurn } from '#acp/session.js';

type MessageOf<Role extends ProviderMessage['role']> = Extract<ProviderMessage, { role: Role }>;

const project = async (
  updates: readonly SessionUpdate[],
  agentId = 'codex',
  report?: Parameters<ReturnType<typeof createTurnProjection>['report']>[0],
): Promise<ProviderMessage[]> => {
  const appended: ExternalAgentLogEvent[] = [];
  let nextId = 0;
  const turn: AcpPromptTurn = {
    append: async (events) => {
      appended.push(...events);
    },
    approve: async () => ({ interruptId: 'unused', outcome: 'cancelled' }),
    signal: new AbortController().signal,
  };
  const createId = (): string => {
    nextId += 1;
    return `id-${String(nextId)}`;
  };
  const projection = createTurnProjection({ turn, createId, agentId });
  for (const update of updates) {
    projection.update(update);
  }
  if (report) {
    projection.report(report);
  }
  await projection.flush();
  return appended.flatMap((event) => (event.type === 'message.appended' ? [event.message] : []));
};

/** The Codex `listFiles` pair, verbatim from the shape the adapter emits. */
const listFilesCall = {
  sessionUpdate: 'tool_call',
  toolCallId: 'list-1',
  name: 'listFiles',
  kind: 'read',
  title: 'List files',
  status: 'pending',
  rawInput: { path: '.' },
} as const satisfies SessionUpdate;

const listFilesResult = {
  sessionUpdate: 'tool_call_update',
  toolCallId: 'list-1',
  status: 'completed',
  rawOutput: { formatted_output: 'tau.json\npackage.json', exit_code: 0 },
} as const satisfies SessionUpdate;

describe('the ACP turn projection', () => {
  it('records a call and its result as one tool-input/tool-output pair', async () => {
    const messages = await project([listFilesCall, listFilesResult]);

    expect(messages).toHaveLength(2);
    const input = messages[0] as MessageOf<'tool-input'>;
    expect(input.role).toBe('tool-input');
    expect(input.toolName).toBe('listFiles');
    expect(input.call).toEqual({
      toolCallId: 'list-1',
      kind: 'read',
      title: 'List files',
      status: 'pending',
      nativeName: 'listFiles',
    });
    expect(input.content).toEqual({ path: '.' });

    const output = messages[1] as MessageOf<'tool-output'>;
    expect(output.role).toBe('tool-output');
    expect(output.toolCallId).toBe(input.toolCallId);
    expect(output.isError).toBe(false);
    expect(output.call?.status).toBe('completed');
    expect(output.call?.nativeName).toBe('listFiles');
    expect(output.content).toEqual({ formatted_output: 'tau.json\npackage.json', exit_code: 0 });
  });

  it("recovers Claude's native tool name from its own metadata, and keeps the metadata", async () => {
    const [input] = (await project(
      [
        {
          sessionUpdate: 'tool_call',
          toolCallId: 'read-1',
          title: 'Read main.scad (12 - 40)',
          kind: 'read',
          status: 'pending',
          _meta: { claudeCode: { toolName: 'Read', subagent: null } },
        },
      ],
      'claude',
    )) as [MessageOf<'tool-input'>];

    expect(input.call?.nativeName).toBe('Read');
    expect(input.toolName).toBe('Read');
    expect(input.call?.meta).toEqual({ claudeCode: { toolName: 'Read', subagent: null } });
  });

  it("recovers Tau's own tool name from a Codex MCP call", async () => {
    const [input] = (await project([
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'mcp-1',
        title: 'mcp.tau.screenshot',
        kind: 'execute',
        status: 'pending',
        rawInput: { server: 'tau', tool: 'screenshot', arguments: {} },
        _meta: { is_mcp_tool_call: true },
      },
    ])) as [MessageOf<'tool-input'>];

    expect(input.call?.nativeName).toBe('screenshot');
    expect(input.toolName).toBe('screenshot');
  });

  it('falls back to the agent-authored title when no programmatic name exists', async () => {
    const [input] = (await project([
      { sessionUpdate: 'tool_call', toolCallId: 'shell-1', title: 'ls -la', kind: 'execute', status: 'pending' },
    ])) as [MessageOf<'tool-input'>];

    expect(input.toolName).toBe('ls -la');
    expect(input.call?.nativeName).toBeUndefined();
  });

  it('writes the result row for a call that arrives already terminal', async () => {
    const messages = await project([
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'image-1',
        name: 'imageView',
        title: 'View Image render.png',
        kind: 'read',
        status: 'completed',
      },
    ]);

    expect(messages.map((message) => message.role)).toEqual(['tool-input', 'tool-output']);
    expect((messages[1] as MessageOf<'tool-output'>).call?.status).toBe('completed');
  });

  it('carries an in_progress refinement into a result the terminal update did not repeat', async () => {
    const diff = [{ type: 'diff', path: 'main.scad', oldText: 'cube(10);\n', newText: 'cube(12);\n' }];
    const messages = await project([
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'edit-1',
        name: 'applyPatch',
        title: 'Editing files',
        kind: 'edit',
        status: 'pending',
      },
      { sessionUpdate: 'tool_call_update', toolCallId: 'edit-1', status: 'in_progress', content: diff },
      { sessionUpdate: 'tool_call_update', toolCallId: 'edit-1', status: 'completed' },
    ] as SessionUpdate[]);

    expect(messages.map((message) => message.role)).toEqual(['tool-input', 'tool-output']);
    const output = messages[1] as MessageOf<'tool-output'>;
    expect(output.call?.content).toEqual(diff);
    expect(output.content).toEqual(diff);
  });

  it('projects reasoning as a thinking block, separate from the assistant text', async () => {
    const messages = await project([
      { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'The boss needs ' }, messageId: 'm1' },
      { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: '2mm clearance.' }, messageId: 'm1' },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done.' }, messageId: 'm1' },
    ] as SessionUpdate[]);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toEqual([{ type: 'thinking', thinking: 'The boss needs 2mm clearance.' }]);
    expect(messages[1]?.content).toEqual([{ type: 'text', text: 'Done.' }]);
  });
  const usage = {
    totalTokens: 1500,
    inputTokens: 1200,
    outputTokens: 300,
    thoughtTokens: 40,
    cachedReadTokens: 7,
  } as const;

  const usageUpdate = {
    sessionUpdate: 'usage_update',
    used: 1200,
    size: 200_000,
    cost: { amount: 0.01, currency: 'USD' },
  } as const satisfies SessionUpdate;

  const text = (value: string): SessionUpdate => ({
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: value },
  });

  /*
   * V6. Usage is cumulative in both places ACP reports it, so exactly one
   * message per turn may carry it — the last — or a two-block turn would count
   * the same tokens twice.
   */
  it("stamps the vendor's report onto the turn's last message and no other", async () => {
    const messages = await project(
      [text('First. '), usageUpdate, listFilesCall, listFilesResult, text('Done.')],
      'codex',
      { usage, model: 'gpt-5.3-codex' },
    );

    const assistants = messages.filter((message) => message.role === 'assistant');
    expect(assistants).toHaveLength(2);
    expect(assistants[0]?.metadata).not.toHaveProperty('usage');
    expect(assistants.at(-1)?.metadata).toMatchObject({
      model: 'gpt-5.3-codex',
      responseModel: 'gpt-5.3-codex',
      usage: {
        input: 1200,
        output: 300,
        cacheRead: 7,
        cacheWrite: 0,
        reasoning: 40,
        totalTokens: 1500,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    /* The vendor's money is the vendor's, labelled and never priced as Tau
     * credits — the `cost` block above is zero on purpose. */
    expect(assistants.at(-1)?.metadata?.tauInternal).toMatchObject({
      agentId: 'codex',
      vendorCost: { amount: 0.01, currency: 'USD', reportedBy: 'codex' },
      vendorContext: { used: 1200, size: 200_000 },
    });
  });

  /* A turn that ends on a tool call has no open block to stamp, and the report
   * would otherwise be the one fact with nowhere to live. */
  it('records a usage-only message when the turn ended without text', async () => {
    const messages = await project([listFilesCall, listFilesResult], 'codex', { usage, model: 'gpt-5.3-codex' });

    const last = messages.at(-1);
    expect(last).toMatchObject({ role: 'assistant', content: [] });
    expect(last?.metadata).toMatchObject({ responseModel: 'gpt-5.3-codex', usage: { totalTokens: 1500 } });
  });

  /* V13: every update variant has a stated ruling. These four are presentation
   * Tau has no surface for, and the title is the one durable fact in the set. */
  it('drops plans and command lists, and carries the title the agent chose', async () => {
    const appended: ExternalAgentLogEvent[] = [];
    const turn: AcpPromptTurn = {
      append: async (events) => {
        appended.push(...events);
      },
      approve: async () => ({ interruptId: 'unused', outcome: 'cancelled' }),
      signal: new AbortController().signal,
    };
    const projection = createTurnProjection({ turn, createId: () => 'id-1', agentId: 'codex' });
    for (const update of [
      { sessionUpdate: 'plan', entries: [{ content: 'write hello.txt', priority: 'high', status: 'pending' }] },
      { sessionUpdate: 'plan_removed', planId: 'plan-1' },
      { sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'compact', description: 'Compact' }] },
      { sessionUpdate: 'session_info_update', title: 'Fixture session' },
    ] as const satisfies readonly SessionUpdate[]) {
      projection.update(update);
    }
    await projection.flush();

    expect(appended).toEqual([]);
    expect(projection.title).toBe('Fixture session');
  });
});
