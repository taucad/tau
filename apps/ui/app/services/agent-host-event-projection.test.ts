import { describe, expect, it } from 'vitest';
import { parseLogEvent } from '@taucad/agent-host';
import type { AgentLiveEvent, AgentLogEvent } from '@taucad/agent-host';
import type { MyUIMessage } from '@taucad/chat';
import { readUIMessageStream } from 'ai';
import type { ReasoningUIPart, UIMessageChunk } from 'ai';
import { isRecord } from '@taucad/utils/schema';
import {
  agentApprovalToolName,
  projectAgentHostEvent,
  projectAgentHostLiveEvent,
  projectAgentHostUserTurn,
  projectTurnFinalized,
  latestAcpSessionData,
} from '#services/agent-host-event-projection.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';
import hexagonalNutLog from '#services/__fixtures__/daemon-reattach-hexnut.jsonl?raw';
import hexagonalNutFourRunLog from '#services/__fixtures__/daemon-reattach-hexnut-4runs.jsonl?raw';

const base = {
  version: 1,
  leaderEpoch: 'leader-1',
  sequence: 1,
  recordedAt: '2026-09-01T00:00:00.000Z',
  runId: 'run-1',
} as const;

it('should keep external reasoning open across an interleaved tool result', async () => {
  const blocks = new Map();
  const live = { chatId: 'chat', runId: base.runId, messageId: 'thought', contentIndex: 0 };
  const chunks: UIMessageChunk[] = [
    ...projectAgentHostLiveEvent({ ...live, type: 'thinking-start' }, blocks),
    ...projectAgentHostLiveEvent({ ...live, type: 'thinking-delta', delta: 'checking' }, blocks),
    ...projectAgentHostEvent(
      {
        ...base,
        type: 'message.appended',
        message: {
          id: 'input',
          role: 'tool-input',
          toolCallId: 'call',
          toolName: 'read',
          content: {},
          metadata: { tauInternal: { origin: 'external' } },
        },
      },
      blocks,
    ),
    ...projectAgentHostEvent(
      {
        ...base,
        type: 'message.appended',
        message: {
          id: 'output',
          role: 'tool-output',
          toolCallId: 'call',
          toolName: 'read',
          isError: false,
          content: 'done',
          metadata: { tauInternal: { origin: 'external' } },
        },
      },
      blocks,
    ),
    ...projectAgentHostLiveEvent({ ...live, type: 'thinking-delta', delta: ' complete' }, blocks),
    ...projectAgentHostLiveEvent({ ...live, type: 'thinking-end', content: 'checking complete' }, blocks),
  ];
  const errors: unknown[] = [];
  let parts: MyUIMessage['parts'] = [];
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  for await (const message of readUIMessageStream<MyUIMessage>({
    stream,
    onError: (error) => {
      errors.push(error);
    },
  })) {
    parts = message.parts;
  }
  expect(errors).toEqual([]);
  expect(parts.filter((part) => part.type === 'reasoning').map((part) => part.text)).toEqual(['checking complete']);
});

it.each(['text', 'thinking'] as const)(
  'should reconcile %s checkpoints and live frames in either delivery order',
  async (kind) => {
    const identity = { chatId: 'chat', runId: base.runId, messageId: 'block', contentIndex: 0 };
    const live: AgentLiveEvent[] = [
      { ...identity, type: kind === 'text' ? 'text-start' : 'thinking-start' },
      { ...identity, type: kind === 'text' ? 'text-delta' : 'thinking-delta', delta: 'hello', offset: 0 },
      { ...identity, type: kind === 'text' ? 'text-delta' : 'thinking-delta', delta: ' world', offset: 5 },
      { ...identity, type: kind === 'text' ? 'text-end' : 'thinking-end', content: 'hello world' },
    ];
    const durable = (text: string, final = false): AgentLogEvent => ({
      ...base,
      type: 'message.appended',
      message: {
        id: 'block',
        role: 'assistant',
        content: [kind === 'text' ? { type: 'text', text } : { type: 'thinking', thinking: text }],
        metadata: { tauInternal: { origin: 'external', streamState: final ? 'final' : 'checkpoint' } },
      },
    });
    // The daemon delivers durable and live frames on independent subscriptions.
    for (const events of [
      [live[0], durable('hello'), live[1], live[2], durable('hello world', true), live[3]],
      [live[0], live[1], live[2], durable('hello'), durable('hello world', true), live[3]],
      [durable('hello world', true), ...live],
      [...live, durable('hello world', true), durable('hello world', true)],
    ]) {
      const blocks = new Map();
      const chunks = events.flatMap((event) => {
        if (!event) {
          throw new Error('Missing fixture frame');
        }
        return 'leaderEpoch' in event ? projectAgentHostEvent(event, blocks) : projectAgentHostLiveEvent(event, blocks);
      });
      const errors: unknown[] = [];
      let parts: MyUIMessage['parts'] = [];
      const stream = new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
      // oxlint-disable-next-line no-await-in-loop -- consume each independent arrival-order fixture to its terminal SDK state.
      for await (const message of readUIMessageStream<MyUIMessage>({
        stream,
        onError: (error) => errors.push(error),
      })) {
        parts = message.parts;
      }
      expect(errors).toEqual([]);
      const text = parts.flatMap((part) =>
        (part.type === 'text' && kind === 'text') || (part.type === 'reasoning' && kind === 'thinking')
          ? [part.text]
          : [],
      );
      expect(text).toEqual(['hello world']);
    }
  },
);

