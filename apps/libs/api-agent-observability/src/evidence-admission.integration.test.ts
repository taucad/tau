import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Evidence } from '@taucad/agent-observability/contract';
import { admitEvidence } from '#evidence-admission.js';
import type { EvidenceAdmissionInput } from '#evidence-admission.js';
import { evidenceFixture, privateMarker } from '#testing/evidence.fixture.js';
import type { DatabaseType } from '@taucad/api-database';
import * as schema from '@taucad/api-database/schema';
import { createScratchDatabase } from '@taucad/api-database/testing/scratch-database';
import type { ScratchDatabase } from '@taucad/api-database/testing/scratch-database';
import { databaseReachable } from '@taucad/api-database/testing/database-reachable';

/** Real migrations, locks and transactions in a disposable database. */
describe.skipIf(!(await databaseReachable(process.env.DATABASE_URL)))('evidence admission', () => {
  let scratch: ScratchDatabase | undefined;
  let client: postgres.Sql | undefined;
  let database: DatabaseType;

  beforeAll(async () => {
    scratch = await createScratchDatabase('agent_evidence');
    client = postgres(scratch.url, { max: 6 });
    database = drizzle(client, { schema });
  });
  afterAll(async () => {
    await client?.end();
    await scratch?.drop();
  });

  const seed = async () => {
    const suffix = randomUUID();
    const userId = `user_${suffix}`;
    const projectId = `project_${suffix}`;
    await database.insert(schema.user).values({ id: userId, name: 'Evidence', email: `${suffix}@test.invalid` });
    await database.insert(schema.project).values({ id: projectId, ownerId: userId, name: 'Evidence fixture' });
    return { userId, projectId };
  };

  const admit = async (
    evidence: Evidence,
    change: Partial<Omit<EvidenceAdmissionInput, 'database' | 'evidence'>> = {},
  ) =>
    admitEvidence({
      database,
      evidence,
      allowed: { replay: true, admit: true },
      protection: 'free',
      seal: (receipt) => ({ payload: `1.sealed-${receipt}`, keyVersion: 1 }),
      budgets: { total: 1_000_000, principal: 1_000_000 },
      now: new Date(),
      ...change,
    });

  const rows = async (projectId: string) => ({
    receipts: await database
      .select()
      .from(schema.agentEvidenceReceipt)
      .where(eq(schema.agentEvidenceReceipt.projectId, projectId)),
    outbox: await database
      .select({ receiptId: schema.agentEvidenceOutbox.receiptId, payload: schema.agentEvidenceOutbox.payload })
      .from(schema.agentEvidenceOutbox)
      .innerJoin(schema.agentEvidenceReceipt, eq(schema.agentEvidenceReceipt.id, schema.agentEvidenceOutbox.receiptId))
      .where(eq(schema.agentEvidenceReceipt.projectId, projectId)),
    sources: await database
      .select()
      .from(schema.agentEvidenceSource)
      .where(eq(schema.agentEvidenceSource.projectId, projectId)),
  });

  const count = async (projectId: string, table: 'receipts' | 'outbox' | 'sources'): Promise<number> => {
    const held = await rows(projectId);
    return held[table].length;
  };

  it('commits the receipt, the sealed backlog row and the source protection together', async () => {
    const { userId, projectId } = await seed();
    const evidence = await evidenceFixture({ principal: userId, project: projectId, plane: 'content' });

    const outcome = await admit(evidence);

    expect(outcome).toMatchObject({ kind: 'receipt', receipt: { disposition: 'accepted', duplicate: false } });
    const held = await rows(projectId);
    expect(held.receipts).toHaveLength(1);
    expect(held.outbox).toEqual([{ receiptId: held.receipts[0]!.id, payload: `1.sealed-${held.receipts[0]!.id}` }]);
    expect(JSON.stringify(held)).not.toContain(privateMarker);
    expect(held.sources).toMatchObject([{ sourceId: 'row-7', protection: 'free' }]);
    expect(held.receipts[0]!.expiresAt.getTime()).toBe(evidence.retention.expiresAt);
  });

  it('answers a replay, another uploader and two concurrent copies with one receipt', async () => {
    const { userId, projectId } = await seed();
    const evidence = await evidenceFixture({ principal: userId, project: projectId });
    const copied = await evidenceFixture({ principal: userId, project: projectId, uploader: 'device-b' });

    const [first, second] = await Promise.all([admit(evidence), admit(evidence)]);
    const third = await admit(copied);

    const receipts = [first, second, third].map((outcome) =>
      outcome.kind === 'receipt' ? outcome.receipt : undefined,
    );
    expect(new Set(receipts.map((receipt) => receipt?.receipt)).size).toBe(1);
    expect(receipts.filter((receipt) => receipt?.duplicate === false)).toHaveLength(1);
    expect(await count(projectId, 'outbox')).toBe(1);
  });

  it('answers a replay under withdrawn or expired authority without enqueueing it again', async () => {
    const { userId, projectId } = await seed();
    const evidence = await evidenceFixture({ principal: userId, project: projectId });
    const first = await admit(evidence);

    const revoked = await admit(evidence, { allowed: { replay: false, admit: false } });
    const expired = await admit(evidence, { now: new Date(evidence.retention.expiresAt + 1) });

    expect(revoked).toMatchObject({ kind: 'receipt', receipt: { disposition: 'revoked', duplicate: true } });
    expect(expired).toMatchObject({ kind: 'receipt', receipt: { disposition: 'expired', duplicate: true } });
    expect(
      first.kind === 'receipt' && revoked.kind === 'receipt' && first.receipt.receipt === revoked.receipt.receipt,
    ).toBe(true);
    expect(await count(projectId, 'outbox')).toBe(1);
  });

  it('refuses changed source bytes, changed projection bytes and a changed lineage digest as conflicts', async () => {
    const { userId, projectId } = await seed();
    await admit(await evidenceFixture({ principal: userId, project: projectId, plane: 'content' }));

    const changedSource = await evidenceFixture({
      principal: userId,
      project: projectId,
      sourceDigest: 'b'.repeat(64),
    });
    const changedProjection = await evidenceFixture({
      principal: userId,
      project: projectId,
      plane: 'content',
      text: 'other bytes',
    });
    const changedLineage = await evidenceFixture({
      principal: userId,
      project: projectId,
      sequence: 8,
      lineageDigest: 'c'.repeat(64),
    });
    const changedLineageReuse = {
      ...changedLineage,
      lineage: [{ ...changedLineage.lineage[0]!, source: 'row-7' }],
    };

    /* A new source recorded before the conflicting one is rolled back with it. */
    const partial = await evidenceFixture({ principal: userId, project: projectId, sequence: 10 });
    const partialLineage = {
      ...partial,
      lineage: [partial.lineage[0]!, { ...partial.lineage[0]!, source: 'row-7', digest: 'c'.repeat(64) }],
    };

    expect(await admit(changedSource)).toEqual({ kind: 'conflict' });
    expect(await admit(changedProjection)).toEqual({ kind: 'conflict' });
    expect(await admit(changedLineageReuse)).toEqual({ kind: 'conflict' });
    expect(await admit(partialLineage)).toEqual({ kind: 'conflict' });
    const held = await rows(projectId);
    expect(held.receipts).toHaveLength(1);
    expect(held.sources.map((row) => row.sourceId)).toEqual(['row-7']);
  });

  const settleOutbox = async (receipt: string, change: Partial<typeof schema.agentEvidenceOutbox.$inferInsert>) =>
    database.update(schema.agentEvidenceOutbox).set(change).where(eq(schema.agentEvidenceOutbox.receiptId, receipt));

  it('settles a re-projection superseded while the earlier projection is on its way or delivered, enqueueing nothing', async () => {
    const { userId, projectId } = await seed();
    const first = await admit(await evidenceFixture({ principal: userId, project: projectId }));
    const receipt = first.kind === 'receipt' ? first.receipt.receipt : '';

    const pending = await admit(
      await evidenceFixture({ principal: userId, project: projectId, projectionVersion: 'v2' }),
    );
    /* A fact first delivered under the v4.3 mapper keeps its receipt: a later projection is never exported again. */
    await settleOutbox(receipt, { state: 'confirmed', payload: null, traceId: 'a'.repeat(32) });
    const delivered = await admit(
      await evidenceFixture({ principal: userId, project: projectId, projectionVersion: 'v3' }),
    );
    const withdrawn = await admit(
      await evidenceFixture({ principal: userId, project: projectId, projectionVersion: 'v4' }),
      { allowed: { replay: false, admit: false } },
    );

    for (const outcome of [pending, delivered]) {
      expect(outcome).toMatchObject({
        kind: 'receipt',
        superseded: true,
        receipt: { receipt, disposition: 'accepted', duplicate: true },
      });
    }
    expect(withdrawn).toMatchObject({
      kind: 'receipt',
      superseded: true,
      receipt: { receipt, disposition: 'revoked' },
    });
    expect(await count(projectId, 'receipts')).toBe(1);
    expect(await count(projectId, 'outbox')).toBe(1);
  });

  it('admits a re-projection whose earlier projection was rejected or expired unsent', async () => {
    const { userId, projectId } = await seed();
    const first = await admit(await evidenceFixture({ principal: userId, project: projectId }));
    await settleOutbox(first.kind === 'receipt' ? first.receipt.receipt : '', { state: 'rejected', payload: null });

    const second = await admit(
      await evidenceFixture({ principal: userId, project: projectId, projectionVersion: 'v2' }),
    );
    await settleOutbox(second.kind === 'receipt' ? second.receipt.receipt : '', {
      state: 'expired',
      payload: null,
      reason: 'revoked',
    });
    const third = await admit(
      await evidenceFixture({ principal: userId, project: projectId, projectionVersion: 'v3' }),
    );

    expect(second).toMatchObject({ kind: 'receipt', receipt: { duplicate: false } });
    expect(second).not.toHaveProperty('superseded');
    expect(third).toMatchObject({ kind: 'receipt', receipt: { duplicate: false } });
    expect(await count(projectId, 'receipts')).toBe(3);
    expect(await count(projectId, 'outbox')).toBe(3);
  });

  it('admits again after a send that reached ingestion only when it was rejected, never after a gap', async () => {
    const { userId, projectId } = await seed();
    const first = await admit(await evidenceFixture({ principal: userId, project: projectId }));
    await settleOutbox(first.kind === 'receipt' ? first.receipt.receipt : '', {
      state: 'expired',
      payload: null,
      reason: 'gap',
      traceId: 'b'.repeat(32),
    });

    expect(
      await admit(await evidenceFixture({ principal: userId, project: projectId, projectionVersion: 'v2' })),
    ).toMatchObject({ kind: 'receipt', superseded: true });
    expect(await count(projectId, 'outbox')).toBe(1);
  });

  it('refuses without authority, in a deletion-fenced project and beyond the backlog budget, writing nothing', async () => {
    const { userId, projectId } = await seed();
    const evidence = await evidenceFixture({ principal: userId, project: projectId });

    expect(await admit(evidence, { allowed: { replay: true, admit: false } })).toEqual({ kind: 'refused' });
    expect(await admit(evidence, { budgets: { total: 1_000_000, principal: 4 } })).toEqual({ kind: 'capacity' });
    expect(await admit(evidence, { budgets: { total: 4, principal: 1_000_000 } })).toEqual({ kind: 'capacity' });
    await database.insert(schema.projectDeletion).values({ projectId, ownerId: userId, requestedBy: userId });
    expect(await admit(evidence)).toEqual({ kind: 'fenced' });

    const held = await rows(projectId);
    expect([held.receipts, held.outbox, held.sources]).toEqual([[], [], []]);
  });

  it('keeps the protection a source was first received under, and lets a claim only make it stricter', async () => {
    const { userId, projectId } = await seed();
    await admit(await evidenceFixture({ principal: userId, project: projectId }), { protection: 'pro' });

    /* Another fact citing the same source, uploaded after a downgrade: the source is still Pro. */
    const citing = await evidenceFixture({ principal: userId, project: projectId, sequence: 8 });
    const later = await admit(
      { ...citing, lineage: [{ ...citing.lineage[0]!, source: 'row-7' }] },
      { protection: 'free' },
    );
    /* A new source the client marks unknown while the account is Free: unknown. */
    await admit(await evidenceFixture({ principal: userId, project: projectId, sequence: 9, protection: 'unknown' }));

    expect(later).toMatchObject({ kind: 'receipt', receipt: { duplicate: false } });
    const held = await rows(projectId);
    expect(Object.fromEntries(held.sources.map((row) => [row.sourceId, row.protection]))).toEqual({
      'row-7': 'pro',
      'row-9': 'unknown',
    });
    expect(held.receipts.map((row) => row.lineage[0]!.protection).sort()).toEqual(['pro', 'pro', 'unknown']);
  });
});
