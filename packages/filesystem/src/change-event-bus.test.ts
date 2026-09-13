import { describe, it, expect, vi } from 'vitest';
import { ChangeEventBus } from '#change-event-bus.js';
import type { ChangeEvent } from '#types.js';
import { getEventOrigin, tagEventOrigin } from '#event-origin-registry.js';

const mockBackend = 'memory';

function fileWrittenEvent(path: string): ChangeEvent {
  return { type: 'fileWritten', path, backend: mockBackend };
}

describe('ChangeEventBus', () => {
  it('should deliver emitted events to subscribers', () => {
    const bus = new ChangeEventBus();
    const handler = vi.fn();

    bus.subscribe(handler);
    bus.emit(fileWrittenEvent('/foo.txt'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'fileWritten', path: '/foo.txt', backend: mockBackend });
  });

  it('should deliver events to all subscribers', () => {
    const bus = new ChangeEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.subscribe(handler1);
    bus.subscribe(handler2);
    bus.emit(fileWrittenEvent('/bar.txt'));

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith({ type: 'fileWritten', path: '/bar.txt', backend: mockBackend });
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith({ type: 'fileWritten', path: '/bar.txt', backend: mockBackend });
  });

  it('should remove the handler when unsubscribe is called', () => {
    const bus = new ChangeEventBus();
    const handler = vi.fn();

    const unsubscribe = bus.subscribe(handler);
    bus.emit(fileWrittenEvent('/first.txt'));
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.emit(fileWrittenEvent('/second.txt'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should clear all subscribers when dispose() is called', () => {
    const bus = new ChangeEventBus();
    const handler = vi.fn();

    bus.subscribe(handler);
    bus.emit(fileWrittenEvent('/before.txt'));
    expect(handler).toHaveBeenCalledTimes(1);

    bus.dispose();
    bus.emit(fileWrittenEvent('/after.txt'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not affect other subscribers when one subscriber throws', () => {
    const bus = new ChangeEventBus();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const failingHandler = vi.fn(() => {
      throw new Error('subscriber error');
    });
    const succeedingHandler = vi.fn();

    bus.subscribe(failingHandler);
    bus.subscribe(succeedingHandler);
    bus.emit(fileWrittenEvent('/test.txt'));

    expect(failingHandler).toHaveBeenCalledTimes(1);
    expect(failingHandler).toHaveBeenCalledWith({ type: 'fileWritten', path: '/test.txt', backend: mockBackend });
    expect(succeedingHandler).toHaveBeenCalledTimes(1);
    expect(succeedingHandler).toHaveBeenCalledWith({ type: 'fileWritten', path: '/test.txt', backend: mockBackend });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[ChangeEventBus] Subscriber error:', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('should deliver events that were tagged before emit so getEventOrigin works on the payload', () => {
    const bus = new ChangeEventBus();
    const handler = vi.fn();

    const event = fileWrittenEvent('/origin.txt');
    tagEventOrigin(event, 'port_a');

    bus.subscribe(handler);
    bus.emit(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
    const emittedEvent = handler.mock.calls[0]![0] as ChangeEvent;
    expect(getEventOrigin(emittedEvent)).toBe('port_a');
  });

  it('should not skip sibling handlers when one self-unsubscribes during emit', () => {
    const bus = new ChangeEventBus();
    const sibling = vi.fn();
    let unsubscribeSelf: (() => void) | undefined;

    unsubscribeSelf = bus.subscribe(() => {
      unsubscribeSelf?.();
    });
    bus.subscribe(sibling);

    bus.emit(fileWrittenEvent('/self-unsub.txt'));

    expect(sibling).toHaveBeenCalledOnce();
  });

  it('should unsubscribe when AbortSignal aborts after subscribe', () => {
    const bus = new ChangeEventBus();
    const handler = vi.fn();
    const controller = new AbortController();

    bus.subscribe(handler, { signal: controller.signal });
    controller.abort();
    bus.emit(fileWrittenEvent('/after-abort.txt'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('should not deliver the in-flight event to subscribers added during emit', () => {
    const bus = new ChangeEventBus();
    const late = vi.fn();

    bus.subscribe(() => {
      bus.subscribe(late);
    });
    bus.emit(fileWrittenEvent('/during.txt'));

    expect(late).not.toHaveBeenCalled();

    bus.emit(fileWrittenEvent('/after.txt'));
    expect(late).toHaveBeenCalledOnce();
  });
});
