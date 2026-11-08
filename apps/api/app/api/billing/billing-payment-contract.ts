import { createHash } from 'node:crypto';
import { z } from 'zod';
import { unsignedIntegerStringSchema } from '@taucad/billing';
import type { PaymentOfferSnapshot } from '@taucad/api-database/schema/billing-payment.types';

/** Returns exact quoted totals for a direct charge; hosted Checkout totals remain source-owned. */
export function exactPaymentOfferTotals(offer: PaymentOfferSnapshot): {
  readonly taxMinor: string;
  readonly grossMinor: string;
  readonly maximumGrossMinor: string;
} {
  if (offer.taxMinor === null || offer.grossMinor === null || offer.maximumGrossMinor === null) {
    throw new Error('Payment offer has no exact pre-collection total');
  }
  return { taxMinor: offer.taxMinor, grossMinor: offer.grossMinor, maximumGrossMinor: offer.maximumGrossMinor };
}

const cashSourceIdsSchema = z
  .array(z.string().min(1).max(255))
  .max(10_000)
  .refine(
    (ids) => ids.every((id, index) => index === 0 || ids[index - 1]! < id),
    'Cash identities must be sorted and unique',
  );

/** Complete source projection consumed by the atomic money boundary. */
export const cashProjectionEvidenceSchema = z
  .object({
    version: z.literal('stripe-cash-projection-v1'),
    stripeAccountId: z.string().min(1).max(255),
    livemode: z.boolean(),
    customerId: z.string().min(1).max(255),
    paymentIntentId: z.string().min(1).max(255),
    chargeId: z.string().min(1).max(255),
    currency: z.literal('usd'),
    originalPrincipalMinor: unsignedIntegerStringSchema,
    originalTaxMinor: unsignedIntegerStringSchema,
    originalGrossMinor: unsignedIntegerStringSchema,
    principalLossMinor: unsignedIntegerStringSchema,
    taxLossMinor: unsignedIntegerStringSchema,
    grossLossMinor: unsignedIntegerStringSchema,
    refundIds: cashSourceIdsSchema,
    disputeIds: cashSourceIdsSchema,
    balanceTransactionIds: cashSourceIdsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const principal = BigInt(value.originalPrincipalMinor);
    const tax = BigInt(value.originalTaxMinor);
    const gross = BigInt(value.originalGrossMinor);
    const loss = BigInt(value.principalLossMinor);
    const taxLoss = BigInt(value.taxLossMinor);
    const grossLoss = BigInt(value.grossLossMinor);
    if (
      principal <= 0n ||
      principal + tax !== gross ||
      loss > principal ||
      taxLoss > tax ||
      grossLoss > gross ||
      loss + taxLoss !== grossLoss
    ) {
      context.addIssue({ code: 'custom', message: 'Cash projection allocation is inconsistent' });
    }
  });
export type CashProjectionEvidence = z.infer<typeof cashProjectionEvidenceSchema>;

/**
 * Purchase states that can still move money or await their grant. A second purchase, and account closure, wait for
 * them; keep this the only copy so a new settleable state cannot let closure succeed around live money.
 */
export const activePurchaseStates = ['prepared', 'creating', 'pending', 'attention', 'paid_unfulfilled'] as const;

/** Schema parsing fixes key order as well as rejecting extra or inconsistent cash fields. */
export function cashProjectionDigest(evidence: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(cashProjectionEvidenceSchema.parse(evidence)))
    .digest('hex');
}

/** Dates a cash disposition at the provider movement that made it effective, never at inbox or processing time. */
export function cashOccurredAt(
  cash: { readonly grossLossMinor: bigint; readonly taxCorrectionEvidence?: { readonly effectiveAt: string } },
  fallback: Date | string,
): Date {
  const effectiveAt = cash.taxCorrectionEvidence?.effectiveAt;
  if (effectiveAt === undefined && cash.grossLossMinor !== 0n) {
    throw new Error('cash_effective_time_missing');
  }
  const occurredAt = new Date(effectiveAt ?? fallback);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new TypeError('cash_effective_time_invalid');
  }
  return occurredAt;
}

/**
 * Source refund, dispute and balance identities are immutable once observed, so a later projection may
 * only add to them. A projection that omits a retained identity is an incomplete read, never proof that
 * the cash it accounted for came back. An unparseable retained projection is treated as not covered.
 */
export function cashProjectionCoversRetained(retained: unknown, current: CashProjectionEvidence): boolean {
  const prior = cashProjectionEvidenceSchema.safeParse(retained);
  if (!prior.success) {
    return false;
  }
  const refunds = new Set(current.refundIds);
  const disputes = new Set(current.disputeIds);
  const movements = new Set(current.balanceTransactionIds);
  return (
    prior.data.refundIds.every((id) => refunds.has(id)) &&
    prior.data.disputeIds.every((id) => disputes.has(id)) &&
    prior.data.balanceTransactionIds.every((id) => movements.has(id))
  );
}
