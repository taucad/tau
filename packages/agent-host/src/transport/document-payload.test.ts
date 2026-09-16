/* eslint-disable @typescript-eslint/naming-convention -- provider wire keys use native snake_case. */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AgentLogEvent, ProviderMessage } from '#log/event-types.js';
import type { MaterializedDocument, ModelStreamEvent, ModelStreamRequest } from '#waist/ports.js';
import { documentSentinel } from '#harness/session-record.js';
import { createMemoryEventLog } from '#harness/harness.fixture.js';
import { createAgentSession } from '#harness/session.js';
import { rewriteDocuments } from '#transport/document-payload.js';
import { GatewayModelTransportError } from '#transport/gateway-model-transport.js';
import { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';

/*
 * W11c's admission schemas (apps/api/app/api/billing/billable-model-request.ts),
 * restated: a published package cannot depend on the private API app. Keep these
 * in step with `anthropicDocumentSchema`, `inputFileSchema` and
 * `completionsFileSchema` there — a drift means the gateway refuses every PDF turn.
 */
const pdfDataUrl = z.string().regex(/^data:application\/pdf;base64,[A-Za-z\d+/]*={0,2}$/u);
const documentName = z.string().min(1).max(256);
const gatewayDocumentSchemas = {
  'anthropic-messages': z
    .object({
      type: z.literal('document'),
      title: documentName.optional(),
      source: z
        .object({
          type: z.literal('base64'),
          media_type: z.literal('application/pdf'),
          data: z.string().regex(/^[A-Za-z\d+/]*={0,2}$/u),
        })
        .strict(),
      cache_control: z
        .object({ type: z.literal('ephemeral'), ttl: z.literal('5m').optional() })
        .strict()
        .optional(),
    })
    .strict(),
  'openai-responses': z
    .object({ type: z.literal('input_file'), filename: documentName, file_data: pdfDataUrl })
    .strict(),
  'openai-completions': z
    .object({
      type: z.literal('file'),
      file: z.object({ filename: documentName, file_data: pdfDataUrl }).strict(),
    })
    .strict(),
} as const;

const pdfBytes = new TextEncoder().encode('%PDF-1.4 bracket spec');
const pdfData = Buffer.from(pdfBytes).toString('base64');
const hash = 'a'.repeat(64);
const pdf: MaterializedDocument = { data: pdfData, mediaType: 'application/pdf', filename: 'bracket-spec.pdf' };
const sentinel = documentSentinel(hash);
const sentinelOpening = '⟃tau:document:';

type Wire = keyof typeof gatewayDocumentSchemas;

const wires = [
  { wire: 'anthropic-messages', providerKind: 'anthropic', messagesKey: 'messages' },
  { wire: 'openai-responses', providerKind: 'openai', messagesKey: 'input' },
  { wire: 'openai-completions', providerKind: 'vertexai', messagesKey: 'messages' },
] as const satisfies ReadonlyArray<{
  wire: Wire;
  providerKind: ModelStreamRequest['providerKind'];
  messagesKey: string;
}>;

const sseBody = (frames: readonly string[]): Response =>
  new Response(frames.join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-document-1' },
  });

const replyFor = (wire: Wire): Response =>
  sseBody(
    wire === 'anthropic-messages'
      ? authoritativeGatewayWireFixtures.anthropicToolTurn
      : wire === 'openai-responses'
        ? authoritativeGatewayWireFixtures.openAiResponsesToolTurn
        : authoritativeGatewayWireFixtures.browserTurn,
  );

const request = (overrides: Partial<ModelStreamRequest>): ModelStreamRequest => ({
  attemptId: 'attempt-document-1',
  invocationPurpose: 'generation',
  modelId: 'fixture-model',
  maxTokens: 512,
  systemPrompt: 'You are a CAD assistant.',
  messages: [
    {
      id: 'user-1',
      role: 'user',
      content: [
        { type: 'text', text: 'What hole diameter does the attached spec require?' },
        { type: 'text', text: sentinel },
        { type: 'text', text: 'Answer in millimetres.' },
      ],
    },
  ],
  documents: new Map([[hash, pdf]]),
  tools: [],
  signal: new AbortController().signal,
  ...overrides,
});

