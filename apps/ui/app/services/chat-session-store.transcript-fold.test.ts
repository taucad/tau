// @vitest-environment node
/**
 * Replay cases for the displayed transcript (use_skill startup latency blueprint, T2): each case folds host rows and
 * live events into a real store, reads `session.messages` after every emission, and asserts what a person sees. The
 * transcript is a synchronous fold of the projection, so a committed result shows without waiting for a later step.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgentLiveEvent } from '@taucad/agent-host';
import type { MyUIMessage } from '@taucad/chat';
import { loadChatSdk } from '@taucad/chat-ui/services/chat-sdk-loader';
import { ChatSessionStore } from '#services/chat-session-store.js';
import type { ChatSession } from '#services/chat-session-store.js';
import * as Projection from '#machines/chat-projection.logic.js';
import { logRow, prestartedSkillPairRows, publishLogPage, publishLogRows } from '#machines/chat-projection.fixture.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Mirror the environment module's fixed exported names.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'http://test.local' } }));
vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));

beforeAll(async () => {
  await loadChatSdk();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Harness
// ===========================================================================

const chatId = 'chat';

const createStore = (): ChatSessionStore => {
  const store = new ChatSessionStore();
  const missing = async (): Promise<never> => {
    throw Object.assign(new Error('Missing record'), { code: 'ENOENT' });
  };
  store.setDependencies({
    getChat: async () => ({ id: chatId, resourceId: 'project', name: '', messages: [], createdAt: 0, updatedAt: 0 }),
    patchChat: async () => undefined,
    touchChatRecency: async () => undefined,
    consumeChatStartupRequest: async () => undefined,
    commitCancelledDraftRestore: async () => undefined,
    client: {
      readFile: missing,
      readdir: async () => [],
      exists: async () => false,
      writeFile: async () => undefined,
      rmdir: async () => undefined,
      unlink: async () => undefined,
    },
  });
  return store;
};

/** Let the store's promise chains and zero-delay timers run out, as a page between two host messages would. */
const settle = async (): Promise<void> => {
  for (let round = 0; round < 5; round++) {
    // oxlint-disable-next-line no-await-in-loop -- Each round drains what the previous one scheduled.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

type LiveFields = AgentLiveEvent extends infer Event
  ? Event extends AgentLiveEvent
    ? Omit<Event, 'chatId'>
    : never
  : never;

type Step = Readonly<{ rows: readonly unknown[] }> | Readonly<{ live: LiveFields }> | Readonly<{ wait: number }>;

type Reader = Readonly<{
  store: ChatSessionStore;
  session: ChatSession;
  /** Every transcript the session showed, one per store emission and step. */
  seen: Array<readonly MyUIMessage[]>;
  run: (steps: readonly Step[]) => Promise<void>;
  dispose: () => void;
}>;

const openReader = async (): Promise<Reader> => {
  const store = createStore();
  const session = store.acquire(chatId, 'project');
  await vi.waitFor(() => {
    expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
  });
  const seen: Array<readonly MyUIMessage[]> = [];
  const record = (): void => {
    if (seen.at(-1) !== session.messages) {
      seen.push(session.messages);
    }
  };
  const unsubscribeChat = store.subscribeChat(chatId, record);
  const unsubscribeProjection = store.subscribeProjection(chatId, record);
  let cursor = 0;
  const run = async (steps: readonly Step[]): Promise<void> => {
    for (const step of steps) {
      if ('rows' in step) {
        publishLogRows(store, chatId, step.rows, cursor);
        cursor += step.rows.length;
      } else if ('live' in step) {
        // oxlint-disable-next-line typescript/consistent-type-assertions -- Each literal is one member of the union; spreading it loses the discriminant.
        store.receiveHostLiveEvent(chatId, { chatId, ...step.live } as AgentLiveEvent);
      } else {
        // oxlint-disable-next-line no-await-in-loop -- A wait is a step of the replay.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, step.wait);
        });
      }
      record();
      // oxlint-disable-next-line no-await-in-loop -- Steps are replayed in order, each settling before the next.
      await settle();
      record();
    }
  };
  return {
    store,
    session,
    seen,
    run,
    dispose: () => {
      unsubscribeChat();
      unsubscribeProjection();
      store.release(chatId);
    },
  };
};

