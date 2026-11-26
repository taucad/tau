/**
 * A Stop that lands between a turn's commit and the start of its loop sends nothing to the model (launch audit C-3).
 *
 * `prompt()` checks for a Stop once its commit row is durable, then awaits the history it hands to pi, which reads
 * every new attachment's bytes. A Stop during those awaits aborted the session's own controller and asked pi to
 * abort a run it had not started; pi then began its loop under a fresh controller that nothing aborted, so the model
 * request left and every tool call the model made ran, step after step, to the loop's natural end.
 */
import { describe, expect, it } from 'vitest';

import { createMemoryEventLogFile } from '#harness/harness.fixture.js';
import { createAgentSession } from '#harness/session.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport } from '#waist/ports.js';

class RecordingTransport implements ModelTransport {
  public readonly funding = { type: 'unfunded' } as const;
  public readonly requests: ModelStreamRequest[] = [];

  public async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
    this.requests.push(request);
    yield { type: 'text-delta', text: 'done' };
    yield { type: 'completed', stopReason: 'stop' };
  }
}

describe('a Stop between the commit and the start of the loop', () => {
  it('should send no model request, and end the turn as stopped', async () => {
    const file = createMemoryEventLogFile();
    const transport = new RecordingTransport();
    const reading = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const session = await createAgentSession({
      chatId: 'chat-1',
      runId: 'run-1',
      leaderEpoch: 'epoch-1',
      systemPrompt: 'system',
      model: { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' },
      modelTransport: transport,
      toolRegistry: { list: () => [], invoke: async () => ({ content: 'unused', isError: false }) },
      eventLog: await file.open(),
      attachments: {
        /* The attachment's bytes are read after the commit, while the history for pi is built. */
        read: async () => {
          reading.resolve();
          await release.promise;
          return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        },
      },
    });
    let committed = false;
    const running = session.prompt(
      {
        id: 'user-1',
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image.' },
          { type: 'file-ref', path: `attachments/${'a'.repeat(64)}.png`, mimeType: 'image/png' },
        ],
      },
      () => {
        committed = true;
      },
    );
    await reading.promise;
    expect(committed).toBe(true);

    session.abort();
    release.resolve();
    const outcome = await running;
    await session.close();

    expect(transport.requests).toHaveLength(0);
    expect(outcome).toEqual({ outcome: 'aborted' });
  });
});
