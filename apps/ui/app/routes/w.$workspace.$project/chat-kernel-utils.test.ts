import { describe, expect, it } from 'vitest';
import type { TelemetryEntry } from '@taucad/runtime';
import type { SpanNode } from '#routes/w.$workspace.$project/chat-kernel-types.js';
import {
  applyVisibility,
  buildPipelineLanes,
  buildSpanTree,
  buildTelemetryTraces,
  collectAllSpanIds,
  filterSpanTree,
  filterSpanTreeByQuery,
  findSpanPath,
  flattenSpanRows,
  flattenSpanTree,
  formatDuration,
  formatTimestamp,
  generateTicks,
  getLatestTrace,
  getParentSpanId,
  getPhaseLabel,
  getSlowestLeaf,
  getSpanCategory,
  getSpanId,
  getVisibleAttributes,
} from '#routes/w.$workspace.$project/chat-kernel-utils.js';

function makeEntry(overrides: Partial<TelemetryEntry> & { name: string }): TelemetryEntry {
  return {
    name: overrides.name,
    startTime: overrides.startTime ?? 0,
    duration: overrides.duration ?? 0,
    workerTimeOrigin: overrides.workerTimeOrigin ?? 0,
    detail: overrides.detail,
  };
}

function makeNode(name: string, duration: number, children: SpanNode[] = []): SpanNode {
  return { entry: makeEntry({ name, duration }), children, depth: 0, selfTime: duration };
}

