import { describe, expect, it, vi } from 'vitest';
import type { JsonValue, ProviderMessage } from '#log/event-types.js';
import {
  absentAttachmentMarker,
  chatAttachmentPath,
  createSessionRecord,
  createTransportFailureDiagnostic,
  documentSentinel,
  hasFileRef,
  materializeAttachments,
} from '#harness/session-record.js';
import { createMemoryLogFile } from '#host/tau-agent-host.fixture.js';
import { imageBytes as headerBytes } from '#wire/attachment-media.fixture.js';

const imageHash = 'a'.repeat(64);
const pdfHash = 'b'.repeat(64);
const imagePath = `attachments/${imageHash}.png`;
const pdfPath = `attachments/${pdfHash}.pdf`;
const imageBytes: Uint8Array<ArrayBuffer> = new Uint8Array([137, 80, 78, 71]);
const pdfBytes = new TextEncoder().encode('%PDF-1.7');
const base64 = (bytes: Uint8Array<ArrayBuffer>): string => Buffer.from(bytes).toString('base64');
const hashOfPath = (path: string): string => path.slice('attachments/'.length, 'attachments/'.length + 64);

const history = (): ProviderMessage[] => [
  {
    id: 'user-1',
    role: 'user',
    content: [
      { type: 'text', text: 'look at these' },
      // `byteLength` is optional (P29): this row carries none.
      { type: 'file-ref', path: imagePath, mimeType: 'image/png' },
      {
        type: 'file-ref',
        path: pdfPath,
        mimeType: 'application/pdf',
        byteLength: 8,
        filename: 'spec.pdf',
      },
    ],
    metadata: { timestamp: 1 },
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    content: [{ type: 'text', text: 'ok' }],
  },
  {
    id: 'user-legacy',
    role: 'user',
    content: [{ type: 'image', mimeType: 'image/png', data: 'bGVnYWN5' }],
  },
];

const reader = (files: Record<string, Uint8Array<ArrayBuffer>>) =>
  vi.fn(async (path: string): Promise<Uint8Array<ArrayBuffer> | undefined> => files[path]);

