import { z } from 'zod';
import { financialEnvironmentSchema, financialIdentitySchema, unsignedIntegerStringSchema } from '#financial-wire.js';
import { paymentActionRequestSchema, wirePaymentActionSchema } from '#payment-action-wire.js';

const ownership = {
  environment: financialEnvironmentSchema,
  ownerId: financialIdentitySchema,
  subjectId: financialIdentitySchema,
};
const card = z.object({ brand: z.string().min(1).max(40), last4: z.string().regex(/^[0-9]{4}$/u) }).strict();

/** An owned consent exposes exact accepted limits and no secret method identifier. */
export const wireAutoReloadConsentSchema = z
  .object({
    version: z.literal('auto-reload-consent-v1'),
    ...ownership,
    consentId: financialIdentitySchema,
    consentVersion: z.number().int().positive(),
    state: z.enum(['pending_setup', 'enabled', 'paused_terms', 'disabled_failures', 'revoked']),
    setupAction: wirePaymentActionSchema.nullable(),
    paymentMethod: card.nullable(),
    terms: z
      .object({
        offerId: financialIdentitySchema,
        currency: z.literal('usd'),
        thresholdAtoms: unsignedIntegerStringSchema,
        principalMinor: unsignedIntegerStringSchema,
        quotedTaxMinor: unsignedIntegerStringSchema,
        grossCeilingMinor: unsignedIntegerStringSchema,
        monthlyGrossCapMinor: unsignedIntegerStringSchema,
        minimumCadenceSeconds: z.number().int().min(3600).max(86_400),
        terminalFailureLimit: z.number().int().min(1).max(2),
        taxQuoteExpiresAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    const { terms } = value;
    if (
      BigInt(terms.principalMinor) <= 0n ||
      BigInt(terms.thresholdAtoms) <= 0n ||
      BigInt(terms.principalMinor) + BigInt(terms.quotedTaxMinor) > BigInt(terms.grossCeilingMinor) ||
      BigInt(terms.grossCeilingMinor) > BigInt(terms.monthlyGrossCapMinor)
    ) {
      context.addIssue({ code: 'custom', message: 'Consent limits cannot cover its frozen quote' });
    }
    const action = value.setupAction;
    if (
      action !== null &&
      (action.ownerId !== value.ownerId ||
        action.subjectId !== value.subjectId ||
        action.environment !== value.environment ||
        action.actionId !== value.consentId ||
        action.purpose !== 'reload_setup')
    ) {
      context.addIssue({ code: 'custom', message: 'Setup action does not belong to consent' });
    }
    if (
      action?.frozen &&
      (action.frozen.offerId !== terms.offerId ||
        action.frozen.principalMinor !== terms.principalMinor ||
        action.frozen.taxMinor !== terms.quotedTaxMinor ||
        action.frozen.maximumGrossMinor !== terms.grossCeilingMinor)
    ) {
      context.addIssue({ code: 'custom', message: 'Setup quote differs from accepted consent' });
    }
    if (value.state === 'enabled' && value.paymentMethod === null) {
      context.addIssue({ code: 'custom', message: 'Enabled consent requires its qualified card' });
    }
  });
export type WireAutoReloadConsent = z.infer<typeof wireAutoReloadConsentSchema>;

/** Explicit consent references the displayed server quote; it cannot choose cash limits. */
export const reloadConsentRequestSchema = paymentActionRequestSchema
  .extend({
    taxLocationRevision: financialIdentitySchema.optional(),
  })
  .strict();

/** Closure remains addressable by its original authenticated owner after binding revocation. */
export const wireAccountClosureSchema = z
  .object({
    version: z.literal('account-closure-v1'),
    ...ownership,
    closureId: financialIdentitySchema,
    state: z.enum(['closing', 'cancellation_pending', 'ready_for_auth_deletion', 'closed', 'attention']),
    attention: z
      .object({
        reason: z.enum(['provider_outcome_unknown', 'operator_review']),
        action: z.enum(['wait', 'contact_support']),
      })
      .strict()
      .nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type WireAccountClosure = z.infer<typeof wireAccountClosureSchema>;
export const accountClosureRequestSchema = z.object({ requestId: financialIdentitySchema }).strict();

/** Identifies an owned invoice; financial scope and request time come from the authenticated server. */
export const enterpriseInvoiceRequestSchema = z
  .object({
    requestId: financialIdentitySchema,
    invoiceId: financialIdentitySchema,
  })
  .strict();

/** User-visible invoice request status contains no private tax or payment source evidence. */
export const wireFinancialCaseSchema = z
  .object({
    version: z.literal('financial-case-v1'),
    ...ownership,
    caseId: financialIdentitySchema,
    state: z.enum(['open', 'attention', 'resolved']),
    nextStep: z.enum(['wait', 'contact_support']),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type WireFinancialCase = z.infer<typeof wireFinancialCaseSchema>;
