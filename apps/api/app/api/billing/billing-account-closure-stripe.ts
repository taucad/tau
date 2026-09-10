import type {
  SubscriptionCancellationEvidence,
  SubscriptionCheckoutExpiryEvidence,
} from '#api/billing/billing-payment-contract.js';
import { createHash } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import type { DatabaseService } from '#database/database.service.js';
import type {
  ClosureCancellationAdapter,
  ClosureCancellationResult,
} from '#api/billing/billing-account-closure.service.js';
import {
  cancelStripeSubscription,
  expireStripeCheckoutSession,
  recoverStripeLegSource,
} from '#api/billing/billing-stripe.js';
import {
  billingAccountClosure,
  billingProviderLeg,
  billingStripeCustomer,
  creditAccount,
  subscription,
} from '#database/schema.js';

type Input = Parameters<ClosureCancellationAdapter['recoverAndCancel']>[0];
type Context = {
  database: DatabaseService['database'];
  sourceStripe: Stripe;
  protectedStripe?: Stripe;
  environment: string;
  stripeAccountId: string;
  livemode: boolean;
};
type Tx = Parameters<Parameters<Context['database']['transaction']>[0]>[0];

/** Recovers the original creation before canceling; a missing lookup never authorizes another create. */
export async function recoverAndCancelStripeClosure(
  context: Context,
  input: Input,
): Promise<ClosureCancellationResult> {
  const [binding] = await context.database
    .select()
    .from(billingStripeCustomer)
    .where(
      and(
        eq(billingStripeCustomer.id, input.customerBindingId),
        eq(billingStripeCustomer.accountId, input.accountId),
        eq(billingStripeCustomer.environment, context.environment),
        eq(billingStripeCustomer.stripeAccountId, context.stripeAccountId),
        eq(billingStripeCustomer.livemode, context.livemode),
      ),
    );
  const [leg] = await context.database
    .select()
    .from(billingProviderLeg)
    .where(
      and(
        eq(billingProviderLeg.accountId, input.accountId),
        eq(billingProviderLeg.environment, context.environment),
        eq(billingProviderLeg.subscriptionId, input.subscriptionId),
        eq(billingProviderLeg.closureId, input.closureId),
        eq(billingProviderLeg.customerBindingId, input.customerBindingId),
        eq(billingProviderLeg.kind, 'subscription_cancel'),
      ),
    );
  if (!binding || !leg) {
    return { status: 'attention', code: 'closure_source_scope' };
  }
  if (input.stripeSubscriptionId === null && (await stopUndispatchedCreation(context, input, leg.id))) {
    return { status: 'not_created' };
  }
  let customerId = binding.stripeCustomerId;
  if (customerId === null) {
    const recovered = await recoverStripeLegSource(context.sourceStripe, {
      kind: 'customer',
      metadataKey: 'tau_customer_binding_id',
      metadataValue: binding.id,
    });
    if (recovered.status === 'unknown') {
      return { status: 'pending' };
    }
    if (
      recovered.status !== 'known' ||
      recovered.object.kind !== 'customer' ||
      recovered.object.object.livemode !== context.livemode ||
      recovered.object.object.metadata['tau_account_id'] !== input.accountId ||
      recovered.object.object.metadata['tau_customer_binding_id'] !== binding.id
    ) {
      return { status: 'attention', code: 'closure_customer_conflict' };
    }
    customerId = recovered.object.object.id;
    const recoveredId = customerId;
    const applied = await context.database.transaction(async (tx) => {
      if (!(await lockLiveClosure(tx, context, input))) {
        return false;
      }
      await tx
        .update(billingStripeCustomer)
        .set({ stripeCustomerId: recoveredId })
        .where(and(eq(billingStripeCustomer.id, binding.id), isNull(billingStripeCustomer.stripeCustomerId)));
      return true;
    });
    if (!applied) {
      return { status: 'pending' };
    }
  }
  let remoteId = input.stripeSubscriptionId;
  if (remoteId === null) {
    const [creation] =
      input.originalCreationLegId === null
        ? []
        : await context.database
            .select()
            .from(billingProviderLeg)
            .where(
              and(
                eq(billingProviderLeg.id, input.originalCreationLegId),
                eq(billingProviderLeg.accountId, input.accountId),
                eq(billingProviderLeg.subscriptionId, input.subscriptionId),
                eq(billingProviderLeg.customerBindingId, binding.id),
                eq(billingProviderLeg.kind, 'checkout_subscription'),
              ),
            );
    if (!creation) {
      return { status: 'attention', code: 'closure_creation_missing' };
    }
    const recovered = await recoverStripeLegSource(context.sourceStripe, {
      kind: 'checkout',
      clientReferenceId: input.subscriptionId,
      ...(creation.providerObjectId === null ? {} : { providerObjectId: creation.providerObjectId }),
    });
    if (recovered.status === 'unknown') {
      return { status: 'pending' };
    }
    if (recovered.status !== 'known' || recovered.object.kind !== 'checkout') {
      return { status: 'attention', code: 'closure_creation_ambiguous' };
    }
    let session = recovered.object.object;
    const sessionCustomer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (
      session.mode !== 'subscription' ||
      session.livemode !== context.livemode ||
      sessionCustomer !== customerId ||
      session.client_reference_id !== input.subscriptionId ||
      session.metadata?.['tau_subscription_id'] !== input.subscriptionId
    ) {
      return { status: 'attention', code: 'closure_checkout_scope' };
    }
    remoteId = typeof session.subscription === 'string' ? session.subscription : (session.subscription?.id ?? null);
    if (remoteId === null && session.status === 'open' && context.protectedStripe) {
      const won = await context.database.transaction(async (tx) => {
        if (!(await lockLiveClosure(tx, context, input))) {
          return false;
        }
        const rows = await tx
          .update(billingProviderLeg)
          .set({ expirationRequestedAt: sql`clock_timestamp()` })
          .where(and(eq(billingProviderLeg.id, creation.id), isNull(billingProviderLeg.expirationRequestedAt)))
          .returning({ id: billingProviderLeg.id });
        return rows.length === 1;
      });
      if (won) {
        await expireStripeCheckoutSession(context.protectedStripe, {
          sessionId: session.id,
          idempotencyKey: `${creation.id}:closure-expire`,
        });
      }
      session = await context.sourceStripe.checkout.sessions.retrieve(session.id);
      remoteId = typeof session.subscription === 'string' ? session.subscription : (session.subscription?.id ?? null);
    }
    if (remoteId === null) {
      const observedCustomer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      if (
        session.status !== 'expired' ||
        session.mode !== 'subscription' ||
        session.livemode !== context.livemode ||
        observedCustomer !== customerId ||
        session.client_reference_id !== input.subscriptionId ||
        session.metadata?.['tau_subscription_id'] !== input.subscriptionId ||
        session.subscription !== null ||
        session.payment_intent !== null ||
        session.payment_status !== 'unpaid'
      ) {
        return { status: 'pending' };
      }
      const proof: SubscriptionCheckoutExpiryEvidence = {
        version: 'stripe-subscription-checkout-expired-v1',
        checkoutSessionId: session.id,
        customerId,
        stripeAccountId: context.stripeAccountId,
        livemode: context.livemode,
        status: 'expired',
        mode: 'subscription',
        subscriptionId: null,
        paymentIntentId: null,
        paymentStatus: 'unpaid',
        sourceDigest: createHash('sha256')
          .update(
            JSON.stringify({
              id: session.id,
              status: session.status,
              subscription: session.subscription,
              paymentIntent: session.payment_intent,
              customerId,
            }),
          )
          .digest('hex'),
        observedAt: new Date().toISOString(),
      };
      const applied = await context.database.transaction(async (tx) => {
        if (!(await lockLiveClosure(tx, context, input))) {
          return false;
        }
        const [current] = await tx
          .select()
          .from(billingProviderLeg)
          .where(eq(billingProviderLeg.id, creation.id))
          .for('update');
        if (!current) {
          return false;
        }
        await tx
          .update(billingProviderLeg)
          .set({
            state: 'expired',
            providerObjectId: session.id,
            expirationRequestedAt: sql`coalesce(${billingProviderLeg.expirationRequestedAt}, clock_timestamp())`,
            terminalEvidence: current.terminalEvidence ?? proof,
          })
          .where(eq(billingProviderLeg.id, creation.id));
        await tx
          .update(billingProviderLeg)
          .set({ state: 'no_charge' })
          .where(and(eq(billingProviderLeg.id, leg.id), eq(billingProviderLeg.state, 'prepared')));
        await tx
          .update(subscription)
          .set({ slotState: 'ended', status: 'canceled', updatedAt: sql`clock_timestamp()` })
          .where(eq(subscription.id, input.subscriptionId));
        return true;
      });
      return applied ? { status: 'not_created' } : { status: 'pending' };
    }
  }
  let remote = await context.sourceStripe.subscriptions.retrieve(remoteId);
  const remoteCustomer = typeof remote.customer === 'string' ? remote.customer : remote.customer.id;
  if (
    remote.id !== remoteId ||
    remote.livemode !== context.livemode ||
    remoteCustomer !== customerId ||
    remote.metadata['tau_subscription_id'] !== input.subscriptionId
  ) {
    return { status: 'attention', code: 'closure_subscription_scope' };
  }
  if (remote.status !== 'canceled') {
    if (!context.protectedStripe) {
      return { status: 'pending' };
    }
    const won = await context.database.transaction(async (tx) => {
      if (!(await lockLiveClosure(tx, context, input))) {
        return false;
      }
      const rows = await tx
        .update(billingProviderLeg)
        .set({
          state: 'dispatched',
          dispatchStartedAt: sql`clock_timestamp()`,
          cancellationRequestedAt: sql`clock_timestamp()`,
        })
        .where(and(eq(billingProviderLeg.id, leg.id), eq(billingProviderLeg.state, 'prepared')))
        .returning({ id: billingProviderLeg.id });
      return rows.length === 1;
    });
    if (!won) {
      return { status: 'pending' };
    }
    await cancelStripeSubscription(context.protectedStripe, {
      stripeSubscriptionId: remote.id,
      idempotencyKey: leg.idempotencyKey,
    });
    remote = await context.sourceStripe.subscriptions.retrieve(remote.id);
    if (remote.status !== 'canceled') {
      return { status: 'pending' };
    }
  }
  const finalCustomer = typeof remote.customer === 'string' ? remote.customer : remote.customer.id;
  if (
    remote.id !== remoteId ||
    remote.status !== 'canceled' ||
    remote.livemode !== context.livemode ||
    finalCustomer !== customerId ||
    remote.metadata['tau_subscription_id'] !== input.subscriptionId
  ) {
    return { status: 'attention', code: 'closure_cancellation_source_mismatch' };
  }
  const canceledId = remote.id;
  const applied = await context.database.transaction(async (tx) => {
    if (!(await lockLiveClosure(tx, context, input))) {
      return false;
    }
    const [currentLeg] = await tx
      .select()
      .from(billingProviderLeg)
      .where(eq(billingProviderLeg.id, leg.id))
      .for('update');
    if (!currentLeg) {
      return false;
    }
    const proof: SubscriptionCancellationEvidence = {
      version: 'stripe-subscription-canceled-v1',
      subscriptionId: canceledId,
      customerId,
      stripeAccountId: context.stripeAccountId,
      livemode: context.livemode,
      status: 'canceled',
      sourceDigest: createHash('sha256')
        .update(JSON.stringify({ id: remote.id, status: remote.status, canceledAt: remote.canceled_at, customerId }))
        .digest('hex'),
      observedAt: new Date().toISOString(),
    };
    await tx
      .update(billingProviderLeg)
      .set({
        state: 'no_charge',
        providerObjectId: canceledId,
        terminalEvidence: currentLeg.terminalEvidence ?? proof,
        cancellationRequestedAt: sql`coalesce(${billingProviderLeg.cancellationRequestedAt}, clock_timestamp())`,
        cancellationConfirmedAt: sql`coalesce(${billingProviderLeg.cancellationConfirmedAt}, clock_timestamp())`,
      })
      .where(eq(billingProviderLeg.id, leg.id));
    await tx
      .update(subscription)
      .set({
        stripeSubscriptionId: canceledId,
        slotState: 'ended',
        status: 'canceled',
        canceledAt: remote.canceled_at === null ? null : new Date(remote.canceled_at * 1000),
        updatedAt: sql`clock_timestamp()`,
      })
      .where(eq(subscription.id, input.subscriptionId));
    return true;
  });
  return applied ? { status: 'canceled', providerObjectId: canceledId } : { status: 'pending' };
}

