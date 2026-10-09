import { describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import {
  deliverRecoveryNotices,
  recordOpenCases,
  recoveryNoticeEmailOrigin,
  runHourlyOperationsJobs,
} from '#billing-command.operations.js';
import type {
  HourlyOperationsJobs,
  OperationsGaugeMetrics,
  OperationsGaugeSource,
} from '#billing-command.operations.js';

const gaugeSource = (
  unpriced: Awaited<ReturnType<OperationsGaugeSource['unpricedOperations']>>,
): OperationsGaugeSource => ({
  openCases: async () => [{ kind: 'dispute_unresolved', open: 2 }],
  unpricedOperations: async () => unpriced,
});

const hourlyJobs = (overrides: Partial<HourlyOperationsJobs> = {}) => {
  const events: string[] = [];
  const failures: unknown[] = [];
  const jobs: HourlyOperationsJobs = {
    async runJob(event, run) {
      events.push(event);
      await run().catch((error: unknown) => {
        failures.push(error);
      });
    },
    cashScans: {
      createScan: vi.fn(async () => 'scan-1'),
      isComplete: vi.fn(async () => true),
      runScan: vi.fn<HourlyOperationsJobs['cashScans']['runScan']>(async () => ({ status: 'complete' })),
    },
    purchaseScans: {
      runScan: vi.fn<HourlyOperationsJobs['purchaseScans']['runScan']>(async () => ({
        status: 'complete',
        obligations: 0,
        grants: 0,
        subscriptions: 0,
      })),
    },
    recordOpenCases: vi.fn(async () => undefined),
    environment: 'staging',
    now: Date.parse('2026-10-08T12:30:00Z'),
    ...overrides,
  };
  return { jobs, events, failures };
};

describe('billing operations worker', () => {
  describe('recordOpenCases', () => {
    it('should record unpriced operations per provider, SKU and reason, including absorbed ones', async () => {
      const metrics = mockDeep<OperationsGaugeMetrics>();

      await recordOpenCases({
        source: gaugeSource([
          { provider: 'anthropic', sku: 'model:sonnet', reason: 'absorbed', operations: 3 },
          { provider: 'openai', sku: 'model:luna', reason: 'dimension_mismatch', operations: 1 },
        ]),
        metrics,
        environment: 'staging',
      });

      expect(metrics.billingSupplierUnpricedOperations.record.mock.calls).toEqual([
        [
          3,
          {
            'deployment.environment': 'staging',
            'gen_ai.provider.name': 'anthropic',
            'tau.billing.sku': 'model:sonnet',
            'tau.billing.unpriced.reason': 'absorbed',
          },
        ],
        [
          1,
          {
            'deployment.environment': 'staging',
            'gen_ai.provider.name': 'openai',
            'tau.billing.sku': 'model:luna',
            'tau.billing.unpriced.reason': 'dimension_mismatch',
          },
        ],
      ]);
    });

    it('should name an operation admitted without a provider as unattributed', async () => {
      const metrics = mockDeep<OperationsGaugeMetrics>();

      await recordOpenCases({
        source: gaugeSource([{ provider: null, sku: 'model:sonnet', reason: 'missing_rate', operations: 4 }]),
        metrics,
        environment: 'prod-eu',
      });

      expect(metrics.billingSupplierUnpricedOperations.record).toHaveBeenCalledExactlyOnceWith(4, {
        'deployment.environment': 'prod-eu',
        'gen_ai.provider.name': 'unattributed',
        'tau.billing.sku': 'model:sonnet',
        'tau.billing.unpriced.reason': 'missing_rate',
      });
    });

    it('should keep recording every open case kind beside the supplier gauge', async () => {
      const metrics = mockDeep<OperationsGaugeMetrics>();

      await recordOpenCases({ source: gaugeSource([]), metrics, environment: 'staging' });

      expect(metrics.billingOpenFinancialCases.record).toHaveBeenCalledWith(2, { kind: 'dispute_unresolved' });
      expect(metrics.billingOpenFinancialCases.record).toHaveBeenCalledWith(0, { kind: 'missing_local_payment' });
      expect(metrics.billingSupplierUnpricedOperations.record).not.toHaveBeenCalled();
    });
  });

  describe('runHourlyOperationsJobs', () => {
    it('should run source reconciliation as the only hourly job, with no supplier sweep or repair', async () => {
      const { jobs, events, failures } = hourlyJobs();

      await runHourlyOperationsJobs(jobs);

      expect(events).toEqual(['billing.source_reconciliation']);
      expect(events).not.toContain('billing.supplier_sweep');
      expect(events).not.toContain('billing.rejected_supplier_repair');
      expect(failures).toEqual([]);
      expect(jobs.cashScans.createScan).toHaveBeenCalledExactlyOnceWith({
        environment: 'staging',
        currency: 'usd',
        windowStart: new Date('2026-10-07T00:00:00Z'),
        windowEnd: new Date('2026-10-08T00:00:00Z'),
        lookbackStart: new Date('2026-10-06T00:00:00Z'),
      });
      expect(jobs.recordOpenCases).toHaveBeenCalledOnce();
    });

    it('should still record the gauges and report the scan error when the purchase scan fails', async () => {
      const recordGauges = vi.fn(async () => undefined);
      const { jobs, failures } = hourlyJobs({
        purchaseScans: { runScan: vi.fn().mockRejectedValue(new Error('Controlled Stripe outage')) },
        recordOpenCases: recordGauges,
      });

      await runHourlyOperationsJobs(jobs);

      expect(recordGauges).toHaveBeenCalledOnce();
      expect(failures).toEqual([new Error('Controlled Stripe outage')]);
    });
  });

  describe('deliverRecoveryNotices', () => {
    const report = (abandoned: string[]) => ({ processed: ['n-1'], pending: [], failed: ['n-2'], abandoned });

    it('should raise a billing.alert naming each notice that used its last attempt', async () => {
      const alerts = vi.spyOn(console, 'error').mockImplementation(() => {
        // Test-local stderr sink.
      });
      const payments = { deliverRecoveryNotices: vi.fn(async () => report(['n-3'])) };

      try {
        await expect(deliverRecoveryNotices({ payments, environment: 'staging', limit: 100 })).resolves.toStrictEqual(
          report(['n-3']),
        );

        expect(payments.deliverRecoveryNotices).toHaveBeenCalledExactlyOnceWith({ environment: 'staging', limit: 100 });
        expect(alerts.mock.calls.map(([line]) => JSON.parse(String(line)) as unknown)).toStrictEqual([
          { event: 'billing.alert', environment: 'staging', kind: 'recovery_notice_abandoned', notices: ['n-3'] },
        ]);
      } finally {
        alerts.mockRestore();
      }
    });

    it('should stay quiet while every notice still has attempts left', async () => {
      const alerts = vi.spyOn(console, 'error').mockImplementation(() => {
        // Test-local stderr sink.
      });

      try {
        await deliverRecoveryNotices({
          payments: { deliverRecoveryNotices: vi.fn(async () => report([])) },
          environment: 'staging',
          limit: 100,
        });

        expect(alerts).not.toHaveBeenCalled();
      } finally {
        alerts.mockRestore();
      }
    });
  });
});

/* eslint-disable @typescript-eslint/naming-convention -- fixtures mirror process.env UPPER_SNAKE keys */
describe('recovery notice email origin', () => {
  it('should hand the worker the frontend origin only with both the origin and a Resend key', () => {
    expect(recoveryNoticeEmailOrigin({ TAU_FRONTEND_URL: 'https://tau.new', RESEND_API_KEY: 're_live_1' })).toBe(
      'https://tau.new',
    );
  });

  it('should build no transport without a Resend key, so pending notices are never marked delivered', () => {
    expect(recoveryNoticeEmailOrigin({ TAU_FRONTEND_URL: 'https://tau.new' })).toBeUndefined();
    expect(recoveryNoticeEmailOrigin({ TAU_FRONTEND_URL: 'https://tau.new', RESEND_API_KEY: '   ' })).toBeUndefined();
  });

  it('should build no transport without the frontend origin the notices link to', () => {
    expect(recoveryNoticeEmailOrigin({ RESEND_API_KEY: 're_live_1' })).toBeUndefined();
    expect(recoveryNoticeEmailOrigin({ TAU_FRONTEND_URL: '', RESEND_API_KEY: 're_live_1' })).toBeUndefined();
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- end process.env fixture scope */
