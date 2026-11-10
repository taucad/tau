import { describe, expect, it } from 'vitest';
import { createKillMemory, killMemoryKey, killMemoryLifetime, killMemoryLimit, modelKeyOf } from '#lib/kill-memory.js';

const storageOf = (): Storage => {
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

const memoryAt = (storage: Storage, clock: { now: number }) =>
  createKillMemory({ storage: () => storage, now: () => clock.now });

describe('kill memory (crash capture blueprint)', () => {
  const model = modelKeyOf('builtin~replicad.worm-gear-system');

  it('keys a model by an opaque hash, never its slug', () => {
    expect(model).toMatch(/^[\da-z]{8}$/u);
    expect(modelKeyOf('github-gist~abc')).not.toBe(modelKeyOf('github-gist~abd'));
    const storage = storageOf();
    memoryAt(storage, { now: 1000 }).record(modelKeyOf('github-gist~secret-gist-id'), 'b1', 1000);
    expect(storage.getItem(killMemoryKey)).not.toContain('secret');
  });

  it('pauses after the first kill and shows the repeat state after the next, on the same build', () => {
    const storage = storageOf();
    const clock = { now: 1000 };
    const memory = memoryAt(storage, clock);

    expect(memory.pausedState(model, 'b1')).toBeUndefined();
    memory.record(model, 'b1', 1000);
    expect(memory.pausedState(model, 'b1')).toBe('paused');
    /* The same kill seen again on a later load (still pending) is not a second kill. */
    memory.record(model, 'b1', 1000);
    expect(memory.pausedState(model, 'b1')).toBe('paused');
    memory.record(model, 'b1', 2000);
    expect(memory.pausedState(model, 'b1')).toBe('repeat');
  });

  it('gives a new build one automatic try, and starts counting again on it', () => {
    const storage = storageOf();
    const memory = memoryAt(storage, { now: 1000 });
    memory.record(model, 'b1', 1000);
    memory.record(model, 'b1', 1500);

    expect(memory.pausedState(model, 'b2')).toBeUndefined();
    memory.record(model, 'b2', 2000);
    expect(memory.pausedState(model, 'b2')).toBe('paused');
  });

  it('forgets an entry after seven days, and after a good render', () => {
    const storage = storageOf();
    const clock = { now: 1000 };
    const memory = memoryAt(storage, clock);
    memory.record(model, 'b1', 1000);

    clock.now = 1000 + killMemoryLifetime + 1;
    expect(memory.pausedState(model, 'b1')).toBeUndefined();

    memory.record(model, 'b1', clock.now);
    memory.clear(model);
    expect(memory.pausedState(model, 'b1')).toBeUndefined();
    expect(storage.getItem(killMemoryKey)).toBeNull();
  });

  it('keeps at most ten models and survives blocked storage', () => {
    const storage = storageOf();
    const memory = memoryAt(storage, { now: 1000 });
    for (let index = 0; index < killMemoryLimit + 3; index += 1) {
      memory.record(modelKeyOf(`builtin~replicad.model-${String(index)}`), 'b1', 1000 + index);
    }
    expect(memory.entries()).toHaveLength(killMemoryLimit);

    const blocked = createKillMemory({
      storage: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => {
      blocked.record(model, 'b1', 1);
    }).not.toThrow();
    expect(blocked.pausedState(model, 'b1')).toBeUndefined();
  });
});