describe('materializeAttachments', () => {
  it('replaces an image file-ref with a base64 image and a document file-ref with a sentinel and a side-table entry', async () => {
    const outcome = await materializeAttachments(history(), reader({ [imagePath]: imageBytes, [pdfPath]: pdfBytes }));

    expect(outcome.messages[0]?.content).toEqual([
      { type: 'text', text: 'look at these' },
      { type: 'image', mimeType: 'image/png', data: base64(imageBytes) },
      { type: 'text', text: `⟃tau:document:${pdfHash}⟄` },
    ]);
    expect(outcome.documents).toEqual(
      new Map([
        [
          pdfHash,
          {
            data: base64(pdfBytes),
            mediaType: 'application/pdf',
            filename: 'spec.pdf',
          },
        ],
      ]),
    );
    expect(outcome.absent).toEqual([]);
    expect(documentSentinel(pdfHash)).toBe(`⟃tau:document:${pdfHash}⟄`);
  });

  it('leaves the durable rows unchanged and keeps unreferenced messages, including legacy inline images, as they are', async () => {
    const input = history();
    const snapshot = structuredClone(input);

    const outcome = await materializeAttachments(input, reader({ [imagePath]: imageBytes, [pdfPath]: pdfBytes }));

    expect(input).toEqual(snapshot);
    expect(outcome.messages[0]).not.toBe(input[0]);
    expect(outcome.messages[1]).toBe(input[1]);
    expect(outcome.messages[2]).toBe(input[2]);
  });

  it("materializes an external agent's image on its assistant and tool-output rows, and never a tool-input", async () => {
    const reference = {
      type: 'file-ref',
      path: imagePath,
      mimeType: 'image/png',
    } as const;
    const outcome = await materializeAttachments(
      [
        { id: 'assistant-image', role: 'assistant', content: [reference] },
        {
          id: 'call',
          role: 'tool-input',
          toolCallId: 't',
          toolName: 'Read',
          content: [reference],
        },
        {
          id: 'result',
          role: 'tool-output',
          toolCallId: 't',
          toolName: 'Read',
          content: [reference],
          isError: false,
        },
      ],
      reader({ [imagePath]: imageBytes }),
    );

    const image = {
      type: 'image',
      mimeType: 'image/png',
      data: base64(imageBytes),
    };
    expect(outcome.messages.map((message) => message.content)).toEqual([[image], [reference], [image]]);
  });

  it('omits a reference whose bytes are absent and reports its path instead of throwing', async () => {
    const outcome = await materializeAttachments(history(), reader({ [pdfPath]: pdfBytes }));

    expect(outcome.messages[0]?.content).toEqual([
      { type: 'text', text: 'look at these' },
      { type: 'text', text: documentSentinel(pdfHash) },
    ]);
    expect(outcome.absent).toEqual([imagePath]);
  });

  it('omits a malformed file-ref row rather than passing it on', async () => {
    const outcome = await materializeAttachments(
      [
        {
          id: 'user-bad',
          role: 'user',
          content: [
            {
              type: 'file-ref',
              path: '../../etc/passwd',
              mimeType: 'image/png',
            },
          ],
        },
      ],
      reader({}),
    );

    expect(outcome.messages[0]?.content).toEqual([{ type: 'text', text: absentAttachmentMarker }]);
    expect(outcome.absent).toEqual([]);
    expect(outcome.malformed).toBe(1);
  });

  it('should keep a user message whose only attachment is absent, as a marker the model can read (F10)', async () => {
    const outcome = await materializeAttachments(
      [
        {
          id: 'user-only',
          role: 'user',
          content: [{ type: 'file-ref', path: imagePath, mimeType: 'image/png' }],
        },
      ],
      reader({}),
    );

    expect(outcome.messages[0]?.content).toEqual([{ type: 'text', text: absentAttachmentMarker }]);
    expect(outcome.absent).toEqual([imagePath]);
  });

  it('should treat an attachment the reader cannot read as absent instead of rejecting (F11)', async () => {
    const read = vi.fn(async (path: string): Promise<Uint8Array<ArrayBuffer> | undefined> => {
      if (path === imagePath) {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      }
      return pdfBytes;
    });

    const outcome = await materializeAttachments(history().slice(0, 1), read);

    expect(outcome.absent).toEqual([imagePath]);
    expect(outcome.documents.has(pdfHash)).toBe(true);
  });

  it('builds documents with the caller-supplied block', async () => {
    const outcome = await materializeAttachments(
      history().slice(0, 1),
      reader({ [imagePath]: imageBytes, [pdfPath]: pdfBytes }),
      (hash, document) => ({
        type: 'resource',
        resource: { uri: `tau://attachments/${hash}.pdf`, blob: document.data },
      }),
    );

    expect(outcome.messages[0]?.content).toContainEqual({
      type: 'resource',
      resource: {
        uri: `tau://attachments/${pdfHash}.pdf`,
        blob: base64(pdfBytes),
      },
    });
  });

  it('flattens a builder that carries one document as several blocks, in its own order', async () => {
    const outcome = await materializeAttachments(
      history().slice(0, 1),
      reader({ [imagePath]: imageBytes, [pdfPath]: pdfBytes }),
      (hash, document, reference): readonly JsonValue[] => [
        {
          type: 'resource_link',
          uri: `file:///${reference.path}`,
          name: reference.filename ?? hash,
        },
        {
          type: 'resource',
          resource: {
            uri: `tau://attachments/${hash}.pdf`,
            blob: document.data,
          },
        },
      ],
    );

    expect(outcome.messages[0]?.content).toEqual([
      { type: 'text', text: 'look at these' },
      { type: 'image', mimeType: 'image/png', data: base64(imageBytes) },
      { type: 'resource_link', uri: `file:///${pdfPath}`, name: 'spec.pdf' },
      {
        type: 'resource',
        resource: {
          uri: `tau://attachments/${pdfHash}.pdf`,
          blob: base64(pdfBytes),
        },
      },
    ]);
  });
});

