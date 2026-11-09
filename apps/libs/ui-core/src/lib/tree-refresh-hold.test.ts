import { describe, expect, it, vi } from 'vitest';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { holdTreeRefreshesWhileApplying } from '#lib/tree-refresh-hold.js';

/** A projection source whose only moving field is `applyingRoots`. */
const createSource = (): {
  client: Parameters<typeof holdTreeRefreshesWhileApplying>[0]['client'];
  publish: (applyingRoots: readonly string[] | undefined) => void;
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
    publish: (applyingRoots) => {
      status = (applyingRoots === undefined ? {} : { applyingRoots }) as RevisionStatusProjection;
      for (const listener of listeners) {
        listener();
      }
    },
    listenerCount: () => listeners.size,
  };
};

const createTree = (): { tree: { pauseRefreshes: () => () => void }; pauses: () => number; releases: () => number } => {
  let pauses = 0;
  let releases = 0;
  return {
    tree: {
      pauseRefreshes: () => {
        pauses += 1;
        return () => {
          releases += 1;
        };
      },
    },
    pauses: () => pauses,
    releases: () => releases,
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
      tree: { pauseRefreshes },
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
});
