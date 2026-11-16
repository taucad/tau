/* eslint-disable @typescript-eslint/naming-convention -- the adapters' own `rawOutput` and `_meta` keys keep their wire names. */
/**
 * Agent media leaves the durable log for the chat's attachments.
 *
 * Driven through the composition `run.ts` uses — the turn projection appending
 * through the media store — with the notifications codex-acp 1.7.0 and
 * claude-agent-acp 0.70.0 actually send, then read back the way a later turn
 * and a client read them: the reducer, then `materializeAttachments`.
 */

import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionUpdate } from '@agentclientprotocol/sdk';
import { materializeAttachments, reduceEventLog } from '@taucad/agent-host';
import type { AgentLogEvent, ExternalAgentLogEvent, ProviderMessage } from '@taucad/agent-host';
import { createNodeAttachmentReader } from '@taucad/agent-host/node';
import type { TranscodeResult } from '@taucad/runtime/types';

import { createAcpMediaStore, runtimeTranscodePort, saveChatAttachment } from '#acp/media.js';
import type { AgentMediaTranscoder } from '#acp/media.js';
import { createTurnProjection } from '#acp/session.js';

/** A real 1×1 PNG, so the stored file is an image a viewer can open. */
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pngPath = /^attachments\/[\da-f]{64}\.png$/u;
const chatId = 'chat-media';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const record = async (
  updates: readonly SessionUpdate[],
  transcoder?: AgentMediaTranscoder,
): Promise<{
  readonly workspaceRoot: string;
  readonly appended: readonly ExternalAgentLogEvent[];
  readonly messages: readonly ProviderMessage[];
}> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-acp-media-'));
  roots.push(workspaceRoot);
  const appended: ExternalAgentLogEvent[] = [];
  const moveMedia = createAcpMediaStore(workspaceRoot, chatId, transcoder);
  const projection = createTurnProjection({
    agentId: 'codex',
    createId: randomUUID,
    turn: {
      append: async (events) => {
        appended.push(...(await moveMedia(events)));
      },
      approve: async () => ({ interruptId: 'unused', outcome: 'cancelled' }),
      publishLive: async () => undefined,
      signal: new AbortController().signal,
    },
  });
  for (const update of updates) {
    projection.update(update);
  }
  await projection.flush();
  const messages = reduceEventLog(
    appended.map(
      (event, sequence) =>
        ({
          ...event,
          version: 1,
          leaderEpoch: 'test',
          sequence,
          recordedAt: new Date(0).toISOString(),
          runId: 'run',
        }) satisfies AgentLogEvent,
    ),
  );
  return { workspaceRoot, appended, messages };
};

/** The `imageGeneration` item of codex-acp 1.7.0, start then completion, as it sends them. */
const codexImageGeneration: readonly SessionUpdate[] = [
  {
    sessionUpdate: 'tool_call',
    toolCallId: 'exec-1',
    kind: 'other',
    title: 'Image generation',
    status: 'in_progress',
    rawInput: { id: 'exec-1' },
  },
  {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'exec-1',
    status: 'completed',
    content: [
      { type: 'content', content: { type: 'text', text: 'Revised prompt: a relief model render' } },
      {
        type: 'content',
        content: {
          type: 'image',
          data: png,
          mimeType: 'image/png',
          uri: '/Users/me/.codex/generated_images/t/exec-1.png',
        },
      },
    ],
    rawOutput: { status: 'completed', revisedPrompt: 'a relief model render', result: png, savedPath: '/x/exec-1.png' },
  },
];