describe('materializeAttachments — labels from the bytes (I1, I10)', () => {
  const jpgPath = `attachments/${'c'.repeat(64)}.jpg`;
  const reference = (mimeType: string): ProviderMessage => ({
    id: 'user-stuck',
    role: 'user',
    content: [{ type: 'file-ref', path: jpgPath, mimeType }],
  });

  it('should send a file-ref recorded as image/jpeg that holds PNG bytes as an image/png block', async () => {
    const outcome = await materializeAttachments(
      [reference('image/jpeg')],
      reader({ [jpgPath]: new Uint8Array(headerBytes.png) }),
    );

    expect(outcome.messages[0]?.content).toEqual([
      {
        type: 'image',
        mimeType: 'image/png',
        data: base64(new Uint8Array(headerBytes.png)),
      },
    ]);
  });

  it('should send WebP bytes stored under a .jpg name as image/webp', async () => {
    const outcome = await materializeAttachments(
      [reference('image/jpeg')],
      reader({ [jpgPath]: new Uint8Array(headerBytes.webp) }),
    );

    expect(outcome.messages[0]?.content).toEqual([
      {
        type: 'image',
        mimeType: 'image/webp',
        data: base64(new Uint8Array(headerBytes.webp)),
      },
    ]);
  });

  it('should keep the durable row as recorded while repairing the label it sends', async () => {
    const row = reference('image/jpeg');
    await materializeAttachments([row], reader({ [jpgPath]: new Uint8Array(headerBytes.png) }));

    expect(row).toEqual(reference('image/jpeg'));
  });

  it('should send a document recorded as an image as the document its bytes are', async () => {
    const outcome = await materializeAttachments([reference('image/jpeg')], reader({ [jpgPath]: pdfBytes }));

    expect(outcome.messages[0]?.content).toEqual([{ type: 'text', text: documentSentinel(hashOfPath(jpgPath)) }]);
    expect([...outcome.documents.values()]).toEqual([{ data: base64(pdfBytes), mediaType: 'application/pdf' }]);
  });

  it('should keep the recorded type for bytes no probe recognises', async () => {
    const outcome = await materializeAttachments([reference('image/jpeg')], reader({ [jpgPath]: imageBytes }));

    expect(outcome.messages[0]?.content).toEqual([{ type: 'image', mimeType: 'image/jpeg', data: base64(imageBytes) }]);
  });
});

describe('createTransportFailureDiagnostic', () => {
  const codedFailure = (cause: unknown): Error & { readonly code: string } =>
    Object.assign(new Error('Tau model gateway request failed.', { cause }), {
      name: 'GatewayModelTransportError',
      code: 'NETWORK_ERROR',
    });

  it('names the errors under a network failure by name, code and syscall, never by message', () => {
    const refused = Object.assign(new Error(String.raw`connect ECONNREFUSED 127.0.0.1:4014 at C:\Users\someone`), {
      code: 'ECONNREFUSED',
      syscall: 'connect',
    });
    const diagnostic = createTransportFailureDiagnostic(
      codedFailure(new TypeError('fetch failed', { cause: refused })),
      7,
    );

    expect(diagnostic).toEqual({
      type: 'tau.model-transport-failure',
      timestamp: 7,
      error: {
        name: 'GatewayModelTransportError',
        message: 'Tau model gateway request failed.',
        code: 'NETWORK_ERROR',
      },
      details: {
        causes: [{ name: 'TypeError' }, { name: 'Error', code: 'ECONNREFUSED', syscall: 'connect' }],
      },
    });
    expect(JSON.stringify(diagnostic)).not.toContain('someone');
  });

  it("lists an aggregate cause's members", () => {
    const member = (code: string): Error => Object.assign(new Error(code), { code, syscall: 'connect' });
    const aggregate = Object.assign(new AggregateError([member('ECONNREFUSED'), member('EACCES')], 'connect failed'), {
      code: 'ECONNREFUSED',
    });

    expect(createTransportFailureDiagnostic(codedFailure(aggregate), 1)?.details).toEqual({
      causes: [
        {
          name: 'AggregateError',
          code: 'ECONNREFUSED',
          errors: [
            { name: 'Error', code: 'ECONNREFUSED', syscall: 'connect' },
            { name: 'Error', code: 'EACCES', syscall: 'connect' },
          ],
        },
      ],
    });
  });

  it('records no causes for a failure that has none', () => {
    expect(createTransportFailureDiagnostic(codedFailure(undefined), 1)).not.toHaveProperty('details');
  });

  it('stops after a bounded number of causes', () => {
    let cause: unknown;
    for (let index = 0; index < 10; index++) {
      cause = new Error(`layer ${index}`, { cause });
    }

    expect(createTransportFailureDiagnostic(codedFailure(cause), 1)?.details).toEqual({
      causes: [{ name: 'Error' }, { name: 'Error' }, { name: 'Error' }, { name: 'Error' }],
    });
  });
});

