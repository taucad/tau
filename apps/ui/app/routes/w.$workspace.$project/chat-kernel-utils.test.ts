import { describe, it, expect } from 'vitest';
import type { TelemetryEntry } from '@taucad/runtime';
import type { SpanNode } from '#routes/w.$workspace.$project/chat-kernel-types.js';
import {
  formatDuration,
  formatTimestamp,
  getSpanId,
  getParentSpanId,
  buildSpanTree,
  getSpanCategory,
  filterSpanTree,
  applyVisibility,
  flattenSpanTree,
  flattenForStandardView,
  collectAllSpanIds,
  generateTicks,
  selectPipelineData,
} from '#routes/w.$workspace.$project/chat-kernel-utils.js';
import { emptyPipelineData } from '#routes/w.$workspace.$project/chat-kernel-types.js';

function makeEntry(overrides: Partial<TelemetryEntry> & { name: string }): TelemetryEntry {
  return {
    name: overrides.name,
    startTime: overrides.startTime ?? 0,
    duration: overrides.duration ?? 0,
    workerTimeOrigin: 0,
    detail: overrides.detail,
  };
}

describe('formatDuration', () => {
  it('returns <1ms for sub-millisecond durations', () => {
    expect(formatDuration(0.5)).toBe('<1ms');
  });

  it('returns rounded ms for values under 1s', () => {
    expect(formatDuration(42.6)).toBe('43ms');
  });

  it('returns seconds with 2 decimal places for 1s+', () => {
    expect(formatDuration(1500)).toBe('1.50s');
  });
});

