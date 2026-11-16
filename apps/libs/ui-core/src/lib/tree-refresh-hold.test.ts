import { describe, expect, it, vi } from 'vitest';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { holdTreeRefreshesWhileApplying } from '#lib/tree-refresh-hold.js';

/** A projection source whose moving fields are `applyingRoots` and the selected checkout's readiness. */
const createSource = (): {
  client: Parameters<typeof holdTreeRefreshesWhileApplying>[0]['client'];
  publish: (
    applyingRoots: readonly string[] | undefined,
    reading?: Pick<RevisionStatusProjection, 'checkoutRoot' | 'readiness'>,
  ) => void;
  listenerCount: () => number;
} => {
  let status: RevisionStatusProjection | undefined;
  const listeners = new Set<() => void>();
  return {
    client: {
      status: () => status,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    publish: (applyingRoots, reading) => {
      const published: Partial<RevisionStatusProjection> = {
        ...(applyingRoots === undefined ? {} : { applyingRoots }),
        ...reading,
      };
      status = published as RevisionStatusProjection;
      for (const listener of listeners) {
        listener();
      }
    },
    listenerCount: () => listeners.size,
  };
};

const createTree = (): {
  tree: Parameters<typeof holdTreeRefreshesWhileApplying>[0]['tree'];
  pauses: () => number;
  releases: () => number;
  readsThrough: () => number;
} => {
  let pauses = 0;
  let releases = 0;
  let readsThrough = 0;
  return {
    tree: {
      pauseRefreshes: () => {
        pauses += 1;
        return () => {
          releases += 1;
        };
      },
      refreshListedThroughHold: () => {
        readsThrough += 1;
      },
    },
    pauses: () => pauses,
    releases: () => releases,
    readsThrough: () => readsThrough,
  };
};

describe('holdTreeRefreshesWhileApplying', () => {
  it('should pause while the tree root is applying and release once when it stops', () => {
    const source = createSource();
    const { tree, pauses, releases } = createTree();
    const dispose = holdTreeRefreshesWhileApplying({ client: source.client, tree, root: '/projects/alpha' });

    source.publish(['/projects/alpha']);
    source.publish(['/projects/alpha']);
    expect(pauses()).toBe(1);
    expect(releases()).toBe(0);

    source.publish(undefined);
    source.publish(undefined);
    expect(pauses()).toBe(1);
    expect(releases()).toBe(1);
    dispose();
    expect(releases()).toBe(1);
  });

  it('should ignore an apply that writes another checkout root', () => {
    const source = createSource();
    const { tree, pauses } = createTree();
    holdTreeRefreshesWhileApplying({ client: source.client, tree, root: '/projects/alpha' });

    source.publish(['/checkouts/linked-1', '/projects/alpha-2']);

    expect(pauses()).toBe(0);
  });

  it('should hold at once when it starts following mid-apply, matching a trailing slash', () => {
    const source = createSource();
    source.publish(['/projects/alpha']);
    const { tree, pauses } = createTree();

    holdTreeRefreshesWhileApplying({ client: source.client, tree, root: '/projects/alpha/' });

    expect(pauses()).toBe(1);
  });

  it('should release a held pause and stop following when disposed', () => {
    const source = createSource();
    const { tree, pauses, releases } = createTree();
    const dispose = holdTreeRefreshesWhileApplying({ client: source.client, tree, root: '/projects/alpha' });
    source.publish(['/projects/alpha']);

    dispose();
    source.publish(undefined);
    source.publish(['/projects/alpha']);

    expect(source.listenerCount()).toBe(0);
    expect(pauses()).toBe(1);
    expect(releases()).toBe(1);
  });

  it('should release when the applying list empties', () => {
    const source = createSource();
    const release = vi.fn();
    const pauseRefreshes = vi.fn(() => release);
    const dispose = holdTreeRefreshesWhileApplying({
      client: source.client,
      tree: { pauseRefreshes, refreshListedThroughHold: vi.fn() },
      root: '/projects/alpha',
    });

    source.publish(['/projects/alpha']);
    expect(pauseRefreshes).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
    source.publish([]);
    expect(release).toHaveBeenCalledOnce();
    dispose();
    expect(release).toHaveBeenCalledOnce();
  });

  /*
   * STO-25: the tree first shows at `entryReady`, while the apply is still writing. A hold that re-read nothing until
   * the apply ended showed the root as it was before the apply: every entry still to land missing, never arriving (I7).
   */
  it('should let one re-read of the listed tree through when its apply reaches entryReady', () => {
    const source = createSource();
    const { tree, pauses, releases, readsThrough } = createTree();
    const dispose = holdTreeRefreshesWhileApplying({ client: source.client, tree, root: '/projects/alpha' });

    source.publish(['/projects/alpha'], { checkoutRoot: '/projects/alpha', readiness: 'treeReady' });
    expect(readsThrough()).toBe(0);
    source.publish(['/projects/alpha'], { checkoutRoot: '/projects/alpha', readiness: 'entryReady' });
    source.publish(['/projects/alpha'], { checkoutRoot: '/projects/alpha', readiness: 'entryReady' });
    expect(readsThrough()).toBe(1);
    expect(pauses()).toBe(1);
    expect(releases()).toBe(0);

    /* The next apply's first view is another one. */
    source.publish(undefined, { checkoutRoot: '/projects/alpha', readiness: 'materialized' });
    source.publish(['/projects/alpha'], { checkoutRoot: '/projects/alpha', readiness: 'entryReady' });
    expect(readsThrough()).toBe(2);
    dispose();
  });

  /* Readiness is monotonic only within one tree: a second tree write inside one hold reads treeReady, then entryReady. */
  it('should re-read through the hold on each entry into entryReady within one hold', () => {
    const source = createSource();
    const { tree, pauses, readsThrough } = createTree();
    holdTreeRefreshesWhileApplying({ client: source.client, tree, root: '/projects/alpha' });

    source.publish(['/projects/alpha'], { checkoutRoot: '/projects/alpha', readiness: 'entryReady' });
    source.publish(['/projects/alpha'], { checkoutRoot: '/projects/alpha', readiness: 'treeReady' });
    expect(readsThrough()).toBe(1);
    source.publish(['/projects/alpha'], { checkoutRoot: '/projects/alpha', readiness: 'entryReady' });
    source.publish(['/projects/alpha'], { checkoutRoot: '/projects/alpha', readiness: 'entryReady' });

    expect(readsThrough()).toBe(2);
    expect(pauses()).toBe(1);
  });

  it('should not re-read through the hold for another checkout’s readiness', () => {
    const source = createSource();
    const { tree, readsThrough } = createTree();
    holdTreeRefreshesWhileApplying({ client: source.client, tree, root: '/projects/alpha' });

    source.publish(['/projects/alpha'], { checkoutRoot: '/checkouts/linked-1', readiness: 'entryReady' });
    source.publish(undefined, { checkoutRoot: '/projects/alpha', readiness: 'entryReady' });

    expect(readsThrough()).toBe(0);
  });
});
