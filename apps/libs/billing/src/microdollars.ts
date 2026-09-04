/**
 * Microdollar (µ$) money arithmetic per AD16 in
 * `docs/research/stripe-billing-integration-blueprint.md`: 1 USD = 1,000,000 µ$,
 * stored/transported as `bigint`. The four conversion rules live here once;
 * every other code path imports them instead of re-deriving factors.
 */

/**
 * Microdollars per US dollar.
 * @public
 */
export const microPerUsd = 1_000_000n;

/**
 * Microdollars per Stripe cent (cents → µ$ is ×10,000).
 * @public
 */
export const microPerCent = 10_000n;

/**
 * Converts a Stripe integer cent amount to microdollars.
 *
 * @param cents - Whole cents (e.g. a Stripe `amount_total`)
 * @returns The equivalent µ$ amount
 * @public
 * @example <caption>Settle a $25.00 top-up</caption>
 * ```typescript
 * import { centsToMicro } from '@taucad/billing';
 *
 * centsToMicro(2500); // 25_000_000n
 * ```
 */
export const centsToMicro = (cents: number | bigint): bigint => {
  return BigInt(cents) * microPerCent;
};

/**
 * Converts a USD float to microdollars, rounding to the nearest µ$.
 * Intended for config/display-adjacent conversions; money-critical paths should
 * stay in integer cents or µ$ end to end.
 *
 * @param usd - Dollar amount as a number
 * @returns The equivalent µ$ amount
 * @public
 */
export const usdToMicro = (usd: number): bigint => {
  return BigInt(Math.round(usd * 1_000_000));
};

/**
 * Formats a µ$ amount as a dollar string with fixed decimal places, using pure
 * integer math (no float drift on large balances).
 *
 * @param micro - The µ$ amount (may be negative — debt renders with a leading minus)
 * @param fractionDigits - 2 for balances, 4 for per-turn telemetry tooltips
 * @returns A plain dollar string such as `"18.42"` or `"-0.0031"` (no currency symbol)
 * @public
 * @example <caption>Render a balance</caption>
 * ```typescript
 * import { formatMicroUsd } from '@taucad/billing';
 *
 * formatMicroUsd(18_420_000n); // '18.42'
 * ```
 */
export const formatMicroUsd = (micro: bigint, fractionDigits: 2 | 4 = 2): string => {
  const negative = micro < 0n;
  const absolute = negative ? -micro : micro;
  const scale = fractionDigits === 2 ? 10_000n : 100n;
  // Round half up at the displayed precision.
  const scaled = (absolute + scale / 2n) / scale;
  const divisor = fractionDigits === 2 ? 100n : 10_000n;
  const whole = scaled / divisor;
  const fraction = (scaled % divisor).toString().padStart(fractionDigits, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
};