type ToolState = Readonly<{ state: unknown; output?: unknown; errorText?: unknown; approval?: unknown }>;

/** Each tool part's state by call id, across the transcript. */
const toolsOf = (messages: readonly MyUIMessage[]): Record<string, ToolState> =>
  Object.fromEntries(
    messages.flatMap((message) =>
      message.parts.flatMap((part) =>
        'toolCallId' in part
          ? [
              [
                part.toolCallId,
                {
                  state: part.state,
                  ...('output' in part && part.output !== undefined ? { output: part.output } : {}),
                  ...('errorText' in part && part.errorText !== undefined ? { errorText: part.errorText } : {}),
                },
              ],
            ]
          : [],
      ),
    ),
  );

const textOf = (messages: readonly MyUIMessage[]): string =>
  messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])))
    .join('|');

const settledStates = new Set(['output-available', 'output-error']);

/**
 * No regression of shown content (I-3) between consecutive transcripts: no message disappears, no text shortens and no
 * settled tool part returns to an input state.
 */
const expectNoRegression = (seen: ReadonlyArray<readonly MyUIMessage[]>): void => {
  for (let index = 1; index < seen.length; index++) {
    const before = seen[index - 1]!;
    const after = seen[index]!;
    const afterIds = new Set(after.map((message) => message.id));
    expect(
      before.filter((message) => !afterIds.has(message.id)).map((message) => message.id),
      `messages lost at emission ${String(index)}`,
    ).toEqual([]);
    for (const message of before) {
      const next = after.find((candidate) => candidate.id === message.id)!;
      for (const [partIndex, part] of message.parts.entries()) {
        const successor = next.parts[partIndex];
        if (part.type === 'text' && successor?.type === 'text') {
          expect(successor.text.startsWith(part.text), `text shortened at emission ${String(index)}`).toBe(true);
        }
      }
    }
    const tools = toolsOf(after);
    for (const [callId, tool] of Object.entries(toolsOf(before))) {
      if (settledStates.has(String(tool.state))) {
        expect(tools[callId]?.state, `${callId} unsettled at emission ${String(index)}`).toBe(tool.state);
      }
    }
  }
};

const rowsOf = (sequences: readonly number[], rows: readonly unknown[]): Step[] =>
  sequences.map((sequence) => ({ rows: [rows[sequence]] }));

const runD = prestartedSkillPairRows();

/** A single prestarted call: checkpoint, input, final envelope, input envelope at execution start, output. */
const singleCallRows = (isError = false): Array<Record<string, unknown>> => {
  const call = { type: 'toolCall', id: 'skill-a', name: 'use_skill', arguments: { name: 'cad-replicad' } };
  const input = { id: 'input-a', role: 'tool-input', toolCallId: 'skill-a', toolName: 'use_skill', content: {} };
  const fields: Array<Record<string, unknown>> = [
    { type: 'run.lifecycle', state: 'admitted', attempt: 1 },
    { type: 'run.lifecycle', state: 'running', attempt: 1 },
    { type: 'message.appended', message: { id: 'user-1', role: 'user', content: 'Build it.' } },
    {
      type: 'message.appended',
      message: {
        id: 'step-1',
        role: 'assistant',
        content: [call],
        metadata: { tauInternal: { kind: 'stream-checkpoint', streamState: 'checkpoint' } },
      },
    },
    { type: 'message.appended', message: input },
    {
      type: 'message.envelope-replaced',
      messageId: 'step-1',
      replacement: { id: 'step-1', role: 'assistant', content: [call] },
    },
    {
      type: 'message.envelope-replaced',
      messageId: 'input-a',
      replacement: { ...input, content: { name: 'cad-replicad' } },
    },
    {
      type: 'message.appended',
      message: {
        id: 'output-a',
        role: 'tool-output',
        toolCallId: 'skill-a',
        toolName: 'use_skill',
        content: isError ? 'Skill not found' : 'instructions',
        isError,
      },
    },
  ];
  return fields.map((row, sequence) => logRow(sequence, row));
};

