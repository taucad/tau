/**
 * Idle retirement for the agent's runtime clients (D-DT-01).
 *
 * The renderer forks its own kernel utility for every open project; the agent's
 * tools fork a second one for the same root through main. That one serves tool
 * calls only, yet it lived as long as the project host, holding a full set of
 * WebAssembly kernels and warm native workers between turns. This retires it
 * once nothing has used it for a while; the next tool call forks a fresh one.
 *
 * @module
 */
import type { KeyedResource } from '@taucad/host';

/** How long an unused agent runtime client survives: the geometry slot's idle retirement. */
export const agentRuntimeIdleMilliseconds = 120_000;

/* A Proxy target is any non-primitive; nothing narrower describes a client and its documents. */
// oxlint-disable-next-line typescript/no-restricted-types -- `Proxy` itself is typed over `object`.
type ProxyTarget = object;

type Tracked<Client> = {
  readonly incarnation: number;
  readonly client: Client;
  active: number;
  timer?: ReturnType<typeof setTimeout>;
};

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof Reflect.get(value, 'then') === 'function';

const hasClose = (value: unknown): value is { close(...args: readonly unknown[]): unknown } =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'close') === 'function';

/**
 * Serve keyed clients that retire themselves once idle.
 *
 * Use is counted from the call itself: a call that returns a promise is in use
 * until it settles, and one that returns a document (anything with `close`) is
 * in use until that is closed. A client is retired only when no use is
 * outstanding and none began within `idleMilliseconds`.
 *
 * @param options - The keyed clients, the idle window and how to retire one incarnation.
 * @returns `get`, which hands out the same tracked client per incarnation, and `dispose`, which stops every timer.
 */
export const retireIdleClients = <Key, Client extends ProxyTarget>(options: {
  readonly clients: KeyedResource<Key, Client>;
  readonly idleMilliseconds: number;
  readonly retire: (key: Key, incarnation: number) => void;
}): Readonly<{ get: (key: Key) => Promise<Client>; dispose: () => void }> => {
  const tracked = new Map<Key, Tracked<Client>>();

  const arm = (key: Key, entry: Tracked<Client>): void => {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      if (tracked.get(key) !== entry || entry.active > 0) {
        return;
      }
      tracked.delete(key);
      options.retire(key, entry.incarnation);
    }, options.idleMilliseconds);
    /* The utility must not stay alive for a timer whose only job is to free it. */
    entry.timer.unref();
  };

  const begin = (entry: Tracked<Client>): (() => void) => {
    entry.active += 1;
    clearTimeout(entry.timer);
    entry.timer = undefined;
    let ended = false;
    return () => {
      if (ended) {
        return;
      }
      ended = true;
      entry.active -= 1;
      if (entry.active === 0) {
        for (const [key, current] of tracked) {
          if (current === entry) {
            arm(key, entry);
          }
        }
      }
    };
  };

  const endWhenSettled = async (result: PromiseLike<unknown>, end: () => void): Promise<void> => {
    try {
      await result;
    } catch {
      /* The caller observes the rejection; this only ends the use. */
    } finally {
      end();
    }
  };

  /* Bound to the target so the client's own `this` and private state are untouched. */
  const bound = (target: ProxyTarget, property: PropertyKey): unknown => {
    const value: unknown = Reflect.get(target, property, target);
    return typeof value === 'function' ? (value as (...args: readonly unknown[]) => unknown).bind(target) : value;
  };

  const trackDocument = (document: ProxyTarget, end: () => void): ProxyTarget =>
    new Proxy(document, {
      get(target, property) {
        const value = bound(target, property);
        if (property !== 'close' || typeof value !== 'function') {
          return value;
        }
        return (...args: readonly unknown[]): unknown => {
          end();
          return (value as (...closeArgs: readonly unknown[]) => unknown)(...args);
        };
      },
    });

  const trackClient = (entry: Tracked<Client>): Client =>
    new Proxy(entry.client, {
      get(target, property) {
        const value = bound(target, property);
        if (typeof value !== 'function' || property === 'terminate') {
          return value;
        }
        return (...args: readonly unknown[]): unknown => {
          const end = begin(entry);
          let result: unknown;
          try {
            result = (value as (...callArgs: readonly unknown[]) => unknown)(...args);
          } catch (error) {
            end();
            throw error;
          }
          if (isPromiseLike(result)) {
            void endWhenSettled(result, end);
            return result;
          }
          if (hasClose(result)) {
            return trackDocument(result, end);
          }
          end();
          return result;
        };
      },
    });

  const views = new WeakMap<Client, Client>();

  return {
    async get(key) {
      const { value, incarnation } = await options.clients.acquire(key);
      let entry = tracked.get(key);
      if (entry?.incarnation !== incarnation) {
        clearTimeout(entry?.timer);
        entry = { incarnation, client: value, active: 0 };
        tracked.set(key, entry);
      }
      if (entry.active === 0) {
        arm(key, entry);
      }
      let view = views.get(value);
      if (view === undefined) {
        view = trackClient(entry);
        views.set(value, view);
      }
      return view;
    },
    dispose() {
      for (const entry of tracked.values()) {
        clearTimeout(entry.timer);
      }
      tracked.clear();
    },
  };
};
