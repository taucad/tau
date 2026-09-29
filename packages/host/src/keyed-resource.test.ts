import { describe, expect, it } from 'vitest';

import { keyedResource } from '#keyed-resource.js';

type Resource = { readonly key: string; readonly serial: number; dead: boolean };

const registry = () => {
  let serial = 0;
  const closed: number[] = [];
  let failNext = false;
  const resources = keyedResource<string, Resource>(
    async (key) => {
      if (failNext) {
        failNext = false;
        throw new Error('create failed');
      }
      serial += 1;
      return { key, serial, dead: false };
    },
    (value) => {
      closed.push(value.serial);
    },
    (value) => !value.dead,
  );
  return {
    resources,
    closed,
    failOnce: () => {
      failNext = true;
    },
  };
};

describe('keyedResource', () => {
  it('should share one resource per key and retry a creation that failed', async () => {
    const { resources, failOnce } = registry();
    failOnce();
    await expect(resources.get('a')).rejects.toThrow('create failed');
    expect(resources.keys()).toEqual([]);

    const [first, second] = await Promise.all([resources.get('a'), resources.get('a')]);
    expect(first).toBe(second);
    expect(first.serial).toBe(1);
  });

  it('should replace a dead resource without closing it', async () => {
    const { resources, closed } = registry();
    const first = await resources.get('a');
    first.dead = true;

    const replacement = await resources.get('a');

    expect(replacement.serial).toBe(2);
    expect(closed).toEqual([]);
  });

  it('should close only the incarnation it names, and serve a fresh one after a close (I31)', async () => {
    const { resources, closed } = registry();
    const stale = await resources.acquire('a');
    await resources.close('a');
    const fresh = await resources.acquire('a');
    expect(fresh.value.serial).toBe(2);

    /* The stale incarnation's close reaches nothing; the live one's closes it. */
    await resources.close('a', stale.incarnation);
    expect(closed).toEqual([1]);
    expect(resources.keys()).toEqual(['a']);

    await resources.close('a', fresh.incarnation);
    expect(closed).toEqual([1, 2]);
    expect(resources.keys()).toEqual([]);
  });

  it('should never hand a caller awaiting creation a value whose close began', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let serial = 0;
    const closed: number[] = [];
    const resources = keyedResource<string, { serial: number }>(
      async () => {
        await gate;
        serial += 1;
        return { serial };
      },
      (value) => {
        closed.push(value.serial);
      },
    );
    const pending = resources.get('b');
    const closing = resources.close('b');
    release();

    const got = await pending;
    await closing;

    expect(closed).toEqual([1]);
    expect(got.serial).toBe(2);
    expect(resources.keys()).toEqual(['b']);
    await resources.closeAll();
    expect(closed).toEqual([1, 2]);
  });

  /* W6.r1 round 3 (K3): a close that fails keeps the resource, so the next close of its key, or closeAll, tries again. */
  it('should close again a resource whose close failed', async () => {
    const attempts: number[] = [];
    let failures = 2;
    const resources = keyedResource<string, { serial: number }>(
      async () => ({ serial: 1 }),
      (value) => {
        attempts.push(value.serial);
        if (failures > 0) {
          failures -= 1;
          throw new Error('close failed');
        }
      },
    );
    await resources.get('c');

    await expect(resources.close('c')).rejects.toThrow('close failed');
    await expect(resources.close('c')).rejects.toThrow('close failed');
    await resources.closeAll();

    expect(attempts).toEqual([1, 1, 1]);
    expect(resources.keys()).toEqual([]);
  });

  /* W6.r1 round 3 (K4): closeAll leaves no entry behind, so a caller awaiting a creation it closed is refused. */
  it('should refuse a caller awaiting a creation that closeAll closed, and leave no entry', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const closed: string[] = [];
    const resources = keyedResource<string, string>(
      async (key) => {
        if (key === 'slow') {
          await gate;
        }
        return key;
      },
      (value) => {
        closed.push(value);
      },
    );
    await resources.get('ready');
    const slow = resources.get('slow');
    const all = resources.closeAll();
    release();

    await expect(slow).rejects.toThrow(/closed/);
    await all;
    expect(closed).toEqual(['ready', 'slow']);
    expect(resources.keys()).toEqual([]);
    /* A caller after closeAll gets a fresh one. */
    await expect(resources.get('slow')).resolves.toBe('slow');
  });
});
