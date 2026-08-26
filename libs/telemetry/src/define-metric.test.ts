import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineCounter, defineHistogram, defineGauge, defineUpDownCounter } from '#define-metric.js';

describe('defineCounter', () => {
  it('should produce a metric with type "counter"', () => {
    const metric = defineCounter({
      name: 'test.count',
      unit: '{item}',
      description: 'Test counter',
      attributes: z.object({ status: z.string() }),
    });

    expect(metric.type).toBe('counter');
    expect(metric.name).toBe('test.count');
    expect(metric.unit).toBe('{item}');
    expect(metric.description).toBe('Test counter');
    expect(metric.buckets).toBeUndefined();
  });

  it('should preserve the attribute schema', () => {
    const attributes = z.object({ code: z.number() });
    const metric = defineCounter({
      name: 'test.count',
      unit: '{item}',
      description: 'Test',
      attributes,
    });

    expect(metric.attributes).toBe(attributes);
  });
});

describe('defineHistogram', () => {
  it('should produce a metric with type "histogram" and buckets', () => {
    const metric = defineHistogram({
      name: 'test.duration',
      unit: 's',
      description: 'Test histogram',
      buckets: [0.05, 0.1, 0.5, 1, 5],
      attributes: z.object({}),
    });

    expect(metric.type).toBe('histogram');
    expect(metric.buckets).toEqual([0.05, 0.1, 0.5, 1, 5]);
  });

  it('should preserve all provided fields', () => {
    const attributes = z.object({ method: z.string() });
    const metric = defineHistogram({
      name: 'rpc.duration',
      unit: 's',
      description: 'RPC call duration',
      buckets: [0.01, 0.05],
      attributes,
    });

    expect(metric.name).toBe('rpc.duration');
    expect(metric.unit).toBe('s');
    expect(metric.description).toBe('RPC call duration');
    expect(metric.attributes).toBe(attributes);
  });
});

describe('defineGauge', () => {
  it('should produce a metric with type "gauge"', () => {
    const metric = defineGauge({
      name: 'redis.connection.state',
      unit: '',
      description: 'Redis state',
      attributes: z.object({}),
    });

    expect(metric.type).toBe('gauge');
    expect(metric.buckets).toBeUndefined();
  });

  it('should preserve all provided fields', () => {
    const metric = defineGauge({
      name: 'test.gauge',
      unit: '{connection}',
      description: 'Active connections',
      attributes: z.object({ host: z.string() }),
    });

    expect(metric.name).toBe('test.gauge');
    expect(metric.unit).toBe('{connection}');
  });
});

describe('defineUpDownCounter', () => {
  it('should produce a metric with type "upDownCounter"', () => {
    const metric = defineUpDownCounter({
      name: 'ws.connections.active',
      unit: '{connection}',
      description: 'Active WS connections',
      attributes: z.object({}),
    });

    expect(metric.type).toBe('upDownCounter');
    expect(metric.buckets).toBeUndefined();
  });

  it('should preserve all provided fields', () => {
    const attributes = z.object({ reason: z.string() });
    const metric = defineUpDownCounter({
      name: 'active.requests',
      unit: '{request}',
      description: 'In-flight requests',
      attributes,
    });

    expect(metric.name).toBe('active.requests');
    expect(metric.attributes).toBe(attributes);
  });
});
