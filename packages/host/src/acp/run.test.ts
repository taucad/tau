import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentBlock } from '@agentclientprotocol/sdk';
import type { ExternalAgentTurn, ProviderMessage, UserProviderMessage } from '@taucad/agent-host';

import { createCallbackLogic } from 'xstate';

import { createAcpExternalAgentPort, handoffBlocks } from '#acp/run.js';
import type { AcpConnectionCommand, AcpConnectionInput } from '#acp/acp-session.machine.js';
import type { AcpAdapter } from '#acp/registry.js';

const prompts: Array<readonly ContentBlock[]> = [];

/* Only the adapter is faked: the machines, the facade and the pure helpers stay real. */
vi.mock('#acp/adapter-connection.js', () => ({
  createAdapterConnection: () =>
    createCallbackLogic<AcpConnectionCommand, AcpConnectionInput>(({ sendBack, receive }) => {
      receive((command) => {
        if (command.type === 'call') {
          if (command.method === 'session/prompt') {
            prompts.push(command.params.prompt);
          }
          const result =
            command.method === 'initialize'
              ? {
                  protocolVersion: 1,
                  agentCapabilities: { promptCapabilities: { image: true, embeddedContext: true } },
                }
              : command.method === 'session/new'
                ? { sessionId: 'acp-1' }
                : command.method === 'session/prompt'
                  ? { stopReason: 'end_turn' }
                  : {};
          sendBack({ type: 'callSettled', id: command.id, at: 0, answer: { method: command.method, result } });
        } else if (command.type === 'terminate' || command.type === 'kill') {
          sendBack({ type: 'adapterExited', stderr: '' });
        }
      });
    }),
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
const imageBytes: Uint8Array<ArrayBuffer> = new Uint8Array([137, 80, 78, 71, 13, 10]);
const pdfBytes = new TextEncoder().encode('%PDF-1.7 acp');
const base64 = (bytes: Uint8Array<ArrayBuffer>): string => Buffer.from(bytes).toString('base64');

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
  agent: { kind: 'acp', id: 'codex' },
  chatId: 'chat-1',
  runId: 'run-1',
  attempt: 1,
  message,
  history: [],
  signal: new AbortController().signal,
  append: async () => undefined,
  remember: async () => undefined,
  approve: async () => {
    throw new Error('No approval is expected in this test.');
  },
});

const run = async (message: UserProviderMessage, turns = 1): Promise<readonly ContentBlock[]> => {
  const port = createAcpExternalAgentPort({ agents: [adapter], workspaceRoot: root });
  for (let turn = 0; turn < turns; turn++) {
    // oxlint-disable-next-line no-await-in-loop -- one chat's turns are sequential.
    await port.run(turnWith(message));
  }
  await port.closeChat?.('chat-1');
  const [prompt] = prompts;
  if (prompt === undefined) {
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

  it('sends a PDF reference to the agent as a resource_link to the file and a resource with its blob', async () => {
    const blocks = await run({
      id: 'user-1',
      role: 'user',
      content: [
        { type: 'file-ref', path: `attachments/${pdfHash}.pdf`, mimeType: 'application/pdf', filename: 'a.pdf' },
      ],
    });

    /* The link comes first: codex-acp has no document item, so the blob reaches the
     * model as raw base64 text. The link is what its own PDF tooling can open. */
    expect(blocks).toEqual([
      {
        type: 'resource_link',
        uri: pathToFileURL(join(root, '.tau', 'chats', 'chat-1', 'attachments', `${pdfHash}.pdf`)).href,
        name: 'a.pdf',
      },
      {
        type: 'resource',
        resource: { uri: `tau://attachments/${pdfHash}.pdf`, blob: base64(pdfBytes), mimeType: 'application/pdf' },
      },
    ]);
  });

  it('names the resource_link by the attachment file when the reference carries no filename', async () => {
    const [link] = await run({
      id: 'user-1',
      role: 'user',
      content: [{ type: 'file-ref', path: `attachments/${pdfHash}.pdf`, mimeType: 'application/pdf' }],
    });

    expect(link).toEqual({
      type: 'resource_link',
      uri: pathToFileURL(join(root, '.tau', 'chats', 'chat-1', 'attachments', `${pdfHash}.pdf`)).href,
      name: `${pdfHash}.pdf`,
    });
  });

  it('omits a reference whose bytes are absent and warns once across turns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const blocks = await run(
      {
        id: 'user-1',
        role: 'user',
        content: [
          { type: 'text', text: 'and this?' },
          { type: 'file-ref', path: `attachments/${'0'.repeat(64)}.png`, mimeType: 'image/png' },
        ],
      },
      2,
    );

    expect(prompts).toHaveLength(2);
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

describe('the chat handoff an ACP prompt carries', () => {
  const marked = (id: string, content: string, acpSessionId?: string): ProviderMessage => ({
    id,
    role: 'user',
    content,
    metadata: {
      tauInternal: {
        kind: 'external-agent',
        agentId: 'codex',
        runKind: 'acp',
        ...(acpSessionId === undefined ? {} : { acpSessionId }),
      },
    },
  });
  const said = (id: string, role: 'user' | 'assistant', text: string): ProviderMessage =>
    role === 'user' ? { id, role, content: text } : { id, role, content: [{ type: 'text', text }] };
  const turnOf = (transcript: readonly ProviderMessage[], message: ProviderMessage): ExternalAgentTurn =>
    ({ agentId: 'codex', message, transcript }) as unknown as ExternalAgentTurn;
  const textOf = (blocks: readonly ContentBlock[]): string =>
    blocks.map((block) => (block.type === 'resource' && 'text' in block.resource ? block.resource.text : '')).join('');

  /* Only a session's opening turn has to name it: its later turns' markers continue the most recent named session. */
  it('should carry only the foreign turn after a session ran turns 1–3 with bare markers on 2 and 3', () => {
    const current = marked('turn-4', 'fourth');
    const transcript = [
      marked('turn-1', 'first', 'session-1'),
      said('answer-1', 'assistant', 'one'),
      marked('turn-2', 'second'),
      said('answer-2', 'assistant', 'two'),
      marked('turn-3', 'third'),
      said('answer-3', 'assistant', 'three'),
      said('phone-1', 'user', 'from the phone'),
      said('phone-answer-1', 'assistant', 'phone answer'),
      current,
    ];

    const text = textOf(handoffBlocks(turnOf(transcript, current), 'session-1'));

    expect(text).toContain('from the phone');
    expect(text).toContain('phone answer');
    expect(text).not.toContain('second');
    expect(text).not.toContain('three');
  });

  /* The block is bounded whatever the newest message's size: its tail is kept, and says it was cut. */
  it('should cut an oversized newest message to the budget, keeping its tail', () => {
    const current = marked('turn-2', 'next');
    const huge = `${'x'.repeat(40_000)}THE END`;
    const transcript = [said('phone-1', 'user', huge), current];

    const text = textOf(handoffBlocks(turnOf(transcript, current), undefined));

    expect(text.length).toBeLessThan(25_000);
    expect(text).toContain('THE END');
    expect(text).toContain('[earlier text cut]');
  });
});
