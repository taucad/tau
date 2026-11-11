/*
 * The one way Tau prints US dollar amounts to a customer. Charged amounts keep
 * their cents (`$10.00`); list prices and amount choices are whole dollars
 * (`$20`). The currency is named once per screen, on the total, with
 * `formatUsdTotalMinor`; never as a `US$` prefix.
 */

const dollarFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * An amount that is or will be charged, from minor units: `1000` reads `$10.00`.
 *
 * @param minor - The amount in cents.
 * @returns The amount with a dollar sign, grouped thousands and two decimals.
 * @public
 */
export const formatUsdMinor = (minor: string | number | bigint): string => {
  const cents = Math.round(Number(minor));
  return `${cents < 0 ? '-' : ''}$${dollarFormatter.format(Math.abs(cents) / 100)}`;
};

/**
 * The total row of a summary, the one place a screen names the currency:
 * `1000` reads `$10.00 USD`.
 *
 * @param minor - The amount in cents.
 * @returns The charged amount followed by the currency code.
 * @public
 */
export const formatUsdTotalMinor = (minor: string | number | bigint): string => `${formatUsdMinor(minor)} USD`;

/**
 * A list price or an amount choice, from minor units: `2500` reads `$25`.
 * Cents appear only when the amount has them (`$12.50`).
 *
 * @param minor - The amount in cents.
 * @returns The amount with a dollar sign and no trailing `.00`.
 * @public
 */
export const formatUsdWholeMinor = (minor: string | number | bigint): string => {
  const formatted = formatUsdMinor(minor);
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
};

/**
 * A recurring price as one phrase: `$20/month`.
 *
 * @param priceLabel - The plan's price label, such as `$20`.
 * @returns The price with its billing period.
 * @public
 */
export const formatMonthlyPrice = (priceLabel: string): string => `${priceLabel}/month`;
