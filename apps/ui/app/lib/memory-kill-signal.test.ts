import { describe, expect, it } from 'vitest';
import { createMemoryKillSignal, memoryKillEventName } from '#lib/memory-kill-signal.js';

const memoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

/** One document's life: load, maybe work, then either a clean `pagehide` or a kill (nothing). */
const load = (storage: Storage, navigationType: string) =>
  createMemoryKillSignal({ storage, navigationType, deviceClass: 'constrained', now: () => 1000 });

describe('memory kill signal (B-01, D-UI-25)', () => {
  it('reports one suspected kill when a reload follows a page that never reached pagehide', () => {
    const storage = memoryStorage();
    const killed = load(storage, 'navigate');
    expect(killed.takeSuspectedKill()).toBeUndefined();
    killed.setCounts({ liveProjectCount: 2, chatCount: 5 });
    killed.breadcrumb('render');
    /* Safari kills the tab: no pagehide, no JS. The person (or Safari) reloads. */

    const next = load(storage, 'reload');
    const report = next.takeSuspectedKill();

    expect(memoryKillEventName).toBe('memory.suspected_kill');
    expect(report).toEqual({
      deviceClass: 'constrained',
      liveProjectCount: 2,
      chatCount: 5,
      lastBreadcrumb: 'render',
      aliveForMilliseconds: 0,
    });
    /* Exactly one event per kill. */
    expect(next.takeSuspectedKill()).toBeUndefined();
  });

  it('reports nothing for a normal reload that reached pagehide', () => {
    const storage = memoryStorage();
    const page = load(storage, 'navigate');
    page.takeSuspectedKill();
    page.breadcrumb('open');
    page.finish();

    expect(load(storage, 'reload').takeSuspectedKill()).toBeUndefined();
  });

  it('reports nothing for a fresh navigation even after an unfinished page', () => {
    const storage = memoryStorage();
    load(storage, 'navigate').takeSuspectedKill();

    expect(load(storage, 'navigate').takeSuspectedKill()).toBeUndefined();
  });

  it('re-arms after a back-forward cache restore, so a later kill is still seen', () => {
    const storage = memoryStorage();
    const page = load(storage, 'navigate');
    page.takeSuspectedKill();
    page.finish();
    page.arm();

    expect(load(storage, 'reload').takeSuspectedKill()).toBeDefined();
  });

  it('keeps working when storage throws (private mode, blocked site data)', () => {
    const throwing = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const page = load(throwing, 'reload');

    expect(page.takeSuspectedKill()).toBeUndefined();
    expect(() => {
      page.breadcrumb('render');
      page.finish();
    }).not.toThrow();
  });
});
