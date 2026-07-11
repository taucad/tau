import { describe, it, expect } from 'vitest';
import { toPrometheusName, PrometheusNames, prometheusNameOf } from '#prometheus.js';
import { TauMetrics } from '#registry.js';

describe('toPrometheusName', () => {
  it('should convert dots to underscores', () => {
    expect(toPrometheusName('rpc.server.call.duration', 'histogram', 's')).toBe('rpc_server_call_duration_seconds');
  });

  it('should append _total for counters', () => {
    expect(toPrometheusName('ws.disconnections', 'counter', '{connection}')).toBe('ws_disconnections_total');
  });

  it('should append _seconds for unit "s"', () => {
    expect(toPrometheusName('gen_ai.client.operation.duration', 'histogram', 's')).toBe(
      'gen_ai_client_operation_duration_seconds',
    );
  });

  it('should strip curly-brace unit annotations', () => {
    expect(toPrometheusName('kernel.executions', 'counter', '{execution}')).toBe('kernel_executions_total');
  });

  it('should handle empty unit', () => {
    expect(toPrometheusName('redis.connection.state', 'gauge', '')).toBe('redis_connection_state');
  });

  it('should handle upDownCounter without _total suffix', () => {
    expect(toPrometheusName('rpc.server.active_calls', 'upDownCounter', '{call}')).toBe('rpc_server_active_calls');
  });

  it('should handle counter with USD unit', () => {
    expect(toPrometheusName('gen_ai.client.cost', 'counter', 'USD')).toBe('gen_ai_client_cost_USD_total');
  });

  it('should not double-append unit suffix if name already ends with it', () => {
    expect(toPrometheusName('test_seconds', 'histogram', 's')).toBe('test_seconds');
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
      const expected = toPrometheusName(metric.name, metric.type, metric.unit);
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
    expect(prometheusNameOf(TauMetrics.rpcCallDuration)).toBe('rpc_server_call_duration_seconds');
    expect(prometheusNameOf(TauMetrics.kernelExecutions)).toBe('kernel_executions_total');
  });
});
