import { describe, expect, it } from 'vitest';
import { parseLogEvent } from '@taucad/agent-host';
import type { AgentLiveEvent, AgentLogEvent } from '@taucad/agent-host';
import { isRecord } from '@taucad/utils/schema';
import {
  agentApprovalToolName,
  projectAgentHostEvent,
  projectAgentHostLiveEvent,
  projectAgentHostUserTurn,
} from '#services/agent-host-event-projection.js';
import hexagonalNutLog from '#services/__fixtures__/daemon-reattach-hexnut.jsonl?raw';
import hexagonalNutFourRunLog from '#services/__fixtures__/daemon-reattach-hexnut-4runs.jsonl?raw';

const base = {
  version: 1,
  leaderEpoch: 'leader-1',
  sequence: 1,
  recordedAt: '2026-09-01T00:00:00.000Z',
  runId: 'run-1',
} as const;

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
    const streamedBlocks = new Set<string>();
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
    expect(streamedBlocks).toEqual(new Set());
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
          model: 'openai/gpt-5.5',
          usage: {
            input: 12,
            output: 7,
            cacheRead: 3,
            cacheWrite: 2,
            totalTokens: 24,
            cost: { input: 0.12, output: 0.07, cacheRead: 0.03, cacheWrite: 0.02, total: 0.24 },
          },
          stopReason: 'toolUse',
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
        model: 'openai/gpt-5.5',
        inputTokens: 12,
        outputTokens: 7,
        reasoningTokens: 0,
        cacheReadTokens: 3,
        cacheWriteTokens: 2,
        inputTokensCost: 0.12,
        outputTokensCost: 0.07,
        cacheReadTokensCost: 0.03,
        cacheWriteTokensCost: 0.02,
        totalCost: 0.24,
      },
    });
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

  it('renders the typed gateway reason rather than a generic host failure', () => {
    expect(
      projectAgentHostEvent({
        ...base,
        type: 'run.lifecycle',
        state: 'failed',
        detail: {
          code: 'UPSTREAM_REJECTED',
          message: 'The model provider rejected the request (HTTP 400).',
          status: 502,
        },
      }),
    ).toEqual([{ type: 'error', errorText: 'The model provider rejected the request (HTTP 400).' }]);
  });

  it('falls back to the generic host failure only when the run recorded no reason', () => {
    expect(projectAgentHostEvent({ ...base, type: 'run.lifecycle', state: 'failed' })).toEqual([
      { type: 'error', errorText: 'Browser agent host failed.' },
    ]);
  });

  it('handles every durable event type and rejects unknown ones', () => {
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
    expect(() => projectAgentHostEvent({ ...base, type: 'future.event' } as unknown as AgentLogEvent)).toThrow(
      'Unmapped agent-host event: future.event',
    );
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
