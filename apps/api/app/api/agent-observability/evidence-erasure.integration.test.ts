import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import type { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep, mockReset } from 'vitest-mock-extended';
import { canonicalEvidence } from '@taucad/agent-observability/identity';
import { admitEvidence } from '#api/agent-observability/evidence-admission.js';
import { prepareSend } from '#api/agent-observability/evidence-delivery.js';
import {
  admitEvidenceErasure,
  eraseAccountEvidence,
  readEvidenceErasure,
} from '#api/agent-observability/evidence-erasure.js';
import { erasureTiming, EvidenceErasureService } from '#api/agent-observability/evidence-erasure.service.js';
import { sealEvidence } from '#api/agent-observability/evidence-seal.js';
import { evidenceFixture } from '#api/agent-observability/evidence.test-fixture.js';
import type { DatabaseService, DatabaseType } from '#database/database.service.js';
import * as schema from '#database/schema.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { createScratchDatabase } from '#testing/scratch-database.js';
import type { ScratchDatabase } from '#testing/scratch-database.js';
import { databaseReachable } from '#testing/database-reachable.js';

const key = Uint8Array.from(randomBytes(32));
const environment = 'test';

/** Real migrations, locks and fencing in a disposable database; Langfuse is a stub. */
describe.skipIf(!(await databaseReachable(process.env.DATABASE_URL)))('evidence erasure', () => {
  let scratch: ScratchDatabase | undefined;
  let client: postgres.Sql | undefined;
  let database: DatabaseType;

  beforeAll(async () => {
    scratch = await createScratchDatabase('agent_evidence_erasure');
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
    await database.insert(schema.user).values({ id: userId, name: 'Erasure', email: `${suffix}@test.invalid` });
    return userId;
  };
  const ownedProject = async (ownerId: string) => {
    const projectId = `project_${randomUUID()}`;
    await database.insert(schema.project).values({ id: projectId, ownerId, name: 'Erasure fixture' });
    return projectId;
  };

  /** Admit one receipt; a distinct sequence makes it a distinct fact. */
  const admit = async (principal: string, project: string, sequence = 7) => {
    const evidence = await evidenceFixture({
      principal,
      project,
      sequence,
      sourceDigest: randomBytes(32).toString('hex'),
    });
    const bytes = new TextEncoder().encode(canonicalEvidence(evidence));
    return admitEvidence({
      database,
      evidence,
      allowed: { replay: true, admit: true },
      protection: 'free',
      seal: (receipt) => ({
        payload: sealEvidence(
          Uint8Array.from(bytes),
          { environment, principal, project, receipt, plane: 'summary' },
          { version: 1, key },
        ),
        keyVersion: 1,
      }),
      budgets: { total: 1_000_000_000, principal: 1_000_000_000 },
      now: new Date(),
    });
  };
  const admitted = async (principal: string, project: string, sequence?: number) => {
    const outcome = await admit(principal, project, sequence);
    if (outcome.kind !== 'receipt') {
      throw new Error(outcome.kind);
    }
    return outcome.receipt.receipt;
  };
  /** Mark a receipt delivered under a trace, as a confirmed send leaves it. */
  const delivered = async (receiptId: string, traceId = randomBytes(16).toString('hex')) => {
    await database
      .update(schema.agentEvidenceOutbox)
      .set({ state: 'confirmed', payload: null, traceId, observedAt: new Date() })
      .where(eq(schema.agentEvidenceOutbox.receiptId, receiptId));
    return traceId;
  };
  const outbox = async (receiptId: string) => {
    const [found] = await database
      .select()
      .from(schema.agentEvidenceOutbox)
      .where(eq(schema.agentEvidenceOutbox.receiptId, receiptId));
    return found!;
  };
  const journal = async (erasureId: string) =>
    database
      .select()
      .from(schema.agentEvidenceErasureTrace)
      .where(eq(schema.agentEvidenceErasureTrace.erasureId, erasureId));
  const eraseProject = async (projectId: string) =>
    database.transaction(async (transaction) =>
      admitEvidenceErasure(transaction, { scope: 'project', subjectId: projectId }),
    );

  it('should stop unsent rows and name every delivered trace, once', async () => {
    const userId = await account();
    const projectId = await ownedProject(userId);
    const unsent = await admitted(userId, projectId, 1);
    const traceId = await delivered(await admitted(userId, projectId, 2));
    /* A second receipt of the same run shares its trace. */
    await delivered(await admitted(userId, projectId, 3), traceId);

    const first = await eraseProject(projectId);
    expect(first).toMatchObject({ fenced: 1, traces: 1 });
    expect(await outbox(unsent)).toMatchObject({ state: 'expired', payload: null, reason: 'erased', leaseOwner: null });
    expect(await journal(first.erasureId)).toEqual([expect.objectContaining({ traceId, state: 'pending' }) as unknown]);

    const again = await eraseProject(projectId);
    expect(again).toEqual({ erasureId: first.erasureId, fenced: 0, traces: 0 });
  });

  it('should admit nothing under an erased account or project', async () => {
    const userId = await account();
    const erasedProject = await ownedProject(userId);
    await eraseProject(erasedProject);
    expect(await admit(userId, erasedProject)).toEqual({ kind: 'fenced' });

    const reporter = await account();
    const other = await ownedProject(await account());
    await database.transaction(async (transaction) =>
      admitEvidenceErasure(transaction, { scope: 'account', subjectId: reporter }),
    );
    expect(await admit(reporter, other)).toEqual({ kind: 'fenced' });
    expect(await readEvidenceErasure(database, { principalId: reporter, projectId: other })).toBe(true);
    await expect(admitted(await account(), other)).resolves.toMatch(/^evr_/);
  });

  it('should refuse a send that a concurrent erasure fenced', async () => {
    const userId = await account();
    const projectId = await ownedProject(userId);
    const receiptId = await admitted(userId, projectId);
    await database
      .update(schema.agentEvidenceOutbox)
      .set({ state: 'sending', leaseOwner: 'worker-a', leaseExpiresAt: new Date(Date.now() + 60_000) })
      .where(eq(schema.agentEvidenceOutbox.receiptId, receiptId));

    expect(await eraseProject(projectId)).toMatchObject({ fenced: 1, traces: 0 });

    await expect(
      prepareSend(database, { receiptId, owner: 'worker-a' }, { traceId: 'b'.repeat(32), observedAt: new Date() }),
    ).resolves.toBe(false);
  });

  it('should keep an account erasure journal through the account cascade', async () => {
    const userId = await account();
    const projectId = await ownedProject(userId);
    const collaborator = await account();
    const own = await delivered(await admitted(userId, projectId, 1));
    const theirs = await delivered(await admitted(collaborator, projectId, 2));
    const elsewhere = await delivered(await admitted(userId, await ownedProject(collaborator), 3));

    /* The owned project names both of its traces, and the account names its own again, beside the one it reported elsewhere. */
    expect(await eraseAccountEvidence(database, userId)).toEqual({ fenced: 0, traces: 4 });
    await database.delete(schema.user).where(eq(schema.user.id, userId));

    const named = await database
      .select({ traceId: schema.agentEvidenceErasureTrace.traceId })
      .from(schema.agentEvidenceErasureTrace);
    expect(named.map((row) => row.traceId)).toEqual(expect.arrayContaining([own, theirs, elsewhere]));
  });

  describe('drainer', () => {
    const service = (langfuse = true) => {
      const config = mock<ConfigService>();
      /* eslint-disable @typescript-eslint/naming-convention -- environment variables are UPPER_CASED */
      const values: Record<string, unknown> = langfuse
        ? {
            LANGFUSE_BASE_URL: 'https://langfuse.test.invalid',
            LANGFUSE_PUBLIC_KEY: 'pk-test',
            LANGFUSE_SECRET_KEY: 'sk-test',
          }
        : {};
      /* eslint-enable @typescript-eslint/naming-convention -- end of the environment table */
      config.get.mockImplementation((name: string) => values[name]);
      return new EvidenceErasureService(
        { database } as unknown as DatabaseService,
        config as unknown as ConstructorParameters<typeof EvidenceErasureService>[1],
        new ShutdownService(),
        metrics,
      );
    };
    const vendor = (handler: (url: URL, init?: RequestInit) => Response) => {
      const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
        handler(new URL(input instanceof Request ? input.url : String(input)), init),
      );
      vi.stubGlobal('fetch', fetcher);
      return fetcher;
    };
    const completedAt = async (erasureId: string) => {
      const [found] = await database
        .select({ completedAt: schema.agentEvidenceErasure.completedAt })
        .from(schema.agentEvidenceErasure)
        .where(eq(schema.agentEvidenceErasure.id, erasureId));
      return found!.completedAt;
    };

    it('should delete, read back after the window, and complete only on absence', async () => {
      const userId = await account();
      const projectId = await ownedProject(userId);
      const traceId = await delivered(await admitted(userId, projectId));
      const { erasureId } = await eraseProject(projectId);
      const deleted: unknown[] = [];
      let present = true;
      vendor((url, init) => {
        if (init?.method === 'DELETE') {
          deleted.push(JSON.parse(typeof init.body === 'string' ? init.body : ''));
          return new Response('{}', { status: 200 });
        }
        return new Response('{}', { status: present || !url.pathname.endsWith(traceId) ? 200 : 404 });
      });
      const drainer = service();
      const now = Date.now();

      await drainer.drain(new Date(now));
      expect(deleted).toEqual([{ traceIds: expect.arrayContaining([traceId]) as unknown }]);
      expect(await journal(erasureId)).toEqual([
        expect.objectContaining({ state: 'requested', attempts: 1 }) as unknown,
      ]);

      /* Still visible after the window: requested again, never counted as gone. */
      await drainer.drain(new Date(now + erasureTiming.recheckAfterMilliseconds + 1));
      expect(await journal(erasureId)).toEqual([
        expect.objectContaining({ state: 'pending', reason: 'present' }) as unknown,
      ]);
      expect(await completedAt(erasureId)).toBeNull();

      present = false;
      const later = now + 2 * erasureTiming.maxBackoffMilliseconds;
      await drainer.drain(new Date(later));
      await drainer.drain(new Date(later + erasureTiming.recheckAfterMilliseconds + 1));
      expect(await journal(erasureId)).toEqual([expect.objectContaining({ state: 'absent', attempts: 2 }) as unknown]);
      expect(await completedAt(erasureId)).not.toBeNull();
      for (const outcome of ['requested', 'present', 'absent'] as const) {
        expect(metrics.agentEvidenceErasureTraces.add).toHaveBeenCalledWith(expect.any(Number), { outcome });
      }
      expect(metrics.agentEvidenceLifecycleRecords.add).toHaveBeenCalledWith(expect.any(Number), {
        action: 'erased',
      });
    });

    it('should retry a refused deletion and never read an outage as absence', async () => {
      const userId = await account();
      const projectId = await ownedProject(userId);
      await delivered(await admitted(userId, projectId));
      const { erasureId } = await eraseProject(projectId);
      let status = 503;
      vendor(() => new Response('{}', { status }));
      const drainer = service();
      const now = Date.now() + 10 * erasureTiming.maxBackoffMilliseconds;

      await drainer.drain(new Date(now));
      expect(await journal(erasureId)).toEqual([
        expect.objectContaining({ state: 'pending', reason: 'http-503', attempts: 0 }) as unknown,
      ]);

      status = 200;
      await drainer.drain(new Date(now + erasureTiming.maxBackoffMilliseconds));
      status = 502;
      await drainer.drain(
        new Date(now + erasureTiming.maxBackoffMilliseconds + erasureTiming.recheckAfterMilliseconds + 1),
      );
      expect(await journal(erasureId)).toEqual([expect.objectContaining({ state: 'requested' }) as unknown]);
      expect(await completedAt(erasureId)).toBeNull();
      expect(metrics.agentEvidenceErasureTraces.add).toHaveBeenCalledWith(expect.any(Number), { outcome: 'retry' });
      expect(metrics.agentEvidenceErasureTraces.add).toHaveBeenCalledWith(1, { outcome: 'recheck' });
      expect(metrics.agentEvidenceErasureTraces.add).not.toHaveBeenCalledWith(expect.anything(), {
        outcome: 'absent',
      });
    });

    it('should purge expired payloads and then reap their receipts with no Langfuse configured', async () => {
      const userId = await account();
      const receiptId = await admitted(userId, await ownedProject(userId));
      const now = new Date();
      const expired = new Date(now.getTime() - 60_000);
      await database
        .update(schema.agentEvidenceReceipt)
        .set({ expiresAt: expired })
        .where(eq(schema.agentEvidenceReceipt.id, receiptId));
      await database
        .update(schema.agentEvidenceOutbox)
        .set({ expiresAt: expired })
        .where(eq(schema.agentEvidenceOutbox.receiptId, receiptId));
      const fetcher = vendor(() => new Response('{}', { status: 500 }));
      const lifecycle = service(false);

      await lifecycle.drain(now);
      expect(await outbox(receiptId)).toMatchObject({ state: 'expired', payload: null, reason: 'retention' });

      await lifecycle.drain(new Date(now.getTime() + erasureTiming.receiptGraceMilliseconds));
      const [receipt] = await database
        .select({ id: schema.agentEvidenceReceipt.id })
        .from(schema.agentEvidenceReceipt)
        .where(eq(schema.agentEvidenceReceipt.id, receiptId));
      expect(receipt).toBeUndefined();
      const [row] = await database
        .select({ id: schema.agentEvidenceOutbox.receiptId })
        .from(schema.agentEvidenceOutbox)
        .where(eq(schema.agentEvidenceOutbox.receiptId, receiptId));
      expect(row).toBeUndefined();
      expect(fetcher).not.toHaveBeenCalled();
      expect(metrics.agentEvidenceLifecycleRecords.add).toHaveBeenCalledWith(expect.any(Number), { action: 'purged' });
      expect(metrics.agentEvidenceLifecycleRecords.add).toHaveBeenCalledWith(expect.any(Number), { action: 'reaped' });
      /* Every state is sampled each pass, so a drained one reads zero rather than its last value. */
      expect(metrics.agentEvidenceBacklogRows.record).toHaveBeenCalledTimes(2 * 6);
      expect(metrics.agentEvidenceBacklogHeldBytes.record).toHaveBeenCalledTimes(2);
      expect(metrics.agentEvidenceErasureTraces.add).not.toHaveBeenCalled();
      expect(metrics.agentEvidencePasses.add).toHaveBeenCalledWith(1, { 'tau.worker': 'lifecycle', outcome: 'ok' });
    });
  });
});
