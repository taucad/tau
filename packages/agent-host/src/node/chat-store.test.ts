import { watch } from 'node:fs';
import type * as NodeFileSystemModule from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createNodeChatStore } from '#node.js';
import { chatStoreBinding } from '#launchers/chat-store.js';

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