describe('chatAttachmentPath', () => {
  it('resolves an attachment beside the chat log', () => {
    expect(chatAttachmentPath('chat-1', pdfPath)).toBe(`.tau/chats/chat-1/${pdfPath}`);
  });

  it.each([
    ['..', pdfPath],
    ['a/b', pdfPath],
    ['chat-1', '../events.jsonl'],
    ['chat-1', 'attachments/short.pdf'],
  ])('refuses chat %s path %s', (chatId, path) => {
    expect(() => chatAttachmentPath(chatId, path)).toThrow(expect.objectContaining({ code: 'STORAGE_PATH_INVALID' }));
  });
});

describe('stored screenshot captures (D-UI-04)', () => {
  const webpPath = `attachments/${'e'.repeat(64)}.webp`;
  const webpBytes: Uint8Array<ArrayBuffer> = new Uint8Array([82, 73, 70, 70]);
  const stored = (): ProviderMessage => ({
    id: 'tool-output-1',
    role: 'tool-output',
    toolCallId: 'call-1',
    toolName: 'screenshot',
    content: {
      images: [
        {
          view: '3d',
          angle: 'front',
          path: webpPath,
          mimeType: 'image/webp',
          byteLength: webpBytes.byteLength,
          sha256: 'e'.repeat(64),
        },
      ],
      message: 'No section cut.',
    },
    isError: false,
  });

  it('is an unresolved reference until materialised', () => {
    expect(hasFileRef(stored())).toBe(true);
  });

  it('restores the capture bytes for the model without touching the durable row', async () => {
    const row = stored();
    const outcome = await materializeAttachments([row], reader({ [webpPath]: webpBytes }));

    expect(outcome.messages[0]?.content).toEqual({
      images: [
        {
          view: '3d',
          angle: 'front',
          dataUrl: `data:image/webp;base64,${base64(webpBytes)}`,
        },
      ],
      message: 'No section cut.',
    });
    expect(hasFileRef(outcome.messages[0]!)).toBe(false);
    expect(row).toEqual(stored());
  });

  it('should restore a capture recorded as image/webp that holds PNG bytes as a PNG data URL', async () => {
    const png = new Uint8Array(headerBytes.png);
    const outcome = await materializeAttachments([stored()], reader({ [webpPath]: png }));

    expect(outcome.messages[0]?.content).toEqual({
      images: [
        {
          view: '3d',
          angle: 'front',
          dataUrl: `data:image/png;base64,${base64(png)}`,
        },
      ],
      message: 'No section cut.',
    });
  });

  it('omits a capture whose bytes are not on this device and reports it absent', async () => {
    const outcome = await materializeAttachments([stored()], reader({}));

    expect(outcome.messages[0]?.content).toEqual({
      images: [],
      message: 'No section cut.',
    });
    expect(outcome.absent).toEqual([webpPath]);
    expect(hasFileRef(outcome.messages[0]!)).toBe(false);
  });

  it('leaves an external agent capture, which names its own readable file, as it is', async () => {
    const external = stored();
    const content = external.content as {
      images: Array<Record<string, unknown>>;
    };
    content.images[0]!['absolutePath'] = '/tmp/capture.webp';

    expect(hasFileRef(external)).toBe(false);
  });
});

describe('createSessionRecord', () => {
  // RA-S10: the history is the appender's incremental reduction, not a re-read and re-reduction of the file.
  it('should read history from the log it reduces as it appends', async () => {
    const log = await createMemoryLogFile().open();
    const record = await createSessionRecord({
      log,
      runId: 'run-1',
      leaderEpoch: 'epoch-1',
    });
    await record.append({
      type: 'message.appended',
      message: { id: 'user-1', role: 'user', content: 'Hello.' },
    });
    const read = vi.spyOn(log, 'read');

    expect(await record.history()).toEqual(await log.messages());
    expect(read).not.toHaveBeenCalled();
  });
});
