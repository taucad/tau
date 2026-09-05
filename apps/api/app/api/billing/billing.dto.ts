import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { topupMaxCents, topupMinCents } from '#api/billing/billing.constants.js';

/**
 * `POST /v1/billing/topup` body (Q6/S41): integer cents, $5–$500 inclusive.
 * Presets ($5/$10/$25/$50/$100) all fall inside the same bounds.
 *
 * `returnUrl` is the caller's current location (`globalThis.location.href`,
 * mirroring the Better Auth `billingPortal({ returnUrl })` convention). The
 * hosted Checkout redirect returns the buyer to this URL; it is sanitised
 * server-side to a same-origin path, so it can never redirect off-origin.
 */
export const topupRequestSchema = z.object({
  amountCents: z.number().int().min(topupMinCents).max(topupMaxCents),
  returnUrl: z.string().optional(),
  /**
   * Client-minted retry key for the saved-card charge: Stripe dedupes create
   * calls sharing it, so a retry after a lost response recovers the original
   * PaymentIntent instead of charging twice. UUID-validated so nothing
   * attacker-shaped is forwarded to Stripe.
   */
  idempotencyKey: z.uuid().optional(),
});

export class TopupRequestDto extends createZodDto(topupRequestSchema) {}
