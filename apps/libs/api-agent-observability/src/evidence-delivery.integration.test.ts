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
import { scoreAttempts } from '#langfuse-client.js';
import { receiptSpanId } from '#langfuse-observation.js';
import { evidenceFixture, outcomeFact, privateMarker, providerFact, toolFact } from '#testing/evidence.fixture.js';
import { providerAttemptEvidence } from '#model-invocation-evidence.js';
import type { ObservedAttempt } from '#model-invocation-evidence.js';
import { settlementEvidence } from '#settlement-evidence.js';
import type { Evidence } from '@taucad/agent-observability/contract';
import { canonicalEvidence } from '@taucad/agent-observability/identity';
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
    plane: 'tool' | 'summary' | 'content' | 'generation' | 'outcome' | 'rating' = 'tool',
    owner?: Readonly<{ userId: string; projectId: string }>,
    { sequence = 7, text }: Readonly<{ sequence?: number; text?: string }> = {},
  ) => {
    const { userId, projectId } = owner ?? (await account());
    const evidence = await evidenceFixture({
      principal: userId,
      project: projectId,
      plane:
        plane === 'tool' || plane === 'outcome'
          ? 'summary'
          : plane === 'generation'
            ? 'content'
            : plane === 'rating'
              ? 'feedback'
              : plane,
      sequence,
      ...(plane === 'tool' ? { fact: toolFact(), semantic: 'call-1' } : {}),
      ...(plane === 'outcome' ? { fact: outcomeFact(), semantic: 'run-1' } : {}),
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

  /** A funded call of a host run, as the relay observed it, and the ledger's settlement of the same operation (LW4). */
  const funded = (owner: Readonly<{ userId: string; projectId: string }>, call = '0') => {
    const attemptKey = `run-1:1:${call}`;
    const operation = `op-${call}`;
    return {
      generation: async (change: Partial<ObservedAttempt> = {}) =>
        admit(
          await providerAttemptEvidence(
            {
              principal: owner.userId,
              project: owner.projectId,
              attemptKey,
              chat: 'chat-1',
              surface: 'gateway',
              wire: 'anthropic',
              requestedModel: undefined,
              provider: undefined,
              operation,
              startedAt: Date.now() - 2000,
              duration: 1000,
              stream: {
                stop: 'stop',
                usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, reasoning: null, missing: 'none' },
                resolvedModel: 'claude-test',
                response: 'response-1',
                firstChunk: 400,
                firstText: 650,
              },
              ended: 'completed',
              ...change,
            },
            { policyEpoch: 'epoch-a', protection: 'free' },
          ),
        ),
      settlement: async () =>
        admit(
          await settlementEvidence(
            {
              operation: {
                id: operation,
                accountId: 'account-1',
                environment,
                attemptKey,
                projectHint: owner.projectId,
                chatHint: 'chat-1',
                admittedAt: new Date(Date.now() - 2000),
                activationId: 'activation-1',
              },
              receipt: {
                terminalRevision: 1n,
                chargedAtoms: 1_500_000n,
                supplierCostPicoUsd: 750_000_000_000n,
                resolvedAt: new Date(),
              },
              normalization: undefined,
            },
            owner.userId,
            { policyEpoch: 'epoch-a', protection: 'free', project: owner.projectId },
          ),
        ),
    };
  };

  const row = async (receiptId: string) => {
    const [found] = await database
      .select()
      .from(schema.agentEvidenceOutbox)
      .where(eq(schema.agentEvidenceOutbox.receiptId, receiptId));
    return found!;
  };

  /* The three score configs as the operator enters them for this project (LW9). */
  const scoreConfigs = {
    'user-rating': 'cfg-rating',
    'run-termination': 'cfg-termination',
    'task-success': 'cfg-success',
  };
  const service = (
    allowed: readonly TelemetryPurpose[] = ['summary', 'content'],
    keyVersion = 1,
    {
      failingProject,
      configs = scoreConfigs,
    }: Readonly<{ failingProject?: string; configs?: Readonly<Record<string, string>> }> = {},
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
      TAU_OBSERVABILITY_SCORE_CONFIG_IDS: configs,
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

    const counts = await service(['summary', 'content'], 1, { failingProject: failing.projectId }).drain(now);

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

  /** Every request the vendor stub was sent, by route and in order, with each score post's one score. */
  const captureScores = (scoreStatus = 202) => {
    const requests: Array<{ route: 'span' | 'score' | 'read'; score?: Record<string, unknown> }> = [];
    vendor(async (url, init) => {
      if (url.pathname === '/api/public/scores') {
        const [score] = JSON.parse(typeof init?.body === 'string' ? init.body : '[]') as Array<Record<string, unknown>>;
        requests.push({ route: 'score', score: score! });
        return json(scoreStatus, {});
      }
      requests.push({ route: url.pathname.endsWith('/otel/v1/traces') ? 'span' : 'read' });
      return json(200, { data: [], meta: {} });
    });
    return requests;
  };
  const scoresOf = (requests: ReturnType<typeof captureScores>, traceId?: string) =>
    requests.flatMap((request) =>
      request.score === undefined || (traceId !== undefined && request.score['traceId'] !== traceId)
        ? []
        : [request.score],
    );

  it('should write a rating as one user-rating score and no span, settled by its answer alone', async () => {
    const { receiptId } = await admitted('rating');
    const requests = captureScores();

    await service(['feedback']).drain(new Date());

    const [score] = scoresOf(requests);
    expect(scoresOf(requests)).toHaveLength(1);
    expect(score).toMatchObject({ name: 'user-rating', value: 0, dataType: 'BOOLEAN', configId: 'cfg-rating' });
    expect(JSON.stringify(requests)).not.toContain(receiptId);
    expect(await row(receiptId)).toMatchObject({ state: 'confirmed', payload: null, objectId: null });
    expect(metrics.agentEvidenceScores.add).toHaveBeenCalledWith(1, {
      'tau.agent_evidence.score': 'user-rating',
      'tau.agent_evidence.score_configured': 'true',
      outcome: 'accepted',
    });
    expect(metrics.agentEvidenceLangfuseUnits.add.mock.calls).toEqual([[1, { kind: 'score' }]]);
  });

  it("should write an outcome's root once, then its run-termination and task-success scores on that root", async () => {
    const { receiptId } = await admitted('outcome');
    const requests = captureScores();

    await service().drain(new Date());

    const { traceId, objectId } = await row(receiptId);
    const scores = scoresOf(requests, traceId!);
    expect(scores.map((score) => [score['name'], score['value'], score['configId'], score['observationId']])).toEqual([
      ['run-termination', 'completed', 'cfg-termination', objectId],
      ['task-success', 1, 'cfg-success', objectId],
    ]);
    expect(requests.findIndex((request) => request.route === 'span')).toBeLessThan(
      requests.findIndex((request) => request.score?.['traceId'] === traceId),
    );
  });

  it("should still write a later outcome's scores when the first outcome already wrote the run's root", async () => {
    const owner = await account();
    const first = await admitted('outcome', owner, { sequence: 7 });
    const resumed = await admitted('outcome', owner, { sequence: 9 });
    const requests = captureScores();

    await service().drain(new Date());

    const rows = [await row(first.receiptId), await row(resumed.receiptId)];
    expect(rows.map((item) => item.state).sort()).toEqual(['superseded', 'uncertain']);
    const traceId = rows.find((item) => item.traceId !== null)!.traceId!;
    const terminations = scoresOf(requests, traceId).filter((score) => score['name'] === 'run-termination');
    expect(new Set(terminations.map((score) => score['id'])).size).toBe(2);
  });

  it('should deliver the root and its scores without configId when no score config id is set', async () => {
    const { receiptId } = await admitted('outcome');
    const requests = captureScores();

    await service(['summary'], 1, { configs: {} }).drain(new Date());

    const delivered = await row(receiptId);
    expect(delivered.state).not.toBe('pending');
    expect(delivered.payload).toBeNull();
    expect(requests.some((request) => request.route === 'span')).toBe(true);
    const scores = scoresOf(requests, delivered.traceId!);
    expect(scores.map((score) => [score['name'], score['value'], score['dataType']])).toEqual([
      ['run-termination', 'completed', 'CATEGORICAL'],
      ['task-success', 1, 'BOOLEAN'],
    ]);
    for (const score of scores) {
      expect(score).not.toHaveProperty('configId');
      expect(score['observationId']).toBe(delivered.objectId);
    }
    expect(metrics.agentEvidenceScores.add).toHaveBeenCalledWith(1, {
      'tau.agent_evidence.score': 'task-success',
      'tau.agent_evidence.score_configured': 'false',
      outcome: 'accepted',
    });
  });

  it('should settle a rating whose score Langfuse refused rejected, and never send it again', async () => {
    const { receiptId } = await admitted('rating');
    const requests = captureScores(207);
    const delivery = service(['feedback']);
    const now = new Date();

    await delivery.drain(now);
    await delivery.drain(new Date(now.getTime() + deliveryTiming.maxBackoffMilliseconds + 1));

    expect(await row(receiptId)).toMatchObject({ state: 'rejected', reason: 'partial', payload: null });
    expect(scoresOf(requests)).toHaveLength(1);
    expect(metrics.agentEvidenceScores.add).toHaveBeenCalledWith(1, {
      'tau.agent_evidence.score': 'user-rating',
      'tau.agent_evidence.score_configured': 'true',
      outcome: 'rejected',
    });
  });

  it('should expire a rating whose score stayed uncertain after its bounded repeats, and count it uncertain', async () => {
    const { receiptId } = await admitted('rating');
    const requests = captureScores(503);

    await service(['feedback']).drain(new Date());

    expect(await row(receiptId)).toMatchObject({ state: 'expired', reason: 'score-uncertain', payload: null });
    expect(new Set(scoresOf(requests).map((score) => score['id'])).size).toBe(1);
    expect(scoresOf(requests)).toHaveLength(scoreAttempts);
    expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'uncertain' });
  });

  it('should retry a rating whose score write never reached Langfuse', async () => {
    const { receiptId } = await admitted('rating');
    vendor(() => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) });
    });

    await service(['feedback']).drain(new Date());

    const retried = await row(receiptId);
    expect(retried).toMatchObject({ state: 'pending', reason: 'econnrefused' });
    expect(retried.payload).not.toBeNull();
  });

  /** The metadata of each span the vendor stub was sent, in order. */
  const spanMetadata = (bodies: readonly string[]) =>
    bodies.map((body) => {
      const parsed = JSON.parse(body) as {
        resourceSpans: Array<{
          scopeSpans: Array<{
            spans: Array<{
              name: string;
              attributes: Array<{ key: string; value: Record<string, unknown> }>;
            }>;
          }>;
        }>;
      };
      const [span] = parsed.resourceSpans[0]!.scopeSpans[0]!.spans;
      const prefix = 'langfuse.observation.metadata.';
      return {
        name: span!.name,
        metadata: Object.fromEntries(
          span!.attributes
            .filter((item) => item.key.startsWith(prefix))
            .map((item) => [item.key.slice(prefix.length), Object.values(item.value)[0]]),
        ),
      };
    });
  /* Delivery passes one tick apart, so a held receipt comes due on the next. */
  const ticks = async (delivery: EvidenceDeliveryService, from: Date, count: number) => {
    for (let tick = 0; tick < count; tick++) {
      // oxlint-disable-next-line no-await-in-loop -- passes run one after another, as the timer runs them
      await delivery.drain(new Date(from.getTime() + tick * (deliveryTiming.intervalMilliseconds + 1)));
    }
  };

  it("should hold a funded generation until its settlement is admitted, and send the settlement's values in its one send", async () => {
    const owner = await account();
    const call = funded(owner);
    const generation = await call.generation();
    const sent = capturePosts();
    const delivery = service();
    const now = new Date();

    await delivery.drain(now);
    expect(sent).toHaveLength(0);
    expect(await row(generation)).toMatchObject({ state: 'pending', reason: 'held', traceId: null });
    expect(metrics.agentEvidenceDeliveries.add).toHaveBeenCalledWith(1, { outcome: 'held' });

    const settlement = await call.settlement();
    await ticks(delivery, new Date(now.getTime() + deliveryTiming.intervalMilliseconds + 1), 3);

    const [carried] = spanMetadata(sent);
    expect(sent).toHaveLength(1);
    expect(carried).toMatchObject({ name: 'call-model', metadata: { credits: 1.5 } });
    expect(carried!.metadata['supplier_cost_usd']).toBe(0.75);
    expect(carried!.metadata['ledger']).toMatch(/^[a-f\d]{32}$/u);
    expect(carried!.metadata['tariff']).toMatch(/^[a-f\d]{32}$/u);
    expect(sent[0]).not.toContain('cost_details');
    expect(await row(generation)).toMatchObject({ payload: null });
    expect(await row(settlement)).toMatchObject({
      state: 'superseded',
      reason: 'merged',
      payload: null,
      objectId: null,
    });
    expect(metrics.agentEvidenceSuperseded.add).toHaveBeenCalledWith(1, { reason: 'merged' });
    expect(metrics.agentEvidenceSettlements.add).toHaveBeenCalledWith(1, { outcome: 'merged' });
  });

  it('should merge a settlement admitted before its generation, and never send the settlement on its own', async () => {
    const owner = await account();
    const call = funded(owner);
    const settlement = await call.settlement();
    const sent = capturePosts();
    const delivery = service();
    const now = new Date();

    await delivery.drain(now);
    expect(sent).toHaveLength(0);
    expect(await row(settlement)).toMatchObject({ state: 'pending', reason: 'held' });

    const generation = await call.generation();
    await ticks(delivery, new Date(now.getTime() + deliveryTiming.intervalMilliseconds + 1), 2);

    const [carried] = spanMetadata(sent);
    expect(sent).toHaveLength(1);
    expect(carried!.metadata).toMatchObject({ credits: 1.5 });
    expect(await row(generation)).toMatchObject({ payload: null });
    expect(await row(settlement)).toMatchObject({ state: 'superseded', reason: 'merged' });
  });

  it('should send a funded generation without the values once its hold runs out, and count it unsettled', async () => {
    const owner = await account();
    const generation = await funded(owner).generation();
    const sent = capturePosts();
    const delivery = service();
    const now = new Date();

    await delivery.drain(now);
    await delivery.drain(new Date(now.getTime() + deliveryTiming.settlementHoldMilliseconds + 1));

    const [unsettled] = spanMetadata(sent);
    expect(sent).toHaveLength(1);
    expect(unsettled!.metadata).not.toHaveProperty('credits');
    expect(unsettled!.metadata).not.toHaveProperty('ledger');
    expect(await row(generation)).toMatchObject({ payload: null });
    expect(metrics.agentEvidenceSettlements.add).toHaveBeenCalledWith(1, { outcome: 'unsettled' });
  });

  it('should settle a settlement admitted after its generation went late, and send nothing for it', async () => {
    const owner = await account();
    const call = funded(owner);
    await call.generation();
    const sent = capturePosts();
    const delivery = service();
    const now = new Date();
    await delivery.drain(now);
    const gone = new Date(now.getTime() + deliveryTiming.settlementHoldMilliseconds + 1);
    await delivery.drain(gone);
    expect(sent).toHaveLength(1);

    const settlement = await call.settlement();
    await delivery.drain(new Date(gone.getTime() + 1));

    expect(sent).toHaveLength(1);
    expect(await row(settlement)).toMatchObject({ state: 'superseded', reason: 'late', payload: null });
    expect(metrics.agentEvidenceSuperseded.add).toHaveBeenCalledWith(1, { reason: 'late' });
    expect(metrics.agentEvidenceSettlements.add).toHaveBeenCalledWith(1, { outcome: 'late' });
  });

  it('should settle a settlement whose generation never came late once its own bound runs out', async () => {
    const owner = await account();
    const settlement = await funded(owner).settlement();
    const sent = capturePosts();
    const delivery = service();
    const now = new Date();

    await delivery.drain(now);
    expect(await row(settlement)).toMatchObject({ state: 'pending', reason: 'held' });
    await delivery.drain(new Date(now.getTime() + deliveryTiming.settlementOrphanMilliseconds + 1));

    expect(sent).toHaveLength(0);
    expect(await row(settlement)).toMatchObject({ state: 'superseded', reason: 'late', payload: null });
  });

  it('should give a taken settlement back when its generation never reached Langfuse, and merge it on the retry', async () => {
    const owner = await account();
    const call = funded(owner);
    const settlement = await call.settlement();
    const generation = await call.generation();
    const now = new Date();
    vendor(() => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) });
    });
    await ticks(service(), now, 3);
    expect(await row(generation)).toMatchObject({ state: 'pending', reason: 'econnrefused' });
    expect(await row(settlement)).toMatchObject({ state: 'pending', reason: 'held', leaseOwner: null });

    const sent = capturePosts();
    await ticks(service(), new Date(now.getTime() + deliveryTiming.maxBackoffMilliseconds + 1), 2);

    const [carried] = spanMetadata(sent);
    expect(sent).toHaveLength(1);
    expect(carried!.metadata).toMatchObject({ credits: 1.5 });
    expect(await row(settlement)).toMatchObject({ state: 'superseded', reason: 'merged' });
  });

  it('should not hold a failed attempt or a call with no operation', async () => {
    const owner = await account();
    const failed = await funded(owner, '0').generation({ ended: 'failed' });
    const unfunded = await funded(owner, '1').generation({ operation: undefined });
    const sent = capturePosts();

    await service().drain(new Date());

    expect(sent).toHaveLength(2);
    for (const receipt of [failed, unfunded]) {
      // oxlint-disable-next-line no-await-in-loop -- two rows read one after another
      expect(await row(receipt)).toMatchObject({ payload: null });
    }
    expect(metrics.agentEvidenceDeliveries.add).not.toHaveBeenCalledWith(1, { outcome: 'held' });
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

    it("should count a trace as well for a span with no parent, a run's root, and a score for each accepted score", async () => {
      const owner = await account();
      await admittedFact(owner, outcomeFact, 'outcome-1');
      accepting();

      await service().drain(new Date());

      expect(units()).toEqual(
        expect.arrayContaining([
          [1, { kind: 'observation' }],
          [1, { kind: 'trace' }],
          [1, { kind: 'score' }],
        ]),
      );
      expect(units()).toHaveLength(3);
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