describe('formatTimestamp', () => {
  it('returns a time string', () => {
    const result = formatTimestamp(0);
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

describe('getSpanId / getParentSpanId', () => {
  it('extracts spanId from detail', () => {
    const entry = makeEntry({ name: 'a', detail: { spanId: 's1' } });
    expect(getSpanId(entry)).toBe('s1');
  });

  it('returns undefined when no detail', () => {
    const entry = makeEntry({ name: 'a' });
    expect(getSpanId(entry)).toBeUndefined();
  });

  it('extracts parentSpanId from detail', () => {
    const entry = makeEntry({ name: 'a', detail: { parentSpanId: 'p1' } });
    expect(getParentSpanId(entry)).toBe('p1');
  });
});

describe('buildSpanTree', () => {
  it('returns empty array for no entries', () => {
    expect(buildSpanTree([])).toEqual([]);
  });

  it('builds a flat tree from unrelated entries', () => {
    const entries = [
      makeEntry({ name: 'a', detail: { spanId: 's1' }, duration: 10 }),
      makeEntry({ name: 'b', detail: { spanId: 's2' }, duration: 5 }),
    ];
    const roots = buildSpanTree(entries);
    expect(roots).toHaveLength(2);
    expect(roots[0]!.children).toHaveLength(0);
  });

  it('nests children under parents', () => {
    const entries = [
      makeEntry({ name: 'parent', detail: { spanId: 'p' }, duration: 20 }),
      makeEntry({ name: 'child', detail: { spanId: 'c', parentSpanId: 'p' }, duration: 10 }),
    ];
    const roots = buildSpanTree(entries);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.children).toHaveLength(1);
    expect(roots[0]!.children[0]!.entry.name).toBe('child');
  });

  it('computes self time correctly', () => {
    const entries = [
      makeEntry({ name: 'parent', detail: { spanId: 'p' }, duration: 100 }),
      makeEntry({ name: 'child', detail: { spanId: 'c', parentSpanId: 'p' }, duration: 60 }),
    ];
    const roots = buildSpanTree(entries);
    expect(roots[0]!.selfTime).toBe(40);
  });

  it('assigns depths correctly', () => {
    const entries = [
      makeEntry({ name: 'root', detail: { spanId: 'r' }, duration: 100 }),
      makeEntry({ name: 'mid', detail: { spanId: 'm', parentSpanId: 'r' }, duration: 50 }),
      makeEntry({ name: 'leaf', detail: { spanId: 'l', parentSpanId: 'm' }, duration: 10 }),
    ];
    const roots = buildSpanTree(entries);
    expect(roots[0]!.depth).toBe(0);
    expect(roots[0]!.children[0]!.depth).toBe(1);
    expect(roots[0]!.children[0]!.children[0]!.depth).toBe(2);
  });
});

describe('getSpanCategory', () => {
  it('classifies kernel.* as framework', () => {
    expect(getSpanCategory('kernel.render')).toBe('framework');
  });

  it('classifies wasm.* as framework', () => {
    expect(getSpanCategory('wasm.init')).toBe('framework');
  });

  it('classifies middleware.* as middleware', () => {
    expect(getSpanCategory('middleware.cache')).toBe('middleware');
  });

  it('classifies fs.* as fs', () => {
    expect(getSpanCategory('fs.read')).toBe('fs');
  });

  it('classifies deps.* as deps', () => {
    expect(getSpanCategory('deps.resolve')).toBe('deps');
  });

  it('defaults to kernel for unknown prefixes', () => {
    expect(getSpanCategory('customOp')).toBe('kernel');
  });
});

describe('filterSpanTree', () => {
  const makeNode = (name: string, duration: number, children: SpanNode[] = []): SpanNode => ({
    entry: makeEntry({ name, duration }),
    children,
    depth: 0,
    selfTime: duration,
  });

  it('returns all nodes when no conditions', () => {
    const roots = [makeNode('a', 10)];
    expect(filterSpanTree(roots, [])).toBe(roots);
  });

  it('filters by name contains', () => {
    const roots = [makeNode('kernel.render', 10), makeNode('fs.read', 5)];
    const result = filterSpanTree(roots, [{ id: '1', field: 'name', operator: 'contains', value: 'kernel' }]);
    expect(result).toHaveLength(1);
    expect(result[0]!.entry.name).toBe('kernel.render');
  });

  it('filters by latency threshold', () => {
    const roots = [makeNode('a', 100), makeNode('b', 5)];
    const result = filterSpanTree(roots, [{ id: '2', field: 'latency', operator: '>', value: '50' }]);
    expect(result).toHaveLength(1);
    expect(result[0]!.entry.name).toBe('a');
  });
});

describe('applyVisibility', () => {
  const makeNode = (name: string, duration: number, children: SpanNode[] = []): SpanNode => ({
    entry: makeEntry({ name, duration }),
    children,
    depth: 0,
    selfTime: duration,
  });

  it('returns all nodes for visibility=all', () => {
    const roots = [makeNode('a', 0.5)];
    expect(applyVisibility(roots, 'all')).toBe(roots);
  });

  it('filters sub-millisecond spans for visibility=relevant', () => {
    const roots = [makeNode('a', 0.5), makeNode('b', 10)];
    const result = applyVisibility(roots, 'relevant');
    expect(result).toHaveLength(1);
    expect(result[0]!.entry.name).toBe('b');
  });
});

describe('flattenSpanTree', () => {
  it('flattens tree in DFS order', () => {
    const child: SpanNode = {
      entry: makeEntry({ name: 'child', detail: { spanId: 'c' } }),
      children: [],
      depth: 1,
      selfTime: 0,
    };
    const root: SpanNode = {
      entry: makeEntry({ name: 'root', detail: { spanId: 'r' } }),
      children: [child],
      depth: 0,
      selfTime: 0,
    };

    const flat = flattenSpanTree([root], new Set());
    expect(flat).toHaveLength(2);
    expect(flat[0]!.entry.name).toBe('root');
    expect(flat[1]!.entry.name).toBe('child');
  });

  it('skips children of collapsed nodes', () => {
    const child: SpanNode = {
      entry: makeEntry({ name: 'child', detail: { spanId: 'c' } }),
      children: [],
      depth: 1,
      selfTime: 0,
    };
    const root: SpanNode = {
      entry: makeEntry({ name: 'root', detail: { spanId: 'r' } }),
      children: [child],
      depth: 0,
      selfTime: 0,
    };

    const flat = flattenSpanTree([root], new Set(['r']));
    expect(flat).toHaveLength(1);
    expect(flat[0]!.entry.name).toBe('root');
  });
});

describe('flattenForStandardView', () => {
  it('produces FlatSpanRow entries with isLast and ancestorIsLast', () => {
    const root: SpanNode = {
      entry: makeEntry({ name: 'root', detail: { spanId: 'r' } }),
      children: [],
      depth: 0,
      selfTime: 0,
    };

    const rows = flattenForStandardView([root], new Set());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isLast).toBe(true);
    expect(rows[0]!.ancestorIsLast).toEqual([]);
  });
});

describe('collectAllSpanIds', () => {
  it('collects IDs of nodes with children', () => {
    const child: SpanNode = {
      entry: makeEntry({ name: 'child', detail: { spanId: 'c' } }),
      children: [],
      depth: 1,
      selfTime: 0,
    };
    const root: SpanNode = {
      entry: makeEntry({ name: 'root', detail: { spanId: 'r' } }),
      children: [child],
      depth: 0,
      selfTime: 0,
    };

    const ids = collectAllSpanIds([root]);
    expect(ids.has('r')).toBe(true);
    expect(ids.has('c')).toBe(false);
  });
});

describe('generateTicks', () => {
  it('returns [0] for zero duration', () => {
    expect(generateTicks(0, 400)).toEqual([0]);
  });

  it('generates ascending ticks', () => {
    const ticks = generateTicks(500, 400);
    expect(ticks.length).toBeGreaterThan(1);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
    }
  });
});

describe('selectPipelineData', () => {
  it('returns emptyPipelineData for no entries', () => {
    const result = selectPipelineData({ context: { telemetryEntries: [] } });
    expect(result).toBe(emptyPipelineData);
  });

  it('extracts phase durations from kernel.render entries', () => {
    const entries = [
      makeEntry({ name: 'kernel.render', duration: 100 }),
      makeEntry({ name: 'bundler', duration: 30, detail: { phase: 'bundling' } }),
      makeEntry({ name: 'geometry', duration: 50, detail: { phase: 'computingGeometry' } }),
    ];
    const result = selectPipelineData({ context: { telemetryEntries: entries } });
    expect(result.totalDuration).toBe(100);
    expect(result.phaseDurations.get('bundling')).toBe(30);
    expect(result.phaseDurations.get('computingGeometry')).toBe(50);
  });

  it('caches results for same entries reference', () => {
    const entries = [makeEntry({ name: 'kernel.render', duration: 100 })];
    const state = { context: { telemetryEntries: entries } };
    const result1 = selectPipelineData(state);
    const result2 = selectPipelineData(state);
    expect(result1).toBe(result2);
  });
});
