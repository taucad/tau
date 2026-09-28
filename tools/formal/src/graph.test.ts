import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { staleFiles } from '#export.js';
import type { SpecGraph, SpecView } from '#graph.js';
import { buildSpecGraph, coveringSuite, readSpecGraph, serializeGraph, suiteBehaviours, walkPaths } from '#graph.js';

const state = (phase: string, act: string, retries = 0): SpecView => ({ act: [act], turn: { phase, retries } });
const init = state('idle', 'Init');
const busy = state('busy', 'Start');
const done = state('done', 'Finish');
const retried = state('busy', 'Retry', 1);
const pairs: Array<readonly [SpecView, SpecView]> = [
  [init, busy],
  [busy, done],
  [busy, retried],
  [retried, done],
  [busy, done],
];

describe('spec graph', () => {
  it('should build a canonical graph whose initial state has no incoming edge', () => {
    const graph = buildSpecGraph(pairs, 'act');

    expect(graph.views).toHaveLength(4);
    expect(graph.edges).toHaveLength(4);
    expect(graph.initial.map((index) => graph.views[index])).toEqual([init]);
    expect(buildSpecGraph([...pairs].reverse(), 'act')).toEqual(graph);
  });

  it('should cover every (source phase, action) class with a shortest behaviour', () => {
    const graph = buildSpecGraph(pairs, 'act');

    expect(suiteBehaviours(graph, coveringSuite(graph, 'turn.phase'))).toEqual([
      [init, busy, done],
      [init, busy, retried],
      [init, busy],
    ]);
  });

  it('should reject an implementation step the spec does not allow', () => {
    const graph = buildSpecGraph(pairs, 'act');

    expect(
      walkPaths(graph, [
        {
          initial: { turn: init['turn'] },
          steps: [
            { action: '["Start"]', view: { turn: busy['turn'] } },
            { action: '["Finish"]', view: { turn: done['turn'] } },
          ],
        },
        {
          initial: { turn: init['turn'] },
          steps: [
            { action: '["Start"]', view: { turn: busy['turn'] } },
            { action: '["Retry"]', view: { turn: { phase: 'busy', retries: 2 } } },
          ],
        },
      ]),
    ).toEqual([
      { path: 1, step: 2, action: '["Retry"]', allowed: [retried], actual: { turn: { phase: 'busy', retries: 2 } } },
    ]);
  });

  it('should retain every state and transition when a large graph is compacted', () => {
    const graph: SpecGraph = {
      initial: [0],
      views: Array.from({ length: 1200 }, (_, id) => ({ id, payload: 'x'.repeat(1000) })),
      edges: Array.from({ length: 1199 }, (_, from) => [from, from + 1, 'Next']),
    };
    const directory = mkdtempSync(path.join(tmpdir(), 'formal-graph-'));
    try {
      const file = path.join(directory, 'graph.json');
      const serialized = serializeGraph(graph);
      expect(serialized.length).toBeLessThan(1_000_000);
      writeFileSync(file, serialized);
      expect(readSpecGraph(file)).toEqual(graph);
      expect(staleFiles({ [file]: serialized })).toEqual([]);
      writeFileSync(file, JSON.stringify({ ...JSON.parse(serialized), edges: [] }));
      expect(staleFiles({ [file]: serialized })).toEqual([file]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
