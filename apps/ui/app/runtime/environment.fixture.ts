/**
 * A stand-in for the DOM objects `environment` listens to, for runtime tests. It records which listeners are in, so a
 * test can show that a runtime created and not started has none, and that stopping it removes them all.
 */
import type { EnvironmentHost } from '#runtime/environment.js';

/** The fake host and its controls. */
export type FakeEnvironmentHost = EnvironmentHost &
  Readonly<{
    /** The listeners in now, as `<target>:<type>`. */
    listeners: () => string[];
    /** Every listener ever added, as `<target>:<type>`. */
    everAdded: () => string[];
    setVisibility: (state: DocumentVisibilityState) => void;
    focus: () => void;
    blur: () => void;
    setCoarsePointer: (coarse: boolean) => void;
  }>;

type FakeEnvironmentOptions = Readonly<{
  visibilityState?: DocumentVisibilityState;
  focused?: boolean;
  coarse?: boolean;
}>;

/**
 * Build a fake host.
 *
 * @param options - The page's starting visibility, focus and pointer class.
 * @returns The host and its controls.
 */
export const createFakeEnvironmentHost = (options: FakeEnvironmentOptions = {}): FakeEnvironmentHost => {
  const active = new Map<string, number>();
  const added: string[] = [];
  const recorded = <T extends EventTarget>(name: string, target: T): T => {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, listener, listenerOptions) => {
      const key = `${name}:${type}`;
      added.push(key);
      active.set(key, (active.get(key) ?? 0) + 1);
      add(type, listener, listenerOptions);
    };
    target.removeEventListener = (type, listener, listenerOptions) => {
      const key = `${name}:${type}`;
      const count = (active.get(key) ?? 0) - 1;
      if (count > 0) {
        active.set(key, count);
      } else {
        active.delete(key);
      }
      remove(type, listener, listenerOptions);
    };
    return target;
  };
  const state = {
    visibilityState: options.visibilityState ?? 'visible',
    focused: options.focused ?? true,
    coarse: options.coarse ?? false,
  };
  /* Getters, not `Object.assign`, which would copy each reading once. */
  const document = recorded(
    'document',
    Object.defineProperties(new EventTarget() as EventTarget & EnvironmentHost['document'], {
      visibilityState: { get: () => state.visibilityState },
      hasFocus: { value: () => state.focused },
    }),
  );
  const window = recorded('window', new EventTarget());
  const coarsePointer = recorded(
    'coarsePointer',
    Object.defineProperties(new EventTarget() as EventTarget & { readonly matches: boolean }, {
      matches: { get: () => state.coarse },
    }),
  );
  return {
    document,
    window,
    coarsePointer,
    isMemoryConstrained: () => state.coarse,
    listeners: () => [...active.keys()],
    everAdded: () => [...added],
    setVisibility: (next) => {
      state.visibilityState = next;
      document.dispatchEvent(new Event('visibilitychange'));
    },
    focus: () => {
      state.focused = true;
      window.dispatchEvent(new Event('focus'));
    },
    blur: () => {
      state.focused = false;
      window.dispatchEvent(new Event('blur'));
    },
    setCoarsePointer: (coarse) => {
      state.coarse = coarse;
      coarsePointer.dispatchEvent(new Event('change'));
    },
  };
};
