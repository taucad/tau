import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderMessage } from '#log/event-types.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport } from '#waist/ports.js';
import { createMemoryEventLogFile } from '#harness/harness.fixture.js';
import { hasFileRef, providerMessageToPi } from '#harness/session-record.js';
import type { AttachmentReader } from '#harness/session-record.js';
import type * as SessionRecordModule from '#harness/session-record.js';
import { createAgentSession } from '#harness/session.js';

vi.mock('#harness/session-record.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionRecordModule>();
  return { ...actual, providerMessageToPi: vi.fn(actual.providerMessageToPi) };
});

const imagePath = `attachments/${'c'.repeat(64)}.jpg`;
const pdfHash = 'd'.repeat(64);
const pdfPath = `attachments/${pdfHash}.pdf`;
const imageBytes: Uint8Array<ArrayBuffer> = new Uint8Array([255, 216, 255]);
const pdfBytes = new TextEncoder().encode('%PDF-1.4 body');
const base64 = (bytes: Uint8Array<ArrayBuffer>): string => Buffer.from(bytes).toString('base64');

class RecordingTransport implements ModelTransport {
  public readonly requests: ModelStreamRequest[] = [];

  public async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
    this.requests.push(request);
    yield { type: 'text-delta', text: 'seen' };
    yield { type: 'completed', stopReason: 'stop' };
  }
}

const attachmentsFrom = (
  files: Record<string, Uint8Array<ArrayBuffer>>,
): AttachmentReader & { read: ReturnType<typeof vi.fn> } => ({
  read: vi.fn(async (_chatId: string, path: string) => files[path]),
});

const userWithAttachments: ProviderMessage & { role: 'user' } = {
  id: 'user-1',
  role: 'user',
  content: [
    { type: 'text', text: 'what is in these?' },
    { type: 'file-ref', path: imagePath, mimeType: 'image/jpeg' },
    { type: 'file-ref', path: pdfPath, mimeType: 'application/pdf', filename: 'drawing.pdf' },
  ],
};

