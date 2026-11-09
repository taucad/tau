/**
 * I1 across devices (chat latency and prompt cache program): the turns another device committed are read the way the
 * history is read, over every device's segment, so the request a device builds after a device switch reproduces the
 * other device's bytes: its turn contexts sit before its messages, its skills block stays pinned, and a run it
 * admitted resumes with the context it committed.
 */
import { describe, expect, it } from 'vitest';
import { attachTurnContexts, committedTurnContexts, createAgentSession } from '#harness/session.js';
import { fixtureTools } from '#harness/prefix-identity.fixture.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import { memoryEventLogStorage } from '#log/event-log-storage.fixture.js';
import { abandonedTurnOf } from '#log/event-types.js';
import type { AgentLogEvent, TurnContextSnapshot, UserProviderMessage } from '#log/event-types.js';
import type { ChatLogSegment } from '#log/segments.js';
import { serializeLogEvent } from '#log/serialization.js';
import type { ModelStreamEvent, ModelStreamRequest, ToolRegistry } from '#waist/ports.js';

const encoder = new TextEncoder();
const bytesOf = (events: readonly AgentLogEvent[]): Uint8Array<ArrayBuffer> =>
  encoder.encode(events.map((event) => serializeLogEvent(event)).join(''));
const segment = (deviceId: string, events: readonly AgentLogEvent[]): ChatLogSegment => ({
  deviceId,
  bytes: bytesOf(events),
});

const desktopSkillsBlock = '\n## Skills System\n\npinned-on-desktop';
const desktopContext: TurnContextSnapshot = {
  version: 1,
  systemPrompt: `static\n\n${desktopSkillsBlock}\n\ndynamic`,
  systemPromptBlocks: [
    { type: 'text', text: 'static', cacheControl: { type: 'ephemeral' } },
    { type: 'text', text: desktopSkillsBlock, cacheControl: { type: 'ephemeral' } },
    { type: 'text', text: 'dynamic' },
  ],
  initialMessages: [{ id: 'tau:snapshot-context:run-desktop', role: 'user', content: 'desktop snapshot' }],
  postCompactionMessages: [{ id: 'tau:snapshot-context:run-desktop', role: 'user', content: 'desktop snapshot' }],
};

const desktopRow = (
  sequence: number,
  recordedAt: string,
): Pick<AgentLogEvent, 'version' | 'leaderEpoch' | 'sequence' | 'recordedAt' | 'runId'> => ({
  version: 1,
  leaderEpoch: 'epoch-desktop',
  sequence,
  recordedAt,
  runId: 'run-desktop',
});

const desktopCommit: AgentLogEvent = {
  ...desktopRow(0, '2026-10-23T08:00:00.000Z'),
  type: 'turn.history-projection-committed',
  retainedMessageIds: [],
  message: { id: 'u-desktop', role: 'user', content: 'desktop asks' },
  context: desktopContext,
};

const desktopAnswer: AgentLogEvent = {
  ...desktopRow(1, '2026-10-23T08:00:01.000Z'),
  type: 'message.appended',
  message: {
    id: 'a-desktop',
    role: 'assistant',
    content: [{ type: 'text', text: 'desktop answered' }],
    metadata: { stopReason: 'stop', model: 'stub', provider: 'anthropic', api: 'anthropic-messages', timestamp: 1 },
  },
};

const toolRegistry: ToolRegistry = {
  list: () => fixtureTools,
  invoke: async () => ({ content: null, isError: false }),
};

/** The phone opens the chat with the desktop's segment beside its own empty log. */
const openOnPhone = async (desktop: readonly AgentLogEvent[]) => {
  const { storage } = memoryEventLogStorage(bytesOf([]));
  return createEventLogAppender(
    { ...storage, segments: async () => [segment('device-desktop', desktop)] },
    { now: () => Date.parse('2026-10-23T10:05:00.000Z') },
  );
};

const phoneSession = async (
  log: Awaited<ReturnType<typeof openOnPhone>>,
  runId: string,
  requests: ModelStreamRequest[],
) =>
  createAgentSession({
    chatId: 'chat-xd',
    runId,
    leaderEpoch: 'epoch-phone',
    systemPrompt: 'static\n\ndynamic',
    systemPromptBlocks: [
      { type: 'text', text: 'static', cacheControl: { type: 'ephemeral' } },
      { type: 'text', text: 'dynamic' },
    ],
    model: { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' },
    modelTransport: {
      funding: { type: 'unfunded' },
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        requests.push(request);
        yield { type: 'text-delta', text: 'ok' };
        yield { type: 'completed', stopReason: 'stop' };
      },
    },
    toolRegistry,
    eventLog: log,
    clientContext: { skills: [{ name: 'phone-skill', description: 'Phone catalog' }] },
    contextMessages: [{ id: `tau:snapshot-context:${runId}`, role: 'user', content: 'phone snapshot' }],
  });

