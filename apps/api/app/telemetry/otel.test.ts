/* eslint-disable @typescript-eslint/naming-convention -- instrumentation names and OTEL attribute names are wire names. */
import type { IncomingMessage } from 'node:http';
import type { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import type { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

const { instrumentationConfigs, exporterConfigs, sdkConfigs } = vi.hoisted(() => ({
  instrumentationConfigs: [] as Array<Record<string, unknown>>,
  exporterConfigs: [] as Array<{ withResourceConstantLabels?: RegExp }>,
  sdkConfigs: [] as Array<ConstructorParameters<typeof NodeSDK>[0]>,
}));

// Importing otel.ts starts the SDK; stub every exporter and the SDK so only the instrumentation config is observed.
vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class {
    public constructor(config: ConstructorParameters<typeof NodeSDK>[0]) {
      sdkConfigs.push(config);
    }

    public start(): void {
      // No SDK in unit tests.
    }
  },
}));
vi.mock('@opentelemetry/exporter-prometheus', () => ({
  PrometheusExporter: vi.fn(function capture(config: { withResourceConstantLabels?: RegExp }) {
    exporterConfigs.push(config);
  }),
}));
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter: vi.fn() }));
vi.mock('@opentelemetry/exporter-logs-otlp-http', () => ({ OTLPLogExporter: vi.fn() }));
vi.mock('@opentelemetry/sdk-logs', () => ({ BatchLogRecordProcessor: vi.fn() }));
vi.mock('@traceloop/instrumentation-langchain', () => ({ LangChainInstrumentation: vi.fn() }));
vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: (config: Record<string, unknown>) => {
    instrumentationConfigs.push(config);
    return [];
  },
}));

type HttpInstrumentationConfig = NonNullable<
  NonNullable<Parameters<typeof getNodeAutoInstrumentations>[0]>['@opentelemetry/instrumentation-http']
>;

const incomingSpanHook = async (): Promise<NonNullable<HttpInstrumentationConfig['startIncomingSpanHook']>> => {
  await import('#telemetry/otel.js');
  const config = instrumentationConfigs[0]?.['@opentelemetry/instrumentation-http'] as
    | HttpInstrumentationConfig
    | undefined;
  const hook = config?.startIncomingSpanHook;
  if (hook === undefined) {
    throw new Error('Missing startIncomingSpanHook');
  }
  return hook;
};
const request = (url: string): IncomingMessage => mock<IncomingMessage>({ url, headers: {} });

describe('OTEL incoming request span redaction', () => {
  it.each(['/v1/github/callback?code=oauth-code&state=oauth-state', '/v1/auth/callback/github?code=oauth-code'])(
    'should drop every query-bearing URL attribute from the span of %s',
    async (url) => {
      const hook = await incomingSpanHook();

      expect(hook(request(url))).toStrictEqual({
        'url.query': undefined,
        'http.target': undefined,
        'http.url': undefined,
      });
    },
  );

  it.each(['/v1/github/repositories?connectionId=c&page=2', '/v1/github/callback'])(
    'should leave the recorded attributes of %s untouched',
    async (url) => {
      const hook = await incomingSpanHook();

      expect(hook(request(url))).toStrictEqual({});
    },
  );
});

describe('OTEL Prometheus exporter', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should label every series with service_name but leave other resource attributes off (OBS-13)', async () => {
    await import('#telemetry/otel.js');
    const labels = exporterConfigs[0]?.withResourceConstantLabels;

    expect(labels?.test('service.name')).toBe(true);
    expect(labels?.test('tau.process')).toBe(true);
    expect(labels?.test('deployment.environment')).toBe(false);
  });

  it.each([
    ['billing-operations', 'billing-operations'],
    [undefined, undefined],
  ])('should name the Fly process group %s as tau.process', async (group, expected) => {
    vi.resetModules();
    vi.stubEnv('FLY_PROCESS_GROUP', group);
    await import('#telemetry/otel.js');

    expect(sdkConfigs.at(-1)?.resource?.attributes['tau.process']).toBe(expected);
  });
});

describe('OTEL log export configuration', () => {
  it('should connect the configured OTLP exporter to the SDK log processor', async () => {
    vi.resetModules();
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://otel.invalid:4318');
    try {
      await import('#telemetry/otel.js');

      const processors = sdkConfigs.at(-1)?.logRecordProcessors;
      expect(processors).toHaveLength(1);
      expect(processors?.[0]).toBeInstanceOf(BatchLogRecordProcessor);
      const options = vi.mocked(BatchLogRecordProcessor).mock.calls.at(-1)?.[0];
      expect(options?.exporter).toBeInstanceOf(OTLPLogExporter);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('should leave log export disabled when no OTLP endpoint is configured', async () => {
    vi.resetModules();
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    try {
      await import('#telemetry/otel.js');

      expect(sdkConfigs.at(-1)?.logRecordProcessors).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
