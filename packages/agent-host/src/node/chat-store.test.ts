import { watch } from 'node:fs';
import type * as NodeFileSystemModule from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createNodeChatStore } from '#node.js';
import { chatStoreBinding } from '#launchers/chat-store.js';
import type { AgentLogEvent } from '#log/event-types.js';

vi.mock('node:fs', async (original) => {
  const actual = await original<typeof NodeFileSystemModule>();
  return { ...actual, watch: vi.fn(actual.watch) };
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
      await writer.close();

      expect(await readdir(directory)).toEqual(['chat.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