describe('ACP agent media', () => {
  it('stores a Codex render once and names it by reference on every row', async () => {
    const { workspaceRoot, appended, messages } = await record(codexImageGeneration);

    // The payload never reaches the log; the file holds the exact bytes.
    expect(JSON.stringify(appended)).not.toContain(png);
    const files = await readdir(join(workspaceRoot, '.tau', 'chats', chatId, 'attachments'));
    expect(files).toHaveLength(1);
    await expect(readFile(join(workspaceRoot, '.tau', 'chats', chatId, 'attachments', files[0]!))).resolves.toEqual(
      Buffer.from(png, 'base64'),
    );

    const output = messages.find((message) => message.role === 'tool-output');
    const reference = {
      type: 'file-ref',
      path: expect.stringMatching(pngPath) as string,
      mimeType: 'image/png',
      byteLength: Buffer.from(png, 'base64').length,
      filename: 'exec-1.png',
    };
    expect(output?.call?.content).toEqual([
      { type: 'content', content: { type: 'text', text: 'Revised prompt: a relief model render' } },
      { type: 'content', content: reference },
    ]);
    // Codex's raw output repeats the base64; it now names the same file.
    expect(output?.content).toMatchObject({ result: `attachments/${files[0]!}`, savedPath: '/x/exec-1.png' });
  });

  it("stores an agent's own image and reads it back as the bytes a model sees", async () => {
    const { workspaceRoot, messages } = await record([
      // Claude's adapter: an assistant image chunk, and a tool result's image (Read on a PNG).
      {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'm1',
        content: { type: 'image', data: png, mimeType: 'image/png' },
      },
      { sessionUpdate: 'tool_call', toolCallId: 'read', kind: 'read', title: 'Read shot.png', status: 'pending' },
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'read',
        status: 'completed',
        content: [{ type: 'content', content: { type: 'image', data: png, mimeType: 'image/png' } }],
        rawOutput: [{ type: 'image', data: png, mimeType: 'image/png' }],
      },
    ]);

    const assistant = messages.find((message) => message.role === 'assistant');
    expect(assistant?.content).toEqual([
      {
        type: 'file-ref',
        path: expect.stringMatching(pngPath) as string,
        mimeType: 'image/png',
        byteLength: Buffer.from(png, 'base64').length,
      },
    ]);
    const reader = createNodeAttachmentReader(workspaceRoot);
    const outcome = await materializeAttachments(messages, async (path) => reader.read(chatId, path));
    expect(outcome.malformed).toBe(0);
    expect(outcome.absent).toEqual([]);
    // A later Tau-model turn replays the agent's image, and the result row's, as inline bytes again.
    expect(outcome.messages.find((message) => message.role === 'assistant')?.content).toEqual([
      { type: 'image', mimeType: 'image/png', data: png },
    ]);
    expect(outcome.messages.find((message) => message.role === 'tool-output')?.content).toEqual([
      { type: 'image', mimeType: 'image/png', data: png },
    ]);
  });

  it('moves an embedded PDF resource and a foreign MCP result image', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%%EOF\n').toString('base64');
    const { appended, messages } = await record([
      {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'doc',
        content: {
          type: 'resource',
          resource: { uri: 'file:///tmp/report.pdf', mimeType: 'application/pdf', blob: pdf },
        },
      },
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'mcp-1',
        kind: 'execute',
        title: 'mcp.browser.screenshot',
        status: 'completed',
        _meta: { is_mcp_tool_call: true },
        rawInput: { server: 'browser', tool: 'screenshot', arguments: {} },
        rawOutput: { result: { content: [{ type: 'image', data: png, mimeType: 'image/png' }] }, error: null },
      },
    ]);

    expect(JSON.stringify(appended)).not.toContain(pdf);
    expect(JSON.stringify(appended)).not.toContain(png);
    expect(messages.find((message) => message.role === 'assistant')?.content).toEqual([
      {
        type: 'file-ref',
        path: expect.stringMatching(/^attachments\/[\da-f]{64}\.pdf$/u) as string,
        mimeType: 'application/pdf',
        byteLength: Buffer.from(pdf, 'base64').length,
        filename: 'report.pdf',
      },
    ]);
    expect(messages.find((message) => message.role === 'tool-output')?.content).toMatchObject({
      result: {
        content: [{ type: 'file-ref', path: expect.stringMatching(pngPath) as string, mimeType: 'image/png' }],
      },
    });
  });

  it('should store an agent image declared image/jpeg that holds PNG bytes as the PNG it is', async () => {
    const { workspaceRoot, messages } = await record([
      {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'm1',
        content: { type: 'image', data: png, mimeType: 'image/jpeg' },
      },
    ]);

    expect(messages.find((message) => message.role === 'assistant')?.content).toEqual([
      {
        type: 'file-ref',
        path: expect.stringMatching(pngPath) as string,
        mimeType: 'image/png',
        byteLength: Buffer.from(png, 'base64').length,
      },
    ]);
    const files = await readdir(join(workspaceRoot, '.tau', 'chats', chatId, 'attachments'));
    expect(files).toEqual([expect.stringMatching(/^[\da-f]{64}\.png$/u)]);
  });

  it('should name a saved attachment by its bytes, not by the declared media type', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-acp-media-'));
    roots.push(workspaceRoot);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x30, 0x03]).toString(
      'base64',
    );

    const saved = await saveChatAttachment({ workspaceRoot, chatId, data: jpeg, mimeType: 'image/png' });

    expect(saved.path).toMatch(/^attachments\/[\da-f]{64}\.jpg$/u);
  });

  it.each([
    ['audio (no attachment path names it)', { type: 'audio', data: 'YXVkaW8=', mimeType: 'audio/wav' }],
    ['an SVG image (likewise)', { type: 'image', data: 'PHN2Zy8+', mimeType: 'image/svg+xml' }],
    ['a payload that is not canonical base64', { type: 'image', data: 'not base64!', mimeType: 'image/png' }],
  ] as const)('keeps %s inline, exactly as sent', async (_, content) => {
    const { messages } = await record([{ sessionUpdate: 'agent_message_chunk', messageId: 'm', content }]);
    expect(messages.map((message) => message.content)).toEqual([[content]]);
  });

  it('should store an agent image declared image/png that holds JPEG bytes as the .jpg it is', async () => {
    const { messages } = await record([
      {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'm',
        content: { type: 'image', data: jpeg, mimeType: 'image/png' },
      },
    ]);

    expect(messages.find((message) => message.role === 'assistant')?.content).toEqual([
      { type: 'file-ref', path: expect.stringMatching(jpgPath) as string, mimeType: 'image/jpeg', byteLength: 12 },
    ]);
  });
});

