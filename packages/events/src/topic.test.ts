import { describe, it, expect, vi } from 'vitest';
import { Topic } from '#topic.js';

describe('Topic', () => {
  it('should deliver emitted events to a single subscriber', () => {
    const topic = new Topic<number>();
    const handler = vi.fn();

    topic.subscribe(handler);
    topic.emit(42);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(42);
  });

  it('should deliver events to all subscribers', () => {
    const topic = new Topic<string>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    topic.subscribe(handler1);
    topic.subscribe(handler2);
    topic.emit('hello');

    expect(handler1).toHaveBeenCalledWith('hello');
    expect(handler2).toHaveBeenCalledWith('hello');
  });

  it('should remove the handler when unsubscribe is called and be idempotent', () => {
    const topic = new Topic<number>();
    const handler = vi.fn();

    const unsubscribe = topic.subscribe(handler);
    expect(topic.size).toBe(1);

    topic.emit(1);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(topic.size).toBe(0);

    unsubscribe();
    topic.emit(2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not skip sibling handlers when one self-unsubscribes during emit', () => {
    const topic = new Topic<number>();
    const sibling1 = vi.fn();
    const sibling2 = vi.fn();
    const selfUnsubs: Array<() => void> = [];

    selfUnsubs.push(
      topic.subscribe((value) => {
        sibling1(value);
        selfUnsubs[0]?.();
      }),
    );
    topic.subscribe((value) => {
      sibling2(value);
    });

    topic.emit(99);

    expect(sibling1).toHaveBeenCalledOnce();
    expect(sibling2).toHaveBeenCalledOnce();
  });

  it('should not deliver the in-flight event to subscribers added during emit', () => {
    const topic = new Topic<number>();
    const late = vi.fn();

    topic.subscribe(() => {
      topic.subscribe(late);
    });
    topic.emit(1);

    expect(late).not.toHaveBeenCalled();

    topic.emit(2);
    expect(late).toHaveBeenCalledOnce();
    expect(late).toHaveBeenCalledWith(2);
  });

  it('should complete the outer emit pass when a handler re-entrantly emits', () => {
    const topic = new Topic<number>();
    const outer = vi.fn();
    const inner = vi.fn();

    topic.subscribe((value) => {
      if (value === 1) {
        topic.emit(2);
      }
      outer(value);
    });
    topic.subscribe(inner);

    topic.emit(1);

    expect(outer).toHaveBeenCalledTimes(2);
    expect(outer).toHaveBeenNthCalledWith(1, 2);
    expect(outer).toHaveBeenNthCalledWith(2, 1);
    expect(inner).toHaveBeenCalledTimes(2);
    expect(inner).toHaveBeenNthCalledWith(1, 2);
    expect(inner).toHaveBeenNthCalledWith(2, 1);
  });

  it('should continue delivery when a handler throws and route to onError', () => {
    const onError = vi.fn();
    const topic = new Topic<number>({ onError });
    const failing = vi.fn(() => {
      throw new Error('boom');
    });
    const succeeding = vi.fn();

    topic.subscribe(failing);
    topic.subscribe(succeeding);
    topic.emit(7);

    expect(failing).toHaveBeenCalledOnce();
    expect(succeeding).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 7);
  });

  it('should gate delivery with interestedIn and treat predicate throws as errors', () => {
    const onError = vi.fn();
    const topic = new Topic<number>({ onError });
    const gated = vi.fn();
    const sibling = vi.fn();

    topic.subscribe({
      handler: gated,
      interestedIn: (value) => value % 2 === 0,
    });
    topic.subscribe({
      handler: sibling,
      interestedIn: () => {
        throw new Error('predicate fail');
      },
    });
    topic.subscribe(sibling);

    topic.emit(3);
    expect(gated).not.toHaveBeenCalled();
    expect(sibling).toHaveBeenCalledOnce();

    topic.emit(4);
    expect(gated).toHaveBeenCalledOnce();
    expect(gated).toHaveBeenCalledWith(4);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 3);
  });

  it('should no-op subscribe when AbortSignal is already aborted', () => {
    const topic = new Topic<number>();
    const handler = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const unsubscribe = topic.subscribe(handler, { signal: controller.signal });
    topic.emit(1);

    expect(handler).not.toHaveBeenCalled();
    expect(topic.size).toBe(0);
    unsubscribe();
  });

  it('should unsubscribe when AbortSignal aborts after subscribe', () => {
    const topic = new Topic<number>();
    const handler = vi.fn();
    const controller = new AbortController();

    topic.subscribe(handler, { signal: controller.signal });
    expect(topic.size).toBe(1);

    controller.abort();
    expect(topic.size).toBe(0);

    topic.emit(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should detach abort listener when manually unsubscribed before abort', () => {
    const topic = new Topic<number>();
    const handler = vi.fn();
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

    const unsubscribe = topic.subscribe(handler, { signal: controller.signal });
    unsubscribe();

    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
    expect(topic.size).toBe(0);
  });

  it('should remove all subscriptions sharing one AbortSignal when it aborts', () => {
    const topic = new Topic<number>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const controller = new AbortController();

    topic.subscribe(handler1, { signal: controller.signal });
    topic.subscribe(handler2, { signal: controller.signal });
    expect(topic.size).toBe(2);

    controller.abort();
    expect(topic.size).toBe(0);
  });

  it('should treat bare-handler and object subscriptions identically', () => {
    const topic = new Topic<number>();
    const bare = vi.fn();
    const object = vi.fn();

    topic.subscribe(bare);
    topic.subscribe({ handler: object });
    topic.emit(5);

    expect(bare).toHaveBeenCalledWith(5);
    expect(object).toHaveBeenCalledWith(5);
  });

  it('should clear subscribers on dispose and allow new subscriptions afterward', () => {
    const topic = new Topic<number>();
    const first = vi.fn();
    const second = vi.fn();

    topic.subscribe(first);
    topic.emit(1);
    expect(first).toHaveBeenCalledOnce();

    topic.dispose();
    topic.emit(2);
    expect(first).toHaveBeenCalledOnce();

    topic.subscribe(second);
    topic.emit(3);
    expect(second).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledWith(3);

    topic.dispose();
    topic.dispose();
    topic.emit(4);
    expect(second).toHaveBeenCalledOnce();
  });

  it('should include the topic name in the default error log prefix', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const topic = new Topic<number>({ name: 'TestTopic' });

    topic.subscribe(() => {
      throw new Error('fail');
    });
    topic.emit(1);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[Topic:TestTopic] handler threw', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });
});
