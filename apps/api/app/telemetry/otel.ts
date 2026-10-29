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
import { metrics } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SentryContextManager } from '@sentry/node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { LangChainInstrumentation } from '@traceloop/instrumentation-langchain';
import { redactUrlQuery } from '#logger/logger-factory.js';
import { cardinalityViews } from '#telemetry/cardinality-views.js';

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
/* One SDK for every Tau process: `OTEL_SERVICE_NAME` names it (tau-storage sets
   it in its image, DC1), and an unset one is the API. */
const serviceName = process.env['OTEL_SERVICE_NAME'] ?? 'tau-api';

const resource = resourceFromAttributes({
  // One image, several Fly apps: `tau-mirror` and `tau-storage` set OTEL_SERVICE_NAME so their series are told apart (W14).
  'service.name': serviceName,
  'service.version': process.env['FLY_IMAGE_REF'] ?? 'dev',
  'deployment.environment': process.env['NODE_ENV'] ?? 'development',
  'cloud.provider': process.env['FLY_REGION'] ? 'fly.io' : 'local',
  'cloud.region': process.env['FLY_REGION'] ?? 'local',
  'host.id': process.env['FLY_MACHINE_ID'] ?? 'local',
  'host.name': process.env['FLY_ALLOC_ID'] ?? 'local',
  // Fly's scrape labels a series by app and Machine, not by process group; locally the collector adds
  // `tau_process` itself, so the attribute is set only where Fly names the group.
  ...(process.env['FLY_PROCESS_GROUP'] ? { 'tau.process': process.env['FLY_PROCESS_GROUP'] } : {}),
});
/* eslint-enable @typescript-eslint/naming-convention -- end OTEL attribute names block */

const otlpEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

const hasOtlpEndpoint = Boolean(otlpEndpoint);

// An omitted exporter is not "off": NodeSDK falls back to OTLP on localhost:4318, so a process without an
// endpoint failed its shutdown flush (and the billing worker exited 1). Explicit settings still win.
if (!hasOtlpEndpoint) {
  process.env['OTEL_TRACES_EXPORTER'] ??= 'none';
  process.env['OTEL_LOGS_EXPORTER'] ??= 'none';
}

const sdk = new NodeSDK({
  resource,

  // Sentry runs with `skipOpenTelemetrySetup` (sentry.ts), so this provider's context is the only async context.
  // Sentry's manager is the default AsyncLocalStorage manager plus a fork of Sentry's scopes on every context
  // fork; without it `Sentry.withScope` and isolation scopes share one process-wide scope and an event inherits
  // another's tags. It needs no DSN and no `Sentry.init` first, so this module still loads without Sentry. The
  // Sentry sampler, span processor and propagator stay out: sampling and trace export belong to Grafana.
  contextManager: new SentryContextManager(),

  traceExporter: hasOtlpEndpoint ? new OTLPTraceExporter() : undefined,

  // Every series carries `service_name` and, on Fly, `tau_process`: Fly's managed Prometheus adds neither,
  // and dashboards and alerts select and group by both (OBS-13).
  metricReader: new PrometheusExporter({
    port: metricsPort,
    withResourceConstantLabels: /^(?:service\.name|tau\.process)$/u,
  }),

  // Named views raise the series cap of the few instruments whose live set exceeds the SDK default of 2,000;
  // every other instrument keeps that default and no instrument gets a second stream.
  views: [...cardinalityViews],

  logRecordProcessors: hasOtlpEndpoint ? [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })] : undefined,

  instrumentations: [
    // Spans keep model, timing and usage; prompts and completions never ride them into Grafana (blueprint T07).
    new LangChainInstrumentation({ traceContent: false }),
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
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

// Fly reports CPU and memory per Machine; these are the same signals per process, so the API and each
// billing worker can be told apart and they also exist off Fly. OTel process semantic conventions.
const processMeter = metrics.getMeter('tau-process');
processMeter
  .createObservableCounter('process.cpu.time', { description: 'CPU seconds used by this process', unit: 's' })
  .addCallback((result) => {
    const usage = process.cpuUsage();
    result.observe(usage.user / 1e6, { 'cpu.mode': 'user' });
    result.observe(usage.system / 1e6, { 'cpu.mode': 'system' });
  });
processMeter
  .createObservableGauge('process.memory.usage', { description: 'Resident set size of this process', unit: 'By' })
  .addCallback((result) => {
    result.observe(process.memoryUsage.rss());
  });
processMeter
  .createObservableGauge('process.uptime', { description: 'Seconds since this process started', unit: 's' })
  .addCallback((result) => {
    result.observe(process.uptime());
  });

if (process.env['PYROSCOPE_SERVER_ADDRESS']) {
  try {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Module default export name
    const { default: Pyroscope } = await import('@pyroscope/nodejs');
    Pyroscope.init({
      serverAddress: process.env['PYROSCOPE_SERVER_ADDRESS'],
      appName: serviceName,
      tags: {
        region: process.env['FLY_REGION'] ?? 'local',
        version: process.env['FLY_IMAGE_REF'] ?? 'dev',
      },
    });
    Pyroscope.start();
  } catch (error) {
    // Profiling is optional, but an address that was set and does nothing is a misconfiguration worth seeing.
    console.warn('Pyroscope profiling disabled:', error);
  }
}

export { sdk };