/** A 12-byte JPEG header: SOF0, 48×32, three components. Enough for the probe, which is all the storage policy reads. */
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x30, 0x03]).toString('base64');
const jpgPath = /^attachments\/[\da-f]{64}\.jpg$/u;

/** One ISO-BMFF box. */
const box = (type: string, ...body: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> => {
  const content = Buffer.concat(body);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + content.length, 0);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, content]);
};

/** The header of a 48×32 AVIF: `ftyp` and a `meta` whose one `ispe` gives the size. No codec data: nothing decodes it. */
const avif = Buffer.concat([
  box('ftyp', Buffer.from('avif'), Buffer.alloc(4), Buffer.from('mif1avif')),
  box(
    'meta',
    Buffer.alloc(4),
    box('iprp', box('ipco', box('ispe', Buffer.alloc(4), Buffer.from([0, 0, 0, 48]), Buffer.from([0, 0, 0, 32])))),
  ),
]).toString('base64');

const avifContent = (uri?: string): { type: 'image'; data: string; mimeType: string; uri?: string } => ({
  type: 'image',
  data: avif,
  mimeType: 'image/avif',
  ...(uri === undefined ? {} : { uri }),
});

const avifBlock = (uri?: string): SessionUpdate => ({
  sessionUpdate: 'agent_message_chunk',
  messageId: 'm',
  content: avifContent(uri),
});

