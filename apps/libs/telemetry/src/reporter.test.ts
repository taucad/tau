/* eslint-disable @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation */
import { describe, it, expect, vi } from 'vitest';
import type { TelemetryBackend } from '#reporter.js';
import { createReporter } from '#reporter.js';
import { TauMetrics } from '#registry.js';

const createMockBackend = (): TelemetryBackend => ({
  recordCounter: vi.fn(),
  recordHistogram: vi.fn(),
  recordGauge: vi.fn(),
  recordUpDownCounter: vi.fn(),
});

describe('createReporter', () => {
  it('should create a method for every metric in the registry', () => {
    const backend = createMockBackend();
    const reporter = createReporter(backend, TauMetrics);

    for (const key of Object.keys(TauMetrics)) {
      expect(typeof reporter[key]).toBe('function');
    }
  });

  it('should delegate counter metrics to recordCounter', () => {
    const backend = createMockBackend();
    const reporter = createReporter(backend, TauMetrics);

    const record = reporter['kernelExecutions']!;
    record(1, { 'kernel.status': 'success' });
    expect(backend.recordCounter).toHaveBeenCalledWith('kernel.executions', 1, { 'kernel.status': 'success' });
  });

  it('should delegate histogram metrics to recordHistogram', () => {
    const backend = createMockBackend();
    const reporter = createReporter(backend, TauMetrics);

    reporter['rpcCallDuration']!(0.5, { 'rpc.method': 'render' });
    expect(backend.recordHistogram).toHaveBeenCalledWith('rpc.server.call.duration', 0.5, { 'rpc.method': 'render' });
  });

  it('should delegate gauge metrics to recordGauge', () => {
    const backend = createMockBackend();
    const reporter = createReporter(backend, TauMetrics);

    reporter['redisConnectionState']!(1, { 'redis.role': 'primary' });
    expect(backend.recordGauge).toHaveBeenCalledWith('redis.connection.state', 1, { 'redis.role': 'primary' });
  });

  it('should delegate upDownCounter metrics to recordUpDownCounter', () => {
    const backend = createMockBackend();
    const reporter = createReporter(backend, TauMetrics);

    reporter['wsActiveConnections']!(1, {});
    expect(backend.recordUpDownCounter).toHaveBeenCalledWith('ws.connections.active', 1, {});
  });

  it('should pass the OTEL metric name to the backend, not the registry key', () => {
    const backend = createMockBackend();
    const reporter = createReporter(backend, TauMetrics);

    reporter['genAiToolInvocations']!(1, { 'gen_ai.tool.name': 'render' });
    expect(backend.recordCounter).toHaveBeenCalledWith(
      'gen_ai.tool.invocations',
      1,
      expect.objectContaining({ 'gen_ai.tool.name': 'render' }),
    );
  });

  it('should not call other backend methods when recording a specific type', () => {
    const backend = createMockBackend();
    const reporter = createReporter(backend, TauMetrics);

    reporter['kernelExecutions']!(1, {});
    expect(backend.recordHistogram).not.toHaveBeenCalled();
    expect(backend.recordGauge).not.toHaveBeenCalled();
    expect(backend.recordUpDownCounter).not.toHaveBeenCalled();
  });

  it('should support multiple calls accumulating on the backend', () => {
    const backend = createMockBackend();
    const reporter = createReporter(backend, TauMetrics);

    reporter['kernelExecutions']!(1, { 'kernel.status': 'success' });
    reporter['kernelExecutions']!(1, { 'kernel.status': 'error' });
    expect(backend.recordCounter).toHaveBeenCalledTimes(2);
  });

  it('should work with an empty registry', () => {
    const backend = createMockBackend();
    const reporter = createReporter(backend, {});
    expect(Object.keys(reporter)).toHaveLength(0);
  });
});
