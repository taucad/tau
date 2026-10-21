import { createHash } from 'node:crypto';
import { watch } from 'node:fs';
import type * as NodeFileSystemModule from 'node:fs';
import { link, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import type * as NodeFileSystemPromisesModule from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport } from '#waist/ports.js';
import { createNodeAttachmentReader, createNodeChatStore } from '#node.js';
import { chatStoreBinding } from '#launchers/chat-store.js';
import type { AgentLogEvent } from '#log/event-types.js';
import { createAgentSession } from '#harness/session.js';

vi.mock('node:fs', async (original) => {
  const actual = await original<typeof NodeFileSystemModule>();
  return { ...actual, watch: vi.fn(actual.watch) };
});

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof NodeFileSystemPromisesModule>();
  return { ...actual, link: vi.fn(actual.link) };
});

describe('Node chat source observation', () => {
  it('fences late events from a closed native watcher after its replacement registers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-chat-watch-stale-'));
    const release: Array<() => void> = [];
    try {
      const binding = chatStoreBinding(createNodeChatStore({ workspaceRoot: root }));
      vi.mocked(watch).mockClear();
      release.push(
        await binding.observeBytes!('shared', {
          signal: new AbortController().signal,
          onChange: vi.fn(),
          onError: vi.fn(),
        }),
      );
      const prior = vi.mocked(watch).mock.results[0];
      if (prior?.type !== 'return') {
        throw new Error('Expected native watcher.');
      }
      release[0]?.();
      const onError = vi.fn();
      const onChange = vi.fn();
      release.push(
        await binding.observeBytes!('shared', {
          signal: new AbortController().signal,
          onChange,
          onError,
        }),
      );
      expect(watch).toHaveBeenCalledTimes(2);
      prior.value.emit('error', new Error('Late failure from the retired source.'));
      prior.value.emit('change', 'change', '.tau/chats/shared/events.jsonl');
      expect(onError).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      for (const unsubscribe of release) {
        unsubscribe();
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  it('shares one binding-owned native watcher across chat subscriptions and releases the final owner', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-chat-watch-'));
    const release: Array<() => void> = [];
    try {
      const binding = chatStoreBinding(createNodeChatStore({ workspaceRoot: root }));
      vi.mocked(watch).mockClear();
      for (let index = 0; index < 32; index++) {
        release.push(
          // eslint-disable-next-line no-await-in-loop -- test successive acknowledged subscriptions.
          await binding.observeBytes!(`chat-${index}`, {
            signal: new AbortController().signal,
            onChange: vi.fn(),
            onError: vi.fn(),
          }),
        );
      }
      expect(watch).toHaveBeenCalledOnce();
      const result = vi.mocked(watch).mock.results[0];
      if (result?.type !== 'return') {
        throw new Error('Expected native watcher.');
      }
      const close = vi.spyOn(result.value, 'close');
      for (const unsubscribe of release.slice(0, -1)) {
        unsubscribe();
      }
      expect(close).not.toHaveBeenCalled();
      release.at(-1)?.();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      for (const unsubscribe of release) {
        unsubscribe();
      }
      await rm(root, { recursive: true, force: true });
    }
  });
});

/*
 * OQ2: a permanent delete fences the chat's writers. The record carrying
 * `purgedAt` is the tombstone; no writer opens, appends to or attaches into a
 * purged chat, so nothing the purge removed comes back.
 */
