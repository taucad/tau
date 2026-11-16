/**
 * The deferred child's facade (progressive loading PL1 design review, constraint 3): events sent before the logic
 * loads are held in order and replayed once it does, a failed load is the child's first fault and rejects each
 * queued event with it, and a child disposed during its load builds nothing.
 */
import { describe, expect, it, vi } from 'vitest';
import { DeferredChildQueueFullError, createDeferredChild } from '#runtime/deferred-child.js';

type Logic = { readonly received: string[]; receive: (event: string) => string };

const createLogic = (): Logic => {
  const received: string[] = [];
  return {
    received,
    receive: (event) => {
      received.push(event);
      return `took ${event}`;
    },
  };
};

/** A child whose load the test settles. */
const deferredChild = (options: Readonly<{ bound?: number }> = {}) => {
  const load = Promise.withResolvers<'module'>();
  const loader = vi.fn(async () => load.promise);
  const create = vi.fn((_module: 'module') => createLogic());
  const onLoaded = vi.fn();
  const onFault = vi.fn();
  const child = createDeferredChild({ load: loader, create, onLoaded, onFault, ...options });
  return { child, load, loader, create, onLoaded, onFault };
};

describe('createDeferredChild', () => {
  describe('an early send', () => {
    it('should hold events sent before the load and deliver them in order once it loads', async () => {
      const { child, load, loader } = deferredChild();

      const first = child.send((logic) => logic.receive('first'));
      const second = child.send((logic) => logic.receive('second'));

      expect(child.phase()).toBe('loading');
      expect(child.pending()).toBe(2);
      expect(loader).toHaveBeenCalledTimes(1);

      load.resolve('module');

      await expect(first).resolves.toBe('took first');
      await expect(second).resolves.toBe('took second');
      expect(child.current()?.received).toEqual(['first', 'second']);
      expect(child.pending()).toBe(0);
    });

    it('should build the logic once and tell the owner before the queue replays', async () => {
      const { child, load, create, onLoaded } = deferredChild();
      const seen: string[][] = [];
      onLoaded.mockImplementation((logic: Logic) => {
        seen.push([...logic.received]);
      });

      const sent = child.send((logic) => logic.receive('queued'));
      child.load();
      load.resolve('module');
      await sent;

      expect(create).toHaveBeenCalledTimes(1);
      expect(seen).toEqual([[]]);
      expect(child.phase()).toBe('loaded');
    });

    it('should run an event sent after the load synchronously', async () => {
      const { child, load } = deferredChild();
      child.load();
      load.resolve('module');
      await vi.waitFor(() => {
        expect(child.phase()).toBe('loaded');
      });

      const sent = child.send((logic) => logic.receive('now'));

      expect(child.current()?.received).toEqual(['now']);
      await expect(sent).resolves.toBe('took now');
    });

    it('should build the logic at once when its module has already loaded', async () => {
      const loader = vi.fn(async (): Promise<'module'> => 'module');
      const child = createDeferredChild({ load: loader, peek: (): 'module' => 'module', create: () => createLogic() });

      child.load();

      expect(child.phase()).toBe('loaded');
      expect(loader).not.toHaveBeenCalled();
      const sent = child.send((logic) => logic.receive('now'));
      expect(child.current()?.received).toEqual(['now']);
      await expect(sent).resolves.toBe('took now');
    });

    it('should run an event a replayed event sends after the rest of the queue', async () => {
      const { child, load } = deferredChild();
      const nested: Array<Promise<string>> = [];

      const first = child.send((logic) => {
        nested.push(child.send((inner) => inner.receive('nested')));
        return logic.receive('first');
      });
      const second = child.send((logic) => logic.receive('second'));
      load.resolve('module');
      await Promise.all([first, second]);
      await Promise.all(nested);

      expect(child.current()?.received).toEqual(['first', 'second', 'nested']);
    });

    it('should refuse an event past the bound instead of dropping one', async () => {
      const { child, load } = deferredChild({ bound: 2 });

      const kept = [child.send((logic) => logic.receive('a')), child.send((logic) => logic.receive('b'))];
      const refused = child.send((logic) => logic.receive('c'));

      await expect(refused).rejects.toThrow(DeferredChildQueueFullError);
      load.resolve('module');
      await expect(Promise.all(kept)).resolves.toEqual(['took a', 'took b']);
      expect(child.current()?.received).toEqual(['a', 'b']);
    });
  });

  describe('a failed load', () => {
    it('should reject each queued event with the failure and keep it as the first fault', async () => {
      const { child, load, onFault } = deferredChild();
      const failure = new Error('chunk failed');

      const first = child.send((logic) => logic.receive('first'));
      const second = child.send((logic) => logic.receive('second'));
      load.reject(failure);

      await expect(first).rejects.toBe(failure);
      await expect(second).rejects.toBe(failure);
      expect(child.phase()).toBe('failed');
      expect(child.fault()).toBe(failure);
      expect(onFault).toHaveBeenCalledWith(failure);
      await expect(child.send((logic) => logic.receive('later'))).rejects.toBe(failure);
    });

    it('should load again after a retry and keep the first fault', async () => {
      const failure = new Error('chunk failed');
      const loader = vi.fn<() => Promise<'module'>>().mockRejectedValueOnce(failure).mockResolvedValueOnce('module');
      const child = createDeferredChild({ load: loader, create: () => createLogic() });

      await expect(child.send((logic) => logic.receive('lost'))).rejects.toBe(failure);
      child.retry();
      expect(child.phase()).toBe('unloaded');

      await expect(child.send((logic) => logic.receive('again'))).resolves.toBe('took again');
      expect(child.current()?.received).toEqual(['again']);
      expect(loader).toHaveBeenCalledTimes(2);
      expect(child.fault()).toBe(failure);
    });

    it('should treat a failure to build the logic as the load failing', async () => {
      const failure = new Error('bad module');
      const child = createDeferredChild({
        load: async (): Promise<'module'> => 'module',
        create: (): Logic => {
          throw failure;
        },
      });

      await expect(child.send(() => 'never')).rejects.toBe(failure);
      expect(child.phase()).toBe('failed');
      expect(child.current()).toBeUndefined();
    });
  });

  describe('a dispose during the load', () => {
    it('should build nothing when the load lands and settle queued events without running them', async () => {
      const { child, load, create } = deferredChild();
      const ran = vi.fn();

      const queued = child.send(ran);
      child.dispose();
      load.resolve('module');

      await expect(queued).resolves.toBeUndefined();
      await Promise.resolve();
      expect(create).not.toHaveBeenCalled();
      expect(ran).not.toHaveBeenCalled();
      expect(child.phase()).toBe('disposed');
      expect(child.current()).toBeUndefined();
    });

    it('should stay disposed and replay nothing when the owner disposes it as it loads', async () => {
      const { child, load, onLoaded } = deferredChild();
      const ran = vi.fn();
      onLoaded.mockImplementation(() => {
        child.dispose();
      });

      const queued = child.send(ran);
      child.load();
      load.resolve('module');

      await expect(queued).resolves.toBeUndefined();
      expect(ran).not.toHaveBeenCalled();
      expect(child.phase()).toBe('disposed');
    });
  });
});