describe('agent media through the host runtime transcoder', () => {
  const converting = (): { transcoder: AgentMediaTranscoder; port: ReturnType<typeof vi.fn> } => {
    const port = vi.fn(async () => new Uint8Array(Buffer.from(jpeg, 'base64')));
    return {
      port,
      transcoder: vi.fn(async () => ({ transcode: port, transcodeSources: ['avif', 'gif'] })),
    };
  };

  it('should store an AVIF block as the JPEG the port converts it to', async () => {
    const { transcoder, port } = converting();
    const { workspaceRoot, appended, messages } = await record([avifBlock('file:///tmp/render.avif')], transcoder);

    expect(port).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'avif',
        to: 'jpeg',
        options: { maxEdge: 1568, maxBytes: 1024 * 1024, background: '#FFFFFF' },
      }),
    );
    expect(JSON.stringify(appended)).not.toContain(avif);
    expect(messages.find((message) => message.role === 'assistant')?.content).toEqual([
      {
        type: 'file-ref',
        path: expect.stringMatching(jpgPath) as string,
        mimeType: 'image/jpeg',
        byteLength: 12,
        filename: 'render.jpg',
      },
    ]);
    const files = await readdir(join(workspaceRoot, '.tau', 'chats', chatId, 'attachments'));
    expect(files).toEqual([expect.stringMatching(/^[\da-f]{64}\.jpg$/u)]);
  });

  it('should keep an AVIF block inline without a transcoder, as before', async () => {
    const { messages } = await record([avifBlock()]);

    expect(messages.map((message) => message.content)).toEqual([[avifContent()]]);
  });

  it.each([
    ['converts nothing', async (): Promise<undefined> => undefined],
    [
      'cannot start',
      async () => {
        throw new Error('This Tau Host has no runtime attached.');
      },
    ],
    [
      'rejects the conversion',
      async () => ({
        transcode: async () => {
          throw new Error('decode failed');
        },
        transcodeSources: ['avif'],
      }),
    ],
    [
      'has no edge from AVIF',
      async () => ({ transcode: async () => new Uint8Array(Buffer.from(jpeg, 'base64')), transcodeSources: ['gif'] }),
    ],
  ] as const)('should keep an AVIF block inline when the runtime %s', async (_label, transcoder) => {
    const { messages } = await record([avifBlock()], transcoder);

    expect(messages.map((message) => message.content)).toEqual([[avifContent()]]);
  });

  it('should store canonical media unchanged without starting the runtime (I6)', async () => {
    const { transcoder } = converting();
    const { messages } = await record(
      [
        {
          sessionUpdate: 'agent_message_chunk',
          messageId: 'm',
          content: { type: 'image', data: png, mimeType: 'image/jpeg' },
        },
      ],
      transcoder,
    );

    expect(transcoder).not.toHaveBeenCalled();
    expect(messages.find((message) => message.role === 'assistant')?.content).toEqual([
      {
        type: 'file-ref',
        path: expect.stringMatching(pngPath) as string,
        mimeType: 'image/png',
        byteLength: Buffer.from(png, 'base64').length,
      },
    ]);
  });
});

describe('runtimeTranscodePort', () => {
  const input = {
    from: 'avif',
    to: 'jpeg',
    files: [{ name: 'attachment.avif', mimeType: 'image/avif', bytes: new Uint8Array(Buffer.from(avif, 'base64')) }],
    options: { maxEdge: 1568, maxBytes: 1024 * 1024, background: '#FFFFFF' },
  } as const;

  it('should pass the conversion to the client and resolve to the converted bytes', async () => {
    const bytes = new Uint8Array(Buffer.from(jpeg, 'base64'));
    const transcode = vi.fn(async () => ({
      success: true,
      data: [{ name: 'attachment.jpg', mimeType: 'image/jpeg', bytes }],
      issues: [],
    }));

    await expect(runtimeTranscodePort({ transcode })(input)).resolves.toEqual(bytes);
    expect(transcode).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'avif',
        to: 'jpeg',
        files: input.files,
        options: input.options,
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
  });

  it('should reject with the runtime issues when the conversion fails', async () => {
    const transcode = vi.fn(
      async (): Promise<TranscodeResult> => ({
        success: false,
        issues: [{ message: 'Image is larger than 50000000 pixels', code: 'RESOURCE_LIMIT', severity: 'error' }],
      }),
    );

    await expect(runtimeTranscodePort({ transcode })(input)).rejects.toThrow('Image is larger than 50000000 pixels');
  });
});
