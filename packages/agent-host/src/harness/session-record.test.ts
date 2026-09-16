import { describe, expect, it, vi } from 'vitest';
import type { ProviderMessage } from '#log/event-types.js';
import { chatAttachmentPath, documentSentinel, materializeAttachments } from '#harness/session-record.js';

const imageHash = 'a'.repeat(64);
const pdfHash = 'b'.repeat(64);
const imagePath = `attachments/${imageHash}.png`;
const pdfPath = `attachments/${pdfHash}.pdf`;
const imageBytes = new Uint8Array([137, 80, 78, 71]);
const pdfBytes = new TextEncoder().encode('%PDF-1.7');
const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

const history = (): ProviderMessage[] => [
  {
    id: 'user-1',
    role: 'user',
    content: [
      { type: 'text', text: 'look at these' },
      // byteLength is optional (P29): this row carries none.
      { type: 'file-ref', path: imagePath, mimeType: 'image/png' },
      { type: 'file-ref', path: pdfPath, mimeType: 'application/pdf', byteLength: 8, filename: 'spec.pdf' },
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

const reader = (files: Record<string, Uint8Array>) =>
  vi.fn(async (path: string): Promise<Uint8Array | undefined> => files[path]);

describe('materializeAttachments', () => {
  it('replaces an image file-ref with a base64 image and a document file-ref with a sentinel and a side-table entry', async () => {
    const outcome = await materializeAttachments(history(), reader({ [imagePath]: imageBytes, [pdfPath]: pdfBytes }));

    expect(outcome.messages[0]?.content).toEqual([
      { type: 'text', text: 'look at these' },
      { type: 'image', mimeType: 'image/png', data: base64(imageBytes) },
      { type: 'text', text: `⟃tau:document:${pdfHash}⟄` },
    ]);
    expect(outcome.documents).toEqual(
      new Map([[pdfHash, { data: base64(pdfBytes), mediaType: 'application/pdf', filename: 'spec.pdf' }]]),
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
          content: [{ type: 'file-ref', path: '../../etc/passwd', mimeType: 'image/png' }],
        },
      ],
      reader({}),
    );

    expect(outcome.messages[0]?.content).toEqual([]);
    expect(outcome.absent).toEqual(['a malformed file-ref row']);
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
      resource: { uri: `tau://attachments/${pdfHash}.pdf`, blob: base64(pdfBytes) },
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
