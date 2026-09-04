import { z } from 'zod';

const microString = z.string().regex(/^-?\d+$/u);

/**
 * Wire form of `GET /v1/billing/credits`: µ$ amounts as strings (JSON cannot
 * carry bigint), timestamps as ISO strings. `balanceMicro` may be negative
 * while the account is in debt (Q37).
 * @public
 */
export const wireCreditAccountSchema = z.object({
  balanceMicro: microString,
  grantBalanceMicro: microString,
  topupBalanceMicro: microString,
  reservedMicro: microString,
  monthlyGrantMicro: microString,
  rolloverCeilingMicro: microString,
  /** Threshold notifications newly crossed by this read (Q26 server-side dedup). */
  notifications: z.array(z.enum(['grant-80', 'grant-95'])),
  transactions: z.array(
    z.object({
      id: z.string(),
      deltaMicro: microString,
      balanceAfterMicro: microString,
      reason: z.string(),
      category: z.string().nullable(),
      modelId: z.string().nullable(),
      note: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});

/**
 * JSON-safe credit-account payload.
 * @public
 */
export type WireCreditAccount = z.infer<typeof wireCreditAccountSchema>;

/**
 * Parses an untrusted credits payload, restoring bigint µ$ amounts.
 *
 * @param wire - API response body
 * @returns Parsed balances with bigint amounts and Date timestamps
 * @public
 */
export const parseCreditAccount = (
  wire: unknown,
): {
  balanceMicro: bigint;
  grantBalanceMicro: bigint;
  topupBalanceMicro: bigint;
  reservedMicro: bigint;
  monthlyGrantMicro: bigint;
  rolloverCeilingMicro: bigint;
  notifications: Array<'grant-80' | 'grant-95'>;
  transactions: Array<{
    id: string;
    deltaMicro: bigint;
    balanceAfterMicro: bigint;
    reason: string;
    category: string | undefined;
    modelId: string | undefined;
    note: string | undefined;
    createdAt: Date;
  }>;
} => {
  const parsed = wireCreditAccountSchema.parse(wire);
  return {
    balanceMicro: BigInt(parsed.balanceMicro),
    grantBalanceMicro: BigInt(parsed.grantBalanceMicro),
    topupBalanceMicro: BigInt(parsed.topupBalanceMicro),
    reservedMicro: BigInt(parsed.reservedMicro),
    monthlyGrantMicro: BigInt(parsed.monthlyGrantMicro),
    rolloverCeilingMicro: BigInt(parsed.rolloverCeilingMicro),
    notifications: parsed.notifications,
    transactions: parsed.transactions.map((row) => ({
      id: row.id,
      deltaMicro: BigInt(row.deltaMicro),
      balanceAfterMicro: BigInt(row.balanceAfterMicro),
      reason: row.reason,
      category: row.category ?? undefined,
      modelId: row.modelId ?? undefined,
      note: row.note ?? undefined,
      createdAt: new Date(row.createdAt),
    })),
  };
};
