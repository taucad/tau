import { describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { WireAccountClosure } from '@taucad/billing';
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import type {
  ClosureCancellationAdapter,
  ClosureCancellationResult,
} from '#api/billing/billing-account-closure.service.js';
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
        (id,plan,status,account_id,environment,customer_binding_id,request_id,request_hash,offer_snapshot,slot_state)
        values (${subscriptionId},'pro','active',${accountId},'development',${customerBindingId},'request','hash','{}'::jsonb,'current')`;
      await client`insert into billing.billing_account_closure
        (id,account_id,binding_id,environment,request_id,request_hash,state,binding_revoked_at,obligations_frozen_at,auth_deleted_at,closed_at)
        values (${closureId},${accountId},${bindingId},'development','request','hash','closed',clock_timestamp(),clock_timestamp(),clock_timestamp(),clock_timestamp())`;
      const database = drizzle(client, { schema });
      const service = new BillingAccountClosureService({ database }, { recoverAndCancel }, 'development');
      const seeded = await database.query.billingAccountClosure.findFirst({
        where: (table, operators) => operators.eq(table.id, closureId),
      });

      await expect(service.reconcile({ closureId, accountId })).resolves.toBe('processed');
      expect(recoverAndCancel).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId, closureId, accountId }));
      const closure = await database.query.billingAccountClosure.findFirst({
        where: (table, operators) => operators.eq(table.id, closureId),
      });
      expect(closure?.state).toBe('closed');
      expect(closure?.closedAt).toBeInstanceOf(Date);
      expect(closure?.closedAt).toEqual(seeded?.closedAt);
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
  it('claims and applies on database time despite a regressed and an advanced worker clock', async () => {
    const client = postgres(databaseUrl!, { max: 1, prepare: false });
    const suffix = crypto.randomUUID();
    const userId = `skew-user-${suffix}`;
    const accountId = `skew-account-${suffix}`;
    const bindingId = `skew-binding-${suffix}`;
    const closureId = `skew-closure-${suffix}`;
    const realNow = Date.now();
    try {
      await client`insert into public."user" (id,name,email,email_verified,allows_ai_training,created_at,updated_at)
        values (${userId},'Skew fixture',${`${suffix}@example.invalid`},false,true,now(),now())`;
      await client`insert into billing.credit_account (id,environment,status) values (${accountId},'staging','closing')`;
      await client`insert into billing.billing_owner_binding (id,account_id,environment,auth_user_id,revoked_at)
        values (${bindingId},${accountId},'staging',${userId},now())`;
      await client`insert into billing.billing_account_closure
        (id,account_id,binding_id,environment,request_id,request_hash,state,binding_revoked_at,obligations_frozen_at,lease_until)
        values (${closureId},${accountId},${bindingId},'staging','request','hash','ready_for_auth_deletion',now(),now(),clock_timestamp()-interval '1 second')`;
      const service = new BillingAccountClosureService(
        { database: drizzle(client, { schema }) },
        { recoverAndCancel: vi.fn() },
        'staging',
      );
      vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
      // A worker whose clock lags cannot refuse an expired lease, and one that runs ahead cannot discard its own live lease.
      vi.setSystemTime(new Date(realNow - 3_600_000));
      await expect(service.reconcile({ closureId, accountId })).resolves.toBe('processed');
      vi.setSystemTime(new Date(realNow + 7_200_000));
      await expect(service.reconcile({ closureId, accountId })).resolves.toBe('processed');
      vi.useRealTimers();
      const [applied] =
        await client`select generation::text as generation, lease_until is null as released, state from billing.billing_account_closure where id=${closureId}`;
      expect(applied).toMatchObject({ generation: '2', released: true, state: 'ready_for_auth_deletion' });
    } finally {
      vi.useRealTimers();
      await client.end();
    }
  });

  it('lets exactly one of two concurrent closure workers apply its claim', async () => {
    const first = postgres(databaseUrl!, { max: 1, prepare: false });
    const second = postgres(databaseUrl!, { max: 1, prepare: false });
    const suffix = crypto.randomUUID();
    const accountId = `race-account-${suffix}`;
    const bindingId = `race-binding-${suffix}`;
    const customerBindingId = `race-customer-${suffix}`;
    const closureId = `race-closure-${suffix}`;
    const subscriptionId = `race-subscription-${suffix}`;
    let admitLoser!: () => void;
    let releaseWinner!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      admitLoser = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });
    const recoverAndCancel = vi.fn(async (): Promise<ClosureCancellationResult> => {
      admitLoser();
      await gate;
      return { status: 'canceled', providerObjectId: `sub_${suffix}` };
    });
    try {
      await first`insert into billing.credit_account (id,environment,status) values (${accountId},'staging','closing')`;
      await first`insert into billing.billing_owner_binding (id,account_id,environment,revoked_at)
        values (${bindingId},${accountId},'staging',clock_timestamp())`;
      await first`insert into billing.billing_stripe_customer
        (id,account_id,environment,stripe_account_id,livemode,stripe_customer_id)
        values (${customerBindingId},${accountId},'staging',${`acct_${suffix}`},false,${`cus_${suffix}`})`;
      await first`insert into public.subscription
        (id,plan,status,account_id,environment,customer_binding_id,request_id,request_hash,offer_snapshot,slot_state)
        values (${subscriptionId},'pro','active',${accountId},'staging',${customerBindingId},'request','hash','{}'::jsonb,'current')`;
      await first`insert into billing.billing_account_closure
        (id,account_id,binding_id,environment,request_id,request_hash,state,binding_revoked_at,obligations_frozen_at)
        values (${closureId},${accountId},${bindingId},'staging','request','hash','ready_for_auth_deletion',now(),now())`;
      const [winner, loser] = [first, second].map(
        (client) =>
          new BillingAccountClosureService({ database: drizzle(client, { schema }) }, { recoverAndCancel }, 'staging'),
      );
      const winning = winner!.reconcile({ closureId, accountId });
      await dispatched;
      // The second worker arrives while the first still owns a live lease on the same generation.
      const losing = await loser!.reconcile({ closureId, accountId });
      releaseWinner();
      expect([await winning, losing].filter((result) => result === 'processed')).toHaveLength(1);
      expect(losing).toBe('pending');
      expect(recoverAndCancel).toHaveBeenCalledTimes(1);
      const [claimed] =
        await first`select generation::text as generation, lease_until is null as released from billing.billing_account_closure where id=${closureId}`;
      expect(claimed).toMatchObject({ generation: '1', released: true });
    } finally {
      releaseWinner();
      await Promise.all([first.end(), second.end()]);
    }
  });

  it('keeps the account closing when a stale claimant reaches the final closed write', async () => {
    const first = postgres(databaseUrl!, { max: 1, prepare: false });
    const second = postgres(databaseUrl!, { max: 1, prepare: false });
    const suffix = crypto.randomUUID();
    const accountId = `stale-account-${suffix}`;
    const bindingId = `stale-binding-${suffix}`;
    const customerBindingId = `stale-customer-${suffix}`;
    const closureId = `stale-closure-${suffix}`;
    const subscriptionId = `stale-subscription-${suffix}`;
    // The provider leg succeeds, but the worker's lease expires (from another connection) before it
    // returns, so the final closed write must find no live claim. Closure-row-first ordering means the
    // account status is never touched by a stale claimant; account-first ordering would commit 'closed'.
    const recoverAndCancel = vi.fn(async (): Promise<ClosureCancellationResult> => {
      await second`update billing.billing_account_closure set lease_until = clock_timestamp() - interval '1 second' where id = ${closureId}`;
      return { status: 'canceled', providerObjectId: `sub_${suffix}` };
    });
    try {
      await first`insert into billing.credit_account (id,environment,status) values (${accountId},'staging','closing')`;
      await first`insert into billing.billing_owner_binding (id,account_id,environment,revoked_at)
        values (${bindingId},${accountId},'staging',clock_timestamp())`;
      await first`insert into billing.billing_stripe_customer
        (id,account_id,environment,stripe_account_id,livemode,stripe_customer_id)
        values (${customerBindingId},${accountId},'staging',${`acct_${suffix}`},false,${`cus_${suffix}`})`;
      await first`insert into public.subscription
        (id,plan,status,account_id,environment,customer_binding_id,request_id,request_hash,offer_snapshot,slot_state)
        values (${subscriptionId},'pro','active',${accountId},'staging',${customerBindingId},'request','hash','{}'::jsonb,'current')`;
      await first`insert into billing.billing_account_closure
        (id,account_id,binding_id,environment,request_id,request_hash,state,binding_revoked_at,obligations_frozen_at,auth_deleted_at)
        values (${closureId},${accountId},${bindingId},'staging','request','hash','ready_for_auth_deletion',now(),now(),clock_timestamp())`;
      const service = new BillingAccountClosureService(
        { database: drizzle(first, { schema }) },
        { recoverAndCancel },
        'staging',
      );
      expect(await service.reconcile({ closureId, accountId })).toBe('pending');
      expect(recoverAndCancel).toHaveBeenCalledTimes(1);
      const [closure] =
        await first`select state, closed_at is null as open from billing.billing_account_closure where id=${closureId}`;
      expect(closure).toMatchObject({ state: 'ready_for_auth_deletion', open: true });
      const [account] = await first`select status from billing.credit_account where id=${accountId}`;
      expect(account).toMatchObject({ status: 'closing' });
    } finally {
      await Promise.all([first.end(), second.end()]);
    }
  });

  it('rejects preparation when the discovered owner is withdrawn before the account lock is granted', async () => {
    const first = postgres(databaseUrl!, { max: 1, prepare: false });
    const second = postgres(databaseUrl!, { max: 1, prepare: false });
    const suffix = crypto.randomUUID();
    const userId = `owner-user-${suffix}`;
    const accountId = `owner-account-${suffix}`;
    const bindingId = `owner-binding-${suffix}`;
    try {
      await first`insert into public."user" (id,name,email,email_verified,allows_ai_training,created_at,updated_at)
        values (${userId},'Owner fixture',${`${suffix}@example.invalid`},false,true,now(),now())`;
      await first`insert into billing.credit_account (id,environment,status) values (${accountId},'staging','open')`;
      await first`insert into billing.billing_owner_binding (id,account_id,environment,auth_user_id)
        values (${bindingId},${accountId},'staging',${userId})`;
      let release!: () => void;
      let reportLocked!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = new Promise<void>((resolve) => {
        reportLocked = resolve;
      });
      const withdraw = first.begin(async (transaction) => {
        await transaction`select id from billing.credit_account where id=${accountId} for update`;
        await transaction`update billing.billing_owner_binding set auth_user_id = null where id=${bindingId}`;
        reportLocked();
        await held;
      });
      await locked;
      const service = new BillingAccountClosureService(
        { database: drizzle(second, { schema }) },
        { recoverAndCancel: vi.fn() },
        'staging',
      );
      const prepare = service.prepare({ authUserId: userId, requestId: `withdrawn-${suffix}` });
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
      release();
      await withdraw;
      await expect(prepare).rejects.toThrow('billing_owner_changed');
      expect(await first`select id from billing.billing_account_closure where account_id=${accountId}`).toHaveLength(0);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }
  });
});