describe('projectAgentHostEvent', () => {
  it('reconstructs the durable user turn from append and history-commit events', () => {
    const message = {
      id: 'user-durable',
      role: 'user',
      content: [
        { type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' },
        { type: 'text', text: 'Build it.' },
      ],
    } as const;
    const expected = {
      id: 'user-durable',
      role: 'user',
      parts: [
        { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,aW1hZ2U=' },
        { type: 'text', text: 'Build it.' },
      ],
      metadata: { status: 'success', createdAt: 1_788_220_800_000 },
    };

    expect(projectAgentHostUserTurn({ ...base, type: 'message.appended', message })).toEqual(expected);
    expect(
      projectAgentHostUserTurn({
        ...base,
        type: 'turn.history-projection-committed',
        retainedMessageIds: [],
        message,
        context: { version: 1, systemPrompt: 'system', initialMessages: [], postCompactionMessages: [] },
      }),
    ).toEqual(expected);
  });

  it('streams each block once and lets its matching durable message close it without replay', () => {
    const streamedBlocks = new Map();
    const live = {
      type: 'text-delta',
      chatId: 'chat-1',
      runId: 'run-1',
      messageId: 'assistant-live',
      contentIndex: 0,
      delta: 'Browser host started',
    } satisfies AgentLiveEvent;

    expect(projectAgentHostLiveEvent(live, streamedBlocks)).toEqual([
      { type: 'text-start', id: 'assistant-live:text:0' },
      { type: 'text-delta', id: 'assistant-live:text:0', delta: 'Browser host started' },
    ]);
    expect(projectAgentHostLiveEvent({ ...live, delta: ' the change.' }, streamedBlocks)).toEqual([
      { type: 'text-delta', id: 'assistant-live:text:0', delta: ' the change.' },
    ]);
    const thinking = { ...live, type: 'thinking-delta', contentIndex: 1, delta: 'Inspecting' } satisfies AgentLiveEvent;
    expect(projectAgentHostLiveEvent(thinking, streamedBlocks)).toEqual([
      { type: 'reasoning-start', id: 'assistant-live:thinking:1' },
      { type: 'reasoning-delta', id: 'assistant-live:thinking:1', delta: 'Inspecting' },
    ]);
    expect(projectAgentHostLiveEvent({ ...thinking, delta: ' the workspace.' }, streamedBlocks)).toEqual([
      { type: 'reasoning-delta', id: 'assistant-live:thinking:1', delta: ' the workspace.' },
    ]);

    expect(
      projectAgentHostEvent(
        {
          ...base,
          type: 'message.appended',
          message: {
            id: 'assistant-live',
            role: 'assistant',
            content: [
              { type: 'text', text: 'Browser host started the change.' },
              { type: 'thinking', thinking: 'Inspecting the workspace.' },
            ],
          },
        },
        streamedBlocks,
      ),
    ).toEqual([
      { type: 'text-end', id: 'assistant-live:text:0' },
      { type: 'reasoning-end', id: 'assistant-live:thinking:1' },
      { type: 'finish-step' },
    ]);
    expect([...streamedBlocks.values()]).toEqual([
      { type: 'text', content: 'Browser host started the change.', closed: true },
      { type: 'thinking', content: 'Inspecting the workspace.', closed: true },
    ]);
  });

  it('keeps an ACP checkpoint open and continues one block after an unseen prefix', () => {
    const streamedBlocks = new Map();
    const checkpoint = {
      ...base,
      type: 'message.appended',
      message: {
        id: 'assistant-acp',
        role: 'assistant',
        content: [{ type: 'text', text: 'prefix ' }],
        metadata: { tauInternal: { origin: 'external', agentId: 'codex', streamState: 'checkpoint' } },
      },
    } as const satisfies AgentLogEvent;

    expect(projectAgentHostEvent(checkpoint, streamedBlocks)).toEqual([
      { type: 'text-start', id: 'assistant-acp:text:0' },
      { type: 'text-delta', id: 'assistant-acp:text:0', delta: 'prefix ' },
    ]);
    expect(
      projectAgentHostLiveEvent(
        {
          type: 'text-delta',
          chatId: 'chat-1',
          runId: 'run-1',
          messageId: 'assistant-acp',
          contentIndex: 0,
          delta: 'suffix',
        },
        streamedBlocks,
      ),
    ).toEqual([{ type: 'text-delta', id: 'assistant-acp:text:0', delta: 'suffix' }]);
  });

  it('projects explicit reasoning, text, and partial tool lifecycle events', () => {
    const streamedBlocks = new Map();
    const event = {
      chatId: 'chat-1',
      runId: 'run-1',
      messageId: 'assistant-live',
      contentIndex: 0,
    } as const;

    expect(
      [
        { ...event, type: 'thinking-start', timestamp: 100 },
        { ...event, type: 'thinking-delta', delta: 'Inspecting' },
        { ...event, type: 'thinking-end', content: 'Inspecting.', timestamp: 2100 },
        {
          ...event,
          type: 'tool-input-start',
          contentIndex: 1,
          toolCallId: 'call-live',
          toolName: 'read_file',
        },
        {
          ...event,
          type: 'tool-input-delta',
          contentIndex: 1,
          toolCallId: 'call-live',
          toolName: 'read_file',
          delta: '{"target',
        },
        {
          ...event,
          type: 'tool-input-end',
          contentIndex: 1,
          toolCallId: 'call-live',
          toolName: 'read_file',
          input: { targetFile: 'main.ts' },
        },
        {
          ...event,
          type: 'tool-output-update',
          contentIndex: 1,
          toolCallId: 'call-live',
          toolName: 'read_file',
          output: { progress: 0.5 },
          isError: false,
        },
      ].flatMap((live) => projectAgentHostLiveEvent(live as AgentLiveEvent, streamedBlocks)),
    ).toEqual([
      {
        type: 'reasoning-start',
        id: 'assistant-live:thinking:0',
        providerMetadata: { common: { reasoningStartedAtMs: 100 } },
      },
      { type: 'reasoning-delta', id: 'assistant-live:thinking:0', delta: 'Inspecting' },
      { type: 'reasoning-delta', id: 'assistant-live:thinking:0', delta: '.' },
      {
        type: 'reasoning-end',
        id: 'assistant-live:thinking:0',
        providerMetadata: { common: { reasoningStartedAtMs: 100, reasoningEndedAtMs: 2100 } },
      },
      { type: 'tool-input-start', toolCallId: 'call-live', toolName: 'read_file' },
      { type: 'tool-input-delta', toolCallId: 'call-live', inputTextDelta: '{"target' },
      {
        type: 'tool-input-available',
        toolCallId: 'call-live',
        toolName: 'read_file',
        input: { targetFile: 'main.ts' },
      },
      { type: 'tool-output-available', toolCallId: 'call-live', output: { progress: 0.5 }, preliminary: true },
    ]);
  });

  it('retains both reasoning timestamps through the AI SDK reducer', async () => {
    const streamedBlocks = new Map();
    const identity = {
      chatId: 'chat-1',
      runId: 'run-1',
      messageId: 'assistant-live',
      contentIndex: 0,
    } as const;
    const chunks = [
      ...projectAgentHostLiveEvent({ ...identity, type: 'thinking-start', timestamp: 100 }, streamedBlocks),
      ...projectAgentHostLiveEvent({ ...identity, type: 'thinking-delta', delta: 'Inspecting' }, streamedBlocks),
      ...projectAgentHostLiveEvent(
        { ...identity, type: 'thinking-end', content: 'Inspecting.', timestamp: 2100 },
        streamedBlocks,
      ),
    ];
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
    let part: ReasoningUIPart | undefined;
    for await (const message of readUIMessageStream<MyUIMessage>({ stream })) {
      part = message.parts.find((candidate): candidate is ReasoningUIPart => candidate.type === 'reasoning');
    }

    expect(part).toEqual({
      type: 'reasoning',
      text: 'Inspecting.',
      state: 'done',
      providerMetadata: { common: { reasoningStartedAtMs: 100, reasoningEndedAtMs: 2100 } },
    });
  });

  it('projects rich external assistant content through native file and source parts', () => {
    const message = {
      id: 'assistant-rich',
      role: 'assistant',
      content: [
        { type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' },
        { type: 'audio', mimeType: 'audio/wav', data: 'YXVkaW8=' },
        { type: 'resource_link', uri: 'tau://result', name: 'Kernel result' },
        {
          type: 'resource',
          resource: { uri: 'tau://report', mimeType: 'text/markdown', text: '# Report' },
        },
      ],
    } as const;

    expect(projectAgentHostEvent({ ...base, type: 'message.appended', message })).toEqual([
      { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,aW1hZ2U=' },
      { type: 'file', mediaType: 'audio/wav', url: 'data:audio/wav;base64,YXVkaW8=' },
      { type: 'source-url', sourceId: 'assistant-rich:source:2', url: 'tau://result', title: 'Kernel result' },
      {
        type: 'source-document',
        sourceId: 'assistant-rich:source:3',
        mediaType: 'text/markdown',
        title: 'tau://report',
        filename: 'tau://report',
      },
      { type: 'finish-step' },
    ]);
  });

  it('projects text, thinking, usage, and tool calls from an assistant message', () => {
    const chunks = projectAgentHostEvent({
      ...base,
      type: 'message.appended',
      message: {
        id: 'assistant-1',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Inspecting the model.' },
          { type: 'text', text: 'I updated the model.' },
          { type: 'toolCall', id: 'call-1', name: 'create_file', arguments: { targetFile: 'proof.txt' } },
        ],
        metadata: {
          model: 'openai-gpt-5.5',
          usage: {
            input: 12,
            output: 7,
            cacheRead: 3,
            cacheWrite: 2,
            totalTokens: 24,
            cost: { input: 0.12, output: 0.07, cacheRead: 0.03, cacheWrite: 0.02, total: 0.24 },
          },
          stopReason: 'toolUse',
          tauInternal: { kind: 'billing-invocation', attemptId: 'att_1', operationId: 'op_1', status: 'terminal' },
        },
      },
    });

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-end',
      'data-usage',
    ]);
    expect(chunks).toContainEqual({
      type: 'reasoning-delta',
      id: 'assistant-1:thinking:0',
      delta: 'Inspecting the model.',
    });
    expect(chunks).toContainEqual({ type: 'text-delta', id: 'assistant-1:text:1', delta: 'I updated the model.' });
    expect(chunks).toContainEqual({
      type: 'data-usage',
      id: 'assistant-1:usage',
      data: {
        type: 'usage',
        id: 'assistant-1:usage',
        model: 'openai-gpt-5.5',
        inputTokens: 12,
        outputTokens: 7,
        cacheReadTokens: 3,
        cacheWriteTokens: 2,
        operationId: 'op_1',
        attemptId: 'att_1',
        billingStatus: 'terminal',
      },
    });
  });

  it('projects the latest ACP session presentation as a typed data part without a false step boundary', () => {
    const chunks = projectAgentHostEvent({
      ...base,
      type: 'message.appended',
      message: {
        id: 'acp-session-1',
        role: 'assistant',
        content: [
          {
            type: 'acp-session',
            agentId: 'codex',
            sessionId: 'vendor-session-1',
            commands: [{ name: '$brep-design', description: 'Design native BRep geometry' }],
            configOptions: [],
            plan: {
              type: 'items',
              planId: 'plan-1',
              entries: [{ content: 'Inspect the model', priority: 'high', status: 'in_progress' }],
            },
          },
        ],
      },
    });

    expect(chunks).toEqual([
      {
        type: 'data-acp-session',
        id: 'acp-session-1:acp-session:0',
        data: {
          type: 'acp-session',
          id: 'acp-session-1:acp-session:0',
          agentId: 'codex',
          sessionId: 'vendor-session-1',
          commands: [{ name: '$brep-design', description: 'Design native BRep geometry' }],
          configOptions: [],
          plan: {
            type: 'items',
            planId: 'plan-1',
            entries: [{ content: 'Inspect the model', priority: 'high', status: 'in_progress' }],
          },
        },
      },
    ]);
  });

  it('projects one complete tool interaction in stream order', () => {
    const events: readonly AgentLogEvent[] = [
      { ...base, type: 'run.lifecycle', state: 'running' },
      {
        ...base,
        type: 'message.appended',
        message: {
          id: 'assistant-tool-1',
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will create it.' },
            { type: 'toolCall', id: 'call-1', name: 'create_file', arguments: { targetFile: 'proof.txt' } },
          ],
        },
      },
      {
        ...base,
        type: 'message.appended',
        message: {
          id: 'input-1',
          role: 'tool-input',
          toolCallId: 'call-1',
          toolName: 'create_file',
          content: { targetFile: 'proof.txt', content: 'browser host' },
        },
      },
      {
        ...base,
        type: 'message.appended',
        message: {
          id: 'output-1',
          role: 'tool-output',
          toolCallId: 'call-1',
          toolName: 'create_file',
          content: { success: true },
          isError: false,
        },
      },
      {
        ...base,
        type: 'message.appended',
        message: { id: 'assistant-final', role: 'assistant', content: 'Done.' },
      },
      { ...base, type: 'run.lifecycle', state: 'completed' },
    ];

    expect(events.flatMap((event) => projectAgentHostEvent(event)).map((chunk) => chunk.type)).toEqual([
      'start-step',
      'text-start',
      'text-delta',
      'text-end',
      'tool-input-available',
      'tool-output-available',
      'finish-step',
      'start-step',
      'text-start',
      'text-delta',
      'text-end',
      'finish-step',
      'finish',
    ]);
  });

  it('projects a replaced tool envelope onto the existing part identity', () => {
    expect(
      projectAgentHostEvent({
        ...base,
        type: 'message.envelope-replaced',
        messageId: 'input-1',
        replacement: {
          id: 'input-1',
          role: 'tool-input',
          toolCallId: 'call-1',
          toolName: 'applyPatch',
          content: { patch: 'updated' },
          call: { toolCallId: 'vendor-1', status: 'in_progress', title: 'Editing main.ts' },
          metadata: { tauInternal: { kind: 'external-tool', origin: 'external', agentId: 'codex' } },
        },
      }),
    ).toEqual([
      {
        type: 'tool-input-available',
        toolCallId: 'call-1',
        toolName: 'applyPatch',
        input: { patch: 'updated' },
        dynamic: true,
        title: 'Editing main.ts',
        toolMetadata: {
          tau: { toolCallId: 'vendor-1', title: 'Editing main.ts', origin: 'external', agentId: 'codex' },
        },
      },
    ]);
  });

  it('projects tool errors', () => {
    expect(
      projectAgentHostEvent({
        ...base,
        type: 'message.appended',
        message: {
          id: 'output-2',
          role: 'tool-output',
          toolCallId: 'call-2',
          toolName: 'create_file',
          content: { message: 'write failed' },
          isError: true,
        },
      }),
    ).toEqual([
      { type: 'tool-output-error', toolCallId: 'call-2', errorText: 'write failed' },
      { type: 'finish-step' },
      { type: 'start-step' },
    ]);
  });

  it('opens a self-contained approval part carrying the options the host recorded', () => {
    expect(
      projectAgentHostEvent({
        ...base,
        type: 'interrupt.recorded',
        interruptId: 'approval-1',
        phase: 'requested',
        reason: 'write hello.txt',
        payload: {
          kind: 'approval',
          prompt: 'write hello.txt',
          context: {
            toolCall: { toolCallId: 'write-1', title: 'write hello.txt' },
            options: [
              { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
              { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
            ],
          },
        },
      }),
    ).toEqual([
      {
        type: 'tool-input-available',
        toolCallId: 'approval-1',
        toolName: agentApprovalToolName,
        dynamic: true,
        input: {
          interruptId: 'approval-1',
          kind: 'approval',
          prompt: 'write hello.txt',
          options: [
            { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
            { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
          ],
        },
      },
      { type: 'tool-approval-request', approvalId: 'approval-1', toolCallId: 'approval-1' },
    ]);
  });

  it('projects a login an external agent is waiting on as facts, not a decision', () => {
    expect(
      projectAgentHostEvent({
        ...base,
        type: 'interrupt.recorded',
        interruptId: 'login-1',
        phase: 'requested',
        reason: 'Open the verification page and enter FAKE-CODE.',
        payload: {
          kind: 'external-agent-login',
          agentId: 'codex',
          authMethods: [{ id: 'codex-login', name: 'Log in with Codex', terminalCommand: 'codex login' }],
          url: 'https://example.invalid/device',
          code: 'FAKE-CODE',
        },
      })[0],
    ).toMatchObject({
      type: 'tool-input-available',
      input: {
        interruptId: 'login-1',
        prompt: 'Open the verification page and enter FAKE-CODE.',
        options: [],
        login: {
          agentId: 'codex',
          methods: [{ id: 'codex-login', name: 'Log in with Codex', terminalCommand: 'codex login' }],
          url: 'https://example.invalid/device',
          code: 'FAKE-CODE',
        },
      },
    });
  });

  it('falls back to the durable reason when a host records no structured payload', () => {
    expect(
      projectAgentHostEvent({
        ...base,
        type: 'interrupt.recorded',
        interruptId: 'approval-2',
        phase: 'requested',
        reason: 'Write main.scad?',
      }),
    ).toEqual([
      {
        type: 'tool-input-available',
        toolCallId: 'approval-2',
        toolName: agentApprovalToolName,
        dynamic: true,
        input: { interruptId: 'approval-2', kind: 'approval', prompt: 'Write main.scad?', options: [] },
      },
      { type: 'tool-approval-request', approvalId: 'approval-2', toolCallId: 'approval-2' },
    ]);
  });

  it('replays a resolved approval as open-then-settle, so a reload leaves nothing pending', () => {
    const interrupt = { type: 'interrupt.recorded', interruptId: 'approval-3' } as const;
    const replayed = [
      ...projectAgentHostEvent({ ...base, ...interrupt, phase: 'requested', reason: 'Write main.scad?' }),
      ...projectAgentHostEvent({ ...base, ...interrupt, phase: 'resolved', reason: 'approved' }),
    ];

    expect(replayed.map((chunk) => chunk.type)).toEqual([
      'tool-input-available',
      'tool-approval-request',
      'tool-output-available',
    ]);
  });

  it.each([['approved'], ['denied'], ['cancelled']] as const)('settles a %s approval from the log', (outcome) => {
    expect(
      projectAgentHostEvent({
        ...base,
        type: 'interrupt.recorded',
        interruptId: 'approval-1',
        phase: 'resolved',
        reason: outcome,
        payload: { outcome },
      }),
    ).toEqual([{ type: 'tool-output-available', toolCallId: 'approval-1', output: { outcome } }]);
  });

  it.each([
    [
      'admitted',
      [{ type: 'start', messageId: 'run-1', messageMetadata: { createdAt: 1_788_220_800_000, status: 'pending' } }],
    ],
    ['running', [{ type: 'start-step' }]],
    ['paused', [{ type: 'finish-step' }]],
    ['completed', [{ type: 'finish', finishReason: 'stop', messageMetadata: { status: 'success' } }]],
    ['failed', [{ type: 'error', errorText: 'gateway refused' }]],
    ['cancelled', [{ type: 'abort', reason: 'cancelled' }]],
  ] as const)('projects the %s lifecycle', (state, expected) => {
    expect(
      projectAgentHostEvent({
        ...base,
        type: 'run.lifecycle',
        state,
        ...(state === 'failed' ? { detail: { message: 'gateway refused' } } : {}),
      }),
    ).toEqual(expected);
  });

  it.each([
    {
      code: 'FUNDED_OPERATION_LIMIT',
      status: 429,
      message: 'The funded-operation failsafe is active.',
      category: 'rate_limit',
    },
    {
      code: 'BILLING_RECOVERY_UNAVAILABLE',
      status: 503,
      message: 'Tau is finalizing earlier funded work.',
      category: 'overloaded',
    },
    {
      code: 'PROVIDER_UNAVAILABLE',
      status: 503,
      message: 'The model provider is unavailable.',
      category: 'overloaded',
    },
  ] as const)('projects typed $code failure as a persistent ChatError', ({ code, status, message, category }) => {
    const [chunk] = projectAgentHostEvent({
      ...base,
      type: 'run.lifecycle',
      state: 'failed',
      detail: { code, message, status },
    });
    if (chunk?.type !== 'error') {
      throw new Error('Expected an error projection');
    }
    expect(JSON.parse(chunk.errorText)).toEqual({
      category,
      title: category === 'rate_limit' ? 'Rate Limit Exceeded' : 'Service Temporarily Unavailable',
      message,
      code,
      httpStatus: status,
    });
  });

  it('carries a credit denial shortfall through to the persisted ChatError', () => {
    const details = {
      requiredCreditAtoms: '4244000',
      availableCreditAtoms: '300000',
      routeId: 'anthropic-claude-astra-5',
    };
    const [chunk] = projectAgentHostEvent({
      ...base,
      type: 'run.lifecycle',
      state: 'failed',
      detail: {
        code: 'INSUFFICIENT_CREDIT',
        status: 402,
        message: 'Insufficient Tau credit for this model request.',
        details,
      },
    });
    if (chunk?.type !== 'error') {
      throw new Error('Expected an error projection');
    }
    expect(JSON.parse(chunk.errorText)).toEqual({
      category: 'credits',
      title: 'Credit Limit Reached',
      message: 'Insufficient Tau credit for this model request.',
      code: 'INSUFFICIENT_CREDIT',
      httpStatus: 402,
      details,
    });
    expect(parseErrorForPersistence(new Error(chunk.errorText))).toMatchObject({
      category: 'credits',
      code: 'INSUFFICIENT_CREDIT',
      httpStatus: 402,
      details,
    });
  });

  it('falls back to the generic host failure only when the run recorded no reason', () => {
    expect(projectAgentHostEvent({ ...base, type: 'run.lifecycle', state: 'failed' })).toEqual([
      { type: 'error', errorText: 'Browser agent host failed.' },
    ]);
  });

  it('handles every durable event type and projects unknown ones to nothing', () => {
    const events = [
      {
        ...base,
        type: 'message.appended',
        message: { id: 'user-1', role: 'user', content: 'Build it.' },
      },
      {
        ...base,
        type: 'message.envelope-replaced',
        messageId: 'user-1',
        replacement: { id: 'user-1', role: 'user', content: 'Build it safely.' },
      },
      {
        ...base,
        type: 'history.rewound',
        trigger: 'retry',
        retainedMessageIds: ['user-1'],
      },
      {
        ...base,
        type: 'history.compacted',
        evictedMessageIds: ['user-1'],
        summary: { id: 'summary-1', role: 'user', content: 'Prior context.' },
      },
      { ...base, type: 'snapshot-context.refreshed', messageId: 'snapshot-1', content: 'new snapshot' },
      {
        ...base,
        type: 'safeguard.recorded',
        safeguardId: 'safe-1',
        action: 'terminate',
        reason: 'limit reached',
      },
      {
        ...base,
        type: 'interrupt.recorded',
        interruptId: 'interrupt-1',
        phase: 'requested',
        reason: 'approval needed',
      },
      { ...base, type: 'run.lifecycle', state: 'running' },
      {
        ...base,
        type: 'turn.history-projection-committed',
        retainedMessageIds: [],
        message: { id: 'turn-1', role: 'user', content: 'Build it.' },
        context: { version: 1, systemPrompt: 'system', initialMessages: [], postCompactionMessages: [] },
      },
    ] satisfies readonly AgentLogEvent[];

    const projected = events.map((event) => projectAgentHostEvent(event));
    expect(projected).toHaveLength(9);
    expect(projected[1]).toEqual([]);
    expect(projectAgentHostEvent({ ...base, type: 'future.event' } as unknown as AgentLogEvent)).toEqual([]);
  });

  /*
   * FIX-REATTACH-DUP: a reattached rung-2 transcript rendered every assistant
   * turn twice. The projection is not where that happened — replaying the
   * daemon's own log from cursor 0 emits each durable text block once, under an
   * id derived from the message id the log carries. The second copy came from
   * the AI SDK continuing the trailing assistant message on a resume (see
   * `browser-agent-host-transport.ts`, `registerAgentHostRunReset`); this pins
   * the layer it did *not* come from, on the real log.
   */
  it('projects each assistant text of a real daemon log exactly once from cursor 0', () => {
    const events = hexagonalNutLog
      .trim()
      .split('\n')
      .map((line) => parseLogEvent(JSON.parse(line)));
    const chunks = events.flatMap((event) => [...projectAgentHostEvent(event)]);
    const durableTexts = events.flatMap((event) =>
      event.type === 'message.appended' && event.message.role === 'assistant' && Array.isArray(event.message.content)
        ? event.message.content.flatMap((value) =>
            isRecord(value) && value['type'] === 'text' && typeof value['text'] === 'string' ? [value['text']] : [],
          )
        : [],
    );
    const openings = chunks.flatMap((chunk) => (chunk.type === 'text-start' ? [chunk.id] : []));

    expect(events).toHaveLength(92);
    expect(durableTexts).toHaveLength(20);
    expect(chunks.flatMap((chunk) => (chunk.type === 'text-delta' ? [chunk.delta] : []))).toEqual(durableTexts);
    // Each block opens under its own message's id, so no two can collide.
    expect(new Set(openings).size).toBe(openings.length);
  });

  /*
   * `text` is a *content-block* discriminator, never an event type. Counting
   * `"type":"..."` across a log's raw JSON mixes the two and reads as though the
   * log carried `text` events beside `message.appended` — the four-run log's 47
   * `text` occurrences are 29 assistant blocks, 11 inside the committed turn
   * contexts, and 7 in tool output. `agentLogEventSchema` has no `text` member,
   * so `parseLogEvent` over every line is the proof: a durable log carries only
   * completed messages. The streamed deltas (`AgentLiveEvent`) are non-durable
   * and reach the transcript through `projectAgentHostLiveEvent` on the live
   * path alone, which is why a replay never has to reconcile the two.
   */
  it('carries no streamed text events in a real four-run log, only content blocks', () => {
    const events = hexagonalNutFourRunLog
      .trim()
      .split('\n')
      .map((line) => parseLogEvent(JSON.parse(line)));
    const occurrences = [...hexagonalNutFourRunLog.matchAll(/"type":"(?<name>[\w.-]+)"/gu)].filter(
      (match) => match.groups?.['name'] === 'text',
    );

    expect(events).toHaveLength(157);
    expect(new Set(events.map((event) => event.type))).toEqual(
      new Set(['message.appended', 'run.lifecycle', 'safeguard.recorded', 'turn.history-projection-committed']),
    );
    expect(occurrences).toHaveLength(47);
    expect(new Set(events.map((event) => event.runId)).size).toBe(4);
  });
});

describe('latestAcpSessionData', () => {
  it('returns only the newest session record for the active agent', () => {
    const messages: MyUIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'data-acp-session',
            data: { type: 'acp-session', id: 's1', agentId: 'codex', commands: [], configOptions: [] },
          },
        ],
      },
      {
        id: 'a2',
        role: 'assistant',
        parts: [
          {
            type: 'data-acp-session',
            data: {
              type: 'acp-session',
              id: 's2',
              agentId: 'codex',
              commands: [{ name: '$brep-design', description: 'BRep' }],
              configOptions: [],
            },
          },
        ],
      },
      {
        id: 'a3',
        role: 'assistant',
        parts: [
          {
            type: 'data-acp-session',
            data: { type: 'acp-session', id: 's3', agentId: 'claude', commands: [], configOptions: [] },
          },
        ],
      },
    ];

    expect(latestAcpSessionData(messages, 'codex')?.id).toBe('s2');
    expect(latestAcpSessionData(messages, 'missing')).toBeUndefined();
  });
});

