/**
 * T-B7.1 (B7): the worker's node filesystem port backs off between replacement requests and gives up with a code
 * after three failures within 60 s, instead of asking main for a new services utility as fast as it can die.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNodeFsPortBroker } from '#machines/file-manager-worker-node-port.js';

describe('node filesystem port broker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should hand over the first delivered port without asking for another', async () => {
    const request = vi.fn();
    const broker = createNodeFsPortBroker({ request });
    const { port1 } = new MessageChannel();

    broker.deliver(port1);

    await expect(broker.createNodeFsPort()).resolves.toBe(port1);
    expect(request).not.toHaveBeenCalled();
  });

  it('should wait 1 s, 2 s and 4 s between replacement requests and reject with SERVICES_UNAVAILABLE on the third failure within 60 s', async () => {
    const requestedAt: number[] = [];
    const broker = createNodeFsPortBroker({
      request: () => {
        requestedAt.push(Date.now());
      },
    });
    broker.deliver(new MessageChannel().port1);
    await broker.createNodeFsPort();
    const diedAt = Date.now();

    const replacement = broker.createNodeFsPort();
    const settled = expect(replacement).rejects.toMatchObject({ code: 'SERVICES_UNAVAILABLE' });

    await vi.advanceTimersByTimeAsync(999);
    expect(requestedAt).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestedAt).toEqual([diedAt + 1000]);
    broker.fail('The services utility exited');

    await vi.advanceTimersByTimeAsync(1999);
    expect(requestedAt).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestedAt).toHaveLength(2);
    broker.fail('The services utility exited');

    await vi.advanceTimersByTimeAsync(4000);
    expect(requestedAt).toHaveLength(3);
    broker.fail('The services utility exited');

    await settled;
    expect(requestedAt.map((at, index) => at - (requestedAt[index - 1] ?? diedAt))).toEqual([1000, 2000, 4000]);
  });

  it('should resolve a replacement that arrives after a failure', async () => {
    const request = vi.fn();
    const broker = createNodeFsPortBroker({ request });
    broker.deliver(new MessageChannel().port1);
    await broker.createNodeFsPort();

    const replacement = broker.createNodeFsPort();
    await vi.advanceTimersByTimeAsync(1000);
    broker.fail('The services utility exited');
    await vi.advanceTimersByTimeAsync(2000);
    const { port1 } = new MessageChannel();
    broker.deliver(port1);

    await expect(replacement).resolves.toBe(port1);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