describe('telemetry formatting', () => {
  it('formats sub-millisecond, millisecond, second, and clock values', () => {
    expect(formatDuration(0.5)).toBe('<1ms');
    expect(formatDuration(42.6)).toBe('43ms');
    expect(formatDuration(1500)).toBe('1.50s');
    expect(formatTimestamp(0)).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('humanizes custom phases without hiding known labels', () => {
    expect(getPhaseLabel('resolvingDeps')).toBe('Resolving Dependencies');
    expect(getPhaseLabel('generatingToolpath')).toBe('Generating Toolpath');
  });
});

describe('span tree construction', () => {
  it('extracts span identifiers safely', () => {
    const entry = makeEntry({ name: 'a', detail: { spanId: 's1', parentSpanId: 'p1' } });
    expect(getSpanId(entry)).toBe('s1');
    expect(getParentSpanId(entry)).toBe('p1');
    expect(getSpanId(makeEntry({ name: 'missing' }))).toBeUndefined();
  });

  it('sorts roots and children chronologically and assigns depths', () => {
    const roots = buildSpanTree([
      makeEntry({ name: 'late-child', startTime: 30, duration: 1, detail: { spanId: 'c2', parentSpanId: 'r' } }),
      makeEntry({ name: 'root', startTime: 10, duration: 30, detail: { spanId: 'r' } }),
      makeEntry({ name: 'early-child', startTime: 20, duration: 1, detail: { spanId: 'c1', parentSpanId: 'r' } }),
      makeEntry({ name: 'earlier-root', startTime: 0, duration: 2, detail: { spanId: 'e' } }),
    ]);

    expect(roots.map(({ entry }) => entry.name)).toEqual(['earlier-root', 'root']);
    expect(roots[1]!.children.map(({ entry }) => entry.name)).toEqual(['early-child', 'late-child']);
    expect(roots[1]!.children[0]!.depth).toBe(1);
  });

  it('subtracts the union of clipped direct child intervals for own time', () => {
    const [root] = buildSpanTree([
      makeEntry({ name: 'root', startTime: 10, duration: 100, detail: { spanId: 'r' } }),
      makeEntry({ name: 'first', startTime: 0, duration: 70, detail: { spanId: 'a', parentSpanId: 'r' } }),
      makeEntry({ name: 'overlap', startTime: 50, duration: 80, detail: { spanId: 'b', parentSpanId: 'r' } }),
    ]);

    expect(root?.selfTime).toBe(0);
  });
});

describe('trace projection', () => {
  const entries = [
    makeEntry({
      name: 'kernel.bootstrap',
      startTime: 0,
      duration: 20,
      workerTimeOrigin: 1000,
      detail: { spanId: 'bootstrap' },
    }),
    makeEntry({
      name: 'kernel.render',
      startTime: 30,
      duration: 100,
      workerTimeOrigin: 1000,
      detail: { spanId: 'render-1' },
    }),
    makeEntry({
      name: 'bundle',
      startTime: 40,
      duration: 60,
      detail: { spanId: 'bundle', parentSpanId: 'render-1', phase: 'bundling' },
    }),
    makeEntry({
      name: 'compute-a',
      startTime: 80,
      duration: 25,
      detail: { spanId: 'compute-a', parentSpanId: 'render-1', phase: 'computingGeometry' },
    }),
    makeEntry({
      name: 'compute-b',
      startTime: 95,
      duration: 25,
      detail: { spanId: 'compute-b', parentSpanId: 'render-1', phase: 'computingGeometry' },
    }),
    makeEntry({
      name: 'kernel.render',
      startTime: 200,
      duration: 40,
      workerTimeOrigin: 1000,
      detail: { spanId: 'render-2' },
    }),
    makeEntry({
      name: 'kernel.transcode',
      startTime: 245,
      duration: 4,
      workerTimeOrigin: 1000,
      detail: { spanId: 'transcode', from: 'glb', to: 'webp', success: true },
    }),
    makeEntry({
      name: 'orphan',
      startTime: 250,
      duration: 5,
      workerTimeOrigin: 1000,
      detail: { spanId: 'orphan', parentSpanId: 'gone' },
    }),
  ];

  it('creates one trace per lifecycle root and retains orphan data explicitly', () => {
    const traces = buildTelemetryTraces(entries);
    expect(traces.map(({ kind }) => kind)).toEqual(['bootstrap', 'render', 'render', 'transcode', 'unattributed']);
    expect(traces[1]).toMatchObject({ id: 'render-1', spanCount: 4, duration: 100, absoluteStart: 1030 });
  });

  it('selects only the latest completed root', () => {
    expect(getLatestTrace(buildTelemetryTraces(entries))?.id).toBe('orphan');
    expect(getLatestTrace(buildTelemetryTraces(entries).filter(({ kind }) => kind !== 'unattributed'))?.id).toBe(
      'transcode',
    );
  });

  it('builds honest shared-axis phase lanes and unions overlap within a phase', () => {
    const render = buildTelemetryTraces(entries).find(({ id }) => id === 'render-1')!;
    const lanes = buildPipelineLanes(render);
    expect(lanes.map(({ phase }) => phase)).toEqual(['bundling', 'computingGeometry']);
    expect(lanes[0]?.intervals).toEqual([{ start: 10, duration: 60 }]);
    expect(lanes[1]?.intervals).toEqual([{ start: 50, duration: 40 }]);
    expect(lanes[1]?.coveredDuration).toBe(40);
    expect(lanes.some(({ phase }) => phase === 'postProcessing')).toBe(false);
  });

  it('omits phase chrome for non-render traces', () => {
    const bootstrap = buildTelemetryTraces(entries)[0]!;
    expect(buildPipelineLanes(bootstrap)).toEqual([]);
  });
});

describe('span classification and filtering', () => {
  it('classifies the existing categories', () => {
    expect(getSpanCategory('kernel.render')).toBe('framework');
    expect(getSpanCategory('wasm.init')).toBe('framework');
    expect(getSpanCategory('middleware.cache')).toBe('middleware');
    expect(getSpanCategory('fs.read')).toBe('fs');
    expect(getSpanCategory('deps.resolve')).toBe('deps');
    expect(getSpanCategory('customOp')).toBe('kernel');
  });

  it('returns only visible primitive attributes', () => {
    const entry = makeEntry({
      name: 'span',
      detail: { spanId: '1', parentSpanId: '0', devtools: { hidden: true }, phase: 'bundling', cached: true, count: 2 },
    });
    expect(getVisibleAttributes(entry)).toEqual([
      ['cached', true],
      ['count', 2],
      ['phase', 'bundling'],
    ]);
  });

  it('retains ancestors for operation, category, attribute key, and attribute value matches', () => {
    const roots = buildSpanTree([
      makeEntry({ name: 'kernel.render', duration: 20, detail: { spanId: 'root' } }),
      makeEntry({
        name: 'fs.read',
        duration: 4,
        detail: { spanId: 'child', parentSpanId: 'root', fileName: 'widget.scad' },
      }),
    ]);

    for (const query of ['fs.read', 'file system', 'fileName', 'widget.scad']) {
      expect(filterSpanTreeByQuery(roots, query)[0]?.children[0]?.entry.name).toBe('fs.read');
    }
  });

  it('composes structured filters and relevance while retaining ancestors', () => {
    const roots = [makeNode('parent', 0.2, [makeNode('slow-child', 50), makeNode('fast-child', 0.2)])];
    const filtered = filterSpanTree(roots, [{ id: '1', field: 'name', operator: 'contains', value: 'slow' }]);
    expect(filtered[0]?.children).toHaveLength(1);
    expect(applyVisibility(roots, 'relevant')[0]?.children).toHaveLength(1);
  });
});

describe('trace navigation projections', () => {
  const child: SpanNode = {
    entry: makeEntry({ name: 'child', duration: 8, detail: { spanId: 'c' } }),
    children: [],
    depth: 1,
    selfTime: 8,
  };
  const root: SpanNode = {
    entry: makeEntry({ name: 'root', duration: 10, detail: { spanId: 'r' } }),
    children: [child],
    depth: 0,
    selfTime: 2,
  };

  it('flattens in DFS order and respects collapse', () => {
    expect(flattenSpanTree([root], new Set()).map(({ entry }) => entry.name)).toEqual(['root', 'child']);
    expect(flattenSpanTree([root], new Set(['r']))).toHaveLength(1);
  });

  it('includes tree position and parent metadata for ARIA', () => {
    const rows = flattenSpanRows([root], new Set());
    expect(rows[0]).toMatchObject({ positionInSet: 1, setSize: 1, parentId: undefined });
    expect(rows[1]).toMatchObject({ positionInSet: 1, setSize: 1, parentId: 'r' });
  });

  it('collects collapsible IDs and resolves a selected operation path', () => {
    expect(collectAllSpanIds([root])).toEqual(new Set(['r']));
    expect(findSpanPath([root], 'c').map(({ entry }) => entry.name)).toEqual(['root', 'child']);
  });

  it('finds the slowest leaf', () => {
    expect(getSlowestLeaf(root).entry.name).toBe('child');
  });

  it('generates stable timeline ticks', () => {
    expect(generateTicks(0, 400)).toEqual([0]);
    const ticks = generateTicks(500, 400);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks).toEqual([...ticks].sort((left, right) => left - right));
  });
});