describe('projectTurnFinalized', () => {
  /* Exactly what a host writes: `packages/host/src/revisions.ts` appends this
     record to the chat's own log from its settlement, and `parseLogEvent` is
     what the client's log reader validates it with — so the fixture goes
     through it. The browser's worker root emits the same shape from the same
     machines, which is what makes one projection serve both hosts (S9). */
  const record = parseLogEvent({
    ...base,
    type: 'turn.finalized',
    turnId: 'user-turn-1',
    runId: 'run-1',
    chatId: 'chat-1',
    projectId: 'project-1',
    checkoutId: 'live',
    revisionId: 'rev-1',
    branch: 'main',
    changedPaths: ['main.scad'],
    treeId: 'tree-1',
    trigger: 'turn',
    runIds: ['run-1', 'run-2'],
  });

  it('becomes the card the turn on screen carries, in the one schema every host publishes', () => {
    expect(projectTurnFinalized(record)).toEqual({
      type: 'turn.finalized',
      turnId: 'user-turn-1',
      runId: 'run-1',
      chatId: 'chat-1',
      projectId: 'project-1',
      checkoutId: 'live',
      revisionId: 'rev-1',
      branch: 'main',
      changedPaths: ['main.scad'],
      treeId: 'tree-1',
      trigger: 'turn',
      runIds: ['run-1', 'run-2'],
    });
  });

  it('carries a turn that changed nothing without inventing a revision for it', () => {
    const nothing = parseLogEvent({
      ...base,
      type: 'turn.finalized',
      turnId: 'user-turn-2',
      runId: 'run-3',
      chatId: 'chat-1',
      projectId: 'project-1',
      changedPaths: [],
      trigger: 'turn',
      runIds: ['run-3'],
    });
    const card = projectTurnFinalized(nothing);
    expect(card?.revisionId).toBeUndefined();
    expect(card?.changedPaths).toEqual([]);
  });

  it('renders no transcript chunk of its own, and reads nothing out of another record', () => {
    expect(projectAgentHostEvent(record)).toEqual([]);
    expect(projectTurnFinalized({ ...base, type: 'run.lifecycle', state: 'completed' })).toBe(undefined);
  });

  it('renders no chunk for the two sibling outcomes either', () => {
    const conflicted = parseLogEvent({
      ...base,
      type: 'turn.conflicted',
      turnId: 'user-turn-3',
      runId: 'run-4',
      chatId: 'chat-1',
    });
    const failed = parseLogEvent({
      ...base,
      type: 'turn.failed',
      turnId: 'user-turn-4',
      runId: 'run-5',
      chatId: 'chat-1',
      reason: 'The turn ended before it recorded a revision.',
    });
    expect(projectAgentHostEvent(conflicted)).toEqual([]);
    expect(projectAgentHostEvent(failed)).toEqual([]);
  });
});

