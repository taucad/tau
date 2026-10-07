import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { metrics } from '@opentelemetry/sdk-node';

/**
 * `otel.test.ts` proves the exporter is built with `withResourceConstantLabels`; this proves the
 * installed exporter honours that option, so a rename upstream fails here instead of silently
 * stripping `service_name` from every Fly-scraped series (OBS-13).
 */
describe('PrometheusExporter withResourceConstantLabels', () => {
  it('should put service_name on every series, no other resource attribute and no unit suffix', async () => {
    const exporter = new PrometheusExporter({
      preventServerStart: true,
      withResourceConstantLabels: /^service\.name$/u,
    });
    const provider = new metrics.MeterProvider({
      resource: resourceFromAttributes({ 'service.name': 'tau-api', 'deployment.environment': 'test' }),
      readers: [exporter],
    });
    const meter = provider.getMeter('test');
    meter.createCounter('kernel.executions').add(1);
    meter.createHistogram('tau.storage.operation.duration', { unit: 's' }).record(0.2);

    const body = await new Promise<string>((resolve) => {
      const response = {
        statusCode: 0,
        setHeader: () => response,
        end: (text: string) => {
          resolve(text);
        },
      };
      exporter.getMetricsRequestHandler({} as IncomingMessage, response as unknown as ServerResponse);
    });
    await provider.shutdown();

    const series = body.split('\n').find((line) => line.startsWith('kernel_executions_total{'));
    expect(series).toContain('service_name="tau-api"');
    expect(series).not.toContain('deployment_environment');
    // The registry name helper and every histogram panel assume the exporter adds no unit suffix.
    expect(body).toContain('tau_storage_operation_duration_bucket{');
    expect(body).not.toContain('tau_storage_operation_duration_seconds');
  });
});