describe('I1 across devices: turns another device committed', () => {
  it("should place the desktop's turn context before its message and keep the desktop's skills block pinned", async () => {
    const log = await openOnPhone([desktopCommit, desktopAnswer]);
    const history = await log.messages();
    expect(history.map((message) => message.id)).toEqual(['u-desktop', 'a-desktop']);
    const requests: ModelStreamRequest[] = [];
    const session = await phoneSession(log, 'run-phone', requests);
    const outcome = await session.prompt({ id: 'u-phone', role: 'user', content: 'phone asks' });
    await session.close();
    expect(outcome.outcome).toBe('completed');

    const ids = requests[0]!.messages.map((message) => message.id);
    /* What the desktop's own requests carried: its context immediately before its message (I2). */
    expect(ids.slice(0, 2)).toEqual(['tau:snapshot-context:run-desktop', 'u-desktop']);
    /* The chat's pinned skills block, not the phone's catalog, which rides as a note once (I1). */
    expect(requests[0]!.systemPromptBlocks?.map((block) => block.text)).toEqual([
      'static',
      desktopSkillsBlock,
      'dynamic',
    ]);
    expect(ids.filter((id) => id === 'tau:skills-update')).toHaveLength(1);
  });

  it('should resume a run the desktop admitted with the context that run committed', async () => {
    /* The desktop committed its turn and lost the connection before the model answered. */
    const log = await openOnPhone([desktopCommit]);
    const requests: ModelStreamRequest[] = [];
    const session = await phoneSession(log, 'run-desktop', requests);
    const outcome = await session.continue();
    await session.close();
    expect(outcome.outcome).toBe('completed');

    expect(requests[0]!.systemPromptBlocks?.map((block) => block.text)).toEqual([
      'static',
      desktopSkillsBlock,
      'dynamic',
    ]);
    const ids = requests[0]!.messages.map((message) => message.id);
    expect(ids).toEqual(['tau:snapshot-context:run-desktop', 'u-desktop']);
  });
});

describe('committedTurnContexts reads the rows by the history’s rule (XD3)', () => {
  const at = (
    sequence: number,
    runId: string,
  ): Readonly<{ version: 1; leaderEpoch: string; sequence: number; recordedAt: string; runId: string }> => ({
    version: 1,
    leaderEpoch: `epoch-${runId}`,
    sequence,
    recordedAt: '2026-10-24T00:00:00.000Z',
    runId,
  });
  const turn: UserProviderMessage = { id: 'u1', role: 'user', content: 'the person’s words' };
  const contextOf = (tag: string): TurnContextSnapshot => ({
    version: 1,
    systemPrompt: tag,
    initialMessages: [{ id: `ctx-${tag}`, role: 'user', content: tag }],
    postCompactionMessages: [],
  });
  const commit = (runId: string, tag: string, sequence: number): AgentLogEvent => ({
    ...at(sequence, runId),
    type: 'turn.history-projection-committed',
    retainedMessageIds: [],
    message: turn,
    context: contextOf(tag),
  });

  it('should ignore the run’s own commit of a turn another device already said for it', () => {
    /* The phone went on past the abandoned desktop run and copied its turn; the desktop's commit merged after. */
    const copy: AgentLogEvent = { ...at(0, 'run-desktop'), type: 'message.appended', message: abandonedTurnOf(turn) };
    const turns = committedTurnContexts([copy, commit('run-desktop', 'late', 1)]);
    expect(turns).toEqual([]);
    expect(attachTurnContexts([abandonedTurnOf(turn)], turns).map((message) => message.id)).toEqual(['u1']);
  });

  it('should take a later run’s commit of the same message after a rewind (a Retry)', () => {
    const rewind: AgentLogEvent = {
      ...at(1, 'run-1'),
      type: 'history.rewound',
      trigger: 'retry',
      retainedMessageIds: [],
    };
    const turns = committedTurnContexts([commit('run-1', 'first', 0), rewind, commit('run-2', 'retry', 2)]);
    expect(turns.map((candidate) => [candidate.anchorId, candidate.context.systemPrompt])).toEqual([['u1', 'retry']]);
  });
});
