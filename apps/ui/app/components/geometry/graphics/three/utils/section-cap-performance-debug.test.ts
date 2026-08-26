// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addSectionCapTiming,
  appendSectionCapPerformanceFrame,
  createSectionCapFramePerformance,
  recordSectionCapBooleanOperation,
  recordSectionCapPackedGeometry,
  sectionCapPerformanceHistoryLimit,
} from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';

describe('section cap performance debug helpers', () => {
  it('should build bounded summaries with p50 p95 and max frame timings', () => {
    let summary = appendSectionCapPerformanceFrame(undefined, createSectionCapFramePerformance(1, 100), 3);
    for (const [sequence, total] of [
      [2, 8],
      [3, 2],
      [4, 12],
    ] as const) {
      const frame = createSectionCapFramePerformance(sequence, 100 + sequence);
      addSectionCapTiming(frame, 'frameTotal', total);
      summary = appendSectionCapPerformanceFrame(summary, frame, 3);
    }

    expect(summary.history.map((frame) => frame.sequence)).toEqual([2, 3, 4]);
    expect(summary.latestFrame.sequence).toBe(4);
    expect(summary.aggregates.frameTotal).toEqual({
      count: 3,
      p50: 8,
      p95: 12,
      max: 12,
    });
  });

  it('should record boolean and packed geometry counters without requiring a summary history', () => {
    const frame = createSectionCapFramePerformance(1, 0);
    frame.topologyKey = 'topology:a';
    frame.styleKey = 'style:hover';
    frame.baseCapTopologyKey = 'topology:a';
    frame.baseCapFrameTopologyKey = 'topology:a';
    frame.baseCapIsCurrent = true;
    frame.exactDiagnosticTopologyKey = 'topology:a';
    frame.exactDiagnosticIsCurrent = true;
    frame.committedTopologyKey = 'topology:a';
    frame.pendingReason = 'none';
    frame.counters.baseFillVertexCount = 42;
    frame.counters.baseBoundarySegmentCount = 7;
    frame.counters.rawOpenPolylineSegmentCount = 2;
    frame.counters.styleOnlyUpdateCount = 1;
    frame.counters.topologyWorkerRequestCount = 0;
    frame.booleanBackend = {
      name: 'clipper2-wasm',
      version: '0.4.0',
      target: 'wasm',
      initializationTime: 3,
    };

    recordSectionCapBooleanOperation(frame, 'intersection', 1.5);
    recordSectionCapBooleanOperation(frame, 'union', 2);
    recordSectionCapBooleanOperation(frame, 'difference', 3);
    recordSectionCapPackedGeometry(frame, {
      partCount: 2,
      triangulatedPolygonCount: 3,
      packedVertexCount: 12,
      packedIndexCount: 18,
      packedByteCount: 456,
    });

    expect(frame.booleanOperations).toEqual({
      intersection: { count: 1, total: 1.5 },
      union: { count: 1, total: 2 },
      difference: { count: 1, total: 3 },
    });
    expect(frame.packing).toEqual({
      partCount: 2,
      triangulatedPolygonCount: 3,
      packedVertexCount: 12,
      packedIndexCount: 18,
      packedByteCount: 456,
    });
    expect(frame.booleanBackend).toEqual({
      name: 'clipper2-wasm',
      version: '0.4.0',
      target: 'wasm',
      initializationTime: 3,
    });
    expect(frame).toMatchObject({
      topologyKey: 'topology:a',
      styleKey: 'style:hover',
      baseCapTopologyKey: 'topology:a',
      baseCapFrameTopologyKey: 'topology:a',
      baseCapIsCurrent: true,
      exactDiagnosticTopologyKey: 'topology:a',
      exactDiagnosticIsCurrent: true,
      committedTopologyKey: 'topology:a',
      pendingReason: 'none',
      counters: {
        baseFillVertexCount: 42,
        baseBoundarySegmentCount: 7,
        rawOpenPolylineSegmentCount: 2,
        styleOnlyUpdateCount: 1,
        topologyWorkerRequestCount: 0,
      },
    });
  });

  it('should expose the default bounded history size', () => {
    expect(sectionCapPerformanceHistoryLimit).toBe(120);
  });
});
