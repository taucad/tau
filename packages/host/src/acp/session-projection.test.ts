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

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SessionUpdate } from '@agentclientprotocol/sdk';
import type { ExternalAgentLogEvent } from '@taucad/agent-host/node-launcher';
import { reduceEventLog } from '@taucad/agent-host';
import type { AgentLogEvent, ProviderMessage } from '@taucad/agent-host';

import { chooseOption, createTurnProjection, openAcpSession } from '#acp/session.js';
import type { AcpPromptTurn } from '#acp/session.js';
import type { AcpAdapter } from '#acp/registry.js';

type MessageOf<Role extends ProviderMessage['role']> = Extract<ProviderMessage, { role: Role }>;

const stubTurn = (appended: ExternalAgentLogEvent[] = []): AcpPromptTurn => ({
  append: async (events) => {
    appended.push(...events);
  },
  approve: async () => ({ interruptId: 'unused', outcome: 'cancelled' }),
  publishLive: async () => undefined,
  signal: new AbortController().signal,
});

it('should finalize named text exactly once after its durable append fails', async () => {
  const appended: ExternalAgentLogEvent[] = [];
  let failures = 0;
  const projection = createTurnProjection({
    agentId: 'codex',
    createId: randomUUID,
    turn: {
      ...stubTurn(appended),
      append: async (events) => {
        if (
          failures < 2 &&
          events.some((event) => event.type === 'message.appended' && event.message.metadata?.usage)
        ) {
          failures++;
          throw new Error('transient text append');
        }
        appended.push(...events);
      },
    },
  });
  projection.update({
    sessionUpdate: 'agent_message_chunk',
    messageId: 'stable',
    content: { type: 'text', text: 'answer' },
  });
  projection.report({ usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } });
  await expect(projection.flush()).rejects.toThrow('transient text append');
  await projection.flush();
  await projection.flush();
  expect(
    appended.flatMap((event) =>
      event.type === 'message.appended' && event.message.metadata?.usage
        ? [event.message.metadata.usage.totalTokens]
        : [],
    ),
  ).toEqual([150]);
  expect(appended.filter((event) => event.type === 'message.appended')).toHaveLength(1);
});

it.each([0, 1, 2, 3, 4, 5, 6])(
  'should recover durable row %s without replaying a completed projection or earlier row',
  async (failedRow) => {
    const appended: ExternalAgentLogEvent[] = [];
    let attempt = 0;
    const projection = createTurnProjection({
      createId: randomUUID,
      agentId: 'codex',
      turn: {
        ...stubTurn(appended),
        append: async (events) => {
          if (attempt++ === failedRow) {
            throw new Error('transient ordered write');
          }
          appended.push(...events);
        },
      },
    });
    projection.update({
      sessionUpdate: 'agent_message_chunk',
      messageId: 'before',
      content: { type: 'text', text: 'before' },
    });
    projection.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'read',
      title: 'Read file',
      kind: 'read',
      status: 'completed',
      rawOutput: { result: 'source' },
    });
    projection.update({
      sessionUpdate: 'agent_message_chunk',
      messageId: 'after',
      content: { type: 'text', text: 'after' },
    });
    projection.report({ usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } });
    await projection.flush();
    await projection.flush();
    const messages = reduceEventLog(
      appended.map(
        (event, sequence) =>
          ({
            ...event,
            version: 1,
            leaderEpoch: 'test',
            sequence,
            recordedAt: new Date(0).toISOString(),
            runId: 'run',
          }) satisfies AgentLogEvent,
      ),
    );
    expect(messages.map((message) => message.role)).toEqual(['assistant', 'tool-input', 'tool-output', 'assistant']);
    expect(JSON.stringify(messages)).toContain('after');
    expect(
      messages.flatMap((message) => (message.metadata?.usage ? [message.metadata.usage.totalTokens] : [])),
    ).toEqual([150]);
  },
);

