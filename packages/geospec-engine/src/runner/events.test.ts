import { describe, expect, it, vi } from 'vitest';
import { createRunnerEventChannel } from '#runner/events.js';

describe('createRunnerEventChannel', () => {
  it('should deliver only the subscribed event type until unsubscribed or cleared', () => {
    const channel = createRunnerEventChannel();
    const closes = vi.fn();
    const aborts = vi.fn();
    const unsubscribe = channel.on('close', closes);
    channel.on('abort', aborts);

    channel.emit({ type: 'close' });
    channel.emit({ type: 'abort', reason: 'stop' });
    unsubscribe();
    channel.emit({ type: 'close' });
    channel.clear();
    channel.emit({ type: 'abort', reason: 'again' });

    expect(closes).toHaveBeenCalledOnce();
    expect(aborts.mock.calls).toStrictEqual([[{ type: 'abort', reason: 'stop' }]]);
  });
});
