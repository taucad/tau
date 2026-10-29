import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import type { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep, mockReset } from 'vitest-mock-extended';
import { admitEvidence } from '#api/agent-observability/evidence-admission.js';
import { deliveryTiming, EvidenceDeliveryService } from '#api/agent-observability/evidence-delivery.service.js';
import { leasePending, settleDelivery, sweepBacklog } from '#api/agent-observability/evidence-delivery.js';
import { sealEvidence } from '#api/agent-observability/evidence-seal.js';
import { evidenceFixture, privateMarker } from '#api/agent-observability/evidence.test-fixture.js';
import { canonicalEvidence } from '@taucad/agent-observability/identity';
import type { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';
import type { TelemetryPurpose, TelemetryPurposeState } from '#api/telemetry-purposes/telemetry-purpose.schema.js';
import type { DatabaseService, DatabaseType } from '#database/database.service.js';
import * as schema from '#database/schema.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { createScratchDatabase } from '#testing/scratch-database.js';
import type { ScratchDatabase } from '#testing/scratch-database.js';
import { databaseReachable } from '#testing/database-reachable.js';

const key = Uint8Array.from(randomBytes(32));
const environment = 'test';

/** Real migrations, leases and fencing in a disposable database; Langfuse is a stub. */
describe.skipIf(!(await databaseReachable(process.env.DATABASE_URL)))('evidence delivery', () => {
  let scratch: ScratchDatabase | undefined;
  let client: postgres.Sql | undefined;
  let database: DatabaseType;

  beforeAll(async () => {
    scratch = await createScratchDatabase('agent_evidence_delivery');
    client = postgres(scratch.url, { max: 6 });
    database = drizzle(client, { schema });
  });
  afterAll(async () => {
    await client?.end();
    await scratch?.drop();
  });
  const metrics = mockDeep<MetricsService>();
  afterEach(() => {
    mockReset(metrics);
    vi.unstubAllGlobals();
  });

  /** One admitted receipt in a fresh account, sealed as ingress seals it. */
  const admitted = async (plane: 'summary' | 'content' = 'content') => {
    const suffix = randomUUID();
    const userId = `user_${suffix}`;
    const projectId = `project_${suffix}`;
    await database.insert(schema.user).values({ id: userId, name: 'Delivery', email: `${suffix}@test.invalid` });
    await database.insert(schema.project).values({ id: projectId, ownerId: userId, name: 'Delivery fixture' });
    const evidence = await evidenceFixture({ principal: userId, project: projectId, plane });
    const bytes = new TextEncoder().encode(canonicalEvidence(evidence));
    const outcome = await admitEvidence({
      database,
      evidence,
      allowed: { replay: true, admit: true },
      protection: 'free',
      seal: (receipt) => ({
        payload: sealEvidence(
          Uint8Array.from(bytes),
          { environment, principal: userId, project: projectId, receipt, plane },
          { version: 1, key },
        ),
        keyVersion: 1,
      }),
      budgets: { total: 1_000_000_000, principal: 1_000_000_000 },
      now: new Date(),
    });
    if (outcome.kind !== 'receipt') {
      throw new Error(outcome.kind);
    }
    return { userId, projectId, receiptId: outcome.receipt.receipt };
  };

  const row = async (receiptId: string) => {
    const [found] = await database
      .select()
      .from(schema.agentEvidenceOutbox)
      .where(eq(schema.agentEvidenceOutbox.receiptId, receiptId));
    return found!;
  };

  const service = (allowed: readonly TelemetryPurpose[] = ['summary', 'content'], keyVersion = 1) => {
    const config = mock<ConfigService>();
    /* eslint-disable @typescript-eslint/naming-convention -- environment variables are UPPER_CASED */
    const values: Record<string, unknown> = {
      TAU_OBSERVABILITY_PAYLOAD_KEY: Buffer.from(key).toString('base64url'),
      TAU_OBSERVABILITY_PAYLOAD_KEY_VERSION: keyVersion,
      TAU_OBSERVABILITY_DELIVERY_ENABLED: true,
      LANGFUSE_BASE_URL: 'https://langfuse.test.invalid',
      LANGFUSE_PUBLIC_KEY: 'pk-test',
      LANGFUSE_SECRET_KEY: 'sk-test',
      BILLING_ENVIRONMENT: environment,
      NODE_ENV: 'test',
    };
    /* eslint-enable @typescript-eslint/naming-convention -- end of the environment table */
    config.get.mockImplementation((name: string) => values[name]);
    const purposes = mock<TelemetryPurposeService>();
    purposes.getAdmissionAuthority.mockResolvedValue({
      effective: {
        epoch: 'epoch-a',
        purposes: (['summary', 'feedback', 'content', 'diagnosis', 'reuse', 'training'] as const).map(
          (purpose): TelemetryPurposeState => ({
            purpose,
            allowed: allowed.includes(purpose),
            decided: true,
            granted: allowed.includes(purpose),
          }),
        ),
      },
      protection: 'free',
    });
    return new EvidenceDeliveryService(
      { database } as unknown as DatabaseService,
      config as unknown as ConstructorParameters<typeof EvidenceDeliveryService>[1],
      purposes,
      new ShutdownService(),
      metrics,
    );
  };

  const vendor = (handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
      handler(new URL(input instanceof Request ? input.url : String(input)), init),
    );
    vi.stubGlobal('fetch', fetcher);
    return fetcher;
  };
  const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status });

  it('should send once, drop the bytes, and confirm by reading the observation back', async () => {
    const { receiptId } = await admitted();
    const sent: string[] = [];
    vendor(async (url, init) => {
      if (url.pathname.endsWith('/otel/v1/traces')) {
        sent.push(typeof init?.body === 'string' ? init.body : '');
        return json(200, { name: 'otel-ingestion-job' });
      }
      const traceId = url.searchParams.get('traceId');
      const body = JSON.parse(sent[0]!) as {
        resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<{ spanId: string; traceId: string }> }> }>;
      };
      const span = body.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
      return json(200, { data: traceId === span.traceId ? [{ id: span.spanId }] : [], meta: {} });
    });
    const delivery = service();
    const now = new Date();

    await delivery.drain(now);
    const afterSend = await row(receiptId);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain(privateMarker);
    expect(afterSend).toMatchObject({ state: 'confirmed', payload: null, attempts: 1 });

    await delivery.drain(new Date(now.getTime() + 10_000));
    expect(sent).toHaveLength(1);
    expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'acknowledged' });
    expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'confirmed' });
    expect(metrics.agentEvidencePasses.add).toHaveBeenCalledWith(1, { 'tau.worker': 'delivery', outcome: 'ok' });
  });

  it('should never resend an uncertain send, and record a gap once it stays invisible', async () => {
    const { receiptId } = await admitted();
    let posts = 0;
    vendor((url) => {
      if (url.pathname.endsWith('/otel/v1/traces')) {
        posts++;
        return json(503, {});
      }
      return json(200, { data: [], meta: {} });
    });
    const delivery = service();
    const now = new Date();

    await delivery.drain(now);
    expect(await row(receiptId)).toMatchObject({ state: 'uncertain', payload: null, reason: 'http-503' });
    await delivery.drain(new Date(now.getTime() + deliveryTiming.recheckMilliseconds + 1));
    const rechecked = await row(receiptId);
    expect(rechecked.state).toBe('uncertain');
    await delivery.drain(new Date(now.getTime() + deliveryTiming.gapAfterMilliseconds + 1));
    expect(await row(receiptId)).toMatchObject({ state: 'expired', reason: 'gap' });
    expect(posts).toBe(1);
    for (const outcome of ['uncertain', 'recheck', 'gap'] as const) {
      expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome });
    }
  });

  it('should retry only a send that never connected, after a backoff', async () => {
    const { receiptId } = await admitted();
    vendor(() => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) });
    });
    const now = new Date();
    await service().drain(now);
    const retried = await row(receiptId);

    expect(retried).toMatchObject({ state: 'pending', reason: 'econnrefused', traceId: null });
    expect(retried.payload).not.toBeNull();
    expect(retried.leaseExpiresAt!.getTime()).toBeGreaterThan(now.getTime());
    /* The vendor's reason stays on the row; the series carries only the bounded outcome. */
    expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'retry' });
  });

  it('should hold a payload sealed under a key this deployment lacks, and count it apart from a retry', async () => {
    const { receiptId } = await admitted();
    const fetcher = vendor(() => json(200, {}));

    await service(['summary', 'content'], 2).drain(new Date());

    expect(fetcher).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'POST' }));
    const held = await row(receiptId);
    expect(held).toMatchObject({ state: 'pending', reason: 'key-unavailable' });
    expect(held.payload).not.toBeNull();
    expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'key_unavailable' });
  });

  it('should purge without sending when the purpose was withdrawn or the project deleted', async () => {
    const withdrawn = await admitted('content');
    const deleted = await admitted('summary');
    await database
      .insert(schema.projectDeletion)
      .values({ projectId: deleted.projectId, ownerId: deleted.userId, requestedBy: deleted.userId });
    const fetcher = vendor(() => json(200, {}));

    await service(['summary']).drain(new Date());

    expect(fetcher).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'POST' }));
    expect(await row(withdrawn.receiptId)).toMatchObject({ state: 'expired', payload: null, reason: 'revoked' });
    expect(await row(deleted.receiptId)).toMatchObject({ state: 'expired', payload: null, reason: 'deleted' });
    expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'revoked' });
  });

  it('should fence a settlement to the lease holder and reconcile a send whose worker died', async () => {
    const { receiptId } = await admitted();
    const now = new Date();
    const leased = await leasePending(database, { owner: 'worker-a', leaseMilliseconds: 1000, limit: 1000, now });
    expect(leased.some((item) => item.receiptId === receiptId)).toBe(true);
    await database
      .update(schema.agentEvidenceOutbox)
      .set({ traceId: 'a'.repeat(32), observedAt: now })
      .where(eq(schema.agentEvidenceOutbox.receiptId, receiptId));

    await sweepBacklog(database, new Date(now.getTime() + 2000));
    expect(await row(receiptId)).toMatchObject({ state: 'uncertain', reason: 'abandoned', payload: null });
    await expect(settleDelivery(database, { receiptId, owner: 'worker-a' }, { kind: 'confirmed' })).resolves.toBe(
      false,
    );
  });

  it('should purge every held row at its retention', async () => {
    const { receiptId } = await admitted();
    const { expiresAt } = await row(receiptId);

    await sweepBacklog(database, new Date(expiresAt.getTime() + 1));

    expect(await row(receiptId)).toMatchObject({ state: 'expired', payload: null, reason: 'retention' });
  });
});
