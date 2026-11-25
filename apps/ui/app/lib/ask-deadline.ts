import { Topic } from '@taucad/events';

/**
 * The one ask deadline a person-visible wait gets (adaptive app deployment mode charter I15): a wait keyed by what it
 * waits for reads `checking` until the deadline and `unavailable` after it, and an answer at any time still resolves
 * it. The timers live in this module store, never in a React effect. Shared by the adaptive port and the pinned
 * `cloud` plan, for every ceiling.
 */

/** How long a person-visible check may run before it reads as a stated "can't check" (I15). Milliseconds. @public */
export const askDeadlineMilliseconds = 5000;

/** A timer the deadlines run on: the browser's by default, a test's fake one under test. @public */
export type AskDeadlineTimer = Readonly<{ set: (callback: () => void, milliseconds: number) => () => void }>;

/** The deadlines of one kind of wait. @public */
export type AskDeadlines = Readonly<{
  /** Start the key's deadline unless it is running or has passed. */
  start: (key: string) => void;
  /** Start the key's deadline again from now (the person's Retry). */
  restart: (key: string) => void;
  /** Forget the key's deadline, or every one. */
  cancel: (key?: string) => void;
  /** Whether the key's deadline has passed. */
  expired: (key: string | undefined) => boolean;
  subscribe: (listener: () => void) => () => void;
}>;

const browserTimer: AskDeadlineTimer = {
  set: (callback, milliseconds) => {
    const id = setTimeout(callback, milliseconds);
    return () => {
      clearTimeout(id);
    };
  },
};

/**
 * Create the deadlines of one kind of wait.
 *
 * @param timer - The timer; the browser's by default.
 * @param milliseconds - The deadline; {@link askDeadlineMilliseconds} by default.
 * @returns The deadlines.
 * @public
 */
export const createAskDeadlines = (
  timer: AskDeadlineTimer = browserTimer,
  milliseconds: number = askDeadlineMilliseconds,
): AskDeadlines => {
  const running = new Map<string, () => void>();
  const passed = new Set<string>();
  const changed = new Topic<void>({ name: 'ask-deadlines' });
  const start = (key: string): void => {
    if (running.has(key) || passed.has(key)) {
      return;
    }
    running.set(
      key,
      timer.set(() => {
        running.delete(key);
        passed.add(key);
        changed.emit(undefined);
      }, milliseconds),
    );
  };
  const cancel = (key?: string): void => {
    const keys = key === undefined ? [...new Set([...running.keys(), ...passed])] : [key];
    let wasPassed = false;
    for (const each of keys) {
      running.get(each)?.();
      running.delete(each);
      wasPassed = passed.delete(each) || wasPassed;
    }
    if (wasPassed) {
      changed.emit(undefined);
    }
  };
  return {
    start,
    restart: (key) => {
      cancel(key);
      start(key);
    },
    cancel,
    expired: (key) => key !== undefined && passed.has(key),
    subscribe: (listener) => changed.subscribe(listener),
  };
};