// oxlint-disable-next-line eslint/max-params -- Keeps table-driven projection cases terse without a fixture-options wrapper.
const projectEvents = async (
  updates: readonly SessionUpdate[],
  agentId = 'codex',
  report?: Parameters<ReturnType<typeof createTurnProjection>['report']>[0],
  tauMcpServerName?: string,
): Promise<{ readonly appended: ExternalAgentLogEvent[]; readonly live: Array<Record<string, unknown>> }> => {
  const appended: ExternalAgentLogEvent[] = [];
  const live: Array<Record<string, unknown>> = [];
  let nextId = 0;
  const turn: AcpPromptTurn = {
    append: async (events) => {
      appended.push(...events);
    },
    approve: async () => ({ interruptId: 'unused', outcome: 'cancelled' }),
    publishLive: async (event) => {
      live.push(event);
    },
    signal: new AbortController().signal,
  };
  const createId = (): string => {
    nextId += 1;
    return `id-${String(nextId)}`;
  };
  const projection = createTurnProjection({
    turn,
    createId,
    agentId,
    ...(tauMcpServerName === undefined ? {} : { tauMcpServerName }),
  });
  for (const update of updates) {
    projection.update(update);
  }
  if (report) {
    projection.report(report);
  }
  await projection.flush();
  return { appended, live };
};

