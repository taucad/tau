import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { metrics } from '@opentelemetry/api';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics as sdkMetrics } from '@opentelemetry/sdk-node';
import { mock } from 'vitest-mock-extended';
import { MetricsService } from '#telemetry/metrics.js';
import type { DatabaseType } from '#database/database.service.js';
import { accountingTasks, r2SourceOf } from '#api/storage-accounting/accounting-tasks.js';
import { r2AnalyticsFixture } from '#api/storage-accounting/r2-analytics.fixture.js';
import {
  StorageAccountingScheduler,
  memorySnapshotStore,
} from '#api/storage-accounting/storage-accounting.scheduler.js';

/**
 * W14 OB3 acceptance, end to end: Cloudflare's answer, through the scheduler and the API's own instruments,
 * scrapes as the `tau_r2_*` series and labels the storage dashboards and rules query (PR #1175), and
 * without a token the R2 task is inert while the other tasks report.
 */

const scrape = async (exporter: PrometheusExporter): Promise<string> =>
  new Promise<string>((resolve) => {
    const response = {
      statusCode: 0,
      setHeader: () => response,
      end: (text: string) => {
        resolve(text);
      },
    };
    exporter.getMetricsRequestHandler({} as IncomingMessage, response as unknown as ServerResponse);
  });

const buckets = {
  publicBucket: 'tau-content-staging',
  privateBucket: 'tau-content-private-staging',
};

/** Tasks whose database work is never reached: only the R2 task runs in these tests. */
const r2Only = (settings: { accountId: string | undefined; token: string | undefined }, fetcher?: typeof fetch) => {
  const source = r2SourceOf({ ...settings, ...buckets });
  return accountingTasks({
    database: mock<DatabaseType>(),
    plans: { tauCloudEnabled: false, environment: undefined, freeTierSync: false },
    r2: source === undefined ? undefined : { ...source, fetch: fetcher },
  }).filter((task) => task.name === 'r2_analytics');
};

describe('storage accounting scrape (W14 OB3)', () => {
  afterEach(() => {
    metrics.disable();
  });

  it('should scrape a GraphQL fixture as tau_r2_* with a non-allow-listed bucket as `other`', async () => {
    const exporter = new PrometheusExporter({ preventServerStart: true });
    const provider = new sdkMetrics.MeterProvider({ readers: [exporter] });
    metrics.setGlobalMeterProvider(provider);
    const scheduler = new StorageAccountingScheduler({
      tasks: r2Only({ accountId: 'account', token: 'cf-analytics-secret' }, async () =>
        Response.json(r2AnalyticsFixture),
      ),
      store: memorySnapshotStore(),
      metrics: new MetricsService(),
    });

    await scheduler.tick();
    const body = await scrape(exporter);
    await provider.shutdown();

    expect(body).toMatch(
      /tau_r2_requests\{[^}]*tau_r2_bucket="other"[^}]*tau_r2_class="A"[^}]*tau_r2_action="PutObject"[^}]*tau_r2_status="success"[^}]*tau_r2_window="hour"[^}]*\} 12/u,
    );
    expect(body).toMatch(/tau_r2_stored_bytes\{[^}]*tau_r2_bucket="public"[^}]*\} \d+/u);
    expect(body).toMatch(/tau_r2_objects\{[^}]*tau_r2_bucket="other"[^}]*\} \d+/u);
    expect(body).toMatch(
      /tau_r2_bandwidth_bytes\{[^}]*tau_r2_bucket="other"[^}]*direction="download"[^}]*tau_r2_window="month"[^}]*\} 2/u,
    );
    expect(body).toMatch(
      /tau_storage_accounting_passes_total\{[^}]*tau_storage_accounting_task="r2_analytics"[^}]*outcome="ok"[^}]*\} 1/u,
    );
    expect(body).toMatch(/tau_storage_accounting_last_success\{[^}]*tau_storage_accounting_task="r2_analytics"/u);
    for (const name of ['tau-content-prod', 'tau-scratch', 'tau-content-staging', 'cf-analytics-secret']) {
      expect(body).not.toContain(name);
    }
  });

  it('should keep the R2 task inert without a token: a skipped pass, no tau_r2_* and no last_success', async () => {
    const exporter = new PrometheusExporter({ preventServerStart: true });
    const provider = new sdkMetrics.MeterProvider({ readers: [exporter] });
    metrics.setGlobalMeterProvider(provider);
    let called = false;
    const scheduler = new StorageAccountingScheduler({
      tasks: r2Only({ accountId: 'account', token: undefined }, async () => {
        called = true;
        return Response.json(r2AnalyticsFixture);
      }),
      store: memorySnapshotStore(),
      metrics: new MetricsService(),
    });

    await expect(scheduler.tick()).resolves.toBeUndefined();
    const body = await scrape(exporter);
    await provider.shutdown();

    expect(called).toBe(false);
    expect(body).toMatch(
      /tau_storage_accounting_passes_total\{[^}]*tau_storage_accounting_task="r2_analytics"[^}]*outcome="skipped"[^}]*\} 1/u,
    );
    expect(body).not.toMatch(/^tau_r2_\w+\{/mu);
    expect(body).not.toMatch(/tau_storage_accounting_last_success\{[^}]*r2_analytics/u);
    expect(body).not.toMatch(/outcome="error"/u);
  });
});