const capturingTransport = (wire: Wire) => {
  const bodies: Array<Record<string, unknown>> = [];
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(init?.body as string) as Record<string, unknown>);
    return replyFor(wire);
  });
  const transport = createTauCloudGatewayModelTransport({
    baseUrl: 'https://gateway.example',
    fetch,
    model: { contextWindow: 200_000 },
  });
  return { transport, fetch, bodies };
};

const drain = async (stream: AsyncIterable<ModelStreamEvent>): Promise<void> => {
  // oxlint-disable-next-line no-unused-vars -- Draining is the point.
  for await (const _event of stream) {
    // Drain.
  }
};

const userContent = (body: Record<string, unknown>, key: string): unknown[] => {
  const messages = body[key] as Array<{ role: string; content: unknown }>;
  const user = messages.find((message) => message.role === 'user');
  return user?.content as unknown[];
};

describe('rewriteDocuments', () => {
  it('returns undefined and leaves the payload untouched when there is nothing to rewrite', () => {
    const payload = { messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] };
    const before = structuredClone(payload);

    expect(rewriteDocuments(undefined, 'anthropic-messages')(payload)).toBeUndefined();
    expect(rewriteDocuments(new Map([[hash, pdf]]), 'openai-completions')(payload)).toBeUndefined();
    expect(payload).toEqual(before);
  });

  it('falls back to <hash>.pdf when the document has no usable name', () => {
    const tooLong = `${'x'.repeat(253)}.pdf`;
    for (const filename of [undefined, tooLong]) {
      const payload = { input: [{ role: 'user', content: [{ type: 'input_text', text: sentinel }] }] };
      const document: MaterializedDocument = { data: pdfData, mediaType: 'application/pdf', filename };

      rewriteDocuments(new Map([[hash, document]]), 'openai-responses')(payload);

      expect(payload.input[0]?.content[0]).toEqual({
        type: 'input_file',
        filename: `${hash}.pdf`,
        file_data: `data:application/pdf;base64,${pdfData}`,
      });
    }
  });

  it('keeps the Anthropic cache breakpoint on the document block that replaces its sentinel (P33)', () => {
    const payload = {
      messages: [{ role: 'user', content: [{ type: 'text', text: sentinel, cache_control: { type: 'ephemeral' } }] }],
    };

    rewriteDocuments(new Map([[hash, pdf]]), 'anthropic-messages')(payload);

    const [block] = payload.messages[0]!.content;
    expect(gatewayDocumentSchemas['anthropic-messages'].parse(block)).toEqual({
      type: 'document',
      title: 'bracket-spec.pdf',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfData },
      cache_control: { type: 'ephemeral' },
    });
  });

  it('turns an embedded sentinel into a neutral marker, named when the side table names it (P32)', () => {
    const embedded = (text: string) => ({ messages: [{ role: 'user', content: [{ type: 'text', text }] }] });
    const named = embedded(`[User]: read this\n${sentinel}\n\n[Assistant]: ok`);
    const unnamed = embedded(`<conversation>\n[User]: ${sentinel}\n</conversation>`);
    const bare = { messages: [{ role: 'user', content: `see ${sentinel}` }] };

    expect(rewriteDocuments(new Map([[hash, pdf]]), 'openai-completions')(named)).toBe(named);
    rewriteDocuments(undefined, 'anthropic-messages')(unnamed);
    rewriteDocuments(undefined, 'openai-completions')(bare);

    expect(named.messages[0]?.content[0]?.text).toBe(
      '[User]: read this\n[attached document: bracket-spec.pdf]\n\n[Assistant]: ok',
    );
    expect(unnamed.messages[0]?.content[0]?.text).toBe('<conversation>\n[User]: [attached document]\n</conversation>');
    expect(bare.messages[0]?.content).toBe('see [attached document]');
  });

  it('refuses a standalone sentinel the side table cannot resolve (D21)', () => {
    const payload = { messages: [{ role: 'user', content: [{ type: 'text', text: sentinel }] }] };

    expect(() => rewriteDocuments(undefined, 'anthropic-messages')(payload)).toThrow(
      `names a document this request does not carry`,
    );
    expect(() => rewriteDocuments(new Map([['b'.repeat(64), pdf]]), 'anthropic-messages')(payload)).toThrow(
      `names a document this request does not carry`,
    );
  });

  it('refuses a payload that still holds a sentinel sequence after the rewrite (D21)', () => {
    const malformed = {
      messages: [{ role: 'user', content: [{ type: 'text', text: `${sentinelOpening}NOT-A-HASH⟄` }] }],
    };

    expect(() => rewriteDocuments(new Map([[hash, pdf]]), 'openai-completions')(malformed)).toThrow(
      'a document sentinel would reach the provider',
    );
  });

  it('refuses a document the gateway cannot admit', () => {
    const payload = { messages: [{ role: 'user', content: [{ type: 'text', text: sentinel }] }] };
    const text: MaterializedDocument = { data: pdfData, mediaType: 'text/plain' };

    expect(() => rewriteDocuments(new Map([[hash, text]]), 'openai-completions')(payload)).toThrow(
      'text/plain documents are not supported',
    );
  });
});

