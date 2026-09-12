/* oxlint-disable typescript/no-restricted-types, curly, no-await-in-loop -- persisted nulls and sequential financial reconciliation are deliberate */
import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { WireAccountClosure } from '@taucad/billing';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import type { DatabaseService } from '#database/database.service.js';
import {
  billingAccountClosure,
  billingOwnerBinding,
  billingProviderLeg,
  billingReloadConsent,
  creditAccount,
  subscription,
} from '#database/schema.js';

type Database = DatabaseService['database'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type ClosureCancellationResult =
  | { readonly status: 'canceled'; readonly providerObjectId: string }
  | { readonly status: 'not_created' }
  | { readonly status: 'pending' }
  | { readonly status: 'attention'; readonly code: string };

export type ClosureCancellationAdapter = {
  recoverAndCancel(input: {
    readonly closureId: string;
    readonly accountId: string;
    readonly customerBindingId: string;
    readonly subscriptionId: string;
    readonly stripeSubscriptionId: string | null;
    readonly originalCreationLegId: string | null;
    readonly closureGeneration: bigint;
    readonly closureLeaseUntil: Date;
  }): Promise<ClosureCancellationResult>;
};

/** Persists the financial tombstone before auth deletion and reconciles its external obligations. */
@Injectable()
export class BillingAccountClosureService {
  public constructor(
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly cancellation: ClosureCancellationAdapter,
    private readonly environment: FinancialEnvironment,
  ) {}

  public async prepare(input: {
    readonly authUserId: string;
    readonly requestId: string;
  }): Promise<WireAccountClosure> {
    const discovered = await this.findRetainedBinding(input.authUserId);
    if (discovered === undefined) throw new NotFoundException('billing_owner_not_found');
    const requestHash = digest({ accountId: discovered.accountId, requestId: input.requestId });
    return this.databaseService.database.transaction(async (tx) => {
      // The unlocked discovery prevents a binding-first deadlock. The account is always the first lock.
      await tx.execute(sql`select id from billing.credit_account where id = ${discovered.accountId} for update`);
      await tx.execute(sql`select id from billing.billing_owner_binding where id = ${discovered.id} for update`);
      const lockedBinding = await tx.query.billingOwnerBinding.findFirst({
        where: and(
          eq(billingOwnerBinding.id, discovered.id),
          eq(billingOwnerBinding.accountId, discovered.accountId),
          eq(billingOwnerBinding.environment, this.environment),
          eq(billingOwnerBinding.authUserId, input.authUserId),
        ),
      });
      if (lockedBinding === undefined) throw new ConflictException('billing_owner_changed');
      const existing = await tx.query.billingAccountClosure.findFirst({
        where: and(
          eq(billingAccountClosure.accountId, discovered.accountId),
          eq(billingAccountClosure.bindingId, discovered.id),
        ),
      });
      if (existing !== undefined) {
        if (existing.requestId !== input.requestId || existing.requestHash !== requestHash)
          throw new ConflictException('account_closure_request_conflict');
        return project(existing, input.authUserId);
      }
      const now = new Date();
      const closureId = randomUUID();
      await tx.update(billingOwnerBinding).set({ revokedAt: now }).where(eq(billingOwnerBinding.id, discovered.id));
      await tx.update(creditAccount).set({ status: 'closing' }).where(eq(creditAccount.id, discovered.accountId));
      await tx
        .update(billingReloadConsent)
        .set({ state: 'revoked', updatedAt: now })
        .where(
          and(
            eq(billingReloadConsent.accountId, discovered.accountId),
            inArray(billingReloadConsent.state, ['pending_setup', 'enabled', 'paused_terms', 'disabled_failures']),
          ),
        );
      await tx.insert(billingAccountClosure).values({
        id: closureId,
        accountId: discovered.accountId,
        bindingId: discovered.id,
        environment: this.environment,
        requestId: input.requestId,
        requestHash,
        state: 'closing',
        requestedAt: now,
        bindingRevokedAt: now,
        obligationsFrozenAt: now,
        updatedAt: now,
      });
      await this.freezeSubscriptionObligations(tx, closureId, discovered.accountId, now);
      const [ready] = await tx
        .update(billingAccountClosure)
        .set({ state: 'ready_for_auth_deletion', updatedAt: now })
        .where(and(eq(billingAccountClosure.id, closureId), eq(billingAccountClosure.accountId, discovered.accountId)))
        .returning();
      if (ready === undefined) throw new Error('account_closure_insert_failed');
      return project(ready, input.authUserId);
    });
  }

  /** Better Auth `user.deleteUser.beforeDelete(user, request?)` calls this and must await it. */
  public async prepareForAuthDeletion(input: {
    readonly authUserId: string;
    readonly request?: Request;
  }): Promise<void> {
    const binding = await this.findRetainedBinding(input.authUserId);
    if (binding === undefined) return;
    const existing = await this.databaseService.database.query.billingAccountClosure.findFirst({
      where: and(
        eq(billingAccountClosure.accountId, binding.accountId),
        eq(billingAccountClosure.bindingId, binding.id),
      ),
    });
    const closure =
      existing === undefined
        ? await this.prepare({ authUserId: input.authUserId, requestId: `auth-delete:${input.authUserId}` })
        : project(existing, input.authUserId);
    if (closure.state !== 'ready_for_auth_deletion' && closure.state !== 'closed') {
      throw new ConflictException('account_closure_not_ready_for_auth_deletion');
    }
  }

  public async status(input: { readonly authUserId: string; readonly closureId: string }): Promise<WireAccountClosure> {
    const binding = await this.findRetainedBinding(input.authUserId);
    if (binding === undefined) throw new NotFoundException('account_closure_not_found');
    const row = await this.databaseService.database.query.billingAccountClosure.findFirst({
      where: and(
        eq(billingAccountClosure.id, input.closureId),
        eq(billingAccountClosure.bindingId, binding.id),
        eq(billingAccountClosure.environment, this.environment),
      ),
    });
    if (row === undefined) throw new NotFoundException('account_closure_not_found');
    return project(row, input.authUserId);
  }

  /** Returns the retained owner's current closure after its active billing binding has been revoked. */
  public async current(input: { readonly authUserId: string }): Promise<WireAccountClosure | undefined> {
    const binding = await this.findRetainedBinding(input.authUserId);
    if (binding === undefined) return undefined;
    const row = await this.databaseService.database.query.billingAccountClosure.findFirst({
      where: and(
        eq(billingAccountClosure.bindingId, binding.id),
        eq(billingAccountClosure.environment, this.environment),
      ),
    });
    return row === undefined ? undefined : project(row, input.authUserId);
  }

  public async reconcile(input: {
    readonly closureId: string;
    readonly accountId: string;
  }): Promise<'processed' | 'pending' | 'attention'> {
    const claim = await this.databaseService.database.transaction(async (tx) => {
      await tx.execute(sql`select id from billing.credit_account where id = ${input.accountId} for update`);
      await tx.execute(sql`select id from billing.billing_account_closure where id = ${input.closureId} for update`);
      const [claimed] = await tx
        .update(billingAccountClosure)
        .set({
          generation: sql`${billingAccountClosure.generation} + 1`,
          leaseUntil: sql`clock_timestamp() + interval '5 minutes'`,
          attemptCount: sql`${billingAccountClosure.attemptCount} + 1`,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(
          and(
            eq(billingAccountClosure.id, input.closureId),
            eq(billingAccountClosure.accountId, input.accountId),
            eq(billingAccountClosure.environment, this.environment),
            or(isNull(billingAccountClosure.leaseUntil), lte(billingAccountClosure.leaseUntil, sql`clock_timestamp()`)),
            inArray(billingAccountClosure.state, [
              'closing',
              'cancellation_pending',
              'ready_for_auth_deletion',
              'attention',
              'closed',
            ]),
          ),
        )
        .returning({
          generation: billingAccountClosure.generation,
          state: billingAccountClosure.state,
          leaseUntil: billingAccountClosure.leaseUntil,
        });
      return claimed;
    });
    if (claim?.leaseUntil === undefined || claim.leaseUntil === null) return 'pending';
    const obligations = await this.databaseService.database
      .select({
        subscriptionId: subscription.id,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        customerBindingId: subscription.customerBindingId,
      })
      .from(subscription)
      .where(
        and(
          eq(subscription.accountId, input.accountId),
          inArray(subscription.slotState, ['pending', 'current', 'attention']),
        ),
      );
    let pending = false;
    for (const obligation of obligations) {
      if (obligation.customerBindingId === null) throw new Error('owned_subscription_missing_customer_binding');
      const creation = await this.databaseService.database.query.billingProviderLeg.findFirst({
        where: and(
          eq(billingProviderLeg.subscriptionId, obligation.subscriptionId),
          eq(billingProviderLeg.kind, 'checkout_subscription'),
        ),
      });
      const result = await this.cancellation.recoverAndCancel({
        ...input,
        customerBindingId: obligation.customerBindingId,
        subscriptionId: obligation.subscriptionId,
        stripeSubscriptionId: obligation.stripeSubscriptionId,
        originalCreationLegId: creation?.id ?? null,
        closureGeneration: claim.generation,
        closureLeaseUntil: claim.leaseUntil,
      });
      if (result.status === 'attention') {
        return (await this.setState(
          input,
          claim.generation,
          claim.state === 'closed' ? 'closed' : 'attention',
          result.code,
        ))
          ? 'attention'
          : 'pending';
      }
      if (result.status === 'pending') pending = true;
    }
    if (!pending) {
      const closure = await this.databaseService.database.query.billingAccountClosure.findFirst({
        where: and(eq(billingAccountClosure.id, input.closureId), eq(billingAccountClosure.accountId, input.accountId)),
      });
      if (closure?.authDeletedAt !== null && closure?.authDeletedAt !== undefined) {
        const closed = await this.databaseService.database.transaction(async (tx) => {
          await tx.execute(sql`select id from billing.credit_account where id = ${input.accountId} for update`);
          await tx.execute(
            sql`select id from billing.billing_account_closure where id = ${input.closureId} for update`,
          );
          const changed = await tx.execute<{ id: string }>(sql`
            update billing.billing_account_closure
            set state = 'closed', closed_at = coalesce(closed_at, clock_timestamp()), lease_until = null,
                updated_at = clock_timestamp()
            where id = ${input.closureId} and account_id = ${input.accountId}
              and generation = ${claim.generation}
              and lease_until > clock_timestamp()
            returning id`);
          if (changed.length === 0) return false;
          await tx.update(creditAccount).set({ status: 'closed' }).where(eq(creditAccount.id, input.accountId));
          return true;
        });
        return closed ? 'processed' : 'pending';
      }
    }
    const applied = await this.setState(
      input,
      claim.generation,
      claim.state === 'closed'
        ? 'closed'
        : pending && claim.state !== 'ready_for_auth_deletion'
          ? 'cancellation_pending'
          : 'ready_for_auth_deletion',
      null,
    );
    return applied && !pending ? 'processed' : 'pending';
  }

  private async findRetainedBinding(authUserId: string) {
    return this.databaseService.database.query.billingOwnerBinding.findFirst({
      where: and(eq(billingOwnerBinding.environment, this.environment), eq(billingOwnerBinding.authUserId, authUserId)),
    });
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- the transaction and frozen closure identity are separate financial fences
  private async freezeSubscriptionObligations(
    tx: Transaction,
    closureId: string,
    accountId: string,
    now: Date,
  ): Promise<void> {
    const subscriptions = await tx
      .select({ id: subscription.id, bindingId: subscription.customerBindingId })
      .from(subscription)
      .where(
        and(
          eq(subscription.accountId, accountId),
          inArray(subscription.slotState, ['pending', 'current', 'attention']),
        ),
      );
    for (const item of subscriptions) {
      if (item.bindingId === null) throw new Error('owned_subscription_missing_customer_binding');
      const legId = randomUUID();
      const request = { version: 'subscription-cancel-v1', subscriptionId: item.id, closureId };
      await tx.insert(billingProviderLeg).values({
        id: legId,
        accountId,
        environment: this.environment,
        customerBindingId: item.bindingId,
        subscriptionId: item.id,
        closureId,
        kind: 'subscription_cancel',
        requestId: `${closureId}:${item.id}`,
        requestHash: digest(request),
        request,
        idempotencyKey: `closure:${closureId}:subscription:${item.id}`,
        nextAttemptAt: now,
      });
    }
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- state and attention form one guarded transition payload
  private async setState(
    input: { readonly closureId: string; readonly accountId: string },
    generation: bigint,
    state: WireAccountClosure['state'],
    attentionCode: string | null,
  ): Promise<boolean> {
    const changed = await this.databaseService.database.execute<{ id: string }>(sql`
      update billing.billing_account_closure
      set state = ${state}, attention_code = ${attentionCode}, lease_until = null,
          updated_at = clock_timestamp()
      where id = ${input.closureId} and account_id = ${input.accountId}
        and generation = ${generation}
        and lease_until > clock_timestamp()
      returning id`);
    return changed.length === 1;
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function project(row: typeof billingAccountClosure.$inferSelect, ownerId: string): WireAccountClosure {
  return {
    version: 'account-closure-v1',
    closureId: row.id,
    ownerId,
    subjectId: row.accountId,
    environment: row.environment as FinancialEnvironment,
    state: row.state as WireAccountClosure['state'],
    attention:
      row.state === 'attention'
        ? {
            reason: row.attentionCode === 'provider_outcome_unknown' ? 'provider_outcome_unknown' : 'operator_review',
            action: row.attentionCode === 'provider_outcome_unknown' ? 'wait' : 'contact_support',
          }
        : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
