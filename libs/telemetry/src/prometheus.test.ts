import { describe, it, expect } from 'vitest';
import { toPrometheusName, PrometheusNames, prometheusNameOf } from '#prometheus.js';
import { TauMetrics } from '#registry.js';

describe('toPrometheusName', () => {
  it('should convert dots to underscores without a unit suffix, as the exporter does', () => {
    expect(toPrometheusName('rpc.server.call.duration', 'histogram')).toBe('rpc_server_call_duration');
    expect(toPrometheusName('tau.storage.operation.duration', 'histogram')).toBe('tau_storage_operation_duration');
  });

  it('should append _total for counters', () => {
    expect(toPrometheusName('ws.disconnections', 'counter')).toBe('ws_disconnections_total');
    expect(toPrometheusName('tau.storage.transferred_bytes', 'counter')).toBe('tau_storage_transferred_bytes_total');
  });

  it('should not double-append _total', () => {
    expect(toPrometheusName('publication.views.total', 'counter')).toBe('publication_views_total');
  });

  it('should leave gauges and upDownCounters without _total', () => {
    expect(toPrometheusName('redis.connection.state', 'gauge')).toBe('redis_connection_state');
    expect(toPrometheusName('rpc.server.active_calls', 'upDownCounter')).toBe('rpc_server_active_calls');
  });

  it('should collapse repeated underscores from invalid characters', () => {
    expect(toPrometheusName('a..b-c', 'gauge')).toBe('a_b_c');
  });
});

describe('PrometheusNames', () => {
  it('should have an entry for every metric in TauMetrics', () => {
    for (const key of Object.keys(TauMetrics)) {
      expect(PrometheusNames).toHaveProperty(key);
    }
  });

  it('should match toPrometheusName output for each metric', () => {
    for (const [key, metric] of Object.entries(TauMetrics)) {
      const expected = toPrometheusName(metric.name, metric.type);
      expect(PrometheusNames[key as keyof typeof PrometheusNames]).toBe(expected);
    }
  });

  it('should produce expected names for renamed metrics', () => {
    expect(PrometheusNames.wsDisconnections).toBe('ws_disconnections_total');
    expect(PrometheusNames.kernelExecutions).toBe('kernel_executions_total');
    expect(PrometheusNames.sseEvents).toBe('sse_events_total');
    expect(PrometheusNames.publicationViewsTotal).toBe('publication_views_total');
    expect(PrometheusNames.publicationViewsRejectedTotal).toBe('publication_views_rejections_total');
    expect(PrometheusNames.publicationInviteEmailsTotal).toBe('publication_invite_emails_total');
    expect(PrometheusNames.publicationInviteEmailsSuppressedTotal).toBe('publication_invite_emails_suppressions_total');
  });
});

describe('prometheusNameOf', () => {
  it('should return the correct Prometheus name for a metric definition', () => {
    expect(prometheusNameOf(TauMetrics.rpcCallDuration)).toBe('rpc_server_call_duration');
    expect(prometheusNameOf(TauMetrics.kernelExecutions)).toBe('kernel_executions_total');
  });
});
