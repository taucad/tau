/**
 * The four graph shapes the promised log order has to answer for (review 4 R29).
 *
 * The walk is the only thing standing between a UI and two hosts disagreeing
 * about what a history looks like, so its order is pinned here on shapes the
 * conformance table's single merge cannot reach: a chain, a merge whose sides
 * carry the *same* committer time, a criss-cross, and two unrelated heads.
 */

import { revisionId } from '#algorithms/index.js';
import type { RevisionId } from '#algorithms/index.js';
import { describe, expect, it } from 'vitest';
import { integrationOf, mergeBaseOf, walkRevisionLog } from '#revision-log-order.js';

/** `<name>` padded into a valid object id, so the expectations stay readable. */
const id = (name: string): RevisionId => revisionId(name.padEnd(40, '0'));

type Shape = Record<string, { readonly parents: readonly string[]; readonly seconds?: number }>;

const walk = async (
  shape: Shape,
  heads: readonly string[],
  limit?: number,
): Promise<{ readonly order: readonly string[]; readonly reads: number }> => {
  const byId = new Map(Object.entries(shape).map(([name, node]) => [id(name), { name, ...node }]));
  let reads = 0;
  const order = await walkRevisionLog<string>(
    heads.map((name) => id(name)),
    async (current) => {
      reads++;
      const node = byId.get(current);
      return node === undefined
        ? undefined
        : {
            parents: node.parents.map((name) => id(name)),
            seconds: node.seconds ?? 100,
            entry: node.name,
          };
    },
    limit,
  );
  return { order, reads };
};

describe('walkRevisionLog', () => {
  it('walks a chain newest first', async () => {
    const shape: Shape = { c: { parents: ['b'] }, b: { parents: ['a'] }, a: { parents: [] } };
    const walked = await walk(shape, ['c']);
    expect(walked.order).toStrictEqual(['c', 'b', 'a']);
  });

  it('takes the first-parent side of a merge whose sides share a committer time', async () => {
    // The tie is the interesting part: `rev-list --topo-order` broke it by date.
    const shape: Shape = {
      merge: { parents: ['left', 'right'] },
      left: { parents: ['base'] },
      right: { parents: ['base'] },
      base: { parents: [] },
    };
    const walked = await walk(shape, ['merge']);
    expect(walked.order).toStrictEqual(['merge', 'left', 'right', 'base']);
  });

  it('emits every child before its parent through a criss-cross', async () => {
    const shape: Shape = {
      a: { parents: ['x', 'y'] },
      b: { parents: ['y', 'x'] },
      x: { parents: ['root'] },
      y: { parents: ['root'] },
      root: { parents: [] },
    };
    const { order } = await walk(shape, ['a', 'b']);
    expect(order).toStrictEqual(['a', 'b', 'y', 'x', 'root']);
    for (const [child, parent] of [
      ['a', 'x'],
      ['a', 'y'],
      ['b', 'x'],
      ['b', 'y'],
      ['x', 'root'],
      ['y', 'root'],
    ]) {
      expect(order.indexOf(child!)).toBeLessThan(order.indexOf(parent!));
    }
  });

  it('honours the caller order across two unrelated heads', async () => {
    const shape: Shape = { first: { parents: ['older'] }, older: { parents: [] }, second: { parents: [] } };
    const firstThenSecond = await walk(shape, ['first', 'second']);
    expect(firstThenSecond.order).toStrictEqual(['first', 'older', 'second']);
    const secondThenFirst = await walk(shape, ['second', 'first']);
    expect(secondThenFirst.order).toStrictEqual(['second', 'first', 'older']);
  });

  it('orders a child before its parent under an inverted clock, when unbounded', async () => {
    /* Review 4 R39: `b` is stamped newer than its own child `right`, which the
     * committer-time gate cannot see. Unbounded, the walk expands everything
     * first and the order is a property of the graph alone. */
    const shape: Shape = {
      merge: { parents: ['left', 'right'], seconds: 100 },
      left: { parents: ['b'], seconds: 90 },
      right: { parents: ['b'], seconds: 80 },
      b: { parents: [], seconds: 95 },
    };
    const { order } = await walk(shape, ['merge']);
    expect(order).toStrictEqual(['merge', 'left', 'right', 'b']);

    /* The documented caveat, pinned so it stays visible: a *bounded* walk is
     * gated by that clock, so an inverted stamp can place a parent early. */
    const bounded = await walk(shape, ['merge'], 3);
    expect(bounded.order).toStrictEqual(['merge', 'left', 'b']);
  });

  it('stops reading once the limit is met, on a history that keeps going', async () => {
    const shape: Shape = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [
        `r${index}`,
        { parents: index === 0 ? [] : [`r${index - 1}`], seconds: 1000 + index },
      ]),
    );
    const { order, reads } = await walk(shape, ['r99'], 3);
    expect(order).toStrictEqual(['r99', 'r98', 'r97']);
    expect(reads).toBeLessThanOrEqual(6);
  });

  it('costs the width of a tied frontier, not the length of a tied history', async () => {
    /* Review 4 R41: the a3 note claimed tied timestamps cost the whole
     * reachable set. A tied *chain* costs one read per emitted revision — the
     * gate only bites when two or more revisions are unexpanded at once. */
    const shape: Shape = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [
        `r${index}`,
        { parents: index === 0 ? [] : [`r${index - 1}`], seconds: 1000 },
      ]),
    );
    const { order, reads } = await walk(shape, ['r199'], 5);
    expect(order).toStrictEqual(['r199', 'r198', 'r197', 'r196', 'r195']);
    expect(reads).toBeLessThanOrEqual(6);
  });

  it('skips a revision the store does not hold, rather than throwing', async () => {
    const shape: Shape = { head: { parents: ['missing'] } };
    const walked = await walk(shape, ['head', 'absent']);
    expect(walked.order).toStrictEqual(['head']);
  });
});

