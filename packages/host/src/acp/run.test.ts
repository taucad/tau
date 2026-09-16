import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentBlock } from '@agentclientprotocol/sdk';
import type { ExternalAgentTurn, UserProviderMessage } from '@taucad/agent-host';

import { createAcpExternalAgentPort } from '#acp/run.js';
import type { AcpSession } from '#acp/session.js';
import type { AcpAdapter } from '#acp/registry.js';

const prompts: Array<string | readonly ContentBlock[]> = [];

vi.mock('#acp/session.js', () => ({
  openAcpSession: vi.fn(
    async (): Promise<AcpSession> => ({
      acpSessionId: 'acp-1',
      agent: {} as AcpSession['agent'],
      configOptions: undefined,
      modeId: undefined,
      contextLost: false,
      closed: new Promise<void>(() => undefined),
      prompt: async (prompt) => {
        prompts.push(prompt);
        return { stopReason: 'end_turn', configuration: {} } as unknown as Awaited<ReturnType<AcpSession['prompt']>>;
      },
      close: async () => undefined,
    }),
  ),
}));

const adapter: AcpAdapter = {
  id: 'codex',
  package: 'fixture',
  version: '0.0.0',
  configEnv: [],
  displayName: 'Codex',
  modulePath: '/nonexistent',
};

const imageHash = 'e'.repeat(64);
const pdfHash = 'f'.repeat(64);
const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10]);
const pdfBytes = new TextEncoder().encode('%PDF-1.7 acp');
const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

let root: string;

beforeEach(async () => {
  prompts.length = 0;
  root = await mkdtemp(join(tmpdir(), 'tau-acp-run-'));
  const attachments = join(root, '.tau', 'chats', 'chat-1', 'attachments');
  await mkdir(attachments, { recursive: true });
  await writeFile(join(attachments, `${imageHash}.png`), imageBytes);
  await writeFile(join(attachments, `${pdfHash}.pdf`), pdfBytes);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const turnWith = (message: UserProviderMessage): ExternalAgentTurn => ({
  agentId: 'codex',
  agent: { kind: 'acp', agentId: 'codex' },
  chatId: 'chat-1',
  runId: 'run-1',
  message,
  history: [],
  signal: new AbortController().signal,
  append: async () => undefined,
  remember: async () => undefined,
});

const run = async (message: UserProviderMessage): Promise<readonly ContentBlock[]> => {
  const port = createAcpExternalAgentPort({ agents: [adapter], workspaceRoot: root });
  await port.run(turnWith(message));
  await port.closeChat?.('chat-1');
  const [prompt] = prompts;
  if (!Array.isArray(prompt)) {
    throw new TypeError('The port sent no content blocks.');
  }
  return prompt;
};

describe('ACP attachment materialisation (D23)', () => {
  it('sends an image reference to the agent as a base64 image block', async () => {
    const message: UserProviderMessage = {
      id: 'user-1',
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'file-ref', path: `attachments/${imageHash}.png`, mimeType: 'image/png' },
      ],
    };
    const snapshot = structuredClone(message);

    const blocks = await run(message);

    expect(blocks).toEqual([
      { type: 'text', text: 'what is this?' },
      { type: 'image', data: base64(imageBytes), mimeType: 'image/png' },
    ]);
    expect(message).toEqual(snapshot);
  });

  it('sends a PDF reference to the agent as a resource with its blob', async () => {
    const blocks = await run({
      id: 'user-1',
      role: 'user',
      content: [
        { type: 'file-ref', path: `attachments/${pdfHash}.pdf`, mimeType: 'application/pdf', filename: 'a.pdf' },
      ],
    });

    expect(blocks).toEqual([
      {
        type: 'resource',
        resource: { uri: `tau://attachments/${pdfHash}.pdf`, blob: base64(pdfBytes), mimeType: 'application/pdf' },
      },
    ]);
  });

  it('omits a reference whose bytes are absent and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const blocks = await run({
      id: 'user-1',
      role: 'user',
      content: [
        { type: 'text', text: 'and this?' },
        { type: 'file-ref', path: `attachments/${'0'.repeat(64)}.png`, mimeType: 'image/png' },
      ],
    });

    expect(blocks).toEqual([{ type: 'text', text: 'and this?' }]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('still sends a legacy inline image block unchanged', async () => {
    const blocks = await run({
      id: 'user-1',
      role: 'user',
      content: [{ type: 'image', mimeType: 'image/png', data: 'bGVnYWN5' }],
    });

    expect(blocks).toEqual([{ type: 'image', data: 'bGVnYWN5', mimeType: 'image/png' }]);
  });
});
