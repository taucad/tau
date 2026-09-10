import { describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { WireAccountClosure } from '@taucad/billing';
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import type { ClosureCancellationAdapter } from '#api/billing/billing-account-closure.service.js';
import type { DatabaseService } from '#database/database.service.js';
import type { billingAccountClosure, billingOwnerBinding } from '#database/schema.js';
import * as schema from '#database/schema.js';

describe('account closure cancellation boundary', () => {
  it('requires recovery of the original subscription identity and exposes no create operation', async () => {
    const adapter: ClosureCancellationAdapter = {
      recoverAndCancel: vi.fn().mockResolvedValue({ status: 'pending' }),
    };
    await expect(
      adapter.recoverAndCancel({
        closureId: 'closure-a',
        accountId: 'account-a',
        customerBindingId: 'customer-a',
        subscriptionId: 'subscription-a',
        stripeSubscriptionId: null,
        originalCreationLegId: 'creation-leg-a',
        closureGeneration: 1n,
        closureLeaseUntil: new Date('2026-09-06T00:05:00Z'),
      }),
    ).resolves.toEqual({ status: 'pending' });
    expect(adapter.recoverAndCancel).toHaveBeenCalledWith(
      expect.objectContaining({ originalCreationLegId: 'creation-leg-a' }),
    );
    expect('create' in adapter).toBe(false);
  });

  it('allows ordinary auth deletion when no financial binding exists', async () => {
    const database = mockDeep<DatabaseService>();
    database.database.query.billingOwnerBinding.findFirst.mockResolvedValue(undefined);
    const service = new BillingAccountClosureService(database, { recoverAndCancel: vi.fn() }, 'development');
    await expect(service.prepareForAuthDeletion({ authUserId: 'ordinary-user' })).resolves.toBeUndefined();
    expect(database.database.transaction).not.toHaveBeenCalled();
  });

  it('reuses a UI-prepared ready closure for the direct auth hook', async () => {
    const database = mockDeep<DatabaseService>();
    database.database.query.billingOwnerBinding.findFirst.mockResolvedValue(
      mock<typeof billingOwnerBinding.$inferSelect>({ id: 'binding-a', accountId: 'account-a' }),
    );
    database.database.query.billingAccountClosure.findFirst.mockResolvedValue(
      mock<typeof billingAccountClosure.$inferSelect>({
        id: 'closure-a',
        accountId: 'account-a',
        bindingId: 'binding-a',
        environment: 'development',
        state: 'ready_for_auth_deletion',
        attentionCode: null,
        updatedAt: new Date('2026-09-06T00:00:00Z'),
      }),
    );
    const service = new BillingAccountClosureService(database, { recoverAndCancel: vi.fn() }, 'development');
    await expect(service.prepareForAuthDeletion({ authUserId: 'user-a' })).resolves.toBeUndefined();
    expect(database.database.transaction).not.toHaveBeenCalled();
  });

  it('prepares a durable closure for an authorized direct auth deletion', async () => {
    const database = mockDeep<DatabaseService>();
    database.database.query.billingOwnerBinding.findFirst.mockResolvedValue(
      mock<typeof billingOwnerBinding.$inferSelect>({ id: 'binding-a', accountId: 'account-a' }),
    );
    database.database.query.billingAccountClosure.findFirst.mockResolvedValue(undefined);
    const service = new BillingAccountClosureService(database, { recoverAndCancel: vi.fn() }, 'development');
    vi.spyOn(service, 'prepare').mockResolvedValue(mock<WireAccountClosure>({ state: 'ready_for_auth_deletion' }));
    await expect(service.prepareForAuthDeletion({ authUserId: 'user-a' })).resolves.toBeUndefined();
    expect(service.prepare).toHaveBeenCalledWith({ authUserId: 'user-a', requestId: 'auth-delete:user-a' });
  });

  it('returns the current closure through its retained revoked binding', async () => {
    const database = mockDeep<DatabaseService>();
    database.database.query.billingOwnerBinding.findFirst.mockResolvedValue(
      mock<typeof billingOwnerBinding.$inferSelect>({ id: 'binding-a', accountId: 'account-a', revokedAt: new Date() }),
    );
    database.database.query.billingAccountClosure.findFirst.mockResolvedValue(
      mock<typeof billingAccountClosure.$inferSelect>({
        id: 'closure-a',
        accountId: 'account-a',
        bindingId: 'binding-a',
        environment: 'development',
        state: 'cancellation_pending',
        attentionCode: null,
        updatedAt: new Date('2026-09-06T00:00:00Z'),
      }),
    );
    const service = new BillingAccountClosureService(database, { recoverAndCancel: vi.fn() }, 'development');
    await expect(service.current({ authUserId: 'user-a' })).resolves.toMatchObject({
      closureId: 'closure-a',
      ownerId: 'user-a',
      subjectId: 'account-a',
      state: 'cancellation_pending',
    });
  });

  it('does not inspect or apply provider results when another worker owns the closure lease', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const execute = vi.fn().mockResolvedValue([]);
    const transaction = vi.fn(async (run: (tx: { execute: typeof execute; update: typeof update }) => unknown) =>
      run({ execute, update }),
    );
    const cancellation = { recoverAndCancel: vi.fn() };
    const service = new BillingAccountClosureService(
      { database: { transaction } } as unknown as DatabaseService,
      cancellation,
      'development',
    );
    await expect(service.reconcile({ closureId: 'closure-a', accountId: 'account-a' })).resolves.toBe('pending');
    expect(cancellation.recoverAndCancel).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];

describe.runIf(databaseUrl !== undefined)('account closure PostgreSQL lease foundation', () => {
  it('keeps a closed tombstone authoritative while canceling a late active subscription', async () => {
    const client = postgres(databaseUrl!, { max: 1, prepare: false });
    const suffix = crypto.randomUUID();
    const accountId = `closed-account-${suffix}`;
    const bindingId = `closed-binding-${suffix}`;
    const customerBindingId = `closed-customer-${suffix}`;
    const closureId = `closed-closure-${suffix}`;
    const subscriptionId = `closed-subscription-${suffix}`;
    const recoverAndCancel = vi.fn().mockResolvedValue({
      status: 'canceled',
      providerObjectId: `sub_${suffix}`,
    });
    try {
      await client`insert into billing.credit_account (id,environment,status) values (${accountId},'development','closed')`;
      await client`insert into billing.billing_owner_binding (id,account_id,environment,revoked_at)
        values (${bindingId},${accountId},'development',clock_timestamp())`;
      await client`insert into billing.billing_stripe_customer
        (id,account_id,environment,stripe_account_id,livemode,stripe_customer_id)
        values (${customerBindingId},${accountId},'development',${`acct_${suffix}`},false,${`cus_${suffix}`})`;
      await client`insert into public.subscription
        (id,plan,reference_id,status,account_id,environment,customer_binding_id,request_id,request_hash,offer_snapshot,slot_state)
        values (${subscriptionId},'pro',${`ref-${suffix}`},'active',${accountId},'development',${customerBindingId},'request','hash','{}'::jsonb,'current')`;
      await client`insert into billing.billing_account_closure
        (id,account_id,binding_id,environment,request_id,request_hash,state,binding_revoked_at,obligations_frozen_at,auth_deleted_at,closed_at)
        values (${closureId},${accountId},${bindingId},'development','request','hash','closed',clock_timestamp(),clock_timestamp(),clock_timestamp(),clock_timestamp())`;
      const database = drizzle(client, { schema });
      const service = new BillingAccountClosureService({ database }, { recoverAndCancel }, 'development');

      await expect(service.reconcile({ closureId, accountId })).resolves.toBe('processed');
      expect(recoverAndCancel).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId, closureId, accountId }));
      const closure = await database.query.billingAccountClosure.findFirst({
        where: (table, operators) => operators.eq(table.id, closureId),
      });
      expect(closure?.state).toBe('closed');
      expect(closure?.closedAt).toBeInstanceOf(Date);
    } finally {
      await client.end();
    }
  });

  it('uses the database clock after a lock wait when deciding whether an expired lease can be claimed', async () => {
    const first = postgres(databaseUrl!, { max: 1, prepare: false });
    const second = postgres(databaseUrl!, { max: 1, prepare: false });
    const suffix = crypto.randomUUID();
    const userId = `closure-user-${suffix}`;
    const accountId = `closure-account-${suffix}`;
    const bindingId = `closure-binding-${suffix}`;
    const closureId = `closure-${suffix}`;
    try {
      await first.begin(async (transaction) => {
        await transaction`insert into public."user" (id,name,email,email_verified,allows_ai_training,created_at,updated_at)
          values (${userId},'Closure fixture',${`${suffix}@example.invalid`},false,true,now(),now())`;
        await transaction`insert into billing.credit_account (id,environment,status) values (${accountId},'staging','closing')`;
        await transaction`insert into billing.billing_owner_binding (id,account_id,environment,auth_user_id,revoked_at)
          values (${bindingId},${accountId},'staging',${userId},now())`;
        await transaction`insert into billing.billing_account_closure
          (id,account_id,binding_id,environment,request_id,request_hash,state,binding_revoked_at,obligations_frozen_at,lease_until)
          values (${closureId},${accountId},${bindingId},'staging','request','hash','ready_for_auth_deletion',now(),now(),clock_timestamp()+interval '100 milliseconds')`;
      });
      let release!: () => void;
      let reportLocked!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = new Promise<void>((resolve) => {
        reportLocked = resolve;
      });
      const locker = first.begin(async (transaction) => {
        await transaction`select id from billing.billing_account_closure where id=${closureId} for update`;
        reportLocked();
        await held;
      });
      await locked;
      const service = new BillingAccountClosureService(
        { database: drizzle(second, { schema }) },
        { recoverAndCancel: vi.fn() },
        'staging',
      );
      const reconcile = service.reconcile({ closureId, accountId });
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
      release();
      await locker;
      await expect(reconcile).resolves.toBe('processed');
    } finally {
      await Promise.all([first.end(), second.end()]);
    }
  });
});