// ===========================================================================
// Cases
// ===========================================================================

describe('displayed transcript replay cases (T2)', () => {
  it('should settle both prestarted calls of Run D once their outputs fold, then show the next text as it streams', async () => {
    const reader = await openReader();
    try {
      await reader.run(rowsOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], runD));

      expect(toolsOf(reader.session.messages)).toEqual({
        'skill-a': { state: 'output-available', output: 'skill-a instructions' },
        'skill-b': { state: 'output-available', output: 'skill-b instructions' },
      });

      await reader.run([
        { live: { type: 'text-start', runId: 'run_1', messageId: 'step-2', contentIndex: 0 } },
        {
          live: { type: 'text-delta', runId: 'run_1', messageId: 'step-2', contentIndex: 0, delta: 'Buil', offset: 0 },
        },
      ]);
      expect(textOf(reader.session.messages)).toBe('Buil');
      await reader.run(rowsOf([11, 12, 13], runD));
      expect(textOf(reader.session.messages)).toBe('Building the washer.');
      expectNoRegression(reader.seen);
    } finally {
      reader.dispose();
    }
  });

  it('should settle Run D for a session re-attached mid-run', async () => {
    const reader = await openReader();
    try {
      await reader.run([{ rows: runD.slice(0, 9) }, ...rowsOf([9, 10], runD)]);

      expect(toolsOf(reader.session.messages)).toEqual({
        'skill-a': { state: 'output-available', output: 'skill-a instructions' },
        'skill-b': { state: 'output-available', output: 'skill-b instructions' },
      });
      expectNoRegression(reader.seen);
    } finally {
      reader.dispose();
    }
  });

  it.each([
    [
      'in the batch of the last rewrite',
      (rows: readonly unknown[]): Step[] => [...rowsOf([0, 1, 2, 3, 4, 5], rows), { rows: rows.slice(6, 8) }],
    ],
    ['in the next batch', (rows: readonly unknown[]): Step[] => rowsOf([0, 1, 2, 3, 4, 5, 6, 7], rows)],
    [
      '100 ms later',
      (rows: readonly unknown[]): Step[] => [
        ...rowsOf([0, 1, 2, 3, 4, 5, 6], rows),
        { wait: 100 },
        ...rowsOf([7], rows),
      ],
    ],
  ])('should settle a single call whose output folds %s', async (_position, steps) => {
    const reader = await openReader();
    try {
      await reader.run(steps(singleCallRows()));

      expect(toolsOf(reader.session.messages)).toEqual({
        'skill-a': { state: 'output-available', output: 'instructions' },
      });
      expectNoRegression(reader.seen);
    } finally {
      reader.dispose();
    }
  });

  it('should show an output with isError folded after the last rewrite as output-error', async () => {
    const reader = await openReader();
    try {
      await reader.run(rowsOf([0, 1, 2, 3, 4, 5, 6, 7], singleCallRows(true)));

      expect(toolsOf(reader.session.messages)).toEqual({
        'skill-a': { state: 'output-error', errorText: 'Skill not found' },
      });
    } finally {
      reader.dispose();
    }
  });

  it('should show the latest preliminary output of a call after the last rewrite', async () => {
    const reader = await openReader();
    const rows = singleCallRows();
    const tool = { runId: 'run_1', messageId: 'step-1', contentIndex: 0, toolCallId: 'skill-a', toolName: 'use_skill' };
    try {
      await reader.run([
        ...rowsOf([0, 1, 2, 3, 4, 5, 6], rows),
        { live: { type: 'tool-output-update', ...tool, output: 'reading 1 of 2', isError: false } },
        { live: { type: 'tool-output-update', ...tool, output: 'reading 2 of 2', isError: false } },
      ]);

      expect(toolsOf(reader.session.messages)).toEqual({
        'skill-a': { state: 'output-available', output: 'reading 2 of 2' },
      });
    } finally {
      reader.dispose();
    }
  });

  it('should show an approval requested after a rewrite', async () => {
    const reader = await openReader();
    const rows = singleCallRows().slice(0, 7);
    try {
      await reader.run([
        ...rowsOf([0, 1, 2, 3, 4, 5, 6], rows),
        {
          rows: [
            logRow(7, {
              type: 'interrupt.recorded',
              interruptId: 'approval-1',
              phase: 'requested',
              reason: 'Approve the skill',
            }),
          ],
        },
        { rows: [logRow(8, { type: 'run.lifecycle', state: 'paused', attempt: 1 })] },
      ]);

      expect(toolsOf(reader.session.messages)['approval-1']).toEqual({ state: 'approval-requested' });
    } finally {
      reader.dispose();
    }
  });

  it('should keep live-only content across a prestart rewrite and append its later deltas', async () => {
    const reader = await openReader();
    const checkpoint = { tauInternal: { kind: 'stream-checkpoint', streamState: 'checkpoint' } };
    const callA = { type: 'toolCall', id: 'skill-a', name: 'use_skill', arguments: { name: 'cad-replicad' } };
    const callB = { type: 'toolCall', id: 'skill-b', name: 'use_skill', arguments: { name: 'geospec-authoring' } };
    const text = { runId: 'run_1', messageId: 'step-1', contentIndex: 0 };
    const toolC = {
      runId: 'run_1',
      messageId: 'step-1',
      contentIndex: 3,
      toolCallId: 'skill-c',
      toolName: 'use_skill',
    };
    const rows = [
      { type: 'run.lifecycle', state: 'admitted', attempt: 1 },
      { type: 'run.lifecycle', state: 'running', attempt: 1 },
      { type: 'message.appended', message: { id: 'user-1', role: 'user', content: 'Build it.' } },
      {
        type: 'message.appended',
        message: {
          id: 'step-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Loading' }, callA],
          metadata: checkpoint,
        },
      },
      {
        type: 'message.appended',
        message: { id: 'input-a', role: 'tool-input', toolCallId: 'skill-a', toolName: 'use_skill', content: {} },
      },
      {
        type: 'message.envelope-replaced',
        messageId: 'step-1',
        replacement: {
          id: 'step-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Loading' }, callA, callB],
          metadata: checkpoint,
        },
      },
    ].map((row, sequence) => logRow(sequence, row));
    try {
      await reader.run([
        ...rowsOf([0, 1, 2], rows),
        { live: { type: 'text-start', ...text } },
        { live: { type: 'text-delta', ...text, delta: 'Loading', offset: 0 } },
        ...rowsOf([3, 4], rows),
        { live: { type: 'text-delta', ...text, delta: ' skills', offset: 7 } },
        { live: { type: 'tool-input-start', ...toolC } },
        { live: { type: 'tool-input-delta', ...toolC, delta: '{"name":"cad-' } },
      ]);
      expect(textOf(reader.session.messages)).toBe('Loading skills');
      expect(toolsOf(reader.session.messages)['skill-c']).toEqual({ state: 'input-streaming' });

      await reader.run([
        ...rowsOf([5], rows),
        { live: { type: 'text-delta', ...text, delta: ' now', offset: 14 } },
        { live: { type: 'tool-input-delta', ...toolC, delta: 'kcl"}' } },
      ]);

      expect(textOf(reader.session.messages)).toBe('Loading skills now');
      const partC = reader.session.messages
        .flatMap((message) => message.parts)
        .find((part) => 'toolCallId' in part && part.toolCallId === 'skill-c');
      expect(partC).toMatchObject({ state: 'input-streaming', input: { name: 'cad-kcl' } });
      expectNoRegression(reader.seen);
    } finally {
      reader.dispose();
    }
  });

  it('should keep text shown before a steering input folds with the message it ends', async () => {
    const reader = await openReader();
    const text = { runId: 'run_1', messageId: 'step-1', contentIndex: 0 };
    const rows = [
      { type: 'run.lifecycle', state: 'admitted', attempt: 1 },
      { type: 'run.lifecycle', state: 'running', attempt: 1 },
      { type: 'message.appended', message: { id: 'user-1', role: 'user', content: 'Make a cube.' } },
      {
        type: 'message.appended',
        message: {
          id: 'step-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Drafting' }],
          metadata: { tauInternal: { kind: 'stream-checkpoint', streamState: 'checkpoint' } },
        },
      },
      {
        type: 'message.envelope-replaced',
        messageId: 'step-1',
        replacement: { id: 'step-1', role: 'assistant', content: [{ type: 'text', text: 'Drafting a cube.' }] },
      },
      { type: 'message.appended', message: { id: 'steer:1', role: 'user', content: 'Make it red.' } },
    ].map((row, sequence) => logRow(sequence, row));
    try {
      await reader.run([
        ...rowsOf([0, 1, 2], rows),
        { live: { type: 'text-start', ...text } },
        { live: { type: 'text-delta', ...text, delta: 'Drafting', offset: 0 } },
        ...rowsOf([3], rows),
        { live: { type: 'text-delta', ...text, delta: ' a cube', offset: 8 } },
      ]);
      expect(textOf(reader.session.messages)).toBe('Drafting a cube');

      await reader.run([{ rows: rows.slice(4, 6) }]);

      expect(textOf(reader.session.messages)).toBe('Drafting a cube.');
      expect(reader.session.messages.map((message) => message.id).slice(0, 3)).toEqual(['user-1', 'run_1', 'steer:1']);
      expectNoRegression(reader.seen);
    } finally {
      reader.dispose();
    }
  });

  it('should show a sealed segment whose envelope is replaced while a later message is the tail', async () => {
    const reader = await openReader();
    const rows = [
      { type: 'run.lifecycle', state: 'admitted', attempt: 1 },
      { type: 'run.lifecycle', state: 'running', attempt: 1 },
      { type: 'message.appended', message: { id: 'user-1', role: 'user', content: 'Make a cube.' } },
      {
        type: 'message.appended',
        message: { id: 'step-1', role: 'assistant', content: [{ type: 'text', text: 'Drafting.' }] },
      },
      { type: 'message.appended', message: { id: 'steer:1', role: 'user', content: 'Make it red.' } },
      {
        type: 'message.appended',
        message: { id: 'step-2', role: 'assistant', content: [{ type: 'text', text: 'Red cube.' }] },
      },
      {
        type: 'message.envelope-replaced',
        messageId: 'step-1',
        replacement: { id: 'step-1', role: 'assistant', content: [{ type: 'text', text: 'Drafting a cube.' }] },
      },
    ].map((row, sequence) => logRow(sequence, row));
    try {
      await reader.run(rowsOf([0, 1, 2, 3, 4, 5, 6], rows));

      expect(textOf(reader.session.messages)).toBe('Drafting a cube.|Red cube.');
    } finally {
      reader.dispose();
    }
  });

  it('should never show part of a history read in pages', async () => {
    const reader = await openReader();
    const rows = prestartedSkillPairRows();
    try {
      publishLogPage(reader.store, chatId, rows.slice(0, 5), { cursor: 0, endCursor: rows.length });
      await settle();
      expect(reader.session.messages).toEqual([]);
      expect(reader.session.transcript).toBe('loading');

      publishLogPage(reader.store, chatId, rows.slice(5), { cursor: 5, endCursor: rows.length });
      await settle();

      expect(toolsOf(reader.session.messages)).toEqual({
        'skill-a': { state: 'output-available', output: 'skill-a instructions' },
        'skill-b': { state: 'output-available', output: 'skill-b instructions' },
      });
      expect(textOf(reader.session.messages)).toBe('Building the washer.');
      expect(reader.session.transcript).toBe('loaded');
    } finally {
      reader.dispose();
    }
  });

  it('should show the transcript when the SDK cannot reconstruct the run', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Projection, 'materializeTranscript').mockRejectedValue(new Error('No tool invocation found'));
    const reader = await openReader();
    try {
      await reader.run(rowsOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], runD));

      expect(toolsOf(reader.session.messages)).toEqual({
        'skill-a': { state: 'output-available', output: 'skill-a instructions' },
        'skill-b': { state: 'output-available', output: 'skill-b instructions' },
      });
    } finally {
      reader.dispose();
    }
  });
});