describe('mergeBaseOf', () => {
  /** The graph in `log` order (newest first), as the port would answer it. */
  const graph = (shape: Shape, order: readonly string[]): ReadonlyArray<{ id: RevisionId; parents: RevisionId[] }> =>
    order.map((name) => ({ id: id(name), parents: shape[name]!.parents.map((parent) => id(parent)) }));

  it('finds the revision two branches last shared', () => {
    const shape: Shape = {
      ours: { parents: ['base'] },
      theirs: { parents: ['base'] },
      base: { parents: ['root'] },
      root: { parents: [] },
    };

    expect(mergeBaseOf(graph(shape, ['ours', 'theirs', 'base', 'root']), id('ours'), id('theirs'))).toBe(id('base'));
  });

  it('answers the older head itself when one line already contains the other', () => {
    const shape: Shape = { tip: { parents: ['base'] }, base: { parents: [] } };

    expect(mergeBaseOf(graph(shape, ['tip', 'base']), id('tip'), id('base'))).toBe(id('base'));
    expect(mergeBaseOf(graph(shape, ['tip', 'base']), id('base'), id('tip'))).toBe(id('base'));
  });

  it('takes the newest of a criss-cross history’s several equally good bases', () => {
    /* Both `left` and `right` are common ancestors of the two tips; the one the
       port's order reaches first is the one no other candidate descends from. */
    const shape: Shape = {
      ourTip: { parents: ['left', 'right'] },
      theirTip: { parents: ['right', 'left'] },
      left: { parents: ['base'] },
      right: { parents: ['base'] },
      base: { parents: [] },
    };

    expect(
      mergeBaseOf(graph(shape, ['ourTip', 'theirTip', 'left', 'right', 'base']), id('ourTip'), id('theirTip')),
    ).toBe(id('left'));
  });

  it('answers nothing for two unrelated histories', () => {
    const shape: Shape = { ours: { parents: [] }, theirs: { parents: [] } };

    expect(mergeBaseOf(graph(shape, ['ours', 'theirs']), id('ours'), id('theirs'))).toBeUndefined();
  });
});

describe('integrationOf', () => {
  /** The graph in `log` order (newest first), as the port would answer it. */
  const graph = (shape: Shape, order: readonly string[]): ReadonlyArray<{ id: RevisionId; parents: RevisionId[] }> =>
    order.map((name) => ({ id: id(name), parents: shape[name]!.parents.map((parent) => id(parent)) }));

  const line: Shape = { ahead: { parents: ['shared'] }, shared: { parents: ['root'] }, root: { parents: [] } };
  const fork: Shape = {
    mine: { parents: ['shared'] },
    theirs: { parents: ['shared'] },
    shared: { parents: [] },
  };

  it('is nothing to integrate when the two heads are the same revision', () => {
    expect(integrationOf(graph(line, ['ahead', 'shared', 'root']), id('ahead'), id('ahead'))).toBe('upToDate');
  });

  it('fast-forwards when this device is behind the remote', () => {
    expect(integrationOf(graph(line, ['ahead', 'shared', 'root']), id('shared'), id('ahead'))).toBe('fastForward');
  });

  it('is nothing to integrate when this device is *ahead* of the remote', () => {
    /* R1: the device with unacknowledged work — exactly the one the durable
     * queue exists for. Classified as a fork it would land in `conflicted`,
     * which has no push edge, and the queue could never drain. */
    expect(integrationOf(graph(line, ['ahead', 'shared', 'root']), id('ahead'), id('shared'))).toBe('upToDate');
  });

  it('diverges only when neither head contains the other', () => {
    expect(integrationOf(graph(fork, ['mine', 'theirs', 'shared']), id('mine'), id('theirs'))).toBe('diverged');
  });

  it('diverges when the two heads share no history at all', () => {
    const unrelated: Shape = { mine: { parents: [] }, theirs: { parents: [] } };
    expect(integrationOf(graph(unrelated, ['mine', 'theirs']), id('mine'), id('theirs'))).toBe('diverged');
  });
});