describe('gateway transport document rewrite (D21, D22)', () => {
  it.each(wires)(
    'posts the $wire native document block with the PDF bytes, in the sentinel position and with no sentinel',
    async ({ wire, providerKind, messagesKey }) => {
      const { transport, bodies } = capturingTransport(wire);

      await drain(transport.stream(request({ providerKind })));

      expect(bodies).toHaveLength(1);
      const body = bodies[0]!;
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain(sentinelOpening);
      expect(serialized).toContain(pdfData);
      const content = userContent(body, messagesKey);
      expect(content).toHaveLength(3);
      // Position: prompt caching keys on the prefix, so the block takes the sentinel's slot.
      expect(content[0]).toMatchObject({ text: 'What hole diameter does the attached spec require?' });
      expect(content[2]).toMatchObject({ text: 'Answer in millimetres.' });
      expect(gatewayDocumentSchemas[wire].safeParse(content[1]).success).toBe(true);
    },
  );

  it('posts a trailing Anthropic PDF as the rolling cache breakpoint (P33)', async () => {
    const { transport, bodies } = capturingTransport('anthropic-messages');
    const trailing: ProviderMessage = {
      id: 'user-1',
      role: 'user',
      content: [
        { type: 'text', text: 'What hole diameter does the attached spec require?' },
        { type: 'text', text: sentinel },
      ],
    };

    await drain(transport.stream(request({ providerKind: 'anthropic', messages: [trailing] })));

    const content = userContent(bodies[0]!, 'messages');
    expect(content.at(-1)).toEqual({
      type: 'document',
      title: 'bracket-spec.pdf',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfData },
      cache_control: { type: 'ephemeral' },
    });
    expect(gatewayDocumentSchemas['anthropic-messages'].safeParse(content.at(-1)).success).toBe(true);
    expect(content[0]).not.toHaveProperty('cache_control');
  });

  it.each(wires)(
    'fails a $wire request whose sentinel has no side-table entry with INVALID_REQUEST before fetch',
    async ({ wire, providerKind }) => {
      const { transport, fetch } = capturingTransport(wire);

      const failure = await drain(transport.stream(request({ providerKind, documents: undefined }))).catch(
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(GatewayModelTransportError);
      expect(failure).toMatchObject({ code: 'INVALID_REQUEST' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('fails a request that would leak a sentinel with INVALID_REQUEST before fetch', async () => {
    const { transport, fetch } = capturingTransport('anthropic-messages');
    const leaking: ProviderMessage = {
      id: 'user-1',
      role: 'user',
      content: [{ type: 'text', text: `${sentinelOpening}${'A'.repeat(64)}⟄` }],
    };

    const failure = await drain(transport.stream(request({ providerKind: 'anthropic', messages: [leaking] }))).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({ name: 'GatewayModelTransportError', code: 'INVALID_REQUEST' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes a request with no documents and no sentinels through byte-identical', async () => {
    const plain = { messages: [{ id: 'user-1', role: 'user', content: 'hello' }] as ProviderMessage[] };
    const withTable = capturingTransport('openai-completions');
    const without = capturingTransport('openai-completions');

    await drain(withTable.transport.stream(request({ providerKind: 'cerebras', ...plain })));
    await drain(without.transport.stream(request({ providerKind: 'cerebras', ...plain, documents: undefined })));

    expect(withTable.bodies).toEqual(without.bodies);
    expect(JSON.stringify(without.bodies[0])).toContain('"content":"hello"');
  });

  it('composes with the Vertex thought-signature echo: one request carries both', async () => {
    const { transport, bodies } = capturingTransport('openai-completions');
    const signature = 'opaque-Gemini+/=signature';

    await drain(
      transport.stream(
        request({
          providerKind: 'vertexai',
          messages: [
            {
              id: 'user-1',
              role: 'user',
              content: [
                { type: 'text', text: 'Read this.' },
                { type: 'text', text: sentinel },
              ],
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [
                { type: 'toolCall', id: 'call-signed', name: 'read_file', arguments: {}, thoughtSignature: signature },
              ],
              metadata: {
                api: 'openai-completions',
                provider: 'vertexai',
                model: 'fixture-model',
                stopReason: 'toolUse',
              },
            },
            {
              id: 'tool-1',
              role: 'tool-output',
              toolCallId: 'call-signed',
              toolName: 'read_file',
              content: 'x',
              isError: false,
            },
          ],
        }),
      ),
    );

    const messages = bodies[0]!['messages'] as Array<Record<string, unknown>>;
    const user = messages.find((message) => message['role'] === 'user');
    const assistant = messages.find((message) => message['role'] === 'assistant');
    expect(user?.['content']).toHaveProperty([1], {
      type: 'file',
      file: { filename: 'bracket-spec.pdf', file_data: `data:application/pdf;base64,${pdfData}` },
    });
    expect(assistant?.['tool_calls']).toMatchObject([
      { id: 'call-signed', extra_content: { google: { thought_signature: signature } } },
    ]);
  });

  it('compacts history holding a PDF through the real summariser, with a marker and no sentinel on the wire (P32)', async () => {
    const pdfPath = `attachments/${hash}.pdf`;
    const base = {
      version: 1,
      leaderEpoch: 'history-epoch',
      recordedAt: '2026-09-16T00:00:00.000Z',
      runId: 'history-run',
      type: 'message.appended',
    } as const;
    const history: AgentLogEvent[] = [
      {
        ...base,
        sequence: 0,
        message: {
          id: 'history-pdf',
          role: 'user',
          content: [
            { type: 'text', text: 'Here is the bracket spec.' },
            { type: 'file-ref', path: pdfPath, mimeType: 'application/pdf', filename: 'bracket-spec.pdf' },
          ],
        },
      },
      ...Array.from(
        { length: 8 },
        (_, index): AgentLogEvent => ({
          ...base,
          sequence: index + 1,
          message: { id: `history-${index}`, role: 'user', content: String(index).repeat(4000) },
        }),
      ),
    ];
    const { transport, bodies, fetch } = capturingTransport('openai-completions');
    const session = await createAgentSession({
      chatId: 'chat-compaction',
      runId: 'run-compaction',
      leaderEpoch: 'compaction-epoch',
      systemPrompt: 'system',
      model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 8192 },
      modelTransport: transport,
      toolRegistry: { list: () => [], invoke: vi.fn() },
      eventLog: await createMemoryEventLog(history),
      attachments: { read: async (_chatId, path) => (path === pdfPath ? pdfBytes : undefined) },
    });

    await session.prompt({ id: 'turn-after', role: 'user', content: 'continue' });
    const snapshot = await session.snapshot();
    await session.close();

    expect(fetch).toHaveBeenCalledTimes(2);
    const [summary, generation] = bodies.map((body) => JSON.stringify(body));
    expect(summary).toContain('You are a context summarization assistant');
    // Pi's contentText joins the blocks with no separator; the table travels on no compaction request.
    expect(summary).toContain('[User]: Here is the bracket spec.[attached document]');
    for (const body of [summary, generation]) {
      expect(body).not.toContain(sentinelOpening);
    }
    expect(snapshot.messages.some((message) => JSON.stringify(message).includes('<summary>'))).toBe(true);
  });
});
