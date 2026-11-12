import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import type { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep, mockReset } from 'vitest-mock-extended';
import { canonicalEvidence } from '@taucad/agent-observability/identity';
import { admitEvidence } from '@taucad/api-agent-observability/evidence-admission';
import { prepareSend } from '@taucad/api-agent-observability/evidence-delivery';
import {
  admitEvidenceErasure,
  eraseAccountEvidence,
  readEvidenceErasure,
} from '@taucad/api-agent-observability/evidence-erasure';
import {
  erasureRetryDelay,
  erasureTiming,
  EvidenceErasureService,
} from '@taucad/api-agent-observability/evidence-erasure.service';
import { sealEvidence } from '@taucad/api-agent-observability/evidence-seal';
import { evidenceFixture } from '@taucad/api-agent-observability/testing/evidence.fixture';
import { requestProjectDeletion } from '@taucad/api-git-core/project-deletion';
import type { DatabaseService, DatabaseType } from '@taucad/api-database';
import * as schema from '@taucad/api-database/schema';
import { ShutdownService } from '@taucad/api-lifecycle/shutdown';
import type { MetricsService } from '@taucad/api-observability/metrics';
import { createScratchDatabase } from '@taucad/api-database/testing/scratch-database';
import type { ScratchDatabase } from '@taucad/api-database/testing/scratch-database';
import { databaseReachable } from '@taucad/api-database/testing/database-reachable';

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

  it("should leave a deleted project's delivered traces to expire, and admit nothing more for it", async () => {
    const userId = await account();
    const projectId = await ownedProject(userId);
    const sent = await admitted(userId, projectId, 1);
    const traceId = await delivered(sent);

    await requestProjectDeletion({ database, projectId, userId, enabled: true });
    /* Kept for debugging until Langfuse's retention expires it; only account deletion erases. */
    expect(await outbox(sent)).toMatchObject({ state: 'confirmed', traceId });
    const erasures = await database
      .select()
      .from(schema.agentEvidenceErasure)
      .where(eq(schema.agentEvidenceErasure.subjectId, projectId));
    expect(erasures).toEqual([]);
    expect(await admit(userId, projectId, 2)).toEqual({ kind: 'fenced' });
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
      prepareSend(
        database,
        { receiptId, owner: 'worker-a' },
        { traceId: 'b'.repeat(32), objectId: 'b'.repeat(16), observedAt: new Date() },
      ),
    ).resolves.toBe('lost');
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
        { background: database } as unknown as DatabaseService,
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

    it('should delete once after the ingestion window, settle on the accepted delete and never read Langfuse', async () => {
      const userId = await account();
      const projectId = await ownedProject(userId);
      const traceId = await delivered(await admitted(userId, projectId));
      const { erasureId } = await eraseProject(projectId);
      const deleted: unknown[] = [];
      const fetcher = vendor((_url, init) => {
        deleted.push(JSON.parse(typeof init?.body === 'string' ? init.body : ''));
        return new Response('{}', { status: 200 });
      });
      const drainer = service();
      const now = Date.now();

      /* A send accepted just before the fence may still be ingested; the one delete waits it out. */
      await drainer.drain(new Date(now));
      expect(deleted).toEqual([]);
      expect(await journal(erasureId)).toEqual([expect.objectContaining({ state: 'pending', attempts: 0 }) as unknown]);

      const due = now + erasureTiming.deleteAfterMilliseconds + 1;
      await drainer.drain(new Date(due));
      expect(deleted).toEqual([{ traceIds: expect.arrayContaining([traceId]) as unknown }]);
      expect(await journal(erasureId)).toEqual([
        expect.objectContaining({ state: 'accepted', attempts: 1, reason: null }) as unknown,
      ]);
      expect(await completedAt(erasureId)).not.toBeNull();

      /* Nothing is read back, and an accepted trace is never requested again. */
      const calls = fetcher.mock.calls.length;
      await drainer.drain(new Date(due + 10 * erasureTiming.maxBackoffMilliseconds));
      expect(fetcher.mock.calls.slice(calls).filter(([, init]) => init?.method !== 'DELETE')).toEqual([]);
      expect(fetcher.mock.calls.every(([, init]) => init?.method === 'DELETE')).toBe(true);
      expect(deleted.filter((body) => JSON.stringify(body).includes(traceId))).toHaveLength(1);
      expect(metrics.agentEvidenceErasureTraces.add).toHaveBeenCalledWith(expect.any(Number), { outcome: 'accepted' });
      expect(metrics.agentEvidenceLifecycleRecords.add).toHaveBeenCalledWith(expect.any(Number), {
        action: 'erased',
      });
    });

    it('should retry a 429, a 5xx and a transport failure with backoff and never complete on one', async () => {
      const userId = await account();
      const projectId = await ownedProject(userId);
      await delivered(await admitted(userId, projectId));
      const { erasureId } = await eraseProject(projectId);
      const answers: Array<() => Response> = [
        () => new Response('{}', { status: 429 }),
        () => new Response('{}', { status: 503 }),
        () => {
          throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
        },
      ];
      let answer = 0;
      const fetcher = vendor(() => answers[answer]!());
      const drainer = service();
      let at = Date.now() + 30 * erasureTiming.maxBackoffMilliseconds;

      for (const [index, reason] of ['http-429', 'http-503', 'transport'].entries()) {
        answer = index;
        // oxlint-disable-next-line no-await-in-loop -- each pass runs after the previous one's backoff
        await drainer.drain(new Date(at));
        // oxlint-disable-next-line no-await-in-loop -- the journal row after this pass
        const [row] = await journal(erasureId);
        expect(row).toMatchObject({ state: 'pending', reason, attempts: index + 1, leaseOwner: null });
        expect(row!.dueAt).toEqual(new Date(at + erasureRetryDelay(index)));
        // oxlint-disable-next-line no-await-in-loop -- not complete after a failed delete
        expect(await completedAt(erasureId)).toBeNull();
        at = row!.dueAt.getTime() + 1;
      }
      expect(erasureRetryDelay(2)).toBeGreaterThan(erasureRetryDelay(0));
      expect(fetcher.mock.calls.every(([, init]) => init?.method === 'DELETE')).toBe(true);
      expect(metrics.agentEvidenceErasureTraces.add).toHaveBeenCalledWith(expect.any(Number), { outcome: 'retry' });
      expect(metrics.agentEvidenceErasureTraces.add).not.toHaveBeenCalledWith(expect.anything(), {
        outcome: 'accepted',
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
      expect(metrics.agentEvidenceBacklogRows.record).toHaveBeenCalledTimes(2 * 7);
      expect(metrics.agentEvidenceBacklogHeldBytes.record).toHaveBeenCalledTimes(2);
      expect(metrics.agentEvidenceErasureTraces.add).not.toHaveBeenCalled();
      expect(metrics.agentEvidencePasses.add).toHaveBeenCalledWith(1, { 'tau.worker': 'lifecycle', outcome: 'ok' });
    });
  });
});