describe('external tool-call chunks', () => {
  const externalMetadata = { tauInternal: { kind: 'external-tool', origin: 'external', agentId: 'codex' } } as const;
  const chunksOf = (message: unknown): readonly UIMessageChunk[] =>
    projectAgentHostEvent({ ...base, type: 'message.appended', message } as AgentLogEvent);

  it("marks every external call dynamic, and carries the emitter's own facts", () => {
    const [chunk] = chunksOf({
      id: 'external-input',
      role: 'tool-input',
      toolCallId: 'call-1',
      toolName: 'listFiles',
      call: { toolCallId: 'list-1', kind: 'read', title: 'List files', status: 'pending', nativeName: 'listFiles' },
      content: { path: '.' },
      metadata: externalMetadata,
    });

    expect(chunk).toMatchObject({
      type: 'tool-input-available',
      toolName: 'listFiles',
      dynamic: true,
      title: 'List files',
      toolMetadata: { tau: { kind: 'read', nativeName: 'listFiles', origin: 'external', agentId: 'codex' } },
    });
  });

  it('leaves no external tool chunk static, whatever the row carries', () => {
    const rows = [
      { role: 'tool-input', toolCallId: 'a', toolName: 'shell', content: {}, metadata: externalMetadata },
      {
        role: 'tool-input',
        toolCallId: 'b',
        toolName: 'ls -la',
        call: { toolCallId: 'b' },
        content: {},
        metadata: externalMetadata,
      },
      {
        role: 'tool-output',
        toolCallId: 'a',
        toolName: 'shell',
        content: {},
        isError: false,
        metadata: externalMetadata,
      },
      {
        role: 'tool-output',
        toolCallId: 'b',
        toolName: 'ls -la',
        content: 'boom',
        isError: true,
        metadata: externalMetadata,
      },
    ];
    const chunks = rows.flatMap((row, index) => [...chunksOf({ id: `external-${String(index)}`, ...row })]);
    const toolChunks = chunks.filter((chunk) => chunk.type.startsWith('tool-'));

    expect(toolChunks).toHaveLength(4);
    /* This is what makes the red unknown-part card unreachable by construction:
     * with `dynamic` set, no `tool-${title}` part type can ever be minted. */
    expect(toolChunks.every((chunk) => 'dynamic' in chunk && chunk.dynamic === true)).toBe(true);
  });

  it("keeps Tau's own call static, and still carries its kind", () => {
    const [chunk] = chunksOf({
      id: 'tau-input',
      role: 'tool-input',
      toolCallId: 'call-2',
      toolName: 'list_directory',
      call: { toolCallId: 'call-2', kind: 'read', nativeName: 'list_directory' },
      content: { path: '.' },
    });

    expect(chunk).toMatchObject({ type: 'tool-input-available', toolName: 'list_directory' });
    expect(chunk).not.toHaveProperty('dynamic');
    expect(chunk).toMatchObject({ toolMetadata: { tau: { kind: 'read', nativeName: 'list_directory' } } });
  });

  it('keeps a normalized external Tau MCP call on one dynamic SDK identity', async () => {
    const metadata = {
      tauInternal: { kind: 'external-tool', origin: 'external', agentId: 'codex', presentation: 'tau-mcp' },
    } as const;
    const [input] = chunksOf({
      id: 'tau-mcp-input',
      role: 'tool-input',
      toolCallId: 'call-mcp',
      toolName: 'screenshot',
      call: {
        toolCallId: 'vendor-call',
        kind: 'execute',
        nativeName: 'screenshot',
        content: [{ type: 'content', content: { type: 'image', mimeType: 'image/png', data: 'cHJldmlldw==' } }],
      },
      content: { targetFile: 'main.ts', mode: 'single' },
      metadata,
    });
    const [output] = chunksOf({
      id: 'tau-mcp-output',
      role: 'tool-output',
      toolCallId: 'call-mcp',
      toolName: 'screenshot',
      content: { images: [{ view: 'isometric', dataUrl: 'data:image/webp;base64,AQ==' }] },
      isError: false,
      call: { toolCallId: 'vendor-call', kind: 'execute', nativeName: 'screenshot' },
      metadata,
    });

    expect(input).toMatchObject({ type: 'tool-input-available', toolName: 'screenshot' });
    expect(input).toHaveProperty('dynamic', true);
    expect(input).toMatchObject({
      toolMetadata: { tau: { origin: 'external', agentId: 'codex', presentation: 'tau-mcp' } },
    });
    expect(output).toMatchObject({ type: 'tool-output-available', output: { images: [{ view: 'isometric' }] } });
    expect(output).toHaveProperty('dynamic', true);
    let parts: MyUIMessage['parts'] = [];
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue(input);
        controller.enqueue(output);
        controller.close();
      },
    });
    for await (const message of readUIMessageStream<MyUIMessage>({ stream })) {
      parts = message.parts;
    }
    expect(parts.find((part) => part.type === 'dynamic-tool')).toMatchObject({
      type: 'dynamic-tool',
      state: 'output-available',
      toolMetadata: {
        tau: {
          content: [{ type: 'content', content: { type: 'image', mimeType: 'image/png', data: 'cHJldmlldw==' } }],
        },
      },
    });
  });
});