async function stopUndispatchedCreation(context: Context, input: Input, cancellationLegId: string): Promise<boolean> {
  if (input.originalCreationLegId === null) {
    return false;
  }
  const creationId = input.originalCreationLegId;
  return context.database.transaction(async (tx) => {
    if (!(await lockLiveClosure(tx, context, input))) {
      return false;
    }
    const changed = await tx
      .update(billingProviderLeg)
      .set({ state: 'no_charge' })
      .where(
        and(
          eq(billingProviderLeg.id, creationId),
          eq(billingProviderLeg.accountId, input.accountId),
          eq(billingProviderLeg.subscriptionId, input.subscriptionId),
          eq(billingProviderLeg.kind, 'checkout_subscription'),
          eq(billingProviderLeg.state, 'prepared'),
          isNull(billingProviderLeg.dispatchStartedAt),
        ),
      )
      .returning({ id: billingProviderLeg.id });
    if (changed.length !== 1) {
      return false;
    }
    await tx
      .update(billingProviderLeg)
      .set({ state: 'no_charge' })
      .where(and(eq(billingProviderLeg.id, cancellationLegId), eq(billingProviderLeg.state, 'prepared')));
    await tx
      .update(subscription)
      .set({ slotState: 'ended', status: 'canceled', updatedAt: sql`clock_timestamp()` })
      .where(eq(subscription.id, input.subscriptionId));
    return true;
  });
}

async function lockLiveClosure(tx: Tx, context: Context, input: Input): Promise<boolean> {
  await tx
    .select()
    .from(creditAccount)
    .where(and(eq(creditAccount.id, input.accountId), eq(creditAccount.environment, context.environment)))
    .for('update');
  const [closure] = await tx
    .select()
    .from(billingAccountClosure)
    .where(
      and(
        eq(billingAccountClosure.id, input.closureId),
        eq(billingAccountClosure.accountId, input.accountId),
        eq(billingAccountClosure.environment, context.environment),
        eq(billingAccountClosure.generation, input.closureGeneration),
        sql`${billingAccountClosure.leaseUntil} > clock_timestamp()`,
      ),
    )
    .for('update');
  return closure !== undefined;
}