// oxlint-disable-next-line eslint/max-params -- Test helper mirrors the four independent projection inputs.
const project = async (
  updates: readonly SessionUpdate[],
  agentId = 'codex',
  report?: Parameters<ReturnType<typeof createTurnProjection>['report']>[0],
  tauMcpServerName?: string,
): Promise<ProviderMessage[]> => {
  const events = await projectEvents(updates, agentId, report, tauMcpServerName);
  return [
    ...reduceEventLog(
      events.appended.map(
        (event, sequence) =>
          ({
            ...event,
            version: 1,
            leaderEpoch: 'test',
            sequence,
            recordedAt: new Date(0).toISOString(),
            runId: 'run-1',
          }) satisfies AgentLogEvent,
      ),
    ),
  ];
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
  it('publishes text immediately with one stable block identity, then commits it once', async () => {
    const appended: ExternalAgentLogEvent[] = [];
    const live: Array<Record<string, unknown>> = [];
    let nextId = 0;
    const turn: AcpPromptTurn = {
      append: async (events) => {
        appended.push(...events);
      },
      approve: async () => ({ interruptId: 'unused', outcome: 'cancelled' }),
      publishLive: async (event) => {
        live.push(event);
      },
      signal: new AbortController().signal,
    };
    const projection = createTurnProjection({
      turn,
      createId: () => `id-${String(++nextId)}`,
      agentId: 'codex',
    });

    projection.update({
      sessionUpdate: 'agent_message_chunk',
      messageId: 'message-1',
      content: { type: 'text', text: 'hel' },
    });
    projection.update({
      sessionUpdate: 'agent_message_chunk',
      messageId: 'message-1',
      content: { type: 'text', text: 'lo' },
    });
    await projection.flush();

    expect(live).toEqual([
      { type: 'text-start', messageId: 'id-1', contentIndex: 0 },
      { type: 'text-delta', messageId: 'id-1', contentIndex: 0, delta: 'hel', offset: 0 },
      { type: 'text-delta', messageId: 'id-1', contentIndex: 0, delta: 'lo', offset: 3 },
      { type: 'text-end', messageId: 'id-1', contentIndex: 0, content: 'hello' },
    ]);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      type: 'message.appended',
      message: { id: 'id-1', content: [{ type: 'text', text: 'hello' }] },
    });
  });

  it('joins a sparse permission request to its queued tool context before pausing', async () => {
    const approvals: Array<{ readonly prompt: string; readonly payload?: unknown }> = [];
    const turn: AcpPromptTurn = {
      append: async () => undefined,
      approve: async (request) => {
        approvals.push(request);
        return { interruptId: 'approval-1', outcome: 'cancelled' };
      },
      publishLive: async () => undefined,
      signal: new AbortController().signal,
    };
    const projection = createTurnProjection({ turn, createId: () => 'id-1', agentId: 'codex' });
    projection.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-opaque',
      title: 'mcp.cua_repl.js',
      kind: 'execute',
      status: 'pending',
      rawInput: { server: 'cua_repl', tool: 'js', arguments: { code: 'await inspect()' } },
    });
    await projection.approve({
      prompt: 'Allow call-opaque?',
      payload: {
        toolCall: { toolCallId: 'call-opaque', kind: 'execute', status: 'pending' },
        options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
      },
    });

    expect(approvals).toEqual([
      {
        prompt: 'Allow mcp.cua_repl.js with {"server":"cua_repl","tool":"js","arguments":{"code":"await inspect()"}}?',
        payload: {
          toolCall: {
            toolCallId: 'call-opaque',
            kind: 'execute',
            status: 'pending',
            title: 'mcp.cua_repl.js',
            nativeName: 'js',
          },
          input: { server: 'cua_repl', tool: 'js', arguments: { code: 'await inspect()' } },
          options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
        },
      },
    ]);
  });

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
      status: 'completed',
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

  it('does not duplicate a durable ACP tool-input on the live channel', async () => {
    const live: Array<Record<string, unknown>> = [];
    const projection = createTurnProjection({
      turn: {
        append: async () => undefined,
        approve: async () => ({ interruptId: 'unused', outcome: 'cancelled' }),
        publishLive: async (event) => {
          live.push(event);
        },
        signal: new AbortController().signal,
      },
      createId: (() => {
        let id = 0;
        return () => `id-${String(++id)}`;
      })(),
      agentId: 'codex',
    });

    projection.update(listFilesCall);
    await projection.flush();

    expect(live).toEqual([]);
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

  it.each([
    ['get_kernel_result', { targetFile: 'main.ts' }, { status: 'ready' }],
    ['test_model', {}, { failures: [], passes: [], passed: 0, total: 0 }],
    [
      'screenshot',
      { targetFile: 'main.ts', mode: 'single' },
      { images: [{ view: 'isometric', dataUrl: 'data:image/webp;base64,AQ==' }] },
    ],
    [
      'export_geometry',
      { targetFile: 'main.ts', format: 'glb' },
      {
        format: 'glb',
        files: [
          { name: 'main.glb', artifactPath: '.tau/artifacts/main.glb', mimeType: 'model/gltf-binary', byteLength: 1 },
        ],
      },
    ],
  ] as const)('normalizes an attested Tau MCP %s call to the canonical durable schema', async (tool, args, output) => {
    const messages = await project(
      [
        {
          sessionUpdate: 'tool_call',
          toolCallId: `mcp-${tool}`,
          title: `mcp.tau.${tool}`,
          kind: 'execute',
          status: 'pending',
          rawInput: { server: 'tau', tool, arguments: args },
          _meta: { is_mcp_tool_call: true },
        },
        {
          sessionUpdate: 'tool_call_update',
          toolCallId: `mcp-${tool}`,
          status: 'completed',
          content: [{ type: 'content', content: { type: 'text', text: JSON.stringify(output) } }],
          rawOutput: {
            result: { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output },
            error: null,
          },
        },
      ] as SessionUpdate[],
      'codex',
      undefined,
      'tau',
    );

    expect(messages[0]).toMatchObject({
      role: 'tool-input',
      toolName: tool,
      content: args,
      metadata: { tauInternal: { origin: 'external', agentId: 'codex', presentation: 'tau-mcp' } },
    });
    expect(messages[1]).toMatchObject({ role: 'tool-output', toolName: tool, content: output, isError: false });
    expect((messages[1] as MessageOf<'tool-output'>).call?.content).toBeUndefined();
  });

  it('keeps foreign and unattested same-name MCP calls generic', async () => {
    const call = (server: string): SessionUpdate => ({
      sessionUpdate: 'tool_call',
      toolCallId: `mcp-${server}`,
      title: 'mcp.tau.screenshot',
      kind: 'execute',
      status: 'pending',
      rawInput: { server, tool: 'screenshot', arguments: { targetFile: 'main.ts', mode: 'single' } },
      _meta: { is_mcp_tool_call: true },
    });
    const foreign = await project([call('other')], 'codex', undefined, 'tau');
    const unattested = await project([call('tau')]);

    expect(foreign[0]).toMatchObject({ content: { server: 'other', tool: 'screenshot' } });
    expect(unattested[0]).toMatchObject({ content: { server: 'tau', tool: 'screenshot' } });
    expect(foreign[0]?.metadata?.tauInternal).not.toHaveProperty('presentation');
    expect(unattested[0]?.metadata?.tauInternal).not.toHaveProperty('presentation');
  });

  it('turns a nested MCP tool error into a truthful canonical failure', async () => {
    const messages = await project(
      [
        {
          sessionUpdate: 'tool_call',
          toolCallId: 'mcp-error',
          title: 'mcp.tau.screenshot',
          kind: 'execute',
          status: 'pending',
          rawInput: { server: 'tau', tool: 'screenshot', arguments: { targetFile: 'main.ts', mode: 'single' } },
          _meta: { is_mcp_tool_call: true },
        },
        {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'mcp-error',
          status: 'completed',
          rawOutput: {
            result: { isError: true, content: [{ type: 'text', text: 'RENDER_TIMEOUT: Renderer did not settle.' }] },
            error: null,
          },
        },
      ] as SessionUpdate[],
      'codex',
      undefined,
      'tau',
    );

    expect(messages[1]).toMatchObject({
      role: 'tool-output',
      isError: true,
      content: { errorCode: 'MCP_TOOL_ERROR', message: 'RENDER_TIMEOUT: Renderer did not settle.' },
    });
  });

  it('trusts the terminal ACP status when an adapter omits MCP isError', async () => {
    const messages = await project(
      [
        {
          sessionUpdate: 'tool_call',
          toolCallId: 'mcp-error',
          title: 'mcp.tau.screenshot',
          kind: 'execute',
          status: 'pending',
          rawInput: { server: 'tau', tool: 'screenshot', arguments: { targetFile: 'main.ts', mode: 'single' } },
          _meta: { is_mcp_tool_call: true },
        },
        {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'mcp-error',
          status: 'failed',
          rawOutput: {
            result: { content: [{ type: 'text', text: 'UNKNOWN: Renderer returned no finite bounds.' }] },
            error: null,
          },
        },
      ] as SessionUpdate[],
      'codex',
      undefined,
      'tau',
    );

    expect(messages[1]).toMatchObject({
      role: 'tool-output',
      isError: true,
      content: { errorCode: 'MCP_TOOL_ERROR', message: 'UNKNOWN: Renderer returned no finite bounds.' },
    });
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

  it('replaces tool input with terminal rawInput and final metadata', async () => {
    const appended: ExternalAgentLogEvent[] = [];
    let nextId = 0;
    const projection = createTurnProjection({
      turn: {
        append: async (events) => {
          appended.push(...events);
        },
        approve: async () => ({ interruptId: 'unused', outcome: 'cancelled' }),
        publishLive: async () => undefined,
        signal: new AbortController().signal,
      },
      createId: () => `id-${String(++nextId)}`,
      agentId: 'codex',
    });
    projection.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'edit-final',
      title: 'Editing',
      status: 'pending',
      rawInput: { patch: 'draft' },
    });
    projection.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'edit-final',
      title: '',
      status: 'completed',
      rawInput: { patch: 'final' },
      locations: [],
      content: [],
      _meta: { final: true },
    });
    await projection.flush();

    const replacement = appended.findLast(
      (event): event is Extract<ExternalAgentLogEvent, { type: 'message.envelope-replaced' }> =>
        event.type === 'message.envelope-replaced' && event.replacement.role === 'tool-input',
    );
    expect(replacement?.replacement).toMatchObject({
      role: 'tool-input',
      content: { patch: 'final' },
      call: { title: '', locations: [], content: [], meta: { final: true } },
    });
  });

  it('publishes nonterminal rawOutput as progress on the same tool identity', async () => {
    const live: Array<Record<string, unknown>> = [];
    let nextId = 0;
    const projection = createTurnProjection({
      turn: {
        append: async () => undefined,
        approve: async () => ({ interruptId: 'unused', outcome: 'cancelled' }),
        publishLive: async (event) => {
          live.push(event);
        },
        signal: new AbortController().signal,
      },
      createId: () => `id-${String(++nextId)}`,
      agentId: 'codex',
    });
    projection.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'shell-progress',
      title: 'shell',
      name: 'shell',
      status: 'pending',
      rawInput: { command: 'build' },
    });
    projection.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'shell-progress',
      status: 'in_progress',
      rawOutput: { line: '50%' },
    });
    await projection.flush();

    expect(live).toContainEqual(
      expect.objectContaining({
        type: 'tool-output-update',
        toolCallId: 'id-1',
        toolName: 'shell',
        output: { line: '50%' },
        isError: false,
      }),
    );
  });

  it('projects reasoning as a thinking block, separate from the assistant text', async () => {
    const messages = await project([
      { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'The boss needs ' }, messageId: 'm1' },
      { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: '2mm clearance.' }, messageId: 'm1' },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done.' }, messageId: 'm1' },
    ] as SessionUpdate[]);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toEqual([{ type: 'thinking', thinking: 'The boss needs 2mm clearance.' }]);
    const timing = (messages[0]?.metadata?.['reasoningTimings'] as Array<Record<string, unknown>> | undefined)?.[0];
    expect(timing?.['contentIndex']).toBe(0);
    expect(typeof timing?.['startedAtMs']).toBe('number');
    expect(typeof timing?.['endedAtMs']).toBe('number');
    expect(messages[1]?.content).toEqual([{ type: 'text', text: 'Done.' }]);
  });

  it('keeps named reasoning open across text and tool activity', async () => {
    const { live } = await projectEvents([
      { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Inspecting.' }, messageId: 'm1' },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'I will check it.' }, messageId: 'm2' },
      listFilesCall,
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'list-1',
        status: 'in_progress',
        rawOutput: { formatted_output: 'main.scad' },
      },
      listFilesResult,
      { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Done.' }, messageId: 'm1' },
    ]);

    expect(live.map((event) => event['type'])).toEqual([
      'thinking-start',
      'thinking-delta',
      'text-start',
      'text-delta',
      'tool-output-update',
      'thinking-delta',
      'text-end',
      'thinking-end',
    ]);
    expect(
      new Set(live.filter((event) => event['type'] === 'thinking-start').map((event) => event['messageId'])).size,
    ).toBe(1);
  });

  it('preserves rich ACP assistant content instead of flattening it into text', async () => {
    const messages = await project([
      {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'rich-1',
        content: { type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=', uri: 'tau://capture' },
      },
      {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'rich-1',
        content: { type: 'audio', mimeType: 'audio/wav', data: 'YXVkaW8=' },
      },
      {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'rich-1',
        content: { type: 'resource_link', uri: 'tau://result', name: 'Kernel result', mimeType: 'application/json' },
      },
    ] as SessionUpdate[]);

    expect(messages.map((message) => message.content)).toEqual([
      [{ type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=', uri: 'tau://capture' }],
      [{ type: 'audio', mimeType: 'audio/wav', data: 'YXVkaW8=' }],
      [{ type: 'resource_link', uri: 'tau://result', name: 'Kernel result', mimeType: 'application/json' }],
    ]);
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

  it('retains context and vendor cost when no token report or text exists', async () => {
    const messages = await project([
      { sessionUpdate: 'usage_update', used: 17, size: 100, cost: { amount: 0.02, currency: 'USD' } },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      content: [],
      metadata: {
        tauInternal: {
          vendorContext: { used: 17, size: 100 },
          vendorCost: { amount: 0.02, currency: 'USD', reportedBy: 'codex' },
        },
      },
    });
  });

  it('promotes a qualified Tau MCP identity first supplied by a partial update', async () => {
    const messages = await project(
      [
        { sessionUpdate: 'tool_call', toolCallId: 'late', title: 'Working', status: 'pending', kind: 'execute' },
        {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'late',
          status: 'in_progress',
          rawInput: { server: 'tau', tool: 'get_kernel_result', arguments: { targetFile: 'main.ts' } },
          _meta: { is_mcp_tool_call: true },
        },
        {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'late',
          status: 'completed',
          rawOutput: { result: { structuredContent: { status: 'ready' }, content: [] }, error: null },
        },
      ],
      'codex',
      undefined,
      'tau',
    );

    expect(messages[0]).toMatchObject({
      role: 'tool-input',
      toolName: 'Working',
      call: { nativeName: 'get_kernel_result', status: 'completed' },
    });
    expect(messages[1]).toMatchObject({
      role: 'tool-output',
      toolCallId: 'id-1',
      toolName: 'Working',
      call: { nativeName: 'get_kernel_result', status: 'completed' },
      content: { status: 'ready' },
      metadata: { tauInternal: { presentation: 'tau-mcp' } },
    });
  });

  it.each([false, true])('stores media once and preserves a distinct preview (distinct: %s)', async (distinct) => {
    const payload = 'YXVkaXQtc2NyZWVuc2hvdC1ieXRlcw==';
    const provisional = {
      mimeType: 'image/png',
      data: distinct ? 'distinct_preview' : payload,
      type: 'image',
    } as const;
    const { appended } = await projectEvents(
      [
        {
          sessionUpdate: 'tool_call',
          toolCallId: 'image',
          title: 'Screenshot',
          status: 'pending',
          kind: 'execute',
          rawInput: { server: 'tau', tool: 'screenshot', arguments: { targetFile: 'main.ts', mode: 'single' } },
          _meta: { is_mcp_tool_call: true },
        },
        {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'image',
          status: 'in_progress',
          content: [
            { type: 'content', content: provisional },
            { type: 'content', content: { type: 'text', text: 'distinct progress note' } },
          ],
        },
        {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'image',
          status: 'completed',
          content: [
            { type: 'content', content: { type: 'image', data: payload, mimeType: 'image/png' } },
            { type: 'content', content: { type: 'text', text: 'distinct terminal note' } },
          ],
          rawOutput: {
            result: {
              content: [{ type: 'image', data: payload, mimeType: 'image/png' }],
              structuredContent: { images: [{ view: 'isometric', dataUrl: `data:image/png;base64,${payload}` }] },
            },
            error: null,
          },
        },
      ],
      'codex',
      undefined,
      'tau',
    );
    const serialized = JSON.stringify(appended);

    expect(serialized.split(payload)).toHaveLength(2);
    if (distinct) {
      expect(serialized.split('distinct_preview')).toHaveLength(2);
    }
    expect(serialized).toContain('distinct progress note');
    expect(serialized).toContain('distinct terminal note');
  });

  it.each(['interrupted', 'invalid-result'] as const)('retains preview media after %s', async (outcome) => {
    const image = { type: 'content', content: { type: 'image', mimeType: 'image/png', data: 'cHJldmlldw==' } } as const;
    const messages = await project(
      [
        {
          sessionUpdate: 'tool_call',
          toolCallId: 'image',
          title: 'Screenshot',
          kind: 'execute',
          status: 'in_progress',
          rawInput: { server: 'tau', tool: 'screenshot', arguments: { targetFile: 'main.ts', mode: 'single' } },
          _meta: { is_mcp_tool_call: true },
          content: [image],
        },
        ...(outcome === 'invalid-result'
          ? [
              {
                sessionUpdate: 'tool_call_update',
                toolCallId: 'image',
                status: 'completed',
                rawOutput: { result: { content: [image.content], structuredContent: { images: [] } } },
              } as const,
            ]
          : []),
      ],
      'codex',
      undefined,
      'tau',
    );
    expect(messages.find((message) => message.role === 'tool-input')?.call?.content).toContainEqual(image);
    expect(messages.filter((message) => message.role === 'tool-output')).toHaveLength(
      outcome === 'interrupted' ? 0 : 1,
    );
  });

  it('keeps one live segment when a stable message id resumes after a boundary', async () => {
    const { live } = await projectEvents([
      { sessionUpdate: 'agent_message_chunk', messageId: 'same', content: { type: 'text', text: 'Before ' } },
      { sessionUpdate: 'plan', entries: [{ content: 'Inspect', priority: 'medium', status: 'in_progress' }] },
      { sessionUpdate: 'agent_message_chunk', messageId: 'same', content: { type: 'text', text: 'after' } },
    ]);
    const types = live.filter((event) => event['messageId'] === 'id-1').map((event) => event['type']);

    expect(types).toEqual(['text-start', 'text-delta', 'text-delta', 'text-end']);
  });

  it('keeps interleaved stable text ids as two resumable UI parts', async () => {
    const { live } = await projectEvents([
      { sessionUpdate: 'agent_message_chunk', messageId: 'first', content: { type: 'text', text: 'Before ' } },
      { sessionUpdate: 'agent_message_chunk', messageId: 'second', content: { type: 'text', text: 'aside' } },
      { sessionUpdate: 'agent_message_chunk', messageId: 'first', content: { type: 'text', text: 'after' } },
    ]);

    expect(live.map((event) => [event['messageId'], event['type']])).toEqual([
      ['id-1', 'text-start'],
      ['id-1', 'text-delta'],
      ['id-2', 'text-start'],
      ['id-2', 'text-delta'],
      ['id-1', 'text-delta'],
      ['id-2', 'text-end'],
      ['id-1', 'text-end'],
    ]);
  });

  it('retains interleaved reasoning identities across a tool call until the turn ends', async () => {
    const { live } = await projectEvents([
      { sessionUpdate: 'agent_thought_chunk', messageId: 'first', content: { type: 'text', text: 'Inspect ' } },
      { sessionUpdate: 'agent_thought_chunk', messageId: 'second', content: { type: 'text', text: 'compare' } },
      { sessionUpdate: 'agent_thought_chunk', messageId: 'first', content: { type: 'text', text: 'source' } },
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'inspect',
        title: 'Inspect source',
        status: 'completed',
        rawInput: { path: 'main.py' },
        rawOutput: { formatted_output: 'source', exit_code: 0 },
      },
    ]);

    expect(
      live
        .filter((event) => typeof event['type'] === 'string' && event['type'].startsWith('thinking-'))
        .map((event) => [event['messageId'], event['type']]),
    ).toEqual([
      ['id-1', 'thinking-start'],
      ['id-1', 'thinking-delta'],
      ['id-2', 'thinking-start'],
      ['id-2', 'thinking-delta'],
      ['id-1', 'thinking-delta'],
      ['id-2', 'thinking-end'],
      ['id-1', 'thinking-end'],
    ]);
  });

  it('replaces one durable ACP session record as plans and commands change', async () => {
    const appended: ExternalAgentLogEvent[] = [];
    const turn: AcpPromptTurn = {
      append: async (events) => {
        appended.push(...events);
      },
      approve: async () => ({ interruptId: 'unused', outcome: 'cancelled' }),
      publishLive: async () => undefined,
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

    expect(appended).toHaveLength(4);
    expect(appended.at(-1)).toMatchObject({
      type: 'message.envelope-replaced',
      messageId: 'id-1',
      replacement: {
        id: 'id-1',
        role: 'assistant',
        content: [
          {
            type: 'acp-session',
            agentId: 'codex',
            commands: [{ name: 'compact', description: 'Compact' }],
            title: 'Fixture session',
          },
        ],
      },
    });
    expect(JSON.stringify(appended.at(-1))).not.toContain('write hello.txt');
    expect(projection.title).toBe('Fixture session');
  });
});

describe('ACP usage durability', () => {
  it('does not advance the cumulative baseline when its usage record was not stored', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-usage-durability-'));
    const adapter: AcpAdapter = {
      id: 'codex',
      package: 'fixture',
      version: '0.0.0',
      configEnv: [],
      displayName: 'Codex',
      modulePath: new URL('fixtures/fake-agent.ts', import.meta.url).pathname,
    };
    const session = await openAcpSession({ adapter, cwd, createId: randomUUID });
    const firstTurn: AcpPromptTurn = {
      ...stubTurn(),
      append: async (events) => {
        if (
          events.some(
            (event) =>
              event.type === 'message.appended' &&
              event.message.role === 'assistant' &&
              event.message.metadata?.usage !== undefined,
          )
        ) {
          throw new Error('durable append failed');
        }
      },
    };
    const appended: ExternalAgentLogEvent[] = [];

    try {
      await expect(session.prompt('first noask', firstTurn)).rejects.toThrow('durable append failed');
      await session.prompt('second noask', stubTurn(appended));

      expect(
        appended.find(
          (event) =>
            event.type === 'message.appended' &&
            event.message.role === 'assistant' &&
            event.message.metadata?.usage !== undefined,
        ),
      ).toMatchObject({ message: { metadata: { usage: { totalTokens: 3000 } } } });
    } finally {
      await session.close();
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('ACP permission choices', () => {
  const options = [
    { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'session', name: 'Allow for session', kind: 'allow_always' },
    { optionId: 'deny', name: 'Deny once', kind: 'reject_once' },
  ] as const;

  it('preserves an exact compatible option and never guesses for a stale explicit id', () => {
    expect(chooseOption(options, { outcome: 'approved', optionId: 'session' })).toBe('session');
    expect(chooseOption(options, { outcome: 'approved', optionId: 'stale' })).toBeUndefined();
  });

  it('allows an outcome-only decision to select only a once-scoped option', () => {
    expect(chooseOption(options, { outcome: 'approved' })).toBe('once');
    expect(chooseOption([options[1]], { outcome: 'approved' })).toBeUndefined();
    expect(chooseOption([options[1]], { outcome: 'denied' })).toBeUndefined();
  });
});
