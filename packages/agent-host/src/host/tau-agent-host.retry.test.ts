import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelStreamEvent, ModelTransport } from '#waist/ports.js';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import { reduceEventLog } from '#log/reducer.js';
import type * as Base64Module from '#harness/base64.js';
import { createMemoryLogFile, readLog, tools, hostOptions } from '#host/tau-agent-host.fixture.js';

const encoder = vi.hoisted(() => ({ overflow: false }));

vi.mock('#harness/base64.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Base64Module>();
  return {
    encodeBase64: (bytes: Uint8Array<ArrayBuffer>) => {
      if (encoder.overflow) {
        // What JavaScriptCore throws when a worker's stack cannot hold the call.
        throw new RangeError('Maximum call stack size exceeded.');
      }
      return actual.encodeBase64(bytes);
    },
  };
});

afterEach(() => {
  encoder.overflow = false;
});

const imagePath = `attachments/${'e'.repeat(64)}.jpg`;

const transport: ModelTransport = {
  funding: { type: 'unfunded' },
  async *stream(): AsyncGenerator<ModelStreamEvent> {
    yield { type: 'text-delta', text: 'ok' };
    yield { type: 'completed', stopReason: 'stop' };
  },
};

describe('Try again after a run that failed before recording its turn', () => {
  it('re-admits the turn with the prefix the page derives from its transcript', async () => {
    const file = createMemoryLogFile();
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport,
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'retry',
      }),
      attachments: { read: async () => new Uint8Array([255, 216, 255]) },
    });
    await host.admit({
      chatId: 'chat-retry',
      runId: 'run-1',
      trigger: 'submit',
      message: {
        id: 'turn-1',
        role: 'user',
        content: [
          { type: 'text', text: 'Model this.' },
          { type: 'file-ref', path: imagePath, mimeType: 'image/jpeg' },
        ],
      },
    });

    /* Every later session rebuilds history with the first turn's photo, and materializing it threw before the session
     * recorded the new user message. */
    encoder.overflow = true;
    await host.admit({
      chatId: 'chat-retry',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Go' },
    });
    await vi.waitFor(async () => {
      expect(await host.snapshot('chat-retry')).toMatchObject({ runId: 'run-2', state: 'failed' });
    });
    expect(reduceEventLog(await readLog(file)).map((message) => message.id)).not.toContain('turn-2');
    encoder.overflow = false;

    /* The page's transcript names the assistant reply by its run id, not by the log's provider message ids, so the
     * prefix before `turn-2` it retains is `turn-1, run-1`. */
    await host.admit({
      chatId: 'chat-retry',
      runId: 'run-3',
      trigger: 'regenerate',
      retainedMessageIds: ['turn-1', 'run-1'],
      message: { id: 'turn-2', role: 'user', content: 'Go' },
    });

    await vi.waitFor(async () => {
      expect(await host.snapshot('chat-retry')).toMatchObject({ runId: 'run-3', state: 'completed' });
    });
    const history = reduceEventLog(await readLog(file));
    expect(history.filter((message) => message.role === 'user').map((message) => message.id)).toEqual([
      'turn-1',
      'turn-2',
    ]);
    await host.close();
  });

  it('keeps the requested prefix when retrying a recorded turn a later rewind removed', async () => {
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport,
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'rewound',
      }),
    );
    const settle = async (runId: string) => {
      await vi.waitFor(async () => {
        expect(await host.snapshot('chat-rewound')).toMatchObject({ runId, state: 'completed' });
      });
    };
    await host.admit({
      chatId: 'chat-rewound',
      runId: 'run-1',
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'First.' },
    });
    await settle('run-1');
    await host.admit({
      chatId: 'chat-rewound',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Second.' },
    });
    await settle('run-2');
    // Editing the first turn rewinds the second away; its admission row stays in the log.
    await host.admit({
      chatId: 'chat-rewound',
      runId: 'run-3',
      trigger: 'edit',
      retainedMessageIds: [],
      message: { id: 'turn-1', role: 'user', content: 'First, edited.' },
    });
    await settle('run-3');

    await host.admit({
      chatId: 'chat-rewound',
      runId: 'run-4',
      trigger: 'regenerate',
      retainedMessageIds: [],
      message: { id: 'turn-2', role: 'user', content: 'Second.' },
    });
    await settle('run-4');

    const history = reduceEventLog(await readLog(file));
    expect(history.filter((message) => message.role === 'user').map((message) => message.id)).toEqual(['turn-2']);
    await host.close();
  });
});
