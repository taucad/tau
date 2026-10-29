import type { Attributes } from '@opentelemetry/api';
import { metrics } from '@opentelemetry/sdk-node';
import { describe, expect, it } from 'vitest';
import { cardinalityViews, defaultCardinalityLimit } from '#telemetry/cardinality-views.js';

/** A pull reader: `collect()` returns everything recorded since the provider started. */
class CollectingReader extends metrics.MetricReader {
  protected override async onShutdown(): Promise<void> {
    // Nothing to release.
  }

  protected override async onForceFlush(): Promise<void> {
    // Nothing is buffered.
  }
}

type CollectedStreams = {
  /** One entry per metric stream exported under the instrument's name. */
  streams: Attributes[][];
};

/**
 * Record one increment on each of `seriesCount` distinct attribute sets of a counter named `instrumentName`, through a
 * meter provider configured with the API's views, and collect the result.
 */
const recordDistinctSeries = async (instrumentName: string, seriesCount: number): Promise<CollectedStreams> => {
  const reader = new CollectingReader();
  const provider = new metrics.MeterProvider({ views: [...cardinalityViews], readers: [reader] });
  try {
    const counter = provider.getMeter('cardinality-views-test').createCounter(instrumentName);
    for (let series = 0; series < seriesCount; series++) {
      counter.add(1, { series });
    }
    const { resourceMetrics } = await reader.collect();
    const streams: Attributes[][] = [];
    for (const scope of resourceMetrics.scopeMetrics) {
      for (const metric of scope.metrics) {
        if (metric.descriptor.name !== instrumentName) {
          continue;
        }
        const attributes: Attributes[] = [];
        for (const point of metric.dataPoints) {
          attributes.push(point.attributes);
        }
        streams.push(attributes);
      }
    }
    return { streams };
  } finally {
    await provider.shutdown();
  }
};

const isOverflow = (attributes: Attributes): boolean => attributes['otel.metric.overflow'] === true;

describe('cardinalityViews', () => {
  it('should name exactly one instrument per view and never use a wildcard', () => {
    const names = cardinalityViews.map((view) => view.instrumentName);

    for (const view of cardinalityViews) {
      expect(Object.keys(view).toSorted()).toStrictEqual(['aggregationCardinalityLimit', 'instrumentName']);
      expect(view.instrumentName).toMatch(/^tau\.runtime\.[a-z_.]+$/u);
      expect(view.instrumentName).not.toMatch(/[*?]/u);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it('should set the series cap of each named instrument to the designed limit', () => {
    expect(
      Object.fromEntries(cardinalityViews.map((view) => [view.instrumentName, view.aggregationCardinalityLimit])),
    ).toStrictEqual({
      'tau.runtime.operations': 8192,
      'tau.runtime.operation.duration': 4096,
      'tau.runtime.operation_errors': 4096,
      'tau.runtime.kernel.heap': 4096,
      'tau.runtime.exports': 4096,
      'tau.runtime.operation.cohort_duration': 8192,
      'tau.runtime.plugin_operations': 2048,
    });
  });

  it('should only name instruments whose cap exceeds the SDK default', () => {
    for (const view of cardinalityViews) {
      expect(view.aggregationCardinalityLimit).toBeGreaterThan(defaultCardinalityLimit);
    }
  });

  it('should fold series beyond a named limit into one overflow series of a single stream', async () => {
    const limit = 2048;
    const { streams } = await recordDistinctSeries('tau.runtime.plugin_operations', limit + 1);

    expect(streams).toHaveLength(1);
    const [points = []] = streams;
    expect(points).toHaveLength(limit);
    expect(points.filter((attributes) => isOverflow(attributes))).toStrictEqual([{ 'otel.metric.overflow': true }]);
  });

  it('should keep a named instrument free of overflow up to its limit', async () => {
    const { streams } = await recordDistinctSeries('tau.runtime.plugin_operations', 2047);

    expect(streams).toHaveLength(1);
    expect(streams[0]?.some((attributes) => isOverflow(attributes))).toBe(false);
    expect(streams[0]).toHaveLength(2047);
  });

  it.each(['http.server.request.duration', 'tau.runtime.machine_operations'])(
    'should keep the SDK default of 2,000 series for %s, which has no view',
    async (instrumentName) => {
      const { streams } = await recordDistinctSeries(instrumentName, defaultCardinalityLimit + 1);

      expect(streams).toHaveLength(1);
      const [points = []] = streams;
      expect(points).toHaveLength(defaultCardinalityLimit);
      expect(points.filter((attributes) => isOverflow(attributes))).toHaveLength(1);
    },
  );
});