describe('external attribution', () => {
  const base = {
    version: 1,
    leaderEpoch: 'epoch-1',
    sequence: 1,
    recordedAt: '2026-01-01T00:00:00.000Z',
    runId: 'run-1',
  } as const;

  /*
   * V6. The vendor's own token report reaches the same `data-usage` part a Tau
   * turn produces, with no Tau operation — Tau did not sell this turn — and the
   * agent named so the reader knows the missing charge is a fact.
   */
  it('carries the external agent and the model it ran on, with no Tau operation', () => {
    const chunks = projectAgentHostEvent({
      ...base,
      type: 'message.appended',
      message: {
        id: 'assistant-ext',
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
        metadata: {
          model: 'gpt-5.3-codex',
          responseModel: 'gpt-5.3-codex',
          usage: {
            input: 1200,
            output: 300,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 1500,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          tauInternal: {
            kind: 'external-tool',
            origin: 'external',
            agentId: 'codex',
            vendorCost: { amount: 0.01, currency: 'USD', reportedBy: 'codex' },
          },
        },
      },
    });

    expect(chunks).toContainEqual({
      type: 'data-usage',
      id: 'assistant-ext:usage',
      data: {
        type: 'usage',
        id: 'assistant-ext:usage',
        agent: 'codex',
        model: 'gpt-5.3-codex',
        inputTokens: 1200,
        outputTokens: 300,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
  });

  /* B4 R2: the catalog price the model row quotes never becomes a charge, so
   * the projection drops `usage.cost.*` entirely and carries the operation the
   * account's own receipt answers for instead. */
  it('carries the funded operation identity and no priced field', () => {
    const chunks = projectAgentHostEvent({
      ...base,
      type: 'message.appended',
      message: {
        id: 'assistant-funded',
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
        metadata: {
          model: 'openai-gpt-5.5',
          usage: {
            input: 10,
            output: 4,
            reasoning: 3,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 14,
            cost: { input: 9.99, output: 9.99, cacheRead: 0, cacheWrite: 0, total: 19.98 },
          },
          tauInternal: {
            kind: 'billing-invocation',
            attemptId: 'att_funded',
            operationId: 'op_funded',
            status: 'pending',
          },
        },
      },
    });

    expect(chunks).toContainEqual({
      type: 'data-usage',
      id: 'assistant-funded:usage',
      data: {
        type: 'usage',
        id: 'assistant-funded:usage',
        model: 'openai-gpt-5.5',
        inputTokens: 10,
        outputTokens: 4,
        reasoningTokens: 3,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        operationId: 'op_funded',
        attemptId: 'att_funded',
        billingStatus: 'pending',
      },
    });
    expect(JSON.stringify(chunks)).not.toContain('9.99');
  });

  it("leaves a Tau turn's usage unattributed", () => {
    const chunks = projectAgentHostEvent({
      ...base,
      type: 'message.appended',
      message: {
        id: 'assistant-tau',
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
        metadata: {
          model: 'openai-gpt-5.5',
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.01 },
          },
        },
      },
    });

    const usage = chunks.find((chunk) => chunk.type === 'data-usage');
    expect(usage).toBeDefined();
    expect(usage && 'data' in usage ? usage.data : {}).not.toHaveProperty('agent');
  });

  /* The banner reads the requester from the record, so the projection has to
   * carry it out of the durable interrupt payload. */
  it('projects the agent that raised a durable interrupt', () => {
    const [request] = projectAgentHostEvent({
      ...base,
      type: 'interrupt.recorded',
      interruptId: 'interrupt-1',
      phase: 'requested',
      reason: 'write hello.txt',
      payload: {
        kind: 'approval',
        prompt: 'write hello.txt',
        agentId: 'claude',
        context: { options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }] },
      },
    });

    expect(request).toMatchObject({
      type: 'tool-input-available',
      input: { agentId: 'claude', options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }] },
    });
  });
});