const openSession = async (options: {
  readonly file: ReturnType<typeof createMemoryEventLogFile>;
  readonly runId: string;
  readonly transport: RecordingTransport;
  readonly attachments?: AttachmentReader;
}) =>
  createAgentSession({
    chatId: 'chat-1',
    runId: options.runId,
    leaderEpoch: 'epoch-1',
    systemPrompt: 'system',
    model: { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' },
    modelTransport: options.transport,
    toolRegistry: { list: () => [], invoke: vi.fn() },
    eventLog: await options.file.open(),
    ...(options.attachments ? { attachments: options.attachments } : {}),
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(providerMessageToPi).mockClear();
});

describe('attachment materialisation in the session (D15)', () => {
  it('sends images and documents as bytes, carries the side table on the request, and never sends a file-ref', async () => {
    const file = createMemoryEventLogFile();
    const transport = new RecordingTransport();
    const attachments = attachmentsFrom({ [imagePath]: imageBytes, [pdfPath]: pdfBytes });
    const session = await openSession({ file, runId: 'run-1', transport, attachments });

    await session.prompt(userWithAttachments);

    expect(transport.requests).toHaveLength(1);
    const [request] = transport.requests;
    expect(request?.messages.at(-1)?.content).toEqual([
      { type: 'text', text: 'what is in these?' },
      { type: 'image', mimeType: 'image/jpeg', data: base64(imageBytes) },
      { type: 'text', text: `⟃tau:document:${pdfHash}⟄` },
    ]);
    expect(request?.documents).toEqual(
      new Map([[pdfHash, { data: base64(pdfBytes), mediaType: 'application/pdf', filename: 'drawing.pdf' }]]),
    );
    expect(attachments.read).toHaveBeenCalledWith('chat-1', imagePath);
    // Pin: no request ever contains a file-ref.
    expect(JSON.stringify(request?.messages)).not.toContain('file-ref');
  });

  it('keeps the durable rows as references', async () => {
    const file = createMemoryEventLogFile();
    const transport = new RecordingTransport();
    const session = await openSession({
      file,
      runId: 'run-1',
      transport,
      attachments: attachmentsFrom({ [imagePath]: imageBytes, [pdfPath]: pdfBytes }),
    });

    await session.prompt(structuredClone(userWithAttachments));

    const log = await file.open();
    const serialized = JSON.stringify(await log.read());
    expect(serialized).not.toContain(base64(pdfBytes));
    expect(serialized).not.toContain('⟃tau:document');
    const events = await log.read();
    const committed = events.find((event) => event.type === 'turn.history-projection-committed');
    expect(committed?.type === 'turn.history-projection-committed' && committed.message).toEqual(userWithAttachments);
  });

  it('names the chat every generation request belongs to', async () => {
    /* One transport serves every chat in a worker, so the chat travels with the
     * request rather than the composition; the gateway turns it into the
     * receipt's `chatHint`. */
    const file = createMemoryEventLogFile();
    const transport = new RecordingTransport();
    const session = await openSession({ file, runId: 'run-1', transport });

    await session.prompt({ id: 'user-1', role: 'user', content: 'hello' });

    expect(transport.requests[0]?.chatId).toBe('chat-1');
  });

  it('never hands hydration a file-ref, on the first turn or when a later run rebuilds history', async () => {
    const file = createMemoryEventLogFile();
    const attachments = attachmentsFrom({ [imagePath]: imageBytes, [pdfPath]: pdfBytes });
    const first = await openSession({ file, runId: 'run-1', transport: new RecordingTransport(), attachments });
    await first.prompt(userWithAttachments);
    await first.close();

    const transport = new RecordingTransport();
    const second = await openSession({ file, runId: 'run-2', transport, attachments });
    await second.prompt({ id: 'user-2', role: 'user', content: 'and now?' });

    const hydrated = vi.mocked(providerMessageToPi).mock.calls.map(([message]) => message);
    expect(hydrated.some((message) => message.id === 'user-1')).toBe(true);
    // Pin: hydrateHistory never sees a file-ref.
    expect(hydrated.filter((message) => hasFileRef(message))).toEqual([]);
    const replayed = transport.requests[0]?.messages.find((message) => message.id === 'user-1');
    expect(replayed?.content).toContainEqual({ type: 'image', mimeType: 'image/jpeg', data: base64(imageBytes) });
    expect(transport.requests[0]?.documents?.get(pdfHash)?.data).toBe(base64(pdfBytes));
    expect(JSON.stringify(transport.requests[0]?.messages)).not.toContain('file-ref');
  });

  it('omits a reference whose bytes are absent and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const file = createMemoryEventLogFile();
    const transport = new RecordingTransport();
    const session = await openSession({
      file,
      runId: 'run-1',
      transport,
      attachments: attachmentsFrom({ [pdfPath]: pdfBytes }),
    });

    await session.prompt(userWithAttachments);

    expect(transport.requests[0]?.messages.at(-1)?.content).toEqual([
      { type: 'text', text: 'what is in these?' },
      { type: 'text', text: `⟃tau:document:${pdfHash}⟄` },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(imagePath);
  });

  it('treats every reference as absent when the host wires no reader', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const transport = new RecordingTransport();
    const session = await openSession({ file: createMemoryEventLogFile(), runId: 'run-1', transport });

    await session.prompt(userWithAttachments);

    expect(transport.requests[0]?.messages.at(-1)?.content).toEqual([{ type: 'text', text: 'what is in these?' }]);
    expect(transport.requests[0]?.documents).toBeUndefined();
  });

  it('still sends a legacy inline image block unchanged', async () => {
    const transport = new RecordingTransport();
    const session = await openSession({ file: createMemoryEventLogFile(), runId: 'run-1', transport });
    const legacy = [{ type: 'image', mimeType: 'image/png', data: 'bGVnYWN5' }];

    await session.prompt({ id: 'user-legacy', role: 'user', content: legacy });

    expect(transport.requests[0]?.messages.at(-1)?.content).toEqual(legacy);
    expect(transport.requests[0]?.documents).toBeUndefined();
  });
});

describe('start-of-turn compaction refusal', () => {
  /*
   * A chat whose durable history is one message too large to evict cannot be
   * compacted at all. That refusal has to end the turn the way every other
   * coded refusal does — a terminal `failed` record carrying the code — instead
   * of escaping `prompt` mid-admission and leaving the chat with no way to take
   * another turn.
   */
  it('should admit the next turn after a start-of-turn compaction refusal', async () => {
    const file = createMemoryEventLogFile();
    const seedLog = await file.open();
    await seedLog.append({
      version: 1,
      leaderEpoch: 'seed-epoch',
      sequence: 0,
      recordedAt: '2026-09-01T00:00:00.000Z',
      runId: 'seed-run',
      type: 'message.appended',
      message: { id: 'user-oversized', role: 'user', content: 'p'.repeat(60_000) },
    });
    await seedLog.close();

    let generatedId = 0;
    const refusedSession = async (runId: string, transport: RecordingTransport) =>
      createAgentSession({
        chatId: 'chat-oversized',
        runId,
        leaderEpoch: `${runId}-epoch`,
        systemPrompt: 'system',
        model: { id: 'stub', contextWindow: 8192 },
        modelTransport: transport,
        toolRegistry: { list: () => [], invoke: vi.fn() },
        eventLog: await file.open(),
        summarize: async () => 'never reached',
        createId: () => `generated-${generatedId++}`,
        now: () => new Date('2026-09-01T00:00:00.000Z'),
      });

    const firstTransport = new RecordingTransport();
    const first = await refusedSession('run-refused', firstTransport);
    await first.prompt({ id: 'user-after-oversized', role: 'user', content: 'continue' });
    await first.close();

    const secondTransport = new RecordingTransport();
    const second = await refusedSession('run-next', secondTransport);
    await second.prompt({ id: 'user-next', role: 'user', content: 'still there?' });
    await second.close();

    const log = await file.open();
    const events = await log.read();
    const failures = events.flatMap((event) =>
      event.type === 'run.lifecycle' && event.state === 'failed' ? [event.detail?.code] : [],
    );

    expect(failures).toEqual(['NO_EVICTABLE_HISTORY', 'NO_EVICTABLE_HISTORY']);
    // The refusal never escalates to the circuit breaker, and both turns are
    // committed, so the chat keeps taking turns.
    expect(JSON.stringify(events)).not.toContain('CIRCUIT_BREAKER_OPEN');
    expect(
      events.flatMap((event) => (event.type === 'turn.history-projection-committed' ? [event.message.id] : [])),
    ).toEqual(['user-after-oversized', 'user-next']);
    expect(firstTransport.requests).toEqual([]);
    await log.close();
  });
});