describe('Node chat store and a permanent delete', () => {
  const event = (sequence: number): AgentLogEvent => ({
    version: 1,
    leaderEpoch: 'leader-1',
    sequence,
    recordedAt: '2026-09-01T00:00:00.000Z',
    runId: 'run-1',
    type: 'run.lifecycle',
    state: sequence === 0 ? 'admitted' : 'running',
  });
  const record = (purged: boolean): string =>
    JSON.stringify({
      id: 'chat',
      name: 'Chat',
      createdAt: 1,
      updatedAt: 2,
      deletedAt: 2,
      ...(purged ? { purgedAt: 3 } : {}),
    });

  it('refuses to open a purged chat’s writer and creates nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-chat-purged-open-'));
    try {
      const directory = join(root, '.tau', 'chats', 'chat');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'chat.json'), record(true));
      const binding = chatStoreBinding(createNodeChatStore({ workspaceRoot: root }));

      await expect(binding.openWriter('chat')).rejects.toMatchObject({
        code: 'LOG_FENCED',
      });

      expect(await readdir(directory)).toEqual(['chat.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses a direct attachment write (ACP media) into a purged chat and creates nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-chat-purged-media-'));
    try {
      const directory = join(root, '.tau', 'chats', 'chat');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'chat.json'), record(true));

      await expect(
        createNodeAttachmentReader(root).write!('chat', `attachments/${'b'.repeat(64)}.png`, new Uint8Array([1])),
      ).rejects.toMatchObject({ code: 'LOG_FENCED' });

      expect(await readdir(directory)).toEqual(['chat.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fences an open writer at its next append once the chat is purged, and never recreates the log', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-chat-purged-append-'));
    try {
      const directory = join(root, '.tau', 'chats', 'chat');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'chat.json'), record(false));
      const binding = chatStoreBinding(createNodeChatStore({ workspaceRoot: root }));
      const writer = await binding.openWriter('chat');
      await writer.append(event(0));

      /* What the store's purge does: the tombstone, then every other entry goes. */
      await writeFile(join(directory, 'chat.json'), record(true));
      const names = await readdir(directory);
      await Promise.all(
        names
          .filter((name) => name !== 'chat.json')
          .map(async (name) => rm(join(directory, name), { recursive: true, force: true })),
      );

      await expect(writer.append(event(1))).rejects.toMatchObject({
        code: 'LOG_FENCED',
      });
      /* A capture the run stores before its next row is fenced the same way. */
      await expect(
        binding.attachments.write!('chat', `attachments/${'a'.repeat(64)}.webp`, new Uint8Array([1])),
      ).rejects.toMatchObject({ code: 'LOG_FENCED' });
      await writer.close();

      expect(await readdir(directory)).toEqual(['chat.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('Node chat store screenshot captures (D-UI-04)', () => {
  const chatId = 'chat-1';
  const webpBytes: Uint8Array<ArrayBuffer> = new Uint8Array([82, 73, 70, 70, 9, 8, 7, 6, 5]);
  const webpHash = createHash('sha256').update(webpBytes).digest('hex');
  const storedPath = `attachments/${webpHash}.webp`;
  const dataUrl = `data:image/webp;base64,${Buffer.from(webpBytes).toString('base64')}`;

  class ScreenshotTransport implements ModelTransport {
    public readonly funding = { type: 'unfunded' } as const;
    private calls = 0;

    public async *stream(_request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
      this.calls += 1;
      if (this.calls === 1) {
        yield { type: 'tool-input', toolCallId: 'call-1', toolName: 'screenshot', input: {} };
        yield { type: 'completed', stopReason: 'toolUse' };
        return;
      }
      yield { type: 'text-delta', text: 'looks fine' };
      yield { type: 'completed', stopReason: 'stop' };
    }
  }

  const roots: string[] = [];
  const workspace = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'tau-chat-captures-'));
    roots.push(root);
    return root;
  };
  const attachmentsDirectory = (root: string): string => join(root, '.tau', 'chats', chatId, 'attachments');

  /** One `screenshot` turn through a session whose log and attachments are the Node chat store's. */
  const runScreenshotTurn = async (root: string, runId: string): Promise<string> => {
    const binding = chatStoreBinding(createNodeChatStore({ workspaceRoot: root }));
    const session = await createAgentSession({
      chatId,
      runId,
      leaderEpoch: 'epoch-1',
      systemPrompt: 'system',
      model: { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' },
      modelTransport: new ScreenshotTransport(),
      toolRegistry: {
        list: () => [{ name: 'screenshot', description: 'Capture.', inputSchema: { type: 'object' } }],
        invoke: async () => ({ content: { images: [{ view: '3d', angle: 'isometric', dataUrl }] }, isError: false }),
      },
      eventLog: await binding.openWriter(chatId),
      attachments: binding.attachments,
    });
    await session.prompt({ id: `user-${runId}`, role: 'user', content: 'check it' });
    await session.close();
    return readFile(join(root, '.tau', 'chats', chatId, 'events.jsonl'), 'utf8');
  };

  afterEach(async () => {
    vi.mocked(link).mockClear();
    vi.restoreAllMocks();
    await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  });

  it('stores the capture beside the chat and keeps only its reference in events.jsonl', async () => {
    const root = await workspace();

    const log = await runScreenshotTurn(root, 'run-1');

    expect(log).not.toContain('data:image/');
    expect(log).toContain(storedPath);
    expect(new Uint8Array(await readFile(join(root, '.tau', 'chats', chatId, storedPath)))).toEqual(webpBytes);
    expect(await readdir(attachmentsDirectory(root))).toEqual([`${webpHash}.webp`]);
  });

  it('leaves one file when the same capture is stored again', async () => {
    const root = await workspace();

    await runScreenshotTurn(root, 'run-1');
    const log = await runScreenshotTurn(root, 'run-2');

    expect(log).not.toContain('data:image/');
    expect(await readdir(attachmentsDirectory(root))).toEqual([`${webpHash}.webp`]);
  });

  it('refuses different bytes at a content address and keeps the capture inline', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = await workspace();
    await mkdir(attachmentsDirectory(root), { recursive: true });
    await writeFile(join(root, '.tau', 'chats', chatId, storedPath), 'not the capture');

    const log = await runScreenshotTurn(root, 'run-1');

    expect(log).toContain(dataUrl);
    expect(await readFile(join(root, '.tau', 'chats', chatId, storedPath), 'utf8')).toBe('not the capture');
    expect(await readdir(attachmentsDirectory(root))).toEqual([`${webpHash}.webp`]);
  });

  it('publishes through rename where the filesystem has no hard links', async () => {
    vi.mocked(link).mockRejectedValueOnce(Object.assign(new Error('Operation not permitted'), { code: 'EPERM' }));
    const root = await workspace();

    const log = await runScreenshotTurn(root, 'run-1');

    expect(link).toHaveBeenCalledOnce();
    expect(log).not.toContain('data:image/');
    expect(new Uint8Array(await readFile(join(root, '.tau', 'chats', chatId, storedPath)))).toEqual(webpBytes);
    expect(await readdir(attachmentsDirectory(root))).toEqual([`${webpHash}.webp`]);
  });

  it('rejects a write that is not one chat attachment path', async () => {
    const root = await workspace();
    const reader = createNodeAttachmentReader(root);

    await expect(reader.write!('../escape', storedPath, webpBytes)).rejects.toMatchObject({
      code: 'STORAGE_PATH_INVALID',
    });
    await expect(reader.write!(chatId, '../events.jsonl', webpBytes)).rejects.toMatchObject({
      code: 'STORAGE_PATH_INVALID',
    });
  });
});
