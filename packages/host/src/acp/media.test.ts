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

import { afterEach, describe, expect, it } from 'vitest';

import type { SessionUpdate } from '@agentclientprotocol/sdk';
import { materializeAttachments, reduceEventLog } from '@taucad/agent-host';
import type { AgentLogEvent, ProviderMessage } from '@taucad/agent-host';
import type { ExternalAgentLogEvent } from '@taucad/agent-host/node-launcher';
import { createNodeAttachmentReader } from '@taucad/agent-host/node';

import { createAcpMediaStore } from '#acp/media.js';
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
): Promise<{
  readonly workspaceRoot: string;
  readonly appended: readonly ExternalAgentLogEvent[];
  readonly messages: readonly ProviderMessage[];
}> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-acp-media-'));
  roots.push(workspaceRoot);
  const appended: ExternalAgentLogEvent[] = [];
  const moveMedia = createAcpMediaStore(workspaceRoot, chatId);
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

  it.each([
    ['audio (no attachment path names it)', { type: 'audio', data: 'YXVkaW8=', mimeType: 'audio/wav' }],
    ['an SVG image (likewise)', { type: 'image', data: 'PHN2Zy8+', mimeType: 'image/svg+xml' }],
    ['a payload that is not canonical base64', { type: 'image', data: 'not base64!', mimeType: 'image/png' }],
  ] as const)('keeps %s inline, exactly as sent', async (_, content) => {
    const { messages } = await record([{ sessionUpdate: 'agent_message_chunk', messageId: 'm', content }]);
    expect(messages.map((message) => message.content)).toEqual([[content]]);
  });
});
