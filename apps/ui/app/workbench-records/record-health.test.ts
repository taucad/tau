import { describe, expect, it, vi } from 'vitest';
import { confirmFlush, slowWriteMilliseconds } from '#workbench-records/record-health.js';

describe('confirmFlush', () => {
  it('settles when the store confirms its changes', async () => {
    await expect(confirmFlush(async () => true, 'Pane layout is not confirmed saved.')).resolves.toBeUndefined();
  });

  it('names the record when the store cannot confirm', async () => {
    await expect(confirmFlush(async () => false, 'Pane layout is not confirmed saved.')).rejects.toThrow(
      'Pane layout is not confirmed saved.',
    );
  });

  it.each(['sync', 'async'])(
    'should name a %s rejection while preserving the authority error as its cause',
    async (mode) => {
      const cause = new Error('connection lost');
      await expect(
        // oxlint-disable-next-line promise-function-async -- Exercise a synchronous throw at the callback boundary.
        confirmFlush(() => {
          if (mode === 'sync') {
            throw cause;
          }
          return Promise.reject(cause);
        }, 'View settings for main.cs are not confirmed saved.'),
      ).rejects.toMatchObject({ name: 'Error', message: 'View settings for main.cs are not confirmed saved.', cause });
    },
  );

  it('stops waiting for a write that never answers', async () => {
    vi.useFakeTimers();
    try {
      const waiting = confirmFlush(
        async () =>
          new Promise<boolean>(() => {
            // The authority never answers.
          }),
        'Model display settings are not confirmed saved.',
      );
      const outcome = expect(waiting).rejects.toThrow('Model display settings are not confirmed saved.');
      await vi.advanceTimersByTimeAsync(slowWriteMilliseconds);
      await outcome;
    } finally {
      vi.useRealTimers();
    }
  });
});
