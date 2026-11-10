import { describe, expect, it } from 'vitest';
import { layoutRevisionGraph } from '#components/revisions/revision-graph-layout.js';
import type { GraphLayout, GraphNode, GraphRow } from '#components/revisions/revision-graph-layout.js';

/** A row with a marker, 28 px tall with its marker on the first line. */
const entry = (
  key: string,
  node: Omit<GraphNode, 'ids' | 'marker'> & Partial<Pick<GraphNode, 'ids' | 'marker'>>,
): GraphRow => ({
  key,
  node: { marker: 'entry', ids: [key], ...node },
  anchor: 14,
  height: 28,
});

/** A row with no marker: a name chip, a day label. */
const chip = (key: string): GraphRow => ({ key, anchor: 12, height: 24 });

/** Every row of the layout as `key: lane`, for the rows that carry a marker. */
const lanesByKey = (rows: readonly GraphRow[], layout: GraphLayout): Record<string, number> =>
  Object.fromEntries(layout.nodes.map((node) => [rows[node.row]?.key ?? '', node.lane]));

describe('layoutRevisionGraph', () => {
  it('should draw one branch on lane 0 as one rail between its markers and no bend', () => {
    const rows = [
      entry('e3', { branch: 'main', marker: 'current', parent: 'e2' }),
      entry('e2', { branch: 'main', marker: 'version', parent: 'e1' }),
      entry('e1', { branch: 'main' }),
    ];

    const layout = layoutRevisionGraph(rows, ['main']);

    expect(layout.lanes).toEqual(['main']);
    expect(layout.nodes.map((node) => [node.lane, node.marker])).toEqual([
      [0, 'current'],
      [0, 'version'],
      [0, 'entry'],
    ]);
    expect(layout.rails).toEqual([
      { lane: 0, branch: 'main', upper: { at: 'node', row: 0 }, lower: { at: 'node', row: 1 }, style: 'solid' },
      { lane: 0, branch: 'main', upper: { at: 'node', row: 1 }, lower: { at: 'node', row: 2 }, style: 'solid' },
    ]);
    expect(layout.bends).toEqual([]);
  });

  it('should fade a rail that continues below the rows in view into Show older', () => {
    const older: GraphRow = { key: 'older', role: 'older', anchor: 14, height: 28 };
    const rows = [entry('e3', { branch: 'main', parent: 'e2' }), entry('e2', { branch: 'main', parent: 'e1' }), older];

    const layout = layoutRevisionGraph(rows, ['main']);

    expect(layout.rails.at(-1)).toEqual({
      lane: 0,
      branch: 'main',
      upper: { at: 'node', row: 1 },
      lower: { at: 'fade', row: 2 },
      style: 'solid',
    });
  });

  it('should fork a branch up from the entry it starts from onto lane 1, its rail ending at its newest marker', () => {
    const rows = [
      chip('chip:enclosure-v2'),
      entry('f1', { branch: 'enclosure-v2', marker: 'current', parent: 'm2' }),
      entry('m3', { branch: 'main', parent: 'm2' }),
      entry('m2', { branch: 'main', parent: 'm1' }),
      entry('m1', { branch: 'main' }),
    ];

    const layout = layoutRevisionGraph(rows, ['main', 'enclosure-v2']);

    expect(layout.lanes).toEqual(['main', 'enclosure-v2']);
    expect(lanesByKey(rows, layout)).toEqual({ f1: 1, m3: 0, m2: 0, m1: 0 });
    expect(layout.bends).toEqual([
      {
        kind: 'fork',
        branch: 'enclosure-v2',
        originRow: 3,
        originLane: 0,
        lane: 1,
        limitRow: 1,
        direction: 'up',
        style: 'solid',
      },
    ]);
    // The chip row draws no rail: lane 1's only rail runs from f1 down to the bend.
    expect(layout.rails.filter((rail) => rail.lane === 1)).toEqual([
      {
        lane: 1,
        branch: 'enclosure-v2',
        upper: { at: 'node', row: 1 },
        lower: { at: 'bend', bend: 0 },
        style: 'solid',
      },
    ]);
  });

  it('should give two forks from one entry a lane each, both bends leaving that entry', () => {
    const rows = [
      entry('l1', { branch: 'lid', parent: 'm1' }),
      entry('b1', { branch: 'base', parent: 'm1' }),
      entry('m2', { branch: 'main', parent: 'm1' }),
      entry('m1', { branch: 'main' }),
    ];

    const layout = layoutRevisionGraph(rows, ['main', 'lid', 'base']);

    expect(layout.lanes).toEqual(['main', 'lid', 'base']);
    expect(
      layout.bends.map((bend) => [bend.branch, bend.originRow, bend.originLane, bend.lane, bend.limitRow]),
    ).toEqual([
      ['lid', 3, 0, 1, 0],
      ['base', 3, 0, 2, 1],
    ]);
  });

  it('should bring a clean merge down from the merge onto the merged branch, which keeps its lane', () => {
    const rows = [
      entry('m2', { branch: 'main', parent: 'm1', otherParents: ['v1'] }),
      entry('v1', { branch: 'vents', parent: 'm1' }),
      entry('m1', { branch: 'main' }),
    ];

    const layout = layoutRevisionGraph(rows, ['main', 'vents']);

    expect(lanesByKey(rows, layout)).toEqual({ m2: 0, v1: 1, m1: 0 });
    expect(layout.bends.map((bend) => [bend.kind, bend.originRow, bend.lane, bend.limitRow, bend.direction])).toEqual([
      ['fork', 2, 1, 1, 'up'],
      ['merge', 0, 1, 1, 'down'],
    ]);
    // Lane 1 is whole: the merge's bend down to v1, then v1 down to the fork.
    expect(layout.rails.filter((rail) => rail.lane === 1)).toEqual([
      { lane: 1, branch: 'vents', upper: { at: 'node', row: 1 }, lower: { at: 'bend', bend: 0 }, style: 'solid' },
      { lane: 1, branch: 'vents', upper: { at: 'bend', bend: 1 }, lower: { at: 'node', row: 1 }, style: 'solid' },
    ]);
    expect(layout.rails.filter((rail) => rail.lane === 0)).toEqual([
      { lane: 0, branch: 'main', upper: { at: 'node', row: 0 }, lower: { at: 'node', row: 2 }, style: 'solid' },
    ]);
  });

  it('should join a pending merge to the branch it waits on by dashes only, and never give the conflict a lane', () => {
    const rows = [
      entry('conflict', { branch: 'main', marker: 'conflict', ids: [], pending: { kind: 'merge', from: 'vents' } }),
      entry('m2', { branch: 'main', marker: 'current', parent: 'm1' }),
      entry('v1', { branch: 'vents', parent: 'm1' }),
      entry('m1', { branch: 'main' }),
    ];

    const layout = layoutRevisionGraph(rows, ['main', 'vents']);

    expect(layout.lanes).toEqual(['main', 'vents']);
    expect(layout.bends.filter((bend) => bend.kind === 'link')).toEqual([
      {
        kind: 'link',
        branch: 'vents',
        originRow: 0,
        originLane: 0,
        lane: 1,
        limitRow: 2,
        direction: 'down',
        style: 'dashed',
      },
    ]);
    expect(layout.rails.filter((rail) => rail.style === 'dashed')).toEqual([
      { lane: 0, branch: 'main', upper: { at: 'node', row: 0 }, lower: { at: 'node', row: 1 }, style: 'dashed' },
      { lane: 1, branch: 'vents', upper: { at: 'bend', bend: 1 }, lower: { at: 'node', row: 2 }, style: 'dashed' },
    ]);
  });

  it('should end a branch from an older entry at its open end, above the entry it starts from', () => {
    const rows = [
      entry('m3', { branch: 'main', marker: 'current', parent: 'm2' }),
      entry('m2', { branch: 'main', parent: 'm1' }),
      entry('open:hinge', { branch: 'hinge', marker: 'open', ids: [], startsFrom: 'm1' }),
      entry('m1', { branch: 'main' }),
    ];

    const layout = layoutRevisionGraph(rows, ['main', 'hinge']);

    expect(lanesByKey(rows, layout)).toEqual({ m3: 0, m2: 0, 'open:hinge': 1, m1: 0 });
    expect(layout.bends).toEqual([
      {
        kind: 'fork',
        branch: 'hinge',
        originRow: 3,
        originLane: 0,
        lane: 1,
        limitRow: 2,
        direction: 'up',
        style: 'solid',
      },
    ]);
    // Nothing on lane 1 above the open end: its one rail is the stub down to the bend.
    expect(layout.rails.filter((rail) => rail.lane === 1)).toEqual([
      { lane: 1, branch: 'hinge', upper: { at: 'node', row: 2 }, lower: { at: 'bend', bend: 0 }, style: 'solid' },
    ]);
  });

  it('should give an imported merge whose branch has no name a lane after the named ones', () => {
    const side = 'c0ffee0000000000000000000000000000000002';
    const rows = [
      entry('merge', { branch: 'main', parent: 'import', otherParents: [side] }),
      entry(side, { branch: side, parent: 's1' }),
      entry('s1', { branch: side, parent: 'import' }),
      entry('import', { branch: 'main' }),
    ];

    const layout = layoutRevisionGraph(rows, ['main']);

    expect(layout.lanes).toEqual(['main', side]);
    expect(lanesByKey(rows, layout)).toEqual({ merge: 0, [side]: 1, s1: 1, import: 0 });
    expect(layout.bends.map((bend) => [bend.kind, bend.branch, bend.originRow, bend.limitRow])).toEqual([
      ['fork', side, 3, 2],
      ['merge', side, 0, 1],
    ]);
  });

  it('should answer no lanes for rows with no markers', () => {
    expect(layoutRevisionGraph([chip('today')], ['main'])).toEqual({ lanes: [], nodes: [], rails: [], bends: [] });
  });

  it('should lay the same rows out the same way every time, without changing them', () => {
    const rows = Object.freeze([
      entry('l1', { branch: 'lid', parent: 'm2' }),
      entry('m3', { branch: 'main', parent: 'm2', otherParents: ['v1'] }),
      entry('v1', { branch: 'vents', parent: 'm1' }),
      entry('b1', { branch: 'base', parent: 'm1' }),
      entry('m2', { branch: 'main', parent: 'm1' }),
      entry('m1', { branch: 'main' }),
    ]);
    const before = structuredClone(rows);

    const first = layoutRevisionGraph(rows, ['main', 'lid', 'vents', 'base']);

    expect(layoutRevisionGraph(rows, ['main', 'lid', 'vents', 'base'])).toEqual(first);
    expect(rows).toEqual(before);
    expect(first.lanes[0]).toBe('main');
    expect(new Set(first.lanes)).toEqual(new Set(['main', 'lid', 'vents', 'base']));
  });
});
