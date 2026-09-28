/**
 * OpenTelemetry SDK initialization.
 *
 * This module MUST be imported before any other application code to ensure
 * auto-instrumentations can patch modules as they load.
 *
 * Production: Loaded via `NODE_OPTIONS="--import ./dist/telemetry/otel.js"` in the
 * Dockerfile, ensuring all modules are patched before import.
 *
 * Development: Imported as a side-effect at the top of main.ts.
 *
 * Metrics: Exposed via PrometheusExporter on a separate port (default 9464),
 * scraped by Fly.io's managed VictoriaMetrics.
 *
 * Traces + Logs: Exported via OTLP/HTTP to Grafana Cloud (prod) or
 * grafana/otel-lgtm (local dev).
 */
/* oxlint-disable typescript-eslint/dot-notation, typescript-eslint/no-unnecessary-condition -- process.env index access required by TS4111 (verbatimModuleSyntax) */
import process from 'node:process';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { LangChainInstrumentation } from '@traceloop/instrumentation-langchain';
import { redactUrlQuery } from '#logger/logger-factory.js';

const configuredMetricsPort = process.env['OTEL_METRICS_PORT'];
const metricsPort = configuredMetricsPort === undefined ? 9464 : Number(configuredMetricsPort);
if (!Number.isInteger(metricsPort) || metricsPort < 0 || metricsPort > 65_535) {
  throw new Error('OTEL_METRICS_PORT must be an integer from 0 to 65535');
}

// OTEL env vars must be set before SDK initialization (NestJS ConfigModule
// loads after the SDK starts, so these cannot live in environment.config.ts).
process.env['OTEL_METRICS_EXEMPLAR_FILTER'] ??= 'trace_based';
process.env['OTEL_SEMCONV_STABILITY_OPT_IN'] ??= 'http';

/* eslint-disable @typescript-eslint/naming-convention -- OTEL semantic convention attribute names use dot-notation */
const resource = resourceFromAttributes({
  'service.name': 'tau-api',
  'service.version': process.env['FLY_IMAGE_REF'] ?? 'dev',
  'deployment.environment': process.env['NODE_ENV'] ?? 'development',
  'cloud.provider': process.env['FLY_REGION'] ? 'fly.io' : 'local',
  'cloud.region': process.env['FLY_REGION'] ?? 'local',
  'host.id': process.env['FLY_MACHINE_ID'] ?? 'local',
  'host.name': process.env['FLY_ALLOC_ID'] ?? 'local',
});
/* eslint-enable @typescript-eslint/naming-convention -- end OTEL attribute names block */

const otlpEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

const hasOtlpEndpoint = Boolean(otlpEndpoint);

const sdk = new NodeSDK({
  resource,

  traceExporter: hasOtlpEndpoint ? new OTLPTraceExporter() : undefined,

  metricReader: new PrometheusExporter({ port: metricsPort }),

  logRecordProcessor: hasOtlpEndpoint ? new BatchLogRecordProcessor(new OTLPLogExporter()) : undefined,

  instrumentations: [
    new LangChainInstrumentation(),
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-fastify': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request) => {
          const host = request.headers.host ?? '';
          return host.includes(String(metricsPort));
        },
        // Merged over the recorded span attributes, where an undefined value drops the attribute: an OAuth
        // callback's span keeps its path (`url.path`) but never its code and state.
        startIncomingSpanHook: (request) =>
          redactUrlQuery(request.url ?? '') === (request.url ?? '')
            ? {}
            : { 'url.query': undefined, 'http.target': undefined, 'http.url': undefined },
      },
      '@opentelemetry/instrumentation-pg': {
        addSqlCommenterCommentToQueries: false,
      },
    }),
  ],
});

sdk.start();

if (process.env['PYROSCOPE_SERVER_ADDRESS']) {
  try {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Module default export name
    const { default: Pyroscope } = await import('@pyroscope/nodejs');
    Pyroscope.init({
      serverAddress: process.env['PYROSCOPE_SERVER_ADDRESS'],
      appName: 'tau-api',
      tags: {
        region: process.env['FLY_REGION'] ?? 'local',
        version: process.env['FLY_IMAGE_REF'] ?? 'dev',
      },
    });
    Pyroscope.start();
  } catch {
    // Pyroscope is optional; silently skip if unavailable
  }
}

export { sdk };
