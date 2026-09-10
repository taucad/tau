import { z } from 'zod';
import { financialEnvironmentSchema, financialIdentitySchema, unsignedIntegerStringSchema } from '#financial-wire.js';

const cardSchema = z.object({ brand: z.string().min(1).max(40), last4: z.string().regex(/^[0-9]{4}$/u) }).strict();
const purposeSchema = z.enum([
  'manual_topup',
  'automatic_topup',
  'reload_setup',
  'subscription_checkout',
  'billing_portal',
]);

/** Owned payment progress; a receipt records issuance, never a separate balance. */
export const wirePaymentActionSchema = z
  .object({
    version: z.literal('payment-action-v1'),
    actionId: financialIdentitySchema,
    environment: financialEnvironmentSchema,
    ownerId: financialIdentitySchema,
    subjectId: financialIdentitySchema,
    purpose: purposeSchema,
    state: z.enum([
      'prepared',
      'creating',
      'redirect_required',
      'processing',
      'funds_received',
      'fulfilled',
      'attention_required',
      'failed',
      'canceled',
      'completed',
    ]),
    frozen: z
      .object({
        offerId: financialIdentitySchema,
        currency: z.literal('usd'),
        principalMinor: unsignedIntegerStringSchema,
        taxMinor: unsignedIntegerStringSchema,
        grossMinor: unsignedIntegerStringSchema,
        maximumGrossMinor: unsignedIntegerStringSchema,
        creditAtoms: unsignedIntegerStringSchema,
        paymentMethod: cardSchema.nullable(),
      })
      .strict()
      .nullable(),
    redirectUrl: z.url().max(4096).nullable(),
    attention: z
      .object({
        reason: z.enum(['authentication_required', 'provider_outcome_unknown', 'operator_review']),
        action: z.enum(['continue_hosted', 'wait', 'contact_support']),
      })
      .strict()
      .nullable(),
    receipt: z
      .object({
        receiptId: financialIdentitySchema,
        grantedCreditAtoms: unsignedIntegerStringSchema,
        revision: unsignedIntegerStringSchema,
        chargedPaymentMethod: cardSchema.nullable(),
      })
      .strict()
      .nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((action, context) => {
    if (
      (action.state === 'fulfilled') !== (action.receipt !== null) ||
      (action.state === 'redirect_required') !== (action.redirectUrl !== null) ||
      (action.state === 'attention_required') !== (action.attention !== null) ||
      (action.purpose === 'billing_portal') !== (action.frozen === null)
    ) {
      context.addIssue({ code: 'custom', message: 'Payment state and evidence disagree' });
    }
    if (action.state === 'completed' && action.purpose !== 'reload_setup') {
      context.addIssue({ code: 'custom', message: 'Only method setup completes without an issuance receipt' });
    }
    if (action.purpose === 'reload_setup' && ['funds_received', 'fulfilled'].includes(action.state)) {
      context.addIssue({ code: 'custom', message: 'Method setup cannot attest payment or issuance' });
    }
    if (action.purpose === 'billing_portal' && ['funds_received', 'fulfilled'].includes(action.state)) {
      context.addIssue({ code: 'custom', message: 'Portal cannot attest payment or issuance' });
    }
    if (
      action.frozen !== null &&
      [
        action.frozen.principalMinor,
        action.frozen.taxMinor,
        action.frozen.grossMinor,
        action.frozen.maximumGrossMinor,
      ].every((value) => unsignedIntegerStringSchema.safeParse(value).success) &&
      (BigInt(action.frozen.principalMinor) + BigInt(action.frozen.taxMinor) !== BigInt(action.frozen.grossMinor) ||
        BigInt(action.frozen.grossMinor) > BigInt(action.frozen.maximumGrossMinor))
    ) {
      context.addIssue({ code: 'custom', message: 'Frozen payment total is inconsistent' });
    }
  });

/** Validated first-party payment action response. */
export type WirePaymentAction = z.infer<typeof wirePaymentActionSchema>;

const returnPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) => value.startsWith('/') && !value.startsWith('//') && !/[\\\s]/u.test(value),
    'Expected a local return path',
  );

/** A request identity correlates retries; the server supplies the economic identity. */
export const paymentActionRequestSchema = z
  .object({ requestId: financialIdentitySchema, returnPath: returnPathSchema })
  .strict();

/** Prepare a displayed quote before authorizing collection. */
export const topupActionRequestSchema = paymentActionRequestSchema
  .extend({
    amountMinor: unsignedIntegerStringSchema,
    method: z.enum(['saved_card', 'checkout']),
  })
  .strict();

/** Bounded owned recovery listing; unrelated Portal actions cannot block a purchase. */
export const paymentActionListQuerySchema = z.object({ purpose: purposeSchema.optional() }).strict();
