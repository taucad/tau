import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import type { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep, mockReset } from 'vitest-mock-extended';
import { admitEvidence } from '#evidence-admission.js';
import { deliveryTiming, EvidenceDeliveryService } from '#evidence-delivery.service.js';
import { leasePending, settleDelivery, sweepBacklog } from '#evidence-delivery.js';
import { sealEvidence } from '#evidence-seal.js';
import { receiptSpanId } from '#langfuse-observation.js';
import { evidenceFixture, privateMarker, providerFact, toolFact } from '#testing/evidence.fixture.js';
import { canonicalEvidence } from '@taucad/agent-observability/identity';
import type { Evidence } from '@taucad/agent-observability/contract';
import type { TelemetryPurposeService } from '#telemetry-purposes/telemetry-purpose.service.js';
import type { TelemetryPurposeState } from '#telemetry-purposes/telemetry-purpose.schema.js';
import type { TelemetryPurpose } from '@taucad/api-database/schema/telemetry-purpose.types';
import type { DatabaseService, DatabaseType } from '@taucad/api-database';
import * as schema from '@taucad/api-database/schema';
import { ShutdownService } from '@taucad/api-lifecycle/shutdown';
import type { MetricsService } from '@taucad/api-observability/metrics';
import { createScratchDatabase } from '@taucad/api-database/testing/scratch-database';
import type { ScratchDatabase } from '@taucad/api-database/testing/scratch-database';
import { databaseReachable } from '@taucad/api-database/testing/database-reachable';

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

  const account = async () => {
    const suffix = randomUUID();
    const userId = `user_${suffix}`;
    const projectId = `project_${suffix}`;
    const email = `${suffix}@test.invalid`;
    await database.insert(schema.user).values({ id: userId, name: 'Delivery Fixture', email });
    await database.insert(schema.project).values({ id: projectId, ownerId: userId, name: 'Delivery fixture' });
    return { userId, projectId, email };
  };

  /** Admit `evidence`, sealed as ingress seals it, and answer its receipt id. */
  const admit = async (evidence: Evidence): Promise<string> => {
    const { principal, project } = evidence.scope;
    const bytes = new TextEncoder().encode(canonicalEvidence(evidence));
    const outcome = await admitEvidence({
      database,
      evidence,
      allowed: { replay: true, admit: true },
      protection: 'free',
      seal: (receipt) => ({
        payload: sealEvidence(
          Uint8Array.from(bytes),
          { environment, principal, project, receipt, plane: evidence.payload.plane },
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
    return outcome.receipt.receipt;
  };

  /**
   * One admitted receipt, sealed as ingress seals it: a tool fact by default, which maps to one Langfuse object; an
   * instruction (`summary`) maps to none.
   */
  const admitted = async (
    plane: 'tool' | 'summary' | 'content' | 'generation' = 'tool',
    owner?: Readonly<{ userId: string; projectId: string }>,
    { sequence = 7, text }: Readonly<{ sequence?: number; text?: string }> = {},
  ) => {
    const { userId, projectId } = owner ?? (await account());
    const evidence = await evidenceFixture({
      principal: userId,
      project: projectId,
      plane: plane === 'tool' ? 'summary' : plane === 'generation' ? 'content' : plane,
      sequence,
      ...(plane === 'tool' ? { fact: toolFact(), semantic: 'call-1' } : {}),
      ...(plane === 'generation'
        ? { fact: providerFact(), semantic: 'call-1', ...(text === undefined ? {} : { text }) }
        : {}),
    });
    return { userId, projectId, receiptId: await admit(evidence) };
  };

  /** One admitted summary receipt carrying `fact`, under `owner`. */
  const admittedFact = async (
    owner: Readonly<{ userId: string; projectId: string }>,
    fact: Extract<Evidence['payload'], { plane: 'summary' }>['fact'],
    semantic: string,
  ) => {
    const evidence = await evidenceFixture({
      principal: owner.userId,
      project: owner.projectId,
      plane: 'summary',
      fact,
      semantic,
    });
    return admit(evidence);
  };

  const row = async (receiptId: string) => {
    const [found] = await database
      .select()
      .from(schema.agentEvidenceOutbox)
      .where(eq(schema.agentEvidenceOutbox.receiptId, receiptId));
    return found!;
  };

  const service = (
    allowed: readonly TelemetryPurpose[] = ['summary', 'content'],
    keyVersion = 1,
    failingProject?: string,
  ) => {
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
    if (failingProject !== undefined) {
      const answer = purposes.getAdmissionAuthority.getMockImplementation();
      purposes.getAdmissionAuthority.mockImplementation(async (userId, projectId) => {
        if (projectId === failingProject) {
          throw new Error('authority unavailable');
        }
        return answer!(userId, projectId);
      });
    }
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

  it('should send once, drop the bytes, and confirm by reading the observation back by its stored object id', async () => {
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
    const [span] = (
      JSON.parse(sent[0]!) as {
        resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<{ spanId: string; traceId: string }> }> }>;
      }
    ).resourceSpans[0]!.scopeSpans[0]!.spans;
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain(receiptId);
    expect(afterSend).toMatchObject({ state: 'confirmed', payload: null, attempts: 1, objectId: span!.spanId });

    await delivery.drain(new Date(now.getTime() + 10_000));
    expect(sent).toHaveLength(1);
    expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'acknowledged' });
    expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'confirmed' });
    expect(metrics.agentEvidencePasses.add).toHaveBeenCalledWith(1, { 'tau.worker': 'delivery', outcome: 'ok' });
  });

  it('should send two receipts for one Langfuse object once and settle the second superseded', async () => {
    const owner = await account();
    const first = await admitted('tool', owner, { sequence: 7 });
    /* Another source for the same tool call: the object its id derives from is the same. */
    const second = await admitted('tool', owner, { sequence: 9 });
    let posts = 0;
    vendor((url) => {
      if (url.pathname.endsWith('/otel/v1/traces')) {
        posts++;
        return json(200, { name: 'otel-ingestion-job' });
      }
      return json(200, { data: [], meta: {} });
    });

    await service().drain(new Date());

    const rows = [await row(first.receiptId), await row(second.receiptId)];
    expect(posts).toBe(1);
    expect(rows.map((item) => item.state).sort()).toEqual(['superseded', 'uncertain']);
    expect(rows.find((item) => item.state === 'superseded')).toMatchObject({
      reason: 'object',
      payload: null,
      traceId: null,
      objectId: null,
    });
    expect(metrics.agentEvidenceSuperseded.add).toHaveBeenCalledWith(1, { reason: 'object' });
    expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'superseded' });
  });

  it('should settle a receipt that maps to no Langfuse object superseded, sending nothing', async () => {
    const { receiptId } = await admitted('summary');
    const fetcher = vendor(() => json(200, {}));

    await service().drain(new Date());

    expect(fetcher).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'POST' }));
    expect(await row(receiptId)).toMatchObject({ state: 'superseded', reason: 'no-object', payload: null });
    expect(metrics.agentEvidenceSuperseded.add).toHaveBeenCalledWith(1, { reason: 'no_object' });
  });

  it('should reconcile a send made before the v5 deploy by the span id its receipt named', async () => {
    const { receiptId } = await admitted();
    const now = new Date();
    await database
      .update(schema.agentEvidenceOutbox)
      .set({ state: 'uncertain', payload: null, traceId: 'c'.repeat(32), observedAt: now, sentAt: now, objectId: null })
      .where(eq(schema.agentEvidenceOutbox.receiptId, receiptId));
    const legacy = receiptSpanId(environment, receiptId);
    vendor((url) => json(200, { data: url.searchParams.get('traceId') === 'c'.repeat(32) ? [{ id: legacy }] : [] }));

    await service().drain(now);

    expect(await row(receiptId)).toMatchObject({ state: 'confirmed' });
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

  it('should settle a row whose attempt fails on its own, without stranding the rest of the batch', async () => {
    const failing = await admitted();
    const healthy = await admitted();
    vendor((url) =>
      url.pathname.endsWith('/otel/v1/traces') ? json(200, { name: 'otel-ingestion-job' }) : json(200, { data: [] }),
    );
    const now = new Date();

    const counts = await service(['summary', 'content'], 1, failing.projectId).drain(now);

    /* Nothing was sent for the failed row, so it backs off and is sent again; it is not left leased. */
    const failed = await row(failing.receiptId);
    expect(failed).toMatchObject({ state: 'pending', reason: 'error', traceId: null, leaseOwner: null });
    expect(failed.payload).not.toBeNull();
    expect(failed.leaseExpiresAt!.getTime()).toBeGreaterThan(now.getTime());
    expect(await row(healthy.receiptId)).toMatchObject({ state: 'uncertain', reason: 'acknowledged' });
    expect(counts).toMatchObject({ 'retry:error': 1, 'sent:acknowledged': 1 });
    expect(metrics.agentEvidencePasses.add).toHaveBeenCalledWith(1, { 'tau.worker': 'delivery', outcome: 'ok' });

    /* A later sweep finds nothing abandoned: no worker died. */
    expect(await sweepBacklog(database, new Date(now.getTime() + deliveryTiming.leaseMilliseconds + 1000))).toEqual({
      expired: 0,
      abandoned: 0,
    });
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

    /* Neither content nor the summary its fact would fall back to is effective. */
    await service(['feedback']).drain(new Date());

    expect(fetcher).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'POST' }));
    expect(await row(withdrawn.receiptId)).toMatchObject({ state: 'expired', payload: null, reason: 'revoked' });
    expect(await row(deleted.receiptId)).toMatchObject({ state: 'expired', payload: null, reason: 'deleted' });
    expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'revoked' });
  });

  /** The attributes of the one span each OTLP post carried. */
  const sentSpans = (bodies: readonly string[]) =>
    bodies.map((body) => {
      const parsed = JSON.parse(body) as {
        resourceSpans: Array<{
          scopeSpans: Array<{ spans: Array<{ attributes: Array<{ key: string; value: { stringValue?: string } }> }> }>;
        }>;
      };
      const [span] = parsed.resourceSpans[0]!.scopeSpans[0]!.spans;
      return new Map(span!.attributes.map((item) => [item.key, item.value.stringValue]));
    });
  const capturePosts = () => {
    const sent: string[] = [];
    vendor(async (url, init) => {
      if (url.pathname.endsWith('/otel/v1/traces')) {
        sent.push(typeof init?.body === 'string' ? init.body : '');
      }
      return json(200, { data: [], meta: {} });
    });
    return sent;
  };

  it("should send a generation's content with the account's email and name redacted", async () => {
    const owner = await account();
    await admitted('generation', owner, {
      text: `I am Delivery Fixture, reach me at ${owner.email.toUpperCase()}`,
    });
    const sent = capturePosts();

    await service(['summary', 'content']).drain(new Date());

    const [attributes] = sentSpans(sent);
    expect(JSON.parse(attributes!.get('langfuse.observation.input')!)).toEqual({
      messages: [{ role: 'user', content: 'I am [name], reach me at [email]' }],
    });
    expect(sent[0]).not.toContain(owner.email);
    expect(attributes!.get('langfuse.observation.metadata.plane')).toBe('content');
  });

  it('should send a content receipt as its summary when only the summary is effective at export', async () => {
    const { receiptId } = await admitted('generation');
    const sent = capturePosts();

    await service(['summary']).drain(new Date());

    const [attributes] = sentSpans(sent);
    expect(sent).toHaveLength(1);
    expect(attributes!.has('langfuse.observation.input')).toBe(false);
    expect(attributes!.get('langfuse.observation.metadata.coverage_input')).toBe('omitted');
    expect(sent[0]).not.toContain(privateMarker);
    expect(await row(receiptId)).toMatchObject({ payload: null });
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

  /* Langfuse blueprint LW24: the units Tau writes, counted once per object when Langfuse is known to hold it. */
  describe('Langfuse units', () => {
    const outcomeFact: Extract<Evidence['payload'], { plane: 'summary' }>['fact'] = {
      kind: 'outcome',
      termination: 'completed',
      success: 'unknown',
      assessment: null,
    };
    const accepting = () =>
      vendor((url) => {
        if (url.pathname.endsWith('/otel/v1/traces')) {
          return json(200, { name: 'otel-ingestion-job' });
        }
        return json(200, { data: [], meta: {} });
      });
    const units = () => metrics.agentEvidenceLangfuseUnits.add.mock.calls;
    /* Earlier tests leave rows due again; each count here is of this test's receipts alone. */
    beforeEach(async () => {
      await database.delete(schema.agentEvidenceOutbox);
    });

    it('should count an accepted span as one observation, once, though it is confirmed later', async () => {
      await admitted();
      accepting();
      const delivery = service();
      const now = new Date();

      await delivery.drain(now);
      await delivery.drain(new Date(now.getTime() + deliveryTiming.recheckMilliseconds + 1));

      expect(units()).toEqual([[1, { kind: 'observation' }]]);
    });

    it("should count a trace as well for a span with no parent, a run's root", async () => {
      const owner = await account();
      await admittedFact(owner, outcomeFact, 'outcome-1');
      accepting();

      await service().drain(new Date());

      expect(units()).toEqual(
        expect.arrayContaining([
          [1, { kind: 'observation' }],
          [1, { kind: 'trace' }],
        ]),
      );
      expect(units()).toHaveLength(2);
    });

    it('should count nothing for a receipt that maps to no object or names one another receipt writes', async () => {
      const owner = await account();
      await admitted('summary', owner, { sequence: 5 });
      await admitted('tool', owner, { sequence: 7 });
      await admitted('tool', owner, { sequence: 9 });
      accepting();

      await service().drain(new Date());

      expect(metrics.agentEvidenceSuperseded.add).toHaveBeenCalledWith(1, { reason: 'no_object' });
      expect(metrics.agentEvidenceSuperseded.add).toHaveBeenCalledWith(1, { reason: 'object' });
      expect(units()).toEqual([[1, { kind: 'observation' }]]);
    });

    it('should count nothing for a send Langfuse refused', async () => {
      await admitted();
      vendor((url) => (url.pathname.endsWith('/otel/v1/traces') ? json(400, {}) : json(200, { data: [] })));

      await service().drain(new Date());

      expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'rejected' });
      expect(units()).toEqual([]);
    });

    it('should count an uncertain send only when reconciliation finds it, and a gap never', async () => {
      const found = await admitted();
      const lost = await admitted();
      const objects = new Map<string, string>();
      let visible = false;
      vendor(async (url, init) => {
        if (url.pathname.endsWith('/otel/v1/traces')) {
          const body = JSON.parse(typeof init?.body === 'string' ? init.body : '') as {
            resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<{ spanId: string; traceId: string }> }> }>;
          };
          const [span] = body.resourceSpans[0]!.scopeSpans[0]!.spans;
          objects.set(span!.traceId, span!.spanId);
          return json(503, {});
        }
        const traceId = url.searchParams.get('traceId')!;
        const { traceId: foundTrace } = await row(found.receiptId);
        const holds = visible && traceId === foundTrace;
        return json(200, { data: holds ? [{ id: objects.get(traceId) }] : [], meta: {} });
      });
      const delivery = service();
      const now = new Date();

      await delivery.drain(now);
      expect(units()).toEqual([]);

      visible = true;
      await delivery.drain(new Date(now.getTime() + deliveryTiming.gapAfterMilliseconds + 1));

      expect(await row(found.receiptId)).toMatchObject({ state: 'confirmed' });
      expect(await row(lost.receiptId)).toMatchObject({ state: 'expired', reason: 'gap' });
      expect(units()).toEqual([[1, { kind: 'observation' }]]);
    });
  });

  it('should purge every held row at its retention', async () => {
    const { receiptId } = await admitted();
    const { expiresAt } = await row(receiptId);

    await sweepBacklog(database, new Date(expiresAt.getTime() + 1));

    expect(await row(receiptId)).toMatchObject({ state: 'expired', payload: null, reason: 'retention' });
  });
});
